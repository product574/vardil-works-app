// Makes a throwaway signing key and Cloudflare Access style tokens for fn_check.py.
// Prints JSON: { jwks, tokens: { admin, other, wrongAud, expired } }.
const team = process.argv[2] ?? "test.cloudflareaccess.com";
const aud = process.argv[3] ?? "test-aud";
const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const sign = async (payload) => {
  const head = enc({ alg: "RS256", kid: "test-key-1", typ: "JWT" });
  const body = enc(payload);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
};
const now = Math.floor(Date.now() / 1000);
const base = { iss: `https://${team}`, aud: [aud], iat: now, exp: now + 3600, sub: "user-1", type: "app" };
console.log(JSON.stringify({
  jwks: { keys: [{ kid: "test-key-1", kty: "RSA", alg: "RS256", use: "sig", n: jwk.n, e: jwk.e }] },
  tokens: {
    admin: await sign({ ...base, email: "admin@vardil.example" }),
    other: await sign({ ...base, email: "prospect@firm.example", sub: "user-2" }),
    browser: await sign({ ...base, email: "browser@firm.example", sub: "user-3" }),
    wrongAud: await sign({ ...base, aud: ["another-app"], email: "admin@vardil.example" }),
    expired: await sign({ ...base, exp: now - 10, email: "admin@vardil.example" }),
  },
}));
