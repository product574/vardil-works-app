import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { latestCheck, monthsBefore, readFleetFile, repairSpend, searchVehicles, SPEND_PERIODS } from "./fleet";

// The Fleet page (Oisin, 17 Nov): search, repair spend over a period, and matching an uploaded
// document to its vehicle by registration.
const fleet = [
  { id: "a", reg: "231-G-4471", model: "Ford Transit Custom", mileage: 40000 },
  { id: "b", reg: "222-G-1180", model: "Toyota Hilux", mileage: 20000 },
  { id: "c", reg: "31-G-447", model: "Ford Transit Tipper", mileage: 0 },
];

describe("searching the fleet", () => {
  it("finds by registration however it is typed", () => {
    expect(searchVehicles(fleet, "231-G").map((v) => v.id)).toEqual(["a"]);
    expect(searchVehicles(fleet, "231 g 44").map((v) => v.id)).toEqual(["a"]);
    expect(searchVehicles(fleet, "1180").map((v) => v.id)).toEqual(["b"]);
  });
  it("finds by model, every word", () => {
    expect(searchVehicles(fleet, "transit").map((v) => v.id)).toEqual(["a", "c"]);
    expect(searchVehicles(fleet, "ford tipper").map((v) => v.id)).toEqual(["c"]);
    expect(searchVehicles(fleet, "hilux 222").map((v) => v.id)).toEqual(["b"]);
  });
  it("gives everything for an empty box and nothing for no match", () => {
    expect(searchVehicles(fleet, "  ")).toHaveLength(3);
    expect(searchVehicles(fleet, "volvo")).toEqual([]);
    expect(searchVehicles(fleet, "-")).toEqual([]);
  });
});

describe("repair spend over a period", () => {
  it("offers the six periods of the Oldstone tool", () => {
    expect(SPEND_PERIODS.map((p) => p.label)).toEqual(["1 month", "3 months", "6 months", "1 year", "2 years", "5 years"]);
  });
  it("counts back in calendar months, keeping inside short months", () => {
    expect(monthsBefore("2026-11-17", 1)).toBe("2026-10-17");
    expect(monthsBefore("2026-11-17", 12)).toBe("2025-11-17");
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
    expect(monthsBefore("2026-01-15", 3)).toBe("2025-10-15");
    expect(monthsBefore("2026-11-17", 60)).toBe("2021-11-17");
  });
  const docs = [
    { vehicleId: "a", category: "repairs", date: "2026-11-10", amount: 300, workDone: "Brakes", garage: "Oranmore Motors", garageLocation: "Oranmore, Galway" },
    { vehicleId: "a", category: "repairs", date: "2026-06-01", amount: 900.5, workDone: "Clutch", garage: "Oranmore Motors", garageLocation: "Oranmore, Galway" },
    { vehicleId: "b", category: "repairs", date: "2026-11-01", amount: 120, workDone: "Tyre", garage: "Tuam Tyres", garageLocation: "Tuam, Galway" },
    { vehicleId: "b", category: "repairs", date: "2024-01-01", amount: 2000, workDone: "Gearbox", garage: "Tuam Tyres", garageLocation: "Tuam, Galway" },
    { vehicleId: "a", category: "insurance", date: "2026-11-05", amount: 1500 },
  ];
  it("adds up repairs only, after the day given, dearest vehicle first", () => {
    const month = repairSpend(fleet, docs, monthsBefore("2026-11-17", 1));
    expect(month).toMatchObject({ total: 420, jobs: 2 });
    expect(month.byVehicle.map((r) => [r.vehicle.id, r.jobs, r.spend])).toEqual([["a", 1, 300], ["b", 1, 120], ["c", 0, 0]]);
    expect(month.byVehicle[0]!.biggest?.workDone).toBe("Brakes");
    expect(month.byGarage.map((g) => [g.garage, g.where, g.jobs, g.spend])).toEqual([["Oranmore Motors", "Galway", 1, 300], ["Tuam Tyres", "Galway", 1, 120]]);
  });
  it("a longer period takes in more, and all time and cost per 1,000 km stay the same", () => {
    const year = repairSpend(fleet, docs, monthsBefore("2026-11-17", 12));
    expect(year).toMatchObject({ total: 1320.5, jobs: 3 });
    expect(year.byVehicle[0]).toMatchObject({ spend: 1200.5, allTime: 1200.5, per1000: 30.01 });
    const five = repairSpend(fleet, docs, monthsBefore("2026-11-17", 60));
    expect(five.total).toBe(3320.5);
    expect(five.byVehicle[0]!.vehicle.id).toBe("b");
    expect(five.byVehicle.find((r) => r.vehicle.id === "c")).toMatchObject({ jobs: 0, spend: 0, per1000: 0 });
  });
  it("adds up to the fleet's total in the sample data, whatever the period", () => {
    const { db } = buildSeed("2026-11-17");
    for (const p of SPEND_PERIODS) {
      const r = repairSpend(db.vehicles, db.fleetDocs, monthsBefore("2026-11-17", p.months));
      expect(Math.abs(r.byVehicle.reduce((s, x) => s + x.spend, 0) - r.total)).toBeLessThan(0.01);
      expect(Math.abs(r.byGarage.reduce((s, x) => s + x.spend, 0) - r.total)).toBeLessThan(0.01);
      expect(r.byVehicle).toHaveLength(db.vehicles.length);
    }
    const y1 = repairSpend(db.vehicles, db.fleetDocs, monthsBefore("2026-11-17", 12));
    const y5 = repairSpend(db.vehicles, db.fleetDocs, monthsBefore("2026-11-17", 60));
    expect(y1.total).toBeGreaterThan(0);
    expect(y5.total).toBeGreaterThanOrEqual(y1.total);
  });
});

