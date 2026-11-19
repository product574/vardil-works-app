import { beforeEach, describe, expect, it } from "vitest";
import { personWeek } from "@/lib/availability";
import { dayRoster, personDay } from "@/lib/roster";
import { actAs, decideHoliday, decideSiteRequest, markAttendance, planDays, removeFromRoster, requestPerson, setEmployeeActive, setPlanDay } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";

// The week ahead, the month ahead and both phones are one plan read one way (Oisin, 17 Nov:
// "make sure the week and month ahead all syncs up together through the different apps").
// Every way the plan can change is checked here against every way it is shown.
const DAY = "2026-11-17"; // a Tuesday
const MON = "2026-11-23";
const TUE = "2026-11-24";
const WED = "2026-11-25";
const db = () => useData.getState().db;
const running = () => new Set(db().projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));

/** A site's day as the office's week grid, the month grid and the site manager's phone all show it. */
const onSite = (siteId: string, date: string) => dayRoster(db().attendance, db().plan, siteId, date, DAY).rows.map((r) => r.personId).sort();
/** A person's day as their own phone shows it in My week. */
const onPhone = (personId: string, date: string) => personDay(db().attendance, db().plan, personId, date, DAY, running()).rows.map((r) => r.projectId).sort();
/** How full their day is, for Not placed and the lists of who is free. */
const load = (personId: string, date: string) => personWeek(db().plan, db().holidays, running(), personId, [date])[0]!.load;

/** Every screen agrees this person is on this site that day. */
function expectOn(personId: string, siteId: string, date: string) {
  expect(onSite(siteId, date)).toContain(personId);
  expect(onPhone(personId, date)).toContain(siteId);
  expect(load(personId, date)).toBeGreaterThan(0);
}
/** Every screen agrees they are not. */
function expectOff(personId: string, siteId: string, date: string) {
  expect(onSite(siteId, date)).not.toContain(personId);
  expect(onPhone(personId, date)).not.toContain(siteId);
}

const RAFAEL = "p-122"; // free all of next week in the sample data
const ADRIAN = "p-120"; // free all of next week too

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("one plan, shown the same everywhere", () => {
  it("starts in step: every planned day next week is on the site's day and on that person's phone", () => {
    const next = db().plan.filter((p) => p.date >= MON && p.date <= "2026-11-27" && running().has(p.projectId));
    expect(next.length).toBeGreaterThan(40);
    for (const p of next) expectOn(p.personId, p.projectId, p.date);
  });

  it("a day set on the week ahead shows on the month ahead and both phones", () => {
    expectOff(RAFAEL, "pr-C719", MON);
    setPlanDay("pr-C719", RAFAEL, MON, { part: "full", overtimeHours: 0 });
    expectOn(RAFAEL, "pr-C719", MON);
    expect(load(RAFAEL, MON)).toBe(1);
  });

  it("days repeated from the month ahead show on the week ahead and both phones", () => {
    expect(planDays("pr-C720", ADRIAN, [{ date: MON }, { date: TUE }, { date: WED }])).toBe(3);
    for (const d of [MON, TUE, WED]) expectOn(ADRIAN, "pr-C720", d);
    expectOff(ADRIAN, "pr-C720", "2026-11-26");
  });

  it("someone moved to another site leaves the first one on every screen", () => {
    const from = db().plan.find((p) => p.date === MON && p.projectId === "pr-C719" && !p.part)!;
    expectOn(from.personId, "pr-C719", MON);
    planDays("pr-C720", from.personId, [{ date: MON, moveFrom: "pr-C719" }]);
    expectOff(from.personId, "pr-C719", MON);
    expectOn(from.personId, "pr-C720", MON);
    expect(load(from.personId, MON)).toBe(1);
  });

  it("someone taken off a day is gone from every screen, and free again", () => {
    const was = db().plan.find((p) => p.date === TUE && p.projectId === "pr-C720" && !p.part)!;
    setPlanDay("pr-C720", was.personId, TUE, null);
    expectOff(was.personId, "pr-C720", TUE);
    expect(load(was.personId, TUE)).toBe(0);
  });

  it("a person asked for on the site manager's phone is on every screen once the office says yes, and not before", () => {
    actAs("p-sm1", () => requestPerson("pr-C719", RAFAEL, WED, "Lime wash to the vestry"));
    expectOff(RAFAEL, "pr-C719", WED);
    expect(decideSiteRequest(db().requests[0]!.id, true)).toBe("planned");
    expectOn(RAFAEL, "pr-C719", WED);
  });

  it("approved leave takes the days off every screen", () => {
    const h = db().holidays.find((x) => x.status === "Requested" && db().plan.some((p) => p.personId === x.personId && p.date >= x.from && p.date <= x.to && p.date > DAY));
    expect(h).toBeDefined();
    const days = db().plan.filter((p) => p.personId === h!.personId && p.date >= h!.from && p.date <= h!.to && p.date > DAY);
    expect(decideHoliday(h!.id, true)).toBeGreaterThan(0);
    for (const p of days) expectOff(p.personId, p.projectId, p.date);
  });

  it("someone taken off a site altogether has no day to come there on any screen", () => {
    const row = db().plan.find((p) => p.date === MON && p.projectId === "pr-C721")!;
    removeFromRoster("pr-C721", row.personId);
    for (const d of [MON, TUE, WED]) expectOff(row.personId, "pr-C721", d);
  });

  it("an archived employee is on no day to come", () => {
    const row = db().plan.find((p) => p.date === MON && p.projectId === "pr-C722")!;
    setEmployeeActive(row.personId, false);
    expectOff(row.personId, "pr-C722", MON);
    expect(db().plan.some((p) => p.personId === row.personId && p.date > DAY)).toBe(false);
  });
});

describe("days gone come from the timesheet on every screen", () => {
  it("yesterday shows who was marked in, on the site's day and on their own phone", () => {
    const marked = db().attendance.filter((a) => a.date === "2026-11-16" && a.projectId === "pr-C720");
    expect(marked.length).toBeGreaterThan(3);
    expect(onSite("pr-C720", "2026-11-16")).toEqual(marked.map((a) => a.personId).sort());
    for (const a of marked) expect(onPhone(a.personId, "2026-11-16")).toContain("pr-C720");
  });

  it("today shows the plan until the site marks someone in, then the timesheet, everywhere at once", () => {
    const site = db().projects.find((p) => p.status === "Live" && !db().attendance.some((a) => a.projectId === p.id && a.date === DAY) && db().plan.some((x) => x.projectId === p.id && x.date === DAY));
    expect(site).toBeDefined();
    const planned = db().plan.filter((x) => x.projectId === site!.id && x.date === DAY).map((x) => x.personId).sort();
    expect(dayRoster(db().attendance, db().plan, site!.id, DAY, DAY).from).toBe("plan");
    expect(onSite(site!.id, DAY)).toEqual(planned);
    usePrefs.setState({ role: "site", asPersonId: site!.siteManagerId });
    markAttendance(site!.id, planned[0]!, DAY, { status: "half", overtimeHours: 0 });
    expect(dayRoster(db().attendance, db().plan, site!.id, DAY, DAY)).toEqual({ from: "timesheet", rows: [{ personId: planned[0], note: "half day" }] });
    expect(personDay(db().attendance, db().plan, planned[0]!, DAY, DAY, running())).toEqual({ from: "timesheet", rows: [{ projectId: site!.id, half: true, overtimeHours: 0 }] });
  });
});
