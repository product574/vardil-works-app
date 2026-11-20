// Rules for the invoices the firm pays, from suppliers and from subcontractors: where one
// stands, who may approve it, what is waiting to be paid, the rows the accounts package gets,
// and the words that tell a client or a subcontractor that an invoice has been paid.
import type { Region } from "@/config/brand";
import type { ApprovalLimit, CostCategoryKey, PayChain, Project, Subcontractor, SupplierInvoice } from "@/data/types";
import { addDays } from "./dates";
import { dFull } from "./format";
import { firstName } from "./invoices";
import { money0, money2, r2 } from "./money";
import { daysBetween } from "./status";
import { PORTAL } from "./apps";

// ── Where an invoice stands ───────────────────────────────────────────────────

/**
 * Not read yet, to be checked by accounts, sent back by whoever was asked to approve it,
 * waiting for approval, approved and waiting to be paid, or paid. A credit note is never paid:
 * once approved it is taken off the job's costs and that is the end of it.
 */
export type PurchaseStage = "unread" | "check" | "back" | "approve" | "pay" | "paid" | "credit";
export const PURCHASE_LABEL: Record<PurchaseStage, string> = { unread: "Not read yet", check: "To check", back: "Sent back", approve: "Waiting for approval", pay: "To be paid", paid: "Paid", credit: "Credit taken" };
export const PURCHASE_TONE: Record<PurchaseStage, "neutral" | "accent" | "ok" | "warn" | "bad"> = { unread: "neutral", check: "warn", back: "bad", approve: "warn", pay: "accent", paid: "ok", credit: "ok" };

type Standing = Pick<SupplierInvoice, "readStatus" | "docType" | "askedAt" | "paidOn" | "sentBack">;

export function purchaseStage(s: Standing): PurchaseStage {
  if (s.readStatus === "not_read") return "unread";
  if (s.readStatus !== "confirmed") return s.askedAt ? "approve" : s.sentBack ? "back" : "check";
  if (s.docType === "credit_note") return "credit";
  return s.paidOn ? "paid" : "pay";
}

export const partyOf = (s: Pick<SupplierInvoice, "party">) => s.party ?? "supplier";
/**
 * Is this one waiting on accounts: to be read, checked, or put right after a supplier's invoice
 * was sent back? A subcontractor's invoice that was sent back waits on the subcontractor.
 */
export function needsAccounts(s: Standing & Pick<SupplierInvoice, "party">) {
  const stage = purchaseStage(s);
  return stage === "unread" || stage === "check" || (stage === "back" && partyOf(s) === "supplier");
}

export const viaWords = (s: Pick<SupplierInvoice, "via">) => (s.via === "portal" ? "through the portal" : s.via === "post" ? "by post" : s.via === "hand" ? "by hand" : "by email");

/** The projects an invoice's lines are charged to. */
export const sitesOf = (s: Pick<SupplierInvoice, "allocations">) => [...new Set(s.allocations.map((a) => a.projectId))];

// ── Who may approve ───────────────────────────────────────────────────────────

/** What the person looking may do, from their access (src/data/access.ts). */
export type Approver = {
  personId: string | null;
  /** "Handle invoices": accounts. */
  handles: boolean;
  /** "Approve invoices of any size": the managing director. */
  approvesAll: boolean;
  /** "Approve subcontractor invoices for the sites they run". */
  approvesOwnSites: boolean;
};

type Site = Pick<Project, "id" | "siteManagerId" | "contractsManagerId">;
/** Someone runs a site when they are its site manager or its contracts manager. */
export const runsSite = (p: Pick<Site, "siteManagerId" | "contractsManagerId">, personId: string | null) => !!personId && (p.siteManagerId === personId || p.contractsManagerId === personId);

// ── The chain (20 Nov) ────────────────────────────────────────────────────────

/** The chain this firm uses. Jimmy's (site manager, then managing director) unless set otherwise. */
export const chainOf = (limits: Pick<ApprovalLimit, "id" | "chain">[]): PayChain => limits.find((x) => x.id === "supplier")?.chain ?? "site-md";

