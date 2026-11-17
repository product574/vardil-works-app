/**
 * Payroll from the timesheets (Oldstone call, 16 Nov). The dashboard records and checks hours
 * and sends them to Sage Payroll as a file. Rates, tax, USC, pension and union deductions and
 * the bank payment all stay in Sage, as agreed on the call: nothing here works out pay.
 *
 * Pure functions: no React, no store.
 */
import { addDays, dayOfWeek, isWeekend, weekStartOf } from "./dates";
import { doubleWithoutHalf, type Overtime, overtimeSplit } from "./overtime";
import { attendanceShort, type DayStatus, fullWeek, workWeek } from "./week";

/** A normal week on site: Monday to Thursday 8 hours, Friday 7, 39 in all. */
export const STANDARD_WEEK = 39;
export const dayHours = (date: string) => (dayOfWeek(date) === 5 ? 7 : 8);

/**
 * Basic hours for one day's attendance: a full day's hours, or half of them. Overtime is kept
 * apart, and a rest day (Saturday, Sunday, bank holiday) has no basic hours at all.
 */
export const basicHours = (date: string, status: DayStatus) => (status === "restday" ? 0 : status === "half" ? dayHours(date) / 2 : dayHours(date));

/** The basic hours a full week comes to: 39, less the hours of any bank holiday in it. */
export const expectedHours = (weekStart: string, bankHolidays: string[] = []) => workWeek(weekStart).filter((d) => !bankHolidays.includes(d)).reduce((n, d) => n + dayHours(d), 0);

/** The last day of the pay week, a Sunday: the week runs Monday to Sunday (Oisin, 17 Nov). */
export const weekEnd = (weekStart: string) => addDays(weekStart, 6);

type Att = { personId: string; projectId: string; date: string; status: DayStatus; sent: boolean; savedAt?: string } & Overtime;
type Who = { id: string; name: string; sageNo?: string; kind: "Management" | "Operative"; active: boolean };

export type PayrollFlag = "no-sage" | "not-sent" | "short" | "two-sites" | "much-overtime" | "double-only";

export type PayrollLine = {
  personId: string;
  name: string;
  sageNo?: string;
  /** The day's mark per weekday, "" for not in: "Full", "Half", "Full +2h x1.5", or the hours worked on a bank holiday. */
  days: Record<string, string>;
  /** Saturday and Sunday work in words, "Sat 4h x1.5 + 2h x2", or "" for none. */
  weekend: string;
  basic: number;
  /** Every overtime hour, at either rate. */
  overtime: number;
  /** The overtime hours at time and a half, and at double time (17 Nov). They add up to `overtime`. */
  timeAndHalf: number;
  double: number;
  /** Hours worked: basic and overtime. Not hours paid, which the payroll package works out from the rates. */
  total: number;
  /** The basic hours a full week comes to for this week: 39, less any bank holiday. */
  expected: number;
  /** Things the reviewer should look at before exporting. */
  flags: PayrollFlag[];
  /** The sites worked in the week, so whoever checks it knows which site manager to ask. */
  siteIds: string[];
};

/** Overtime in one week from which the line is flagged for a second look (the call of 17 Nov: "20 hours of overtime, that doesn't seem right"). */
export const OVERTIME_TO_QUERY = 10;

const r2 = (n: number) => Math.round(n * 100) / 100;
const dayName = (d: string) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayOfWeek(d)]!;

/**
 * One line per person who worked in the pay week (Monday to Sunday of `weekStart`), with basic
 * hours and overtime hours at each rate, the weekend's included. Flags: no Sage number, a day
 * not yet sent from site, a week under its full hours, two sites on one day, a lot of overtime,
 * and double time on a weekday with no time and a half (usually an early start, which is not
 * overtime).
 */
export function payrollWeek(weekStart: string, attendance: Att[], people: Who[], bankHolidays: string[] = []): PayrollLine[] {
  const weekdays = workWeek(weekStart);
  const days = fullWeek(weekStart);
  const rows = attendance.filter((a) => days.includes(a.date));
  const expected = expectedHours(weekStart, bankHolidays);
  const ids = [...new Set(rows.map((a) => a.personId))];
  return ids
    .map((id) => {
      const p = people.find((x) => x.id === id);
      const mine = rows.filter((a) => a.personId === id);
      const byDay: Record<string, string> = {};
      let basic = 0;
      let twoSites = false;
      for (const d of weekdays) {
        const on = mine.filter((a) => a.date === d);
        if (on.filter((a) => a.status !== "restday").length > 1) twoSites = true;
        byDay[d] = on.map((a) => attendanceShort(a)).join(" + ");
        for (const a of on) basic += basicHours(d, a.status);
      }
      const weekend = days
        .filter((d) => isWeekend(d))
        .flatMap((d) => mine.filter((a) => a.date === d).map((a) => `${dayName(d)} ${attendanceShort(a)}`))
        .join(", ");
      const ot = overtimeSplit(mine);
      const overtime = ot.timeAndHalf + ot.double;
      const flags: PayrollFlag[] = [];
      if (!p?.sageNo) flags.push("no-sage");
      if (mine.some((a) => !a.sent)) flags.push("not-sent");
      // Someone who only came in for the weekend is not short of a week they were never down for.
      if (basic < expected && mine.some((a) => a.status !== "restday")) flags.push("short");
      if (twoSites) flags.push("two-sites");
      if (overtime >= OVERTIME_TO_QUERY) flags.push("much-overtime");
      if (mine.some(doubleWithoutHalf)) flags.push("double-only");
      return { personId: id, name: p?.name ?? id, sageNo: p?.sageNo, days: byDay, weekend, basic: r2(basic), overtime: r2(overtime), timeAndHalf: r2(ot.timeAndHalf), double: r2(ot.double), total: r2(basic + overtime), expected, flags, siteIds: [...new Set(mine.map((a) => a.projectId))] };
    })
    .sort((a, b) => (a.sageNo ?? "9999").localeCompare(b.sageNo ?? "9999") || a.name.localeCompare(b.name));
}

