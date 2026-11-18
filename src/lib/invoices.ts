// Rules for client invoices: the state one is in, how late it is, what is left to bill on a
// job, the email that carries it, and the one document that the screen and the PDF both draw.
import type { Region } from "@/config/brand";
import type { Client, Db, InvoiceLine, InvoiceQuery, Project, SalesInvoice, Variation } from "@/data/types";
import { invoiceNo } from "./billing";
import { gross, money2, r2, REGION } from "./money";
import { daysBetween } from "./status";

// ── Where an invoice stands ───────────────────────────────────────────────────

/** The state shown on screen. Overdue is a sent invoice past its due date. */
export type Stage = "draft" | "held" | "sent" | "overdue" | "paid";
export const STAGE_LABEL: Record<Stage, string> = { draft: "Draft", held: "Held", sent: "Sent", overdue: "Overdue", paid: "Paid" };
export const STAGE_TONE: Record<Stage, "neutral" | "accent" | "ok" | "warn" | "bad"> = { draft: "neutral", held: "warn", sent: "accent", overdue: "bad", paid: "ok" };

export function stageOf(i: Pick<SalesInvoice, "status" | "dueOn">, today: string): Stage {
  if (i.status === "To invoice") return "draft";
  if (i.status === "Held") return "held";
  if (i.status === "Paid") return "paid";
  return i.dueOn && i.dueOn < today ? "overdue" : "sent";
}

/** Days past the due date: negative while it is still to come. */
export const daysLate = (i: Pick<SalesInvoice, "dueOn">, today: string) => (i.dueOn ? daysBetween(i.dueOn, today) : 0);

/** "12 days late", "Due today", "Due in 3 days". */
export function dueWords(i: Pick<SalesInvoice, "dueOn">, today: string) {
  const late = daysLate(i, today);
  if (late > 0) return `${late} ${late === 1 ? "day" : "days"} late`;
  return late === 0 ? "Due today" : `Due in ${-late} ${late === -1 ? "day" : "days"}`;
}

/** The tabs over the list. "unpaid" is everything the client has and has not paid. */
export type Show = "all" | Stage | "unpaid";
export function shows(i: SalesInvoice, show: Show, today: string) {
  const s = stageOf(i, today);
  return show === "all" || s === show || (show === "unpaid" && (s === "sent" || s === "overdue"));
}

export const vatOf = (i: Pick<SalesInvoice, "net" | "vatPct">) => r2((i.net * i.vatPct) / 100);
export const grossOf = (i: Pick<SalesInvoice, "net" | "vatPct">) => gross(i.net, i.vatPct);

export const AGE_BUCKETS = ["Not yet due", "1 to 30 days late", "31 to 60 days late", "Over 60 days late"] as const;
export const ageBucket = (late: number) => (late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3);

/** What clients owe, including VAT, by how late it is. */
export function agedDebt(invoices: SalesInvoice[], today: string) {
  const unpaid = invoices.filter((i) => i.status === "Invoiced");
  const buckets = AGE_BUCKETS.map((label, n) => {
    const list = unpaid.filter((i) => ageBucket(daysLate(i, today)) === n);
    return { label, count: list.length, gross: r2(list.reduce((s, i) => s + grossOf(i), 0)) };
  });
  return { buckets, count: unpaid.length, gross: r2(buckets.reduce((s, b) => s + b.gross, 0)) };
}

/** Does this invoice match what was typed in the search box: its number, client, project or order number. */
export function matches(i: SalesInvoice, text: string, client: Client | undefined, project: Project | undefined) {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return [invoiceNo(i), i.ref, i.description, i.poNumber, client?.name, client?.contactName, project?.code, project?.name].some((v) => v?.toLowerCase().includes(q));
}

// ── Lines and what is left to bill ────────────────────────────────────────────

