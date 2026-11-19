import { describe, expect, it } from "vitest";
import { isStaffEmail } from "@/app/staff";
import { applyStaffChanges, resolveAccess } from "./access";
import { ALL_PERMS } from "./permissions";
import { roleDef } from "./roles";
import type { AccessRow } from "./types";

const none = { departments: {}, perms: {} };
const md = roleDef("md")!;
const site = roleDef("site")!;
const siteRow: AccessRow = { id: "site", departments: site.departments, seeValues: true, seeMargins: false, perms: site.perms };

describe("Vardil staff email check", () => {
  it("accepts a Vardil address, whatever its case or spaces", () => {
    expect(isStaffEmail("Oisin@Vardil.com")).toBe(true);
    expect(isStaffEmail("  hello@vardil.com ")).toBe(true);
  });
  it("refuses everyone else, including look-alikes", () => {
    for (const e of ["client@acme.ie", "x@vardil.com.evil.io", "x@notvardil.com", "vardil.com", "@vardil.com", "", null, undefined]) expect(isStaffEmail(e)).toBe(false);
  });
  it("takes the domains it is given", () => {
    expect(isStaffEmail("a@vardkey.com", ["vardil.com", "vardkey.com"])).toBe(true);
  });
});

describe("Vardil changes on top of a level", () => {
  it("leave the managing director whole when nothing is changed", () => {
    const base = resolveAccess(md, undefined);
    const out = applyStaffChanges(base, "md", md, { mdOverride: none, companyOff: [] });
    expect(out.departments).toEqual(base.departments);
    expect(out.perms).toEqual(base.perms);
    expect(out.seeMargins).toBe(true);
  });
  it("can take a department and a permission off the managing director, which Roles and access cannot", () => {
    const out = applyStaffChanges(resolveAccess(md, undefined), "md", md, { mdOverride: { departments: { reports: false }, perms: { priceQuotes: false } }, companyOff: [] });
    expect(out.departments).not.toContain("reports");
    expect(out.perms).not.toContain("priceQuotes");
    expect(out.perms.length).toBe(ALL_PERMS.length - 1);
  });
  it("takes margins away with values", () => {
    const out = applyStaffChanges(resolveAccess(md, undefined), "md", md, { mdOverride: { departments: {}, perms: {}, seeValues: false }, companyOff: [] });
    expect(out.seeValues).toBe(false);
    expect(out.seeMargins).toBe(false);
  });
  it("never gives the managing director the Vardil department, even if asked", () => {
    const out = applyStaffChanges(resolveAccess(md, undefined), "md", md, { mdOverride: { departments: { vardil: true }, perms: {} }, companyOff: [] });
    expect(out.departments).not.toContain("vardil");
  });
  it("switches a department off for every level, and does not touch another level's own tick", () => {
    const base = resolveAccess(site, siteRow);
    const out = applyStaffChanges(base, "site", site, { mdOverride: { departments: { people: true }, perms: {} }, companyOff: ["plant"] });
    expect(base.departments).toContain("plant");
    expect(out.departments).not.toContain("plant");
    // The managing director's own override is for the managing director only.
    expect(applyStaffChanges(base, "site", site, { mdOverride: { departments: { sales: true }, perms: {} }, companyOff: [] }).departments).not.toContain("sales");
  });
  it("lands someone on the first department left when their usual one is off, or on the role page when none is", () => {
    const base = resolveAccess(site, siteRow);
    expect(applyStaffChanges(base, "site", site, { mdOverride: none, companyOff: ["people"] }).home).not.toBe(site.home);
    expect(applyStaffChanges(base, "site", site, { mdOverride: none, companyOff: base.departments }).home).toBe("/who");
  });
});
