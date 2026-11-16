import { describe, expect, it } from "vitest";
import { dedupeTasks, historyRange, lineTotal, uniqueDisplayName } from "./controls";

describe("history filters", () => {
  it("last 7 days is today plus previous six days", () => {
    expect(historyRange({ mode: "7d" }, "2026-11-06")).toEqual({ from: "2026-10-31", to: "2026-11-06" });
  });
  it("picked month covers the whole month", () => {
    expect(historyRange({ mode: "pick", month: "2026-02" }, "2026-11-06")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("all time has no range", () => {
    expect(historyRange({ mode: "all" })).toBeNull();
  });
});

describe("file names", () => {
  it("never overwrites a matching filename", () => {
    expect(uniqueDisplayName("invoice.pdf", ["invoice.pdf"])).toBe("invoice (2).pdf");
    expect(uniqueDisplayName("invoice.pdf", ["invoice.pdf", "invoice (2).pdf"])).toBe("invoice (3).pdf");
  });
});

describe("scope import", () => {
  it("skips duplicates ignoring case and spaces, against existing and within batch", () => {
    expect(dedupeTasks(["Pour  slab", "pour slab", "Fit doors", ""], ["POUR SLAB"])).toEqual(["Fit doors"]);
  });
});

describe("material cost", () => {
  it("only calculates when quantity and price are both entered", () => {
    expect(lineTotal(3, 12.5)).toBe(37.5);
    expect(lineTotal(3, null)).toBeNull();
  });
});
