/**
 * Buying for a site, end to end (21 Nov, decisions 242 and 243): someone asks to buy something,
 * the managing director says yes or no, the office places the order, and the site says when it
 * has arrived. The invoice then comes in through Add invoice (Finance, Money out).
 *
 * Each step belongs to the person who knows it: the site knows what it needs and whether it
 * came; the managing director decides the money; the office deals with the supplier.
 */
import type { Db, Project, SiteAccess, SpendRequest, SupplyOrder } from "@/data/types";
import { daysBetween } from "./status";
import { opensSite } from "./site-access";

export type NewSpend = { what: string; supplier: string; amount: number; reason: string };

/** Why a request to buy cannot be sent yet, or "" when it can. */
export function spendProblem(f: NewSpend): string {
  if (!f.what.trim()) return "Say what is to be bought.";
  if (!(f.amount > 0)) return "Give the amount before VAT, even a rough one.";
  if (!f.reason.trim()) return "Say why it is needed.";
  return "";
}

/** Where a request to buy stands, in the words the screens use. */
export type SpendStage = "waiting" | "declined" | "to-order" | "ordered" | "delivered";
export function spendStage(s: SpendRequest, orders: Pick<SupplyOrder, "id" | "status">[]): SpendStage {
  if (s.status === "Waiting") return "waiting";
  if (s.status === "Declined") return "declined";
  const o = s.orderId ? orders.find((x) => x.id === s.orderId) : undefined;
  if (!o) return "to-order";
  return o.status === "Delivered" ? "delivered" : "ordered";
}
export const SPEND_WORDS: Record<SpendStage, string> = {
  waiting: "Waiting for a yes or no",
  declined: "Declined",
  "to-order": "Approved, to be ordered",
  ordered: "Ordered",
  delivered: "Delivered",
};

/** Approved and not ordered yet: the office's list, oldest yes first. */
export const toOrder = (spend: SpendRequest[]) => spend.filter((s) => s.status === "Approved" && !s.orderId).sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? ""));

/** On order and not all here yet, the latest first. */
export const onOrder = (orders: SupplyOrder[]) => orders.filter((o) => o.status !== "Delivered").sort((a, b) => a.dueOn.localeCompare(b.dueOn));

/** Delivered in the last 30 days, newest first. */
export const deliveredLately = (orders: SupplyOrder[], today: string) =>
  orders.filter((o) => o.status === "Delivered" && o.deliveredOn && daysBetween(o.deliveredOn, today) <= 30).sort((a, b) => (b.deliveredOn ?? "").localeCompare(a.deliveredOn ?? ""));

/** How late an order is, in days: 0 when it is not. */
export const daysLate = (o: Pick<SupplyOrder, "dueOn" | "status">, today: string) => (o.status === "Delivered" ? 0 : Math.max(0, daysBetween(o.dueOn, today)));

/** Why an order cannot be recorded yet, or "". */
export function orderProblem(f: { supplier: string; dueOn: string }, today: string): string {
  if (!f.supplier.trim()) return "Say who it was ordered from.";
  if (!f.dueOn) return "Give the day it is due on site.";
  if (f.dueOn < today) return "The day it is due is in the past.";
  return "";
}

/**
 * Who may say a delivery has arrived: whoever opens that site (its site manager, and anyone given
 * it in Admin, Site access), and the office. An order for the firm as a whole is the office's.
 */
export function mayMarkDelivered(o: Pick<SupplyOrder, "projectId">, projects: Pick<Project, "id" | "siteManagerId">[], personId: string | null, grants: Pick<SiteAccess, "personId" | "projectId">[], office: boolean): boolean {
  if (office) return true;
  const p = projects.find((x) => x.id === o.projectId);
  return !!p && opensSite(p, personId, grants);
}

/** The requests to buy and the orders on one set of sites (null for every site and the firm's own). */
export function buyingFor(db: Pick<Db, "spendRequests" | "supplies">, siteIds: Set<string> | null, personId: string | null) {
  const mine = (projectId: string | null, askedBy?: string) => (siteIds === null ? true : projectId ? siteIds.has(projectId) : askedBy === personId);
  return {
    spend: db.spendRequests.filter((s) => mine(s.projectId, s.requestedById)),
    orders: db.supplies.filter((o) => mine(o.projectId)),
  };
}
