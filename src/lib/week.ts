// Working-week helpers for the timesheet and the planner.
import { addDays, daysInMonth, isWeekend, weekStartOf } from "./dates";

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

/** How one attendance entry reads in a grid cell: "Full", "Half" or "Full +2h". */
export function attendanceShort(status: "full" | "half", overtimeHours: number) {
  if (status === "half") return "Half";
  return overtimeHours > 0 ? `Full +${overtimeHours}h` : "Full";
}

/** The value of the timesheet's drop-down for an entry. */
export function attendanceChoice(a: { status: "full" | "half"; overtimeHours: number } | undefined): "" | "full" | "half" | "overtime" {
  if (!a) return "";
  if (a.status === "half") return "half";
  return a.overtimeHours > 0 ? "overtime" : "full";
}
