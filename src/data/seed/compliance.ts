/**
 * Compliance sample data (18 Nov): harnesses and 110 V kit, drivers' licences, training courses,
 * the firm's own papers, each subcontractor's papers and people, and the scaffold registers.
 *
 * None of it draws on the random sequence, so every other record stays exactly as it was.
 * Dates are relative to the demo's day, with a deliberate spread of problems: a harness on a
 * site past its inspection, a transformer in the yard past its test, a licence check overdue,
 * a contractors all risk policy due, a subcontractor's employers' liability run out, a method
 * statement missing, and two scaffolds past their weekly inspection.
 */
import { addDays } from "@/lib/dates";
import { renewedTo } from "@/lib/compliance";
import { nextWorkWeek } from "@/lib/week";
import type { CompanyPaper, Course, Person, PlantItem, Project, Scaffold, ScaffoldInspection, Subcontractor, SubPaper, SubWorker } from "../types";
import { workdays } from "./util";

const pid = (code: string) => `pr-${code}`;

/** Harnesses and 110 V transformers: small kit kept as items of plant, each with its own number (his pick). */
export function seedSmallKit(today: string): PlantItem[] {
  const item = (assetRef: string, name: string, kind: string, spec: string, site: string | null, check: string, expiresIn: number, servicedAgo: number): PlantItem => ({
    id: `pl-${assetRef}`,
    assetRef,
    name,
    kind,
    spec,
    status: site ? "On site" : "Available",
    projectId: site ? pid(site) : null,
    finance: "Owned outright",
    service: { basis: "months", intervalMonths: 12, lastServiced: addDays(today, -servicedAgo) },
    serviceHistory: [{ id: `svc-${assetRef}-1`, date: addDays(today, -servicedAgo), note: kind === "Harness" ? "Checked by the user before each shift; full check at the yard." : "Leads, plugs and casing checked." }],
    renewals: [{ id: `ren-${assetRef}-${kind === "Harness" ? "hi" : "pat"}`, kind: check, expires: addDays(today, expiresIn), doc: `${assetRef} ${check.toLowerCase()}.pdf` }],
  });
  const harness = (n: number, site: string | null, expiresIn: number) => item(`HAR${n}`, "Full body harness", "Harness", "EN 361, twin 1.75 m lanyards", site, "Harness inspection", expiresIn, 40 + n * 9);
  const transformer = (n: number, site: string | null, expiresIn: number) => item(`TR${n}`, "Site transformer 3.3 kVA", "Transformer", "110 V, two outlets, with leads", site, "Electrical safety test", expiresIn, 60 + n * 11);
  return [harness(1, "C719", 121), harness(2, "C719", 121), harness(3, "C721", 64), harness(4, "C721", -5), harness(5, "C722", 140), harness(6, null, 97), transformer(1, "C719", 52), transformer(2, "C722", 8), transformer(3, null, -10)];
}

/**
 * The office's yearly look at each driver's licence (Compliance; Fleet keeps the licence and the
 * Driver CPC themselves). Days since the last check, for the twelve who drove before the fleet
 * came across from the Secure-All build, as they were; the drivers it added are spread through
 * the year. Liam Costigan's (p-114) is overdue. No random numbers, so nothing else moves.
 */
export function seedLicences(today: string, people: Person[]) {
  const ago: Record<string, number> = { "p-sm2": 130, "p-cm1": 220, "p-sm5": 95, "p-sm1": 300, "p-sm3": 41, "p-sm4": 12, "p-yard": 186, "p-128": 350, "p-114": 375, "p-107": 160, "p-cm2": 200, "p-hs": 60 };
  const spread = [20, 75, 140, 205, 260, 320, 110, 45, 290, 170];
  let i = 0;
  for (const p of people.filter((x) => x.drives)) {
    const days = ago[p.id] ?? spread[i++ % spread.length]!;
    p.licenceCheck = { checkedOn: addDays(today, -days), checkedBy: "Declan Furey" };
  }
}

