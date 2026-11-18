import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { driversOf, readFleetFile } from "./fleet";

// Reading an uploaded file's name (17 Nov, kept on 18 Nov when Fleet came across from the
// Secure-All build), and Fleet's drivers worked out from People.
const fleet = [
  { id: "a", reg: "231-G-4471", model: "Ford Transit Custom", mileage: 40000 },
  { id: "b", reg: "222-G-1180", model: "Toyota Hilux", mileage: 20000 },
  { id: "c", reg: "31-G-447", model: "Ford Transit Tipper", mileage: 0 },
];

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

describe("Fleet's drivers, from People", () => {
  const person = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `Person ${id}`, phone: "", email: "", trade: "Site manager", active: true, ...extra });
  it("lists people on the driver list, with the base of the van they drive, and those taken off it as left", () => {
    const people = [person("a", { drives: true }), person("b"), person("c", { drives: false, drivesUntil: "2026-10-01" }), person("d", { drives: true, active: false, archivedAt: "2026-09-01" })];
    const vans = [{ driverId: "a", baseId: "b-gal", active: true }, { driverId: "c", baseId: "b-dub", active: false }];
    const list = driversOf(people, vans);
    expect(list.map((d) => [d.id, d.active, d.baseId, d.leftAt ?? ""])).toEqual([["a", true, "b-gal", ""], ["c", false, null, "2026-10-01"], ["d", false, null, "2026-09-01"]]);
  });
  it("covers every van's driver in the sample data, with a driving licence each, and a CPC for the 7 tonne tippers", () => {
    const { db } = buildSeed("2026-11-18");
    const drivers = driversOf(db.people, db.vehicles);
    for (const v of db.vehicles.filter((x) => x.active && x.driverId)) {
      const d = drivers.find((x) => x.id === v.driverId);
      expect(d?.active, v.reg).toBe(true);
      expect(d?.licences?.driving?.expiryDate, v.reg).toBeTruthy();
      if (v.model.includes("70C")) expect(d?.licences?.cpc?.expiryDate, v.reg).toBeTruthy();
    }
  });
});
