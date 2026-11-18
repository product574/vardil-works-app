import { describe, expect, it } from "vitest";
import type { Client, InvoiceQuery, Project, SalesInvoice } from "@/data/types";
import { agedDebt, billedSoFar, billingEmail, DEFAULT_EMAIL, defaultDesign, doneNotBilled, draftStarts, dueWords, emailFor, exportRowOf, fill, firstName, invoiceDoc, leftToBill, linesNet, matches, nextAccountsNo, openQuery, pdfName, printedLines, routeWords, salesNominal, shows, stageOf, threadFor, inAgeBucket } from "./invoices";

const today = "2026-11-18";
const inv = (over: Partial<SalesInvoice>): SalesInvoice => ({ id: "inv-1", ref: "INV-5201", projectId: "pr-C720", clientId: "c-02", description: "Stage payment 1: render removal and first coats", net: 1000, vatPct: 13.5, status: "To invoice", ...over });
const client: Client = { id: "c-02", name: "Ardmullen Estate", type: "Private owner", contactName: "Susan Kane", contactPhone: "091 555 0162", contactEmail: "estate.office@ardmullen.example", accountRef: "ARDM01", termsDays: 30, portalEnabled: true, address: "Estate Office, Ardmullen House, Kilcolgan", county: "Galway" };
const project = { id: "pr-C720", code: "C720", name: "Ardmullen House", location: "Kilcolgan", county: "Galway", value: 100000 } as Project;

describe("where an invoice stands", () => {
  it("reads a draft, a held one, a sent one, an overdue one and a paid one", () => {
    expect(stageOf(inv({}), today)).toBe("draft");
    expect(stageOf(inv({ status: "Held" }), today)).toBe("held");
    expect(stageOf(inv({ status: "Invoiced", dueOn: "2026-11-18" }), today)).toBe("sent");
    expect(stageOf(inv({ status: "Invoiced", dueOn: "2026-11-17" }), today)).toBe("overdue");
    expect(stageOf(inv({ status: "Paid", dueOn: "2026-10-01" }), today)).toBe("paid");
  });
  it("says how late in words", () => {
    expect(dueWords({ dueOn: "2026-11-06" }, today)).toBe("12 days late");
    expect(dueWords({ dueOn: "2026-11-17" }, today)).toBe("1 day late");
    expect(dueWords({ dueOn: today }, today)).toBe("Due today");
    expect(dueWords({ dueOn: "2026-11-21" }, today)).toBe("Due in 3 days");
  });
  it("the unpaid tab is sent and overdue together", () => {
    const sent = inv({ status: "Invoiced", dueOn: "2026-12-01" });
    const late = inv({ status: "Invoiced", dueOn: "2026-11-01" });
    expect([sent, late, inv({}), inv({ status: "Paid" })].map((i) => shows(i, "unpaid", today))).toEqual([true, true, false, false]);
    expect(shows(late, "sent", today)).toBe(false);
    expect(shows(late, "all", today)).toBe(true);
  });
  it("ages what is owed, with VAT, and leaves out drafts and paid", () => {
    const list = [inv({ status: "Invoiced", dueOn: "2026-12-01" }), inv({ status: "Invoiced", dueOn: "2026-11-01", net: 2000 }), inv({ status: "Invoiced", dueOn: "2026-08-01", net: 400 }), inv({ status: "Paid" }), inv({})];
    const a = agedDebt(list, today);
    expect(a.buckets.map((b) => b.count)).toEqual([1, 1, 0, 1]);
    expect(a.buckets.map((b) => b.gross)).toEqual([1135, 2270, 0, 454]);
    expect(a.gross).toBe(3859);
    expect(a.count).toBe(3);
  });
  it("finds an invoice by its number, client, project or order number", () => {
    const i = inv({ accountsNo: "SI-10404", poNumber: "PO-7781" });
    for (const q of ["si-104", "ardmullen", "c720", "po-77", "susan", "render"]) expect(matches(i, q, client, project), q).toBe(true);
    expect(matches(i, "dunmoy", client, project)).toBe(false);
    expect(matches(i, "  ", client, project)).toBe(true);
  });
});

