import { DAYS, type DayKey } from "./dates";

export interface PlanRow {
  site_id: string;
  employee_id: string;
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
}

/** Returns a map employee_id -> day -> list of site ids, only where the employee is ticked on 2+ sites that day. */
export function findConflicts(rows: PlanRow[]): Map<string, Partial<Record<DayKey, string[]>>> {
  const byEmpDay = new Map<string, string[]>();
  for (const r of rows) {
    for (const d of DAYS) {
      if (!r[d]) continue;
      const k = `${r.employee_id}|${d}`;
      const list = byEmpDay.get(k) ?? [];
      if (!list.includes(r.site_id)) list.push(r.site_id);
      byEmpDay.set(k, list);
    }
  }
  const out = new Map<string, Partial<Record<DayKey, string[]>>>();
  for (const [k, sites] of byEmpDay) {
    if (sites.length < 2) continue;
    const [emp, day] = k.split("|") as [string, DayKey];
    const m = out.get(emp) ?? {};
    m[day] = sites;
    out.set(emp, m);
  }
  return out;
}

export interface DatedEntry {
  site_id: string;
  employee_id: string;
  work_date: string;
}

/** Map "employee|date" -> site ids, only where someone is planned on 2+ sites the same date. */
export function findDateConflicts(rows: DatedEntry[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const k = `${r.employee_id}|${r.work_date}`;
    const l = m.get(k) ?? [];
    if (!l.includes(r.site_id)) l.push(r.site_id);
    m.set(k, l);
  }
  for (const [k, l] of m) if (l.length < 2) m.delete(k);
  return m;
}

export interface HolidayRange {
  employee_id: string;
  start_date: string;
  end_date: string;
}
export function onHoliday(holidays: HolidayRange[], employeeId: string, date: string): boolean {
  return holidays.some((h) => h.employee_id === employeeId && date >= h.start_date && date <= h.end_date);
}
