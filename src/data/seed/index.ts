/**
 * Builds the complete sample database for a given day.
 *
 * Everything is generated relative to `today`, so the demo always looks current: jobs are
 * on site today, tickets expire next week, invoices fall due. The random generator is seeded
 * with a fixed number, so two people opening the demo on the same day see identical data.
 *
 * The figures are built to hang together: timesheets follow each person's time on each job,
 * job values follow from the crews they were priced on, supplier costs from the margin each
 * job is making, and the directors' summary and activity log are written from the records.
 *
 * All names, firms, addresses, phone numbers and figures are invented.
 */
import { DEFAULT_BRAND } from "@/config/brand";
import { REGION } from "@/lib/money";
import { ROLES } from "../roles";
import type { Db } from "../types";
import { seedAssets, seedVehicleChecks } from "./assets";
import { seedChat } from "./chat";
import { quotedMargin, seedCommercial } from "./commercial";
import { fillManagementDates, fillPurchases, seedDayInstructions, seedExpenses, seedActivity, seedFiles, seedMail, seedManagement, seedMoney, seedPayrollChecks, seedPayrollExports, seedSiteAccess } from "./office";
import { seedPeople } from "./people";
import { quoteTargets, seedProjects } from "./projects";
import { seedSubscription } from "./subscription";
import { seedPortalNotes, seedSpendRequests, seedSupplies } from "./supply";
import { builtInBankHolidays } from "@/lib/bank-holidays";
import { demoDay, rng, workdays } from "./util";

export { demoDay } from "./util";

/**
 * UK version of the sample data: counties, phone numbers, number plates and the currency sign
 * in written text are swapped for UK ones. Firm, town and people names are invented and stay as they are.
 */
const UK_COUNTY: Record<string, string> = { Roscommon: "Shropshire", Galway: "Cumbria", Donegal: "Northumberland", Kildare: "Kent", Dublin: "London", Clare: "Cornwall", Cavan: "Cheshire", Waterford: "Worcestershire", Mayo: "Norfolk", Wicklow: "Wiltshire", Kerry: "Devon", Wexford: "Sussex" };
function toUK(db: Db, day: string): Db {
  let text = JSON.stringify(db);
  for (const [ie, uk] of Object.entries(UK_COUNTY)) text = text.replace(new RegExp(`\\b${ie}\\b`, "g"), uk);
  // Irish mobiles (08x xxx xxxx) and landlines (0xx 555 xxxx) become UK-shaped numbers.
  text = text.replace(/"08(\d) (\d{3}) (\d{4})"/g, '"07$2 $3$1$1"').replace(/"0(\d{1,2}) 555 (\d{4})"/g, '"01$1 555 $2"');
  text = text.replace(/€/g, "£");
  const out = JSON.parse(text) as Db;
  // The UK's bank holidays in place of Ireland's. The sample timesheets were written around the
  // Irish ones, so a UK copy can show a normal day marked on a UK bank holiday.
  out.bankHolidays = builtInBankHolidays(day, "UK");
  // Number plates: 231-G-4471 becomes a UK-style plate built from the same digits.
  for (const v of out.vehicles) {
    const [yy = "24", letters = "AB", n = "1"] = v.reg.split("-");
    const reg = `${(letters + "K").slice(0, 2)}${yy.slice(0, 2)} ${(n + "XYZ").replace(/\d/g, (d) => "ABCDEFGHJK"[Number(d)]!).slice(0, 3)}`;
    for (const d of out.fleetDocs) if (d.vehicleId === v.id) d.fileName = d.fileName.replace(v.reg, reg);
    v.reg = reg;
  }
  return out;
}

export function buildSeed(realToday: string, opts: { emailDomain?: string; vatPct?: number; region?: "IE" | "UK" } = {}): { day: string; db: Db } {
  const built = buildIrishSeed(realToday, opts);
  return opts.region === "UK" ? { day: built.day, db: toUK(built.db, built.day) } : built;
}

function buildIrishSeed(realToday: string, opts: { emailDomain?: string; vatPct?: number; region?: "IE" | "UK" } = {}): { day: string; db: Db } {
  const day = demoDay(realToday);
  const domain = opts.emailDomain ?? DEFAULT_BRAND.emailDomain;
  const vatPct = opts.vatPct ?? REGION[DEFAULT_BRAND.region].vatPct;
  const r = rng(20261113);

  const { people, holidays } = seedPeople(r, day, domain);
  const names = new Map(people.map((p) => [p.id, p.name]));
  const rates = new Map(people.map((p) => [p.id, p.hourlyRate]));
  // Won jobs were priced on the crews planned for them (projects.ts), so the quotes follow.
  const { clients, enquiries, quotes } = seedCommercial(r, day, quoteTargets(day, rates, holidays, quotedMargin));
  const { meta, ...proj } = seedProjects(r, day, quotes, holidays, names, rates);
  // One driver per vehicle, matched to where it is based; the last was sold and has none.
  const drivers = ["p-sm2", "p-cm1", "p-sm5", "p-sm1", "p-sm3", "p-sm4", "p-yard", "p-128", "p-114", "p-107", "p-cm2", "p-hs"];
  const assets = seedAssets(r, day, drivers);
  const { approvals, automations } = seedManagement(day);
  const handoverPending = new Set(approvals.filter((a) => a.kind === "handover" && a.status === "Pending" && a.projectId).map((a) => a.projectId!.replace("pr-", "")));
  const files = seedFiles(r, day, proj.projects, meta, names, handoverPending);
  const money = seedMoney(r, day, { projects: proj.projects, meta, attendance: proj.attendance, people, scopeTasks: proj.scopeTasks, hiredPlant: assets.hiredPlant, clients, vatPct });
  const mails = seedMail(day, domain, holidays.find((h) => h.id === "hol-1")!);

  const siteAccess = seedSiteAccess(day);

  const db: Db = {
    people,
    holidays,
    clients,
    enquiries,
    quotes,
    ...proj,
    spendRequests: seedSpendRequests(day, people.find((p) => p.id === "p-103")?.certs.find((c) => c.name === "Abrasive wheels")?.expires ?? workdays(day, 7)),
    supplies: seedSupplies(day),
    portalNotes: seedPortalNotes(day),
    subscriptionInvoices: seedSubscription(day, people),
    payrollExports: [],
    payrollChecks: [],
    bankHolidays: builtInBankHolidays(day, "IE"),
    vehicleChecks: seedVehicleChecks(day, assets.vehicles),
    expenses: seedExpenses(day),
    dayInstructions: seedDayInstructions(day),
    attendanceChanges: [],
    ...assets,
    files,
    ...money,
    mails,
    ...seedChat(day, proj.projects, siteAccess),
    approvals,
    automations,
    activity: [],
    access: ROLES.map((r) => ({ id: r.key, departments: [...r.departments], seeValues: r.money[0], seeMargins: r.money[1], perms: [...r.perms] })),
    // Two people already differ from their level, so the "by person" screen has something to show.
    personAccess: [
      { id: "p-hs", departments: {}, perms: { allProjects: true, manageStaff: true } },
      { id: "p-yard", departments: { schedule: false }, perms: { allProjects: true, managePlant: true } },
    ],
    siteAccess,
  };
  // Written last, from the finished records.
  fillManagementDates(db, day, opts.region ?? "IE");
  fillPurchases(db, day);
  db.payrollExports = seedPayrollExports(db, day);
  db.payrollChecks = seedPayrollChecks(db.payrollExports);
  db.activity = seedActivity(db, day);
  return { day, db };
}
