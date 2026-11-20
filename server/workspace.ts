/**
 * Vardil's own records in the D1 database bound as DB (19 Nov; firms with named emails and their
 * look since 20 Nov): which apps each client has, who signs in to it, how it looks,
 * the announcements every client sees on Admin, Vardil Works, and the "Ask about this app"
 * requests clients send. Only Vardil staff change the first two; the rules for what may be
 * sent are in src/lib/apps.ts (`readWorkspaceAction`).
 */
import { type Announcement, type AppKey, type AppRequest, type ClientConfig, isAppKey, type OwnConfig, readLook, starterLook, type WorkspaceAction } from "../src/lib/apps";

export const WORKSPACE_SCHEMA = [
  // 20 Nov: a client is a firm with named sign-in emails, its apps and its look. The first
  // version's `clients` table (keyed by one email or a domain) is no longer read.
  `CREATE TABLE IF NOT EXISTS firms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    apps TEXT NOT NULL,
    automations INTEGER NOT NULL DEFAULT 0,
    look TEXT NOT NULL,
    logo TEXT,
    logo_at TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS firm_emails (
    email TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS vardil_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    at TEXT NOT NULL,
    by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_requests (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    firm TEXT NOT NULL,
    app TEXT NOT NULL,
    at TEXT NOT NULL,
    handled_at TEXT,
    handled_by TEXT
  )`,
];

let ready = false;
export async function ensureWorkspaceSchema(db: D1Database) {
  if (ready) return;
  await db.batch(WORKSPACE_SCHEMA.map((s) => db.prepare(s)));
  ready = true;
}

