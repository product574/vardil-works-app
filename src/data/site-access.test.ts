import { beforeEach, describe, expect, it } from "vitest";
import { myChannels } from "@/lib/chat";
import { crewRequests, directorQueue, mayHandleCrewRequest, openRequestCount, requestsFor } from "@/lib/requests";
import { managerJobs } from "@/lib/roster";
import { opensSite, siteAccessPeople, siteCodes, siteManagerChoices, sitesToShare } from "@/lib/site-access";
import { actAs, addRequest, closeRequest, decideSiteRequest, setEmployeeActive, setPersonLevel, setSiteAccess, setSiteManager } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";

// Admin, Site access: the managing director decides which sites each site manager can open
// (Oisin, 17 Nov), and a site manager's general request, not tied to one site.
const DAY = "2026-11-17";
const db = () => useData.getState().db;
const site = (code: string) => db().projects.find((p) => p.code === code)!;
const EOIN = "p-sm1"; // runs C719 and C724
const CATHAL = "p-sm2"; // runs C720 and C727

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("giving a site manager a site they do not run", () => {
  it("makes it one of their own: their lists, their phone, its crew's requests and its group chat", () => {
    expect(opensSite(site("C720"), EOIN, db().siteAccess)).toBe(false);
    expect(openRequestCount(db(), EOIN)).toBe(2);
    setSiteAccess(EOIN, "pr-C720", true);
    expect(db().siteAccess.find((g) => g.personId === EOIN)).toMatchObject({ projectId: "pr-C720", by: "Aidan King" });
    expect(opensSite(site("C720"), EOIN, db().siteAccess)).toBe(true);
    expect(managerJobs(db().projects, EOIN, db().siteAccess).map((p) => p.code)).toEqual(["C719", "C720", "C724"]);
    // C720 has one request with the office and one from its crew.
    expect(openRequestCount(db(), EOIN)).toBe(4);
    expect(mayHandleCrewRequest(site("C720"), EOIN, db().siteAccess)).toBe(true);
    expect(myChannels(db().chatChannels, EOIN).channels.map((c) => c.name)).toContain("C720 Ardmullen House");
    expect(db().activity[0]).toMatchObject({ who: "Aidan King", what: "Gave a site manager access to a site", target: "Eoin Brosnan, C720 Ardmullen House" });
  });

  it("nothing said in the group chat before they joined counts as unread", () => {
    setSiteAccess(EOIN, "pr-C720", true);
    const ch = db().chatChannels.find((c) => c.projectId === "pr-C720")!;
    const last = db().chatMessages.filter((m) => m.channelId === ch.id).map((m) => m.at).sort().pop();
    expect(ch.lastRead[EOIN]).toBe(last);
  });

  it("taking it away puts everything back", () => {
    setSiteAccess(EOIN, "pr-C720", true);
    setSiteAccess(EOIN, "pr-C720", false);
    expect(db().siteAccess.some((g) => g.personId === EOIN)).toBe(false);
    expect(managerJobs(db().projects, EOIN, db().siteAccess).map((p) => p.code)).toEqual(["C719", "C724"]);
    expect(openRequestCount(db(), EOIN)).toBe(2);
    expect(mayHandleCrewRequest(site("C720"), EOIN, db().siteAccess)).toBe(false);
    const ch = db().chatChannels.find((c) => c.projectId === "pr-C720")!;
    expect(ch.memberIds).not.toContain(EOIN);
    expect(ch.lastRead[EOIN]).toBeUndefined();
    expect(db().activity[0]?.what).toBe("Took away access to a site");
  });

  it("whoever runs a site cannot have it taken away, and giving twice stores it once", () => {
    setSiteAccess(CATHAL, "pr-C720", false);
    setSiteAccess(CATHAL, "pr-C720", true);
    expect(db().siteAccess.some((g) => g.personId === CATHAL)).toBe(false);
    expect(opensSite(site("C720"), CATHAL, db().siteAccess)).toBe(true);
    setSiteAccess(EOIN, "pr-C720", true);
    setSiteAccess(EOIN, "pr-C720", true);
    expect(db().siteAccess.filter((g) => g.personId === EOIN)).toHaveLength(1);
    // Cathal still runs it and is still in its chat.
    expect(db().chatChannels.find((c) => c.projectId === "pr-C720")!.memberIds).toContain(CATHAL);
  });

  it("is dropped when someone is archived or moved off the site manager level", () => {
    setSiteAccess(EOIN, "pr-C720", true);
    setEmployeeActive(EOIN, false);
    expect(db().siteAccess.some((g) => g.personId === EOIN)).toBe(false);
    expect(db().chatChannels.find((c) => c.projectId === "pr-C720")!.memberIds).not.toContain(EOIN);
    // Shane Culloty has Granary Quay in the sample data; as a contracts manager he sees every project anyway.
    setPersonLevel("p-sm5", "contracts");
    expect(db().siteAccess).toHaveLength(0);
  });
});

