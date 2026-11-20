import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudflareLinked, groupRules, NOBODY, revokeSignIns, syncAccessGroup } from "./cloudflare";

const ENV = { CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acc", CF_ACCESS_GROUP_ID: "grp", CF_API_BASE: "https://cf.test/v4" };

afterEach(() => vi.unstubAllGlobals());

function fakeCloudflare(reply: (method: string, url: string, body: unknown) => [number, unknown]) {
  const calls: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init.method ?? "GET", url, body, auth: new Headers(init.headers).get("authorization") });
    const [status, json] = reply(init.method ?? "GET", url, body);
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  });
  return calls;
}

describe("Cloudflare's sign-in list, kept by Vardil HQ", () => {
  it("is linked only with all three settings", () => {
    expect(cloudflareLinked(ENV)).toBe(true);
    expect(cloudflareLinked({ ...ENV, CF_ACCESS_GROUP_ID: "" })).toBe(false);
  });

  it("lists each email once, in order, and an empty list as one address that cannot sign in", () => {
    expect(groupRules(["b@x.ie", "A@x.ie", "b@x.ie"])).toEqual([{ email: { email: "a@x.ie" } }, { email: { email: "b@x.ie" } }]);
    expect(groupRules([])).toEqual([{ email: { email: NOBODY } }]);
  });

  it("writes the whole group again, keeping its own name", async () => {
    const calls = fakeCloudflare((m) => (m === "GET" ? [200, { success: true, result: { name: "Demo clients" } }] : [200, { success: true, result: {} }]));
    expect(await syncAccessGroup(ENV, ["pat@oldstone.ie"])).toEqual({ ok: true });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["GET https://cf.test/v4/accounts/acc/access/groups/grp", "PUT https://cf.test/v4/accounts/acc/access/groups/grp"]);
    expect(calls[1]!.body).toEqual({ name: "Demo clients", include: [{ email: { email: "pat@oldstone.ie" } }] });
    expect(calls.every((c) => c.auth === "Bearer tok")).toBe(true);
  });

  it("says plainly when Cloudflare refuses the key or answers with an error", async () => {
    fakeCloudflare(() => [403, { success: false, errors: [{ message: "Authentication error" }] }]);
    const r = await syncAccessGroup(ENV, []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toMatch(/refused the key/);
    fakeCloudflare((m) => (m === "GET" ? [200, { success: true, result: { name: "g" } }] : [400, { success: false, errors: [{ message: "bad include" }] }]));
    const r2 = await syncAccessGroup(ENV, ["a@b.ie"]);
    expect(!r2.ok && r2.message).toMatch(/400: bad include/);
  });

  it("signs out each person taken off, and returns any it could not", async () => {
    const calls = fakeCloudflare((_m, _u, body) => ((body as { email: string }).email === "stuck@x.ie" ? [500, { success: false }] : [200, { success: true, result: true }]));
    expect(await revokeSignIns(ENV, ["gone@x.ie", "stuck@x.ie"])).toEqual(["stuck@x.ie"]);
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://cf.test/v4/accounts/acc/access/organizations/revoke_user", body: { email: "gone@x.ie" } });
  });

  it("does nothing on Cloudflare when it is not linked", async () => {
    const calls = fakeCloudflare(() => [200, {}]);
    expect((await syncAccessGroup({}, ["a@b.ie"])).ok).toBe(false);
    expect(await revokeSignIns({}, ["a@b.ie"])).toEqual(["a@b.ie"]);
    expect(calls).toEqual([]);
  });
});
