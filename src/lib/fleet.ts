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

// ── The Fleet page (Oisin, 17 Nov, after his own Oldstone fleet tool) ───────────
// Search by registration or model, repair spend over a chosen period, and matching an
// uploaded document to its vehicle by the registration.

type Veh = { id: string; reg: string; model: string };
type Repair = { vehicleId: string; category: string; date: string; amount: number; workDone?: string; garage?: string; garageLocation?: string };

/** A registration as people type it: letters and digits only, so "231 g 4471" finds 231-G-4471. */
const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Vehicles whose registration or model matches what was typed. Every word must match one or the other. */
export function searchVehicles<T extends Veh>(vehicles: T[], q: string): T[] {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return vehicles;
  // The whole of what was typed, as a registration ("231 g 44"), or each word in the model or registration.
  const whole = plain(q);
  return vehicles.filter((v) => (whole.length >= 2 && plain(v.reg).includes(whole)) || words.every((w) => v.model.toLowerCase().includes(w) || plain(v.reg).includes(plain(w) || "~")));
}

/** How far back the repair spend looks, as on the Oldstone tool. */
export const SPEND_PERIODS = [
  { key: "1m", label: "1 month", months: 1, words: "the last month" },
  { key: "3m", label: "3 months", months: 3, words: "the last 3 months" },
  { key: "6m", label: "6 months", months: 6, words: "the last 6 months" },
  { key: "1y", label: "1 year", months: 12, words: "the last 12 months" },
  { key: "2y", label: "2 years", months: 24, words: "the last 2 years" },
  { key: "5y", label: "5 years", months: 60, words: "the last 5 years" },
] as const;
export type SpendPeriod = (typeof SPEND_PERIODS)[number]["key"];

/** The day a number of months before another, keeping to the month's last day where it is shorter. */
export function monthsBefore(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 - months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/**
 * What the fleet cost in repairs since a day (after it, up to today): the total, then each
 * vehicle (dearest first, ones with nothing after) and each garage.
 */
export function repairSpend<T extends Veh & { mileage: number }>(vehicles: T[], docs: Repair[], since: string) {
  const repairs = docs.filter((d) => d.category === "repairs");
  const inPeriod = repairs.filter((d) => d.date > since);
  const sum = (list: Repair[]) => Math.round(list.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const byVehicle = vehicles
    .map((v) => {
      const mine = inPeriod.filter((d) => d.vehicleId === v.id);
      const all = repairs.filter((d) => d.vehicleId === v.id);
      const biggest = [...mine].sort((a, b) => b.amount - a.amount)[0];
      return { vehicle: v, jobs: mine.length, spend: sum(mine), allTime: sum(all), per1000: v.mileage > 0 ? Math.round((sum(all) / v.mileage) * 100000) / 100 : 0, biggest };
    })
    .sort((a, b) => b.spend - a.spend || a.vehicle.reg.localeCompare(b.vehicle.reg));
  const byGarage = [...new Set(inPeriod.map((d) => d.garage ?? "Unknown"))]
    .map((garage) => {
      const mine = inPeriod.filter((d) => (d.garage ?? "Unknown") === garage);
      return { garage, where: regionOf(mine[0]?.garageLocation), jobs: mine.length, spend: sum(mine) };
    })
    .sort((a, b) => b.spend - a.spend || a.garage.localeCompare(b.garage));
  return { total: sum(inPeriod), jobs: inPeriod.length, byVehicle, byGarage };
}

export type FleetFileKind = "repairs" | "tax" | "test" | "insurance";

/**
 * What an uploaded file is and which vehicle it is for, read from its name. A vehicle is matched
 * by its registration, however it is spaced ("Invoice 231 G 4471 brakes.pdf"). In the demo only
 * the name is read; a real build reads the invoice itself and plugs in here.
 */
export function readFleetFile<T extends Veh>(fileName: string, vehicles: T[]): { vehicle?: T; category?: FleetFileKind; why: string } {
  const name = plain(fileName.replace(/\.[a-z0-9]{2,5}$/i, ""));
  // The longest registration first, so 231-G-4471 is not mistaken for 31-G-447.
  const vehicle = [...vehicles].sort((a, b) => plain(b.reg).length - plain(a.reg).length).find((v) => plain(v.reg).length >= 4 && name.includes(plain(v.reg)));
  const lower = fileName.toLowerCase();
  const category: FleetFileKind | undefined = /insur/.test(lower)
    ? "insurance"
    : /cvrt|\bmot\b|\bnct\b|roadworth|test cert/.test(lower)
      ? "test"
      : /motor ?tax|tax disc|\btax\b/.test(lower)
        ? "tax"
        : /invoice|repair|service|garage|tyre|brake|clutch|receipt/.test(lower)
          ? "repairs"
          : undefined;
  const why = vehicle ? `The registration ${vehicle.reg} is in the file's name` : "No registration from the fleet is in the file's name, so pick the vehicle";
  return { ...(vehicle ? { vehicle } : {}), ...(category ? { category } : {}), why };
}

/** The newest driver's check for a vehicle (the walkaround done on the site phone), if there is one. */
export function latestCheck<C extends { vehicleId: string; at: string }>(checks: C[], vehicleId: string): C | undefined {
  return checks.filter((c) => c.vehicleId === vehicleId).sort((a, b) => b.at.localeCompare(a.at))[0];
}
