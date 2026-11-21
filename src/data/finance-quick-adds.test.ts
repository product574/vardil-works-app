import { beforeEach, describe, expect, it } from "vitest";
import { directorQueue, withSiteManagers } from "@/lib/requests";
import { approveStep, purchaseStage } from "@/lib/purchases";
import { todosFor, todosGivenBy } from "@/lib/renewals";
import { actAs, addLooseFile, addTodo, approvePurchase, decideExpense, fileIt, setTodoDone, stepInOnCrewRequest } from "./actions";
import { useData, usePrefs } from "./store";

const db = () => useData.getState().db;

describe("a to-do from any screen (21 Nov)", () => {
  beforeEach(() => {
    useData.getState().reset();
    usePrefs.getState().setRole("md");
  });

  it("goes on my own list, with the screen it came from", () => {
    const id = addTodo({ title: "  Ring Burren Lime  ", due: "2026-12-01", forName: "Aidan King", to: "/projects/C720?tab=plant", from: "C720 Ardmullen House" });
    const t = db().todos.find((x) => x.id === id)!;
    expect(t).toMatchObject({ title: "Ring Burren Lime", createdBy: "Aidan King", to: "/projects/C720?tab=plant", from: "C720 Ardmullen House" });
    // "For me" is not stored as a name: it is simply mine.
    expect(t.forName).toBeUndefined();
    expect(todosFor(db().todos, "Aidan King").some((x) => x.id === id)).toBe(true);
  });

  it("can be given to a colleague: it is on their list, marked as from me, and I see it ticked off", () => {
    const id = addTodo({ title: "Send the statement", due: "2026-12-01", forName: "Maeve Quirke" });
    expect(db().todos.find((x) => x.id === id)).toMatchObject({ forName: "Maeve Quirke", createdBy: "Aidan King" });
    expect(todosFor(db().todos, "Aidan King").some((x) => x.id === id)).toBe(false);
    expect(todosFor(db().todos, "Maeve Quirke").some((x) => x.id === id)).toBe(true);
    expect(todosGivenBy(db().todos, "Aidan King").some((x) => x.id === id)).toBe(true);
    expect(db().activity[0]!.what).toBe("Gave a colleague a to-do");
    actAs("p-acc", () => setTodoDone(id, true));
    expect(db().todos.find((x) => x.id === id)).toMatchObject({ doneBy: "Maeve Quirke" });
  });

  it("a name that is nobody's stays on my own list", () => {
    const id = addTodo({ title: "Something", due: "2026-12-01", forName: "Nobody Atall" });
    expect(db().todos.find((x) => x.id === id)!.forName).toBeUndefined();
  });

  it("opens with one given to the managing director and one he gave away", () => {
    expect(todosFor(db().todos, "Aidan King").some((t) => t.createdBy === "Tadhg Morrissey" && t.from === "C722 Dunmoy Courthouse")).toBe(true);
    expect(todosGivenBy(db().todos, "Aidan King").map((t) => t.forName)).toEqual(["Maeve Quirke"]);
  });
});

describe("a file to be sorted under a project's name (21 Nov)", () => {
  beforeEach(() => {
    useData.getState().reset();
    usePrefs.getState().setRole("md");
  });

  it("waits with no folder, under the project it was added for, until it is filed", () => {
    const p = db().projects.find((x) => x.code === "C720")!;
    const id = addLooseFile({ name: "Docket 5521.jpg", kind: "image", sizeKb: 300 }, p.id);
    const f = db().files.find((x) => x.id === id)!;
    expect(f).toMatchObject({ projectId: null, forProjectId: p.id, addedBy: "Aidan King", source: "Upload" });
    expect(db().activity[0]).toMatchObject({ what: "Added a file to be sorted" });
    fileIt(id, p.id, "Correspondence");
    const filed = db().files.find((x) => x.id === id)!;
    expect(filed).toMatchObject({ projectId: p.id, category: "Correspondence" });
    expect(filed.forProjectId).toBeUndefined();
  });

  it("can be added with no project yet", () => {
    const id = addLooseFile({ name: "Scan.pdf", kind: "pdf", sizeKb: 90 }, null);
    expect(db().files.find((x) => x.id === id)!.forProjectId).toBeUndefined();
  });

  it("opens with one file already under Dunmoy Courthouse", () => {
    const p = db().projects.find((x) => x.code === "C722")!;
    expect(db().files.filter((f) => f.projectId === null && f.forProjectId === p.id)).toHaveLength(1);
  });
});

describe("the managing director steps in early (21 Nov)", () => {
  beforeEach(() => {
    useData.getState().reset();
    usePrefs.getState().setRole("md");
  });

  it("approves an invoice still on the site manager's step, and the record says so", () => {
    const s = withSiteManagers(db()).invoices[0]!;
    expect(approveStep(s)).toBe("site");
    approvePurchase(s.id);
    const after = db().supplierInvoices.find((x) => x.id === s.id)!;
    expect(purchaseStage(after)).toBe("pay");
    expect(after).toMatchObject({ aheadOfSite: true, confirmedBy: "Aidan King" });
    expect(db().activity[0]!.what).toContain("ahead of the site manager's step");
  });

  it("does not mark an invoice that had already passed the site manager", () => {
    const s = directorQueue(db()).invoices[0]!;
    approvePurchase(s.id);
    expect(db().supplierInvoices.find((x) => x.id === s.id)!.aheadOfSite).toBeUndefined();
  });

  it("answers a crew request himself: it leaves the site manager's list and is decided", () => {
    const r = withSiteManagers(db()).site[0]!;
    expect(stepInOnCrewRequest(r.id, false, "Not this month")).toBe("declined");
    const after = db().requests.find((x) => x.id === r.id)!;
    expect(after).toMatchObject({ decision: "Declined", steppedInBy: "Aidan King", declineNote: "Not this month", raisedBy: r.requestedBy });
    expect(after.heldBy).toBeUndefined();
    expect(withSiteManagers(db()).site.some((x) => x.id === r.id)).toBe(false);
    // One that is not with a site manager is not his to step in on this way.
    expect(stepInOnCrewRequest(directorQueue(db()).site[0]!.id, true)).toBeNull();
  });

  it("approves a receipt that was waiting on a site manager, and it goes to Ready to be paid", () => {
    const x = withSiteManagers(db()).expenses[0]!;
    expect(directorQueue(db()).expenses.some((e) => e.id === x.id)).toBe(false);
    decideExpense(x.id, true);
    expect(directorQueue(db()).toPay.some((e) => e.id === x.id)).toBe(true);
    expect(withSiteManagers(db()).expenses).toHaveLength(0);
  });
});
