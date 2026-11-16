import { describe, expect, it } from "vitest";
import { boardMove, stageOf } from "./pipeline";

const kind = (from: Parameters<typeof boardMove>[0], to: Parameters<typeof boardMove>[1], fromEnquiry = true) => {
  const m = boardMove(from, to, fromEnquiry);
  return m.ok ? m.kind : null;
};

describe("moving a card on the sales board", () => {
  it("puts each quote in the column of its status", () => {
    expect(["Draft", "Awaiting approval", "Sent", "Opened", "Queried", "Accepted", "Declined"].map((s) => stageOf(s as never))).toEqual(["drafting", "drafting", "sent", "opened", "queried", "won", "lost"]);
  });

  it("drafts from an enquiry, and a draft can go back to To quote", () => {
    expect(kind("enquiry", "drafting")).toBe("draft");
    expect(kind("drafting", "enquiry")).toBe("discard");
    expect(kind("drafting", "enquiry", false)).toBeNull();
    for (const to of ["sent", "queried", "won", "lost"] as const) expect(kind("enquiry", to)).toBeNull();
  });

  it("sends a draft, and nothing else happens to a draft before it is sent", () => {
    expect(kind("drafting", "sent")).toBe("send");
    for (const to of ["queried", "won", "lost"] as const) expect(kind("drafting", to)).toBeNull();
  });

  it("records the client's answer on a quote that is out", () => {
    for (const from of ["sent", "opened", "queried"] as const) {
      expect(kind(from, "won")).toBe("accept");
      expect(kind(from, "lost")).toBe("decline");
      expect(kind(from, "drafting")).toBe("backToDraft");
    }
    expect(kind("sent", "queried")).toBe("query");
    expect(kind("opened", "queried")).toBe("query");
    expect(kind("queried", "sent")).toBe("resend");
    expect(kind("opened", "sent")).toBeNull();
  });

  it("refuses what only the client can do, and leaves won quotes alone", () => {
    for (const from of ["enquiry", "drafting", "sent", "queried", "lost"] as const) expect(kind(from, "opened")).toBeNull();
    for (const to of ["enquiry", "drafting", "sent", "lost"] as const) expect(kind("won", to)).toBeNull();
    expect(boardMove("won", "lost")).toEqual({ ok: false, why: "A won quote is a project now, so it stays in Won." });
    expect(kind("lost", "drafting")).toBe("reopen");
    expect(kind("lost", "won")).toBeNull();
    expect(kind("sent", "sent")).toBeNull();
  });
});
