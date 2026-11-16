/**
 * Who is free in a given week. Used by the week ahead: the "not placed" list and the
 * trade-then-person picker both need to know where someone already is before they are added.
 */

export type PlanRow = { projectId: string; personId: string; date: string; part?: "half"; overtimeHours?: number };
export type LeaveRow = { personId: string; status: string; from: string; to: string };
/** `load` is how much of the day is taken: 0 free, 0.5 one half day, 1 a full day, more than 1 double booked. */
export type DayState = { date: string; sites: string[]; load: number; leave: boolean };

/** How much of a day one plan entry takes up. */
export const partLoad = (p: { part?: "half" }) => (p.part === "half" ? 0.5 : 1);

/** "On site", "Half day", "On site +2h": how a planned day reads in a grid cell. */
export const planShort = (p: { part?: "half"; overtimeHours?: number }) => (p.part === "half" ? "Half day" : p.overtimeHours ? `On site +${p.overtimeHours}h` : "On site");

/** One person's week: for each day, the sites they are planned on and whether they are on approved leave. */
export function personWeek(plan: PlanRow[], holidays: LeaveRow[], liveSiteIds: Set<string>, personId: string, days: string[]): DayState[] {
  return days.map((date) => {
    const entries = plan.filter((p) => p.personId === personId && p.date === date && liveSiteIds.has(p.projectId));
    return {
    date,
    sites: entries.map((p) => p.projectId),
    load: entries.reduce((n, p) => n + partLoad(p), 0),
    leave: holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to),
    };
  });
}

/** Days with no site and no leave. */
export const freeDays = (week: DayState[]) => week.filter((d) => d.load === 0 && !d.leave).map((d) => d.date);

/** Days with room left: wholly free, or only a half day planned. Leave days never count. */
export const openDays = (week: DayState[]) => week.filter((d) => d.load < 1 && !d.leave).map((d) => d.date);

/**
 * Double bookings: "person|date" mapped to the sites involved, wherever someone is planned
 * for more than one day's work on a date. Two half days on two sites is a normal split day,
 * not a clash; a full day plus anything else is.
 */
export function planClashes(plan: PlanRow[]): Map<string, string[]> {
  const days = new Map<string, { load: number; sites: string[] }>();
  for (const p of plan) {
    const k = `${p.personId}|${p.date}`;
    const d = days.get(k) ?? { load: 0, sites: [] };
    d.load += partLoad(p);
    if (!d.sites.includes(p.projectId)) d.sites.push(p.projectId);
    days.set(k, d);
  }
  const out = new Map<string, string[]>();
  for (const [k, d] of days) if (d.load > 1) out.set(k, d.sites);
  return out;
}

const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });

/** "all week", "Mon to Wed" for a run of three or more, otherwise "Mon, Thu". `days` is the full set being considered. */
export function daysLabel(dates: string[], days: string[]): string {
  if (dates.length === 0) return "no days";
  if (dates.length === days.length) return "all week";
  const idx = dates.map((d) => days.indexOf(d)).sort((a, b) => a - b);
  const run = idx.every((n, i) => i === 0 || n === idx[i - 1]! + 1);
  if (run && idx.length >= 3) return `${short(days[idx[0]!]!)} to ${short(days[idx[idx.length - 1]!]!)}`;
  return idx.map((n) => short(days[n]!)).join(", ");
}

/**
 * A one-line summary for the picker: "Free all week", "On C723 all week", "Free Mon, Tue; on C723 Wed to Fri".
 * `code` turns a project id into its site code.
 */
export function availabilityLine(week: DayState[], code: (projectId: string) => string): string {
  const days = week.map((d) => d.date);
  const free = freeDays(week);
  const leave = week.filter((d) => d.leave).map((d) => d.date);
  const bySite = new Map<string, string[]>();
  for (const d of week) for (const s of d.sites) bySite.set(s, [...(bySite.get(s) ?? []), d.date]);
  const parts: string[] = [];
  if (free.length > 0) parts.push(`free ${daysLabel(free, days)}`);
  for (const [s, ds] of bySite) parts.push(`on ${code(s)} ${daysLabel(ds, days)}`);
  if (leave.length > 0) parts.push(`on leave ${daysLabel(leave, days)}`);
  const line = parts.join("; ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}
