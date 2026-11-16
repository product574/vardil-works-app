import { describe, expect, it } from "vitest";
import { findConflicts } from "./conflicts";
import { weekStartOf } from "./dates";

const base = { mon: false, tue: false, wed: false, thu: false, fri: false };

describe("weekday conflicts", () => {
  it("flags an employee ticked on two sites the same day", () => {
    const c = findConflicts([
      { ...base, site_id: "A", employee_id: "e1", wed: true },
      { ...base, site_id: "B", employee_id: "e1", wed: true, thu: true },
    ]);
    expect(c.get("e1")?.wed).toEqual(["A", "B"]);
    expect(c.get("e1")?.thu).toBeUndefined();
  });
  it("does not flag different days", () => {
    const c = findConflicts([
      { ...base, site_id: "A", employee_id: "e1", mon: true },
      { ...base, site_id: "B", employee_id: "e1", tue: true },
    ]);
    expect(c.size).toBe(0);
  });
});

describe("week commencing Monday", () => {
  it("uses Monday for a weekday", () => {
    expect(weekStartOf("2026-11-05")).toBe("2026-11-02");
  });
  it("keeps the week just ended on Saturday and Sunday", () => {
    expect(weekStartOf("2026-11-07")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08")).toBe("2026-11-02");
  });
});
