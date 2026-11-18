/**
 * The sample data's documents, drawn when they are opened (src/lib/pdf.ts): a garage invoice for
 * every sample repair, a payment receipt for every sample renewal, and a copy on file for every
 * sample driver's licences. They are real PDFs, so they preview, download and can be read by the
 * AI model like an uploaded file. Each one says plainly that it is a sample, and none imitates a
 * real organisation's paperwork: the garages and the insurer are made up, and the licence copy is
 * a plain record sheet, not a picture of a licence card.
 */
import { type PdfOp, pdfDataUrl } from "./pdf";

const dmy = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const m2 = (x: number) => x.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, "");
const r2 = (x: number) => Math.round(x * 100) / 100;
const up = (s: string) => s.toUpperCase();

const SAMPLE_NOTE = "Sample document made for the Vardil Works demo. Not a real business and not a real bill.";

function head(title: string, from: { name: string; lines: string[] }): PdfOp[] {
  return [
    { t: "mark", s: "SAMPLE" },
    { t: "rect", x: 36, y: 34, w: 190, h: 44, lw: 1.6, rgb: [0.11, 0.23, 0.36] },
    { t: "text", x: 46, y: 56, s: up(from.name).slice(0, 24), size: from.name.length > 18 ? 11.5 : 14, font: "HB", rgb: [0.11, 0.23, 0.36] },
    { t: "text", x: 46, y: 70, s: "SAMPLE GARAGE, MADE UP", size: 6.5, rgb: [0.11, 0.23, 0.36] },
    ...from.lines.map((s, i): PdfOp => ({ t: "text", x: 250, y: 46 + i * 11.5, s, size: 8.5 })),
    { t: "rect", x: 430, y: 34, w: 129, h: 30, lw: 1.2, rgb: [0.78, 0.12, 0.16] },
    { t: "text", x: 494.5, y: 47, s: "SAMPLE DOCUMENT", size: 9, font: "HB", align: "c", rgb: [0.78, 0.12, 0.16] },
    { t: "text", x: 494.5, y: 58, s: "Made for the Vardil Works demo", size: 6.5, align: "c", rgb: [0.78, 0.12, 0.16] },
    { t: "line", x1: 36, y1: 96, x2: 559, y2: 96 },
    { t: "text", x: 297.5, y: 122, s: title, size: 15, font: "HB", align: "c" },
  ];
}

function box(x: number, y: number, w: number, title: string, lines: string[], foot?: string): PdfOp[] {
  const h = 16 + lines.length * 12.5 + 10 + (foot ? 20 : 0);
  return [
    { t: "rect", x, y, w, h: 14, fill: 0.85 },
    { t: "rect", x, y, w, h },
    { t: "text", x: x + 5, y: y + 10.5, s: title, size: 8.5, font: "HB" },
    ...lines.map((s, i): PdfOp => ({ t: "text", x: x + 5, y: y + 28 + i * 12.5, s, size: 9.5, font: "HB" })),
    ...(foot ? ([{ t: "line", x1: x, y1: y + h - 20, x2: x + w, y2: y + h - 20 }, { t: "text", x: x + 5, y: y + h - 7, s: foot, size: 8.5, font: "HB" }] as PdfOp[]) : []),
  ];
}

/** A row of labelled cells: a grey heading strip with the values under it. */
function strip(y: number, cells: { label: string; value: string; w: number; bold?: boolean }[]): PdfOp[] {
  const ops: PdfOp[] = [{ t: "rect", x: 36, y, w: 523, h: 13, fill: 0.85 }, { t: "rect", x: 36, y, w: 523, h: 31 }];
  let x = 36;
  for (const c of cells) {
    ops.push({ t: "text", x: x + c.w / 2, y: y + 9.5, s: c.label, size: 8, font: "HB", align: "c" });
    ops.push({ t: "text", x: x + c.w / 2, y: y + 25, s: c.value, size: c.bold ? 11 : 9.5, font: c.bold ? "CB" : "C", align: "c" });
    x += c.w;
    if (x < 558) ops.push({ t: "line", x1: x, y1: y, x2: x, y2: y + 31 });
  }
  return ops;
}

