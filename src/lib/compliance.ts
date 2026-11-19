/**
 * Compliance (18 Nov, after the HVAC compliance demo, layouts and features only): every expiry
 * in one place. Training tickets, driving licences, vehicle papers and services, machinery
 * checks and services, the weekly scaffold inspections, the firm's own papers, and each
 * subcontractor's papers and people.
 *
 * Also the two rules that stop work (Oisin's picks): someone whose Safe Pass or trade ticket
 * has run out cannot be planned or marked on site, and a machine whose examination, test or
 * insurance has run out cannot go to a site. A ticket or paper is good through its expiry day.
 */
import type { Cert, Course, Db, LicenceCheck, LicenceKey, Person, PlantItem, Renewal, Scaffold, SubPaperKind, Subcontractor, Vehicle } from "@/data/types";
import { driversOf } from "./fleet";
import { testName } from "./fleet-spend";
import { addDays } from "./dates";
import { daysBetween, nextServiceDate } from "./status";

/** How far ahead something counts as due soon: 30 days for everything (his pick). */
export const DUE_WINDOW = 30;

export type CState = "expired" | "due" | "ok" | "missing";

/** Where a date stands today. No date at all means the paper is missing. */
export function stateOf(due: string | null | undefined, today: string): CState {
  if (!due) return "missing";
  if (due < today) return "expired";
  return daysBetween(today, due) <= DUE_WINDOW ? "due" : "ok";
}

/** A check or service is overdue; a ticket, paper or insurance runs out. */
export const isCheck = (item: string) => /^(Service|Weekly inspection)|check$/i.test(item);