/** Courses: renewals booked for the tickets that are going, and one done last month. */
export function seedCourses(today: string, people: Person[]): Course[] {
  const next = nextWorkWeek(today);
  const done = workdays(today, -15);
  // Those on the working at height course last month hold tickets from that day.
  for (const id of ["p-121", "p-122", "p-125"]) {
    const c = people.find((p) => p.id === id)?.certs.find((x) => x.name === "Working at height");
    if (c) {
      c.issued = done;
      c.expires = renewedTo(c.name, done);
    }
  }
  return [
    { id: "crs-1", ticket: "Safe Pass", provider: "SOLAS registered tutor", venue: "Athlone Training Centre", date: next[1]!, places: 4, cost: 160, bookedIds: ["p-124", "p-127"] },
    { id: "crs-2", ticket: "Mobile elevating work platform", provider: "Shannonside Plant Hire training", venue: "Ennis", date: workdays(today, 2), places: 3, cost: 340, bookedIds: ["p-110"] },
    { id: "crs-3", ticket: "Manual handling", provider: "Declan Furey, in house", venue: "Head office training room", date: next[2]!, places: 8, cost: 0, bookedIds: ["p-108", "p-123", "p-129"] },
    { id: "crs-4", ticket: "Scaffolding ticket, advanced", provider: "Midwest Safety Training", venue: "Limerick", date: next[3]!, places: 2, cost: 395, bookedIds: ["p-119"] },
    // The course Declan asked to spend on (Admin, Requests): one place left for Marek.
    { id: "crs-5", ticket: "Abrasive wheels", provider: "Midwest Safety Training", venue: "Limerick", date: workdays(today, 6), places: 6, cost: 185, bookedIds: ["p-102", "p-104", "p-105", "p-113", "p-115"] },
    { id: "crs-6", ticket: "First aid responder", provider: "Red Cross Training", venue: "Galway", date: workdays(today, 12), places: 2, cost: 520, bookedIds: ["p-sm3"] },
    // Yesterday's course, not marked done yet: marking it renews Micheál's hot works ticket.
    { id: "crs-8", ticket: "Hot works", provider: "Midwest Safety Training", venue: "Galway", date: workdays(today, -1), places: 4, cost: 210, bookedIds: ["p-112"] },
    { id: "crs-7", ticket: "Working at height", provider: "Midwest Safety Training", venue: "Head office training room", date: done, places: 6, cost: 145, bookedIds: ["p-121", "p-122", "p-125"], doneAt: `${done}T16:30:00`, doneBy: "Declan Furey" },
  ];
}

/** The firm's own papers: insurances, tax clearance and registrations. */
export function seedCompanyPapers(today: string): CompanyPaper[] {
  const year = Number(today.slice(0, 4));
  // Tax clearance runs to the end of the year; in December the new one is already in.
  const taxTo = `${today.slice(5) >= "12-01" ? year + 1 : year}-12-31`;
  return [
    { id: "co-1", name: "Public liability insurance", provider: "Atlantic Mutual Insurance DAC", reference: "PL-46120", cover: "€6.5m", expires: addDays(today, 74) },
    { id: "co-2", name: "Employers' liability insurance", provider: "Atlantic Mutual Insurance DAC", reference: "EL-46121", cover: "€13m", expires: addDays(today, 74) },
    { id: "co-3", name: "Contractors all risk insurance", provider: "Atlantic Mutual Insurance DAC", reference: "CAR-46122", cover: "€2m a contract", expires: addDays(today, 19) },
    { id: "co-4", name: "Professional indemnity insurance", provider: "Atlantic Mutual Insurance DAC", reference: "PI-46125", cover: "€1m", expires: addDays(today, 301), proofNeeded: true },
    { id: "co-5", name: "Tax clearance certificate", provider: "Revenue", reference: "Access number 0847712", expires: taxTo },
    { id: "co-6", name: "Safe-T-Cert", provider: "Safe-T-Cert scheme", reference: "STC-2031", expires: addDays(today, 212) },
    { id: "co-7", name: "CIRI registration", provider: "Construction Industry Register Ireland", reference: "CIRI-04417", expires: addDays(today, 165) },
  ];
}

/** Each subcontractor's insurances, safety statement, method statements and people. */
export function fillSubPapers(today: string, subs: Subcontractor[]) {
  let n = 0;
  const paper = (kind: SubPaper["kind"], days: number | null, extra: Partial<SubPaper> = {}): SubPaper => ({
    id: `spp-${++n}`,
    kind,
    receivedOn: addDays(today, days === null ? -40 : Math.min(-20, days - 365)),
    via: "Portal",
    ...(days === null ? {} : { expires: addDays(today, days) }),
    ...extra,
  });
  const rams = (code: string, ago: number) => paper("Method statement", null, { projectId: pid(code), receivedOn: workdays(today, -ago), reference: `RAMS for ${code}` });
  let w = 0;
  const worker = (name: string, days: number): SubWorker => ({ id: `sw-${++w}`, name, safePassExpires: addDays(today, days) });
  const fill: Record<string, { papers: SubPaper[]; workers: SubWorker[] }> = {
    "sub-1": {
      papers: [paper("Public liability", 120, { cover: "€6.5m", reference: "Pol. 88-2041" }), paper("Employers' liability", 120, { cover: "€13m", reference: "Pol. 88-2042" }), paper("Safety statement", 165, { via: "Email" }), rams("C719", 40)],
      workers: [worker("Paddy Joyce", 410), worker("Łukasz Zieliński", -9), worker("Ciarán Folan", 720)],
    },
    "sub-2": {
      papers: [paper("Public liability", 210, { cover: "€6.5m", reference: "KSC-PL-17" }), paper("Employers' liability", -4, { cover: "€13m", reference: "KSC-EL-17", via: "Email" }), paper("Safety statement", 90), rams("C719", 38), rams("C722", 22)],
      workers: [worker("Fergal Hynes", 300), worker("Ruairí Mac Dara", 815)],
    },
    "sub-3": {
      papers: [paper("Public liability", 20, { cover: "€6.5m", reference: "LRL-6630" }), paper("Employers' liability", 200, { cover: "€13m", reference: "LRL-6631" }), paper("Safety statement", 140), rams("C721", 27)],
      workers: [worker("Séamus Considine", 55), worker("Darius Kazlauskas", 26)],
    },
    "sub-4": {
      papers: [paper("Public liability", 300, { cover: "€10m", reference: "CES-2290" }), paper("Employers' liability", 300, { cover: "€13m", reference: "CES-2291" }), paper("Safety statement", 250), rams("C719", 41), rams("C720", 30)],
      workers: [worker("Brian Kealy", 500), worker("Niall Scanlon", 610)],
    },
    "sub-5": {
      papers: [paper("Public liability", 180, { cover: "€6.5m", reference: "PDP-1180" }), paper("Employers' liability", 180, { cover: "€13m", reference: "PDP-1181" }), paper("Safety statement", -12, { via: "Email" }), rams("C720", 19)],
      workers: [worker("Gráinne Nevin", 310)],
    },
  };
  for (const s of subs) Object.assign(s, fill[s.id] ?? { papers: [], workers: [] });
}

