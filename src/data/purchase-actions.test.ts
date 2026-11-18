import { beforeEach, describe, expect, it } from "vitest";
import { invoiceNo } from "@/lib/billing";
import { mayApprove, needsAccounts, partyOf, payBy, purchaseStage } from "@/lib/purchases";
import { approvePurchase, markInvoicePaid, markPurchasePaid, markPurchasesExported, reopenSupplierInvoice, sendBackPurchase, sendForApproval, setApprovalLimit, subcontractorSendsInvoice, takeBackPurchase, unmarkInvoicePaid, unmarkPurchasePaid } from "./actions";
import { projectCosts } from "./figures";
import { useData } from "./store";

const db = () => useData.getState().db;
const day = () => useData.getState().day;
const inv = (id: string) => db().supplierInvoices.find((x) => x.id === id)!;
const byNo = (no: string) => db().supplierInvoices.find((x) => x.invoiceNo === no)!;
const project = (code: string) => db().projects.find((p) => p.code === code)!;
const person = (level: string) => db().people.find((p) => p.level === level)!;
const limit = () => db().approvalLimits.find((x) => x.id === "supplier")!.amount;
const lines = (code: string, amount: number) => [{ projectId: project(code).id, category: "material" as const, amount, description: "Checked line" }];

describe("the paying side of the sample data", () => {
  beforeEach(() => useData.getState().reset());

  it("files every invoice under its own number, in the order they arrived, with a date to pay it by", () => {
    const all = [...db().supplierInvoices].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
    expect(new Set(all.map((s) => s.fileNo)).size).toBe(all.length);
    expect(all.map((s) => Number(s.fileNo!.slice(2)))).toEqual(all.map((_, n) => 1001 + n));
    for (const s of all) expect(s.dueOn! > s.invoiceDate, s.invoiceNo).toBe(true);
  });

  it("was approved by whoever may: accounts up to the limit, the managing director above, a site's manager for a subcontractor", () => {
    const accounts = person("accounts").name;
    const md = person("md").name;
    for (const s of db().supplierInvoices.filter((x) => x.readStatus === "confirmed")) {
      if (partyOf(s) === "subcontractor") {
        const site = db().projects.find((p) => p.id === s.allocations[0]!.projectId)!;
        expect(s.confirmedBy, s.invoiceNo).toBe(db().people.find((p) => p.id === site.siteManagerId)!.name);
      } else expect(s.confirmedBy, s.invoiceNo).toBe(s.subtotal <= limit() ? accounts : md);
      // Anything accounts could not approve themselves was asked for first.
      expect(!!s.askedAt, s.invoiceNo).toBe(s.confirmedBy !== accounts);
      if (s.askedAt) expect(s.askedAt <= s.confirmedAt!, s.invoiceNo).toBe(true);
    }
  });

  it("pays on Fridays, never before approval, never in the future, and never a credit note", () => {
    const paid = db().supplierInvoices.filter((s) => s.paidOn);
    expect(paid.length).toBeGreaterThan(50);
    for (const s of paid) {
      expect(new Date(`${s.paidOn}T12:00:00Z`).getUTCDay(), s.invoiceNo).toBe(5);
      expect(s.paidOn! <= day() && s.paidOn! >= s.confirmedAt!.slice(0, 10) && s.paidOn! <= payBy(s), s.invoiceNo).toBe(true);
      expect([s.docType, s.readStatus, !!s.paidBy], s.invoiceNo).toEqual(["invoice", "confirmed", true]);
    }
  });

  it("leaves two approved invoices past their date, so something is late", () => {
    const waiting = db().supplierInvoices.filter((s) => purchaseStage(s) === "pay");
    expect(waiting.filter((s) => payBy(s) < day())).toHaveLength(2);
    expect(waiting.length).toBeGreaterThan(10);
  });

  it("has invoices waiting for the managing director and for site managers, and one sent back to a subcontractor", () => {
    const waiting = db().supplierInvoices.filter((s) => purchaseStage(s) === "approve");
    expect(waiting.filter((s) => partyOf(s) === "supplier").map((s) => s.invoiceNo).sort()).toEqual(["ALC-6631", "SBS-7755"]);
    expect(waiting.filter((s) => partyOf(s) === "subcontractor").map((s) => s.invoiceNo).sort()).toEqual(["CES-2231", "CS-INV-9921", "LRL-0412", "PDP-118"]);
    for (const s of waiting.filter((x) => partyOf(x) === "supplier")) expect(s.subtotal).toBeGreaterThan(limit());
    for (const s of waiting.filter((x) => partyOf(x) === "subcontractor")) expect([s.via, s.allocations.length > 0, s.jobRef === db().projects.find((p) => p.id === s.allocations[0]!.projectId)!.code]).toEqual(["portal", true, true]);
    const back = db().supplierInvoices.filter((s) => purchaseStage(s) === "back");
    expect(back.map((s) => s.invoiceNo)).toEqual(["KSC-325"]);
    expect(needsAccounts(back[0]!)).toBe(false);
    // What accounts still have to deal with is what it was before approval became its own step.
    expect(db().supplierInvoices.filter(needsAccounts)).toHaveLength(5);
  });

  it("keeps every subcontractor's invoices under the subcontractor on file, on a site they are on or were on", () => {
    expect(db().subcontractors).toHaveLength(5);
    for (const sub of db().subcontractors) {
      expect(sub.projectIds.every((id) => db().projects.some((p) => p.id === id)), sub.name).toBe(true);
      expect(sub.email, sub.name).toMatch(/@/);
      const theirs = db().supplierInvoices.filter((s) => s.subcontractorId === sub.id);
      expect(theirs.length, sub.name).toBeGreaterThan(0);
      for (const s of theirs) expect([s.supplier, s.party], s.invoiceNo).toEqual([sub.name, "subcontractor"]);
    }
    // Several share a site.
    const onSite = (code: string) => db().subcontractors.filter((s) => s.projectIds.includes(project(code).id)).length;
    expect([onSite("C719"), onSite("C721"), onSite("C722")].every((n) => n >= 2)).toBe(true);
  });

  it("has told each subcontractor paid in the last month, by a remittance advice under Sent", () => {
    const recent = db().supplierInvoices.filter((s) => s.subcontractorId && s.paidOn && s.paidOn >= "2026-10-01");
    for (const s of db().supplierInvoices.filter((x) => x.subcontractorId && x.paidOn)) {
      const mail = db().mails.find((m) => m.purchaseInvoiceId === s.id);
      if (mail) expect([mail.folder, mail.subject.includes(s.invoiceNo), mail.receivedAt.slice(0, 10)], s.invoiceNo).toEqual(["Sent", true, s.paidOn]);
    }
    expect(recent.some((s) => db().mails.some((m) => m.purchaseInvoiceId === s.id)) || recent.length === 0).toBe(true);
  });
});

