/**
 * Vardil's own records in the D1 database bound as DB (19 Nov; firms with named emails and their
 * look since 20 Nov): which apps each client has, who signs in to it, how it looks,
 * the announcements every client sees on Admin, Vardil Works, and the "Ask about this app"
 * requests clients send. Only Vardil staff change the first two; the rules for what may be
 * sent are in src/lib/apps.ts (`readWorkspaceAction`).
 */
import { DEMO_DAYS, irishToday } from "../src/lib/apps";
import { type Announcement, type AppKey, type AppRequest, type ClientConfig, type ClientPerson, type DemoLevel, type DemoStage, demoLive, isAppKey, isLevel, KEEP_ACTIVITY_DAYS, type OwnConfig, type PersonActivity, readLevels, readLook, shiftDay, starterLook, type WorkspaceAction } from "../src/lib/apps";

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
    stage TEXT NOT NULL DEFAULT 'active',
    ends_on TEXT,
    swept_at TEXT,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS firm_emails (
    email TEXT PRIMARY KEY,
    firm_id TEXT NOT NULL,
    levels TEXT NOT NULL DEFAULT '[]'
  )`,
  // 20 Nov (decision 210): what each prospect did, one row a person a day.
  `CREATE TABLE IF NOT EXISTS demo_days (
    email TEXT NOT NULL,
    day TEXT NOT NULL,
    firm_id TEXT NOT NULL,
    first_at TEXT NOT NULL,
    last_at TEXT NOT NULL,
    visits INTEGER NOT NULL DEFAULT 1,
    apps TEXT NOT NULL DEFAULT '[]',
    levels TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (email, day)
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

type FirmRow = { id: string; name: string; apps: string; automations: number; look: string; logo_at: string | null; stage: string; ends_on: string | null; updated_at: string; updated_by: string };
type EmailRow = { email: string; firm_id: string; levels: string };

const parse = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};
const stageOf = (raw: string): DemoStage => (raw === "won" || raw === "lost" ? raw : "active");

/** Where a firm's logo is served from: changes whenever the logo does, so browsers never show an old one. */
export const logoUrlOf = (id: string, at: string | null) => (at ? `/api/logo/${id}?v=${encodeURIComponent(at)}` : "");

const toClient = (r: FirmRow, people: ClientPerson[]): ClientConfig => {
  const appsRaw = parse(r.apps);
  const apps = Array.isArray(appsRaw) ? appsRaw.filter(isAppKey) : [];
  // A row that cannot be read keeps the firm's name and Vardil's colour rather than failing the page.
  const look = readLook(parse(r.look)) ?? starterLook(r.name);
  return { id: r.id, name: r.name, people, apps, automations: r.automations === 1, look, logoUrl: logoUrlOf(r.id, r.logo_at), stage: stageOf(r.stage), endsOn: r.ends_on, updatedAt: r.updated_at, updatedBy: r.updated_by };
};
const toPerson = (e: EmailRow): ClientPerson => ({ email: e.email, levels: readLevels(parse(e.levels)) });

const FIRM_COLUMNS = "id, name, apps, automations, look, logo_at, stage, ends_on, updated_at, updated_by";

type DayRow = { email: string; day: string; first_at: string; last_at: string; visits: number; apps: string; levels: string };

/** What each person did, summed over the days kept. */
export function activityOf(emails: string[], rows: DayRow[]): PersonActivity[] {
  return emails.map((email) => {
    const mine = rows.filter((r) => r.email === email);
    const apps: Partial<Record<AppKey, number>> = {};
    const levels = new Set<DemoLevel>();
    for (const r of mine) {
      for (const a of new Set((parse(r.apps) as unknown[] | null) ?? [])) if (isAppKey(a)) apps[a] = (apps[a] ?? 0) + 1;
      for (const l of (parse(r.levels) as unknown[] | null) ?? []) if (isLevel(l)) levels.add(l);
    }
    const firsts = mine.map((r) => r.first_at).sort();
    const lasts = mine.map((r) => r.last_at).sort();
    return { email, firstAt: firsts[0] ?? null, lastAt: lasts[lasts.length - 1] ?? null, days: mine.length, visits: mine.reduce((n, r) => n + r.visits, 0), apps, levels: [...levels] };
  });
}

