/**
 * Vardil's own records in the D1 database bound as DB (19 Nov): which apps each client has,
 * the announcements every client sees on Admin, Vardil Works, and the "Ask about this app"
 * requests clients send. Only Vardil staff change the first two; the rules for what may be
 * sent are in src/lib/apps.ts (`readWorkspaceAction`).
 */
import { type Announcement, type AppKey, type AppRequest, type ClientConfig, isAppKey, type WorkspaceAction } from "../src/lib/apps";

export const WORKSPACE_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS clients (
    key TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    apps TEXT NOT NULL,
    automations INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
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

type ClientRow = { key: string; name: string; apps: string; automations: number; updated_at: string; updated_by: string };
const toClient = (r: ClientRow): ClientConfig => {
  let apps: AppKey[] = [];
  try {
    const parsed: unknown = JSON.parse(r.apps);
    if (Array.isArray(parsed)) apps = parsed.filter(isAppKey);
  } catch {
    /* a broken row reads as no apps beyond the ones always on */
  }
  return { key: r.key, name: r.name, apps, automations: r.automations === 1, updatedAt: r.updated_at, updatedBy: r.updated_by };
};

export async function listClients(db: D1Database): Promise<ClientConfig[]> {
  const res = await db.prepare("SELECT * FROM clients ORDER BY name").all<ClientRow>();
  return (res.results ?? []).map(toClient);
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

/** Carry out one action that has already been read by `readWorkspaceAction` and allowed for this person. */
export async function runAction(db: D1Database, act: WorkspaceAction, email: string, now = new Date().toISOString(), id = crypto.randomUUID()) {
  switch (act.action) {
    case "set_client":
      await db
        .prepare("INSERT INTO clients (key, name, apps, automations, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(key) DO UPDATE SET name = ?2, apps = ?3, automations = ?4, updated_at = ?5, updated_by = ?6")
        .bind(act.key, act.name, JSON.stringify(act.apps), act.automations ? 1 : 0, now, email)
        .run();
      return;
    case "delete_client":
      await db.prepare("DELETE FROM clients WHERE key = ?1").bind(act.key).run();
      return;
    case "announce":
      await db.prepare("INSERT INTO announcements (id, title, body, at, by) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, act.title, act.body, now, email).run();
      return;
    case "remove_announcement":
      await db.prepare("DELETE FROM announcements WHERE id = ?1").bind(act.id).run();
      return;
    case "handle_request":
      await db.prepare("UPDATE app_requests SET handled_at = ?2, handled_by = ?3 WHERE id = ?1").bind(act.id, now, email).run();
      return;
    case "ask_app": {
      // One open request per person and app is enough: asking again does not add another row.
      const open = await db.prepare("SELECT id FROM app_requests WHERE email = ?1 AND app = ?2 AND handled_at IS NULL").bind(email, act.app).first<{ id: string }>();
      if (!open) await db.prepare("INSERT INTO app_requests (id, email, firm, app, at) VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, email, act.firm, act.app, now).run();
      return;
    }
  }
}
