import { describe, expect, it } from "vitest";
import { buildPurchaseExport, buildSalesExport, exportTotals, PACKAGE, purchaseTable, purchaseTotals, sageDepartment, sageTaxCode, salesTable, type ExportRow } from "./accounts-export";
import type { PurchaseRow } from "./purchases";

const rows: ExportRow[] = [
  { accountRef: "ARDM001", clientName: "Ardmullen Estate", invoiceNo: "SI-10407", issuedOn: "2026-11-07", dueOn: "2026-12-07", details: "C720 Stage payment 1: render removal, first coats", net: 41250, vatPct: 13.5, siteCode: "C720" },
  { accountRef: "OPW002", clientName: 'Office of "Public" Works', invoiceNo: "SI-10408", issuedOn: "2026-11-10", dueOn: "2026-12-10", details: 'C722 Stage payment 1, "west wing"', net: 1000, vatPct: 0, siteCode: "C722" },
];

const bought: PurchaseRow[] = [
  { type: "PI", account: "BURLIM", nominal: "5000", siteCode: "C719", date: "2026-11-13", ref: "BLS-20417", details: "NHL 3.5 natural hydraulic lime, 60 bags", net: 1290, vatPct: 23, vat: 296.7, fileNo: "F-1142" },
  { type: "PI", account: "CORSCA", nominal: "6002", siteCode: "C721", date: "2026-11-12", ref: "CS-INV-9914", details: "Scaffold inspections", net: 100, vatPct: 13.5, vat: 13.5, fileNo: "F-1141" },
  { type: "PC", account: "BURLIM", nominal: "5000", siteCode: "C719", date: "2026-10-22", ref: "BLS-CN-0061", details: "Credit: 10 bags returned", net: 215, vatPct: 23, vat: 49.45, fileNo: "F-1101" },
];

describe("Sage export", () => {
  it("is for Sage, by that one name", () => {
    expect(PACKAGE).toBe("Sage");
  });
  it("sales: one SI line per invoice, no header, UK dates, the project as a department, the tax code for the rate", () => {
    const { text, fileName } = buildSalesExport(rows);
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('SI,ARDM001,4000,720,07/11/2026,SI-10407,"C720 Stage payment 1: render removal, first coats",41250.00,T3,5568.75');
    expect(lines[1]).toContain(",T0,0.00");
    expect(fileName).toBe("sales-invoices-sage-2026-11-10.csv");
  });
  it("quotes commas and double quotes so columns never shift", () => {
    expect(buildSalesExport(rows).text).toContain('"C722 Stage payment 1, ""west wing"""');
  });
  it("Sage tax codes follow the rate, and a site code becomes a department number", () => {
    expect([0, 13.5, 23, 20, 5].map(sageTaxCode)).toEqual(["T0", "T3", "T1", "T1", "T5"]);
    expect(sageDepartment("C720")).toBe("720");
  });
  it("the table on screen is the file: same rows, under headings Sage itself does not take", () => {
    const t = salesTable([{ ...rows[0]!, nominal: "4010" }]);
    expect(t.head).toEqual(["Type", "Account", "Nominal", "Dept", "Date", "Ref", "Details", "Net", "Tax", "VAT"]);
    expect(t.rows[0]!.slice(0, 4)).toEqual(["SI", "ARDM001", "4010", "720"]);
    expect(buildSalesExport(rows).text.startsWith("SI,")).toBe(true);
    expect(exportTotals(rows)).toEqual({ net: 42250, vat: 5568.75 });
  });
  it("an empty export is still a valid file", () => {
    expect(buildSalesExport([]).text).toBe("\r\n");
    expect(buildPurchaseExport([]).text).toBe("\r\n");
  });
  it("purchases: a PI line per invoice line, PC for a credit note, with the firm's file number as the extra reference", () => {
    const { text, fileName } = buildPurchaseExport(bought);
    const lines = text.trim().split("\r\n");
    expect(lines).toEqual([
      'PI,BURLIM,5000,719,13/11/2026,BLS-20417,"NHL 3.5 natural hydraulic lime, 60 bags",1290.00,T1,296.70,F-1142',
      "PI,CORSCA,6002,721,12/11/2026,CS-INV-9914,Scaffold inspections,100.00,T3,13.50,F-1141",
      "PC,BURLIM,5000,719,22/10/2026,BLS-CN-0061,Credit: 10 bags returned,215.00,T1,49.45,F-1101",
    ]);
    expect(fileName).toBe("purchase-invoices-sage-2026-11-13.csv");
    expect(purchaseTable(bought).head.at(-1)).toBe("Ex ref");
  });
  it("purchase totals take a credit note off", () => {
    expect(purchaseTotals(bought)).toEqual({ net: 1175, vat: 260.75 });
  });
});
