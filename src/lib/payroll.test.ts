import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { basicHours, blocking, expectedHours, flagText, payrollCsv, payrollWeek, STANDARD_WEEK, weekCheck, weekEnd } from "./payroll";

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
    // The pay week runs Monday to Sunday (17 Nov), so it ends on the Sunday.
    expect(f.fileName).toBe("sage-payroll-hours-week-ending-2026-11-15.csv");
    expect(f.text).toBe("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours x1.5,Overtime hours x2\r\n0007,Noone,Fergal,15/11/2026,39.00,2.00,0.00\r\n");
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

// The pay week runs Monday to Sunday, with its weekend and bank holiday time stamps (Oisin, 17 Nov).
describe("weekend and bank holiday hours in the pay week", () => {
  const who = [
    { id: "p1", name: "Fergal Noone", sageNo: "0007", kind: "Operative" as const, active: true },
    { id: "p2", name: "Orla Prunty", sageNo: "0008", kind: "Operative" as const, active: true },
  ];
  const mon = "2026-11-09";
  const full = (personId: string, date: string, overtimeHours = 0, doubleHours = 0) => ({ personId, projectId: "s1", date, status: "full" as const, overtimeHours, ...(doubleHours ? { doubleHours } : {}), sent: true });
  const stamp = (personId: string, date: string, overtimeHours: number, doubleHours: number) => ({ personId, projectId: "s1", date, status: "restday" as const, overtimeHours, ...(doubleHours ? { doubleHours } : {}), sent: true, savedAt: `${date}T18:00:00` });
  const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

  it("takes the Saturday and Sunday into the week they end, as overtime with no basic hours", () => {
    const rows = [...week.map((d) => full("p1", d)), stamp("p1", "2026-11-14", 4, 2), stamp("p1", "2026-11-15", 0, 5)];
    const [line] = payrollWeek(mon, rows, who);
    expect(line).toMatchObject({ basic: 39, timeAndHalf: 4, double: 7, overtime: 11, total: 50, weekend: "Sat 4h x1.5 + 2h x2, Sun 5h x2" });
    expect(line!.flags).toEqual(["much-overtime"]);
    // The following Monday's work is next week's.
    expect(payrollWeek(mon, [stamp("p1", "2026-11-21", 4, 0)], who)).toEqual([]);
  });

  it("does not call someone short who only came in for the weekend", () => {
    const [line] = payrollWeek(mon, [stamp("p2", "2026-11-14", 4, 0)], who);
    expect(line).toMatchObject({ basic: 0, timeAndHalf: 4, total: 4, flags: [] });
  });

  it("measures a week with a bank holiday against the hours left, and shows the holiday's hours in its column", () => {
    // Monday 26 October 2026 is a bank holiday: a full week is 31 hours, not 39.
    const days = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"];
    expect(expectedHours("2026-10-26", ["2026-10-26"])).toBe(31);
    expect(expectedHours("2026-10-26")).toBe(39);
    const [line] = payrollWeek("2026-10-26", [...days.map((d) => full("p1", d)), stamp("p1", "2026-10-26", 0, 5)], who, ["2026-10-26"]);
    expect(line).toMatchObject({ basic: 31, double: 5, total: 36, expected: 31 });
    expect(line!.flags).toEqual([]);
    expect(line!.days["2026-10-26"]).toBe("5h x2");
    // Without the bank holiday the same week would be short, and says by how much it is measured.
    const [short] = payrollWeek("2026-10-26", days.map((d) => full("p1", d)), who);
    expect(short!.flags).toEqual(["short"]);
    expect(flagText("short", short!)).toBe("Under 39 hours");
    expect(flagText("short", { expected: 31 })).toBe("Under 31 hours");
  });

  it("flags double time on a weekday with no time and a half, for the manager's check", () => {
    const [slip] = payrollWeek(mon, [...week.slice(1).map((d) => full("p1", d)), full("p1", "2026-11-09", 0, 2)], who);
    expect(slip!.flags).toEqual(["double-only"]);
    expect(flagText("double-only", slip!)).toBe("Double time, no time and a half");
    // Working on past midnight has both, and is not flagged; nor is a Sunday, which is all double time.
    const [night] = payrollWeek(mon, [...week.slice(1).map((d) => full("p1", d)), full("p1", "2026-11-09", 7.5, 1.5), stamp("p1", "2026-11-15", 0, 4)], who);
    expect(night!.flags).toEqual(["much-overtime"]);
  });

  it("ends the week on the Sunday", () => {
    expect(weekEnd(mon)).toBe("2026-11-15");
  });

  it("needs the week checked again once a weekend time stamp is saved after the check", () => {
    const check = [{ weekStart: mon, at: "2026-11-16T10:00:00", by: "Tadhg Morrissey" }];
    const before = { date: "2026-11-14", savedAt: "2026-11-16T08:35:00" };
    const after = { date: "2026-11-15", savedAt: "2026-11-16T11:20:00" };
    expect(weekCheck(check, [], mon, [before]).stale).toBe(false);
    expect(weekCheck(check, [], mon, [before, after]).stale).toBe(true);
    // A stamp in another week does not touch this one.
    expect(weekCheck(check, [], mon, [{ date: "2026-11-21", savedAt: "2026-11-23T09:00:00" }]).stale).toBe(false);
    // A correction to the Sunday counts as well: the week is seven days.
    expect(weekCheck(check, [{ date: "2026-11-15", at: "2026-11-16T12:00:00" }], mon).stale).toBe(true);
  });
});
