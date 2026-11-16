// Pure fleet rules, carried over from the Oldstone build.

export const normaliseReg = (r: string) => r.trim().toUpperCase().replace(/\s+/g, "-");

/** County or region is the last comma-separated part of a garage location. */
export const regionOf = (loc: string | null | undefined) => {
  if (!loc) return "Unknown";
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || "Unknown";
};

/** Sell amount when removing a vehicle: required, "NA" means it was not sold. */
export function parseSellAmount(input: string): { ok: true; value: number | null } | { ok: false } {
  const s = input.trim();
  if (s === "") return { ok: false };
  if (/^n\/?a$/i.test(s)) return { ok: true, value: null };
  const n = Number(s.replace(/[€£,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}
