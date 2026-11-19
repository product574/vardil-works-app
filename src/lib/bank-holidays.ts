/**
 * Bank holidays (Oisin, 17 Nov). Every hour worked on one is at double time, and nobody is
 * marked a normal day on one. The public holidays for Ireland and for the UK (England and
 * Wales) are worked out here; the managing director can add or take away a day in Admin, so
 * what the app goes by is the list kept with the records (`db.bankHolidays`).
 *
 * Pure functions: no React, no store.
 */
import { addDays, dayOfWeek, isWeekend } from "./dates";
import { type RestDayKind, restDayKind } from "./overtime";

export type BankHoliday = { date: string; name: string };
export type HolidayRegion = "IE" | "UK";

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Easter Sunday, by the usual Gregorian reckoning. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(year, month, day);
}

/** The first Monday of a month. */
function firstMonday(year: number, month: number): string {
  let d = ymd(year, month, 1);
  while (dayOfWeek(d) !== 1) d = addDays(d, 1);
  return d;
}
/** The last Monday of a month. */
function lastMonday(year: number, month: number): string {
  let d = addDays(ymd(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1), -1);
  while (dayOfWeek(d) !== 1) d = addDays(d, -1);
  return d;
}

/** Ireland's ten public holidays. One that falls at a weekend stays on its own date. */
function ireland(year: number): BankHoliday[] {
  const easter = easterSunday(year);
  // St Brigid's Day is the first Monday of February, or the 1st itself when that is a Friday.
  const brigid = dayOfWeek(ymd(year, 2, 1)) === 5 ? ymd(year, 2, 1) : firstMonday(year, 2);
  return [
    { date: ymd(year, 1, 1), name: "New Year's Day" },
    { date: brigid, name: "St Brigid's Day" },
    { date: ymd(year, 3, 17), name: "St Patrick's Day" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: firstMonday(year, 5), name: "May bank holiday" },
    { date: firstMonday(year, 6), name: "June bank holiday" },
    { date: firstMonday(year, 8), name: "August bank holiday" },
    { date: lastMonday(year, 10), name: "October bank holiday" },
    { date: ymd(year, 12, 25), name: "Christmas Day" },
    { date: ymd(year, 12, 26), name: "St Stephen's Day" },
  ];
}

/** England and Wales. A holiday that falls at a weekend moves to the next free weekday. */
function unitedKingdom(year: number): BankHoliday[] {
  const easter = easterSunday(year);
  const taken = new Set<string>();
  const moved = (date: string, name: string): BankHoliday => {
    let d = date;
    while (isWeekend(d) || taken.has(d)) d = addDays(d, 1);
    taken.add(d);
    return { date: d, name: d === date ? name : `${name} (day in lieu)` };
  };
  const christmas = moved(ymd(year, 12, 25), "Christmas Day");
  const boxing = moved(ymd(year, 12, 26), "Boxing Day");
  return [
    moved(ymd(year, 1, 1), "New Year's Day"),
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: firstMonday(year, 5), name: "Early May bank holiday" },
    { date: lastMonday(year, 5), name: "Spring bank holiday" },
    { date: lastMonday(year, 8), name: "Summer bank holiday" },
    christmas,
    boxing,
  ];
}

/** The public holidays of one year, in date order. */
export function bankHolidaysOf(year: number, region: HolidayRegion): BankHoliday[] {
  return (region === "UK" ? unitedKingdom(year) : ireland(year)).sort((a, b) => a.date.localeCompare(b.date));
}

/** The built-in list the records start with: last year, this year and next, around a day. */
export function builtInBankHolidays(day: string, region: HolidayRegion): BankHoliday[] {
  const y = Number(day.slice(0, 4));
  return [y - 1, y, y + 1].flatMap((year) => bankHolidaysOf(year, region));
}

/** Whether a date is a public holiday in either region, for choosing the demo's day. */
export function isBuiltInBankHoliday(date: string): boolean {
  const y = Number(date.slice(0, 4));
  return [...bankHolidaysOf(y, "IE"), ...bankHolidaysOf(y, "UK")].some((h) => h.date === date);
}

export const bankHolidayOn = (list: BankHoliday[], date: string) => list.find((h) => h.date === date);
export const isBankHoliday = (list: BankHoliday[], date: string) => list.some((h) => h.date === date);

/** A day nobody is marked a normal day on: a Saturday, a Sunday or a bank holiday. */
export const isRestDay = (list: BankHoliday[], date: string) => isWeekend(date) || isBankHoliday(list, date);

/** The rest days from `from` to `to`, both counted, newest first: for choosing the day of a time stamp. */
export function restDaysBetween(list: BankHoliday[], from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) if (isRestDay(list, d)) out.push(d);
  return out;
}

/** Which overtime rule a date falls under as a rest day, or nothing on a normal working day. */
export const restDayKindOf = (list: BankHoliday[], date: string): RestDayKind | null => restDayKind(dayOfWeek(date), isBankHoliday(list, date));
