import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/app/departments";
import type { RoleKey } from "@/data/types";
import { ROLES } from "@/data/roles";
import { ALWAYS_ON, APP_KEYS, appsOff, brandOfLook, cleanEmail, clientOf, DEMO_LEVELS, type DemoLevel, demoLive, demoState, irishToday, PACKAGES, packageOf, readLevels, readLogo, readLook, readWorkspaceAction, sampleDomain, shiftDay, splitEmails, STAFF_ACTIONS, starterLook, VISIT_ACTIONS } from "./apps";

describe("the apps Vardil sells", () => {
  it("are the departments in the bar, without Vardil HQ", () => {
    expect([...APP_KEYS].sort()).toEqual(DEPARTMENTS.map((d) => d.key).filter((k) => k !== "vardil").sort());
  });

  it("have the main offering Oisin listed: Schedule, People, Compliance, Site phone, Admin and Dashboard, no Automations", () => {
    const main = PACKAGES.find((p) => p.key === "main")!;
    expect([...main.apps].sort()).toEqual(["admin", "compliance", "dashboard", "people", "schedule", "settings", "site"]);
    expect(main.automations).toBe(false);
  });

  it("never switch off the apps every firm needs", () => {
    const off = appsOff(["schedule"]);
    for (const a of ALWAYS_ON) expect(off).not.toContain(a);
    expect(off).toContain("invoicing");
    expect(off).not.toContain("schedule");
  });

  it("recognise a package from its apps", () => {
    expect(packageOf(["schedule", "people", "compliance", "site"], false)?.key).toBe("main");
    expect(packageOf(["schedule", "people", "compliance", "site"], true)).toBeNull();
    expect(packageOf([...APP_KEYS], true)?.key).toBe("full");
  });
});

const LOOK = { brandName: "Oldstone", legalName: "Oldstone Conservation Ltd", tagline: "Conservation", accent: "#2F6F5E", region: "IE", design: { iban: "IE00 TEST", showBank: false } };

describe("who signs in to a client's demo (decision 209: named emails only)", () => {
  it("takes one email, lower case, and never a whole domain", () => {
    expect(cleanEmail(" Susan@Ardmullen.IE ")).toBe("susan@ardmullen.ie");
    for (const bad of ["", "@oldstone.ie", "oldstone", "a b@x.ie", "x@y", "a@b.c", "<a@b.ie>"]) expect(cleanEmail(bad)).toBeNull();
  });

  it("reads a pasted list, one a line or with commas, and says which are not emails", () => {
    expect(splitEmails("Majella@oldstone.ie, pat@oldstone.ie\npat@oldstone.ie; @oldstone.ie nope")).toEqual({ good: ["majella@oldstone.ie", "pat@oldstone.ie"], bad: ["@oldstone.ie", "nope"] });
  });

  it("finds the client whose list holds an email, whatever its case", () => {
    const rows = [{ name: "Oldstone", people: [{ email: "majella@oldstone.ie" }] }, { name: "Other", people: [{ email: "pat@other.ie" }] }];
    expect(clientOf("Majella@Oldstone.ie", rows)?.name).toBe("Oldstone");
    expect(clientOf("pat@oldstone.ie", rows)).toBeNull();
  });
});

describe("a client's look", () => {
  it("keeps only known fields, checked", () => {
    const l = readLook({ ...LOOK, evil: "<script>", design: { ...LOOK.design, onload: "x", footer: 7 } })!;
    expect(l).toEqual({ ...LOOK, accent: "#2f6f5e", design: { iban: "IE00 TEST", showBank: false } });
  });

  it("refuses a look with no name, a colour that is not one, or another region", () => {
    expect(readLook({ ...LOOK, brandName: "  " })).toBeNull();
    expect(readLook({ ...LOOK, accent: "red; background:url(x)" })).toBeNull();
    expect(readLook({ ...LOOK, region: "US" })).toBeNull();
  });

  it("gives the sample staff an invented domain from the name, never a real one", () => {
    expect(sampleDomain("Oldstone Conservation")).toBe("oldstoneconservation.example");
    expect(sampleDomain("Ó Briain & Sons")).toBe("obriainsons.example");
    expect(brandOfLook(readLook(LOOK)!, "/api/logo/x")).toMatchObject({ brandName: "Oldstone", region: "IE", logoUrl: "/api/logo/x", emailDomain: "oldstone.example" });
  });

  it("starts a new client in Vardil's colour, in Ireland, with their name", () => {
    expect(starterLook("Oldstone")).toMatchObject({ brandName: "Oldstone", legalName: "Oldstone Ltd", accent: "#4682B4", region: "IE" });
  });

  it("takes a logo only as a JPEG or PNG picture of a sensible size", () => {
    expect(readLogo("data:image/png;base64,iVBORw0KGgo=")).toBeTruthy();
    expect(readLogo("data:image/svg+xml;base64,PHN2Zz4=")).toBeNull();
    expect(readLogo("data:text/html;base64,PGh0bWw+")).toBeNull();
    expect(readLogo(`data:image/jpeg;base64,${"A".repeat(300_000)}`)).toBeNull();
  });
});