describe("approving and paying", () => {
  beforeEach(() => useData.getState().reset());

  it("accounts send an invoice for approval, and can take it back to change it", () => {
    const s = byNo("BLS-20417");
    expect(purchaseStage(s)).toBe("check");
    sendForApproval(s.id, lines("C719", s.subtotal));
    expect([purchaseStage(inv(s.id)), !!inv(s.id).askedBy, inv(s.id).allocations[0]!.description]).toEqual(["approve", true, "Checked line"]);
    takeBackPurchase(s.id);
    expect([purchaseStage(inv(s.id)), inv(s.id).askedAt]).toEqual(["check", undefined]);
    // Nothing to send without lines.
    sendForApproval(s.id, []);
    expect(purchaseStage(inv(s.id))).toBe("check");
  });

  it("approving puts it into the job's costs, files the paper, and passes it to be paid", () => {
    const s = byNo("SBS-7755");
    const p = project("C725");
    const before = projectCosts(db(), p).material;
    approvePurchase(s.id);
    const after = inv(s.id);
    expect([purchaseStage(after), !!after.confirmedAt, after.sentBack]).toEqual(["pay", true, undefined]);
    expect(Math.round((projectCosts(db(), p).material - before) * 100) / 100).toBe(s.subtotal);
    expect(db().files.some((f) => f.projectId === p.id && f.category === "Invoices" && f.name === s.fileName)).toBe(true);
    expect(db().activity[0]!.what).toBe("Approved a supplier invoice into job costs");
    // A second press changes nothing.
    const stamp = after.confirmedAt;
    approvePurchase(s.id);
    expect(inv(s.id).confirmedAt).toBe(stamp);
  });

  it("an invoice with no lines coded cannot be approved", () => {
    const s = byNo("MSM-5521");
    approvePurchase(s.id);
    expect(purchaseStage(inv(s.id))).toBe("check");
    approvePurchase(s.id, lines("C721", s.subtotal));
    expect(purchaseStage(inv(s.id))).toBe("pay");
  });

  it("sending back needs a reason, takes it out of the approver's list, and is cleared when it is asked for again", () => {
    const s = byNo("ALC-6631");
    sendBackPurchase(s.id, "   ");
    expect(purchaseStage(inv(s.id))).toBe("approve");
    sendBackPurchase(s.id, "Four rolls invoiced, three delivered. ");
    expect([purchaseStage(inv(s.id)), inv(s.id).sentBack?.reason, inv(s.id).askedAt, needsAccounts(inv(s.id))]).toEqual(["back", "Four rolls invoiced, three delivered.", undefined, true]);
    sendForApproval(s.id, lines("C721", s.subtotal));
    expect([purchaseStage(inv(s.id)), inv(s.id).sentBack]).toEqual(["approve", undefined]);
  });

  it("marking paid records the day, the reference and who, and can be undone", () => {
    const s = db().supplierInvoices.find((x) => purchaseStage(x) === "pay" && partyOf(x) === "supplier")!;
    const mails = db().mails.length;
    markPurchasePaid(s.id, { paidOn: s.invoiceDate, ref: " BT 4471 ", email: true });
    expect([purchaseStage(inv(s.id)), inv(s.id).paidOn, inv(s.id).paidRef, !!inv(s.id).paidBy]).toEqual(["paid", s.invoiceDate, "BT 4471", true]);
    // A supplier has no portal and no address on file: nothing is emailed.
    expect(db().mails.length).toBe(mails);
    unmarkPurchasePaid(s.id);
    expect([purchaseStage(inv(s.id)), inv(s.id).paidOn, inv(s.id).paidRef, inv(s.id).paidBy]).toEqual(["pay", undefined, undefined, undefined]);
    expect(db().activity[0]!.what).toBe("Took back a payment marked by mistake");
  });

  it("a date after today is not taken, and an invoice not yet approved cannot be paid", () => {
    const s = db().supplierInvoices.find((x) => purchaseStage(x) === "pay")!;
    markPurchasePaid(s.id, { paidOn: "2099-01-01" });
    expect(inv(s.id).paidOn).toBe(day());
    const waiting = byNo("SBS-7755");
    markPurchasePaid(waiting.id);
    expect(purchaseStage(inv(waiting.id))).toBe("approve");
  });

  it("a subcontractor paid with the email ticked gets a remittance advice under Sent; without it, only the portal", () => {
    const [a, b] = db().supplierInvoices.filter((x) => purchaseStage(x) === "pay" && partyOf(x) === "subcontractor");
    const count = () => db().mails.filter((m) => m.purchaseInvoiceId === a!.id || m.purchaseInvoiceId === b!.id).length;
    markPurchasePaid(a!.id, { email: true, ref: "BT 9001" });
    const mail = db().mails.find((m) => m.purchaseInvoiceId === a!.id)!;
    const sub = db().subcontractors.find((x) => x.id === a!.subcontractorId)!;
    expect([mail.folder, mail.subject.includes(a!.invoiceNo), mail.body.includes(sub.email), mail.body.includes("BT 9001")]).toEqual(["Sent", true, true, true]);
    markPurchasePaid(b!.id, { email: false });
    expect([purchaseStage(inv(b!.id)), count()]).toEqual(["paid", 1]);
  });

  it("reopening takes an approved invoice back out of job costs, but not one that has been paid", () => {
    const s = db().supplierInvoices.find((x) => purchaseStage(x) === "pay")!;
    reopenSupplierInvoice(s.id);
    expect([purchaseStage(inv(s.id)), inv(s.id).confirmedBy, inv(s.id).askedAt]).toEqual(["check", undefined, undefined]);
    const paid = db().supplierInvoices.find((x) => purchaseStage(x) === "paid")!;
    reopenSupplierInvoice(paid.id);
    expect(purchaseStage(inv(paid.id))).toBe("paid");
  });

  it("the limit can be changed, and decides what accounts may approve from then on", () => {
    const accounts = { personId: person("accounts").id, handles: true, approvesAll: false, approvesOwnSites: false };
    const s = byNo("BLS-20417");
    expect(mayApprove(s, accounts, limit(), db().projects)).toBe(false);
    setApprovalLimit(2500.4);
    expect(limit()).toBe(2500);
    expect(mayApprove(s, accounts, limit(), db().projects)).toBe(true);
    setApprovalLimit(-10);
    expect(limit()).toBe(0);
    expect(db().activity[0]!.what).toBe("Changed what accounts may approve");
  });

  it("an export stamps the approved invoices it carried, all with the one time", () => {
    const fresh = db().supplierInvoices.filter((s) => s.readStatus === "confirmed" && !s.exportedAt);
    expect(fresh.length).toBeGreaterThan(5);
    markPurchasesExported(fresh.map((s) => s.id), "Sage");
    expect(new Set(fresh.map((s) => inv(s.id).exportedAt)).size).toBe(1);
    expect(db().supplierInvoices.filter((s) => s.readStatus === "confirmed" && !s.exportedAt)).toHaveLength(0);
  });
});

