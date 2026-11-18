/**
 * Rules for the 17 Nov changes to Schedule, People and the site phone (Oisin): what dropping a
 * person on a site and day does, the site manager's jobs on the phone, holidays grouped for the
 * Schedule screens, attendance periods, and attendance per site.
 *
 * Pure functions: no React, no store.
 */
import type { Attendance, DayInstruction, Holiday, ID, Project, SiteAccess } from "@/data/types";
import type { DayState } from "./availability";
import { addDays, datesBetween, daysInMonth, isWeekend, MONTHS, weekStartOf } from "./dates";
import { doubleOf, overtimeText, overtimeTotal, storedDouble } from "./overtime";
import { basicHours } from "./payroll";
import { opensSite } from "./site-access";
import { fullWeek, overtimeNote, workWeek } from "./week";

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

/**
 * A site manager's jobs on the phone: the ones they run and any the managing director has given
 * them (Admin, Site access). Live ones first, then those not started yet, each in site code order.
 */
export function managerJobs(projects: Project[], personId: ID | null, grants: Pick<SiteAccess, "personId" | "projectId">[] = []): Project[] {
  const rank = (p: Project) => (p.status === "Live" ? 0 : 1);
  return projects
    .filter((p) => opensSite(p, personId, grants) && (p.status === "Live" || p.status === "Not started"))
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
    // Declined requests stay in view until their dates have been and gone, with the note saying why.
    declined: holidays.filter((h) => h.status === "Declined" && h.to >= day).sort(byFrom),
  };
}

/** Everyone else off at any point during a request, so whoever approves it can see the gap it leaves. */
export function overlapping(holidays: Holiday[], h: Pick<Holiday, "id" | "from" | "to">): Holiday[] {
  return holidays.filter((x) => x.id !== h.id && x.status === "Approved" && x.from <= h.to && x.to >= h.from);
}

// ── Attendance history: periods ──────────────────────────────────────────────

/** "last-week", "this-week", or a month as "YYYY-MM". */
export type Period = string;

/**
 * The days a period covers, up to today. Every day, Saturdays and Sundays too, since someone
 * can have a weekend time stamp (17 Nov): a week runs Monday to Sunday.
 */
