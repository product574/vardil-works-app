/**
 * ABC's sample fleet (18 Nov, in the shape of the Secure-All build's Fleet, at Oisin's word): six
 * bases, eight garages, 20 vehicles on the fleet and 2 since removed, 18 months of garage invoices,
 * the tax, test and insurance papers, damage reported from the site phones, licences, garage notes
 * and the managing director's to-dos. All dated relative to the demo's day.
 *
 * Planted on purpose: one invoice entered twice (a duplicate number), one van repaired twice
 * inside 30 days, a few renewals due or overdue, two new discs not ticked on, a CPC out of date,
 * a licence sent from the phone waiting to be checked, and three damage reports still new.
 *
 * Each repair is filed under the van's base, its driver, and the site that driver was on that day
 * (from the timesheet), so repair spend can be read by site.
 */
import { addDays } from "@/lib/dates";
import { r2 } from "@/lib/money";
import { driverSiteOn } from "@/lib/roster";
import type { Attendance, Base, DamageReport, FleetDoc, Garage, GarageNote, InvoiceLine, Licence, Person, PlanEntry, Project, Proof, RepairCategory, RepairInvoice, Todo, Vehicle } from "../types";
import { at, type Rng, weekday, workdays } from "./util";

export const BASES: Base[] = [
  { id: "b-gal", name: "Oranmore yard", county: "Galway", region: "West", kind: "Yard" },
  { id: "b-off", name: "Head office", county: "Galway", region: "West", kind: "Office" },
  { id: "b-dub", name: "Clondalkin yard", county: "Dublin", region: "East", kind: "Yard" },
  { id: "b-kil", name: "Naas yard", county: "Kildare", region: "East", kind: "Yard" },
  { id: "b-cla", name: "Ennis depot", county: "Clare", region: "Mid West", kind: "Yard" },
  { id: "b-wat", name: "Waterford depot", county: "Waterford", region: "South East", kind: "Yard" },
];

export const GARAGES: Garage[] = [
  { id: "g-01", name: "Oranmore Commercials", town: "Oranmore", county: "Galway", phone: "091 555 0310", email: "accounts@oranmorecommercials.example", contact: "Brian Fahy" },
  { id: "g-02", name: "Liffey Valley Fleet Services", town: "Clondalkin", county: "Dublin", phone: "01 555 0412", email: "service@liffeyvalleyfleet.example", contact: "Gary Nolan" },
  { id: "g-03", name: "Banner Motor Works", town: "Ennis", county: "Clare", phone: "065 555 0218", email: "office@bannermotorworks.example", contact: "Ger McMahon" },
  { id: "g-04", name: "Naas Road Van Centre", town: "Naas", county: "Kildare", phone: "045 555 0177", email: "invoices@naasroadvans.example", contact: "Ray Kinsella" },
  { id: "g-05", name: "Suir Valley Motors", town: "Butlerstown", county: "Waterford", phone: "051 555 0261", email: "accounts@suirvalleymotors.example", contact: "Declan Power" },
  { id: "g-06", name: "Kildare Truck Services", town: "Newbridge", county: "Kildare", phone: "045 555 0390", email: "workshop@kildaretruck.example", contact: "Seán Kenny", notes: "Tippers and anything over 3.5 tonne" },
  { id: "g-07", name: "Corrib Tyre and Glass", town: "Oranmore", county: "Galway", phone: "091 555 0466", email: "sales@corribtyreglass.example", contact: "Martina Keane", notes: "Mobile fitting, will come to any site in the west" },
  { id: "g-08", name: "Atlantic Recovery", town: "Claregalway", county: "Galway", phone: "091 555 0599", email: "jobs@atlanticrecovery.example", contact: "Pádraig Hynes", notes: "Recovery day and night" },
];

type VSpec = { reg: string; make: string; model: string; kind: Vehicle["kind"]; fuel: Vehicle["fuel"]; division: string; base: string; driver: string | null; price: number; bought: string; km: number; leased?: boolean };

