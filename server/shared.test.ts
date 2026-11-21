import { describe, expect, it } from "vitest";
import type { RecordChange, StoredRecord } from "../src/lib/sync-records";
import { DATA_LIMITS, handleData, readChanges, supabaseStore, type SharedStore, type Since } from "./shared";

const ORIGIN = "https://app.vardil.com";
const FIRM = "abc-demo";
const staff = { email: "oisin@vardil.com", staff: true };
const tester = { email: "prospect@firm.ie", staff: false };

/** The database's rules (supabase/migrations) kept in memory, to test the request around them. */
function memoryStore(): SharedStore & { rows: Map<string, { r: RecordChange; v: number; by: string }>; firm: { version: number; reset: number } | null } {
  const rows = new Map<string, { r: RecordChange; v: number; by: string }>();
  const s = {
    rows,
    firm: null as { version: number; reset: number } | null,
    async exists() {
      return s.firm !== null;
    },
    async since(_f: string, since: number): Promise<Since | null> {
      if (!s.firm) return null;
      const whole = since <= 0 || since < s.firm.reset || since > s.firm.version;
      const records = [...rows.values()].filter(({ r, v }) => (whole ? !("deleted" in r) : v > since)).map(({ r }) => r);
      return { version: s.firm.version, full: whole, records };
    },
    async apply(_f: string, changes: RecordChange[], by: string) {
      if (!s.firm) throw new Error("No such firm");
      const v = ++s.firm.version;
      for (const c of changes) rows.set(`${c.list}/${c.id}`, { r: c, v, by });
      return v;
    },
    async reset(_f: string, _n: string, records: StoredRecord[], by: string) {
      s.firm ??= { version: 0, reset: 0 };
      const v = ++s.firm.version;
      s.firm.reset = v;
      rows.clear();
      for (const r of records) rows.set(`${r.list}/${r.id}`, { r, v, by });
      return v;
    },
  };
  return s;
}

