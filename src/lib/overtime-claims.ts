/**
 * Overtime claims (Oisin, 17 Nov, round ten). An operative can tell their site manager, from
 * the phone, that they worked extra hours on a day: "extra 2 hours that day or a previous day
 * to make site manager aware". It is optional and only for overtime; normal hours are marked by
 * the site manager as before. The site manager approves it, changing the hours if he needs to,
 * or declines it with an optional note. An approved claim goes onto that day on the timesheet.
 *
 * Also here: what an operative sees under "My hours" on the phone, which is where a missing
 * hour gets spotted.
 *
 * Pure functions: no React, no store.
 */
import { addDays } from "./dates";
import { doubleOf, type RestDayKind, restDayProblem } from "./overtime";
import { basicHours } from "./payroll";
import { type DayMark, type DayStatus, fullWeek, restDayMark } from "./week";

/** A claim can go back this many days before today. */
export const CLAIM_DAYS_BACK = 7;
/** More extra hours than this in one day is a slip of the finger. */
export const CLAIM_MOST_HOURS = 16;

export type ClaimStatus = "Waiting" | "Approved" | "Declined";
type Claim = { personId: string; projectId: string; date: string; status: ClaimStatus };

/** The days an operative can claim for: today and the seven before it, newest first. Weekends included. */
export function claimDays(day: string): string[] {
  return Array.from({ length: CLAIM_DAYS_BACK + 1 }, (_, i) => addDays(day, -i));
}

/** What is wrong with a claim, in plain words, or nothing when it can go to the site manager. */
export function claimProblem(day: string, c: { personId: string; projectId: string; date: string; hours: number }, existing: Claim[]): string | null {
  if (!c.date) return "Pick the day";
  if (!c.projectId) return "Pick the site";
  if (c.date > day) return "That day has not come yet";
  if (c.date < addDays(day, -CLAIM_DAYS_BACK)) return `A claim can go back ${CLAIM_DAYS_BACK} days. Ask your site manager about anything older`;
  if (!(c.hours > 0)) return "Enter the extra hours";
  if (c.hours > CLAIM_MOST_HOURS) return `That is more than ${CLAIM_MOST_HOURS} extra hours in one day`;
  if (existing.some((x) => x.status === "Waiting" && x.personId === c.personId && x.projectId === c.projectId && x.date === c.date)) return "You already have a claim waiting for that day";
  return null;
}

/**
 * Where a site manager starts from when approving: the hours claimed, split by the rule for the
 * day. A normal day's extra hours are time and a half; a Saturday's first four are time and a
 * half and the rest double time; a Sunday or a bank holiday is all double time. He can change it.
 */
export function suggestedSplit(kind: RestDayKind | null, hours: number): { timeAndHalf: number; double: number } {
  const h = Math.max(0, hours || 0);
  if (kind === "sunday" || kind === "bank-holiday") return { timeAndHalf: 0, double: h };
  if (kind === "saturday") return { timeAndHalf: Math.min(4, h), double: Math.max(0, h - 4) };
  return { timeAndHalf: h, double: 0 };
}

type Row = { status: DayStatus; overtimeHours: number; doubleHours?: number; sent: boolean };

/** What approving a claim does to the day on the timesheet. */
export type ClaimEffect =
  | { kind: "refuse"; message: string }
  /** The day has not been sent yet (today): the mark is changed like any other. */
  | { kind: "mark"; mark: DayMark }
  /** The day has gone to the office: the change is a correction, with the claim as its reason. */
  | { kind: "correct"; mark: DayMark }
  /** A Saturday, a Sunday or a bank holiday with nothing on it yet: a new overtime time stamp. */
  | { kind: "stamp"; timeAndHalf: number; double: number };

/**
 * Work out what approving does. The approved hours are added to whatever overtime the day
 * already holds. Overtime sits on a full day, so a half day is refused until the day is put
 * right; a day with no mark becomes a full day with the overtime.
 */
