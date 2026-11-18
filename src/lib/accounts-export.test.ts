import { describe, expect, it } from "vitest";
import { buildExport, exportTable, exportTotals, sageDepartment, sageTaxCode, type ExportRow } from "./accounts-export";

const rows: ExportRow[] = [
  { accountRef: "ARDM001", clientName: "Ardmullen Estate", invoiceNo: "SI-10407", issuedOn: "2026-11-07", dueOn: "2026-12-07", details: "C720 Stage payment 1: render removal, first coats", net: 41250, vatPct: 13.5, siteCode: "C720" },
  { accountRef: "OPW002", clientName: 'Office of "Public" Works', invoiceNo: "SI-10408", issuedOn: "2026-11-10", dueOn: "2026-12-10", details: "C722 Stage payment 1", net: 1000, vatPct: 0, siteCode: "C722" },
];

describe("accounts export", () => {
  it("Sage 50: one SI line per invoice, no header, UK dates, the project as a department, the tax code for the rate", () => {
    const { text, fileName } = buildExport("sage50", rows);
    const lines = text.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('SI,ARDM001,4000,720,07/11/2026,SI-10407,"C720 Stage payment 1: render removal, first coats",41250.00,T3,5568.75');
    expect(lines[1]).toContain(",T0,0.00");
    expect(fileName).toBe("sales-invoices-sage50-2026-11-10.csv");
  });
  it("Xero: its starred column names, then one line per invoice", () => {
    const lines = buildExport("xero", rows).text.trim().split("\r\n");
    expect(lines[0]!.startsWith("*ContactName,*InvoiceNumber,Reference,*InvoiceDate,*DueDate")).toBe(true);
    expect(lines[1]).toContain("Ardmullen Estate,SI-10407,C720,07/11/2026,07/12/2026");
    expect(lines).toHaveLength(3);
  });
  it("spreadsheet: readable headings and a gross that adds up", () => {
    const lines = buildExport("sheet", rows).text.trim().split("\r\n");
    expect(lines[0]).toBe("Invoice,Issued,Due,Client,Account,Project,Details,Net,VAT %,VAT,Gross");
    expect(lines[1]!.endsWith("41250.00,13.5,5568.75,46818.75")).toBe(true);
  });
  it("quotes commas and double quotes so columns never shift", () => {
    expect(buildExport("xero", rows).text).toContain('"Office of ""Public"" Works"');
  });
  it("Sage tax codes follow the rate, and a site code becomes a department number", () => {
    expect([0, 13.5, 23, 20, 5].map(sageTaxCode)).toEqual(["T0", "T3", "T1", "T1", "T5"]);
    expect(sageDepartment("C720")).toBe("720");
  });
  it("the table on screen is the file: same rows, with headings Sage itself does not take", () => {
    const t = exportTable("sage50", [{ ...rows[0]!, nominal: "4010" }]);
    expect(t.head).toEqual(["Type", "Account", "Nominal", "Dept", "Date", "Ref", "Details", "Net", "Tax", "VAT"]);
    expect(t.headInFile).toBe(false);
    expect(t.rows[0]!.slice(0, 4)).toEqual(["SI", "ARDM001", "4010", "720"]);
    expect(exportTable("xero", rows).headInFile).toBe(true);
    expect(exportTotals(rows)).toEqual({ net: 42250, vat: 5568.75 });
  });
  it("an empty export is still a valid file", () => {
    expect(buildExport("sage50", []).text).toBe("\r\n");
  });
});
