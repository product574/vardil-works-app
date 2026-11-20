import { beforeEach, describe, expect, it } from "vitest";
import { addPurchaseProblem, approverWords, chainOf, knownPayees, purchaseStage, readInvoiceName } from "@/lib/purchases";
import { addPurchaseInvoice, setPayChain, siteApprovePurchase, approvePurchase } from "./actions";
import { useData, usePrefs } from "./store";

const db = () => useData.getState().db;
const day = () => useData.getState().day;
const project = (code: string) => db().projects.find((p) => p.code === code)!;
const nameOf = (id: string) => db().people.find((p) => p.id === id)?.name;

describe("adding an invoice in Money out (decision 237)", () => {
  beforeEach(() => {
    useData.getState().reset();
    usePrefs.getState().setRole("accounts");
  });

  it("offers every subcontractor and supplier on file as who it is from", () => {
    const names = knownPayees(db().supplierInvoices, db().subcontractors);
    expect(names).toContain("Corrib Scaffolding");
    expect(names).toContain("Burren Lime and Stone Supplies");
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads who, the number and the job from a file's name, and leaves alone what is not there", () => {
    const names = knownPayees(db().supplierInvoices, db().subcontractors);
    const codes = db().projects.map((p) => p.code);
    expect(readInvoiceName("Burren Lime and Stone Supplies BLS-4471 C719.pdf", names, codes)).toEqual({ from: "Burren Lime and Stone Supplies", invoiceNo: "BLS-4471", code: "C719" });
    expect(readInvoiceName("corrib_scaffolding_CS-INV-9940_c722.PDF", names, codes)).toEqual({ from: "Corrib Scaffolding", invoiceNo: "CS-INV-9940", code: "C722" });
    expect(readInvoiceName("IMG_2231.jpg", names, codes)).toEqual({ invoiceNo: "2231" });
    expect(readInvoiceName("scan.pdf", names, codes)).toEqual({});
  });

  it("says in plain words what is missing, and refuses the same invoice twice", () => {
    const ok = { from: "Slieve Bloom Sawmills", invoiceNo: "SBS-9001", invoiceDate: day(), net: 420, projectId: project("C725").id };
    expect(addPurchaseProblem(ok, day(), db().supplierInvoices)).toBe("");
    expect(addPurchaseProblem({ ...ok, from: " " }, day(), db().supplierInvoices)).toMatch(/who the invoice is from/);
    expect(addPurchaseProblem({ ...ok, invoiceNo: "" }, day(), db().supplierInvoices)).toMatch(/invoice number/);
    expect(addPurchaseProblem({ ...ok, net: 0 }, day(), db().supplierInvoices)).toMatch(/amount before VAT/);
    expect(addPurchaseProblem({ ...ok, projectId: "" }, day(), db().supplierInvoices)).toMatch(/Choose the job/);
    expect(addPurchaseProblem({ ...ok, invoiceDate: "2999-01-01" }, day(), db().supplierInvoices)).toMatch(/after today/);
    expect(addPurchaseProblem({ ...ok, from: "slieve bloom sawmills", invoiceNo: "sbs-7755" }, day(), db().supplierInvoices)).toMatch(/already on file as F-/);
  });

  it("a supplier's invoice goes to the job's site manager, then the managing director, then to be paid", () => {
    const p = project("C719");
    const before = db().supplierInvoices.length;
    const id = addPurchaseInvoice({ from: "Burren Lime and Stone Supplies", invoiceNo: "BLS-9001", invoiceDate: day(), description: "Lime putty, 40 tubs", net: 800, vatPct: 23, projectId: p.id, category: "material", via: "email", send: true })!;
    const s = () => db().supplierInvoices.find((x) => x.id === id)!;
    expect(db().supplierInvoices.length).toBe(before + 1);
    expect([s().subtotal, s().vat, s().total, s().jobRef, s().party, s().via, s().siteStep, purchaseStage(s())]).toEqual([800, 184, 984, "C719", undefined, "email", true, "approve"]);
    expect(s().allocations.map((a) => [a.projectId, a.category, a.amount])).toEqual([[p.id, "material", 800]]);
    expect(Number(s().fileNo!.slice(2))).toBe(Math.max(...db().supplierInvoices.filter((x) => x.id !== id).map((x) => Number(x.fileNo!.slice(2)))) + 1);
    expect(s().askedBy).toBe(db().people.find((x) => x.level === "accounts")!.name);
    expect(approverWords(s(), 500, db().projects, nameOf, chainOf(db().approvalLimits))).toBe(`${nameOf(p.siteManagerId)}, then the managing director`);
    expect(db().activity[0]!.what).toBe("Added a supplier's invoice and sent it for approval");
    // The site manager's yes is his step only; the managing director's finishes it.
    siteApprovePurchase(id);
    expect([purchaseStage(s()), !!s().siteApprovedAt]).toEqual(["approve", true]);
    usePrefs.getState().setRole("md");
    approvePurchase(id);
    expect([purchaseStage(s()), s().readStatus]).toEqual(["pay", "confirmed"]);
  });

  it("a name that is a subcontractor on file makes it theirs, under labour, on their terms", () => {
    const sub = db().subcontractors.find((x) => x.name === "Corrib Scaffolding")!;
    const id = addPurchaseInvoice({ from: "corrib scaffolding", invoiceNo: "CS-INV-9950", invoiceDate: day(), description: "", net: 1000, vatPct: 13.5, projectId: project("C719").id, category: "material", via: "hand", send: true })!;
    const s = db().supplierInvoices.find((x) => x.id === id)!;
    expect([s.supplier, s.party, s.subcontractorId, s.allocations[0]!.category, s.vat, s.via, s.lines[0]!.description]).toEqual(["Corrib Scaffolding", "subcontractor", sub.id, "labour", 135, "hand", "Work at St Finian's Church"]);
  });

  it("saved to check later, it waits with accounts and nobody is asked yet", () => {
    const id = addPurchaseInvoice({ from: "A New Supplier Ltd", invoiceNo: "N-1", invoiceDate: day(), description: "Mixed delivery", net: 300, vatPct: 23, projectId: project("C720").id, category: "other", via: "post", send: false })!;
    const s = db().supplierInvoices.find((x) => x.id === id)!;
    expect([purchaseStage(s), s.askedAt, s.siteStep]).toEqual(["check", undefined, undefined]);
    expect(db().activity[0]!.what).toBe("Added a supplier's invoice to check");
  });

  it("under the older rule there is no site step, and a refused invoice changes nothing", () => {
    usePrefs.getState().setRole("md");
    setPayChain("accounts-limit");
    const id = addPurchaseInvoice({ from: "Burren Lime and Stone Supplies", invoiceNo: "BLS-9002", invoiceDate: day(), description: "Sand", net: 90, vatPct: 23, projectId: project("C719").id, category: "material", via: "email", send: true })!;
    expect(db().supplierInvoices.find((x) => x.id === id)!.siteStep).toBeUndefined();
    const n = db().supplierInvoices.length;
    expect(addPurchaseInvoice({ from: "Burren Lime and Stone Supplies", invoiceNo: "BLS-9002", invoiceDate: day(), description: "Sand", net: 90, vatPct: 23, projectId: project("C719").id, category: "material", via: "email", send: true })).toBeNull();
    expect(addPurchaseInvoice({ from: "X", invoiceNo: "1", invoiceDate: day(), description: "", net: 10, vatPct: 23, projectId: "nope", category: "other", via: "email", send: true })).toBeNull();
    expect(db().supplierInvoices.length).toBe(n);
  });
});
