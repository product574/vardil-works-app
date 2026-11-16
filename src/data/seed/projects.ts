import { addDays, dayOfWeek, isWeekend } from "@/lib/dates";
import { quoteTotal } from "@/lib/quotes";
import { nextWorkWeek } from "@/lib/week";
import type { Assignment, Attendance, AuditEntry, Holiday, PlanEntry, Project, ProjectStatus, Quote, ScopeGroup, ScopeTask, SiteRequest, Variation } from "../types";
import { type Rng, at, lastWeekday as lastWeekdayOf, workdays } from "./util";

/**
 * Projects, their crews, timesheets and plans.
 *
 * Crews move from job to job: each person's time on a project is a stint, and the timesheets
 * are built from the stints, day by day, over the whole life of every project. Job costs, the
 * value of each job and the margins on screen all follow from those timesheets (see
 * `expectedLabour` and, for supplier costs, office.ts), so the figures hang together.
 */

/** The kind of work, for photo captions, documents and the suppliers that invoice the job. */
export type Craft = "masonry" | "wall" | "brick" | "roof" | "sash" | "render" | "timber";

/** [person, first working day, last working day] in working days from today (negative is past). The last day defaults to the project's end. */
type Stint = [personId: string, from: number, to?: number];

type PSeed = {
  code: string;
  name: string;
  clientId: string;
  quoteN?: number;
  craft: Craft;
  location: string;
  county: string;
  description: string;
  heritage: string;
  status: ProjectStatus;
  cm: string;
  sm: string;
  /** Working days from today: negative is in the past. */
  start: number;
  end: number;
  instructions: string;
  /** The project's own checklist, in the order the work is done. */
  scope: string[];
  /** Scope items ticked off. Finished projects have them all. */
  done: number;
  crew: Stint[];
  /** The margin the job is making so far (live) or made (finished). Supplier costs are built to it. */
  margin: number;
  flags?: Partial<Pick<Project, "extrasFlag" | "snaggingFlag" | "invoiceHold">>;
  handoverSent?: boolean;
};

/**
 * Who still has free days next week, by day of the week (0 is Monday). They stay on their
 * site lists, so the week ahead shows them waiting to be placed.
 */
const NEXT_WEEK_FREE: Record<string, number[]> = {
  "p-120": [0, 1, 2, 3, 4], // Adrian Stoica, scaffolder: the courthouse scaffold is up
  "p-122": [0, 1, 2, 3, 4], // Rafael Mendonça, painter: railings finished at Fitzgarret Square
  "p-116": [0, 1, 2, 3, 4], // Piotr Zieliński, carpenter
  "p-126": [2, 3, 4], // Krzysztof Nowicki: Monday and Tuesday only
  "p-111": [0, 1, 2], // Darius Kazlauskas: back on the mill roof from Thursday
};

/** Ionuț splits his week while the bridge is running: bridge on Monday and Tuesday, courthouse otherwise. */
const SPLIT = { personId: "p-104", site: "C724", days: [1, 2] };


