import { describe, expect, it } from "vitest";
import type { RepairInvoice, Vehicle } from "@/data/types";
import { byMonth, chartMonths, complianceDue, duplicateGroups, filterLines, groupSpend, guessCategory, invoiceCount, invoiceWarnings, periodStart, recentRepair, sameNumber, spendLines, sumInvoices, testName, totalOf } from "./fleet-spend";

let n = 0;
const inv = (date: string, garageId: string, no: string, lines: [vehicleId: string, amount: number, baseId?: string, driverId?: string][], extra: Partial<RepairInvoice> = {}): RepairInvoice => ({
  id: `inv-${++n}`,
  invoiceNo: no,
  garageId,
  date,
  lines: lines.map(([vehicleId, amount, baseId = "b-1", driverId = "d-1"], i) => ({ id: `l-${n}-${i}`, vehicleId, baseId, siteId: baseId === "b-1" ? "s-1" : "s-2", driverId, category: "Service", description: "Service", mileage: null, amount })),
  total: lines.reduce((t, l) => t + l[1], 0),
  vat: null,
  status: "Checked",
  enteredBy: "Test",
  enteredAt: `${date}T09:00:00`,
  ...extra,
});

describe("periods", () => {
  it("starts a period the day after the same date that many months back", () => {
    expect(periodStart("1m", "2026-11-17")).toBe("2026-10-18");
    expect(periodStart("1y", "2026-11-17")).toBe("2025-11-18");
    expect(periodStart("5y", "2026-11-17")).toBe("2021-11-18");
  });
  it("shows between 6 and 24 bars", () => {
    expect(chartMonths("1m")).toBe(6);
    expect(chartMonths("1y")).toBe(12);
    expect(chartMonths("5y")).toBe(24);
  });
});

describe("spend", () => {
  const invoices = [
    inv("2026-11-10", "g-1", "A-1", [["v-1", 100, "b-1", "d-1"]]),
    inv("2026-11-12", "g-2", "B-1", [["v-1", 50.5, "b-1", "d-1"], ["v-2", 200, "b-2", "d-2"]]),
    inv("2026-09-01", "g-1", "A-0", [["v-2", 300, "b-2", "d-2"]]),
  ];
  const lines = spendLines(invoices);
  it("gives one line per vehicle on an invoice, carrying the invoice's date and garage", () => {
    expect(lines).toHaveLength(4);
    expect(lines.filter((l) => l.invoiceNo === "B-1").map((l) => l.vehicleId)).toEqual(["v-1", "v-2"]);
    expect(lines[1]!.garageId).toBe("g-2");
  });
  it("filters by dates, base, garage, driver and vehicle", () => {
    expect(totalOf(filterLines(lines, { from: "2026-11-01", to: "2026-11-30" }))).toBe(350.5);
    expect(totalOf(filterLines(lines, { baseId: "b-2" }))).toBe(500);
    expect(totalOf(filterLines(lines, { garageId: "g-1" }))).toBe(400);
    expect(totalOf(filterLines(lines, { driverId: "d-1" }))).toBe(150.5);
    // Routes filter the same way: the route the van was on that day.
    expect(totalOf(filterLines(lines, { siteId: "s-1" }))).toBe(totalOf(filterLines(lines, { baseId: "b-1" })));
    expect(totalOf(filterLines(lines, { vehicleId: "v-2", from: "2026-11-01" }))).toBe(200);
  });
  it("groups largest first and counts whole invoices, not lines", () => {
    const g = groupSpend(lines, (l) => l.baseId);
    expect(g.map((x) => [x.key, x.total])).toEqual([["b-2", 500], ["b-1", 150.5]]);
    expect(g[0]!.invoices).toBe(2);
    expect(invoiceCount(lines)).toBe(3);
    expect(sumInvoices(invoices)).toBe(650.5);
  });
  it("adds up by month, with empty months shown as zero", () => {
    const m = byMonth(lines, "2026-11-17", 3);
    expect(m.map((x) => [x.month, x.total, x.vehicles])).toEqual([["2026-09", 300, 1], ["2026-10", 0, 0], ["2026-11", 350.5, 2]]);
  });
  it("keeps cents exact", () => {
    expect(totalOf([{ amount: 0.1 }, { amount: 0.2 }])).toBe(0.3);
  });
});

