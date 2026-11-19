import { beforeEach, describe, expect, it } from "vitest";
import { decideExpense, exportExpenses } from "@/data/actions";
import { buildSeed } from "@/data/seed";
import { useData, usePrefs } from "@/data/store";
import { claimStage, owedByPerson, reimbursementCsv, sentForPayment, toPay } from "./reimbursements";

// Approved reimbursements are made ready for the office to pay (the call of 17 Nov).
const DAY = "2026-11-17";
const db = () => useData.getState().db;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("reimbursements on their way to being paid", () => {
  it("starts with one approved claim to pay, one already sent and two still with the director", () => {
    expect(toPay(db().expenses).map((x) => x.id)).toEqual(["ex-4"]);
    expect(sentForPayment(db().expenses).map((x) => x.id)).toEqual(["ex-1"]);
    expect(db().expenses.filter((x) => x.status === "Waiting").map((x) => x.id).sort()).toEqual(["ex-2", "ex-3"]);
  });

  it("an approval puts a claim on the office's list, oldest claim first; a no does not", () => {
    decideExpense("ex-2", true);
    decideExpense("ex-3", false, "No receipt");
    expect(toPay(db().expenses).map((x) => x.id)).toEqual(["ex-4", "ex-2"]);
  });

  it("says where a claim stands in words the claimant reads", () => {
    const of = (id: string) => claimStage(db().expenses.find((x) => x.id === id)!);
    expect([of("ex-2"), of("ex-4"), of("ex-1")]).toEqual(["Waiting", "Approved, with the office to pay", "Sent for payment"]);
    decideExpense("ex-3", false);
    expect(of("ex-3")).toBe("Declined");
  });

  it("exporting stamps each claim once, with who exported it, and logs it", () => {
    decideExpense("ex-2", true);
    usePrefs.setState({ role: "accounts", asPersonId: null });
    exportExpenses(toPay(db().expenses).map((x) => x.id));
    expect(toPay(db().expenses)).toEqual([]);
    expect(sentForPayment(db().expenses).map((x) => x.id).sort()).toEqual(["ex-1", "ex-2", "ex-4"]);
    expect(db().expenses.find((x) => x.id === "ex-2")).toMatchObject({ exportedBy: "Maeve Quirke" });
    expect(db().activity[0]).toMatchObject({ what: "Exported reimbursements for payment", target: "2 claims, 123.55" });
    // A second export of the same claims does nothing, and one not approved cannot go.
    const at = db().expenses.find((x) => x.id === "ex-2")!.exportedAt;
    exportExpenses(["ex-2", "ex-3"]);
    expect(db().expenses.find((x) => x.id === "ex-2")!.exportedAt).toBe(at);
    expect(db().expenses.find((x) => x.id === "ex-3")!.exportedAt).toBeUndefined();
  });

  it("adds up what each person is owed, most first", () => {
    const claims = [
      { id: "1", personId: "a", amount: 10.1 },
      { id: "2", personId: "b", amount: 50 },
      { id: "3", personId: "a", amount: 20.2 },
    ].map((c) => ({ ...c, date: DAY, kind: "Fuel", what: "", projectId: null, status: "Approved" as const }));
    expect(owedByPerson(claims)).toEqual([{ personId: "b", claims: 1, amount: 50 }, { personId: "a", claims: 2, amount: 30.3 }]);
  });

  it("writes the file for the office: one row per claim with the employee number, site and amount", () => {
    const f = reimbursementCsv(DAY, toPay(db().expenses), db().people, db().projects);
    expect(f.fileName).toBe("reimbursements-to-pay-2026-11-17.csv");
    const [head, row, ...rest] = f.text.trim().split("\r\n");
    expect(head).toBe("Employee No,Surname,Forename,Paid on,For,Detail,Site,Amount,Approved by,Approved on");
    const who = db().people.find((p) => p.id === "p-111")!;
    expect(row).toBe(`${who.sageNo},${who.name.split(" ").slice(1).join(" ")},${who.name.split(" ")[0]},12/11/2026,Materials,"Box of slate hooks and two ridge fixings, the delivery was short",C721,31.40,Aidan King,13/11/2026`);
    expect(rest).toEqual([]);
    // A claim not for one site reads General.
    const g = reimbursementCsv(DAY, sentForPayment(db().expenses), db().people, db().projects).text;
    expect(g).toContain(",General,9.60,");
  });
});