export const FLAG_TEXT: Record<PayrollFlag, string> = {
  "no-sage": "No Sage number",
  "not-sent": "Days not sent from site",
  short: "Under 39 hours",
  "two-sites": "Two sites on one day",
  "much-overtime": "A lot of overtime",
  "double-only": "Double time, no time and a half",
};

/** A flag in words for one line. A short week names the hours that week should have had. */
export const flagText = (f: PayrollFlag, l: Pick<PayrollLine, "expected">) => (f === "short" ? `Under ${l.expected} hours` : FLAG_TEXT[f]);

// ── The check before the export (the call with Oldstone's managing director, 17 Nov) ──
// Site managers send the days; a manager looks over the week and marks it checked; then the
// office exports the file to Sage Payroll by hand. Nothing goes on its own.

type Check = { weekStart: string; at: string; by: string };
type Change = { date: string; at: string };
type Saved = { date: string; savedAt?: string };

/**
 * The newest check of a week, and whether it needs looking at again: a day in it has been
 * corrected since, or a time stamp (a weekend one, say) has been saved since.
 */
export function weekCheck<C extends Check>(checks: C[], changes: Change[], weekStart: string, saved: Saved[] = []): { check?: C; stale: boolean } {
  const check = checks.filter((c) => c.weekStart === weekStart).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!check) return { stale: false };
  const days = fullWeek(weekStart);
  return { check, stale: changes.some((c) => days.includes(c.date) && c.at > check.at) || saved.some((a) => days.includes(a.date) && !!a.savedAt && a.savedAt > check.at) };
}

/** Where a week stands on its way to Sage Payroll. */
export type PayrollStage = "nothing" | "days-to-come" | "to-check" | "to-export" | "exported";
export function payrollStage(weekStart: string, attendance: Att[], checks: Check[], changes: Change[], exports: { weekStart: string }[]): PayrollStage {
  const days = fullWeek(weekStart);
  const rows = attendance.filter((a) => days.includes(a.date));
  if (rows.length === 0) return "nothing";
  if (exports.some((x) => x.weekStart === weekStart)) return "exported";
  if (rows.some((a) => !a.sent)) return "days-to-come";
  const { check, stale } = weekCheck(checks, changes, weekStart, rows);
  return check && !stale ? "to-export" : "to-check";
}

/**
 * Has the week a day is in already gone to payroll? Until it has, a site manager can change its
 * days, from the office or from his phone; after that only the office can (round ten, 17 Nov).
 */
export const weekExported = (exports: { weekStart: string }[], date: string) => exports.some((x) => x.weekStart === weekStartOf(date));

/** The Monday of the week before the one a day is in: the week payroll is waiting on. */
export const lastWeekStart = (day: string) => addDays(workWeek(day)[0]!, -7);

/** Lines that cannot go to Sage: no Sage number to match them to, or hours not yet sent from site. */
export const blocking = (l: PayrollLine) => l.flags.includes("no-sage") || l.flags.includes("not-sent");

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * The file for Sage Payroll: one row per employee, matched on the Sage employee number, with the
 * week's basic hours and its overtime hours at time and a half and at double time, Saturday and
 * Sunday included: the pay week runs Monday to Sunday. Hours only,
 * no rates or pay. The exact columns follow the sample payroll file Oldstone's accounts are
 * preparing; until then this is the layout to agree.
 */
export function payrollCsv(weekStart: string, lines: PayrollLine[]): { fileName: string; text: string } {
  const end = weekEnd(weekStart);
  const rows = [["Employee No", "Surname", "Forename", "Period end", "Basic hours", "Overtime hours x1.5", "Overtime hours x2"], ...lines.filter((l) => !blocking(l)).map((l) => {
    const parts = l.name.split(" ");
    return [l.sageNo!, parts.slice(1).join(" "), parts[0]!, dmy(end), l.basic.toFixed(2), l.timeAndHalf.toFixed(2), l.double.toFixed(2)];
  })];
  return { fileName: `sage-payroll-hours-week-ending-${end}.csv`, text: rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n" };
}
