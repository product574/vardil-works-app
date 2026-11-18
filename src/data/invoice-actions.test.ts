import { beforeEach, describe, expect, it } from "vitest";
import { invoiceNo } from "@/lib/billing";
import { leftToBill } from "@/lib/invoices";
import { addInvoiceComment, clientSaysPaid, clientSendsDocument, deleteDraftInvoice, draftInvoice, emailAboutInvoice, markExported, markInvoicePaid, raiseInvoiceQuery, replyToInvoiceQuery, saveDraftInvoice, sendInvoice, settleInvoiceQuery, unmarkInvoicePaid } from "./actions";
import { useData } from "./store";

const db = () => useData.getState().db;
const day = () => useData.getState().day;
const inv = (id: string) => db().salesInvoices.find((x) => x.id === id)!;
const project = (code: string) => db().projects.find((p) => p.code === code)!;
const how = { email: true, portal: true, to: "accounts@client.example", subject: "Your invoice", body: "Attached.", attachment: "invoice.pdf" };

describe("the sample invoices", () => {
  beforeEach(() => useData.getState().reset());

  it("every invoice that went out says when, to whom and how, with the email that carried it", () => {
    for (const i of db().salesInvoices.filter((x) => x.issuedOn)) {
      expect(i.sentAt?.slice(0, 10), invoiceNo(i)).toBe(i.issuedOn);
      expect(i.sentTo, invoiceNo(i)).toMatch(/@/);
      expect(i.sentVia, invoiceNo(i)).toContain("email");
      const mail = db().mails.find((m) => m.salesInvoiceId === i.id && m.folder === "Sent")!;
      expect(mail.subject).toContain(invoiceNo(i));
      expect(mail.attachment).toMatch(/\.pdf$/);
      expect(mail.body).not.toMatch(/[{}]/);
    }
    // A draft has gone nowhere.
    for (const i of db().salesInvoices.filter((x) => !x.issuedOn)) expect([i.sentAt, i.sentVia]).toEqual([undefined, undefined]);
  });

  it("each history runs in order and never into the future", () => {
    for (const i of db().salesInvoices) {
      const at = (i.history ?? []).map((h) => h.at);
      expect(at.length, i.ref).toBeGreaterThan(0);
      expect([...at].sort(), i.ref).toEqual(at);
      for (const stamp of at) expect(stamp.slice(0, 10) <= day(), `${i.ref} ${stamp}`).toBe(true);
    }
  });

  it("a query, a comment and a client's word that they have paid each sit on an invoice that is out", () => {
    const open = db().invoiceQueries.filter((q) => q.status === "Open");
    expect(open).toHaveLength(1);
    expect(inv(open[0]!.salesInvoiceId).status).toBe("Invoiced");
    expect(db().invoiceQueries.some((q) => q.status === "Settled" && q.replies.length > 0 && !!q.outcome)).toBe(true);
    for (const c of db().invoiceComments) expect(inv(c.salesInvoiceId).status).toBe("Invoiced");
    expect(db().salesInvoices.filter((i) => i.clientPaidOn).every((i) => i.status === "Invoiced")).toBe(true);
  });

  it("clients have somewhere to address and email an invoice", () => {
    for (const c of db().clients) expect([!!c.address, !!c.county], c.name).toEqual([true, true]);
  });
});

