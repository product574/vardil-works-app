/**
 * /api/data: the shared firm (stage 0 of the real web app, 21 Nov 2026). Every screen and phone
 * reads and writes the same records here, so a repair sent from a phone reaches the office.
 * The rules are in server/shared.ts; this file only finds who is signed in (Cloudflare Access,
 * from the signed token, never from anything the page says) and which store to use.
 *
 * Settings on the Pages project: SUPABASE_URL (plain), SUPABASE_SECRET_KEY (secret: the project's sb_secret_ key),
 * DEMO_FIRM (plain, default "abc-demo"), plus the Access ones the other functions use.
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../../server/access";
import { handleData, supabaseStore, type SupabaseEnv } from "../../server/shared";
import { isStaff, staffDomains } from "../../server/workspace";

export interface Env extends SupabaseEnv {
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_CERTS_URL?: string;
  /** Comma separated. Default vardil.com. */
  STAFF_DOMAINS?: string;
  /** The one shared demo firm everyone signs in to. */
  DEMO_FIRM?: string;
}

async function caller(request: Request, env: Env) {
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  return user ? { email: user.email.toLowerCase(), staff: isStaff(user.email, staffDomains(env.STAFF_DOMAINS)) } : null;
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) =>
  handleData(request, { caller: await caller(request, env), store: supabaseStore(env), firm: env.DEMO_FIRM || "abc-demo" });
