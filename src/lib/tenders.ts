/**
 * Tenders (20 Nov, the Oldstone template agreed with Jimmy): Sales is Enquiries, Tenders,
 * Confirmed and Pipeline, and a tender has its own sections: overview (location, client, return
 * date), tender documents, subcontractors, photos, workings and Buildsoft, and tender completed.
 * Pure rules, with tests.
 */
import type { Project, Quote, SubPrice, TenderCheck, TenderFileKind } from "@/data/types";
import { quoteTotal } from "./quotes";
import { daysBetween } from "./status";
import { r2 } from "./money";

/** The checks before a tender goes, in order. The last is the managing director's. */
export const TENDER_CHECKS: { key: TenderCheck; label: string; hint: string; approve?: boolean }[] = [
  { key: "docs", label: "Tender documents read", hint: "The specification, bill of quantities and drawings have been gone through, and anything unclear asked about" },
  { key: "subs", label: "Subcontractors priced", hint: "Every trade we do not do ourselves has a price picked" },
  { key: "workings", label: "Workings checked", hint: "The priced items and cost build-up match the Buildsoft estimate and the bill of quantities" },
  { key: "price", label: "Price approved", hint: "The managing director has looked at the price and the margin", approve: true },
];

export const DOC_KINDS: TenderFileKind[] = ["Specification", "Bill of quantities", "Drawings", "Other document"];
export const WORKINGS_KINDS: TenderFileKind[] = ["Buildsoft", "Workings"];

/** Where a tender is, for the Sales lists. "pricing": still being priced; "out": with the client; "won" or "lost". */
export type TenderStage = "pricing" | "out" | "won" | "lost";
export function tenderStage(q: Pick<Quote, "status">): TenderStage {
  if (q.status === "Draft" || q.status === "Awaiting approval") return "pricing";
  if (q.status === "Accepted") return "won";
  if (q.status === "Declined") return "lost";
  return "out";
}

/** How many of the four checks are ticked. */
export const checksDone = (q: Pick<Quote, "tender">) => TENDER_CHECKS.filter((c) => !!q.tender?.checks[c.key]).length;
export const allChecked = (q: Pick<Quote, "tender">) => checksDone(q) === TENDER_CHECKS.length;

/** Subcontractors' prices: how many came back of how many asked, and whether every trade has one picked. */
export function subsState(prices: SubPrice[]) {
  const trades = [...new Set(prices.map((p) => p.trade))];
  const back = prices.filter((p) => p.price != null).length;
  const pickedTrades = trades.filter((t) => prices.some((p) => p.trade === t && p.picked));
  return { asked: prices.length, back, trades, missing: trades.filter((t) => !pickedTrades.includes(t)), total: r2(prices.filter((p) => p.picked && p.price != null).reduce((s, p) => s + p.price!, 0)) };
}

/** The cheapest price back for each trade, so the screen can mark it. */
export function cheapest(prices: SubPrice[]): Set<string> {
  const out = new Set<string>();
  for (const t of new Set(prices.map((p) => p.trade))) {
    const back = prices.filter((p) => p.trade === t && p.price != null).sort((a, b) => a.price! - b.price!);
    if (back[0]) out.add(back[0].id);
  }
  return out;
}

/** "Due back in 3 days", "Due back today", "2 days late", or when it went. */
export function returnWords(q: Pick<Quote, "tender" | "status" | "sentAt">, today: string) {
  const by = q.tender?.returnBy;
  if (!by) return "No return date";
  if (tenderStage(q) !== "pricing") return q.sentAt && q.sentAt.slice(0, 10) <= by ? "Returned on time" : "Returned";
  const d = daysBetween(today, by);
  return d > 1 ? `Due back in ${d} days` : d === 1 ? "Due back tomorrow" : d === 0 ? "Due back today" : `${-d} ${d === -1 ? "day" : "days"} late`;
}
export const returnTone = (q: Pick<Quote, "tender" | "status">, today: string): "ok" | "warn" | "bad" | "neutral" => {
  if (tenderStage(q) !== "pricing" || !q.tender) return "neutral";
  const d = daysBetween(today, q.tender.returnBy);
  return d < 0 ? "bad" : d <= 2 ? "bad" : d <= 5 ? "warn" : "neutral";
};

/** Does the Buildsoft total agree with the priced items, to the euro? */
export function buildsoftDiff(q: Pick<Quote, "tender" | "lines">) {
  if (q.tender?.buildsoftTotal == null) return null;
  return r2(quoteTotal(q.lines) - q.tender.buildsoftTotal);
}

/** The Pipeline section: what is tendered and waiting for an answer, and what is confirmed and not started. */
export function pipeline(quotes: Quote[], projects: Project[]) {
  const tendered = quotes.filter((q) => tenderStage(q) === "out").map((q) => ({ q, value: quoteTotal(q.lines) })).sort((a, b) => b.value - a.value);
  const pricing = quotes.filter((q) => tenderStage(q) === "pricing").map((q) => ({ q, value: quoteTotal(q.lines) })).sort((a, b) => (a.q.tender?.returnBy ?? "").localeCompare(b.q.tender?.returnBy ?? ""));
  const confirmed = projects.filter((p) => p.status === "Not started").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const sum = (l: { value: number }[]) => r2(l.reduce((s, x) => s + x.value, 0));
  return { tendered, tenderedValue: sum(tendered), pricing, pricingValue: sum(pricing), confirmed, confirmedValue: r2(confirmed.reduce((s, p) => s + (p.value ?? 0), 0)) };
}