/** The twelve vans ABC had before, with the same drivers, then eight more (Oisin picked "about 20"). */
const SPECS: VSpec[] = [
  { reg: "231-G-4471", make: "Ford", model: "Transit Custom", kind: "Van", fuel: "Diesel", division: "Site manager's van", base: "b-gal", driver: "p-sm2", price: 38500, bought: "2023-02", km: 71400 },
  { reg: "222-G-10283", make: "Ford", model: "Transit Custom", kind: "Van", fuel: "Diesel", division: "Contracts manager", base: "b-gal", driver: "p-cm1", price: 36900, bought: "2022-09", km: 98200 },
  { reg: "212-D-18834", make: "Renault", model: "Master", kind: "Crew van", fuel: "Diesel", division: "Site crew van", base: "b-dub", driver: "p-sm5", price: 34200, bought: "2021-08", km: 141600 },
  { reg: "241-KE-2291", make: "Volkswagen", model: "Crafter", kind: "Crew van", fuel: "Diesel", division: "Site crew van", base: "b-kil", driver: "p-sm1", price: 46800, bought: "2024-02", km: 48300, leased: true },
  { reg: "201-CE-905", make: "Toyota", model: "Hilux", kind: "Pickup", fuel: "Diesel", division: "Site manager's pickup", base: "b-cla", driver: "p-sm3", price: 39900, bought: "2020-04", km: 162800 },
  { reg: "232-RN-1147", make: "Isuzu", model: "D-Max", kind: "Pickup", fuel: "Diesel", division: "Site manager's pickup", base: "b-gal", driver: "p-sm4", price: 41200, bought: "2023-08", km: 56900 },
  { reg: "191-G-7730", make: "Ford", model: "Transit tipper", kind: "Tipper", fuel: "Diesel", division: "Yard, muck away and materials", base: "b-gal", driver: "p-yard", price: 33400, bought: "2019-05", km: 184300 },
  { reg: "221-WW-3316", make: "Iveco", model: "Daily 70C tipper", kind: "Tipper", fuel: "Diesel", division: "Muck away and materials", base: "b-dub", driver: "p-128", price: 44600, bought: "2022-03", km: 103900 },
  { reg: "211-W-6052", make: "Ford", model: "Transit Custom", kind: "Van", fuel: "Diesel", division: "Joinery", base: "b-wat", driver: "p-114", price: 31800, bought: "2021-03", km: 133700 },
  { reg: "242-G-915", make: "Mercedes", model: "Sprinter", kind: "Crew van", fuel: "Diesel", division: "Site crew van", base: "b-gal", driver: "p-107", price: 52300, bought: "2024-08", km: 34100, leased: true },
  { reg: "182-D-40117", make: "Renault", model: "Trafic", kind: "Van", fuel: "Diesel", division: "Contracts manager", base: "b-dub", driver: "p-cm2", price: 27500, bought: "2018-10", km: 196200 },
  { reg: "202-MO-2284", make: "Toyota", model: "Hilux", kind: "Pickup", fuel: "Diesel", division: "Health and safety", base: "b-off", driver: "p-hs", price: 38700, bought: "2020-09", km: 151900 },
  { reg: "241-G-1102", make: "Toyota", model: "RAV4 Hybrid", kind: "Car", fuel: "Hybrid", division: "Management", base: "b-off", driver: "p-md", price: 46900, bought: "2024-01", km: 39800, leased: true },
  { reg: "231-KE-4410", make: "Iveco", model: "Daily 70C tipper", kind: "Tipper", fuel: "Diesel", division: "Scaffold and materials", base: "b-kil", driver: "p-119", price: 47900, bought: "2023-05", km: 61200 },
  { reg: "222-CE-1180", make: "Ford", model: "Transit tipper", kind: "Tipper", fuel: "Diesel", division: "Muck away and materials", base: "b-cla", driver: "p-123", price: 35800, bought: "2022-11", km: 88400 },
  { reg: "232-G-2214", make: "Volkswagen", model: "Crafter", kind: "Crew van", fuel: "Diesel", division: "Stonemasons' crew van", base: "b-gal", driver: "p-101", price: 47400, bought: "2023-09", km: 52700 },
  { reg: "211-D-30155", make: "Ford", model: "Transit Custom", kind: "Van", fuel: "Diesel", division: "Leadwork", base: "b-dub", driver: "p-112", price: 32600, bought: "2021-02", km: 127100 },
  { reg: "222-W-1407", make: "Renault", model: "Master", kind: "Crew van", fuel: "Diesel", division: "Roofers' crew van", base: "b-wat", driver: "p-109", price: 36400, bought: "2022-07", km: 94600 },
  { reg: "251-G-640", make: "Mercedes", model: "Sprinter", kind: "Crew van", fuel: "Diesel", division: "Pool crew van", base: "b-gal", driver: null, price: 54100, bought: "2025-02", km: 18900, leased: true },
  { reg: "201-D-7719", make: "Renault", model: "Trafic", kind: "Van", fuel: "Diesel", division: "Pool van", base: "b-dub", driver: null, price: 29200, bought: "2020-03", km: 171300 },
];

