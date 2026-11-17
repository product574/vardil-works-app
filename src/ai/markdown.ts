/**
 * Turning Ask AI's answer into something safe to show.
 *
 * The model writes a little markdown: paragraphs, lists, small tables, bold and links. This
 * reads exactly that much into a simple tree that the panel renders with React, so no HTML from
 * the model ever reaches the page. A link is kept only when it points at a screen of this demo
 * (the route map in src/app/departments.ts, plus the record links in snapshot.ts); anything
 * else is shown as plain text.
 */
import { DEPARTMENTS } from "@/app/departments";

export type Inline = { kind: "text"; text: string } | { kind: "bold"; text: string } | { kind: "link"; text: string; to: string; bold?: boolean };
export type Block = { kind: "p"; lines: Inline[][] } | { kind: "ul" | "ol"; items: Inline[][] } | { kind: "table"; head: Inline[][]; rows: Inline[][][] };

const SCREENS = new Set(DEPARTMENTS.flatMap((d) => d.groups.flatMap((g) => g.items.flatMap((i) => [i.to, ...(i.tabs ?? []).map((t) => t.to)]))));
/** Query settings each screen understands. */
const QUERY: Record<string, string[]> = {
  "/sales/clients": ["client"],
  "/inbox": ["mail"],
  "/inbox/sent": ["mail"],
  "/inbox/archive": ["mail"],
  "/dashboard": ["open"],
  "/people": ["person"],
  "/plant": ["item"],
  "/plant/fleet": ["vehicle"],
  "/files": ["project", "folder"],
  "/invoicing/supplier": ["inv"],
  "/admin/access": ["person"],
};
const PROJECT = /^\/projects\/C\d{3,4}$/i;
const QUOTE = /^\/sales\/quotes\/Q-\d{3,6}$/i;
const TABS = new Set(["overview", "scope", "photos", "files", "plant", "requests", "extras", "costs", "history"]);

/** The address to open inside the demo, or null when the link goes anywhere else. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (!h.startsWith("/") || h.startsWith("//")) return null;
  let u: URL;
  try {
    u = new URL(h, "https://demo.invalid");
  } catch {
    return null;
  }
  if (u.origin !== "https://demo.invalid" || u.hash) return null;
  const path = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, "") : u.pathname;
  const isProject = PROJECT.test(path);
  if (!SCREENS.has(path) && !isProject && !QUOTE.test(path)) return null;
  for (const [k, v] of u.searchParams) {
    if (isProject ? k !== "tab" || !TABS.has(v) : !(QUERY[path] ?? []).includes(k) || !/^[\w .-]{1,60}$/.test(v)) return null;
  }
  return `${path}${u.search}`;
}

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push({ kind: "text", text: s.slice(last, m.index) });
    if (m[1] != null) {
      // Bold can hold a link ("**[Q-2614](/sales/quotes/Q-2614): Fitzgarret**", seen live):
      // the link is kept, in bold, rather than shown as markdown.
      for (const p of parseInline(m[1])) out.push(p.kind === "link" ? { ...p, bold: true } : { kind: "bold", text: p.text });
    } else {
      const to = safeHref(m[3] ?? "");
      const text = (m[2] ?? "").replace(/\*\*/g, "");
      out.push(to ? { kind: "link", text, to } : { kind: "text", text });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  // Stray markdown the panel does not draw (single stars, backticks, heading marks) is dropped.
  return out.map((i) => (i.kind === "text" ? { ...i, text: i.text.replace(/`/g, "").replace(/(^|\s)\*(\S[^*]*)\*/g, "$1$2") } : i));
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => parseInline(c.trim()));

export function parseAnswer(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: Inline[][] = [];
  const endPara = () => {
    if (para.length) blocks.push({ kind: "p", lines: para });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/^#{1,6}\s+/, "");
    if (!line.trim()) {
      endPara();
      continue;
    }
    const next = lines[i + 1] ?? "";
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{2,}/.test(next)) {
      endPara();
      const head = cells(line);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) rows.push(cells(lines[i++] ?? ""));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const number = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || number) {
      endPara();
      const kind = bullet ? "ul" : "ol";
      const prev = blocks[blocks.length - 1];
      const item = parseInline((bullet ?? number)![1] ?? "");
      if (prev && prev.kind === kind) prev.items.push(item);
      else blocks.push({ kind, items: [item] });
      continue;
    }
    // A line that carries on a list item (indented) joins it.
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev && (prev.kind === "ul" || prev.kind === "ol") && /^\s{2,}\S/.test(line)) {
      prev.items[prev.items.length - 1]!.push({ kind: "text", text: ` ${line.trim()}` });
      continue;
    }
    para.push(parseInline(line));
  }
  endPara();
  return blocks;
}