export function approvalEffect(existing: Row | undefined, kind: RestDayKind | null, isToday: boolean, timeAndHalf: number, double: number): ClaimEffect {
  const t = Math.max(0, timeAndHalf || 0);
  const d = Math.max(0, double || 0);
  if (t + d <= 0) return { kind: "refuse", message: "Enter the hours to approve" };
  if (kind) {
    if (existing && existing.status !== "restday") return { kind: "refuse", message: "They are marked for a normal day on that date. Put the day right on the timesheet first" };
    const total = { t: t + (existing?.overtimeHours ?? 0), d: d + (existing ? doubleOf(existing) : 0) };
    const problem = restDayProblem(kind, total.t, total.d);
    if (problem) return { kind: "refuse", message: problem };
    return existing ? { kind: "correct", mark: restDayMark(total.t, total.d) } : { kind: "stamp", timeAndHalf: t, double: d };
  }
  if (existing?.status === "restday") return { kind: "refuse", message: "That day holds an overtime time stamp. Change it in the Overtime list" };
  if (existing?.status === "half") return { kind: "refuse", message: "They are down for a half day that day. Overtime goes on a full day: change the day first" };
  const mark: DayMark = { status: "full", overtimeHours: t + (existing?.overtimeHours ?? 0), ...(d + (existing ? doubleOf(existing) : 0) > 0 ? { doubleHours: d + (existing ? doubleOf(existing) : 0) } : {}) };
  if (existing) return { kind: existing.sent ? "correct" : "mark", mark };
  return { kind: isToday ? "mark" : "correct", mark };
}

/** A claim in words, for a list: "2 extra hours" or "1.5 extra hours". */
export const claimHours = (hours: number) => `${hours} extra ${hours === 1 ? "hour" : "hours"}`;

// ── My hours, on the operative's phone ────────────────────────────────────────

type Att = { projectId: string; personId: string; date: string; status: DayStatus; overtimeHours: number; doubleHours?: number };

export type HoursDay = {
  date: string;
  /** What is on the timesheet for the day, one entry per site. Empty when they were not marked in. */
  entries: { projectId: string; status: DayStatus; basic: number; timeAndHalf: number; double: number }[];
};
export type HoursWeek = { days: HoursDay[]; basic: number; timeAndHalf: number; double: number; total: number };

/**
 * One person's hours for a week as the timesheets hold them: Monday to Friday, then the
 * Saturday or the Sunday only where they worked it, and nothing after `upTo`. Hours only: pay
 * is worked out in the payroll package.
 */
export function hoursWeek(attendance: Att[], personId: string, weekOf: string, upTo: string): HoursWeek {
  const mine = attendance.filter((a) => a.personId === personId);
  const days = fullWeek(weekOf)
    .filter((d) => d <= upTo)
    .map((date, i) => ({
      date,
      weekend: i >= 5,
      entries: mine.filter((a) => a.date === date).map((a) => ({ projectId: a.projectId, status: a.status, basic: basicHours(a.date, a.status), timeAndHalf: a.overtimeHours, double: doubleOf(a) })),
    }))
    .filter((d) => !d.weekend || d.entries.length > 0)
    .map(({ date, entries }) => ({ date, entries }));
  const sum = (f: (e: HoursDay["entries"][number]) => number) => days.reduce((n, d) => n + d.entries.reduce((m, e) => m + f(e), 0), 0);
  const basic = sum((e) => e.basic);
  const timeAndHalf = sum((e) => e.timeAndHalf);
  const double = sum((e) => e.double);
  return { days, basic, timeAndHalf, double, total: basic + timeAndHalf + double };
}

/** A day's entry in words an operative reads: "Full day", "Half day", "Full day, 2 hours overtime (x1.5)", "5 hours overtime (x2)". */
export function hoursText(e: { status: DayStatus; timeAndHalf: number; double: number }): string {
  const over = [e.timeAndHalf > 0 ? `${e.timeAndHalf}h at time and a half` : "", e.double > 0 ? `${e.double}h at double time` : ""].filter(Boolean).join(", ");
  if (e.status === "restday") return `Overtime: ${over}`;
  return `${e.status === "half" ? "Half day" : "Full day"}${over ? `, plus ${over}` : ""}`;
}
