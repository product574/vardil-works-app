import { beforeEach, describe, expect, it } from "vitest";
import { actAs, addBankHoliday, claimOvertime, correctAttendance, decideOvertimeClaim, markAttendance, planDays, planPerson, plannedOn, recordPayrollExport, setPlanDay } from "./actions";
import { jobInvoices } from "./figures";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { hoursWeek } from "@/lib/overtime-claims";
import { weekExported } from "@/lib/payroll";
import { overtimeClaimCount } from "@/lib/requests";
import { attendanceShort, monthWeeks } from "@/lib/week";

// Tuesday 17 Nov 2026. Round ten: overtime claimed from the phone, approved by the site manager.
const DAY = "2026-11-17";
const db = () => useData.getState().db;
const site = (code: string) => db().projects.find((p) => p.code === code)!.id;
const row = (code: string, personId: string, date: string) => db().attendance.find((a) => a.projectId === site(code) && a.personId === personId && a.date === date);
const claim = (id: string) => db().overtimeClaims.find((c) => c.id === id)!;
const lastLog = () => db().activity[0]!;
const name = (id: string) => db().people.find((p) => p.id === id)!.name;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("the sample claims", () => {
  it("has two waiting for Eoin Brosnan's sites, one approved as the timesheet stands, and one declined with a note", () => {
    const all = db().overtimeClaims;
    expect(all.map((c) => [c.id, c.status])).toEqual([["oc-4", "Waiting"], ["oc-3", "Waiting"], ["oc-2", "Approved"], ["oc-1", "Declined"]]);
    for (const c of all.filter((x) => x.status === "Waiting")) {
      expect(db().people.find((p) => p.id === db().projects.find((x) => x.id === c.projectId)!.siteManagerId)!.name).toBe("Eoin Brosnan");
      // A full day with no overtime on it yet, so approving adds to a clean day.
      expect(db().attendance.find((a) => a.projectId === c.projectId && a.personId === c.personId && a.date === c.date)).toMatchObject({ status: "full", overtimeHours: 0, sent: true });
    }
    const night = claim("oc-2");
    expect(row("C724", night.personId, night.date)).toMatchObject({ overtimeHours: night.overtimeHours, doubleHours: night.doubleHours });
    expect(night.hours).toBe(9);
    expect(claim("oc-1").declineNote).toMatch(/half four/);
  });
  it("counts the waiting claims beside Timesheet for whoever opens those sites", () => {
    expect(overtimeClaimCount(db(), "p-md")).toBe(2);
    const eoin = db().people.find((p) => p.name === "Eoin Brosnan")!.id;
    expect(overtimeClaimCount(db(), eoin)).toBe(2);
    const other = db().people.find((p) => p.name === "Cathal Minogue")!.id;
    expect(overtimeClaimCount(db(), other)).toBe(0);
  });
});

describe("claiming overtime from the phone", () => {
  it("sends a claim for today or a day in the last week to the site manager, in the operative's name", () => {
    expect(actAs("p-113", () => claimOvertime("p-113", site("C720"), "2026-11-16", 2, "  Stayed to cover   the plaster "))).toBeNull();
    const c = db().overtimeClaims[0]!;
    expect(c).toMatchObject({ personId: "p-113", projectId: site("C720"), date: "2026-11-16", hours: 2, note: "Stayed to cover the plaster", status: "Waiting" });
    expect(lastLog()).toMatchObject({ what: "Claimed overtime", who: name("p-113") });
    // Nothing is on the timesheet until it is approved.
    expect(row("C720", "p-113", "2026-11-16")!.overtimeHours).toBe(0);
  });
  it("refuses a day to come, a day more than a week back, no hours, and a second claim while one waits", () => {
    expect(claimOvertime("p-113", site("C720"), "2026-11-18", 2, "")).toBe("That day has not come yet");
    expect(claimOvertime("p-113", site("C720"), "2026-11-09", 2, "")).toMatch(/^A claim can go back 7 days/);
    expect(claimOvertime("p-113", site("C720"), "2026-11-16", 0, "")).toBe("Enter the extra hours");
    expect(claimOvertime("p-113", site("C720"), "2026-11-16", 2, "")).toBeNull();
    expect(claimOvertime("p-113", site("C720"), "2026-11-16", 1, "")).toBe("You already have a claim waiting for that day");
    expect(db().overtimeClaims.filter((c) => c.personId === "p-113")).toHaveLength(1);
  });
});