/** Removed from the fleet: one sold, one scrapped (not sold). */
const REMOVED: (VSpec & { removedAgoDays: number; sold: number | null })[] = [
  { reg: "171-G-3008", make: "Ford", model: "Transit", kind: "Van", fuel: "Diesel", division: "Site crew van", base: "b-gal", driver: null, price: 26400, bought: "2017-04", km: 248100, removedAgoDays: 96, sold: 4200 },
  { reg: "162-KE-5521", make: "Renault", model: "Master", kind: "Crew van", fuel: "Diesel", division: "Site crew van", base: "b-kil", driver: null, price: 31900, bought: "2016-09", km: 279500, removedAgoDays: 214, sold: null },
];

/** People on the driver list who have no van of their own: they take the pool vans. */
export const SPARE_DRIVERS = ["p-124", "p-117"];
/** Drivers who hold a Driver CPC (needed for the 7 tonne tippers). */
const CPC = new Set(["p-yard", "p-128", "p-119", "p-123", "p-124"]);

/** The most repairs any one sample vehicle has on record. */
export const MAX_REPAIRS = 10;
/** Days until the fleet insurance policy renews. Every vehicle but the managing director's car is on it. */
export const INSURANCE_RENEWS_IN = 76;

/** Renewals planted so the list has something to show: [registration, item, days from today]. */
const PLANTED_DUE: [string, "tax" | "test" | "insurance", number][] = [
  ["212-D-18834", "test", -12],
  ["191-G-7730", "tax", -3],
  ["241-G-1102", "insurance", 8],
  ["221-WW-3316", "test", 17],
  ["182-D-40117", "tax", 22],
  ["232-RN-1147", "test", 27],
];

const yearOf = (s: VSpec) => Number(s.bought.slice(0, 4));