const PROJECTS: PSeed[] = [
  // Live
  {
    code: "C719", name: "St Finian's Church", clientId: "c-01", quoteN: 1, craft: "masonry", location: "Church Road, Rathdoon", county: "Kildare",
    description: "Tower repointing in lime mortar and renewal of the lead roofs to the tower and vestry.", heritage: "Protected structure, 1823, Church of Ireland",
    status: "Live", cm: "p-cm1", sm: "p-sm1", start: -44, end: 38, margin: 21,
    instructions: "Services on Sunday at 10:30 and Wednesday at 19:00: no noisy work an hour either side. Bell chamber louvres are fragile, do not lean ladders on them. Bats recorded in the vestry roof, follow the ecologist's method statement.",
    scope: [
      "Tied scaffold to the tower, tie pattern agreed by the conservation architect",
      "Mortar analysis and three sample panels approved",
      "Rake out the north elevation",
      "Repoint the north elevation",
      "Rake out the west elevation",
      "Repoint the west elevation",
      "Rake out and repoint the south and east elevations",
      "Stone indent repairs, as marked on the survey",
      "Tower roof: strip the lead, renew boarding, relay in code 7",
      "Vestry roof: strip the lead, renew boarding, relay in code 7",
      "Lightning conductor refixed and tested",
      "Strike scaffold and make good the tie holes",
    ],
    done: 6,
    crew: [["p-101", -44], ["p-103", -44], ["p-112", -44], ["p-119", -44], ["p-105", -44, -10], ["p-123", -11]],
  },
  {
    code: "C720", name: "Ardmullen House", clientId: "c-02", quoteN: 2, craft: "render", location: "Kilcolgan", county: "Galway",
    description: "Remove cement render from the east wing and re-render in lime, repair 34 sash windows, and repair the drawing room ceiling.", heritage: "Protected structure, c. 1780 country house",
    status: "Live", cm: "p-cm1", sm: "p-sm2", start: -38, end: 31, margin: 24,
    instructions: "House is occupied. Deliveries by the farm gate only, never the front avenue. No lime work if frost is forecast inside 72 hours. Windows are numbered on drawing A-204, keep every sash labelled to its opening.",
    scope: [
      "Remove cement render from the east wing and photograph the substrate",
      "Masonry repairs and dubbing out",
      "Scratch coat applied and cured",
      "Float coat applied and cured",
      "Sashes removed, labelled to drawing A-204 and taken to the workshop",
      "Sash repairs and re-cording in the workshop",
      "Finish coat applied and cured",
      "Limewash, four coats, to the approved sample",
      "Sashes refitted, draughtproofed and painted",
      "Drawing room ceiling: lath and lime plaster repairs",
      "Scaffold struck and the east wing cleared",
    ],
    done: 5,
    crew: [["p-106", -38], ["p-107", -38], ["p-113", -38], ["p-125", -38], ["p-121", -5], ["p-108", -3]],
  },
  {
    code: "C721", name: "The Old Corn Mill", clientId: "c-03", quoteN: 3, craft: "roof", location: "Ballyfinn", county: "Clare",
    description: "Strip and re-slate the main mill roof, with spliced repairs to the trusses and wall plates.", heritage: "Protected structure, 1790s water mill, museum use",
    status: "Live", cm: "p-cm2", sm: "p-sm3", start: -31, end: 44, margin: 13,
    instructions: "Museum opens to visitors Thursday to Sunday: keep the public route by the mill race clear and fenced. Sound slates are to be reused on the front pitch. Swifts nest under the east eaves, do not block the boxes.",
    scope: [
      "Scaffold and temporary roof erected",
      "Strip slates, sort and stack the sound ones for reuse",
      "Survey the trusses with the engineer and agree repairs",
      "Splice repairs to rafter ends and truss feet",
      "Renew the wall plate on the mill race side",
      "New battens and breathable membrane",
      "Re-slate the rear pitch in new slate",
      "Re-slate the front pitch in salvaged slate",
      "Lead valleys, flashings and ridge",
      "Rainwater goods overhauled and refixed",
    ],
    done: 4,
    crew: [["p-109", -31], ["p-110", -31], ["p-111", -31], ["p-115", -31], ["p-116", -31], ["p-127", -31]],
  },
  {
    code: "C722", name: "Dunmoy Courthouse", clientId: "c-04", quoteN: 4, craft: "masonry", location: "Main Street, Dunmoy", county: "Roscommon",
    description: "Steam clean the ashlar façade, repair the mouldings, and replace decayed cornice sections.", heritage: "Protected structure, 1832 courthouse, in daily use",
    status: "Live", cm: "p-cm2", sm: "p-sm4", start: -26, end: 52, margin: 20,
    instructions: "Court sits Tuesday and Thursday: no cleaning or cutting between 10:00 and 16:00 on those days. Pavement gantry lights to be checked every evening. Sign in at the Courts Service desk.",
    scope: [
      "Scaffold, pavement gantry and debris netting",
      "Cleaning trials approved by the conservation officer",
      "Steam clean the upper storeys",
      "Steam clean the ground storey and plinth",
      "Mortar repairs to mouldings and string courses",
      "Cut out decayed cornice sections",
      "Fix new carved cornice sections",
      "Poultice trial on the columns, only with the officer's approval",
      "Repoint open joints in lime",
      "Final inspection with the architect",
    ],
    done: 3,
    crew: [["p-102", -26], ["p-104", -26], ["p-120", -26], ["p-124", -26], ["p-126", -26]],
  },
  {
    code: "C723", name: "14 Fitzgarret Square", clientId: "c-05", quoteN: 5, craft: "brick", location: "Fitzgarret Square", county: "Dublin",
    description: "Repoint the front and rear brick elevations in lime, with tuck pointing to the front, and refurbish the cast iron railings.", heritage: "Protected structure, 1790s Georgian townhouse",
    status: "Live", cm: "p-cm1", sm: "p-sm5", start: -19, end: 24, margin: 31,
    instructions: "Offices occupied on every floor. Skip permit is for the bay outside no. 14 only. Brick is soft handmade: hand tools only for raking out, no grinders.",
    scope: [
      "Scaffold to the front and rear elevations",
      "Mortar sample panel approved",
      "Railings stripped, repaired and painted",
      "Rake out and repoint the rear elevation",
      "Rake out the front elevation by hand",
      "Repoint the front elevation",
      "Tuck pointing to the front elevation",
      "Brick repairs in reclaimed handmade brick",
      "Strike scaffold and clear the bay",
    ],
    done: 4,
    crew: [["p-117", -19], ["p-118", -19], ["p-122", -19]],
  },
  {
    code: "C724", name: "Derrybawn Bridge", clientId: "c-06", quoteN: 6, craft: "wall", location: "Glenasmole Road", county: "Wicklow",
    description: "Take down and rebuild the damaged upstream parapet and remove vegetation from the arch.", heritage: "Recorded structure, 18th century road bridge",
    status: "Live", cm: "p-cm2", sm: "p-sm1", start: -9, end: 12, margin: 27,
    instructions: "Single lane with traffic lights, 08:00 to 17:30 only. No material to enter the river: netting under the arch stays up until sign-off by the fisheries officer.",
    scope: [
      "Traffic management and river netting in place",
      "Remove vegetation from the arch and record the bridge",
      "Take down the unstable parapet, stack stone for reuse",
      "Rebuild the parapet in lime to match the existing bond",
      "Copings bedded and pointed",
      "Repoint the arch ring and spandrels",
      "Remove traffic management and netting, reinstate the verges",
    ],
    done: 3,
    crew: [["p-104", -9], ["p-128", -9], ["p-105", -9]],
  },
  {
    code: "C725", name: "Granary Quay Warehouses", clientId: "c-07", quoteN: 7, craft: "timber", location: "Passage East", county: "Waterford",
    description: "Structural timber repairs to the floors of blocks A and B, and crack stitching to the river elevation, for the main contractor.", heritage: "Protected structure, 1840s quay warehouses",
    status: "Live", cm: "p-cm2", sm: "p-sm3", start: -14, end: 60, margin: 8,
    instructions: "Main contractor's site: their induction and permits apply. Tidal quay, check the board at the gate before working on the river elevation.",
    scope: [
      "Main contractor's induction and permits for the crew",
      "Temporary propping to the block A floors",
      "Floor survey with the engineer, repairs agreed",
      "Lift and number the floorboards, block A",
      "Joist and beam end repairs, block A",
      "Relay the floorboards, block A",
      "Lift floorboards and repair joists, block B",
      "Relay the floorboards, block B",
      "Crack stitching to the river elevation",
      "Props out and areas handed back to the main contractor",
    ],
    done: 2,
    crew: [["p-114", -14], ["p-129", -14]],
  },

  // Not started
  {
    code: "C726", name: "Tullyvin Gate Lodge", clientId: "c-08", quoteN: 8, craft: "render", location: "Cootehill Road, Tullyvin", county: "Cavan",
    description: "Lath and lime plaster ceiling repairs and rebuilding of the chimney stack.", heritage: "Protected structure, 1850s gate lodge",
    status: "Not started", cm: "p-cm1", sm: "p-sm5", start: 8, end: 30, margin: 26,
    instructions: "Keys with the parish office. No water on site, bring a bowser.",
    scope: [
      "Keys collected and the lodge recorded with photographs",
      "Scaffold to the chimney stack",
      "Take down the chimney stack to sound brickwork",
      "Rebuild the stack in lime, with new pots and lead flashings",
      "Lath and lime plaster ceiling repairs",
      "Limewash the repaired ceilings",
      "Strike scaffold and clear the site",
    ],
    done: 0, crew: [],
  },
  {
    code: "C727", name: "Market House, Kilcashel", clientId: "c-06", quoteN: 9, craft: "sash", location: "The Square, Kilcashel", county: "Mayo",
    description: "Repair of 22 sash windows, the main doors and the clock turret louvres.", heritage: "Protected structure, 1810 market house",
    status: "Not started", cm: "p-cm2", sm: "p-sm2", start: 16, end: 48, margin: 25,
    instructions: "Library on the first floor stays open. Friday market in the square, no deliveries on Fridays.",
    scope: [
      "Window survey and schedule agreed",
      "Sashes removed and openings weathered",
      "Splice repairs to sills and rails",
      "Reglaze broken panes in cylinder glass",
      "Re-cord, rebalance and draughtproof",
      "Main doors overhauled",
      "Clock turret louvres repaired",
      "Paint in linseed oil paint, three coats",
    ],
    done: 0, crew: [],
  },
  {
    code: "C728", name: "Carrowkeel Lightkeepers' Cottages", clientId: "c-10", quoteN: 10, craft: "roof", location: "Carrowkeel Head", county: "Donegal",
    description: "Re-roof three cottages in natural slate and re-render the seaward gables in lime.", heritage: "Protected structure, 1870s lightkeepers' housing",
    status: "Not started", cm: "p-cm2", sm: "p-sm4", start: 24, end: 82, margin: 22,
    instructions: "Exposed headland: wind limit for roof work is 35 km/h. Accommodation booked in Fanad for the crew.",
    scope: [
      "Scaffold and temporary weather protection",
      "Strip the three roofs, salvage the sound slates",
      "Rafter and wall plate repairs",
      "New battens and breathable membrane",
      "Re-slate the three roofs",
      "Lead flashings and ridges",
      "Remove cement render from the seaward gables",
      "Three-coat lime render to the seaward gables",
      "Limewash and strike scaffold",
    ],
    done: 0, crew: [],
  },

  // Complete, waiting on invoicing
  {
    code: "C714", name: "Abbey Mill Chimney", clientId: "c-03", craft: "brick", location: "Abbey Mill, Ballyfinn", county: "Clare",
    description: "Repoint and cap the 22 m brick chimney stack.", heritage: "Protected structure, industrial heritage",
    status: "Complete", cm: "p-cm2", sm: "p-sm3", start: -90, end: -21, margin: 22, instructions: "", handoverSent: true,
    scope: ["Scaffold to the full height of the stack", "Survey of the stack with the engineer", "Rake out the stack by hand", "Repoint in hot-mixed lime", "Brick repairs in reclaimed brick", "Lead cap and flashings to the top of the stack", "Lightning conductor refixed and tested", "Strike scaffold and clear the mill yard"],
    done: 8,
    crew: [["p-101", -90, -45], ["p-119", -90, -45], ["p-123", -90, -21], ["p-112", -50, -46], ["p-117", -37, -21], ["p-118", -37, -21]],
  },
  {
    code: "C715", name: "St Colman's Graveyard Wall", clientId: "c-08", craft: "wall", location: "Killanure", county: "Cavan",
    description: "Rebuild 46 m of collapsed boundary wall in lime mortar.", heritage: "Recorded monument, medieval graveyard",
    status: "Complete", cm: "p-cm1", sm: "p-sm5", start: -70, end: -27, margin: 9, instructions: "", flags: { extrasFlag: true, invoiceHold: true },
    scope: ["Archaeologist's method agreed and the wall recorded", "Clear ivy and vegetation from the wall", "Take down the collapsed section, stack stone for reuse", "Lime concrete footing to the collapsed section", "Rebuild 46 m of wall in lime mortar", "Cope with salvaged stone", "Site cleared and graves made good"],
    done: 7,
    crew: [["p-103", -70, -45], ["p-105", -70, -45], ["p-127", -70, -32], ["p-128", -70, -27], ["p-102", -49, -27], ["p-104", -49, -27]],
  },
  {
    code: "C716", name: "Glebe House", clientId: "c-09", craft: "sash", location: "Glebe House, Castlegregory", county: "Kerry",
    description: "Overhaul 18 sash windows and the front door case.", heritage: "Protected structure, 1820s glebe house",
    status: "Complete", cm: "p-cm1", sm: "p-sm2", start: -40, end: -6, margin: 18, instructions: "", flags: { snaggingFlag: true, invoiceHold: true },
    scope: ["Window survey and schedule agreed", "Sashes removed and openings weathered", "Splice repairs to sills and rails", "Re-cord, rebalance and draughtproof", "Front door case repaired", "Paint in linseed oil paint, three coats", "Sashes refitted and eased"],
    done: 7,
    crew: [["p-114", -40, -15], ["p-129", -40, -15], ["p-121", -30, -6]],
  },
  {
    code: "C717", name: "Brandonmore Lodge", clientId: "c-02", craft: "render", location: "Brandonmore", county: "Galway",
    description: "Lime render and limewash to the lodge and stable range.", heritage: "Protected structure, estate building",
    status: "Complete", cm: "p-cm1", sm: "p-sm2", start: -60, end: -4, margin: 25, instructions: "",
    scope: ["Scaffold to the lodge and stable range", "Remove cement render, photograph the substrate", "Masonry repairs and dubbing out", "Scratch and float coats", "Finish coat", "Limewash, four coats", "Strike scaffold and clear the yard"],
    done: 7,
    crew: [["p-106", -60, -39], ["p-107", -60, -39], ["p-125", -60, -39], ["p-108", -60, -4]],
  },

  // Invoiced, final account not paid yet
  {
    code: "C711", name: "Dunmoy Bridewell", clientId: "c-04", craft: "masonry", location: "Gaol Lane, Dunmoy", county: "Roscommon",
    description: "Stone repairs and repointing to the old bridewell.", heritage: "Protected structure",
    status: "Invoiced", cm: "p-cm2", sm: "p-sm4", start: -115, end: -50, margin: 20, instructions: "", handoverSent: true,
    scope: ["Scaffold and netting", "Mortar analysis and sample panel approved", "Stone indent repairs", "Rake out and repoint the street elevation", "Rake out and repoint the yard elevations", "Repairs to the window dressings", "Final inspection with the conservation officer", "Strike scaffold"],
    done: 8,
    crew: [["p-102", -115, -50], ["p-104", -115, -50], ["p-124", -115, -50], ["p-120", -115, -106], ["p-126", -100, -50]],
  },
  {
    code: "C712", name: "Rathdoon Lychgate", clientId: "c-01", craft: "roof", location: "Church Road, Rathdoon", county: "Kildare",
    description: "Oak repairs and re-slating of the lychgate.", heritage: "Protected structure",
    status: "Closed", cm: "p-cm1", sm: "p-sm1", start: -100, end: -76, margin: 28, instructions: "", handoverSent: true,
    scope: ["Lychgate recorded and timbers surveyed", "Strip slates and set aside the sound ones", "Oak repairs to posts and tie beams", "Re-slate on new battens", "Lead ridge and flashings", "Site cleared"],
    done: 6,
    crew: [["p-109", -100, -76], ["p-115", -100, -76], ["p-116", -100, -76]],
  },
  {
    code: "C713", name: "Fitzgarret Mews Arch", clientId: "c-05", craft: "brick", location: "Fitzgarret Lane", county: "Dublin",
    description: "Brick arch repairs and repointing to the mews entrance.", heritage: "Protected structure",
    status: "Invoiced", cm: "p-cm1", sm: "p-sm5", start: -66, end: -38, margin: 24, instructions: "", handoverSent: true,
    scope: ["Centring and propping to the arch", "Rake out the arch and jambs", "Rebuild the failed voussoirs in reclaimed brick", "Repoint in lime", "Remove the centring", "Clean down and clear the lane"],
    done: 6,
    crew: [["p-117", -66, -38], ["p-118", -66, -38]],
  },

  // Closed
  {
    code: "C709", name: "Inishbeg Pier Store", clientId: "c-10", craft: "roof", location: "Inishbeg Pier", county: "Donegal",
    description: "Re-roofing of the stone pier store.", heritage: "Recorded structure",
    status: "Closed", cm: "p-cm2", sm: "p-sm4", start: -165, end: -131, margin: 19, instructions: "", handoverSent: true,
    scope: ["Scaffold and temporary weather protection", "Strip slates, salvage the sound ones", "Rafter and wall plate repairs", "New battens and membrane", "Re-slate in salvaged and new slate", "Lead flashings and ridge", "Strike scaffold"],
    done: 7,
    crew: [["p-109", -165, -131], ["p-110", -165, -131], ["p-111", -165, -131], ["p-127", -165, -131]],
  },
  {
    code: "C710", name: "Ardmullen Ice House", clientId: "c-02", craft: "brick", location: "Ardmullen House, Kilcolgan", county: "Galway",
    description: "Consolidation of the brick-vaulted ice house.", heritage: "Protected structure",
    status: "Closed", cm: "p-cm1", sm: "p-sm2", start: -150, end: -126, margin: 26, instructions: "", handoverSent: true,
    scope: ["Ice house recorded and the vault propped", "Clear vegetation from the mound", "Rake out and repoint the vault in lime", "Rebuild the collapsed entrance passage", "Lime mortar capping to the vault", "Props out and the mound reinstated"],
    done: 6,
    crew: [["p-117", -150, -126], ["p-118", -150, -126], ["p-125", -150, -126]],
  },
];

