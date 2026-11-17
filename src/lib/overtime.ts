/**
 * Overtime rates (Oisin, 17 Nov). The overtime on a timesheet entry is paid at time and a half
 * or at double time, and whoever marks it says which, from the firm's rule below. Pay itself is
 * worked out in the payroll package: the demo records the hours at each rate and carries them
 * to attendance history, the payroll file and job costs.
 *
 * Pure functions: no React, no store.
 */
export type OvertimeRate = 1.5 | 2;

type Overtime = { overtimeHours: number; overtimeRate?: OvertimeRate };

/** The rate an entry's overtime is paid at: time and a half, unless it was marked double time. */
export const overtimeRate = (a: Pick<Overtime, "overtimeRate">): OvertimeRate => (a.overtimeRate === 2 ? 2 : 1.5);

export const rateName = (r: OvertimeRate) => (r === 2 ? "double time" : "time and a half");
/** For grid cells and column headings. */
export const rateShort = (r: OvertimeRate) => (r === 2 ? "x2" : "x1.5");

/** Overtime hours by rate. */
export function overtimeSplit(rows: Overtime[]): { timeAndHalf: number; double: number } {
  let timeAndHalf = 0;
  let double = 0;
  for (const a of rows) {
    if (overtimeRate(a) === 2) double += a.overtimeHours;
    else timeAndHalf += a.overtimeHours;
  }
  return { timeAndHalf, double };
}

/**
 * What is kept on an entry: the rate only when it is double time and there is overtime to pay.
 * Time and a half is the rule's ordinary case, so it is not written down.
 */
export function storedRate(overtimeHours: number, rate: OvertimeRate | undefined): { overtimeRate?: OvertimeRate } {
  return overtimeHours > 0 && rate === 2 ? { overtimeRate: 2 } : {};
}

/**
 * The firm's overtime rule, as Oisin gave it on 17 Nov: double time on a bank holiday and from
 * midnight to 8am; Saturday 8am to 12 noon at time and a half and double time after; Sunday at
 * double time. The weekday evening line is the ordinary case the rule leaves unsaid.
 */
export const OVERTIME_RULES: { rate: OvertimeRate; when: string[] }[] = [
  { rate: 1.5, when: ["Monday to Friday, after normal hours up to midnight", "Saturday, 8am to 12 noon"] },
  { rate: 2, when: ["Midnight to 8am", "Saturday after 12 noon", "Sunday", "Bank holidays"] },
];
