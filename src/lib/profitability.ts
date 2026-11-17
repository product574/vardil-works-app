/**
 * Profitability (Oisin, 17 Nov): what each site has cost the firm, and what is left of what it
 * is worth. For every site, live or finished: the wages, at basic, time and a half and double
 * time, the reimbursements approved for it, and the checked invoices that came in for it under
 * four headings, plant and hire, materials, subcontractors and other (after round ten). Taken
 * off the contract value, that is what is left after all costs so far on a live site, and the
 * net profit, as an amount and a share of the value, on a finished one. The labour allowed in
 * the quote, which the first version measured wages against, was taken out at his word.
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

/** The checked invoices that came in for a job, under four headings. */
export type JobInvoices = { plantHire: number; materials: number; subcontractors: number; other: number };
const NO_INVOICES: JobInvoices = { plantHire: 0, materials: 0, subcontractors: 0, other: 0 };

export type SiteProfit = {
  projectId: string;
  wages: Wages;
  /** Reimbursements the director has approved for this site. */
  reimbursements: number;
  /** Wages and reimbursements: what the site has cost in the firm's own people. */
  outgoings: number;
  value: number | null;
  /** Wages as a share of the contract value, to one decimal place. */
  shareOfValue: number | null;
  /** Checked invoices for plant and hire, equipment included. */
  plantHire: number;
  /** Checked invoices for materials. */
  materials: number;
  /** Checked invoices from subcontractors. */
  subcontractors: number;
  /** Checked invoices for carriage and anything else. */
  other: number;
  /** Everything the job has cost so far: wages, reimbursements and the four kinds of invoice. */
  costs: number;
  /**
   * The contract value, agreed extras included, less everything it has cost. On a finished job
   * it is the net profit; on a live site, what is left after all costs so far.
   */
  netProfit: number | null;
  /** Net profit as a share of the contract value, to one decimal place. */
  netPct: number | null;
  people: PersonWages[];
};

/**
 * One site: its wages by rate, its reimbursements and the invoices that came in for it, with
 * the net profit against the contract value and who the wages went to, dearest first.
 */
export function siteProfit(site: Site, attendance: Att[], people: Who[], claims: Claim[], invoices: JobInvoices = NO_INVOICES): SiteProfit {
  const rows = attendance.filter((a) => a.projectId === site.id);
  const who = new Map(people.map((p) => [p.id, p]));
  const rateOf = (id: string) => who.get(id)?.hourlyRate ?? 0;
  const wages = wagesOf(rows, rateOf);
  const approved = claims.filter((c) => c.projectId === site.id && c.status === "Approved");
  const reimbursements = r2(approved.reduce((s, c) => s + c.amount, 0));
  const outgoings = r2(wages.total + reimbursements);
  const plantHire = r2(invoices.plantHire);
  const materials = r2(invoices.materials);
  const subcontractors = r2(invoices.subcontractors);
  const other = r2(invoices.other);
  const costs = r2(outgoings + plantHire + materials + subcontractors + other);
  const netProfit = site.value == null ? null : r2(site.value - costs);
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
    value: site.value,
    shareOfValue: site.value && site.value > 0 ? Math.round((wages.total / site.value) * 1000) / 10 : null,
    plantHire,
    materials,
    subcontractors,
    other,
    costs,
    netProfit,
    netPct: netProfit != null && site.value && site.value > 0 ? Math.round((netProfit / site.value) * 1000) / 10 : null,
    people: list,
  };
}

/** The same figures added up across sites. */
export function profitTotals(rows: SiteProfit[]) {
  const sum = (f: (r: SiteProfit) => number) => r2(rows.reduce((s, r) => s + f(r), 0));
  const wages = sum((r) => r.wages.total);
  const value = sum((r) => r.value ?? 0);
  const netProfit = sum((r) => r.netProfit ?? 0);
  return {
    basic: sum((r) => r.wages.basic),
    timeAndHalf: sum((r) => r.wages.timeAndHalf),
    double: sum((r) => r.wages.double),
    premium: sum((r) => r.wages.premium),
    wages,
    reimbursements: sum((r) => r.reimbursements),
    outgoings: sum((r) => r.outgoings),
    value,
    plantHire: sum((r) => r.plantHire),
    materials: sum((r) => r.materials),
    subcontractors: sum((r) => r.subcontractors),
    other: sum((r) => r.other),
    costs: sum((r) => r.costs),
    netProfit,
    netPct: value > 0 ? Math.round((netProfit / value) * 1000) / 10 : null,
    /** Overtime, at both rates, as a share of the wage bill. */
    overtimeShare: wages > 0 ? Math.round((sum((r) => r.wages.timeAndHalf + r.wages.double) / wages) * 1000) / 10 : 0,
  };
}

/** Under this share of the contract value, a finished job's net profit is called thin. */
export const THIN_PROFIT_PCT = 10;

/** How a finished job came out: a loss, a thin profit (under ten per cent), or fine. Nothing where it has no contract value. */
export function profitState(netPct: number | null): "none" | "loss" | "thin" | "ok" {
  if (netPct == null) return "none";
  if (netPct < 0) return "loss";
  return netPct < THIN_PROFIT_PCT ? "thin" : "ok";
}