describe("the site manager's yes or no", () => {
  it("adds the approved hours to a day already sent, as a correction with the claim as its reason", () => {
    const c = claim("oc-4");
    expect(decideOvertimeClaim("oc-4", true, { timeAndHalf: 2, double: 0 })).toBeNull();
    expect(attendanceShort(row("C724", c.personId, c.date)!)).toBe("Full +2h x1.5");
    expect(claim("oc-4")).toMatchObject({ status: "Approved", overtimeHours: 2, doubleHours: 0, decidedBy: "Aidan King" });
    expect(db().attendanceChanges[0]).toMatchObject({ personId: c.personId, date: c.date, from: "Full", to: "Full +2h x1.5", reason: `Overtime claim approved: ${c.note}` });
    expect(lastLog()).toMatchObject({ what: "Approved an overtime claim", department: "people" });
    // It then shows in their hours for the week, at the rate approved.
    expect(hoursWeek(db().attendance, c.personId, c.date, DAY).timeAndHalf).toBeGreaterThanOrEqual(2);
  });
  it("lets him change the hours and the split before approving", () => {
    const c = claim("oc-3");
    expect(c.hours).toBe(1.5);
    expect(decideOvertimeClaim("oc-3", true, { timeAndHalf: 1, double: 0.5 })).toBeNull();
    expect(row("C719", c.personId, c.date)).toMatchObject({ status: "full", overtimeHours: 1, doubleHours: 0.5 });
    expect(claim("oc-3")).toMatchObject({ status: "Approved", overtimeHours: 1, doubleHours: 0.5 });
  });
  it("declines with an optional note and leaves the timesheet alone", () => {
    const c = claim("oc-4");
    expect(decideOvertimeClaim("oc-4", false, { note: " You left at five with the others " })).toBeNull();
    expect(claim("oc-4")).toMatchObject({ status: "Declined", declineNote: "You left at five with the others" });
    expect(row("C724", c.personId, c.date)!.overtimeHours).toBe(0);
    expect(lastLog().what).toBe("Declined an overtime claim");
    expect(lastLog().target).toContain("Note: You left at five with the others");
    // A claim is answered once.
    expect(decideOvertimeClaim("oc-4", true, { timeAndHalf: 2 })).toBe("That claim has already been answered");
  });
  it("marks today, not yet sent, without a correction", () => {
    // C719 is marked for today and not sent.
    const today = db().attendance.find((a) => a.projectId === site("C719") && a.date === DAY && a.status === "full" && !a.sent)!;
    expect(claimOvertime(today.personId, today.projectId, DAY, 1, "Late delivery")).toBeNull();
    const before = db().attendanceChanges.length;
    expect(decideOvertimeClaim(db().overtimeClaims[0]!.id, true, { timeAndHalf: 1 })).toBeNull();
    expect(row("C719", today.personId, DAY)).toMatchObject({ status: "full", overtimeHours: 1, sent: false });
    expect(db().attendanceChanges).toHaveLength(before);
  });
  it("makes a full day with the overtime where they were not marked in, and refuses a half day", () => {
    // C724 has not marked today yet.
    expect(row("C724", "p-128", DAY)).toBeUndefined();
    expect(claimOvertime("p-128", site("C724"), DAY, 2, "")).toBeNull();
    expect(decideOvertimeClaim(db().overtimeClaims[0]!.id, true, { timeAndHalf: 2 })).toBeNull();
    expect(row("C724", "p-128", DAY)).toMatchObject({ status: "full", overtimeHours: 2, sent: false });
    const half = db().attendance.find((a) => a.status === "half" && a.date === "2026-11-16" && a.sent)!;
    expect(claimOvertime(half.personId, half.projectId, half.date, 2, "")).toBeNull();
    expect(decideOvertimeClaim(db().overtimeClaims[0]!.id, true, { timeAndHalf: 2 })).toMatch(/half day/);
    expect(db().overtimeClaims[0]!.status).toBe("Waiting");
    expect(db().attendance.find((a) => a.id === half.id)).toMatchObject({ status: "half", overtimeHours: 0 });
  });
  it("makes an overtime time stamp for a Saturday or a Sunday, by that day's rule", () => {
    // Sunday 15 Nov: nobody from the Old Corn Mill worked it in the sample data.
    expect(claimOvertime("p-115", site("C721"), "2026-11-15", 4, "Made the roof safe after the storm")).toBeNull();
    const id = db().overtimeClaims[0]!.id;
    expect(decideOvertimeClaim(id, true, { timeAndHalf: 4, double: 0 })).toBe("Every hour on a Sunday is at double time");
    expect(decideOvertimeClaim(id, true, { timeAndHalf: 0, double: 4 })).toBeNull();
    expect(row("C721", "p-115", "2026-11-15")).toMatchObject({ status: "restday", overtimeHours: 0, doubleHours: 4, sent: true });
    expect(claim(id).status).toBe("Approved");
  });
});