describe("what may be sent to the server", () => {
  it("accepts a client with named emails and a look, and adds the apps always on", () => {
    const r = readWorkspaceAction({ action: "set_client", id: null, name: "Oldstone", people: [{ email: "Majella@oldstone.ie", levels: ["site", "md", "nonsense"] }, { email: "majella@oldstone.ie", levels: [] }, { email: "pat@oldstone.ie" }], apps: ["schedule"], automations: true, look: LOOK });
    expect(r.ok && r.act.action === "set_client" && r.act.apps).toEqual(expect.arrayContaining(["schedule", "dashboard", "admin", "settings"]));
    expect(r.ok && r.act.action === "set_client" && r.act.people).toEqual([{ email: "majella@oldstone.ie", levels: ["md", "site"] }, { email: "pat@oldstone.ie", levels: [...DEMO_LEVELS] }]);
  });

  it("refuses made-up apps, a domain in place of an email, a bad id, a bad look, empty announcements and unknown actions", () => {
    const base = { action: "set_client", id: null, name: "x", people: [], apps: [], look: LOOK };
    expect(readWorkspaceAction({ ...base, apps: ["vardil"] }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, people: [{ email: "@oldstone.ie" }] }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, emails: ["a@b.ie"], people: undefined }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, id: "'; DROP" }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, look: { ...LOOK, accent: "x" } }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, people: Array.from({ length: 201 }, (_, i) => ({ email: `p${i}@x.ie` })) }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_stage", id: "abcd", stage: "paused" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_end", id: "abcd", endsOn: "next week" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_end", id: "abcd", endsOn: "2026-12-20" }).ok).toBe(true);
    expect(readWorkspaceAction({ action: "seen", app: "nothing" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_logo", id: "abcd", logo: "data:image/svg+xml;base64,PHN2Zz4=" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_logo", id: "abcd", logo: null }).ok).toBe(true);
    expect(readWorkspaceAction({ action: "announce", title: "", body: "x" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "drop_tables" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "remove_announcement", id: "'; DROP TABLE x" }).ok).toBe(false);
  });

  it("lets every client ask about an app, and keeps the rest for Vardil staff", () => {
    expect(STAFF_ACTIONS.has("ask_app")).toBe(false);
    for (const a of ["set_client", "delete_client", "set_stage", "set_end", "set_logo", "sync_cloudflare", "announce", "remove_announcement", "handle_request"]) expect(STAFF_ACTIONS.has(a)).toBe(true);
    for (const a of ["visit", "seen"]) expect(STAFF_ACTIONS.has(a) || !VISIT_ACTIONS.has(a)).toBe(false);
    expect(readWorkspaceAction({ action: "ask_app", app: "invoicing", firm: "ABC" }).ok).toBe(true);
  });
});

describe("levels and demo status (decision 210)", () => {
  it("has the same levels as the sign-in page", () => {
    const fromPage: RoleKey[] = ROLES.map((r) => r.key);
    expect([...DEMO_LEVELS]).toEqual(fromPage);
    const check: DemoLevel = "md" satisfies RoleKey;
    expect(check).toBe("md");
  });

  it("keeps known levels in the page's order, and treats none as every level", () => {
    expect(readLevels(["client", "md", "bogus"])).toEqual(["md", "client"]);
    expect(readLevels([])).toEqual([...DEMO_LEVELS]);
    expect(readLevels("md")).toEqual([...DEMO_LEVELS]);
  });

  it("counts days across months and years", () => {
    expect(shiftDay("2026-11-20", 30)).toBe("2026-12-20");
    expect(shiftDay("2026-12-20", 30)).toBe("2027-01-19");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("knows Ireland's day, not the server's", () => {
    expect(irishToday(new Date("2026-11-20T23:30:00Z"))).toBe("2026-11-20");
    expect(irishToday(new Date("2026-06-20T23:30:00Z"))).toBe("2026-06-21");
  });

  it("says where a demo stands: open, ending within a week, ended, or closed", () => {
    expect(demoState("active", null, "2026-11-20")).toBe("open");
    expect(demoState("active", "2026-12-20", "2026-11-20")).toBe("open");
    expect(demoState("active", "2026-11-27", "2026-11-20")).toBe("ending");
    expect(demoState("active", "2026-11-20", "2026-11-20")).toBe("ending");
    expect(demoState("active", "2026-11-19", "2026-11-20")).toBe("ended");
    expect(demoState("won", "2026-12-20", "2026-11-20")).toBe("won");
    expect(demoState("lost", null, "2026-11-20")).toBe("lost");
  });

  it("lets people in on the last day, and not the day after or once closed", () => {
    expect(demoLive("active", "2026-11-20", "2026-11-20")).toBe(true);
    expect(demoLive("active", "2026-11-19", "2026-11-20")).toBe(false);
    expect(demoLive("won", null, "2026-11-20")).toBe(false);
    expect(demoLive("active", null, "2026-11-20")).toBe(true);
  });
});
