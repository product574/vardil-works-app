import { describe, expect, it } from "vitest";
import { exceptionCount, resolveAccess } from "./access";
import type { AccessRow } from "./types";
import { roleDef } from "./roles";

describe("what a role may open and see", () => {
  it("site managers see values but not margins by default", () => {
    const def = roleDef("site")!;
    const a = resolveAccess(def, { id: "site", departments: def.departments, seeValues: def.money[0], seeMargins: def.money[1], perms: def.perms });
    expect([a.seeValues, a.seeMargins]).toEqual([true, false]);
  });
  it("follows what the managing director has set for an editable role", () => {
    const a = resolveAccess(roleDef("site"), { id: "site", departments: ["projects", "people", "sales"], seeValues: false, seeMargins: false, perms: [] });
    expect(a.seeValues).toBe(false);
    expect(a.departments).toContain("sales");
  });
  it("ignores edits to locked roles: the managing director always sees everything", () => {
    const a = resolveAccess(roleDef("md"), { id: "md", departments: ["site"], seeValues: false, seeMargins: false, perms: [] });
    expect(a.seeMargins).toBe(true);
    expect(a.departments).toContain("settings");
  });
  it("lands on the first department left if the usual home is switched off", () => {
    const a = resolveAccess(roleDef("accounts"), { id: "accounts", departments: ["dashboard", "sales"], seeValues: true, seeMargins: true, perms: [] });
    expect(a.home).toBe("/dashboard");
  });
  it("gives nothing when nobody is signed in", () => {
    expect(resolveAccess(null, undefined).departments).toEqual([]);
  });
});

describe("exceptions for one person", () => {
  const def = roleDef("site")!;
  const row: AccessRow = { id: "site", departments: [...def.departments], seeValues: true, seeMargins: false, perms: [...def.perms] };

  it("site managers cannot plan the week by default, and see only their own projects", () => {
    const a = resolveAccess(def, row);
    expect(a.perms).toEqual(expect.arrayContaining(["markTime", "correctTime"]));
    expect(a.perms).not.toContain("planWeek");
    expect(a.perms).not.toContain("allProjects");
  });
  it("one person can be given more than their level", () => {
    const a = resolveAccess(def, row, { id: "p-sm4", departments: { sales: true }, perms: { planWeek: true, seeMargins: true } });
    expect(a.perms).toContain("planWeek");
    expect(a.departments).toContain("sales");
    expect(a.seeMargins).toBe(true);
  });
  it("one person can be given less than their level", () => {
    const a = resolveAccess(def, row, { id: "p-sm4", departments: { plant: false }, perms: { markTime: false, seeValues: false } });
    expect(a.perms).not.toContain("markTime");
    expect(a.departments).not.toContain("plant");
    expect(a.seeValues).toBe(false);
  });
  it("never shows margins to someone who cannot see values", () => {
    const a = resolveAccess(def, row, { id: "p-sm4", departments: {}, perms: { seeValues: false, seeMargins: true } });
    expect(a.seeMargins).toBe(false);
  });
  it("cannot switch off a person's home department", () => {
    const a = resolveAccess(def, row, { id: "p-sm4", departments: { people: false }, perms: {} });
    expect(a.departments).toContain("people");
    expect(a.home).toBe("/people/timesheet");
  });
  it("ignores exceptions on the managing director", () => {
    const md = roleDef("md")!;
    const a = resolveAccess(md, { id: "md", departments: [], seeValues: false, seeMargins: false, perms: [] }, { id: "p-md", departments: { sales: false }, perms: { planWeek: false } });
    expect(a.perms).toContain("planWeek");
    expect(a.departments).toContain("sales");
  });
  it("counts only settings that really differ from the level", () => {
    expect(exceptionCount(row, { id: "p-sm4", departments: { sales: true, plant: true }, perms: { planWeek: true, markTime: true } })).toBe(2);
    expect(exceptionCount(row, undefined)).toBe(0);
  });
});
