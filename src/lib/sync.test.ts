import { produce } from "immer";
import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { Db } from "@/data/types";
import { applyChanges, changedRecords, fromRecords, isDeleted, toRecords, WHOLE, type RecordChange } from "./sync";

const seed = () => buildSeed("2026-11-20", { emailDomain: "abc.example", vatPct: 13.5, region: "IE", legalName: "ABC Construction Ltd" }).db;

/** Two copies of the firm, as two screens would hold them after loading from the server. */
function twoCopies() {
  const db = seed();
  const { records, positions } = toRecords(db);
  return { db, records, positions, template: seed() };
}

describe("toRecords and fromRecords", () => {
  it("round-trips the whole sample firm, order included", () => {
    const { db, records, template } = twoCopies();
    const back = fromRecords(records, template).db;
    expect(back).toEqual(db);
  });

  it("keeps phone accounts by person and bank holidays by date, and connections whole", () => {
    const { records } = twoCopies();
    expect(records.filter((r) => r.list === "phoneAccounts").every((r) => r.id.startsWith("p-"))).toBe(true);
    expect(records.filter((r) => r.list === "bankHolidays").every((r) => /^\d{4}-\d\d-\d\d$/.test(r.id))).toBe(true);
    expect(records.filter((r) => r.list === "connections").map((r) => r.id)).toEqual([WHOLE]);
  });

  it("starts an empty list empty, whatever the template holds", () => {
    const { records, template } = twoCopies();
    const back = fromRecords(records.filter((r) => r.list !== "snags"), template).db;
    expect(back.snags).toEqual([]);
  });
});

describe("changedRecords", () => {
  it("finds nothing when nothing changed", () => {
    const { db, positions } = twoCopies();
    expect(changedRecords(db, produce(db, () => {}), positions).changes).toEqual([]);
  });

  it("finds the one record an edit touched", () => {
    const { db, positions } = twoCopies();
    const after = produce(db, (d) => {
      d.people[3]!.phone = "087 000 0000";
    });
    const { changes } = changedRecords(db, after, positions);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ list: "people", id: db.people[3]!.id, pos: 3 });
  });

  it("places a record added at the end, at the start and in the middle between its neighbours", () => {
    const { db, positions } = twoCopies();
    const n = db.todos.length;
    const t = { ...db.todos[0]! };
    const after = produce(db, (d) => {
      d.todos.push({ ...t, id: "td-end" });
      d.todos.unshift({ ...t, id: "td-start" });
      d.todos.splice(2, 0, { ...t, id: "td-mid" });
    });
    const { changes, positions: next } = changedRecords(db, after, positions);
    const pos = (id: string) => (changes.find((c) => c.id === id) as { pos: number }).pos;
    expect(changes.map((c) => c.id).sort()).toEqual(["td-end", "td-mid", "td-start"]);
    expect(pos("td-start")).toBeLessThan(0);
    expect(pos("td-end")).toBe(n);
    expect(pos("td-mid")).toBeGreaterThan(0);
    expect(pos("td-mid")).toBeLessThan(1);
    expect([...next.todos!.keys()]).toEqual(after.todos.map((x) => x.id));
  });

  it("sends a deletion", () => {
    const { db, positions } = twoCopies();
    const gone = db.snags[1]!.id;
    const after = produce(db, (d) => {
      d.snags.splice(1, 1);
    });
    const { changes } = changedRecords(db, after, positions);
    expect(changes).toEqual([{ list: "snags", id: gone, deleted: true }]);
  });

  it("numbers a list afresh when it is reordered, sending only what moved", () => {
    const { db, positions } = twoCopies();
    const after = produce(db, (d) => {
      d.courses.reverse();
    });
    const { changes, positions: next } = changedRecords(db, after, positions);
    expect(changes.length).toBeGreaterThan(0);
    expect(changes.every((c) => c.list === "courses" && !isDeleted(c))).toBe(true);
    expect([...next.courses!.values()]).toEqual(after.courses.map((_, i) => i));
  });

  it("sends an object list whole", () => {
    const { db, positions } = twoCopies();
    const after = produce(db, (d) => {
      d.connections.email = { ...d.connections.email!, account: "office@new.example" };
    });
    const { changes } = changedRecords(db, after, positions);
    expect(changes).toEqual([{ list: "connections", id: WHOLE, pos: 0, data: after.connections }]);
  });

  it("keeps a list whole when its records lose their keys, and goes back to records after", () => {
    const { db, positions } = twoCopies();
    const broken = produce(db, (d) => {
      (d.expenses as unknown as { id?: string }[]).push({});
    });
    const one = changedRecords(db, broken, positions);
    expect(one.changes.filter((c) => !isDeleted(c)).map((c) => c.id)).toEqual([WHOLE]);
    expect(one.changes.filter(isDeleted)).toHaveLength(db.expenses.length);
    const fixed = produce(broken, (d) => {
      d.expenses.pop();
    });
    const two = changedRecords(broken, fixed, one.positions);
    expect(two.changes).toContainEqual({ list: "expenses", id: WHOLE, deleted: true });
    expect(two.changes.filter((c) => !isDeleted(c))).toHaveLength(db.expenses.length);
  });
});

describe("applyChanges", () => {
  /** Whatever one screen does, the other screen ends up with exactly the same firm. */
  function shared(change: (d: Db) => void) {
    const a = twoCopies();
    const b = fromRecords(a.records, a.template);
    const after = produce(a.db, change);
    const { changes, positions } = changedRecords(a.db, after, a.positions);
    const other = applyChanges(b.db, roundTrip(changes), b.positions);
    return { after, other, positions };
  }
  const roundTrip = (c: RecordChange[]) => JSON.parse(JSON.stringify(c)) as RecordChange[];

  it("passes an edit, additions at both ends and a deletion to another screen", () => {
    const { after, other, positions } = shared((d) => {
      d.requests[0]!.status = "Done";
      d.activity.unshift({ ...d.activity[0]!, id: "act-new" });
      d.chatMessages.push({ ...d.chatMessages[0]!, id: "msg-new" });
      d.snags.splice(0, 1);
    });
    expect(other.db).toEqual(after);
    expect(other.positions.activity).toEqual(positions.activity);
  });

  it("passes a reorder and a whole-object change", () => {
    const { after, other } = shared((d) => {
      d.courses.sort((x, y) => (x.id < y.id ? 1 : -1));
      d.connections.whatsapp = undefined;
    });
    expect(other.db).toEqual(after);
  });

  it("leaves lists nobody touched as the same objects", () => {
    const a = twoCopies();
    const after = produce(a.db, (d) => {
      d.todos[0]!.doneAt = "2026-11-20T10:00:00";
    });
    const { changes } = changedRecords(a.db, after, a.positions);
    const out = applyChanges(a.db, changes, a.positions);
    expect(out.db.people).toBe(a.db.people);
    expect(out.db.todos).not.toBe(a.db.todos);
  });

  it("does nothing with no changes", () => {
    const a = twoCopies();
    expect(applyChanges(a.db, [], a.positions).db).toBe(a.db);
  });
});