export const CHAIN_WORDS: Record<PayChain, { title: string; steps: string[] }> = {
  "site-md": { title: "Site manager, then managing director", steps: ["The office adds the invoice, checks it against the paper and picks the job", "The site manager of the job approves it: only the site knows the work was done or the goods arrived", "The managing director approves it", "The office pays it and marks it paid"] },
  site: { title: "Site manager only", steps: ["The office adds the invoice, checks it against the paper and picks the job", "The site manager of the job approves it", "The office pays it and marks it paid"] },
  "accounts-limit": { title: "Accounts up to a limit, managing director above", steps: ["Accounts check a supplier's invoice and approve it themselves up to the limit before VAT; above it the managing director approves", "A subcontractor's invoice is approved by whoever runs the site, or the managing director", "The office pays it and marks it paid"] },
};

/** Does this chain start with the site manager of the job? Then sending an invoice on asks him first. */
export const startsOnSite = (chain: PayChain) => chain !== "accounts-limit";

/** Which approval it is waiting for: the site manager's (his step not done yet) or the last one. */
export const approveStep = (s: Pick<SupplierInvoice, "siteStep" | "siteApprovedAt">): "site" | "final" => (s.siteStep && !s.siteApprovedAt ? "site" : "final");

/** The managers of the sites an invoice is charged to. */
const managersOf = (s: Pick<SupplierInvoice, "allocations">, projects: Site[]) => sitesOf(s).map((id) => projects.find((p) => p.id === id));

/**
 * May this person approve this invoice now? And would their yes finish it (approved into job
 * costs) or only do the site manager's step?
 *
 * "accounts-limit" (18 Nov): a supplier's invoice by accounts up to the limit before VAT, above
 * it only someone who may approve any invoice; a subcontractor's by whoever runs the site, or
 * someone who may approve any invoice. Accounts never approve a subcontractor's.
 * "site-md" (Jimmy's, 20 Nov): first the site manager of the job, then the managing director.
 * The managing director may approve at either step, which finishes it.
 * "site": the site manager of the job alone (or the managing director).
 */
export function mayApprove(s: Pick<SupplierInvoice, "party" | "subtotal" | "allocations" | "siteStep" | "siteApprovedAt">, who: Approver, limit: number, projects: Site[], chain: PayChain = "accounts-limit") {
  return approvalBy(s, who, limit, projects, chain) !== null;
}

export function approvalBy(s: Pick<SupplierInvoice, "party" | "subtotal" | "allocations" | "siteStep" | "siteApprovedAt">, who: Approver, limit: number, projects: Site[], chain: PayChain = "accounts-limit"): "finish" | "site" | null {
  if (who.approvesAll) return "finish";
  const runsAll = () => {
    const sites = managersOf(s, projects);
    return sites.length > 0 && sites.every((p) => !!p && runsSite(p, who.personId));
  };
  if (chain === "accounts-limit") {
    if (partyOf(s) === "subcontractor") return who.approvesOwnSites && runsAll() ? "finish" : null;
    return who.handles && s.subtotal <= limit ? "finish" : null;
  }
  // The site manager's own step: anyone who runs every site it is charged to (no money limit on it).
  if (approveStep(s) === "site" && who.approvesOwnSites && runsAll()) return chain === "site" ? "finish" : "site";
  return null;
}

/** Who an invoice is waiting for, in words: "the managing director", "Eoin Brosnan, then the managing director". */
export function approverWords(s: Pick<SupplierInvoice, "party" | "subtotal" | "allocations" | "siteStep" | "siteApprovedAt">, limit: number, projects: Site[], nameOf: (personId: string) => string | undefined, chain: PayChain = "accounts-limit") {
  const managers = [...new Set(managersOf(s, projects).map((p) => p?.siteManagerId).filter((x): x is string => !!x))].map(nameOf).filter((n): n is string => !!n);
  const site = managers.length ? managers.join(" and ") : "the site manager";
  if (chain === "site-md") return approveStep(s) === "site" ? `${site}, then the managing director` : "the managing director";
  if (chain === "site") return approveStep(s) === "site" ? site : "the managing director";
  if (partyOf(s) === "subcontractor") return managers.length ? `${site} or the managing director` : "the managing director";
  return s.subtotal <= limit ? "accounts" : "the managing director";
}

