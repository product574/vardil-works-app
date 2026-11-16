// Pure helpers for Documents, Project Controls and Requests.
import { addDays, dublinToday } from "@/lib/dates";

export type HistoryFilter = { mode: "7d" | "month" | "pick" | "all"; month?: string /* YYYY-MM */ };

/** Inclusive Dublin date range for a history filter, or null for all time. */
export function historyRange(f: HistoryFilter, today = dublinToday()): { from: string; to: string } | null {
  if (f.mode === "all") return null;
  if (f.mode === "7d") return { from: addDays(today, -6), to: today };
  const ym = f.mode === "month" ? today.slice(0, 7) : (f.month ?? today.slice(0, 7));
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

/** Dublin calendar date of a timestamp. */
export const dublinDateOf = (ts: string) => dublinToday(new Date(ts));

export function inHistory(ts: string, f: HistoryFilter, today = dublinToday()) {
  const r = historyRange(f, today);
  if (!r) return true;
  const d = dublinDateOf(ts);
  return d >= r.from && d <= r.to;
}

/** "invoice.pdf" -> "invoice (2).pdf" when the name is already taken. Never overwrites. */
export function uniqueDisplayName(name: string, taken: Iterable<string>) {
  const set = new Set([...taken].map((t) => t.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i++) {
    const n = `${base} (${i})${ext}`;
    if (!set.has(n.toLowerCase())) return n;
  }
}

export const normTask = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Drop blanks and duplicates (case/whitespace-insensitive) against existing tasks and within the batch. */
export function dedupeTasks(incoming: string[], existing: string[]) {
  const seen = new Set(existing.map(normTask));
  const out: string[] = [];
  for (const raw of incoming) {
    const t = raw.trim().replace(/\s+/g, " ");
    const k = normTask(t);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Line total only when both quantity and unit price are known. */
export function lineTotal(qty: number | null | undefined, price: number | null | undefined) {
  if (qty == null || price == null || Number.isNaN(qty) || Number.isNaN(price)) return null;
  return Math.round(qty * price * 100) / 100;
}

/** Split pasted/extracted text into candidate task lines, stripping bullets and numbering. */
export function splitTaskLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*·▪●]|\d+[.)]|[a-z][.)])\s+/i, "").trim())
    .filter(Boolean);
}
