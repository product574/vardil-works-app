import { beforeEach, describe, expect, it } from "vitest";
import { openSnags } from "@/lib/snags";
import { addSnag, clearHold, fixSnag, raiseExtra, reopenSnag } from "./actions";
import { useData } from "./store";

const db = () => useData.getState().db;
const project = (code: string) => db().projects.find((p) => p.code === code)!;
const finalOf = (code: string) => db().salesInvoices.find((i) => i.projectId === project(code).id && i.description === "Final account")!;

describe("snags and the final account (decision 234)", () => {
  beforeEach(() => useData.getState().reset());

  it("the sample data: every job on hold for snagging has an open snag, and no other job has one", () => {
    for (const p of db().projects) expect(openSnags(db().snags, p.id).length > 0, p.code).toBe(p.snaggingFlag);
    expect(openSnags(db().snags, project("C716").id)).toHaveLength(3);
    expect(db().snags.filter((s) => s.projectId === project("C715").id).every((s) => s.status === "Fixed")).toBe(true);
    // Raised before fixed, and nothing dated ahead of the demo's day.
    for (const s of db().snags) if (s.fixedAt) expect(s.fixedAt >= s.raisedAt, s.what).toBe(true);
  });

  it("fixing the last open snag lets the final account go; opening one again holds it", () => {
    const p = project("C716");
    expect([p.invoiceHold, finalOf("C716").status]).toEqual([true, "Held"]);
    const open = openSnags(db().snags, p.id);
    open.slice(0, -1).forEach((s) => fixSnag(s.id));
    expect([project("C716").snaggingFlag, finalOf("C716").status]).toEqual([true, "Held"]);
    fixSnag(open.at(-1)!.id);
    expect([project("C716").snaggingFlag, project("C716").invoiceHold, finalOf("C716").status, finalOf("C716").holdReason]).toEqual([false, false, "To invoice", undefined]);
    expect(project("C716").audit.at(-1)!.what).toContain("No snags left: final account released");
    reopenSnag(open[0]!.id);
    expect([project("C716").snaggingFlag, finalOf("C716").status, finalOf("C716").holdReason]).toEqual([true, "Held", "Snagging open"]);
  });

  it("a snag added to a finished job with variations waiting keeps it on hold for both, until both are settled", () => {
    const p = project("C715");
    expect([p.extrasFlag, p.snaggingFlag, finalOf("C715").status]).toEqual([true, false, "Held"]);
    addSnag(p.id, { what: "Pointing missed at the pier cap", where: "East end", from: "client", fixBy: "Whoever" });
    const s = db().snags[0]!;
    expect([s.status, s.what, s.where, s.from, s.fixBy, s.projectId]).toEqual(["Open", "Pointing missed at the pier cap", "East end", "client", "Whoever", p.id]);
    expect([project("C715").snaggingFlag, finalOf("C715").holdReason]).toEqual([true, "Variations to be agreed and snagging open"]);
    fixSnag(s.id);
    // Still held: the variation is not agreed.
    expect([project("C715").snaggingFlag, project("C715").invoiceHold, finalOf("C715").status]).toEqual([false, true, "Held"]);
    expect(db().activity.slice(0, 2).map((a) => a.what)).toEqual(["Marked a snag fixed", "Added a snag"]);
  });

  it("a snag on a live job holds nothing yet, and one cannot be added to a job that is closed out or with nothing said", () => {
    const live = db().projects.find((p) => p.status === "Live" && !p.invoiceHold)!;
    addSnag(live.id, { what: "Gutter bracket loose", where: "", from: "own" });
    expect([db().projects.find((p) => p.id === live.id)!.snaggingFlag, db().snags[0]!.fixBy, db().snags[0]!.photo]).toEqual([true, undefined, undefined]);
    const n = db().snags.length;
    addSnag(live.id, { what: "   ", where: "", from: "own" });
    const closed = db().projects.find((p) => p.status === "Closed")!;
    addSnag(closed.id, { what: "Too late", where: "", from: "client" });
    expect(db().snags.length).toBe(n);
  });

  it("a manager clearing the hold releases the final account and leaves the snags on the list", () => {
    clearHold(project("C716").id);
    expect([project("C716").invoiceHold, finalOf("C716").status, openSnags(db().snags, project("C716").id).length]).toEqual([false, "To invoice", 3]);
    expect(project("C716").audit.at(-1)!.what).toBe("Final account hold cleared by a manager, with 3 snags still open");
  });

  it("a variation raised from the office is drafted for approval, with wording that says so", () => {
    const p = project("C716");
    raiseExtra(p.id, { description: "Cill rotten under the paint", measured: "1 no. oak cill, 1.4 m", estimatedValue: 420 });
    expect(db().approvals[0]!.rationale).toContain("in the office");
    expect(project("C716").audit.at(-1)!.what).toBe("Variation raised: 1 no. oak cill, 1.4 m");
  });
});