/** The badge's words for an invoice waiting for approval, by step. */
export const approveLabel = (s: Pick<SupplierInvoice, "siteStep" | "siteApprovedAt">) => (approveStep(s) === "site" ? "Site manager to approve" : s.siteApprovedAt ? "Managing director to approve" : "Waiting for approval");

/** Why a supplier's invoice goes where it goes, for the line beside the button. */
export function limitWords(s: Pick<SupplierInvoice, "subtotal">, limit: number, region: Region, chain: PayChain = "accounts-limit") {
  if (chain === "site-md") return "The site manager of the job approves it first, then the managing director. After that it is on To be paid.";
  if (chain === "site") return "The site manager of the job approves it. After that it is on To be paid.";
  return s.subtotal <= limit ? `${money2(s.subtotal, region)} before VAT is within the ${money0(limit, region)} that accounts may approve.` : `${money2(s.subtotal, region)} before VAT is over the ${money0(limit, region)} that accounts may approve, so the managing director approves it.`;
}

// ── Paying ────────────────────────────────────────────────────────────────────

/** When it should be paid by: the date on record, or 30 days from the invoice date. */
export const payBy = (s: Pick<SupplierInvoice, "dueOn" | "invoiceDate">) => s.dueOn ?? addDays(s.invoiceDate, 30);

/** "12 days late", "Due today", "Due in 3 days", for an invoice waiting to be paid. */
export function payWords(s: Pick<SupplierInvoice, "dueOn" | "invoiceDate">, today: string) {
  const late = daysBetween(payBy(s), today);
  if (late > 0) return `${late} ${late === 1 ? "day" : "days"} late`;
  return late === 0 ? "Due today" : `Due in ${-late} ${late === -1 ? "day" : "days"}`;
}

/** What the firm owes on approved invoices, including VAT, and how much of it is past its date. */
export function owedOut(invoices: SupplierInvoice[], today: string) {
  const list = invoices.filter((s) => purchaseStage(s) === "pay");
  const late = list.filter((s) => payBy(s) < today);
  const sum = (l: SupplierInvoice[]) => r2(l.reduce((t, s) => t + s.total, 0));
  return { count: list.length, total: sum(list), lateCount: late.length, lateTotal: sum(late) };
}

/** The next file number: one more than the highest so far. The firm numbers every invoice it files. */
export function nextFileNo(invoices: Pick<SupplierInvoice, "fileNo">[]) {
  return `F-${Math.max(1000, ...invoices.map((s) => Number((s.fileNo ?? "").replace(/\D/g, "")) || 0)) + 1}`;
}

/** Was this date inside the last `days` days? For the "paid" notices at the top of a portal. */
export const recently = (date: string | undefined, today: string, days = 30) => !!date && date <= today && daysBetween(date, today) <= days;

// ── The accounts package ──────────────────────────────────────────────────────

/** A supplier's account reference when none is on file: "Burren Lime and Stone Supplies" is BURLIM. */
export function accountRefOf(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter((w) => w && w !== "AND" && w !== "THE");
  return `${(words[0] ?? "").slice(0, 3)}${(words[1] ?? words[0] ?? "").slice(0, 3)}`;
}

/**
 * Purchase nominal codes by cost heading. 5000 for materials is the code Oldstone's office
 * keys; the rest follow Sage's usual chart. A firm that codes differently changes them here.
 */
export const PURCHASE_NOMINALS: Record<CostCategoryKey, [code: string, what: string]> = {
  material: ["5000", "Materials"],
  plant: ["5010", "Hired plant"],
  equipment: ["5020", "Equipment and small tools"],
  transport: ["5100", "Transport"],
  other: ["5002", "Other site costs"],
  labour: ["6002", "Subcontractors"],
};