describe("a bank holiday is never a normal day", () => {
  it("takes whoever was down for a normal day off the plan when a day to come is made one", () => {
    const down = db().plan.filter((p) => p.date === "2026-11-23").length;
    expect(down).toBeGreaterThan(10);
    expect(plannedOn("2026-11-23")).toBe(down);
    expect(addBankHoliday("2026-11-23", "Firm closed")).toBeNull();
    expect(db().plan.filter((p) => p.date === "2026-11-23")).toHaveLength(0);
    expect(lastLog().target).toContain(`${down} taken off the plan for that day`);
    // A day gone keeps what was recorded, and its plan is history.
    const marked = db().attendance.filter((a) => a.date === "2026-11-12").length;
    expect(addBankHoliday("2026-11-12", "Firm closed, too late")).toBeNull();
    expect(db().attendance.filter((a) => a.date === "2026-11-12")).toHaveLength(marked);
    expect(plannedOn("2026-11-12")).toBe(0);
  });
  it("is not planned by the grid, the rest of the week, or a repeat across days", () => {
    // Monday 23 Nov made a bank holiday by the firm.
    expect(addBankHoliday("2026-11-23", "Firm closed")).toBeNull();
    const before = db().plan.filter((p) => p.date === "2026-11-23").length;
    setPlanDay(site("C720"), "p-128", "2026-11-23", { part: "full", overtimeHours: 0 });
    planPerson(site("C720"), "p-128", ["2026-11-23", "2026-11-24"]);
    planDays(site("C722"), "p-119", [{ date: "2026-11-23" }, { date: "2026-11-25" }]);
    expect(db().plan.filter((p) => p.date === "2026-11-23")).toHaveLength(before);
    expect(db().plan.some((p) => p.personId === "p-128" && p.projectId === site("C720") && p.date === "2026-11-24")).toBe(true);
    expect(db().plan.some((p) => p.personId === "p-119" && p.projectId === site("C722") && p.date === "2026-11-25")).toBe(true);
    // Taking someone off that day still works.
    const there = db().plan.find((p) => p.date === "2026-11-23");
    if (there) {
      setPlanDay(there.projectId, there.personId, there.date, null);
      expect(db().plan.filter((p) => p.date === "2026-11-23")).toHaveLength(before - 1);
    }
  });
  it("is not marked or corrected to a normal day on the timesheet, though a day already there can be taken off", () => {
    expect(addBankHoliday(DAY, "Firm closed today")).toBeNull();
    markAttendance(site("C724"), "p-128", DAY, { status: "full", overtimeHours: 0 });
    expect(row("C724", "p-128", DAY)).toBeUndefined();
    expect(addBankHoliday("2026-11-16", "Firm closed yesterday")).toBeNull();
    const there = row("C724", "p-128", "2026-11-16")!;
    expect(there.status).toBe("full");
    correctAttendance(site("C724"), "p-128", "2026-11-16", { status: "half", overtimeHours: 0 }, "Left early");
    expect(row("C724", "p-128", "2026-11-16")!.status).toBe("full");
    correctAttendance(site("C724"), "p-128", "2026-11-16", null, "It was a bank holiday");
    expect(row("C724", "p-128", "2026-11-16")).toBeUndefined();
  });
});

describe("a week that has gone to payroll", () => {
  it("is last week once it is exported, and not before", () => {
    expect(weekExported(db().payrollExports, "2026-11-12")).toBe(false);
    expect(weekExported(db().payrollExports, "2026-11-05")).toBe(true);
    recordPayrollExport("2026-11-09", ["p-101"]);
    expect(weekExported(db().payrollExports, "2026-11-12")).toBe(true);
    expect(weekExported(db().payrollExports, "2026-11-15")).toBe(true);
    expect(weekExported(db().payrollExports, DAY)).toBe(false);
  });
});

describe("a month in whole weeks", () => {
  it("runs from the Monday of its first week to the Sunday of its last", () => {
    const nov = monthWeeks("2026-11");
    expect(nov[0]).toBe("2026-10-26");
    expect(nov[nov.length - 1]).toBe("2026-12-06");
    expect(nov).toHaveLength(42);
    const dec = monthWeeks("2026-12");
    // Monday 30 November's week is whole in both months.
    expect(dec[0]).toBe("2026-11-30");
    expect(nov).toContain("2026-12-04");
    expect(dec[dec.length - 1]).toBe("2027-01-03");
    // A month that starts on a Monday and ends on a Sunday is just itself.
    expect(monthWeeks("2027-02")).toHaveLength(28);
  });
});

describe("invoices for a job", () => {
  it("splits the checked invoices into plant and hire, materials, subcontractors and other", () => {
    const p = db().projects.find((x) => x.status === "Closed" || x.status === "Invoiced" || x.status === "Complete")!;
    const inv = jobInvoices(db(), p);
    const confirmed = db().supplierInvoices.filter((s) => s.readStatus === "confirmed").flatMap((s) => s.allocations.filter((a) => a.projectId === p.id).map((a) => ({ a, sign: s.docType === "credit_note" ? -1 : 1 })));
    const of = (cats: string[]) => confirmed.filter((x) => cats.includes(x.a.category)).reduce((n, x) => n + x.sign * x.a.amount, 0);
    expect(inv.plantHire).toBeCloseTo(of(["plant", "equipment"]), 1);
    expect(inv.materials).toBeCloseTo(of(["material"]), 1);
    expect(inv.subcontractors).toBeCloseTo(of(["labour"]), 1);
    expect(inv.other).toBeCloseTo(of(["transport", "other"]), 1);
    expect(inv.plantHire + inv.materials + inv.subcontractors + inv.other).toBeCloseTo(confirmed.reduce((n, x) => n + x.sign * x.a.amount, 0), 1);
  });
});