describe("drafting an invoice by hand", () => {
  beforeEach(() => useData.getState().reset());

  it("makes a draft on the project, for its client, that nobody outside has seen", () => {
    const p = project("C720");
    const before = leftToBill(p, db().salesInvoices);
    const ref = draftInvoice({ projectId: p.id, description: "Stage payment 2: finish coats", lines: [{ description: "Finish coats", qty: 1, unit: "item", rate: 20000 }, { description: "Dayworks", qty: 8, unit: "hours", rate: 50 }], vatPct: 13.5, poNumber: "ARD-1", notes: "" });
    const i = db().salesInvoices.find((x) => x.ref === ref)!;
    expect([i.status, i.net, i.clientId, i.manual, i.poNumber, i.accountsNo, i.lines?.length]).toEqual(["To invoice", 20400, p.clientId, true, "ARD-1", undefined, 2]);
    expect(leftToBill(p, db().salesInvoices)).toBe(before - 20400);
    expect(i.history?.[0]?.what).toBe("Drafted by hand");
    expect(db().activity[0]!.what).toBe("Drafted an invoice");
  });

  it("brings down a final account that has not gone out, so the job is never billed twice", () => {
    const final = db().salesInvoices.find((x) => x.description === "Final account" && x.status === "To invoice")!;
    const was = final.net;
    const ref = draftInvoice({ projectId: final.projectId, description: "Dayworks", lines: [{ description: "Dayworks", qty: 10, unit: "hours", rate: 50 }], vatPct: 13.5 });
    expect(inv(final.id).net).toBe(was - 500);
    // Changing the draft moves the final account with it, and deleting it puts the whole amount back.
    const draft = db().salesInvoices.find((x) => x.ref === ref)!;
    saveDraftInvoice(draft.id, { lines: [{ description: "Dayworks", qty: 4, unit: "hours", rate: 50 }], notes: "Sheets attached" });
    expect([inv(draft.id).net, inv(draft.id).notes, inv(final.id).net]).toEqual([200, "Sheets attached", was - 200]);
    deleteDraftInvoice(draft.id);
    expect(db().salesInvoices.some((x) => x.id === draft.id)).toBe(false);
    expect(inv(final.id).net).toBe(was);
  });

  it("an invoice raised from the job keeps its figure: only the order number and notes change, and it cannot be deleted", () => {
    const final = db().salesInvoices.find((x) => x.description === "Final account" && x.status === "To invoice")!;
    saveDraftInvoice(final.id, { lines: [{ description: "x", qty: 1, unit: "item", rate: 1 }], description: "Changed", poNumber: "PO-9", notes: "As agreed" });
    expect([inv(final.id).net, inv(final.id).description, inv(final.id).poNumber, inv(final.id).notes]).toEqual([final.net, "Final account", "PO-9", "As agreed"]);
    deleteDraftInvoice(final.id);
    expect(inv(final.id)).toBeTruthy();
  });
});

describe("sending, paying and undoing", () => {
  beforeEach(() => useData.getState().reset());

  it("sending a draft issues it, files the email under Sent and writes its history", () => {
    const draft = db().salesInvoices.find((x) => x.status === "To invoice")!;
    const mails = db().mails.length;
    const highest = Math.max(...db().salesInvoices.map((x) => Number((x.accountsNo ?? "SI-0").slice(3))));
    sendInvoice(draft.id, how);
    const i = inv(draft.id);
    expect([i.status, i.accountsNo, i.issuedOn, i.sentTo, i.sentVia]).toEqual(["Invoiced", `SI-${highest + 1}`, day(), "accounts@client.example", ["email", "portal"]]);
    expect(i.dueOn! > day()).toBe(true);
    expect(db().mails.length).toBe(mails + 1);
    const mail = db().mails[0]!;
    expect([mail.folder, mail.subject, mail.attachment, mail.salesInvoiceId, mail.clientId]).toEqual(["Sent", "Your invoice", "invoice.pdf", i.id, i.clientId]);
    expect(i.history?.at(-1)?.what).toMatch(/^Sent to .+ by email and the portal$/);
    expect(db().files.some((f) => f.projectId === i.projectId && f.category === "Invoices" && f.name.startsWith(i.accountsNo!))).toBe(true);
  });

  it("the portal alone sends no email, and sending needs at least one way", () => {
    const [a, b] = db().salesInvoices.filter((x) => x.status === "To invoice");
    const mails = db().mails.length;
    sendInvoice(a!.id, { ...how, email: false });
    expect([inv(a!.id).status, inv(a!.id).sentVia, db().mails.length]).toEqual(["Invoiced", ["portal"], mails]);
    sendInvoice(b!.id, { ...how, email: false, portal: false });
    expect(inv(b!.id).status).toBe("To invoice");
  });

  it("sending again keeps the number and the dates", () => {
    const out = db().salesInvoices.find((x) => x.status === "Invoiced")!;
    sendInvoice(out.id, how);
    const i = inv(out.id);
    expect([i.accountsNo, i.issuedOn, i.dueOn]).toEqual([out.accountsNo, out.issuedOn, out.dueOn]);
    expect(i.history?.at(-1)?.what).toMatch(/^Sent again/);
  });

  it("a held invoice cannot be sent", () => {
    const held = db().salesInvoices.find((x) => x.status === "Held")!;
    sendInvoice(held.id, how);
    expect(inv(held.id).status).toBe("Held");
  });

  it("paid can be undone, and a job that the payment closed opens again", () => {
    // C711: its final account is the only invoice on it, sent and unpaid.
    const p = project("C711");
    const i = db().salesInvoices.find((x) => x.projectId === p.id)!;
    expect([i.status, p.status]).toEqual(["Invoiced", "Invoiced"]);
    markInvoicePaid(i.id);
    expect([inv(i.id).status, inv(i.id).paidOn, project("C711").status]).toEqual(["Paid", day(), "Closed"]);
    unmarkInvoicePaid(i.id);
    expect([inv(i.id).status, inv(i.id).paidOn, project("C711").status]).toEqual(["Invoiced", undefined, "Invoiced"]);
    expect(inv(i.id).history?.slice(-2).map((h) => h.what)).toEqual(["Marked paid", "Paid taken back: it was marked by mistake"]);
    expect(project("C711").audit.at(-1)?.what).toContain("unpaid again");
    // Undo only undoes a paid invoice.
    unmarkInvoicePaid(i.id);
    expect(inv(i.id).status).toBe("Invoiced");
  });

  it("exporting stamps each invoice and says so in its history", () => {
    const waiting = db().salesInvoices.filter((x) => x.issuedOn && !x.exportedAt);
    expect(waiting.length).toBeGreaterThan(0);
    markExported(waiting.map((x) => x.id), "Sage 50");
    for (const w of waiting) expect([!!inv(w.id).exportedAt, inv(w.id).history?.at(-1)?.what]).toEqual([true, "Exported to Sage 50"]);
  });
});