describe("lines and what is left to bill", () => {
  it("adds up lines to the cent", () => {
    expect(linesNet([{ qty: 3, rate: 19.99 }, { qty: 0.5, rate: 100 }])).toBe(109.97);
  });
  it("prints one line for an invoice raised from a stage, and its own lines when drafted by hand", () => {
    expect(printedLines(inv({}))).toEqual([{ description: "Stage payment 1: render removal and first coats", qty: 1, unit: "item", rate: 1000 }]);
    expect(printedLines(inv({ lines: [{ id: "l1", description: "Dayworks", qty: 8, unit: "hours", rate: 55 }] }))[0]!.unit).toBe("hours");
  });
  it("counts every invoice on the job except a final account still to go out, and the one being edited", () => {
    const list = [inv({ id: "a", net: 30000, status: "Paid" }), inv({ id: "b", net: 20000 }), inv({ id: "f", net: 50000, description: "Final account", status: "Held" }), inv({ id: "x", projectId: "pr-other", net: 9000 })];
    expect(leftToBill(project, list)).toBe(50000);
    expect(leftToBill(project, list, "b")).toBe(70000);
    // Once the final account has gone, it counts like any other.
    expect(leftToBill(project, list.map((i) => (i.id === "f" ? { ...i, status: "Invoiced" as const } : i)))).toBe(0);
  });
  it("totals what has been invoiced and paid on a project, before VAT", () => {
    const list = [inv({ net: 30000, status: "Paid" }), inv({ net: 20000, status: "Invoiced" }), inv({ net: 5000 })];
    expect(billedSoFar("pr-C720", list)).toEqual({ invoiced: 50000, paid: 30000 });
  });
  it("puts agreed extras under their own nominal code", () => {
    expect(salesNominal({ description: "Agreed extra: 3 quoins" })).toBe("4010");
    expect(salesNominal({ description: "Final account" })).toBe("4000");
  });
});

describe("starting a draft from the project's records", () => {
  it("values the work done and not yet invoiced, rounded, and never more than is left on the contract", () => {
    // 60% of 100,000 is done and 30,000 is billed: 30,000 to bill.
    expect(doneNotBilled(project, 60, [inv({ net: 30000, status: "Paid" })])).toBe(30000);
    expect(doneNotBilled(project, 20, [inv({ net: 30000, status: "Paid" })])).toBe(0);
    expect(doneNotBilled(project, 100, [inv({ net: 99990, status: "Paid" })])).toBe(10);
    expect(doneNotBilled(project, 33.333, [])).toBe(33330);
  });
  it("offers the next stage with that figure, each agreed extra not yet billed, dayworks and a blank", () => {
    const variations = [
      { id: "v1", projectId: "pr-C720", status: "Approved", measured: "3 quoins", description: "Cracked quoins replaced", estimatedValue: 900 },
      { id: "v2", projectId: "pr-C720", status: "Approved", measured: "1 lintel", description: "Rotten lintel", estimatedValue: 400 },
      { id: "v3", projectId: "pr-C720", status: "Draft", measured: "cornice", description: "Extra cornice", estimatedValue: 700 },
    ] as never;
    const invoices = [inv({ description: "Stage payment 1: render", status: "Paid" }), inv({ description: "Agreed extra: 1 lintel" })];
    const starts = draftStarts(project, invoices, variations, 12340);
    expect(starts.map((s) => s.label)).toEqual(["Stage payment 2", "Agreed extra: 3 quoins", "Dayworks", "Something else"]);
    expect(starts[0]!.lines[0]).toMatchObject({ rate: 12340, qty: 1 });
    expect(starts[1]!.lines[0]).toMatchObject({ description: "Cracked quoins replaced", rate: 900 });
  });
  it("numbers the next invoice one past the highest, and says how one went out", () => {
    expect(nextAccountsNo([{ accountsNo: "SI-10404" }, { accountsNo: undefined }, { accountsNo: "SI-10410" }])).toBe("SI-10411");
    expect(nextAccountsNo([])).toBe("SI-1");
    expect(routeWords(["email", "portal"])).toBe("by email and the portal");
    expect(routeWords(["post"])).toBe("by post");
    expect(routeWords(undefined)).toBe("");
  });
  it("lays an invoice out as a row for the accounts package", () => {
    expect(exportRowOf(inv({ status: "Invoiced", accountsNo: "SI-10404", issuedOn: "2026-11-01", dueOn: "2026-12-01", description: "Agreed extra: 3 quoins" }), client, project)).toEqual({ accountRef: "ARDM01", clientName: "Ardmullen Estate", invoiceNo: "SI-10404", issuedOn: "2026-11-01", dueOn: "2026-12-01", details: "C720 Agreed extra: 3 quoins", net: 1000, vatPct: 13.5, siteCode: "C720", nominal: "4010" });
  });
});

