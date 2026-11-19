import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { givenSite, opensSite, seesEveryProject, siteAccessPeople, siteCell, siteCounts, sitesToShare } from "./site-access";

// Which sites a site manager may open: the ones they run, and any the managing director has
// given them in Admin, Site access (Oisin, 17 Nov).
const site = { id: "pr-C719", siteManagerId: "p-sm1" };
const grants = [{ personId: "p-sm5", projectId: "pr-C719" }];

describe("opening a site", () => {
  it("whoever runs it always opens it", () => expect(opensSite(site, "p-sm1", [])).toBe(true));
  it("another site manager does not, until it is given to them", () => {
    expect(opensSite(site, "p-sm5", [])).toBe(false);
    expect(opensSite(site, "p-sm5", grants)).toBe(true);
    expect(givenSite(grants, "p-sm5", "pr-C719")).toBe(true);
  });
  it("a site given to one person is not given to another, nor is another site", () => {
    expect(opensSite(site, "p-sm2", grants)).toBe(false);
    expect(opensSite({ id: "pr-C720", siteManagerId: "p-sm2" }, "p-sm5", grants)).toBe(false);
  });
  it("nobody signed in opens nothing", () => expect(opensSite(site, null, grants)).toBe(false));
});

describe("the Site access grid", () => {
  it("says how each site stands for each person", () => {
    expect(siteCell(site, "p-sm1", grants)).toBe("runs");
    expect(siteCell(site, "p-sm5", grants)).toBe("given");
    expect(siteCell(site, "p-sm2", grants)).toBe("no");
  });
  it("counts the sites someone runs and the ones given, never a site twice", () => {
    const sites = [site, { id: "pr-C723", siteManagerId: "p-sm5" }, { id: "pr-C720", siteManagerId: "p-sm2" }];
    expect(siteCounts(sites, "p-sm5", [...grants, { personId: "p-sm5", projectId: "pr-C723" }])).toEqual({ runs: 1, given: 1 });
    expect(siteCounts(sites, "p-sm1", grants)).toEqual({ runs: 1, given: 0 });
  });
  const { db } = buildSeed("2026-11-17");
  it("lists the sites that are live or about to start, in site code order", () => {
    expect(sitesToShare(db.projects).map((p) => p.code)).toEqual(["C719", "C720", "C721", "C722", "C723", "C724", "C725", "C726", "C727", "C728"]);
  });
  it("is for the site managers; people who see every project are listed apart", () => {
    const { choose, every } = siteAccessPeople(db);
    expect(choose.map((p) => p.name)).toEqual(["Cathal Minogue", "Darragh Lenihan", "Eoin Brosnan", "Róisín Garvey", "Shane Culloty"]);
    expect(every.map((p) => p.name)).toEqual(["Declan Furey", "Pat Scully"]);
    expect(seesEveryProject(db, "p-hs")).toBe(true);
    expect(seesEveryProject(db, "p-sm1")).toBe(false);
    expect(seesEveryProject(db, "p-cm1")).toBe(true);
  });
  it("opens with one example in the sample data: Shane Culloty can open Granary Quay, which Róisín Garvey runs", () => {
    expect(db.siteAccess.map((g) => [g.personId, g.projectId])).toEqual([["p-sm5", "pr-C725"]]);
    const c725 = db.projects.find((p) => p.code === "C725")!;
    expect(c725.siteManagerId).toBe("p-sm3");
    expect(opensSite(c725, "p-sm5", db.siteAccess)).toBe(true);
    // With the site comes its group chat.
    expect(db.chatChannels.find((c) => c.projectId === c725.id)?.memberIds).toContain("p-sm5");
  });
});
