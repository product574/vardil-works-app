// Rules for Reports (added 18 Nov, from the HVAC reporting Oisin likes, made for a contractor):
// the tender win rate, sales by customer, the most profitable jobs paid in full, where the
// money goes, margin by job, and the figures on a customer's own page. Everything is worked
// out from the records with the same rules as the screens they link to, so a figure here can
// never disagree with Client invoices, Job costs or the Sales board.
import { projectCosts } from "@/data/figures";
import type { Client, CostCategoryKey, Db, Project, Quote, SalesInvoice } from "@/data/types";
import { addDays } from "./dates";
import { agedDebt } from "./invoices";
import { r2 } from "./money";
import { labourCost } from "./project-costs";
import { averagePct, projectEstMargin } from "./tenders";

// ── The last 12 months ────────────────────────────────────────────────────────

/** The first day of the last 12 months, today included: on 18 Nov 2026 it is 19 Nov 2025. */
export const yearStart = (today: string) => addDays(today, -364);

/** Did this happen in the last 12 months? Takes a day or a time stamp. */
export const inYear = (when: string | undefined, today: string) => !!when && when.slice(0, 10) >= yearStart(today) && when.slice(0, 10) <= today;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// ── Tenders ───────────────────────────────────────────────────────────────────

/** A tender is decided once the client has said yes or no. Still out, it does not count either way. */
const decided = (q: Quote) => q.status === "Accepted" || q.status === "Declined";
const priced = (q: Quote) => r2(q.lines.reduce((s, l) => s + l.qty * l.rate, 0));

export type WinRate = { won: number; decided: number; pct: number; valueWon: number };

function rate(quotes: Quote[]): WinRate {
  const won = quotes.filter((q) => q.status === "Accepted");
  return { won: won.length, decided: quotes.length, pct: pct(won.length, quotes.length), valueWon: r2(won.reduce((s, q) => s + priced(q), 0)) };
}

/** Won out of decided, for tenders the client answered in the last 12 months, and the value won. */
export const tenderWinRate = (quotes: Quote[], today: string) => rate(quotes.filter((q) => decided(q) && inYear(q.respondedAt, today)));

/** The same, by the kind of work each tender priced, best first. A tender with no kind recorded counts as "Other work". */
export function conversionByKind(quotes: Quote[], today: string): (WinRate & { kind: string })[] {
  const list = quotes.filter((q) => decided(q) && inYear(q.respondedAt, today));
  const kinds = [...new Set(list.map((q) => q.kind ?? "Other work"))];
  return kinds.map((kind) => ({ kind, ...rate(list.filter((q) => (q.kind ?? "Other work") === kind)) })).sort((a, b) => b.pct - a.pct || b.decided - a.decided || a.kind.localeCompare(b.kind));
}

// ── Sales ─────────────────────────────────────────────────────────────────────

/** Client invoices sent in the last 12 months, paid or not: what Sage has as sales. */
const sentInYear = (invoices: SalesInvoice[], today: string) => invoices.filter((i) => (i.status === "Invoiced" || i.status === "Paid") && inYear(i.issuedOn, today));

/** Invoiced to clients in the last 12 months, before VAT. */
export const salesInYear = (invoices: SalesInvoice[], today: string) => r2(sentInYear(invoices, today).reduce((s, i) => s + i.net, 0));

export type CustomerSales = { client: Client; total: number; projects: number; average: number; invoices: number };