export const lineTotal = (l: Pick<InvoiceLine, "qty" | "rate">) => r2(l.qty * l.rate);
export const linesNet = (lines: Pick<InvoiceLine, "qty" | "rate">[]) => r2(lines.reduce((s, l) => s + lineTotal(l), 0));

/** The lines as they print. An invoice raised from a stage or a finished job is one line. */
export function printedLines(i: Pick<SalesInvoice, "lines" | "description" | "net">): Pick<InvoiceLine, "description" | "qty" | "unit" | "rate">[] {
  return i.lines?.length ? i.lines : [{ description: i.description, qty: 1, unit: "item", rate: i.net }];
}

/** A final account that has not gone out yet bills whatever is left, so it does not use up the contract. */
const openFinal = (i: SalesInvoice) => i.description === "Final account" && (i.status === "To invoice" || i.status === "Held");

/**
 * How much of a project's contract value is not on an invoice yet, before VAT. A final account
 * still to be sent does not count: it follows whatever else is billed (src/lib/billing.ts).
 * `exceptId` leaves out the invoice being edited.
 */
export function leftToBill(project: Pick<Project, "id" | "value">, invoices: SalesInvoice[], exceptId?: string) {
  const billed = invoices.filter((i) => i.projectId === project.id && i.id !== exceptId && !openFinal(i)).reduce((s, i) => s + i.net, 0);
  return r2((project.value ?? 0) - billed);
}

/** Before VAT: what a project has had invoiced (sent or paid), and what of that has been paid. */
export function billedSoFar(projectId: string, invoices: SalesInvoice[]) {
  const mine = invoices.filter((i) => i.projectId === projectId);
  const sum = (list: SalesInvoice[]) => r2(list.reduce((s, i) => s + i.net, 0));
  return { invoiced: sum(mine.filter((i) => i.status === "Invoiced" || i.status === "Paid")), paid: sum(mine.filter((i) => i.status === "Paid")) };
}

/** The VAT rates a contractor charges, the usual one first. */
export const VAT_RATES: Record<Region, { pct: number; label: string }[]> = {
  IE: [
    { pct: 13.5, label: "13.5%, building work" },
    { pct: 23, label: "23%, standard rate" },
    { pct: 0, label: "0%, no VAT charged" },
  ],
  UK: [
    { pct: 20, label: "20%, standard rate" },
    { pct: 5, label: "5%, reduced rate" },
    { pct: 0, label: "0%, no VAT charged" },
  ],
};

/**
 * The value of work done that is not on an invoice yet, before VAT: the share of the scope
 * ticked off, less everything billed, and never more than is left on the contract. It is the
 * figure a stage payment starts from; whoever drafts it can change it.
 */
export function doneNotBilled(project: Pick<Project, "id" | "value">, percentDone: number, invoices: SalesInvoice[]) {
  const left = leftToBill(project, invoices);
  const earned = ((project.value ?? 0) * percentDone) / 100;
  const billed = (project.value ?? 0) - left;
  return Math.max(0, Math.min(left, Math.round((earned - billed) / 10) * 10));
}

/** A way to start a draft, filled from the project's own records. */
export type DraftStart = { key: string; label: string; description: string; lines: Omit<InvoiceLine, "id">[] };

/** What an invoice on this project is most likely for: the next stage, an extra already agreed, dayworks, or something else. */
export function draftStarts(project: Pick<Project, "id">, invoices: SalesInvoice[], variations: Variation[], stageAmount = 0): DraftStart[] {
  const stage = invoices.filter((i) => i.projectId === project.id && /^stage payment/i.test(i.description)).length + 1;
  const billed = new Set(invoices.filter((i) => i.projectId === project.id).map((i) => i.description));
  const extras = variations.filter((v) => v.projectId === project.id && v.status === "Approved" && !billed.has(`Agreed extra: ${v.measured}`));
  return [
    { key: "stage", label: `Stage payment ${stage}`, description: `Stage payment ${stage}: work to date`, lines: [{ description: `Stage payment ${stage}: work to date`, qty: 1, unit: "item", rate: stageAmount }] },
    ...extras.map((v) => ({ key: v.id, label: `Agreed extra: ${v.measured}`, description: `Agreed extra: ${v.measured}`, lines: [{ description: v.description, qty: 1, unit: "item", rate: v.estimatedValue }] })),
    { key: "dayworks", label: "Dayworks", description: "Dayworks", lines: [{ description: "Dayworks, labour", qty: 8, unit: "hours", rate: 48 }] },
    { key: "blank", label: "Something else", description: "", lines: [{ description: "", qty: 1, unit: "item", rate: 0 }] },
  ];
}

