// Cost to date on a project: labour from attendance, everything else from confirmed supplier invoices.
import { r2 } from "./money";
import { type OvertimeRate, overtimeRate } from "./overtime";

export const DAY_HOURS = 8;
export const OVERTIME_RATE = 1.5;

/**
 * Hours paid for one attendance entry: a full or half day, plus its overtime at the rate it was
 * marked at, time and a half unless double time (17 Nov).
 */
export function paidHours(status: "full" | "half", overtimeHours: number, rate?: OvertimeRate) {
  return (status === "full" ? DAY_HOURS : DAY_HOURS / 2) + overtimeHours * overtimeRate({ overtimeRate: rate });
}

export type LabourRow = { status: "full" | "half"; overtimeHours: number; overtimeRate?: OvertimeRate; hourlyRate: number };
export function labourCost(rows: LabourRow[]) {
  return r2(rows.reduce((s, r) => s + paidHours(r.status, r.overtimeHours, r.overtimeRate) * r.hourlyRate, 0));
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
