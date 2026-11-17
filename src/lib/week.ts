// Working-week helpers for the timesheet and the planner.
import { addDays, daysInMonth, isWeekend, weekStartOf } from "./dates";
import { doubleOf, type Overtime, overtimeText, overtimeTotal, storedDouble } from "./overtime";

/** Monday to Friday of the week containing `day`. */
export function workWeek(day: string): string[] {
  const mon = weekStartOf(day);
  return [0, 1, 2, 3, 4].map((n) => addDays(mon, n));
}

/** Monday to Sunday of the week containing `day`: the pay week, with its weekend (17 Nov). */
export function fullWeek(day: string): string[] {
  const mon = weekStartOf(day);
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(mon, n));
}

/** Monday to Friday of the week after the one containing `day`. */
export const nextWorkWeek = (day: string) => workWeek(addDays(weekStartOf(day), 7));

/** Every working day in a month, given as "YYYY-MM". */
export function workdaysOfMonth(ym: string): string[] {
  const [y = 1970, m = 1] = ym.split("-").map(Number);
  return daysInMonth(y, m).filter((d) => !isWeekend(d));
}

export function shiftMonth(ym: string, by: number): string {
  const [y = 1970, m = 1] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * One day's mark on the timesheet. "full" and "half" are a normal working day; "restday" is work
 * on a Saturday, a Sunday or a bank holiday, which has no normal day in it: every hour is at an
 * overtime rate. `overtimeHours` are at time and a half and `doubleHours` at double time, and a
 * day can have both (17 Nov).
 */
export type DayStatus = "full" | "half" | "restday";
export type DayMark = { status: DayStatus } & Overtime;

/** The overtime on an entry as a note beside a name: "+2h x1.5", "+6h x1.5 +2h x2", or nothing. */
export const overtimeNote = (a: Overtime) => [a.overtimeHours > 0 ? `+${a.overtimeHours}h x1.5` : "", doubleOf(a) > 0 ? `+${doubleOf(a)}h x2` : ""].filter(Boolean).join(" ");

/**
 * How one attendance entry reads in a grid cell: "Full", "Half", with its overtime at each rate
 * "Full +2h x1.5" or "Full +6h x1.5 +2h x2", or for a rest day just the hours, "4h x1.5 + 2h x2".
 */
export function attendanceShort(a: DayMark): string {
  if (a.status === "half") return "Half";
  if (a.status === "restday") return overtimeText(a) || "No hours";
  const ot = overtimeNote(a);
  return ot ? `Full ${ot}` : "Full";
}

/** The timesheet's choices for a normal day. "overtime" opens the two boxes of hours, one for each rate. */
export type AttendanceChoice = "" | "full" | "half" | "overtime";

/** The value of the timesheet's drop-down for an entry. */
export function attendanceChoice(a: DayMark | undefined): AttendanceChoice {
  if (!a) return "";
  if (a.status === "half") return "half";
  return overtimeTotal(a) > 0 ? "overtime" : "full";
}

/**
 * What a choice and its hours write on the timesheet. Nothing ("") takes the mark off. Overtime
 * with no hours at either rate is a full day; hours are never less than nothing.
 */
export function choiceMark(c: AttendanceChoice, timeAndHalf = 0, double = 0): DayMark | null {
  if (c === "") return null;
  if (c === "half") return { status: "half", overtimeHours: 0 };
  if (c === "full") return { status: "full", overtimeHours: 0 };
  return { status: "full", overtimeHours: Math.max(0, timeAndHalf || 0), ...storedDouble(Math.max(0, double || 0)) };
}

/** A rest day's mark from its two boxes of hours. */
export const restDayMark = (timeAndHalf: number, double: number): DayMark => ({ status: "restday", overtimeHours: Math.max(0, timeAndHalf || 0), ...storedDouble(Math.max(0, double || 0)) });
