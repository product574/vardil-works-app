import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { rollingWorkdays } from "./dates";
import type { Holiday, Project } from "@/data/types";
import { dayInstruction, dayRoster, dropOutcome, firstOnSite, leaveGroups, managerJobs, overlapping, perSite, periodDays, periodLabel, periodOptions, personDay, planSteps, siteOn, stepsToPlan, whereabouts, workingDays } from "./roster";

describe("dropOutcome", () => {
  it("plans someone free", () => expect(dropOutcome({ sites: [], load: 0, leave: false }, "a")).toBe("free"));
  it("plans someone with half a day free", () => expect(dropOutcome({ sites: ["b"], load: 0.5, leave: false }, "a")).toBe("free"));
  it("does nothing when they are already there", () => expect(dropOutcome({ sites: ["a"], load: 1, leave: false }, "a")).toBe("already"));
  it("asks first when they have a full day elsewhere", () => expect(dropOutcome({ sites: ["b"], load: 1, leave: false }, "a")).toBe("busy"));
  it("refuses a day of leave", () => expect(dropOutcome({ sites: [], load: 0, leave: true }, "a")).toBe("leave"));
});

describe("managerJobs", () => {
  const p = (code: string, status: Project["status"], siteManagerId = "sm") => ({ id: code, code, status, siteManagerId }) as Project;
  it("live jobs first, then not started, only the ones they run", () => {
    expect(managerJobs([p("C726", "Not started"), p("C724", "Live"), p("C719", "Live"), p("C712", "Closed"), p("C720", "Live", "other")], "sm").map((x) => x.code)).toEqual(["C719", "C724", "C726"]);
  });
  it("from the sample data, Eoin Brosnan runs St Finian's and Derrybawn", () => {
    const { db } = buildSeed("2026-11-16");
    expect(managerJobs(db.projects, "p-sm1").map((x) => x.code)).toEqual(["C719", "C724"]);
  });
  it("a site given to them in Admin is one of their jobs too, in the same order", () => {
    const jobs = [p("C726", "Not started"), p("C724", "Live"), p("C720", "Live", "other"), p("C712", "Closed", "other")];
    expect(managerJobs(jobs, "sm", [{ personId: "sm", projectId: "C720" }, { personId: "sm", projectId: "C712" }]).map((x) => x.code)).toEqual(["C720", "C724", "C726"]);
    const { db } = buildSeed("2026-11-16");
    expect(managerJobs(db.projects, "p-sm5", db.siteAccess).map((x) => x.code)).toEqual(["C723", "C725", "C726"]);
  });
});

describe("holidays", () => {
  const h = (id: string, from: string, to: string, status: Holiday["status"] = "Approved"): Holiday => ({ id, personId: id, from, to, status, via: "Form" });
  const all = [h("now", "2026-11-12", "2026-11-18"), h("soon", "2026-11-30", "2026-12-04"), h("past", "2026-11-02", "2026-11-06"), h("old", "2026-09-01", "2026-09-05"), h("ask", "2026-12-01", "2026-12-03", "Requested"), h("no", "2026-12-01", "2026-12-02", "Declined")];
  it("groups approved leave into off now, coming up and recently back", () => {
    const g = leaveGroups(all, "2026-11-16");
    expect([g.now, g.coming, g.recent, g.requested].map((x) => x.map((y) => y.id))).toEqual([["now"], ["soon"], ["past"], ["ask"]]);
  });
  it("counts working days only", () => expect(workingDays("2026-11-27", "2026-12-04")).toBe(6));
  it("shows who else is off during a request", () => expect(overlapping(all, all[4]!).map((x) => x.id)).toEqual(["soon"]));
});

