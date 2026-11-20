import { describe, expect, it } from "vitest";
import type { Project, SalesInvoice } from "@/data/types";
import { claimRows, claimsDue, claimsToIssue, claimSummary, monthOf } from "./claims";

const today = "2026-11-20";
const job = (code: string, status: Project["status"], value = 100000) => ({ id: `pr-${code}`, code, name: code, status, value }) as Project;
const inv = (projectId: string, over: Partial<SalesInvoice>): SalesInvoice => ({ id: `inv-${Math.random()}`, ref: "INV-1", projectId, clientId: "c-1", description: "Stage payment", net: 10000, vatPct: 13.5, status: "Invoiced", ...over });

describe("when claims are due", () => {
  it("is the last working day of the month", () => {
    expect(claimsDue("2026-11-03")).toBe("2026-11-30"); // a Monday
    expect(claimsDue("2026-01-10")).toBe("2026-01-30"); // the 31st is a Saturday
    expect(claimsDue("2026-12-01")).toBe("2026-12-31");
  });
  it("skips a bank holiday at the end of the month", () => {
    expect(claimsDue("2026-12-01", [{ date: "2026-12-31", name: "Closed" }])).toBe("2026-12-30");
  });
  it("reads the month of a day", () => expect(monthOf(today)).toBe("2026-11"));
});

describe("this month's claim per job", () => {
  const projects = [job("C719", "Live"), job("C720", "Live"), job("C721", "Live"), job("C722", "Live"), job("C715", "Complete"), job("C726", "Not started"), job("C710", "Closed")];
  const salesInvoices = [
    inv("pr-C719", { issuedOn: "2026-11-03", net: 20000 }),
    inv("pr-C719", { issuedOn: "2026-10-02", net: 15000, status: "Paid" }),
    inv("pr-C720", { issuedOn: "2026-10-30", net: 12000 }),
    inv("pr-C721", { status: "To invoice" }),
    inv("pr-C722", { status: "Held", holdReason: "Extras to agree" }),
  ];
  const rows = claimRows({ projects, salesInvoices }, today);
  const of = (code: string) => rows.find((r) => r.project.code === code);

  it("lists live jobs and finished ones still to be claimed, not ones not started or closed", () => {
    expect(rows.map((r) => r.project.code).sort()).toEqual(["C715", "C719", "C720", "C721", "C722"]);
  });
  it("calls a claim sent this month issued", () => expect(of("C719")?.state).toBe("issued"));
  it("does not count last month's claim for this month", () => expect(of("C720")?.state).toBe("to-issue"));
  it("tells a draft and a held one apart from nothing at all", () => {
    expect(of("C721")?.state).toBe("draft");
    expect(of("C722")?.state).toBe("held");
  });
  it("says a finished job's final account is still to go", () => expect(of("C715")?.state).toBe("final"));
  it("adds up what was claimed and paid, and what is left", () => {
    expect(of("C719")).toMatchObject({ claimed: 35000, paid: 15000, left: 65000 });
  });
  it("puts what still has to go first", () => {
    expect(rows[0]?.state).toBe("to-issue");
    expect(rows.at(-1)?.state).toBe("issued");
  });
  it("counts what is still to go out", () => {
    expect(claimsToIssue({ projects, salesInvoices }, today)).toBe(4);
    expect(claimSummary(rows)).toEqual({ issued: 1, total: 5, toGo: 4 });
  });
});
