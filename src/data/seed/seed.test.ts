import { describe, expect, it } from "vitest";
import { findDateConflicts } from "@/lib/conflicts";
import { freeDays, personWeek } from "@/lib/availability";
import { isWeekend } from "@/lib/dates";
import { quoteTotal } from "@/lib/quotes";
import { nextWorkWeek } from "@/lib/week";
import { projectCosts } from "../figures";
import { buildSeed, demoDay } from "./index";

const { day, db } = buildSeed("2026-11-13");

describe("sample data", () => {
  it("is identical every time it is built for the same day", () => {
    expect(JSON.stringify(buildSeed("2026-11-13").db)).toBe(JSON.stringify(db));
  });

  it("treats a weekend as the Friday before, so site screens are never empty", () => {
    expect(demoDay("2026-11-14")).toBe("2026-11-13");
    expect(demoDay("2026-11-15")).toBe("2026-11-13");
    expect(isWeekend(day)).toBe(false);
  });

  it("has unique ids in every table", () => {
    for (const [table, rows] of Object.entries(db)) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      expect(new Set(ids).size, table).toBe(ids.length);
    }
  });

  it("only links to records that exist", () => {
    const has = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
    const people = has(db.people), projects = has(db.projects), clients = has(db.clients), quotes = has(db.quotes);
    for (const p of db.projects) {
      expect(clients.has(p.clientId), p.code).toBe(true);
      expect(people.has(p.siteManagerId) && people.has(p.contractsManagerId), p.code).toBe(true);
      if (p.quoteId) expect(quotes.has(p.quoteId), p.code).toBe(true);
    }
    for (const a of db.attendance) expect(people.has(a.personId) && projects.has(a.projectId)).toBe(true);
    for (const a of db.plan) expect(people.has(a.personId) && projects.has(a.projectId)).toBe(true);
    for (const v of db.variations) expect(people.has(v.raisedById) && projects.has(v.projectId)).toBe(true);
    for (const i of db.salesInvoices) expect(projects.has(i.projectId) && clients.has(i.clientId)).toBe(true);
    for (const s of db.supplierInvoices) for (const al of s.allocations) expect(projects.has(al.projectId)).toBe(true);
    for (const m of db.mails) expect(people.has(m.routedToId)).toBe(true);
    for (const h of db.hiredPlant) expect(projects.has(h.projectId)).toBe(true);
    for (const v of db.vehicles) if (v.driverId) expect(people.has(v.driverId)).toBe(true);
  });

  it("never records attendance or plans work at a weekend", () => {
    expect(db.attendance.some((a) => isWeekend(a.date))).toBe(false);
    expect(db.plan.some((p) => isWeekend(p.date))).toBe(false);
  });

  it("never plans someone on approved leave", () => {
    const approved = db.holidays.filter((h) => h.status === "Approved");
    for (const p of db.plan) expect(approved.some((h) => h.personId === p.personId && p.date >= h.from && p.date <= h.to)).toBe(false);
  });

  it("contains exactly one deliberate double booking for the clash warning", () => {
    const clashes = findDateConflicts(db.plan.map((p) => ({ site_id: p.projectId, employee_id: p.personId, work_date: p.date })));
    expect(clashes.size).toBe(1);
  });

  it("leaves a few operatives with free days next week, so the roster has people still to place", () => {
    const week = nextWorkWeek(day);
    const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
    const free = db.people
      .filter((p) => p.active && p.kind === "Operative")
      .map((p) => freeDays(personWeek(db.plan, db.holidays, live, p.id, week)).length)
      .filter((n) => n > 0);
    expect(free.filter((n) => n === 5).length).toBe(3);
    expect(free.filter((n) => n < 5).length).toBe(2);
  });

  it("starts with two people whose access already differs from their level", () => {
    expect(db.personAccess.map((a) => a.id).sort()).toEqual(["p-hs", "p-yard"]);
    expect(db.people.filter((p) => p.kind === "Management").every((p) => p.level)).toBe(true);
    expect(db.people.filter((p) => p.kind === "Operative").some((p) => p.level)).toBe(false);
  });

  it("prices every won project from its quote, plus the extras agreed since", () => {
    for (const p of db.projects.filter((x) => x.quoteId)) {
      const q = db.quotes.find((x) => x.id === p.quoteId)!;
      const agreed = db.variations.filter((v) => v.projectId === p.id && v.status === "Approved").reduce((s, v) => s + v.estimatedValue, 0);
      expect(p.value, p.code).toBeCloseTo(quoteTotal(q.lines) + agreed, 2);
      expect(q.status).toBe("Accepted");
    }
  });

  it("holds the final account of every finished project with extras or snagging open", () => {
    for (const p of db.projects.filter((x) => x.invoiceHold && x.status === "Complete")) {
      expect(db.salesInvoices.some((i) => i.projectId === p.id && i.status === "Held"), p.code).toBe(true);
    }
  });

  it("holds the invoices of every project with extras raised and not agreed, and puts each in Approvals", () => {
    for (const v of db.variations.filter((x) => x.status === "Draft")) {
      const p = db.projects.find((x) => x.id === v.projectId)!;
      expect(p.invoiceHold && p.extrasFlag, p.code).toBe(true);
      expect(db.approvals.some((a) => a.variationId === v.id && a.status === "Pending"), p.code).toBe(true);
    }
  });

  it("dates business events on working days, and nothing that has happened after today", () => {
    for (const real of ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]) {
      const { day: today, db: d } = buildSeed(real);
      const events = [
        ...d.quotes.flatMap((q) => [q.sentAt]),
        ...d.enquiries.map((e) => e.receivedAt),
        ...d.salesInvoices.flatMap((i) => [i.issuedOn, i.paidOn, i.exportedAt]),
        ...d.projects.flatMap((p) => [p.startDate, p.endDate, p.handoverSentAt, ...p.audit.map((a) => a.at)]),
        ...d.scopeTasks.map((t) => t.completedAt),
        ...d.supplierInvoices.map((s) => s.invoiceDate),
      ].filter((x): x is string => !!x);
      for (const e of events) expect(isWeekend(e.slice(0, 10)), `${real}: ${e}`).toBe(false);
      const past = [
        ...d.projects.flatMap((p) => [p.completedAt, p.handoverSentAt, ...p.audit.map((a) => a.at)]),
        ...d.scopeTasks.map((t) => t.completedAt),
        ...d.scopeGroups.map((g) => g.date),
        ...d.quotes.flatMap((q) => [q.sentAt, q.openedAt, q.respondedAt, q.chasedAt]),
        ...d.salesInvoices.flatMap((i) => [i.issuedOn, i.paidOn, i.exportedAt]),
        ...d.supplierInvoices.flatMap((s) => [s.invoiceDate, s.receivedAt, s.confirmedAt]),
        ...d.files.map((f) => f.modified),
        ...d.mails.map((m) => m.receivedAt),
        ...d.activity.map((a) => a.at),
        ...d.approvals.flatMap((a) => [a.createdAt, a.resolvedAt]),
        ...d.fleetDocs.filter((f) => f.category === "repairs").map((f) => f.date),
      ].filter((x): x is string => !!x);
      for (const e of past) expect(e.slice(0, 10) <= today, `${real}: ${e}`).toBe(true);
    }
  });

  it("finishes a project's scope inside its own dates, and only times people on one site a day", () => {
    for (const p of db.projects) {
      for (const t of db.scopeTasks.filter((x) => x.projectId === p.id && x.completedAt)) {
        expect(t.completedAt!.slice(0, 10) >= p.startDate, p.code).toBe(true);
        if (p.status !== "Live") expect(t.completedAt!.slice(0, 10) <= p.endDate, p.code).toBe(true);
      }
    }
    const seen = new Set<string>();
    for (const a of db.attendance) {
      const p = db.projects.find((x) => x.id === a.projectId)!;
      expect(a.date >= p.startDate && a.date <= p.endDate, `${p.code} ${a.date}`).toBe(true);
      expect(seen.has(`${a.personId} ${a.date}`), `${a.personId} ${a.date}`).toBe(false);
      seen.add(`${a.personId} ${a.date}`);
    }
  });

  it("gives every client's invoices that client's payment terms", () => {
    for (const i of db.salesInvoices.filter((x) => x.issuedOn)) {
      const terms = db.clients.find((c) => c.id === i.clientId)!.termsDays;
      expect(Math.round((Date.parse(i.dueOn!) - Date.parse(i.issuedOn!)) / 864e5), i.ref).toBe(terms);
    }
  });

  it("makes margins that look like a real firm's: every started job between 0% and 35%", () => {
    for (const p of db.projects.filter((x) => x.status !== "Not started")) {
      const m = projectCosts(db, p).margin;
      expect(m, p.code).not.toBeNull();
      expect(m!, p.code).toBeGreaterThan(0);
      expect(m!, p.code).toBeLessThan(35);
    }
  });

  it("contains no em or en dashes in any text", () => {
    expect(/[\u2013\u2014]/.test(JSON.stringify(db))).toBe(false);
  });
});

