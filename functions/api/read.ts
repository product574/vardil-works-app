/**
 * POST /api/read: reads one uploaded document (a garage invoice, or a tax, test, insurance or
 * licence document) with the AI model and returns what it says, for the form to be filled in and
 * checked by a person. Nothing is saved here and nothing is kept. Brought across from the
 * Secure-All build on 18 Nov.
 *
 * The same checks as Ask AI (functions/api/ask.ts): the site's own pages only, JSON only, a size
 * limit, and a signed-in Cloudflare Access visitor. The instructions and the tools are the
 * server's own (src/ai/reading.ts), whatever the page sends.
 *
 * REAL BUILD: the page only shows AI reading to people with "Manage plant and fleet". In the demo
 * the person's level is the page's (the role picked on the sign-in page), so the server cannot
 * check it. A real build checks the person's access here, from their record, before the model is called.
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../../server/access";
import { requestGate } from "../../server/validate";
import { ASK_MODEL } from "../../src/ai/tools";
import { cleanReading, READ_LIMITS, READ_MAX_TOKENS, READ_SYSTEM, readPrompt, readReadRequest, toolsFor } from "../../src/ai/reading";

export interface Env {
  ANTHROPIC_API_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ASK_MODEL?: string;
  ANTHROPIC_BASE_URL?: string;
  ACCESS_CERTS_URL?: string;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

type Block = { type?: string; name?: string; input?: unknown; text?: string };

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requestGate(request.url, request.headers, READ_LIMITS.body);
  if (gate) return json(gate.status, { error: gate.error });
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  if (!user) return json(401, { error: "signin" });
  if (!env.ANTHROPIC_API_KEY) return json(503, { error: "not_configured" });

  const body = await request.text();
  if (body.length > READ_LIMITS.body) return json(413, { error: "too_big" });
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json(400, { error: "bad_request" });
  }
  const read = readReadRequest(raw);
  if (!read.ok) return json(400, { error: "bad_request", reason: read.reason });
  const { req } = read;
  const tools = toolsFor(req.kind);
  const file = req.mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: req.mediaType, data: req.data } }
    : { type: "image", source: { type: "base64", media_type: req.mediaType, data: req.data } };

  const res = await fetch(`${env.ANTHROPIC_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env.ASK_MODEL || ASK_MODEL,
      max_tokens: READ_MAX_TOKENS,
      output_config: { effort: "low" },
      system: READ_SYSTEM,
      tools,
      messages: [{ role: "user", content: [file, { type: "text", text: readPrompt(req.kind, req.context) }] }],
    }),
  }).catch((e: unknown) => e as Error);

  if (res instanceof Error || !res.ok) {
    const busy = !(res instanceof Error) && (res.status === 429 || res.status === 529 || res.status >= 500);
    return json(busy ? 503 : 502, { error: busy ? "busy" : "upstream" });
  }
  const out = (await res.json().catch(() => null)) as { content?: Block[] } | null;
  const blocks = out?.content ?? [];
  const called = blocks.find((b) => b.type === "tool_use" && tools.some((t) => t.name === b.name));
  // Which kind of reading it is: the tool the model called, or the one kind that was asked for.
  const as: "invoice" | "renewal" = called ? (called.name === "record_invoice" ? "invoice" : "renewal") : req.kind === "invoice" ? "invoice" : "renewal";
  let input: unknown = called?.input;
  if (input === undefined) {
    // Should the model answer in words instead of calling the tool, take a JSON object from the words.
    const words = blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    const m = /\{[\s\S]*\}/.exec(words);
    try {
      input = m ? JSON.parse(m[0]) : undefined;
    } catch {
      input = undefined;
    }
  }
  const reading = cleanReading(as, input);
  if (!reading) return json(422, { error: "unreadable" });
  return json(200, { reading });
};

export const onRequest: PagesFunction<Env> = async () => json(405, { error: "method" });
