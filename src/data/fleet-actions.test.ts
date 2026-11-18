import { beforeEach, describe, expect, it } from "vitest";
import { addDriver, addGarageNote, addTodo, addVehicle, confirmLicence, deleteGarageNote, deleteInvoice, deleteTodo, deleteVehicle, markDiscOn, removeVehicle, renewVehicle, reportDamage, saveInvoice, setDamageDealt, setDriverActive, setDriverLicence, setInvoiceStatus, setTodoDone, updateInvoice, updateMileage, updateVehicle, vehicleRecords } from "./actions";
import { buildSeed } from "./seed";
import { getDay, getDb, useData, usePrefs } from "./store";
import { driversOf } from "@/lib/fleet";
import { invoiceWarnings } from "@/lib/fleet-spend";
import { driverSiteOn } from "@/lib/roster";

// Fleet, brought across from the Secure-All build on 18 Nov. Wednesday 18 Nov 2026, signed in as the managing director.
const DAY = "2026-11-18";
const siteThen = (personId: string | null, date: string) => (personId ? (driverSiteOn(personId, date, getDb().attendance, getDb().plan, getDb().projects) ?? null) : null);

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("the sample fleet", () => {
  it("has 20 vehicles on the fleet and 2 removed, at six bases, with eight garages", () => {
    expect(getDb().vehicles.filter((v) => v.active)).toHaveLength(20);
    expect(getDb().vehicles.filter((v) => !v.active)).toHaveLength(2);
    expect(getDb().bases).toHaveLength(6);
    expect(getDb().garages).toHaveLength(8);
  });
  it("files each repair under the van's base, its driver and the site that driver was on that day", () => {
    const lines = getDb().garageInvoices.flatMap((i) => i.lines.map((l) => ({ ...l, date: i.date })));
    expect(lines.some((l) => l.siteId)).toBe(true);
    for (const l of lines) {
      const v = getDb().vehicles.find((x) => x.id === l.vehicleId)!;
      expect(l.baseId, v.reg).toBe(v.baseId);
      if (v.active) expect(l.driverId, v.reg).toBe(v.driverId);
      expect(l.siteId, `${v.reg} ${l.date}`).toBe(siteThen(l.driverId, l.date));
    }
  });
  it("plants one duplicate invoice number and one van repaired twice inside 30 days", () => {
    const w = invoiceWarnings(getDb().garageInvoices, DAY);
    expect(w.filter((x) => x.kind === "duplicate")).toHaveLength(1);
    expect(w.filter((x) => x.kind === "repeat").map((x) => getDb().vehicles.find((v) => v.id === (x as { vehicleId: string }).vehicleId)!.reg)).toEqual(["231-G-4471"]);
  });
  it("never has more than ten repairs on a vehicle", () => {
    for (const v of getDb().vehicles) expect(getDb().garageInvoices.filter((i) => i.lines.some((l) => l.vehicleId === v.id)).length, v.reg).toBeLessThanOrEqual(11);
  });
});

