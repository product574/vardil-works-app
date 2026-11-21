import { describe, expect, it } from "vitest";
import { byStatusThenCode, filtersOn, isFinished, matchesProject, NO_FILTER } from "./project-filter";

const p = (over: object = {}) => ({ code: "C720", name: "Ardmullen House", location: "Kilcolgan", county: "Galway", status: "Live" as const, siteManagerId: "p-sm1", handoverSentAt: undefined, invoiceHold: false, ...over });

describe("All projects: the filters", () => {
  it("shows everything with no filter on", () => {
    expect(matchesProject(p(), NO_FILTER)).toBe(true);
    expect(filtersOn(NO_FILTER)).toBe(0);
  });
  it("narrows by status, with complete, invoiced and closed all counting as finished", () => {
    expect(matchesProject(p(), { ...NO_FILTER, status: "live" })).toBe(true);
    expect(matchesProject(p(), { ...NO_FILTER, status: "finished" })).toBe(false);
    for (const status of ["Complete", "Invoiced", "Closed"] as const) expect(matchesProject(p({ status }), { ...NO_FILTER, status: "finished" })).toBe(true);
    expect(matchesProject(p({ status: "Not started" }), { ...NO_FILTER, status: "not-started" })).toBe(true);
    expect(isFinished("Live")).toBe(false);
  });
  it("narrows by handover, which only finished jobs have", () => {
    const sent = p({ status: "Closed", handoverSentAt: "2026-10-01T10:00" });
    const notSent = p({ status: "Complete" });
    expect(matchesProject(sent, { ...NO_FILTER, handover: "sent" })).toBe(true);
    expect(matchesProject(notSent, { ...NO_FILTER, handover: "sent" })).toBe(false);
    expect(matchesProject(notSent, { ...NO_FILTER, handover: "not-sent" })).toBe(true);
    // A live job is neither.
    expect(matchesProject(p(), { ...NO_FILTER, handover: "not-sent" })).toBe(false);
  });
  it("narrows by site manager and by a final account on hold", () => {
    expect(matchesProject(p(), { ...NO_FILTER, siteManagerId: "p-sm2" })).toBe(false);
    expect(matchesProject(p(), { ...NO_FILTER, siteManagerId: "p-sm1" })).toBe(true);
    expect(matchesProject(p(), { ...NO_FILTER, onHold: true })).toBe(false);
    expect(matchesProject(p({ invoiceHold: true }), { ...NO_FILTER, onHold: true })).toBe(true);
  });
  it("looks a job up by code, name, place, or the client and site manager given with it", () => {
    for (const q of ["c720", "ardmullen", "kilcolgan", "galway", "Susan Kane"]) expect(matchesProject(p(), { ...NO_FILTER, q }, "Ardmullen Estate Susan Kane"), q).toBe(true);
    expect(matchesProject(p(), { ...NO_FILTER, q: "donegal" })).toBe(false);
    expect(filtersOn({ ...NO_FILTER, q: " x ", onHold: true })).toBe(2);
  });
  it("lists live jobs first, then those to start, then finished, newest code first", () => {
    const list = [p({ code: "C708", status: "Closed" }), p({ code: "C726", status: "Not started" }), p({ code: "C719" }), p({ code: "C724" }), p({ code: "C716", status: "Complete" })];
    expect(list.sort(byStatusThenCode).map((x) => x.code)).toEqual(["C724", "C719", "C726", "C716", "C708"]);
  });
});
