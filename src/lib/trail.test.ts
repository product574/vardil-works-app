import { describe, expect, it } from "vitest";
import { arrive, canGoBack, NO_TRAIL, type Trail } from "./trail";

const walk = (steps: [string, "PUSH" | "REPLACE" | "POP", boolean?][], from: Trail = NO_TRAIL) => steps.reduce((t, [key, how, fresh]) => arrive(t, key, how, fresh), from);

describe("the trail behind the Back button", () => {
  it("starts with nowhere to go back to", () => {
    const t = walk([["a", "REPLACE", true]]);
    expect(t).toEqual({ keys: ["a"], at: 0 });
    expect(canGoBack(t)).toBe(false);
  });

  it("grows with each new screen and can go back", () => {
    const t = walk([["a", "REPLACE", true], ["b", "PUSH"], ["c", "PUSH"]]);
    expect(t).toEqual({ keys: ["a", "b", "c"], at: 2 });
    expect(canGoBack(t)).toBe(true);
  });

  it("follows back and forward without losing its place", () => {
    const t = walk([["a", "PUSH", true], ["b", "PUSH"], ["c", "PUSH"], ["b", "POP"], ["a", "POP"]]);
    expect(t.at).toBe(0);
    expect(canGoBack(t)).toBe(false);
    expect(canGoBack(arrive(t, "b", "POP"))).toBe(true);
  });

  it("drops what was ahead when a new screen is opened after going back", () => {
    const t = walk([["a", "PUSH", true], ["b", "PUSH"], ["c", "PUSH"], ["a", "POP"], ["d", "PUSH"]]);
    expect(t).toEqual({ keys: ["a", "d"], at: 1 });
  });

  it("a screen swapped in place does not add a step", () => {
    const t = walk([["a", "PUSH", true], ["b", "PUSH"], ["b2", "REPLACE"]]);
    expect(t).toEqual({ keys: ["a", "b2"], at: 1 });
    const mid = walk([["a", "PUSH", true], ["b", "PUSH"], ["c", "PUSH"], ["b", "POP"], ["b2", "REPLACE"]]);
    expect(mid).toEqual({ keys: ["a", "b2", "c"], at: 1 });
  });

  it("keeps its place over a reload", () => {
    const before = walk([["a", "PUSH", true], ["b", "PUSH"], ["c", "PUSH"]]);
    expect(arrive(before, "c", "POP", true)).toEqual({ keys: ["a", "b", "c"], at: 2 });
  });

  it("starts again after signing in or changing role", () => {
    const before = walk([["a", "PUSH", true], ["b", "PUSH"]]);
    expect(arrive(before, "z", "PUSH", true)).toEqual({ keys: ["z"], at: 0 });
    expect(arrive(before, "z", "REPLACE", true)).toEqual({ keys: ["z"], at: 0 });
  });

  it("starts again at a screen it has never seen, reached by the browser's own buttons", () => {
    const before = walk([["a", "PUSH", true], ["b", "PUSH"]]);
    expect(arrive(before, "elsewhere", "POP")).toEqual({ keys: ["elsewhere"], at: 0 });
  });

  it("ignores being told about the screen it is already on", () => {
    const t = walk([["a", "PUSH", true], ["b", "PUSH"]]);
    expect(arrive(t, "b", "PUSH")).toBe(t);
  });
});
