/**
 * The four boxes on the dashboard (20 Nov, the Oldstone template): Sales, Projects, Resources
 * and Finance. Each has two or three headline figures, one small bar, and up to three lines that
 * need attention, each a link to where it is dealt with. Jimmy: front screens are summaries and
 * bar graphs, not text. Worked out from the records, so they always match the screens.
 */
import type { Db } from "@/data/types";
import { claimRows, claimsDue, claimSummary } from "./claims";
import { planBlocks, vehicleBlocks } from "./compliance";
import { dShort, plural } from "./format";
import { owedOut, purchaseStage } from "./purchases";
import { quoteTotal } from "./quotes";
import { tenderWinRate } from "./reports";
import { waitingForDirector, withOffice } from "./requests";
import { lastWeekStart, payrollStage } from "./payroll";
import { daysBetween } from "./status";
import { r2 } from "./money";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";
export type Figure = { label: string; value: string; tone?: Tone };
/** One bar split into parts, each a share of the whole. */
export type Bar = { label: string; parts: { label: string; value: number; tone: Tone }[] };
export type Line = { text: string; to: string; tone: Tone };
export type Box = { figures: Figure[]; bar: Bar; lines: Line[] };

/** `director`: the person looking gives the last yes on invoices, so only those that have reached that step are counted for them (21 Nov). */
type Opts = { money: (n: number) => string; seeValues: boolean; director?: boolean };

const OUT = new Set(["Sent", "Queried"]);
const PRICING = new Set(["Draft", "Awaiting approval"]);

export function salesBox(db: Pick<Db, "quotes" | "enquiries" | "projects">, today: string, o: Opts): Box {
  const out = db.quotes.filter((q) => OUT.has(q.status));
  const tendered = r2(out.reduce((s, q) => s + quoteTotal(q.lines), 0));
  const confirmed = db.projects.filter((p) => p.status === "Not started");
  const confirmedValue = r2(confirmed.reduce((s, p) => s + (p.value ?? 0), 0));
  const win = tenderWinRate(db.quotes as Db["quotes"], today);
  const lost = win.decided - win.won;
  const toPrice = db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId).length;
  const pricing = db.quotes.filter((q) => PRICING.has(q.status));
  const dueSoon = pricing.filter((q) => q.tender && daysBetween(today, q.tender.returnBy) <= 5).sort((a, b) => a.tender!.returnBy.localeCompare(b.tender!.returnBy));
  const queried = db.quotes.filter((q) => q.status === "Queried");
  const lines: Line[] = [
    ...dueSoon.slice(0, 2).map((q): Line => ({ text: `${q.ref} ${q.title.split(":")[0]} due back ${dShort(q.tender!.returnBy)}`, to: `/sales/quotes/${q.ref}?tab=completed`, tone: daysBetween(today, q.tender!.returnBy) <= 2 ? "bad" : "warn" })),
    ...(queried.length ? [{ text: `${plural(queried.length, "tender")} queried by the client`, to: "/sales/awaiting", tone: "warn" as Tone }] : []),
    ...(toPrice ? [{ text: `${plural(toPrice, "enquiry", "enquiries")} to price`, to: "/sales/enquiries", tone: "accent" as Tone }] : []),
  ];
  return {
    figures: [
      { label: "Tendered, awaiting answer", value: o.seeValues ? o.money(tendered) : String(out.length) },
      { label: "Confirmed, not started", value: o.seeValues ? o.money(confirmedValue) : String(confirmed.length) },
      { label: "Win rate, 12 months", value: `${win.pct}%` },
    ],
    bar: { label: `${win.won} won and ${lost} lost in the last 12 months`, parts: [{ label: "Won", value: win.won, tone: "ok" }, { label: "Lost", value: lost, tone: "neutral" }] },
    lines: lines.slice(0, 3),
  };
}

export function projectsBox(db: Pick<Db, "projects" | "requests" | "plan" | "attendance">, today: string): Box {
  const live = db.projects.filter((p) => p.status === "Live");
  const late = live.filter((p) => p.endDate < today);
  const soon = db.projects.filter((p) => p.status === "Not started").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const requests = db.requests.filter(withOffice).filter((r) => r.status === "Open");
  const nobody = soon.filter((p) => !db.plan.some((e) => e.projectId === p.id));
  const holds = live.filter((p) => p.invoiceHold);
  const lines: Line[] = [
    ...late.slice(0, 1).map((p): Line => ({ text: `${p.code} ${p.name} is past its finish date`, to: `/projects/${p.code}?tab=programme`, tone: "bad" })),
    ...nobody.slice(0, 1).map((p): Line => ({ text: `${p.code} starts ${dShort(p.startDate)} with nobody planned`, to: "/schedule", tone: "warn" })),
    ...(requests.length ? [{ text: `${plural(requests.length, "site request")} open`, to: "/projects/requests", tone: "accent" as Tone }] : []),
    ...(holds.length ? [{ text: `${plural(holds.length, "variation")} to agree`, to: "/projects/extras", tone: "warn" as Tone }] : []),
  ];
  return {
    figures: [
      { label: "Live projects", value: String(live.length) },
      { label: "Starting soon", value: String(soon.length) },
      { label: "Past their finish date", value: String(late.length), tone: late.length ? "bad" : undefined },
    ],
    bar: { label: `${live.length - late.length} of ${live.length} live projects on programme`, parts: [{ label: "On programme", value: live.length - late.length, tone: "ok" }, { label: "Running over", value: late.length, tone: "bad" }] },
    lines: lines.slice(0, 3),
  };
}

