/**
 * Carrying out a draft Ask AI asked for, in the page.
 *
 * The model only asks; this code checks the request against the records and, if it makes
 * sense, calls one function in src/data/actions.ts, which creates a Pending approval. Nothing
 * is ever sent or changed beyond that: a person approves it in Approvals. What it returns goes
 * back to the model as the tool's result, and to the panel as a card.
 */
import { actorName, draftEmailApproval, draftQuoteFromEnquiry, draftReplyForMail } from "@/data/actions";
import { getDb, getDay } from "@/data/store";
import { invoiceNo } from "@/lib/billing";
import { costBreakdown, marginPct, quoteTotal } from "@/lib/quotes";
import { daysBetween } from "@/lib/status";
import type { AskToolName } from "./tools";

export type DraftCard = { approvalId: string; label: string; title: string; to?: string; excerpt?: string };
export type ToolOutcome = { ok: boolean; text: string; card?: DraftCard };

const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const excerpt = (body: string) => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 220 ? `${flat.slice(0, 220)}...` : flat;
};
const where = (id: string) => `/dashboard?open=${id}`;
const no = (text: string): ToolOutcome => ({ ok: false, text: `Not drafted: ${text}` });

export function runTool(name: AskToolName | string, input: Record<string, unknown>): ToolOutcome {
  const db = getDb();
  const day = getDay();
  const why = `Drafted for you by Ask AI, at ${actorName(db)}'s request.`;

  if (name === "draft_chaser") {
    const ref = str(input.ref).toUpperCase();
    const subject = str(input.subject);
    const body = str(input.body);
    if (!subject || !body) return no("the email needs a subject and some text.");
    // Either number finds it: the one the client has (SI-) or our own (INV-).
    const inv = db.salesInvoices.find((i) => invoiceNo(i).toUpperCase() === ref || i.ref.toUpperCase() === ref);
    if (inv) {
      const no_ = invoiceNo(inv);
      if (inv.status !== "Invoiced") return no(`${no_} is ${inv.status === "Paid" ? "already paid" : "not issued yet"}, so there is nothing to chase.`);
      const c = db.clients.find((x) => x.id === inv.clientId);
      const p = db.projects.find((x) => x.id === inv.projectId);
      if (!c) return no(`the client for ${no_} is missing.`);
      const late = inv.dueOn ? daysBetween(inv.dueOn, day) : 0;
      const id = draftEmailApproval({
        kind: "chaser",
        title: `Chaser: ${no_}, ${p?.name ?? ""} ${inv.description.toLowerCase()}`.trim(),
        rationale: `${why} ${late > 0 ? `The invoice is ${late} days past its due date.` : "The invoice is not yet past its due date."}`,
        to: { name: c.contactName, address: c.contactEmail },
        subject,
        body,
        projectId: inv.projectId,
        salesInvoiceId: inv.id,
      });
      return { ok: true, text: `Drafted and waiting in Approvals at ${where(id)}: a chaser for ${no_} to ${c.contactName} <${c.contactEmail}>, ${c.name}.`, card: { approvalId: id, label: "Chaser", title: `Chaser: ${no_}, ${p?.name ?? c.name}`, to: `${c.contactName}, ${c.name}`, excerpt: excerpt(body) } };
    }
    const q = db.quotes.find((x) => x.ref.toUpperCase() === ref);
    if (q) {
      if (q.status !== "Sent" && q.status !== "Opened") return no(`${q.ref} is ${q.status.toLowerCase()}, and only a sent or opened quote with no answer can be chased.`);
      const c = db.clients.find((x) => x.id === q.clientId);
      if (!c) return no(`the client for ${q.ref} is missing.`);
      const id = draftEmailApproval({
        kind: "chaser",
        title: `Chaser: ${q.ref}, ${q.title}`,
        rationale: `${why} The quote was sent ${q.sentAt ? `${daysBetween(q.sentAt.slice(0, 10), day)} days ago` : "earlier"} and has had no answer.`,
        to: { name: c.contactName, address: c.contactEmail },
        subject,
        body,
        quoteId: q.id,
      });
      return { ok: true, text: `Drafted and waiting in Approvals at ${where(id)}: a chaser for quote ${q.ref} to ${c.contactName} <${c.contactEmail}>, ${c.name}.`, card: { approvalId: id, label: "Chaser", title: `Chaser: ${q.ref}, ${q.title}`, to: `${c.contactName}, ${c.name}`, excerpt: excerpt(body) } };
    }
    return no(`there is no invoice or quote with the reference ${ref || "given"}.`);
  }

  if (name === "draft_reply") {
    const m = db.mails.find((x) => x.id === str(input.mail_id));
    const subject = str(input.subject);
    const body = str(input.body);
    if (!m) return no(`there is no email with the id ${str(input.mail_id) || "given"}.`);
    if (m.folder === "Sent") return no("that email is one the firm sent, so there is nothing to reply to.");
    if (!subject || !body) return no("the reply needs a subject and some text.");
    const id = draftReplyForMail(m.id, subject, body, why);
    if (!id) return no("the email could not be found.");
    return { ok: true, text: `Drafted and waiting in Approvals at ${where(id)}: a reply to ${m.fromName} <${m.fromAddress}> about "${m.subject}". It replaces any reply drafted before.`, card: { approvalId: id, label: "Reply", title: `Reply to ${m.fromName}: ${m.subject}`, to: `${m.fromName}, ${m.fromAddress}`, excerpt: excerpt(body) } };
  }

  if (name === "draft_client_update") {
    const code = str(input.project_code).toUpperCase();
    const p = db.projects.find((x) => x.code.toUpperCase() === code);
    const subject = str(input.subject);
    const body = str(input.body);
    if (!p) return no(`there is no project with the code ${code || "given"}.`);
    if (!subject || !body) return no("the email needs a subject and some text.");
    const c = db.clients.find((x) => x.id === p.clientId);
    if (!c) return no(`the client for ${p.code} is missing.`);
    const id = draftEmailApproval({ kind: "client_update", title: `Client update: ${p.code} ${p.name}`, rationale: why, to: { name: c.contactName, address: c.contactEmail }, subject, body, projectId: p.id });
    return { ok: true, text: `Drafted and waiting in Approvals at ${where(id)}: a progress update on ${p.code} ${p.name} to ${c.contactName} <${c.contactEmail}>, ${c.name}.`, card: { approvalId: id, label: "Client update", title: `${p.code} ${p.name}`, to: `${c.contactName}, ${c.name}`, excerpt: excerpt(body) } };
  }

  if (name === "draft_quote_from_enquiry") {
    const ref = str(input.enquiry_ref).toUpperCase();
    const e = db.enquiries.find((x) => x.ref.toUpperCase() === ref);
    if (!e) return no(`there is no enquiry with the reference ${ref || "given"}.`);
    if (e.quoteId) return no(`${e.ref} already has quote ${db.quotes.find((q) => q.id === e.quoteId)?.ref ?? ""}.`);
    if (e.status !== "Logged") return no(`${e.ref} is marked ${e.status.toLowerCase()}, so it is not waiting for a quote.`);
    const qref = draftQuoteFromEnquiry(e.id);
    const after = getDb();
    const q = after.quotes.find((x) => x.ref === qref);
    const ap = after.approvals.find((a) => a.kind === "quote" && a.quoteId === q?.id && a.status === "Pending");
    if (!q || !ap) return no("the quote could not be drafted.");
    const sell = quoteTotal(q.lines);
    const m = marginPct(sell, costBreakdown(q.costing).total);
    return {
      ok: true,
      text: `Drafted and waiting in Approvals at ${where(ap.id)}: quote ${q.ref}, "${q.title}", priced from the rate books at ${sell.toFixed(2)} before VAT with an estimated margin of ${m ?? 0}%. It can be checked line by line at /sales/quotes/${q.ref}.`,
      card: { approvalId: ap.id, label: "Quote", title: `Quote ${q.ref}: ${e.location}`, to: e.contactName, excerpt: `${q.lines.length} priced items from the rate books for this kind of work.` },
    };
  }

  return no(`there is no tool called ${name}.`);
}
