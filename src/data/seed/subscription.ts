import type { Person, SubscriptionInvoice } from "../types";
import { billedUsers, PLAN, pastInvoices } from "@/lib/subscription";

/** Admin > Billing: the invoices for the three months before this one (the plan is PLAN in src/lib/subscription.ts). */
export function seedSubscription(today: string, people: Person[]): SubscriptionInvoice[] {
  return pastInvoices(today, billedUsers({ people }), PLAN);
}
