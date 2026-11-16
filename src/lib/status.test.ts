import { describe, expect, it } from "vitest";
import { dueLabel, dueState, nextServiceDate } from "./status";

describe("due dates", () => {
  it("is overdue the day after expiry", () => {
    expect(dueState("2026-11-12", "2026-11-13")).toBe("overdue");
    expect(dueLabel("2026-11-12", "2026-11-13")).toBe("Overdue by 1 day");
  });
  it("warns inside 30 days, including the day itself", () => {
    expect(dueState("2026-11-13", "2026-11-13")).toBe("soon");
    expect(dueState("2026-12-13", "2026-11-13")).toBe("soon");
    expect(dueState("2026-12-14", "2026-11-13")).toBe("ok");
  });
});

describe("plant servicing", () => {
  it("projects an hours-based service from weekly use", () => {
    const n = nextServiceDate({ basis: "hours", intervalHours: 250, lastServiced: "2026-09-01", lastMeter: 1000, meterNow: 1150, hoursPerWeek: 25 }, "2026-11-13");
    expect(n).toEqual({ date: "2026-12-11", remaining: "100 hrs to go" });
  });
  it("shows how far over a missed service is", () => {
    const n = nextServiceDate({ basis: "km", intervalKm: 20000, lastServiced: "2026-03-01", lastMeter: 60000, meterNow: 81500, kmPerWeek: 500 }, "2026-11-13");
    expect(n.remaining).toBe("1,500 km over");
  });
});