/** Paid hours expected on a planned day: 4% absent, 6% half days, and some overtime at time and a half. */
const EXPECTED_HOURS = 0.9 * (8 + 0.12 * 2 * 1.5) + 0.06 * 4;
/** Labour's share of the cost of a job, as in the quotes' cost build-up. */
export const LABOUR_SHARE = 0.56;

/** The site codes a person works on that day, from their stints (Ionuț's split week applied). */
function siteFor(stints: { code: string; from: string; to: string }[], personId: string, date: string): string[] {
  const on = stints.filter((s) => date >= s.from && date <= s.to).map((s) => s.code);
  if (personId === SPLIT.personId && on.includes(SPLIT.site) && on.length > 1) {
    const bridgeDay = SPLIT.days.includes(dayOfWeek(date));
    return bridgeDay ? [SPLIT.site] : on.filter((c) => c !== SPLIT.site);
  }
  return on;
}

type Dated = PSeed & { startDate: string; endDate: string };

function dated(today: string): Dated[] {
  return PROJECTS.map((p) => ({ ...p, startDate: workdays(today, p.start), endDate: workdays(today, p.end) }));
}

/** Every person's stints, as dates, across all projects. */
function stintsByPerson(today: string, projects: Dated[]) {
  const out = new Map<string, { code: string; from: string; to: string }[]>();
  for (const p of projects)
    for (const [personId, from, to] of p.crew) {
      const s = { code: p.code, from: workdays(today, Math.max(from, p.start)), to: workdays(today, Math.min(to ?? p.end, p.end)) };
      out.set(personId, [...(out.get(personId) ?? []), s]);
    }
  return out;
}

