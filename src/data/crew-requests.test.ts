import { beforeEach, describe, expect, it } from "vitest";
import { actAs, addRequest, closeRequest, decideSiteRequest, forwardCrewRequest, requestPerson, setDayInstruction } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { directorQueue, crewRequests } from "@/lib/requests";

// What happens to a request made on an operative's phone, a named person asked for from the
// phone planner, and the day's site instructions (Oisin, 17 Nov).
const DAY = "2026-11-17";
const db = () => useData.getState().db;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("a request from an operative's phone", () => {
  it("waits with the site manager, and the director is not asked yet", () => {
    actAs("p-103", () => addRequest({ projectId: "pr-C719", kind: "own_plant", description: "A second barrow", quantity: 1, neededFrom: "2026-11-18", neededTo: "2026-11-24", notes: "", heldBy: "site" }));
    expect(db().requests[0]).toMatchObject({ requestedBy: "Marek Wiśniewski", heldBy: "site", status: "Open" });
    expect(crewRequests(db().requests, ["pr-C719"])).toHaveLength(2);
    expect(directorQueue(db()).site).toHaveLength(4);
    expect(decideSiteRequest(db().requests[0]!.id, true)).toBeNull();
  });
  it("forwarded, it becomes the site manager's own request to management, with the operative kept", () => {
    actAs("p-sm1", () => forwardCrewRequest("rq-7"));
    const r = db().requests.find((x) => x.id === "rq-7")!;
    expect(r).toMatchObject({ requestedBy: "Eoin Brosnan", raisedBy: "Marek Wiśniewski", status: "Open" });
    expect(r.heldBy).toBeUndefined();
    expect(directorQueue(db()).site.map((x) => x.id)).toContain("rq-7");
    expect(db().activity[0]).toMatchObject({ who: "Eoin Brosnan", what: "Forwarded a crew request to management" });
    expect(decideSiteRequest("rq-7", true)).toBe("open");
  });
  it("marked dealt with, it never reaches management", () => {
    actAs("p-sm1", () => closeRequest("rq-7"));
    expect(db().requests.find((x) => x.id === "rq-7")).toMatchObject({ status: "Done", heldBy: "site", dealtBy: "Eoin Brosnan" });
    expect(directorQueue(db()).site.map((x) => x.id)).not.toContain("rq-7");
  });
});

describe("asking for a named person from the phone planner", () => {
  const monday = "2026-11-23";
  it("goes to management; a yes puts a free person on the plan for that day and closes the request", () => {
    // Rafael Mendonça is free all of next week in the sample data.
    const rafael = db().people.find((p) => p.name === "Rafael Mendonça")!.id;
    actAs("p-sm1", () => requestPerson("pr-C719", rafael, monday, "Lime wash to the vestry"));
    const r = db().requests[0]!;
    expect(r).toMatchObject({ kind: "personnel", description: "Rafael Mendonça on site", neededFrom: monday, neededTo: monday, requestedBy: "Eoin Brosnan", personId: rafael });
    expect(directorQueue(db()).site.map((x) => x.id)).toContain(r.id);
    expect(db().plan.some((p) => p.personId === rafael && p.date === monday)).toBe(false);
    expect(decideSiteRequest(r.id, true)).toBe("planned");
    expect(db().plan.filter((p) => p.personId === rafael && p.date === monday).map((p) => p.projectId)).toEqual(["pr-C719"]);
    expect(db().requests.find((x) => x.id === r.id)).toMatchObject({ status: "Done", decision: "Approved" });
  });
  it("a yes for someone busy elsewhere changes no plan: it stays open for the office", () => {
    const florin = db().people.find((p) => p.name === "Florin Dobre")!.id;
    actAs("p-sm1", () => requestPerson("pr-C719", florin, monday, ""));
    const id = db().requests[0]!.id;
    const before = db().plan.length;
    expect(decideSiteRequest(id, true)).toBe("open");
    expect(db().plan.length).toBe(before);
    expect(db().requests.find((x) => x.id === id)).toMatchObject({ status: "Open", decision: "Approved" });
  });
  it("a no closes it and changes no plan", () => {
    const rafael = db().people.find((p) => p.name === "Rafael Mendonça")!.id;
    actAs("p-sm1", () => requestPerson("pr-C719", rafael, monday, ""));
    expect(decideSiteRequest(db().requests[0]!.id, false)).toBe("declined");
    expect(db().plan.some((p) => p.personId === rafael && p.date === monday)).toBe(false);
  });
});

describe("site instructions for the day", () => {
  it("one per site and day: putting up again replaces, empty takes down", () => {
    expect(db().dayInstructions).toHaveLength(2);
    actAs("p-sm1", () => setDayInstruction("pr-C719", DAY, "  Delivery at the west gate at 11:00.  "));
    expect(db().dayInstructions.filter((x) => x.projectId === "pr-C719" && x.date === DAY)).toMatchObject([{ text: "Delivery at the west gate at 11:00.", by: "Eoin Brosnan" }]);
    actAs("p-sm1", () => setDayInstruction("pr-C719", "2026-11-18", "Hard hats in the nave."));
    expect(db().dayInstructions).toHaveLength(3);
    actAs("p-sm1", () => setDayInstruction("pr-C719", DAY, ""));
    expect(db().dayInstructions.some((x) => x.projectId === "pr-C719" && x.date === DAY)).toBe(false);
    expect(db().activity[0]!.what).toBe("Took down the day's site instructions");
  });
});
