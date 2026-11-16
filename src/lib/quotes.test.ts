import { describe, expect, it } from "vitest";
import { costBreakdown, marginFlag, marginPct, quoteTotal } from "./quotes";

const costing = {
  labour: [{ trade: "Stonemason", hours: 80, rate: 38 }],
  materials: [{ item: "NHL 3.5 lime", qty: 40, unit: "bag", rate: 21.5 }],
  plant: [{ item: "Mortar mixer", days: 10, rate: 18 }],
  subcontract: 1200,
  prelims: 600,
};

describe("quote arithmetic", () => {
  it("totals the priced lines", () => {
    expect(quoteTotal([{ qty: 120, rate: 85 }, { qty: 1, rate: 950.5 }])).toBe(11150.5);
  });
  it("adds up every cost heading", () => {
    expect(costBreakdown(costing)).toEqual({ labour: 3040, materials: 860, plant: 180, subcontract: 1200, prelims: 600, total: 5880 });
  });
  it("works margin out against the selling price", () => {
    expect(marginPct(10000, 7500)).toBe(25);
    expect(marginPct(0, 500)).toBeNull();
  });
  it("flags thin and loss-making quotes", () => {
    expect(marginFlag(25)).toBe("none");
    expect(marginFlag(8)).toBe("thin");
    expect(marginFlag(-4)).toBe("loss");
  });
});