/** One line the accounts package takes in for a purchase: an invoice (PI) or a credit note (PC). */
export type PurchaseRow = { type: "PI" | "PC"; account: string; nominal: string; siteCode: string; date: string; ref: string; details: string; net: number; vatPct: number; vat: number; fileNo: string };

/** The VAT rate an invoice was charged at, worked back from its figures. */
export const vatPctOf = (s: Pick<SupplierInvoice, "subtotal" | "vat">) => (s.subtotal ? Math.round((s.vat / s.subtotal) * 1000) / 10 : 0);

/**
 * The rows for one approved invoice: a row for each line, because each line has its own
 * nominal code and its own department (the project). The VAT is shared between the lines in
 * proportion, the last line taking the odd cent, so the rows add up to the invoice exactly.
 */
export function purchaseRows(s: SupplierInvoice, projects: Pick<Project, "id" | "code">[], subcontractors: Pick<Subcontractor, "id" | "accountRef">[]): PurchaseRow[] {
  const account = subcontractors.find((x) => x.id === s.subcontractorId)?.accountRef ?? accountRefOf(s.supplier);
  const vatPct = vatPctOf(s);
  let vatLeft = s.vat;
  return s.allocations.map((a, n) => {
    const vat = n === s.allocations.length - 1 ? r2(vatLeft) : r2(s.subtotal ? (s.vat * a.amount) / s.subtotal : 0);
    vatLeft -= vat;
    return { type: s.docType === "credit_note" ? "PC" : "PI", account, nominal: PURCHASE_NOMINALS[a.category][0], siteCode: projects.find((p) => p.id === a.projectId)?.code ?? "", date: s.invoiceDate, ref: s.invoiceNo, details: a.description, net: a.amount, vatPct, vat, fileNo: s.fileNo ?? "" };
  });
}

// ── Telling people they have been paid ────────────────────────────────────────

/** The receipt a client gets when their payment is marked as received. */
export function receiptEmail(a: { number: string; gross: number; paidOn: string; contactName: string; project: string; sender: string; company: string; region: Region }) {
  return {
    subject: `Payment received: invoice ${a.number}, ${a.project}`,
    body: `Dear ${firstName(a.contactName)},\n\nThank you. We have received your payment of ${money2(a.gross, a.region)} for invoice ${a.number} (${a.project}) on ${dFull(a.paidOn)}. Nothing more is owed on this invoice.${PORTAL ? "\n\nThe invoice is marked as paid in your portal, where you can open it at any time." : ""}\n\nKind regards,\n${a.sender}\n${a.company}`,
  };
}

/** The remittance advice a subcontractor gets when accounts mark their invoice as paid. */
export function remittanceEmail(a: { invoiceNo: string; total: number; paidOn: string; paidRef?: string; contactName: string; project: string; sender: string; company: string; region: Region }) {
  return {
    subject: `Remittance advice: your invoice ${a.invoiceNo}, ${a.project}`,
    body: `Dear ${firstName(a.contactName)},\n\nWe have paid your invoice ${a.invoiceNo} for ${a.project}: ${money2(a.total, a.region)} on ${dFull(a.paidOn)}, by bank transfer${a.paidRef ? `, reference ${a.paidRef}` : ""}.${PORTAL ? "\n\nIt is marked as paid in your portal." : ""}\n\nKind regards,\n${a.sender}\n${a.company}`,
  };
}

