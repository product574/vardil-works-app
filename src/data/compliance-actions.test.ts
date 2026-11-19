import { beforeEach, describe, expect, it } from "vitest";
import { scaffoldDue, scaffoldUnsafe, stateOf, subInsuranceFlags, ticketBlocks } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { nextServiceDate } from "@/lib/status";
import { nextWorkWeek } from "@/lib/week";
import { addScaffold, bookOnCourse, checkLicence, setDriverLicence, checkTicketPhoto, inspectScaffold, markAttendance, markCourseDone, movePlant, planPerson, recordSubPaper, recordVehicleService, renewCert, renewCompanyPaper, renewPlantCert, renewVehicle, sendTicketPhoto, setPlanDay, strikeScaffold, unbookFromCourse } from "./actions";
import { useData } from "./store";

const db = () => useData.getState().db;
const day = () => useData.getState().day;
const person = (id: string) => db().people.find((p) => p.id === id)!;
const cert = (id: string, name: string) => person(id).certs.find((c) => c.name === name)!;
const plant = (ref: string) => db().plant.find((x) => x.assetRef === ref)!;
const pid = (code: string) => db().projects.find((p) => p.code === code)!.id;
const proof = { name: "card.jpg", dataUrl: "data:image/jpeg;base64,AAAA" };
const logged = (what: string) => db().activity.some((a) => a.what === what && a.department === "compliance");

describe("what stops work (Compliance, 18 Nov)", () => {
  beforeEach(() => useData.getState().reset());

  it("will not mark someone on site whose Safe Pass has run out, until it is renewed", () => {
    markAttendance(pid("C722"), "p-124", day(), { status: "full", overtimeHours: 0 });
    expect(db().attendance.some((a) => a.personId === "p-124" && a.date === day())).toBe(false);
    renewCert("p-124", cert("p-124", "Safe Pass").id, addDays(day(), 1460), null);
    expect(cert("p-124", "Safe Pass").proofNeeded).toBe(true);
    markAttendance(pid("C722"), "p-124", day(), { status: "full", overtimeHours: 0 });
    expect(db().attendance.some((a) => a.personId === "p-124" && a.date === day())).toBe(true);
  });

  it("will not plan someone on a day their trade ticket has run out, and plans only the days they can work", () => {
    const next = nextWorkWeek(day());
    const before = db().plan.filter((e) => e.personId === "p-119" && e.projectId === pid("C720")).length;
    setPlanDay(pid("C720"), "p-119", next[0]!, { part: "full", overtimeHours: 0 });
    expect(db().plan.filter((e) => e.personId === "p-119" && e.projectId === pid("C720")).length).toBe(before);
    planPerson(pid("C720"), "p-119", next);
    expect(db().plan.some((e) => e.personId === "p-119" && e.projectId === pid("C720") && next.includes(e.date))).toBe(false);
    // Someone who may work is planned as before.
    planPerson(pid("C720"), "p-123", [next[0]!]);
    expect(db().plan.some((e) => e.personId === "p-123" && e.projectId === pid("C720") && e.date === next[0])).toBe(true);
  });

  it("will not send a machine to a site with its test run out, but will bring it back to the yard", () => {
    expect(movePlant(plant("TR3").id, pid("C719"))).toBe(false);
    expect(plant("TR3").projectId).toBeNull();
    expect(movePlant(plant("HAR4").id, null)).toBe(true);
    expect(plant("HAR4").projectId).toBeNull();
    expect(movePlant(plant("HAR6").id, pid("C721"))).toBe(true);
    // Renewed, with no certificate yet: it may go, and is flagged until one is attached.
    const r = plant("TR3").renewals[0]!;
    renewPlantCert(plant("TR3").id, r.id, addDays(day(), 182), null);
    expect(plant("TR3").renewals[0]!.proofNeeded).toBe(true);
    expect(movePlant(plant("TR3").id, pid("C719"))).toBe(true);
  });
});

describe("courses", () => {
  beforeEach(() => useData.getState().reset());

  it("books up to the places, and takes someone off again", () => {
    const abr = db().courses.find((c) => c.ticket === "Abrasive wheels")!;
    expect(bookOnCourse(abr.id, "p-103")).toBe(true);
    expect(bookOnCourse(abr.id, "p-103")).toBe(false);
    expect(bookOnCourse(abr.id, "p-106")).toBe(false); // full now
    unbookFromCourse(abr.id, "p-103");
    expect(db().courses.find((c) => c.id === abr.id)!.bookedIds).not.toContain("p-103");
    expect(logged("Booked someone on a course") && logged("Took someone off a course")).toBe(true);
  });

  it("renews the ticket for everyone on it from the course's day, waiting on their certificates", () => {
    const sp = db().courses.find((c) => c.ticket === "Safe Pass")!;
    const n = markCourseDone(sp.id);
    expect(n).toBe(2);
    for (const id of ["p-124", "p-127"]) {
      expect(cert(id, "Safe Pass").expires).toBe(addDays(sp.date, 1460));
      expect(cert(id, "Safe Pass").proofNeeded).toBe(true);
    }
    expect(db().courses.find((c) => c.id === sp.id)!.doneAt).toBeTruthy();
    expect(markCourseDone(sp.id)).toBe(0);
    expect(ticketBlocks(person("p-124"), sp.date)).toEqual([]);
  });
});

