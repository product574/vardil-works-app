/**
 * Payment claims (20 Nov, from the call with Jimmy, Oldstone's managing director): "the most
 * important thing was to get that payment claim in at the end of each month, religiously". So
 * Money in opens on every job that should be claimed this month, with a column saying whether
 * this month's claim has gone (green) or not (red).
 *
 * A claim is a client invoice: a stage payment, a valuation or a final account. One sent to the
 * client this month means this month's claim is issued. Pure, so it can be tested.
 */
import type { BankHoliday, Db, Project, SalesInvoice } from "@/data/types";
import { addDays } from "./dates";
import { isRestDay } from "./bank-holidays";
import { r2 } from "./money";

export type ClaimState = "issued" | "draft" | "held" | "to-issue" | "final";
export const CLAIM_LABEL: Record<ClaimState, string> = { issued: "Issued", draft: "Drafted, not sent", held: "On hold", "to-issue": "To be issued", final: "Final account to go" };
export const CLAIM_TONE: Record<ClaimState, "ok" | "warn" | "bad" | "neutral"> = { issued: "ok", draft: "warn", held: "warn", "to-issue": "bad", final: "bad" };

/** "2026-11" for a day in November 2026. */
export const monthOf = (day: string) => day.slice(0, 7);

/** The last working day of the month a day falls in: when this month's claims are due out. */
export function claimsDue(day: string, holidays: BankHoliday[] = []) {
  const [y, m] = day.split("-").map(Number) as [number, number];
  let d = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
  while (isRestDay(holidays, d)) d = addDays(d, -1);
  return d;
}

export type ClaimRow = {
  project: Project;
  state: ClaimState;
  /** This month's claim, when there is one (sent, drafted or held). */
  invoice?: SalesInvoice;
  /** Before VAT: everything claimed on the job so far (sent or paid), and of that what is paid. */
  claimed: number;
  paid: number;
  /** What is left of the contract value to claim, before VAT. */
  left: number;
};

/**
 * Every job to be claimed on this month: live jobs, and finished ones whose final account has not
 * gone out yet. Not yet started, and invoiced or closed, jobs have nothing to claim this month.
 */
export function claimRows(db: Pick<Db, "projects" | "salesInvoices">, today: string): ClaimRow[] {
  const month = monthOf(today);
  const rows: ClaimRow[] = [];
  for (const project of db.projects) {
    if (project.status !== "Live" && project.status !== "Complete") continue;
    const mine = db.salesInvoices.filter((i) => i.projectId === project.id);
    const sent = mine.filter((i) => i.status === "Invoiced" || i.status === "Paid");
    const claimed = r2(sent.reduce((s, i) => s + i.net, 0));
    const paid = r2(mine.filter((i) => i.status === "Paid").reduce((s, i) => s + i.net, 0));
    const left = r2((project.value ?? 0) - claimed);
    const thisMonth = sent.filter((i) => i.issuedOn && monthOf(i.issuedOn) === month).sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""))[0];
    const draft = mine.find((i) => i.status === "To invoice");
    const held = mine.find((i) => i.status === "Held");
    const state: ClaimState = thisMonth ? "issued" : draft ? "draft" : held ? "held" : project.status === "Complete" ? "final" : "to-issue";
    rows.push({ project, state, invoice: thisMonth ?? draft ?? held, claimed, paid, left });
  }
  // What is still to go first, then by site code.
  const order: ClaimState[] = ["to-issue", "final", "held", "draft", "issued"];
  return rows.sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.project.code.localeCompare(b.project.code));
}

/** How many jobs still have no claim out this month (drafted and held ones count: they have not gone). */
export const claimsToIssue = (db: Pick<Db, "projects" | "salesInvoices">, today: string) => claimRows(db, today).filter((r) => r.state !== "issued").length;

/** "4 of 7 issued" for the dashboard and the page heading. */
export function claimSummary(rows: ClaimRow[]) {
  const issued = rows.filter((r) => r.state === "issued").length;
  return { issued, total: rows.length, toGo: rows.length - issued };
}
