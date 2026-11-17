/**
 * Overtime (Oisin, 17 Nov). Hours beyond a normal day are paid at time and a half or at double
 * time, by the firm's rule below, and one day can have hours at both: someone who works on
 * through the evening and past midnight has time and a half up to midnight and double time
 * after. Work on a Saturday, a Sunday or a bank holiday has no normal day in it at all: every
 * hour is at an overtime rate. Whoever marks the time types the hours at each rate. Pay itself
 * is worked out in the payroll package: the demo records the hours at each rate and carries
 * them to attendance history, the payroll file, job costs and profitability.
 *
 * Pure functions: no React, no store.
 */
export type OvertimeRate = 1.5 | 2;

/** The overtime on one entry: `overtimeHours` at time and a half, `doubleHours` at double time. */
export type Overtime = { overtimeHours: number; doubleHours?: number };

export const rateName = (r: OvertimeRate) => (r === 2 ? "double time" : "time and a half");
/** For grid cells and column headings. */
export const rateShort = (r: OvertimeRate) => (r === 2 ? "x2" : "x1.5");

/** The hours at double time on an entry (most have none, so it is left off the record). */
export const doubleOf = (a: Pick<Overtime, "doubleHours">) => a.doubleHours ?? 0;
/** Every overtime hour on an entry, at either rate. */
export const overtimeTotal = (a: Overtime) => a.overtimeHours + doubleOf(a);

/** Overtime hours by rate. */
export function overtimeSplit(rows: Overtime[]): { timeAndHalf: number; double: number } {
  let timeAndHalf = 0;
  let double = 0;
  for (const a of rows) {
    timeAndHalf += a.overtimeHours;
    double += doubleOf(a);
  }
  return { timeAndHalf, double };
}

/** The hours at each rate in words for a cell: "2h x1.5", "4h x1.5 + 2h x2", or nothing. */
export function overtimeText(a: Overtime): string {
  return [a.overtimeHours > 0 ? `${a.overtimeHours}h x1.5` : "", doubleOf(a) > 0 ? `${doubleOf(a)}h x2` : ""].filter(Boolean).join(" + ");
}

/** What is kept on an entry for double time: the hours only when there are some. */
export function storedDouble(hours: number | undefined): { doubleHours?: number } {
  return hours && hours > 0 ? { doubleHours: hours } : {};
}

/**
 * The firm's overtime rule, as Oisin gave it on 17 Nov and as Oldstone's managing director
 * confirmed on the call that day. Double time in the small hours is only for work that carries
 * on from the day before: a site that starts at 6am or 7am is not on overtime for it.
 */
export const OVERTIME_RULES: { rate: OvertimeRate; when: string[] }[] = [
  { rate: 1.5, when: ["Monday to Friday, after a normal day's hours, up to midnight", "Saturday, 8am to 12 noon"] },
  { rate: 2, when: ["After midnight, when the work carries on from the day before", "Saturday after 12 noon", "Sunday", "Bank holidays"] },
];

/** The part of the rule people get wrong, so it is said in full wherever overtime is typed in. */
export const EARLY_START_NOTE = "An early start, at 6am or 7am, is not overtime. Overtime begins once a normal day's hours are done: 8 hours, or 7 on a Friday.";

// ── Rest days: Saturday, Sunday and bank holidays ────────────────────────────

/** Which rule a rest day falls under. A bank holiday that lands on a weekend is a bank holiday. */
export type RestDayKind = "saturday" | "sunday" | "bank-holiday";

export function restDayKind(dayOfWeek: number, bankHoliday: boolean): RestDayKind | null {
  if (bankHoliday) return "bank-holiday";
  if (dayOfWeek === 6) return "saturday";
  if (dayOfWeek === 0) return "sunday";
  return null;
}

export const REST_DAY_RULE: Record<RestDayKind, string> = {
  saturday: "Saturday: 8am to 12 noon is at time and a half, and after 12 noon is at double time.",
  sunday: "Sunday: every hour is at double time.",
  "bank-holiday": "Bank holiday: every hour is at double time.",
};

/** Saturday morning, 8am to 12 noon, is the only rest day time at time and a half. */
export const SATURDAY_TIME_AND_HALF = 4;
/** No day has more hours in it than this. */
const DAY_LIMIT = 24;

/**
 * Whether the hours typed for a rest day can stand. Returns what is wrong in plain words, or
 * nothing. Sunday and bank holiday hours are all double time; a Saturday has at most four hours
 * at time and a half (8am to 12 noon).
 */
export function restDayProblem(kind: RestDayKind, timeAndHalf: number, double: number): string | null {
  if (!(timeAndHalf >= 0) || !(double >= 0)) return "Hours cannot be less than nothing";
  if (timeAndHalf + double <= 0) return "Enter the hours worked";
  if (kind !== "saturday" && timeAndHalf > 0) return `Every hour on a ${kind === "sunday" ? "Sunday" : "bank holiday"} is at double time`;
  if (kind === "saturday" && timeAndHalf > SATURDAY_TIME_AND_HALF) return `At most ${SATURDAY_TIME_AND_HALF} hours on a Saturday are at time and a half (8am to 12 noon). Put the rest at double time`;
  if (timeAndHalf + double > DAY_LIMIT) return "That is more than 24 hours in one day";
  return null;
}

/**
 * Double time on a normal weekday with no time and a half beside it. Double time there is only
 * for work that runs on past midnight, which would have time and a half up to midnight first,
 * so this is usually an early start entered by mistake. It is saved, with a warning, and the
 * manager sees it before the week goes to payroll.
 */
export const doubleWithoutHalf = (a: { status: string } & Overtime) => a.status !== "restday" && doubleOf(a) > 0 && a.overtimeHours <= 0;
export const DOUBLE_WITHOUT_HALF = "Double time with no time and a half. An early start is not overtime";
