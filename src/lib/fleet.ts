import type { Driver, LicenceKey } from "@/data/types";
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

// ── Reading an uploaded file's name (Oisin, 17 Nov; kept on 18 Nov) ─────────────
// Where the AI cannot read a document, its name still says which vehicle and what kind it is.

type Veh = { id: string; reg: string; model: string };

/** A registration as people type it: letters and digits only, so "231 g 4471" finds 231-G-4471. */
const plain = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

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

// ── Drivers (18 Nov) ───────────────────────────────────────────────────────────

/**
 * Fleet's drivers, worked out from People: everyone who is on the driver list or has been
 * (`drives`, `drivesUntil`), with their licences. A driver's base is the base of the vehicle
 * they drive. "Left" (not active) means taken off the driver list, or gone from the firm.
 */
export function driversOf<
  P extends { id: string; name: string; phone: string; email: string; trade: string; active: boolean; archivedAt?: string; drives?: boolean; drivesUntil?: string; licences?: Driver["licences"] },
  V extends { driverId: string | null; baseId: string | null; active: boolean },
>(people: P[], vehicles: V[]): Driver[] {
  return people
    .filter((p) => p.drives || p.drivesUntil)
    .map((p) => {
      const active = !!p.drives && p.active;
      const leftAt = active ? undefined : (p.drivesUntil ?? p.archivedAt);
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        trade: p.trade,
        baseId: vehicles.find((v) => v.active && v.driverId === p.id)?.baseId ?? null,
        active,
        ...(leftAt ? { leftAt } : {}),
        ...(p.licences ? { licences: p.licences } : {}),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The licences a driver carries, and what each is called. */
export const LICENCE_NAME: Record<LicenceKey, string> = { driving: "Driving licence", cpc: "Driver CPC" };