export async function listClients(db: D1Database): Promise<ClientConfig[]> {
  const [firms, emails, days] = await Promise.all([
    db.prepare(`SELECT ${FIRM_COLUMNS} FROM firms ORDER BY name`).all<FirmRow>(),
    db.prepare("SELECT email, firm_id, levels FROM firm_emails ORDER BY email").all<EmailRow>(),
    db.prepare("SELECT email, day, firm_id, first_at, last_at, visits, apps, levels FROM demo_days").all<DayRow & { firm_id: string }>(),
  ]);
  const by = new Map<string, ClientPerson[]>();
  for (const e of emails.results ?? []) by.set(e.firm_id, [...(by.get(e.firm_id) ?? []), toPerson(e)]);
  const dayRows = days.results ?? [];
  return (firms.results ?? []).map((r) => {
    const people = by.get(r.id) ?? [];
    const c = toClient(r, people);
    // Activity is the firm's own: someone who has left the list keeps their history under the firm.
    const mine = dayRows.filter((d) => d.firm_id === r.id);
    const all = [...new Set([...people.map((p) => p.email), ...mine.map((d) => d.email)])];
    return { ...c, activity: activityOf(all, mine) };
  });
}

/** The firm a signed-in email belongs to, as that client is sent it, and whether its demo is open today. */
export async function ownClient(db: D1Database, email: string, today: string): Promise<{ config: OwnConfig; live: boolean } | null> {
  const cols = FIRM_COLUMNS.split(", ").map((c) => `f.${c}`).join(", ");
  const row = await db.prepare(`SELECT ${cols}, e.levels AS person_levels FROM firm_emails e JOIN firms f ON f.id = e.firm_id WHERE e.email = ?1`).bind(email.toLowerCase()).first<FirmRow & { person_levels: string }>();
  if (!row) return null;
  const { id, name, apps, automations, look, logoUrl, stage, endsOn } = toClient(row, []);
  return { config: { id, name, apps, automations, look, logoUrl, levels: readLevels(parse(row.person_levels)) }, live: demoLive(stage, endsOn, today) };
}

/** Every email that may sign in as a client today, for Cloudflare's list: only demos still open. */
export async function allClientEmails(db: D1Database, today: string): Promise<string[]> {
  const res = await db
    .prepare("SELECT e.email FROM firm_emails e JOIN firms f ON f.id = e.firm_id WHERE f.stage = 'active' AND (f.ends_on IS NULL OR f.ends_on >= ?1) ORDER BY e.email")
    .bind(today)
    .all<{ email: string }>();
  return (res.results ?? []).map((r) => r.email);
}

/**
 * Demos whose end date has passed since anyone last looked (there is no clock on Pages, so this
 * runs whenever the server is asked): marked as dealt with, and their emails returned so the
 * caller takes them off Cloudflare and signs them out. Old activity goes at the same time.
 */
export async function sweepEnded(db: D1Database, today: string, now: string): Promise<string[]> {
  const due = await db.prepare("SELECT id FROM firms WHERE stage = 'active' AND ends_on IS NOT NULL AND ends_on < ?1 AND swept_at IS NULL").bind(today).all<{ id: string }>();
  const ids = (due.results ?? []).map((r) => r.id);
  await db.prepare("DELETE FROM demo_days WHERE day < ?1").bind(shiftDay(today, -KEEP_ACTIVITY_DAYS)).run();
  if (!ids.length) return [];
  const list = ids.map((_, i) => `?${i + 1}`).join(", ");
  const emails = await db.prepare(`SELECT email FROM firm_emails WHERE firm_id IN (${list})`).bind(...ids).all<{ email: string }>();
  const after = ids.map((_, i) => `?${i + 2}`).join(", ");
  await db.prepare(`UPDATE firms SET swept_at = ?1 WHERE id IN (${after})`).bind(now, ...ids).run();
  return (emails.results ?? []).map((r) => r.email);
}

/** A person opened their demo. Returns true when it is their first time today (for the email to Vardil). */
export async function recordVisit(db: D1Database, email: string, firmId: string, now: string, today: string): Promise<boolean> {
  const row = await db.prepare("SELECT last_at FROM demo_days WHERE email = ?1 AND day = ?2").bind(email, today).first<{ last_at: string }>();
  if (!row) {
    await db.prepare("INSERT INTO demo_days (email, day, firm_id, first_at, last_at) VALUES (?1, ?2, ?3, ?4, ?4)").bind(email, today, firmId, now).run();
    return true;
  }
  // A gap of 30 minutes or more counts as a new visit; a reload in the middle of one does not.
  const gap = Date.parse(now) - Date.parse(row.last_at);
  await db.prepare(`UPDATE demo_days SET last_at = ?3${gap >= 30 * 60_000 ? ", visits = visits + 1" : ""} WHERE email = ?1 AND day = ?2`).bind(email, today, now).run();
  return false;
}

