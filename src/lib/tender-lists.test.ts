import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { averagePct, estMargin, LOST_DAYS, lostLately, projectEstMargin, tenderList } from "./tenders";
import { customerMargins, jobRow } from "./reports";
import { addDays } from "./dates";

const today = "2026-11-20";
const q = (status: string, respondedAt?: string) => ({ id: "q1", status, respondedAt }) as never;

describe("tender lists (21 Nov)", () => {
  it("puts each tender in one list", () => {
    expect(tenderList(q("Draft"), [], today)).toBe("pricing");
    expect(tenderList(q("Awaiting approval"), [], today)).toBe("pricing");
    expect(tenderList(q("Sent"), [], today)).toBe("out");
    expect(tenderList(q("Queried"), [], today)).toBe("out");
  });
  it("keeps a won tender as won, live until its job is closed", () => {
    for (const status of ["Not started", "Live", "Complete", "Invoiced"]) expect(tenderList(q("Accepted", today), [{ quoteId: "q1", status } as never], today)).toBe("won");
    expect(tenderList(q("Accepted", "2025-01-01"), [{ quoteId: "q1", status: "Closed" } as never], today)).toBe("archive");
  });
  it("keeps a lost tender 90 days, then archives it", () => {
    expect(tenderList(q("Declined", `${addDays(today, -LOST_DAYS)}T10:00`), [], today)).toBe("lost");
    expect(tenderList(q("Declined", `${addDays(today, -LOST_DAYS - 1)}T10:00`), [], today)).toBe("archive");
    expect(lostLately(q("Declined", `${addDays(today, -3)}T10:00`), today)).toBe(true);
    expect(lostLately(q("Sent", `${addDays(today, -3)}T10:00`), today)).toBe(false);
  });
});

describe("estimated margin", () => {
  const { db } = buildSeed(today);
  it("comes from the tender's cost build-up, fixed for a job won from one", () => {
    const p = db.projects.find((x) => x.quoteId)!;
    const tender = db.quotes.find((x) => x.id === p.quoteId)!;
    expect(projectEstMargin({ ...p, estMargin: 99 }, db.quotes)).toBe(estMargin(tender));
  });
  it("is the typed figure, or none, for a job with no tender", () => {
    expect(projectEstMargin({ estMargin: 21.5 }, db.quotes)).toBe(21.5);
    expect(projectEstMargin({}, db.quotes)).toBeNull();
  });
  it("averages what is there", () => {
    expect(averagePct([10, null, 20, undefined, 25])).toBe(18.3);
    expect(averagePct([null])).toBeNull();
  });
  it("gives every tender in the sample data an estimated margin", () => {
    expect(db.quotes.every((x) => estMargin(x) != null)).toBe(true);
  });
});

describe("a customer's margins", () => {
  const { db } = buildSeed(today);
  it("counts finished jobs only, never estimates from running or unstarted ones", () => {
    for (const c of db.clients) {
      const finished = db.projects.filter((p) => p.clientId === c.id && ["Complete", "Invoiced", "Closed"].includes(p.status) && (p.value ?? 0) > 0);
      const m = customerMargins(db, c.id);
      expect(m.jobs).toBe(finished.length);
      expect(m.actual).toBe(averagePct(finished.map((p) => jobRow(db, p).pct)));
      expect(m.estimated).toBe(averagePct(finished.map((p) => projectEstMargin(p, db.quotes))));
    }
  });
  it("leaves a customer with only live work blank", () => {
    const c = db.clients.find((x) => db.projects.some((p) => p.clientId === x.id) && db.projects.filter((p) => p.clientId === x.id).every((p) => ["Live", "Not started"].includes(p.status)));
    if (c) expect(customerMargins(db, c.id)).toMatchObject({ jobs: 0, actual: null, estimated: null });
  });
});
