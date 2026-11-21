import { beforeEach, describe, expect, it } from "vitest";
import { hiresToArrange } from "@/lib/ways-in";
import { spendStage, toOrder } from "@/lib/buying";
import { subFlags } from "@/lib/compliance";
import { pipeline } from "@/lib/tenders";
import { actAs, addCompanyPaper, addProject, addSubcontractor, askToSpend, decideSpend, markDelivered, placeOrder, putOnHire, startProject, undoDelivered } from "./actions";
import { getDay, useData } from "./store";

const db = () => useData.getState().db;
const project = (code: string) => db().projects.find((p) => p.code === code)!;

describe("more ways in (decisions 239 to 247)", () => {
  beforeEach(() => useData.getState().reset());

  it("the sample data has one hire agreed and waiting, and one purchase agreed and waiting to be ordered", () => {
    expect(hiresToArrange(db().requests).map((r) => r.id)).toEqual(["rq-9"]);
    expect(toOrder(db().spendRequests).map((s) => s.id).sort()).toEqual(["sp-4", "sp-5"]);
  });

  it("putting an agreed request on hire records the hire and marks the request dealt with", () => {
    const r = db().requests.find((x) => x.id === "rq-9")!;
    const before = db().hiredPlant.length;
    const id = putOnHire({ projectId: r.projectId!, description: r.description, quantity: 1, hireCompany: "Shannonside Access Hire", hirePhone: "061 555 0100", hireRef: "", onHireFrom: getDay(), rate: 310, rateUnit: "week", notes: "" }, r.id);
    expect(id).toBeTruthy();
    const h = db().hiredPlant.find((x) => x.id === id)!;
    expect([db().hiredPlant.length, h.status, h.projectId, h.hireRef, h.requestId, h.rate]).toEqual([before + 1, "On hire", "pr-C722", "To follow", "rq-9", 310]);
    const after = db().requests.find((x) => x.id === "rq-9")!;
    expect([after.status, !!after.dealtBy]).toEqual(["Done", true]);
    expect(hiresToArrange(db().requests)).toHaveLength(0);
    expect(project("C722").audit.at(-1)!.what).toContain("Plant on hire");
    expect(db().activity[0]!.what).toBe("Put plant on hire");
  });

  it("a hire nobody asked for goes on the same list; an incomplete form saves nothing", () => {
    const before = db().hiredPlant.length;
    expect(putOnHire({ projectId: "pr-C720", description: "Dehumidifier", quantity: 2, hireCompany: "", hirePhone: "", hireRef: "", onHireFrom: getDay(), rate: 40, rateUnit: "week", notes: "" })).toBeNull();
    expect(db().hiredPlant).toHaveLength(before);
    expect(putOnHire({ projectId: "pr-C720", description: "Dehumidifier", quantity: 2, hireCompany: "Corrib Hire", hirePhone: "", hireRef: "CH-9", onHireFrom: getDay(), rate: 40, rateUnit: "week", notes: "" })).toBeTruthy();
    expect([db().hiredPlant[0]!.quantity, db().hiredPlant[0]!.hireRef, db().hiredPlant[0]!.requestId]).toEqual([2, "CH-9", undefined]);
  });

  it("a new subcontractor starts with no papers, so its insurances and safety statement are flagged, and a method statement for each site", () => {
    const id = addSubcontractor({ name: "Lough Derg Roofing", trade: "Roofing", contactName: "Ann Tierney", email: "Accounts@LoughDerg.example", phone: "087 555 0142", termsDays: 30, projectIds: ["pr-C721"] })!;
    const s = db().subcontractors.find((x) => x.id === id)!;
    expect([s.accountRef, s.email, s.papers.length, s.workers.length, s.projectIds]).toEqual(["LOUDER", "accounts@loughderg.example", 0, 0, ["pr-C721"]]);
    const flags = subFlags(s, db().projects.filter((p) => p.status === "Live").map((p) => ({ id: p.id, code: p.code })), getDay());
    expect(flags.length).toBeGreaterThanOrEqual(4);
    expect(flags.join(" ")).toContain("C721");
    // The same name twice is refused.
    expect(addSubcontractor({ name: "lough derg roofing", trade: "Roofing", contactName: "Ann", email: "", phone: "1", termsDays: 30, projectIds: [] })).toBeNull();
    expect(db().activity[0]!.what).toBe("Added a subcontractor");
  });

  it("a project without a tender gets the next code, its scope, and counts in the confirmed orders; Start on site makes it live", () => {
    const codes = db().projects.map((p) => Number(p.code.slice(1)));
    const before = pipeline(db().quotes, db().projects);
    const code = addProject({ clientId: db().clients[0]!.id, name: "Gate lodge chimney", location: "Athenry", county: "Galway", description: "Rebuild the storm-damaged stack", pricedBy: "Agreed price", value: 8400, orderRef: "PO 4471", startDate: getDay(), endDate: "2099-01-01", siteManagerId: "p-sm1", contractsManagerId: "p-cm1", scope: "Scaffold to the stack\nRebuild in lime mortar\n\n- New lead flashings" });
    expect(code).toBe(`C${Math.max(...codes) + 1}`);
    const p = project(code);
    expect([p.status, p.value, p.pricedBy, p.orderRef, p.quoteId, p.siteManagerId, p.plannedEnd]).toEqual(["Not started", 8400, "Agreed price", "PO 4471", undefined, "p-sm1", "2099-01-01"]);
    expect(db().scopeTasks.filter((t) => t.projectId === p.id).map((t) => t.description)).toEqual(["Scaffold to the stack", "Rebuild in lime mortar", "New lead flashings"]);
    const after = pipeline(db().quotes, db().projects);
    expect(after.confirmed.length).toBe(before.confirmed.length + 1);
    expect(after.confirmedValue).toBe(before.confirmedValue + 8400);
    startProject(p.id);
    expect([project(code).status, project(code).audit.at(-1)!.what]).toEqual(["Live", "Work started on site"]);
    expect(pipeline(db().quotes, db().projects).confirmed.length).toBe(before.confirmed.length);
  });

  it("an unpriced job has no value; a job with no client or site manager is not added", () => {
    const n = db().projects.length;
    expect(addProject({ clientId: "", name: "X", location: "Y", county: "Galway", description: "Z", pricedBy: "Unpriced", value: null, orderRef: "", startDate: getDay(), endDate: getDay(), siteManagerId: "p-sm1", contractsManagerId: "p-cm1", scope: "" })).toBe("");
    expect(db().projects).toHaveLength(n);
    const code = addProject({ clientId: db().clients[0]!.id, name: "Emergency propping", location: "Loughrea", county: "Galway", description: "Prop the gable after the storm", pricedBy: "Unpriced", value: 500, orderRef: "", startDate: getDay(), endDate: getDay(), siteManagerId: "p-sm1", contractsManagerId: "p-cm1", scope: "" });
    expect([project(code).value, project(code).pricedBy]).toEqual([null, "Unpriced"]);
    expect(db().scopeGroups.some((g) => g.projectId === project(code).id)).toBe(false);
  });

  it("buying, end to end: ask, yes, order placed, delivered, and Undo", () => {
    const id = actAs("p-sm1", () => askToSpend({ projectId: "pr-C719", what: "Lime putty, 20 tubs", supplier: "", amount: 680, reason: "The store is down to four" }))!;
    const s = () => db().spendRequests.find((x) => x.id === id)!;
    expect([s().status, s().requestedById, s().supplier, spendStage(s(), db().supplies)]).toEqual(["Waiting", "p-sm1", "Not chosen yet", "waiting"]);
    // No order before the yes.
    expect(placeOrder(id, { supplier: "Burren Lime and Stone Supplies", dueOn: getDay() })).toBeNull();
    decideSpend(id, true);
    expect(spendStage(s(), db().supplies)).toBe("to-order");
    const orderId = placeOrder(id, { supplier: "Burren Lime and Stone Supplies", dueOn: getDay() })!;
    const o = () => db().supplies.find((x) => x.id === orderId)!;
    expect([o().status, o().projectId, o().from, o().amount, o().spendId, s().orderId, s().supplier, spendStage(s(), db().supplies)]).toEqual(["Ordered", "pr-C719", "Burren Lime and Stone Supplies", 680, id, orderId, "Burren Lime and Stone Supplies", "ordered"]);
    // It cannot be ordered twice.
    expect(placeOrder(id, { supplier: "Someone else", dueOn: getDay() })).toBeNull();
    actAs("p-sm1", () => markDelivered(orderId));
    expect([o().status, o().deliveredOn, o().deliveredBy, spendStage(s(), db().supplies)]).toEqual(["Delivered", getDay(), "Eoin Brosnan", "delivered"]);
    expect(project("C719").audit.at(-1)!.what).toContain("Delivered: Lime putty");
    undoDelivered(orderId);
    expect([o().status, o().deliveredOn]).toEqual(["Ordered", undefined]);
  });

  it("a request to buy with no amount or reason is not sent; one for the firm has no site", () => {
    const n = db().spendRequests.length;
    expect(askToSpend({ projectId: null, what: "Printer", supplier: "", amount: 0, reason: "Old one jams" })).toBeNull();
    expect(db().spendRequests).toHaveLength(n);
    const id = actAs("p-off", () => askToSpend({ projectId: null, what: "Printer", supplier: "Galway Office Supplies", amount: 640, reason: "Old one jams" }))!;
    expect(db().spendRequests.find((x) => x.id === id)!.projectId).toBeNull();
  });

  it("a new company paper joins the list, flagged until a copy is attached; the same name twice is refused", () => {
    const n = db().companyPapers.length;
    const id = addCompanyPaper({ name: "Waste collection permit", provider: "Galway County Council", reference: "", cover: "", expires: "2027-11-01" }, null)!;
    const c = db().companyPapers.find((x) => x.id === id)!;
    expect([db().companyPapers.length, c.reference, c.proofNeeded, c.cover]).toEqual([n + 1, "To follow", true, undefined]);
    expect(addCompanyPaper({ name: "waste collection permit", provider: "X", reference: "", cover: "", expires: "2027-11-01" }, null)).toBeNull();
    const withCopy = addCompanyPaper({ name: "Motor fleet insurance", provider: "Atlantic Mutual", reference: "MF-1", cover: "", expires: "2027-06-30" }, { name: "ciri.pdf", dataUrl: "data:application/pdf;base64,AA==" })!;
    expect(db().companyPapers.find((x) => x.id === withCopy)!.proofNeeded).toBe(false);
  });
});
