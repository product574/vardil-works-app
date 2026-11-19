import { describe, expect, it } from "vitest";
import { approvalEffect, claimDays, claimHours, claimProblem, hoursText, hoursWeek, suggestedSplit } from "./overtime-claims";
import { weekExported } from "./payroll";

// Tuesday 17 Nov 2026.
const day = "2026-11-17";

describe("which days an operative can claim overtime for", () => {
  it("is today and the seven days before it, newest first, weekends included", () => {
    const d = claimDays(day);
    expect(d).toHaveLength(8);
    expect(d[0]).toBe("2026-11-17");
    expect(d[7]).toBe("2026-11-10");
    expect(d).toContain("2026-11-14"); // Saturday
  });
});

describe("what is wrong with a claim", () => {
  const ok = { personId: "a", projectId: "s1", date: "2026-11-16", hours: 2 };
  it("passes a claim for a day in the window with some hours", () => {
    expect(claimProblem(day, ok, [])).toBeNull();
    expect(claimProblem(day, { ...ok, date: day }, [])).toBeNull();
    expect(claimProblem(day, { ...ok, date: "2026-11-10" }, [])).toBeNull();
  });
  it("refuses a day to come, a day more than a week back, no hours and too many", () => {
    expect(claimProblem(day, { ...ok, date: "" }, [])).toBe("Pick the day");
    expect(claimProblem(day, { ...ok, projectId: "" }, [])).toBe("Pick the site");
    expect(claimProblem(day, { ...ok, date: "2026-11-18" }, [])).toBe("That day has not come yet");
    expect(claimProblem(day, { ...ok, date: "2026-11-09" }, [])).toMatch(/^A claim can go back 7 days/);
    expect(claimProblem(day, { ...ok, hours: 0 }, [])).toBe("Enter the extra hours");
    expect(claimProblem(day, { ...ok, hours: 17 }, [])).toBe("That is more than 16 extra hours in one day");
  });
  it("refuses a second claim while one is waiting for the same day and site, but not once it is answered", () => {
    expect(claimProblem(day, ok, [{ ...ok, status: "Waiting" }])).toBe("You already have a claim waiting for that day");
    expect(claimProblem(day, ok, [{ ...ok, status: "Declined" }])).toBeNull();
    expect(claimProblem(day, ok, [{ ...ok, projectId: "s2", status: "Waiting" }])).toBeNull();
    expect(claimProblem(day, ok, [{ ...ok, personId: "b", status: "Waiting" }])).toBeNull();
  });
  it("says the hours in words", () => {
    expect(claimHours(1)).toBe("1 extra hour");
    expect(claimHours(2.5)).toBe("2.5 extra hours");
  });
});

describe("the split a site manager starts from", () => {
  it("is time and a half on a normal day", () => expect(suggestedSplit(null, 2)).toEqual({ timeAndHalf: 2, double: 0 }));
  it("is four hours at time and a half and the rest double on a Saturday", () => {
    expect(suggestedSplit("saturday", 3)).toEqual({ timeAndHalf: 3, double: 0 });
    expect(suggestedSplit("saturday", 6)).toEqual({ timeAndHalf: 4, double: 2 });
  });
  it("is all double time on a Sunday or a bank holiday", () => {
    expect(suggestedSplit("sunday", 5)).toEqual({ timeAndHalf: 0, double: 5 });
    expect(suggestedSplit("bank-holiday", 5)).toEqual({ timeAndHalf: 0, double: 5 });
  });
});

