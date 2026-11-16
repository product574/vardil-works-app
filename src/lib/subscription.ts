/**
 * What the firm pays for this system (Admin > Billing, asked for on 16 Nov after the reference
 * templates): one invoice a month, for the month before, per person with a sign-in. Operatives
 * on the site phone and clients in the portal are not counted.
 */
import type { Db, SubscriptionInvoice } from "@/data/types";
import { addDays, isWeekend } from "./dates";
import { r2 } from "./money";

/** Everyone in the office or running a site who signs in counts as one user. */
export function billedUsers(db: Pick<Db, "people">) {
  return db.people.filter((p) => p.kind === "Management" && p.active).length;
}

/** The first day of the month `n` months away from the month `day` is in. */
export function monthStart(day: string, n = 0) {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function firstWorkdayFrom(day: string) {
  let d = day;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

/** A month's invoice goes out on the first working day of the month after. */
export function issueDay(month: string) {
  return firstWorkdayFrom(monthStart(month, 1));
}

/** The direct debit is taken three working days after the invoice goes out. */
export function collectionDay(issuedOn: string) {
  let d = issuedOn;
  for (let left = 3; left > 0; ) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left--;
  }
  return d;
}

export type Plan = { plan: string; perUser: number };

/**
 * The plan in the sample data. The price is per person with a sign-in, per month, before VAT:
 * 59, set by Aodhan on 16 Nov (only the managing director sees it). To change it, change it here
 * and bump DATA_VERSION so saved sample data is rebuilt.
 */
export const PLAN: Plan = { plan: "Monthly plan", perUser: 59 };

/** One month's invoice, for `users` people at the plan's price each. */
export function invoiceFor(month: string, users: number, { plan, perUser }: Plan): SubscriptionInvoice {
  const issuedOn = issueDay(month);
  return { id: `sub-${month.slice(0, 7)}`, number: `VD-${month.slice(2, 4)}${month.slice(5, 7)}`, plan, perUser, month, issuedOn, collectOn: collectionDay(issuedOn), users, amount: r2(users * perUser) };
}

/** The invoices for the three months before this one, newest first. */
export function pastInvoices(today: string, users: number, plan: Plan) {
  return [1, 2, 3].map((n) => invoiceFor(monthStart(today, -n), users, plan));
}

/** The plan and price carry on from the newest invoice. */
export function currentPlan(db: Pick<Db, "subscriptionInvoices">): Plan {
  const last = db.subscriptionInvoices[0];
  return last ? { plan: last.plan, perUser: last.perUser } : PLAN;
}

/** The invoice for the month in progress, from today's people: it goes out next month. */
export function nextInvoice(db: Pick<Db, "people" | "subscriptionInvoices">, today: string) {
  return invoiceFor(monthStart(today), billedUsers(db), currentPlan(db));
}

/** "Paid" once the direct debit has been taken, "Due" until then. */
export const invoicePaid = (inv: SubscriptionInvoice, today: string) => inv.collectOn <= today;
