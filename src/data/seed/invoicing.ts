/**
 * What the invoicing screens show beyond the invoices themselves (added 18 Nov): how each one
 * went to the client, its own history, the email that carried it, a comment, and two client
 * queries. Written last, from the finished records, so every date follows from an invoice.
 * Nothing here is random.
 */
import { invoiceNo } from "@/lib/billing";
import { billingEmail, DEFAULT_EMAIL, emailFor, pdfName, routeWords } from "@/lib/invoices";
import type { Db, SendRoute } from "../types";
import { at, workdays } from "./util";

export function fillInvoicing(db: Db, today: string, domain: string, company: string, region: "IE" | "UK") {
  const accounts = db.people.find((x) => x.level === "accounts");
  const who = accounts?.name ?? "Accounts";
  const notAfter = (d: string) => (d > today ? today : d);
  const project = (id: string) => db.projects.find((x) => x.id === id);
  const byCode = (code: string) => db.salesInvoices.find((i) => project(i.projectId)?.code === code && i.status === "Invoiced");

  for (const i of db.salesInvoices) {
    const p = project(i.projectId);
    const c = db.clients.find((x) => x.id === i.clientId);
    // The client's order number came with the accepted quote and is printed on every invoice.
    const po = db.quotes.find((q) => q.id === p?.quoteId)?.poNumber;
    if (po) i.poNumber = po;
    const final = i.description === "Final account";
    const raised = final && p ? notAfter(workdays(p.endDate, 1)) : (i.issuedOn ?? today);
    i.history = [{ at: at(raised, final ? "09:05" : "08:30"), who: "System", what: final ? "Raised when the job was marked complete" : "Raised when the stage was reached" }];
    if (i.status === "Held") i.history.push({ at: at(raised, "09:06"), who: "System", what: `Held: ${i.holdReason ?? "a manager has held it"}` });
    if (!i.issuedOn) continue;

    const via: SendRoute[] = c?.portalEnabled ? ["email", "portal"] : ["email"];
    i.sentAt = at(i.issuedOn, "10:40");
    i.sentTo = billingEmail(c);
    i.sentVia = via;
    i.history.push({ at: i.sentAt, who, what: `Sent to ${c?.name ?? "the client"} ${routeWords(via)}` });
    if (i.exportedAt) i.history.push({ at: i.exportedAt, who, what: "Exported to Sage" });
    if (i.paidOn) i.history.push({ at: at(i.paidOn, "11:15"), who, what: "Marked paid" });

    const email = emailFor(DEFAULT_EMAIL, { invoice: i, number: invoiceNo(i), dueOn: i.dueOn ?? i.issuedOn, client: c, project: p, sender: who, company, region });
    db.mails.push({
      id: `mail-${i.id}`,
      mailbox: `accounts@${domain}`,
      folder: "Sent",
      fromName: who,
      fromAddress: `accounts@${domain}`,
      subject: email.subject,
      body: `To: ${c?.contactName ?? ""} <${i.sentTo}>\n\n${email.body}`,
      receivedAt: i.sentAt,
      read: true,
      intent: "General",
      routedToId: accounts?.id ?? "p-md",
      clientId: i.clientId,
      attachment: pdfName(invoiceNo(i), company),
      salesInvoiceId: i.id,
    });
  }

  // An overdue final account that the client's surveyor is questioning, so it is not being chased.
  const queried = byCode("C713");
  if (queried) {
    const c = db.clients.find((x) => x.id === queried.clientId);
    const raisedAt = at(notAfter(workdays(queried.dueOn ?? today, 3)), "11:20");
    db.invoiceQueries.push({ id: "iq-1", salesInvoiceId: queried.id, raisedAt, via: "Portal", raisedBy: c?.contactName ?? "The client", text: "Before we release payment our surveyor needs the measured breakdown behind the final account figure. Can you send it on?", status: "Open", replies: [] });
    queried.history?.push({ at: raisedAt, who: c?.contactName ?? "The client", what: "Query raised in the portal" });
  }

  // The council's invoice is late for a plain reason, noted for whoever picks it up next.
  const late = byCode("C711");
  if (late) db.invoiceComments.push({ id: "ic-1", salesInvoiceId: late.id, at: at(notAfter(workdays(late.dueOn ?? today, 6)), "15:10"), who, text: "Rang the council. It is approved and waits for their next payment run, which is the last Thursday of the month." });

  // One the client says they have paid, waiting to be matched against the bank.
  const claimed = byCode("C721");
  if (claimed) {
    const c = db.clients.find((x) => x.id === claimed.clientId);
    claimed.clientPaidOn = notAfter(workdays(today, -1));
    claimed.history?.push({ at: at(claimed.clientPaidOn, "16:05"), who: c?.contactName ?? "The client", what: "Client says in the portal that it is paid" });
  }

  // A settled query on a paid job, so the list of queries has a finished one to show.
  const settled = db.salesInvoices.find((i) => project(i.projectId)?.code === "C710" && i.status === "Paid" && i.issuedOn);
  if (settled) {
    const c = db.clients.find((x) => x.id === settled.clientId);
    const asked = at(workdays(settled.issuedOn!, 3), "10:15");
    const answered = at(workdays(settled.issuedOn!, 3), "14:30");
    const closed = at(workdays(settled.issuedOn!, 4), "09:20");
    db.invoiceQueries.push({
      id: "iq-2", salesInvoiceId: settled.id, raisedAt: asked, via: "Phone", raisedBy: c?.contactName ?? "The client",
      text: "Asked whether the scaffold alteration at the gable was in the price or is an extra on this invoice.",
      status: "Settled", replies: [{ at: answered, who, text: "It was in the quoted price, under the access item. Nothing extra is charged for it on this invoice." }],
      outcome: "Explained. The invoice stands as sent.", settledBy: who, settledAt: closed,
    });
    settled.history?.push({ at: asked, who: c?.contactName ?? "The client", what: "Query raised by phone" }, { at: closed, who, what: "Query settled: explained, the invoice stands" });
    settled.history?.sort((a, b) => a.at.localeCompare(b.at));
  }
  for (const i of db.salesInvoices) i.history?.sort((a, b) => a.at.localeCompare(b.at));
}
