/**
 * Fleet rules (18 Nov, brought across from the Secure-All build): repair spend by period,
 * vehicle, base, garage, driver, site and category; the warnings on invoices (a number entered
 * twice, a vehicle repaired again inside 30 days); and what is due for motor tax, the CVRT (MOT in
 * the UK) and insurance.
 *
 * Pure functions: no React, no store. Screens are in src/modules/fleet/.
 */
import type { ID, InvoiceLine, RepairCategory, RepairInvoice, Vehicle } from "@/data/types";
import { addDays } from "./dates";
import { r2, REGION } from "./money";
import { daysBetween, type DueState, dueState } from "./status";

/** The periods on the overview: 1 month to 5 years, as on ABC's own Fleet before (Oisin's pick). */
export type Period = "1m" | "3m" | "6m" | "1y" | "2y" | "5y";
export const PERIODS: { value: Period; label: string; months: number }[] = [
  { value: "1m", label: "1 month", months: 1 },
  { value: "3m", label: "3 months", months: 3 },
  { value: "6m", label: "6 months", months: 6 },
  { value: "1y", label: "1 year", months: 12 },
  { value: "2y", label: "2 years", months: 24 },
  { value: "5y", label: "5 years", months: 60 },
];

/** The first day inside a period ending today. */
export function periodStart(period: Period, today: string): string {
  const months = PERIODS.find((p) => p.value === period)!.months;
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const back = new Date(Date.UTC(y, m - 1 - months, d));
  return addDays(back.toISOString().slice(0, 10), 1);
}

/** One vehicle's share of one invoice, with the invoice's date and garage beside it. */
export type SpendLine = InvoiceLine & { invoiceId: ID; invoiceNo: string; garageId: ID; date: string; status: RepairInvoice["status"] };

export function spendLines(invoices: RepairInvoice[]): SpendLine[] {
  return invoices.flatMap((inv) => inv.lines.map((l) => ({ ...l, invoiceId: inv.id, invoiceNo: inv.invoiceNo, garageId: inv.garageId, date: inv.date, status: inv.status })));
}

export type SpendFilter = { from?: string; to?: string; baseId?: ID | null; garageId?: ID | null; driverId?: ID | null; siteId?: ID | null; category?: RepairCategory | null; vehicleId?: ID | null };

export function filterLines(lines: SpendLine[], f: SpendFilter): SpendLine[] {
  return lines.filter(
    (l) =>
      (!f.from || l.date >= f.from) &&
      (!f.to || l.date <= f.to) &&
      (!f.baseId || l.baseId === f.baseId) &&
      (!f.garageId || l.garageId === f.garageId) &&
      (!f.driverId || l.driverId === f.driverId) &&
      (!f.siteId || l.siteId === f.siteId) &&
      (!f.category || l.category === f.category) &&
      (!f.vehicleId || l.vehicleId === f.vehicleId),
  );
}

export const totalOf = (lines: { amount: number }[]) => r2(lines.reduce((t, l) => t + l.amount, 0));
/** The sum of whole invoices. */
export const sumInvoices = (invoices: RepairInvoice[]) => r2(invoices.reduce((t, i) => t + i.total, 0));
export const invoiceCount = (lines: SpendLine[]) => new Set(lines.map((l) => l.invoiceId)).size;