export function resourcesBox(db: Db, today: string): Box {
  const operatives = db.people.filter((p) => p.active && p.kind === "Operative");
  const marked = new Set(db.attendance.filter((a) => a.date === today && a.status !== "restday").map((a) => a.personId));
  const planned = new Set(db.plan.filter((e) => e.date === today).map((e) => e.personId));
  const off = new Set(db.holidays.filter((h) => h.status === "Approved" && h.from <= today && h.to >= today).map((h) => h.personId));
  const onSite = operatives.filter((p) => marked.has(p.id) || (!off.has(p.id) && planned.has(p.id))).length;
  const away = operatives.filter((p) => off.has(p.id)).length;
  const free = Math.max(0, operatives.length - onSite - away);
  const cannot = [...planBlocks(db.people, db.plan.filter((e) => e.date >= today)).keys()].map((k) => k.split("|")[0]);
  const cannotPeople = new Set(cannot).size;
  const vans = db.vehicles.filter((v) => v.active && vehicleBlocks(v, today).length > 0);
  const plantOut = db.hiredPlant.filter((h) => h.status === "On hire" || h.status === "Return notified").length;
  const payroll = payrollStage(lastWeekStart(today), db.attendance, db.payrollChecks, db.attendanceChanges, db.payrollExports);
  const leave = db.holidays.filter((h) => h.status === "Requested").length;
  const lines: Line[] = [
    ...(cannotPeople ? [{ text: `${plural(cannotPeople, "person", "people")} planned who cannot work`, to: "/compliance?show=blocks", tone: "bad" as Tone }] : []),
    ...(vans.length ? [{ text: `${plural(vans.length, "vehicle")} with tax, test or insurance out of date`, to: "/fleet/renewals", tone: "bad" as Tone }] : []),
    ...(payroll === "to-check" || payroll === "to-export" ? [{ text: payroll === "to-check" ? "Last week's hours to check for payroll" : "Last week's hours ready to export", to: "/people/payroll", tone: "warn" as Tone }] : []),
    ...(leave ? [{ text: `${plural(leave, "holiday request")} to answer`, to: "/schedule/holiday-requests", tone: "accent" as Tone }] : []),
  ];
  return {
    figures: [
      { label: "On site today", value: String(onSite) },
      { label: "Cannot work", value: String(cannotPeople), tone: cannotPeople ? "bad" : undefined },
      { label: "Hired plant on site", value: String(plantOut) },
    ],
    bar: { label: `${operatives.length} operatives: ${onSite} on site, ${away} on leave, ${free} not placed`, parts: [{ label: "On site", value: onSite, tone: "ok" }, { label: "On leave", value: away, tone: "warn" }, { label: "Not placed", value: free, tone: "neutral" }] },
    lines: lines.slice(0, 3),
  };
}

export function financeBox(db: Db, today: string, o: Opts): Box {
  const rows = claimRows(db, today);
  const c = claimSummary(rows);
  const due = claimsDue(today, db.bankHolidays);
  const overdue = db.salesInvoices.filter((i) => i.status === "Invoiced" && !!i.dueOn && i.dueOn < today);
  const overdueValue = r2(overdue.reduce((s, i) => s + i.net * (1 + i.vatPct / 100), 0));
  const owed = owedOut(db.supplierInvoices, today);
  // Nothing reaches the managing director's dashboard until it has passed the steps before his: an invoice still with a site manager is not counted for him.
  const waiting = o.director ? waitingForDirector(db).length : db.supplierInvoices.filter((s) => purchaseStage(s) === "approve").length;
  const lines: Line[] = [
    ...(c.toGo ? [{ text: `${plural(c.toGo, "payment claim")} to issue by ${dShort(due)}`, to: "/invoicing/claims", tone: daysBetween(today, due) <= 5 ? ("bad" as Tone) : ("warn" as Tone) }] : []),
    ...(overdue.length ? [{ text: `${plural(overdue.length, "client invoice")} overdue${o.seeValues ? `, ${o.money(overdueValue)}` : ""}`, to: "/invoicing/invoiced", tone: "bad" as Tone }] : []),
    ...(waiting ? [{ text: `${plural(waiting, "invoice")} from suppliers and subcontractors waiting for ${o.director ? "your approval" : "approval"}`, to: "/invoicing/approve", tone: "warn" as Tone }] : []),
  ];
  return {
    figures: [
      { label: "Claims issued this month", value: `${c.issued} of ${c.total}`, tone: c.toGo ? "warn" : "ok" },
      { label: "Overdue from clients", value: o.seeValues ? o.money(overdueValue) : String(overdue.length), tone: overdue.length ? "bad" : undefined },
      { label: "Approved, to be paid", value: o.seeValues ? o.money(owed.total) : String(owed.count), tone: owed.lateCount ? "bad" : undefined },
    ],
    bar: { label: `This month's payment claims, due out by ${dShort(due)}`, parts: [{ label: "Issued", value: c.issued, tone: "ok" }, { label: "To issue", value: c.toGo, tone: "bad" }] },
    lines: lines.slice(0, 3),
  };
}
