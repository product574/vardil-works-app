import { beforeEach, describe, expect, it } from "vitest";
import { latestCheck } from "@/lib/fleet";
import { addFleetDoc, addVehicle, updateVehicle } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";

// The Fleet page's changes to a vehicle (Oisin, 17 Nov): Add vehicle with its driver and
// mileage, Edit vehicle, and what an uploaded document does.
const DAY = "2026-11-17";
const db = () => useData.getState().db;
const v = (id: string) => db().vehicles.find((x) => x.id === id)!;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("adding a vehicle", () => {
  it("takes its driver and mileage, and tidies the registration", () => {
    addVehicle({ reg: "261 g 880", model: "Ford Transit Custom", kind: "Van", baseLocation: "Galway", purchasePrice: 38000, driverId: "p-103", mileage: 1240 });
    expect(db().vehicles[0]).toMatchObject({ reg: "261-G-880", driverId: "p-103", mileage: 1240, active: true });
    expect(db().vehicles[0]!.service).toMatchObject({ lastMeter: 1240, meterNow: 1240 });
  });
  it("is a pool vehicle at nought kilometres when nothing is said", () => {
    addVehicle({ reg: "261-G-881", model: "Toyota Hilux", kind: "Pickup", baseLocation: "Clare", purchasePrice: 0 });
    expect(db().vehicles[0]).toMatchObject({ driverId: null, mileage: 0 });
  });
});

describe("editing a vehicle", () => {
  it("changes its details and says what changed in the activity log", () => {
    const before = v("v-1");
    expect(updateVehicle("v-1", { reg: "182 d 40118", model: "Renault Trafic LWB", kind: "Crew van", baseLocation: "Kildare", driverId: null, mileage: before.mileage + 500 })).toBe(true);
    expect(v("v-1")).toMatchObject({ reg: "182-D-40118", model: "Renault Trafic LWB", kind: "Crew van", baseLocation: "Kildare", driverId: null, mileage: before.mileage + 500 });
    expect(db().activity[0]).toMatchObject({ what: "Changed a vehicle's details", target: `${before.reg} ${before.model}: registration, model, kind, base, driver, mileage` });
  });
  it("keeps its documents under the new registration", () => {
    const old = v("v-1").reg;
    const named = db().fleetDocs.filter((d) => d.vehicleId === "v-1" && d.fileName.includes(old)).length;
    expect(named).toBeGreaterThan(0);
    updateVehicle("v-1", { reg: "182-D-99999" });
    expect(db().fleetDocs.filter((d) => d.vehicleId === "v-1" && d.fileName.includes("182-D-99999")).length).toBe(named);
    expect(db().fleetDocs.some((d) => d.fileName.includes(old))).toBe(false);
  });
  it("refuses a registration another vehicle has, and an empty one", () => {
    const other = v("v-2").reg;
    expect(updateVehicle("v-1", { reg: other.toLowerCase().replace(/-/g, " ") })).toBe(false);
    expect(updateVehicle("v-1", { reg: "  " })).toBe(false);
    expect(v("v-1").reg).not.toBe(other);
  });
  it("moves the service clock with the mileage, never behind the last service", () => {
    const s = v("v-1").service;
    if (s.basis !== "km") throw new Error("the sample vans are serviced by distance");
    updateVehicle("v-1", { mileage: s.lastMeter + 12345 });
    expect(v("v-1").service).toMatchObject({ meterNow: s.lastMeter + 12345 });
    updateVehicle("v-1", { mileage: 10 });
    expect(v("v-1")).toMatchObject({ mileage: 10 });
    expect(v("v-1").service).toMatchObject({ meterNow: s.lastMeter });
  });
  it("saves nothing new when nothing changed", () => {
    const n = db().activity.length;
    expect(updateVehicle("v-1", { model: v("v-1").model })).toBe(true);
    expect(db().activity).toHaveLength(n);
  });
});

describe("an uploaded document", () => {
  it("a repair joins the vehicle's spend; a certificate moves its date", () => {
    addFleetDoc({ vehicleId: "v-1", category: "repairs", date: DAY, amount: 210, workDone: "Two front tyres", garage: "Oranmore Motors", garageLocation: "Oranmore, Galway" }, null);
    expect(db().fleetDocs[0]).toMatchObject({ vehicleId: "v-1", category: "repairs", amount: 210 });
    addFleetDoc({ vehicleId: "v-1", category: "insurance", date: DAY, amount: 1480, expiryDate: "2027-11-16" }, null);
    expect(v("v-1").compliance.insurance).toMatchObject({ expiryDate: "2027-11-16", amount: 1480, paidDate: DAY });
  });
});

describe("drivers' checks in the sample data", () => {
  it("every driven vehicle was checked on the last working day, some again this morning, with two defects to find", () => {
    const driven = db().vehicles.filter((x) => x.active && x.driverId);
    const checks = db().vehicleChecks;
    for (const x of driven) expect(checks.some((c) => c.vehicleId === x.id && c.at.startsWith("2026-11-16")), x.reg).toBe(true);
    const today = checks.filter((c) => c.at.startsWith(DAY));
    expect(today.length).toBeGreaterThan(2);
    expect(today.length).toBeLessThan(driven.length);
    expect(checks.every((c) => driven.find((x) => x.id === c.vehicleId)?.driverId === c.personId)).toBe(true);
    const withDefect = driven.filter((x) => (latestCheck(checks, x.id)?.defects.length ?? 0) > 0);
    expect(withDefect).toHaveLength(2);
    // The first vehicle is left unchecked today, for whoever tries the driving check on the phone.
    expect(today.some((c) => c.vehicleId === driven[0]!.id)).toBe(false);
    // Newest first, as the phone adds them.
    expect([...checks].sort((a, b) => b.at.localeCompare(a.at))).toEqual(checks);
  });
});
