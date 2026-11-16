import { describe, expect, it } from "vitest";
import { parseAnswer, safeHref } from "./markdown";
import { keepHistory, undash } from "./run";
import type { AskMessage } from "./state";

describe("the conversation sent back with each question", () => {
  const q = (n: number): AskMessage => ({ role: "user", content: [{ type: "text", text: `question ${n}` }] });
  const a = (n: number): AskMessage => ({ role: "assistant", content: [{ type: "thinking", thinking: "", signature: `s${n}` }, { type: "text", text: `answer ${n}` }] });

  it("drops the hidden thinking of finished questions", () => {
    const kept = keepHistory([q(1), a(1)]);
    expect(kept[1]!.content).toEqual([{ type: "text", text: "answer 1" }]);
  });

  it("keeps a round of drafts whole, and never starts part way through a question", () => {
    const draft: AskMessage[] = [q(1), { role: "assistant", content: [{ type: "tool_use", id: "t", name: "draft_chaser", input: {} }] }, { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "Drafted" }] }, a(1)];
    const many = [...draft, ...[2, 3, 4, 5, 6, 7].flatMap((n) => [q(n), a(n)])];
    const kept = keepHistory(many, 6);
    expect(kept[0]).toEqual(q(2));
    expect(kept).toHaveLength(12);
    expect(keepHistory(draft, 6)).toHaveLength(4);
  });

  it("never leaves an empty answer behind", () => {
    expect(keepHistory([q(1), { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s" }] }])[1]!.content).toEqual([{ type: "text", text: "(no answer)" }]);
  });
});

describe("links in answers", () => {
  it("keeps links to the demo's own screens and records", () => {
    expect(safeHref("/invoicing/invoiced")).toBe("/invoicing/invoiced");
    expect(safeHref("/projects/C719")).toBe("/projects/C719");
    expect(safeHref("/projects/C719?tab=costs")).toBe("/projects/C719?tab=costs");
    expect(safeHref("/sales/quotes/Q-2614")).toBe("/sales/quotes/Q-2614");
    expect(safeHref("/dashboard?open=ap-n1x2")).toBe("/dashboard?open=ap-n1x2");
    expect(safeHref("/projects/C719?tab=files")).toBe("/projects/C719?tab=files");
    expect(safeHref("/files?project=C719&folder=Method statements")).toBe("/files?project=C719&folder=Method%20statements");
    expect(safeHref("/admin")).toBe("/admin");
    expect(safeHref("/admin/access?person=p-101")).toBe("/admin/access?person=p-101");
  });

  it("drops links that leave the demo, or that a screen does not understand", () => {
    for (const bad of ["https://evil.example/", "//evil.example/x", "javascript:alert(1)", "/admin/secrets", "/dashboard/approvals?open=ap-1", "/projects/C719?tab=<script>", "/inbox?redirect=https://x", "/projects/../ask-log", "/ask-log", "/api/ask", "/invoicing/invoiced#x"]) expect(safeHref(bad)).toBeNull();
  });
});

describe("reading an answer", () => {
  it("reads paragraphs, bold, links and lists", () => {
    const b = parseAnswer("Three invoices are late: **€193,336** in all.\n\n- [INV-5203](/invoicing/invoiced) Dunmoy, 38 days late\n- [INV-5205](https://evil.example) Fitzgarret\n\nChase Dunmoy first.");
    expect(b.map((x) => x.kind)).toEqual(["p", "ul", "p"]);
    expect(b[0]).toEqual({ kind: "p", lines: [[{ kind: "text", text: "Three invoices are late: " }, { kind: "bold", text: "€193,336" }, { kind: "text", text: " in all." }]] });
    const list = b[1] as { items: { kind: string; text: string; to?: string }[][] };
    expect(list.items[0]![0]).toEqual({ kind: "link", text: "INV-5203", to: "/invoicing/invoiced" });
    // A link out of the demo becomes plain words.
    expect(list.items[1]![0]).toEqual({ kind: "text", text: "INV-5205" });
  });

  it("reads a small table", () => {
    const b = parseAnswer("| Invoice | Late |\n|---|---|\n| INV-5203 | 38 days |\n| INV-5205 | 19 days |");
    expect(b).toHaveLength(1);
    const t = b[0] as { kind: string; head: unknown[]; rows: unknown[][] };
    expect(t.kind).toBe("table");
    expect(t.head).toHaveLength(2);
    expect(t.rows).toHaveLength(2);
  });

  it("never passes HTML through: it stays as text", () => {
    const b = parseAnswer('<img src=x onerror="alert(1)"> hello');
    expect(b).toEqual([{ kind: "p", lines: [[{ kind: "text", text: '<img src=x onerror="alert(1)"> hello' }]] }]);
  });

  it("keeps a link inside bold as a link, in bold, with no markdown left showing", () => {
    expect(parseAnswer("**[Q-2614](/sales/quotes/Q-2614): Fitzgarret Property Holdings**")).toEqual([
      { kind: "p", lines: [[{ kind: "link", text: "Q-2614", to: "/sales/quotes/Q-2614", bold: true }, { kind: "bold", text: ": Fitzgarret Property Holdings" }]] },
    ]);
    // Bold inside the link's words, and a link out of the demo inside bold.
    expect(parseAnswer("[**Q-2615**](/sales/quotes/Q-2615)")).toEqual([{ kind: "p", lines: [[{ kind: "link", text: "Q-2615", to: "/sales/quotes/Q-2615" }]] }]);
    expect(parseAnswer("**See [this](https://evil.example) now**")).toEqual([{ kind: "p", lines: [[{ kind: "bold", text: "See " }, { kind: "bold", text: "this" }, { kind: "bold", text: " now" }]] }]);
  });

  it("drops heading marks and stray backticks", () => {
    expect(parseAnswer("## Late invoices\n`INV-5203`")).toEqual([{ kind: "p", lines: [[{ kind: "text", text: "Late invoices" }], [{ kind: "text", text: "INV-5203" }]] }]);
  });

  it("takes out long dashes the model lets slip", () => {
    expect(undash("Dunmoy — 38 days late, weeks 3–4")).toBe("Dunmoy, 38 days late, weeks 3-4");
  });
});
