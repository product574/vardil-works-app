import { describe, expect, it } from "vitest";
import { along, programme, programmeWeeks } from "./programme";

const job = { startDate: "2026-10-05", endDate: "2026-12-18" };
const tasks = [
  { id: "a", description: "Strip out", done: true, completedAt: "2026-10-20T15:00:00" },
  { id: "b", description: "Stonework", done: false },
  { id: "c", description: "Leadwork", done: false },
  { id: "d", description: "Snag and hand over", done: false },
];

describe("the programme", () => {
  const rows = programme(job, tasks, "2026-11-20");
  it("spreads the scope across the job, first from the start and last to the finish", () => {
    expect(rows[0]!.start).toBe("2026-10-05");
    expect(rows.at(-1)!.end).toBe("2026-12-18");
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.start > rows[i - 1]!.start).toBe(true);
  });
  it("lets neighbouring items overlap", () => expect(rows[1]!.start < rows[0]!.end).toBe(true));
  it("marks what is done, late, under way and to come", () => {
    expect(rows.map((r) => r.state)).toEqual(["done", "late", "now", "later"]);
    expect(rows[0]!.doneOn).toBe("2026-10-20");
    expect(rows[1]!.lateBy).toBeGreaterThan(0);
  });
  it("lists the weeks from the Monday of the start", () => {
    const weeks = programmeWeeks(job.startDate, job.endDate);
    expect(weeks[0]).toBe("2026-10-05");
    expect(weeks.at(-1)! <= job.endDate).toBe(true);
  });
  it("places a day along the programme", () => {
    expect(along("2026-10-05", job.startDate, job.endDate)).toBe(0);
    expect(along("2027-01-30", job.startDate, job.endDate)).toBe(1);
  });
});
