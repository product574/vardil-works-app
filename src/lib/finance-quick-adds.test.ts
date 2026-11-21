import { describe, expect, it } from "vitest";
import { jobPaidShown, paidState } from "./claims";
import { suggestFiling } from "./filing";
import { jobBars, moneyIn } from "./profitability";
import { todoOwner, todosFor, todosGivenBy } from "./renewals";

describe("money in and out as bars (21 Nov)", () => {
  const invoices = [
    { projectId: "a", status: "Paid", net: 40000 },
    { projectId: "a", status: "Invoiced", net: 20000 },
    { projectId: "a", status: "To invoice", net: 9000 },
    { projectId: "a", status: "Held", net: 5000 },
    { projectId: "b", status: "Paid", net: 1000 },
  ];
  it("counts what is paid and what is invoiced and not paid, and leaves drafts and holds out", () => {
    expect(moneyIn("a", invoices)).toEqual({ paid: 40000, unpaid: 20000, invoiced: 60000 });
    expect(moneyIn("none", invoices)).toEqual({ paid: 0, unpaid: 0, invoiced: 0 });
  });
  it("draws each part as a share of the contract, with the rest of the contract empty", () => {
    const b = jobBars(100000, moneyIn("a", invoices), 45000);
    expect([b.paid, b.unpaid, b.contract, b.out]).toEqual([40, 20, 100, 45]);
    expect(b.toInvoice).toBe(40000);
    expect(b.ahead).toBe(15000);
    expect(b.over).toBe(false);
  });
  it("says when costs are ahead of what is invoiced, and when they have passed the contract", () => {
    const ahead = jobBars(100000, { paid: 10000, unpaid: 0, invoiced: 10000 }, 30000);
    expect(ahead.ahead).toBe(-20000);
    expect(ahead.over).toBe(false);
    // Costs past the contract: the scale stretches to the costs, so the contract's outline is shorter than the costs bar.
    const over = jobBars(50000, { paid: 50000, unpaid: 0, invoiced: 50000 }, 62500);
    expect(over.over).toBe(true);
    expect([over.contract, over.out, over.paid]).toEqual([80, 100, 80]);
  });
  it("copes with a job that has no contract value yet", () => {
    const b = jobBars(null, { paid: 0, unpaid: 0, invoiced: 0 }, 0);
    expect([b.paid, b.unpaid, b.contract, b.out, b.toInvoice]).toEqual([0, 0, 0, 0, 0]);
    expect(b.over).toBe(false);
  });
});

describe("paid or not paid (21 Nov)", () => {
  const today = "2026-11-20";
  const inv = (status: string, dueOn?: string) => ({ status, net: 1000, dueOn }) as never;
  it("sums up a job's invoices: sent, paid, not paid, late and owed", () => {
    const st = paidState([inv("Paid"), inv("Invoiced", "2026-11-10"), inv("Invoiced", "2026-12-10"), inv("To invoice"), inv("Held")], today);
    expect(st).toEqual({ sent: 3, paid: 1, unpaid: 2, overdue: 1, owed: 2000 });
  });
  it("puts a job under Not paid while anything sent is unpaid, and under Paid once everything sent is", () => {
    const some = paidState([inv("Paid"), inv("Invoiced", "2026-12-10")], today);
    const all = paidState([inv("Paid"), inv("Paid")], today);
    const none = paidState([inv("To invoice")], today);
    expect([jobPaidShown(some, "unpaid"), jobPaidShown(some, "paid")]).toEqual([true, false]);
    expect([jobPaidShown(all, "unpaid"), jobPaidShown(all, "paid")]).toEqual([false, true]);
    // A job with nothing sent is under neither, and under All.
    expect([jobPaidShown(none, "unpaid"), jobPaidShown(none, "paid"), jobPaidShown(none, "all")]).toEqual([false, false, true]);
  });
});

describe("whose list a to-do is on (21 Nov)", () => {
  const todos = [
    { id: "1", createdBy: "Aidan King" },
    { id: "2", createdBy: "Aidan King", forName: "Maeve Quirke" },
    { id: "3", createdBy: "Tadhg Morrissey", forName: "Aidan King" },
  ];
  it("is the colleague it was given to, or whoever added it", () => {
    expect(todos.map(todoOwner)).toEqual(["Aidan King", "Maeve Quirke", "Aidan King"]);
    expect(todosFor(todos, "Aidan King").map((t) => t.id)).toEqual(["1", "3"]);
    expect(todosFor(todos, "Maeve Quirke").map((t) => t.id)).toEqual(["2"]);
  });
  it("keeps what someone gave away in view for them", () => {
    expect(todosGivenBy(todos, "Aidan King").map((t) => t.id)).toEqual(["2"]);
    expect(todosGivenBy(todos, "Maeve Quirke")).toEqual([]);
  });
});

describe("a file added for a named project (21 Nov)", () => {
  const ctx = { projects: [{ id: "p1", code: "C722", name: "Dunmoy Courthouse", description: "Stone repairs", status: "Live" }, { id: "p2", code: "C720", name: "Ardmullen House", description: "Render", status: "Live" }], rosters: [], suppliers: [] };
  it("is filed under that project whatever its name suggests, with only the folder left to pick", () => {
    const s = suggestFiling({ name: "C720 delivery docket.jpg", kind: "image", addedBy: "Eoin Brosnan", forProjectId: "p1" }, ctx);
    expect(s.projectId).toBe("p1");
    expect(s.why).toBe("Eoin Brosnan added it for C722. It needs its folder");
  });
  it("falls back to the usual suggestion when the project it names is gone", () => {
    expect(suggestFiling({ name: "C720 delivery docket.jpg", kind: "image", addedBy: "Eoin Brosnan", forProjectId: "nope" }, ctx).projectId).toBe("p2");
  });
});
