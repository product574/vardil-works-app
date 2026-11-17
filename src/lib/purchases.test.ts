import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { buildPurchaseExport, department, needsSignOff, profitabilityCsv, purchaseLines, readyToExport, supplierRef, taxCode } from "./purchases";

const inv = {
  supplier: "Burren Lime and Stone Supplies",
  invoiceNo: "BL-351708",
  invoiceDate: "2026-11-10",
  docType: "invoice" as const,
  subtotal: 1500,
  vat: 345,
  total: 1845,
  fileNo: 11500,
  allocations: [
    { projectId: "pr-C686", category: "material", amount: 1000, description: "NHL 3.5 lime" },
    { projectId: "pr-C686", category: "material", amount: 300, description: "Sand" },
    { projectId: "pr-C719", category: "transport", amount: 200, description: "Delivery" },
  ],
};
const code = (id: string) => id.replace("pr-", "");

describe("Sage fields", () => {
  it("the project is the department, as 686 for Wonderful Barn", () => expect(department("C686")).toBe("686"));
  it("tax codes for 23%, 13.5% and zero", () => expect([taxCode(23), taxCode(13.5), taxCode(0)]).toEqual(["T1", "T13", "T0"]));
  it("supplier reference is eight capitals", () => expect(supplierRef("Ó Briain Plant Hire")).toBe("OBRIAINP"));
  it("over €500 needs the director's sign-off before it goes", () => {
    expect(needsSignOff({ total: 500 })).toBe(false);
    expect(needsSignOff({ total: 500.01 })).toBe(true);
    expect(readyToExport({ total: 1845 })).toBe(false);
    expect(readyToExport({ total: 1845, signOff: { by: "Aidan King", at: "2026-11-11T09:00:00" } })).toBe(true);
  });
});

describe("purchaseLines", () => {
  const lines = purchaseLines(inv, code);
  it("one line per job and heading, nominal 5000 for materials, VAT shared and adding up", () => {
    expect(lines.map((l) => [l.dept, l.nominal, l.net, l.tax])).toEqual([["686", "5000", 1300, 299], ["719", "5100", 200, 46]]);
    expect(lines.reduce((n, l) => n + l.tax, 0)).toBe(345);
  });
  it("a credit note is PC", () => expect(purchaseLines({ ...inv, docType: "credit_note" }, code)[0]!.type).toBe("PC"));
  it("Sage 50 layout: PI, account, nominal, department, date, reference, details, net, tax code, tax, blank, file number", () => {
    expect(buildPurchaseExport("sage50", lines).text.split("\r\n")[0]).toBe("PI,BURRENLI,5000,686,10/11/2026,BL-351708,C686 NHL 3.5 lime,1300.00,T1,299.00,,11500");
  });
  it("Xero and spreadsheet layouts have headings", () => {
    expect(buildPurchaseExport("xero", lines).text.startsWith("*ContactName,*InvoiceNumber")).toBe(true);
    expect(buildPurchaseExport("sheet", lines).fileName).toBe("purchase-invoices-spreadsheet-2026-11-10.csv");
  });
});

describe("profitability", () => {
  it("valuation less wages and costs, with the margin", () => {
    const t = profitabilityCsv([{ code: "C686", name: "Wonderful Barn", contract: 1000000, done: 900000, labour: 64000, material: 400000, plant: 27000, other: 100000 }]);
    expect(t.split("\r\n")[1]).toBe("C686,Wonderful Barn,1000000.00,900000.00,64000.00,400000.00,27000.00,100000.00,591000.00,309000.00,34.3");
  });
});

describe("sample data", () => {
  const { db, day } = buildSeed("2026-11-17");
  const confirmed = db.supplierInvoices.filter((s) => s.readStatus === "confirmed");
  it("every invoice has its own file number", () => {
    expect(db.supplierInvoices.every((s) => s.fileNo)).toBe(true);
    expect(new Set(db.supplierInvoices.map((s) => s.fileNo)).size).toBe(db.supplierInvoices.length);
  });
  it("only confirmed invoices are exported, and only once signed off if over the limit", () => {
    for (const s of db.supplierInvoices.filter((x) => x.exportedAt)) {
      expect(s.readStatus).toBe("confirmed");
      expect(readyToExport(s)).toBe(true);
      expect(s.exportedAt!.slice(0, 10) <= day).toBe(true);
    }
  });
  it("some wait for sign-off and some are ready to go", () => {
    const left = confirmed.filter((s) => !s.exportedAt);
    expect(left.filter((s) => !readyToExport(s)).length).toBeGreaterThan(0);
    expect(left.filter((s) => readyToExport(s)).length).toBeGreaterThan(0);
  });
});
