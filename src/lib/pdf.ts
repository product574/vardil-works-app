// Writes an invoice as a real PDF file, with no library: A4, the two standard fonts every PDF
// reader has (Helvetica and its bold), an optional logo, and as many pages as the lines need.
// It draws the same InvoiceDoc as the screen does, so the two cannot disagree.
import type { InvoiceDoc } from "./invoices";

const W = 595.28;
const H = 841.89;
const M = 48;
const RIGHT = W - M;

// Advance widths per thousand of the font size, for the characters from space to the tilde.
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

// Characters outside Latin-1 that the standard encoding still has a place for.
const SPECIAL: Record<number, number> = { 0x20ac: 0x80, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2013: 0x96, 0x2014: 0x97, 0x2026: 0x85, 0x2022: 0x95 };
const plain = (ch: string) => ch.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The bytes a piece of text is written as. A letter the fonts lack loses its accent rather than vanish. */
export function encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 63;
    if ((c >= 32 && c <= 126) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (SPECIAL[c]) out.push(SPECIAL[c]);
    else {
      const base = plain(ch);
      const b = base.codePointAt(0) ?? 63;
      out.push(base.length === 1 && b >= 32 && b <= 126 ? b : 63);
    }
  }
  return out;
}

function byteWidth(b: number, bold: boolean) {
  const table = bold ? BOLD : REGULAR;
  if (b >= 32 && b <= 126) return table[b - 32]!;
  if (b >= 0xc0) {
    // An accented letter is as wide as the letter under the accent.
    const base = plain(String.fromCharCode(b)).charCodeAt(0);
    if (base >= 32 && base <= 126) return table[base - 32]!;
  }
  return 556;
}

/** How wide a piece of text prints, in points. */
export function textWidth(text: string, size: number, bold = false) {
  return (encode(text).reduce((s, b) => s + byteWidth(b, bold), 0) * size) / 1000;
}

/** Break text into lines no wider than `max` points. A single word too long for a line is left whole. */
export function wrap(text: string, size: number, max: number, bold = false): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && textWidth(next, size, bold) > max) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

type Rgb = [number, number, number];
const INK: Rgb = [0.1, 0.15, 0.2];
const MUTED: Rgb = [0.38, 0.42, 0.47];
const LINE: Rgb = [0.84, 0.87, 0.9];

/** "#4682B4" as three numbers from 0 to 1. Anything else falls back to the ink colour. */
export function rgbOf(hex: string): Rgb {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255] : INK;
}
const n = (x: number) => (Math.round(x * 100) / 100).toString();
const col = (c: Rgb) => c.map(n).join(" ");
const hex = (text: string) => encode(text).map((b) => b.toString(16).padStart(2, "0")).join("");

/** A logo already turned into a JPEG, with its size in pixels. */
export type PdfLogo = { jpeg: Uint8Array; width: number; height: number };