/** The number the next invoice to go out will carry: one more than the highest so far. */
export function nextAccountsNo(invoices: Pick<SalesInvoice, "accountsNo">[]) {
  return `SI-${Math.max(0, ...invoices.map((i) => Number((i.accountsNo ?? "").replace("SI-", "")) || 0)) + 1}`;
}

/** How an invoice went out, in words: "by email and the portal". */
export function routeWords(via: string[] | undefined) {
  const words = (via ?? []).map((v) => (v === "portal" ? "the portal" : v));
  return words.length ? `by ${words.join(" and ")}` : "";
}

/** Sales nominal codes, as the accounts package has them: contract works, and extras agreed on top. */
export const SALES_NOMINALS = [
  ["4000", "Contract works"],
  ["4010", "Agreed extras"],
] as const;
export const salesNominal = (i: Pick<SalesInvoice, "description">) => (/^agreed extra/i.test(i.description) ? "4010" : "4000");

/** One invoice as a row of the accounts export (src/lib/accounts-export.ts). */
export function exportRowOf(i: SalesInvoice, client: Client | undefined, project: Project | undefined) {
  return { accountRef: client?.accountRef ?? "", clientName: client?.name ?? "", invoiceNo: invoiceNo(i), issuedOn: i.issuedOn ?? "", dueOn: i.dueOn ?? i.issuedOn ?? "", details: `${project?.code ?? ""} ${i.description}`.trim(), net: i.net, vatPct: i.vatPct, siteCode: project?.code ?? "", nominal: salesNominal(i) };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export const openQuery = (queries: InvoiceQuery[], invoiceId: string) => queries.find((q) => q.salesInvoiceId === invoiceId && q.status === "Open");

// ── The email that carries an invoice ─────────────────────────────────────────

export type EmailTemplate = { subject: string; body: string };
export const DEFAULT_EMAIL: EmailTemplate = {
  subject: "Invoice {invoice} from {company}, {project}",
  body: "Dear {contact},\n\nPlease find attached invoice {invoice} for {what} at {project}. The total is {total} including VAT, due on {due}.\n\nIf anything on it needs explaining, reply to this email or ask in your client portal and we will come straight back to you.\n\nKind regards,\n{sender}\n{company}",
};
/** The words a template may use, with what each one stands for. */
export const PLACEHOLDERS: [key: string, means: string][] = [
  ["contact", "the client's contact, by first name"],
  ["invoice", "the invoice number"],
  ["project", "the project name"],
  ["what", "what the invoice is for"],
  ["total", "the total including VAT"],
  ["due", "the due date"],
  ["sender", "whoever sends it"],
  ["company", "your firm's name"],
];

/** Swap each {word} for its value. A word that is not a placeholder is left as typed. */
export function fill(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}

/** "Rev. Hilary Stanford" is "Hilary" in a greeting. */
export const firstName = (name: string) => name.replace(/^(Rev\.|Fr\.|Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/)[0] ?? name;

const longDate = (d: string | undefined) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

export function emailFor(template: EmailTemplate, a: { invoice: SalesInvoice; number: string; dueOn: string; client: Client | undefined; project: Project | undefined; sender: string; company: string; region: Region }): EmailTemplate {
  const what = a.invoice.description.charAt(0).toLowerCase() + a.invoice.description.slice(1);
  const values = {
    contact: firstName(a.client?.contactName ?? ""),
    invoice: a.number,
    project: a.project?.name ?? "",
    what,
    total: money2(grossOf(a.invoice), a.region),
    due: longDate(a.dueOn),
    sender: a.sender,
    company: a.company,
  };
  return { subject: fill(template.subject, values), body: fill(template.body, values) };
}

/** Where an invoice is emailed: the client's billing address, or their contact's. */
export const billingEmail = (c: Pick<Client, "billingEmail" | "contactEmail"> | undefined) => c?.billingEmail || c?.contactEmail || "";

// ── The invoice as a document ─────────────────────────────────────────────────

/** How every invoice from the firm looks. Edited on Invoicing, Invoice design; kept with the branding. */
export type InvoiceDesign = {
  /** One line each: street, town, county. */
  address: string;
  phone: string;
  email: string;
  vatNumber: string;
  companyNumber: string;
  bankName: string;
  iban: string;
  bic: string;
  /** Printed under the totals. {terms} is the client's payment days. */
  terms: string;
  footer: string;
  showLogo: boolean;
  showBank: boolean;
  /** The site address and our project code, under the client's own order number. */
  showSite: boolean;
  /** A rule in the brand colour under the heading. */
  rule: boolean;
};

/** Starting values, all invented. Each region has its own address and number formats. */
export function defaultDesign(region: Region, emailDomain: string): InvoiceDesign {
  const uk = region === "UK";
  return {
    address: uk ? "Unit 4, Lakeland Business Park\nKendal\nCumbria LA9 0XX" : "Unit 4, Oranmore Business Park\nOranmore\nCo. Galway H91 XX00",
    phone: uk ? "01539 555 0100" : "091 555 0100",
    email: `accounts@${emailDomain}`,
    vatNumber: uk ? "GB 000 0000 00" : "IE 0000000AB",
    companyNumber: uk ? "00000000" : "000000",
    bankName: "Sample Bank",
    iban: uk ? "GB00 SAMP 0000 0000 0000 00" : "IE00 SAMP 0000 0000 0000 00",
    bic: uk ? "SAMPGB2L" : "SAMPIE2D",
    terms: "Payment within {terms} days of the invoice date by bank transfer, quoting the invoice number.",
    footer: "Thank you for your business.",
    showLogo: true,
    showBank: true,
    showSite: true,
    rule: true,
  };
}

/** Everything printed on one invoice, already in words, so the screen and the PDF cannot differ. */
export type InvoiceDoc = {
  title: string;
  number: string;
  /** PAID, DRAFT or nothing. */
  stamp: "" | "Paid" | "Draft";
  seller: { name: string; address: string[]; contact: string[]; registration: string[] };
  billTo: string[];
  /** Label and value: invoice date, due date, order number, our reference, site. */
  facts: [string, string][];
  lines: { description: string; qty: string; unit: string; rate: string; amount: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  /** Notes typed on the invoice, then the payment terms. */
  notes: string[];
  bank: string[];
  footer: string;
  showLogo: boolean;
  rule: boolean;
};

const qtyText = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));
/** A county as each region writes it. */
const county = (c: string | undefined, region: Region) => (c ? (region === "UK" ? c : `Co. ${c}`) : "");

export function invoiceDoc(a: { invoice: SalesInvoice; client: Client | undefined; project: Project | undefined; design: InvoiceDesign; company: string; region: Region; today: string }): InvoiceDoc {
  const { invoice: i, client, project, design, region } = a;
  const issued = i.status === "Invoiced" || i.status === "Paid";
  const terms = client?.termsDays ?? 30;
  const facts: [string, string][] = [
    ["Invoice date", issued ? longDate(i.issuedOn) : "On sending"],
    ["Due", issued ? longDate(i.dueOn) : `${terms} days from sending`],
  ];
  if (i.poNumber) facts.push(["Your order", i.poNumber]);
  if (design.showSite && project) {
    facts.push(["Our reference", project.code]);
    facts.push(["Site", [project.name, project.location, county(project.county, region)].filter(Boolean).join(", ")]);
  }
  const lines = printedLines(i);
  const vat = vatOf(i);
  return {
    title: "Invoice",
    number: invoiceNo(i),
    stamp: i.status === "Paid" ? "Paid" : issued ? "" : "Draft",
    seller: {
      name: a.company,
      address: design.address.split("\n").map((s) => s.trim()).filter(Boolean),
      contact: [design.phone, design.email].filter(Boolean),
      registration: [design.vatNumber && `${REGION[region].vatLabel} no. ${design.vatNumber}`, design.companyNumber && `Company no. ${design.companyNumber}`].filter((s): s is string => !!s),
    },
    billTo: [client?.name ?? "", client ? `For the attention of ${client.contactName}` : "", ...(client?.address ?? "").split(",").map((s) => s.trim()), county(client?.county, region)].filter(Boolean),
    facts,
    lines: lines.map((l) => ({ description: l.description, qty: qtyText(l.qty), unit: l.unit, rate: money2(l.rate, region), amount: money2(lineTotal(l), region) })),
    totals: [
      { label: "Subtotal", value: money2(i.net, region) },
      { label: `${REGION[region].vatLabel} at ${i.vatPct}%`, value: money2(vat, region) },
      { label: i.status === "Paid" ? "Total paid" : "Total due", value: money2(r2(i.net + vat), region), strong: true },
    ],
    notes: [...(i.notes ?? "").split("\n").map((s) => s.trim()).filter(Boolean), fill(design.terms, { terms: String(terms) })].filter(Boolean),
    bank: design.showBank ? [design.bankName, design.iban && `IBAN ${design.iban}`, design.bic && `BIC ${design.bic}`].filter((s): s is string => !!s) : [],
    footer: design.footer,
    showLogo: design.showLogo,
    rule: design.rule,
  };
}

/** The file name of an invoice's PDF: "SI-10412 ABC Construction.pdf". */
export const pdfName = (number: string, company: string) => `${number} ${company.replace(/[^\w ]+/g, "").trim()}.pdf`;

// ── Emails, comments and queries about one invoice, in the order they happened ─

export type ThreadItem = { at: string; kind: "sent" | "received" | "comment" | "query" | "reply" | "settled"; who: string; title: string; text: string; to?: string };

export function threadFor(db: Pick<Db, "mails" | "invoiceComments" | "invoiceQueries">, invoiceId: string): ThreadItem[] {
  const out: ThreadItem[] = [];
  for (const m of db.mails.filter((x) => x.salesInvoiceId === invoiceId && x.folder !== "Drafts")) {
    const sent = m.folder === "Sent";
    out.push({ at: m.receivedAt, kind: sent ? "sent" : "received", who: m.fromName, title: m.subject, text: m.body, to: `/inbox${sent ? "/sent" : m.folder === "Archive" ? "/archive" : ""}?mail=${m.id}` });
  }
  for (const c of db.invoiceComments.filter((x) => x.salesInvoiceId === invoiceId)) out.push({ at: c.at, kind: "comment", who: c.who, title: "Comment for the office", text: c.text });
  for (const q of db.invoiceQueries.filter((x) => x.salesInvoiceId === invoiceId)) {
    out.push({ at: q.raisedAt, kind: "query", who: q.raisedBy, title: `Query by ${q.via === "Portal" ? "the portal" : q.via.toLowerCase()}`, text: q.text });
    for (const r of q.replies) out.push({ at: r.at, kind: "reply", who: r.who, title: "Reply to the query", text: r.text });
    if (q.status === "Settled" && q.settledAt) out.push({ at: q.settledAt, kind: "settled", who: q.settledBy ?? "", title: "Query settled", text: q.outcome ?? "" });
  }
  return out.sort((x, y) => x.at.localeCompare(y.at));
}