/** Which domains count as Vardil staff on the server. Never taken from the page. */
export function staffDomains(raw: string | undefined) {
  return (raw || "vardil.com").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
export function isStaff(email: string, domains: string[]) {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  return at > 0 && domains.includes(e.slice(at + 1));
}

type FirmRow = { id: string; name: string; apps: string; automations: number; look: string; logo_at: string | null; updated_at: string; updated_by: string };

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Where a firm's logo is served from: changes whenever the logo does, so browsers never show an old one. */
export const logoUrlOf = (id: string, at: string | null) => (at ? `/api/logo/${id}?v=${encodeURIComponent(at)}` : "");

const toClient = (r: FirmRow, emails: string[]): ClientConfig => {
  const appsRaw = parse(r.apps);
  const apps = Array.isArray(appsRaw) ? appsRaw.filter(isAppKey) : [];
  // A row that cannot be read keeps the firm's name and Vardil's colour rather than failing the page.
  const look = readLook(parse(r.look)) ?? starterLook(r.name);
  return { id: r.id, name: r.name, emails, apps, automations: r.automations === 1, look, logoUrl: logoUrlOf(r.id, r.logo_at), updatedAt: r.updated_at, updatedBy: r.updated_by };
};

const FIRM_COLUMNS = "id, name, apps, automations, look, logo_at, updated_at, updated_by";

export async function listClients(db: D1Database): Promise<ClientConfig[]> {
  const [firms, emails] = await Promise.all([
    db.prepare(`SELECT ${FIRM_COLUMNS} FROM firms ORDER BY name`).all<FirmRow>(),
    db.prepare("SELECT email, firm_id FROM firm_emails ORDER BY email").all<{ email: string; firm_id: string }>(),
  ]);
  const by = new Map<string, string[]>();
  for (const e of emails.results ?? []) by.set(e.firm_id, [...(by.get(e.firm_id) ?? []), e.email]);
  return (firms.results ?? []).map((r) => toClient(r, by.get(r.id) ?? []));
}

/** The firm a signed-in email belongs to, as that client is sent it. */
export async function ownClient(db: D1Database, email: string): Promise<OwnConfig | null> {
  const row = await db.prepare(`SELECT ${FIRM_COLUMNS.split(", ").map((c) => `f.${c}`).join(", ")} FROM firm_emails e JOIN firms f ON f.id = e.firm_id WHERE e.email = ?1`).bind(email.toLowerCase()).first<FirmRow>();
  if (!row) return null;
  const { id, name, apps, automations, look, logoUrl } = toClient(row, []);
  return { id, name, apps, automations, look, logoUrl };
}

/** Every email that may sign in as a client, for Cloudflare's list. */
export async function allClientEmails(db: D1Database): Promise<string[]> {
  const res = await db.prepare("SELECT email FROM firm_emails ORDER BY email").all<{ email: string }>();
  return (res.results ?? []).map((r) => r.email);
}

/** A firm's logo for /api/logo, if the person asking is staff or one of the firm's own. */
export async function logoFor(db: D1Database, id: string, email: string, staff: boolean): Promise<string | null> {
  const row = await db.prepare("SELECT logo FROM firms WHERE id = ?1").bind(id).first<{ logo: string | null }>();
  if (!row?.logo) return null;
  if (staff) return row.logo;
  const mine = await db.prepare("SELECT 1 AS ok FROM firm_emails WHERE email = ?1 AND firm_id = ?2").bind(email.toLowerCase(), id).first<{ ok: number }>();
  return mine ? row.logo : null;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM vardil_settings WHERE key = ?1").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
export async function setSetting(db: D1Database, key: string, value: string | null) {
  if (value === null) await db.prepare("DELETE FROM vardil_settings WHERE key = ?1").bind(key).run();
  else await db.prepare("INSERT INTO vardil_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2").bind(key, value).run();
}

export async function listAnnouncements(db: D1Database): Promise<Announcement[]> {
  const res = await db.prepare("SELECT id, title, body, at, by FROM announcements ORDER BY at DESC LIMIT 20").all<Announcement>();
  return res.results ?? [];
}

type RequestRow = { id: string; email: string; firm: string; app: string; at: string; handled_at: string | null; handled_by: string | null };
export async function listRequests(db: D1Database): Promise<AppRequest[]> {
  const res = await db.prepare("SELECT * FROM app_requests ORDER BY at DESC LIMIT 200").all<RequestRow>();
  return (res.results ?? []).filter((r) => isAppKey(r.app)).map((r) => ({ id: r.id, email: r.email, firm: r.firm, app: r.app as AppKey, at: r.at, ...(r.handled_at ? { handledAt: r.handled_at, handledBy: r.handled_by ?? "" } : {}) }));
}

/** What a change did to who may sign in: emails that came onto the list, and emails that left it altogether. */
export type Outcome = { id?: string; added: string[]; removed: string[]; refused?: string };

/** Carry out one action that has already been read by `readWorkspaceAction` and allowed for this person. */
export async function runAction(db: D1Database, act: WorkspaceAction, email: string, staff: string[], now = new Date().toISOString(), id = crypto.randomUUID()): Promise<Outcome> {
  const none: Outcome = { added: [], removed: [] };
  switch (act.action) {
    case "set_client": {
      // Vardil's own addresses are staff, never a client's sign-in.
      const ours = act.emails.find((e) => isStaff(e, staff));
      if (ours) return { ...none, refused: `${ours} is a Vardil address. Staff sign in to Vardil HQ, not to a client.` };
      const firmId = act.id ?? id;
      if (act.id) {
        const exists = await db.prepare("SELECT 1 AS ok FROM firms WHERE id = ?1").bind(act.id).first();
        if (!exists) return { ...none, refused: "That client is no longer there. Reload the page." };
      }
      // One email belongs to one client, so it always lands in the same demo.
      if (act.emails.length) {
        const marks = act.emails.map((_, i) => `?${i + 2}`).join(", ");
        const taken = await db.prepare(`SELECT e.email, f.name FROM firm_emails e JOIN firms f ON f.id = e.firm_id WHERE e.firm_id != ?1 AND e.email IN (${marks})`).bind(firmId, ...act.emails).first<{ email: string; name: string }>();
        if (taken) return { ...none, refused: `${taken.email} already signs in to ${taken.name}. Take it off there first.` };
      }
      const before = (await db.prepare("SELECT email FROM firm_emails WHERE firm_id = ?1").bind(firmId).all<{ email: string }>()).results?.map((r) => r.email) ?? [];
      await db.batch([
        db
          .prepare("INSERT INTO firms (id, name, apps, automations, look, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ON CONFLICT(id) DO UPDATE SET name = ?2, apps = ?3, automations = ?4, look = ?5, updated_at = ?6, updated_by = ?7")
          .bind(firmId, act.name, JSON.stringify(act.apps), act.automations ? 1 : 0, JSON.stringify(act.look), now, email),
        db.prepare("DELETE FROM firm_emails WHERE firm_id = ?1").bind(firmId),
        ...act.emails.map((e) => db.prepare("INSERT INTO firm_emails (email, firm_id) VALUES (?1, ?2)").bind(e, firmId)),
      ]);
      return { id: firmId, added: act.emails.filter((e) => !before.includes(e)), removed: before.filter((e) => !act.emails.includes(e)) };
    }
    case "delete_client": {
      const before = (await db.prepare("SELECT email FROM firm_emails WHERE firm_id = ?1").bind(act.id).all<{ email: string }>()).results?.map((r) => r.email) ?? [];
      await db.batch([db.prepare("DELETE FROM firm_emails WHERE firm_id = ?1").bind(act.id), db.prepare("DELETE FROM firms WHERE id = ?1").bind(act.id)]);
      return { added: [], removed: before };
    }
    case "set_logo": {
      const res = await db.prepare("UPDATE firms SET logo = ?2, logo_at = ?3, updated_at = ?4, updated_by = ?5 WHERE id = ?1").bind(act.id, act.logo, act.logo ? now : null, now, email).run();
      return res.meta.changes ? none : { ...none, refused: "That client is no longer there. Reload the page." };
    }
    case "sync_cloudflare":
      return none;
    case "announce":
      await db.prepare("INSERT INTO announcements (id, title, body, at, by) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, act.title, act.body, now, email).run();
      return none;
    case "remove_announcement":
      await db.prepare("DELETE FROM announcements WHERE id = ?1").bind(act.id).run();
      return none;
    case "handle_request":
      await db.prepare("UPDATE app_requests SET handled_at = ?2, handled_by = ?3 WHERE id = ?1").bind(act.id, now, email).run();
      return none;
    case "ask_app": {
      // One open request per person and app is enough: asking again does not add another row.
      const open = await db.prepare("SELECT id FROM app_requests WHERE email = ?1 AND app = ?2 AND handled_at IS NULL").bind(email, act.app).first<{ id: string }>();
      if (!open) await db.prepare("INSERT INTO app_requests (id, email, firm, app, at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, email, act.firm, act.app, now).run();
      return none;
    }
  }
}