describe("warnings", () => {
  it("flags the same number from the same garage, however it is typed, and not from another garage", () => {
    const a = inv("2026-10-01", "g-1", "CM-100", [["v-1", 100]]);
    const b = inv("2026-10-08", "g-1", "cm 100", [["v-1", 100]]);
    const c = inv("2026-10-08", "g-2", "CM-100", [["v-3", 80]]);
    expect(duplicateGroups([a, b, c]).map((g) => g.map((i) => i.id))).toEqual([[a.id, b.id]]);
    expect(sameNumber([a, c], "g-1", "CM 100")?.id).toBe(a.id);
    expect(sameNumber([a, c], "g-1", "")).toBeUndefined();
    expect(sameNumber([a], "g-1", "CM-100", a.id)).toBeUndefined();
  });
  it("flags a vehicle repaired twice inside 30 days, once, with the days between", () => {
    const a = inv("2026-11-01", "g-1", "X-1", [["v-1", 100]]);
    const b = inv("2026-11-10", "g-1", "X-2", [["v-1", 100]]);
    const far = inv("2026-08-01", "g-1", "X-0", [["v-1", 100]]);
    const w = invoiceWarnings([a, b, far], "2026-11-17");
    expect(w).toEqual([{ kind: "repeat", invoiceIds: [a.id, b.id], vehicleId: "v-1", days: 9, first: "2026-11-01", second: "2026-11-10" }]);
  });
  it("does not flag repairs more than 30 days apart, or an old pair", () => {
    expect(invoiceWarnings([inv("2026-09-01", "g-1", "Y-1", [["v-1", 1]]), inv("2026-11-10", "g-1", "Y-2", [["v-1", 1]])], "2026-11-17")).toEqual([]);
    expect(invoiceWarnings([inv("2026-03-01", "g-1", "Z-1", [["v-1", 1]]), inv("2026-03-05", "g-1", "Z-2", [["v-1", 1]])], "2026-11-17")).toEqual([]);
  });
  it("does not call two copies of a duplicated invoice a repeat repair", () => {
    const a = inv("2026-11-05", "g-1", "D-1", [["v-1", 100]]);
    const b = inv("2026-11-05", "g-1", "D-1", [["v-1", 100]]);
    expect(invoiceWarnings([a, b], "2026-11-17").map((w) => w.kind)).toEqual(["duplicate"]);
  });
  it("tells the uploader when the vehicle was repaired in the last 30 days", () => {
    const a = inv("2026-11-01", "g-1", "R-1", [["v-1", 100]]);
    expect(recentRepair([a], "v-1", "2026-11-10")).toEqual({ date: "2026-11-01", days: 9, invoiceNo: "R-1" });
    expect(recentRepair([a], "v-1", "2026-12-15")).toBeNull();
    expect(recentRepair([a], "v-2", "2026-11-10")).toBeNull();
  });
});

describe("category guess", () => {
  it("reads the work done", () => {
    expect(guessCategory("Rear brake pads")).toBe("Brakes");
    expect(guessCategory("Two front tyres fitted")).toBe("Tyres");
    expect(guessCategory("Full service, oil and filters")).toBe("Service");
    expect(guessCategory("Windscreen replaced")).toBe("Glass");
    expect(guessCategory("Recovered to garage after breakdown")).toBe("Breakdown and recovery");
    expect(guessCategory("Pre-CVRT check")).toBe("Test preparation");
    expect(guessCategory("MOT preparation")).toBe("Test preparation");
    expect(guessCategory("Valet")).toBe("Other");
  });
});

describe("tax, test and insurance", () => {
  const v = (id: string, kind: Vehicle["kind"], tax: string, test: string, ins: string, active = true): Vehicle => ({
    id, reg: id, make: "M", model: "X", kind, fuel: "Diesel", division: "", ownership: "Owned", baseId: null, driverId: null, purchasePrice: null, purchaseMonth: null, mileage: 0, active, sellPrice: null, service: { basis: "months", intervalMonths: 12, lastServiced: "2026-01-01" },
    compliance: { tax: { paidDate: "", expiryDate: tax, amount: 0 }, test: { paidDate: "", expiryDate: test, amount: 0 }, insurance: { paidDate: "", expiryDate: ins, amount: 0 } },
  });
  it("commercial vehicles take the CVRT, a car the NCT, and every vehicle the MOT in the UK", () => {
    expect(testName("Van")).toBe("CVRT");
    expect(testName("Tipper")).toBe("CVRT");
    expect(testName("Car")).toBe("NCT");
    expect(testName("Car", "UK")).toBe("MOT");
    expect(testName("Crew van", "UK")).toBe("MOT");
  });
  it("lists every date soonest first, with its state, leaving out removed vehicles and missing dates", () => {
    const due = complianceDue([v("a", "Van", "2026-11-10", "2026-12-01", "2027-06-01"), v("b", "Car", "2026-11-20", "", "2027-01-01"), v("c", "Car", "2026-01-01", "2026-01-01", "2026-01-01", false)], "2026-11-17");
    expect(due.map((x) => [x.vehicle.id, x.label, x.state])).toEqual([["a", "Motor tax", "overdue"], ["b", "Motor tax", "soon"], ["a", "CVRT", "soon"], ["b", "Insurance", "ok"], ["a", "Insurance", "ok"]]);
    expect(due[0]!.days).toBe(-7);
  });
});