describe("a site manager's general request, not for one site", () => {
  const ask = () => actAs(EOIN, () => addRequest({ projectId: null, kind: "other", description: "First aid refresher for my two crews", quantity: 1, neededFrom: "2026-11-18", neededTo: "2026-11-24", notes: "Sent from the site phone" }));

  it("goes straight to management, with who asked", () => {
    ask();
    expect(db().requests[0]).toMatchObject({ projectId: null, kind: "other", requestedBy: "Eoin Brosnan", requestedById: EOIN, status: "Open" });
    expect(db().requests[0]!.heldBy).toBeUndefined();
    expect(directorQueue(db()).site.map((r) => r.id)).toContain(db().requests[0]!.id);
    expect(db().activity[0]).toMatchObject({ who: "Eoin Brosnan", what: "Made a general request", target: "First aid refresher for my two crews, not for one site" });
  });

  it("is on the office's list and the asker's own, and nobody else's", () => {
    ask();
    const id = db().requests[0]!.id;
    const sees = (personId: string) => requestsFor(db(), personId).some((r) => r.id === id);
    expect(sees("p-md")).toBe(true);
    expect(sees("p-cm1")).toBe(true);
    expect(sees(EOIN)).toBe(true);
    expect(sees(CATHAL)).toBe(false);
    expect(openRequestCount(db(), EOIN)).toBe(3);
    expect(openRequestCount(db(), "p-md")).toBe(7);
    // It is not a request from a crew, on any site.
    expect(crewRequests(db().requests, db().projects.map((p) => p.id)).some((r) => r.id === id)).toBe(false);
  });

  it("a yes keeps it open until the office has arranged it; a no closes it", () => {
    ask();
    const id = db().requests[0]!.id;
    expect(decideSiteRequest(id, true)).toBe("open");
    expect(db().requests.find((r) => r.id === id)).toMatchObject({ status: "Open", decision: "Approved", decidedBy: "Aidan King" });
    expect(db().activity[0]).toMatchObject({ what: "Agreed a site request", target: "First aid refresher for my two crews, not for one site" });
    closeRequest(id);
    expect(db().requests.find((r) => r.id === id)).toMatchObject({ status: "Done", dealtBy: "Aidan King" });
    ask();
    expect(decideSiteRequest(db().requests[0]!.id, false)).toBe("declined");
    expect(db().requests[0]).toMatchObject({ status: "Done", decision: "Declined" });
  });
});

