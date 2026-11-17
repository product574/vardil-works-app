// Cost to date on a project: labour from attendance, everything else from confirmed supplier invoices.
import { r2 } from "./money";
import { doubleOf } from "./overtime";
import { basicHours } from "./payroll";
import type { DayMark } from "./week";

export const DAY_HOURS = 8;

/**
 * Hours paid for one attendance entry: a full or half day, plus its overtime at each rate, the
 * time and a half hours counting one and a half times and the double time hours twice. A rest
 * day (Saturday, Sunday, bank holiday) has no normal day in it, only the overtime (17 Nov).
 * With the entry's date the normal day follows the 39 hour week the payroll file uses (8 hours,
 * 7 on a Friday), so what a job costs in wages matches the hours sent to payroll.
 */
export function paidHours(a: DayMark & { date?: string }) {
  const base = a.date ? basicHours(a.date, a.status) : a.status === "full" ? DAY_HOURS : a.status === "half" ? DAY_HOURS / 2 : 0;
  return base + a.overtimeHours * 1.5 + doubleOf(a) * 2;
}

export type LabourRow = DayMark & { hourlyRate: number; date?: string };
export function labourCost(rows: LabourRow[]) {
  return r2(rows.reduce((s, r) => s + paidHours(r) * r.hourlyRate, 0));
}

export type SupplierCost = { category: string; amount: number; credit: boolean };
/** Confirmed supplier costs by heading. Credit notes take money back off. */
export function supplierCostByCategory(rows: SupplierCost[]) {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r2((out[r.category] ?? 0) + (r.credit ? -Math.abs(r.amount) : r.amount));
  return out;
}

/** Share of the scope checklist ticked off, as a whole percentage. */
export function scopePercent(tasks: { done: boolean }[]) {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
}
