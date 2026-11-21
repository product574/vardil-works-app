/**
 * The server side of the shared firm (stage 0 of the real web app, 21 Nov 2026), used by
 * functions/api/data.ts.
 *
 * `SharedStore` is the one place records are read and written. `supabaseStore` keeps them in
 * Supabase (supabase/migrations, three functions called over Supabase's REST interface with the
 * service role key, which never leaves the server). A SharePoint store, the long-term home of each
 * client's records, is a second implementation of the same three methods.
 *
 * `handleData` is the whole request: who is asking (Cloudflare Access, checked by the caller and
 * passed in), what they may do, and the store. It takes both as arguments so it can be tested
 * without Cloudflare or Supabase.
 */
import type { RecordChange, StoredRecord } from "../src/lib/sync-records";
import { requestGate } from "./validate";

export type Since = { version: number; full: boolean; records: RecordChange[] };

export interface SharedStore {
  /** Whether the firm has been set up. */
  exists(firm: string): Promise<boolean>;
  /** Everything written since `version`, or the whole firm. Null when the firm does not exist yet. */
  since(firm: string, version: number): Promise<Since | null>;
  /** Writes a batch and returns the firm's new version. */
  apply(firm: string, changes: RecordChange[], by: string): Promise<number>;
  /** Starts the firm, or replaces every record in it. Returns the firm's new version. */
  reset(firm: string, name: string, records: StoredRecord[], by: string): Promise<number>;
}

export type Caller = { email: string; staff: boolean };

/** Limits on what one request may carry. */
export const DATA_LIMITS = {
  /** One batch of changes from a screen. A whole timesheet week marked at once is a few hundred. */
  changes: 3000,
  changesBody: 3 * 1024 * 1024,
  /** A whole firm, on a reset. The sample firm is about 5,600 records and 1.5 MB. */
  records: 50000,
  resetBody: 16 * 1024 * 1024,
  /** A list's name and a record's key. */
  name: 60,
  id: 200,
};

const LIST = /^[a-zA-Z][a-zA-Z0-9]*$/;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** A batch of changes in a known shape, or why it was refused. */
export function readChanges(raw: unknown, max: number, opts: { deletes: boolean }): { ok: true; changes: RecordChange[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: "not a list" };
  if (raw.length > max) return { ok: false, reason: "too many" };
  const out: RecordChange[] = [];
  for (const [i, c] of raw.entries()) {
    if (!isObj(c)) return { ok: false, reason: `change ${i}` };
    const { list, id } = c;
    if (typeof list !== "string" || list.length > DATA_LIMITS.name || !LIST.test(list)) return { ok: false, reason: `change ${i} list` };
    if (typeof id !== "string" || id === "" || id.length > DATA_LIMITS.id) return { ok: false, reason: `change ${i} id` };
    if (c.deleted === true) {
      if (!opts.deletes) return { ok: false, reason: `change ${i} deleted` };
      out.push({ list, id, deleted: true });
      continue;
    }
    if (typeof c.pos !== "number" || !Number.isFinite(c.pos)) return { ok: false, reason: `change ${i} pos` };
    if (!("data" in c) || c.data === undefined) return { ok: false, reason: `change ${i} data` };
    out.push({ list, id, pos: c.pos, data: c.data });
  }
  return { ok: true, changes: out };
}

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/**
 * GET  /api/data?since=N   What changed since version N (0 for the whole firm). 404 with
 *                          { error: "no_firm" } when the firm has not been set up yet.
 * POST /api/data { kind: "changes", changes }        A batch from one screen. Returns { version }.
 * POST /api/data { kind: "reset", name, records }    The whole firm from a fresh seed. Vardil staff
 *                          only, except the very first time, when the firm does not exist yet.
 */
