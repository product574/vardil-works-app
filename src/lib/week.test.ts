import { describe, expect, it } from "vitest";
import { attendanceChoice, attendanceShort, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "./week";

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
  it("lists only working days in a month and steps between months", () => {
    expect(workdaysOfMonth("2026-11")).toHaveLength(21);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("labels attendance for a grid cell", () => {
    expect(attendanceShort("full", 0)).toBe("Full");
    // Overtime carries its rate: time and a half unless it was marked double time (17 Nov).
    expect(attendanceShort("full", 2)).toBe("Full +2h x1.5");
    expect(attendanceShort("full", 2, 1.5)).toBe("Full +2h x1.5");
    expect(attendanceShort("full", 2.5, 2)).toBe("Full +2.5h x2");
    expect(attendanceShort("full", 0, 2)).toBe("Full");
    expect(attendanceShort("half", 0, 2)).toBe("Half");
    expect(attendanceShort("half", 0)).toBe("Half");
    expect(attendanceChoice({ status: "full", overtimeHours: 1 })).toBe("overtime");
    expect(attendanceChoice(undefined)).toBe("");
  });
});