export type SampleInvoice = {
  invoiceNo: string;
  date: string;
  garage: { name: string; town: string; county: string; phone?: string; email?: string };
  customer: string;
  attention?: string;
  lines: { reg: string; makeModel: string; description: string; mileage: number | null; amount: number }[];
  total: number;
  vat: number | null;
};

/** A sample garage invoice, laid out like a main dealer's account invoice. Every figure comes from the record. */
export function sampleInvoicePdf(inv: SampleInvoice): string {
  const vatRate = 23;
  const vat = inv.vat ?? r2(inv.total - inv.total / (1 + vatRate / 100));
  const net = r2(inv.total - vat);
  const one = inv.lines.length === 1 ? inv.lines[0]! : null;
  const ops: PdfOp[] = [
    ...head("ACCOUNT INVOICE", { name: inv.garage.name, lines: ["Service and repairs", inv.garage.town, `Co. ${inv.garage.county}`, ...(inv.garage.phone ? [`Tel: ${inv.garage.phone}`] : []), ...(inv.garage.email ? [inv.garage.email] : [])] }),
    ...box(56, 136, 222, "Invoice Name & Address", [up(inv.customer), "ACCOUNTS DEPARTMENT", "GALWAY"], inv.attention ? `F.A.O. ${up(inv.attention)}` : " "),
    ...box(316, 136, 222, "Customer Name & Address", [up(inv.customer), "FLEET", "GALWAY"], " "),
    ...strip(240, [
      { label: "Account No.", value: "SEC014", w: 90 },
      { label: "Document Number", value: inv.invoiceNo || "-", w: 133, bold: true },
      { label: "Date & Tax Point", value: dmy(inv.date), w: 110 },
      { label: "Repair Date", value: dmy(inv.date), w: 100 },
      { label: "Order Number", value: "", w: 90 },
    ]),
    ...strip(271, [
      { label: one ? "Make & Model" : "Vehicles", value: one ? one.makeModel : `${inv.lines.length} vehicles, listed below`, w: 213 },
      { label: "Reg No.", value: one ? one.reg : "See below", w: 120, bold: !!one },
      { label: "Mileage", value: one?.mileage ? `${one.mileage} km` : "", w: 100 },
      { label: "Page", value: "1", w: 90 },
    ]),
    { t: "text", x: 46, y: 318, s: "Parts fitted are to the manufacturer's specification.", size: 10, font: "C" },
    { t: "rect", x: 36, y: 326, w: 523, h: 14, fill: 0.85 },
    { t: "rect", x: 36, y: 326, w: 523, h: 330 },
    { t: "text", x: 62, y: 336.5, s: "Description of Goods / Services", size: 8.5, font: "HB" },
    { t: "text", x: 395, y: 336.5, s: "Qty.", size: 8.5, font: "HB", align: "r" },
    { t: "text", x: 462, y: 336.5, s: "Unit Price", size: 8.5, font: "HB", align: "r" },
    { t: "text", x: 530, y: 336.5, s: "Net Total", size: 8.5, font: "HB", align: "r" },
    { t: "text", x: 546, y: 336.5, s: "V", size: 8.5, font: "HB", align: "c" },
    { t: "line", x1: 472, y1: 326, x2: 472, y2: 656 },
    { t: "line", x1: 536, y1: 326, x2: 536, y2: 656 },
  ];
  // Each vehicle: its labour, then parts and materials, adding up to that vehicle's share before VAT.
  let y = 356;
  let labourAll = 0;
  let partsAll = 0;
  let netLeft = net;
  inv.lines.forEach((l, i) => {
    const lineNet = i === inv.lines.length - 1 ? r2(netLeft) : r2((l.amount / inv.total) * net);
    netLeft = r2(netLeft - lineNet);
    const hours = Math.max(0.5, Math.round((lineNet * 0.42) / 65 / 0.25) * 0.25);
    const labour = Math.min(lineNet, r2(hours * 65));
    const parts = r2(lineNet - labour);
    labourAll = r2(labourAll + labour);
    partsAll = r2(partsAll + parts);
    if (!one) {
      ops.push({ t: "text", x: 62, y, s: `${l.reg}  ${up(l.makeModel)}${l.mileage ? `  ${l.mileage} KM` : ""}`, size: 9.5, font: "CB" });
      y += 13;
    }
    ops.push({ t: "text", x: 46, y, s: "A", size: 9.5, font: "C" }, { t: "text", x: 62, y, s: "LAB", size: 9.5, font: "C" });
    ops.push({ t: "text", x: 395, y, s: m2(labour / 65), size: 9.5, font: "C", align: "r" }, { t: "text", x: 462, y, s: "65.00", size: 9.5, font: "C", align: "r" }, { t: "text", x: 530, y, s: m2(labour), size: 9.5, font: "C", align: "r" }, { t: "text", x: 546, y, s: "S", size: 9.5, font: "C", align: "c" });
    y += 12;
    // The work done, wrapped to the description column.
    const words = up(l.description || "Repairs as instructed").split(" ");
    let row = "";
    for (const w of words) {
      if ((row + " " + w).trim().length > 50) {
        ops.push({ t: "text", x: 74, y, s: row.trim(), size: 9.5, font: "C" });
        y += 12;
        row = w;
      } else row = `${row} ${w}`;
    }
    ops.push({ t: "text", x: 74, y, s: `${row.trim()}.`, size: 9.5, font: "C" });
    y += 12;
    if (parts > 0) {
      ops.push({ t: "text", x: 46, y, s: "X", size: 9.5, font: "C" }, { t: "text", x: 62, y, s: "PARTS AND MATERIALS", size: 9.5, font: "C" });
      ops.push({ t: "text", x: 395, y, s: "1.00", size: 9.5, font: "C", align: "r" }, { t: "text", x: 462, y, s: m2(parts), size: 9.5, font: "C", align: "r" }, { t: "text", x: 530, y, s: m2(parts), size: 9.5, font: "C", align: "r" }, { t: "text", x: 546, y, s: "S", size: 9.5, font: "C", align: "c" });
      y += 12;
    }
    y += 8;
  });
  ops.push(
    { t: "text", x: 36, y: 670, s: "E. & O.E.", size: 8 },
    ...(["Parts", "Surcharge", "Labour", "Sublet"] as const).flatMap((k, i): PdfOp[] => [
      { t: "text", x: 46, y: 686 + i * 12, s: k, size: 9.5, font: "C" },
      { t: "text", x: 160, y: 686 + i * 12, s: m2(k === "Parts" ? partsAll : k === "Labour" ? labourAll : 0), size: 9.5, font: "C", align: "r" },
    ]),
    { t: "rect", x: 196, y: 664, w: 170, h: 13, fill: 0.85 },
    { t: "rect", x: 196, y: 664, w: 170, h: 62 },
    { t: "text", x: 206, y: 673.5, s: "V", size: 8, font: "HB" },
    { t: "text", x: 240, y: 673.5, s: "Rate", size: 8, font: "HB", align: "c" },
    { t: "text", x: 296, y: 673.5, s: "Service/Goods", size: 8, font: "HB", align: "c" },
    { t: "text", x: 346, y: 673.5, s: "V.A.T.", size: 8, font: "HB", align: "c" },
    { t: "text", x: 206, y: 691, s: "S", size: 9.5, font: "C" },
    { t: "text", x: 240, y: 691, s: m2(vatRate), size: 9.5, font: "C", align: "c" },
    { t: "text", x: 296, y: 691, s: m2(net), size: 9.5, font: "C", align: "c" },
    { t: "text", x: 346, y: 691, s: m2(vat), size: 9.5, font: "C", align: "c" },
    { t: "rect", x: 386, y: 664, w: 173, h: 76, lw: 1.2 },
    ...([["Net", net, false], ["V.A.T.", vat, false], ["Total", inv.total, true], ["Paid", 0, false], ["Owing", inv.total, true]] as [string, number, boolean][]).flatMap(([k, v, b], i): PdfOp[] => [
      { t: "text", x: 396, y: 680 + i * 13.5, s: k, size: 10.5, font: b ? "CB" : "C" },
      { t: "text", x: 550, y: 680 + i * 13.5, s: m2(v), size: 10.5, font: b ? "CB" : "C", align: "r" },
    ]),
    { t: "text", x: 297.5, y: 770, s: `${inv.garage.name} is a sample garage from the Vardil Works demo data. VAT No: sample only.`, size: 8, align: "c" },
    { t: "text", x: 297.5, y: 782, s: SAMPLE_NOTE, size: 8, font: "HB", align: "c", rgb: [0.78, 0.12, 0.16] },
  );
  return pdfDataUrl(ops, `Sample invoice ${inv.invoiceNo}`);
}

