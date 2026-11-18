/**
 * Builds the file accounts imports, in the layout each package expects. Pure text in, text
 * out, so the layouts can be tested and a new package is one more function.
 *
 * Each layout is first a table (headings and rows), which the export screen shows as it is,
 * and the file is that same table written out, so what is on screen is what the package gets.
 */
import { r2 } from "./money";

export type ExportRow = { accountRef: string; clientName: string; invoiceNo: string; issuedOn: string; dueOn: string; details: string; net: number; vatPct: number; siteCode: string; /** Sales nominal code. 4000 when not given. */ nominal?: string };
import type { AccountsPackage } from "@/config/brand";

export const PACKAGE_NAME: Record<AccountsPackage, string> = { sage50: "Sage 50", xero: "Xero", sheet: "Spreadsheet" };

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const tax = (r: ExportRow) => r2((r.net * r.vatPct) / 100);

/**
 * Sage tax codes by rate, as Sage 50 sets them up: T1 the standard rate (23% in Ireland, 20% in
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

export type ExportTable = { head: string[]; rows: (string | number)[][]; /** Sage 50 imports with no heading row; the headings are for the screen. */ headInFile: boolean; /** Columns holding money, for right-aligning on screen. */ numeric: number[] };

/** Sage 50 audit trail import: one SI line per invoice, no header row, dates as dd/mm/yyyy. */
const sage50 = (rows: ExportRow[]): ExportTable => ({
  head: ["Type", "Account", "Nominal", "Dept", "Date", "Ref", "Details", "Net", "Tax", "VAT"],
  rows: rows.map((r) => ["SI", r.accountRef, r.nominal ?? "4000", sageDepartment(r.siteCode), dmy(r.issuedOn), r.invoiceNo, r.details, r.net.toFixed(2), sageTaxCode(r.vatPct), tax(r).toFixed(2)]),
  headInFile: false,
  numeric: [7, 9],
});

/** Xero sales invoice import: its own column names, one line per invoice, dates as dd/mm/yyyy. */
const xero = (rows: ExportRow[]): ExportTable => ({
  head: ["*ContactName", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "*Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1"],
  rows: rows.map((r) => [r.clientName, r.invoiceNo, r.siteCode, dmy(r.issuedOn), dmy(r.dueOn), r.details, 1, r.net.toFixed(2), "200", r.vatPct > 0 ? `${r.vatPct}% (VAT on Income)` : "Zero Rated Income", "Project", r.siteCode]),
  headInFile: true,
  numeric: [7],
});

/** A plain sheet anyone can open: readable headings, ISO dates, net, VAT and gross. */
const spreadsheet = (rows: ExportRow[]): ExportTable => ({
  head: ["Invoice", "Issued", "Due", "Client", "Account", "Project", "Details", "Net", "VAT %", "VAT", "Gross"],
  rows: rows.map((r) => [r.invoiceNo, r.issuedOn, r.dueOn, r.clientName, r.accountRef, r.siteCode, r.details, r.net.toFixed(2), r.vatPct, tax(r).toFixed(2), r2(r.net + tax(r)).toFixed(2)]),
  headInFile: true,
  numeric: [7, 8, 9, 10],
});

/** The rows a package will receive, as a table. */
export function exportTable(pkg: AccountsPackage, rows: ExportRow[]): ExportTable {
  return pkg === "sage50" ? sage50(rows) : pkg === "xero" ? xero(rows) : spreadsheet(rows);
}

export function buildExport(pkg: AccountsPackage, rows: ExportRow[]): { fileName: string; text: string } {
  const t = exportTable(pkg, rows);
  const name = pkg === "sheet" ? "spreadsheet" : pkg;
  const stamp = rows.map((r) => r.issuedOn).sort().pop() ?? "none";
  return { fileName: `sales-invoices-${name}-${stamp}.csv`, text: csv(t.headInFile ? [t.head, ...t.rows] : t.rows) };
}

/** Net and VAT of a set of rows, for the line under the table. */
export function exportTotals(rows: ExportRow[]) {
  return { net: r2(rows.reduce((s, r) => s + r.net, 0)), vat: r2(rows.reduce((s, r) => s + tax(r), 0)) };
}