/** Each customer's sales in the last 12 months, biggest first: the total, how many projects it came from, and the average per project. */
export function salesByCustomer(db: Pick<Db, "salesInvoices" | "clients">, today: string): CustomerSales[] {
  const sent = sentInYear(db.salesInvoices, today);
  return db.clients
    .map((client) => {
      const mine = sent.filter((i) => i.clientId === client.id);
      const projects = new Set(mine.map((i) => i.projectId)).size;
      const total = r2(mine.reduce((s, i) => s + i.net, 0));
      return { client, total, projects, average: projects ? r2(total / projects) : 0, invoices: mine.length };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total || a.client.name.localeCompare(b.client.name));
}

/** Owed by clients past the due date today, with VAT: the late squares on Client invoices. */
export function overdueFromClients(invoices: SalesInvoice[], today: string) {
  const late = agedDebt(invoices, today).buckets.slice(1);
  return { gross: r2(late.reduce((s, b) => s + b.gross, 0)), count: late.reduce((s, b) => s + b.count, 0) };
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

const FINISHED = new Set<Project["status"]>(["Complete", "Invoiced", "Closed"]);

export type JobRow = {
  project: Project;
  client: Client | undefined;
  /** The day the work finished. */
  finished: string;
  /** The contract value with every agreed extra, before VAT. */
  revenue: number;
  /** Labour from the timesheets and every approved supplier and subcontractor invoice: the same cost as Job costs. */
  cost: number;
  margin: number;
  pct: number;
  /** Finished after the finish agreed when it was set up. */
  late: boolean;
  /** The day the last invoice on it was paid, once every one has been. */
  paidOn?: string;
};

/** The figures for one finished job. */
export function jobRow(db: Db, p: Project): JobRow {
  const revenue = r2(p.value ?? 0);
  const cost = r2(projectCosts(db, p).cost);
  const finished = (p.completedAt ?? p.endDate).slice(0, 10);
  const invoices = db.salesInvoices.filter((i) => i.projectId === p.id);
  const allPaid = p.status === "Closed" && invoices.length > 0 && invoices.every((i) => i.status === "Paid");
  const paidOn = allPaid ? invoices.map((i) => i.paidOn ?? "").sort().pop() : undefined;
  return { project: p, client: db.clients.find((c) => c.id === p.clientId), finished, revenue, cost, margin: r2(revenue - cost), pct: pct(revenue - cost, revenue), late: !!p.plannedEnd && finished > p.plannedEnd, paidOn };
}

/** Every job finished in the last 12 months, whether invoiced and paid yet or not: the Gross margin page. */
export const finishedInYear = (db: Db, today: string) => db.projects.filter((p) => FINISHED.has(p.status) && inYear(p.completedAt ?? p.endDate, today)).map((p) => jobRow(db, p));

/** Jobs paid in full, the last payment in the last 12 months. */
export const paidInYear = (db: Db, today: string) => db.projects.filter((p) => p.status === "Closed").map((p) => jobRow(db, p)).filter((j) => inYear(j.paidOn, today));

/** The most profitable jobs paid in full in the last 12 months, by margin as a share of the price. */
export const topByMargin = (db: Db, today: string, n = 10) => [...paidInYear(db, today)].sort((a, b) => b.pct - a.pct || b.margin - a.margin).slice(0, n);

/** Revenue, cost and margin added up over a set of jobs. The margin share is of the revenue, so big jobs count for more. */
export function totals(jobs: JobRow[]) {
  const revenue = r2(jobs.reduce((s, j) => s + j.revenue, 0));
  const cost = r2(jobs.reduce((s, j) => s + j.cost, 0));
  return { revenue, cost, margin: r2(revenue - cost), pct: pct(revenue - cost, revenue), losing: jobs.filter((j) => j.margin < 0).length, jobs: jobs.length };
}

/** How many of these jobs finished by the finish agreed when they were set up. */
export function onTime(jobs: JobRow[]) {
  const ok = jobs.filter((j) => !j.late).length;
  return { onTime: ok, jobs: jobs.length, pct: pct(ok, jobs.length) };
}

export type JobSort = "pct" | "margin" | "revenue" | "finished";
export const JOB_SORTS: { value: JobSort; label: string }[] = [
  { value: "pct", label: "Margin %" },
  { value: "margin", label: "Margin" },
  { value: "revenue", label: "Revenue" },
  { value: "finished", label: "Newest first" },
];
export function sortJobs(jobs: JobRow[], by: JobSort) {
  const key = (j: JobRow) => (by === "pct" ? j.pct : by === "margin" ? j.margin : by === "revenue" ? j.revenue : 0);
  return [...jobs].sort((a, b) => (by === "finished" ? b.finished.localeCompare(a.finished) : key(b) - key(a)) || a.project.code.localeCompare(b.project.code));
}

// ── Where the money goes ──────────────────────────────────────────────────────

/** The headings costs are added up under, in the words used on screen. Supplier invoice headings map onto them. */
export const MONEY_HEADINGS = ["Labour", "Materials", "Subcontractors", "Plant and hire", "Transport", "Other site costs"] as const;
export type MoneyHeading = (typeof MONEY_HEADINGS)[number];
const HEADING_OF: Record<CostCategoryKey, MoneyHeading> = { material: "Materials", labour: "Subcontractors", plant: "Plant and hire", equipment: "Plant and hire", transport: "Transport", other: "Other site costs" };
const HINT: Record<MoneyHeading, string> = {
  Labour: "Timesheets at each person's rate, overtime included",
  Materials: "Lime, stone, slate, timber, glass and the rest",
  Subcontractors: "Scaffolders, carvers, electricians and the like",
  "Plant and hire": "Hired plant and equipment",
  Transport: "Haulage to and from site",
  "Other site costs": "Skips, waste and the rest",
};

/**
 * Every job cost in the last 12 months, by heading: labour from the timesheets of those
 * months, and every approved supplier and subcontractor invoice dated in them (a credit note
 * comes off). The same money Job costs counts, over a year instead of a job.
 */
export function whereMoneyGoes(db: Pick<Db, "attendance" | "people" | "supplierInvoices">, today: string) {
  const rate = new Map(db.people.map((p) => [p.id, p.hourlyRate]));
  const sums = new Map<MoneyHeading, number>(MONEY_HEADINGS.map((h) => [h, 0]));
  sums.set("Labour", labourCost(db.attendance.filter((a) => inYear(a.date, today)).map((a) => ({ status: a.status, overtimeHours: a.overtimeHours, hourlyRate: rate.get(a.personId) ?? 0 }))));
  for (const s of db.supplierInvoices) {
    if (s.readStatus !== "confirmed" || !inYear(s.invoiceDate, today)) continue;
    for (const a of s.allocations) {
      const h = HEADING_OF[a.category];
      sums.set(h, r2((sums.get(h) ?? 0) + (s.docType === "credit_note" ? -Math.abs(a.amount) : a.amount)));
    }
  }
  const total = r2([...sums.values()].reduce((s, x) => s + x, 0));
  // Biggest first, as a person reads it.
  const rows = MONEY_HEADINGS.map((heading) => ({ heading, hint: HINT[heading], amount: r2(sums.get(heading) ?? 0), pct: pct(sums.get(heading) ?? 0, total) }));
  return { total, rows: rows.sort((a, b) => b.amount - a.amount) };
}

// ── A customer's own page ─────────────────────────────────────────────────────

/** The four figures at the top of a customer's page. The margin is over their jobs paid in full in the last 12 months, null when there are none. */
export function customerFigures(db: Db, clientId: string, today: string) {
  const mine = db.salesInvoices.filter((i) => i.clientId === clientId);
  const owed = r2(mine.filter((i) => i.status === "Invoiced").reduce((s, i) => s + r2((i.net * (100 + i.vatPct)) / 100), 0));
  const paid = paidInYear(db, today).filter((j) => j.project.clientId === clientId);
  return {
    sales: salesInYear(mine, today),
    owed,
    live: db.projects.filter((p) => p.clientId === clientId && p.status === "Live").length,
    margin: paid.length ? totals(paid).pct : null,
    paidJobs: paid.length,
  };
}

export type Happening = { at: string; what: string; to: string };

/** The latest things that happened with a customer, newest first: invoices sent and paid, tenders, jobs started and finished, emails. */
export function customerTimeline(db: Db, clientId: string, today: string, limit = 6): Happening[] {
  const out: Happening[] = [];
  for (const i of db.salesInvoices.filter((x) => x.clientId === clientId)) {
    const no = i.accountsNo ?? i.ref;
    if (i.issuedOn) out.push({ at: `${i.issuedOn}T10:40`, what: `Invoice ${no} sent`, to: `/invoicing/client/${no}` });
    if (i.paidOn) out.push({ at: `${i.paidOn}T11:15`, what: `Invoice ${no} paid`, to: `/invoicing/client/${no}` });
  }
  for (const q of db.quotes.filter((x) => x.clientId === clientId)) {
    if (q.sentAt) out.push({ at: q.sentAt, what: `Tender ${q.ref} sent`, to: `/sales/quotes/${q.ref}` });
    if (q.respondedAt) out.push({ at: q.respondedAt, what: `Tender ${q.ref} ${q.status === "Accepted" ? "won" : q.status === "Declined" ? "lost" : "queried"}`, to: `/sales/quotes/${q.ref}` });
  }
  for (const p of db.projects.filter((x) => x.clientId === clientId)) {
    if (p.status !== "Not started") out.push({ at: `${p.startDate}T07:45`, what: `${p.code} ${p.name} started`, to: `/projects/${p.code}` });
    if (p.completedAt) out.push({ at: p.completedAt, what: `${p.code} ${p.name} finished`, to: `/projects/${p.code}` });
  }
  // An invoice's own email is already there as "Invoice ... sent".
  for (const m of db.mails.filter((x) => x.clientId === clientId && !x.salesInvoiceId)) out.push({ at: m.receivedAt, what: `${m.folder === "Sent" ? "Email sent" : "Email in"}: ${m.subject}`, to: m.folder === "Sent" ? `/inbox/sent?mail=${m.id}` : `/inbox?mail=${m.id}` });
  return out.filter((h) => h.at.slice(0, 10) <= today).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

// ── Files to download ─────────────────────────────────────────────────────────

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A report as a spreadsheet file: a heading row, then one row per line. */
export const csvOf = (head: string[], rows: (string | number)[][]) => [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";

/**
 * A customer's average margins (21 Nov), over finished jobs only (Oisin: "do not include
 * estimates from unfinished jobs"): the actual margin of each, from Job costs, and what each was
 * estimated at (its tender's, or the figure typed for a job with no tender). A plain average of
 * the jobs, each job counting once. Null when there is nothing to average.
 */
export function customerMargins(db: Db, clientId: string) {
  const jobs = db.projects.filter((p) => p.clientId === clientId && FINISHED.has(p.status) && (p.value ?? 0) > 0);
  return {
    jobs: jobs.length,
    actual: averagePct(jobs.map((p) => jobRow(db, p).pct)),
    estimated: averagePct(jobs.map((p) => projectEstMargin(p, db.quotes))),
    estimatedJobs: jobs.filter((p) => projectEstMargin(p, db.quotes) != null).length,
  };
}
