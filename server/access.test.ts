import { beforeEach, describe, expect, it } from "vitest";
import { accessToken, resetKeyCache, verifyAccessToken } from "./access";

const TEAM = "vardil.cloudflareaccess.com";
const AUD = "aud-demo";
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { pair, jwk };
}

async function sign(privateKey: CryptoKey, kid: string, payload: Record<string, unknown>) {
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
}

const now = Date.parse("2026-11-15T12:00:00Z");
const good = { iss: `https://${TEAM}`, aud: [AUD], email: "Mary@Firm.ie", sub: "abc", exp: now / 1000 + 600, iat: now / 1000 - 60 };

describe("Cloudflare Access token check", () => {
  let k: Awaited<ReturnType<typeof keyPair>>;
  let fetches = 0;
  const certs = (jwks: JsonWebKey[]) => (async () => {
    fetches++;
    return new Response(JSON.stringify({ keys: jwks }), { headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;

  beforeEach(async () => {
    resetKeyCache();
    fetches = 0;
    k = await keyPair();
  });

  const opts = () => ({ teamDomain: TEAM, audiences: [AUD, "aud-pages"], fetchImpl: certs([{ ...k.jwk, kid: "k1" } as JsonWebKey]), now });

  it("accepts a token signed by the team's key for our application, and lower-cases the email", async () => {
    const t = await sign(k.pair.privateKey, "k1", good);
    expect(await verifyAccessToken(t, opts())).toEqual({ email: "mary@firm.ie", sub: "abc" });
  });

  it("accepts a single audience given as a string", async () => {
    expect(await verifyAccessToken(await sign(k.pair.privateKey, "k1", { ...good, aud: "aud-pages" }), opts())).not.toBeNull();
  });

  it("refuses another application's token", async () => {
    expect(await verifyAccessToken(await sign(k.pair.privateKey, "k1", { ...good, aud: ["somebody-else"] }), opts())).toBeNull();
  });

  it("refuses another team's token", async () => {
    expect(await verifyAccessToken(await sign(k.pair.privateKey, "k1", { ...good, iss: "https://evil.cloudflareaccess.com" }), opts())).toBeNull();
  });

  it("refuses an expired token", async () => {
    expect(await verifyAccessToken(await sign(k.pair.privateKey, "k1", { ...good, exp: now / 1000 - 1 }), opts())).toBeNull();
  });

  it("refuses a token signed by a different key", async () => {
    const other = await keyPair();
    expect(await verifyAccessToken(await sign(other.pair.privateKey, "k1", good), opts())).toBeNull();
  });

  it("refuses a token whose payload was changed after signing", async () => {
    const t = await sign(k.pair.privateKey, "k1", good);
    const [h, , s] = t.split(".");
    expect(await verifyAccessToken(`${h}.${enc({ ...good, email: "boss@vardil.com" })}.${s}`, opts())).toBeNull();
  });

  it("refuses a token with no email, an unsigned token and rubbish", async () => {
    expect(await verifyAccessToken(await sign(k.pair.privateKey, "k1", { ...good, email: undefined }), opts())).toBeNull();
    expect(await verifyAccessToken(`${enc({ alg: "none" })}.${enc(good)}.`, opts())).toBeNull();
    expect(await verifyAccessToken("not-a-token", opts())).toBeNull();
    expect(await verifyAccessToken(null, opts())).toBeNull();
  });

  it("fetches the keys once, and again only when a token names a key it has not seen", async () => {
    const o = opts();
    await verifyAccessToken(await sign(k.pair.privateKey, "k1", good), o);
    await verifyAccessToken(await sign(k.pair.privateKey, "k1", good), o);
    expect(fetches).toBe(1);
    await verifyAccessToken(await sign(k.pair.privateKey, "k2", good), { ...o, now: now + 5 * 60 * 1000 });
    expect(fetches).toBe(2);
  });

  it("fetches again for an unknown key at most once a minute", async () => {
    const o = opts();
    await verifyAccessToken(await sign(k.pair.privateKey, "k1", good), o);
    expect(fetches).toBe(1);
    // Made-up key ids straight after the first fetch: no new fetch inside the minute.
    for (const kid of ["x1", "x2", "x3"]) await verifyAccessToken(await sign(k.pair.privateKey, kid, good), o);
    expect(fetches).toBe(1);
    await verifyAccessToken(await sign(k.pair.privateKey, "x4", good), { ...o, now: now + 61 * 1000 });
    expect(fetches).toBe(2);
  });

  it("reads the token from the Access header, or from its cookie", () => {
    expect(accessToken(new Request("https://x/", { headers: { "cf-access-jwt-assertion": "a.b.c" } }))).toBe("a.b.c");
    expect(accessToken(new Request("https://x/", { headers: { cookie: "theme=dark; CF_Authorization=d.e.f; x=1" } }))).toBe("d.e.f");
    expect(accessToken(new Request("https://x/"))).toBeNull();
  });
});
