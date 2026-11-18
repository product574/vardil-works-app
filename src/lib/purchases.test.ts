import { describe, expect, it } from "vitest";
import type { SupplierInvoice } from "@/data/types";
import { accountRefOf, type Approver, approverWords, limitWords, mayApprove, needsAccounts, nextFileNo, owedOut, payBy, payWords, portalStanding, PURCHASE_NOMINALS, purchaseRows, purchaseStage, receiptEmail, recently, remittanceEmail, runsSite, vatPctOf } from "./purchases";

const base: SupplierInvoice = { id: "si-1", supplier: "Burren Lime and Stone Supplies", invoiceNo: "BLS-1", invoiceDate: "2026-11-02", docType: "invoice", subtotal: 1000, vat: 230, total: 1230, jobRef: "C719", fileName: "x.pdf", receivedAt: "2026-11-03T08:15:00", readStatus: "needs_review", lines: [{ description: "Lime", amount: 1000 }], allocations: [] };
const inv = (over: Partial<SupplierInvoice>): SupplierInvoice => ({ ...base, ...over });
const alloc = (projectId: string, amount = 1000) => ({ id: `al-${projectId}`, projectId, category: "labour" as const, amount, description: "Work" });
const sites = [
  { id: "pr-C719", code: "C719", siteManagerId: "p-sm1", contractsManagerId: "p-cm1" },
  { id: "pr-C721", code: "C721", siteManagerId: "p-sm3", contractsManagerId: "p-cm2" },
];
const nobody: Approver = { personId: "p-x", handles: false, approvesAll: false, approvesOwnSites: false };
const accounts: Approver = { ...nobody, personId: "p-acc", handles: true };
const md: Approver = { personId: "p-md", handles: true, approvesAll: true, approvesOwnSites: true };
const siteManager: Approver = { ...nobody, personId: "p-sm1", approvesOwnSites: true };
const names: Record<string, string> = { "p-sm1": "Eoin Brosnan", "p-sm3": "Róisín Garvey" };

describe("where a purchase invoice stands", () => {
  it("moves from unread to checked, approval, payment and paid", () => {
    expect(purchaseStage(inv({ readStatus: "not_read" }))).toBe("unread");
    expect(purchaseStage(inv({}))).toBe("check");
    expect(purchaseStage(inv({ askedAt: "2026-11-03T10:00:00", askedBy: "Maeve Quirke" }))).toBe("approve");
    expect(purchaseStage(inv({ readStatus: "confirmed" }))).toBe("pay");
    expect(purchaseStage(inv({ readStatus: "confirmed", paidOn: "2026-11-27" }))).toBe("paid");
  });
  it("a credit note is never to be paid, and one sent back says so until it is asked for again", () => {
    expect(purchaseStage(inv({ readStatus: "confirmed", docType: "credit_note" }))).toBe("credit");
    const back = { by: "Aidan King", at: "2026-11-04T09:00:00", reason: "Wrong job" };
    expect(purchaseStage(inv({ sentBack: back }))).toBe("back");
    expect(purchaseStage(inv({ sentBack: back, askedAt: "2026-11-05T09:00:00" }))).toBe("approve");
  });
  it("accounts have the unread, the unchecked and a supplier's sent back; not a subcontractor's sent back, nor anything with an approver", () => {
    const back = { by: "Eoin Brosnan", at: "2026-11-04T09:00:00", reason: "Seven of nine delivered" };
    expect(needsAccounts(inv({ readStatus: "not_read" }))).toBe(true);
    expect(needsAccounts(inv({}))).toBe(true);
    expect(needsAccounts(inv({ sentBack: back }))).toBe(true);
    expect(needsAccounts(inv({ sentBack: back, party: "subcontractor" }))).toBe(false);
    expect(needsAccounts(inv({ askedAt: "2026-11-03T10:00:00" }))).toBe(false);
    expect(needsAccounts(inv({ readStatus: "confirmed" }))).toBe(false);
  });
});

