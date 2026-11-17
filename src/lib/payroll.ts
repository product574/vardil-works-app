/**
 * Payroll from the timesheets (Oldstone call, 16 Nov). The dashboard records and checks hours
 * and sends them to Sage Payroll as a file. Rates, tax, USC, pension and union deductions and
 * the bank payment all stay in Sage, as agreed on the call: nothing here works out pay.
 *
 * Pure functions: no React, no store.
 */
import { addDays, dayOfWeek } from "./dates";
import { type OvertimeRate, overtimeSplit } from "./overtime";
import { attendanceShort, workWeek } from "./week";

/** A normal week on site: Monday to Thursday 8 hours, Friday 7, 39 in all. */
export const STANDARD_WEEK = 39;
export const dayHours = (date: string) => (dayOfWeek(date) === 5 ? 7 : 8);

/** Basic hours for one day's attendance: a full day's hours, or half of them. Overtime is kept apart. */
export const basicHours = (date: string, status: "full" | "half") => (status === "half" ? dayHours(date) / 2 : dayHours(date));

type Att = { personId: string; projectId: string; date: string; status: "full" | "half"; overtimeHours: number; overtimeRate?: OvertimeRate; sent: boolean };
type Who = { id: string; name: string; sageNo?: string; kind: "Management" | "Operative"; active: boolean };

export type PayrollLine = {
  personId: string;
  name: string;
  sageNo?: string;
  /** The day's mark per weekday, "" for not in: "Full", "Half", "Full +2h x1.5". */
  days: Record<string, string>;
  basic: number;
  /** Every overtime hour, at either rate. */
  overtime: number;
  /** The overtime hours at time and a half, and at double time (17 Nov). They add up to `overtime`. */
  timeAndHalf: number;
  double: number;
  /** Hours worked: basic and overtime. Not hours paid, which the payroll package works out from the rates. */
  total: number;
  /** Things the reviewer should look at before exporting. */
  flags: ("no-sage" | "not-sent" | "short" | "two-sites")[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One line per operative who worked in the week (Monday to Friday of `weekStart`), with basic
 * hours and overtime hours at each rate. Flags: no Sage number, a day not yet sent from site, a week under 39 hours, and
 * two sites on one day.
 */
export function payrollWeek(weekStart: string, attendance: Att[], people: Who[]): PayrollLine[] {
  const days = workWeek(weekStart);
  const rows = attendance.filter((a) => days.includes(a.date));
  const ids = [...new Set(rows.map((a) => a.personId))];
  return ids
    .map((id) => {
      const p = people.find((x) => x.id === id);
      const mine = rows.filter((a) => a.personId === id);
      const byDay: Record<string, string> = {};
      let basic = 0;
      let twoSites = false;
      for (const d of days) {
        const on = mine.filter((a) => a.date === d);
        if (on.length > 1) twoSites = true;
        byDay[d] = on.map((a) => attendanceShort(a.status, a.overtimeHours, a.overtimeRate)).join(" + ");
        for (const a of on) basic += basicHours(d, a.status);
      }
      const ot = overtimeSplit(mine);
      const overtime = ot.timeAndHalf + ot.double;
      const flags: PayrollLine["flags"] = [];
      if (!p?.sageNo) flags.push("no-sage");
      if (mine.some((a) => !a.sent)) flags.push("not-sent");
      if (basic < STANDARD_WEEK) flags.push("short");
      if (twoSites) flags.push("two-sites");
      return { personId: id, name: p?.name ?? id, sageNo: p?.sageNo, days: byDay, basic: r2(basic), overtime: r2(overtime), timeAndHalf: r2(ot.timeAndHalf), double: r2(ot.double), total: r2(basic + overtime), flags };
    })
    .sort((a, b) => (a.sageNo ?? "9999").localeCompare(b.sageNo ?? "9999") || a.name.localeCompare(b.name));
}

export const FLAG_TEXT: Record<PayrollLine["flags"][number], string> = {
  "no-sage": "No Sage number",
  "not-sent": "Days not sent from site",
  short: "Under 39 hours",
  "two-sites": "Two sites on one day",
};

/** Lines that cannot go to Sage: no Sage number to match them to, or hours not yet sent from site. */
export const blocking = (l: PayrollLine) => l.flags.includes("no-sage") || l.flags.includes("not-sent");

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dmy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * The file for Sage Payroll: one row per employee, matched on the Sage employee number, with the
 * week's basic hours and its overtime hours at time and a half and at double time. Hours only,
 * no rates or pay. The exact columns follow the sample payroll file Oldstone's accounts are
 * preparing; until then this is the layout to agree.
 */
export function payrollCsv(weekStart: string, lines: PayrollLine[]): { fileName: string; text: string } {
  const end = addDays(weekStart, 4);
  const rows = [["Employee No", "Surname", "Forename", "Period end", "Basic hours", "Overtime hours x1.5", "Overtime hours x2"], ...lines.filter((l) => !blocking(l)).map((l) => {
    const parts = l.name.split(" ");
    return [l.sageNo!, parts.slice(1).join(" "), parts[0]!, dmy(end), l.basic.toFixed(2), l.timeAndHalf.toFixed(2), l.double.toFixed(2)];
  })];
  return { fileName: `sage-payroll-hours-week-ending-${end}.csv`, text: rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n" };
}
