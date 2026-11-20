/**
 * The "Portal" panel on the overview (Aodhan, 16 Nov): what clients and subcontractors have
 * done lately, and what is still outstanding, invoices from clients and supplies to sites.
 *
 * Client updates come from the quotes themselves (opened, asked about, accepted, declined), so
 * a client's action in the portal shows here straight away. Subcontractors and suppliers post
 * their own notes. Nothing here is stored twice.
 */
import type { Db, SupplyOrder } from "@/data/types";
import { invoiceNo } from "./billing";
import { dShort, dWeekday } from "./format";
import { daysBetween } from "./status";

export type FeedItem = {
  at: string;
  party: "client" | "subcontractor" | "supplier";
  /** Who it is from: the client contact and firm, or the subcontractor or supplier. */
  who: string;
  text: string;
  /** The screen it links to. */
  to?: string;
};

/** A client's question can run to a paragraph: the panel shows its first sentence. */
const firstSentence = (s: string) => s.split(/(?<=[.?!])\s+/)[0] ?? s;

/** Newest first, from the last 15 days. */
export function portalFeed(db: Db, today: string, limit = 5): FeedItem[] {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 15 * 86_400_000).toISOString().slice(0, 10);
  const out: FeedItem[] = [];
  for (const q of db.quotes) {
    const c = db.clients.find((x) => x.id === q.clientId);
    if (!c) continue;
    const who = `${c.contactName}, ${c.name}`;
    const to = `/sales/quotes/${q.ref}`;
    if (q.status === "Queried" && q.respondedAt) out.push({ at: q.respondedAt, party: "client", who, text: `Asked about quote ${q.ref}: "${firstSentence(q.query ?? "a question")}"`, to });
    if (q.status === "Accepted" && q.respondedAt) out.push({ at: q.respondedAt, party: "client", who, text: `Accepted quote ${q.ref}${q.poNumber ? ` with purchase order ${q.poNumber}` : ""}.`, to });
    if (q.status === "Declined" && q.respondedAt) out.push({ at: q.respondedAt, party: "client", who, text: `Turned down quote ${q.ref}, ${q.title}.`, to });
  }
  for (const n of db.portalNotes) {
    const p = db.projects.find((x) => x.id === n.projectId);
    out.push({ at: n.at, party: n.party, who: n.from, text: n.text, to: p ? `/projects/${p.code}` : undefined });
  }
  return out
    .filter((x) => x.at.slice(0, 10) >= since && x.at.slice(0, 10) <= today)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

export type Outstanding =
  | { kind: "invoice"; who: string; ref: string; gross: number; daysLate: number; to: string }
  | { kind: "supply"; who: string; order: SupplyOrder; code: string; daysLate: number; to: string };

/** Client invoices past their due date, then supplies not yet on site, the latest first. */
export function outstanding(db: Db, today: string): Outstanding[] {
  const invoices: Outstanding[] = db.salesInvoices
    .filter((i) => i.status === "Invoiced" && i.dueOn && i.dueOn < today)
    .map((i) => ({ kind: "invoice" as const, who: db.clients.find((c) => c.id === i.clientId)?.name ?? "", ref: invoiceNo(i), gross: Math.round(i.net * (1 + i.vatPct / 100) * 100) / 100, daysLate: daysBetween(i.dueOn!, today), to: "/invoicing/invoiced" }))
    .sort((a, b) => b.daysLate - a.daysLate);
  const supplies: Outstanding[] = db.supplies
    .filter((s) => s.status !== "Delivered")
    .map((s) => {
      const code = db.projects.find((p) => p.id === s.projectId)?.code ?? "";
      return { kind: "supply" as const, who: s.from, order: s, code, daysLate: daysBetween(s.dueOn, today), to: `/projects/${code}` };
    })
    .sort((a, b) => b.daysLate - a.daysLate);
  return [...invoices, ...supplies];
}

/** When a supply is due, in words: "Due today", "Due tomorrow", "Due Thu 19 Nov", "2 days late". */
export function dueWords(dueOn: string, today: string) {
  const d = daysBetween(today, dueOn);
  if (d < 0) return `${-d} ${d === -1 ? "day" : "days"} late`;
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  return d < 7 ? `Due ${dWeekday(dueOn)}` : `Due ${dShort(dueOn)}`;
}
