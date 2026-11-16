// Display formatting for dates. Business dates are "YYYY-MM-DD"; timestamps are local ISO strings.

const utc = (d: string) => {
  const [y = 1970, m = 1, day = 1] = d.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
};
const f = (d: string, o: Intl.DateTimeFormatOptions) => utc(d).toLocaleDateString("en-IE", { ...o, timeZone: "UTC" });

/** 13 Nov */
export const dShort = (d: string | undefined) => (d ? f(d, { day: "numeric", month: "short" }) : "-");
/** 13 Nov 2026 */
export const dFull = (d: string | undefined) => (d ? f(d, { day: "numeric", month: "short", year: "numeric" }) : "-");
/** Fri 13 Nov */
export const dWeekday = (d: string | undefined) => (d ? f(d, { weekday: "short", day: "numeric", month: "short" }) : "-");
/** Friday 13 November 2026 */
export const dLong = (d: string) => f(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

/** Time of a stamp: 09:15 */
export const tOf = (stamp: string) => stamp.slice(11, 16);

/** "Today, 09:15", "Yesterday, 16:20" or "11 Nov, 10:05". */
export function when(stamp: string | undefined, today: string) {
  if (!stamp) return "-";
  const day = stamp.slice(0, 10);
  const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
  const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : dShort(day);
  return stamp.length > 10 ? `${label}, ${tOf(stamp)}` : label;
}

/** The same, for the middle of a sentence: "today, 09:15", "yesterday, 16:20" or "11 Nov, 10:05". Month names keep their capital. */
export const whenInline = (stamp: string | undefined, today: string) => when(stamp, today).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase());

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The same words with a capital first letter, for the start of a sentence. */
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w) && !/^(Rev\.|Fr\.|Mr|Mrs|and)$/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