describe("the email that carries an invoice", () => {
  it("fills in the placeholders and leaves other braces alone", () => {
    expect(fill("Dear {contact}, {invoice} {nothing}", { contact: "Susan", invoice: "SI-1" })).toBe("Dear Susan, SI-1 {nothing}");
  });
  it("greets by first name, without a title", () => {
    expect(firstName("Rev. Hilary Stanford")).toBe("Hilary");
    expect(firstName("Susan Kane")).toBe("Susan");
  });
  it("writes the subject and body for one invoice", () => {
    const e = emailFor(DEFAULT_EMAIL, { invoice: inv({ status: "Invoiced" }), number: "SI-10412", dueOn: "2026-12-18", client, project, sender: "Maeve Quirke", company: "ABC Construction Ltd", region: "IE" });
    expect(e.subject).toBe("Invoice SI-10412 from ABC Construction Ltd, Ardmullen House");
    expect(e.body).toContain("Dear Susan,");
    expect(e.body).toContain("invoice SI-10412 for stage payment 1: render removal and first coats at Ardmullen House");
    expect(e.body).toContain("€1,135.00 including VAT, due on 18 December 2026");
    expect(e.body.endsWith("Maeve Quirke\nABC Construction Ltd")).toBe(true);
    expect(e.body).not.toMatch(/[{}]/);
  });
  it("goes to the billing address when the client has one", () => {
    expect(billingEmail(client)).toBe("estate.office@ardmullen.example");
    expect(billingEmail({ ...client, billingEmail: "accounts@ardmullen.example" })).toBe("accounts@ardmullen.example");
  });
});

describe("the invoice as a document", () => {
  const design = defaultDesign("IE", "abcconstruction.example");
  it("a draft says so, with dates still to come", () => {
    const d = invoiceDoc({ invoice: inv({ poNumber: "PO-7781" }), client, project, design, company: "ABC Construction Ltd", region: "IE", today });
    expect(d.stamp).toBe("Draft");
    expect(d.number).toBe("INV-5201");
    expect(d.facts).toContainEqual(["Invoice date", "On sending"]);
    expect(d.facts).toContainEqual(["Due", "30 days from sending"]);
    expect(d.facts).toContainEqual(["Your order", "PO-7781"]);
    expect(d.facts).toContainEqual(["Site", "Ardmullen House, Kilcolgan, Co. Galway"]);
    expect(d.billTo).toEqual(["Ardmullen Estate", "For the attention of Susan Kane", "Estate Office", "Ardmullen House", "Kilcolgan", "Co. Galway"]);
  });
  it("a sent invoice has its number, dates, VAT and total", () => {
    const d = invoiceDoc({ invoice: inv({ status: "Invoiced", accountsNo: "SI-10412", issuedOn: "2026-11-18", dueOn: "2026-12-18" }), client, project, design, company: "ABC Construction Ltd", region: "IE", today });
    expect(d.stamp).toBe("");
    expect(d.number).toBe("SI-10412");
    expect(d.facts[0]).toEqual(["Invoice date", "18 November 2026"]);
    expect(d.totals).toEqual([{ label: "Subtotal", value: "€1,000.00" }, { label: "VAT at 13.5%", value: "€135.00" }, { label: "Total due", value: "€1,135.00", strong: true }]);
    expect(d.notes.at(-1)).toBe("Payment within 30 days of the invoice date by bank transfer, quoting the invoice number.");
    expect(d.bank).toEqual(["Sample Bank", "IBAN IE00 SAMP 0000 0000 0000 00", "BIC SAMPIE2D"]);
    expect(d.seller.registration).toEqual(["VAT no. IE 0000000AB", "Company no. 000000"]);
  });
  it("follows the design: no bank details, no site, and the UK writes a county plainly", () => {
    const d = invoiceDoc({ invoice: inv({ status: "Paid" }), client, project, design: { ...design, showBank: false, showSite: false }, company: "ABC", region: "UK", today });
    expect(d.bank).toEqual([]);
    expect(d.facts.some(([k]) => k === "Site")).toBe(false);
    expect(d.billTo.at(-1)).toBe("Galway");
    expect(d.stamp).toBe("Paid");
    expect(d.totals[2]!.label).toBe("Total paid");
    expect(d.totals[0]!.value).toBe("£1,000.00");
  });
  it("names the PDF by number and firm, with nothing a file name cannot hold", () => {
    expect(pdfName("SI-10412", "ABC Construction Ltd.")).toBe("SI-10412 ABC Construction Ltd.pdf");
    expect(pdfName("SI-1", "O'Brien & Sons")).toBe("SI-1 OBrien  Sons.pdf");
  });
});

