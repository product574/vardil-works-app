/**
 * Builds the files Sage imports: the sales day book (client invoices) and the purchase day
 * book (supplier and subcontractor invoices). Pure text in, text out, so the layout can be
 * tested.
 *
 * Each is first a table (headings and rows), which the export screen shows as it is, and the
 * file is that same table written out, so what is on screen is what Sage gets. Sage keeps the
 * VAT return, payroll and the bank: nothing here touches them.
 */
import { r2 } from "./money";
import type { PurchaseRow } from "./purchases";

/** The accounts package. One name, used wherever a screen says where invoices go. */
export const PACKAGE = "Sage";

export type ExportRow = { accountRef: string; clientName: string; invoiceNo: string; issuedOn: string; dueOn: string; details: string; net: number; vatPct: number; siteCode: string; /** Sales nominal code. 4000 when not given. */ nominal?: string };

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const tax = (r: Pick<ExportRow, "net" | "vatPct">) => r2((r.net * r.vatPct) / 100);
const newest = (dates: string[]) => [...dates].sort().pop() ?? "none";

/**
 * Sage tax codes by rate, as Sage sets them up: T1 the standard rate (23% in Ireland, 20% in
 * the UK), T3 Ireland's 13.5% for building work, T5 the UK's 5%, T0 zero. A firm that has
 * changed its codes in Sage changes them here.
 */
export function sageTaxCode(vatPct: number) {
  if (vatPct === 0) return "T0";
  if (vatPct === 13.5) return "T3";
  if (vatPct === 5) return "T5";
  return "T1";
}

/** Sage calls a project a department and numbers it: site C720 is department 720. */
export const sageDepartment = (siteCode: string) => siteCode.replace(/\D/g, "");

/** The file has no heading row: Sage's import takes the columns in this order. The headings are for the screen. */
export type ExportTable = { head: string[]; rows: (string | number)[][]; /** Columns holding money, for right-aligning on screen. */ numeric: number[] };

const HEAD = ["Type", "Account", "Nominal", "Dept", "Date", "Ref", "Details", "Net", "Tax", "VAT"];

/** Sales day book: one SI line per client invoice, dates as dd/mm/yyyy. */
export const salesTable = (rows: ExportRow[]): ExportTable => ({
  head: HEAD,
  rows: rows.map((r) => ["SI", r.accountRef, r.nominal ?? "4000", sageDepartment(r.siteCode), dmy(r.issuedOn), r.invoiceNo, r.details, r.net.toFixed(2), sageTaxCode(r.vatPct), tax(r).toFixed(2)]),
  numeric: [7, 9],
});

/**
 * Purchase day book: a PI line (PC for a credit note) for each line of each invoice, since
 * each carries its own nominal code and department. Ref is the supplier's own invoice number
 * and Ex ref the firm's file number, as the office keys them.
 */
export const purchaseTable = (rows: PurchaseRow[]): ExportTable => ({
  head: [...HEAD, "Ex ref"],
  rows: rows.map((r) => [r.type, r.account, r.nominal, sageDepartment(r.siteCode), dmy(r.date), r.ref, r.details, r.net.toFixed(2), sageTaxCode(r.vatPct), r.vat.toFixed(2), r.fileNo]),
  numeric: [7, 9],
});

export function buildSalesExport(rows: ExportRow[]): { fileName: string; text: string } {
  return { fileName: `sales-invoices-sage-${newest(rows.map((r) => r.issuedOn))}.csv`, text: csv(salesTable(rows).rows) };
}

export function buildPurchaseExport(rows: PurchaseRow[]): { fileName: string; text: string } {
  return { fileName: `purchase-invoices-sage-${newest(rows.map((r) => r.date))}.csv`, text: csv(purchaseTable(rows).rows) };
}

/** Net and VAT of a set of sales rows, for the line under the table. */
export function exportTotals(rows: ExportRow[]) {
  return { net: r2(rows.reduce((s, r) => s + r.net, 0)), vat: r2(rows.reduce((s, r) => s + tax(r), 0)) };
}

/** Net and VAT of a set of purchase rows. A credit note counts against the total. */
export function purchaseTotals(rows: PurchaseRow[]) {
  const sign = (r: PurchaseRow) => (r.type === "PC" ? -1 : 1);
  return { net: r2(rows.reduce((s, r) => s + sign(r) * r.net, 0)), vat: r2(rows.reduce((s, r) => s + sign(r) * r.vat, 0)) };
}