const approvedLeave = (holidays: Holiday[], personId: string, date: string) => holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);

/** Labour expected over a whole project, from its crew's stints and rates: what the job was priced on. */
function expectedLabour(p: Dated, rates: Map<string, number>, stints: Map<string, { code: string; from: string; to: string }[]>, holidays: Holiday[]) {
  let total = 0;
  for (const [personId] of p.crew) {
    const mine = (stints.get(personId) ?? []).filter((s) => s.code === p.code);
    const counted = new Set<string>();
    for (const s of mine)
      for (let d = s.from; d <= s.to; d = addDays(d, 1)) {
        if (isWeekend(d) || counted.has(d) || approvedLeave(holidays, personId, d)) continue;
        if (!siteFor(stints.get(personId) ?? [], personId, d).includes(p.code)) continue;
        counted.add(d);
        total += EXPECTED_HOURS * (rates.get(personId) ?? 0);
      }
  }
  return total;
}

/**
 * What each won quote was priced at: the labour its crew was planned to spend, grossed up by
 * labour's share of cost and the quoted margin. Projects not started yet keep the quote's own figure.
 */
export function quoteTargets(today: string, rates: Map<string, number>, holidays: Holiday[], quotedMargin: (n: number) => number): Map<number, number> {
  const projects = dated(today);
  const stints = stintsByPerson(today, projects);
  const out = new Map<number, number>();
  for (const p of projects) {
    if (!p.quoteN || p.crew.length === 0) continue;
    out.set(p.quoteN, expectedLabour(p, rates, stints, holidays) / LABOUR_SHARE / (1 - quotedMargin(p.quoteN) / 100));
  }
  return out;
}

