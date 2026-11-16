import { describe, expect, it } from "vitest";
import { availabilityLine, daysLabel, freeDays, openDays, personWeek, planClashes, planShort } from "./availability";

const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
const live = new Set(["a", "b"]);
const code = (id: string) => ({ a: "C719", b: "C723" })[id] ?? id;

describe("who is free in a week", () => {
  it("someone with nothing planned is free all week", () => {
    const w = personWeek([], [], live, "p1", week);
    expect(freeDays(w)).toEqual(week);
    expect(availabilityLine(w, code)).toBe("Free all week");
  });
  it("someone on a site every day is not free at all", () => {
    const plan = week.map((date) => ({ projectId: "b", personId: "p1", date }));
    const w = personWeek(plan, [], live, "p1", week);
    expect(freeDays(w)).toEqual([]);
    expect(availabilityLine(w, code)).toBe("On C723 all week");
  });
  it("part weeks say which days are free and where the rest are spent", () => {
    const plan = week.slice(2).map((date) => ({ projectId: "b", personId: "p1", date }));
    const w = personWeek(plan, [], live, "p1", week);
    expect(freeDays(w)).toEqual(week.slice(0, 2));
    expect(availabilityLine(w, code)).toBe("Free Mon, Tue; on C723 Wed to Fri");
  });
  it("approved leave is not free time, requested leave is", () => {
    const hols = [
      { personId: "p1", status: "Approved", from: week[0]!, to: week[0]! },
      { personId: "p1", status: "Requested", from: week[4]!, to: week[4]! },
    ];
    const w = personWeek([], hols, live, "p1", week);
    expect(freeDays(w)).toEqual(week.slice(1));
    expect(availabilityLine(w, code)).toBe("Free Tue to Fri; on leave Mon");
  });
  it("days planned on a finished or closed project do not count", () => {
    const w = personWeek([{ projectId: "old", personId: "p1", date: week[0]! }], [], live, "p1", week);
    expect(freeDays(w)).toEqual(week);
  });
  it("other people's days are ignored", () => {
    const w = personWeek([{ projectId: "a", personId: "p2", date: week[0]! }], [], live, "p1", week);
    expect(freeDays(w)).toEqual(week);
  });
  it("labels runs and gaps plainly", () => {
    expect(daysLabel([week[0]!, week[2]!], week)).toBe("Mon, Wed");
    expect(daysLabel(week.slice(1, 4), week)).toBe("Tue to Thu");
    expect(daysLabel(week, week)).toBe("all week");
  });
});

describe("half days, overtime and double bookings", () => {
  const d = week[2]!;
  it("a half day leaves the other half open, so the day is not free but still has room", () => {
    const w = personWeek([{ projectId: "a", personId: "p1", date: d, part: "half" }], [], live, "p1", week);
    expect(w[2]!.load).toBe(0.5);
    expect(freeDays(w)).not.toContain(d);
    expect(openDays(w)).toContain(d);
  });
  it("two half days on two sites is a split day, not a double booking", () => {
    const plan = [
      { projectId: "a", personId: "p1", date: d, part: "half" as const },
      { projectId: "b", personId: "p1", date: d, part: "half" as const },
    ];
    expect(planClashes(plan).size).toBe(0);
    expect(openDays(personWeek(plan, [], live, "p1", week))).not.toContain(d);
  });
  it("a full day plus a half day elsewhere is a double booking", () => {
    const plan = [
      { projectId: "a", personId: "p1", date: d },
      { projectId: "b", personId: "p1", date: d, part: "half" as const },
    ];
    expect(planClashes(plan).get(`p1|${d}`)).toEqual(["a", "b"]);
  });
  it("two full days on two sites is a double booking", () => {
    const plan = [
      { projectId: "a", personId: "p1", date: d },
      { projectId: "b", personId: "p1", date: d },
    ];
    expect([...planClashes(plan).keys()]).toEqual([`p1|${d}`]);
  });
  it("planned overtime does not make a clash on its own", () => {
    expect(planClashes([{ projectId: "a", personId: "p1", date: d, overtimeHours: 3 }]).size).toBe(0);
  });
  it("reads plainly in a cell", () => {
    expect(planShort({})).toBe("On site");
    expect(planShort({ part: "half" })).toBe("Half day");
    expect(planShort({ overtimeHours: 2 })).toBe("On site +2h");
  });
});
