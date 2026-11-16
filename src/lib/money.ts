import type { Region } from "@/config/brand";

export const REGION = {
  IE: { currency: "EUR", locale: "en-IE", vatPct: 13.5, vatLabel: "VAT", vehicleTest: "CVRT", roadTax: "Motor tax", safetyCard: "Safe Pass" },
  UK: { currency: "GBP", locale: "en-GB", vatPct: 20, vatLabel: "VAT", vehicleTest: "MOT", roadTax: "Road tax", safetyCard: "CSCS card" },
} as const satisfies Record<Region, unknown>;

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Whole-unit money for dashboards and tables: €12,400. */
export function money0(n: number | null | undefined, region: Region = "IE") {
  if (n == null) return "-";
  const r = REGION[region];
  return new Intl.NumberFormat(r.locale, { style: "currency", currency: r.currency, maximumFractionDigits: 0 }).format(n);
}

/** Exact money for documents and invoices: €12,400.50. */
export function money2(n: number | null | undefined, region: Region = "IE") {
  if (n == null) return "-";
  const r = REGION[region];
  return new Intl.NumberFormat(r.locale, { style: "currency", currency: r.currency }).format(n);
}

export const pct1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

export function gross(net: number, vatPct: number) {
  return r2(net * (1 + vatPct / 100));
}
