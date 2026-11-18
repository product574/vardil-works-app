import { describe, expect, it } from "vitest";
import type { InvoiceDoc } from "./invoices";
import { encode, invoicePdf, rgbOf, textWidth, wrap } from "./pdf";

const doc: InvoiceDoc = {
  title: "Invoice",
  number: "SI-10412",
  stamp: "",
  seller: { name: "ABC Construction Ltd", address: ["Unit 4, Oranmore Business Park", "Oranmore", "Co. Galway"], contact: ["091 555 0100", "accounts@abcconstruction.example"], registration: ["VAT no. IE 0000000AB"] },
  billTo: ["Ardmullen Estate", "For the attention of Susan Kane", "Kilcolgan", "Co. Galway"],
  facts: [["Invoice date", "18 November 2026"], ["Due", "18 December 2026"], ["Site", "Ardmullen House, Kilcolgan, Co. Galway"]],
  lines: [{ description: "Stage payment 1: render removal and first coats", qty: "1", unit: "item", rate: "€41,250.00", amount: "€41,250.00" }],
  totals: [{ label: "Subtotal", value: "€41,250.00" }, { label: "VAT at 13.5%", value: "€5,568.75" }, { label: "Total due", value: "€46,818.75", strong: true }],
  notes: ["Payment within 30 days of the invoice date by bank transfer, quoting the invoice number."],
  bank: ["Sample Bank", "IBAN IE00 SAMP 0000 0000 0000 00"],
  footer: "Thank you for your business.",
  showLogo: true,
  rule: true,
};
const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const hex = (s: string) => encode(s).map((b) => b.toString(16).padStart(2, "0")).join("");

describe("writing text for a PDF", () => {
  it("has a width for every character from space to tilde, in both fonts", () => {
    // 95 characters each; a missing one would shift every width after it.
    expect(textWidth(" ", 1000)).toBe(278);
    expect(textWidth("~", 1000)).toBe(584);
    expect(textWidth("~", 1000, true)).toBe(584);
    expect(textWidth("W", 1000, true)).toBe(944);
  });
  it("gives the euro sign, accents and curly quotes their place, and drops an accent the fonts lack", () => {
    expect(encode("€")).toEqual([0x80]);
    expect(encode("Sinéad")).toEqual([83, 105, 110, 0xe9, 97, 100]);
    expect(encode("Wiśniewski")[2]).toBe("s".charCodeAt(0));
    expect(encode("’")).toEqual([0x92]);
    expect(encode("中")).toEqual([63]);
  });
  it("measures money so columns line up: digits are all one width", () => {
    expect(textWidth("€1,111.11", 10)).toBe(textWidth("€9,999.99", 10));
    expect(textWidth("é", 10)).toBe(textWidth("e", 10));
  });
  it("wraps at the width given and keeps typed line breaks", () => {
    const lines = wrap("Take down loose render to the north gable and make good in lime, three coats", 10, 180);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(180);
    expect(wrap("One\nTwo", 10, 500)).toEqual(["One", "Two"]);
  });
  it("reads a brand colour, and falls back to ink for anything else", () => {
    expect(rgbOf("#4682B4").map((x) => Math.round(x * 255))).toEqual([70, 130, 180]);
    expect(rgbOf("blue")).toEqual([0.1, 0.15, 0.2]);
  });
});

describe("the invoice PDF", () => {
  const bytes = invoicePdf(doc, { accent: "#4682B4" });
  const s = text(bytes);
  it("is a PDF with one page, both fonts and a cross-reference table that points at each object", () => {
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(s).toContain("/Count 1");
    expect(s).toContain("/BaseFont /Helvetica-Bold");
    const xref = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(xref, xref + 4)).toBe("xref");
    const offsets = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
  it("says how long each drawing is, to the byte", () => {
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) expect(m[2]!.length).toBe(Number(m[1]));
  });
  it("prints the number, the client, each line and the total", () => {
    for (const piece of ["SI-10412", "Ardmullen Estate", "Stage payment 1: render removal and first coats", "€46,818.75", "IBAN IE00 SAMP 0000 0000 0000 00", "Thank you for your business."]) expect(s, piece).toContain(`<${hex(piece)}>`);
    // The rule under the heading is in the brand colour.
    expect(s).toContain("0.27 0.51 0.71 RG");
  });
  it("runs onto more pages when there are many lines, and numbers them", () => {
    const long = invoicePdf({ ...doc, lines: Array.from({ length: 70 }, (_, i) => ({ ...doc.lines[0]!, description: `Line ${i + 1}` })) }, { accent: "#4682B4" });
    const t = text(long);
    expect(Number(/\/Count (\d+)/.exec(t)![1])).toBeGreaterThan(1);
    expect(t).toContain(`<${hex("SI-10412, page 1 of ")}`.slice(0, -1));
    expect(t).toContain(`<${hex("Line 70")}>`);
  });
  it("carries a logo as an image when one is given, and none when the design hides it", () => {
    const logo = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 300, height: 100 };
    const withLogo = text(invoicePdf(doc, { accent: "#4682B4", logo }));
    expect(withLogo).toContain("/Subtype /Image /Width 300 /Height 100");
    expect(withLogo).toContain("/Im1 Do");
    expect(text(invoicePdf({ ...doc, showLogo: false }, { accent: "#4682B4", logo }))).not.toContain("/Im1");
  });
});
