/**
 * The link between one screen and the shared firm on the server (stage 0 of the real web app,
 * 21 Nov 2026). It knows nothing of React or of which store it serves: src/data/shared.ts hands
 * it the app's store, and the tests hand it stores of their own, so two "screens" can be tried
 * against one server in a unit test.
 *
 * - `start` loads the firm (GET /api/data?since=0). The first screen ever to open finds no firm
 *   and sets it up from a fresh seed; every screen after that loads what is there.
 * - Every change made on this screen is found by `changedRecords` and sent in small batches
 *   (POST /api/data, kind "changes") a moment later, so a run of clicks goes as one request.
 * - `poll` asks for what others changed since the version this screen last saw. A change still
 *   waiting to go from this screen wins over one coming in for the same record, so typing is
 *   never overwritten by an older copy.
 * - When the firm has been reset since this screen last looked, the server sends the whole firm
 *   and this screen starts again from it.
 */
import { applyChanges, changedRecords, fromRecords, type Positions, type RecordChange, type StoredRecord, toRecords } from "@/lib/sync";
import type { Db } from "./types";

export type LinkDeps = {
  fetch: typeof fetch;
  getDb: () => Db;
  /** Puts a firm in place without it counting as a change made here. */
  setDb: (db: Db) => void;
  /** Called after every change to the store, with the database before it. */
  subscribe: (fn: (db: Db, prev: Db) => void) => () => void;
  /** A brand new firm from the seed: to set the firm up, to reset it, and as the shape of every list. */
  fresh: () => Db;
  firmName: () => string;
  notify: (message: string) => void;
  url?: string;
  /** How long to wait after a change before sending, so a run of clicks goes together. */
  sendAfterMs?: number;
};

export type LinkState = "off" | "live" | "offline" | "signed_out";

/** At most this many records in one request; the server takes 3,000. */
const BATCH = 1500;

const keyOf = (c: RecordChange) => `${c.list}\u0000${c.id}`;