export type ProjectMeta = { craft: Craft; margin: number; created: string; startDate: string; endDate: string };

export function seedProjects(r: Rng, today: string, quotes: Quote[], holidays: Holiday[], names: Map<string, string>, rates: Map<string, number>) {
  const projects: Project[] = [];
  const scopeGroups: ScopeGroup[] = [];
  const scopeTasks: ScopeTask[] = [];
  const assignments: Assignment[] = [];
  const attendance: Attendance[] = [];
  const plan: PlanEntry[] = [];
  const meta = new Map<string, ProjectMeta>();
  const nextWeek = nextWorkWeek(today);
  const list = dated(today);
  const stints = stintsByPerson(today, list);
  const pid = (code: string) => `pr-${code}`;
  let taskN = 0;
  let planN = 0;

  const variations = seedVariations(today, stints);

  for (const p of list) {
    const id = pid(p.code);
    const quote = p.quoteN ? quotes.find((q) => q.id === `q-${String(p.quoteN).padStart(2, "0")}`) : undefined;
    const cmName = names.get(p.cm)!;
    const smName = names.get(p.sm)!;
    const finished = p.status !== "Live" && p.status !== "Not started";
    const lastWorked = p.status === "Live" ? today : p.endDate;

    // Created a day or two after the quote was accepted; jobs without a quote a few weeks before starting.
    const created = quote?.respondedAt ? workdays(quote.respondedAt.slice(0, 10), 1) : workdays(p.startDate, -12);
    const smNamed = workdays(created, 2) < today ? workdays(created, 2) : today;
    const audit: AuditEntry[] = [
      { at: at(created, "11:35"), who: cmName, what: quote ? `Project created from ${quote.ref}, accepted against ${quote.poNumber}` : "Project created" },
      { at: at(smNamed, "14:05"), who: cmName, what: `${smName} named as site manager` },
    ];
    if (p.status !== "Not started") audit.push({ at: at(p.startDate, "07:45"), who: smName, what: "Crew on site, site set up" });
    for (const v of variations.filter((x) => x.projectId === id)) {
      audit.push({ at: v.raisedAt, who: names.get(v.raisedById) ?? smName, what: `Extras raised: ${v.measured}` });
      if (v.status === "Approved" && v.approvedAt) audit.push({ at: v.approvedAt, who: v.approvedBy ?? cmName, what: `Variation approved: ${v.measured} (${v.estimatedValue.toFixed(2)})` });
    }
    if (finished) audit.push({ at: at(p.endDate, "16:30"), who: smName, what: "Works complete, scope ticked off" });
    if (p.handoverSent) audit.push({ at: at(workdays(p.endDate, 2), "10:15"), who: cmName, what: "Handover pack sent to the client" });
    if (finished && p.flags?.invoiceHold) audit.push({ at: at(workdays(p.endDate, 1), "09:20"), who: cmName, what: p.flags.extrasFlag ? "Final account held: extras to be agreed" : "Final account held: snagging open" });
    audit.sort((a, b) => a.at.localeCompare(b.at));

    const approvedExtras = variations.filter((v) => v.projectId === id && v.status === "Approved").reduce((s, v) => s + v.estimatedValue, 0);
    const draftExtras = variations.some((v) => v.projectId === id && v.status === "Draft");
    const value = quote ? Math.round((quoteTotal(quote.lines) + approvedExtras) * 100) / 100 : Math.round(expectedLabour(p, rates, stints, holidays) / LABOUR_SHARE / (1 - (p.margin + 3) / 100) / 50) * 50;

    projects.push({
      id,
      code: p.code,
      name: p.name,
      clientId: p.clientId,
      quoteId: quote?.id,
      location: p.location,
      county: p.county,
      description: p.description,
      heritage: p.heritage,
      status: p.status,
      contractsManagerId: p.cm,
      siteManagerId: p.sm,
      startDate: p.startDate,
      endDate: p.endDate,
      value,
      pricedBy: quote ? "Quote" : p.code === "C713" || p.code === "C717" ? "Schedule of rates" : "Quote",
      siteInstructions: p.instructions,
      // Extras raised and not yet agreed hold the project's final account, as raising one on screen does.
      extrasFlag: p.flags?.extrasFlag ?? draftExtras,
      snaggingFlag: p.flags?.snaggingFlag ?? false,
      invoiceHold: p.flags?.invoiceHold ?? draftExtras,
      completedAt: finished ? at(p.endDate, "16:30") : undefined,
      handoverSentAt: p.handoverSent ? at(workdays(p.endDate, 2), "10:15") : undefined,
      audit,
    });
    meta.set(p.code, { craft: p.craft, margin: p.margin, created, startDate: p.startDate, endDate: p.endDate });

    // Scope checklist: ticked off in order, spread over the working days so far.
    const groupId = `sg-${p.code}`;
    scopeGroups.push({ id: groupId, projectId: id, label: "Original project overview", isOriginal: true, date: created });
    const span = workdaysBetween(p.startDate, lastWorked);
    p.scope.forEach((description, i) => {
      const isDone = i < p.done;
      const doneDay = isDone ? workdays(p.startDate, Math.max(1, Math.round(((i + 1) / p.done) * span * (finished ? 1 : 0.92)))) : undefined;
      scopeTasks.push({ id: `st-${++taskN}`, projectId: id, groupId, description, done: isDone, completedAt: doneDay ? at(doneDay > lastWorked ? lastWorked : doneDay, "16:10") : undefined, completedBy: isDone ? smName : undefined });
    });

    // Today's site list: everyone whose stint runs through today.
    for (const [personId, from, to] of p.crew) if (p.status === "Live" && from <= 0 && (to ?? p.end) >= 0) assignments.push({ id: `as-${p.code}-${personId}`, projectId: id, personId });
  }

  // Timesheets, day by day, for everyone's stints up to today.
  const markedToday = new Set(["C719", "C720", "C721"]);
  const sentToday = new Set(["C720"]);
  let attN = 0;
  for (const [personId, mine] of [...stints].sort((a, b) => a[0].localeCompare(b[0]))) {
    const first = mine.reduce((m, s) => (s.from < m ? s.from : m), mine[0]!.from);
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (isWeekend(d) || approvedLeave(holidays, personId, d)) continue;
      for (const code of siteFor(mine, personId, d)) {
        const p = list.find((x) => x.code === code)!;
        const isToday = d === today;
        if (isToday && !markedToday.has(code)) continue;
        const roll = r.next();
        if (roll < 0.04) continue;
        const status: Attendance["status"] = roll < 0.1 ? "half" : "full";
        const overtimeHours = status === "full" && r.chance(0.12) ? r.int(1, 3) : 0;
        attendance.push({ id: `att-${++attN}`, projectId: pid(code), personId, date: d, status, overtimeHours, savedBy: names.get(p.sm)!, savedAt: at(d, isToday ? "08:20" : "12:40"), sent: !isToday || sentToday.has(code) });
      }
    }
  }
  attendance.sort((a, b) => a.date.localeCompare(b.date) || a.projectId.localeCompare(b.projectId) || a.personId.localeCompare(b.personId));

  // The plan: this week (as it was sent out last Friday) and the next three, for everyone on a live site.
  const monday = lastWeekdayOf(today, 1);
  const planDays: string[] = [];
  for (let d = monday; planDays.length < 30 && d <= workdays(today, 15); d = addDays(d, 1)) if (!isWeekend(d)) planDays.push(d);
  for (const p of list.filter((x) => x.status === "Live")) {
    for (const [personId] of p.crew) {
      for (const date of planDays) {
        if (date < p.startDate || date > p.endDate || approvedLeave(holidays, personId, date)) continue;
        const here = siteFor(stints.get(personId) ?? [], personId, date);
        // One deliberate double booking, on Wednesday next week, for the week ahead's clash warning.
        if (!here.includes(p.code) && !(personId === SPLIT.personId && date === nextWeek[2])) continue;
        // Next week is not fully rostered yet: a few people still have free days to place.
        if (NEXT_WEEK_FREE[personId]?.includes(nextWeek.indexOf(date))) continue;
        // One half day in the sample, so the planner shows what a split day looks like.
        const half = personId === "p-126" && nextWeek.indexOf(date) === 1;
        plan.push({ id: `pl-${++planN}`, projectId: pid(p.code), personId, date, ...(half ? { part: "half" as const } : {}) });
      }
    }
  }

  const requests: SiteRequest[] = [
    { id: "rq-1", projectId: pid("C719"), kind: "personnel", description: "General operatives to help adapt the scaffold at belfry level", quantity: 2, neededFrom: workdays(today, 2), neededTo: workdays(today, 3), notes: "Must have Working at height in date", requestedBy: "Eoin Brosnan", createdAt: at(today, "08:05"), status: "Open" },
    { id: "rq-2", projectId: pid("C720"), kind: "own_plant", description: "Dehumidifiers for the drawing room ceiling", quantity: 2, neededFrom: workdays(today, 1), neededTo: workdays(today, 12), notes: "", requestedBy: "Cathal Minogue", createdAt: at(workdays(today, -1), "16:45"), status: "Open" },
    { id: "rq-3", projectId: pid("C721"), kind: "hired_plant", description: "20 m articulated boom lift for the east gable", quantity: 1, neededFrom: workdays(today, 4), neededTo: workdays(today, 8), notes: "Ground is soft by the mill race, ask for tracked", requestedBy: "Róisín Garvey", createdAt: at(workdays(today, -1), "09:30"), status: "Open" },
    { id: "rq-4", projectId: pid("C722"), kind: "personnel", description: "Stonemason to cover carving of the cornice returns", quantity: 1, neededFrom: workdays(today, 5), neededTo: workdays(today, 14), notes: "", requestedBy: "Darragh Lenihan", createdAt: at(workdays(today, -2), "12:10"), status: "Open" },
    { id: "rq-5", projectId: pid("C723"), kind: "own_plant", description: "Scaffold tower for the rear return", quantity: 1, neededFrom: workdays(today, -6), neededTo: workdays(today, 6), notes: "", requestedBy: "Shane Culloty", createdAt: at(workdays(today, -8), "10:20"), status: "Done", decision: "Approved", decidedBy: "Aidan King", decidedAt: at(workdays(today, -8), "11:05") },
    { id: "rq-6", projectId: pid("C724"), kind: "hired_plant", description: "Traffic lights, two-way, with battery packs", quantity: 1, neededFrom: workdays(today, -9), neededTo: workdays(today, 12), notes: "", requestedBy: "Eoin Brosnan", createdAt: at(workdays(today, -12), "15:00"), status: "Done", decision: "Approved", decidedBy: "Aidan King", decidedAt: at(workdays(today, -11), "08:30") },
  ];

  return { projects, scopeGroups, scopeTasks, assignments, attendance, plan, variations: variations.map(({ approvedAt: _a, ...v }) => v), requests, meta };
}