function vehicleFrom(s: VSpec, i: number, today: string, R: Rng): Vehicle {
  const planted = (item: "tax" | "test" | "insurance") => PLANTED_DUE.find(([reg, it]) => reg === s.reg && it === item)?.[2];
  // Tax and tests are spread over the year, clear of the next 40 days unless planted above.
  const taxDays = planted("tax") ?? 45 + ((i * 53 + 17) % 300);
  const testDays = planted("test") ?? 50 + ((i * 97 + 61) % 290);
  const insDays = planted("insurance") ?? INSURANCE_RENEWS_IN;
  const mk = (days: number, amount: number) => ({ expiryDate: addDays(today, days), paidDate: addDays(today, days - 365), amount });
  const car = s.kind === "Car";
  return {
    id: `v-${i + 1}`,
    reg: s.reg,
    make: s.make,
    model: s.model,
    kind: s.kind,
    fuel: s.fuel,
    division: s.division,
    ownership: s.leased ? "Leased" : "Owned",
    baseId: s.base,
    driverId: s.driver,
    purchasePrice: s.price,
    purchaseMonth: s.bought,
    mileage: s.km,
    // Typed in by the yard a few days to a few weeks ago.
    mileageAt: workdays(today, -(((i * 7) % 25) + 1)),
    mileageFrom: "typed",
    active: true,
    sellPrice: null,
    compliance: {
      tax: mk(taxDays, car ? 210 : s.kind === "Tipper" ? 420 : 333),
      test: mk(testDays, car ? 55 : 125 + R.int(0, 3) * 5),
      insurance: mk(insDays, car ? 1180 : 1450 + R.int(0, 12) * 50),
    },
    // Put right from the last service on the invoices below (lastService).
    service: { basis: "km", intervalKm: 20000, lastServiced: addDays(today, -120), lastMeter: Math.max(0, s.km - 9000), meterNow: s.km, kmPerWeek: 380 + ((i * 41) % 260) },
  };
}

type Job = { category: RepairCategory; text: string; lo: number; hi: number; tipper?: boolean };
const JOBS: Job[] = [
  { category: "Service", text: "Full service, oil and filters", lo: 260, hi: 420 },
  { category: "Service", text: "Interim service", lo: 160, hi: 240 },
  { category: "Tyres", text: "Two front tyres fitted and balanced", lo: 240, hi: 380 },
  { category: "Tyres", text: "Puncture repair, screw from site", lo: 35, hi: 60 },
  { category: "Brakes", text: "Front pads and discs", lo: 290, hi: 460 },
  { category: "Brakes", text: "Rear brake pads", lo: 140, hi: 220 },
  { category: "Bodywork", text: "Side door runner and lock", lo: 210, hi: 390 },
  { category: "Bodywork", text: "Bumper scuff repair and respray", lo: 320, hi: 640 },
  { category: "Electrical", text: "Battery replaced", lo: 160, hi: 240 },
  { category: "Electrical", text: "Beacon and work light wiring fault traced and fixed", lo: 120, hi: 260 },
  { category: "Glass", text: "Windscreen replaced", lo: 380, hi: 560 },
  { category: "Breakdown and recovery", text: "Recovered from site after breakdown, clutch replaced", lo: 980, hi: 1480 },
  { category: "Test preparation", text: "Pre-test check, wiper blades and bulbs", lo: 90, hi: 180 },
  { category: "Other", text: "DPF cleaned and sensor replaced", lo: 450, hi: 820 },
  { category: "Other", text: "Tipper ram seals replaced", lo: 540, hi: 880, tipper: true },
];

/** The garage that normally does each base's work; tippers go to the truck garage, tyres and glass in the west to the mobile fitter. */
const LOCAL: Record<string, string> = { "b-gal": "g-01", "b-off": "g-01", "b-dub": "g-02", "b-kil": "g-04", "b-cla": "g-03", "b-wat": "g-05" };
const PREFIX: Record<string, string> = { "g-01": "OC", "g-02": "LV", "g-03": "BM", "g-04": "NR", "g-05": "SV", "g-06": "KT", "g-07": "CT", "g-08": "AR" };