const ROW = (y: number, label: string, value: string): PdfOp[] => [
  { t: "text", x: 76, y, s: label, size: 10.5, gray: 0.35 },
  { t: "text", x: 236, y, s: value, size: 11.5, font: "HB" },
  { t: "line", x1: 76, y1: y + 8, x2: 519, y2: y + 8, w: 0.4, gray: 0.75 },
];

function sheet(title: string, sub: string, rows: [string, string][], note: string): string {
  const ops: PdfOp[] = [
    { t: "mark", s: "SAMPLE" },
    { t: "rect", x: 56, y: 60, w: 483, h: 150 + rows.length * 30, lw: 1.2 },
    { t: "rect", x: 56, y: 60, w: 483, h: 26, fill: 0.9 },
    { t: "text", x: 76, y: 77.5, s: "SAMPLE DOCUMENT", size: 10, font: "HB", rgb: [0.78, 0.12, 0.16] },
    { t: "text", x: 519, y: 77.5, s: "Made for the Vardil Works demo", size: 8.5, align: "r", rgb: [0.78, 0.12, 0.16] },
    { t: "text", x: 76, y: 122, s: title, size: 19, font: "HB" },
    { t: "text", x: 76, y: 142, s: sub, size: 10.5, gray: 0.35 },
    ...rows.flatMap(([l, v], i) => ROW(180 + i * 30, l, v)),
    { t: "text", x: 76, y: 190 + rows.length * 30, s: note, size: 8.5, gray: 0.35 },
  ];
  return pdfDataUrl(ops, title);
}