describe("what approving a claim does to the day", () => {
  const full = { status: "full" as const, overtimeHours: 0, sent: true };
  it("adds the hours to a full day that has been sent, as a correction", () => {
    expect(approvalEffect(full, null, false, 2, 0)).toEqual({ kind: "correct", mark: { status: "full", overtimeHours: 2 } });
    // Overtime already on the day is kept and added to, at each rate.
    expect(approvalEffect({ ...full, overtimeHours: 1, doubleHours: 1 }, null, false, 2, 0.5)).toEqual({ kind: "correct", mark: { status: "full", overtimeHours: 3, doubleHours: 1.5 } });
  });
  it("changes today's mark while the day is not sent yet", () => {
    expect(approvalEffect({ ...full, sent: false }, null, true, 1.5, 0)).toEqual({ kind: "mark", mark: { status: "full", overtimeHours: 1.5 } });
  });
  it("makes a day with no mark a full day with the overtime", () => {
    expect(approvalEffect(undefined, null, true, 2, 0)).toEqual({ kind: "mark", mark: { status: "full", overtimeHours: 2 } });
    expect(approvalEffect(undefined, null, false, 2, 0)).toEqual({ kind: "correct", mark: { status: "full", overtimeHours: 2 } });
  });
  it("refuses a half day, and approving nothing", () => {
    expect(approvalEffect({ ...full, status: "half" }, null, false, 2, 0)).toMatchObject({ kind: "refuse", message: expect.stringMatching(/half day/) });
    expect(approvalEffect(full, null, false, 0, 0)).toEqual({ kind: "refuse", message: "Enter the hours to approve" });
  });
  it("makes a time stamp on a rest day with nothing on it, by that day's rule", () => {
    expect(approvalEffect(undefined, "saturday", false, 4, 2)).toEqual({ kind: "stamp", timeAndHalf: 4, double: 2 });
    expect(approvalEffect(undefined, "sunday", false, 0, 5)).toEqual({ kind: "stamp", timeAndHalf: 0, double: 5 });
    expect(approvalEffect(undefined, "sunday", false, 2, 0)).toEqual({ kind: "refuse", message: "Every hour on a Sunday is at double time" });
    expect(approvalEffect(undefined, "saturday", false, 5, 0)).toMatchObject({ kind: "refuse", message: expect.stringMatching(/^At most 4 hours on a Saturday/) });
  });
  it("adds to a time stamp already there, still inside the day's rule", () => {
    const stamp = { status: "restday" as const, overtimeHours: 3, sent: true };
    expect(approvalEffect(stamp, "saturday", false, 1, 2)).toEqual({ kind: "correct", mark: { status: "restday", overtimeHours: 4, doubleHours: 2 } });
    expect(approvalEffect(stamp, "saturday", false, 2, 0)).toMatchObject({ kind: "refuse" });
  });
  it("refuses a rest day that holds a normal day, and a normal day that holds a time stamp", () => {
    expect(approvalEffect(full, "bank-holiday", false, 0, 2)).toMatchObject({ kind: "refuse", message: expect.stringMatching(/normal day/) });
    expect(approvalEffect({ status: "restday", overtimeHours: 0, doubleHours: 2, sent: true }, null, false, 1, 0)).toMatchObject({ kind: "refuse" });
  });
});

describe("my hours, on the operative's phone", () => {
  const att = [
    { projectId: "s1", personId: "a", date: "2026-11-09", status: "full" as const, overtimeHours: 0 },
    { projectId: "s1", personId: "a", date: "2026-11-11", status: "full" as const, overtimeHours: 7.5, doubleHours: 1.5 },
    { projectId: "s1", personId: "a", date: "2026-11-12", status: "half" as const, overtimeHours: 0 },
    { projectId: "s2", personId: "a", date: "2026-11-13", status: "full" as const, overtimeHours: 0 }, // Friday: 7 hours
    { projectId: "s1", personId: "a", date: "2026-11-14", status: "restday" as const, overtimeHours: 4, doubleHours: 2 },
    { projectId: "s1", personId: "b", date: "2026-11-10", status: "full" as const, overtimeHours: 3 },
    { projectId: "s1", personId: "a", date: "2026-11-16", status: "full" as const, overtimeHours: 2 },
  ];
  it("lists Monday to Friday, then a weekend day only where they worked it", () => {
    const w = hoursWeek(att, "a", "2026-11-09", "2026-11-17");
    expect(w.days.map((d) => d.date)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(w.days[1]!.entries).toEqual([]); // not marked in on the Tuesday
    expect(w.days[5]!.entries[0]).toMatchObject({ status: "restday", basic: 0, timeAndHalf: 4, double: 2 });
  });
  it("adds basic hours on the 39 hour week and the overtime at each rate", () => {
    const w = hoursWeek(att, "a", "2026-11-09", "2026-11-17");
    expect(w).toMatchObject({ basic: 8 + 8 + 4 + 7, timeAndHalf: 11.5, double: 3.5, total: 27 + 15 });
  });
  it("stops at today for the week that is still running", () => {
    const w = hoursWeek(att, "a", day, day);
    expect(w.days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17"]);
    expect(w).toMatchObject({ basic: 8, timeAndHalf: 2, double: 0 });
  });
  it("says a day in words an operative reads", () => {
    expect(hoursText({ status: "full", timeAndHalf: 0, double: 0 })).toBe("Full day");
    expect(hoursText({ status: "half", timeAndHalf: 0, double: 0 })).toBe("Half day");
    expect(hoursText({ status: "full", timeAndHalf: 7.5, double: 1.5 })).toBe("Full day, plus 7.5h at time and a half, 1.5h at double time");
    expect(hoursText({ status: "restday", timeAndHalf: 0, double: 5 })).toBe("Overtime: 5h at double time");
  });
});

describe("a week that has gone to payroll", () => {
  const exports = [{ weekStart: "2026-11-02" }];
  it("covers every day of that week, Monday to Sunday, and no other", () => {
    expect(weekExported(exports, "2026-11-02")).toBe(true);
    expect(weekExported(exports, "2026-11-08")).toBe(true); // the Sunday
    expect(weekExported(exports, "2026-11-09")).toBe(false);
    expect(weekExported(exports, "2026-11-01")).toBe(false);
  });
});
