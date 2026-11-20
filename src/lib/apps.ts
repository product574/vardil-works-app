import type { Region } from "../config/brand";

/**
 * The apps Vardil sells, the packages they come in, and how one client's set of apps is found
 * (19 Nov, Oisin: "for us we are pitching to clients and these are our main offering").
 *
 * Pure, with no React and no store, so the server function (functions/api/workspace.ts) checks
 * what it is sent against the same lists the app shows.
 */

/** Every app a client can have. The same keys as the departments in the bottom bar. */
export const APP_KEYS = ["dashboard", "inbox", "chat", "sales", "customers", "projects", "schedule", "people", "plant", "fleet", "compliance", "files", "invoicing", "profit", "reports", "portal", "site", "admin", "settings"] as const;
export type AppKey = (typeof APP_KEYS)[number];

/** Apps every client has whatever they buy: without them the system cannot be run. */
export const ALWAYS_ON: AppKey[] = ["dashboard", "admin", "settings"];

export type Package = { key: string; name: string; does: string; apps: AppKey[]; automations: boolean };

export const PACKAGES: Package[] = [
  {
    key: "main",
    name: "Main offering",
    does: "Schedule and roster, People, Compliance, the Site phone, Admin and the Dashboard.",
    apps: ["dashboard", "schedule", "people", "compliance", "site", "admin", "settings"],
    automations: false,
  },
  {
    key: "full",
    name: "Everything",
    does: "Every app, as the full demo.",
    apps: [...APP_KEYS],
    automations: true,
  },
];

/** What each app does, in a line a client reads on the Vardil Works page. */
export const APP_INFO: Record<AppKey, { name: string; blurb: string }> = {
  dashboard: { name: "Dashboard", blurb: "What needs your yes or no today, with an AI summary of the firm." },
  inbox: { name: "Email", blurb: "Your shared inbox, sorted and tagged, with replies drafted for you to approve." },
  chat: { name: "Team chat", blurb: "Teams or Slack, with a group chat for every site." },
  sales: { name: "Sales", blurb: "Enquiries to quotes to won work, on one board, priced from your rate books." },
  customers: { name: "Customers", blurb: "Every client with their projects, tenders, invoices and emails in one place." },
  projects: { name: "Projects", blurb: "Each job's scope, photos, files, extras, requests and costs." },
  schedule: { name: "Schedule and roster", blurb: "Who is where this week and this month, sent to each person by email and WhatsApp." },
  people: { name: "People", blurb: "Employees, timesheets, holidays and payroll hours for Sage." },
  plant: { name: "Plant", blurb: "Your own and hired plant, where it is, services and certificates." },
  fleet: { name: "Fleet", blurb: "Vans and drivers, renewals, repair spend and daily driving checks." },
  compliance: { name: "Compliance", blurb: "Every ticket, licence and certificate in date, and who cannot work until it is." },
  files: { name: "Files", blurb: "Folders per project, with new files sorted for you." },
  invoicing: { name: "Invoicing", blurb: "Client, supplier and subcontractor invoices, approved and sent to Sage." },
  profit: { name: "Profitability", blurb: "What each site has cost so far against what it is worth." },
  reports: { name: "Reports", blurb: "Win rate, margins, sales by customer and where the money goes." },
  portal: { name: "Client portal", blurb: "Clients and subcontractors see their quotes, progress and invoices." },
  site: { name: "Site phone", blurb: "One simple app for every employee: requests, repairs, claims, holidays and certificates." },
  admin: { name: "Admin", blurb: "Requests, roles and access, company holidays and connections." },
  settings: { name: "Settings", blurb: "Your name, colour and logo." },
};

/** Apps shown on the Vardil Works page and switched in Vardil HQ: everything except the two that are always on and not sold. */
export const SOLD_APPS: AppKey[] = APP_KEYS.filter((k) => k !== "settings");

export const isAppKey = (x: unknown): x is AppKey => typeof x === "string" && (APP_KEYS as readonly string[]).includes(x);

/**
 * How a client's demo looks (20 Nov, Oisin: "their company logo, the format, the colouring"):
 * their names, colour and region, and their invoice paper. Set in Vardil HQ only; the client
 * sees it and cannot change it. The logo is kept apart on the server (`logoUrl` on the config).
 */
export type ClientLook = {
  brandName: string;
  legalName: string;
  tagline: string;
  accent: string;
  region: Region;
  /** What is printed on their invoices (the fields of InvoiceDesign in lib/invoices). Anything left out takes the region's starting value. */
  design: LookDesign;
};

