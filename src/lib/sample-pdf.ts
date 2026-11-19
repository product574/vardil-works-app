/**
 * A very small PDF writer for the sample documents (renamed from pdf.ts when the two chats were merged on 19 Nov; the invoice PDF is src/lib/pdf.ts): one A4 page of text, lines and boxes, in the fonts every PDF reader
 * has built in. It exists so the sample data can carry real PDF documents (a garage invoice for
 * every sample repair, receipts, licence copies) that are drawn when opened, instead of files
 * kept in the browser. Coordinates are in points from the top left of the page (595 by 842).
 */

export type PdfFont = "H" | "HB" | "C" | "CB";
export type PdfOp =
  | { t: "text"; x: number; y: number; s: string; size?: number; font?: PdfFont; align?: "l" | "r" | "c"; gray?: number; rgb?: [number, number, number] }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; w?: number; gray?: number }
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: number; stroke?: boolean; lw?: number; rgb?: [number, number, number] }
  | { t: "mark"; s: string; size?: number };

const W = 595;
const H = 842;
const FONT_NO: Record<PdfFont, number> = { H: 1, HB: 2, C: 3, CB: 4 };

// Helvetica's character widths (per 1000 of the font size) for the printable ASCII range.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

/** How wide a string is in points. Exact for the Courier fonts, close for Helvetica. */
export function textWidth(s: string, size: number, font: PdfFont = "H"): number {
  if (font === "C" || font === "CB") return s.length * size * 0.6;
  let w = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HELV[c - 32]! : 556;
  }
  return (w / 1000) * size * (font === "HB" ? 1.06 : 1);
}

/** Text as the bytes the built-in fonts expect (Windows Latin 1), escaped for a PDF string. */
function enc(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (ch === "€") out += "\x80";
    else if (c === 0x2019 || c === 0x2018) out += "'";
    else if (c === 0x2013 || c === 0x2014) out += "-";
    else if (c < 32 || c > 255) out += "?";
    else out += ch;
  }
  return out;
}

const n = (x: number) => (Math.round(x * 100) / 100).toString();
const colour = (op: { gray?: number; rgb?: [number, number, number] }, stroke = false) => (op.rgb ? `${op.rgb.map(n).join(" ")} ${stroke ? "RG" : "rg"}` : `${n(op.gray ?? 0)} ${stroke ? "G" : "g"}`);

function content(ops: PdfOp[]): string {
  const out: string[] = [];
  for (const op of ops) {
    if (op.t === "mark") {
      // A large pale word across the page, under everything drawn after it.
      const size = op.size ?? 120;
      const a = (32 * Math.PI) / 180;
      const w = textWidth(op.s, size, "HB");
      const cx = W / 2 - (Math.cos(a) * w) / 2;
      const cy = H / 2 - (Math.sin(a) * w) / 2 - 20;
      out.push(`q 0.96 0.86 0.86 rg BT /F2 ${n(size)} Tf ${n(Math.cos(a))} ${n(Math.sin(a))} ${n(-Math.sin(a))} ${n(Math.cos(a))} ${n(cx)} ${n(cy)} Tm (${enc(op.s)}) Tj ET Q`);
    } else if (op.t === "text") {
      const size = op.size ?? 9.5;
      const font = op.font ?? "H";
      const w = op.align && op.align !== "l" ? textWidth(op.s, size, font) : 0;
      const x = op.align === "r" ? op.x - w : op.align === "c" ? op.x - w / 2 : op.x;
      out.push(`${colour(op)} BT /F${FONT_NO[font]} ${n(size)} Tf ${n(x)} ${n(H - op.y)} Td (${enc(op.s)}) Tj ET`);
    } else if (op.t === "line") {
      out.push(`${n(op.w ?? 0.7)} w ${n(op.gray ?? 0.2)} G ${n(op.x1)} ${n(H - op.y1)} m ${n(op.x2)} ${n(H - op.y2)} l S`);
    } else {
      const box = `${n(op.x)} ${n(H - op.y - op.h)} ${n(op.w)} ${n(op.h)} re`;
      if (op.fill != null) out.push(`${n(op.fill)} g ${box} f`);
      if (op.stroke !== false) out.push(`${n(op.lw ?? 0.7)} w ${colour({ gray: op.rgb ? undefined : 0.2, rgb: op.rgb }, true)} ${box} S`);
    }
  }
  return out.join("\n");
}

/** The whole PDF file as a string of bytes (each character is one byte). */
export function pdfBytes(ops: PdfOp[], title = "Document"): string {
  const stream = content(ops);
  const fonts = ["Helvetica", "Helvetica-Bold", "Courier", "Courier-Bold"];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /Font << ${fonts.map((_, i) => `/F${i + 1} ${5 + i} 0 R`).join(" ")} >> >> >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ...fonts.map((f) => `<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`),
    `<< /Title (${enc(title)}) /Producer (Vardil Works sample data) >>`,
  ];
  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const at: number[] = [];
  objects.forEach((o, i) => {
    at.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${at.map((a) => `${String(a).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}

/** The PDF as a data: address, ready to preview, download, or send to be read. */
export function pdfDataUrl(ops: PdfOp[], title?: string): string {
  return `data:application/pdf;base64,${btoa(pdfBytes(ops, title))}`;
}
