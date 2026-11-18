import { describe, expect, it } from "vitest";
import { projectCosts } from "@/data/figures";
import { buildSeed } from "@/data/seed";
import type { Quote, SalesInvoice } from "@/data/types";
import { conversionByKind, csvOf, customerFigures, customerTimeline, finishedInYear, inYear, jobRow, MONEY_HEADINGS, onTime, overdueFromClients, paidInYear, salesByCustomer, salesInYear, sortJobs, tenderWinRate, topByMargin, totals, whereMoneyGoes, yearStart } from "./reports";

const { db, day } = buildSeed("2026-11-18");
const q = (status: Quote["status"], respondedAt: string | undefined, rate: number, kind?: string): Quote => ({ id: `q-${Math.random()}`, ref: "Q-1", clientId: "c-01", title: "t", status, lines: [{ id: "l", description: "d", unit: "item", qty: 1, rate }], costing: { labour: [], materials: [], plant: [], subcontract: 0, prelims: 0 }, respondedAt, validDays: 60, drafted: false, kind });

describe("the last 12 months", () => {
  it("runs from the day after this date last year to today", () => {
    expect(yearStart("2026-11-18")).toBe("2025-11-19");
    expect([inYear("2025-11-18", "2026-11-18"), inYear("2025-11-19T08:00:00", "2026-11-18"), inYear("2026-11-18", "2026-11-18"), inYear("2026-11-19", "2026-11-18"), inYear(undefined, "2026-11-18")]).toEqual([false, true, true, false, false]);
  });
});

describe("tender win rate", () => {
  it("counts won out of decided in the last 12 months, by number, with the value won", () => {
    const list = [q("Accepted", "2026-06-01T11:00", 50000), q("Declined", "2026-05-01T11:00", 90000), q("Declined", "2026-02-01T11:00", 10000), q("Accepted", "2025-10-01T11:00", 70000), q("Sent", undefined, 30000), q("Queried", "2026-11-17T15:00", 20000)];
    expect(tenderWinRate(list, "2026-11-18")).toEqual({ won: 1, decided: 3, pct: 33.3, valueWon: 50000 });
  });
  it("splits by kind of work, best first, with tenders that name none under Other work", () => {
    const list = [q("Accepted", "2026-06-01", 1, "Roof re-slating"), q("Declined", "2026-06-01", 1, "Roof re-slating"), q("Accepted", "2026-06-01", 1, "Lime repointing"), q("Declined", "2026-06-01", 1)];
    expect(conversionByKind(list, "2026-11-18").map((k) => [k.kind, k.won, k.decided, k.pct])).toEqual([["Lime repointing", 1, 1, 100], ["Roof re-slating", 1, 2, 50], ["Other work", 0, 1, 0]]);
  });
  it("in the sample data: 16 won of 42 decided, and every kind of work has a figure", () => {
    const w = tenderWinRate(db.quotes, day);
    expect([w.won, w.decided, w.pct]).toEqual([16, 42, 38.1]);
    const kinds = conversionByKind(db.quotes, day);
    expect(kinds.length).toBeGreaterThanOrEqual(7);
    expect(kinds.reduce((s, k) => s + k.decided, 0)).toBe(42);
    expect(kinds.some((k) => k.kind === "Other work")).toBe(false);
  });
});

describe("sales", () => {
  const inv = (clientId: string, projectId: string, net: number, issuedOn: string | undefined, status: SalesInvoice["status"] = "Invoiced"): SalesInvoice => ({ id: `i${Math.random()}`, ref: "INV-1", projectId, clientId, description: "x", net, vatPct: 13.5, status, issuedOn });
  it("counts invoices sent or paid in the last 12 months, never drafts or held ones", () => {
    const list = [inv("c-1", "p1", 100, "2026-01-05"), inv("c-1", "p1", 50, "2026-03-05", "Paid"), inv("c-1", "p2", 30, "2025-10-01", "Paid"), inv("c-2", "p3", 999, undefined, "To invoice"), inv("c-2", "p3", 20, "2026-11-01")];
    expect(salesInYear(list, "2026-11-18")).toBe(170);
    const by = salesByCustomer({ salesInvoices: list, clients: [{ id: "c-1", name: "One" }, { id: "c-2", name: "Two" }, { id: "c-3", name: "Three" }] as never }, "2026-11-18");
    expect(by.map((c) => [c.client.name, c.total, c.projects, c.average])).toEqual([["One", 150, 1, 150], ["Two", 20, 1, 20]]);
  });
  it("in the sample data, the customers' totals add up to the year's sales", () => {
    const by = salesByCustomer(db, day);
    expect(Math.round(by.reduce((s, c) => s + c.total, 0) * 100) / 100).toBe(salesInYear(db.salesInvoices, day));
    expect(by.length).toBeGreaterThanOrEqual(10);
    expect(by.map((c) => c.total)).toEqual([...by.map((c) => c.total)].sort((a, b) => b - a));
  });
  it("overdue from clients is what the late squares on Client invoices add up to", () => {
    const o = overdueFromClients(db.salesInvoices, day);
    expect(o.count).toBe(2);
    expect(Math.round(o.gross)).toBe(160773);
  });
});

