import { beforeEach, describe, expect, it } from "vitest";
import { myChannels } from "@/lib/chat";
import { crewRequests, directorQueue, mayHandleCrewRequest, openRequestCount, requestsFor } from "@/lib/requests";
import { managerJobs } from "@/lib/roster";
import { opensSite } from "@/lib/site-access";
import { actAs, addRequest, closeRequest, decideSiteRequest, setEmployeeActive, setPersonLevel, setSiteAccess } from "./actions";
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
