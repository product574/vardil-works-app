/**
 * /api/workspace: Vardil's records for every client (19 Nov).
 *
 * GET  Who is signed in, the apps their firm has (null when Vardil has not set any, so the demo
 *      shows everything), and the announcements. Vardil staff also get every client's setting
 *      and the "Ask about this app" requests.
 * POST One action (src/lib/apps.ts, `readWorkspaceAction`). Changing clients, announcements and
 *      requests is for Vardil staff only, checked here from the signed Cloudflare Access token,
 *      never from anything the page says. Asking about an app is open to every signed-in client.
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../../server/access";
import { requestGate } from "../../server/validate";
import { ensureWorkspaceSchema, isStaff, listAnnouncements, listClients, listRequests, runAction, staffDomains } from "../../server/workspace";
import { configFor, readWorkspaceAction, STAFF_ACTIONS } from "../../src/lib/apps";

export interface Env {
  DB?: D1Database;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Comma separated. Default vardil.com. */
  STAFF_DOMAINS?: string;
  ACCESS_CERTS_URL?: string;
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

async function who(request: Request, env: Env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  return user ? { email: user.email.toLowerCase(), staff: isStaff(user.email, staffDomains(env.STAFF_DOMAINS)) } : null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const me = await who(request, env);
  if (!me) return json(401, { error: "signin" });
  if (!env.DB) return json(503, { error: "not_configured" });
  await ensureWorkspaceSchema(env.DB);
  const [clients, announcements] = await Promise.all([listClients(env.DB), listAnnouncements(env.DB)]);
  const mine = configFor(me.email, clients);
  return json(200, {
    me,
    config: mine ? { name: mine.name, apps: mine.apps, automations: mine.automations } : null,
    announcements,
    ...(me.staff ? { clients, requests: await listRequests(env.DB) } : {}),
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const gate = requestGate(request.url, request.headers, 8_000);
  if (gate) return json(gate.status, { error: gate.error });
  const me = await who(request, env);
  if (!me) return json(401, { error: "signin" });
  if (!env.DB) return json(503, { error: "not_configured" });
  const body = await request.text();
  if (body.length > 8_000) return json(413, { error: "too_big" });
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json(400, { error: "bad_request" });
  }
  const read = readWorkspaceAction(raw);
  if (!read.ok) return json(400, { error: "bad_request", reason: read.reason });
  if (STAFF_ACTIONS.has(read.act.action) && !me.staff) return json(403, { error: "staff_only" });
  await ensureWorkspaceSchema(env.DB);
  await runAction(env.DB, read.act, me.email);
  return json(200, { ok: true });
};