export type SampleReceipt = { item: "tax" | "test" | "insurance" | "other"; testName: string; reg: string; makeModel: string; paidDate: string; expiryDate?: string; amount: number; what?: string; paidBy: string; currency?: "EUR" | "GBP" };

/** A sample payment receipt for motor tax, the test (CVRT, NCT or MOT), or insurance. */
export function sampleReceiptPdf(r: SampleReceipt): string {
  const what = r.item === "tax" ? "Motor tax" : r.item === "test" ? r.testName : r.item === "insurance" ? "Motor insurance" : (r.what ?? "Vehicle document");
  const runs = r.item === "test" ? "Next test due" : r.item === "insurance" ? "Cover runs to" : "Runs to";
  return sheet(`${what} payment receipt`, r.item === "insurance" ? "Atlantic Fleet Insurance, a made-up insurer. Fleet policy, one vehicle's share." : "A sample of the receipt kept with a vehicle's documents.", [
    ["Document", `${what} receipt`],
    ["Vehicle registration", r.reg],
    ["Vehicle", r.makeModel],
    ["Paid on", dmy(r.paidDate)],
    ...(r.expiryDate ? ([[runs, dmy(r.expiryDate)]] as [string, string][]) : []),
    ["Amount paid", `${r.currency ?? "EUR"} ${m2(r.amount)}`],
    ["Paid by", r.paidBy],
  ], SAMPLE_NOTE.replace("bill", "receipt"));
}

/** `categories` is what the driving licence covers: B for cars and vans, C1 as well for a 7.5 tonne tipper. */
export type SampleLicence = { which: "driving" | "cpc"; name: string; expiryDate: string; ref: string; categories?: string };

/** A sample copy on file of a driving licence or a Driver CPC card: a plain record sheet, not a picture of the card. */
export function sampleLicencePdf(l: SampleLicence): string {
  const driving = l.which === "driving";
  return sheet(driving ? "Driving licence, copy on file" : "Driver CPC card, copy on file", driving ? "A sample record of a driver's driving licence." : "A sample record of a Driver Certificate of Professional Competence card.", [
    ["Document", driving ? "Driving licence" : "Driver CPC card"],
    ["Name", l.name],
    ...(driving ? ([["Categories", l.categories ?? "B (cars and light vans)"]] as [string, string][]) : ([["Training", "35 hours over 5 years, complete"]] as [string, string][])),
    ["Reference", `SAMPLE-${l.ref}`],
    ["Expiry date", dmy(l.expiryDate)],
  ], "Sample document made for the Vardil Works demo. Not a real licence and not a copy of one.");
}
