import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "@/config/brand";
import { projectCosts } from "@/data/figures";
import { buildSeed } from "@/data/seed";
import { invoiceNo } from "@/lib/billing";
import { ASK_LIMITS } from "./tools";
import { buildSnapshot } from "./snapshot";

// The seed for Sunday 15 Nov 2026: the demo's day is Friday 13 Nov.
const seed = buildSeed("2026-11-15", { emailDomain: DEFAULT_BRAND.emailDomain, vatPct: 13.5, region: "IE" });
const text = buildSnapshot(seed.db, seed.day, DEFAULT_BRAND);
const line = (start: string) => text.split("\n").find((l) => l.startsWith(start)) ?? "";

describe("the summary of the firm Ask AI is given", () => {
  it("is the same text every time for the same records, so it can be cached", () => {
    expect(buildSnapshot(seed.db, seed.day, DEFAULT_BRAND)).toBe(text);
  });

  it("fits the server's size limit with room to spare", () => {
    expect(text.length).toBeLessThan(ASK_LIMITS.snapshot / 2);
  });

  it("states the demo's day, the money and the person asking", () => {
    expect(text).toContain("Today is Friday 13 November 2026 (2026-11-13)");
    expect(text).toContain("Money is in euro (€)");
    expect(text).toContain("Aidan King, managing director");
  });

  it("gives the late invoices with days late worked out, as the Invoiced screen counts them", () => {
    const issued = seed.db.salesInvoices.filter((i) => i.status === "Invoiced");
    const late = issued.filter((i) => i.dueOn! < seed.day);
    expect(late.length).toBeGreaterThan(0);
    expect(issued.length).toBeGreaterThan(late.length);
    for (const i of issued) {
      const d = Math.round((Date.parse(i.dueOn!) - Date.parse(seed.day)) / 864e5);
      expect(line(`${invoiceNo(i)} `)).toContain(d < 0 ? `${-d} day${d === -1 ? "" : "s"} late` : d === 0 ? "due today" : `due in ${d} day${d === 1 ? "" : "s"}`);
    }
    const gross = late.reduce((s, i) => s + i.net * (1 + i.vatPct / 100), 0);
    expect(text).toContain(`${late.length} invoices past their due date worth ${Math.round(gross)} gross`);
  });

  it("gives each project the same cost and margin as the Job costs screen", () => {
    for (const code of ["C719", "C720", "C725"]) {
      const p = seed.db.projects.find((x) => x.code === code)!;
      const c = projectCosts(seed.db, p);
      expect(line(`${code} `)).toContain(`| ${Math.round(c.cost)} | ${c.margin!.toFixed(1)}% |`);
    }
  });

  it("counts the operatives with free days next week, so an answer never has to", () => {
    expect(text).toContain("Operatives with free days next week: 5: ");
    for (const n of ["Piotr Zieliński", "Adrian Stoica", "Rafael Mendonça", "Darius Kazlauskas", "Krzysztof Nowicki"]) expect(line("Operatives with free days next week")).toContain(n);
  });

  it("lists who is planned where next week, and who is free", () => {
    expect(line("Marek Wiśniewski: next week")).toContain("C719 Mon-Fri");
    expect(line("Piotr Zieliński: next week")).toContain("free Mon, Tue, Wed, Thu, Fri");
  });

  it("lists every screen it may link to, and the links to one record", () => {
    for (const path of ["/invoicing/invoiced", "/dashboard", "/admin", "/compliance/personnel", "/compliance/machinery", "/projects/C719", "/inbox?mail=mail-1", "/dashboard?open=ap-1"]) expect(text).toContain(`${path} |`);
  });

  it("includes pay rates and margins, which only the managing director may ask about", () => {
    expect(text).toContain("hourly rate");
    expect(text).toContain("margin so far");
  });

  it("knows what is waiting in To be sorted and what the firm pays for this system", () => {
    expect(line("To be sorted: 7")).toContain("Scaffold handover certificate.pdf");
    expect(text).toContain("What the firm pays Vardil for this system (Admin, Billing): Monthly plan, 59.00 per person with a sign-in a month");
    // Friday 13 Nov: the three months before November, the newest first.
    expect(text).toMatch(/VD-2610 \| 2026-10 \| 2026-11-02 \| 13 \| 767\.00 \| paid 2026-11-05/);
    expect(text).toContain("Next invoice 2026-12-01 for 2026-11: 13 people, 767.00");
  });

  it("never contains em or en dashes", () => {
    expect(/[–—]/.test(text)).toBe(false);
  });
});
