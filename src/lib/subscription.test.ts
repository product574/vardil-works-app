import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { billedUsers, collectionDay, invoicePaid, issueDay, monthStart, nextInvoice, PLAN, pastInvoices } from "./subscription";

describe("billing for the system (Admin, Billing)", () => {
  it("works out months, issue days and collection days", () => {
    expect(monthStart("2026-11-16")).toBe("2026-11-01");
    expect(monthStart("2026-11-16", -3)).toBe("2026-08-01");
    expect(monthStart("2026-01-20", -1)).toBe("2025-12-01");
    expect(monthStart("2026-12-03", 1)).toBe("2027-01-01");
    // 1 November 2026 is a Sunday, so October's invoice goes out on Monday 2 November.
    expect(issueDay("2026-10-01")).toBe("2026-11-02");
    expect(issueDay("2026-08-01")).toBe("2026-09-01");
    // Three working days later, over a weekend when there is one.
    expect(collectionDay("2026-11-02")).toBe("2026-11-05");
    expect(collectionDay("2026-10-01")).toBe("2026-10-06");
  });

  it("shows the three months before this one, newest first, priced per person", () => {
    const inv = pastInvoices("2026-11-16", 13, PLAN);
    expect(inv.map((i) => [i.number, i.month, i.issuedOn, i.amount])).toEqual([
      ["VD-2610", "2026-10-01", "2026-11-02", 767],
      ["VD-2609", "2026-09-01", "2026-10-01", 767],
      ["VD-2608", "2026-08-01", "2026-09-01", 767],
    ]);
    expect(inv.every((i) => invoicePaid(i, "2026-11-16"))).toBe(true);
    // On the day October's invoice goes out, it is not taken yet.
    expect(PLAN.perUser).toBe(59);
    expect(invoicePaid(pastInvoices("2026-11-02", 13, PLAN)[0]!, "2026-11-02")).toBe(false);
  });

  it("counts everyone with a sign-in, and the next invoice follows today's people", () => {
    const { db } = buildSeed("2026-11-16");
    expect(billedUsers(db)).toBe(13);
    expect(db.subscriptionInvoices).toHaveLength(3);
    expect(db.subscriptionInvoices.every((i) => i.users === 13 && i.amount === 13 * PLAN.perUser && i.issuedOn <= "2026-11-16")).toBe(true);
    const next = nextInvoice(db, "2026-11-16");
    expect([next.month, next.issuedOn, next.users]).toEqual(["2026-11-01", "2026-12-01", 13]);
    db.people.find((p) => p.id === "p-off")!.active = false;
    expect(nextInvoice(db, "2026-11-16").users).toBe(12);
  });
});
