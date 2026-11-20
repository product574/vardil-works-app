/**
 * Who is asking: checks the sign-in token Cloudflare Access puts on every request.
 *
 * Cloudflare Access signs a token (a JWT) for each visitor who has entered their emailed code,
 * and sends it to the site in the Cf-Access-Jwt-Assertion header (and the CF_Authorization
 * cookie). The token is checked here against Cloudflare's published keys for the Vardil team
 * and the audience tags of our own two Access applications, so a request that did not come
 * through Access, or came through somebody else's, is refused. The plain email header is never
 * trusted: it could be faked on any address Access does not cover.
 */

/** Our Zero Trust team and the audience tags of the two Access applications (see CLAUDE.md). */
export const ACCESS_DEFAULTS = {
  teamDomain: "vardil.cloudflareaccess.com",
  audiences: [
    "1bc0fc6ce9e100d394e2a5ad9a8a841c8f5170b213cb81843862b5a11fcd092f", // Construction demo (demo.vardil.com)
    "1ef3816b26ed70fd31c25afc44318d8cd784856083bda382fd1fdabb6664b8bd", // the pages.dev addresses
  ],
};

export type AccessUser = { email: string; sub: string };
type Jwk = { kid?: string; kty?: string; n?: string; e?: string };

const bytes = (b64url: string) => {
  let s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const json = (b64url: string) => JSON.parse(new TextDecoder().decode(bytes(b64url))) as Record<string, unknown>;

let keyCache: { url: string; at: number; keys: Jwk[] } | null = null;

async function keys(url: string, fetchImpl: typeof fetch, now: number, fresh = false): Promise<Jwk[]> {
  const age = keyCache && keyCache.url === url ? now - keyCache.at : Infinity;
  // Kept for an hour. A token naming a key we have not seen fetches them again, but not more
  // than once a minute, so tokens with made-up key ids cannot make us fetch on every request.
  if (age < (fresh ? 60 * 1000 : 60 * 60 * 1000)) return keyCache!.keys;
  const r = await fetchImpl(url);
  if (!r.ok) throw new Error(`Could not fetch the Access keys (${r.status})`);
  const body = (await r.json()) as { keys?: Jwk[] };
  keyCache = { url, at: now, keys: body.keys ?? [] };
  return keyCache.keys;
}

/** For tests: forget the cached keys. */
export function resetKeyCache() {
  keyCache = null;
}

/** The token from the request: the header Access adds, or its cookie. */
export function accessToken(req: Request): string | null {
  const h = req.headers.get("cf-access-jwt-assertion");
  if (h) return h;
  const cookie = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return m?.[1] ?? null;
}

export async function verifyAccessToken(
  token: string | null,
  opts: { teamDomain: string; audiences: string[]; certsUrl?: string; fetchImpl?: typeof fetch; now?: number },
): Promise<AccessUser | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = json(h);
    payload = json(p);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;

  const now = opts.now ?? Date.now();
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = opts.certsUrl ?? `https://${opts.teamDomain}/cdn-cgi/access/certs`;
  let jwk = (await keys(url, fetchImpl, now)).find((k) => k.kid === header.kid);
  // Cloudflare rotates its keys; a key we have not seen yet means fetch them again once.
  if (!jwk) jwk = (await keys(url, fetchImpl, now, true)).find((k) => k.kid === header.kid);
  if (!jwk?.n || !jwk.e) return null;

  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  let good = false;
  try {
    good = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, bytes(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    return null;
  }
  if (!good) return null;

  const secs = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp < secs) return null;
  if (typeof payload.nbf === "number" && payload.nbf > secs + 60) return null;
  if (payload.iss !== `https://${opts.teamDomain}`) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.some((a) => typeof a === "string" && opts.audiences.includes(a))) return null;
  if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
  return { email: payload.email.toLowerCase(), sub: String(payload.sub ?? "") };
}

/**
 * Why a token was refused, for the person signed in to read on /api/workspace (20 Nov): the
 * usual cause on a new Pages project is ACCESS_AUD not naming the Access application in front
 * of it. Read from the token without trusting it, so it only ever describes the visitor's own
 * cookie; nothing here lets anyone in. An application's AUD tag is an identifier, not a secret.
 */
export function refusalReason(token: string | null, opts: { teamDomain: string; audiences: string[]; now?: number }): { why: string; aud?: string[]; iss?: string } {
  if (!token) return { why: "no_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { why: "not_a_token" };
  let payload: Record<string, unknown>;
  try {
    payload = json(parts[1]!);
  } catch {
    return { why: "not_a_token" };
  }
  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (iss !== `https://${opts.teamDomain}`) return { why: "other_team", iss };
  const aud = (Array.isArray(payload.aud) ? payload.aud : [payload.aud]).filter((a): a is string => typeof a === "string");
  if (!aud.some((a) => opts.audiences.includes(a))) return { why: "other_application", aud };
  const secs = Math.floor((opts.now ?? Date.now()) / 1000);
  if (typeof payload.exp === "number" && payload.exp < secs) return { why: "expired" };
  return { why: "signature" };
}
