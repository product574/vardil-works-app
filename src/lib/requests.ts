/**
 * What waits for the managing director's yes or no (Admin > Requests, Aodhan's pick on 16 Nov):
 * leave, people and plant asked for by the sites, and money people want to spend.
 */
import type { CertSubmission, Db, Expense, Holiday, OvertimeClaim, Project, RepairReport, SiteAccess, SiteRequest, SpendRequest, SupplierInvoice } from "@/data/types";
import { notPaid } from "./reimbursements";
import { partyOf, purchaseStage } from "./purchases";
import { opensSite, seesEveryProject } from "./site-access";

export type DirectorQueue = {
  leave: Holiday[];
  site: SiteRequest[];
  spend: SpendRequest[];
  invoices: SupplierInvoice[];
  expenses: Expense[];
  /** Since 19 Nov (the main offering): overtime claimed on the phone, new repairs, certificates sent from the phone, and approved reimbursements to mark paid. */
  claims: OvertimeClaim[];
  repairs: RepairReport[];
  certs: CertSubmission[];
  toPay: Expense[];
};

/**
 * Each kind in the order it is needed: leave and site requests by their first day, spending oldest first.
 * `crewToOffice`: with one phone for everyone (no Projects app) there is no site manager's phone to
 * hold a crew request, so every request is with the office.
 */
