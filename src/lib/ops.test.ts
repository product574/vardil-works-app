import { describe, expect, it } from "vitest";
import type { DamageReport, VehicleCheck } from "@/data/types";
import { checkToday, needsLook, officeFeed } from "./ops";

const checks: VehicleCheck[] = [
  { id: "c3", vehicleId: "v2", personId: "p2", at: "2026-11-18T07:40:00", defects: [{ item: "Tyres", note: "Nearside rear low" }] },
  { id: "c2", vehicleId: "v1", personId: "p1", at: "2026-11-18T07:10:00", defects: [] },
  { id: "c1", vehicleId: "v3", personId: "p3", at: "2026-11-17T07:05:00", defects: [] },
];
const damage: DamageReport[] = [{ id: "d1", vehicleId: "v1", driverId: "p1", at: "2026-11-18T10:15:00", where: "Site gate", note: "Mirror clipped.", photos: [], status: "New" }];
const input = { checks, damage, licences: [{ driverId: "p3", which: "cpc" as const, at: "2026-11-18T09:30:00", expiryDate: "2031-11-18" }], reg: (id: string) => id.toUpperCase(), driver: (id: string | null) => (id ? `Person ${id}` : "Someone"), siteOf: (id: string) => (id === "v1" ? "C721" : "") };

describe("the office feed beside the phone", () => {
  it("lists today's checks, defects, damage and licences, newest first", () => {
    const feed = officeFeed(input, "2026-11-18T00:00");
    expect(feed.map((f) => f.kind)).toEqual(["damage", "licence", "defect", "check"]);
    expect(feed[0]!.title).toBe("Damage reported, V1 (C721)");
    expect(feed[1]!.title).toBe("New Driver CPC sent, Person p3");
    expect(feed[2]!.detail).toBe("Tyres: Nearside rear low. Person p2.");
  });
  it("takes in other phone items in time order", () => {
    const feed = officeFeed({ ...input, other: [{ at: "2026-11-18T08:00:00", kind: "photo", title: "Photo", detail: "x" }, { at: "2026-11-17T08:00:00", kind: "extra", title: "Old", detail: "" }] }, "2026-11-18T00:00");
    expect(feed.map((f) => f.kind)).toEqual(["damage", "licence", "photo", "defect", "check"]);
  });
  it("counts a check only on the day", () => {
    expect(checkToday(checks, "v1", "2026-11-18")?.id).toBe("c2");
    expect(checkToday(checks, "v3", "2026-11-18")).toBeUndefined();
  });
  it("puts damage and defects first, then vans on a site with no check, after 09:00", () => {
    const feed = officeFeed(input, "2026-11-18T00:00");
    const driving = [{ vehicleId: "v1", driverId: "p1", site: "C721" }, { vehicleId: "v3", driverId: "p3", site: "C719" }];
    expect(needsLook(feed, driving, input, "2026-11-18T08:30").map((f) => f.kind)).toEqual(["damage", "defect"]);
    const late = needsLook(feed, driving, input, "2026-11-18T09:05");
    expect(late.map((f) => f.kind)).toEqual(["damage", "defect", "missed"]);
    expect(late[2]!.title).toBe("No driving check yet, V3");
    expect(late[2]!.detail).toBe("Person p3 is on C719 today.");
  });
});
