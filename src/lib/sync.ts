/**
 * Sharing one firm's records between every screen and phone (stage 0 of the real web app,
 * 21 Nov 2026). Pure rules, no store and no network.
 *
 * The app keeps the firm as one `Db` in the browser, changed only through `mutate`. After each
 * change, `changedRecords` compares the database before and after. Immer keeps every record that
 * did not change as the very same object, so a comparison by reference finds exactly the records
 * an action touched, however the action was written. Those go to the server; other people's
 * changes come back the other way and are put in place with `applyChanges`.
 *
 * A list's order matters to some screens ("newest first"), so every record carries a position.
 * New records take a position between their neighbours; when a list is reordered as a whole the
 * positions are numbered afresh and every record whose position moved is sent.
 */
import type { Db } from "../data/types";
import type { RecordChange, StoredRecord } from "./sync-records";

export type { RecordChange, StoredRecord };
export type ListKey = keyof Db;

/** Where each record sits in its list, by list then key. */
export type Positions = Record<string, Map<string, number>>;

/** How a list's records are told apart: by `id`, except where noted. */
export const KEY_FIELD: Partial<Record<ListKey, string>> = { phoneAccounts: "personId", bankHolidays: "date" };

/** The key of a list that is kept as one record: an object (connections), or a list whose records have no key. */
export const WHOLE = "_";

export const isDeleted = (c: RecordChange): c is { list: string; id: string; deleted: true } => "deleted" in c;

function keyOf(list: string, item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const v = (item as Record<string, unknown>)[KEY_FIELD[list as ListKey] ?? "id"];
  return typeof v === "string" && v !== "" ? v : null;
}

/** A list is kept record by record when every record has a key and no key is used twice. */
function keyed(list: string, value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    const k = keyOf(list, item);
    if (k === null || seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}

/** The whole firm as stored records, positions counting up from 0. */
export function toRecords(db: Db): { records: StoredRecord[]; positions: Positions } {
  const records: StoredRecord[] = [];
  const positions: Positions = {};
  for (const [list, value] of Object.entries(db)) {
    const pos = new Map<string, number>();
    if (keyed(list, value)) {
      value.forEach((item, i) => {
        const id = keyOf(list, item)!;
        pos.set(id, i);
        records.push({ list, id, pos: i, data: item });
      });
    } else {
      pos.set(WHOLE, 0);
      records.push({ list, id: WHOLE, pos: 0, data: value });
    }
    positions[list] = pos;
  }
  return { records, positions };
}

/**
 * The firm rebuilt from stored records. `template` gives every list's starting value (a freshly
 * built seed works), so a list with no records yet is empty and an object keeps its shape.
 */
export function fromRecords(records: StoredRecord[], template: Db): { db: Db; positions: Positions } {
  const byList = new Map<string, StoredRecord[]>();
  for (const r of records) {
    const rows = byList.get(r.list) ?? [];
    rows.push(r);
    byList.set(r.list, rows);
  }
  const db = {} as Record<string, unknown>;
  const positions: Positions = {};
  for (const [list, start] of Object.entries(template)) {
    const rows = byList.get(list) ?? [];
    const whole = rows.find((r) => r.id === WHOLE);
    if (whole) {
      db[list] = whole.data;
      positions[list] = new Map([[WHOLE, 0]]);
    } else if (Array.isArray(start) || rows.length) {
      rows.sort((a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1));
      db[list] = rows.map((r) => r.data);
      positions[list] = new Map(rows.map((r) => [r.id, r.pos]));
    } else {
      db[list] = start;
      positions[list] = new Map([[WHOLE, 0]]);
    }
  }
  return { db: db as Db, positions };
}

/**
 * The records one change touched, and every list's positions afterwards. `before` and `after`
 * are the database either side of a `mutate`; `positions` describes `before`.
 */
export function changedRecords(before: Db, after: Db, positions: Positions): { changes: RecordChange[]; positions: Positions } {
  const changes: RecordChange[] = [];
  const next: Positions = { ...positions };
  const lists = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const list of lists) {
    const b = (before as Record<string, unknown>)[list];
    const a = (after as Record<string, unknown>)[list];
    if (a === b) continue;
    const old = positions[list] ?? new Map<string, number>();
    if (!keyed(list, a)) {
      // Kept whole. If it was kept record by record before, those records go.
      for (const id of old.keys()) if (id !== WHOLE) changes.push({ list, id, deleted: true });
      changes.push({ list, id: WHOLE, pos: 0, data: a });
      next[list] = new Map([[WHOLE, 0]]);
      continue;
    }
    // Records it had before. A list that was kept whole had none of its own, so all of it is sent.
    const was = new Map<string, unknown>();
    if (keyed(list, b)) for (const item of b) was.set(keyOf(list, item)!, item);
    if (old.has(WHOLE)) changes.push({ list, id: WHOLE, deleted: true });

    const ids = a.map((item) => keyOf(list, item)!);
    const pos = placeAll(ids, old);
    a.forEach((item, i) => {
      const id = ids[i]!;
      const at = pos[i]!;
      if (was.get(id) !== item || old.get(id) !== at) changes.push({ list, id, pos: at, data: item });
    });
    const now = new Set(ids);
    for (const id of was.keys()) if (!now.has(id)) changes.push({ list, id, deleted: true });
    next[list] = new Map(ids.map((id, i) => [id, pos[i]!]));
  }
  return { changes, positions: next };
}

