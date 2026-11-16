import { describe, expect, it } from "vitest";
import { rollingWorkdays } from "./dates";
import { findDateConflicts, onHoliday } from "./conflicts";

describe("planned days on Site personnel", () => {
  it("Friday shows next Monday to Friday, not today", () => {
    expect(rollingWorkdays("2026-11-06")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]);
  });
  it("Monday shows Tuesday to next Monday, not today", () => {
    expect(rollingWorkdays("2026-11-09")).toEqual(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16"]);
  });
  it("Saturday starts from next Monday", () => {
    expect(rollingWorkdays("2026-11-07")[0]).toBe("2026-11-09");
  });
});

describe("holidays", () => {
  const h = [{ employee_id: "e1", start_date: "2026-11-10", end_date: "2026-11-12" }];
  it("blocks dates inside the holiday, inclusive", () => {
    expect(onHoliday(h, "e1", "2026-11-10")).toBe(true);
    expect(onHoliday(h, "e1", "2026-11-12")).toBe(true);
  });
  it("allows dates outside it and other employees", () => {
    expect(onHoliday(h, "e1", "2026-11-13")).toBe(false);
    expect(onHoliday(h, "e2", "2026-11-11")).toBe(false);
  });
});

describe("double booking", () => {
  it("flags someone planned on two sites the same date", () => {
    const c = findDateConflicts([
      { site_id: "A", employee_id: "e1", work_date: "2026-11-10" },
      { site_id: "B", employee_id: "e1", work_date: "2026-11-10" },
      { site_id: "B", employee_id: "e1", work_date: "2026-11-11" },
    ]);
    expect(c.get("e1|2026-11-10")).toEqual(["A", "B"]);
    expect(c.has("e1|2026-11-11")).toBe(false);
  });
});