/** What a subcontractor reads beside each of their invoices in the portal. */
export function portalStanding(s: Pick<SupplierInvoice, "readStatus" | "docType" | "askedAt" | "paidOn" | "sentBack" | "dueOn" | "invoiceDate">): { label: string; tone: "neutral" | "accent" | "ok" | "warn" | "bad"; detail: string } {
  const stage = purchaseStage(s);
  if (stage === "paid") return { label: "Paid", tone: "ok", detail: `Paid on ${dFull(s.paidOn)}` };
  if (stage === "pay") return { label: "Approved", tone: "accent", detail: `To be paid by ${dFull(payBy(s))}` };
  if (stage === "back") return { label: "Sent back", tone: "bad", detail: s.sentBack?.reason ?? "" };
  return { label: "Received", tone: "neutral", detail: "Waiting for approval" };
}

// ── Adding an invoice by hand (20 Nov, decision 237) ──────────────────────────

/** How an invoice reached the office, for the box that adds one. */
export const ARRIVED: { value: NonNullable<SupplierInvoice["via"]>; label: string }[] = [
  { value: "email", label: "By email" },
  { value: "post", label: "By post" },
  { value: "hand", label: "Handed in" },
];

/** Every firm the office has had an invoice from, and every subcontractor on file: the names offered in the From box. */
export function knownPayees(invoices: Pick<SupplierInvoice, "supplier">[], subcontractors: Pick<Subcontractor, "name">[]) {
  return [...new Set([...subcontractors.map((s) => s.name), ...invoices.map((s) => s.supplier)])].sort((a, b) => a.localeCompare(b));
}

/**
 * What a file's name says about the invoice in it: who it is from (a name already on file), its
 * number and the job. Rules, not a model: a real build reads the invoice itself (REAL BUILD), and
 * whoever adds it checks every box either way.
 */
export function readInvoiceName(fileName: string, payees: string[], codes: string[]): { from?: string; invoiceNo?: string; code?: string } {
  const flat = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const name = flat(fileName.replace(/\.[a-z0-9]{2,4}$/i, ""));
  // The longest name on file found in the file's name; failing that, a firm whose first word is there.
  const whole = [...payees].sort((a, b) => b.length - a.length).find((p) => name.includes(flat(p)));
  const first = whole ?? payees.find((p) => flat(p).split(" ")[0]!.length >= 5 && name.split(" ").includes(flat(p).split(" ")[0]!));
  const code = codes.find((c) => name.split(" ").includes(c.toLowerCase()));
  // Underscores count as spaces, as people name files.
  const raw = fileName.replace(/\.[a-z0-9]{2,4}$/i, "").replace(/_/g, " ");
  // An invoice number: letters and digits joined by hyphens (SBS-7755, CS-INV-9921), or a run of four or more digits.
  const no = raw.match(/\b[A-Za-z]{2,}(?:-[A-Za-z]+)*-\d{2,}\b/)?.[0] ?? raw.match(/\b\d{4,}\b/)?.[0];
  return { ...(first ? { from: first } : {}), ...(no && no.toUpperCase() !== code ? { invoiceNo: no } : {}), ...(code ? { code } : {}) };
}

export type NewPurchase = { from: string; invoiceNo: string; invoiceDate: string; net: number; projectId: string };

/** Why an invoice cannot be added yet, in plain words, or "" when it can. */
export function addPurchaseProblem(f: NewPurchase, today: string, invoices: Pick<SupplierInvoice, "supplier" | "invoiceNo" | "fileNo">[]): string {
  if (!f.from.trim()) return "Say who the invoice is from.";
  if (!f.invoiceNo.trim()) return "Type the invoice number as it is printed on the invoice.";
  const same = invoices.find((s) => s.supplier.trim().toLowerCase() === f.from.trim().toLowerCase() && s.invoiceNo.trim().toLowerCase() === f.invoiceNo.trim().toLowerCase());
  if (same) return `${same.supplier} ${same.invoiceNo} is already on file${same.fileNo ? ` as ${same.fileNo}` : ""}. An invoice is only added once.`;
  if (!f.invoiceDate) return "Give the date on the invoice.";
  if (f.invoiceDate > today) return "The invoice date is after today.";
  if (!(f.net > 0)) return "Type the amount before VAT.";
  if (!f.projectId) return "Choose the job it is for, so it goes to the right site manager.";
  return "";
}
