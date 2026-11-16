// Quote arithmetic: what the client pays, what it costs us, and the margin between.
import { r2 } from "./money";

export type QuoteLine = { id: string; description: string; qty: number; unit: string; rate: number };
export type Costing = {
  labour: { trade: string; hours: number; rate: number }[];
  materials: { item: string; qty: number; unit: string; rate: number }[];
  plant: { item: string; days: number; rate: number }[];
  subcontract: number;
  prelims: number;
};

export const lineValue = (l: Pick<QuoteLine, "qty" | "rate">) => r2(l.qty * l.rate);
export const quoteTotal = (lines: Pick<QuoteLine, "qty" | "rate">[]) => r2(lines.reduce((s, l) => s + l.qty * l.rate, 0));

export function costBreakdown(c: Costing) {
  const labour = r2(c.labour.reduce((s, l) => s + l.hours * l.rate, 0));
  const materials = r2(c.materials.reduce((s, m) => s + m.qty * m.rate, 0));
  const plant = r2(c.plant.reduce((s, p) => s + p.days * p.rate, 0));
  const total = r2(labour + materials + plant + c.subcontract + c.prelims);
  return { labour, materials, plant, subcontract: c.subcontract, prelims: c.prelims, total };
}

/** Margin as a percentage of the selling price. Null when nothing is priced yet. */
export function marginPct(sell: number, cost: number) {
  if (sell <= 0) return null;
  return Math.round(((sell - cost) / sell) * 1000) / 10;
}

/** Thin margins are flagged for a second look before a quote goes out. */
export function marginFlag(m: number | null): "none" | "thin" | "loss" {
  if (m == null) return "none";
  if (m < 0) return "loss";
  if (m < 12) return "thin";
  return "none";
}