export function directorQueue(db: Db, opts: { crewToOffice?: boolean } = {}): DirectorQueue {
  return {
    leave: db.holidays.filter((h) => h.status === "Requested").sort((a, b) => a.from.localeCompare(b.from)),
    // Requests still with a site manager have not been asked of the office yet.
    site: db.requests.filter((r) => (opts.crewToOffice ? r.status === "Open" : withOffice(r)) && !r.decision).sort((a, b) => a.neededFrom.localeCompare(b.neededFrom)),
    claims: db.overtimeClaims.filter((c) => c.status === "Waiting").sort((a, b) => a.date.localeCompare(b.date)),
    repairs: db.repairs.filter((r) => r.status === "Reported").sort((a, b) => a.at.localeCompare(b.at)),
    certs: db.certSubmissions.filter((c) => c.status === "Waiting").sort((a, b) => a.sentAt.localeCompare(b.sentAt)),
    toPay: notPaid(db.expenses),
    spend: db.spendRequests.filter((s) => s.status === "Waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // Reimbursements claimed from the site phone (17 Nov), oldest first.
    expenses: db.expenses.filter((x) => x.status === "Waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // Supplier invoices checked by accounts and over the limit they may approve, so waiting for
    // the managing director (Invoicing's rule, decision 76; shown here too since the two chats
    // were merged, 19 Nov). The same invoices are on Invoicing, To approve. Oldest first.
    invoices: waitingForDirector(db).sort((a, b) => (a.askedAt ?? "").localeCompare(b.askedAt ?? "")),
  };
}

/** Supplier invoices only someone who may approve any invoice can approve: over the accounts limit, before VAT. */
export function waitingForDirector(db: Pick<Db, "supplierInvoices" | "approvalLimits">): SupplierInvoice[] {
  const limit = db.approvalLimits.find((l) => l.id === "supplier")?.amount ?? 0;
  return db.supplierInvoices.filter((s) => partyOf(s) === "supplier" && purchaseStage(s) === "approve" && s.subtotal > limit);
}

/** Everything waiting, as one list of ids, for counts. */
export function waitingOnDirector(db: Db, opts: { crewToOffice?: boolean } = {}): string[] {
  const q = directorQueue(db, opts);
  return [...q.leave, ...q.site, ...q.spend, ...q.invoices, ...q.expenses, ...q.claims, ...q.repairs, ...q.certs, ...q.toPay].map((x) => x.id);
}

/** Answered in the last fortnight, newest first, so a yes or no just given can be checked. */
export function recentlyDecided(db: Db, today: string) {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 14 * 86_400_000).toISOString().slice(0, 10);
  const site = db.requests.filter((r) => r.decision && (r.decidedAt ?? "") >= since).map((r) => ({ kind: "site" as const, at: r.decidedAt!, item: r }));
  const spend = db.spendRequests.filter((s) => s.status !== "Waiting" && (s.decidedAt ?? "") >= since).map((s) => ({ kind: "spend" as const, at: s.decidedAt!, item: s }));
  // Reimbursements too (17 Nov), so a no and the note left with it can be read back.
  const expense = db.expenses.filter((x) => x.status !== "Waiting" && (x.decidedAt ?? "") >= since).map((x) => ({ kind: "expense" as const, at: x.decidedAt!, item: x }));
  return [...site, ...spend, ...expense].sort((a, b) => b.at.localeCompare(a.at));
}

// ── Requests from the crew (Oisin, 17 Nov) ───────────────────────────────────
// A request made on an operative's phone goes to the site manager first. He forwards it to
// management as his own request, or marks it dealt with. Until then the office does not count it.

type Req = Pick<SiteRequest, "status" | "heldBy">;

/** Open and waiting with the site manager. */
export const withSite = (r: Req) => r.status === "Open" && r.heldBy === "site";
/** Open and with the office: what the sites have asked management for. */
export const withOffice = (r: Req) => r.status === "Open" && r.heldBy !== "site";

/** What the crew has asked a site manager for on these projects and he has not yet dealt with, oldest first. */
export function crewRequests(requests: SiteRequest[], projectIds: Iterable<string>): SiteRequest[] {
  const ids = new Set(projectIds);
  return requests.filter((r) => withSite(r) && r.projectId !== null && ids.has(r.projectId)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Who may forward a crew request or mark it dealt with: a site manager who opens that site, which
 * is whoever runs it and anyone the managing director has given it to (Admin, Site access). The
 * office sees who it is with.
 */
export const mayHandleCrewRequest = (site: Pick<Project, "id" | "siteManagerId"> | undefined, personId: string | null, grants: Pick<SiteAccess, "personId" | "projectId">[]) => !!site && opensSite(site, personId, grants);

/** A general request: from a site manager, not tied to one site (Oisin, 17 Nov). */
export const isGeneral = (r: Pick<SiteRequest, "projectId">) => r.projectId === null;

/**
 * The requests on one person's screen: those on the projects it covers, and general ones for the
 * people who see every project and for whoever asked.
 */
export function requestsFor(db: Pick<Db, "people" | "access" | "personAccess" | "projects" | "requests" | "siteAccess">, personId: string | null): SiteRequest[] {
  const all = seesEveryProject(db, personId);
  const mine = new Set(db.projects.filter((p) => all || opensSite(p, personId, db.siteAccess)).map((p) => p.id));
  return db.requests.filter((r) => (r.projectId === null ? all || r.requestedById === personId : mine.has(r.projectId)));
}

/** The number beside Requests in the Projects sidebar: every open request on this person's screen, with the office or with a site manager. */
export function openRequestCount(db: Pick<Db, "people" | "access" | "personAccess" | "projects" | "requests" | "siteAccess">, personId: string | null): number {
  return requestsFor(db, personId).filter((r) => r.status === "Open").length;
}

/**
 * The number beside Timesheet in the People sidebar (round ten): overtime claims from the phones
 * still waiting for a yes or no, on the live sites this person's screen covers.
 */
export function overtimeClaimCount(db: Pick<Db, "people" | "access" | "personAccess" | "projects" | "overtimeClaims" | "siteAccess">, personId: string | null): number {
  const all = seesEveryProject(db, personId);
  const mine = new Set(db.projects.filter((p) => p.status === "Live" && (all || opensSite(p, personId, db.siteAccess))).map((p) => p.id));
  return db.overtimeClaims.filter((c) => c.status === "Waiting" && mine.has(c.projectId)).length;
}
