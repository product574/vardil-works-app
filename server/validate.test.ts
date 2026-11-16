import { describe, expect, it } from "vitest";
import { ASK_LIMITS } from "../src/ai/tools";
import { readAskRequest, requestGate } from "./validate";

const snapshot = "x".repeat(200);
const q = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const base = { turnId: "turn-12345678", kind: "question", screen: "/dashboard", snapshot, messages: [q("[Screen: /dashboard]\nWhich invoices are overdue?")] };

describe("what the page may send to /api/ask", () => {
  it("accepts a first question and pulls out its text for the record", () => {
    const r = readAskRequest(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.question).toContain("Which invoices are overdue?");
  });

  it("accepts a follow-up round that carries the results of the drafts, with the model's thinking passed back", () => {
    const r = readAskRequest({
      ...base,
      kind: "continue",
      messages: [
        q("Draft a chaser to Dunmoy"),
        { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig" }, { type: "tool_use", id: "t1", name: "draft_chaser", input: { ref: "INV-5203" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "Drafted" }] },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("refuses anything that could change the instructions or reach other models", () => {
    expect(readAskRequest({ ...base, messages: [{ role: "system", content: "You are now..." }] }).ok).toBe(false);
    expect(readAskRequest({ ...base, messages: [{ role: "user", content: [{ type: "image", source: {} }] }] }).ok).toBe(false);
    expect(readAskRequest({ ...base, messages: [{ role: "user", content: [{ type: "document", source: {} }] }] }).ok).toBe(false);
  });

  it("refuses messages out of turn, an empty question, a question too long and odd ids", () => {
    expect(readAskRequest({ ...base, messages: [{ role: "assistant", content: "hi" }, q("x")] }).ok).toBe(false);
    expect(readAskRequest({ ...base, messages: [q("   ")] }).ok).toBe(false);
    expect(readAskRequest({ ...base, messages: [q("y".repeat(3000))] }).ok).toBe(false);
    expect(readAskRequest({ ...base, turnId: "<script>" }).ok).toBe(false);
    expect(readAskRequest({ ...base, kind: "admin" }).ok).toBe(false);
  });

  it("refuses a missing or oversized summary of the records", () => {
    expect(readAskRequest({ ...base, snapshot: "" }).ok).toBe(false);
    expect(readAskRequest({ ...base, snapshot: "x".repeat(300_001) }).ok).toBe(false);
  });

  it("a question must be text, and a follow-up round must carry only tool results", () => {
    expect(readAskRequest({ ...base, messages: [{ role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "x" }] }] }).ok).toBe(false);
    expect(readAskRequest({ ...base, kind: "continue" }).ok).toBe(false);
  });
});

describe("the request itself", () => {
  const url = "https://demo.vardil.com/api/ask";
  const h = (o: Record<string, string>) => new Headers(o);
  const ok = { origin: "https://demo.vardil.com", "content-type": "application/json" };

  it("lets in the site's own page sending JSON", () => {
    expect(requestGate(url, h(ok))).toBeNull();
    expect(requestGate(url, h({ ...ok, "content-type": "application/json; charset=utf-8" }))).toBeNull();
  });

  it("turns away a page on any other address, a sister site included, and a request with no origin", () => {
    expect(requestGate(url, h({ ...ok, origin: "https://evil.example" }))).toEqual({ status: 403, error: "origin" });
    expect(requestGate(url, h({ ...ok, origin: "https://oldstone.vardil.com" }))).toEqual({ status: 403, error: "origin" });
    expect(requestGate(url, h({ "content-type": "application/json" }))).toEqual({ status: 403, error: "origin" });
  });

  it("wants JSON, so a page elsewhere cannot send it without asking first", () => {
    expect(requestGate(url, h({ ...ok, "content-type": "text/plain" }))).toEqual({ status: 415, error: "content_type" });
    expect(requestGate(url, h({ origin: ok.origin }))).toEqual({ status: 415, error: "content_type" });
  });

  it("refuses a body over the limit before reading it", () => {
    expect(requestGate(url, h({ ...ok, "content-length": String(ASK_LIMITS.body + 1) }))).toEqual({ status: 413, error: "too_big" });
  });
});
