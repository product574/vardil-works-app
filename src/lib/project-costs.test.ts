import { describe, expect, it } from "vitest";
import { labourCost, paidHours, scopePercent, supplierCostByCategory } from "./project-costs";

describe("project cost to date", () => {
  it("pays a full day, a half day, and overtime at each rate", () => {
    expect(paidHours({ status: "full", overtimeHours: 0 })).toBe(8);
    expect(paidHours({ status: "half", overtimeHours: 0 })).toBe(4);
    expect(paidHours({ status: "full", overtimeHours: 2 })).toBe(11);
    // Double time hours are paid at twice the rate, and a day can have both rates (17 Nov).
    expect(paidHours({ status: "full", overtimeHours: 0, doubleHours: 2 })).toBe(12);
    expect(paidHours({ status: "full", overtimeHours: 7.5, doubleHours: 1.5 })).toBe(8 + 11.25 + 3);
    // A weekend or bank holiday time stamp has no normal day in it: only the overtime.
    expect(paidHours({ status: "restday", overtimeHours: 4, doubleHours: 2 })).toBe(10);
    expect(paidHours({ status: "restday", overtimeHours: 0, doubleHours: 5 })).toBe(10);
    expect(labourCost([{ status: "full", overtimeHours: 0, doubleHours: 2, hourlyRate: 20 }])).toBe(240);
    expect(labourCost([{ status: "restday", overtimeHours: 4, doubleHours: 2, hourlyRate: 30 }])).toBe(300);
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
