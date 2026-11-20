import { describe, expect, it } from "vitest";
import type { SupplierInvoice } from "@/data/types";
import { approvalBy, approveLabel, approverWords, approveStep, chainOf, startsOnSite } from "./purchases";

const site = { id: "pr-C720", siteManagerId: "p-sm", contractsManagerId: "p-cm" };
const inv = (over: Partial<SupplierInvoice> = {}) => ({ party: "supplier" as const, subtotal: 2000, allocations: [{ id: "a", projectId: "pr-C720", category: "material" as const, amount: 2000, description: "Lime" }], ...over });
const md = { personId: "p-md", handles: false, approvesAll: true, approvesOwnSites: false };
const sm = { personId: "p-sm", handles: false, approvesAll: false, approvesOwnSites: true };
const otherSm = { personId: "p-x", handles: false, approvesAll: false, approvesOwnSites: true };
const accounts = { personId: "p-acc", handles: true, approvesAll: false, approvesOwnSites: false };
const names = (id: string) => ({ "p-sm": "Eoin Brosnan" })[id];

describe("Jimmy's chain: site manager, then managing director", () => {
  it("is the default when nothing is set", () => expect(chainOf([{ id: "supplier" }])).toBe("site-md"));
  it("starts on site", () => expect(startsOnSite("site-md")).toBe(true));
  it("lets the site manager of the job do his step, not finish it", () => {
    expect(approvalBy(inv({ siteStep: true }), sm, 500, [site], "site-md")).toBe("site");
  });
  it("does not let a site manager from another job, or accounts, approve", () => {
    expect(approvalBy(inv({ siteStep: true }), otherSm, 500, [site], "site-md")).toBeNull();
    expect(approvalBy(inv({ siteStep: true, subtotal: 100 }), accounts, 500, [site], "site-md")).toBeNull();
  });
  it("then waits on the managing director, and the site manager may not approve twice", () => {
    const done = inv({ siteStep: true, siteApprovedAt: "2026-11-19T16:10:00" });
    expect(approveStep(done)).toBe("final");
    expect(approvalBy(done, sm, 500, [site], "site-md")).toBeNull();
    expect(approvalBy(done, md, 500, [site], "site-md")).toBe("finish");
  });
  it("says who it waits for", () => {
    expect(approverWords(inv({ siteStep: true }), 500, [site], names, "site-md")).toBe("Eoin Brosnan, then the managing director");
    expect(approverWords(inv({ siteStep: true, siteApprovedAt: "x" }), 500, [site], names, "site-md")).toBe("the managing director");
    expect(approveLabel(inv({ siteStep: true }))).toBe("Site manager to approve");
    expect(approveLabel(inv({ siteStep: true, siteApprovedAt: "x" }))).toBe("Managing director to approve");
  });
});

describe("site manager only", () => {
  it("lets his yes finish it", () => expect(approvalBy(inv({ siteStep: true }), sm, 500, [site], "site")).toBe("finish"));
});

describe("the rule from 18 Nov: accounts up to a limit", () => {
  it("does not start on site", () => expect(startsOnSite("accounts-limit")).toBe(false));
  it("lets accounts approve a supplier's invoice within the limit only", () => {
    expect(approvalBy(inv({ subtotal: 400 }), accounts, 500, [site], "accounts-limit")).toBe("finish");
    expect(approvalBy(inv({ subtotal: 900 }), accounts, 500, [site], "accounts-limit")).toBeNull();
  });
  it("lets the site manager approve a subcontractor's", () => {
    expect(approvalBy(inv({ party: "subcontractor" }), sm, 500, [site], "accounts-limit")).toBe("finish");
  });
});
