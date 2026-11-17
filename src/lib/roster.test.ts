import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { Holiday, Project } from "@/data/types";
import { dropOutcome, leaveGroups, managerJobs, overlapping, perSite, periodDays, periodLabel, periodOptions, workingDays } from "./roster";

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
  const a = (projectId: string, personId: string, status: "full" | "half", overtimeHours = 0) => ({ projectId, personId, status, overtimeHours });
  it("groups by site then person, a half day counting a half, busiest first", () => {
    const out = perSite([a("s1", "p1", "full"), a("s1", "p1", "half"), a("s2", "p2", "full", 2), a("s2", "p2", "full"), a("s2", "p3", "full"), a("s1", "p4", "full")], (id) => id);
    expect(out.map((s) => [s.projectId, s.days])).toEqual([["s2", 3], ["s1", 2.5]]);
    expect(out[0]!.people).toEqual([{ personId: "p2", full: 2, half: 0, overtime: 2, days: 2 }, { personId: "p3", full: 1, half: 0, overtime: 0, days: 1 }]);
    expect(out[1]!.people.map((p) => [p.personId, p.days])).toEqual([["p1", 1.5], ["p4", 1]]);
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