/** A person opened one of the apps, signed in at a level. */
export async function recordSeen(db: D1Database, email: string, firmId: string, app: AppKey, level: DemoLevel | null, now: string, today: string) {
  const row = await db.prepare("SELECT apps, levels FROM demo_days WHERE email = ?1 AND day = ?2").bind(email, today).first<{ apps: string; levels: string }>();
  if (!row) {
    await db.prepare("INSERT INTO demo_days (email, day, firm_id, first_at, last_at, apps, levels) VALUES (?1, ?2, ?3, ?4, ?4, ?5, ?6)").bind(email, today, firmId, now, JSON.stringify([app]), JSON.stringify(level ? [level] : [])).run();
    return;
  }
  const apps = new Set(((parse(row.apps) as unknown[] | null) ?? []).filter(isAppKey));
  const levels = new Set(((parse(row.levels) as unknown[] | null) ?? []).filter(isLevel));
  apps.add(app);
  if (level) levels.add(level);
  await db.prepare("UPDATE demo_days SET apps = ?3, levels = ?4, last_at = ?5 WHERE email = ?1 AND day = ?2").bind(email, today, JSON.stringify([...apps]), JSON.stringify([...levels]), now).run();
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

const irishDay = (iso: string) => irishToday(new Date(iso));

/** What a change did: the new client's id, or why it was refused. Who came onto or left Cloudflare's list is worked out by the caller. */
export type Outcome = { id?: string; refused?: string };

/** Carry out one action that has already been read by `readWorkspaceAction` and allowed for this person. */
export async function runAction(db: D1Database, act: WorkspaceAction, email: string, staff: string[], now = new Date().toISOString(), id = crypto.randomUUID()): Promise<Outcome> {
  const none: Outcome = {};
  switch (act.action) {
    case "set_client": {
      // Vardil's own addresses are staff, never a client's sign-in.
      const emails = act.people.map((p) => p.email);
      const ours = emails.find((e) => isStaff(e, staff));
      if (ours) return { ...none, refused: `${ours} is a Vardil address. Staff sign in to Vardil HQ, not to a client.` };
      const firmId = act.id ?? id;
      if (act.id) {
        const exists = await db.prepare("SELECT 1 AS ok FROM firms WHERE id = ?1").bind(act.id).first();
        if (!exists) return { ...none, refused: "That client is no longer there. Reload the page." };
      }
      // One email belongs to one client, so it always lands in the same demo.
      if (emails.length) {
        const marks = emails.map((_, i) => `?${i + 2}`).join(", ");
        const taken = await db.prepare(`SELECT e.email, f.name FROM firm_emails e JOIN firms f ON f.id = e.firm_id WHERE e.firm_id != ?1 AND e.email IN (${marks})`).bind(firmId, ...emails).first<{ email: string; name: string }>();
        if (taken) return { ...none, refused: `${taken.email} already signs in to ${taken.name}. Take it off there first.` };
      }
      // A new demo runs for DEMO_DAYS from today; an existing one keeps its own status and end date.
      await db.batch([
        db
          .prepare("INSERT INTO firms (id, name, apps, automations, look, stage, ends_on, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5, 'active', ?8, ?6, ?7) ON CONFLICT(id) DO UPDATE SET name = ?2, apps = ?3, automations = ?4, look = ?5, updated_at = ?6, updated_by = ?7")
          .bind(firmId, act.name, JSON.stringify(act.apps), act.automations ? 1 : 0, JSON.stringify(act.look), now, email, shiftDay(irishDay(now), DEMO_DAYS)),
        db.prepare("DELETE FROM firm_emails WHERE firm_id = ?1").bind(firmId),
        ...act.people.map((p) => db.prepare("INSERT INTO firm_emails (email, firm_id, levels) VALUES (?1, ?2, ?3)").bind(p.email, firmId, JSON.stringify(p.levels))),
      ]);
      return { id: firmId };
    }
    case "delete_client": {
      await db.batch([db.prepare("DELETE FROM firm_emails WHERE firm_id = ?1").bind(act.id), db.prepare("DELETE FROM demo_days WHERE firm_id = ?1").bind(act.id), db.prepare("DELETE FROM firms WHERE id = ?1").bind(act.id)]);
      return none;
    }
    case "set_stage":
    case "set_end": {
      // The mark that a passed end date has been dealt with: set when this change itself closes the
      // demo (the caller signs its people out at once), cleared otherwise, so a later end is caught.
      const today = irishDay(now);
      const res =
        act.action === "set_stage"
          ? await db.prepare("UPDATE firms SET stage = ?2, swept_at = CASE WHEN ends_on IS NOT NULL AND ends_on < ?5 THEN ?3 ELSE NULL END, updated_at = ?3, updated_by = ?4 WHERE id = ?1").bind(act.id, act.stage, now, email, today).run()
          : await db.prepare("UPDATE firms SET ends_on = ?2, swept_at = CASE WHEN ?2 IS NOT NULL AND ?2 < ?5 THEN ?3 ELSE NULL END, updated_at = ?3, updated_by = ?4 WHERE id = ?1").bind(act.id, act.endsOn, now, email, today).run();
      return res.meta.changes ? none : { refused: "That client is no longer there. Reload the page." };
    }
    case "visit":
    case "seen":
      // Recorded by the caller, which knows the person's firm.
      return none;
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
