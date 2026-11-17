import { beforeEach, describe, expect, it } from "vitest";
import { addBankHoliday, checkPayrollWeek, correctAttendance, markAttendance, planRestDay, removeBankHoliday, setPlanDay, stampRestDay } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { projectCosts } from "./figures";
import { isBankHoliday } from "@/lib/bank-holidays";
import { payrollStage, payrollWeek, weekCheck } from "@/lib/payroll";
import { dayRoster, personDay } from "@/lib/roster";
import { attendanceShort, restDayMark } from "@/lib/week";

const DAY = "2026-11-17";
const db = () => useData.getState().db;
const site = (code: string) => db().projects.find((p) => p.code === code)!.id;
const row = (code: string, personId: string, date: string) => db().attendance.find((a) => a.projectId === site(code) && a.personId === personId && a.date === date);
const lastLog = () => db().activity[0]!;

// Weekend and bank holiday time stamps, overtime at both rates, and bank holidays (Oisin, 17 Nov).
describe("weekend time stamps", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("stamps someone in for a Saturday with hours at each rate, saved as sent, with no normal day", () => {
    expect(stampRestDay(site("C720"), "p-113", "2026-11-14", 4, 2.5)).toBeNull();
    const a = row("C720", "p-113", "2026-11-14")!;
    expect(a).toMatchObject({ status: "restday", overtimeHours: 4, doubleHours: 2.5, sent: true, savedBy: "Aidan King" });
    expect(attendanceShort(a)).toBe("4h x1.5 + 2.5h x2");
    expect(lastLog()).toMatchObject({ what: "Added a weekend time stamp", department: "people" });
    expect(lastLog().target).toBe("Aoife Kinsella, C720 Ardmullen House, 2026-11-14: 4h x1.5 + 2.5h x2".replace("Aoife Kinsella", db().people.find((p) => p.id === "p-113")!.name));
  });

  it("takes anyone in the firm, not only that site's crew", () => {
    // p-101 is on St Finian's, not Derrybawn Bridge.
    expect(db().assignments.some((x) => x.projectId === site("C724") && x.personId === "p-101")).toBe(false);
    expect(stampRestDay(site("C724"), "p-101", "2026-11-15", 0, 3)).toBeNull();
    expect(row("C724", "p-101", "2026-11-15")).toMatchObject({ status: "restday", overtimeHours: 0, doubleHours: 3 });
  });

  it("holds each day to its rule: Sunday and bank holidays all double time, at most four Saturday hours at time and a half", () => {
    expect(stampRestDay(site("C720"), "p-113", "2026-11-15", 2, 2)).toBe("Every hour on a Sunday is at double time");
    expect(stampRestDay(site("C720"), "p-113", "2026-10-26", 1, 0)).toBe("Every hour on a bank holiday is at double time");
    expect(stampRestDay(site("C720"), "p-113", "2026-11-14", 5, 0)).toContain("At most 4 hours on a Saturday");
    expect(stampRestDay(site("C720"), "p-113", "2026-11-14", 0, 0)).toBe("Enter the hours worked");
    expect(db().attendance.filter((a) => a.personId === "p-113" && a.status === "restday")).toEqual([]);
  });

  it("refuses a normal working day, a day still to come, and a second stamp for the same person, site and day", () => {
    expect(stampRestDay(site("C720"), "p-113", "2026-11-16", 0, 4)).toContain("for a Saturday, a Sunday or a bank holiday");
    expect(stampRestDay(site("C720"), "p-113", "2026-11-21", 4, 0)).toBe("That day has not come yet");
    expect(stampRestDay(site("C720"), "p-106", "2026-11-15", 0, 4)).toContain("already have a time stamp");
  });

  it("is changed or removed as a correction, with the reason kept", () => {
    const before = row("C724", "p-128", "2026-11-14")!;
    expect(attendanceShort(before)).toBe("4h x1.5 + 2h x2");
    correctAttendance(site("C724"), "p-128", "2026-11-14", restDayMark(4, 1), "Finished at 1pm, not 2pm");
    expect(attendanceShort(row("C724", "p-128", "2026-11-14")!)).toBe("4h x1.5 + 1h x2");
    expect(db().attendanceChanges[0]).toMatchObject({ date: "2026-11-14", from: "4h x1.5 + 2h x2", to: "4h x1.5 + 1h x2", reason: "Finished at 1pm, not 2pm" });
    correctAttendance(site("C724"), "p-128", "2026-11-14", null, "Did not come in after all");
    expect(row("C724", "p-128", "2026-11-14")).toBeUndefined();
    expect(db().attendanceChanges[0]).toMatchObject({ from: "4h x1.5 + 1h x2", to: "Not in" });
  });

  it("shows where the week and month ahead and the phones look: the site's day and the person's own week", () => {
    stampRestDay(site("C720"), "p-113", "2026-11-14", 4, 2);
    expect(dayRoster(db().attendance, db().plan, site("C720"), "2026-11-14", DAY).rows).toEqual([{ personId: "p-113", note: "4h x1.5 + 2h x2" }]);
    const mine = personDay(db().attendance, db().plan, "p-113", "2026-11-14", DAY, new Set(db().projects.map((p) => p.id)));
    expect(mine).toEqual({ from: "timesheet", rows: [{ projectId: site("C720"), half: false, restday: true, overtimeHours: 4, doubleHours: 2 }] });
  });

  it("goes to payroll with its week, Monday to Sunday, and means a checked week is checked again", () => {
    const week = "2026-11-09";
    const bh = db().bankHolidays.map((h) => h.date);
    const before = payrollWeek(week, db().attendance, db().people, bh).find((l) => l.personId === "p-113")!;
    checkPayrollWeek(week);
    // The check was made just now; a stamp saved after it makes the week stale.
    useData.getState().mutate((d) => {
      d.payrollChecks[0]!.at = "2026-11-17T09:00:00";
    });
    expect(payrollStage(week, db().attendance, db().payrollChecks, db().attendanceChanges, db().payrollExports)).toBe("to-export");
    stampRestDay(site("C720"), "p-113", "2026-11-15", 0, 3);
    useData.getState().mutate((d) => {
      d.attendance.find((a) => a.personId === "p-113" && a.date === "2026-11-15")!.savedAt = "2026-11-17T09:30:00";
    });
    const after = payrollWeek(week, db().attendance, db().people, bh).find((l) => l.personId === "p-113")!;
    expect(after.double).toBe(before.double + 3);
    expect(after.basic).toBe(before.basic);
    expect(after.weekend).toBe("Sun 3h x2");
    expect(weekCheck(db().payrollChecks, db().attendanceChanges, week, db().attendance).stale).toBe(true);
    expect(payrollStage(week, db().attendance, db().payrollChecks, db().attendanceChanges, db().payrollExports)).toBe("to-check");
  });

  it("costs the job the hours at their rates and nothing for a normal day", () => {
    const p = db().projects.find((x) => x.code === "C720")!;
    const rate = db().people.find((x) => x.id === "p-113")!.hourlyRate;
    const before = projectCosts(db(), p).labour;
    stampRestDay(p.id, "p-113", "2026-11-14", 4, 2);
    expect(Math.round((projectCosts(db(), p).labour - before) * 100) / 100).toBe(Math.round((4 * 1.5 + 2 * 2) * rate * 100) / 100);
  });
});