const DESIGN_TEXT = ["address", "phone", "email", "vatNumber", "companyNumber", "bankName", "iban", "bic", "terms", "footer"] as const;
const DESIGN_SWITCH = ["showLogo", "showBank", "showSite", "rule"] as const;
/** Written out here rather than imported, so the server's own build needs nothing from the page's. */
export type LookDesign = Partial<Record<(typeof DESIGN_TEXT)[number], string> & Record<(typeof DESIGN_SWITCH)[number], boolean>>;

/**
 * The levels a person may sign in to a demo as (20 Nov, decision 210): the six on the "Who are you
 * signing in as?" page. Written out here (the same keys as RoleKey in data/types) so the server
 * needs nothing from the page's code; apps.test.ts checks the two agree.
 */
export const DEMO_LEVELS = ["md", "contracts", "site", "accounts", "operative", "client"] as const;
export type DemoLevel = (typeof DEMO_LEVELS)[number];
export const LEVEL_NAMES: Record<DemoLevel, string> = { md: "Managing director", contracts: "Contracts manager", site: "Site manager", accounts: "Accounts", operative: "Operative (phone)", client: "Client (portal)" };
export const isLevel = (x: unknown): x is DemoLevel => typeof x === "string" && (DEMO_LEVELS as readonly string[]).includes(x);

/** One person who may sign in to a client's demo, and the levels they may use. */
export type ClientPerson = { email: string; levels: DemoLevel[] };

/** Where a demo stands: running, or closed because they became a client or said no. */
export type DemoStage = "active" | "won" | "lost";
export const STAGE_NAMES: Record<DemoStage, string> = { active: "Demo", won: "Became a client", lost: "Not interested" };
/** How long a new demo runs, and how much "Extend" adds. */
export const DEMO_DAYS = 30;
/** How long before the end a demo is flagged. */
export const ENDING_SOON_DAYS = 7;
/** How long what prospects did in their demo is kept. */
export const KEEP_ACTIVITY_DAYS = 365;

/** What one person has done in their demo, over the days kept. */
export type PersonActivity = {
  email: string;
  firstAt: string | null;
  lastAt: string | null;
  /** Days they opened the demo on, and separate visits (a gap of 30 minutes starts a new one). */
  days: number;
  visits: number;
  /** Each app they opened, and on how many days. */
  apps: Partial<Record<AppKey, number>>;
  levels: DemoLevel[];
};

/** A client as Vardil HQ saves it: who signs in (named emails only) at which levels, their apps, look and demo status. */
export type ClientConfig = {
  id: string;
  name: string;
  people: ClientPerson[];
  apps: AppKey[];
  automations: boolean;
  look: ClientLook;
  /** Where their logo is served from, or "" for none. */
  logoUrl: string;
  stage: DemoStage;
  /** The last day the demo is open (yyyy-mm-dd), or null for no end. */
  endsOn: string | null;
  /** Staff only: what each person has done. */
  activity?: PersonActivity[];
  updatedAt?: string;
  updatedBy?: string;
};

/** What a signed-in client is sent about their own firm: never anyone else's emails or activity. */
export type OwnConfig = Pick<ClientConfig, "id" | "name" | "apps" | "automations" | "look" | "logoUrl"> & { levels: DemoLevel[] };

/** A date as yyyy-mm-dd, plus or minus whole days. */
export function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
/** Today in Ireland, as yyyy-mm-dd: the day a demo's end date is counted against. */
export function irishToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Where a demo stands today, for the screens: open, ending within a week, past its end date, or closed. */
export type DemoState = "open" | "ending" | "ended" | "won" | "lost";
export function demoState(stage: DemoStage, endsOn: string | null, today: string): DemoState {
  if (stage === "won" || stage === "lost") return stage;
  if (endsOn && endsOn < today) return "ended";
  if (endsOn && endsOn <= shiftDay(today, ENDING_SOON_DAYS)) return "ending";
  return "open";
}
/** Whether its people may sign in today. */
export const demoLive = (stage: DemoStage, endsOn: string | null, today: string) => stage === "active" && !(endsOn && endsOn < today);

/** One sign-in email, lower case and trimmed, or null. A firm's whole domain is not accepted (decision 209: named emails only). */
export function cleanEmail(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return /^[^\s@,;<>"]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s) && s.length <= 200 ? s : null;
}

/** Emails typed into a box, one a line or separated by commas or spaces: the good ones and the ones that are not emails. */
export function splitEmails(raw: string): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  for (const part of raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const e = cleanEmail(part);
    if (e) {
      if (!good.includes(e)) good.push(e);
    } else bad.push(part);
  }
  return { good, bad };
}

/** The client whose list holds this email. */
export function clientOf<T extends { people: { email: string }[] }>(email: string, rows: T[]): T | null {
  const e = email.trim().toLowerCase();
  return rows.find((r) => r.people.some((p) => p.email === e)) ?? null;
}

