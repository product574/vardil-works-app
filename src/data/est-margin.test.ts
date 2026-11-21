import { beforeEach, describe, expect, it } from "vitest";
import { estMargin, projectEstMargin } from "@/lib/tenders";
import { addProject, setEstMargin } from "./actions";
import { getDay, useData } from "./store";

const db = () => useData.getState().db;
const base = { location: "Athenry", county: "Galway", description: "Rebuild the stack", pricedBy: "Agreed price" as const, value: 8400, orderRef: "", startDate: "", endDate: "2099-01-01", siteManagerId: "p-sm1", contractsManagerId: "p-cm1", scope: "" };

describe("estimated margin on a job (21 Nov)", () => {
  beforeEach(() => useData.getState().reset());

  it("can be given in Add project, or left out", () => {
    const a = addProject({ ...base, startDate: getDay(), clientId: db().clients[0]!.id, name: "With a margin", estMargin: 22.46 });
    const b = addProject({ ...base, startDate: getDay(), clientId: db().clients[0]!.id, name: "Without" });
    expect(db().projects.find((p) => p.code === a)!.estMargin).toBe(22.5);
    expect(db().projects.find((p) => p.code === b)!.estMargin).toBeUndefined();
    expect(addProject({ ...base, startDate: getDay(), clientId: db().clients[0]!.id, name: "Silly", estMargin: 140 })).toBe("");
  });

  it("is set, changed and taken away later on a job with no tender, with a line in the history and the log", () => {
    const code = addProject({ ...base, startDate: getDay(), clientId: db().clients[0]!.id, name: "Later" });
    const id = db().projects.find((p) => p.code === code)!.id;
    expect(setEstMargin(id, 18)).toBe(true);
    expect(projectEstMargin(db().projects.find((p) => p.id === id)!, db().quotes)).toBe(18);
    expect(setEstMargin(id, 20)).toBe(true);
    expect(db().activity[0]!.what).toBe("Estimated margin changed to 20% (was 18%)");
    expect(setEstMargin(id, null)).toBe(true);
    expect(db().projects.find((p) => p.id === id)!.estMargin).toBeUndefined();
    expect(db().projects.find((p) => p.id === id)!.audit.at(-1)!.what).toBe("Estimated margin taken away");
  });

  it("is never typed over on a job won from a tender", () => {
    const p = db().projects.find((x) => x.quoteId)!;
    expect(setEstMargin(p.id, 50)).toBe(false);
    expect(projectEstMargin(db().projects.find((x) => x.id === p.id)!, db().quotes)).toBe(estMargin(db().quotes.find((q) => q.id === p.quoteId)!));
  });
});