/** "Ran out 3 days ago", "Due today", "Due in 12 days", "In date". */
export function stateWords(due: string | null | undefined, today: string, overdue = "Ran out"): string {
  if (!due) return "Missing";
  const d = daysBetween(today, due);
  if (d < 0) return `${overdue} ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "Due today";
  if (d <= DUE_WINDOW) return `Due in ${d} day${d === 1 ? "" : "s"}`;
  return "In date";
}

// ── Tickets, and who may go on site ───────────────────────────────────────────

/** The basic site safety card: Safe Pass in Ireland, CSCS card in the UK. */
export const SAFETY_CARDS = ["Safe Pass", "CSCS card"];
export const isSafetyCard = (name: string) => SAFETY_CARDS.includes(name);

/** The tickets a trade cannot work without, on top of the safety card. */
export const TRADE_TICKETS: Record<string, string[]> = {
  Scaffolder: ["Scaffolding ticket, advanced"],
  "Roofer and slater": ["Mobile elevating work platform"],
  Leadworker: ["Hot works"],
  Stonemason: ["Abrasive wheels"],
  "Site manager": ["Site supervisor safety"],
};

/** Operatives and site managers work on site; office staff do not. */
export const goesOnSite = (p: Person) => p.kind === "Operative" || p.isSiteManager;

/** The tickets someone needs to be on site: the safety card and their trade's own. */
export function neededTickets(p: Person, safetyCard = "Safe Pass"): string[] {
  if (!goesOnSite(p)) return [];
  return [safetyCard, ...(TRADE_TICKETS[p.trade] ?? [])];
}
const isNeeded = (p: Person, name: string) => goesOnSite(p) && (isSafetyCard(name) || (TRADE_TICKETS[p.trade] ?? []).includes(name));

export type Block = { ticket: string; expires: string | null };

/**
 * What stops someone working on site on a date: a needed ticket that is missing, or that ran
 * out before that date. Empty when they may work.
 */
export function ticketBlocks(p: Person, date: string): Block[] {
  if (!goesOnSite(p)) return [];
  const out: Block[] = [];
  const card = p.certs.find((c) => isSafetyCard(c.name));
  if (!card) out.push({ ticket: "Safe Pass", expires: null });
  else if (card.expires < date) out.push({ ticket: card.name, expires: card.expires });
  for (const t of TRADE_TICKETS[p.trade] ?? []) {
    const c = p.certs.find((x) => x.name === t);
    if (!c) out.push({ ticket: t, expires: null });
    else if (c.expires < date) out.push({ ticket: t, expires: c.expires });
  }
  return out;
}

const spoken = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Safe Pass ran out on 17 Nov", "Scaffolding ticket, advanced runs out on 20 Nov" (still to come, given today), "no Hot works on file". */
export const blockText = (b: Block, today?: string) => (b.expires ? `${b.ticket} ${today && b.expires >= today ? "runs" : "ran"} out on ${spoken(b.expires)}` : `no ${b.ticket} on file`);
export const blocksText = (bs: Block[], today?: string) => bs.map((b) => blockText(b, today)).join(", ");

/** For every plan entry given: "person|date" to what stops that person working that day. */
export function planBlocks(people: Person[], plan: { personId: string; date: string }[]): Map<string, Block[]> {
  const out = new Map<string, Block[]>();
  for (const e of plan) {
    const p = people.find((x) => x.id === e.personId);
    if (!p) continue;
    const b = ticketBlocks(p, e.date);
    if (b.length) out.set(`${e.personId}|${e.date}`, b);
  }
  return out;
}

/** How long a ticket from a course lasts: four years for the safety card, three for the rest. */
export const ticketYears = (name: string) => (isSafetyCard(name) ? 4 : 3);
export const renewedTo = (name: string, from: string) => addDays(from, 365 * ticketYears(name));

/** The order of the columns in the training matrix: the safety card first, then the common ones. */
export const MATRIX_ORDER = ["Safe Pass", "CSCS card", "Manual handling", "Working at height", "Abrasive wheels", "Scaffolding ticket, advanced", "Mobile elevating work platform", "Telescopic handler", "Hot works", "Confined spaces", "First aid responder", "Site supervisor safety", "Scaffold inspection"];

export type MatrixCell = { name: string; cert?: Cert; state: CState | "none"; needed: boolean };

/** People down, tickets across. A cell with no ticket is "none", or "missing" if their trade needs it. */
export function ticketMatrix(people: Person[], today: string): { columns: string[]; rows: { person: Person; cells: MatrixCell[] }[] } {
  const found = new Set(people.flatMap((p) => [...p.certs.map((c) => c.name), ...neededTickets(p)]));
  const columns = [...MATRIX_ORDER.filter((n) => found.has(n)), ...[...found].filter((n) => !MATRIX_ORDER.includes(n)).sort()];
  const rows = people.map((person) => ({
    person,
    cells: columns.map((name) => {
      const cert = person.certs.find((c) => c.name === name);
      const needed = isNeeded(person, name);
      return { name, cert, needed, state: cert ? stateOf(cert.expires, today) : needed ? ("missing" as const) : ("none" as const) };
    }),
  }));
  return { columns, rows };
}

// ── Courses ───────────────────────────────────────────────────────────────────

/** Booked (still to come), to mark (the day has passed, not marked done yet) or done. */
export function courseStage(c: Course, today: string): "booked" | "to mark" | "done" {
  if (c.doneAt) return "done";
  return c.date <= today ? "to mark" : "booked";
}

/** The next course still to come for a ticket that has a place free. */
export const openCourse = (courses: Course[], ticket: string, today: string) =>
  courses.filter((c) => c.ticket === ticket && !c.doneAt && c.date > today && c.bookedIds.length < c.places).sort((a, b) => a.date.localeCompare(b.date))[0];

/** Someone's booking for a ticket, if they are on a course still to come or not yet marked done. */
export const bookingFor = (courses: Course[], personId: string, ticket: string) => courses.find((c) => c.ticket === ticket && !c.doneAt && c.bookedIds.includes(personId));

// ── Machinery and vehicles ────────────────────────────────────────────────────

/** Checks without which a machine may not be used: examinations, tests, inspections and insurance. A service is not one of them. */
export const BLOCKING_CHECKS = new Set(["Thorough examination", "Tower inspection", "Electrical safety test", "Harness inspection", "Insurance"]);

/** What stops a machine going to a site on a date. */
export const plantBlocks = (x: PlantItem, date: string): Renewal[] => x.renewals.filter((r) => BLOCKING_CHECKS.has(r.kind) && r.expires < date);

export type VehicleItem = "tax" | "test" | "insurance";
/** A vehicle without tax, test or insurance in date may not be driven. */
export const vehicleBlocks = (v: Vehicle, date: string): VehicleItem[] => (["tax", "test", "insurance"] as const).filter((k) => v.compliance[k].expiryDate < date);

// ── Scaffold register ─────────────────────────────────────────────────────────

/** A scaffold or tower is inspected before first use, then every 7 days and after any change. */
export const SCAFFOLD_DAYS = 7;
export const scaffoldDue = (s: Scaffold) => (s.inspections[0] ? addDays(s.inspections[0].date, SCAFFOLD_DAYS) : s.erectedOn);
export const scaffoldUnsafe = (s: Scaffold) => s.inspections[0]?.result === "Not safe to use";
export const standing = (s: Scaffold) => !s.struckOn;

// ── Driving licences ──────────────────────────────────────────────────────────

/**
 * The office looks at each driver's licence once a year (Compliance, kept at Oisin's word when
 * the two chats were merged, 19 Nov). The licence itself and the Driver CPC, with their expiry
 * dates and copies, are Fleet's (`Person.licences`).
 */
export const LICENCE_CHECK_DAYS = 365;
export const nextLicenceCheck = (c: LicenceCheck) => addDays(c.checkedOn, LICENCE_CHECK_DAYS);
export const LICENCE_WORD: Record<LicenceKey, string> = { driving: "Driving licence", cpc: "Driver CPC" };

// ── Subcontractors ────────────────────────────────────────────────────────────

export const SUB_INSURANCES: SubPaperKind[] = ["Public liability", "Employers' liability"];

/** The latest paper of a kind (for a site, for a method statement). */
export const latestPaper = (s: Subcontractor, kind: SubPaperKind, projectId?: string) =>
  s.papers.filter((p) => p.kind === kind && (projectId === undefined || p.projectId === projectId)).sort((a, b) => (b.expires ?? b.receivedOn).localeCompare(a.expires ?? a.receivedOn))[0];

/** What a subcontractor has out of date or missing, in words, for their invoices and their portal. */
export function subFlags(s: Subcontractor, liveSites: { id: string; code: string }[], today: string): string[] {
  const out: string[] = [];
  for (const k of [...SUB_INSURANCES, "Safety statement" as const]) {
    const p = latestPaper(s, k);
    if (!p) out.push(`no ${k.toLowerCase()} on file`);
    else if (p.expires && p.expires < today) out.push(`${k.toLowerCase()} ran out on ${spoken(p.expires)}`);
  }
  for (const site of liveSites.filter((x) => s.projectIds.includes(x.id))) if (!latestPaper(s, "Method statement", site.id)) out.push(`no method statement for ${site.code}`);
  const lapsed = s.workers.filter((w) => w.safePassExpires < today);
  if (lapsed.length) out.push(`${lapsed.map((w) => w.name).join(" and ")}: Safe Pass ran out`);
  return out;
}
/** Only the insurances: what flags a subcontractor's invoices. */
export const subInsuranceFlags = (s: Subcontractor, today: string) =>
  SUB_INSURANCES.flatMap((k) => {
    const p = latestPaper(s, k);
    return !p ? [`No ${k.toLowerCase()} insurance on file`] : p.expires && p.expires < today ? [`${k} insurance ran out on ${spoken(p.expires)}`] : [];
  });

// ── Every row in one list ─────────────────────────────────────────────────────

export type Area = "personnel" | "fleet" | "machinery" | "company" | "subcontractors";
export const AREAS: { key: Area; label: string }[] = [
  { key: "personnel", label: "Personnel" },
  { key: "fleet", label: "Fleet" },
  { key: "machinery", label: "Machinery" },
  { key: "company", label: "Company" },
  { key: "subcontractors", label: "Subcontractors" },
];

export type RowRef =
  | { kind: "cert"; personId: string; certId: string }
  /** The office's yearly look at a driver's licence. */
  | { kind: "licence"; personId: string }
  /** The driving licence or Driver CPC itself, kept in Fleet. */
  | { kind: "driverLicence"; personId: string; which: LicenceKey }
  | { kind: "vehicle"; vehicleId: string; item: VehicleItem }
  | { kind: "vehicleService"; vehicleId: string }
  | { kind: "plantCheck"; plantId: string; renewalId: string }
  | { kind: "plantService"; plantId: string }
  | { kind: "scaffold"; scaffoldId: string }
  | { kind: "company"; paperId: string }
  | { kind: "subPaper"; subId: string; paper: SubPaperKind; projectId?: string }
  | { kind: "subWorker"; subId: string; workerId: string };

export type ComplianceRow = {
  key: string;
  area: Area;
  who: string;
  whoSub: string;
  /** Where the record lives in the rest of the app. */
  to?: string;
  item: string;
  /** Null when the paper is missing. */
  due: string | null;
  /** A service worked out from typical weekly use, so its date is a forecast. */
  approx?: boolean;
  state: CState;
  proofNeeded: boolean;
  /** Out of date in a way that stops work: a needed ticket, a machine check, a vehicle paper, a scaffold. */
  blocks: boolean;
  /** Live sites it belongs to, for site managers, who see only their own. Empty: not tied to a site. */
  siteIds: string[];
  ref: RowRef;
  /** A photo of a new card, or a licence, sent from the site phone and waiting to be checked. */
  sent?: boolean;
};

export type Words = { safetyCard: string; vehicleTest: string; roadTax: string };
const IE_WORDS: Words = { safetyCard: "Safe Pass", vehicleTest: "CVRT", roadTax: "Motor tax" };

/** Every dated thing in the firm, soonest first: one row each. */
export function complianceRows(db: Db, today: string, words: Words = IE_WORDS): ComplianceRow[] {
  const rows: ComplianceRow[] = [];
  const live = db.projects.filter((p) => p.status === "Live" || p.status === "Not started");
  const liveIds = new Set(live.map((p) => p.id));
  const code = (id: string | null | undefined) => db.projects.find((p) => p.id === id)?.code ?? "";
  const sitesOf = (personId: string) => [
    ...new Set([
      ...db.assignments.filter((a) => a.personId === personId && liveIds.has(a.projectId)).map((a) => a.projectId),
      ...db.plan.filter((e) => e.personId === personId && e.date >= today && liveIds.has(e.projectId)).map((e) => e.projectId),
      ...live.filter((p) => p.siteManagerId === personId).map((p) => p.id),
    ]),
  ];

  // Personnel: tickets, and licences for people who drive.
  for (const p of db.people.filter((x) => x.active)) {
    const siteIds = sitesOf(p.id);
    const whoSub = siteIds.length ? `${p.trade}, on ${siteIds.map(code).sort().join(", ")}` : p.trade;
    for (const c of p.certs) {
      const state = stateOf(c.expires, today);
      rows.push({ key: `cert:${c.id}`, area: "personnel", who: p.name, whoSub, to: `/compliance/personnel?view=list&person=${p.id}`, item: c.name, due: c.expires, state, proofNeeded: !!c.proofNeeded, blocks: state === "expired" && isNeeded(p, c.name), siteIds, ref: { kind: "cert", personId: p.id, certId: c.id }, sent: !!c.sentPhoto });
    }
    for (const t of neededTickets(p, words.safetyCard).filter((t) => !p.certs.some((c) => c.name === t || (isSafetyCard(t) && isSafetyCard(c.name))))) {
      rows.push({ key: `need:${p.id}:${t}`, area: "personnel", who: p.name, whoSub, to: `/compliance/personnel?person=${p.id}`, item: t, due: null, state: "missing", proofNeeded: false, blocks: true, siteIds, ref: { kind: "cert", personId: p.id, certId: "" } });
    }
  }

  // Fleet: tax, test, insurance and service, read from Fleet's own records (one set, shown in
  // both places since the two chats were merged, 19 Nov); then each driver's licence, Driver CPC
  // and the office's yearly licence check.
  const region = words.vehicleTest === "MOT" ? "UK" : "IE";
  for (const v of db.vehicles.filter((x) => x.active)) {
    const driver = db.people.find((p) => p.id === v.driverId);
    const who = `${v.reg} ${v.make} ${v.model}`;
    const whoSub = driver ? `${v.kind}, ${driver.name}` : `${v.kind}, pool vehicle`;
    const to = `/fleet/vehicles/${v.id}`;
    const items: [VehicleItem, string][] = [["tax", words.roadTax], ["test", testName(v.kind, region)], ["insurance", "Insurance"]];
    for (const [k, label] of items) {
      const c = v.compliance[k];
      const state = c.expiryDate ? stateOf(c.expiryDate, today) : "missing";
      rows.push({ key: `veh:${v.id}:${k}`, area: "fleet", who, whoSub, to, item: label, due: c.expiryDate || null, state, proofNeeded: !!c.proofNeeded, blocks: state === "expired" || state === "missing", siteIds: [], ref: { kind: "vehicle", vehicleId: v.id, item: k } });
    }
    const svc = nextServiceDate(v.service, today);
    rows.push({ key: `vsvc:${v.id}`, area: "fleet", who, whoSub, to, item: v.service.basis === "km" ? `Service, every ${v.service.intervalKm.toLocaleString("en-IE")} km` : "Service", due: svc.date, approx: v.service.basis !== "months", state: stateOf(svc.date, today), proofNeeded: false, blocks: false, siteIds: [], ref: { kind: "vehicleService", vehicleId: v.id } });
  }
  for (const d of driversOf(db.people, db.vehicles).filter((x) => x.active)) {
    const p = db.people.find((x) => x.id === d.id);
    if (!p) continue;
    const van = db.vehicles.find((v) => v.active && v.driverId === p.id);
    const whoSub = van ? `Drives ${van.reg}, ${van.kind.toLowerCase()}` : "Drives a pool vehicle";
    const to = `/fleet/drivers?driver=${p.id}`;
    for (const which of ["driving", "cpc"] as const) {
      const l = p.licences?.[which];
      // A Driver CPC is only for those who drive a tipper: no CPC on file and no tipper, nothing to show.
      if (!l && (which === "driving" ? false : van?.kind !== "Tipper")) continue;
      const state = l ? stateOf(l.expiryDate, today) : "missing";
      const stops = which === "driving" || van?.kind === "Tipper";
      rows.push({ key: `dl:${p.id}:${which}`, area: "fleet", who: p.name, whoSub, to, item: LICENCE_WORD[which], due: l?.expiryDate ?? null, state, proofNeeded: !!l?.proofNeeded, blocks: stops && (state === "expired" || state === "missing"), siteIds: [], ref: { kind: "driverLicence", personId: p.id, which }, sent: !!l?.fromPhoneAt });
    }
    const due = p.licenceCheck ? nextLicenceCheck(p.licenceCheck) : null;
    rows.push({ key: `lic:${p.id}`, area: "fleet", who: p.name, whoSub, to: `/compliance/fleet?driver=${p.id}`, item: "Yearly licence check", due, state: due ? stateOf(due, today) : "missing", proofNeeded: false, blocks: false, siteIds: [], ref: { kind: "licence", personId: p.id } });
  }

  // Machinery: checks, services, and the scaffold register.
  for (const x of db.plant) {
    const at = x.status === "Off for repair" ? "off for repair" : x.projectId ? `on ${code(x.projectId)}` : "in the yard";
    const who = `${x.assetRef} ${x.name}`;
    const siteIds = x.projectId && liveIds.has(x.projectId) ? [x.projectId] : [];
    for (const r of x.renewals) {
      const state = stateOf(r.expires, today);
      rows.push({ key: `chk:${x.id}:${r.id}`, area: "machinery", who, whoSub: `${x.kind}, ${at}`, to: `/plant?item=${x.id}`, item: r.kind, due: r.expires, state, proofNeeded: !!r.proofNeeded, blocks: state === "expired" && BLOCKING_CHECKS.has(r.kind), siteIds, ref: { kind: "plantCheck", plantId: x.id, renewalId: r.id } });
    }
    const svc = nextServiceDate(x.service, today);
    rows.push({ key: `psvc:${x.id}`, area: "machinery", who, whoSub: `${x.kind}, ${at}`, to: `/plant?item=${x.id}`, item: x.service.basis === "hours" ? `Service, every ${x.service.intervalHours} hrs` : `Service, every ${x.service.basis === "months" ? x.service.intervalMonths : ""} months`, due: svc.date, approx: x.service.basis !== "months", state: stateOf(svc.date, today), proofNeeded: false, blocks: false, siteIds, ref: { kind: "plantService", plantId: x.id } });
  }
  for (const s of db.scaffolds.filter((x) => standing(x) && liveIds.has(x.projectId))) {
    const due = scaffoldDue(s);
    const unsafe = scaffoldUnsafe(s);
    const state = unsafe ? "expired" : stateOf(due, today);
    rows.push({ key: `scf:${s.id}`, area: "machinery", who: `${code(s.projectId)} ${s.ref} ${s.description}`, whoSub: `${s.kind}, put up by ${s.erectedBy === "Own team" ? "our own team" : s.erectedBy}`, to: `/projects/${code(s.projectId)}?tab=plant`, item: unsafe ? "Weekly inspection: not safe to use" : "Weekly inspection", due, state, proofNeeded: false, blocks: state === "expired", siteIds: [s.projectId], ref: { kind: "scaffold", scaffoldId: s.id } });
  }

  // The firm's own papers.
  for (const c of db.companyPapers) {
    rows.push({ key: `co:${c.id}`, area: "company", who: c.name, whoSub: `${c.provider}, ${c.reference}`, to: "/compliance/company", item: c.cover ? `Renewal, cover ${c.cover}` : "Renewal", due: c.expires, state: stateOf(c.expires, today), proofNeeded: !!c.proofNeeded, blocks: false, siteIds: [], ref: { kind: "company", paperId: c.id } });
  }

  // Each subcontractor: insurances, safety statement, a method statement for each live site, their people.
  for (const s of db.subcontractors) {
    const siteIds = s.projectIds.filter((id) => liveIds.has(id));
    const to = `/compliance/subcontractors?sub=${s.id}`;
    for (const k of [...SUB_INSURANCES, "Safety statement" as const]) {
      const p = latestPaper(s, k);
      const due = p?.expires ?? null;
      rows.push({ key: `sp:${s.id}:${k}`, area: "subcontractors", who: s.name, whoSub: s.trade, to, item: k === "Safety statement" ? "Safety statement, yearly review" : `${k} insurance${p?.cover ? `, ${p.cover}` : ""}`, due, state: stateOf(due, today), proofNeeded: !!p?.proofNeeded, blocks: false, siteIds, ref: { kind: "subPaper", subId: s.id, paper: k } });
    }
    for (const id of siteIds) {
      const p = latestPaper(s, "Method statement", id);
      rows.push({ key: `rams:${s.id}:${id}`, area: "subcontractors", who: s.name, whoSub: s.trade, to, item: `Method statement, ${code(id)}`, due: null, state: p ? "ok" : "missing", proofNeeded: !!p?.proofNeeded, blocks: false, siteIds: [id], ref: { kind: "subPaper", subId: s.id, paper: "Method statement", projectId: id } });
    }
    for (const w of s.workers) {
      rows.push({ key: `sw:${s.id}:${w.id}`, area: "subcontractors", who: w.name, whoSub: s.name, to, item: words.safetyCard, due: w.safePassExpires, state: stateOf(w.safePassExpires, today), proofNeeded: !!w.proofNeeded, blocks: false, siteIds, ref: { kind: "subWorker", subId: s.id, workerId: w.id } });
    }
  }

  // Soonest first; a missing paper is the most urgent of all; a method statement that came in has no date and goes last.
  const rank = (r: ComplianceRow) => (r.state === "missing" ? "0000" : (r.due ?? "9999"));
  return rows.sort((a, b) => rank(a).localeCompare(rank(b)) || a.who.localeCompare(b.who));
}

export type Counts = { expired: number; due: number; proof: number; ok: number; blocks: number };
export function countRows(rows: ComplianceRow[]): Counts {
  return {
    expired: rows.filter((r) => r.state === "expired" || r.state === "missing").length,
    due: rows.filter((r) => r.state === "due").length,
    proof: rows.filter((r) => r.proofNeeded || r.sent).length,
    ok: rows.filter((r) => r.state === "ok").length,
    blocks: rows.filter((r) => r.blocks).length,
  };
}

/** What a person may see: everything, or (a site manager) only the rows on their own sites. */
export function rowsInScope(rows: ComplianceRow[], siteIds: Set<string> | null): ComplianceRow[] {
  if (!siteIds) return rows;
  return rows.filter((r) => (r.area === "personnel" || r.area === "machinery" || r.area === "subcontractors") && r.siteIds.some((id) => siteIds.has(id)));
}

// ── The Monday reminder ───────────────────────────────────────────────────────

/**
 * The Monday list (his pick: a weekly list across every area). Everything that has run out or
 * runs out in the next 30 days, grouped by area, from the health and safety officer.
 */
export function mondayReminder(db: Db, monday: string, words: Words = IE_WORDS): string {
  const rows = complianceRows(db, monday, words).filter((r) => r.state !== "ok");
  const gone = (r: ComplianceRow) => (r.ref.kind === "scaffold" && r.item.includes("not safe") ? "tagged not safe to use" : isCheck(r.item) ? `overdue since ${r.approx ? "about " : ""}${spoken(r.due!)}` : `ran out on ${spoken(r.due!)}`);
  const line = (r: ComplianceRow) => `- ${r.who}${r.area === "personnel" ? `, ${r.whoSub.charAt(0).toLowerCase()}${r.whoSub.slice(1)}` : ""}: ${r.item}, ${r.state === "missing" ? "missing" : r.state === "expired" ? gone(r) : `${r.approx ? "due about" : "due"} ${spoken(r.due!)}`}`;
  const out = ["Hello all,", "", "This is everything that has run out or runs out in the next 30 days. Nobody works on site with a Safe Pass or trade ticket out of date, and no machine goes to a site without its examination, test and insurance in date. Book renewal courses through me."];
  for (const a of AREAS) {
    const mine = rows.filter((r) => r.area === a.key);
    if (mine.length) out.push("", `${a.label}:`, ...mine.map(line));
  }
  out.push("", "Kind regards,", "Declan Furey", "Health and safety officer");
  return out.join("\n");
}

/** Who to tell about a van that may not be driven: its driver, by name and what ran out. */
export const vehicleNotice = (v: Vehicle, date: string, words: Words = IE_WORDS) => {
  const label: Record<VehicleItem, string> = { tax: words.roadTax.toLowerCase(), test: words.vehicleTest, insurance: "insurance" };
  const gone = vehicleBlocks(v, date);
  return gone.length ? `${v.reg}: ${gone.map((k) => label[k]).join(" and ")} ran out. Do not drive it until the office renews it.` : "";
};

/** Re-exported so screens can say when a planned person can work again. */
export { daysBetween };
