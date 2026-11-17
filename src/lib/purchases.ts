/**
 * Supplier invoices for the accounts package (Oldstone call, 16 Nov). Majella keys each one into
 * Sage 50 by hand today: the supplier's invoice number, the file number of the paper copy, a
 * nominal code for the kind of cost, the project as the department (686 for C686), and a tax
 * code. These rules fill all of that in from what the invoice reader and the office confirmed,
 * and invoices over the sign-off limit wait for the director before they go.
 *
 * VAT returns, bank reconciliation and payroll stay in Sage (agreed on the call).
 *
 * Pure functions: no React, no store.
 */
import type { AccountsPackage } from "@/config/brand";
import { addDays } from "./dates";

/** Invoices over this (gross) go to the director before they are sent to the accounts package. */
export const SIGN_OFF_OVER = 500;

export type CostHeading = "material" | "plant" | "equipment" | "labour" | "transport" | "other";

/** Nominal codes for each cost heading, in the Sage 50 Ireland default chart (5000 materials, as Oldstone use). */
export const NOMINAL: Record<CostHeading, { code: string; name: string }> = {
  material: { code: "5000", name: "Materials purchased" },
  transport: { code: "5100", name: "Carriage" },
  plant: { code: "5200", name: "Plant hire" },
  equipment: { code: "5201", name: "Small tools and equipment" },
  labour: { code: "5300", name: "Subcontractors" },
  other: { code: "5900", name: "Other direct costs" },
};

/** The project as a Sage department: its site code without the letter. */
export const department = (siteCode: string) => siteCode.replace(/\D/g, "");

/** Sage tax codes in Ireland: T1 standard (23%), T13 reduced (13.5%), T0 zero. */
export function taxCode(vatPct: number) {
  if (vatPct === 0) return "T0";
  if (Math.abs(vatPct - 13.5) < 0.6) return "T13";
  return "T1";
}

/** A supplier account reference the way Sage makes them: the first eight letters of the name. */
export const supplierRef = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 8);

type Inv = { supplier: string; invoiceNo: string; invoiceDate: string; docType: "invoice" | "credit_note"; subtotal: number; vat: number; total: number; fileNo?: number; signOff?: { by: string; at: string }; allocations: { projectId: string; category: string; amount: number; description: string }[] };

export const needsSignOff = (s: Pick<Inv, "total">) => Math.abs(s.total) > SIGN_OFF_OVER;
/** Ready for the accounts package: confirmed to a job, and signed off if over the limit. */
export const readyToExport = (s: Pick<Inv, "total" | "signOff">) => !needsSignOff(s) || !!s.signOff;

export type PurchaseLine = { type: "PI" | "PC"; accountRef: string; supplier: string; nominal: string; dept: string; date: string; dueOn: string; reference: string; details: string; net: number; taxCode: string; tax: number; fileNo: string; siteCode: string };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One line per job and cost heading on the invoice, the VAT shared across them in proportion. */
export function purchaseLines(s: Inv, codeOf: (projectId: string) => string): PurchaseLine[] {
  const pct = s.subtotal ? (s.vat / s.subtotal) * 100 : 0;
  const groups = new Map<string, { projectId: string; category: string; amount: number; description: string }>();
  for (const a of s.allocations) {
    const key = `${a.projectId}|${a.category}`;
    const g = groups.get(key);
    if (g) g.amount = r2(g.amount + a.amount);
    else groups.set(key, { ...a });
  }
  const list = [...groups.values()];
  let taxLeft = Math.abs(s.vat);
  return list.map((g, i) => {
    const net = Math.abs(g.amount);
    const tax = i === list.length - 1 ? r2(taxLeft) : r2((Math.abs(s.vat) * net) / Math.max(0.01, Math.abs(s.subtotal)));
    taxLeft = r2(taxLeft - tax);
    const code = codeOf(g.projectId);
    return {
      type: s.docType === "credit_note" ? "PC" : "PI",
      accountRef: supplierRef(s.supplier),
      supplier: s.supplier,
      nominal: (NOMINAL[g.category as CostHeading] ?? NOMINAL.other).code,
      dept: department(code),
      date: s.invoiceDate,
      dueOn: addDays(s.invoiceDate, 30),
      reference: s.invoiceNo,
      details: `${code} ${g.description}`.slice(0, 60),
      net: r2(net),
      taxCode: taxCode(Math.round(pct * 10) / 10),
      tax,
      fileNo: s.fileNo ? String(s.fileNo) : "",
      siteCode: code,
    };
  });
}

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** The purchase file in each package's layout: Sage 50 audit trail (PI lines, no heading), Xero bills, or a plain sheet. */
export function buildPurchaseExport(pkg: AccountsPackage, lines: PurchaseLine[]): { fileName: string; text: string } {
  const text =
    pkg === "sage50"
      ? csv(lines.map((l) => [l.type, l.accountRef, l.nominal, l.dept, dmy(l.date), l.reference, l.details, l.net.toFixed(2), l.taxCode, l.tax.toFixed(2), "", l.fileNo]))
      : pkg === "xero"
        ? csv([
            ["*ContactName", "*InvoiceNumber", "*InvoiceDate", "*DueDate", "Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "TrackingName1", "TrackingOption1"],
            ...lines.map((l) => [l.supplier, l.reference, dmy(l.date), dmy(l.dueOn), l.details, l.type === "PC" ? -1 : 1, l.net.toFixed(2), l.nominal, l.taxCode === "T0" ? "No VAT" : "VAT on Expenses", "Project", l.siteCode]),
          ])
        : csv([
            ["Type", "Supplier", "Account", "Invoice", "File no", "Date", "Project", "Nominal", "Details", "Net", "Tax code", "VAT", "Gross"],
            ...lines.map((l) => [l.type === "PC" ? "Credit" : "Invoice", l.supplier, l.accountRef, l.reference, l.fileNo, l.date, l.siteCode, l.nominal, l.details, l.net.toFixed(2), l.taxCode, l.tax.toFixed(2), r2(l.net + l.tax).toFixed(2)]),
          ]);
  const name = pkg === "sheet" ? "spreadsheet" : pkg;
  const stamp = lines.map((l) => l.date).sort().pop() ?? "none";
  return { fileName: `purchase-invoices-${name}-${stamp}.csv`, text };
}

/** The profitability report Majella builds by hand in Excel: value of work done, wages, other costs, profit and margin. */
export function profitabilityCsv(rows: { code: string; name: string; contract: number; done: number; labour: number; material: number; plant: number; other: number }[]) {
  const head = ["Project", "Name", "Contract value", "Valuation (work done)", "Wages", "Materials", "Plant and hire", "Subcontract and other", "Total cost", "Profit", "Margin %"];
  return csv([
    head,
    ...rows.map((r) => {
      const cost = r2(r.labour + r.material + r.plant + r.other);
      const profit = r2(r.done - cost);
      return [r.code, r.name, r.contract.toFixed(2), r.done.toFixed(2), r.labour.toFixed(2), r.material.toFixed(2), r.plant.toFixed(2), r.other.toFixed(2), cost.toFixed(2), profit.toFixed(2), r.done ? ((profit / r.done) * 100).toFixed(1) : ""];
    }),
  ]);
}
