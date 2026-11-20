import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/app/departments";
import { ALWAYS_ON, APP_KEYS, appsOff, brandOfLook, cleanEmail, clientOf, PACKAGES, packageOf, readLogo, readLook, readWorkspaceAction, sampleDomain, splitEmails, STAFF_ACTIONS, starterLook } from "./apps";

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
    const rows = [{ name: "Oldstone", emails: ["majella@oldstone.ie"] }, { name: "Other", emails: ["pat@other.ie"] }];
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
    const r = readWorkspaceAction({ action: "set_client", id: null, name: "Oldstone", emails: ["Majella@oldstone.ie", "majella@oldstone.ie"], apps: ["schedule"], automations: true, look: LOOK });
    expect(r.ok && r.act.action === "set_client" && r.act.apps).toEqual(expect.arrayContaining(["schedule", "dashboard", "admin", "settings"]));
    expect(r.ok && r.act.action === "set_client" && r.act.emails).toEqual(["majella@oldstone.ie"]);
  });

  it("refuses made-up apps, a domain in place of an email, a bad id, a bad look, empty announcements and unknown actions", () => {
    const base = { action: "set_client", id: null, name: "x", emails: [], apps: [], look: LOOK };
    expect(readWorkspaceAction({ ...base, apps: ["vardil"] }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, emails: ["@oldstone.ie"] }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, id: "'; DROP" }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, look: { ...LOOK, accent: "x" } }).ok).toBe(false);
    expect(readWorkspaceAction({ ...base, emails: Array.from({ length: 201 }, (_, i) => `p${i}@x.ie`) }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_logo", id: "abcd", logo: "data:image/svg+xml;base64,PHN2Zz4=" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_logo", id: "abcd", logo: null }).ok).toBe(true);
    expect(readWorkspaceAction({ action: "announce", title: "", body: "x" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "drop_tables" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "remove_announcement", id: "'; DROP TABLE x" }).ok).toBe(false);
  });

  it("lets every client ask about an app, and keeps the rest for Vardil staff", () => {
    expect(STAFF_ACTIONS.has("ask_app")).toBe(false);
    for (const a of ["set_client", "delete_client", "set_logo", "sync_cloudflare", "announce", "remove_announcement", "handle_request"]) expect(STAFF_ACTIONS.has(a)).toBe(true);
    expect(readWorkspaceAction({ action: "ask_app", app: "invoicing", firm: "ABC" }).ok).toBe(true);
  });
});