describe("what has been said about an invoice", () => {
  const q: InvoiceQuery = { id: "q1", salesInvoiceId: "inv-1", raisedAt: "2026-11-16T10:00:00", via: "Portal", raisedBy: "Susan Kane", text: "Which rooms does this cover?", status: "Settled", replies: [{ at: "2026-11-16T14:00:00", who: "Maeve Quirke", text: "The east wing." }], outcome: "Explained, invoice stands", settledBy: "Maeve Quirke", settledAt: "2026-11-17T09:00:00" };
  it("puts emails, comments and queries in the order they happened", () => {
    const db = {
      mails: [
        { id: "m1", salesInvoiceId: "inv-1", folder: "Sent", fromName: "Maeve Quirke", subject: "Invoice SI-1", body: "Attached.", receivedAt: "2026-11-10T10:40:00" },
        { id: "m2", salesInvoiceId: "inv-2", folder: "Sent", fromName: "Maeve Quirke", subject: "Other", body: "", receivedAt: "2026-11-11T10:40:00" },
      ],
      invoiceComments: [{ id: "c1", salesInvoiceId: "inv-1", at: "2026-11-16T15:00:00", who: "Aidan King", text: "Susan rang as well." }],
      invoiceQueries: [q],
    } as never;
    const t = threadFor(db, "inv-1");
    expect(t.map((x) => x.kind)).toEqual(["sent", "query", "reply", "comment", "settled"]);
    expect(t[0]!.to).toBe("/inbox/sent?mail=m1");
    expect(t[1]!.title).toBe("Query by the portal");
  });
  it("knows when a query is still open", () => {
    expect(openQuery([q], "inv-1")).toBeUndefined();
    expect(openQuery([{ ...q, status: "Open" }], "inv-1")?.id).toBe("q1");
  });
});

describe("the squares over the list", () => {
  it("each picks out the sent, unpaid invoices in its own age band", () => {
    const sent = (dueOn: string) => ({ status: "Invoiced" as const, dueOn });
    const today = "2026-11-18";
    expect([0, 1, 2, 3].map((b) => inAgeBucket(sent("2026-11-18"), b, today))).toEqual([true, false, false, false]);
    expect([0, 1, 2, 3].map((b) => inAgeBucket(sent("2026-11-17"), b, today))).toEqual([false, true, false, false]);
    expect([0, 1, 2, 3].map((b) => inAgeBucket(sent("2026-10-19"), b, today))).toEqual([false, true, false, false]);
    expect([0, 1, 2, 3].map((b) => inAgeBucket(sent("2026-10-18"), b, today))).toEqual([false, false, true, false]);
    expect([0, 1, 2, 3].map((b) => inAgeBucket(sent("2026-09-01"), b, today))).toEqual([false, false, false, true]);
  });
  it("a draft, a held or a paid invoice is in none of them", () => {
    for (const status of ["To invoice", "Held", "Paid"] as const) expect([0, 1, 2, 3].some((b) => inAgeBucket({ status, dueOn: "2026-10-01" }, b, "2026-11-18"))).toBe(false);
  });
});