describe("talking about an invoice", () => {
  beforeEach(() => useData.getState().reset());
  const clear = () => db().salesInvoices.find((x) => x.status === "Invoiced" && !db().invoiceQueries.some((q) => q.salesInvoiceId === x.id))!;

  it("a comment stays in the office, an email is filed under Sent against the invoice", () => {
    const i = clear();
    const before = db().invoiceComments.filter((c) => c.salesInvoiceId === i.id).length;
    addInvoiceComment(i.id, "  Rang them.  ");
    expect(db().invoiceComments.at(-1)).toMatchObject({ salesInvoiceId: i.id, text: "Rang them." });
    emailAboutInvoice(i.id, { to: "a@b.example", subject: "A question", body: "Could you confirm the order number?" });
    expect(db().mails[0]).toMatchObject({ folder: "Sent", salesInvoiceId: i.id, subject: "A question" });
    addInvoiceComment(i.id, "   ");
    expect(db().invoiceComments.filter((c) => c.salesInvoiceId === i.id)).toHaveLength(before + 1);
  });

  it("a query is raised once, answered, and settled with what was agreed", () => {
    const i = clear();
    raiseInvoiceQuery(i.id, { via: "Portal", raisedBy: "Susan Kane", text: "What does this cover?" });
    raiseInvoiceQuery(i.id, { via: "Portal", raisedBy: "Susan Kane", text: "Again" });
    const mine = () => db().invoiceQueries.filter((q) => q.salesInvoiceId === i.id);
    expect(mine()).toHaveLength(1);
    expect(db().activity[0]).toMatchObject({ who: "Susan Kane", department: "portal" });
    replyToInvoiceQuery(mine()[0]!.id, "The east wing.");
    settleInvoiceQuery(mine()[0]!.id, "Explained. The invoice stands.");
    expect(mine()[0]).toMatchObject({ status: "Settled", outcome: "Explained. The invoice stands." });
    expect(mine()[0]!.replies).toHaveLength(1);
    // Settled: nothing more can be added, and a new query can be raised.
    replyToInvoiceQuery(mine()[0]!.id, "More");
    expect(mine()[0]!.replies).toHaveLength(1);
    raiseInvoiceQuery(i.id, { via: "Phone", raisedBy: "Susan Kane", text: "One more thing" });
    expect(mine()).toHaveLength(2);
  });

  it("a client saying they have paid flags it and leaves it unpaid", () => {
    const i = db().salesInvoices.find((x) => x.status === "Invoiced" && !x.clientPaidOn)!;
    clientSaysPaid(i.id, "Susan Kane");
    expect([inv(i.id).status, inv(i.id).clientPaidOn, inv(i.id).history?.at(-1)?.who]).toEqual(["Invoiced", day(), "Susan Kane"]);
  });

  it("a document a client sends lands in the project's Correspondence folder, marked as from the portal", () => {
    const p = project("C720");
    clientSendsDocument(p.id, "Susan Kane", "Purchase order", { name: "po.pdf", dataUrl: "data:application/pdf;base64,AAAA" });
    expect(db().files[0]).toMatchObject({ projectId: p.id, category: "Correspondence", source: "Portal", addedBy: "Susan Kane", name: "Purchase order, po.pdf", kind: "pdf" });
  });
});