describe("who may approve", () => {
  it("accounts approve a supplier's invoice up to the limit, and nothing above it", () => {
    expect(mayApprove(inv({ subtotal: 500 }), accounts, 500, sites)).toBe(true);
    expect(mayApprove(inv({ subtotal: 500.01 }), accounts, 500, sites)).toBe(false);
    expect(mayApprove(inv({ subtotal: 40 }), accounts, 0, sites)).toBe(false);
    expect(mayApprove(inv({ subtotal: 40 }), nobody, 500, sites)).toBe(false);
  });
  it("the managing director approves anything", () => {
    expect(mayApprove(inv({ subtotal: 90000 }), md, 500, sites)).toBe(true);
    expect(mayApprove(inv({ party: "subcontractor", allocations: [alloc("pr-C721")] }), md, 500, sites)).toBe(true);
  });
  it("a subcontractor's invoice is for whoever runs its site, never for accounts, whatever its size", () => {
    const mine = inv({ party: "subcontractor", subtotal: 50, allocations: [alloc("pr-C719", 50)] });
    const theirs = inv({ party: "subcontractor", subtotal: 50, allocations: [alloc("pr-C721", 50)] });
    expect(mayApprove(mine, siteManager, 500, sites)).toBe(true);
    expect(mayApprove(theirs, siteManager, 500, sites)).toBe(false);
    expect(mayApprove(mine, accounts, 500, sites)).toBe(false);
    // Across two sites it needs someone who runs both.
    expect(mayApprove(inv({ party: "subcontractor", allocations: [alloc("pr-C719"), alloc("pr-C721")] }), siteManager, 500, sites)).toBe(false);
    // Nothing coded to a site yet: nobody but the managing director.
    expect(mayApprove(inv({ party: "subcontractor" }), siteManager, 500, sites)).toBe(false);
    // Running the site is not enough without the permission.
    expect(mayApprove(mine, { ...siteManager, approvesOwnSites: false }, 500, sites)).toBe(false);
  });
  it("a contracts manager runs the sites they are named on", () => {
    expect(runsSite(sites[0]!, "p-cm1")).toBe(true);
    expect(runsSite(sites[0]!, "p-cm2")).toBe(false);
    expect(runsSite(sites[0]!, null)).toBe(false);
  });
  it("says who an invoice is waiting for, and why", () => {
    const name = (id: string) => names[id];
    expect(approverWords(inv({ subtotal: 2000 }), 500, sites, name)).toBe("the managing director");
    expect(approverWords(inv({ subtotal: 200 }), 500, sites, name)).toBe("accounts");
    expect(approverWords(inv({ party: "subcontractor", allocations: [alloc("pr-C719")] }), 500, sites, name)).toBe("Eoin Brosnan or the managing director");
    expect(approverWords(inv({ party: "subcontractor" }), 500, sites, name)).toBe("the managing director");
    expect(limitWords(inv({ subtotal: 2000 }), 500, "IE")).toContain("so the managing director approves it");
    expect(limitWords(inv({ subtotal: 200 }), 500, "IE")).toContain("within the");
  });
});

describe("paying", () => {
  it("is due 30 days from the invoice unless a date is on record", () => {
    expect(payBy(inv({}))).toBe("2026-12-02");
    expect(payBy(inv({ dueOn: "2026-11-20" }))).toBe("2026-11-20");
  });
  it("says how long is left or how late it is", () => {
    const s = inv({ dueOn: "2026-11-20" });
    expect([payWords(s, "2026-11-18"), payWords(s, "2026-11-19"), payWords(s, "2026-11-20"), payWords(s, "2026-11-21"), payWords(s, "2026-11-25")]).toEqual(["Due in 2 days", "Due in 1 day", "Due today", "1 day late", "5 days late"]);
  });
  it("adds up what is approved and unpaid, and how much of it is late", () => {
    const list = [inv({ id: "a", readStatus: "confirmed", total: 100, dueOn: "2026-11-10" }), inv({ id: "b", readStatus: "confirmed", total: 250.5, dueOn: "2026-11-30" }), inv({ id: "c", readStatus: "confirmed", total: 900, paidOn: "2026-11-06" }), inv({ id: "d", total: 77 }), inv({ id: "e", readStatus: "confirmed", docType: "credit_note", total: 50 })];
    expect(owedOut(list, "2026-11-18")).toEqual({ count: 2, total: 350.5, lateCount: 1, lateTotal: 100 });
  });
  it("numbers the next file one above the highest", () => {
    expect(nextFileNo([{ fileNo: "F-1144" }, { fileNo: "F-1009" }, {}])).toBe("F-1145");
    expect(nextFileNo([])).toBe("F-1001");
  });
  it("knows what happened in the last month", () => {
    expect([recently("2026-11-18", "2026-11-18"), recently("2026-10-19", "2026-11-18"), recently("2026-10-18", "2026-11-18"), recently(undefined, "2026-11-18"), recently("2026-11-19", "2026-11-18")]).toEqual([true, true, false, false, false]);
  });
});

