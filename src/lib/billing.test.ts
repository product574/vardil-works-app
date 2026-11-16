import { describe, expect, it } from "vitest";
import { finalAccountNet, holdReason, holdWhy, invoiceNo, invoicedLine, paidLine, salesInvoiceFile } from "./billing";

describe("the final account", () => {
  it("bills the whole contract value when nothing else was billed", () => {
    expect(finalAccountNet(48250, [])).toBe(48250);
  });

  it("takes off every other invoice on the project, issued or not", () => {
    // Two stage payments: one paid, one still to be issued.
    expect(finalAccountNet(100000, [30000, 25000.5])).toBe(44999.5);
  });

  it("never goes below nothing", () => {
    expect(finalAccountNet(10000, [12000])).toBe(0);
  });

  it("rounds to the cent", () => {
    expect(finalAccountNet(1000.005, [0.001])).toBe(1000);
  });
});

describe("why a final account is held", () => {
  it("names extras, snagging, or both", () => {
    expect(holdReason({ extrasFlag: true, snaggingFlag: false })).toBe("Extras to be agreed");
    expect(holdReason({ extrasFlag: false, snaggingFlag: true })).toBe("Snagging open");
    expect(holdReason({ extrasFlag: true, snaggingFlag: true })).toBe("Extras to be agreed and snagging open");
  });

  it("reads inside a sentence", () => {
    expect(holdWhy({ extrasFlag: true, snaggingFlag: true })).toBe("extras are waiting to be agreed and snagging is open");
    expect(holdWhy({ extrasFlag: false, snaggingFlag: true })).toBe("snagging is open");
  });
});

describe("the project history lines for invoicing", () => {
  it("say what was invoiced and when a job is paid in full", () => {
    expect(invoicedLine("INV-5209", "Stage payment 2: west elevation")).toBe("Invoiced INV-5209, stage payment 2: west elevation");
    expect(paidLine("INV-5203", false)).toBe("INV-5203 paid");
    expect(paidLine("INV-5203", true)).toBe("INV-5203 paid: paid in full, project closed");
  });
});

describe("the number an invoice goes by", () => {
  it("is our reference until it is issued, then the accounts number the client has", () => {
    expect(invoiceNo({ ref: "INV-5207" })).toBe("INV-5207");
    expect(invoiceNo({ ref: "INV-5203", accountsNo: "SI-10404" })).toBe("SI-10404");
  });
});

describe("the file name of a sales invoice", () => {
  it("is the reference and what it is for, with no colon", () => {
    expect(salesInvoiceFile("INV-5209", "Stage payment 2: west elevation")).toBe("INV-5209 Stage payment 2, west elevation.pdf");
    expect(salesInvoiceFile("INV-5203", "Final account")).toBe("INV-5203 Final account.pdf");
  });
});
