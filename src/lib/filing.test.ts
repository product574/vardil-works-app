import { describe, expect, it } from "vitest";
import { type FilingContext, suggestFiling } from "./filing";

const ctx: FilingContext = {
  projects: [
    { id: "a", code: "C719", name: "St Finian's Church", description: "Tower repointing in lime mortar and renewal of the lead roof.", status: "Live" },
    { id: "b", code: "C720", name: "Ardmullen House", description: "Re-render in lime, and repair 34 sash windows.", status: "Live" },
    { id: "c", code: "C709", name: "Old Rectory", description: "Sash windows overhauled.", status: "Closed" },
  ],
  rosters: [{ personName: "Thiago Barbosa", projectId: "b" }],
  suppliers: [
    { name: "Burren Lime", projectId: "a" },
    { name: "Corrib Scaffolding", projectId: "a" },
    { name: "Corrib Scaffolding", projectId: "b" },
  ],
};

describe("where an unfiled document belongs", () => {
  it("a site code in the file name wins", () => {
    expect(suggestFiling({ name: "C719 belfry sketch.pdf", kind: "pdf", addedBy: "Nobody" }, ctx)).toMatchObject({ projectId: "a" });
  });
  it("a photo from an operative goes to the site they are on", () => {
    const s = suggestFiling({ name: "Photo from site, no caption.jpg", kind: "image", addedBy: "Thiago Barbosa" }, ctx);
    expect(s).toMatchObject({ projectId: "b", category: "Photos and videos" });
    expect(s.why).toContain("C720");
  });
  it("a supplier with one project points to it", () => {
    expect(suggestFiling({ name: "Lime putty batch certificate.pdf", kind: "pdf", addedBy: "Burren Lime" }, ctx)).toMatchObject({ projectId: "a", category: "Conservation reports" });
  });
  it("a supplier on two projects is left for a person to choose, with the folder still suggested", () => {
    const s = suggestFiling({ name: "Scaffold handover certificate.pdf", kind: "pdf", addedBy: "Corrib Scaffolding" }, ctx);
    expect(s.projectId).toBeNull();
    expect(s.category).toBe("Health and safety");
    expect(s.why).toContain("C719 and C720");
  });
  it("a supplier on three or more projects reads as a list", () => {
    const three = { ...ctx, suppliers: [...ctx.suppliers, { name: "Corrib Scaffolding", projectId: "c" }] };
    expect(suggestFiling({ name: "Scaffold handover certificate.pdf", kind: "pdf", addedBy: "Corrib Scaffolding" }, three).why).toContain("C709, C719 and C720");
  });
  it("words in the name are matched against live projects only", () => {
    expect(suggestFiling({ name: "Revised window schedule rev C.pdf", kind: "drawing", addedBy: "Architect" }, ctx)).toMatchObject({ projectId: "b", category: "Drawings" });
  });
  it("says so plainly when nothing points anywhere", () => {
    const s = suggestFiling({ name: "Insurance renewal schedule 2027.pdf", kind: "pdf", addedBy: "Maeve Quirke" }, ctx);
    expect(s.projectId).toBeNull();
    expect(s.why).toMatch(/Nothing in the name or sender/);
  });
});
