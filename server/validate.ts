/**
 * What the page may send to /api/ask, checked before anything goes to the model.
 *
 * The page sends the conversation and its summary of the records. It cannot send
 * instructions, tools or settings: those are the server's own (src/ai/tools.ts).
 * REAL BUILD: the summary must be built on the server, not sent by the page (see
 * functions/api/ask.ts and "Before a real client build" in CLAUDE.md).
 */
import { ASK_LIMITS } from "../src/ai/tools";

export type AskRequest = {
  turnId: string;
  kind: "question" | "continue";
  screen: string;
  snapshot: string;
  messages: { role: "user" | "assistant"; content: unknown[] }[];
};

const BLOCK_TYPES: Record<"user" | "assistant", Set<string>> = {
  user: new Set(["text", "tool_result"]),
  assistant: new Set(["text", "thinking", "redacted_thinking", "tool_use"]),
};

/**
 * Checks on the request itself, before the body is read or the sign-in is checked.
 *
 * Only the site's own pages may ask. Browsers always send Origin with a POST, so a page on
 * any other address is turned away, including a sister site on the same domain that shares
 * the sign-in cookie: it cannot spend the model key with a visitor's sign-in. JSON is
 * required too, which makes a page elsewhere ask the browser's permission first (it never
 * gets it: there are no CORS headers). A body bigger than the limit is refused unread.
 */
export function requestGate(url: string, headers: Headers): { status: number; error: string } | null {
  if (headers.get("origin") !== new URL(url).origin) return { status: 403, error: "origin" };
  if (!/^application\/json\b/i.test(headers.get("content-type") ?? "")) return { status: 415, error: "content_type" };
  if (Number(headers.get("content-length") ?? "0") > ASK_LIMITS.body) return { status: 413, error: "too_big" };
  return null;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Returns the request in a known shape, or a plain reason it was refused. */
export function readAskRequest(raw: unknown): { ok: true; req: AskRequest; question: string } | { ok: false; reason: string } {
  if (!isObj(raw)) return { ok: false, reason: "not an object" };
  const { turnId, kind, screen, snapshot, messages } = raw;
  if (typeof turnId !== "string" || !/^[a-z0-9-]{8,64}$/i.test(turnId)) return { ok: false, reason: "turnId" };
  if (kind !== "question" && kind !== "continue") return { ok: false, reason: "kind" };
  if (typeof screen !== "string" || screen.length > 200) return { ok: false, reason: "screen" };
  if (typeof snapshot !== "string" || snapshot.length < 100 || snapshot.length > ASK_LIMITS.snapshot) return { ok: false, reason: "snapshot" };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > ASK_LIMITS.messages) return { ok: false, reason: "messages" };

  const clean: AskRequest["messages"] = [];
  for (const [i, m] of messages.entries()) {
    if (!isObj(m) || (m.role !== "user" && m.role !== "assistant")) return { ok: false, reason: `message ${i} role` };
    const want = i % 2 === 0 ? "user" : "assistant";
    if (m.role !== want) return { ok: false, reason: `message ${i} order` };
    const content = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    if (!Array.isArray(content) || content.length === 0) return { ok: false, reason: `message ${i} content` };
    for (const b of content) {
      if (!isObj(b) || typeof b.type !== "string" || !BLOCK_TYPES[m.role].has(b.type)) return { ok: false, reason: `message ${i} block` };
      if (b.type === "text" && typeof b.text !== "string") return { ok: false, reason: `message ${i} text` };
      if (b.type === "tool_result" && (typeof b.tool_use_id !== "string" || typeof b.content !== "string")) return { ok: false, reason: `message ${i} tool result` };
      if (b.type === "tool_use" && (typeof b.id !== "string" || typeof b.name !== "string" || !isObj(b.input))) return { ok: false, reason: `message ${i} tool use` };
    }
    clean.push({ role: m.role, content });
  }

  const last = clean[clean.length - 1]!;
  if (last.role !== "user") return { ok: false, reason: "last message" };
  const types = last.content.map((b) => (b as { type: string }).type);
  let question = "";
  if (kind === "question") {
    if (!types.every((t) => t === "text")) return { ok: false, reason: "question must be text" };
    question = last.content.map((b) => (b as { text: string }).text).join("\n");
    if (question.trim().length === 0 || question.length > ASK_LIMITS.question + 300) return { ok: false, reason: "question length" };
    // The page puts the screen first, in square brackets; the record keeps that separately.
    question = question.replace(/^\[Screen: [^\]\n]*\]\n/, "").trim();
    if (!question) return { ok: false, reason: "question length" };
  } else if (!types.every((t) => t === "tool_result")) return { ok: false, reason: "continue must carry tool results" };

  return { ok: true, req: { turnId, kind, screen, snapshot, messages: clean }, question };
}