describe("UK version of the sample data", () => {
  const uk = buildSeed("2026-11-13", { region: "UK", vatPct: 20 }).db;
  it("swaps every county for a UK one and leaves the structure alone", () => {
    const irish = ["Roscommon", "Galway", "Donegal", "Kildare", "Dublin", "Clare", "Cavan", "Waterford", "Mayo", "Wicklow", "Kerry", "Wexford"];
    expect(uk.projects.some((p) => irish.includes(p.county))).toBe(false);
    expect(uk.projects.find((p) => p.code === "C720")?.county).toBe("Cumbria");
    expect(uk.projects.map((p) => p.code)).toEqual(db.projects.map((p) => p.code));
    expect(uk.plan.length).toBe(db.plan.length);
  });
  it("gives vehicles UK-style plates, unique, and keeps their documents attached", () => {
    expect(uk.vehicles.every((v) => /^[A-Z]{2}\d{2} [A-Z]{3}$/.test(v.reg))).toBe(true);
    expect(new Set(uk.vehicles.map((v) => v.reg)).size).toBe(uk.vehicles.length);
    expect(uk.fleetDocs.length).toBe(db.fleetDocs.length);
  });
  it("turns phone numbers into UK-shaped ones", () => {
    expect(uk.people.every((p) => /^07\d{3} \d{6}$/.test(p.phone))).toBe(true);
  });
  it("charges VAT at the UK rate on sales invoices", () => {
    expect(uk.salesInvoices.every((i) => i.vatPct === 20)).toBe(true);
  });
});
