import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { jobInvoices, projectCosts } from "@/data/figures";
import { profitState, profitTotals, siteProfit, wagesOf } from "./profitability";

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
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims);
    // Aine: 160 + 160 + 2h x 30. Brian: 240 + 4h x 45.
    expect(s.wages.total).toBe(160 + 160 + 60 + 240 + 180);
    expect(s.reimbursements).toBe(31.4);
    expect(s.outgoings).toBe(800 + 31.4);
  });

  it("measures the wages against the contract value", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims);
    expect(s).toMatchObject({ value: 10000, shareOfValue: 8, netProfit: 10000 - 831.4 });
    // The labour allowed in the quote is gone everywhere (round ten).
    expect(s).not.toHaveProperty("allowed");
    expect(s).not.toHaveProperty("usedPct");
  });

  it("takes the invoices for the job, under four headings, off the contract value to give the net profit", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims, { plantHire: 900, materials: 1500.6, subcontractors: 1500, other: 268 });
    expect(s).toMatchObject({ plantHire: 900, materials: 1500.6, subcontractors: 1500, other: 268, costs: 831.4 + 900 + 1500.6 + 1500 + 268, netProfit: 5000, netPct: 50 });
    // With no invoices in, it is what is left after employees.
    expect(siteProfit({ id: "s1", value: 10000 }, att, people, claims)).toMatchObject({ plantHire: 0, materials: 0, subcontractors: 0, other: 0, netProfit: 10000 - 831.4, netPct: 91.7 });
    // A job that cost more than it was worth shows the loss as it is.
    expect(siteProfit({ id: "s1", value: 3000 }, att, people, claims, { plantHire: 500, materials: 500, subcontractors: 1500, other: 0 })).toMatchObject({ netProfit: -331.4, netPct: -11 });
  });

  it("says nothing about the value where there is none", () => {
    const s = siteProfit({ id: "s1", value: null }, att, people, claims, { plantHire: 5, materials: 10, subcontractors: 10, other: 5 });
    expect(s).toMatchObject({ value: null, shareOfValue: null, netProfit: null, netPct: null, costs: 831.4 + 30 });
  });

  it("lists who the wages went to, dearest first, with days, weekend days and reimbursements", () => {
    const s = siteProfit({ id: "s1", value: 10000 }, att, people, claims);
    expect(s.people.map((p) => [p.name, p.days, p.restDays, p.wages.total, p.reimbursements])).toEqual([
      ["Brian Egan", 1, 1, 420, 0],
      ["Aine Daly", 2, 0, 380, 31.4],
    ]);
  });

  it("adds sites up", () => {
    const t = profitTotals([siteProfit({ id: "s1", value: 10000 }, att, people, claims, { plantHire: 600, materials: 1200, subcontractors: 1000, other: 200 }), siteProfit({ id: "s2", value: 5000 }, att, people, claims, { plantHire: 100, materials: 400, subcontractors: 0, other: 0 })]);
    expect(t).toMatchObject({ wages: 960, reimbursements: 130.4, outgoings: 1090.4, value: 15000, plantHire: 700, materials: 1600, subcontractors: 1000, other: 200, costs: 1090.4 + 3500, netProfit: 15000 - 1090.4 - 3500 });
    expect(t.netPct).toBe(69.4);
    // Overtime (60 + 180) as a share of the wage bill.
    expect(t.overtimeShare).toBe(25);
  });
});

describe("how a finished job came out", () => {
  it("is a loss below nought, thin under ten per cent, else fine", () => {
    expect(profitState(null)).toBe("none");
    expect(profitState(-0.1)).toBe("loss");
    expect(profitState(0)).toBe("thin");
    expect(profitState(9.9)).toBe("thin");
    expect(profitState(10)).toBe("ok");
    expect(profitState(31)).toBe("ok");
  });
});

describe("from the sample data", () => {
  const { db } = buildSeed("2026-11-17");
  it("gives every live site the same wages as the labour on Job costs", () => {
    for (const p of db.projects.filter((x) => x.status === "Live")) {
      const s = siteProfit(p, db.attendance, db.people, db.expenses);
      expect(s.wages.total, p.code).toBe(projectCosts(db, p).labour);
      expect(Math.abs(s.wages.basic + s.wages.timeAndHalf + s.wages.double - s.wages.total), p.code).toBeLessThan(0.02);
      expect(s.people.reduce((n, x) => n + x.wages.total, 0), p.code).toBeCloseTo(s.wages.total, 1);
    }
  });
  it("shows double time and weekend work in Derrybawn Bridge's wages, and the approved reimbursement on the Old Corn Mill", () => {
    const c724 = db.projects.find((p) => p.code === "C724")!;
    const s = siteProfit(c724, db.attendance, db.people, db.expenses);
    expect(s.wages.doubleHours).toBe(1.5 + 1.5 + 2 + 2);
    expect(s.people.filter((p) => p.restDays > 0)).toHaveLength(3);
    const c721 = db.projects.find((p) => p.code === "C721")!;
    expect(siteProfit(c721, db.attendance, db.people, db.expenses).reimbursements).toBe(31.4);
  });
  it("gives every site, live or finished, a result that is its value less the wages, reimbursements and invoices on Job costs", () => {
    const sites = db.projects.filter((x) => ["Live", "Complete", "Invoiced", "Closed"].includes(x.status));
    for (const p of sites) {
      const inv = jobInvoices(db, p);
      const costs = projectCosts(db, p);
      // The four headings together are everything on Job costs but the firm's own labour.
      expect(inv.plantHire + inv.materials + inv.subcontractors + inv.other, p.code).toBeCloseTo(costs.cost - costs.labour, 1);
      // Plant and hire is the same figure as plant on Job costs (equipment included); materials too.
      expect(inv.plantHire, p.code).toBeCloseTo(costs.plant, 1);
      expect(inv.materials, p.code).toBeCloseTo(costs.material, 1);
      const s = siteProfit(p, db.attendance, db.people, db.expenses, inv);
      expect(s.netProfit, p.code).toBeCloseTo((p.value ?? 0) - costs.cost - s.reimbursements, 1);
      expect(s.netPct, p.code).not.toBeNull();
    }
    // Between them the sites have invoices under every heading.
    for (const k of ["plantHire", "materials", "subcontractors", "other"] as const) expect(sites.some((p) => jobInvoices(db, p)[k] > 0), k).toBe(true);
    // Live sites have costs in so far, beyond wages.
    expect(db.projects.filter((x) => x.status === "Live").every((p) => jobInvoices(db, p).materials > 0)).toBe(true);
  });
});