describe("overtime at both rates on a normal day", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("marks today with hours at time and a half and at double time together", () => {
    const person = db().assignments.find((a) => a.projectId === site("C722"))!.personId;
    markAttendance(site("C722"), person, DAY, { status: "full", overtimeHours: 7.5, doubleHours: 1.5 });
    expect(row("C722", person, DAY)).toMatchObject({ status: "full", overtimeHours: 7.5, doubleHours: 1.5, sent: false });
    // Taking the double time back to nought leaves no trace of it.
    markAttendance(site("C722"), person, DAY, { status: "full", overtimeHours: 2, doubleHours: 0 });
    expect(row("C722", person, DAY)!.doubleHours).toBeUndefined();
    // A half day has no overtime at either rate.
    markAttendance(site("C722"), person, DAY, { status: "half", overtimeHours: 3, doubleHours: 2 });
    expect(row("C722", person, DAY)).toMatchObject({ status: "half", overtimeHours: 0 });
    expect(row("C722", person, DAY)!.doubleHours).toBeUndefined();
  });

  it("corrects a sent day to both rates, keeping what it was", () => {
    const a = db().attendance.find((x) => x.projectId === site("C719") && x.date === "2026-11-12" && x.status === "full" && x.overtimeHours === 0)!;
    correctAttendance(a.projectId, a.personId, a.date, { status: "full", overtimeHours: 6, doubleHours: 2 }, "Worked on to finish the pour");
    expect(attendanceShort(row("C719", a.personId, a.date)!)).toBe("Full +6h x1.5 +2h x2");
    expect(db().attendanceChanges[0]).toMatchObject({ from: "Full", to: "Full +6h x1.5 +2h x2", reason: "Worked on to finish the pour" });
  });
});

