// Date helpers. All business dates are Europe/Dublin calendar dates as "YYYY-MM-DD".

export const DAYS = ["mon", "tue", "wed", "thu", "fri"] as const;
export type DayKey = (typeof DAYS)[number];
export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
};

export function dublinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Dublin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(d: string): Date {
  const [y = 1970, m = 1, day = 1] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}
function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = toUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromUTC(x);
}

/** Monday of the week containing d. Saturday/Sunday map to the Monday just gone (week just ended). */
export function weekStartOf(d: string): string {
  const dow = toUTC(d).getUTCDay(); // 0 Sun..6 Sat
  const offset = dow === 0 ? 6 : dow - 1;
  return addDays(d, -offset);
}

export function weekDates(weekStart: string): Record<DayKey, string> {
  return {
    mon: weekStart,
    tue: addDays(weekStart, 1),
    wed: addDays(weekStart, 2),
    thu: addDays(weekStart, 3),
    fri: addDays(weekStart, 4),
  };
}

export function fmtDate(d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return toUTC(d).toLocaleDateString("en-IE", { ...opts, timeZone: "UTC" });
}
export function fmtLong(d: string) {
  return fmtDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function daysInMonth(year: number, month1: number): string[] {
  const n = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${year}-${String(month1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(d: string): number {
  return toUTC(d).getUTCDay();
}
export function isWeekend(d: string): boolean {
  const w = dayOfWeek(d);
  return w === 0 || w === 6;
}

/** The next `count` weekdays after today (today itself is never included). */
export function rollingWorkdays(today: string, count = 5): string[] {
  const out: string[] = [];
  let d = addDays(today, 1);
  while (out.length < count) {
    if (!isWeekend(d)) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
