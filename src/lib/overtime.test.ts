import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { OVERTIME_RULES, overtimeRate, overtimeSplit, rateName, rateShort, storedRate } from "./overtime";
import { payrollCsv, payrollWeek } from "./payroll";
import { attendanceChoice, choiceMark, overtimeNote } from "./week";

// Overtime at time and a half or double time (Oisin, 17 Nov).
describe("overtime rates", () => {
  it("is time and a half unless an entry was marked double time", () => {
    expect(overtimeRate({})).toBe(1.5);
    expect(overtimeRate({ overtimeRate: 1.5 })).toBe(1.5);
    expect(overtimeRate({ overtimeRate: 2 })).toBe(2);
    expect([rateName(1.5), rateName(2), rateShort(1.5), rateShort(2)]).toEqual(["time and a half", "double time", "x1.5", "x2"]);
  });

  it("splits hours by rate", () => {
    expect(overtimeSplit([{ overtimeHours: 2 }, { overtimeHours: 1.5, overtimeRate: 2 }, { overtimeHours: 0, overtimeRate: 2 }, { overtimeHours: 3, overtimeRate: 1.5 }])).toEqual({ timeAndHalf: 5, double: 1.5 });
  });

  it("writes the rate down only for double time that has hours", () => {
    expect(storedRate(2, 2)).toEqual({ overtimeRate: 2 });
    expect(storedRate(2, 1.5)).toEqual({});
    expect(storedRate(2, undefined)).toEqual({});
    expect(storedRate(0, 2)).toEqual({});
  });

  it("states the firm's rule as Oisin gave it", () => {
    const at = (rate: number) => OVERTIME_RULES.find((r) => r.rate === rate)!.when;
    expect(at(2)).toEqual(["Midnight to 8am", "Saturday after 12 noon", "Sunday", "Bank holidays"]);
    expect(at(1.5)).toContain("Saturday, 8am to 12 noon");
  });
});

describe("marking overtime on the timesheet", () => {
  it("offers time and a half or double time, and reads an entry back as the same choice", () => {
    expect(choiceMark("overtime", 2)).toEqual({ status: "full", overtimeHours: 2 });
    expect(choiceMark("double", 2)).toEqual({ status: "full", overtimeHours: 2, overtimeRate: 2 });
    expect(choiceMark("double", 0)).toEqual({ status: "full", overtimeHours: 0.5, overtimeRate: 2 });
    expect(choiceMark("full", 3)).toEqual({ status: "full", overtimeHours: 0 });
    expect(choiceMark("half", 3)).toEqual({ status: "half", overtimeHours: 0 });
    expect(choiceMark("", 3)).toBeNull();
    expect(attendanceChoice({ status: "full", overtimeHours: 2 })).toBe("overtime");
    expect(attendanceChoice({ status: "full", overtimeHours: 2, overtimeRate: 2 })).toBe("double");
    expect(attendanceChoice({ status: "full", overtimeHours: 0, overtimeRate: 2 })).toBe("full");
    expect(attendanceChoice({ status: "half", overtimeHours: 0 })).toBe("half");
    expect(attendanceChoice(undefined)).toBe("");
  });

  it("writes overtime beside a name with its rate", () => {
    expect([overtimeNote(2), overtimeNote(1.5, 2), overtimeNote(0, 2)]).toEqual(["+2h x1.5", "+1.5h x2", ""]);
  });
});

describe("overtime in the payroll file", () => {
  const people = [{ id: "p1", name: "Fergal Noone", sageNo: "0007", kind: "Operative" as const, active: true }];
  const day = (date: string, overtimeHours = 0, overtimeRate?: 2) => ({ personId: "p1", projectId: "a", date, status: "full" as const, overtimeHours, ...(overtimeRate ? { overtimeRate } : {}), sent: true });
  const week = [day("2026-11-09", 2), day("2026-11-10", 3, 2), day("2026-11-11"), day("2026-11-12", 1, 2), day("2026-11-13")];
  it("carries the hours at each rate, which add up to the overtime", () => {
    const [line] = payrollWeek("2026-11-09", week, people);
    expect(line).toMatchObject({ basic: 39, overtime: 6, timeAndHalf: 2, double: 4, total: 45 });
    expect(line!.days["2026-11-10"]).toBe("Full +3h x2");
    expect(line!.days["2026-11-09"]).toBe("Full +2h x1.5");
  });
  it("has a column for each rate", () => {
    const f = payrollCsv("2026-11-09", payrollWeek("2026-11-09", week, people));
    expect(f.text).toBe("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours x1.5,Overtime hours x2\r\n0007,Noone,Fergal,13/11/2026,39.00,2.00,4.00\r\n");
  });
});

describe("overtime in the sample data", () => {
  const { db } = buildSeed("2026-11-17");
  const c724 = db.projects.find((p) => p.code === "C724")!.id;
  it("is at time and a half, except Derrybawn Bridge's early starts, which are double time", () => {
    const ot = db.attendance.filter((a) => a.overtimeHours > 0);
    expect(ot.length).toBeGreaterThan(30);
    const double = ot.filter((a) => a.overtimeRate === 2);
    expect(double.length).toBeGreaterThan(0);
    expect(double.every((a) => a.projectId === c724)).toBe(true);
    expect(ot.filter((a) => a.projectId === c724).every((a) => a.overtimeRate === 2)).toBe(true);
    // The rate is never left on an entry with no overtime.
    expect(db.attendance.some((a) => a.overtimeHours === 0 && a.overtimeRate !== undefined)).toBe(false);
  });
});
