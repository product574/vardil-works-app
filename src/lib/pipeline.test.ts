import { describe, expect, it } from "vitest";
import { boardMove, dueAChase, stageOf } from "./pipeline";

const kind = (from: Parameters<typeof boardMove>[0], to: Parameters<typeof boardMove>[1], fromEnquiry = true) => {
  const m = boardMove(from, to, fromEnquiry);
  return m.ok ? m.kind : null;
};

describe("moving a card on the sales board", () => {
  it("puts each quote in the column of its status", () => {
    expect(["Draft", "Awaiting approval", "Sent", "Queried", "Accepted", "Declined"].map((s) => stageOf(s as never))).toEqual(["drafting", "drafting", "sent", "queried", "won", "lost"]);
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
    for (const from of ["sent", "queried"] as const) {
      expect(kind(from, "won")).toBe("accept");
      expect(kind(from, "lost")).toBe("decline");
      expect(kind(from, "drafting")).toBe("backToDraft");
    }
    expect(kind("sent", "queried")).toBe("query");
    expect(kind("queried", "sent")).toBe("resend");
  });

  it("leaves won quotes alone", () => {
    for (const to of ["enquiry", "drafting", "sent", "lost"] as const) expect(kind("won", to)).toBeNull();
    expect(boardMove("won", "lost")).toEqual({ ok: false, why: "A won quote is a project now, so it stays in Won." });
    expect(kind("lost", "drafting")).toBe("reopen");
    expect(kind("lost", "won")).toBeNull();
    expect(kind("sent", "sent")).toBeNull();
  });
});

describe("which sent tenders are due a chase (decision 233: nothing says a client has opened one)", () => {
  const today = "2026-11-20";
  it("a week out with no answer is due; six days is not", () => {
    expect(dueAChase({ status: "Sent", sentAt: "2026-11-13T16:20:00" }, today)).toBe(true);
    expect(dueAChase({ status: "Sent", sentAt: "2026-11-14T16:20:00" }, today)).toBe(false);
  });
  it("one chased in the last week waits, and is due again a week after the chase", () => {
    expect(dueAChase({ status: "Sent", sentAt: "2026-11-02T16:20:00", chasedAt: "2026-11-17T10:05:00" }, today)).toBe(false);
    expect(dueAChase({ status: "Sent", sentAt: "2026-11-02T16:20:00", chasedAt: "2026-11-13T10:05:00" }, today)).toBe(true);
  });
  it("only a tender that is out and unanswered is chased", () => {
    for (const status of ["Draft", "Awaiting approval", "Queried", "Accepted", "Declined"] as const) expect(dueAChase({ status, sentAt: "2026-10-01T16:20:00" }, today)).toBe(false);
    expect(dueAChase({ status: "Sent" }, today)).toBe(false);
  });
});