const get = (q = "") => new Request(`${ORIGIN}/api/data${q}`);
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/data`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { origin: ORIGIN, "content-type": "application/json", ...headers } });
const send = async (req: Request, caller = tester as typeof tester | null, store: SharedStore | null = memoryStore()) => {
  const r = await handleData(req, { caller, store, firm: FIRM });
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};
const rec = (id: string, pos = 0): StoredRecord => ({ list: "todos", id, pos, data: { id, what: id } });

describe("readChanges", () => {
  it("takes written and deleted records", () => {
    const r = readChanges([rec("a"), { list: "snags", id: "s1", deleted: true }], 10, { deletes: true });
    expect(r).toEqual({ ok: true, changes: [rec("a"), { list: "snags", id: "s1", deleted: true }] });
  });
  it("refuses what is not a batch of records", () => {
    const no = (raw: unknown, deletes = true) => readChanges(raw, 10, { deletes }).ok;
    expect(no({})).toBe(false);
    expect(no([rec("a"), rec("b")].concat(Array(10).fill(rec("c"))))).toBe(false);
    expect(no([{ ...rec("a"), list: "../firms" }])).toBe(false);
    expect(no([{ ...rec("a"), list: "x".repeat(DATA_LIMITS.name + 1) }])).toBe(false);
    expect(no([{ ...rec("a"), id: "" }])).toBe(false);
    expect(no([{ ...rec("a"), id: "x".repeat(DATA_LIMITS.id + 1) }])).toBe(false);
    expect(no([{ ...rec("a"), pos: Number.NaN }])).toBe(false);
    expect(no([{ list: "todos", id: "a", pos: 0 }])).toBe(false);
    expect(no([{ list: "todos", id: "a", deleted: true }], false)).toBe(false);
  });
});

describe("handleData", () => {
  it("wants a sign-in and a store", async () => {
    expect((await send(get(), null)).status).toBe(401);
    expect(await send(get(), tester, null)).toEqual({ status: 503, body: { error: "not_set_up" } });
  });

  it("says when the firm has not been set up, then lets the first person in set it up", async () => {
    const store = memoryStore();
    expect(await send(get("?since=0"), tester, store)).toEqual({ status: 404, body: { error: "no_firm" } });
    expect(await send(post({ kind: "reset", name: "ABC Construction", records: [rec("a"), rec("b", 1)] }), tester, store)).toEqual({ status: 200, body: { version: 1 } });
    const got = await send(get("?since=0"), tester, store);
    expect(got.body).toMatchObject({ version: 1, full: true });
    expect((got.body.records as unknown[]).length).toBe(2);
  });

  it("lets only Vardil staff reset a firm that exists", async () => {
    const store = memoryStore();
    await send(post({ kind: "reset", name: "ABC", records: [rec("a")] }), staff, store);
    expect(await send(post({ kind: "reset", name: "ABC", records: [] }), tester, store)).toEqual({ status: 403, body: { error: "staff_only" } });
    expect((await send(post({ kind: "reset", name: "ABC", records: [] }), staff, store)).status).toBe(200);
    expect(store.rows.size).toBe(0);
  });

  it("writes a batch in the caller's name and hands it to the next screen that asks", async () => {
    const store = memoryStore();
    await send(post({ kind: "reset", name: "ABC", records: [rec("a"), rec("b", 1)] }), staff, store);
    const w = await send(post({ kind: "changes", changes: [rec("c", 2), { list: "todos", id: "a", deleted: true }] }), tester, store);
    expect(w).toEqual({ status: 200, body: { version: 2 } });
    expect(store.rows.get("todos/c")!.by).toBe("prospect@firm.ie");
    const got = await send(get("?since=1"), staff, store);
    expect(got.body).toEqual({ version: 2, full: false, records: [{ list: "todos", id: "a", deleted: true }, rec("c", 2)] });
  });

  it("does nothing with an empty batch", async () => {
    const store = memoryStore();
    await send(post({ kind: "reset", name: "ABC", records: [] }), staff, store);
    expect(await send(post({ kind: "changes", changes: [] }), tester, store)).toEqual({ status: 200, body: { version: null } });
    expect(store.firm!.version).toBe(1);
  });

  it("reads a strange since as the whole firm", async () => {
    const store = memoryStore();
    await send(post({ kind: "reset", name: "ABC", records: [rec("a")] }), staff, store);
    expect((await send(get("?since=abc"), tester, store)).body.full).toBe(true);
    expect((await send(get("?since=-4"), tester, store)).body.full).toBe(true);
  });

  it("turns away other sites, other formats, other methods and bad bodies", async () => {
    expect((await send(post({ kind: "changes", changes: [] }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await send(post({ kind: "changes", changes: [] }, { "content-type": "text/plain" }))).status).toBe(415);
    expect((await send(post("{not json"))).status).toBe(400);
    expect((await send(post([1, 2]))).status).toBe(400);
    expect((await send(post({ kind: "delete_everything" }))).body).toEqual({ error: "kind" });
    expect((await send(post({ kind: "changes", changes: [{ list: "todos" }] }))).body).toMatchObject({ error: "changes" });
    expect((await send(post({ kind: "reset", name: "", records: [] }), staff)).body).toEqual({ error: "name" });
    expect((await send(post({ kind: "reset", name: "ABC", records: [{ list: "todos", id: "a", deleted: true }] }), staff)).body).toMatchObject({ error: "records" });
    expect((await send(new Request(`${ORIGIN}/api/data`, { method: "PUT" }))).status).toBe(405);
  });

  it("answers 502, not the store's words, when the store fails", async () => {
    const broken = { ...memoryStore(), since: async () => { throw new Error("connection refused at 10.0.0.1"); } };
    expect(await send(get(), tester, broken)).toEqual({ status: 502, body: { error: "store" } });
  });
});

describe("supabaseStore", () => {
  type Call = { url: string; init: RequestInit };
  function fake(answer: (c: Call) => Response) {
    const calls: Call[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const c = { url, init };
      calls.push(c);
      return answer(c);
    }) as unknown as typeof fetch;
    return { calls, f };
  }
  const env = { SUPABASE_URL: "https://xyz.supabase.co/", SUPABASE_SECRET_KEY: "sb_secret_test" };

  it("is not set up without both settings, or with an address that is not https", () => {
    expect(supabaseStore({})).toBeNull();
    expect(supabaseStore({ SUPABASE_URL: env.SUPABASE_URL })).toBeNull();
    expect(supabaseStore({ ...env, SUPABASE_URL: "http://xyz.supabase.co" })).toBeNull();
  });

  it("calls the three database functions with the service key", async () => {
    const { calls, f } = fake((c) => new Response(c.url.endsWith("changes_since") ? JSON.stringify({ version: 3, full: false, records: [] }) : "3"));
    const store = supabaseStore(env, f)!;
    expect(await store.since(FIRM, 2)).toEqual({ version: 3, full: false, records: [] });
    expect(await store.apply(FIRM, [rec("a")], "me@x.ie")).toBe(3);
    expect(await store.reset(FIRM, "ABC", [rec("a")], "me@x.ie")).toBe(3);
    expect(calls.map((c) => c.url)).toEqual([
      "https://xyz.supabase.co/rest/v1/rpc/changes_since",
      "https://xyz.supabase.co/rest/v1/rpc/apply_changes",
      "https://xyz.supabase.co/rest/v1/rpc/reset_firm",
    ]);
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.apikey).toBe("sb_secret_test");
    expect(h.authorization).toBeUndefined();
    expect(JSON.parse(calls[1].init.body as string)).toEqual({ p_firm: FIRM, p_changes: [rec("a")], p_by: "me@x.ie" });
  });

  it("reads 'No such firm' as a firm not set up, and passes other failures on", async () => {
    const missing = supabaseStore(env, fake(() => new Response(JSON.stringify({ message: "No such firm: abc-demo" }), { status: 400 })).f)!;
    expect(await missing.since(FIRM, 0)).toBeNull();
    const down = supabaseStore(env, fake(() => new Response("upstream down", { status: 503 })).f)!;
    await expect(down.since(FIRM, 0)).rejects.toThrow(/503/);
    await expect(down.apply(FIRM, [], "x")).rejects.toThrow(/503/);
  });

  it("sends an old service_role key (a JWT) on both headers", async () => {
    const { calls, f } = fake(() => new Response("[]"));
    await supabaseStore({ ...env, SUPABASE_SECRET_KEY: "eyJold.jwt.key" }, f)!.exists(FIRM);
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h.apikey).toBe("eyJold.jwt.key");
    expect(h.authorization).toBe("Bearer eyJold.jwt.key");
  });

  it("asks whether the firm exists without reading its records", async () => {
    const { calls, f } = fake((c) => new Response(c.url.includes("id=eq.abc-demo") ? "[{\"id\":\"abc-demo\"}]" : "[]"));
    const store = supabaseStore(env, f)!;
    expect(await store.exists(FIRM)).toBe(true);
    expect(await store.exists("nobody")).toBe(false);
    expect(calls[0].url).toBe("https://xyz.supabase.co/rest/v1/firms?id=eq.abc-demo&select=id");
  });
});