export function buildFleet(today: string, R: Rng, people: Person[], attendance: Attendance[], plan: PlanEntry[], projects: Project[]) {
  const vehicles = SPECS.map((s, i) => vehicleFrom(s, i, today, R));
  REMOVED.forEach((s, j) => {
    const v = vehicleFrom(s, SPECS.length + j, today, R);
    vehicles.push({ ...v, active: false, removedAt: addDays(today, -s.removedAgoDays), sellPrice: s.sold });
  });
  const filedUnder = (v: Vehicle, date: string): Pick<InvoiceLine, "baseId" | "driverId" | "siteId"> => ({ baseId: v.baseId, driverId: v.driverId, siteId: v.driverId ? (driverSiteOn(v.driverId, date, attendance, plan, projects) ?? null) : null });
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "A driver";

  let invoices: RepairInvoice[] = [];
  const planted = new Set<string>();
  const numbers: Record<string, number> = { "g-01": 20118, "g-02": 40112, "g-03": 1904, "g-04": 3381, "g-05": 5520, "g-06": 11870, "g-07": 9022, "g-08": 770 };
  const lineFor = (v: Vehicle, job: Job, date: string, id: string): InvoiceLine => ({
    id,
    vehicleId: v.id,
    ...filedUnder(v, date),
    category: job.category,
    description: job.text,
    mileage: Math.max(1000, Math.round(v.mileage - ((Date.parse(today) - Date.parse(date)) / 86_400_000) * 90)),
    amount: r2(R.int(job.lo, job.hi) + R.int(0, 99) / 100),
  });
  const push = (garageId: string, date: string, lines: InvoiceLine[], extra: Partial<RepairInvoice> = {}) => {
    const total = r2(lines.reduce((t, l) => t + l.amount, 0));
    const no = `${PREFIX[garageId]}-${numbers[garageId]!++}`;
    invoices.push({
      id: `ginv-${invoices.length + 1}`,
      invoiceNo: no,
      garageId,
      date,
      lines,
      total,
      vat: r2(total - total / 1.23),
      status: "Checked",
      checkedBy: "Maeve Quirke",
      checkedAt: at(workdays(date, 2), "10:15"),
      // Every sample repair has its invoice: drawn from this record when it is opened (src/lib/sample-docs.ts).
      file: { name: `${no}.pdf`, dataUrl: "", addedBy: "Pat Scully", addedAt: at(workdays(date, 1), "09:40"), sample: "invoice" },
      enteredBy: "Pat Scully",
      enteredAt: at(workdays(date, 1), "09:40"),
      ...extra,
    });
  };

  // 18 months of repairs: each vehicle visits a garage every few weeks, older ones more often.
  const start = addDays(today, -548);
  const year = Number(today.slice(0, 4));
  vehicles.forEach((v, vi) => {
    const spec = [...SPECS, ...REMOVED].find((s) => s.reg === v.reg)!;
    const age = year - yearOf(spec);
    const gap = Math.max(46, 84 - age * 6);
    let d = addDays(start, R.int(0, gap));
    const until = v.active ? addDays(today, -3) : (v.removedAt ?? today);
    const bought = `${v.purchaseMonth ?? "2000-01"}-01`;
    while (d < until) {
      if (d >= bought) {
        const fits = JOBS.filter((j) => !j.tipper || v.kind === "Tipper");
        const job = fits[R.int(0, fits.length - 1)]!;
        const west = (job.category === "Tyres" || job.category === "Glass") && (v.baseId === "b-gal" || v.baseId === "b-off" || v.baseId === "b-cla");
        const garageId = job.category === "Breakdown and recovery" && v.baseId === "b-gal" ? "g-08" : west ? "g-07" : v.kind === "Tipper" && v.baseId !== "b-gal" ? "g-06" : LOCAL[v.baseId ?? "b-gal"]!;
        const day = weekday(d);
        push(garageId, day, [lineFor(v, job, day, `gl-${vi}-${invoices.length}`)]);
      }
      d = addDays(d, gap + R.int(-8, 24));
    }
  });

  const routine = invoices.length;

  // A monthly statement from Liffey Valley covering three Dublin vans: a line per vehicle.
  const stmtDay = weekday(addDays(today, -19));
  const dub = vehicles.filter((v) => v.active && v.baseId === "b-dub" && v.reg !== "212-D-18834").slice(0, 3);
  push("g-02", stmtDay, dub.map((v, i) => lineFor(v, JOBS[[0, 4, 8][i]!]!, stmtDay, `gl-stmt-${i}`)), { notes: "Monthly statement covering three vans" });

  // The van repaired twice in 30 days: a service, then brakes seven working days later.
  const van = vehicles[0]!;
  const serviceDay = workdays(today, -12);
  const brakesDay = workdays(today, -5);
  push("g-01", serviceDay, [lineFor(van, JOBS[0]!, serviceDay, "gl-rep-1")]);
  push("g-01", brakesDay, [{ ...lineFor(van, JOBS[4]!, brakesDay, "gl-rep-2"), description: "Front pads and discs, grinding reported by driver" }], { status: "To check", checkedBy: undefined, checkedAt: undefined });

  // Body repairs after knocks (the damage itself was reported from the site phone, below).
  const body = (reg: string, ago: number, amount: number, text: string) => {
    const v = vehicles.find((x) => x.reg === reg)!;
    const day = workdays(today, -ago);
    push(LOCAL[v.baseId ?? "b-gal"]!, day, [{ id: `gl-body-${v.id}`, vehicleId: v.id, ...filedUnder(v, day), category: "Bodywork", description: text, mileage: null, amount }]);
  };
  body("212-D-18834", 14, 1288.5, "Rear bumper and nearside tail light replaced");
  body("211-W-6052", 58, 612.0, "Rear quarter panel dent removal and respray");
  body("201-CE-905", 154, 2365.4, "Tailgate panel, rear bumper and parking sensors");

  invoices.slice(routine).forEach((i) => planted.add(i.id));
  const near = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000 <= 31;
  const story = invoices.filter((i) => planted.has(i.id));
  invoices = invoices.filter((i) => planted.has(i.id) || !story.some((p) => near(p.date, i.date) && p.lines.some((pl) => i.lines.some((l) => l.vehicleId === pl.vehicleId))));

  // The duplicate: an earlier Oranmore Commercials invoice entered a second time this week.
  const dupSource = invoices.filter((x) => x.garageId === "g-01" && !planted.has(x.id) && x.date < addDays(today, -20)).sort((a, b) => b.date.localeCompare(a.date))[0]!;
  invoices.push({ ...dupSource, id: "ginv-dup", lines: dupSource.lines.map((l) => ({ ...l, id: `${l.id}-dup` })), status: "To check", checkedBy: undefined, checkedAt: undefined, enteredAt: at(workdays(today, -2), "11:05") });

  invoices.sort((a, b) => (a.date === b.date ? b.enteredAt.localeCompare(a.enteredAt) : b.date.localeCompare(a.date)));

  // No vehicle has more than ten repairs on record: the oldest routine visits beyond that are dropped.
  const seen = new Map<string, number>();
  invoices = invoices.filter((i) => {
    const over = !planted.has(i.id) && i.id !== "ginv-dup" && i.lines.some((l) => (seen.get(l.vehicleId) ?? 0) >= MAX_REPAIRS);
    if (!over) for (const l of i.lines) seen.set(l.vehicleId, (seen.get(l.vehicleId) ?? 0) + 1);
    return !over;
  });

  // The newest routine ones are still to check.
  invoices
    .filter((x) => x.status === "Checked" && !planted.has(x.id))
    .slice(0, 2)
    .forEach((x) => {
      x.status = "To check";
      x.checkedBy = undefined;
      x.checkedAt = undefined;
    });

  // Each vehicle's next service follows from its last service on the invoices.
  for (const v of vehicles) {
    const last = invoices.filter((i) => i.date <= today).flatMap((i) => i.lines.filter((l) => l.vehicleId === v.id && l.category === "Service").map((l) => ({ date: i.date, km: l.mileage }))).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last && v.service.basis === "km") v.service = { ...v.service, lastServiced: last.date, lastMeter: last.km ?? Math.max(0, v.mileage - 9000) };
  }

  // Two renewals recorded recently whose new disc is not ticked on yet: one late (10 days), one fresh (3 days).
  const waiting: Record<string, ["tax" | "test", number]> = { "211-W-6052": ["tax", 10], "242-G-915": ["test", 3] };
  for (const v of vehicles) {
    const w = waiting[v.reg];
    if (!w) continue;
    const paid = workdays(today, -w[1]);
    v.compliance[w[0]] = { ...v.compliance[w[0]], paidDate: paid, expiryDate: addDays(paid, 365), discPending: true };
  }

  // Tax, test and insurance paperwork, one document per renewal on file.
  const fleetDocs: FleetDoc[] = [];
  vehicles.filter((v) => v.active).forEach((v, i) => {
    for (const item of ["tax", "test", "insurance"] as const) {
      const c = v.compliance[item];
      const fileName = `${v.reg} ${item === "test" ? (v.kind === "Car" ? "NCT" : "CVRT") : item === "tax" ? "motor tax" : "insurance"} ${c.paidDate}.pdf`;
      fleetDocs.push({ id: `fd-${i}-${item}`, vehicleId: v.id, category: item, date: c.paidDate, amount: c.amount, expiryDate: c.expiryDate, fileName, proof: { name: fileName, dataUrl: "", addedBy: "Niamh Lavelle", addedAt: at(weekday(c.paidDate), "11:20"), sample: "receipt" } });
    }
  });
  fleetDocs.sort((a, b) => b.date.localeCompare(a.date));

  // Damage reported from the site phones, with drawn pictures (src/lib/sample-pictures.ts): three new, two dealt with.
  const damageReports: DamageReport[] = [];
  const report = (reg: string, ago: number, time: string, where: string, note: string, pictures: string[], dealt?: { ago: number; note: string }) => {
    const v = vehicles.find((x) => x.reg === reg)!;
    const day = ago === 0 ? today : workdays(today, -ago);
    const stamp = at(day, time);
    const photos: Proof[] = pictures.map((p, i) => ({ name: `Photo ${i + 1} of ${pictures.length}`, dataUrl: "", addedBy: name(v.driverId), addedAt: stamp, sample: `damage/${p}` }));
    damageReports.push({ id: `dmg-${damageReports.length + 1}`, vehicleId: v.id, driverId: v.driverId, at: stamp, where, note, photos, status: dealt ? "Dealt with" : "New", ...(dealt ? { dealtBy: "Pat Scully", dealtAt: at(workdays(day, dealt.ago), "10:30"), dealtNote: dealt.note } : {}) });
  };
  report("202-MO-2284", 0, "07:42", "N17 near Claregalway", "A stone came off a lorry and hit the windscreen. Chip on the passenger side and a crack spreading from it. Still drivable, but it is getting longer.", ["windscreen"]);
  report("221-WW-3316", 0, "08:55", "Site entrance, Derrybawn Bridge", "Clipped the passenger wing mirror on the gate pier reversing in. Glass cracked and the housing is hanging loose. Drivable.", ["mirror"]);
  report("231-G-4471", 1, "16:20", "Yard gate, Oranmore", "Caught the gate post on the way out. Long scrape and a dent along the nearside sliding door. Door still opens and closes.", ["door-scrape", "wheel"]);
  report("212-D-18834", 16, "14:05", "Builders' merchants car park, Clondalkin", "Reversed into a bollard loading lime. Rear bumper cracked and pushed in, and the offside tail light is smashed.", ["rear-bumper", "tail-light"], { ago: 2, note: "Booked into Liffey Valley Fleet Services. Bumper and light replaced, back on the road." });
  report("241-KE-2291", 31, "07:20", "Approach road to St Finian's", "Hit the kerb avoiding a tractor on the narrow road. Front nearside tyre is flat and the wheel is scuffed.", ["wheel"], { ago: 1, note: "Tyre replaced by Naas Road Van Centre the next morning. Wheel is fine." });
  damageReports.sort((a, b) => b.at.localeCompare(a.at));

  const todos: Todo[] = [];
  const tax = vehicles.find((v) => v.reg === "191-G-7730")!;
  todos.push({ id: "td-1", title: `Renew motor tax, ${tax.reg}`, due: addDays(today, 2), vehicleId: tax.id, item: "tax", createdAt: at(workdays(today, -1), "10:05"), createdBy: "Aidan King" });
  const test = vehicles.find((v) => v.reg === "212-D-18834")!;
  todos.push({ id: "td-2", title: `Book the CVRT, ${test.reg}`, due: addDays(today, 1), vehicleId: test.id, item: "test", createdAt: at(workdays(today, -2), "15:40"), createdBy: "Aidan King" });
  todos.push({ id: "td-3", title: "Ask Oranmore Commercials about the fleet tyre discount on November invoices", due: addDays(today, 7), createdAt: at(workdays(today, -3), "11:20"), createdBy: "Aidan King" });

  const garageNotes: GarageNote[] = [
    { id: "gn-1", garageId: "g-01", at: at(workdays(today, -1), "10:42"), by: "Pat Scully", text: "Rang Brian. They are closed from 23 Dec to 2 Jan. Book anything urgent before the 19th." },
    { id: "gn-2", garageId: "g-01", at: at(workdays(today, -11), "15:10"), by: "Aidan King", text: "Agreed 10% off tyres for the fleet from December. Check it shows on the invoices." },
    { id: "gn-3", garageId: "g-06", at: at(workdays(today, -48), "09:05"), by: "Pat Scully", text: "Only place near us that will do the tipper rams the same day. Ask for Seán." },
    { id: "gn-4", garageId: "g-02", at: at(workdays(today, -6), "12:30"), by: "Pat Scully", text: "Gary says the statement now lists each van separately, as we asked." },
  ];

  return { bases: BASES, garages: GARAGES, vehicles, garageInvoices: invoices, fleetDocs, damageReports, todos, garageNotes };
}

