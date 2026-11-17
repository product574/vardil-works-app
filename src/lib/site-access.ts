/**
 * Which sites a site manager may open (Oisin, 17 Nov). Everyone opens the sites they run. The
 * managing director can give a site to another site manager as well (Admin, Site access): to
 * cover a holiday, or because two people share a job. People with "See every project" open
 * everything already, so they are not part of this.
 *
 * Pure functions: no React, no store.
 */
import type { Db, ID, Person, Project, SiteAccess } from "@/data/types";

type Site = Pick<Project, "id" | "siteManagerId">;
type Grant = Pick<SiteAccess, "personId" | "projectId">;

/** Whether the managing director has given this person the site, besides whoever runs it. */
export const givenSite = (grants: Grant[], personId: ID | null, projectId: ID) => !!personId && grants.some((g) => g.personId === personId && g.projectId === projectId);

/** Whether this person opens the site as their own: they run it, or they have been given it. */
export const opensSite = (site: Site, personId: ID | null, grants: Grant[]) => !!personId && (site.siteManagerId === personId || givenSite(grants, personId, site.id));

/** Whether someone's lists cover every project ("See every project"), worked out from their level and any exception of their own. */
export function seesEveryProject(db: Pick<Db, "people" | "access" | "personAccess">, personId: ID | null): boolean {
  const p = db.people.find((x) => x.id === personId);
  if (!p || p.kind !== "Management") return true;
  const level = p.level ?? "site";
  if (level === "md") return true;
  return db.personAccess.find((a) => a.id === personId)?.perms.allProjects ?? db.access.find((a) => a.id === level)?.perms.includes("allProjects") ?? false;
}

/** The sites access is decided for: live and not started, in site code order. Finished jobs stay with whoever ran them. */
export const sitesToShare = (projects: Project[]) => projects.filter((p) => p.status === "Live" || p.status === "Not started").sort((a, b) => a.code.localeCompare(b.code));

/**
 * The people on the Site access grid. `choose` are those whose sites are picked one by one:
 * active, at site manager level, without "See every project"; whoever runs a site first, then by
 * name. `every` already open every project, so there is nothing to pick for them.
 */
export function siteAccessPeople(db: Pick<Db, "people" | "access" | "personAccess" | "projects">): { choose: Person[]; every: Person[] } {
  const site = db.people.filter((p) => p.active && p.kind === "Management" && (p.level ?? "site") === "site");
  const runs = (p: Person) => (sitesToShare(db.projects).some((x) => x.siteManagerId === p.id) ? 0 : 1);
  const order = (a: Person, b: Person) => runs(a) - runs(b) || a.name.localeCompare(b.name);
  return { choose: site.filter((p) => !seesEveryProject(db, p.id)).sort(order), every: site.filter((p) => seesEveryProject(db, p.id)).sort(order) };
}

/** How one site stands for one person on the grid. */
export type SiteCell = "runs" | "given" | "no";
export const siteCell = (site: Site, personId: ID, grants: Grant[]): SiteCell => (site.siteManagerId === personId ? "runs" : givenSite(grants, personId, site.id) ? "given" : "no");

/** The sites someone opens out of a list: how many they run and how many they have been given. */
export function siteCounts(sites: Site[], personId: ID, grants: Grant[]): { runs: number; given: number } {
  return { runs: sites.filter((s) => s.siteManagerId === personId).length, given: sites.filter((s) => s.siteManagerId !== personId && givenSite(grants, personId, s.id)).length };
}
