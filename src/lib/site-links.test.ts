import { describe, expect, it } from "vitest";
import { fromPhone, instructionsUp, PHONE_MEASURE, variationHeadline } from "./site-links";

describe("site links", () => {
  it("names a variation from the phone by what the worker reported", () => {
    const v = { measured: PHONE_MEASURE, description: "Rotten timber found once opened up. Joist under the gallery" };
    expect(fromPhone(v)).toBe(true);
    expect(variationHeadline(v)).toBe("Rotten timber found once opened up. Joist under the gallery");
  });
  it("names an office variation by its measure, or its description when none is given", () => {
    expect(variationHeadline({ measured: "12 m2 of lime repointing", description: "Repointing" })).toBe("12 m2 of lime repointing");
    expect(variationHeadline({ measured: "  ", description: "Repointing" })).toBe("Repointing");
    expect(fromPhone({ measured: "12 m2" })).toBe(false);
  });
  it("lists a site's instructions from today on, soonest first, and skips empty ones", () => {
    const list = [
      { id: "a", projectId: "p1", date: "2026-11-23", text: "Tomorrow's", by: "Eoin", at: "2026-11-20T16:00" },
      { id: "b", projectId: "p1", date: "2026-11-20", text: "Today's", by: "Eoin", at: "2026-11-20T07:35" },
      { id: "c", projectId: "p1", date: "2026-11-19", text: "Yesterday's", by: "Eoin", at: "2026-11-19T07:35" },
      { id: "d", projectId: "p2", date: "2026-11-20", text: "Another site", by: "Róisín", at: "2026-11-20T07:00" },
      { id: "e", projectId: "p1", date: "2026-11-24", text: " ", by: "Eoin", at: "2026-11-20T07:00" },
    ];
    expect(instructionsUp(list, "p1", "2026-11-20").map((x) => x.id)).toEqual(["b", "a"]);
  });
});