describe("planning weekend work", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("puts one person down for a Saturday, where the week and month ahead and their phone read it", () => {
    expect(planRestDay(site("C720"), "p-113", "2026-11-21")).toBeNull();
    expect(dayRoster(db().attendance, db().plan, site("C720"), "2026-11-21", DAY)).toEqual({ from: "plan", rows: [{ personId: "p-113", note: "" }] });
    expect(lastLog()).toMatchObject({ what: "Planned weekend work", department: "schedule" });
    // Taking them off is the same as any other day.
    setPlanDay(site("C720"), "p-113", "2026-11-21", null);
    expect(db().plan.some((p) => p.personId === "p-113" && p.date === "2026-11-21")).toBe(false);
  });

  it("refuses a normal working day, a day gone, someone already down, and someone on leave", () => {
    expect(planRestDay(site("C720"), "p-113", "2026-11-18")).toContain("normal working day");
    expect(planRestDay(site("C720"), "p-113", "2026-11-14")).toContain("That day has gone");
    expect(planRestDay(site("C724"), "p-128", "2026-11-21")).toContain("already down");
    const away = db().holidays.find((h) => h.status === "Approved" && h.to >= "2026-11-21" && h.from <= "2026-11-21");
    if (away) expect(planRestDay(site("C720"), away.personId, "2026-11-21")).toContain("on approved leave");
  });
});

describe("bank holidays in Admin", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("adds a day the firm treats as one, in date order, and it then takes a time stamp at double time", () => {
    expect(addBankHoliday("2026-11-13", " Firm closed for the county final ")).toBeNull();
    expect(isBankHoliday(db().bankHolidays, "2026-11-13")).toBe(true);
    expect(db().bankHolidays.map((h) => h.date)).toEqual([...db().bankHolidays.map((h) => h.date)].sort());
    expect(lastLog()).toMatchObject({ what: "Added a bank holiday", target: "Firm closed for the county final, 2026-11-13" });
    // Someone already marked a normal day that Friday is not stamped over.
    const marked = db().attendance.find((a) => a.date === "2026-11-13" && a.status === "full")!;
    expect(stampRestDay(marked.projectId, marked.personId, "2026-11-13", 0, 4)).toContain("already marked for a normal day");
    // Someone who was not in that day can be.
    const free = db().people.find((p) => p.kind === "Operative" && p.active && !db().attendance.some((a) => a.personId === p.id && a.date === "2026-11-13"))!;
    expect(stampRestDay(marked.projectId, free.id, "2026-11-13", 0, 4)).toBeNull();
    expect(lastLog().what).toBe("Added a bank holiday time stamp");
  });

  it("refuses a day already on the list, no date and no name", () => {
    expect(addBankHoliday("2026-10-26", "Again")).toBe("October bank holiday is already on that date");
    expect(addBankHoliday("", "Firm closed")).toBe("Pick the date");
    expect(addBankHoliday("2026-11-20", "  ")).toBe("Give the day a name");
  });

  it("takes a day off the list, keeping the time already recorded on it", () => {
    const stamps = db().attendance.filter((a) => a.date === "2026-10-26").length;
    expect(stamps).toBe(2);
    removeBankHoliday("2026-10-26");
    expect(isBankHoliday(db().bankHolidays, "2026-10-26")).toBe(false);
    expect(db().attendance.filter((a) => a.date === "2026-10-26").length).toBe(stamps);
    expect(lastLog()).toMatchObject({ what: "Removed a bank holiday", target: "October bank holiday, 2026-10-26" });
  });
});
