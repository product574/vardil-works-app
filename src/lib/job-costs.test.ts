import { describe, expect, it } from "vitest";
import { allocationBalance, findDuplicates, hireEstimate, reviewWarnings, suggestCategory, summariseCosts, type CostRow } from "./job-costs";

const row = (p: Partial<CostRow>): CostRow => ({ site_id: "A", category: "plant", amount_ex_vat: 100, vat: 23, currency: "EUR", invoice_date: "2026-11-02", doc_type: "invoice", confirmed: true, ...p });

describe("job costs", () => {
  it("only counts confirmed invoices", () => {
    const s = summariseCosts([row({}), row({ confirmed: false })], "A", { mode: "all" });
    expect(s["EUR"]!.ex).toBe(100);
  });
  it("split invoice charges each job only its share", () => {
    const rows = [row({ site_id: "A", amount_ex_vat: 600 }), row({ site_id: "B", amount_ex_vat: 400 })];
    expect(summariseCosts(rows, "A", { mode: "all" })["EUR"]!.ex).toBe(600);
    expect(summariseCosts(rows, "B", { mode: "all" })["EUR"]!.ex).toBe(400);
  });
  it("credit notes reduce costs", () => {
    const s = summariseCosts([row({}), row({ doc_type: "credit_note", amount_ex_vat: 30, vat: 6.9 })], "A", { mode: "all" });
    expect(s["EUR"]!.ex).toBe(70);
    expect(s["EUR"]!.vat).toBe(16.1);
  });
  it("keeps currencies separate", () => {
    const s = summariseCosts([row({}), row({ currency: "GBP", amount_ex_vat: 50 })], "A", { mode: "all" });
    expect(s["EUR"]!.ex).toBe(100);
    expect(s["GBP"]!.ex).toBe(50);
  });
  it("filters by invoice date", () => {
    const s = summariseCosts([row({ invoice_date: "2026-09-01" })], "A", { mode: "7d" }, "2026-11-06");
    expect(s["EUR"]).toBeUndefined();
  });
  it("shows unallocated balance and over-allocation", () => {
    expect(allocationBalance(1000, [{ amount_ex_vat: 600 }])).toBe(400);
    expect(allocationBalance(1000, [{ amount_ex_vat: 600 }, { amount_ex_vat: 500 }])).toBe(-100);
  });
  it("detects duplicates by file or supplier + number", () => {
    const a: { id: string; content_hash: string | null; supplier: string | null; invoice_number: string | null } = { id: "1", content_hash: "x", supplier: "Hire Co", invoice_number: "INV-1" };
    expect(findDuplicates(a, [{ id: "2", content_hash: "x", supplier: null, invoice_number: null }])).toHaveLength(1);
    expect(findDuplicates(a, [{ id: "3", content_hash: "y", supplier: "hire co", invoice_number: "inv 1" }])).toHaveLength(1);
    expect(findDuplicates(a, [{ id: "4", content_hash: "y", supplier: "Other", invoice_number: "INV-1" }])).toHaveLength(0);
  });
  it("flags totals that do not reconcile and job mismatch", () => {
    const w = reviewWarnings({ supplier: "S", invoice_number: "1", invoice_date: "2026-11-01", subtotal: 100, vat: 23, amount: 130, currency: "EUR", job_ref: "C702" }, "C686");
    expect(w.some((x) => x.includes("does not equal"))).toBe(true);
    expect(w.some((x) => x.includes("does not match"))).toBe(true);
  });
  it("suggests categories", () => {
    expect(suggestCategory("3t excavator hire week 2")).toBe("plant");
    expect(suggestCategory("Delivery charge")).toBe("transport");
  });
  it("hire estimate shows its basis", () => {
    expect(hireEstimate(50, "day", "2026-11-01", "2026-11-03", "2026-11-06")!.total).toBe(150);
  });
});