describe("a card sent from the site phone", () => {
  beforeEach(() => useData.getState().reset());

  it("waits for the office, who accept it with the date on the card", () => {
    const c = cert("p-124", "Safe Pass");
    sendTicketPhoto("p-124", c.id, proof);
    expect(cert("p-124", "Safe Pass").sentPhoto?.name).toBe("card.jpg");
    expect(db().activity[0]!.who).toBe("Tomás Breslin");
    checkTicketPhoto("p-124", c.id, { expires: addDays(day(), 1400) });
    const after = cert("p-124", "Safe Pass");
    expect(after.expires).toBe(addDays(day(), 1400));
    expect(after.proof?.name).toBe("card.jpg");
    expect(after.sentPhoto).toBeUndefined();
    expect(after.proofNeeded).toBe(false);
  });

  it("or turn it down, which leaves the ticket as it was", () => {
    const c = cert("p-124", "Safe Pass");
    sendTicketPhoto("p-124", c.id, proof);
    checkTicketPhoto("p-124", c.id, null);
    expect(cert("p-124", "Safe Pass").expires).toBe(c.expires);
    expect(cert("p-124", "Safe Pass").sentPhoto).toBeUndefined();
  });
});

describe("scaffolds, papers, licences and vans", () => {
  beforeEach(() => useData.getState().reset());

  it("records an inspection, a red tag, a new scaffold and one taken down", () => {
    const s = () => db().scaffolds.find((x) => x.id === "scf-C719-S2")!;
    inspectScaffold(s().id, "Safe to use", "");
    expect(scaffoldDue(s())).toBe(addDays(day(), 7));
    inspectScaffold(s().id, "Not safe to use", "Toe board missing on lift 2");
    expect(scaffoldUnsafe(s())).toBe(true);
    const id = addScaffold(pid("C719"), { kind: "Scaffold", description: "Chimney scaffold", erectedBy: "Corrib Scaffolding", erectedOn: day() });
    expect(db().scaffolds.find((x) => x.id === id)!.ref).toBe("S3");
    expect(stateOf(scaffoldDue(db().scaffolds.find((x) => x.id === id)!), day())).toBe("due");
    strikeScaffold(id);
    expect(db().scaffolds.find((x) => x.id === id)!.struckOn).toBe(day());
    expect(logged("Inspected a scaffold") && logged("Added a scaffold to the register") && logged("Took a scaffold off the register")).toBe(true);
  });

  it("clears a subcontractor's flag once the new insurance comes in", () => {
    const kinvara = () => db().subcontractors.find((s) => s.id === "sub-2")!;
    expect(subInsuranceFlags(kinvara(), day())).toHaveLength(1);
    recordSubPaper("sub-2", { kind: "Employers' liability", expires: addDays(day(), 365), cover: "€13m", reference: "KSC-EL-18" }, "Portal", proof);
    expect(subInsuranceFlags(kinvara(), day())).toEqual([]);
    expect(db().activity[0]!.who).toBe(kinvara().contactName);
  });

  it("renews a company paper, checks a licence, services a van, and flags a van paper renewed with no copy", () => {
    renewCompanyPaper("co-3", { expires: addDays(day(), 365), reference: "CAR-50001" }, proof);
    const car = db().companyPapers.find((c) => c.id === "co-3")!;
    expect([car.reference, car.proofNeeded, !!car.proof]).toEqual(["CAR-50001", false, true]);
    checkLicence("p-114", "B and C1 seen");
    expect(person("p-114").licenceCheck!.checkedOn).toBe(day());
    // Fleet's licence form, saved with no copy: "Proof needed" until one is attached.
    setDriverLicence("p-114", "driving", addDays(day(), 3000), []);
    expect(person("p-114").licences!.driving!.proofNeeded).toBe(true);
    const v = db().vehicles.find((x) => x.reg === "212-D-18834")!;
    renewVehicle(v.id, "test", addDays(day(), 365), 55, []);
    expect(db().vehicles.find((x) => x.id === v.id)!.compliance.test.proofNeeded).toBe(true);
    recordVehicleService(v.id, "Full service");
    const after = db().vehicles.find((x) => x.id === v.id)!;
    expect(after.service.lastServiced).toBe(day());
    expect(nextServiceDate(after.service, day()).date > day()).toBe(true);
  });
});
