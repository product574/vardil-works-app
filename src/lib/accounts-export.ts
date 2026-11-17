/**
 * Builds the file accounts imports, in the layout each package expects. Pure text in, text
 * out, so the layouts can be tested and a new package is one more function.
 */
import { r2 } from "./money";

export type ExportRow = { accountRef: string; clientName: string; invoiceNo: string; issuedOn: string; dueOn: string; details: string; net: number; vatPct: number; siteCode: string };
import type { AccountsPackage } from "@/config/brand";

export const PACKAGE_NAME: Record<AccountsPackage, string> = { sage50: "Sage 50", xero: "Xero", sheet: "Spreadsheet" };

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const tax = (r: ExportRow) => r2((r.net * r.vatPct) / 100);

/** Sage 50 audit trail import: one SI line per invoice, no header row, dates as dd/mm/yyyy, sales nominal 4000, the project number as the department (686 for C686, as Oldstone keep it). */
const sage50 = (rows: ExportRow[]) => csv(rows.map((r) => ["SI", r.accountRef, "4000", r.siteCode.replace(/\D/g, ""), dmy(r.issuedOn), r.invoiceNo, r.details, r.net.toFixed(2), r.vatPct > 0 ? "T1" : "T0", tax(r).toFixed(2)]));

/** Xero sales invoice import: its own column names, one line per invoice, dates as dd/mm/yyyy. */
const xero = (rows: ExportRow[]) =>
  csv([
    ["*ContactName", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "*Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1"],
    ...rows.map((r) => [r.clientName, r.invoiceNo, r.siteCode, dmy(r.issuedOn), dmy(r.dueOn), r.details, 1, r.net.toFixed(2), "200", r.vatPct > 0 ? `${r.vatPct}% (VAT on Income)` : "Zero Rated Income", "Project", r.siteCode]),
  ]);

/** A plain sheet anyone can open: readable headings, ISO dates, net, VAT and gross. */
const spreadsheet = (rows: ExportRow[]) =>
  csv([
    ["Invoice", "Issued", "Due", "Client", "Account", "Project", "Details", "Net", "VAT %", "VAT", "Gross"],
    ...rows.map((r) => [r.invoiceNo, r.issuedOn, r.dueOn, r.clientName, r.accountRef, r.siteCode, r.details, r.net.toFixed(2), r.vatPct, tax(r).toFixed(2), r2(r.net + tax(r)).toFixed(2)]),
  ]);

export function buildExport(pkg: AccountsPackage, rows: ExportRow[]): { fileName: string; text: string } {
  const text = pkg === "sage50" ? sage50(rows) : pkg === "xero" ? xero(rows) : spreadsheet(rows);
  const name = pkg === "sheet" ? "spreadsheet" : pkg;
  const stamp = rows.map((r) => r.issuedOn).sort().pop() ?? "none";
  return { fileName: `sales-invoices-${name}-${stamp}.csv`, text };
}
