import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { crewRequests, directorQueue, mayHandleCrewRequest, openRequestCount, withOffice, withSite } from "./requests";

const { db } = buildSeed("2026-11-17");

describe("requests from the crew", () => {
  it("a request is with the site manager or with the office, never both", () => {
    expect([withSite({ status: "Open", heldBy: "site" }), withOffice({ status: "Open", heldBy: "site" })]).toEqual([true, false]);
    expect([withSite({ status: "Open" }), withOffice({ status: "Open" })]).toEqual([false, true]);
    expect([withSite({ status: "Done", heldBy: "site" }), withOffice({ status: "Done" })]).toEqual([false, false]);
  });
  it("the sample data has crew requests waiting on two site managers, oldest first", () => {
    const eoin = crewRequests(db.requests, ["pr-C719", "pr-C724"]);
    expect(eoin.map((r) => r.requestedBy)).toEqual(["Marek Wiśniewski"]);
    expect(crewRequests(db.requests, db.projects.map((p) => p.id))).toHaveLength(2);
  });
  it("the director is not asked about them until they are forwarded", () => {
    expect(directorQueue(db).site.every((r) => r.heldBy !== "site")).toBe(true);
    expect(directorQueue(db).site).toHaveLength(4);
  });
  it("only a site manager who opens the site may deal with one: whoever runs it, or someone given it", () => {
    const site = { id: "pr-C719", siteManagerId: "p-sm1" };
    expect(mayHandleCrewRequest(site, "p-sm1", [])).toBe(true);
    expect(mayHandleCrewRequest(site, "p-sm2", [])).toBe(false);
    expect(mayHandleCrewRequest(site, "p-md", [])).toBe(false);
    expect(mayHandleCrewRequest(site, "p-sm2", [{ personId: "p-sm2", projectId: "pr-C719" }])).toBe(true);
    expect(mayHandleCrewRequest(site, "p-sm2", [{ personId: "p-sm2", projectId: "pr-C720" }])).toBe(false);
    expect(mayHandleCrewRequest(undefined, null, [])).toBe(false);
  });
  it("the sidebar number matches the screen: everything open for the office, only their own sites for a site manager", () => {
    // Seven since 21 Nov: the scissor lift for C722 is agreed and still open until it is on hire.
    expect(openRequestCount(db, "p-md")).toBe(7);
    expect(openRequestCount(db, "p-cm1")).toBe(7);
    // Eoin runs C719 and C724: his own request to the office and one from his crew.
    expect(openRequestCount(db, "p-sm1")).toBe(2);
    // The health and safety officer is at site manager level but sees every project.
    expect(openRequestCount(db, "p-hs")).toBe(7);
  });
});
