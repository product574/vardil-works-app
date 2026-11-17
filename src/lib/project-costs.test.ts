import { describe, expect, it } from "vitest";
import { labourCost, paidHours, scopePercent, supplierCostByCategory } from "./project-costs";

describe("project cost to date", () => {
  it("pays a full day, a half day, and overtime at time and a half", () => {
    expect(paidHours("full", 0)).toBe(8);
    expect(paidHours("half", 0)).toBe(4);
    expect(paidHours("full", 2)).toBe(11);
    // Double time overtime is paid at twice the rate (17 Nov); a half day has no overtime to double.
    expect(paidHours("full", 2, 2)).toBe(12);
    expect(paidHours("full", 2, 1.5)).toBe(11);
    expect(labourCost([{ status: "full", overtimeHours: 2, overtimeRate: 2, hourlyRate: 20 }])).toBe(240);
  });
  it("costs labour at each person's own rate", () => {
    expect(labourCost([{ status: "full", overtimeHours: 0, hourlyRate: 30 }, { status: "half", overtimeHours: 0, hourlyRate: 20 }])).toBe(320);
  });
  it("takes credit notes off supplier costs", () => {
    expect(supplierCostByCategory([{ category: "material", amount: 1000, credit: false }, { category: "material", amount: 215, credit: true }, { category: "plant", amount: 500, credit: false }])).toEqual({ material: 785, plant: 500 });
  });
  it("gives scope progress as a whole percentage", () => {
    expect(scopePercent([{ done: true }, { done: true }, { done: false }])).toBe(67);
    expect(scopePercent([])).toBe(0);
  });
});
