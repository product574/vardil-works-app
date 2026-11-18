import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { Person } from "@/data/types";
import { addDays } from "./dates";
import { blocksText, bookingFor, complianceRows, countRows, courseStage, isCheck, licenceDue, mondayReminder, neededTickets, openCourse, planBlocks, plantBlocks, renewedTo, rowsInScope, scaffoldDue, scaffoldUnsafe, stateOf, stateWords, subFlags, subInsuranceFlags, ticketBlocks, ticketMatrix, vehicleBlocks } from "./compliance";
import { nextWorkWeek } from "./week";

const DAY = "2026-11-18";
const { db, day } = buildSeed(DAY, { emailDomain: "abcconstruction.example", vatPct: 13.5, region: "IE" });
const person = (id: string) => db.people.find((p) => p.id === id)!;
const next = nextWorkWeek(day);

describe("where a date stands (good through its expiry day, due inside 30 days)", () => {
  it("reads expired, due, in date and missing", () => {
    expect([stateOf("2026-11-17", day), stateOf(day, day), stateOf("2026-12-18", day), stateOf("2026-12-19", day), stateOf(null, day)]).toEqual(["expired", "due", "due", "ok", "missing"]);
    expect(stateWords("2026-11-15", day)).toBe("Ran out 3 days ago");
    expect(stateWords(day, day)).toBe("Due today");
    expect(stateWords("2026-11-27", day)).toBe("Due in 9 days");
    expect(isCheck("Weekly inspection") && isCheck("Service, every 250 hrs") && isCheck("Driving licence check") && !isCheck("Safe Pass")).toBe(true);
  });
});

describe("who may go on site (his pick: block, for the Safe Pass and trade tickets)", () => {
  it("needs the Safe Pass of everyone on site, and their trade's own ticket", () => {
    expect(neededTickets(person("p-119"))).toEqual(["Safe Pass", "Scaffolding ticket, advanced"]);
    expect(neededTickets(person("p-110"))).toEqual(["Safe Pass", "Mobile elevating work platform"]);
    expect(neededTickets(person("p-sm1"))).toEqual(["Safe Pass", "Site supervisor safety"]);
    // Office staff do not work on site.
    expect(neededTickets(person("p-acc"))).toEqual([]);
  });

  it("stops Tomás from today: his Safe Pass ran out yesterday, and was good on the day it ran out", () => {
    const p = person("p-124");
    expect(ticketBlocks(p, addDays(day, -1))).toEqual([]);
    expect(ticketBlocks(p, day)).toEqual([{ ticket: "Safe Pass", expires: addDays(day, -1) }]);
    expect(blocksText(ticketBlocks(p, day))).toBe("Safe Pass ran out on 17 Nov");
  });

  it("stops Kevin next week, when his scaffolding ticket has run out, but not this week", () => {
    expect(ticketBlocks(person("p-119"), day)).toEqual([]);
    expect(ticketBlocks(person("p-119"), next[0]!).map((b) => b.ticket)).toEqual(["Scaffolding ticket, advanced"]);
  });

  it("does not stop anyone for a ticket their trade does not need", () => {
    // Thiago's manual handling ran out, but a lime plasterer can still work.
    const p = person("p-108");
    expect(p.certs.find((c) => c.name === "Manual handling")!.expires < day).toBe(true);
    expect(ticketBlocks(p, day)).toEqual([]);
  });

  it("stops someone whose trade needs a ticket they have never had", () => {
    const p: Person = { ...person("p-119"), certs: person("p-119").certs.filter((c) => c.name !== "Scaffolding ticket, advanced") };
    expect(ticketBlocks(p, day)).toEqual([{ ticket: "Scaffolding ticket, advanced", expires: null }]);
    expect(blocksText(ticketBlocks(p, day))).toBe("no Scaffolding ticket, advanced on file");
  });

  it("finds everyone planned on a day they cannot work, from today to the end of next week", () => {
    const b = planBlocks(db.people, db.plan.filter((e) => e.date >= day && e.date <= next[4]!));
    const who = [...new Set([...b.keys()].map((k) => k.split("|")[0]))].sort();
    expect(who).toEqual(["p-110", "p-119", "p-124"]);
    expect(b.has(`p-124|${day}`)).toBe(true);
    expect(b.has(`p-119|${next[0]}`)).toBe(true);
    expect(b.has(`p-119|${day}`)).toBe(false);
  });

  it("left nobody marked on site on a day their ticket had run out", () => {
    for (const a of db.attendance) expect(ticketBlocks(person(a.personId), a.date), `${a.personId} ${a.date}`).toEqual([]);
  });
});