describe("garage invoices", () => {
  it("an uploaded invoice is to check, split a line per vehicle, and keeps the base, driver and site of the day", () => {
    const [a, b] = getDb().vehicles.filter((v) => v.active && v.driverId);
    const id = saveInvoice({ invoiceNo: " T-1 ", garageId: getDb().garages[0]!.id, date: "2026-11-17", vat: null, lines: [{ vehicleId: a!.id, category: "Brakes", description: "Pads", mileage: a!.mileage + 500, amount: 100.1 }, { vehicleId: b!.id, category: "Tyres", description: "Two tyres", mileage: null, amount: 200.2 }] }, null);
    const inv = getDb().garageInvoices.find((i) => i.id === id)!;
    expect(inv).toMatchObject({ invoiceNo: "T-1", status: "To check", total: 300.3 });
    expect(inv.lines.map((l) => [l.vehicleId, l.baseId, l.driverId, l.siteId])).toEqual([
      [a!.id, a!.baseId, a!.driverId, siteThen(a!.driverId, "2026-11-17")],
      [b!.id, b!.baseId, b!.driverId, siteThen(b!.driverId, "2026-11-17")],
    ]);
    expect(getDb().vehicles.find((v) => v.id === a!.id)!.mileage).toBe(a!.mileage + 500);
    // Moving the vehicle afterwards does not move the cost.
    const other = getDb().bases.find((x) => x.id !== a!.baseId)!;
    updateVehicle(a!.id, { baseId: other.id, driverId: null });
    expect(getDb().garageInvoices.find((i) => i.id === id)!.lines[0]).toMatchObject({ baseId: a!.baseId, driverId: a!.driverId });
  });
  it("can be marked checked, put back with a note, and deleted", () => {
    const inv = getDb().garageInvoices.find((i) => i.status === "To check")!;
    setInvoiceStatus(inv.id, "Checked");
    expect(getDb().garageInvoices.find((i) => i.id === inv.id)).toMatchObject({ status: "Checked", checkedBy: "Aidan King" });
    expect(setInvoiceStatus(inv.id, "To check")).toBe(false);
    expect(setInvoiceStatus(inv.id, "To check", "The amount does not match the statement")).toBe(true);
    expect(getDb().garageInvoices.find((i) => i.id === inv.id)!.backNotes?.map((n) => n.text)).toEqual(["The amount does not match the statement"]);
    expect(getDb().activity[0]).toMatchObject({ what: "Put a garage invoice back to check", department: "fleet" });
    deleteInvoice(inv.id);
    expect(getDb().garageInvoices.some((i) => i.id === inv.id)).toBe(false);
  });
  it("a corrected invoice keeps where a line was filed, a checked one goes back to check, and the log says what changed", () => {
    const [a, b] = getDb().vehicles.filter((v) => v.active && v.driverId);
    const garage = getDb().garages[0]!;
    const id = saveInvoice({ invoiceNo: "T-2", garageId: garage.id, date: "2026-11-12", vat: null, lines: [{ vehicleId: a!.id, category: "Brakes", description: "Pads", mileage: null, amount: 100 }] }, { name: "T-2.pdf", dataUrl: "data:application/pdf;base64,AAAA" });
    setInvoiceStatus(id, "Checked");
    const line = getDb().garageInvoices.find((i) => i.id === id)!.lines[0]!;
    updateVehicle(a!.id, { baseId: getDb().bases.find((x) => x.id !== a!.baseId)!.id });
    expect(updateInvoice(id, { invoiceNo: "T-2", garageId: garage.id, date: "2026-11-13", vat: 23, lines: [{ id: line.id, vehicleId: a!.id, category: "Brakes", description: "Pads and discs", mileage: null, amount: 125.5 }, { vehicleId: b!.id, category: "Tyres", description: "Puncture", mileage: null, amount: 40 }] })).toBe("unchecked");
    const inv = getDb().garageInvoices.find((i) => i.id === id)!;
    expect(inv).toMatchObject({ total: 165.5, status: "To check", editedBy: "Aidan King" });
    expect(inv.lines[0]).toMatchObject({ id: line.id, baseId: line.baseId, driverId: line.driverId, siteId: line.siteId });
    expect(inv.lines[1]).toMatchObject({ vehicleId: b!.id, baseId: b!.baseId, driverId: b!.driverId, siteId: siteThen(b!.driverId, "2026-11-13") });
    expect(inv.file?.name).toBe("T-2.pdf");
    expect(getDb().activity[0]!.target).toContain("total €100.00 to €165.50");
  });
});

