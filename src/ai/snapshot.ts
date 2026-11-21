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
import { hireEstimate } from "@/lib/job-costs";
import { partyOf, payBy, PURCHASE_LABEL, purchaseStage } from "@/lib/purchases";
import { REGION, r2 } from "@/lib/money";
import { bookingFor, complianceRows, countRows, courseStage, planBlocks } from "@/lib/compliance";
import { conversionByKind, finishedInYear, onTime, paidInYear, salesByCustomer, salesInYear, tenderWinRate, topByMargin, totals, whereMoneyGoes, yearStart } from "@/lib/reports";
import { EARLY_START_NOTE, overtimeSplit, overtimeText, overtimeTotal } from "@/lib/overtime";
import { currentPlan, invoicePaid, nextInvoice } from "@/lib/subscription";
import { costBreakdown, marginPct, quoteTotal } from "@/lib/quotes";
import { daysBetween, dueState, nextServiceDate } from "@/lib/status";
import { nextWorkWeek, workWeek } from "@/lib/week";
import { ASK_ACTIVITY } from "./tools";
import { PORTAL } from "@/lib/apps";

/** Screens that open one record, so answers can link straight to it. */
export const RECORD_LINKS: [pattern: string, what: string][] = [
  ["/projects/C719", "one project; add ?tab=scope, photos, files, plant, requests, extras, costs or history for a tab"],
  ["/sales/quotes/Q-2601", "one quote"],
  ["/invoicing/client/SI-10404", "one client invoice, by the number it goes by"],
  ["/customers/c-01", "one customer's page; add ?tab=projects, tenders, invoices, emails or files for a tab"],
  ["/inbox?mail=mail-1", "one email in the Inbox"],
  ["/dashboard?open=ap-1", "one draft in Approvals, opened on the overview"],
  ["/people?person=p-101", "one person"],
  ["/plant?item=pl-MX1", "one item of own plant"],
  ["/fleet/vehicles/v-1", "one vehicle"],
  ["/fleet/invoices/ginv-1", "one garage invoice"],
  ["/fleet/garages/g-01", "one garage"],
  ["/fleet/damage?report=dmg-1", "one damage report"],
  ["/fleet/drivers?driver=p-sm1", "one driver and their licences"],
  ["/compliance/personnel?person=p-124", "one person's training tickets in Compliance"],
  ["/compliance/subcontractors?sub=sub-1", "one subcontractor's papers in Compliance"],
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

  // Reports (added 18 Nov): the same figures as the Reports screens, worked out by the same rules.
  const win = tenderWinRate(db.quotes, today);
  const doneJobs = finishedInYear(db, today);
  const paidJobs = paidInYear(db, today);
  const timely = onTime(doneJobs);
  const spent = whereMoneyGoes(db, today);
  out.push(
    [
      `## Reports, last 12 months (${yearStart(today)} to ${today}), as on the Reports screens`,
      `Tender win rate ${win.pct}%: ${win.won} won of ${win.decided} decided, ${n0(win.valueWon)} won. Sales invoiced ${n0(salesInYear(db.salesInvoices, today))} before VAT. Average margin on the ${paidJobs.length} jobs paid in full ${totals(paidJobs).pct}%. Jobs finished on time ${timely.pct}% (${timely.onTime} of ${timely.jobs}).`,
      `Tender win rate by kind of work: ${conversionByKind(db.quotes, today).map((k) => `${k.kind} ${k.pct}% (${k.won} of ${k.decided})`).join("; ")}.`,
      `Sales by customer: ${salesByCustomer(db, today).map((c) => `${c.client.name} ${n0(c.total)} from ${c.projects} projects`).join("; ")}.`,
      `Most profitable jobs paid in full: ${topByMargin(db, today).map((j) => `${j.project.code} ${j.project.name} ${j.pct}% (price ${n0(j.revenue)}, cost ${n0(j.cost)}, margin ${n0(j.margin)})`).join("; ")}.`,
      `Where the money goes, ${n0(spent.total)} of job costs: ${spent.rows.map((r) => `${r.heading} ${n0(r.amount)} (${r.pct}%)`).join("; ")}.`,
      `Gross margin on the ${doneJobs.length} jobs finished: revenue ${n0(totals(doneJobs).revenue)}, cost ${n0(totals(doneJobs).cost)}, margin ${n0(totals(doneJobs).margin)} (${totals(doneJobs).pct}%).`,
    ].join("\n"),
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
      `Sales: ${k.sales.enquiriesToQuote} enquiries to quote; ${k.sales.quotesOut} quotes out with no answer yet; ${k.sales.dueAChase} of them due a chase (sent a week or more ago, not chased this week); ${k.sales.queried} queried.`,
      `Sites: ${k.sites.live} live; ${k.sites.peopleOnSite} people marked on site today; ${k.sites.timeStampsNotSent} live sites have not sent today's time stamps; ${k.sites.notStarted} projects not started; ${k.sites.openRequests} open site requests.`,
      `Money: ${k.money.toInvoice} ready to invoice worth ${n0(k.money.toInvoiceValue)}; ${k.money.held} held; ${k.money.overdue} invoices past their due date worth ${n0(k.money.overdueValue)} gross; ${k.money.supplierToCheck} supplier invoices for accounts to check; ${k.money.toApprove} supplier and subcontractor invoices waiting for approval; ${k.money.toPay} approved and waiting to be paid worth ${n0(k.money.toPayValue)} gross, ${k.money.toPayLate} of them past their date.`,
      `Compliance: ${k.compliance.certsExpired} training tickets expired; ${k.compliance.certsSoon} expiring within 30 days; ${k.compliance.plantOverdue} plant checks overdue; ${k.compliance.fleetOverdue} vehicle items overdue; ${k.compliance.holidaysPending} holiday requests waiting; ${k.compliance.hiredToReturn} hire returns notified.`,
      `Approvals waiting: ${k.approvalsPending}.`,
    ].join("\n"),
  );

  // Compliance (18 Nov): what stops work, what is due, courses, company and subcontractor papers.
  {
    const rows = complianceRows(db, today, { safetyCard: region.safetyCard, vehicleTest: region.vehicleTest, roadTax: region.roadTax });
    const c = countRows(rows);
    const line = (r: (typeof rows)[number]) => `${r.who} (${r.area}): ${r.item}, ${r.state === "missing" ? "missing" : r.state === "expired" ? `out of date since ${r.due}` : `due ${r.approx ? "about " : ""}${r.due}`}${r.proofNeeded ? ", proof needed" : ""}`;
    const horizon = nextWorkWeek(today)[4]!;
    const blocked = [...planBlocks(db.people, db.plan.filter((e) => e.date >= today && e.date <= horizon))].map(([key, b]) => ({ id: key.split("|")[0]!, date: key.split("|")[1]!, b }));
    const firstBlocked = [...new Set(blocked.map((x) => x.id))].map((id) => {
      const p = db.people.find((x) => x.id === id)!;
      const from = blocked.filter((x) => x.id === id).map((x) => x.date).sort()[0];
      const course = bookingFor(db.courses, id, blocked.find((x) => x.id === id)!.b[0]!.ticket);
      return `${p.name} (${id}) planned from ${from} but ${blocked.find((x) => x.id === id)!.b.map((b) => `${b.ticket} ${b.expires ? `ran out ${b.expires}` : "not held"}`).join(", ")}${course ? `; booked on the course ${course.date}` : ""}`;
    });
    out.push(
      [
        "## Compliance (as on the Compliance screens). A ticket or paper is good through its expiry day.",
        `Rules: nobody with a Safe Pass or trade ticket out of date can be planned or marked on site (trade tickets: scaffolder advanced scaffolding, roofer MEWP, leadworker hot works, stonemason abrasive wheels, site manager site supervisor safety); a week with such a person planned cannot be sent; a machine whose thorough examination, tower inspection, electrical safety test, harness inspection or insurance has run out cannot go to a site; a vehicle without tax, test and insurance may not be driven; scaffolds are inspected every 7 days; a subcontractor's lapsed insurance flags their invoices but does not hold them.`,
        `Figures: ${c.expired} run out or missing, ${c.blocks} stopping work, ${c.due} due within 30 days, ${c.proof} waiting on proof.`,
        `Planned but cannot work: ${firstBlocked.join("; ") || "nobody"}.`,
        `Run out, missing or stopping work (training tickets are in the People table): ${rows.filter((r) => r.area !== "personnel" && (r.state === "expired" || r.state === "missing")).map(line).join("; ")}.`,
        `Due within 30 days (besides tickets): ${rows.filter((r) => r.area !== "personnel" && r.state === "due").map(line).join("; ")}.`,
        `Training courses: ${db.courses.map((x) => `${x.ticket} ${x.date} at ${x.venue}, ${x.bookedIds.length} of ${x.places} booked (${x.bookedIds.map(name).join(", ") || "nobody"}), ${courseStage(x, today)}`).join("; ")}.`,
        `Company papers: ${db.companyPapers.map((x) => `${x.name} ${x.reference}${x.cover ? `, cover ${x.cover}` : ""}, runs to ${x.expires}`).join("; ")}.`,
      ].join("\n"),
    );
  }

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
  out.push(table("Clients", ["id", "name", "type", "contact", "phone", "email", "payment terms", "account ref", ...(PORTAL ? ["portal"] : [])], db.clients.map((c) => [c.id, c.name, c.type, c.contactName, c.contactPhone, c.contactEmail, `${c.termsDays} days`, c.accountRef, ...(PORTAL ? [c.portalEnabled ? "on" : "off"] : [])])));
  const earlierTender = (q: Db["quotes"][number]) => (q.status === "Accepted" || q.status === "Declined") && !!q.respondedAt && q.respondedAt.slice(0, 10) < addDays(today, -120);
  out.push(
    table(
      "Enquiries, the last four months and any still open (older ones are in Quotes, by their tender)",
      ["ref", "received", "source", "client", "contact", "where", "what they want", "status", "quote"],
      db.enquiries.filter((e) => e.receivedAt.slice(0, 10) >= addDays(today, -120) || !e.quoteId || ["Draft", "Sent", "Queried", "Awaiting approval"].includes(db.quotes.find((q) => q.id === e.quoteId)?.status ?? "")).map((e) => [e.ref, `${e.receivedAt.slice(0, 10)} (${rel(e.receivedAt, today)})`, e.source, client.get(e.clientId)?.name ?? "", e.contactName, `${e.location}, ${e.county}`, e.description, e.status, db.quotes.find((q) => q.id === e.quoteId)?.ref ?? "none yet"]),
    ),
  );
  out.push(
    table(
      "Quotes, the last four months and any not yet decided",
      ["ref", "client", "title", "status", "total before VAT", "estimated cost", "margin", "sent", "client answered", "chased", "client's question", "purchase order"],
      db.quotes.filter((q) => !earlierTender(q)).map((q) => {
        const sell = quoteTotal(q.lines);
        const cost = costBreakdown(q.costing).total;
        const m = marginPct(sell, cost);
        const d = (s?: string) => (s ? `${s.slice(0, 10)} (${rel(s, today)})` : "");
        return [q.ref, client.get(q.clientId)?.name ?? "", q.title, q.status, n2(sell), n2(cost), m == null ? "-" : `${m}%`, d(q.sentAt), d(q.respondedAt), d(q.chasedAt), q.query ?? "", q.poNumber ?? ""];
      }),
    ),
  );

  // Tenders decided more than four months ago, in short (merged 19 Nov, to keep the summary inside its size).
  out.push(
    table(
      "Earlier tenders, decided more than four months ago",
      ["ref", "client", "title", "kind of work", "status", "total before VAT", "answered"],
      db.quotes.filter(earlierTender).map((q) => [q.ref, client.get(q.clientId)?.name ?? "", q.title, q.kind ?? "", q.status, n2(quoteTotal(q.lines)), (q.respondedAt ?? "").slice(0, 10)]),
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
      "Late counts days past the due date, as on Invoicing: Unpaid (aged debt). An issued invoice goes by its accounts number (SI-), the one the client has; one not issued yet by our own reference (INV-).",
    ),
  );
  // Older paid ones as one line per supplier, so the summary stays well inside the server's limit.
  // Paid ones from the last two months line by line (merged 19 Nov, to keep the summary inside its size); anything not yet paid, whatever its age.
  const inFull = (x: Db["supplierInvoices"][number]) => x.invoiceDate >= addDays(today, -60) || purchaseStage(x) !== "paid";
  out.push(
    table(
      "Supplier and subcontractor invoices (accounts check each one; it is approved into job costs, then paid by accounts). Every one from the last four months, and any older one not paid yet",
      ["from", "supplier or subcontractor", "number", "date", "type", "net", "gross", "job ref on the paper", "where it stands", "approved by", "to be paid by", "paid on", "costed to"],
      db.supplierInvoices.filter(inFull).map((s) => [s.supplier, partyOf(s), s.invoiceNo, s.invoiceDate, s.docType === "credit_note" ? "credit note" : "invoice", n2(s.subtotal), n2(s.total), s.jobRef ?? "none", `${PURCHASE_LABEL[purchaseStage(s)]}${s.sentBack && purchaseStage(s) === "back" ? `: ${clean(s.sentBack.reason)}` : ""}`, s.confirmedBy ?? "", s.docType === "credit_note" ? "" : payBy(s), s.paidOn ?? "", s.allocations.map((a) => `${code(a.projectId)} ${a.category} ${n2(a.amount)}`).join("; ")]),
    ),
  );
  const older = db.supplierInvoices.filter((x) => !inFull(x));
  const bySupplier = [...new Set(older.map((x) => x.supplier))].sort().map((name) => {
    const mine = older.filter((x) => x.supplier === name);
    const dates = mine.map((x) => x.invoiceDate).sort();
    return [name, mine.length, n2(mine.reduce((t, x) => t + (x.docType === "credit_note" ? -x.subtotal : x.subtotal), 0)), `${dates[0]} to ${dates[dates.length - 1]}`, [...new Set(mine.flatMap((x) => x.allocations.map((a) => code(a.projectId))))].sort().join(" ")];
  });
  out.push(table("Older supplier and subcontractor invoices, all approved and paid, one line per supplier", ["supplier", "invoices", "net in all", "dated", "projects"], bySupplier));
  out.push(
    table(
      "Variations (extra work)",
      ["project", "raised by", "when", "what was found", "measured", "estimated value", "status", "written in"],
      db.variations.map((v) => [code(v.projectId), name(v.raisedById), v.raisedAt.slice(0, 10), v.description, v.measured, n2(v.estimatedValue), v.status, v.originalLanguage ?? "en"]),
    ),
  );
  // Snags (20 Nov): a job's final account is on hold while any of its snags is open.
  out.push(
    table(
      "Snags (a job's final account is on hold while any snag on it is open; Projects, Requests and variations)",
      ["project", "what", "where", "from", "to be fixed by", "added", "status"],
      db.snags.map((x) => [code(x.projectId), x.what, x.where, x.from === "client" ? "the client's list" : "our own walk-round", x.fixBy ?? "nobody yet", x.raisedAt.slice(0, 10), x.status === "Open" ? "open" : `fixed by ${x.fixedBy} ${x.fixedAt?.slice(0, 10)}`]),
    ),
  );
  out.push(table("Site requests (the managing director answers each yes or no in Admin, Requests)", ["project", "kind", "what", "how many", "needed from", "needed to", "asked by", "status", "yes or no"], db.requests.map((r) => [r.projectId ? code(r.projectId) : "general, not for one site", r.kind === "other" ? "something else" : r.kind.replace("_", " "), r.description, r.quantity, r.neededFrom, r.neededTo, r.requestedBy, r.status, r.decision ? `${r.decision.toLowerCase()} by ${r.decidedBy}${r.declineNote ? ` (note: ${r.declineNote})` : ""}` : r.status !== "Open" ? "" : r.heldBy === "site" ? "with the site manager, not yet asked of the office" : "waiting"])));
  out.push(table("Spending requests (Admin, Requests)", ["what", "supplier", "for", "amount ex VAT", "asked by", "asked", "why", "status"], db.spendRequests.map((x) => [x.what, x.supplier, x.projectId ? code(x.projectId) : "the firm", n2(x.amount), name(x.requestedById), x.createdAt.slice(0, 16).replace("T", " "), x.reason, x.status === "Waiting" ? "waiting" : `${x.status.toLowerCase()} by ${x.decidedBy}${x.status === "Approved" ? (x.orderId ? ", ordered" : ", to be ordered by the office") : ""}`])));
  out.push(table("Supplies on order for sites", ["from", "supplier or subcontractor", "project", "what", "ordered", "due", "status"], db.supplies.map((x) => [x.from, x.party, code(x.projectId), x.description, x.orderedOn, `${x.dueOn} (${rel(x.dueOn, today)})`, x.progress ? `${x.status}, ${x.progress}` : x.status])));
  out.push(table(PORTAL ? "Updates from subcontractors and suppliers in the portal" : "Updates from subcontractors and suppliers", ["when", "from", "supplier or subcontractor", "project", "update"], db.portalNotes.map((x) => [x.at.slice(0, 16).replace("T", " "), x.from, x.party, x.projectId ? code(x.projectId) : "", x.text])));

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
  // The last three months line by line, and anything still to check; older ones summed per
  // vehicle and category (merged 19 Nov, to keep the summary inside its size), so the totals
  // still match Fleet's repair spend for any period.
  const garageFrom = addDays(today, -91);
  const garageFull = (i: Db["garageInvoices"][number]) => i.date >= garageFrom || i.status !== "Checked";
  out.push(
    table(
      "Garage invoices (Fleet, Invoices), the last three months and any to check. One line per vehicle; amounts include VAT",
      ["id", "number", "garage", "date", "status", "vehicle", "base", "driver", "site that day", "category", "work", "amount"],
      db.garageInvoices.filter(garageFull).flatMap((i) => i.lines.map((l) => [i.id, i.invoiceNo, garageName(i.garageId), i.date, i.status, reg(l.vehicleId), baseName(l.baseId), name(l.driverId), code(l.siteId), l.category, l.description, n2(l.amount)])),
    ),
  );
  const olderRepairs = new Map<string, { n: number; total: number; from: string; to: string }>();
  for (const i of db.garageInvoices.filter((x) => !garageFull(x))) {
    for (const l of i.lines) {
      const k = reg(l.vehicleId);
      const r = olderRepairs.get(k) ?? { n: 0, total: 0, from: i.date, to: i.date };
      r.n++;
      r.total += l.amount;
      if (i.date < r.from) r.from = i.date;
      if (i.date > r.to) r.to = i.date;
      olderRepairs.set(k, r);
    }
  }
  out.push(
    table(
      "Older garage invoices, all checked, summed per vehicle (amounts include VAT)",
      ["vehicle", "repairs", "first", "last", "total"],
      [...olderRepairs.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, r]) => [k, String(r.n), r.from, r.to, n2(r.total)]),
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
      "Email (shared mailboxes), the last ten weeks. Folder Filed means someone has put it under its tag, out of the Inbox",
      ["id", "folder", "mailbox", "from", "address", "received", "read", "tag", "passed to", "client", "subject", "drafted reply waiting", "text"],
      db.mails.filter((m) => m.receivedAt.slice(0, 10) >= addDays(today, -70)).map((m) => [m.id, m.folder, m.mailbox, m.fromName, m.fromAddress, m.receivedAt.slice(0, 16).replace("T", " "), m.read ? "read" : "unread", m.intent, name(m.routedToId), m.clientId ? (client.get(m.clientId)?.name ?? "") : "", m.subject, m.replyDraft ? `yes: ${m.replyDraft.subject}` : "no", m.body.length > 450 ? `${m.body.slice(0, 450)}...` : m.body]),
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
      `What the firm pays Vardil for this system (Admin, Billing): ${sub.plan}, ${n2(sub.perUser)} per person with a sign-in a month before VAT; site phones ${PORTAL ? "and the client portal " : ""}included. Next invoice ${next.issuedOn} for ${next.month.slice(0, 7)}: ${next.users} people, ${n2(next.amount)}. Past invoices`,
      ["invoice", "month", "issued", "people", "amount ex VAT", "status"],
      db.subscriptionInvoices.map((i) => [i.number, i.month.slice(0, 7), i.issuedOn, i.users, n2(i.amount), invoicePaid(i, today) ? `paid ${i.collectOn}` : `due, taken ${i.collectOn}`]),
    ),
  );
  out.push(table("Automations", ["name", "department", "when", "what it does", "on", "last run", "runs"], db.automations.map((a) => [a.name, a.department, a.when, a.effect, a.enabled ? "on" : "off", a.lastRun ? a.lastRun.slice(0, 16).replace("T", " ") : "never", a.runs])));
  // Ask AI's own questions are left out, so asking does not change this text (and its cache).
  out.push(table("Recent activity (newest first)", ["when", "who", "what", "about"], db.activity.filter((a) => a.what !== ASK_ACTIVITY).slice(0, 25).map((a) => [a.at.slice(0, 16).replace("T", " "), a.who, a.what, a.target])));

  return out.join("\n\n");
}
