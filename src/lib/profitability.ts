/**
 * Profitability (Oisin, 17 Nov): what each site has cost the firm in its own people, and how that
 * sits against what the job was priced with and what it is worth. For now the outgoings are the
 * wages, at basic, time and a half and double time, and the reimbursements approved for the site.
 * The invoices that belong to each job are to be linked in later, when Invoicing is sorted out;
 * until then they stay on Job costs.
 *
 * Wages are hours from the timesheets at each person's hourly rate, on the same rule as Job
 * costs (`labourCost`), so the two screens never disagree. Pay itself is worked out in the
 * payroll package.
 *
 * Pure functions: no React, no store.
 */
import { r2 } from "./money";
import { doubleOf } from "./overtime";
import { basicHours } from "./payroll";
import { labourCost } from "./project-costs";
import type { DayStatus } from "./week";

type Att = { projectId: string; personId: string; date: string; status: DayStatus; overtimeHours: number; doubleHours?: number };
type Who = { id: string; name: string; trade: string; hourlyRate: number };
type Claim = { projectId: string | null; personId: string; amount: number; status: string };
type Site = { id: string; value: number | null };

/** Hours and pay at each rate. `premium` is what the overtime cost over and above the basic rate for the same hours. */
export type Wages = {
  basicHours: number;
  timeAndHalfHours: number;
  doubleHours: number;
  basic: number;
  timeAndHalf: number;
  double: number;
  /** Basic, time and a half and double time together. Equal to the labour figure on Job costs. */
  total: number;
  premium: number;
};

const NO_WAGES: Wages = { basicHours: 0, timeAndHalfHours: 0, doubleHours: 0, basic: 0, timeAndHalf: 0, double: 0, total: 0, premium: 0 };

/** The wages for a set of timesheet entries, split by rate. */
export function wagesOf(rows: Att[], rateOf: (personId: string) => number): Wages {
  if (rows.length === 0) return NO_WAGES;
  let bh = 0, th = 0, dh = 0, b = 0, t = 0, d = 0, premium = 0;
  for (const a of rows) {
    const rate = rateOf(a.personId);
    const basic = basicHours(a.date, a.status);
    bh += basic;
    th += a.overtimeHours;
    dh += doubleOf(a);
    b += basic * rate;
    t += a.overtimeHours * 1.5 * rate;
    d += doubleOf(a) * 2 * rate;
    premium += a.overtimeHours * 0.5 * rate + doubleOf(a) * rate;
  }
  return { basicHours: r2(bh), timeAndHalfHours: r2(th), doubleHours: r2(dh), basic: r2(b), timeAndHalf: r2(t), double: r2(d), total: labourCost(rows.map((a) => ({ ...a, hourlyRate: rateOf(a.personId) }))), premium: r2(premium) };
}

export type PersonWages = { personId: string; name: string; trade: string; hourlyRate: number; days: number; restDays: number; wages: Wages; reimbursements: number };

export type SiteProfit = {
  projectId: string;
  wages: Wages;
  /** Reimbursements the director has approved for this site. */
  reimbursements: number;
  /** Wages and reimbursements: what the site has cost in the firm's own people. */
  outgoings: number;
  /** The labour the job was priced with in its quote, or nothing where there is no quote. */
  allowed: number | null;
  /** Wages as a share of the labour allowed, as a whole percentage. */
  usedPct: number | null;
  /** Wages over the labour allowed (above nought), or still in hand (below it). */
  over: number | null;
  value: number | null;
  /** Wages as a share of the contract value, to one decimal place. */
  shareOfValue: number | null;
  /** The contract value less the outgoings. Supplier invoices are not in it yet. */
  left: number | null;
  people: PersonWages[];
};

/**
 * One site: its wages by rate, its reimbursements, and both measures against them (the labour
 * allowed in the quote, and the contract value), with who the wages went to, dearest first.
 */
export function siteProfit(site: Site, attendance: Att[], people: Who[], claims: Claim[], allowed: number | null): SiteProfit {
  const rows = attendance.filter((a) => a.projectId === site.id);
  const who = new Map(people.map((p) => [p.id, p]));
  const rateOf = (id: string) => who.get(id)?.hourlyRate ?? 0;
  const wages = wagesOf(rows, rateOf);
  const approved = claims.filter((c) => c.projectId === site.id && c.status === "Approved");
  const reimbursements = r2(approved.reduce((s, c) => s + c.amount, 0));
  const outgoings = r2(wages.total + reimbursements);
  const ids = [...new Set([...rows.map((a) => a.personId), ...approved.map((c) => c.personId)])];
  const list = ids
    .map((id) => {
      const mine = rows.filter((a) => a.personId === id);
      const p = who.get(id);
      return {
        personId: id,
        name: p?.name ?? id,
        trade: p?.trade ?? "",
        hourlyRate: rateOf(id),
        days: mine.reduce((n, a) => n + (a.status === "full" ? 1 : a.status === "half" ? 0.5 : 0), 0),
        restDays: mine.filter((a) => a.status === "restday").length,
        wages: wagesOf(mine, rateOf),
        reimbursements: r2(approved.filter((c) => c.personId === id).reduce((s, c) => s + c.amount, 0)),
      };
    })
    .sort((a, b) => b.wages.total + b.reimbursements - (a.wages.total + a.reimbursements) || a.name.localeCompare(b.name));
  return {
    projectId: site.id,
    wages,
    reimbursements,
    outgoings,
    allowed,
    usedPct: allowed && allowed > 0 ? Math.round((wages.total / allowed) * 100) : null,
    over: allowed == null ? null : r2(wages.total - allowed),
    value: site.value,
    shareOfValue: site.value && site.value > 0 ? Math.round((wages.total / site.value) * 1000) / 10 : null,
    left: site.value == null ? null : r2(site.value - outgoings),
    people: list,
  };
}

/** The same figures added up across sites. */
export function profitTotals(rows: SiteProfit[]) {
  const sum = (f: (r: SiteProfit) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
  const wages = sum((r) => r.wages.total);
  const allowed = sum((r) => r.allowed ?? 0);
  const value = sum((r) => r.value ?? 0);
  return {
    basic: sum((r) => r.wages.basic),
    timeAndHalf: sum((r) => r.wages.timeAndHalf),
    double: sum((r) => r.wages.double),
    premium: sum((r) => r.wages.premium),
    wages,
    reimbursements: sum((r) => r.reimbursements),
    outgoings: sum((r) => r.outgoings),
    allowed,
    value,
    left: sum((r) => r.left ?? 0),
    /** Overtime, at both rates, as a share of the wage bill. */
    overtimeShare: wages > 0 ? Math.round((sum((r) => r.wages.timeAndHalf + r.wages.double) / wages) * 1000) / 10 : 0,
  };
}

/**
 * How a site's wages stand against the labour it was priced with, given how much of the work is
 * done: "over" once more has been spent than was allowed, "ahead" when the wages have used a
 * clearly bigger share of the allowance than the work done so far (ten points or more), else "ok".
 */
export function labourState(usedPct: number | null, donePct: number): "none" | "ok" | "ahead" | "over" {
  if (usedPct == null) return "none";
  if (usedPct > 100) return "over";
  return usedPct - donePct >= 10 ? "ahead" : "ok";
}