/**
 * Licences for the people on the driver list, with a copy of each on file (drawn when opened), and
 * a few planted so the renewals list has something to show: a CPC out of date, a CPC due soon, a
 * driving licence due soon, and a driving licence sent from the phone yesterday, still to check.
 */
export function withLicences(people: Person[], vehicles: Vehicle[], today: string): Person[] {
  const drivers = new Set([...vehicles.filter((v) => v.active && v.driverId).map((v) => v.driverId!), ...SPARE_DRIVERS]);
  const planted: Record<string, { driving?: number; cpc?: number }> = { "p-119": { cpc: -4 }, "p-123": { cpc: 12 }, "p-sm4": { driving: 20 } };
  const copy = (p: Person, what: string, ago: number): Proof => ({ name: `${p.name}, ${what}.pdf`, dataUrl: "", addedBy: "Niamh Lavelle", addedAt: at(workdays(today, -ago), "14:10"), sample: "licence" });
  return people.map((p, i) => {
    if (!drivers.has(p.id)) return p;
    const driving: Licence =
      p.id === "p-128"
        ? { expiryDate: addDays(today, 3290), proof: { name: `${p.name}, driving licence.pdf`, dataUrl: "", addedBy: p.name, addedAt: at(workdays(today, -1), "19:25"), sample: "licence" }, fromPhoneAt: at(workdays(today, -1), "19:25") }
        : { expiryDate: addDays(today, planted[p.id]?.driving ?? 220 + ((i * 97) % 1400)), proof: copy(p, "driving licence", 40 + ((i * 13) % 300)) };
    const cpc: Licence | undefined = CPC.has(p.id) ? { expiryDate: addDays(today, planted[p.id]?.cpc ?? 300 + ((i * 53) % 1200)), proof: copy(p, "Driver CPC", 30 + ((i * 17) % 200)) } : undefined;
    return { ...p, drives: true, licences: { driving, ...(cpc ? { cpc } : {}) } };
  });
}

/** What a sample driver's licence covers: C1 as well for anyone who drives a 7 tonne tipper. */
export const licenceCategories = (personId: string) => (CPC.has(personId) ? "B, BE, C1, C1E" : "B, BE");