describe("vehicles", () => {
  const fields = { reg: "261 g 99", make: "Ford", model: "Transit", kind: "Van" as const, fuel: "Diesel" as const, division: "Site crew van", ownership: "Owned" as const, baseId: null, driverId: null, purchasePrice: null, purchaseMonth: null, mileage: 10 };
  it("adds a vehicle with a tidy registration and a 12 month service, and refuses the same one twice", () => {
    const id = addVehicle(fields);
    expect(getDb().vehicles.find((v) => v.id === id)).toMatchObject({ reg: "261-G-99", service: { basis: "months", intervalMonths: 12, lastServiced: DAY } });
    expect(addVehicle({ ...fields, reg: "261-g-99" })).toBeNull();
  });
  it("registration, make and model cannot change; a vehicle typed wrongly is deleted only while it has no records", () => {
    const id = addVehicle({ ...fields, reg: "262-G-1" })!;
    updateVehicle(id, { reg: "999-X-9", make: "Fiat", model: "Doblo", fuel: "Electric" } as never);
    expect(getDb().vehicles.find((v) => v.id === id)).toMatchObject({ reg: "262-G-1", make: "Ford", model: "Transit", fuel: "Electric" });
    expect(deleteVehicle(id)).toBe(true);
    const used = getDb().vehicles.find((x) => vehicleRecords(getDb(), x.id).invoices > 0)!;
    expect(deleteVehicle(used.id)).toBe(false);
  });
  it("mileage typed in is dated today; a higher reading on a garage invoice moves it on", () => {
    const v = getDb().vehicles.find((x) => x.active)!;
    updateMileage(v.id, v.mileage + 1200);
    expect(getDb().vehicles.find((x) => x.id === v.id)).toMatchObject({ mileage: v.mileage + 1200, mileageAt: getDay(), mileageFrom: "typed" });
    saveInvoice({ invoiceNo: "M-1", garageId: getDb().garages[0]!.id, date: "2026-11-16", vat: null, lines: [{ vehicleId: v.id, category: "Service", description: "Service", mileage: v.mileage + 5000, amount: 200 }] }, null);
    expect(getDb().vehicles.find((x) => x.id === v.id)).toMatchObject({ mileage: v.mileage + 5000, mileageAt: "2026-11-16", mileageFrom: "invoice" });
  });
  it("a renewal waits for the disc to be ticked on, and ticks off its to-do", () => {
    const v = getDb().vehicles.find((x) => x.reg === "191-G-7730")!;
    const todo = getDb().todos.find((t) => t.vehicleId === v.id && t.item === "tax")!;
    renewVehicle(v.id, "tax", "2027-11-18", 420, { name: "receipt.pdf", dataUrl: "data:application/pdf;base64,AAAA" });
    expect(getDb().vehicles.find((x) => x.id === v.id)!.compliance.tax).toMatchObject({ expiryDate: "2027-11-18", amount: 420, discPending: true });
    expect(getDb().fleetDocs[0]).toMatchObject({ vehicleId: v.id, category: "tax", fileName: "receipt.pdf" });
    expect(getDb().todos.find((t) => t.id === todo.id)!.doneAt).toBeTruthy();
    markDiscOn(v.id, "tax");
    expect(getDb().vehicles.find((x) => x.id === v.id)!.compliance.tax).toMatchObject({ discPending: false, discOnAt: DAY });
  });
  it("removes one with its sale amount, keeps its history, and takes its driver off it", () => {
    const v = getDb().vehicles.find((x) => x.active && x.driverId && vehicleRecords(getDb(), x.id).invoices > 0)!;
    const before = getDb().garageInvoices.length;
    removeVehicle(v.id, 6500);
    expect(getDb().vehicles.find((x) => x.id === v.id)).toMatchObject({ active: false, sellPrice: 6500, driverId: null, removedAt: DAY });
    expect(getDb().garageInvoices.length).toBe(before);
    expect(getDb().activity[0]!.target).toBe(`${v.reg}, sold for €6,500.00`);
  });
});