describe("the training matrix", () => {
  it("puts the Safe Pass first and marks a ticket the trade needs but nobody holds", () => {
    const m = ticketMatrix([person("p-119"), person("p-108")], day);
    expect(m.columns[0]).toBe("Safe Pass");
    const kevin = m.rows[0]!.cells;
    expect(kevin.find((c) => c.name === "Scaffolding ticket, advanced")!.state).toBe("due");
    expect(m.rows[1]!.cells.find((c) => c.name === "Scaffolding ticket, advanced")!.state).toBe("none");
    expect(m.rows[1]!.cells.find((c) => c.name === "Manual handling")!.state).toBe("expired");
    const without: Person = { ...person("p-119"), certs: person("p-119").certs.filter((c) => c.name !== "Scaffolding ticket, advanced") };
    expect(ticketMatrix([without], day).rows[0]!.cells.find((c) => c.name === "Scaffolding ticket, advanced")?.state).toBe("missing");
  });
});

describe("courses", () => {
  it("renew a ticket for four years for the Safe Pass and three for the rest", () => {
    expect(renewedTo("Safe Pass", "2026-11-24")).toBe(addDays("2026-11-24", 1460));
    expect(renewedTo("Manual handling", "2026-11-24")).toBe(addDays("2026-11-24", 1095));
  });

  it("know who is booked, which have a place left, and what is still to mark done", () => {
    expect(bookingFor(db.courses, "p-124", "Safe Pass")?.date).toBe(next[1]);
    expect(bookingFor(db.courses, "p-124", "Manual handling")).toBeUndefined();
    expect(openCourse(db.courses, "Abrasive wheels", day)?.places).toBe(6);
    expect(db.courses.map((c) => courseStage(c, day))).toEqual(["booked", "booked", "booked", "booked", "booked", "booked", "to mark", "done"]);
    expect(courseStage({ ...db.courses[0]!, date: day }, day)).toBe("to mark");
  });
});

describe("machinery, vans, scaffolds and licences", () => {
  it("stops a machine whose examination, test, inspection or insurance ran out, but not for a late service", () => {
    expect(plantBlocks(db.plant.find((x) => x.assetRef === "HS2")!, day).map((r) => r.kind)).toEqual(["Thorough examination"]);
    expect(plantBlocks(db.plant.find((x) => x.assetRef === "HAR4")!, day).map((r) => r.kind)).toEqual(["Harness inspection"]);
    expect(plantBlocks(db.plant.find((x) => x.assetRef === "GN1")!, day)).toEqual([]);
  });

  it("stops a van without tax, test or insurance in date", () => {
    expect(vehicleBlocks(db.vehicles.find((v) => v.reg === "212-D-18834")!, day)).toEqual(["test"]);
    expect(vehicleBlocks(db.vehicles.find((v) => v.reg === "191-G-7730")!, day)).toEqual(["tax"]);
    expect(vehicleBlocks(db.vehicles.find((v) => v.reg === "231-G-4471")!, day)).toEqual([]);
  });

  it("inspects a scaffold every 7 days, and a red tag stops it until it passes again", () => {
    const s = db.scaffolds.find((x) => x.id === "scf-C719-S2")!;
    expect(scaffoldDue(s)).toBe(addDays(s.inspections[0]!.date, 7));
    expect(stateOf(scaffoldDue(s), day)).toBe("expired");
    const gantry = db.scaffolds.find((x) => x.id === "scf-C722-S1")!;
    // Found unsafe once, fixed, and passed the next working day.
    expect(gantry.inspections.some((i) => i.result === "Not safe to use")).toBe(true);
    expect(scaffoldUnsafe(gantry)).toBe(false);
    expect(scaffoldUnsafe({ ...gantry, inspections: [{ id: "x", date: day, by: "x", result: "Not safe to use", note: "" }, ...gantry.inspections] })).toBe(true);
    // Every inspection is a week or less after the one before.
    for (const sc of db.scaffolds) for (let i = 0; i + 1 < sc.inspections.length; i++) expect(sc.inspections[i]!.date <= addDays(sc.inspections[i + 1]!.date, 7), sc.id).toBe(true);
  });

  it("checks a licence once a year, or sooner if it runs out first", () => {
    expect(licenceDue({ checkedOn: "2026-01-10", expires: "2030-01-01" })).toEqual({ date: addDays("2026-01-10", 365), what: "Yearly check" });
    expect(licenceDue({ checkedOn: "2026-06-01", expires: "2026-12-10" })).toEqual({ date: "2026-12-10", what: "Licence runs out" });
  });
});

