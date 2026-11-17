/**
 * Rules for the 17 Nov changes to Schedule, People and the site phone (Oisin): what dropping a
 * person on a site and day does, the site manager's jobs on the phone, holidays grouped for the
 * Schedule screens, attendance periods, and attendance per site.
 *
 * Pure functions: no React, no store.
 */
import type { Attendance, Holiday, ID, Project } from "@/data/types";
import type { DayState } from "./availability";
import { addDays, datesBetween, isWeekend, MONTHS, weekStartOf } from "./dates";
import { workdaysOfMonth, workWeek } from "./week";

// ── Week ahead: dropping a person on a day ───────────────────────────────────

/**
 * What dropping someone on a site for one day would do: plan them ("free"), nothing ("already",
 * they are on that site that day), refused ("leave"), or ask first ("busy": they already have a
 * full day elsewhere, so it would double book unless they are moved).
 */
export type DropOutcome = "free" | "already" | "leave" | "busy";
export function dropOutcome(state: Pick<DayState, "sites" | "load" | "leave">, siteId: ID): DropOutcome {
  if (state.leave) return "leave";
  if (state.sites.includes(siteId)) return "already";
  if (state.load >= 1) return "busy";
  return "free";
}

// ── Site phone: the site manager's jobs ──────────────────────────────────────

/** The jobs a site manager runs, live ones first, then those not started yet, each in site code order. */
export function managerJobs(projects: Project[], personId: ID | null): Project[] {
  const rank = (p: Project) => (p.status === "Live" ? 0 : 1);
  return projects
    .filter((p) => p.siteManagerId === personId && (p.status === "Live" || p.status === "Not started"))
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}

// ── Schedule: holidays ───────────────────────────────────────────────────────

/** Working days between two dates, both counted. */
export const workingDays = (from: string, to: string) => datesBetween(from, to).filter((d) => !isWeekend(d)).length;

/**
 * Approved leave in three groups: off now, coming up, and back in the last 30 days, each in date
 * order; and requests still waiting, soonest first.
 */
export function leaveGroups(holidays: Holiday[], day: string) {
  const approved = holidays.filter((h) => h.status === "Approved");
  const byFrom = (a: Holiday, b: Holiday) => a.from.localeCompare(b.from);
  return {
    now: approved.filter((h) => h.from <= day && h.to >= day).sort(byFrom),
    coming: approved.filter((h) => h.from > day).sort(byFrom),
    recent: approved.filter((h) => h.to < day && h.to >= addDays(day, -30)).sort((a, b) => b.to.localeCompare(a.to)),
    requested: holidays.filter((h) => h.status === "Requested").sort(byFrom),
  };
}

/** Everyone else off at any point during a request, so whoever approves it can see the gap it leaves. */
export function overlapping(holidays: Holiday[], h: Pick<Holiday, "id" | "from" | "to">): Holiday[] {
  return holidays.filter((x) => x.id !== h.id && x.status === "Approved" && x.from <= h.to && x.to >= h.from);
}

// ── Attendance history: periods ──────────────────────────────────────────────

/** "last-week", "this-week", or a month as "YYYY-MM". */
export type Period = string;

/** The working days a period covers, up to today. */
export function periodDays(period: Period, day: string): string[] {
  if (period === "last-week") return workWeek(addDays(weekStartOf(day), -7));
  if (period === "this-week") return workWeek(day).filter((d) => d <= day);
  return workdaysOfMonth(period).filter((d) => d <= day);
}

/** The choices in the period box: last week, this week, then this month and the five before it. */
export function periodOptions(day: string): { value: Period; label: string }[] {
  const lw = workWeek(addDays(weekStartOf(day), -7));
  const short = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]!.slice(0, 3)}`;
  const months: { value: Period; label: string }[] = [];
  let [y, m] = day.slice(0, 7).split("-").map(Number) as [number, number];
  for (let i = 0; i < 6; i++) {
    months.push({ value: `${y}-${String(m).padStart(2, "0")}`, label: `${i === 0 ? "This month, " : ""}${MONTHS[m - 1]} ${y}` });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return [{ value: "last-week", label: `Last week, ${short(lw[0]!)} to ${short(lw[4]!)}` }, { value: "this-week", label: "This week so far" }, ...months];
}

/** How a period reads in a sentence: "last week (9 to 13 Nov)", "November 2026". */
export function periodLabel(period: Period, day: string): string {
  const o = periodOptions(day).find((x) => x.value === period);
  if (period === "last-week") return `last week (${o?.label.replace(/^Last week, /, "")})`;
  if (period === "this-week") return "this week so far";
  return o?.label.replace(/^This month, /, "") ?? period;
}

// ── Attendance history: per site ─────────────────────────────────────────────

export type SiteTotals = { projectId: ID; people: { personId: ID; full: number; half: number; overtime: number; days: number }[]; days: number };

/** Attendance grouped by site, then by person: full days, half days, overtime and days in all (a half day counts a half). Busiest site first. */
export function perSite(rows: Pick<Attendance, "projectId" | "personId" | "status" | "overtimeHours">[], nameOf: (id: ID) => string): SiteTotals[] {
  const sites = new Map<ID, Map<ID, { full: number; half: number; overtime: number }>>();
  for (const a of rows) {
    const people = sites.get(a.projectId) ?? new Map();
    const t = people.get(a.personId) ?? { full: 0, half: 0, overtime: 0 };
    if (a.status === "full") t.full++;
    else t.half++;
    t.overtime += a.overtimeHours;
    people.set(a.personId, t);
    sites.set(a.projectId, people);
  }
  return [...sites.entries()]
    .map(([projectId, people]) => {
      const list = [...people.entries()].map(([personId, t]) => ({ personId, ...t, days: t.full + t.half / 2 })).sort((a, b) => b.days - a.days || nameOf(a.personId).localeCompare(nameOf(b.personId)));
      return { projectId, people: list, days: list.reduce((n, p) => n + p.days, 0) };
    })
    .sort((a, b) => b.days - a.days);
}
