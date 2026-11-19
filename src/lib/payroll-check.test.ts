import { beforeEach, describe, expect, it } from "vitest";
import { checkPayrollWeek, correctAttendance, recordPayrollExport } from "@/data/actions";
import { buildSeed } from "@/data/seed";
import { useData, usePrefs } from "@/data/store";
import { recordsOverview } from "./overview";
import { lastWeekStart, OVERTIME_TO_QUERY, payrollStage, payrollWeek, weekCheck } from "./payroll";

// The check before the export (the call with Oldstone's managing director, 17 Nov): site
// managers send the days, a manager checks the week, the office exports it by hand.
const DAY = "2026-11-17"; // a Tuesday: last week is the one payroll is waiting on
const WEEK = "2026-11-09";
const db = () => useData.getState().db;
const stage = () => payrollStage(WEEK, db().attendance, db().payrollChecks, db().attendanceChanges, db().payrollExports);
const euro = (n: number) => `€${Math.round(n)}`;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("a week's way to payroll", () => {
  it("last week is the Monday before this one", () => {
    expect(lastWeekStart("2026-11-17")).toBe("2026-11-09");
    expect(lastWeekStart("2026-11-16")).toBe("2026-11-09");
    expect(lastWeekStart("2026-11-20")).toBe("2026-11-09");
  });

  it("goes from to check, to to export, to exported", () => {
    expect(stage()).toBe("to-check");
    checkPayrollWeek(WEEK);
    expect(db().payrollChecks[0]).toMatchObject({ weekStart: WEEK, by: "Aidan King" });
    expect(stage()).toBe("to-export");
    expect(db().activity[0]).toMatchObject({ what: "Checked a week's hours for payroll" });
    recordPayrollExport(WEEK, ["p-101"]);
    expect(stage()).toBe("exported");
  });

  it("needs checking again once a day in it is corrected", () => {
    checkPayrollWeek(WEEK);
    const a = db().attendance.find((x) => x.date === "2026-11-11" && x.status === "full")!;
    // The correction is stamped after the check.
    const at = db().payrollChecks[0]!.at;
    correctAttendance(a.projectId, a.personId, a.date, { status: "half", overtimeHours: 0 }, "Left at lunch");
    useData.setState((s) => ({ db: { ...s.db, attendanceChanges: s.db.attendanceChanges.map((c, i) => (i === 0 ? { ...c, at: `${at.slice(0, 11)}23:59:00` } : c)) } }));
    const w = weekCheck(db().payrollChecks, db().attendanceChanges, WEEK);
    expect(w.stale).toBe(true);
    expect(stage()).toBe("to-check");
    // A correction in another week does not touch this one.
    expect(weekCheck(db().payrollChecks, [{ date: "2026-11-03", at: "2026-11-17T23:59:00" }], WEEK).stale).toBe(false);
  });

  it("waits while a day has not been sent from site, and says nothing for a week with no hours", () => {
    useData.setState((s) => ({ db: { ...s.db, attendance: s.db.attendance.map((a) => (a.date === "2026-11-12" && a.projectId === "pr-C719" ? { ...a, sent: false } : a)) } }));
    expect(stage()).toBe("days-to-come");
    expect(payrollStage("2030-01-07", db().attendance, [], [], [])).toBe("nothing");
  });

  it("in the sample data every week that went to Sage was checked the afternoon before, by a manager", () => {
    expect(db().payrollExports.length).toBeGreaterThan(3);
    for (const x of db().payrollExports) {
      const { check, stale } = weekCheck(db().payrollChecks, db().attendanceChanges, x.weekStart);
      expect(check, x.weekStart).toMatchObject({ by: "Tadhg Morrissey" });
      expect(check!.at < x.at).toBe(true);
      expect(stale).toBe(false);
    }
    expect(db().payrollExports.some((x) => x.weekStart === WEEK)).toBe(false);
  });
});

describe("what the checker is shown", () => {
  const people = [{ id: "p1", name: "Fergal Noone", sageNo: "0007", kind: "Operative" as const, active: true }];
  const day = (date: string, projectId: string, overtimeHours = 0) => ({ personId: "p1", projectId, date, status: "full" as const, overtimeHours, sent: true });
  it("flags a lot of overtime in one week, from ten hours", () => {
    expect(OVERTIME_TO_QUERY).toBe(10);
    const quiet = payrollWeek("2026-11-09", [day("2026-11-09", "a", 3), day("2026-11-10", "a", 3), day("2026-11-11", "a", 3)], people)[0]!;
    expect(quiet.flags).not.toContain("much-overtime");
    const busy = payrollWeek("2026-11-09", [day("2026-11-09", "a", 3), day("2026-11-10", "a", 3), day("2026-11-11", "a", 4)], people)[0]!;
    expect(busy.flags).toContain("much-overtime");
  });
  it("knows which sites the week was worked on, so the right site manager can be asked", () => {
    const l = payrollWeek("2026-11-09", [day("2026-11-09", "a"), day("2026-11-10", "b"), day("2026-11-11", "a")], people)[0]!;
    expect(l.siteIds).toEqual(["a", "b"]);
  });
});

describe("the payroll to-do on the overview", () => {
  const base = { money: euro, seeValues: true, seeMargins: true, canAsk: false, answersRequests: false };
  const payroll = (o: object) => recordsOverview(db(), DAY, { ...base, ...o }).facts.find((f) => f.includes("/people/payroll") || f.includes("/people/reimbursements"));
  it("tells whoever checks the hours that last week is ready to check", () => {
    expect(payroll({ checksPayroll: true })).toBe("Last week's hours are in from every site and [ready for you to check](/people/payroll) before they go to payroll.");
  });
  it("tells the office it is waiting on the check, then that it is ready to export, with any reimbursements to pay", () => {
    expect(payroll({ exportsPayroll: true })).toBe("Last week's hours are [waiting for a manager's check](/people/payroll) before you can export them to payroll. One approved reimbursement is [waiting to be paid](/people/reimbursements) too.");
    checkPayrollWeek(WEEK);
    expect(payroll({ exportsPayroll: true })).toBe("Last week's hours were checked by Aidan King and are [ready to export to payroll](/people/payroll). One approved reimbursement is [waiting to be paid](/people/reimbursements) too.");
    expect(payroll({ checksPayroll: true })).toBe("Last week's hours are checked and [waiting for the office to export](/people/payroll).");
  });
  it("says nothing once the week has gone, or to someone who does neither", () => {
    checkPayrollWeek(WEEK);
    recordPayrollExport(WEEK, ["p-101"]);
    expect(payroll({ checksPayroll: true })).toBeUndefined();
    expect(payroll({})).toBeUndefined();
    // Later in the week the sample data has already sent last week, so there is nothing to do.
    const fri = buildSeed("2026-11-20").db;
    expect(payrollStage(lastWeekStart("2026-11-20"), fri.attendance, fri.payrollChecks, fri.attendanceChanges, fri.payrollExports)).toBe("exported");
  });
  it("keeps to four facts", () => {
    expect(recordsOverview(db(), DAY, { ...base, checksPayroll: true, exportsPayroll: true }).facts).toHaveLength(4);
  });
});