describe("a subcontractor's invoice through the portal", () => {
  beforeEach(() => useData.getState().reset());

  it("goes straight to whoever runs the site, coded to that site, with the next file number", () => {
    const sub = db().subcontractors.find((s) => s.name === "Corrib Scaffolding")!;
    const p = project("C721");
    const highest = Math.max(...db().supplierInvoices.map((s) => Number(s.fileNo!.slice(2))));
    const id = subcontractorSendsInvoice(sub.id, { projectId: p.id, invoiceNo: " CS-INV-9930 ", invoiceDate: day(), description: "Scaffold strike, east gable", net: 1850, vatPct: 13.5, copy: { name: "9930.pdf", dataUrl: "data:application/pdf;base64,AAAA" } })!;
    const s = inv(id);
    expect([s.invoiceNo, s.supplier, s.party, s.via, s.jobRef, purchaseStage(s), s.fileNo, s.askedBy, s.copy?.name]).toEqual(["CS-INV-9930", sub.name, "subcontractor", "portal", "C721", "approve", `F-${highest + 1}`, sub.contactName, "9930.pdf"]);
    expect([s.subtotal, s.vat, s.total]).toEqual([1850, 249.75, 2099.75]);
    expect(s.allocations.map((a) => [a.projectId, a.category, a.amount])).toEqual([[p.id, "labour", 1850]]);
    const manager = { personId: p.siteManagerId, handles: false, approvesAll: false, approvesOwnSites: true };
    const another = { ...manager, personId: project("C719").siteManagerId };
    expect([mayApprove(s, manager, limit(), db().projects), mayApprove(s, another, limit(), db().projects)]).toEqual([true, false]);
    expect([db().activity[0]!.who, db().activity[0]!.department]).toEqual([sub.contactName, "portal"]);
    // Not in the job's costs until it is approved.
    const before = projectCosts(db(), p).cost;
    approvePurchase(id);
    expect(Math.round((projectCosts(db(), p).cost - before) * 100) / 100).toBe(1850);
  });

  it("is refused without a number, an amount, or a site and subcontractor on file", () => {
    const sub = db().subcontractors[0]!;
    const p = project("C719");
    const n = db().supplierInvoices.length;
    const ok = { projectId: p.id, invoiceNo: "X-1", invoiceDate: day(), description: "Work", net: 100, vatPct: 13.5 };
    expect(subcontractorSendsInvoice(sub.id, { ...ok, invoiceNo: " " })).toBeNull();
    expect(subcontractorSendsInvoice(sub.id, { ...ok, net: 0 })).toBeNull();
    expect(subcontractorSendsInvoice(sub.id, { ...ok, projectId: "pr-none" })).toBeNull();
    expect(subcontractorSendsInvoice("sub-none", ok)).toBeNull();
    expect(db().supplierInvoices.length).toBe(n);
  });
});

