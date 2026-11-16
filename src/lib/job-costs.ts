// Pure rules for invoice reading, allocation and job-cost summaries.
import { historyRange, type HistoryFilter } from "@/lib/controls";

export const CATEGORIES = [
  ["plant", "Plant and hire"],
  ["equipment", "Equipment"],
  ["material", "Materials"],
  ["labour", "Subcontractors"],
  ["transport", "Transport"],
  ["other", "Other"],
] as const;
export type CostCategory = (typeof CATEGORIES)[number][0];
export const categoryLabel = (c: string) => CATEGORIES.find(([k]) => k === c)?.[1] ?? "Other";

export const READ_STATUS: Record<string, string> = {
  not_read: "Not read",
  processing: "Processing",
  needs_review: "Needs review",
  confirmed: "Confirmed",
  failed: "Reading failed",
};

const KEYWORDS: [CostCategory, RegExp][] = [
  ["plant", /\b(hire|hired|excavator|digger|dumper|telehandler|roller|mewp|cherry ?picker|scissor lift|genie|plant|crane|mini ?digger|consaw|breaker|off-?hire)\b/i],
  ["transport", /\b(transport|delivery|haulage|courier|freight|carriage|lorry|collection charge|fuel)\b/i],
  ["labour", /\b(labour|labor|subcontract\w*|operative|fitter|electrician|plumber|man ?hours?|day ?rate|install(ation)?)\b/i],
  ["material", /\b(cement|concrete|timber|block|brick|sand|gravel|stone|pipe|cable|steel|rebar|plaster|board|paint|screws?|bolts?|materials?|supply of|slates?|lime|laths?|putty|battens?|fir|oak|linseed|hair)\b/i],
  ["equipment", /\b(tool|drill|ladder|scaffold\w*|generator|pump|equipment|saw)\b/i],
];

/** Best-guess category from a line description; the user can change it before confirming. */
export function suggestCategory(desc: string): CostCategory {
  for (const [c, re] of KEYWORDS) if (re.test(desc)) return c;
  return "other";
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Credit notes reduce costs. Amounts are stored positive and signed here. */
export const signed = (docType: string | null | undefined, n: number) => (docType === "credit_note" ? -Math.abs(n) : n);

export type Alloc = { site_id: string; category: string; amount_ex_vat: number; vat: number; currency: string; resource_id?: string | null; description?: string | null };

/** Unallocated balance of an invoice's subtotal (ex VAT). Negative means over-allocated. */
export function allocationBalance(subtotal: number | null | undefined, allocs: Pick<Alloc, "amount_ex_vat">[]) {
  const used = allocs.reduce((s, a) => s + (Number(a.amount_ex_vat) || 0), 0);
  return r2((Number(subtotal) || 0) - used);
}

/** Problems a reviewer must see before confirming. */
export function reviewWarnings(inv: {
  supplier?: string | null; invoice_number?: string | null; invoice_date?: string | null;
  subtotal?: number | null; vat?: number | null; amount?: number | null; job_ref?: string | null; currency?: string | null;
  lines?: { amount?: number | null }[];
}, siteCode: string) {
  const w: string[] = [];
  if (!inv.supplier) w.push("Supplier is missing");
  if (!inv.invoice_number) w.push("Invoice number is missing");
  if (!inv.invoice_date) w.push("Invoice date is missing");
  if (inv.subtotal == null) w.push("Subtotal excluding VAT is missing");
  if (inv.vat == null) w.push("VAT amount is missing");
  if (inv.amount == null) w.push("Total including VAT is missing");
  if (!inv.currency) w.push("Currency is missing");
  if (inv.subtotal != null && inv.vat != null && inv.amount != null && Math.abs(r2(inv.subtotal + inv.vat) - inv.amount) > 0.02)
    w.push(`Subtotal + VAT (${r2(inv.subtotal + inv.vat).toFixed(2)}) does not equal total (${Number(inv.amount).toFixed(2)})`);
  const lines = (inv.lines ?? []).filter((l) => l.amount != null);
  if (lines.length && inv.subtotal != null) {
    const s = r2(lines.reduce((a, l) => a + Number(l.amount), 0));
    if (Math.abs(s - inv.subtotal) > 0.02) w.push(`Line amounts add to ${s.toFixed(2)}, not the subtotal ${Number(inv.subtotal).toFixed(2)}`);
  }
  if (!inv.job_ref) w.push("No job reference found on the invoice. Confirm the job");
  else if (!jobRefMatches(inv.job_ref, siteCode)) w.push(`Job reference “${inv.job_ref}” does not match this site (${siteCode})`);
  return w;
}

export const jobRefMatches = (ref: string, code: string) => ref.replace(/\s+/g, "").toUpperCase().includes(code.replace(/\s+/g, "").toUpperCase());

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Other invoices that look like the same document (same file contents, or same supplier + invoice number). */
export function findDuplicates<T extends { id: string; content_hash?: string | null; supplier?: string | null; invoice_number?: string | null }>(doc: T, others: T[]) {
  return others.filter((o) => {
    if (o.id === doc.id) return false;
    if (doc.content_hash && o.content_hash === doc.content_hash) return true;
    return !!norm(doc.invoice_number) && norm(o.invoice_number) === norm(doc.invoice_number) && norm(o.supplier) === norm(doc.supplier);
  });
}

export type CostRow = Alloc & { invoice_date: string | null; doc_type: string | null; confirmed: boolean };

/** Confirmed costs for one site, by invoice date, kept per currency. */
export function summariseCosts(rows: CostRow[], siteId: string, f: HistoryFilter, today?: string) {
  const range = historyRange(f, today);
  const byCur: Record<string, { ex: number; vat: number; byCat: Record<string, number>; byMonth: Record<string, number> }> = {};
  for (const r of rows) {
    if (!r.confirmed || r.site_id !== siteId) continue;
    if (range && (!r.invoice_date || r.invoice_date < range.from || r.invoice_date > range.to)) continue;
    const c = (byCur[r.currency] ??= { ex: 0, vat: 0, byCat: {}, byMonth: {} });
    const ex = signed(r.doc_type, Number(r.amount_ex_vat) || 0);
    const vat = signed(r.doc_type, Number(r.vat) || 0);
    c.ex = r2(c.ex + ex);
    c.vat = r2(c.vat + vat);
    c.byCat[r.category] = r2((c.byCat[r.category] ?? 0) + ex);
    const m = (r.invoice_date ?? "").slice(0, 7) || "No date";
    c.byMonth[m] = r2((c.byMonth[m] ?? 0) + ex);
  }
  return byCur;
}

/** Hire estimate shown separately from invoices; never added to confirmed costs. */
export function hireEstimate(rate: number | null | undefined, unit: string | null | undefined, start: string | null | undefined, end: string | null | undefined, today: string) {
  if (rate == null || !start || !unit) return null;
  const to = end && end < today ? end : today;
  const days = Math.max(0, Math.round((Date.parse(to) - Date.parse(start)) / 86_400_000) + 1);
  const per = unit === "week" ? Math.ceil(days / 7) : unit === "month" ? Math.ceil(days / 30) : days;
  const label = unit === "week" ? "week" : unit === "month" ? "month" : "day";
  return { total: r2(per * rate), basis: `${per} ${label}${per === 1 ? "" : "s"} × ${rate.toFixed(2)} (${start} to ${to})` };
}