export function makeLink(deps: LinkDeps) {
  const url = deps.url ?? "/api/data";
  let positions: Positions = {};
  let version = 0;
  let state: LinkState = "off";
  /** Changes made here and not yet sent, by record: the latest for each. */
  let pending = new Map<string, RecordChange>();
  /** Records in a request now on its way. */
  let inFlight = new Map<string, RecordChange>();
  let sending: Promise<void> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let applying = false;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<(s: LinkState) => void>();

  const setState = (s: LinkState) => {
    if (s === state) return;
    state = s;
    for (const fn of listeners) fn(s);
  };

  async function call(init?: { body: unknown }, since?: number): Promise<Response> {
    return deps.fetch(init ? url : `${url}?since=${since ?? 0}`, {
      method: init ? "POST" : "GET",
      credentials: "same-origin",
      headers: init ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: init ? JSON.stringify(init.body) : undefined,
    });
  }

  const isJson = (r: Response) => (r.headers.get("content-type") ?? "").includes("json");

  /** Puts a whole firm in place, as the server has it. */
  function takeWhole(records: StoredRecord[], v: number) {
    const built = fromRecords(records, deps.fresh());
    positions = built.positions;
    version = v;
    pending = new Map();
    put(built.db);
  }

  function put(db: Db) {
    applying = true;
    try {
      deps.setDb(db);
    } finally {
      applying = false;
    }
  }

  async function setUp(): Promise<boolean> {
    const db = deps.fresh();
    const { records, positions: p } = toRecords(db);
    const res = await call({ body: { kind: "reset", name: deps.firmName(), records } });
    if (!res.ok || !isJson(res)) return false;
    const body = (await res.json()) as { version?: number };
    if (typeof body.version !== "number") return false;
    positions = p;
    version = body.version;
    put(db);
    return true;
  }

  /** Loads the firm. "off" when this copy has no shared firm (no server, or no database set up). */
  async function start(): Promise<LinkState> {
    let res: Response;
    try {
      res = await call(undefined, 0);
    } catch {
      return "off";
    }
    if (res.status === 404 && isJson(res)) {
      if (!(await setUp())) return "off";
    } else if (res.ok && isJson(res)) {
      const body = (await res.json()) as { version: number; records: StoredRecord[] };
      takeWhole(body.records, body.version);
    } else {
      return "off";
    }
    unsubscribe = deps.subscribe((db, prev) => {
      if (applying || db === prev) return;
      const found = changedRecords(prev, db, positions);
      positions = found.positions;
      for (const c of found.changes) pending.set(keyOf(c), c);
      if (found.changes.length) later();
    });
    setState("live");
    return "live";
  }

  function later() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, deps.sendAfterMs ?? 400);
  }

  /** Sends everything waiting. Resolves once it has gone, or failed and been kept to try again. */
  function flush(): Promise<void> {
    if (sending) return sending.then(() => (pending.size ? flush() : undefined));
    if (!pending.size) return Promise.resolve();
    sending = (async () => {
      while (pending.size) {
        const batch = [...pending.values()].slice(0, BATCH);
        for (const c of batch) {
          pending.delete(keyOf(c));
          inFlight.set(keyOf(c), c);
        }
        let res: Response | null = null;
        try {
          res = await call({ body: { kind: "changes", changes: batch } });
        } catch {
          res = null;
        }
        inFlight = new Map();
        if (res?.ok) {
          const body = (await res.json().catch(() => ({}))) as { version?: number | null };
          // Nobody else wrote in between: this screen is up to date without asking.
          if (typeof body.version === "number" && body.version === version + 1) version = body.version;
          setState("live");
          continue;
        }
        if (res?.status === 401 || (res && !isJson(res))) {
          setState("signed_out");
          deps.notify("Your sign-in has run out, so changes are not being saved. Reload the page to sign in again");
        } else if (res && res.status < 500) {
          deps.notify("A change could not be saved to the shared demo, so it will only show on this screen");
          continue;
        } else {
          setState("offline");
        }
        // Keep them, unless something newer is already waiting, and try again in a while.
        for (const c of batch) if (!pending.has(keyOf(c))) pending.set(keyOf(c), c);
        if (state !== "signed_out") {
          timer ??= setTimeout(() => {
            timer = null;
            void flush();
          }, 5000);
        }
        return;
      }
    })().finally(() => {
      sending = null;
    });
    return sending;
  }

  /** Brings in what others changed since this screen last looked. */
  async function poll(): Promise<void> {
    if (state === "off" || state === "signed_out") return;
    let res: Response;
    try {
      res = await call(undefined, version);
    } catch {
      setState("offline");
      return;
    }
    if (res.status === 401 || !isJson(res)) {
      setState("signed_out");
      return;
    }
    if (!res.ok) {
      setState("offline");
      return;
    }
    const body = (await res.json()) as { version: number; full: boolean; records: RecordChange[] };
    setState("live");
    if (body.full) {
      const resetHere = version > 0;
      takeWhole(body.records as StoredRecord[], body.version);
      if (resetHere) deps.notify("The demo data has been reset by Vardil");
      return;
    }
    if (body.version <= version) return;
    // A change made here and not yet saved wins over an older copy coming in.
    const incoming = body.records.filter((c) => !pending.has(keyOf(c)) && !inFlight.has(keyOf(c)));
    version = body.version;
    if (!incoming.length) return;
    const next = applyChanges(deps.getDb(), incoming, positions);
    positions = next.positions;
    put(next.db);
  }

  /** A fresh firm for everyone. The server allows it to Vardil staff only. */
  async function reset(): Promise<boolean> {
    const db = deps.fresh();
    const { records, positions: p } = toRecords(db);
    let res: Response;
    try {
      res = await call({ body: { kind: "reset", name: deps.firmName(), records } });
    } catch {
      deps.notify("The demo data could not be reset. Check the connection and try again");
      return false;
    }
    if (res.status === 403) {
      deps.notify("Only Vardil staff can reset the shared demo data");
      return false;
    }
    const body = (await res.json().catch(() => ({}))) as { version?: number };
    if (!res.ok || typeof body.version !== "number") {
      deps.notify("The demo data could not be reset. Try again in a moment");
      return false;
    }
    if (timer) clearTimeout(timer);
    timer = null;
    pending = new Map();
    positions = p;
    version = body.version;
    put(db);
    return true;
  }

  function stop() {
    unsubscribe?.();
    unsubscribe = null;
    if (timer) clearTimeout(timer);
    timer = null;
    setState("off");
  }

  return {
    start,
    flush,
    poll,
    reset,
    stop,
    get state() {
      return state;
    },
    get version() {
      return version;
    },
    get waiting() {
      return pending.size + inFlight.size;
    },
    onState(fn: (s: LinkState) => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export type Link = ReturnType<typeof makeLink>;
