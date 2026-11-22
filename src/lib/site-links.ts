/**
 * How what the site phone sends reads in the office (22 Nov, Oisin: "make sure all the
 * connections between the apps and the site are working and going to the correct place").
 */
import type { DayInstruction, ID, Variation } from "@/data/types";

/** What the phone writes as the measure of extra work it reports: the office measures it later. */
export const PHONE_MEASURE = "To be measured on site";

/** True when the extra work came from the site phone, not the office's New variation box. */
export const fromPhone = (v: Pick<Variation, "measured">) => v.measured === PHONE_MEASURE;

/**
 * The line that names a variation in a list or an approval. The office types a measure
 * ("12 m2 of lime repointing"), which is the clearest name; from the phone the measure is only
 * the placeholder, so the worker's own words are used instead.
 */
export function variationHeadline(v: Pick<Variation, "measured" | "description">): string {
  const measured = v.measured.trim();
  return measured && !fromPhone(v) ? measured : v.description.trim();
}

/** The site manager's instructions for a site from today on, soonest first (shown on the project's Overview). */
export const instructionsUp = (list: DayInstruction[], projectId: ID, day: string) =>
  list.filter((x) => x.projectId === projectId && x.date >= day && x.text.trim()).sort((a, b) => a.date.localeCompare(b.date));