/** Spend grouped by a key, largest first. Lines with no key (no base, no driver) are grouped under null. */
export function groupSpend(lines: SpendLine[], key: (l: SpendLine) => ID | null): { key: ID | null; total: number; lines: number; invoices: number; vehicles: number }[] {
  const map = new Map<ID | null, SpendLine[]>();
  for (const l of lines) {
    const k = key(l);
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  return [...map.entries()]
    .map(([k, ls]) => ({ key: k, total: totalOf(ls), lines: ls.length, invoices: invoiceCount(ls), vehicles: new Set(ls.map((l) => l.vehicleId)).size }))
    .sort((a, b) => b.total - a.total);
}

/** The last `months` calendar months up to and including this one, with the spend in each. */
export function byMonth(lines: SpendLine[], today: string, months: number): { month: string; total: number; vehicles: number }[] {
  const [y, m] = today.split("-").map(Number) as [number, number];
  const out: { month: string; total: number; vehicles: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = d.toISOString().slice(0, 7);
    const ls = lines.filter((l) => l.date.startsWith(key));
    out.push({ month: key, total: totalOf(ls), vehicles: new Set(ls.map((l) => l.vehicleId)).size });
  }
  return out;
}

/** Months shown on the chart for a period: at least 6 bars, at most 24, so it stays readable. */
export const chartMonths = (period: Period) => Math.min(24, Math.max(6, PERIODS.find((p) => p.value === period)!.months));

// ── Warnings ──────────────────────────────────────────────────────────────────

export type InvoiceWarning =
  | { kind: "duplicate"; invoiceIds: ID[]; invoiceNo: string; garageId: ID }
  | { kind: "repeat"; invoiceIds: ID[]; vehicleId: ID; days: number; first: string; second: string };

/** An invoice number as typed, without spaces, dashes or case, so "CM-100" and "cm 100" are the same. */
const normNo = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

/** Invoices sharing a garage and number. Each group is one warning. */
export function duplicateGroups(invoices: RepairInvoice[]): RepairInvoice[][] {
  const map = new Map<string, RepairInvoice[]>();
  for (const inv of invoices) {
    if (!inv.invoiceNo.trim()) continue;
    const k = `${inv.garageId}|${normNo(inv.invoiceNo)}`;
    map.set(k, [...(map.get(k) ?? []), inv]);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

/** The window for a repeat repair, and how far back a repeat is still worth flagging. */
export const REPEAT_DAYS = 30;
const REPEAT_SHOWN_FOR = 60;

/**
 * Both kinds of warning. A repeat repair is the same vehicle on two different invoices no more
 * than 30 days apart, the later one in the last 60 days. Copies of one duplicated invoice do not
 * count as a repeat of each other.
 */
export function invoiceWarnings(invoices: RepairInvoice[], today: string): InvoiceWarning[] {
  const dups = duplicateGroups(invoices);
  const out: InvoiceWarning[] = dups.map((g) => ({ kind: "duplicate", invoiceIds: g.map((i) => i.id), invoiceNo: g[0]!.invoiceNo, garageId: g[0]!.garageId }));
  const dupOf = new Map<ID, string>();
  dups.forEach((g, i) => g.forEach((inv) => dupOf.set(inv.id, `d${i}`)));
  const byVehicle = new Map<ID, { inv: RepairInvoice; date: string }[]>();
  for (const inv of invoices) for (const l of inv.lines) byVehicle.set(l.vehicleId, [...(byVehicle.get(l.vehicleId) ?? []), { inv, date: inv.date }]);
  const since = addDays(today, -REPEAT_SHOWN_FOR);
  for (const [vehicleId, list] of byVehicle) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = sorted.length - 1; i > 0; i--) {
      const b = sorted[i]!;
      if (b.date < since) break;
      const a = [...sorted.slice(0, i)].reverse().find((x) => x.inv.id !== b.inv.id && (dupOf.get(x.inv.id) ?? x.inv.id) !== (dupOf.get(b.inv.id) ?? b.inv.id));
      if (!a) continue;
      const days = daysBetween(a.date, b.date);
      if (days <= REPEAT_DAYS) {
        out.push({ kind: "repeat", invoiceIds: [a.inv.id, b.inv.id], vehicleId, days, first: a.date, second: b.date });
        break;
      }
    }
  }
  return out;
}

/** Warnings that touch one invoice, for its row and its detail. */
export const warningsFor = (all: InvoiceWarning[], invoiceId: ID) => all.filter((w) => w.invoiceIds.includes(invoiceId));

// ── Tax, CVRT, NCT and insurance ──────────────────────────────────────────────

/** Commercial vehicles take the CVRT in Ireland (the MOT in the UK); a car takes the NCT there. */
export const testName = (kind: Vehicle["kind"], region: "IE" | "UK" = "IE") => (region === "UK" ? REGION.UK.vehicleTest : kind === "Car" ? "NCT" : REGION.IE.vehicleTest);

export type ComplianceKey = "tax" | "test" | "insurance";
export const COMPLIANCE_LABEL: Record<ComplianceKey, string> = { tax: "Motor tax", test: "Test", insurance: "Insurance" };

export type DueItem = { vehicle: Vehicle; item: ComplianceKey; label: string; expiry: string; state: DueState; days: number };

/** Every expiry date on a vehicle still on the fleet, soonest first. Items with no date yet are left out. */
export function complianceDue(vehicles: Vehicle[], today: string, region: "IE" | "UK" = "IE"): DueItem[] {
  return vehicles
    .filter((v) => v.active)
    .flatMap((v) =>
      (["tax", "test", "insurance"] as const)
        .filter((k) => !!v.compliance[k].expiryDate)
        .map((k) => ({ vehicle: v, item: k, label: k === "test" ? testName(v.kind, region) : k === "tax" ? REGION[region].roadTax : COMPLIANCE_LABEL[k], expiry: v.compliance[k].expiryDate, state: dueState(v.compliance[k].expiryDate, today), days: daysBetween(today, v.compliance[k].expiryDate) })),
    )
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}

// ── Uploading ─────────────────────────────────────────────────────────────────

export const CATEGORIES: RepairCategory[] = ["Service", "Tyres", "Brakes", "Bodywork", "Breakdown and recovery", "Test preparation", "Glass", "Electrical", "Other"];

const GUESS: [RegExp, RepairCategory][] = [
  [/accident|collision|insurance claim|written off/i, "Bodywork"],
  [/recover|tow|breakdown|clutch/i, "Breakdown and recovery"],
  [/cvrt|nct|\bmot\b|pre-?test/i, "Test preparation"],
  [/tyre|tire|puncture|wheel align|tracking/i, "Tyres"],
  [/brake|pads?\b|discs?\b|calliper/i, "Brakes"],
  [/windscreen|glass|window/i, "Glass"],
  [/battery|electric|wiring|bulb|light|alternator|starter/i, "Electrical"],
  [/bumper|panel|dent|respray|body|paint|scratch|mirror/i, "Bodywork"],
  [/service|oil|filter/i, "Service"],
];

/** A first guess at the category from the work described. The person can always change it. */
export function guessCategory(text: string): RepairCategory {
  return GUESS.find(([re]) => re.test(text))?.[1] ?? "Other";
}

/** An invoice already in with this garage and number, if any. */
export function sameNumber(invoices: RepairInvoice[], garageId: ID, invoiceNo: string, exceptId?: ID): RepairInvoice | undefined {
  const n = normNo(invoiceNo);
  if (!n) return undefined;
  return invoices.find((i) => i.id !== exceptId && i.garageId === garageId && normNo(i.invoiceNo) === n);
}

/** The vehicle's most recent repair before `date`, if it was inside the repeat window. */
export function recentRepair(invoices: RepairInvoice[], vehicleId: ID, date: string): { date: string; days: number; invoiceNo: string } | null {
  const prior = invoices
    .filter((i) => i.date <= date && i.lines.some((l) => l.vehicleId === vehicleId))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!prior) return null;
  const days = daysBetween(prior.date, date);
  return days <= REPEAT_DAYS ? { date: prior.date, days, invoiceNo: prior.invoiceNo } : null;
}