export function periodDays(period: Period, day: string): string[] {
  if (period === "last-week") return fullWeek(addDays(weekStartOf(day), -7));
  if (period === "this-week") return fullWeek(day).filter((d) => d <= day);
  const [y = 1970, m = 1] = period.split("-").map(Number);
  return daysInMonth(y, m).filter((d) => d <= day);
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

/**
 * `overtime` is every overtime hour; `double` is the part of it at double time, the rest being
 * time and a half. `rest` counts weekend and bank holiday time stamps, which are not days.
 */
export type SiteTotals = { projectId: ID; people: { personId: ID; full: number; half: number; rest: number; overtime: number; double: number; days: number; hours: number }[]; days: number; rest: number; hours: number; overtime: number; double: number };

/**
 * Attendance grouped by site, then by person: full days, half days, overtime, days in all (a half
 * day counts a half) and basic hours on the 39 hour week. Busiest site first.
 */
export function perSite(rows: Pick<Attendance, "projectId" | "personId" | "date" | "status" | "overtimeHours" | "doubleHours">[], nameOf: (id: ID) => string): SiteTotals[] {
  const sites = new Map<ID, Map<ID, { full: number; half: number; rest: number; overtime: number; double: number; hours: number }>>();
  for (const a of rows) {
    const people = sites.get(a.projectId) ?? new Map();
    const t = people.get(a.personId) ?? { full: 0, half: 0, rest: 0, overtime: 0, double: 0, hours: 0 };
    if (a.status === "full") t.full++;
    else if (a.status === "half") t.half++;
    else t.rest++;
    t.overtime += overtimeTotal(a);
    t.double += doubleOf(a);
    t.hours += basicHours(a.date, a.status);
    people.set(a.personId, t);
    sites.set(a.projectId, people);
  }
  return [...sites.entries()]
    .map(([projectId, people]) => {
      const list = [...people.entries()].map(([personId, t]) => ({ personId, ...t, days: t.full + t.half / 2 })).sort((a, b) => b.days - a.days || nameOf(a.personId).localeCompare(nameOf(b.personId)));
      return { projectId, people: list, days: list.reduce((n, p) => n + p.days, 0), rest: list.reduce((n, p) => n + p.rest, 0), hours: list.reduce((n, p) => n + p.hours, 0), overtime: list.reduce((n, p) => n + p.overtime, 0), double: list.reduce((n, p) => n + p.double, 0) };
    })
    .sort((a, b) => b.days - a.days || a.projectId.localeCompare(b.projectId));
}

// ── Site phone: the day's site, its instructions, and asking for a person ────

/**
 * The site someone is on for a day: where they were marked in, else where they are planned (the
 * first if the day is split), else nothing. The operative's phone shows that site's manager and
 * instructions for the day.
 */
export function siteOn(personId: ID, date: string, attendance: Pick<Attendance, "personId" | "projectId" | "date">[], plan: { personId: ID; projectId: ID; date: string }[], liveIds: Set<ID>): ID | undefined {
  return attendance.find((a) => a.personId === personId && a.date === date && liveIds.has(a.projectId))?.projectId ?? plan.find((p) => p.personId === personId && p.date === date && liveIds.has(p.projectId))?.projectId;
}

/** The site manager's instructions for one project on one day, if he has put any up. */
export const dayInstruction = (list: DayInstruction[], projectId: ID | undefined, date: string) => list.find((x) => x.projectId === projectId && x.date === date);

/** Where someone is on a day, in a few words, for the list of people a site manager can ask for. */
export function whereabouts(state: Pick<DayState, "sites" | "load" | "leave">, code: (projectId: ID) => string): string {
  if (state.leave) return "on leave";
  if (state.sites.length === 0) return "free";
  const on = state.sites.map(code).join(" and ");
  return state.load < 1 ? `half day on ${on}` : `on ${on}`;
}

// ── Planning several days at once (Oisin, 17 Nov) ────────────────────────────
// Two places plan more than one day: "Here for the rest of the week?" after someone is first put
// on a site on the week ahead, and "Repeat each weekday until" on the month ahead.

/**
 * What would happen on one day: put them on ("add", or "half" when half their day is taken),
 * move them from the site they were dragged off ("move"), put them on although they have a full
 * day elsewhere ("clash", which double books and is highlighted), or nothing: busy elsewhere,
 * on leave, already here, or the site is not running that day ("off").
 */
export type PlanStep = { date: string; action: "add" | "half" | "move" | "clash" | "busy" | "leave" | "already" | "off" };

/**
 * Work out each day for one person and one site. `onBusy` says what a full day elsewhere means:
 * "skip" leaves that day alone (rest of the week), "clash" plans it anyway (the month ahead, where
 * double bookings are highlighted for whoever is planning to sort out). With `moveFrom`, a day
 * spent wholly on that site is moved across instead.
 */
export function planSteps(states: DayState[], siteId: ID, opts: { running: (date: string) => boolean; onBusy: "skip" | "clash"; moveFrom?: ID }): PlanStep[] {
  return states.map((st) => {
    const action: PlanStep["action"] = !opts.running(st.date)
      ? "off"
      : st.leave
        ? "leave"
        : st.sites.includes(siteId)
          ? "already"
          : st.load >= 1
            ? opts.moveFrom && st.sites.length === 1 && st.sites[0] === opts.moveFrom
              ? "move"
              : opts.onBusy === "clash"
                ? "clash"
                : "busy"
            : st.load > 0
              ? "half"
              : "add";
    return { date: st.date, action };
  });
}

/** The steps that change the plan. */
export const stepsToPlan = (steps: PlanStep[]) => steps.filter((s) => s.action === "add" || s.action === "half" || s.action === "move" || s.action === "clash");

/** Whether this is the person's first day on the site in that week: no other day of the week has them there. */
export const firstOnSite = (plan: { personId: ID; projectId: ID; date: string }[], personId: ID, siteId: ID, week: string[], date: string) => !plan.some((p) => p.personId === personId && p.projectId === siteId && p.date !== date && week.includes(p.date));

/**
 * Who to show for one site on one day: whoever was marked on the timesheet for a day gone (or
 * today, once the site has marked anyone), otherwise whoever is planned. The month ahead and the
 * week ahead both read the plan this way, so a change in one shows in the other.
 */
export function dayRoster(
  attendance: Pick<Attendance, "projectId" | "personId" | "date" | "status" | "overtimeHours" | "doubleHours">[],
  plan: { projectId: ID; personId: ID; date: string; part?: "half"; overtimeHours?: number }[],
  siteId: ID,
  date: string,
  today: string,
): { from: "timesheet" | "plan"; rows: { personId: ID; note: string }[] } {
  const marked = attendance.filter((a) => a.projectId === siteId && a.date === date);
  // Overtime that was worked carries its rate ("+2h x2"); overtime that is only planned has none yet.
  // A rest day (weekend or bank holiday) is all overtime, so its note is the hours themselves.
  if (date < today || (date === today && marked.length > 0)) return { from: "timesheet", rows: marked.map((a) => ({ personId: a.personId, note: a.status === "half" ? "half day" : a.status === "restday" ? overtimeText(a) : overtimeNote(a) })) };
  return { from: "plan", rows: plan.filter((x) => x.projectId === siteId && x.date === date).map((x) => ({ personId: x.personId, note: x.part === "half" ? "half day" : x.overtimeHours ? `+${x.overtimeHours}h` : "" })) };
}

/**
 * Where one person is on one day, for their own week on the phone: the same rule as `dayRoster`,
 * read from the person's side. A day gone shows where they were marked in on the timesheet (or
 * today, once they have been marked); a day to come shows where they are planned.
 */
export function personDay(
  attendance: Pick<Attendance, "projectId" | "personId" | "date" | "status" | "overtimeHours" | "doubleHours">[],
  plan: { projectId: ID; personId: ID; date: string; part?: "half"; overtimeHours?: number }[],
  personId: ID,
  date: string,
  today: string,
  siteIds: Set<ID>,
): { from: "timesheet" | "plan"; rows: { projectId: ID; half: boolean; restday?: boolean; overtimeHours: number; doubleHours?: number }[] } {
  const marked = attendance.filter((a) => a.personId === personId && a.date === date);
  if (date < today || (date === today && marked.length > 0)) return { from: "timesheet", rows: marked.map((a) => ({ projectId: a.projectId, half: a.status === "half", ...(a.status === "restday" ? { restday: true } : {}), overtimeHours: a.overtimeHours, ...storedDouble(a.doubleHours) })) };
  return { from: "plan", rows: plan.filter((x) => x.personId === personId && x.date === date && siteIds.has(x.projectId)).map((x) => ({ projectId: x.projectId, half: x.part === "half", overtimeHours: x.overtimeHours ?? 0 })) };
}

// ── Who is where on any day (18 Nov) ───────────────────────────────────────

/**
 * Where one operative is on a day: "On site" (marked in on the timesheet), "Planned" (down for a
 * site but not marked in: not yet today, not at all on a day gone, or simply planned on a day to
 * come), "On leave" or "Not planned". The same rule as `dayRoster`: a day gone is read from the
 * timesheet, a day to come from the plan. Today, someone on a site's list with no plan counts as
 * planned there, as Who is where always did.
 */
export type WhereState = "On site" | "Planned" | "On leave" | "Not planned";
export type WhereRow = { personId: ID; where: WhereState; sites: { projectId: ID; note: string }[] };

export function whereOn(
  input: {
    people: { id: ID }[];
    attendance: Pick<Attendance, "projectId" | "personId" | "date" | "status" | "overtimeHours" | "doubleHours">[];
    plan: { projectId: ID; personId: ID; date: string; part?: "half"; overtimeHours?: number }[];
    assignments: { personId: ID; projectId: ID }[];
    holidays: Pick<Holiday, "personId" | "status" | "from" | "to">[];
    /** The sites someone on a site's list counts as planned for today. */
    liveIds: Set<ID>;
  },
  date: string,
  today: string,
): WhereRow[] {
  return input.people.map((p) => {
    const marked = input.attendance.filter((a) => a.personId === p.id && a.date === date);
    if (marked.length) return { personId: p.id, where: "On site", sites: marked.map((a) => ({ projectId: a.projectId, note: a.status === "half" ? "half day" : a.status === "restday" ? overtimeText(a) : overtimeNote(a) })) };
    if (input.holidays.some((h) => h.personId === p.id && h.status === "Approved" && date >= h.from && date <= h.to)) return { personId: p.id, where: "On leave", sites: [] };
    const planned = input.plan.filter((x) => x.personId === p.id && x.date === date);
    if (planned.length) return { personId: p.id, where: "Planned", sites: planned.map((x) => ({ projectId: x.projectId, note: x.part === "half" ? "half day" : x.overtimeHours ? `+${x.overtimeHours}h` : "" })) };
    const onList = date === today ? input.assignments.filter((a) => a.personId === p.id && input.liveIds.has(a.projectId)) : [];
    if (onList.length) return { personId: p.id, where: "Planned", sites: [...new Set(onList.map((a) => a.projectId))].map((projectId) => ({ projectId, note: "" })) };
    return { personId: p.id, where: "Not planned", sites: [] };
  });
}

/** What "Planned" is called on a day: not marked in on a day gone, not marked yet today, planned ahead. */
export function plannedLabel(date: string, today: string): string {
  return date < today ? "Not marked in" : date === today ? "Not marked yet" : "Planned";
}

/** The working days Who is where offers: 13 weeks back to 6 weeks ahead, weekends left out, newest last. */
export function whereDays(today: string): string[] {
  const from = addDays(weekStartOf(today), -7 * 13);
  const to = addDays(weekStartOf(today), 7 * 6 + 4);
  return datesBetween(from, to).filter((d) => !isWeekend(d));
}

/** The sites running on a day: started by then and not finished before it. */
export function sitesRunning<T extends Pick<Project, "status" | "startDate" | "endDate"> & { completedAt?: string }>(projects: T[], date: string): T[] {
  return projects.filter((p) => p.startDate <= date && (p.status === "Live" || p.status === "Not started" || (p.completedAt?.slice(0, 10) ?? p.endDate) >= date));
}

/**
 * The site a driver was on, on a day, for filing a repair and for Fleet (18 Nov): where they were
 * marked in or planned (`siteOn`), and for a site manager, who is not on the timesheet, the site
 * they ran that day (the first by code, if they run more than one).
 */
export function driverSiteOn(
  personId: ID,
  date: string,
  attendance: Pick<Attendance, "personId" | "projectId" | "date">[],
  plan: { personId: ID; projectId: ID; date: string }[],
  projects: (Pick<Project, "id" | "code" | "siteManagerId" | "status" | "startDate" | "endDate"> & { completedAt?: string })[],
): ID | undefined {
  return siteOn(personId, date, attendance, plan, new Set(projects.map((p) => p.id))) ?? sitesRunning(projects, date).filter((p) => p.siteManagerId === personId).sort((a, b) => a.code.localeCompare(b.code))[0]?.id;
}