describe("the rows Sage gets for a purchase", () => {
  const s = inv({
    readStatus: "confirmed",
    fileNo: "F-1142",
    subtotal: 2386.5,
    vat: 548.9,
    total: 2935.4,
    allocations: [
      { id: "1", projectId: "pr-C719", category: "material", amount: 1290, description: "NHL 3.5 lime, 60 bags" },
      { id: "2", projectId: "pr-C719", category: "material", amount: 744, description: "Sharp sand" },
      { id: "3", projectId: "pr-C721", category: "transport", amount: 352.5, description: "Delivery" },
    ],
  });
  it("one row for each line, with its own nominal code and department", () => {
    const rows = purchaseRows(s, sites, []);
    expect(rows.map((r) => [r.type, r.account, r.nominal, r.siteCode, r.ref, r.fileNo])).toEqual([
      ["PI", "BURLIM", "5000", "C719", "BLS-1", "F-1142"],
      ["PI", "BURLIM", "5000", "C719", "BLS-1", "F-1142"],
      ["PI", "BURLIM", "5100", "C721", "BLS-1", "F-1142"],
    ]);
  });
  it("shares the VAT between the lines so the rows add up to the invoice to the cent", () => {
    const rows = purchaseRows(s, sites, []);
    expect(rows.map((r) => r.vat)).toEqual([296.7, 171.12, 81.08]);
    expect(Math.round(rows.reduce((t, r) => t + r.vat, 0) * 100) / 100).toBe(548.9);
    expect(rows.every((r) => r.vatPct === 23)).toBe(true);
  });
  it("a credit note goes as PC, and a subcontractor under the account on their record", () => {
    expect(purchaseRows(inv({ readStatus: "confirmed", docType: "credit_note", allocations: [alloc("pr-C719")] }), sites, [])[0]!.type).toBe("PC");
    const sub = inv({ supplier: "Corrib Scaffolding", subcontractorId: "sub-1", party: "subcontractor", subtotal: 1000, vat: 135, allocations: [alloc("pr-C721")] });
    const row = purchaseRows(sub, sites, [{ id: "sub-1", accountRef: "CORR01" }])[0]!;
    expect([row.account, row.nominal, row.vatPct]).toEqual(["CORR01", "6002", 13.5]);
  });
  it("works the VAT rate back from the figures", () => {
    expect([vatPctOf({ subtotal: 1000, vat: 230 }), vatPctOf({ subtotal: 890, vat: 120.15 }), vatPctOf({ subtotal: 0, vat: 0 })]).toEqual([23, 13.5, 0]);
  });
  it("gives every supplier in the sample data an account of its own, and every cost heading a nominal code", () => {
    const suppliers = ["Burren Lime and Stone Supplies", "Corrib Scaffolding", "Moher Slate Merchants", "Shannonside Plant Hire", "Leinster Skip and Waste", "Midland Access Hire", "Slieve Bloom Sawmills", "Kinvara Stone Carvers", "Liffey Linseed Paints", "Western Skip Hire", "Midland Haulage", "Dublin Reclaimed Brick", "Atlantic Lead and Copper", "Clearwater Cylinder Glass", "Clare Lime Craft", "Owenmore Quarry", "Ardfert Structural Supplies"];
    const refs = suppliers.map(accountRefOf);
    expect(new Set(refs).size).toBe(suppliers.length);
    expect(refs.slice(0, 2)).toEqual(["BURLIM", "CORSCA"]);
    expect(Object.values(PURCHASE_NOMINALS).every(([code]) => /^\d{4}$/.test(code))).toBe(true);
  });
});

describe("telling people they have been paid", () => {
  it("a client's receipt names the invoice, the amount and the day", () => {
    const e = receiptEmail({ number: "SI-10404", gross: 127971.25, paidOn: "2026-11-18", contactName: "Mr Paul Hession", project: "C711 Dunmoy Bridewell", sender: "Maeve Quirke", company: "ABC Construction Ltd", region: "IE" });
    expect(e.subject).toBe("Payment received: invoice SI-10404, C711 Dunmoy Bridewell");
    expect(e.body).toContain("Dear Paul,");
    expect(e.body).toContain("€127,971.25");
    expect(e.body).toContain("18 Nov 2026");
    expect(e.body).not.toMatch(/[—–{}]/);
  });
  it("a subcontractor's remittance advice carries the bank reference when there is one", () => {
    const a = { invoiceNo: "CS-INV-9914", total: 3518.5, paidOn: "2026-11-18", contactName: "Gearóid Flaherty", project: "C721 The Old Corn Mill", sender: "Maeve Quirke", company: "ABC Construction Ltd", region: "IE" as const };
    expect(remittanceEmail({ ...a, paidRef: "BT 4471" }).body).toContain("by bank transfer, reference BT 4471.");
    expect(remittanceEmail(a).body).toContain("by bank transfer.");
    expect(remittanceEmail(a).subject).toBe("Remittance advice: your invoice CS-INV-9914, C721 The Old Corn Mill");
  });
  it("says in the portal where a subcontractor's invoice stands", () => {
    expect(portalStanding(inv({ askedAt: "2026-11-17T10:00:00" })).label).toBe("Received");
    expect(portalStanding(inv({ readStatus: "confirmed", dueOn: "2026-12-05" }))).toMatchObject({ label: "Approved", detail: "To be paid by 5 Dec 2026" });
    expect(portalStanding(inv({ readStatus: "confirmed", paidOn: "2026-11-13" }))).toMatchObject({ label: "Paid", detail: "Paid on 13 Nov 2026" });
    expect(portalStanding(inv({ sentBack: { by: "Darragh Lenihan", at: "2026-11-16T10:15:00", reason: "Seven of nine delivered" } }))).toMatchObject({ label: "Sent back", detail: "Seven of nine delivered" });
  });
});
