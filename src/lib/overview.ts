/**
 * The overview at the top of the dashboard (option B, Aodhan's pick on 16 Nov): up to three
 * things that need a decision, each with one button, then up to four one-line facts.
 *
 * For the managing director the live model writes it (src/ai/overview.ts). This is the same
 * overview worked out from the records by rules: what other roles see, and what the managing
 * director sees whenever the model cannot be reached. Text is in the small markdown Ask AI
 * uses (bold and links), so both versions are shown by the same code.
 */
import type { Db } from "@/data/types";
import { planClashes } from "./availability";
import { invoiceNo } from "./billing";
import { BLOCKING_CHECKS, blockText, bookingFor, planBlocks } from "./compliance";
import { costBreakdown, marginPct, quoteTotal } from "./quotes";
import { lastWeekStart, payrollStage, weekCheck } from "./payroll";
import { toPay } from "./reimbursements";
import { directorQueue } from "./requests";
import { daysBetween } from "./status";
import { nextWorkWeek } from "./week";

export type OverviewButton = { label: string; /** A screen to open. */ to?: string; /** Or a request for Ask AI to carry out. */ ask?: string };
export type OverviewDecision = { text: string; button?: OverviewButton };
export type Overview = { decisions: OverviewDecision[]; facts: string[] };

export type OverviewOptions = {
  money: (n: number) => string;
  seeValues: boolean;
  seeMargins: boolean;
  /** Ask AI is there to draft chasers (the managing director on the hosted demo). */
  canAsk: boolean;
  /** Admin > Requests is theirs to answer. */
  answersRequests: boolean;
  /** They check the week's hours before payroll, or export them (People, Payroll export). Left out, payroll is not mentioned. */
  checksPayroll?: boolean;
  exportsPayroll?: boolean;
};

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
/** "Three invoices", "11 invoices": a number that starts a sentence, in words while it is small. */
const counted = (n: number, one: string, many = `${one}s`) => `${WORDS[n] ?? n} ${n === 1 ? one : many}`;
const weekdayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", timeZone: "UTC" });
/** "Tuesday 24 Nov". */
const dayDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/** How a training ticket reads in a sentence: "advanced scaffolding ticket", "Safe Pass". */
export function ticketWords(name: string) {
  if (name === "Safe Pass") return "Safe Pass";
  const m = /^(.*) ticket, (\w+)$/i.exec(name);
  if (m) return `${m[2]!.toLowerCase()} ${m[1]!.toLowerCase()} ticket`;
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return /ticket/i.test(name) ? lower : `${lower} ticket`;
}

