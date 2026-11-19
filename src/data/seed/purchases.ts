/**
 * The paying side of the sample data (added 18 Nov): the subcontractors on file, a handful
 * of invoices waiting for approval, and where every supplier and subcontractor invoice stands
 * (who approved it, when it is due, whether it has been paid and whether Sage has it).
 *
 * Nothing here is random and nothing changes a job's costs: the invoices already approved
 * keep their figures, and the new ones are all still waiting.
 */
import { addDays } from "@/lib/dates";
import { accountRefOf, partyOf, payBy, remittanceEmail } from "@/lib/purchases";
import { r2 } from "@/lib/money";
import type { CostCategoryKey, Db, Subcontractor, SupplierInvoice } from "../types";
import { at, lastWeekday, workdays } from "./util";

const pid = (code: string) => `pr-${code}`;

/** Up to this, before VAT, accounts approve a supplier's invoice themselves (decision 72). */
export const APPROVAL_LIMIT = 500;

/** The firms working on the live sites under their own names. Several share a site. */
export function seedSubcontractors(): Subcontractor[] {
  const sub = (n: number, name: string, trade: string, contactName: string, mailbox: string, phone: string, codes: string[]): Subcontractor => ({ id: `sub-${n}`, name, trade, contactName, email: `accounts@${mailbox}.example`, phone, accountRef: accountRefOf(name), termsDays: 30, projectIds: codes.map(pid), papers: [], workers: [] });
  return [
    sub(1, "Corrib Scaffolding", "Scaffolding", "Gearóid Flaherty", "corribscaffolding", "091 555 0142", ["C719", "C721"]),
    sub(2, "Kinvara Stone Carvers", "Stone carving", "Fiachra Naughton", "kinvarastone", "091 555 0177", ["C719", "C722"]),
    sub(3, "Lahinch Roofing and Leadwork", "Slating and leadwork", "Orla Considine", "lahinchroofing", "065 555 0119", ["C721"]),
    sub(4, "Curragh Electrical Services", "Electrical", "Brendan Hyland", "curraghelectrical", "045 555 0163", ["C719", "C720", "C722"]),
    sub(5, "Portumna Decorative Plasterwork", "Decorative plasterwork", "Sorcha Killeen", "portumnaplaster", "090 555 0128", ["C720"]),
  ];
}

type Pending = { id: string; from: string; no: string; code: string; sent: number; time: string; lines: [description: string, amount: number, category: CostCategoryKey][]; sub?: boolean; asked?: [daysAgo: number, time: string]; back?: [daysAgo: number, time: string, reason: string] };

/**
 * Invoices that have been checked, or sent in through the portal, and are waiting for someone
 * who may approve them. Two are from suppliers and over the limit, so they wait for the
 * managing director; five are from subcontractors, one of which a site manager has sent back.
 */
export function seedPendingPurchases(today: string, people: Db["people"], projects: Db["projects"], subcontractors: Subcontractor[], vat: { goods: number; work: number }): SupplierInvoice[] {
  const day = (n: number) => workdays(today, n);
  const accounts = people.find((p) => p.level === "accounts")?.name ?? "Accounts";
  const manager = (code: string) => people.find((p) => p.id === projects.find((x) => x.code === code)?.siteManagerId)?.name ?? "The site manager";
  const list: Pending[] = [
    { id: "si-p1", from: "Slieve Bloom Sawmills", no: "SBS-7755", code: "C725", sent: -3, time: "08:15", lines: [["Reclaimed pitch pine joists, 28 m", 1344, "material"], ["Oak bearers, 200 x 200, 6 m", 990, "material"]], asked: [-2, "11:20"] },
    { id: "si-p2", from: "Atlantic Lead and Copper", no: "ALC-6631", code: "C721", sent: -2, time: "08:15", lines: [["Code 5 lead sheet, 4 rolls", 1640, "material"], ["Copper nails and clips, 1 lot", 145, "material"]], asked: [-1, "14:05"] },
    { id: "si-p3", from: "Corrib Scaffolding", no: "CS-INV-9921", code: "C719", sent: -1, time: "16:40", sub: true, lines: [["Scaffold adaptation at the tower, labour and fittings", 1180, "labour"], ["Weekly scaffold inspections and tags, 2 weeks", 100, "labour"]] },
    { id: "si-p4", from: "Lahinch Roofing and Leadwork", no: "LRL-0412", code: "C721", sent: -2, time: "17:05", sub: true, lines: [["Strip and re-slate the north pitch, two weeks", 5200, "labour"], ["Leadwork to the valley and chimney flashings", 1040, "labour"]] },
    { id: "si-p5", from: "Curragh Electrical Services", no: "CES-2231", code: "C722", sent: -1, time: "12:25", sub: true, lines: [["Temporary site electrics, distribution board and leads", 540, "labour"], ["Lightning conductor test and certificate", 350, "labour"]] },
    { id: "si-p6", from: "Portumna Decorative Plasterwork", no: "PDP-118", code: "C720", sent: -3, time: "15:30", sub: true, lines: [["Cornice run in place, drawing room, first stage", 3400, "labour"]] },
    { id: "si-p7", from: "Kinvara Stone Carvers", no: "KSC-325", code: "C722", sent: -4, time: "10:50", sub: true, lines: [["Indent stones carved to template, 9 no.", 2790, "labour"]], back: [-2, "10:15", "Nine stones are invoiced but seven have reached site. Please invoice the seven now, and the other two when they are delivered."] },
  ];
  return list.map((d): SupplierInvoice => {
    const subtotal = r2(d.lines.reduce((s, [, a]) => s + a, 0));
    const vatAmount = r2((subtotal * (d.sub ? vat.work : vat.goods)) / 100);
    const sub = d.sub ? subcontractors.find((x) => x.name === d.from) : undefined;
    // A subcontractor sends theirs in through the portal, where it goes straight to whoever approves it.
    const received = d.sub ? at(day(d.sent), d.time) : at(day(d.sent + 1), d.time);
    return {
      id: d.id,
      supplier: d.from,
      invoiceNo: d.no,
      invoiceDate: day(d.sent),
      docType: "invoice",
      subtotal,
      vat: vatAmount,
      total: r2(subtotal + vatAmount),
      jobRef: d.code,
      fileName: `${d.from} ${d.no}.pdf`,
      receivedAt: received,
      readStatus: "needs_review",
      lines: d.lines.map(([description, amount]) => ({ description, amount })),
      allocations: d.lines.map(([description, amount, category], n) => ({ id: `al-${d.id}-${n + 1}`, projectId: pid(d.code), category, amount, description })),
      ...(sub ? { party: "subcontractor" as const, subcontractorId: sub.id, via: "portal" as const } : {}),
      ...(d.back ? { sentBack: { by: manager(d.code), at: at(day(d.back[0]), d.back[1]), reason: d.back[2] } } : d.sub ? { askedBy: sub?.contactName ?? d.from, askedAt: received } : d.asked ? { askedBy: accounts, askedAt: at(day(d.asked[0]), d.asked[1]) } : {}),
    };
  });
}