export async function handleData(request: Request, opts: { caller: Caller | null; store: SharedStore | null; firm: string }): Promise<Response> {
  const { caller, store, firm } = opts;
  if (!caller) return reply(401, { error: "sign_in" });
  if (!store) return reply(503, { error: "not_set_up" });
  try {
    if (request.method === "GET") {
      const raw = new URL(request.url).searchParams.get("since") ?? "0";
      const since = /^\d{1,15}$/.test(raw) ? Number(raw) : 0;
      const got = await store.since(firm, since);
      return got ? reply(200, got) : reply(404, { error: "no_firm" });
    }
    if (request.method !== "POST") return reply(405, { error: "method" });

    const gate = requestGate(request.url, request.headers, DATA_LIMITS.resetBody);
    if (gate) return reply(gate.status, { error: gate.error });
    const text = await request.text();
    if (text.length > DATA_LIMITS.resetBody) return reply(413, { error: "too_big" });
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(400, { error: "not_json" });
    }
    if (!isObj(body)) return reply(400, { error: "not_an_object" });

    if (body.kind === "changes") {
      if (text.length > DATA_LIMITS.changesBody) return reply(413, { error: "too_big" });
      const read = readChanges(body.changes, DATA_LIMITS.changes, { deletes: true });
      if (!read.ok) return reply(400, { error: "changes", reason: read.reason });
      if (!read.changes.length) return reply(200, { version: null });
      const version = await store.apply(firm, read.changes, caller.email);
      return reply(200, { version });
    }

    if (body.kind === "reset") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
      if (!name) return reply(400, { error: "name" });
      const read = readChanges(body.records, DATA_LIMITS.records, { deletes: false });
      if (!read.ok) return reply(400, { error: "records", reason: read.reason });
      // Anyone signed in may set the firm up the first time; only Vardil staff may wipe it after.
      if (!caller.staff && (await store.exists(firm))) return reply(403, { error: "staff_only" });
      const version = await store.reset(firm, name, read.changes as StoredRecord[], caller.email);
      return reply(200, { version });
    }
    return reply(400, { error: "kind" });
  } catch (e) {
    console.error("api/data", e instanceof Error ? e.message : e);
    return reply(502, { error: "store" });
  }
}

/** SUPABASE_SECRET_KEY: the project's secret key (sb_secret_...). The old service_role key (a JWT) works too until Supabase retires it. */
export type SupabaseEnv = { SUPABASE_URL?: string; SUPABASE_SECRET_KEY?: string };

/** The records kept in Supabase. Null until both settings are in place. */
export function supabaseStore(env: SupabaseEnv, fetchImpl: typeof fetch = fetch): SharedStore | null {
  const url = env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = env.SUPABASE_SECRET_KEY;
  // https only, apart from this machine's own address for the local test (tests/functions/data_check.py).
  if (!url || !key || !/^(https:\/\/|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$))/.test(url)) return null;

  // New keys (sb_...) are not JWTs: Supabase wants them on the apikey header only. The old JWT key also goes on Authorization.
  const auth: Record<string, string> = key.startsWith("sb_") ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };

  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (!r.ok) {
      const err = new Error(`Supabase ${fn} answered ${r.status}`) as Error & { body?: string };
      err.body = text.slice(0, 500);
      throw err;
    }
    return JSON.parse(text) as T;
  }
  const noFirm = (e: unknown) => e instanceof Error && /No such firm/.test((e as Error & { body?: string }).body ?? "");

  return {
    async exists(firm) {
      const r = await fetchImpl(`${url}/rest/v1/firms?id=eq.${encodeURIComponent(firm)}&select=id`, {
        headers: { ...auth, accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Supabase firms answered ${r.status}`);
      return ((await r.json()) as unknown[]).length > 0;
    },
    async since(firm, version) {
      try {
        return await rpc<Since>("changes_since", { p_firm: firm, p_since: version });
      } catch (e) {
        if (noFirm(e)) return null;
        throw e;
      }
    },
    apply: (firm, changes, by) => rpc<number>("apply_changes", { p_firm: firm, p_changes: changes, p_by: by }),
    reset: (firm, name, records, by) => rpc<number>("reset_firm", { p_firm: firm, p_name: name, p_records: records, p_by: by }),
  };
}
