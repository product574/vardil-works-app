import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { isWeekend } from "./dates";
import { DOUBLE_WITHOUT_HALF, doubleOf, doubleWithoutHalf, EARLY_START_NOTE, OVERTIME_RULES, overtimeSplit, overtimeText, overtimeTotal, rateName, rateShort, restDayKind, restDayProblem, storedDouble } from "./overtime";
import { payrollCsv, payrollWeek } from "./payroll";
import { attendanceChoice, attendanceShort, choiceMark, overtimeNote, restDayMark } from "./week";

// Overtime at time and a half and at double time, both possible on one day (Oisin, 17 Nov).
describe("overtime rates", () => {
  it("names the two rates", () => {
    expect([rateName(1.5), rateName(2), rateShort(1.5), rateShort(2)]).toEqual(["time and a half", "double time", "x1.5", "x2"]);
  });

  it("keeps hours at each rate on one entry, and splits a list of them", () => {
    expect(doubleOf({})).toBe(0);
    expect(overtimeTotal({ overtimeHours: 7.5, doubleHours: 1.5 })).toBe(9);
    expect(overtimeSplit([{ overtimeHours: 2 }, { overtimeHours: 7.5, doubleHours: 1.5 }, { overtimeHours: 0, doubleHours: 5 }, { overtimeHours: 3 }])).toEqual({ timeAndHalf: 12.5, double: 6.5 });
  });

  it("writes double time down only where there are hours of it", () => {
    expect(storedDouble(2)).toEqual({ doubleHours: 2 });
    expect(storedDouble(0)).toEqual({});
    expect(storedDouble(undefined)).toEqual({});
  });

  it("reads the hours at each rate in words", () => {
    expect([overtimeText({ overtimeHours: 2 }), overtimeText({ overtimeHours: 4, doubleHours: 2 }), overtimeText({ overtimeHours: 0, doubleHours: 5 }), overtimeText({ overtimeHours: 0 })]).toEqual(["2h x1.5", "4h x1.5 + 2h x2", "5h x2", ""]);
  });

  it("states the firm's rule: double time after midnight is only for work carried on from the day before", () => {
    const at = (rate: number) => OVERTIME_RULES.find((r) => r.rate === rate)!.when;
    expect(at(2)).toEqual(["After midnight, when the work carries on from the day before", "Saturday after 12 noon", "Sunday", "Bank holidays"]);
    expect(at(1.5)).toEqual(["Monday to Friday, after a normal day's hours, up to midnight", "Saturday, 8am to 12 noon"]);
    expect(EARLY_START_NOTE).toContain("An early start, at 6am or 7am, is not overtime");
    expect(EARLY_START_NOTE).toContain("8 hours, or 7 on a Friday");
  });
});