describe("jobs", () => {
  it("a job's cost is the Job costs figure, and its margin is of the price", () => {
    const p = db.projects.find((x) => x.code === "C712")!;
    const j = jobRow(db, p);
    expect(j.cost).toBe(Math.round(projectCosts(db, p).cost * 100) / 100);
    expect(j.revenue).toBe(39450);
    expect(j.pct).toBe(Math.round(((39450 - j.cost) / 39450) * 1000) / 10);
    expect(j.paidOn).toBe(db.salesInvoices.find((i) => i.projectId === p.id)!.paidOn);
  });
  it("only jobs paid in full in the last 12 months make the top 10, highest margin share first", () => {
    const top = topByMargin(db, day);
    expect(top).toHaveLength(10);
    expect(top.every((j) => j.project.status === "Closed" && !!j.paidOn && inYear(j.paidOn, day))).toBe(true);
    expect(top.map((j) => j.pct)).toEqual([...top.map((j) => j.pct)].sort((a, b) => b - a));
    expect(paidInYear(db, day)).toHaveLength(15);
    // Invoiced but unpaid, or finished and not invoiced, never counts.
    expect(top.some((j) => ["C711", "C713", "C714"].includes(j.project.code))).toBe(false);
  });
  it("the gross margin page has every job finished in the last 12 months", () => {
    const jobs = finishedInYear(db, day);
    expect(jobs.map((j) => j.project.code).sort()).toEqual(["C697", "C698", "C699", "C700", "C701", "C702", "C703", "C704", "C705", "C706", "C707", "C708", "C709", "C710", "C711", "C712", "C713", "C714", "C715", "C716", "C717"]);
    const t = totals(jobs);
    expect(t.margin).toBe(Math.round((t.revenue - t.cost) * 100) / 100);
    expect(t.losing).toBe(0);
    expect(t.pct).toBeGreaterThan(15);
    expect(t.pct).toBeLessThan(25);
  });
  it("counts the jobs that ran past their planned finish", () => {
    const o = onTime(finishedInYear(db, day));
    expect([o.onTime, o.jobs]).toEqual([14, 21]);
    expect(o.pct).toBe(66.7);
  });
  it("sorts by margin share, margin, revenue or newest", () => {
    const jobs = finishedInYear(db, day);
    expect(sortJobs(jobs, "pct")[0]!.project.code).toBe("C700");
    expect(sortJobs(jobs, "revenue")[0]!.project.code).toBe("C711");
    expect(sortJobs(jobs, "finished")[0]!.project.code).toBe("C717");
  });
});

describe("where the money goes", () => {
  it("adds up labour from the year's timesheets and the year's approved invoices, by heading", () => {
    const m = whereMoneyGoes(db, day);
    expect(m.rows.map((r) => r.heading).sort()).toEqual([...MONEY_HEADINGS].sort());
    expect(m.rows.map((r) => r.amount)).toEqual([...m.rows.map((r) => r.amount)].sort((a, b) => b - a));
    expect(Math.round(m.rows.reduce((s, r) => s + r.amount, 0) * 100) / 100).toBe(m.total);
    expect(Math.round(m.rows.reduce((s, r) => s + r.pct, 0))).toBe(100);
    expect(m.rows[0]!.pct).toBeGreaterThan(40);
    expect(m.rows.every((r) => r.amount > 0)).toBe(true);
  });
  it("leaves out invoices not approved yet, and takes a credit note off", () => {
    const base = { attendance: [], people: [] };
    const s = (over: object) => ({ id: "s", supplier: "x", invoiceNo: "1", invoiceDate: "2026-06-01", docType: "invoice", subtotal: 100, vat: 23, total: 123, jobRef: null, fileName: "", receivedAt: "2026-06-02T08:00", readStatus: "confirmed", lines: [], allocations: [{ id: "a", projectId: "p", category: "material", amount: 100, description: "" }], ...over }) as never;
    const m = whereMoneyGoes({ ...base, supplierInvoices: [s({}), s({ readStatus: "needs_review" }), s({ docType: "credit_note", allocations: [{ id: "b", projectId: "p", category: "material", amount: 30, description: "" }] }), s({ invoiceDate: "2025-01-01" })] }, "2026-11-18");
    expect(m.rows.find((r) => r.heading === "Materials")!.amount).toBe(70);
    expect(m.total).toBe(70);
  });
});

describe("a customer's page", () => {
  it("has the year's sales, what is owed, live jobs and the margin on their paid jobs", () => {
    const f = customerFigures(db, "c-02", day);
    expect(f.sales).toBe(salesByCustomer(db, day).find((c) => c.client.id === "c-02")!.total);
    expect(f.live).toBe(1);
    expect(f.paidJobs).toBe(2);
    expect(f.margin).not.toBeNull();
    expect(customerFigures(db, "c-12", day).live).toBe(0);
  });
  it("lists what happened lately, newest first, each linked to its screen", () => {
    const t = customerTimeline(db, "c-02", day);
    expect(t).toHaveLength(6);
    expect(t.map((h) => h.at)).toEqual([...t.map((h) => h.at)].sort().reverse());
    expect(t.every((h) => h.to.startsWith("/"))).toBe(true);
  });
});

describe("files", () => {
  it("writes a heading row then one row per line, quoting commas", () => {
    expect(csvOf(["Customer", "Sales"], [["Ardmullen, Estate", 12.5]])).toBe('Customer,Sales\r\n"Ardmullen, Estate",12.5\r\n');
  });
});