export function recordsOverview(db: Db, today: string, o: OverviewOptions): Overview {
  const decisions: OverviewDecision[] = [];
  const facts: string[] = [];
  const project = (id: string | undefined | null) => db.projects.find((p) => p.id === id);
  const live = db.projects.filter((p) => p.status === "Live");
  const liveIds = new Set(live.map((p) => p.id));

  // 1. A final account held on an extra that is waiting for approval.
  for (const f of db.salesInvoices.filter((i) => i.status === "Held" && i.description === "Final account")) {
    const p = project(f.projectId);
    const a = db.approvals.find((x) => x.kind === "variation" && x.status === "Pending" && x.projectId === f.projectId);
    const v = db.variations.find((x) => x.id === a?.variationId);
    if (!p || !a || !v) continue;
    const what = a.title.replace(/^Variation: /, "").split(",")[0]!.trim();
    decisions.push({
      text: o.seeValues
        ? `Agree the ${o.money(v.estimatedValue)} extra for ${what} at [${p.name}](/projects/${p.code}) to release its ${o.money(f.net)} final account.`
        : `Agree the extra for ${what} at [${p.name}](/projects/${p.code}) to release its final account.`,
      button: { label: "Open the extra", to: `/dashboard?open=${a.id}` },
    });
  }

  // 2. Money owed and late.
  const late = db.salesInvoices
    .filter((i) => i.status === "Invoiced" && i.dueOn && i.dueOn < today)
    .map((i) => ({ i, days: daysBetween(i.dueOn!, today), client: db.clients.find((c) => c.id === i.clientId)?.name ?? "" }))
    .sort((a, b) => b.days - a.days);
  if (late.length) {
    const names = late.slice(0, 2).map((x, n) => `[${x.client}](/invoicing/invoiced), ${x.days} days${n === 0 ? " late" : ""}`);
    const more = late.length > 2 ? `, and ${late.length - 2} more` : "";
    const listed = names.length === 2 && !more ? `${names[0]}, and ${names[1]}` : names.join(", ");
    const total = late.reduce((s, x) => s + x.i.net * (1 + x.i.vatPct / 100), 0);
    const refs = late.map((x) => invoiceNo(x.i));
    decisions.push({
      text: `Chase ${o.seeValues ? `**${o.money(total)}** overdue` : counted(late.length, "overdue invoice").toLowerCase()}: ${listed}${more}.`,
      button: o.canAsk ? { label: late.length > 1 ? "Draft chasers" : "Draft a chaser", ask: `Draft a chaser for ${refs.length > 1 ? `each overdue invoice: ${refs.join(" and ")}` : refs[0]}.` } : { label: "Open the invoices", to: "/invoicing/invoiced" },
    });
  }

  // 3. Someone planned who cannot work (Compliance, 18 Nov): a Safe Pass or trade ticket that
  // has run out by a day they are planned, from today to the end of next week. Soonest first.
  const horizon = nextWorkWeek(today)[4]!;
  const ahead = db.plan.filter((x) => x.date >= today && x.date <= horizon && liveIds.has(x.projectId));
  const blocked = [...planBlocks(db.people, ahead).entries()]
    .map(([k, b]) => ({ personId: k.split("|")[0]!, date: k.split("|")[1]!, b }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = blocked[0];
  if (first) {
    const p = db.people.find((x) => x.id === first.personId)!;
    const sites = [...new Set(ahead.filter((x) => x.personId === p.id && blocked.some((y) => y.personId === p.id && y.date === x.date)).map((x) => project(x.projectId)!.code))].sort().join(" and ");
    const when = first.date === today ? "today" : `from ${dayDate(first.date)}`;
    const course = bookingFor(db.courses, p.id, first.b[0]!.ticket);
    const others = new Set(blocked.map((x) => x.personId)).size - 1;
    decisions.push({
      text: `[${p.name}](/compliance/personnel?person=${p.id}) is planned on ${sites} ${when}, but ${first.b[0]!.expires ? `their ${blockText(first.b[0]!, today)}` : `they have ${blockText(first.b[0]!)}`}. They cannot be marked on site until it is renewed${course ? `; booked on the course on ${dayDate(course.date)}` : ""}.${others > 0 ? ` ${counted(others, "other person", "other people")} too.` : ""}`,
      button: { label: course ? "Open the course" : "Open their tickets", to: course ? "/compliance/courses" : `/compliance/personnel?person=${p.id}` },
    });
  }

  // 4. A machine on a site that may not be used: its examination, test, inspection or insurance ran out.
  const plant = db.plant
    .filter((x) => x.projectId && liveIds.has(x.projectId))
    .flatMap((x) => x.renewals.filter((r) => BLOCKING_CHECKS.has(r.kind) && r.expires < today).map((r) => ({ x, r, days: daysBetween(r.expires, today) })))
    .sort((a, b) => b.days - a.days)[0];
  if (plant) decisions.push({ text: `The [${plant.x.name.charAt(0).toLowerCase()}${plant.x.name.slice(1)}](/plant?item=${plant.x.id}) at ${project(plant.x.projectId)!.code} may not be used: its ${plant.r.kind.toLowerCase()} ran out ${plant.days} days ago.`, button: { label: "Open in Compliance", to: "/compliance/machinery" } });

  // 5. Next week: a double booking, or a project starting with nobody on it.
  const next = nextWorkWeek(today);
  const nextPlan = db.plan.filter((x) => next.includes(x.date));
  const clash = [...planClashes(nextPlan).entries()][0];
  let clashText = "";
  if (clash) {
    const [key, sites] = clash;
    const [personId, date] = key.split("|");
    const who = db.people.find((p) => p.id === personId)?.name ?? "";
    clashText = `${who} is double booked on ${weekdayName(date ?? "")}`;
    if (sites.length > 1) decisions.push({ text: `${clashText}: ${sites.map((id) => project(id)?.code ?? id).join(" and ")}. Next week cannot go to the sites until it is sorted.`, button: { label: "Open next week", to: "/schedule" } });
  }

  // 6. Staff requests for the managing director's yes or no.
  const q = directorQueue(db);
  const waiting = q.leave.length + q.site.length + q.spend.length;
  const parts = [q.leave.length && `${q.leave.length} for leave`, q.site.length && `${q.site.length} from the sites`, q.spend.length && `${q.spend.length} to spend money`].filter(Boolean);
  if (o.answersRequests && waiting) decisions.push({ text: `${counted(waiting, "request")} wait for your yes or no: ${parts.join(", ")}.`, button: { label: "Open requests", to: "/admin" } });

  // Facts, in order of interest.
  const todays = db.attendance.filter((a) => a.date === today && liveIds.has(a.projectId));
  const sentSites = live.filter((p) => todays.some((a) => a.projectId === p.id) && todays.filter((a) => a.projectId === p.id).every((a) => a.sent));
  // How many sites are live and who is on them is already in the line under the date, so this
  // says only what is still to come in: today's time stamps.
  const notSent = live.length - sentSites.length;
  if (live.length)
    facts.push(
      notSent === 0
        ? "Every live site has sent today's time stamps."
        : sentSites.length === 0
          ? "No site has sent today's time stamps yet."
          : sentSites.length === 1
            ? `Only ${sentSites[0]!.name} has sent today's time stamps. ${counted(notSent, "other site")} ${notSent === 1 ? "has" : "have"} not yet.`
            : `${counted(sentSites.length, "site")} have sent today's time stamps, ${notSent} still to come.`,
    );

  // Payroll, for whoever checks or exports it (the call of 17 Nov: the week's hours are a
  // to-do on the dashboard the day before pay day). Last week only: older weeks have gone.
  if (o.checksPayroll || o.exportsPayroll) {
    const week = lastWeekStart(today);
    const stage = payrollStage(week, db.attendance, db.payrollChecks, db.attendanceChanges, db.payrollExports);
    const by = weekCheck(db.payrollChecks, db.attendanceChanges, week).check?.by;
    const claims = toPay(db.expenses).length;
    const also = o.exportsPayroll && claims ? ` ${counted(claims, "approved reimbursement")} ${claims === 1 ? "is" : "are"} [waiting to be paid](/people/reimbursements) too.` : "";
    if (stage === "to-check")
      facts.push(o.checksPayroll ? `Last week's hours are in from every site and [ready for you to check](/people/payroll) before they go to payroll.${also}` : `Last week's hours are [waiting for a manager's check](/people/payroll) before you can export them to payroll.${also}`);
    else if (stage === "to-export") facts.push(o.exportsPayroll ? `Last week's hours were checked by ${by} and are [ready to export to payroll](/people/payroll).${also}` : `Last week's hours are checked and [waiting for the office to export](/people/payroll).`);
    else if (also) facts.push(also.trim());
  }

  if (o.seeMargins) {
    const thin = db.quotes
      .filter((x) => x.status === "Sent" || x.status === "Opened" || x.status === "Queried")
      .map((x) => ({ x, m: marginPct(quoteTotal(x.lines), costBreakdown(x.costing).total) ?? 100 }))
      .filter((y) => y.m < 15)
      .sort((a, b) => a.m - b.m)[0];
    if (thin) facts.push(`[${thin.x.ref}](/sales/quotes/${thin.x.ref}) ${thin.x.title.split(":")[0]} went out at a ${(Math.round(thin.m * 10) / 10).toFixed(1)}% margin${thin.x.status === "Opened" ? " and has been opened" : ""}.`);
  }

  const starting = db.projects.filter((p) => p.status === "Not started" && next.includes(p.startDate) && !nextPlan.some((x) => x.projectId === p.id));
  if (starting.length || clashText) {
    const gap = starting.length ? `Nobody is planned yet on [${starting[0]!.code}](/schedule) next week` : "";
    const both = gap && clashText ? `${gap}, and ${clashText}.` : gap ? `${gap}.` : `${clashText}.`;
    facts.push(both);
  }

  const ready = db.salesInvoices.filter((i) => i.status === "To invoice");
  if (ready.length) facts.push(`${counted(ready.length, "invoice")} ${ready.length === 1 ? "is" : "are"} [ready to go out](/invoicing)${o.seeValues ? `, ${o.money(ready.reduce((s, i) => s + i.net, 0))}` : ""}.`);

  const asked = db.quotes.find((x) => x.status === "Queried");
  if (asked) {
    const c = db.clients.find((x) => x.id === asked.clientId);
    facts.push(`${c?.contactName ?? "A client"} asked about [${asked.ref}](/sales/quotes/${asked.ref}), ${asked.title.split(":")[0]}.`);
  }

  return { decisions: decisions.slice(0, 3), facts: facts.slice(0, 4) };
}

