import { describe, expect, it } from "vitest";
import { CHECK_ITEMS, checkedCount, checkReady, DRIVING_CHECK } from "./driving";

describe("driving check", () => {
  it("has three sections and ten items, as asked for", () => {
    expect(DRIVING_CHECK.map((s) => s.items.length)).toEqual([4, 4, 2]);
    expect(CHECK_ITEMS).toHaveLength(10);
  });
  it("is ready only when everything is answered and every defect has a note", () => {
    const all = Object.fromEntries(CHECK_ITEMS.map((i) => [i, { ok: true }]));
    expect(checkReady(all)).toBe(true);
    expect(checkReady({ ...all, [CHECK_ITEMS[0]!]: { ok: false } })).toBe(false);
    expect(checkReady({ ...all, [CHECK_ITEMS[0]!]: { ok: false, note: "Cracked mirror" } })).toBe(true);
    const { [CHECK_ITEMS[9]!]: _, ...missing } = all;
    expect(checkReady(missing)).toBe(false);
    expect(checkedCount(missing)).toBe(9);
  });
  it("uses no long dashes", () => expect(CHECK_ITEMS.join(" ")).not.toMatch(/[–—]/));
});
