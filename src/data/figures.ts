// Money figures for one project, worked out from the records. The Job costs screen and Ask AI
// both use this, so the assistant can never give a different margin from the screen.
import { r2 } from "@/lib/money";
import { labourCost, scopePercent, supplierCostByCategory } from "@/lib/project-costs";
import type { Db, Project } from "./types";

export type ProjectCosts = {
  labour: number;
  /** Confirmed supplier costs by heading (plant, equipment, material, labour, transport, other). */
  supplier: Record<string, number>;
  plant: number;
  material: number;
  other: number;
  cost: number;
  /** Share of the scope ticked off. A completed project counts as all done. */
  pct: number;
  earned: number;
  /** Margin so far as a percentage of the value earned, or null before any work is earned. */
  margin: number | null;
  /** Invoiced or paid so far, before VAT. */
  invoiced: number;
  /** Supplier invoices for this project still waiting to be checked, so not counted yet. */
  waiting: number;
};

export function projectCosts(db: Db, p: Project): ProjectCosts {
  const rate = new Map(db.people.map((x) => [x.id, x.hourlyRate]));
  const labour = labourCost(db.attendance.filter((a) => a.projectId === p.id).map((a) => ({ date: a.date, status: a.status, overtimeHours: a.overtimeHours, doubleHours: a.doubleHours, hourlyRate: rate.get(a.personId) ?? 0 })));
  const supplier = supplierCostByCategory(
    db.supplierInvoices.filter((s) => s.readStatus === "confirmed").flatMap((s) => s.allocations.filter((a) => a.projectId === p.id).map((a) => ({ category: a.category, amount: a.amount, credit: s.docType === "credit_note" }))),
  );
  const plant = (supplier.plant ?? 0) + (supplier.equipment ?? 0);
  const material = supplier.material ?? 0;
  const other = (supplier.labour ?? 0) + (supplier.transport ?? 0) + (supplier.other ?? 0);
  const cost = labour + plant + material + other;
  const pct = p.status === "Complete" ? 100 : scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id));
  const earned = ((p.value ?? 0) * pct) / 100;
  const invoiced = db.salesInvoices.filter((i) => i.projectId === p.id && (i.status === "Invoiced" || i.status === "Paid")).reduce((s, i) => s + i.net, 0);
  const waiting = db.supplierInvoices.filter((s) => s.readStatus !== "confirmed" && s.jobRef === p.code).length;
  return { labour, supplier, plant, material, other, cost, pct, earned, margin: earned > 0 ? ((earned - cost) / earned) * 100 : null, invoiced, waiting };
}

/**
 * The checked invoices that came in for a job, as Profitability shows them, under four
 * headings (Oisin, 17 Nov, after round ten): plant and hire (with equipment, as on Job costs),
 * materials, subcontractors, and other (carriage and anything else). Invoices only: plant still
 * on hire and the firm's own plant are not charged until an invoice is checked (his picks).
 * The four add up to everything on Job costs that is not the firm's own labour.
 */
export function jobInvoices(db: Db, p: Project): { plantHire: number; materials: number; subcontractors: number; other: number } {
  const { supplier } = projectCosts(db, p);
  const get = (k: string) => supplier[k] ?? 0;
  return { plantHire: r2(get("plant") + get("equipment")), materials: r2(get("material")), subcontractors: r2(get("labour")), other: r2(get("transport") + get("other")) };
}
