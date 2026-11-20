/**
 * /api/workspace: Vardil's records for every client (19 Nov; firms with named emails, their look
 * and Cloudflare's sign-in list since 20 Nov).
 *
 * GET  Who is signed in, their own firm (apps and look; null when Vardil has set nothing for them,
 *      so the demo shows everything as ABC Construction), and the announcements. Vardil staff also
 *      get every client, the "Ask about this app" requests, and how Cloudflare's list stands.
 * POST One action (src/lib/apps.ts, `readWorkspaceAction`). Changing clients, logos, announcements
 *      and requests is for Vardil staff only, checked here from the signed Cloudflare Access token,
 *      never from anything the page says. Asking about an app is open to every signed-in client.
 *      After any change to who signs in, Cloudflare's group is written again (server/cloudflare.ts).
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../../server/access";
import { type CloudflareEnv, cloudflareLinked, revokeSignIns, syncAccessGroup } from "../../server/cloudflare";
import { requestGate } from "../../server/validate";
import { allClientEmails, ensureWorkspaceSchema, getSetting, isStaff, listAnnouncements, listClients, listRequests, ownClient, runAction, setSetting, staffDomains } from "../../server/workspace";
import { type CloudflareResult, type CloudflareState, LOGO_MAX, readWorkspaceAction, STAFF_ACTIONS } from "../../src/lib/apps";

export interface Env extends CloudflareEnv {
  DB?: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Comma separated. Default vardil.com. */
  STAFF_DOMAINS?: string;
  ACCESS_CERTS_URL?: string;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function who(request: Request, env: Env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  return user ? { email: user.email.toLowerCase(), staff: isStaff(user.email, staffDomains(env.STAFF_DOMAINS)) } : null;
}

async function cloudflareState(db: D1Database, env: Env): Promise<CloudflareState> {
  const [syncedAt, error, emails] = await Promise.all([getSetting(db, "cf_synced_at"), getSetting(db, "cf_error"), allClientEmails(db)]);
  return { linked: cloudflareLinked(env), syncedAt, error, count: emails.length };
}

/** Write Cloudflare's list from the database, sign out anyone who left it, and remember how it went. */
async function updateCloudflare(db: D1Database, env: Env, removed: string[]): Promise<CloudflareResult> {
  if (!cloudflareLinked(env)) return { linked: false, ok: false, message: "Cloudflare is not linked yet, so its list was not changed. Add or take off these emails in Cloudflare by hand." };
  const emails = await allClientEmails(db);
  const sync = await syncAccessGroup(env, emails);
  if (!sync.ok) {
    await setSetting(db, "cf_error", sync.message);
    return { linked: true, ok: false, message: `Saved here, but Cloudflare's list was not updated: ${sync.message} Press "Update Cloudflare now" to try again.` };
  }
  await Promise.all([setSetting(db, "cf_synced_at", new Date().toISOString()), setSetting(db, "cf_error", null)]);
  // Only people now off the list altogether are signed out: someone moved to another client keeps their sign-in.
  const gone = removed.filter((e) => !emails.includes(e));
  const failed = await revokeSignIns(env, gone);
  const signedOut = gone.filter((e) => !failed.includes(e));
  return {
    linked: true,
    ok: failed.length === 0,
    message: failed.length ? `Cloudflare's list is updated, but ${failed.join(", ")} could not be signed out. Their sign-in runs out within a week.` : "Cloudflare's list is updated.",
    signedOut,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const me = await who(request, env);
  if (!me) return json(401, { error: "signin" });
  if (!env.DB) return json(503, { error: "not_configured" });
  await ensureWorkspaceSchema(env.DB);
  const [config, announcements] = await Promise.all([me.staff ? null : ownClient(env.DB, me.email), listAnnouncements(env.DB)]);
  return json(200, {
    me,
    config,
    announcements,
    ...(me.staff ? { clients: await listClients(env.DB), requests: await listRequests(env.DB), cloudflare: await cloudflareState(env.DB, env) } : {}),
  });
};

/** A logo is the one large thing sent; everything else is small. */
const BODY_MAX = LOGO_MAX + 2_000;
const SMALL_MAX = 24_000;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requestGate(request.url, request.headers, BODY_MAX);
  if (gate) return json(gate.status, { error: gate.error });
  const me = await who(request, env);
  if (!me) return json(401, { error: "signin" });
  if (!env.DB) return json(503, { error: "not_configured" });
  const body = await request.text();
  if (body.length > BODY_MAX) return json(413, { error: "too_big" });
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json(400, { error: "bad_request" });
  }
  const read = readWorkspaceAction(raw);
  if (!read.ok) return json(400, { error: "bad_request", reason: read.reason });
  if (read.act.action !== "set_logo" && body.length > SMALL_MAX) return json(413, { error: "too_big" });
  if (STAFF_ACTIONS.has(read.act.action) && !me.staff) return json(403, { error: "staff_only" });
  await ensureWorkspaceSchema(env.DB);
  const out = await runAction(env.DB, read.act, me.email, staffDomains(env.STAFF_DOMAINS));
  if (out.refused) return json(409, { error: "refused", message: out.refused });
  const touchesList = read.act.action === "set_client" || read.act.action === "delete_client" || read.act.action === "sync_cloudflare";
  const cloudflare = touchesList && (read.act.action === "sync_cloudflare" || out.added.length || out.removed.length) ? await updateCloudflare(env.DB, env, out.removed) : null;
  return json(200, { ok: true, ...(out.id ? { id: out.id } : {}), ...(cloudflare ? { cloudflare } : {}) });
};