/** One page's drawing instructions, written top down: `y` is measured from the top edge. */
class Page {
  ops: string[] = [];
  text(s: string, x: number, y: number, o: { size?: number; bold?: boolean; colour?: Rgb; align?: "left" | "right" | "centre" } = {}) {
    if (!s) return;
    const size = o.size ?? 10;
    const w = o.align && o.align !== "left" ? textWidth(s, size, o.bold) : 0;
    const left = o.align === "right" ? x - w : o.align === "centre" ? x - w / 2 : x;
    this.ops.push(`BT /${o.bold ? "F2" : "F1"} ${n(size)} Tf ${col(o.colour ?? INK)} rg ${n(left)} ${n(H - y)} Td <${hex(s)}> Tj ET`);
  }
  rule(x1: number, x2: number, y: number, colour: Rgb = LINE, weight = 0.75) {
    this.ops.push(`${col(colour)} RG ${n(weight)} w ${n(x1)} ${n(H - y)} m ${n(x2)} ${n(H - y)} l S`);
  }
  image(x: number, y: number, w: number, h: number) {
    this.ops.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(H - y - h)} cm /Im1 Do Q`);
  }
}

const COLS = { qty: 372, unit: 384, rate: 478, amount: RIGHT };
const DESC_WIDTH = COLS.qty - 40 - M;

/** Lay the document out over as many pages as it needs. */
function layout(doc: InvoiceDoc, accent: Rgb, logo?: PdfLogo): Page[] {
  const pages: Page[] = [new Page()];
  let p = pages[0]!;
  let y = M;

  // Heading: the firm on the left, the word Invoice and its number on the right.
  let leftY = y;
  if (logo && doc.showLogo) {
    const h = Math.min(46, (logo.height * 150) / logo.width);
    const w = (logo.width * h) / logo.height;
    p.image(M, leftY, w, h);
    leftY += h + 14;
  } else leftY += 12;
  p.text(doc.seller.name, M, leftY, { size: 13, bold: true });
  leftY += 14;
  for (const line of doc.seller.address) {
    p.text(line, M, leftY, { size: 9, colour: MUTED });
    leftY += 11.5;
  }
  let rightY = y + 16;
  p.text(doc.title, RIGHT, rightY, { size: 22, bold: true, align: "right" });
  rightY += 16;
  p.text(doc.number, RIGHT, rightY, { size: 11, bold: true, align: "right" });
  rightY += 13;
  if (doc.stamp) {
    p.text(doc.stamp.toUpperCase(), RIGHT, rightY, { size: 9, bold: true, colour: doc.stamp === "Paid" ? [0.1, 0.5, 0.3] : MUTED, align: "right" });
    rightY += 13;
  }
  for (const line of [...doc.seller.contact, ...doc.seller.registration]) {
    p.text(line, RIGHT, rightY, { size: 9, colour: MUTED, align: "right" });
    rightY += 11.5;
  }
  y = Math.max(leftY, rightY) + 6;
  p.rule(M, RIGHT, y, doc.rule ? accent : INK, doc.rule ? 1.5 : 0.75);
  y += 22;

  // Who it is to, beside the dates and references.
  let billY = y;
  p.text("BILL TO", M, billY, { size: 8, bold: true, colour: MUTED });
  billY += 14;
  doc.billTo.forEach((line, i) => {
    for (const part of wrap(line, 10, 250, i === 0)) {
      p.text(part, M, billY, { size: 10, bold: i === 0 });
      billY += 13;
    }
  });
  let factY = y + 14;
  for (const [label, value] of doc.facts) {
    p.text(label, 330, factY, { size: 9, colour: MUTED });
    for (const part of wrap(value, 10, RIGHT - 410)) {
      p.text(part, 410, factY, { size: 10 });
      factY += 13;
    }
    factY += 2;
  }
  y = Math.max(billY, factY) + 18;

  // The priced lines.
  const head = () => {
    p.text("DESCRIPTION", M, y, { size: 8, bold: true, colour: MUTED });
    p.text("QTY", COLS.qty, y, { size: 8, bold: true, colour: MUTED, align: "right" });
    p.text("UNIT", COLS.unit, y, { size: 8, bold: true, colour: MUTED });
    p.text("RATE", COLS.rate, y, { size: 8, bold: true, colour: MUTED, align: "right" });
    p.text("AMOUNT", COLS.amount, y, { size: 8, bold: true, colour: MUTED, align: "right" });
    y += 6;
    p.rule(M, RIGHT, y, INK, 0.75);
    y += 15;
  };
  const turn = () => {
    p = new Page();
    pages.push(p);
    y = M + 10;
  };
  head();
  for (const l of doc.lines) {
    const parts = wrap(l.description, 10, DESC_WIDTH);
    if (y + parts.length * 13 > H - 150) {
      turn();
      head();
    }
    p.text(l.qty, COLS.qty, y, { align: "right" });
    p.text(l.unit, COLS.unit, y, { colour: MUTED });
    p.text(l.rate, COLS.rate, y, { align: "right" });
    p.text(l.amount, COLS.amount, y, { align: "right" });
    for (const part of parts) {
      p.text(part, M, y);
      y += 13;
    }
    y -= 4;
    p.rule(M, RIGHT, y);
    y += 15;
  }

  // Totals, kept together on one page.
  if (y + doc.totals.length * 18 + 20 > H - 110) turn();
  y += 4;
  for (const t of doc.totals) {
    if (t.strong) {
      p.rule(COLS.qty - 30, RIGHT, y - 10, INK, 0.75);
      y += 3;
    }
    p.text(t.label, COLS.qty - 30, y, { size: t.strong ? 11 : 10, bold: t.strong, colour: t.strong ? INK : MUTED });
    p.text(t.value, RIGHT, y, { size: t.strong ? 11 : 10, bold: t.strong, align: "right" });
    y += 17;
  }
  y += 14;

  // Notes and terms, then where to pay.
  const tail = [...doc.notes.flatMap((s) => wrap(s, 9, RIGHT - M)), ...(doc.bank.length ? ["", "Bank details", ...doc.bank] : [])];
  if (y + tail.length * 12 > H - 70) turn();
  for (const line of tail) {
    p.text(line, M, y, { size: 9, bold: line === "Bank details", colour: line === "Bank details" ? INK : MUTED });
    y += 12;
  }

  pages.forEach((pg, i) => {
    pg.rule(M, RIGHT, H - 46);
    pg.text(doc.footer, M, H - 32, { size: 8.5, colour: MUTED });
    pg.text(pages.length > 1 ? `${doc.number}, page ${i + 1} of ${pages.length}` : doc.number, RIGHT, H - 32, { size: 8.5, colour: MUTED, align: "right" });
  });
  return pages;
}

const binary = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return s;
};

/** The finished file. `accent` is the brand colour as a hex value. */
export function invoicePdf(doc: InvoiceDoc, opts: { accent: string; logo?: PdfLogo }): Uint8Array {
  const logo = doc.showLogo ? opts.logo : undefined;
  const pages = layout(doc, rgbOf(opts.accent), logo);
  // Object numbers: 1 catalogue, 2 page list, 3 and 4 the fonts, 5 the logo if there is one, then a page and its drawing each.
  const first = logo ? 6 : 5;
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${first + i * 2} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  if (logo) objects[5] = `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.jpeg.length} >>\nstream\n${binary(logo.jpeg)}\nendstream`;
  pages.forEach((pg, i) => {
    const body = pg.ops.join("\n");
    objects[first + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${logo ? " /XObject << /Im1 5 0 R >>" : ""} >> /Contents ${first + i * 2 + 1} 0 R >>`;
    objects[first + i * 2 + 1] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
