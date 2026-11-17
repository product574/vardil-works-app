import { addDays } from "@/lib/dates";
import { nextWorkWeek } from "@/lib/week";
import type { Cert, Holiday, Language, LevelKey, Person } from "../types";
import { type Rng, workdays } from "./util";

type Row = [id: string, name: string, trade: string, category: Person["category"], rate: number, language: Language];

/** Office and management. Ids are referred to by name elsewhere in the seed. */
const MANAGEMENT: Row[] = [
  ["p-md", "Aidan King", "Managing director", null, 0, "en"],
  ["p-cm1", "Tadhg Morrissey", "Contracts manager", null, 0, "en"],
  ["p-cm2", "Aisling Rafter", "Contracts manager", null, 0, "en"],
  ["p-qs", "Colm Henebry", "Quantity surveyor", null, 0, "en"],
  ["p-acc", "Maeve Quirke", "Accounts", null, 0, "en"],
  ["p-off", "Niamh Lavelle", "Office administrator", null, 0, "en"],
  ["p-hs", "Declan Furey", "Health and safety officer", null, 0, "en"],
  ["p-yard", "Pat Scully", "Yard and plant manager", null, 0, "en"],
];

/** The access level each office person starts from. Anyone not listed here is at site manager level. */
const LEVELS: Record<string, LevelKey> = { "p-md": "md", "p-cm1": "contracts", "p-cm2": "contracts", "p-qs": "contracts", "p-acc": "accounts", "p-off": "accounts" };

const SITE_MANAGERS: Row[] = [
  ["p-sm1", "Eoin Brosnan", "Site manager", null, 34, "en"],
  ["p-sm2", "Cathal Minogue", "Site manager", null, 34, "en"],
  ["p-sm3", "Róisín Garvey", "Site manager", null, 34, "en"],
  ["p-sm4", "Darragh Lenihan", "Site manager", null, 32, "en"],
  ["p-sm5", "Shane Culloty", "Site manager", null, 32, "en"],
];

const OPERATIVES: Row[] = [
  ["p-101", "Fergal Noone", "Stonemason", "Craftsperson", 29.5, "en"],
  ["p-102", "Cormac Hession", "Stonemason", "Craftsperson", 29.5, "en"],
  ["p-103", "Marek Wiśniewski", "Stonemason", "Craftsperson", 28, "pl"],
  ["p-104", "Ionuț Marin", "Stonemason", "Craftsperson", 27.5, "ro"],
  ["p-105", "Orla Prunty", "Apprentice stonemason", "B", 16.5, "en"],
  ["p-106", "Sinéad Colgan", "Lime plasterer", "Craftsperson", 28.5, "en"],
  ["p-107", "Tomasz Kowalczyk", "Lime plasterer", "Craftsperson", 27.5, "pl"],
  ["p-108", "Thiago Barbosa", "Lime plasterer", "A", 24, "pt"],
  ["p-109", "Brendan Looby", "Roofer and slater", "Craftsperson", 28, "en"],
  ["p-110", "Mindaugas Petrauskas", "Roofer and slater", "Craftsperson", 27.5, "lt"],
  ["p-111", "Darius Kazlauskas", "Roofer and slater", "A", 24, "lt"],
  ["p-112", "Micheál Geraghty", "Leadworker", "Craftsperson", 30, "en"],
  ["p-113", "Agnieszka Dudek", "Conservation joiner", "Craftsperson", 29, "pl"],
  ["p-114", "Liam Costigan", "Conservation joiner", "Craftsperson", 29, "en"],
  ["p-115", "Ruairí Mannion", "Carpenter", "A", 25.5, "en"],
  ["p-116", "Piotr Zieliński", "Carpenter", "A", 25, "pl"],
  ["p-117", "Donal Greaney", "Bricklayer", "Craftsperson", 28, "en"],
  ["p-118", "Florin Dobre", "Bricklayer", "A", 24.5, "ro"],
  ["p-119", "Kevin Shortall", "Scaffolder", "A", 25, "en"],
  ["p-120", "Adrian Stoica", "Scaffolder", "A", 24.5, "ro"],
  ["p-121", "Ciarán Hoban", "Painter and decorator", "A", 24, "en"],
  ["p-122", "Rafael Mendonça", "Painter and decorator", "A", 23.5, "pt"],
  ["p-123", "Paudie Lyne", "General operative", "B", 19.5, "en"],
  ["p-124", "Tomás Breslin", "General operative", "B", 19.5, "en"],
  ["p-125", "João Teixeira", "General operative", "B", 19, "pt"],
  ["p-126", "Krzysztof Nowicki", "General operative", "B", 19, "pl"],
  ["p-127", "Tomas Jankauskas", "General operative", "B", 19, "lt"],
  ["p-128", "Seán Dunphy", "General operative", "B", 19.5, "en"],
  ["p-129", "Aoife Kinsella", "Apprentice joiner", "B", 16.5, "en"],
];