/** The levels a person keeps when sent: known ones only, in the page's order; none means every level. */
export function readLevels(raw: unknown): DemoLevel[] {
  const got = Array.isArray(raw) ? raw.filter(isLevel) : [];
  const kept = DEMO_LEVELS.filter((l) => got.includes(l));
  return kept.length ? kept : [...DEMO_LEVELS];
}

/** A starting look for a new client: their name, Vardil's colour, Ireland. */
export function starterLook(name: string): ClientLook {
  const n = name.trim();
  return { brandName: n, legalName: n ? `${n} Ltd` : "", tagline: "", accent: "#4682B4", region: "IE", design: {} };
}

/** The invented email domain the sample staff use in a client's demo: from their name, never a real address. */
export function sampleDomain(brandName: string): string {
  const slug = brandName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 30);
  return `${slug || "firm"}.example`;
}

/** The brand fields a client's look sets. */
export function brandOfLook(look: ClientLook, logoUrl: string) {
  return { brandName: look.brandName, legalName: look.legalName, tagline: look.tagline, accent: look.accent, region: look.region, logoUrl, emailDomain: sampleDomain(look.brandName) };
}

/** Reads a look sent to the server: every field checked, anything else dropped. */
export function readLook(raw: unknown): ClientLook | null {
  if (!isObj(raw)) return null;
  const brandName = text(raw.brandName, 60);
  if (!brandName) return null;
  const accent = typeof raw.accent === "string" && /^#[0-9a-f]{6}$/i.test(raw.accent) ? raw.accent : null;
  if (!accent) return null;
  const region: Region | null = raw.region === "IE" || raw.region === "UK" ? raw.region : null;
  if (!region) return null;
  const design: LookDesign = {};
  const d = isObj(raw.design) ? raw.design : {};
  for (const k of DESIGN_TEXT) if (typeof d[k] === "string") design[k] = multiline(d[k], 300);
  for (const k of DESIGN_SWITCH) if (typeof d[k] === "boolean") design[k] = d[k];
  return { brandName, legalName: text(raw.legalName, 120) || brandName, tagline: text(raw.tagline, 120), accent: accent.toLowerCase(), region, design };
}

/** A logo as sent from Vardil HQ: a JPEG or PNG picture, already shrunk in the page. */
export const LOGO_MAX = 220_000;
export function readLogo(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > LOGO_MAX) return null;
  return /^data:image\/(jpeg|png);base64,[a-z0-9+/]+=*$/i.test(raw) ? raw : null;
}

/** The apps switched off, given the ones a client has. The always-on apps never are. */
export function appsOff(on: readonly AppKey[]): AppKey[] {
  return APP_KEYS.filter((k) => !on.includes(k) && !ALWAYS_ON.includes(k));
}

/** The package a set of apps matches exactly, if any. */
export function packageOf(on: readonly AppKey[], automations: boolean): Package | null {
  const set = new Set([...on, ...ALWAYS_ON]);
  return PACKAGES.find((p) => p.automations === automations && p.apps.length === set.size && p.apps.every((a) => set.has(a))) ?? null;
}

// ── What Vardil HQ may send to the server ─────────────────────────────────────

export type WorkspaceAction =
  | { action: "set_client"; id: string | null; name: string; people: ClientPerson[]; apps: AppKey[]; automations: boolean; look: ClientLook }
  | { action: "delete_client"; id: string }
  | { action: "set_stage"; id: string; stage: DemoStage }
  | { action: "set_end"; id: string; endsOn: string | null }
  | { action: "visit" }
  | { action: "seen"; app: AppKey; level: DemoLevel | null }
  | { action: "set_logo"; id: string; logo: string | null }
  | { action: "sync_cloudflare" }
  | { action: "announce"; title: string; body: string }
  | { action: "remove_announcement"; id: string }
  | { action: "handle_request"; id: string }
  | { action: "ask_app"; app: AppKey; firm: string };

/** Actions only Vardil staff may take. Asking about an app is open to every signed-in client. */
export const STAFF_ACTIONS = new Set(["set_client", "delete_client", "set_stage", "set_end", "set_logo", "sync_cloudflare", "announce", "remove_announcement", "handle_request"]);
/** What a client's own page sends about their visit. Staff are never recorded. */
export const VISIT_ACTIONS = new Set(["visit", "seen"]);

/** The most people one client can have signed in. */
export const MAX_EMAILS = 200;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
const multiline = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0009\u000b-\u001f]/g, "").trim().slice(0, max) : "");
const isId = (x: unknown): x is string => typeof x === "string" && /^[a-z0-9-]{4,64}$/i.test(x);

