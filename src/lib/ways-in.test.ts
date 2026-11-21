import { describe, expect, it } from "vitest";
import type { SiteRequest } from "@/data/types";
import { hireCompanies, hireProblem, hiresToArrange, type NewProject, paperProblem, projectProblem, scopeLines, subProblem } from "./ways-in";

const hire = { projectId: "pr-1", description: "Boom lift", quantity: 1, hireCompany: "Shannon Access", hirePhone: "", hireRef: "", onHireFrom: "2026-11-23", rate: 480, rateUnit: "week" as const, notes: "" };
const req = (x: Partial<SiteRequest>): SiteRequest => ({ id: "rq", projectId: "pr-1", kind: "hired_plant", description: "Lift", quantity: 1, neededFrom: "2026-11-25", neededTo: "2026-11-30", notes: "", requestedBy: "A", createdAt: "2026-11-19T09:00:00", status: "Open", ...x });
const project: NewProject = { clientId: "c-1", name: "Gate lodge chimney", location: "Athenry", county: "Galway", description: "Rebuild the stack", pricedBy: "Agreed price", value: 8400, orderRef: "", startDate: "2026-12-01", endDate: "2026-12-12", siteManagerId: "p-sm1", contractsManagerId: "p-cm1", scope: "" };

describe("records that had no way in (decisions 239 to 241 and 244)", () => {
  it("a hire needs its site, what it is, who from, a start day and a rate; the reference and phone can follow", () => {
    expect(hireProblem(hire)).toBe("");
    expect(hireProblem({ ...hire, projectId: "" })).toContain("site");
    expect(hireProblem({ ...hire, description: " " })).toContain("what");
    expect(hireProblem({ ...hire, hireCompany: "" })).toContain("who");
    expect(hireProblem({ ...hire, onHireFrom: "" })).toContain("day");
    expect(hireProblem({ ...hire, rate: 0 })).toContain("rate");
  });

  it("the hires to arrange are plant-to-hire requests with a yes, still open and with the office, soonest needed first", () => {
    const list = hiresToArrange([req({ id: "later", decision: "Approved", neededFrom: "2026-11-28" }), req({ id: "soon", decision: "Approved" }), req({ id: "no-answer" }), req({ id: "done", decision: "Approved", status: "Done" }), req({ id: "declined", decision: "Declined", status: "Done" }), req({ id: "people", kind: "personnel", decision: "Approved" }), req({ id: "crew", decision: "Approved", heldBy: "site" })]);
    expect(list.map((r) => r.id)).toEqual(["soon", "later"]);
  });

  it("hire companies used before are offered once each, with their phone", () => {
    expect(hireCompanies([{ hireCompany: "Shannon Access", hirePhone: "061 1" }, { hireCompany: "Athlone Plant", hirePhone: "090 2" }, { hireCompany: "Shannon Access", hirePhone: "061 9" }])).toEqual([{ name: "Athlone Plant", phone: "090 2" }, { name: "Shannon Access", phone: "061 1" }]);
  });

  it("a subcontractor needs a name not already on file, a trade, a contact and a way to reach them", () => {
    const sub = { name: "Lough Derg Roofing", trade: "Roofing", contactName: "Ann Tierney", email: "", phone: "087 1", termsDays: 30, projectIds: [] };
    expect(subProblem(sub, [])).toBe("");
    expect(subProblem(sub, [{ name: "lough derg roofing " }])).toContain("already on file");
    expect(subProblem({ ...sub, trade: "" }, [])).toContain("trade");
    expect(subProblem({ ...sub, phone: "" }, [])).toContain("email or a phone");
    expect(subProblem({ ...sub, email: "ann at roofing" }, [])).toContain("does not look right");
    expect(subProblem({ ...sub, termsDays: 0 }, [])).toContain("terms");
  });

  it("a project without a tender: an agreed price needs its price, a schedule of rates or an unpriced job does not", () => {
    expect(projectProblem(project)).toBe("");
    expect(projectProblem({ ...project, clientId: "" })).toContain("client");
    expect(projectProblem({ ...project, county: " " })).toContain("county");
    expect(projectProblem({ ...project, value: null })).toContain("agreed price");
    expect(projectProblem({ ...project, value: null, pricedBy: "Schedule of rates" })).toBe("");
    expect(projectProblem({ ...project, value: null, pricedBy: "Unpriced" })).toBe("");
    expect(projectProblem({ ...project, endDate: "2026-11-30" })).toContain("before the start");
    expect(projectProblem({ ...project, siteManagerId: "" })).toContain("site manager");
  });

  it("the scope box is one item a line, with list marks and blank lines dropped", () => {
    expect(scopeLines("- Scaffold to the stack\n\n2. Take down to roof level\n  * Rebuild in lime mortar  \nNew lead flashings")).toEqual(["Scaffold to the stack", "Take down to roof level", "Rebuild in lime mortar", "New lead flashings"]);
    expect(scopeLines("  \n")).toEqual([]);
  });

  it("a company paper needs a name not on the list, who it is from and the day it runs to", () => {
    const paper = { name: "Waste collection permit", provider: "Galway County Council", reference: "", cover: "", expires: "2027-11-01" };
    expect(paperProblem(paper, [])).toBe("");
    expect(paperProblem(paper, [{ name: "waste collection permit" }])).toContain("Renew it there");
    expect(paperProblem({ ...paper, provider: "" }, [])).toContain("from");
    expect(paperProblem({ ...paper, expires: "" }, [])).toContain("runs to");
  });
});
