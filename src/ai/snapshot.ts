/**
 * What Ask AI is told about the firm: a compact, plain-text copy of the sample records.
 *
 * Every figure comes from the same rules the screens use (dashboard numbers, job costs, due
 * dates, hire estimates), worked out here rather than left to the model, so an answer can never
 * disagree with the screen it links to. The text depends only on the records and the demo's
 * day, so it is byte-for-byte the same between questions until something changes, which lets
 * the model provider reuse it from its cache.
 *
 * Only the managing director can use Ask AI (decision 46), so this holds everything the
 * managing director can see, pay rates and margins included.
 */
import { DEPARTMENTS } from "@/app/departments";
import type { Brand } from "@/config/brand";
import { projectCosts } from "@/data/figures";
import { dashboardNumbers } from "@/data/kpis";
import type { Db, Person, Project } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { addDays, fmtLong } from "@/lib/dates";
import { hireEstimate, READ_STATUS } from "@/lib/job-costs";
import { REGION, r2 } from "@/lib/money";
import { EARLY_START_NOTE, overtimeSplit, overtimeText, overtimeTotal } from "@/lib/overtime";
import { currentPlan, invoicePaid, nextInvoice } from "@/lib/subscription";
import { costBreakdown, marginPct, quoteTotal } from "@/lib/quotes";
import { daysBetween, dueState, nextServiceDate } from "@/lib/status";
import { nextWorkWeek, workWeek } from "@/lib/week";
import { ASK_ACTIVITY } from "./tools";

/** Screens that open one record, so answers can link straight to it. */
export const RECORD_LINKS: [pattern: string, what: string][] = [
  ["/projects/C719", "one project; add ?tab=scope, photos, files, plant, requests, extras, costs or history for a tab"],
  ["/sales/quotes/Q-2601", "one quote"],
  ["/sales/clients?client=c-01", "one client"],
  ["/inbox?mail=mail-1", "one email in the Inbox"],
  ["/dashboard?open=ap-1", "one draft in Approvals, opened on the overview"],
  ["/people?person=p-101", "one person"],
  ["/plant?item=pl-MX1", "one item of own plant"],
  ["/fleet/vehicles/v-1", "one vehicle"],
  ["/fleet/invoices/ginv-1", "one garage invoice"],
  ["/fleet/garages/g-01", "one garage"],
  ["/fleet/damage?report=dmg-1", "one damage report"],
  ["/fleet/drivers?driver=p-sm1", "one driver and their licences"],
  ["/files?project=C719", "one project's files in the Files section"],
];

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekday = (d: string) => WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()] ?? "";
const n0 = (n: number) => String(Math.round(n));
const n2 = (n: number) => r2(n).toFixed(2);
const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").replace(/\|/g, "/").trim();