describe("marking overtime on the timesheet", () => {
  it("takes hours at each rate, and reads an entry back as the same choice", () => {
    expect(choiceMark("overtime", 2)).toEqual({ status: "full", overtimeHours: 2 });
    expect(choiceMark("overtime", 7.5, 1.5)).toEqual({ status: "full", overtimeHours: 7.5, doubleHours: 1.5 });
    expect(choiceMark("overtime", 0, 2)).toEqual({ status: "full", overtimeHours: 0, doubleHours: 2 });
    // No hours at either rate is a full day; hours are never less than nothing.
    expect(choiceMark("overtime", 0, 0)).toEqual({ status: "full", overtimeHours: 0 });
    expect(choiceMark("overtime", -3, -1)).toEqual({ status: "full", overtimeHours: 0 });
    expect(choiceMark("full", 3, 2)).toEqual({ status: "full", overtimeHours: 0 });
    expect(choiceMark("half", 3)).toEqual({ status: "half", overtimeHours: 0 });
    expect(choiceMark("", 3)).toBeNull();
    expect(attendanceChoice({ status: "full", overtimeHours: 2 })).toBe("overtime");
    expect(attendanceChoice({ status: "full", overtimeHours: 0, doubleHours: 2 })).toBe("overtime");
    expect(attendanceChoice({ status: "full", overtimeHours: 0 })).toBe("full");
    expect(attendanceChoice({ status: "half", overtimeHours: 0 })).toBe("half");
    expect(attendanceChoice(undefined)).toBe("");
  });

  it("writes a day in a grid cell with its overtime at each rate", () => {
    expect([overtimeNote({ overtimeHours: 2 }), overtimeNote({ overtimeHours: 0, doubleHours: 1.5 }), overtimeNote({ overtimeHours: 7.5, doubleHours: 1.5 }), overtimeNote({ overtimeHours: 0 })]).toEqual(["+2h x1.5", "+1.5h x2", "+7.5h x1.5 +1.5h x2", ""]);
    expect(attendanceShort({ status: "full", overtimeHours: 0 })).toBe("Full");
    expect(attendanceShort({ status: "half", overtimeHours: 0 })).toBe("Half");
    expect(attendanceShort({ status: "full", overtimeHours: 7.5, doubleHours: 1.5 })).toBe("Full +7.5h x1.5 +1.5h x2");
    // A rest day has no normal day in it: only the hours.
    expect(attendanceShort(restDayMark(4, 2))).toBe("4h x1.5 + 2h x2");
    expect(attendanceShort(restDayMark(0, 5))).toBe("5h x2");
  });

  it("flags double time on a weekday with no time and a half: usually an early start, which is not overtime", () => {
    expect(doubleWithoutHalf({ status: "full", overtimeHours: 0, doubleHours: 2 })).toBe(true);
    expect(doubleWithoutHalf({ status: "full", overtimeHours: 7.5, doubleHours: 1.5 })).toBe(false);
    expect(doubleWithoutHalf({ status: "full", overtimeHours: 2 })).toBe(false);
    // Sunday and bank holiday hours are all double time, so a rest day is never flagged.
    expect(doubleWithoutHalf({ status: "restday", overtimeHours: 0, doubleHours: 5 })).toBe(false);
    expect(DOUBLE_WITHOUT_HALF).toContain("An early start is not overtime");
  });
});

describe("weekend and bank holiday hours", () => {
  it("knows which rule a rest day falls under", () => {
    expect(restDayKind(6, false)).toBe("saturday");
    expect(restDayKind(0, false)).toBe("sunday");
    expect(restDayKind(1, true)).toBe("bank-holiday");
    // A bank holiday that lands on a Saturday is a bank holiday: all double time.
    expect(restDayKind(6, true)).toBe("bank-holiday");
    expect(restDayKind(3, false)).toBeNull();
  });

  it("takes any hours on a Saturday, at most four of them at time and a half", () => {
    expect(restDayProblem("saturday", 4, 2)).toBeNull();
    expect(restDayProblem("saturday", 0, 6)).toBeNull();
    expect(restDayProblem("saturday", 5, 0)).toContain("At most 4 hours on a Saturday are at time and a half");
  });

  it("takes Sunday and bank holiday hours at double time only", () => {
    expect(restDayProblem("sunday", 0, 5)).toBeNull();
    expect(restDayProblem("sunday", 2, 3)).toBe("Every hour on a Sunday is at double time");
    expect(restDayProblem("bank-holiday", 1, 0)).toBe("Every hour on a bank holiday is at double time");
  });

  it("refuses no hours, and more hours than a day has", () => {
    expect(restDayProblem("saturday", 0, 0)).toBe("Enter the hours worked");
    expect(restDayProblem("sunday", 0, 25)).toBe("That is more than 24 hours in one day");
    expect(restDayProblem("saturday", Number.NaN, 2)).toBe("Hours cannot be less than nothing");
  });
});

