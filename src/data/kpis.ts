// The numbers on the dashboard, each worked out from the records so they can never disagree
// with the screens they link to.
import { dueState } from "@/lib/status";
import { nextServiceDate } from "@/lib/status";
import { needsAccounts, owedOut, purchaseStage } from "@/lib/purchases";
import type { Db } from "./types";

export function ageDays(from: string | undefined, today: string) {
  if (!from) return 0;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(from.slice(0, 10))) / 86_400_000));
}

export function dashboardNumbers(db: Db, today: string) {
  const owed = owedOut(db.supplierInvoices, today);
  const live = db.projects.filter((p) => p.status === "Live");
  const liveIds = new Set(live.map((p) => p.id));
  const todays = db.attendance.filter((a) => a.date === today && liveIds.has(a.projectId));
  const sitesSent = new Set(todays.filter((a) => a.sent).map((a) => a.projectId));
  const certs = db.people.filter((p) => p.active).flatMap((p) => p.certs);
  const plantDue = db.plant.flatMap((p) => [...p.renewals.map((r) => r.expires), nextServiceDate(p.service, today).date]);
  const fleetDue = db.vehicles.filter((v) => v.active).flatMap((v) => [v.compliance.tax.expiryDate, v.compliance.test.expiryDate, v.compliance.insurance.expiryDate]);
  const overdueInvoices = db.salesInvoices.filter((i) => i.status === "Invoiced" && i.dueOn && i.dueOn < today);

  return {
    sales: {
      // The same as the board's To quote column: enquiries with no quote yet (one being drafted is in Drafting).
      enquiriesToQuote: db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId).length,
      quotesOut: db.quotes.filter((q) => q.status === "Sent" || q.status === "Opened").length,
      openedNotAnswered: db.quotes.filter((q) => q.status === "Opened").length,
      queried: db.quotes.filter((q) => q.status === "Queried").length,
    },
    sites: {
      live: live.length,
      peopleOnSite: new Set(todays.map((a) => a.personId)).size,
      timeStampsNotSent: live.filter((p) => !sitesSent.has(p.id)).length,
      notStarted: db.projects.filter((p) => p.status === "Not started").length,
      openRequests: db.requests.filter((r) => r.status === "Open").length,
    },
    money: {
      toInvoice: db.salesInvoices.filter((i) => i.status === "To invoice").length,
      toInvoiceValue: db.salesInvoices.filter((i) => i.status === "To invoice").reduce((s, i) => s + i.net, 0),
      held: db.salesInvoices.filter((i) => i.status === "Held").length,
      overdue: overdueInvoices.length,
      overdueValue: overdueInvoices.reduce((s, i) => s + i.net * (1 + i.vatPct / 100), 0),
      supplierToCheck: db.supplierInvoices.filter(needsAccounts).length,
      // Supplier and subcontractor invoices: waiting for whoever approves them, then for accounts to pay.
      toApprove: db.supplierInvoices.filter((i) => purchaseStage(i) === "approve").length,
      toPay: owed.count,
      toPayValue: owed.total,
      toPayLate: owed.lateCount,
    },
    compliance: {
      certsExpired: certs.filter((c) => dueState(c.expires, today) === "overdue").length,
      certsSoon: certs.filter((c) => dueState(c.expires, today) === "soon").length,
      plantOverdue: plantDue.filter((d) => dueState(d, today) === "overdue").length,
      fleetOverdue: fleetDue.filter((d) => dueState(d, today) === "overdue").length,
      holidaysPending: db.holidays.filter((h) => h.status === "Requested").length,
      hiredToReturn: db.hiredPlant.filter((h) => h.status === "Return notified").length,
    },
    approvalsPending: db.approvals.filter((a) => a.status === "Pending").length,
  };
}
