/**
 * Two screens and one server: the link (link.ts) of each, the real request handler
 * (server/shared.ts) and the database's rules kept in memory. Changes are made the app's way,
 * through actions on a store with Immer, so this is what a phone and an office screen do.
 */
import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { handleData, type SharedStore, type Since } from "../../server/shared";
import type { RecordChange, StoredRecord } from "../lib/sync-records";
import { makeLink } from "./link";
import { buildSeed } from "./seed";
import type { Db } from "./types";

const ORIGIN = "https://app.vardil.com";
const SEED = buildSeed("2026-11-20").db;
const fresh = () => structuredClone(SEED);

function memoryStore() {
  const rows = new Map<string, { r: RecordChange; v: number; by: string }>();
  let firm: { version: number; reset: number } | null = null;
  const s: SharedStore & { requests: number; down: boolean } = {
    requests: 0,
    down: false,
    async exists() {
      return firm !== null;
    },
    async since(_f, since): Promise<Since | null> {
      if (!firm) return null;
      const whole = since <= 0 || since < firm.reset || since > firm.version;
      const list = [...rows.values()].filter(({ r, v }) => (whole ? !("deleted" in r) : v > since)).sort((a, b) => a.v - b.v);
      return { version: firm.version, full: whole, records: list.map(({ r }) => r) };
    },
    async apply(_f, changes, by) {
      if (!firm) throw new Error("No such firm");
      const v = ++firm.version;
      for (const c of changes) rows.set(`${c.list}/${c.id}`, { r: c, v, by });
      return v;
    },
    async reset(_f, _n, records: StoredRecord[], by) {
      firm ??= { version: 0, reset: 0 };
      const v = ++firm.version;
      firm.reset = v;
      rows.clear();
      for (const r of records) rows.set(`${r.list}/${r.id}`, { r, v, by });
      return v;
    },
  };
  return s;
}

type Screen = ReturnType<typeof screen>;

function screen(server: ReturnType<typeof memoryStore>, email: string, staff = false) {
  const store = create<{ db: Db; mutate: (fn: (db: Db) => void) => void }>()(
    immer((set) => ({
      db: fresh(),
      mutate: (fn) =>
        set((s) => {
          fn(s.db);
        }),
    })),
  );
  const notes: string[] = [];
  const link = makeLink({
    fetch: async (input, init) => {
      server.requests++;
      if (server.down) throw new TypeError("Failed to fetch");
      const req = new Request(new URL(String(input), ORIGIN), { ...init, headers: { ...(init?.headers as Record<string, string>), origin: ORIGIN } });
      return handleData(req, { caller: { email, staff }, store: server, firm: "abc-demo" });
    },
    getDb: () => store.getState().db,
    setDb: (db) => store.setState({ db }),
    subscribe: (fn) => store.subscribe((s, prev) => fn(s.db, prev.db)),
    fresh,
    firmName: () => "ABC Construction Ltd",
    notify: (m) => notes.push(m),
    sendAfterMs: 60_000,
  });
  return { store, link, notes, db: () => store.getState().db, mutate: store.getState().mutate };
}

async function two(): Promise<{ server: ReturnType<typeof memoryStore>; office: Screen; phone: Screen }> {
  const server = memoryStore();
  const office = screen(server, "oisin@vardil.com", true);
  expect(await office.link.start()).toBe("live");
  const phone = screen(server, "site@vardil.com");
  expect(await phone.link.start()).toBe("live");
  return { server, office, phone };
}

