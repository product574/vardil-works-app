import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { projectCosts } from "@/data/figures";
import { labourState, profitTotals, siteProfit, wagesOf } from "./profitability";
import { costBreakdown } from "./quotes";

// Profitability by site: the outgoings for employees (Oisin, 17 Nov).
const rate = (id: string) => ({ a: 20, b: 30 })[id] ?? 0;
const full = (personId: string, date: string, overtimeHours = 0, doubleHours = 0) => ({ projectId: "s1", personId, date, status: "full" as const, overtimeHours, ...(doubleHours ? { doubleHours } : {}) });

describe("wages by rate", () => {
  it("pays a normal day on the 39 hour week: 8 hours, 7 on a Friday, half that for a half day", () => {
    // Thursday 12 and Friday 13 November 2026.
    expect(wagesOf([full("a", "2026-11-12")], rate)).toMatchObject({ basicHours: 8, basic: 160, total: 160, premium: 0 });
    expect(wagesOf([full("a", "2026-11-13")], rate)).toMatchObject({ basicHours: 7, basic: 140, total: 140 });
    expect(wagesOf([{ ...full("a", "2026-11-13"), status: "half" as const }], rate)).toMatchObject({ basicHours: 3.5, basic: 70 });
  });

  it("pays time and a half hours at one and a half times the rate and double time hours at twice it", () => {
    const w = wagesOf([full("a", "2026-11-11", 7.5, 1.5)], rate);
    expect(w).toMatchObject({ basicHours: 8, timeAndHalfHours: 7.5, doubleHours: 1.5, basic: 160, timeAndHalf: 225, double: 60, total: 445 });
    // What the overtime cost over the same hours at the basic rate: half as much again, and as much again.
    expect(w.premium).toBe(7.5 * 0.5 * 20 + 1.5 * 20);
  });

  it("pays a weekend or bank holiday time stamp at its overtime rates only: no basic hours", () => {
    const sat = { projectId: "s1", personId: "b", date: "2026-11-14", status: "restday" as const, overtimeHours: 4, doubleHours: 2 };
    expect(wagesOf([sat], rate)).toMatchObject({ basicHours: 0, basic: 0, timeAndHalf: 180, double: 120, total: 300, premium: 120 });
  });

  it("is nothing for no timesheets", () => expect(wagesOf([], rate).total).toBe(0));
});

describe("one site", () => {
  const people = [
    { id: "a", name: "Aine Daly", trade: "Mason", hourlyRate: 20 },
    { id: "b", name: "Brian Egan", trade: "Slater", hourlyRate: 30 },
  ];
  const att = [full("a", "2026-11-12"), full("a", "2026-11-11", 2), full("b", "2026-11-12"), { projectId: "s1", personId: "b", date: "2026-11-14", status: "restday" as const, overtimeHours: 4, doubleHours: 0 }, { ...full("a", "2026-11-12"), projectId: "s2" }];
  const claims = [
    { projectId: "s1", personId: "a", amount: 31.4, status: "Approved" },
    { projectId: "s1", personId: "b", amount: 50, status: "Waiting" },
    { projectId: "s1", personId: "b", amount: 12, status: "Declined" },
    { projectId: "s2", personId: "a", amount: 99, status: "Approved" },
  ];

  it("adds wages and approved reimbursements for that site only", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims, 1000);
    // Aine: 160 + 160 + 2h x 30. Brian: 240 + 4h x 45.
    expect(s.wages.total).toBe(160 + 160 + 60 + 240 + 180);
    expect(s.reimbursements).toBe(31.4);
    expect(s.outgoings).toBe(800 + 31.4);
  });

  it("measures the wages against the labour allowed in the quote and against the contract value", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims, 1000);
    expect(s).toMatchObject({ allowed: 1000, usedPct: 80, over: -200, value: 10000, shareOfValue: 8, left: 10000 - 831.4 });
    const over = siteProfit({ id: "s1", value: 10000 }, att, people, claims, 500);
    expect(over).toMatchObject({ usedPct: 160, over: 300 });
  });

  it("says nothing about the quote or the value where there is none", () => {
    const s = siteProfit({ id: "s1", value: null }, att, people, claims, null);
    expect(s).toMatchObject({ allowed: null, usedPct: null, over: null, value: null, shareOfValue: null, left: null });
  });

  it("lists who the wages went to, dearest first, with days, weekend days and reimbursements", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims, 1000);
    expect(s.people.map((p) => [p.name, p.days, p.restDays, p.wages.total, p.reimbursements])).toEqual([
      ["Brian Egan", 1, 1, 420, 0],
      ["Aine Daly", 2, 0, 380, 31.4],
    ]);
  });

  it("adds sites up", () => {
    const t = profitTotals([siteProfit({ id: "s1", value: 10000 }, att, people, claims, 1000), siteProfit({ id: "s2", value: 5000 }, att, people, claims, null)]);
    expect(t).toMatchObject({ wages: 960, reimbursements: 130.4, outgoings: 1090.4, allowed: 1000, value: 15000, left: 15000 - 1090.4 });
    // Overtime (60 + 180) as a share of the wage bill.
    expect(t.overtimeShare).toBe(25);
  });
});

describe("how the wages stand against the labour allowed", () => {
  it("is over once more is spent than allowed, ahead when wages outrun the work by ten points, else fine", () => {
    expect(labourState(null, 50)).toBe("none");
    expect(labourState(101, 100)).toBe("over");
    expect(labourState(70, 60)).toBe("ahead");
    expect(labourState(69, 60)).toBe("ok");
    expect(labourState(40, 60)).toBe("ok");
  });
});

describe("from the sample data", () => {
  const { db } = buildSeed("2026-11-17");
  it("gives every live site the same wages as the labour on Job costs", () => {
    for (const p of db.projects.filter((x) => x.status === "Live")) {
      const quote = db.quotes.find((q) => q.id === p.quoteId);
      const s = siteProfit(p, db.attendance, db.people, db.expenses, quote ? costBreakdown(quote.costing).labour : null);
      expect(s.wages.total, p.code).toBe(projectCosts(db, p).labour);
      expect(Math.abs(s.wages.basic + s.wages.timeAndHalf + s.wages.double - s.wages.total), p.code).toBeLessThan(0.02);
      expect(s.people.reduce((n, x) => n + x.wages.total, 0), p.code).toBeCloseTo(s.wages.total, 1);
    }
  });
  it("shows double time and weekend work in Derrybawn Bridge's wages, and the approved reimbursement on the Old Corn Mill", () => {
    const c724 = db.projects.find((p) => p.code === "C724")!;
    const s = siteProfit(c724, db.attendance, db.people, db.expenses, null);
    expect(s.wages.doubleHours).toBe(1.5 + 1.5 + 2 + 2);
    expect(s.people.filter((p) => p.restDays > 0)).toHaveLength(3);
    const c721 = db.projects.find((p) => p.code === "C721")!;
    expect(siteProfit(c721, db.attendance, db.people, db.expenses, null).reimbursements).toBe(31.4);
  });
});