describe("periods", () => {
  const day = "2026-11-17";
  it("last week is Monday to Friday of the week before", () => expect(periodDays("last-week", day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]));
  it("this week stops at today", () => expect(periodDays("this-week", day)).toEqual(["2026-11-16", "2026-11-17"]));
  it("a month is its working days up to today", () => {
    const d = periodDays("2026-11", day);
    expect(d[0]).toBe("2026-11-02");
    expect(d[d.length - 1]).toBe("2026-11-17");
  });
  it("the box offers last week first, then this week, then six months", () => {
    const o = periodOptions(day);
    expect(o[0]).toEqual({ value: "last-week", label: "Last week, 9 Nov to 13 Nov" });
    expect(o.map((x) => x.value).slice(1)).toEqual(["this-week", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06"]);
    expect(o[2]!.label).toBe("This month, November 2026");
  });
  it("reads in a sentence", () => {
    expect(periodLabel("last-week", day)).toBe("last week (9 Nov to 13 Nov)");
    expect(periodLabel("2026-10", day)).toBe("October 2026");
  });
  it("crosses a new year", () => expect(periodOptions("2027-01-05").map((x) => x.value)).toContain("2026-12"));
});

describe("perSite", () => {
  // Monday 16 Nov 2026: a full day is 8 basic hours, a half day 4.
  const a = (projectId: string, personId: string, status: "full" | "half", overtimeHours = 0) => ({ projectId, personId, date: "2026-11-16", status, overtimeHours });
  it("groups by site then person, a half day counting a half, busiest first", () => {
    const out = perSite([a("s1", "p1", "full"), a("s1", "p1", "half"), a("s2", "p2", "full", 2), a("s2", "p2", "full"), a("s2", "p3", "full"), a("s1", "p4", "full")], (id) => id);
    expect(out.map((s) => [s.projectId, s.days])).toEqual([["s2", 3], ["s1", 2.5]]);
    expect(out[0]!.people).toEqual([{ personId: "p2", full: 2, half: 0, overtime: 2, double: 0, hours: 16, days: 2 }, { personId: "p3", full: 1, half: 0, overtime: 0, double: 0, hours: 8, days: 1 }]);
    expect(out[1]!.people.map((p) => [p.personId, p.days])).toEqual([["p1", 1.5], ["p4", 1]]);
  });
  it("keeps the double time hours apart from the rest of the overtime", () => {
    const out = perSite([{ ...a("s1", "p1", "full", 3), overtimeRate: 2 as const }, a("s1", "p1", "full", 2), a("s1", "p2", "full", 1)], (id) => id);
    expect(out[0]).toMatchObject({ overtime: 6, double: 3 });
    expect(out[0]!.people.map((p) => [p.personId, p.overtime, p.double])).toEqual([["p1", 5, 3], ["p2", 1, 0]]);
  });
  it("adds up each site's basic and overtime hours, a Friday counting 7", () => {
    const out = perSite([a("s1", "p1", "full", 1.5), a("s1", "p2", "half"), { projectId: "s1", personId: "p1", date: "2026-11-20", status: "full", overtimeHours: 0 }], (id) => id);
    expect(out[0]).toMatchObject({ projectId: "s1", hours: 8 + 4 + 7, overtime: 1.5 });
  });
  it("adds up to the same days as the payroll totals, from the sample data", () => {
    const { db, day } = buildSeed("2026-11-16");
    const days = new Set(periodDays("last-week", day));
    const rows = db.attendance.filter((x) => days.has(x.date));
    const total = rows.reduce((n, x) => n + (x.status === "full" ? 1 : 0.5), 0);
    expect(perSite(rows, (id) => id).reduce((n, s) => n + s.days, 0)).toBe(total);
    expect(total).toBeGreaterThan(20);
  });
});

describe("the site for a day", () => {
  const live = new Set(["a", "b"]);
  it("is where they were marked in, else where they are planned", () => {
    expect(siteOn("p", "2026-11-17", [{ personId: "p", projectId: "b", date: "2026-11-17" }], [{ personId: "p", projectId: "a", date: "2026-11-17" }], live)).toBe("b");
    expect(siteOn("p", "2026-11-18", [], [{ personId: "p", projectId: "a", date: "2026-11-18" }], live)).toBe("a");
    expect(siteOn("p", "2026-11-19", [], [], live)).toBeUndefined();
  });
  it("ignores a site that is no longer live", () => expect(siteOn("p", "2026-11-18", [], [{ personId: "p", projectId: "gone", date: "2026-11-18" }], live)).toBeUndefined());
  it("finds the day's instructions for that site only", () => {
    const list = [{ id: "1", projectId: "a", date: "2026-11-17", text: "Keep off the lift", by: "Eoin", at: "" }];
    expect(dayInstruction(list, "a", "2026-11-17")?.text).toBe("Keep off the lift");
    expect(dayInstruction(list, "a", "2026-11-18")).toBeUndefined();
    expect(dayInstruction(list, "b", "2026-11-17")).toBeUndefined();
  });
  it("the day after today for instructions is the next working day", () => {
    expect(rollingWorkdays("2026-11-20", 1)[0]).toBe("2026-11-23");
  });
  it("says where someone is in a few words", () => {
    const code = (id: string) => id.toUpperCase();
    expect([whereabouts({ sites: [], load: 0, leave: false }, code), whereabouts({ sites: ["a"], load: 1, leave: false }, code), whereabouts({ sites: ["a"], load: 0.5, leave: false }, code), whereabouts({ sites: [], load: 0, leave: true }, code)]).toEqual(["free", "on A", "half day on A", "on leave"]);
  });
  it("from the sample data: Marek is on C719 today, with instructions from Eoin", () => {
    const { db, day } = buildSeed("2026-11-17");
    const liveIds = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
    const site = siteOn("p-103", day, db.attendance, db.plan, liveIds);
    expect(site).toBe("pr-C719");
    expect(dayInstruction(db.dayInstructions, site, day)?.by).toBe("Eoin Brosnan");
  });
});

describe("planning several days at once", () => {
  const st = (date: string, sites: string[], load: number, leave = false) => ({ date, sites, load, leave });
  const week = [st("d1", [], 0), st("d2", ["b"], 0.5), st("d3", ["b"], 1), st("d4", [], 0, true), st("d5", ["a"], 1), st("d6", ["b", "c"], 1)];
  const running = (d: string) => d !== "d6";
  it("rest of the week: free days and half days go on, a full day elsewhere is left alone", () => {
    expect(planSteps(week, "a", { running, onBusy: "skip" }).map((s) => s.action)).toEqual(["add", "half", "busy", "leave", "already", "off"]);
  });
  it("rest of the week after a move: days wholly on the old site move across", () => {
    expect(planSteps(week, "a", { running: () => true, onBusy: "skip", moveFrom: "b" }).map((s) => s.action)).toEqual(["add", "half", "move", "leave", "already", "busy"]);
  });
  it("month ahead: a full day elsewhere is planned anyway and shows as a clash", () => {
    const steps = planSteps(week, "a", { running, onBusy: "clash" });
    expect(steps.map((s) => s.action)).toEqual(["add", "half", "clash", "leave", "already", "off"]);
    expect(stepsToPlan(steps).map((s) => s.date)).toEqual(["d1", "d2", "d3"]);
  });
  it("first time on a site means no other day that week", () => {
    const plan = [{ personId: "p", projectId: "a", date: "d2" }, { personId: "p", projectId: "b", date: "d3" }];
    expect(firstOnSite(plan, "p", "a", ["d1", "d2", "d3"], "d1")).toBe(false);
    expect(firstOnSite(plan, "p", "a", ["d1", "d2", "d3"], "d2")).toBe(true);
    expect(firstOnSite(plan, "p", "c", ["d1", "d2", "d3"], "d1")).toBe(true);
  });
});

describe("who to show for a site on a day", () => {
  const att = [{ projectId: "a", personId: "p1", date: "2026-11-16", status: "half" as const, overtimeHours: 0 }, { projectId: "a", personId: "p2", date: "2026-11-17", status: "full" as const, overtimeHours: 2 }];
  const plan = [{ projectId: "a", personId: "p3", date: "2026-11-16" }, { projectId: "a", personId: "p3", date: "2026-11-17" }, { projectId: "b", personId: "p4", date: "2026-11-17" }, { projectId: "a", personId: "p5", date: "2026-11-18", part: "half" as const }];
  it("a day gone comes from the timesheet, whatever was planned", () => expect(dayRoster(att, plan, "a", "2026-11-16", "2026-11-17")).toEqual({ from: "timesheet", rows: [{ personId: "p1", note: "half day" }] }));
  it("today comes from the timesheet once the site has marked anyone, else from the plan", () => {
    expect(dayRoster(att, plan, "a", "2026-11-17", "2026-11-17")).toEqual({ from: "timesheet", rows: [{ personId: "p2", note: "+2h x1.5" }] });
    // Double time shows as such on a day that was worked.
    expect(dayRoster([{ projectId: "a", personId: "p9", date: "2026-11-16", status: "full" as const, overtimeHours: 3, overtimeRate: 2 as const }], [], "a", "2026-11-16", "2026-11-17").rows).toEqual([{ personId: "p9", note: "+3h x2" }]);
    expect(dayRoster(att, plan, "b", "2026-11-17", "2026-11-17")).toEqual({ from: "plan", rows: [{ personId: "p4", note: "" }] });
  });
  it("a day to come is the plan", () => expect(dayRoster(att, plan, "a", "2026-11-18", "2026-11-17")).toEqual({ from: "plan", rows: [{ personId: "p5", note: "half day" }] }));
});

describe("where one person is on a day (their own week on the phone)", () => {
  const sites = new Set(["a", "b"]);
  const att = [{ projectId: "b", personId: "p1", date: "2026-11-16", status: "half" as const, overtimeHours: 0 }, { projectId: "a", personId: "p1", date: "2026-11-17", status: "full" as const, overtimeHours: 2 }];
  const plan = [{ projectId: "a", personId: "p1", date: "2026-11-16" }, { projectId: "a", personId: "p1", date: "2026-11-18", part: "half" as const }, { projectId: "b", personId: "p1", date: "2026-11-18", part: "half" as const }, { projectId: "gone", personId: "p1", date: "2026-11-19" }, { projectId: "a", personId: "p2", date: "2026-11-17" }];
  it("a day gone is where they were marked in, not where they were planned", () => expect(personDay(att, plan, "p1", "2026-11-16", "2026-11-17", sites)).toEqual({ from: "timesheet", rows: [{ projectId: "b", half: true, overtimeHours: 0 }] }));
  it("a day gone with nothing marked is empty, whatever the plan said", () => expect(personDay([], plan, "p1", "2026-11-16", "2026-11-17", sites)).toEqual({ from: "timesheet", rows: [] }));
  it("today is the timesheet once they are marked, else the plan", () => {
    expect(personDay(att, plan, "p1", "2026-11-17", "2026-11-17", sites)).toEqual({ from: "timesheet", rows: [{ projectId: "a", half: false, overtimeHours: 2 }] });
    expect(personDay(att, plan, "p2", "2026-11-17", "2026-11-17", sites)).toEqual({ from: "plan", rows: [{ projectId: "a", half: false, overtimeHours: 0 }] });
  });
  it("a day to come is the plan, a split day on both sites, and only sites still running", () => {
    expect(personDay(att, plan, "p1", "2026-11-18", "2026-11-17", sites).rows.map((r) => [r.projectId, r.half])).toEqual([["a", true], ["b", true]]);
    expect(personDay(att, plan, "p1", "2026-11-19", "2026-11-17", sites).rows).toEqual([]);
  });
});
