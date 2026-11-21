/**
 * The shared database (supabase/migrations/..._shared_records.sql) against a real Postgres.
 * Skipped unless PGTEST_PORT is set: run `sh tests/db/run.sh`, which starts a throwaway Postgres 16,
 * sets it up like Supabase (the anon, authenticated and service_role roles) and runs this file.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { buildSeed } from "@/data/seed";
import { applyChanges, changedRecords, fromRecords, toRecords, type RecordChange, type StoredRecord } from "@/lib/sync";
import { produce } from "immer";

const PORT = process.env.PGTEST_PORT;
const MIGRATIONS = join(__dirname, "..", "supabase", "migrations");

function psql(sql: string, opts: { role?: string } = {}): string {
  const text = opts.role ? `set role ${opts.role};\n${sql}` : sql;
  return execFileSync("psql", ["-h", "127.0.0.1", "-p", PORT!, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).trim();
}
/** A JSON value written into SQL safely, whatever it holds. */
function lit(v: unknown): string {
  const json = JSON.stringify(v);
  let tag = "j";
  while (json.includes(`$${tag}$`)) tag += "j";
  return `$${tag}$${json}$${tag}$::jsonb`;
}
const call = <T,>(fn: string, ...args: string[]): T => JSON.parse(psql(`select to_jsonb(${fn}(${args.join(", ")}));`)) as T;
const s = (v: string) => `'${v.replace(/'/g, "''")}'`;

type Since = { version: number; full: boolean; records: (StoredRecord | { list: string; id: string; deleted: true })[] };
const since = (firm: string, v: number) => call<Since>("public.changes_since", s(firm), String(v));
const apply = (firm: string, changes: unknown, by = "tester@vardil.com") => call<number>("public.apply_changes", s(firm), lit(changes), s(by));
const reset = (firm: string, records: unknown) => call<number>("public.reset_firm", s(firm), s("ABC Construction"), lit(records), s("staff@vardil.com"));

const seed = () => buildSeed("2026-11-20", { emailDomain: "abc.example", vatPct: 13.5, region: "IE", legalName: "ABC Construction Ltd" }).db;

describe.skipIf(!PORT)("the shared database", () => {
  beforeAll(() => {
    psql(`drop schema public cascade; create schema public;
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      grant usage on schema public to anon, authenticated, service_role;`);
    for (const f of readdirSync(MIGRATIONS).sort()) psql(readFileSync(join(MIGRATIONS, f), "utf8"));
  });

  it("can be set up twice without harm", () => {
    for (const f of readdirSync(MIGRATIONS).sort()) psql(readFileSync(join(MIGRATIONS, f), "utf8"));
    expect(psql("select count(*) from public.firms")).toBe("0");
  });

  it("refuses changes for a firm that does not exist", () => {
    expect(() => apply("nobody", [])).toThrow(/No such firm/);
    expect(() => since("nobody", 0)).toThrow(/No such firm/);
  });

  it("holds the whole sample firm and gives it back exactly", () => {
    const db = seed();
    const { records } = toRecords(db);
    expect(reset("abc", records)).toBe(1);
    const got = since("abc", 0);
    expect(got.full).toBe(true);
    expect(got.version).toBe(1);
    expect(got.records).toHaveLength(records.length);
    expect(fromRecords(got.records as StoredRecord[], seed()).db).toEqual(db);
  });

  it("passes one screen's change to another, deletions included, and nothing else", () => {
    const db = seed();
    const a = toRecords(db);
    const after = produce(db, (d) => {
      d.requests[0]!.status = "Done";
      d.activity.unshift({ ...d.activity[0]!, id: "act-shared" });
      d.snags.splice(0, 1);
    });
    const { changes } = changedRecords(db, after, a.positions);
    const v = apply("abc", changes);
    expect(v).toBe(2);
    const got = since("abc", 1);
    expect(got.full).toBe(false);
    expect(got.records).toHaveLength(changes.length);
    expect(got.records.some((r) => "deleted" in r && r.id === db.snags[0]!.id)).toBe(true);
    const other = applyChanges(db, got.records as RecordChange[], a.positions);
    expect(other.db).toEqual(after);
    expect(since("abc", 2).records).toEqual([]);
  });

  it("keeps the last change when a batch names one record twice, and who made it", () => {
    const v = apply("abc", [
      { list: "todos", id: "td-twice", pos: 99, data: { id: "td-twice", what: "first" } },
      { list: "todos", id: "td-twice", pos: 99, data: { id: "td-twice", what: "second" } },
    ], "oisin@vardil.com");
    const got = since("abc", v - 1).records as StoredRecord[];
    expect(got).toHaveLength(1);
    expect((got[0].data as { what: string }).what).toBe("second");
    expect(psql("select updated_by from public.records where firm_id = 'abc' and id = 'td-twice'")).toBe("oisin@vardil.com");
  });

  it("sends a screen that last looked before a reset, or from the future, the whole firm", () => {
    const before = since("abc", 0).version;
    const { records } = toRecords(seed());
    const v = reset("abc", records);
    expect(v).toBe(before + 1);
    expect(since("abc", before).full).toBe(true);
    expect(since("abc", v).full).toBe(false);
    expect(since("abc", v + 50).full).toBe(true);
    expect(psql("select count(*) from public.records where firm_id = 'abc' and id = 'td-twice'")).toBe("0");
  });

  it("keeps firms apart", () => {
    reset("other", [{ list: "todos", id: "td-x", pos: 0, data: { id: "td-x" } }]);
    expect(since("other", 0).records).toHaveLength(1);
    apply("other", [{ list: "todos", id: "td-y", pos: 1, data: { id: "td-y" } }]);
    expect(since("abc", 0).records.some((r) => r.id === "td-y")).toBe(false);
  });

  it("lets no browser key read or write anything, and the server's key everything", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(() => psql("select count(*) from public.records", { role })).toThrow(/permission denied/);
      expect(() => psql("select public.changes_since('abc', 0)", { role })).toThrow(/permission denied/);
      expect(() => psql("select public.apply_changes('abc', '[]'::jsonb, 'x')", { role })).toThrow(/permission denied/);
      expect(() => psql("select public.reset_firm('abc', 'x', '[]'::jsonb, 'x')", { role })).toThrow(/permission denied/);
    }
    expect(psql("select (public.changes_since('abc', 0) ->> 'full')", { role: "service_role" })).toBe("true");
  });

  it("refuses a batch that is not a list, and skips rows with no list or key", () => {
    expect(() => apply("abc", { list: "todos" })).toThrow(/must be a list/);
    const v = apply("abc", [{ list: "", id: "x", data: {} }, { list: "todos", id: "", data: {} }]);
    expect(since("abc", v - 1).records).toEqual([]);
  });
});