/** Working days from one date to another (0 when they are the same day). */
function workdaysBetween(from: string, to: string) {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (!isWeekend(addDays(d, 1))) n++;
  return n;
}

/** Extras raised on site. Each is dated to a day its author was on that site. */
function seedVariations(today: string, stints: Map<string, { code: string; from: string; to: string }[]>): (Variation & { approvedAt?: string })[] {
  const pid = (code: string) => `pr-${code}`;
  /** The latest working day at least `back` working days ago when this person was on this site. */
  const onSite = (personId: string, code: string, back: number) => {
    for (let i = back; i < back + 30; i++) {
      const d = workdays(today, -i);
      if (siteFor(stints.get(personId) ?? [], personId, d).includes(code)) return d;
    }
    return workdays(today, -back);
  };
  return [
    {
      id: "var-1", projectId: pid("C719"), raisedById: "p-103", raisedAt: at(onSite("p-103", "C719", 1), "13:20"),
      original: "Po zdjęciu starej zaprawy okazało się, że trzy kamienie narożne na poziomie dzwonnicy są spękane na wylot. Trzeba je wymienić, samo spoinowanie nie wystarczy.",
      originalLanguage: "pl",
      description: "With the old mortar out, three quoin stones at belfry level turned out to be cracked right through. They need replacing; repointing alone will not do.",
      measured: "3 no. limestone quoins, approx. 450 x 300 x 250 mm each", estimatedValue: 1860, status: "Draft",
    },
    {
      id: "var-2", projectId: pid("C720"), raisedById: "p-108", raisedAt: at(onSite("p-108", "C720", 2), "11:05"),
      original: "Ao retirar o reboco de cimento na parede leste, encontrámos uma verga de madeira podre por cima da janela do primeiro andar. Precisa de ser substituída antes de rebocar.",
      originalLanguage: "pt",
      description: "Taking the cement render off the east wall, we found a rotten timber lintel over the first floor window. It needs replacing before we render.",
      measured: "1 no. oak lintel, 1.4 m long, with temporary propping", estimatedValue: 940, status: "Draft",
    },
    {
      id: "var-3", projectId: pid("C722"), raisedById: "p-104", raisedAt: at(onSite("p-104", "C722", 2), "15:40"),
      original: "Sub cornișă, pe latura dinspre stradă, piatra este mult mai degradată decât arată releveul. Mai sunt aproximativ 4 metri liniari de cornișă care trebuie înlocuiți.",
      originalLanguage: "ro",
      description: "Under the cornice on the street side, the stone is far more decayed than the survey shows. About 4 more linear metres of cornice need replacing.",
      measured: "4 lin m additional carved limestone cornice", estimatedValue: 2160, status: "Draft",
    },
    {
      id: "var-4", projectId: pid("C721"), raisedById: "p-109", raisedAt: at(onSite("p-109", "C721", 8), "10:30"), approvedAt: at(workdays(today, -7), "09:10"),
      description: "Wall plate on the mill race side is rotten for its full length, not just at the truss bearings as surveyed. Engineer has seen it and agrees it all comes out.",
      measured: "9.6 m of 225 x 100 mm wall plate in treated softwood", estimatedValue: 3250, status: "Approved", approvedBy: "Aisling Rafter",
    },
    {
      id: "var-5", projectId: pid("C715"), raisedById: "p-sm5", raisedAt: at(workdays(today, -30), "14:15"),
      description: "Foundation to the collapsed section was only loose fill. Dug out and laid a lime concrete footing before rebuilding, as agreed on site with the archaeologist.",
      measured: "11 m footing, 600 x 300 mm, lime concrete", estimatedValue: 2780, status: "Draft",
    },
  ];
}

