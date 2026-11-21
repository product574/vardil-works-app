/**
 * Projects, All projects (Oisin, 21 Nov, in place of Completed): every job in one list that can
 * be searched and narrowed by status, handover, site manager and whether the final account is on
 * hold. Pure, so it can be tested.
 */
import type { Project, ProjectStatus } from "@/data/types";

export type StatusFilter = "all" | "live" | "not-started" | "finished";
export type HandoverFilter = "any" | "sent" | "not-sent";
export type ProjectFilter = { status: StatusFilter; handover: HandoverFilter; siteManagerId: string; onHold: boolean; q: string };
export const NO_FILTER: ProjectFilter = { status: "all", handover: "any", siteManagerId: "", onHold: false, q: "" };

/** Finished on site: complete, invoiced or closed. These are the archive in Files too. */
export const isFinished = (s: ProjectStatus) => s === "Complete" || s === "Invoiced" || s === "Closed";
export const statusGroup = (s: ProjectStatus): Exclude<StatusFilter, "all"> => (s === "Live" ? "live" : s === "Not started" ? "not-started" : "finished");

type P = Pick<Project, "code" | "name" | "location" | "county" | "status" | "siteManagerId" | "handoverSentAt" | "invoiceHold">;

/** Does a job pass the filters? `extra` is anything else the search should find it by (the client's name, the site manager's). */
export function matchesProject(p: P, f: ProjectFilter, extra = ""): boolean {
  if (f.status !== "all" && statusGroup(p.status) !== f.status) return false;
  // Handover is a finished job's business: asking for sent or not sent leaves the others out.
  if (f.handover !== "any" && (!isFinished(p.status) || !!p.handoverSentAt !== (f.handover === "sent"))) return false;
  if (f.siteManagerId && p.siteManagerId !== f.siteManagerId) return false;
  if (f.onHold && !p.invoiceHold) return false;
  const term = f.q.trim().toLowerCase();
  return !term || `${p.code} ${p.name} ${p.location} ${p.county} ${extra}`.toLowerCase().includes(term);
}

const RANK: Record<ProjectStatus, number> = { Live: 0, "Not started": 1, Complete: 2, Invoiced: 3, Closed: 4 };
/** Live first, then waiting to start, then finished; the newest site code first within each. */
export const byStatusThenCode = (a: Pick<Project, "status" | "code">, b: Pick<Project, "status" | "code">) => RANK[a.status] - RANK[b.status] || b.code.localeCompare(a.code);

/** How many filters are narrowing the list, for the "Clear filters" button. */
export const filtersOn = (f: ProjectFilter) => [f.status !== "all", f.handover !== "any", !!f.siteManagerId, f.onHold, !!f.q.trim()].filter(Boolean).length;