describe("matching an uploaded document to its vehicle", () => {
  it("finds the registration in the file's name, however it is spaced", () => {
    expect(readFleetFile("Invoice 231-G-4471 brakes.pdf", fleet)).toMatchObject({ vehicle: { id: "a" }, category: "repairs" });
    expect(readFleetFile("231 g 4471 insurance cert 2027.pdf", fleet)).toMatchObject({ vehicle: { id: "a" }, category: "insurance" });
    expect(readFleetFile("cvrt_222G1180.jpg", fleet)).toMatchObject({ vehicle: { id: "b" }, category: "test" });
    expect(readFleetFile("Motor tax 222-G-1180.pdf", fleet)).toMatchObject({ vehicle: { id: "b" }, category: "tax" });
  });
  it("takes the longest registration that fits, not a shorter one inside it", () => {
    const both = [{ id: "x", reg: "31-G-447", model: "Old van" }, { id: "y", reg: "231-G-4471", model: "New van" }];
    expect(readFleetFile("receipt 231-G-4471.pdf", both).vehicle?.id).toBe("y");
    expect(readFleetFile("receipt 31-G-447.pdf", both).vehicle?.id).toBe("x");
  });
  it("says so when nothing matches, and guesses nothing", () => {
    const r = readFleetFile("IMG_2041.jpg", fleet);
    expect(r.vehicle).toBeUndefined();
    expect(r.category).toBeUndefined();
    expect(r.why).toBe("No registration from the fleet is in the file's name, so pick the vehicle");
    expect(readFleetFile("Invoice 231-G-4471.pdf", fleet).why).toBe("The registration 231-G-4471 is in the file's name");
  });
});

describe("the newest driver's check", () => {
  it("is the latest one for that vehicle", () => {
    const checks = [{ vehicleId: "a", at: "2026-11-16T07:40:00" }, { vehicleId: "a", at: "2026-11-17T07:35:00" }, { vehicleId: "b", at: "2026-11-17T07:50:00" }];
    expect(latestCheck(checks, "a")?.at).toBe("2026-11-17T07:35:00");
    expect(latestCheck(checks, "c")).toBeUndefined();
  });
});