/** The first Tuesday of the month after `d`: when a month's invoices go to Sage. */
function exportDay(d: string) {
  const [y, m] = d.split("-").map(Number) as [number, number];
  let out = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  while (new Date(`${out}T12:00:00Z`).getUTCDay() !== 2) out = addDays(out, 1);
  return out;
}

/**
 * Stamps every invoice with what the paying side needs. Each gets the firm's own file number
 * in the order it arrived and a due date 30 days from its own date. An approved one gets who
 * approved it (accounts up to the limit, the managing director above it, the site's manager
 * for a subcontractor), the Friday payment run that paid it once that Friday has come, and the
 * day it went to Sage. The two that fell due most recently are left unpaid, so something is late.
 */
export function fillPurchases(db: Db, today: string, domain: string, company: string, region: "IE" | "UK", workVat: number) {
  const accounts = db.people.find((p) => p.level === "accounts");
  const md = db.people.find((p) => p.level === "md");
  const name = (id: string | undefined) => db.people.find((p) => p.id === id)?.name;
  const subs = new Map(db.subcontractors.map((s) => [s.name, s]));

  [...db.supplierInvoices].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id)).forEach((s, n) => (s.fileNo = `F-${1001 + n}`));

  for (const s of db.supplierInvoices) {
    s.dueOn = addDays(s.invoiceDate, 30);
    const sub = subs.get(s.supplier);
    if (sub && !s.party) {
      // Their invoices came by email until the portal: the work rate of VAT applies to them.
      s.party = "subcontractor";
      s.subcontractorId = sub.id;
      s.vat = r2((s.subtotal * workVat) / 100);
      s.total = r2(s.subtotal + s.vat);
    }
    if (s.readStatus !== "confirmed" || !s.confirmedAt) continue;
    const site = db.projects.find((p) => p.id === s.allocations[0]?.projectId);
    if (partyOf(s) === "subcontractor") s.confirmedBy = name(site?.siteManagerId) ?? md?.name;
    else if (s.subtotal > APPROVAL_LIMIT) s.confirmedBy = md?.name;
    if (s.confirmedBy !== accounts?.name) {
      s.askedBy = accounts?.name;
      s.askedAt = at(s.confirmedAt.slice(0, 10), "09:10");
    }
    const sent = exportDay(s.confirmedAt.slice(0, 10));
    if (sent < today) s.exportedAt = at(sent, "14:25");
  }

  // Accounts pay on Fridays, whatever falls due by then. A credit note is never paid.
  const payable = db.supplierInvoices.filter((s) => s.readStatus === "confirmed" && s.docType === "invoice");
  const late = new Set(payable.filter((s) => payBy(s) < today).sort((a, b) => payBy(b).localeCompare(payBy(a)) || a.id.localeCompare(b.id)).slice(0, 2).map((s) => s.id));
  for (const s of payable) {
    const run = lastWeekday(payBy(s), 5);
    if (late.has(s.id) || run > today || run < (s.confirmedAt ?? "").slice(0, 10)) continue;
    s.paidOn = run;
    s.paidBy = accounts?.name;
    s.paidRef = `Pay run ${run.slice(8, 10)}/${run.slice(5, 7)}`;
    const sub = db.subcontractors.find((x) => x.id === s.subcontractorId);
    // A subcontractor paid in the last month has the remittance advice under Email, Sent.
    if (!sub || addDays(run, 30) < today) continue;
    const site = db.projects.find((p) => p.id === s.allocations[0]?.projectId);
    const email = remittanceEmail({ invoiceNo: s.invoiceNo, total: s.total, paidOn: run, paidRef: s.paidRef, contactName: sub.contactName, project: site ? `${site.code} ${site.name}` : "", sender: accounts?.name ?? "Accounts", company, region });
    db.mails.push({ id: `mail-${s.id}`, mailbox: `accounts@${domain}`, folder: "Sent", fromName: accounts?.name ?? "Accounts", fromAddress: `accounts@${domain}`, subject: email.subject, to: `${sub.contactName} <${sub.email}>`, body: `${email.body}`, receivedAt: at(run, "15:10"), read: true, intent: "General", routedToId: accounts?.id ?? "p-md", purchaseInvoiceId: s.id });
  }
}
