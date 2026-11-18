import { describe, expect, it } from "vitest";
import type { Driver, Todo, Vehicle } from "@/data/types";
import { todoDue, discLate, renewalRows, todoLate } from "./renewals";

const item = (expiryDate: string, extra = {}) => ({ paidDate: "2026-11-01", expiryDate, amount: 100, ...extra });
const van = { id: "v1", reg: "241-G-5120", kind: "Van", active: true, compliance: { tax: item("2026-11-20"), test: item("2027-03-01", { discPending: true, paidDate: "2026-11-05" }), insurance: item("") } } as unknown as Vehicle;
const driver = { id: "d1", name: "Seán Kelly", active: true, licences: { cpc: { expiryDate: "2026-11-10" } } } as unknown as Driver;
const todo: Todo = { id: "t1", title: "Renew motor tax", due: "2026-11-13", vehicleId: "v1", item: "tax", createdAt: "2026-11-12T10:00:00", createdBy: "Aidan King" };

describe("renewals in one list", () => {
  it("lists vehicles' renewals and drivers' licences together, soonest first, skipping blank dates", () => {
    const rows = renewalRows([van], [driver], [todo], "2026-11-17");
    expect(rows.map((r) => [r.label, r.state])).toEqual([["Driver CPC", "overdue"], ["Motor tax", "soon"], ["CVRT", "ok"]]);
    expect(rows[1]!.todo?.id).toBe("t1");
  });
  it("counts the days a renewed disc has been waiting, and flags it after 7", () => {
    const cvrt = renewalRows([van], [], [], "2026-11-17").find((r) => r.item === "test")!;
    expect(cvrt.discWaiting).toBe(12);
    expect(discLate(cvrt)).toBe(true);
    expect(discLate({ discWaiting: 7 })).toBe(false);
    expect(discLate({})).toBe(false);
  });
  it("a renewal on the to-do list is due a week before it runs out, or in three days if that has passed", () => {
    expect(todoDue("2026-12-20", "2026-11-17")).toBe("2026-12-13");
    expect(todoDue("2026-11-20", "2026-11-17")).toBe("2026-11-20");
    expect(todoLate(todo, "2026-11-17")).toBe(true);
    expect(todoLate({ ...todo, doneAt: "2026-11-14T09:00:00" }, "2026-11-17")).toBe(false);
  });
});
