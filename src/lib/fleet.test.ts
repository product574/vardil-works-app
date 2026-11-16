import { describe, expect, it } from "vitest";
import { normaliseReg, parseSellAmount, regionOf } from "./fleet";

describe("sell amount when removing a vehicle", () => {
  it("is required (blank is rejected)", () => {
    expect(parseSellAmount("  ")).toEqual({ ok: false });
  });
  it("accepts NA for not sold", () => {
    expect(parseSellAmount("na")).toEqual({ ok: true, value: null });
    expect(parseSellAmount("N/A")).toEqual({ ok: true, value: null });
  });
  it("accepts a euro or pound amount", () => {
    expect(parseSellAmount("€4,500")).toEqual({ ok: true, value: 4500 });
    expect(parseSellAmount("£4,500")).toEqual({ ok: true, value: 4500 });
  });
  it("rejects other text", () => {
    expect(parseSellAmount("sold")).toEqual({ ok: false });
  });
});

describe("registration and garage region", () => {
  it("tidies a typed registration", () => {
    expect(normaliseReg(" 152 g 212 ")).toBe("152-G-212");
  });
  it("takes the region from the end of the garage location", () => {
    expect(regionOf("Oranmore, Galway")).toBe("Galway");
    expect(regionOf(null)).toBe("Unknown");
  });
});
