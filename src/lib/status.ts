// Due-date rules shared by training certs, plant renewals and vehicle compliance.
import { addDays } from "./dates";

export type DueState = "overdue" | "soon" | "ok";

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Overdue once the date has passed, "soon" inside the warning window (30 days by default). */
export function dueState(expires: string, today: string, windowDays = 30): DueState {
  const d = daysBetween(today, expires);
  if (d < 0) return "overdue";
  if (d <= windowDays) return "soon";
  return "ok";
}

export function dueLabel(expires: string, today: string, windowDays = 30) {
  const d = daysBetween(today, expires);
  if (d < 0) return `Overdue by ${-d} day${d === -1 ? "" : "s"}`;
  if (d === 0) return "Due today";
  if (d <= windowDays) return `Due in ${d} day${d === 1 ? "" : "s"}`;
  return `In date, ${d} days`;
}

export type ServicePlan =
  | { basis: "hours"; intervalHours: number; lastServiced: string; lastMeter: number; meterNow: number; hoursPerWeek: number }
  | { basis: "km"; intervalKm: number; lastServiced: string; lastMeter: number; meterNow: number; kmPerWeek: number }
  | { basis: "months"; intervalMonths: number; lastServiced: string };

/** Next service date. Meter-based plans project forward from typical weekly use. */
export function nextServiceDate(p: ServicePlan, today: string): { date: string; remaining: string } {
  if (p.basis === "months") {
    const date = addDays(p.lastServiced, Math.round(p.intervalMonths * 30.4));
    return { date, remaining: `every ${p.intervalMonths} months` };
  }
  const interval = p.basis === "hours" ? p.intervalHours : p.intervalKm;
  const perWeek = p.basis === "hours" ? p.hoursPerWeek : p.kmPerWeek;
  const left = p.lastMeter + interval - p.meterNow;
  const unit = p.basis === "hours" ? "hrs" : "km";
  const days = perWeek > 0 ? Math.round((left / perWeek) * 7) : 0;
  return {
    date: addDays(today, days),
    remaining: left >= 0 ? `${left.toLocaleString("en-IE")} ${unit} to go` : `${(-left).toLocaleString("en-IE")} ${unit} over`,
  };
}