describe("drivers are people from People", () => {
  it("a person is put on the driver list, taken off to Left with history kept, and brought back", () => {
    const p = getDb().people.find((x) => x.active && !x.drives && x.kind === "Operative")!;
    addDriver(p.id);
    expect(driversOf(getDb().people, getDb().vehicles).find((d) => d.id === p.id)).toMatchObject({ active: true, name: p.name });
    setDriverActive(p.id, false);
    expect(driversOf(getDb().people, getDb().vehicles).find((d) => d.id === p.id)).toMatchObject({ active: false, leftAt: DAY });
    setDriverActive(p.id, true);
    expect(driversOf(getDb().people, getDb().vehicles).find((d) => d.id === p.id)!.active).toBe(true);
  });
  it("a new date with no new file keeps the copy already on file", () => {
    const p = getDb().people.find((x) => x.licences?.cpc?.proof)!;
    const kept = p.licences!.cpc!.proof;
    setDriverLicence(p.id, "cpc", "2031-03-01", null);
    expect(getDb().people.find((x) => x.id === p.id)!.licences!.cpc).toEqual({ expiryDate: "2031-03-01", proof: kept });
  });
  it("a licence sent from the site phone updates the driver at once, flagged until the office has checked it", () => {
    const p = getDb().people.find((x) => x.drives && !x.licences?.driving?.fromPhoneAt)!;
    setDriverLicence(p.id, "driving", "2030-01-31", [{ name: "front.jpg", dataUrl: "data:image/jpeg;base64,AAAA" }, { name: "back.jpg", dataUrl: "data:image/jpeg;base64,BBBB" }], { fromPhone: true, anyway: "the name on it reads Someone Else" });
    const l = getDb().people.find((x) => x.id === p.id)!.licences!.driving!;
    expect(l).toMatchObject({ expiryDate: "2030-01-31", proof: { name: "front.jpg" }, extraProofs: [{ name: "back.jpg" }] });
    expect(l.fromPhoneAt).toBeTruthy();
    expect(getDb().activity[0]).toMatchObject({ what: "Sent a driving licence from the phone", department: "site" });
    expect(getDb().activity[0]!.target).toContain("Saved although the name on it reads Someone Else");
    confirmLicence(p.id, "driving");
    expect(getDb().people.find((x) => x.id === p.id)!.licences!.driving!.fromPhoneAt).toBeUndefined();
  });
  it("the sample data has one licence sent from the phone waiting, a CPC out of date and one due soon", () => {
    const drivers = driversOf(getDb().people, getDb().vehicles);
    expect(drivers.filter((d) => d.licences?.driving?.fromPhoneAt || d.licences?.cpc?.fromPhoneAt).map((d) => d.name)).toEqual(["Seán Dunphy"]);
    expect(drivers.filter((d) => d.licences?.cpc && d.licences.cpc.expiryDate < DAY).map((d) => d.name)).toEqual(["Kevin Shortall"]);
  });
});

describe("damage, garage notes and the to-do list", () => {
  it("damage reported from the phone is new until the office marks it dealt with", () => {
    const v = getDb().vehicles.find((x) => x.active && x.driverId)!;
    const id = reportDamage({ vehicleId: v.id, driverId: v.driverId, where: "Yard gate", note: "Scraped the door" }, [{ name: "Photo 1", dataUrl: "", sample: "damage/door-scrape" }]);
    expect(getDb().damageReports[0]).toMatchObject({ id, status: "New", where: "Yard gate", photos: [{ sample: "damage/door-scrape" }] });
    expect(getDb().activity[0]).toMatchObject({ what: "Reported damage to a vehicle", department: "site" });
    setDamageDealt(id, true, "Booked into the garage");
    expect(getDb().damageReports.find((x) => x.id === id)).toMatchObject({ status: "Dealt with", dealtBy: "Aidan King", dealtNote: "Booked into the garage" });
    setDamageDealt(id, false);
    expect(getDb().damageReports.find((x) => x.id === id)!.dealtNote).toBeUndefined();
  });
  it("a garage's private notes are dated, and deleted rather than edited", () => {
    const g = getDb().garages[0]!;
    const before = getDb().garageNotes.filter((n) => n.garageId === g.id).length;
    addGarageNote(g.id, "  Closed on bank holidays  ");
    expect(getDb().garageNotes[0]).toMatchObject({ garageId: g.id, text: "Closed on bank holidays", by: "Aidan King" });
    deleteGarageNote(getDb().garageNotes[0]!.id);
    expect(getDb().garageNotes.filter((n) => n.garageId === g.id).length).toBe(before);
  });
  it("a to-do is added, ticked off, opened again and deleted, each logged on the Dashboard", () => {
    const id = addTodo({ title: " Ring the broker ", due: "2026-11-20" });
    expect(getDb().todos[0]).toMatchObject({ id, title: "Ring the broker", createdBy: "Aidan King" });
    setTodoDone(id, true);
    expect(getDb().todos.find((t) => t.id === id)!.doneBy).toBe("Aidan King");
    setTodoDone(id, false);
    expect(getDb().todos.find((t) => t.id === id)!.doneAt).toBeUndefined();
    deleteTodo(id);
    expect(getDb().todos.some((t) => t.id === id)).toBe(false);
    expect(getDb().activity[0]).toMatchObject({ what: "Deleted a to-do", department: "dashboard" });
  });
});
