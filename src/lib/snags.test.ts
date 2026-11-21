import { describe, expect, it } from "vitest";
import { holdLines, openSnags, snagCount, takesRequests, takesSnags, takesVariations, holdWords } from "./snags";

const snags = [
  { projectId: "a", status: "Open" as const },
  { projectId: "a", status: "Fixed" as const },
  { projectId: "a", status: "Open" as const },
  { projectId: "b", status: "Fixed" as const },
];

describe("the snag list (decision 234)", () => {
  it("counts a job's open and fixed snags, and no other job's", () => {
    expect(openSnags(snags, "a")).toHaveLength(2);
    expect(snagCount(snags, "a")).toEqual({ open: 2, fixed: 1, total: 3 });
    expect(snagCount(snags, "b")).toEqual({ open: 0, fixed: 1, total: 1 });
    expect(snagCount(snags, "c")).toEqual({ open: 0, fixed: 0, total: 0 });
  });

  it("takes snags and variations while a job is on site or finished, and requests only until it finishes", () => {
    const by = (f: (p: { status: never }) => boolean) => (["Not started", "Live", "Complete", "Invoiced", "Closed"] as const).filter((status) => f({ status: status as never }));
    expect(by(takesSnags)).toEqual(["Live", "Complete"]);
    expect(by(takesVariations)).toEqual(["Live", "Complete"]);
    expect(by(takesRequests)).toEqual(["Not started", "Live"]);
  });

  it("says why a final account is on hold and what lets it go", () => {
    const vars = [{ projectId: "a", status: "Draft" as const }, { projectId: "a", status: "Approved" as const }];
    expect(holdLines({ id: "a", extrasFlag: true, snaggingFlag: true }, vars, snags)).toEqual([
      { why: "1 variation is waiting for approval", lets: "approving or discarding it" },
      { why: "2 snags are open", lets: "marking each one fixed" },
    ]);
    expect(holdLines({ id: "a", extrasFlag: false, snaggingFlag: true }, vars, [snags[0]!])).toEqual([{ why: "1 snag is open", lets: "marking it fixed" }]);
    expect(holdLines({ id: "a", extrasFlag: false, snaggingFlag: false }, vars, snags)).toEqual([]);
  });

  it("Finance says a hold in one sentence: why, and what lets it go (decision 246)", () => {
    const p = { id: "pr-1", extrasFlag: true, snaggingFlag: true };
    const variations = [{ projectId: "pr-1", status: "Draft" as const }];
    const snags = [{ projectId: "pr-1", status: "Open" as const }, { projectId: "pr-1", status: "Open" as const }, { projectId: "pr-1", status: "Fixed" as const }];
    expect(holdWords(p, variations, snags)).toBe("On hold because 1 variation is waiting for approval and 2 snags are open. It lets go by approving or discarding it, and marking each one fixed.");
    // A hold put on by hand, with nothing open behind it.
    expect(holdWords({ id: "pr-2", extrasFlag: false, snaggingFlag: false }, [], [], "A manager has held it")).toBe("On hold: a manager has held it. It lets go when a manager clears the hold on the project.");
    expect(holdWords(undefined, [], [])).toBe("On hold. It lets go when a manager clears the hold on the project.");
  });
});
