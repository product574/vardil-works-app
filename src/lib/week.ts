// Working-week helpers for the timesheet and the planner.
import { addDays, daysInMonth, isWeekend, weekStartOf } from "./dates";
import { type OvertimeRate, overtimeRate, rateShort } from "./overtime";

/** Monday to Friday of the week containing `day`. */
export function workWeek(day: string): string[] {
  const mon = weekStartOf(day);
  return [0, 1, 2, 3, 4].map((n) => addDays(mon, n));
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
 * How one attendance entry reads in a grid cell: "Full", "Half", or with overtime and its rate,
 * "Full +2h x1.5" (time and a half) or "Full +2h x2" (double time).
 */
export function attendanceShort(status: "full" | "half", overtimeHours: number, rate?: OvertimeRate) {
  if (status === "half") return "Half";
  return overtimeHours > 0 ? `Full +${overtimeHours}h ${rateShort(overtimeRate({ overtimeRate: rate }))}` : "Full";
}

/** The overtime on an entry as a note beside a name: "+2h x1.5", or nothing. */
export const overtimeNote = (overtimeHours: number, rate?: OvertimeRate) => (overtimeHours > 0 ? `+${overtimeHours}h ${rateShort(overtimeRate({ overtimeRate: rate }))}` : "");

/** The timesheet's choices for a day: overtime at time and a half ("overtime") or at double time ("double"). */
export type AttendanceChoice = "" | "full" | "half" | "overtime" | "double";

/** The value of the timesheet's drop-down for an entry. */
export function attendanceChoice(a: { status: "full" | "half"; overtimeHours: number; overtimeRate?: OvertimeRate } | undefined): AttendanceChoice {
  if (!a) return "";
  if (a.status === "half") return "half";
  return a.overtimeHours > 0 ? (overtimeRate(a) === 2 ? "double" : "overtime") : "full";
}

/** What a choice and its hours write on the timesheet. Nothing ("") takes the mark off. */
export function choiceMark(c: AttendanceChoice, hours: number): { status: "full" | "half"; overtimeHours: number; overtimeRate?: OvertimeRate } | null {
  if (c === "") return null;
  if (c === "half") return { status: "half", overtimeHours: 0 };
  if (c === "full") return { status: "full", overtimeHours: 0 };
  return { status: "full", overtimeHours: Math.max(0.5, hours), ...(c === "double" ? { overtimeRate: 2 as const } : {}) };
}