describe("overtime in the payroll file", () => {
  const people = [{ id: "p1", name: "Fergal Noone", sageNo: "0007", kind: "Operative" as const, active: true }];
  const day = (date: string, overtimeHours = 0, doubleHours = 0) => ({ personId: "p1", projectId: "a", date, status: "full" as const, overtimeHours, ...(doubleHours ? { doubleHours } : {}), sent: true });
  const week = [day("2026-11-09", 2), day("2026-11-10", 7.5, 1.5), day("2026-11-11"), day("2026-11-12", 1), day("2026-11-13")];
  it("carries the hours at each rate, which add up to the overtime", () => {
    const [line] = payrollWeek("2026-11-09", week, people);
    expect(line).toMatchObject({ basic: 39, overtime: 12, timeAndHalf: 10.5, double: 1.5, total: 51 });
    expect(line!.days["2026-11-10"]).toBe("Full +7.5h x1.5 +1.5h x2");
    expect(line!.days["2026-11-09"]).toBe("Full +2h x1.5");
  });
  it("has a column for each rate, and the week ends on the Sunday", () => {
    const f = payrollCsv("2026-11-09", payrollWeek("2026-11-09", week, people));
    expect(f.fileName).toBe("sage-payroll-hours-week-ending-2026-11-15.csv");
    expect(f.text).toBe("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours x1.5,Overtime hours x2\r\n0007,Noone,Fergal,15/11/2026,39.00,10.50,1.50\r\n");
  });
});

describe("overtime in the sample data", () => {
  const { db } = buildSeed("2026-11-17");
  const id = (code: string) => db.projects.find((p) => p.code === code)!.id;
  it("has no early start overtime: weekday double time is only the night that ran past midnight, and the one slip left in", () => {
    const weekdayDouble = db.attendance.filter((a) => a.status !== "restday" && doubleOf(a) > 0);
    // Derrybawn Bridge, Wednesday of last week: two of the crew worked on under the night road closure.
    const night = weekdayDouble.filter((a) => a.overtimeHours > 0);
    expect(night.map((a) => [a.projectId, a.date, a.overtimeHours, a.doubleHours])).toEqual([
      [id("C724"), "2026-11-11", 7.5, 1.5],
      [id("C724"), "2026-11-11", 7.5, 1.5],
    ]);
    // The slip for the manager's check to catch: double time with no time and a half.
    const slips = weekdayDouble.filter(doubleWithoutHalf);
    expect(slips.map((a) => [a.projectId, a.date, a.doubleHours])).toEqual([[id("C722"), "2026-11-12", 2]]);
  });
  it("has ordinary overtime at time and a half on normal days", () => {
    const ot = db.attendance.filter((a) => a.status === "full" && a.overtimeHours > 0);
    expect(ot.length).toBeGreaterThan(30);
    expect(db.attendance.some((a) => a.status === "half" && overtimeTotal(a) > 0)).toBe(false);
    // Double time hours are never left on an entry as nought.
    expect(db.attendance.some((a) => a.doubleHours !== undefined && !(a.doubleHours > 0))).toBe(false);
  });
  it("has weekend and bank holiday time stamps, each within its day's rule", () => {
    const stamps = db.attendance.filter((a) => a.status === "restday");
    expect(stamps.map((a) => `${a.date} ${db.projects.find((p) => p.id === a.projectId)!.code} ${attendanceShort(a)}`).sort()).toEqual([
      "2026-10-26 C721 5h x2",
      "2026-10-26 C721 5h x2",
      "2026-11-07 C719 4h x1.5",
      "2026-11-07 C719 4h x1.5",
      "2026-11-14 C724 4h x1.5",
      "2026-11-14 C724 4h x1.5 + 2h x2",
      "2026-11-14 C724 4h x1.5 + 2h x2",
      "2026-11-15 C720 5h x2",
      "2026-11-15 C720 5h x2",
    ]);
    const holidays = db.bankHolidays.map((h) => h.date);
    for (const a of stamps) {
      const kind = restDayKind(new Date(`${a.date}T12:00:00Z`).getUTCDay(), holidays.includes(a.date));
      expect(kind, a.date).not.toBeNull();
      expect(restDayProblem(kind!, a.overtimeHours, doubleOf(a)), a.date).toBeNull();
      expect(a.sent).toBe(true);
    }
    // Nobody is marked a normal day on a weekend or a bank holiday.
    expect(db.attendance.some((a) => a.status !== "restday" && (isWeekend(a.date) || holidays.includes(a.date)))).toBe(false);
  });
});