describe("subcontractors", () => {
  const live = db.projects.filter((p) => p.status === "Live" || p.status === "Not started");
  it("flags what is out of date or missing, and only the insurances on their invoices", () => {
    const kinvara = db.subcontractors.find((s) => s.id === "sub-2")!;
    expect(subInsuranceFlags(kinvara, day)).toEqual(["Employers' liability insurance ran out on 14 Nov"]);
    const corrib = db.subcontractors.find((s) => s.id === "sub-1")!;
    expect(subInsuranceFlags(corrib, day)).toEqual([]);
    expect(subFlags(corrib, live, day)).toEqual(["no method statement for C721", "Łukasz Zieliński: Safe Pass ran out"]);
  });
});

describe("every row in one list", () => {
  const rows = complianceRows(db, day);
  it("has a row for every ticket, van paper, check, service, scaffold, company and subcontractor paper", () => {
    const certs = db.people.filter((p) => p.active).flatMap((p) => p.certs).length;
    expect(rows.filter((r) => r.ref.kind === "cert").length).toBe(certs);
    expect(rows.filter((r) => r.area === "company").length).toBe(db.companyPapers.length);
    expect(rows.filter((r) => r.ref.kind === "scaffold").length).toBe(db.scaffolds.filter((s) => !s.struckOn).length);
    expect(rows.filter((r) => r.ref.kind === "licence").length).toBe(db.people.filter((p) => p.active && p.licence).length);
  });

  it("puts missing papers first, then soonest first", () => {
    const missing = rows.findIndex((r) => r.state !== "missing");
    expect(rows.slice(0, missing).every((r) => r.state === "missing")).toBe(true);
    const dated = rows.slice(missing).filter((r) => r.due);
    expect(dated.map((r) => r.due)).toEqual([...dated.map((r) => r.due)].sort());
  });

  it("counts what stops work: tickets, machines, vans and scaffolds", () => {
    const c = countRows(rows);
    const blocks = rows.filter((r) => r.blocks).map((r) => r.who.split(" ")[0]).sort();
    expect(blocks).toEqual(["191-G-7730", "212-D-18834", "C719", "C723", "HAR4", "HS2", "SC1", "ST3", "TR3", "Tomás"]);
    expect(c.blocks).toBe(10);
    expect(c.proof).toBe(2);
  });

  it("shows a site manager only the people, machinery and subcontractors on their own sites", () => {
    const mine = new Set(db.projects.filter((p) => p.siteManagerId === "p-sm1").map((p) => p.id));
    const theirs = rowsInScope(rows, mine);
    expect(new Set(theirs.map((r) => r.area))).toEqual(new Set(["personnel", "machinery", "subcontractors"]));
    expect(theirs.every((r) => r.siteIds.some((id) => mine.has(id)))).toBe(true);
    expect(theirs.some((r) => r.who.startsWith("Kevin Shortall"))).toBe(true);
    expect(theirs.some((r) => r.who.startsWith("Tomás Breslin"))).toBe(false);
  });
});

describe("the Monday list", () => {
  it("covers every area, says what ran out and what is due, and has no long dashes", () => {
    const text = mondayReminder(db, day);
    for (const area of ["Personnel:", "Fleet:", "Machinery:", "Company:", "Subcontractors:"]) expect(text).toContain(area);
    expect(text).toContain("- HS2 Scaffold hoist 200 kg: Thorough examination, ran out on 26 Oct");
    expect(text).toContain("- GN1 Diesel generator 6 kVA: Service, every 250 hrs, overdue since about");
    expect(text).toContain("- Contractors all risk insurance: Renewal, cover €2m a contract, due 7 Dec");
    expect(text).not.toMatch(/[–—]/);
  });
});