/**
 * The scaffold registers: the hired scaffolds on three sites and two of the firm's own towers,
 * inspected on putting up and every 7 days after. Two are past their inspection.
 */
export function seedScaffolds(today: string, projects: Project[], people: Person[], hireStart: (hireRef: string) => string | undefined): Scaffold[] {
  const sm = (code: string) => people.find((p) => p.id === projects.find((x) => x.code === code)?.siteManagerId)?.name ?? "Site manager";
  let n = 0;
  /** Inspections from the day it went up to `last`, every 7 days counted back from `last`. */
  const history = (code: string, erectedOn: string, last: string, notes: string[], unsafe?: { daysBefore: number; note: string }): ScaffoldInspection[] => {
    const dates: string[] = [];
    for (let d = last; d > erectedOn; d = addDays(d, -7)) dates.push(d);
    dates.push(erectedOn);
    const out: ScaffoldInspection[] = dates.map((date, i) => ({ id: `si-${++n}`, date, by: sm(code), result: "Safe to use", note: i === dates.length - 1 ? "Handed over by the erector. Checked before first use; tag fixed." : notes[i % notes.length]! }));
    if (unsafe) {
      // Found unsafe one day, fixed by the erector and passed the next working day.
      const bad = workdays(last, -unsafe.daysBefore);
      if (bad > erectedOn) {
        out.push({ id: `si-${++n}`, date: bad, by: sm(code), result: "Not safe to use", note: unsafe.note });
        out.push({ id: `si-${++n}`, date: workdays(bad, 1), by: sm(code), result: "Safe to use", note: "Ties put back by the erector. Checked again and tagged green." });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || (a.result === "Safe to use" ? -1 : 1));
  };
  const usual = ["Ties, boards, guard rails and toe boards checked. Tag updated.", "Checked after the weekend's wind. All ties sound.", "Loading bay gate and brick guards checked. Tag updated."];
  const scf = (code: string, ref: string, kind: Scaffold["kind"], description: string, erectedBy: string, erectedOn: string, last: string, extra: Partial<Scaffold> = {}, unsafe?: { daysBefore: number; note: string }): Scaffold => ({
    id: `scf-${code}-${ref}`,
    projectId: pid(code),
    ref,
    kind,
    description,
    erectedBy,
    erectedOn,
    inspections: history(code, erectedOn, last, usual, unsafe),
    ...extra,
  });
  return [
    scf("C719", "S1", "Scaffold", "Independent tied scaffold to the tower, 28 m", "Corrib Scaffolding", hireStart("CS-88214") ?? workdays(today, -43), workdays(today, -3)),
    scf("C719", "S2", "Scaffold", "Birdcage scaffold, nave interior", "Corrib Scaffolding", workdays(today, -20), workdays(today, -7)),
    scf("C721", "S1", "Scaffold", "Temporary roof over the main mill, 14 x 9 m", "Corrib Scaffolding", hireStart("CS-88377") ?? workdays(today, -29), workdays(today, -4)),
    scf("C722", "S1", "Scaffold", "Pavement gantry and façade scaffold with netting", "Midland Access Hire", hireStart("MAH-20531") ?? workdays(today, -25), workdays(today, -2), {}, { daysBefore: 6, note: "Two ties missing at the third lift after the façade crew moved them. Tagged red and the gantry closed until the erector puts them back." }),
    scf("C720", "T1", "Tower", "Mobile tower ST1, west range stair hall", "Own team", workdays(today, -12), workdays(today, -1), { plantId: "pl-ST1" }),
    scf("C723", "T1", "Tower", "Mobile tower ST2, chapel ceiling", "Own team", workdays(today, -18), workdays(today, -8), { plantId: "pl-ST2" }),
  ];
}
