/**
 * POST /api/ask: Ask AI's only way to the model (milestone 7, decisions 45 to 51).
 *
 * 1. Takes requests from the site's own pages only (server/validate.ts), then checks the
 *    Cloudflare Access sign-in token, so only approved emails get an answer.
 * 2. Checks the request (server/validate.ts), and the person's daily limit if one is set
 *    (by default there is none: server/limit.ts).
 * 3. Sends the question to Claude with the server's own instructions and tools, adding the
 *    API key, which lives only in the Cloudflare secret ANTHROPIC_API_KEY.
 * 4. Streams the answer straight back, and records the question, the answer and its cost in
 *    the D1 database for Aodhan (/ask-log).
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../../server/access";
import { dublinDay, ensureSchema, finishRow, questionsToday, startRow, turnRounds } from "../../server/askdb";
import { dailyLimit, limitHeaders } from "../../server/limit";
import { readAskRequest, requestGate } from "../../server/validate";
import { costUsd, createAccumulator, sseParser } from "../../src/ai/stream";
import { ASK_LIMITS, ASK_MAX_TOKENS, ASK_MAX_TOOL_ROUNDS, ASK_MODEL, ASK_TOOLS, SYSTEM_PROMPT } from "../../src/ai/tools";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  DB?: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ASK_DAILY_LIMIT?: string;
  ASK_MODEL?: string;
  ASK_EFFORT?: string;
  /** Only for local tests: where the model and the Access keys are fetched from. */
  ANTHROPIC_BASE_URL?: string;
  ACCESS_CERTS_URL?: string;
}

const json = (status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff", ...extra } });

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const started = Date.now();
  const gate = requestGate(request.url, request.headers);
  if (gate) return json(gate.status, { error: gate.error });
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  if (!user) return json(401, { error: "signin" });
  // REAL BUILD: in the demo every approved visitor may ask, because the role is picked on a
  // mock page and the records are sample data in their own browser. A real build checks here
  // that this person may use Ask AI (their level, from the database), and builds the summary
  // of the records on the server from what that person may see, instead of taking the
  // page's. See "Before a real client build" in CLAUDE.md.
  if (!env.ANTHROPIC_API_KEY || !env.DB) return json(503, { error: "not_configured" });

  const text = await request.text();
  if (text.length > ASK_LIMITS.body) return json(413, { error: "too_big" });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json(400, { error: "bad_request", reason: "not json" });
  }
  const read = readAskRequest(raw);
  if (!read.ok) return json(400, { error: "bad_request", reason: read.reason });
  const { req, question } = read;

  const db = env.DB;
  await ensureSchema(db);
  const day = dublinDay();
  // Decision 51: no daily limit unless the project sets one (server/limit.ts).
  const limit = dailyLimit(env.ASK_DAILY_LIMIT);
  const asked = limit > 0 ? await questionsToday(db, user.email, day) : 0;
  if (limit > 0 && req.kind === "question" && asked >= limit) return json(429, { error: "limit", limit }, limitHeaders(limit, limit, "continue"));
  const turn = await turnRounds(db, req.turnId, user.email);
  // Each question has its own id, so the record keeps questions apart; a follow-up must belong to one.
  if (req.kind === "question" && turn.questions > 0) return json(409, { error: "turn_used" });
  if (req.kind === "continue" && (turn.questions === 0 || turn.rounds >= ASK_MAX_TOOL_ROUNDS)) return json(429, { error: "rounds" });

  const model = env.ASK_MODEL || ASK_MODEL;
  const rowId = crypto.randomUUID();
  await startRow(db, { id: rowId, at: new Date().toISOString(), day, email: user.email, turn_id: req.turnId, kind: req.kind, screen: req.screen, question: req.kind === "question" ? question : null, model });

  const upstream = await fetch(`${env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: ASK_MAX_TOKENS,
      stream: true,
      output_config: { effort: env.ASK_EFFORT || "medium" },
      // The instructions and the records are the same for every question in a conversation,
      // so they are cached: follow-up questions cost about a twentieth of the first.
      system: [
        { type: "text", text: SYSTEM_PROMPT },
        { type: "text", text: req.snapshot, cache_control: { type: "ephemeral" } },
      ],
      tools: ASK_TOOLS,
      messages: req.messages,
    }),
  }).catch((e: unknown) => e as Error);

  if (upstream instanceof Error || !upstream.ok || !upstream.body) {
    const detail = upstream instanceof Error ? upstream.message : `${upstream.status} ${(await upstream.text()).slice(0, 800)}`;
    await finishRow(db, rowId, { answer: `Model error: ${detail}`, tools: null, input_tokens: 0, cache_write_tokens: 0, cache_read_tokens: 0, output_tokens: 0, cost_usd: 0, ms: Date.now() - started, status: "error" });
    const busy = !(upstream instanceof Error) && (upstream.status === 429 || upstream.status === 529 || upstream.status >= 500);
    return json(busy ? 503 : 502, { error: busy ? "busy" : "upstream" });
  }

  const acc = createAccumulator();
  const parser = sseParser((_event, data) => {
    try {
      acc.onEvent(JSON.parse(data) as { type?: string });
    } catch {
      /* a line that is not JSON is passed through and ignored here */
    }
  });
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  const pump = (async () => {
    let status = "ok";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
        await writer.write(value);
      }
      parser.end();
    } catch {
      status = "cancelled";
      await reader.cancel().catch(() => undefined);
    } finally {
      await writer.close().catch(() => undefined);
    }
    if (acc.error) status = "error";
    const tools = acc.toolUses().map((t) => ({ name: t.name, input: t.input }));
    const u = acc.usage;
    await finishRow(db, rowId, {
      answer: acc.error ? `${acc.text()}\n\n[Model error: ${acc.error}]` : acc.text(),
      tools: tools.length ? JSON.stringify(tools) : null,
      input_tokens: u.input_tokens,
      cache_write_tokens: u.cache_creation_input_tokens,
      cache_read_tokens: u.cache_read_input_tokens,
      output_tokens: u.output_tokens,
      cost_usd: costUsd(u),
      ms: Date.now() - started,
      status,
    }).catch(() => undefined);
  })();
  waitUntil(pump);

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", ...limitHeaders(limit, asked, req.kind) },
  });
};

/** Anything but POST gets a plain refusal. */
export const onRequest: PagesFunction<Env> = async () => json(405, { error: "method" }, { allow: "POST" });