/** Reads what was sent into a known shape, or says why it was refused. Nothing else reaches the database. */
export function readWorkspaceAction(raw: unknown): { ok: true; act: WorkspaceAction } | { ok: false; reason: string } {
  if (!isObj(raw)) return { ok: false, reason: "not an object" };
  switch (raw.action) {
    case "set_client": {
      const id = raw.id == null ? null : isId(raw.id) ? raw.id : undefined;
      if (id === undefined) return { ok: false, reason: "id" };
      const name = text(raw.name, 120);
      if (!name) return { ok: false, reason: "name" };
      if (!Array.isArray(raw.people) || raw.people.length > MAX_EMAILS) return { ok: false, reason: "people" };
      const people: ClientPerson[] = [];
      for (const p of raw.people) {
        const c = isObj(p) && typeof p.email === "string" ? cleanEmail(p.email) : null;
        if (!c) return { ok: false, reason: "people" };
        if (!people.some((x) => x.email === c)) people.push({ email: c, levels: readLevels(isObj(p) ? p.levels : null) });
      }
      if (!Array.isArray(raw.apps) || !raw.apps.every(isAppKey)) return { ok: false, reason: "apps" };
      const apps = [...new Set([...(raw.apps as AppKey[]), ...ALWAYS_ON])];
      const look = readLook(raw.look);
      if (!look) return { ok: false, reason: "look" };
      return { ok: true, act: { action: "set_client", id, name, people, apps, automations: raw.automations === true, look } };
    }
    case "delete_client":
      return isId(raw.id) ? { ok: true, act: { action: "delete_client", id: raw.id } } : { ok: false, reason: "id" };
    case "set_logo": {
      if (!isId(raw.id)) return { ok: false, reason: "id" };
      if (raw.logo === null || raw.logo === "") return { ok: true, act: { action: "set_logo", id: raw.id, logo: null } };
      const logo = readLogo(raw.logo);
      return logo ? { ok: true, act: { action: "set_logo", id: raw.id, logo } } : { ok: false, reason: "logo" };
    }
    case "sync_cloudflare":
      return { ok: true, act: { action: "sync_cloudflare" } };
    case "set_stage":
      if (!isId(raw.id)) return { ok: false, reason: "id" };
      return raw.stage === "active" || raw.stage === "won" || raw.stage === "lost" ? { ok: true, act: { action: "set_stage", id: raw.id, stage: raw.stage } } : { ok: false, reason: "stage" };
    case "set_end": {
      if (!isId(raw.id)) return { ok: false, reason: "id" };
      if (raw.endsOn === null) return { ok: true, act: { action: "set_end", id: raw.id, endsOn: null } };
      const ok = typeof raw.endsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.endsOn) && !Number.isNaN(Date.parse(`${raw.endsOn}T00:00:00Z`));
      return ok ? { ok: true, act: { action: "set_end", id: raw.id, endsOn: raw.endsOn as string } } : { ok: false, reason: "endsOn" };
    }
    case "visit":
      return { ok: true, act: { action: "visit" } };
    case "seen":
      if (!isAppKey(raw.app)) return { ok: false, reason: "app" };
      return { ok: true, act: { action: "seen", app: raw.app, level: isLevel(raw.level) ? raw.level : null } };
    case "announce": {
      const title = text(raw.title, 120);
      const body = text(raw.body, 2000);
      if (!title || !body) return { ok: false, reason: "announcement" };
      return { ok: true, act: { action: "announce", title, body } };
    }
    case "remove_announcement":
    case "handle_request": {
      const id = text(raw.id, 64);
      if (!isId(id)) return { ok: false, reason: "id" };
      return { ok: true, act: { action: raw.action, id } };
    }
    case "ask_app": {
      if (!isAppKey(raw.app)) return { ok: false, reason: "app" };
      return { ok: true, act: { action: "ask_app", app: raw.app, firm: text(raw.firm, 120) } };
    }
    default:
      return { ok: false, reason: "action" };
  }
}

/** What happened on Cloudflare after a change in Vardil HQ. */
export type CloudflareResult = { linked: boolean; ok: boolean; message: string; signedOut?: string[] };
/** Cloudflare's state as Vardil HQ shows it. */
export type CloudflareState = { linked: boolean; syncedAt: string | null; error: string | null; count: number };

export type Announcement = { id: string; title: string; body: string; at: string; by: string };
export type AppRequest = { id: string; email: string; firm: string; app: AppKey; at: string; handledAt?: string; handledBy?: string };

/** Announcements Vardil writes before any are saved on the server: what a new client sees first. */
export const STARTER_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "welcome",
    title: "Welcome to Vardil Works",
    body: "This page is where we tell you about new features and changes. Your apps are listed below, with the others you can add whenever you are ready.",
    at: "2026-11-19T09:00:00Z",
    by: "Vardil",
  },
];