/** "in 8 days", "today", "38 days ago": counted from the demo's day, so the model never has to. */
function rel(date: string | undefined, today: string) {
  if (!date) return "";
  const d = daysBetween(today, date.slice(0, 10));
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

function due(date: string, today: string) {
  const s = dueState(date, today);
  return `${date} (${s === "overdue" ? `expired ${rel(date, today)}` : s === "soon" ? `expires ${rel(date, today)}` : "in date"})`;
}

function table(title: string, head: string[], rows: (string | number)[][], note?: string) {
  const out = [`## ${title}`];
  if (note) out.push(note);
  if (rows.length === 0) {
    out.push("(none)");
    return out.join("\n");
  }
  out.push(head.join(" | "));
  for (const r of rows) out.push(r.map((c) => clean(String(c))).join(" | "));
  return out.join("\n");
}

/** Consecutive days on the same site read as one stretch: "C719 Mon-Fri", "C722 Tue (half)". */
function weekLine(days: string[], cell: (d: string) => string | null) {
  const parts: string[] = [];
  let run: { label: string; from: string; to: string } | null = null;
  for (const d of days) {
    const label = cell(d);
    if (run && label === run.label) {
      run.to = d;
      continue;
    }
    if (run) parts.push(`${run.label} ${weekday(run.from)}${run.to !== run.from ? `-${weekday(run.to)}` : ""}`);
    run = label ? { label, from: d, to: d } : null;
  }
  if (run) parts.push(`${run.label} ${weekday(run.from)}${run.to !== run.from ? `-${weekday(run.to)}` : ""}`);
  return parts.join(", ") || "nothing";
}

export function buildSnapshot(db: Db, today: string, brand: Brand): string {
  const region = REGION[brand.region];
  const person = new Map(db.people.map((p) => [p.id, p]));
  const project = new Map(db.projects.map((p) => [p.id, p]));
  const client = new Map(db.clients.map((c) => [c.id, c]));
  const name = (id: string | null | undefined) => (id ? (person.get(id)?.name ?? "") : "");
  const code = (id: string | null | undefined) => (id ? (project.get(id)?.code ?? "") : "");
  const thisWeek = workWeek(today);
  const nextWeek = nextWorkWeek(today);
  const weekAfter = nextWorkWeek(nextWeek[0] ?? today);
  const money = brand.region === "UK" ? "pounds sterling (£)" : "euro (€)";
  const k = dashboardNumbers(db, today);
  const out: string[] = [];

  out.push(
    `# ${brand.legalName}: the firm's records`,
    `Today is ${fmtLong(today)} (${today}), the demo's working day. This week runs ${thisWeek[0]} to ${thisWeek[4]}; next week ${nextWeek[0]} to ${nextWeek[4]}.`,
    `Region: ${brand.region === "UK" ? "United Kingdom" : "Ireland"}. Money is in ${money}. Amounts are before VAT unless a column says gross. VAT on construction work is ${region.vatPct}%. The basic site safety card is called ${region.safetyCard}; the vehicle test is ${region.vehicleTest}.`,
    "Signed in: Aidan King, managing director. He can see everything, including pay rates, costs and margins.",
    "Dates are written YYYY-MM-DD. Counts of days (in 8 days, 38 days ago, days late) are already worked out from today.",
  );

  // Screens
  const screens: string[] = ["## Screens you can link to (use these paths exactly)"];
  for (const d of DEPARTMENTS)
    for (const g of d.groups)
      for (const i of g.items) {
        screens.push(`${i.to} | ${d.title ?? d.label}: ${i.label}`);
        for (const t of i.tabs ?? []) screens.push(`${t.to} | ${d.title ?? d.label}: ${t.label}`);
      }
  screens.push("Links to one record:");
  for (const [p, what] of RECORD_LINKS) screens.push(`${p} | ${what}`);
  out.push(screens.join("\n"));

  out.push(
    [
      "## Dashboard figures (as on the Dashboard overview)",
      `Sales: ${k.sales.enquiriesToQuote} enquiries to quote; ${k.sales.quotesOut} quotes out (sent or opened); ${k.sales.openedNotAnswered} opened but not answered; ${k.sales.queried} queried.`,
      `Sites: ${k.sites.live} live; ${k.sites.peopleOnSite} people marked on site today; ${k.sites.timeStampsNotSent} live sites have not sent today's time stamps; ${k.sites.notStarted} projects not started; ${k.sites.openRequests} open site requests.`,
      `Money: ${k.money.toInvoice} ready to invoice worth ${n0(k.money.toInvoiceValue)}; ${k.money.held} held; ${k.money.overdue} invoices past their due date worth ${n0(k.money.overdueValue)} gross; ${k.money.supplierToCheck} supplier invoices to check.`,
      `Compliance: ${k.compliance.certsExpired} training tickets expired; ${k.compliance.certsSoon} expiring within 30 days; ${k.compliance.plantOverdue} plant checks overdue; ${k.compliance.fleetOverdue} vehicle items overdue; ${k.compliance.holidaysPending} holiday requests waiting; ${k.compliance.hiredToReturn} hire returns notified.`,
      `Approvals waiting: ${k.approvalsPending}.`,
    ].join("\n"),
  );

  // Projects
  const flags = (p: Project) =>
    [p.invoiceHold && (p.status === "Live" || p.status === "Not started" ? "final account to be held when complete" : "final account held"), p.extrasFlag && "extras to agree", p.snaggingFlag && "snagging open", p.completedAt && `completed ${p.completedAt.slice(0, 10)}`, p.handoverSentAt && `handover sent ${p.handoverSentAt.slice(0, 10)}`].filter(Boolean).join(", ");
  out.push(
    table(
      "Projects",
      ["code", "name", "client", "where", "status", "site manager", "contracts manager", "start", "finish", "contract value", "scope done", "value earned", "labour to date", "plant and hire", "materials", "subcontract and other", "cost to date", "margin so far", "invoiced so far", "notes"],
      db.projects.map((p) => {
        const c = projectCosts(db, p);
        return [p.code, p.name, client.get(p.clientId)?.name ?? "", `${p.location}, ${p.county}`, p.status, name(p.siteManagerId), name(p.contractsManagerId), p.startDate, `${p.endDate} (${rel(p.endDate, today)})`, p.value == null ? "not priced" : n0(p.value), `${c.pct}%`, n0(c.earned), n0(c.labour), n0(c.plant), n0(c.material), n0(c.other), n0(c.cost), c.margin == null ? "-" : `${c.margin.toFixed(1)}%`, n0(c.invoiced), [flags(p), c.waiting ? `${c.waiting} supplier invoice(s) not checked yet, so not counted` : ""].filter(Boolean).join("; ")];
      }),
      "Margin so far = (value earned - cost to date) / value earned. Value earned = contract value x share of scope done. Labour is from timesheets at each person's rate, overtime at time and a half, or at double time where the timesheet says so; other costs only from checked supplier invoices.",
    ),
  );
  out.push(
    ["## Project descriptions and site instructions", ...db.projects.filter((p) => p.status !== "Closed").map((p) => `${p.code}: ${clean(p.description)} Heritage: ${clean(p.heritage)}. Priced by ${p.pricedBy}. Site instructions: ${clean(p.siteInstructions) || "none"}`)].join("\n"),
  );

  // Scope
  const scope: string[] = ["## Scope checklists (live, not started and recently completed projects)"];
  for (const p of db.projects.filter((x) => x.status === "Live" || x.status === "Not started" || x.status === "Complete")) {
    const tasks = db.scopeTasks.filter((t) => t.projectId === p.id);
    scope.push(`${p.code} ${p.name}: ${tasks.filter((t) => t.done).length} of ${tasks.length} done`);
    for (const t of tasks) scope.push(`- ${t.done ? `done ${t.completedAt?.slice(0, 10) ?? ""}${t.completedBy ? ` by ${t.completedBy}` : ""}` : "to do"}: ${clean(t.description)}${t.notes ? ` (${clean(t.notes)})` : ""}`);
  }
  out.push(scope.join("\n"));

  // Crews and today
  const crew: string[] = ["## Crews (on each live site's list) and today's time stamps"];
  for (const p of db.projects.filter((x) => x.status === "Live")) {
    const today_ = db.attendance.filter((a) => a.projectId === p.id && a.date === today);
    const sent = today_.length > 0 && today_.every((a) => a.sent);
    crew.push(`${p.code} ${p.name}: today ${today_.length === 0 ? "not marked yet" : sent ? "marked and sent" : "marked, not sent"}`);
    for (const a of db.assignments.filter((x) => x.projectId === p.id)) {
      const pe = person.get(a.personId);
      const t = today_.find((x) => x.personId === a.personId);
      crew.push(`- ${pe?.name ?? ""}, ${pe?.trade ?? ""}: ${t ? `${t.status} day${overtimeTotal(t) ? ` + overtime ${overtimeText(t)}` : ""}` : "not marked today"}`);
    }
  }
  out.push(crew.join("\n"));

  // People
  const tickets = (p: Person) => p.certs.map((c) => `${c.name} ${dueState(c.expires, today) === "ok" ? c.expires : due(c.expires, today)}${c.proofNeeded ? ", proof needed" : ""}`).join("; ");
  out.push(
    table(
      "People",
      ["id", "name", "job or trade", "kind", "access level", "phone", "email", "hourly rate", "rate since", "language", "status", "training tickets (expiry date; in date unless it says otherwise)"],
      db.people.map((p) => [p.id, p.name, p.trade, p.kind, p.level ?? "", p.phone, p.email, p.hourlyRate ? n2(p.hourlyRate) : "salaried", p.rateAsOf, p.language, p.active ? "active" : `archived ${p.archivedAt ?? ""}`, tickets(p)]),
    ),
  );

  // Attendance
  const month = today.slice(0, 7);
  const lastMonthDate = addDays(`${month}-01`, -1).slice(0, 7);
  const att: string[] = ["## Attendance (time stamps)", `This week (${thisWeek[0]} to ${thisWeek[4]}) day by day, then days and overtime hours this month (${month}) and last month (${lastMonthDate}). Overtime hours are written with their rate, x1.5 for time and a half and x2 for double time, and a day can have both. The firm's rule: time and a half on a weekday after a normal day's hours up to midnight and on Saturday from 8am to 12 noon; double time after midnight when the work carries on from the day before, on Saturday after 12 noon, on Sunday and on bank holidays. ${EARLY_START_NOTE} Weekend and bank holiday work is a time stamp with no normal day in it: every hour is overtime. Bank holidays: ${db.bankHolidays.filter((h) => h.date.startsWith(today.slice(0, 4))).map((h) => `${h.date} ${h.name}`).join(", ")}.`];
  for (const p of db.people.filter((x) => db.attendance.some((a) => a.personId === x.id))) {
    const mine = db.attendance.filter((a) => a.personId === p.id);
    const week = weekLine(thisWeek, (d) => {
      const a = mine.find((x) => x.date === d);
      return a ? `${code(a.projectId)} ${a.status === "restday" ? "bank holiday work" : a.status}${overtimeTotal(a) ? ` + ${overtimeText(a)}` : ""}` : null;
    });
    const sum = (ym: string) => {
      const rows = mine.filter((a) => a.date.startsWith(ym));
      const days = rows.reduce((s, a) => s + (a.status === "full" ? 1 : a.status === "half" ? 0.5 : 0), 0);
      const ot = rows.reduce((s, a) => s + overtimeTotal(a), 0);
      const dbl = overtimeSplit(rows).double;
      const rest = rows.filter((a) => a.status === "restday");
      return `${days} days${ot ? `, ${ot}h overtime${dbl ? ` (${dbl}h of it at double time)` : ""}` : ""}${rest.length ? `, weekend or bank holiday work: ${rest.map((a) => `${a.date} ${code(a.projectId)} ${overtimeText(a)}`).join(", ")}` : ""}`;
    };
    att.push(`${p.name}: this week ${week}; ${month} ${sum(month)}; ${lastMonthDate} ${sum(lastMonthDate)}`);
  }
  if (db.attendanceChanges.length) {
    att.push("Corrections to earlier days:");
    for (const c of db.attendanceChanges) att.push(`- ${name(c.personId)} ${c.date} ${code(c.projectId)}: ${c.from} to ${c.to} by ${c.by}, because ${clean(c.reason)}`);
  }
  out.push(att.join("\n"));

  // Plan
  const plan: string[] = ["## Planned work for operatives (week ahead plan)", `Next week ${nextWeek[0]} to ${nextWeek[4]}, and the week after ${weekAfter[0]} to ${weekAfter[4]}. "free" lists days next week with nothing planned and no leave. Site managers and office staff are not on the plan.`];
  const leaveOn = (pid: string, d: string) => db.holidays.some((h) => h.personId === pid && h.status === "Approved" && h.from <= d && h.to >= d);
  const freeNext: string[] = [];
  for (const p of db.people.filter((x) => x.active && x.kind === "Operative")) {
    const mine = db.plan.filter((e) => e.personId === p.id);
    const cell = (d: string) => {
      if (leaveOn(p.id, d)) return "on leave";
      const es = mine.filter((e) => e.date === d);
      if (es.length === 0) return null;
      return es.map((e) => `${code(e.projectId)}${e.part === "half" ? " (half)" : ""}${e.overtimeHours ? ` (+${e.overtimeHours}h)` : ""}`).join(" and ");
    };
    const free = nextWeek.filter((d) => !cell(d));
    plan.push(`${p.name}: next week ${weekLine(nextWeek, cell)}${free.length ? `; free ${free.map(weekday).join(", ")}` : ""}; week after ${weekLine(weekAfter, cell)}`);
    if (free.length) freeNext.push(`${p.name}, ${p.trade.toLowerCase()} (${free.length === 5 ? "all week" : free.map(weekday).join(", ")})`);
  }
  // Counted here so an answer never has to count them.
  plan.splice(2, 0, `Operatives with free days next week: ${freeNext.length}${freeNext.length ? `: ${freeNext.join("; ")}` : ""}.`);
  out.push(plan.join("\n"));

  out.push(table("Holidays", ["person", "from", "to", "status", "asked by", "note", "why declined"], db.holidays.map((h) => [name(h.personId), h.from, h.to, h.status, h.via, h.note ?? "", h.status === "Declined" ? `${h.declineNote ?? "no note left"}${h.decidedBy ? `, by ${h.decidedBy}` : ""}` : ""])));

  // Sales
  out.push(table("Clients", ["id", "name", "type", "contact", "phone", "email", "payment terms", "account ref", "portal"], db.clients.map((c) => [c.id, c.name, c.type, c.contactName, c.contactPhone, c.contactEmail, `${c.termsDays} days`, c.accountRef, c.portalEnabled ? "on" : "off"])));
  out.push(
    table(
      "Enquiries",
      ["ref", "received", "source", "client", "contact", "where", "what they want", "status", "quote"],
      db.enquiries.map((e) => [e.ref, `${e.receivedAt.slice(0, 10)} (${rel(e.receivedAt, today)})`, e.source, client.get(e.clientId)?.name ?? "", e.contactName, `${e.location}, ${e.county}`, e.description, e.status, db.quotes.find((q) => q.id === e.quoteId)?.ref ?? "none yet"]),
    ),
  );
  out.push(
    table(
      "Quotes",
      ["ref", "client", "title", "status", "total before VAT", "estimated cost", "margin", "sent", "opened", "client answered", "chased", "client's question", "purchase order"],
      db.quotes.map((q) => {
        const sell = quoteTotal(q.lines);
        const cost = costBreakdown(q.costing).total;
        const m = marginPct(sell, cost);
        const d = (s?: string) => (s ? `${s.slice(0, 10)} (${rel(s, today)})` : "");
        return [q.ref, client.get(q.clientId)?.name ?? "", q.title, q.status, n2(sell), n2(cost), m == null ? "-" : `${m}%`, d(q.sentAt), d(q.openedAt), d(q.respondedAt), d(q.chasedAt), q.query ?? "", q.poNumber ?? ""];
      }),
    ),
  );

  // Money
  out.push(
    table(
      "Sales invoices",
      ["invoice", "project", "client", "what for", "status", "net", "gross", "issued", "due", "late", "paid", "held because", "exported to accounts"],
      db.salesInvoices.map((i) => {
        const late = i.status === "Invoiced" && i.dueOn ? daysBetween(i.dueOn, today) : null;
        return [invoiceNo(i), code(i.projectId), client.get(i.clientId)?.name ?? "", i.description, i.status, n2(i.net), n2(i.net * (1 + i.vatPct / 100)), i.issuedOn ?? "", i.dueOn ?? "", late == null ? "" : late > 0 ? `${late} day${late === 1 ? "" : "s"} late` : late === 0 ? "due today" : `due in ${-late} day${late === -1 ? "" : "s"}`, i.paidOn ?? "", i.holdReason ?? "", i.exportedAt ? i.exportedAt.slice(0, 10) : i.status === "Invoiced" || i.status === "Paid" ? "not yet" : ""];
      }),
      "Late counts days past the due date, as on Invoicing: Invoiced (aged debt). An issued invoice goes by its accounts number (SI-), the one the client has; one not issued yet by our own reference (INV-).",
    ),
  );
  out.push(
    table(
      "Supplier invoices",
      ["supplier", "number", "date", "type", "net", "gross", "job ref on the paper", "status", "costed to"],
      db.supplierInvoices.map((s) => [s.supplier, s.invoiceNo, s.invoiceDate, s.docType === "credit_note" ? "credit note" : "invoice", n2(s.subtotal), n2(s.total), s.jobRef ?? "none", READ_STATUS[s.readStatus] ?? s.readStatus, s.allocations.map((a) => `${code(a.projectId)} ${a.category} ${n2(a.amount)}`).join("; ")]),
    ),
  );
  out.push(
    table(
      "Variations (extras)",
      ["project", "raised by", "when", "what was found", "measured", "estimated value", "status", "written in"],
      db.variations.map((v) => [code(v.projectId), name(v.raisedById), v.raisedAt.slice(0, 10), v.description, v.measured, n2(v.estimatedValue), v.status, v.originalLanguage ?? "en"]),
    ),
  );
  out.push(table("Site requests (the managing director answers each yes or no in Admin, Requests)", ["project", "kind", "what", "how many", "needed from", "needed to", "asked by", "status", "yes or no"], db.requests.map((r) => [r.projectId ? code(r.projectId) : "general, not for one site", r.kind === "other" ? "something else" : r.kind.replace("_", " "), r.description, r.quantity, r.neededFrom, r.neededTo, r.requestedBy, r.status, r.decision ? `${r.decision.toLowerCase()} by ${r.decidedBy}${r.declineNote ? ` (note: ${r.declineNote})` : ""}` : r.status !== "Open" ? "" : r.heldBy === "site" ? "with the site manager, not yet asked of the office" : "waiting"])));
  out.push(table("Spending requests (Admin, Requests)", ["what", "supplier", "for", "amount ex VAT", "asked by", "asked", "why", "status"], db.spendRequests.map((x) => [x.what, x.supplier, x.projectId ? code(x.projectId) : "the firm", n2(x.amount), name(x.requestedById), x.createdAt.slice(0, 16).replace("T", " "), x.reason, x.status === "Waiting" ? "waiting" : `${x.status.toLowerCase()} by ${x.decidedBy}`])));
  out.push(table("Supplies on order for sites", ["from", "supplier or subcontractor", "project", "what", "ordered", "due", "status"], db.supplies.map((x) => [x.from, x.party, code(x.projectId), x.description, x.orderedOn, `${x.dueOn} (${rel(x.dueOn, today)})`, x.progress ? `${x.status}, ${x.progress}` : x.status])));
  out.push(table("Updates from subcontractors and suppliers in the portal", ["when", "from", "supplier or subcontractor", "project", "update"], db.portalNotes.map((x) => [x.at.slice(0, 16).replace("T", " "), x.from, x.party, x.projectId ? code(x.projectId) : "", x.text])));

  // Plant and fleet
  out.push(
    table(
      "Own plant",
      ["id", "ref", "name", "kind", "status", "where", "next service", "certificates"],
      db.plant.map((p) => {
        const s = nextServiceDate(p.service, today);
        return [p.id, p.assetRef, p.name, p.kind, p.status, p.projectId ? code(p.projectId) : "yard", `${s.date} (${dueState(s.date, today) === "overdue" ? `overdue, ${rel(s.date, today)}` : rel(s.date, today)}; ${s.remaining})`, p.renewals.map((r) => `${r.kind} ${due(r.expires, today)}`).join("; ")];
      }),
    ),
  );
  out.push(
    table(
      "Hired plant",
      ["project", "what", "quantity", "hire company", "phone", "hire ref", "on hire since", "rate", "status", "cost so far (estimate)"],
      db.hiredPlant.map((h) => {
        const est = hireEstimate(h.rate, h.rateUnit, h.onHireFrom, h.collectedAt?.slice(0, 10), today);
        return [code(h.projectId), h.description, h.quantity, h.hireCompany, h.hirePhone, h.hireRef, h.onHireFrom, `${n2(h.rate)} per ${h.rateUnit}`, `${h.status}${h.returnNotifiedAt ? ` (return notified ${h.returnNotifiedAt.slice(0, 10)})` : ""}${h.collectedAt ? ` (collected ${h.collectedAt.slice(0, 10)})` : ""}`, est ? n2(est.total * h.quantity) : ""];
      }),
    ),
  );
  // Fleet (18 Nov, from the Secure-All build): vehicles, garage invoices with spend by vehicle, base, driver and site, renewals and damage.
  const baseName = (id: string | null) => db.bases.find((b) => b.id === id)?.name ?? "";
  const garageName = (id: string) => db.garages.find((g) => g.id === id)?.name ?? "";
  const reg = (id: string) => db.vehicles.find((v) => v.id === id)?.reg ?? "";
  out.push(
    table(
      "Vehicles (Fleet, Vehicles)",
      ["id", "registration", "make and model", "kind", "used for", "base", "driver", "mileage", "tax", region.vehicleTest, "insurance", "next service", "status"],
      db.vehicles.map((v) => [v.id, v.reg, `${v.make} ${v.model}`, v.kind, v.division, baseName(v.baseId), name(v.driverId) || "pool", v.mileage, due(v.compliance.tax.expiryDate, today), due(v.compliance.test.expiryDate, today), due(v.compliance.insurance.expiryDate, today), nextServiceDate(v.service, today).date, v.active ? "on the fleet" : `removed ${v.removedAt ?? ""}${v.sellPrice != null ? `, sold for ${n0(v.sellPrice)}` : ", not sold"}`]),
    ),
  );
  out.push(
    table(
      "Garage invoices (Fleet, Invoices). One line per vehicle; amounts include VAT",
      ["id", "number", "garage", "date", "status", "vehicle", "base", "driver", "site that day", "category", "work", "amount"],
      db.garageInvoices.flatMap((i) => i.lines.map((l) => [i.id, i.invoiceNo, garageName(i.garageId), i.date, i.status, reg(l.vehicleId), baseName(l.baseId), name(l.driverId), code(l.siteId), l.category, l.description, n2(l.amount)])),
    ),
  );
  out.push(table("Garages", ["id", "name", "town", "county", "phone", "email"], db.garages.map((g) => [g.id, g.name, g.town, g.county, g.phone, g.email])));
  out.push(table("Damage reported from the site phones (Fleet, Damage reported)", ["id", "vehicle", "reported", "by", "where", "what happened", "status"], db.damageReports.map((d) => [d.id, reg(d.vehicleId), d.at.slice(0, 16).replace("T", " "), name(d.driverId), d.where, d.note, d.status])));
  out.push(
    table(
      "Drivers' licences (Fleet, Drivers)",
      ["driver", "driving licence", "Driver CPC", "sent from the phone, to check"],
      db.people.filter((p) => p.drives).map((p) => [p.name, p.licences?.driving ? due(p.licences.driving.expiryDate, today) : "none on file", p.licences?.cpc ? due(p.licences.cpc.expiryDate, today) : "", p.licences?.driving?.fromPhoneAt || p.licences?.cpc?.fromPhoneAt ? "yes" : ""]),
    ),
  );

  // Inbox
  out.push(
    table(
      "Email (shared mailboxes). Folder Filed means someone has put it under its tag, out of the Inbox",
      ["id", "folder", "mailbox", "from", "address", "received", "read", "tag", "passed to", "client", "subject", "drafted reply waiting", "text"],
      db.mails.map((m) => [m.id, m.folder, m.mailbox, m.fromName, m.fromAddress, m.receivedAt.slice(0, 16).replace("T", " "), m.read ? "read" : "unread", m.intent, name(m.routedToId), m.clientId ? (client.get(m.clientId)?.name ?? "") : "", m.subject, m.replyDraft ? `yes: ${m.replyDraft.subject}` : "no", m.body.length > 600 ? `${m.body.slice(0, 600)}...` : m.body]),
    ),
  );

  out.push(table("Approvals waiting", ["id", "kind", "title", "drafted", "why"], db.approvals.filter((a) => a.status === "Pending").map((a) => [a.id, a.kind.replace("_", " "), a.title, a.createdAt.slice(0, 16).replace("T", " "), a.rationale])));

  // Files
  const files: string[] = ["## Files"];
  for (const p of db.projects.filter((x) => db.files.some((f) => f.projectId === x.id))) {
    const mine = db.files.filter((f) => f.projectId === p.id);
    const byCat = new Map<string, number>();
    for (const f of mine) byCat.set(f.category, (byCat.get(f.category) ?? 0) + 1);
    files.push(`${p.code}: ${mine.length} files (${[...byCat].map(([c, n]) => `${c} ${n}`).join(", ")})`);
  }
  const unsorted = db.files.filter((f) => f.projectId === null);
  files.push(`To be sorted: ${unsorted.length}${unsorted.length ? ` (${unsorted.map((f) => `${f.name}, added by ${f.addedBy} ${f.modified}`).join("; ")})` : ""}`);
  out.push(files.join("\n"));

  const sub = currentPlan(db);
  const next = nextInvoice(db, today);
  out.push(
    table(
      `What the firm pays Vardil for this system (Admin, Billing): ${sub.plan}, ${n2(sub.perUser)} per person with a sign-in a month before VAT; site phones and the client portal included. Next invoice ${next.issuedOn} for ${next.month.slice(0, 7)}: ${next.users} people, ${n2(next.amount)}. Past invoices`,
      ["invoice", "month", "issued", "people", "amount ex VAT", "status"],
      db.subscriptionInvoices.map((i) => [i.number, i.month.slice(0, 7), i.issuedOn, i.users, n2(i.amount), invoicePaid(i, today) ? `paid ${i.collectOn}` : `due, taken ${i.collectOn}`]),
    ),
  );
  out.push(table("Automations", ["name", "department", "when", "what it does", "on", "last run", "runs"], db.automations.map((a) => [a.name, a.department, a.when, a.effect, a.enabled ? "on" : "off", a.lastRun ? a.lastRun.slice(0, 16).replace("T", " ") : "never", a.runs])));
  // Ask AI's own questions are left out, so asking does not change this text (and its cache).
  out.push(table("Recent activity (newest first)", ["when", "who", "what", "about"], db.activity.filter((a) => a.what !== ASK_ACTIVITY).slice(0, 25).map((a) => [a.at.slice(0, 16).replace("T", " "), a.who, a.what, a.target])));

  return out.join("\n\n");
}
