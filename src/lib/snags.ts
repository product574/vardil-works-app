/**
 * Snagging as a list (20 Nov, decision 234). A snag is open until someone marks it fixed; a job's
 * final account is on hold while any of its snags is open, and lets go when the last one is fixed.
 * Pure: the screens and the actions both ask these.
 */
import type { Project, Snag, Variation } from "@/data/types";

type S = Pick<Snag, "projectId" | "status">;

export const openSnags = <T extends S>(snags: T[], projectId: string): T[] => snags.filter((s) => s.projectId === projectId && s.status === "Open");

/** "3 open, 1 fixed", for a job's heading. */
export function snagCount(snags: S[], projectId: string) {
  const mine = snags.filter((s) => s.projectId === projectId);
  const open = mine.filter((s) => s.status === "Open").length;
  return { open, fixed: mine.length - open, total: mine.length };
}

/** May a snag be added to this job? While it is on site or finished and not yet closed out. */
export const takesSnags = (p: Pick<Project, "status">) => p.status === "Live" || p.status === "Complete";
/** May a variation be raised on this job? The same jobs. */
export const takesVariations = takesSnags;
/** May the site ask the office for something on this job? Only while it is on site or about to start. */
export const takesRequests = (p: Pick<Project, "status">) => p.status === "Live" || p.status === "Not started";

/**
 * Why a job's final account is on hold, one line per reason, each with what lets it go. Empty
 * when the flags say it is held but nothing is open (a hold put on by hand before 20 Nov).
 */
export function holdLines(p: Pick<Project, "id" | "extrasFlag" | "snaggingFlag">, variations: Pick<Variation, "projectId" | "status">[], snags: S[]): { why: string; lets: string }[] {
  const waiting = variations.filter((v) => v.projectId === p.id && v.status === "Draft").length;
  const open = openSnags(snags, p.id).length;
  const out: { why: string; lets: string }[] = [];
  if (p.extrasFlag) out.push({ why: waiting === 1 ? "1 variation is waiting for approval" : `${waiting} variations are waiting for approval`, lets: waiting === 1 ? "approving or discarding it" : "approving or discarding each one" });
  if (p.snaggingFlag) out.push({ why: open === 1 ? "1 snag is open" : `${open} snags are open`, lets: open === 1 ? "marking it fixed" : "marking each one fixed" });
  return out;
}