/**
 * A position for every record in `ids`, in order. Records that were there keep theirs; new ones
 * go between their neighbours. If the result does not count up (the list was reordered), the
 * whole list is numbered afresh.
 */
function placeAll(ids: string[], old: Map<string, number>): number[] {
  const pos: (number | undefined)[] = ids.map((id) => old.get(id));
  let i = 0;
  while (i < ids.length) {
    if (pos[i] !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (j < ids.length && pos[j] === undefined) j++;
    const lo = i > 0 ? pos[i - 1]! : undefined;
    const hi = j < ids.length ? pos[j]! : undefined;
    const n = j - i;
    for (let k = 0; k < n; k++) {
      if (lo === undefined && hi === undefined) pos[i + k] = k;
      else if (lo === undefined) pos[i + k] = hi! - (n - k);
      else if (hi === undefined) pos[i + k] = lo + (k + 1);
      else pos[i + k] = lo + ((hi - lo) * (k + 1)) / (n + 1);
    }
    i = j;
  }
  const out = pos as number[];
  for (let k = 1; k < out.length; k++) if (!(out[k]! > out[k - 1]!)) return ids.map((_, n) => n);
  return out;
}

/**
 * Changes from the server put in place: written records replace or join their list at their
 * position, deleted ones go. Lists nobody touched stay the same objects, so screens that read
 * them do not draw again.
 */
export function applyChanges(db: Db, changes: RecordChange[], positions: Positions): { db: Db; positions: Positions } {
  if (!changes.length) return { db, positions };
  const byList = new Map<string, RecordChange[]>();
  for (const c of changes) {
    const rows = byList.get(c.list) ?? [];
    rows.push(c);
    byList.set(c.list, rows);
  }
  const next = { ...db } as Record<string, unknown>;
  const nextPos: Positions = { ...positions };
  for (const [list, rows] of byList) {
    const whole = rows.filter((c) => c.id === WHOLE && !isDeleted(c)).pop();
    if (whole && !isDeleted(whole)) {
      next[list] = whole.data;
      nextPos[list] = new Map([[WHOLE, 0]]);
      continue;
    }
    const current = (next[list] as unknown[] | undefined) ?? [];
    const pos = new Map(positions[list] ?? []);
    pos.delete(WHOLE);
    const items = new Map<string, unknown>();
    if (Array.isArray(current)) for (const item of current) {
      const id = keyOf(list, item);
      if (id !== null) items.set(id, item);
    }
    for (const c of rows) {
      if (c.id === WHOLE) continue;
      if (isDeleted(c)) {
        items.delete(c.id);
        pos.delete(c.id);
      } else {
        items.set(c.id, c.data);
        pos.set(c.id, c.pos);
      }
    }
    const ids = [...items.keys()].sort((x, y) => (pos.get(x) ?? 0) - (pos.get(y) ?? 0) || (x < y ? -1 : 1));
    next[list] = ids.map((id) => items.get(id));
    nextPos[list] = new Map(ids.map((id) => [id, pos.get(id) ?? 0]));
  }
  return { db: next as Db, positions: nextPos };
}