describe("the shared firm, two screens", () => {
  it("the first screen sets the firm up, the next one loads it", async () => {
    const { office, phone } = await two();
    expect(office.link.version).toBe(1);
    expect(phone.link.version).toBe(1);
    expect(phone.db()).toEqual(office.db());
    expect(phone.db().projects.length).toBe(SEED.projects.length);
  });

  it("a repair sent from the phone reaches the office, and the office's answer reaches the phone", async () => {
    const { office, phone } = await two();
    const repairs = phone.db().repairs.length;
    phone.mutate((db) => {
      db.repairs.unshift({ id: "rp-new", personId: "p-103", item: { kind: "plant", name: "Mixer" }, where: "C720", what: "Mixer will not start", photos: [], at: "2026-11-20T09:00:00Z", status: "Reported", steps: [] });
    });
    expect(phone.link.waiting).toBe(1);
    await phone.link.flush();
    expect(phone.link.waiting).toBe(0);

    await office.link.poll();
    expect(office.db().repairs.length).toBe(repairs + 1);
    expect(office.db().repairs[0]!.id).toBe("rp-new");

    office.mutate((db) => {
      const r = db.repairs.find((x) => x.id === "rp-new")!;
      r.status = "In hand";
    });
    await office.link.flush();
    await phone.link.poll();
    expect(phone.db().repairs.find((x) => x.id === "rp-new")!.status).toBe("In hand");
    // Lists nobody touched are still the very same objects on the phone.
    expect(phone.db().projects).toBe(phone.store.getState().db.projects);
  });

  it("sends only what changed, a run of clicks in one request", async () => {
    const { server, phone } = await two();
    const before = server.requests;
    phone.mutate((db) => void (db.todos[0]!.title = "One"));
    phone.mutate((db) => void (db.todos[0]!.title = "Two"));
    phone.mutate((db) => void (db.todos[1]!.title = "Three"));
    expect(phone.link.waiting).toBe(2);
    await phone.link.flush();
    expect(server.requests - before).toBe(1);
  });

  it("a deleted record goes from the other screen too, and order is kept", async () => {
    const { office, phone } = await two();
    const gone = office.db().todos[1]!.id;
    office.mutate((db) => {
      db.todos.splice(1, 1);
      db.todos.unshift({ ...db.todos[0]!, id: "td-first", title: "Newest" });
    });
    await office.link.flush();
    await phone.link.poll();
    expect(phone.db().todos.map((t) => t.id)).toEqual(office.db().todos.map((t) => t.id));
    expect(phone.db().todos.some((t) => t.id === gone)).toBe(false);
  });

  it("a change not yet sent from this screen is not overwritten by an older copy coming in", async () => {
    const { office, phone } = await two();
    const id = office.db().todos[0]!.id;
    office.mutate((db) => void (db.todos[0]!.title = "From the office"));
    await office.link.flush();
    phone.mutate((db) => void (db.todos[0]!.title = "Typed on the phone"));
    await phone.link.poll();
    expect(phone.db().todos.find((t) => t.id === id)!.title).toBe("Typed on the phone");
    await phone.link.flush();
    await office.link.poll();
    expect(office.db().todos.find((t) => t.id === id)!.title).toBe("Typed on the phone");
  });

  it("keeps changes while the server cannot be reached and sends them when it can", async () => {
    const { server, office, phone } = await two();
    server.down = true;
    phone.mutate((db) => void (db.todos[0]!.title = "Sent later"));
    await phone.link.flush();
    expect(phone.link.state).toBe("offline");
    expect(phone.link.waiting).toBe(1);
    server.down = false;
    await phone.link.flush();
    expect(phone.link.state).toBe("live");
    await office.link.poll();
    expect(office.db().todos[0]!.title).toBe("Sent later");
  });

  it("only Vardil staff may reset, and every screen then starts again from the fresh firm", async () => {
    const { office, phone } = await two();
    phone.mutate((db) => void (db.todos[0]!.title = "Changed"));
    await phone.link.flush();
    expect(await phone.link.reset()).toBe(false);
    expect(phone.notes.at(-1)).toMatch(/Only Vardil staff/);

    await office.link.poll();
    expect(office.db().todos[0]!.title).toBe("Changed");
    expect(await office.link.reset()).toBe(true);
    expect(office.db().todos[0]!.title).toBe(SEED.todos[0]!.title);

    await phone.link.poll();
    expect(phone.db().todos[0]!.title).toBe(SEED.todos[0]!.title);
    expect(phone.notes.at(-1)).toMatch(/reset by Vardil/);
  });

  it("stays off where the server has no database", async () => {
    const s = screen(memoryStore(), "x@vardil.com");
    const off = makeLink({
      fetch: async () => new Response(JSON.stringify({ error: "not_set_up" }), { status: 503, headers: { "content-type": "application/json" } }),
      getDb: () => s.db(),
      setDb: () => undefined,
      subscribe: () => () => undefined,
      fresh,
      firmName: () => "x",
      notify: () => undefined,
    });
    expect(await off.start()).toBe("off");
  });
});
