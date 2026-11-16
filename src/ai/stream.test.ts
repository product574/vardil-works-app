import { describe, expect, it } from "vitest";
import { costUsd, createAccumulator, sseParser } from "./stream";

const ev = (o: Record<string, unknown>) => `event: ${String(o.type)}\ndata: ${JSON.stringify(o)}\n\n`;

const STREAM = [
  ev({ type: "message_start", message: { usage: { input_tokens: 40, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 1 } } }),
  ev({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "" } }),
  ev({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "EqQBCg" } }),
  ev({ type: "content_block_stop", index: 0 }),
  ": a comment line\n\n",
  ev({ type: "ping" }),
  ev({ type: "content_block_start", index: 1, content_block: { type: "text", text: "" } }),
  ev({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Three invoices " } }),
  ev({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "are late." } }),
  ev({ type: "content_block_stop", index: 1 }),
  ev({ type: "content_block_start", index: 2, content_block: { type: "tool_use", id: "toolu_1", name: "draft_chaser", input: {} } }),
  ev({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"ref": "INV-' } }),
  ev({ type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '5203", "subject": "s", "body": "b"}' } }),
  ev({ type: "content_block_stop", index: 2 }),
  ev({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 312 } }),
  ev({ type: "message_stop" }),
].join("");

describe("reading the streamed answer", () => {
  it("rebuilds text, hidden thinking and the draft asked for, whatever size the pieces arrive in", () => {
    for (const size of [1, 7, 64, STREAM.length]) {
      const acc = createAccumulator();
      const p = sseParser((_e, data) => acc.onEvent(JSON.parse(data)));
      for (let i = 0; i < STREAM.length; i += size) p.push(STREAM.slice(i, i + size));
      p.end();
      expect(acc.text()).toBe("Three invoices are late.");
      expect(acc.stopReason).toBe("tool_use");
      expect(acc.done).toBe(true);
      expect(acc.toolUses()).toEqual([{ type: "tool_use", id: "toolu_1", name: "draft_chaser", input: { ref: "INV-5203", subject: "s", body: "b" } }]);
      // The thinking block goes back to the model unchanged, signature and all.
      expect(acc.blocks()[0]).toEqual({ type: "thinking", thinking: "", signature: "EqQBCg" });
      expect(acc.usage).toEqual({ input_tokens: 40, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 312 });
    }
  });

  it("handles Windows line endings and a last event with no blank line after it", () => {
    const seen: string[] = [];
    const p = sseParser((e) => seen.push(e));
    p.push("event: a\r\ndata: {}\r\n\r\nevent: b\ndata: {}");
    p.end();
    expect(seen).toEqual(["a", "b"]);
  });

  it("notes an error the model sends part way through", () => {
    const acc = createAccumulator();
    acc.onEvent({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    expect(acc.error).toBe("Overloaded");
  });

  it("prices a question at Sonnet 5.5 rates", () => {
    // A first question: about 20,000 tokens written to the cache and a 400-token answer.
    expect(costUsd({ input_tokens: 100, cache_creation_input_tokens: 20000, cache_read_input_tokens: 0, output_tokens: 400 })).toBeCloseTo(0.0542, 4);
    // A follow-up reads the same 20,000 from the cache.
    expect(costUsd({ input_tokens: 600, cache_creation_input_tokens: 0, cache_read_input_tokens: 20000, output_tokens: 400 })).toBeCloseTo(0.0072, 4);
  });
});
