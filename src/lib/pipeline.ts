/**
 * Moving a card between columns of the sales board (Aodhan, 16 Nov: "jobs can be moved between
 * sections"). A move does what that stage means to the records, the same as the buttons on the
 * quote page, so the board never shows a stage the records do not back up. Moves that make no
 * sense are refused with the reason.
 */
import type { QuoteStatus } from "@/data/types";

export type Stage = "enquiry" | "drafting" | "sent" | "opened" | "queried" | "won" | "lost";

export const STAGE_LABEL: Record<Stage, string> = { enquiry: "To quote", drafting: "Drafting", sent: "Sent", opened: "Opened", queried: "Queried", won: "Won", lost: "Declined" };

export type MoveKind = "draft" | "discard" | "send" | "resend" | "backToDraft" | "query" | "accept" | "decline" | "reopen";
export type Move = { ok: true; kind: MoveKind } | { ok: false; why: string };

/** The column a quote sits in. */
export function stageOf(status: QuoteStatus): Stage {
  if (status === "Draft" || status === "Awaiting approval") return "drafting";
  if (status === "Accepted") return "won";
  if (status === "Declined") return "lost";
  return status === "Sent" ? "sent" : status === "Opened" ? "opened" : "queried";
}

/** What moving a card from one column to another does, or why it cannot. */
export function boardMove(from: Stage, to: Stage, fromEnquiry = true): Move {
  const no = (why: string): Move => ({ ok: false, why });
  if (from === to) return no("It is already here.");
  if (from === "won") return no("A won quote is a project now, so it stays in Won.");
  if (to === "opened") return no("Opened is set by the client opening the quote in their portal.");
  if (from === "enquiry") return to === "drafting" ? { ok: true, kind: "draft" } : no("Draft a quote first: move it to Drafting.");
  if (to === "enquiry") {
    if (from !== "drafting") return no("Only a draft can go back to To quote.");
    return fromEnquiry ? { ok: true, kind: "discard" } : no("This quote did not come from an enquiry, so there is nothing to go back to.");
  }
  if (from === "drafting") return to === "sent" ? { ok: true, kind: "send" } : no("Send it to the client first.");
  if (from === "lost") return to === "drafting" ? { ok: true, kind: "reopen" } : no("Reopen it in Drafting first.");
  // Sent, opened or queried: out with the client.
  if (to === "drafting") return { ok: true, kind: "backToDraft" };
  if (to === "won") return { ok: true, kind: "accept" };
  if (to === "lost") return { ok: true, kind: "decline" };
  if (to === "queried") return { ok: true, kind: "query" };
  // to === "sent"
  return from === "queried" ? { ok: true, kind: "resend" } : no("It has been opened already. Record the client's answer instead.");
}