const SITE_CERTS = ["Safe Pass", "Manual handling", "Working at height"];
const EXTRA_CERTS: Record<string, string[]> = {
  "Site manager": ["First aid responder", "Site supervisor safety", "Scaffold inspection"],
  Scaffolder: ["Scaffolding ticket, advanced"],
  "Roofer and slater": ["Mobile elevating work platform"],
  Leadworker: ["Hot works"],
  Stonemason: ["Abrasive wheels"],
  "Conservation joiner": ["Abrasive wheels"],
  Carpenter: ["Abrasive wheels"],
  "General operative": ["Telescopic handler"],
};

function emailFor(name: string, domain: string) {
  const plain = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .toLowerCase()
    .split(" ");
  return `${plain[0]}.${plain[plain.length - 1]}@${domain}`;
}

export function seedPeople(r: Rng, today: string, domain: string) {
  let certN = 0;
  const makeCert = (name: string, expiresInDays: number): Cert => {
    const expires = addDays(today, expiresInDays);
    return { id: `cert-${++certN}`, name, issued: addDays(expires, -365 * (name === "Safe Pass" ? 4 : 3)), expires };
  };

  const people: Person[] = [];
  const add = (rows: Row[], kind: Person["kind"], isSiteManager: boolean) => {
    for (const [id, name, trade, category, rate, language] of rows) {
      const names = kind === "Management" && !isSiteManager ? ["Safe Pass", "Manual handling"] : [...SITE_CERTS, ...(EXTRA_CERTS[trade] ?? [])];
      people.push({
        id,
        name,
        trade,
        category,
        kind,
        language,
        isSiteManager,
        ...(kind === "Management" ? { level: LEVELS[id] ?? "site" } : {}),
        hourlyRate: rate,
        rateAsOf: addDays(today, -r.int(60, 400)),
        phone: `08${r.int(3, 9)} ${r.int(200, 999)} ${r.int(1000, 9999)}`,
        email: emailFor(name, domain),
        active: true,
        certs: names.map((n) => makeCert(n, r.int(70, 1100))),
      });
    }
  };
  add(MANAGEMENT, "Management", false);
  add(SITE_MANAGERS, "Management", true);
  add(OPERATIVES, "Operative", false);
  // Sage Payroll numbers in the order people were set up there. Aoife Kinsella started this
  // month and is not in Sage yet, so the payroll export has something to flag.
  let sage = 0;
  for (const p of people) if (p.id !== "p-129") p.sageNo = String(++sage).padStart(4, "0");

  // A deliberate spread of expired and nearly expired tickets, so the certs screen has work in it.
  const nudge = (personId: string, certName: string, days: number) => {
    const c = people.find((p) => p.id === personId)?.certs.find((x) => x.name === certName);
    if (c) {
      c.expires = addDays(today, days);
      c.issued = addDays(c.expires, -365 * 3);
    }
  };
  nudge("p-119", "Scaffolding ticket, advanced", -19);
  nudge("p-108", "Manual handling", -6);
  nudge("p-124", "Safe Pass", -2);
  nudge("p-110", "Mobile elevating work platform", 5);
  nudge("p-103", "Abrasive wheels", 9);
  nudge("p-sm3", "First aid responder", 12);
  nudge("p-116", "Working at height", 18);
  nudge("p-112", "Hot works", 24);
  nudge("p-127", "Safe Pass", 27);

  // One former employee, so the register's archive has someone in it.
  people.push({
    id: "p-130",
    name: "Gearóid Fennelly",
    trade: "Stonemason",
    category: "Craftsperson",
    kind: "Operative",
    language: "en",
    isSiteManager: false,
    hourlyRate: 28,
    rateAsOf: addDays(today, -500),
    phone: "086 441 2093",
    email: emailFor("Gearóid Fennelly", domain),
    active: false,
    archivedAt: addDays(today, -74),
    certs: [],
  });

  // Whole weeks are booked Monday to Friday, whatever day the demo is opened on.
  const next = nextWorkWeek(today);
  const after = nextWorkWeek(next[0]!);
  const holidays: Holiday[] = [
    { id: "hol-1", personId: "p-106", from: after[0]!, to: after[4]!, status: "Requested", via: "Email", note: "Sister's wedding" },
    { id: "hol-2", personId: "p-110", from: workdays(today, 12), to: workdays(today, 21), status: "Requested", via: "Form", note: "Home to Kaunas" },
    { id: "hol-3", personId: "p-123", from: workdays(today, 3), to: workdays(today, 3), status: "Requested", via: "Phone", note: "Hospital appointment" },
    { id: "hol-4", personId: "p-102", from: next[0]!, to: next[4]!, status: "Approved", via: "Form" },
    { id: "hol-5", personId: "p-117", from: workdays(today, 8), to: workdays(today, 9), status: "Approved", via: "Email" },
    { id: "hol-6", personId: "p-sm4", from: workdays(today, 15), to: workdays(today, 19), status: "Approved", via: "Form" },
    { id: "hol-7", personId: "p-114", from: workdays(today, -8), to: workdays(today, -4), status: "Approved", via: "Form" },
    { id: "hol-8", personId: "p-125", from: workdays(today, 2), to: workdays(today, 4), status: "Declined", via: "Phone", note: "A few days at home", decidedBy: "Tadhg Morrissey", declineNote: "Short notice, and Ardmullen needs the full crew that week" },
  ];

  return { people, holidays };
}
