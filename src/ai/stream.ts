/**
 * Reading the model's streamed answer.
 *
 * The server function passes the model provider's event stream straight through to the page.
 * Both ends read it with these two pieces: `sseParser` splits the stream into events, and
 * `createAccumulator` rebuilds the answer from them (its text, the drafts it asked for, the
 * hidden thinking that must be sent back unchanged with tool results, and the token counts).
 * Shared by the page and the server, so it has no imports.
 */

export type AskBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

export type AskUsage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };

/** Splits a server-sent event stream into (event, data) pairs. Feed it text as it arrives. */
export function sseParser(onEvent: (event: string, data: string) => void) {
  let buf = "";
  const flush = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue;
      const c = line.indexOf(":");
      const field = c < 0 ? line : line.slice(0, c);
      let value = c < 0 ? "" : line.slice(c + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) onEvent(event, data.join("\n"));
  };
  return {
    push(chunk: string) {
      buf += chunk;
      for (;;) {
        const m = /\r?\n\r?\n/.exec(buf);
        if (!m) break;
        flush(buf.slice(0, m.index));
        buf = buf.slice(m.index + m[0].length);
      }
    },
    end() {
      if (buf.trim()) flush(buf);
      buf = "";
    },
  };
}

type Pending = AskBlock & { json?: string };

/** Rebuilds one streamed model message from its events. */
export function createAccumulator() {
  const blocks: Pending[] = [];
  const usage: AskUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  const state = { stopReason: null as string | null, error: null as string | null, done: false };
  const takeUsage = (u: Partial<AskUsage> | undefined) => {
    if (!u) return;
    for (const k of Object.keys(usage) as (keyof AskUsage)[]) if (typeof u[k] === "number") usage[k] = u[k] as number;
  };

  function onEvent(ev: { type?: string; [k: string]: unknown }) {
    switch (ev.type) {
      case "message_start":
        takeUsage((ev.message as { usage?: Partial<AskUsage> } | undefined)?.usage);
        break;
      case "content_block_start": {
        const b = ev.content_block as Record<string, unknown> | undefined;
        const i = ev.index as number;
        if (!b || typeof i !== "number") break;
        if (b.type === "text") blocks[i] = { type: "text", text: String(b.text ?? "") };
        else if (b.type === "thinking") blocks[i] = { type: "thinking", thinking: String(b.thinking ?? ""), signature: String(b.signature ?? "") };
        else if (b.type === "redacted_thinking") blocks[i] = { type: "redacted_thinking", data: String(b.data ?? "") };
        else if (b.type === "tool_use") blocks[i] = { type: "tool_use", id: String(b.id ?? ""), name: String(b.name ?? ""), input: {}, json: "" };
        break;
      }
      case "content_block_delta": {
        const b = blocks[ev.index as number];
        const d = ev.delta as Record<string, unknown> | undefined;
        if (!b || !d) break;
        if (d.type === "text_delta" && b.type === "text") b.text += String(d.text ?? "");
        else if (d.type === "thinking_delta" && b.type === "thinking") b.thinking += String(d.thinking ?? "");
        else if (d.type === "signature_delta" && b.type === "thinking") b.signature += String(d.signature ?? "");
        else if (d.type === "input_json_delta" && b.type === "tool_use") b.json = (b.json ?? "") + String(d.partial_json ?? "");
        break;
      }
      case "content_block_stop": {
        const b = blocks[ev.index as number];
        if (b?.type === "tool_use") {
          try {
            b.input = b.json ? (JSON.parse(b.json) as Record<string, unknown>) : {};
          } catch {
            b.input = {};
          }
          delete b.json;
        }
        break;
      }
      case "message_delta":
        state.stopReason = ((ev.delta as { stop_reason?: string } | undefined)?.stop_reason ?? state.stopReason) || null;
        takeUsage(ev.usage as Partial<AskUsage> | undefined);
        break;
      case "message_stop":
        state.done = true;
        break;
      case "error":
        state.error = String((ev.error as { message?: string } | undefined)?.message ?? "The model stopped with an error.");
        break;
    }
  }

  return {
    onEvent,
    usage,
    get stopReason() {
      return state.stopReason;
    },
    get error() {
      return state.error;
    },
    get done() {
      return state.done;
    },
    fail(message: string) {
      state.error = message;
    },
    /** The message as it must be sent back on the next request. */
    blocks(): AskBlock[] {
      return blocks.filter(Boolean).map((b) => {
        const { json: _drop, ...rest } = b as Pending;
        return rest as AskBlock;
      });
    },
    /** The visible answer so far. */
    text() {
      return blocks
        .filter((b): b is Extract<Pending, { type: "text" }> => b?.type === "text")
        .map((b) => b.text)
        .join("\n\n");
    },
    toolUses() {
      return blocks.filter((b): b is Extract<Pending, { type: "tool_use" }> => b?.type === "tool_use" && b.json === undefined);
    },
  };
}

/** Claude Sonnet 5.5 prices in US dollars per million tokens (checked 15 Nov 2026). */
export const PRICE_PER_MTOK = { input: 2, cacheWrite: 2.5, cacheRead: 0.1, output: 10 };
export const costUsd = (u: AskUsage) => (u.input_tokens * PRICE_PER_MTOK.input + u.cache_creation_input_tokens * PRICE_PER_MTOK.cacheWrite + u.cache_read_input_tokens * PRICE_PER_MTOK.cacheRead + u.output_tokens * PRICE_PER_MTOK.output) / 1_000_000;