describe("a client told their invoice is paid", () => {
  beforeEach(() => useData.getState().reset());

  it("with the email ticked a receipt is filed under Sent against the invoice, on the day given", () => {
    const i = db().salesInvoices.find((x) => x.status === "Invoiced")!;
    const mails = db().mails.filter((m) => m.salesInvoiceId === i.id).length;
    markInvoicePaid(i.id, { paidOn: i.issuedOn, email: true });
    const now = db().salesInvoices.find((x) => x.id === i.id)!;
    const receipt = db().mails.find((m) => m.salesInvoiceId === i.id && m.subject.startsWith("Payment received"))!;
    expect([now.status, now.paidOn, receipt.folder, receipt.subject.includes(invoiceNo(i))]).toEqual(["Paid", i.issuedOn, "Sent", true]);
    expect(db().mails.filter((m) => m.salesInvoiceId === i.id).length).toBe(mails + 1);
    expect(now.history!.at(-1)!.what).toMatch(/^Marked paid\. Receipt emailed to /);
    unmarkInvoicePaid(i.id);
    expect(db().salesInvoices.find((x) => x.id === i.id)!.status).toBe("Invoiced");
  });

  it("without it nothing is emailed, and the date defaults to today", () => {
    const i = db().salesInvoices.find((x) => x.status === "Invoiced")!;
    const mails = db().mails.length;
    markInvoicePaid(i.id);
    const now = db().salesInvoices.find((x) => x.id === i.id)!;
    expect([now.paidOn, db().mails.length, now.history!.at(-1)!.what]).toEqual([day(), mails, "Marked paid"]);
  });
});
