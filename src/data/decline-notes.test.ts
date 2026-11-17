import { beforeEach, describe, expect, it } from "vitest";
import { actAs, claimExpense, decideExpense, decideHoliday, decideSiteRequest, decideSpend, discardApproval, reopenApproval, requestLeave } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { leaveGroups } from "@/lib/roster";
import { recentlyDecided } from "@/lib/requests";

const DAY = "2026-11-17";

// A no can say why (Oisin, 17 Nov): leave, site requests, spending, reimbursements and drafts
// in Approvals. The note is optional everywhere.
const db = () => useData.getState().db;
const day = () => DAY;
const lastLog = () => db().activity[0]!;

describe("a note with a no", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("is kept on a declined leave request, with who declined it, and shows it until the dates have gone", () => {
    const h = db().holidays.find((x) => x.status === "Requested")!;
    decideHoliday(h.id, false, "  Two of the crew are already off   that week ");
    const after = db().holidays.find((x) => x.id === h.id)!;
    expect(after).toMatchObject({ status: "Declined", declineNote: "Two of the crew are already off that week", decidedBy: "Aidan King" });
    expect(lastLog()).toMatchObject({ what: "Declined leave" });
    expect(lastLog().target).toContain("Note: Two of the crew are already off that week");
    expect(leaveGroups(db().holidays, day()).declined.map((x) => x.id)).toContain(h.id);
    expect(leaveGroups(db().holidays, day()).requested.map((x) => x.id)).not.toContain(h.id);
  });

  it("is optional: a no with nothing typed keeps no note", () => {
    const [a, b] = db().holidays.filter((x) => x.status === "Requested");
    decideHoliday(a!.id, false);
    decideHoliday(b!.id, false, "   ");
    for (const id of [a!.id, b!.id]) {
      const h = db().holidays.find((x) => x.id === id)!;
      expect(h.status).toBe("Declined");
      expect(h.declineNote).toBeUndefined();
    }
    expect(lastLog().target).not.toContain("Note:");
  });

  it("is not kept with a yes", () => {
    const h = db().holidays.find((x) => x.status === "Requested")!;
    decideHoliday(h.id, true, "should be ignored");
    expect(db().holidays.find((x) => x.id === h.id)).toMatchObject({ status: "Approved" });
    expect(db().holidays.find((x) => x.id === h.id)!.declineNote).toBeUndefined();
  });

  it("goes with leave asked for on the phone, so the person can read why", () => {
    const op = db().people.find((p) => p.kind === "Operative" && p.active)!;
    actAs(op.id, () => requestLeave(op.id, "2027-01-11", "2027-01-15", "Family visit"));
    const h = db().holidays.find((x) => x.personId === op.id && x.from === "2027-01-11")!;
    decideHoliday(h.id, false, "Handover week on your site");
    expect(db().holidays.find((x) => x.id === h.id)).toMatchObject({ status: "Declined", note: "Family visit", declineNote: "Handover week on your site" });
  });

  it("is kept on a site request and on spending turned down, and in the answered list", () => {
    const r = db().requests.find((x) => x.status === "Open" && !x.decision && x.heldBy !== "site")!;
    expect(decideSiteRequest(r.id, false, "Hire one locally instead")).toBe("declined");
    expect(db().requests.find((x) => x.id === r.id)).toMatchObject({ decision: "Declined", status: "Done", declineNote: "Hire one locally instead" });
    expect(lastLog().target).toContain("Note: Hire one locally instead");
    if (r.projectId) expect(db().projects.find((p) => p.id === r.projectId)!.audit.at(-1)!.what).toBe(`Request turned down: ${r.description}. Note: Hire one locally instead`);

    const s = db().spendRequests.find((x) => x.status === "Waiting")!;
    decideSpend(s.id, false, "Wait for the January budget");
    expect(db().spendRequests.find((x) => x.id === s.id)).toMatchObject({ status: "Declined", declineNote: "Wait for the January budget" });

    const answered = recentlyDecided(db(), day());
    expect(answered.find((d) => d.item.id === r.id)?.item.declineNote).toBe("Hire one locally instead");
    expect(answered.find((d) => d.item.id === s.id)?.item.declineNote).toBe("Wait for the January budget");
  });

  it("is kept on a reimbursement turned down, which joins the answered list", () => {
    const op = db().people.find((p) => p.kind === "Operative" && p.active)!;
    actAs(op.id, () => claimExpense({ personId: op.id, kind: "Fuel", what: "Diesel for the van", amount: 48.5, date: day(), projectId: null }));
    const x = db().expenses.find((e) => e.personId === op.id && e.status === "Waiting" && e.amount === 48.5)!;
    decideExpense(x.id, false, "No receipt attached");
    expect(db().expenses.find((e) => e.id === x.id)).toMatchObject({ status: "Declined", declineNote: "No receipt attached" });
    expect(recentlyDecided(db(), day()).find((d) => d.item.id === x.id)).toMatchObject({ kind: "expense" });
  });

  it("is kept on a discarded draft, and goes when the draft is moved back to waiting", () => {
    const a = db().approvals.find((x) => x.status === "Pending")!;
    discardApproval(a.id, "Already agreed by phone");
    expect(db().approvals.find((x) => x.id === a.id)).toMatchObject({ status: "Discarded", discardNote: "Already agreed by phone" });
    expect(lastLog()).toMatchObject({ what: "Discarded a draft" });
    expect(lastLog().target).toContain("Note: Already agreed by phone");
    reopenApproval(a.id);
    const back = db().approvals.find((x) => x.id === a.id)!;
    expect(back.status).toBe("Pending");
    expect(back.discardNote).toBeUndefined();
    discardApproval(a.id);
    expect(db().approvals.find((x) => x.id === a.id)!.discardNote).toBeUndefined();
  });
});
