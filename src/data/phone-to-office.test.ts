/**
 * The phone's buttons reach the right place in the office, through the server (22 Nov, Oisin:
 * "make sure all the connections between the apps and the site are working and going to the
 * correct place into the dashboard"). The phone is the app's own store driven by the app's own
 * actions, exactly as the phone app's buttons call them; the office is a second screen; between
 * them the real request handler (server/shared.ts) with the database's rules kept in memory, as
 * in link.test.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { handleData, type SharedStore, type Since } from "../../server/shared";
import type { RecordChange, StoredRecord } from "../lib/sync-records";
import { fromPhone, PHONE_MEASURE, variationHeadline } from "../lib/site-links";
import { actAs, addPhoto, addRequest, addSnag, claimExpense, claimOvertime, decideOvertimeClaim, markAttendance, raiseExtra, reportRepair, sendTimeStamps, setDayInstruction } from "./actions";
import { makeLink, type Link } from "./link";
import { buildSeed } from "./seed";
import { useData } from "./store";
import type { Db } from "./types";

const ORIGIN = "https://app.vardil.com";
const DAY = "2026-11-20";
const SEED = buildSeed(DAY).db;
const fresh = () => structuredClone(SEED);
const SM = "p-sm1"; // Eoin Brosnan, site manager of C719
const C719 = SEED.projects.find((p) => p.code === "C719")!;
const OP = SEED.assignments.find((a) => a.projectId === C719.id && SEED.people.find((p) => p.id === a.personId)?.kind === "Operative")!.personId;

function memoryStore(): SharedStore {
  const rows = new Map<string, { r: RecordChange; v: number }>();
  let firm: { version: number; reset: number } | null = null;
  return {
    async exists() {
      return firm !== null;
    },
    async since(_f, since): Promise<Since | null> {
      if (!firm) return null;
      const whole = since <= 0 || since < firm.reset || since > firm.version;
      const list = [...rows.values()].filter(({ r, v }) => (whole ? !("deleted" in r) : v > since)).sort((a, b) => a.v - b.v);
      return { version: firm.version, full: whole, records: list.map(({ r }) => r) };
    },
    async apply(_f, changes) {
      const v = ++firm!.version;
      for (const c of changes) rows.set(`${c.list}/${c.id}`, { r: c, v });
      return v;
    },
    async reset(_f, _n, records: StoredRecord[]) {
      firm ??= { version: 0, reset: 0 };
      const v = ++firm.version;
      firm.reset = v;
      rows.clear();
      for (const r of records) rows.set(`${r.list}/${r.id}`, { r, v });
      return v;
    },
  };
}

function linkFor(server: SharedStore, email: string, staff: boolean, getDb: () => Db, setDb: (db: Db) => void, subscribe: (fn: (db: Db, prev: Db) => void) => () => void): Link {
  return makeLink({
    fetch: async (input, init) => {
      const req = new Request(new URL(String(input), ORIGIN), { ...init, headers: { ...(init?.headers as Record<string, string>), origin: ORIGIN } });
      return handleData(req, { caller: { email, staff }, store: server, firm: "abc-demo" });
    },
    getDb,
    setDb,
    subscribe,
    fresh,
    firmName: () => "ABC Construction Ltd",
    notify: () => {},
    sendAfterMs: 60_000,
  });
}

let office: { db: () => Db; link: Link; mutate: (fn: (db: Db) => void) => void };
let phone: Link;
const sent = async () => {
  await phone.flush();
  await office.link.poll();
};

beforeAll(async () => {
  const server = memoryStore();
  const store = create<{ db: Db; mutate: (fn: (db: Db) => void) => void }>()(immer((set) => ({ db: fresh(), mutate: (fn) => set((s) => void fn(s.db)) })));
  const ol = linkFor(server, "oisin@vardil.com", true, () => store.getState().db, (db) => store.setState({ db }), (fn) => store.subscribe((s, p) => fn(s.db, p.db)));
  expect(await ol.start()).toBe("live");
  office = { db: () => store.getState().db, link: ol, mutate: store.getState().mutate };
  // The phone: the app's own store, as the phone app at /app has it.
  useData.setState({ day: DAY, db: fresh() });
  phone = linkFor(server, "site@vardil.com", false, () => useData.getState().db, (db) => useData.setState({ db }), (fn) => useData.subscribe((s, p) => fn(s.db, p.db)));
  expect(await phone.start()).toBe("live");
});

const PIC = { dataUrl: "data:image/jpeg;base64,AAAA", sizeKb: 1 };

describe("from the phone to the office, through the server", () => {
  it("a photo lands in that project's photos", async () => {
    actAs(SM, () => addPhoto(C719.id, "Belfry lift progress", "During", PIC));
    await sent();
    const f = office.db().files.find((x) => x.caption === "Belfry lift progress")!;
    expect(f.projectId).toBe(C719.id);
    expect(f.category).toBe("Photos and videos");
    expect(f.folder).toBe("Photos and videos");
    expect(f.addedBy).toBe("Eoin Brosnan");
    expect(f.dataUrl).toBe(PIC.dataUrl);
  });

  it("the site manager's timesheet reaches the office's timesheet, marked and sent", async () => {
    const crew = SEED.assignments.filter((a) => a.projectId === C719.id).map((a) => a.personId);
    // Today's marks as he makes them on the phone, then Send today's time stamps.
    actAs(SM, () => markAttendance(C719.id, OP, DAY, { status: "full", overtimeHours: 1.5, doubleHours: 0 }));
    const n = actAs(SM, () => sendTimeStamps(C719.id, DAY));
    expect(n).toBeGreaterThan(0);
    await sent();
    const today = office.db().attendance.filter((a) => a.projectId === C719.id && a.date === DAY);
    expect(today.length).toBeGreaterThan(0);
    expect(today.every((a) => a.sent)).toBe(true);
    const mine = today.find((a) => a.personId === OP)!;
    expect(mine.overtimeHours).toBe(1.5);
    expect(mine.savedBy).toBe("Eoin Brosnan");
    expect(crew).toContain(OP);
  });

  it("extra work goes to the project's variations, named by what was reported, with an approval for the office", async () => {
    actAs(OP, () => raiseExtra(C719.id, { description: "Rotten timber found once opened up. Joist under the west gallery", measured: PHONE_MEASURE, estimatedValue: 0 }));
    await sent();
    const v = office.db().variations.find((x) => x.description.includes("west gallery"))!;
    expect(v.projectId).toBe(C719.id);
    expect(fromPhone(v)).toBe(true);
    expect(variationHeadline(v)).toContain("west gallery");
    const ap = office.db().approvals.find((a) => a.variationId === v.id)!;
    expect(ap.title).toContain("west gallery");
    expect(ap.title).not.toContain("To be measured");
    expect(ap.rationale).toContain("from the site phone");
  });

  it("a snag, a site request and a crew request land on the project", async () => {
    actAs(SM, () => addSnag(C719.id, { what: "Cracked pointing at the porch", where: "Porch", from: "own" }));
    actAs(SM, () => addRequest({ projectId: C719.id, kind: "hired_plant", description: "Cherry picker for two days", quantity: 1, neededFrom: DAY, neededTo: DAY, notes: "" }));
    actAs(OP, () => addRequest({ projectId: C719.id, kind: "own_plant", description: "Second angle grinder", quantity: 1, neededFrom: DAY, neededTo: DAY, notes: "", heldBy: "site", personId: OP }));
    await sent();
    const db = office.db();
    expect(db.snags.find((s) => s.what === "Cracked pointing at the porch")?.projectId).toBe(C719.id);
    expect(db.requests.find((r) => r.description === "Cherry picker for two days")?.projectId).toBe(C719.id);
    const crew = db.requests.find((r) => r.description === "Second angle grinder")!;
    expect(crew.projectId).toBe(C719.id);
    expect(crew.heldBy).toBe("site");
  });

  it("a repair, a receipt and an overtime claim reach the office, and the office's answer reaches the phone", async () => {
    const repairId = actAs(OP, () => reportRepair({ personId: OP, item: { kind: "plant", name: "Mixer" }, where: "C719 yard", what: "Will not start" }, []));
    actAs(OP, () => claimExpense({ personId: OP, date: DAY, kind: "Fuel", what: "Diesel for the generator", amount: 42.5, projectId: C719.id }));
    const no = actAs(OP, () => claimOvertime(OP, C719.id, DAY, 2, "Stayed to finish the pour"));
    expect(no).toBeNull();
    await sent();
    const db = office.db();
    expect(db.repairs.find((r) => r.id === repairId)?.status).toBe("Reported");
    expect(db.expenses.find((e) => e.what === "Diesel for the generator")?.projectId).toBe(C719.id);
    const claim = db.overtimeClaims.find((c) => c.note === "Stayed to finish the pour")!;
    expect(claim.projectId).toBe(C719.id);
    expect(claim.status).toBe("Waiting");
    // The site manager says yes on his phone: the hours go on the timesheet the office reads.
    expect(actAs(SM, () => decideOvertimeClaim(claim.id, true, { timeAndHalf: 2, double: 0 }))).toBeNull();
    await sent();
    expect(office.db().overtimeClaims.find((c) => c.id === claim.id)?.status).toBe("Approved");
    // The office moves the repair on (Admin, Repairs); the reporter's phone sees it.
    office.mutate((d) => void (d.repairs.find((r) => r.id === repairId)!.status = "In hand"));
    await office.link.flush();
    await phone.poll();
    expect(useData.getState().db.repairs.find((r) => r.id === repairId)?.status).toBe("In hand");
  });

  it("the site manager's instructions for the day reach the office", async () => {
    actAs(SM, () => setDayInstruction(C719.id, DAY, "Lime delivery at 10:00 by the north gate"));
    await sent();
    const x = office.db().dayInstructions.find((d) => d.projectId === C719.id && d.date === DAY)!;
    expect(x.text).toBe("Lime delivery at 10:00 by the north gate");
    expect(x.by).toBe("Eoin Brosnan");
  });
});
