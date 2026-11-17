import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { basicHours, blocking, payrollCsv, payrollWeek, STANDARD_WEEK } from "./payroll";

const mon = "2026-11-09";
const a = (personId: string, date: string, status: "full" | "half" = "full", overtimeHours = 0, sent = true, projectId = "s1") => ({ personId, projectId, date, status, overtimeHours, sent });
const people = [
  { id: "p1", name: "Fergal Noone", sageNo: "0007", kind: "Operative" as const, active: true },
  { id: "p2", name: "Aoife Kinsella", kind: "Operative" as const, active: true },
];

describe("basic hours", () => {
  it("is a 39 hour week: 8 Monday to Thursday, 7 on Friday", () => {
    expect(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].reduce((n, d) => n + basicHours(d, "full"), 0)).toBe(STANDARD_WEEK);
  });
  it("halves a half day", () => expect(basicHours("2026-11-13", "half")).toBe(3.5));
});

describe("payrollWeek", () => {
  const week = [a("p1", "2026-11-09"), a("p1", "2026-11-10"), a("p1", "2026-11-11", "full", 2), a("p1", "2026-11-12"), a("p1", "2026-11-13"), a("p2", "2026-11-09", "half", 0, false), a("p2", "2026-11-16")];
  const lines = payrollWeek(mon, week, people);
  it("adds up basic and overtime apart, within the week only", () => {
    expect(lines[0]).toMatchObject({ personId: "p1", basic: 39, overtime: 2, timeAndHalf: 2, double: 0, total: 41, flags: [] });
    expect(lines[0]!.days["2026-11-11"]).toBe("Full +2h x1.5");
    expect(lines[1]).toMatchObject({ personId: "p2", basic: 4, overtime: 0 });
  });
  it("flags no Sage number, unsent days and a short week, and those block the export", () => {
    expect(lines[1]!.flags).toEqual(["no-sage", "not-sent", "short"]);
    expect(blocking(lines[1]!)).toBe(true);
    expect(blocking(lines[0]!)).toBe(false);
  });
  it("flags two sites on one day", () => {
    expect(payrollWeek(mon, [a("p1", mon, "half"), a("p1", mon, "half", 0, true, "s2")], people)[0]!.flags).toContain("two-sites");
  });
  it("writes hours only, matched on the Sage number, leaving out lines that cannot go", () => {
    const f = payrollCsv(mon, lines);
    expect(f.fileName).toBe("sage-payroll-hours-week-ending-2026-11-13.csv");
    expect(f.text).toBe("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours x1.5,Overtime hours x2\r\n0007,Noone,Fergal,13/11/2026,39.00,2.00,0.00\r\n");
  });
  it("from the sample data: last week's operatives all have a Sage number but one, and their hours add up", () => {
    const { db, day } = buildSeed("2026-11-17");
    const ls = payrollWeek(mon, db.attendance, db.people);
    expect(day).toBe("2026-11-17");
    expect(ls.length).toBeGreaterThan(20);
    expect(ls.filter((l) => l.flags.includes("no-sage")).map((l) => l.name)).toEqual(["Aoife Kinsella"]);
    expect(new Set(db.people.filter((p) => p.sageNo).map((p) => p.sageNo)).size).toBe(db.people.filter((p) => p.sageNo).length);
  });
});
