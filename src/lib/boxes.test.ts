import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { financeBox, projectsBox, resourcesBox, salesBox } from "./boxes";
import { claimRows } from "./claims";

const { day, db } = buildSeed("2026-11-20");
const opts = { money: (n: number) => `€${Math.round(n)}`, seeValues: true };

describe("the dashboard boxes, from the sample data", () => {
  it("give every box figures, a bar and at most three lines, each with a link", () => {
    for (const box of [salesBox(db, day, opts), projectsBox(db, day), resourcesBox(db, day), financeBox(db, day, opts)]) {
      expect(box.figures.length).toBeGreaterThanOrEqual(2);
      expect(box.bar.parts.reduce((s, p) => s + p.value, 0)).toBeGreaterThan(0);
      expect(box.lines.length).toBeLessThanOrEqual(3);
      for (const l of box.lines) expect(l.to.startsWith("/")).toBe(true);
    }
  });
  it("count the live projects the Projects app lists", () => {
    expect(projectsBox(db, day).figures[0]!.value).toBe(String(db.projects.filter((p) => p.status === "Live").length));
  });
  it("count the claims the way Money in does", () => {
    const rows = claimRows(db, day);
    const issued = rows.filter((r) => r.state === "issued").length;
    expect(financeBox(db, day, opts).figures[0]!.value).toBe(`${issued} of ${rows.length}`);
  });
  it("hide money from someone who may not see values", () => {
    const box = salesBox(db, day, { ...opts, seeValues: false });
    expect(box.figures[0]!.value).not.toContain("€");
  });
  it("split the operatives across on site, on leave and not placed", () => {
    const bar = resourcesBox(db, day).bar;
    const ops = db.people.filter((p) => p.active && p.kind === "Operative").length;
    expect(bar.parts.reduce((s, p) => s + p.value, 0)).toBe(ops);
  });
});
