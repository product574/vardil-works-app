import { addDays, isWeekend } from "@/lib/dates";

/** Small deterministic random generator, so the sample data is identical on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T,
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** The demo's "today": the most recent working day, so site screens are never empty at a weekend. */
export function demoDay(realToday: string) {
  let d = realToday;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/** The date itself on a working day, or the Friday before a weekend: for things that happen in office hours. */
export const weekday = demoDay;

/** Move by working days (negative goes back). */
export function workdays(from: string, n: number) {
  let d = from;
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d = addDays(d, step);
    if (!isWeekend(d)) left--;
  }
  return d;
}

/** The last `count` working days up to and including `today`, oldest first. */
export function pastWorkdays(today: string, count: number) {
  const out: string[] = [];
  let d = today;
  while (out.length < count) {
    if (!isWeekend(d)) out.unshift(d);
    d = addDays(d, -1);
  }
  return out;
}

export const at = (day: string, time = "09:00") => `${day}T${time}:00`;
export const pad = (n: number, w = 3) => String(n).padStart(w, "0");
export const round5 = (n: number) => Math.round(n / 5) * 5;

/** The most recent given weekday (1 = Monday ... 5 = Friday) on or before `today`. */
export function lastWeekday(today: string, dow: number) {
  let d = today;
  while (new Date(d + "T12:00:00Z").getUTCDay() !== dow) d = addDays(d, -1);
  return d;
}
