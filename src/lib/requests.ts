/**
 * What waits for the managing director's yes or no (Admin > Requests, Aodhan's pick on 16 Nov):
 * leave, people and plant asked for by the sites, and money people want to spend.
 */
import type { Db, Holiday, SiteRequest, SpendRequest } from "@/data/types";

export type DirectorQueue = { leave: Holiday[]; site: SiteRequest[]; spend: SpendRequest[] };

/** Each kind in the order it is needed: leave and site requests by their first day, spending oldest first. */
export function directorQueue(db: Db): DirectorQueue {
  return {
    leave: db.holidays.filter((h) => h.status === "Requested").sort((a, b) => a.from.localeCompare(b.from)),
    site: db.requests.filter((r) => r.status === "Open" && !r.decision).sort((a, b) => a.neededFrom.localeCompare(b.neededFrom)),
    spend: db.spendRequests.filter((s) => s.status === "Waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

/** Everything waiting, as one list of ids, for counts. */
export function waitingOnDirector(db: Db): string[] {
  const q = directorQueue(db);
  return [...q.leave.map((x) => x.id), ...q.site.map((x) => x.id), ...q.spend.map((x) => x.id)];
}

/** Answered in the last fortnight, newest first, so a yes or no just given can be checked. */
export function recentlyDecided(db: Db, today: string) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  const site = db.requests.filter((r) => r.decision && (r.decidedAt ?? "") >= since).map((r) => ({ kind: "site" as const, at: r.decidedAt!, item: r }));
  const spend = db.spendRequests.filter((s) => s.status !== "Waiting" && (s.decidedAt ?? "") >= since).map((s) => ({ kind: "spend" as const, at: s.decidedAt!, item: s }));
  return [...site, ...spend].sort((a, b) => b.at.localeCompare(a.at));
}