// Saying who runs a site (Oisin, 17 Nov: "make it easier to assign which site manager should be
// at which site").
describe("changing who runs a site", () => {
  const chat = (id: string) => db().chatChannels.find((c) => c.kind === "channel" && c.projectId === id)!;

  it("hands the site over: the new site manager has it everywhere, the one before does not", () => {
    expect(site("C720").siteManagerId).toBe(CATHAL);
    setSiteManager("pr-C720", EOIN);
    expect(site("C720").siteManagerId).toBe(EOIN);
    expect(managerJobs(db().projects, EOIN, db().siteAccess).map((p) => p.code)).toEqual(["C719", "C720", "C724"]);
    expect(managerJobs(db().projects, CATHAL, db().siteAccess).map((p) => p.code)).toEqual(["C727"]);
    expect(opensSite(site("C720"), CATHAL, db().siteAccess)).toBe(false);
    // The group chat follows: Eoin joins with nothing unread, Cathal leaves.
    expect(chat("pr-C720").memberIds).toContain(EOIN);
    expect(chat("pr-C720").memberIds).not.toContain(CATHAL);
    expect(myChannels(db().chatChannels, EOIN).channels.some((c) => c.projectId === "pr-C720")).toBe(true);
    // It is written on the project and in the activity log.
    expect(site("C720").audit.at(-1)).toMatchObject({ what: "Site manager changed to Eoin Brosnan, was Cathal Minogue", who: "Aidan King" });
    expect(db().activity[0]).toMatchObject({ what: "Changed who runs a site", target: "C720 Ardmullen House: Eoin Brosnan, was Cathal Minogue" });
  });

  it("sends the crew's requests to the new site manager", () => {
    actAs("p-103", () => addRequest({ projectId: "pr-C720", kind: "own_plant", description: "A second barrow", quantity: 1, neededFrom: "2026-11-18", neededTo: "2026-11-24", notes: "", heldBy: "site" }));
    expect(mayHandleCrewRequest(site("C720"), CATHAL, db().siteAccess)).toBe(true);
    setSiteManager("pr-C720", EOIN);
    expect(mayHandleCrewRequest(site("C720"), EOIN, db().siteAccess)).toBe(true);
    expect(mayHandleCrewRequest(site("C720"), CATHAL, db().siteAccess)).toBe(false);
    expect(crewRequests(db().requests, managerJobs(db().projects, EOIN, db().siteAccess).map((p) => p.id)).some((r) => r.description === "A second barrow")).toBe(true);
  });

  it("uses up a site that had been given: running it covers that", () => {
    // Shane Culloty was given C725 in the sample data; now he runs it.
    expect(db().siteAccess.some((g) => g.personId === "p-sm5" && g.projectId === "pr-C725")).toBe(true);
    const before = site("C725").siteManagerId;
    setSiteManager("pr-C725", "p-sm5");
    expect(site("C725").siteManagerId).toBe("p-sm5");
    expect(db().siteAccess.some((g) => g.personId === "p-sm5" && g.projectId === "pr-C725")).toBe(false);
    expect(chat("pr-C725").memberIds).toContain("p-sm5");
    expect(chat("pr-C725").memberIds).not.toContain(before);
    // The one before can be ticked back on as someone who opens it.
    setSiteAccess(before, "pr-C725", true);
    expect(opensSite(site("C725"), before, db().siteAccess)).toBe(true);
    expect(chat("pr-C725").memberIds).toContain(before);
  });

  it("is refused for someone who is not an active site manager, for the same person, and for a finished job", () => {
    setSiteManager("pr-C720", "p-cm1"); // a contracts manager
    setSiteManager("pr-C720", "p-103"); // an operative
    setSiteManager("pr-C720", CATHAL); // already runs it
    expect(site("C720").siteManagerId).toBe(CATHAL);
    setEmployeeActive(EOIN, false);
    setSiteManager("pr-C720", EOIN);
    expect(site("C720").siteManagerId).toBe(CATHAL);
    const done = db().projects.find((p) => p.status !== "Live" && p.status !== "Not started")!;
    const was = done.siteManagerId;
    setSiteManager(done.id, was === EOIN ? CATHAL : "p-sm3");
    expect(db().projects.find((p) => p.id === done.id)!.siteManagerId).toBe(was);
  });

  it("offers everyone at site manager level, by name, and whoever runs it now", () => {
    const names = siteManagerChoices(db(), site("C720")).map((p) => p.name);
    expect(names).toContain("Cathal Minogue");
    expect(names).toContain("Eoin Brosnan");
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).not.toContain("Tadhg Morrissey");
    // Someone moved off the level still shows on the site they run, so the box is never blank.
    setPersonLevel(CATHAL, "contracts");
    expect(siteManagerChoices(db(), site("C720")).map((p) => p.id)).toContain(CATHAL);
    expect(siteManagerChoices(db(), site("C719")).map((p) => p.id)).not.toContain(CATHAL);
  });

  it("sums up each site manager's sites as codes", () => {
    const sites = sitesToShare(db().projects);
    expect(siteCodes(sites, EOIN, db().siteAccess)).toEqual({ runs: ["C719", "C724"], given: [] });
    expect(siteCodes(sites, "p-sm5", db().siteAccess)).toEqual({ runs: ["C723", "C726"], given: ["C725"] });
    setSiteManager("pr-C720", EOIN);
    expect(siteCodes(sites.map((s) => site(s.code)), EOIN, db().siteAccess).runs).toEqual(["C719", "C720", "C724"]);
    expect(siteAccessPeople(db()).choose.map((p) => p.id)).toContain(EOIN);
  });
});
