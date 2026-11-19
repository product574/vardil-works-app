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

/** A client's own setting, as Vardil HQ saves it. */
export type ClientConfig = { key: string; name: string; apps: AppKey[]; automations: boolean; updatedAt?: string; updatedBy?: string };

/**
 * Who a setting is for: one email ("susan@ardmullen.ie"), or every email at a firm
 * ("@ardmullen.ie"). Lower case, trimmed. Null when it is neither.
 */
export function clientKey(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return s;
  if (/^[^\s@]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)) return s;
  return null;
}

/** The setting that applies to someone signing in: their own email first, then their firm's. */
export function configFor<T extends { key: string }>(email: string, rows: T[]): T | null {
  const e = email.trim().toLowerCase();
  const domain = e.slice(e.lastIndexOf("@"));
  return rows.find((r) => r.key === e) ?? rows.find((r) => r.key === domain) ?? null;
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
  | { action: "set_client"; key: string; name: string; apps: AppKey[]; automations: boolean }
  | { action: "delete_client"; key: string }
  | { action: "announce"; title: string; body: string }
  | { action: "remove_announcement"; id: string }
  | { action: "handle_request"; id: string }
  | { action: "ask_app"; app: AppKey; firm: string };

/** Actions only Vardil staff may take. Asking about an app is open to every signed-in client. */
export const STAFF_ACTIONS = new Set(["set_client", "delete_client", "announce", "remove_announcement", "handle_request"]);

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max) : "");

/** Reads what was sent into a known shape, or says why it was refused. Nothing else reaches the database. */
export function readWorkspaceAction(raw: unknown): { ok: true; act: WorkspaceAction } | { ok: false; reason: string } {
  if (!isObj(raw)) return { ok: false, reason: "not an object" };
  switch (raw.action) {
    case "set_client": {
      const key = clientKey(typeof raw.key === "string" ? raw.key : "");
      if (!key) return { ok: false, reason: "key" };
      const name = text(raw.name, 120);
      if (!name) return { ok: false, reason: "name" };
      if (!Array.isArray(raw.apps) || !raw.apps.every(isAppKey)) return { ok: false, reason: "apps" };
      const apps = [...new Set([...(raw.apps as AppKey[]), ...ALWAYS_ON])];
      return { ok: true, act: { action: "set_client", key, name, apps, automations: raw.automations === true } };
    }
    case "delete_client": {
      const key = clientKey(typeof raw.key === "string" ? raw.key : "");
      return key ? { ok: true, act: { action: "delete_client", key } } : { ok: false, reason: "key" };
    }
    case "announce": {
      const title = text(raw.title, 120);
      const body = text(raw.body, 2000);
      if (!title || !body) return { ok: false, reason: "announcement" };
      return { ok: true, act: { action: "announce", title, body } };
    }
    case "remove_announcement":
    case "handle_request": {
      const id = text(raw.id, 64);
      if (!/^[a-z0-9-]{4,64}$/i.test(id)) return { ok: false, reason: "id" };
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
