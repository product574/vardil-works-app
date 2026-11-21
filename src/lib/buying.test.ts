import { describe, expect, it } from "vitest";
import type { SpendRequest, SupplyOrder } from "@/data/types";
import { buyingFor, daysLate, deliveredLately, mayMarkDelivered, onOrder, orderProblem, spendProblem, spendStage, toOrder } from "./buying";

const DAY = "2026-11-20";
const spend = (x: Partial<SpendRequest>): SpendRequest => ({ id: "sp", requestedById: "p-1", createdAt: `${DAY}T08:00:00`, what: "Lime", supplier: "Burren", projectId: "pr-1", amount: 100, reason: "Needed", status: "Waiting", ...x });
const order = (x: Partial<SupplyOrder>): SupplyOrder => ({ id: "su", from: "Burren", party: "supplier", projectId: "pr-1", description: "Lime", orderedOn: "2026-11-16", dueOn: "2026-11-24", status: "Ordered", ...x });

describe("buying for a site (decisions 242 and 243)", () => {
  it("a request to buy needs what, an amount and why; the supplier can follow", () => {
    expect(spendProblem({ what: "", supplier: "", amount: 10, reason: "x" })).toContain("what");
    expect(spendProblem({ what: "Lime", supplier: "", amount: 0, reason: "x" })).toContain("amount");
    expect(spendProblem({ what: "Lime", supplier: "", amount: 10, reason: " " })).toContain("why");
    expect(spendProblem({ what: "Lime", supplier: "", amount: 10, reason: "Finish coats" })).toBe("");
  });

  it("where a request stands: waiting, declined, to order, ordered, delivered", () => {
    expect(spendStage(spend({}), [])).toBe("waiting");
    expect(spendStage(spend({ status: "Declined" }), [])).toBe("declined");
    expect(spendStage(spend({ status: "Approved" }), [])).toBe("to-order");
    expect(spendStage(spend({ status: "Approved", orderId: "su" }), [order({})])).toBe("ordered");
    expect(spendStage(spend({ status: "Approved", orderId: "su" }), [order({ status: "Delivered" })])).toBe("delivered");
  });

  it("the office's list is what is approved and not ordered, oldest yes first", () => {
    const list = toOrder([spend({ id: "a", status: "Approved", decidedAt: "2026-11-19T10:00:00" }), spend({ id: "b", status: "Approved", decidedAt: "2026-11-18T10:00:00" }), spend({ id: "c", status: "Approved", orderId: "su" }), spend({ id: "d" })]);
    expect(list.map((s) => s.id)).toEqual(["b", "a"]);
  });

  it("on order is everything not all here, soonest due first; late counts from the day after it was due", () => {
    const orders = [order({ id: "late", dueOn: "2026-11-18" }), order({ id: "part", dueOn: "2026-11-17", status: "Part delivered" }), order({ id: "here", status: "Delivered", deliveredOn: "2026-11-19" }), order({ id: "old", status: "Delivered", deliveredOn: "2026-09-01" })];
    expect(onOrder(orders).map((o) => o.id)).toEqual(["part", "late"]);
    expect(daysLate(orders[0]!, DAY)).toBe(2);
    expect(daysLate(order({ dueOn: DAY }), DAY)).toBe(0);
    expect(daysLate(orders[2]!, DAY)).toBe(0);
    expect(deliveredLately(orders, DAY).map((o) => o.id)).toEqual(["here"]);
  });

  it("an order needs a supplier and a day that is not in the past", () => {
    expect(orderProblem({ supplier: "", dueOn: DAY }, DAY)).toContain("who");
    expect(orderProblem({ supplier: "Burren", dueOn: "" }, DAY)).toContain("due");
    expect(orderProblem({ supplier: "Burren", dueOn: "2026-11-19" }, DAY)).toContain("past");
    expect(orderProblem({ supplier: "Burren", dueOn: DAY }, DAY)).toBe("");
  });

  it("the site it is for, or the office, says it has arrived; an order for the firm is the office's", () => {
    const projects = [{ id: "pr-1", siteManagerId: "p-sm" }];
    expect(mayMarkDelivered(order({}), projects, "p-sm", [], false)).toBe(true);
    expect(mayMarkDelivered(order({}), projects, "p-other", [], false)).toBe(false);
    expect(mayMarkDelivered(order({}), projects, "p-other", [{ personId: "p-other", projectId: "pr-1" }], false)).toBe(true);
    expect(mayMarkDelivered(order({ projectId: null }), projects, "p-sm", [], false)).toBe(false);
    expect(mayMarkDelivered(order({ projectId: null }), projects, "p-cm", [], true)).toBe(true);
  });

  it("a site manager sees buying for his own sites and what he asked for the firm; the office sees all", () => {
    const db = { spendRequests: [spend({ id: "mine" }), spend({ id: "theirs", projectId: "pr-2" }), spend({ id: "firm-me", projectId: null, requestedById: "p-sm" }), spend({ id: "firm-other", projectId: null })], supplies: [order({ id: "o1" }), order({ id: "o2", projectId: "pr-2" }), order({ id: "o3", projectId: null })] };
    const own = buyingFor(db, new Set(["pr-1"]), "p-sm");
    expect(own.spend.map((s) => s.id)).toEqual(["mine", "firm-me"]);
    expect(own.orders.map((o) => o.id)).toEqual(["o1"]);
    const all = buyingFor(db, null, "p-cm");
    expect([all.spend.length, all.orders.length]).toEqual([4, 3]);
  });
});
