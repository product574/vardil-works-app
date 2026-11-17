import { describe, expect, it } from "vitest";
import { attendanceChoice, attendanceShort, fullWeek, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "./week";

describe("working weeks", () => {
  it("gives Monday to Friday of the week a day falls in", () => {
    expect(workWeek("2026-11-13")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });
  it("treats a weekend as part of the week just ended", () => {
    expect(workWeek("2026-11-15")[0]).toBe("2026-11-09");
  });
  it("gives the following week for planning", () => {
    expect(nextWorkWeek("2026-11-13")[0]).toBe("2026-11-16");
  });
  it("runs the pay week Monday to Sunday", () => {
    expect(fullWeek("2026-11-11")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    // A Saturday or Sunday belongs to the week just worked.
    expect(fullWeek("2026-11-15")[0]).toBe("2026-11-09");
  });
  it("lists only working days in a month and steps between months", () => {
    expect(workdaysOfMonth("2026-11")).toHaveLength(21);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("labels attendance for a grid cell", () => {
    expect(attendanceShort({ status: "full", overtimeHours: 0 })).toBe("Full");
    // Overtime carries its rate, and a day can have hours at both (17 Nov).
    expect(attendanceShort({ status: "full", overtimeHours: 2 })).toBe("Full +2h x1.5");
    expect(attendanceShort({ status: "full", overtimeHours: 0, doubleHours: 2.5 })).toBe("Full +2.5h x2");
    expect(attendanceShort({ status: "full", overtimeHours: 6, doubleHours: 2 })).toBe("Full +6h x1.5 +2h x2");
    expect(attendanceShort({ status: "half", overtimeHours: 0 })).toBe("Half");
    // A weekend or bank holiday time stamp is only its hours.
    expect(attendanceShort({ status: "restday", overtimeHours: 4, doubleHours: 2 })).toBe("4h x1.5 + 2h x2");
    expect(attendanceChoice({ status: "full", overtimeHours: 1 })).toBe("overtime");
    expect(attendanceChoice(undefined)).toBe("");
  });
});
