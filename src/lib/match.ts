/**
 * Does a document belong to who or what it is being filed under? (Oisin, 18 Nov: "if I added my
 * licence to someone else it would warn me the names don't match".) Used once the AI model has
 * read a name or a registration off an uploaded document. Pure: no React, no store.
 */
import { normaliseReg } from "./fleet";

const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "mx"]);

/** A name as a set of plain lower-case words: accents, apostrophes, hyphens, titles and case ignored. */
export function nameWords(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`-]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !TITLES.has(w));
}

export type Match = "match" | "mismatch" | "unknown";

/**
 * "match" when the two are the same person as far as the words go: every word of the shorter
 * name is in the longer one, in any order (a licence may print the surname first, or a middle
 * name). "unknown" when either has nothing to compare, so no warning is shown.
 */
export function namesMatch(a: string, b: string): Match {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return "unknown";
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  // One word against a full name is too little to call a match or a mismatch on its own initial.
  if (small.length === 1 && big.length > 1) return big.includes(small[0]!) ? "match" : "mismatch";
  return small.every((w) => big.includes(w)) ? "match" : "mismatch";
}

/** Registrations compared with spaces, dashes and case ignored. */
export function regsMatch(a: string, b: string): Match {
  const x = normaliseReg(a).replace(/-/g, "");
  const y = normaliseReg(b).replace(/-/g, "");
  if (!x || !y) return "unknown";
  return x === y ? "match" : "mismatch";
}
