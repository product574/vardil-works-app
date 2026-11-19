import { describe, expect, it } from "vitest";
import { DEPARTMENTS } from "@/app/departments";
import { ALWAYS_ON, APP_KEYS, appsOff, clientKey, configFor, PACKAGES, packageOf, readWorkspaceAction, STAFF_ACTIONS } from "./apps";

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

describe("whose setting it is", () => {
  it("takes one email or a whole firm's domain, lower case", () => {
    expect(clientKey(" Susan@Ardmullen.IE ")).toBe("susan@ardmullen.ie");
    expect(clientKey("@oldstone.ie")).toBe("@oldstone.ie");
    for (const bad of ["", "oldstone", "@oldstone", "a b@x.ie", "x@y"]) expect(clientKey(bad)).toBeNull();
  });

  it("uses a person's own setting before their firm's", () => {
    const rows = [{ key: "@oldstone.ie", name: "Firm" }, { key: "majella@oldstone.ie", name: "Her own" }];
    expect(configFor("Majella@oldstone.ie", rows)?.name).toBe("Her own");
    expect(configFor("pat@oldstone.ie", rows)?.name).toBe("Firm");
    expect(configFor("pat@other.ie", rows)).toBeNull();
  });
});

describe("what may be sent to the server", () => {
  it("accepts a client's apps and adds the ones always on", () => {
    const r = readWorkspaceAction({ action: "set_client", key: "@oldstone.ie", name: "Oldstone", apps: ["schedule"], automations: true });
    expect(r.ok && r.act.action === "set_client" && r.act.apps).toEqual(expect.arrayContaining(["schedule", "dashboard", "admin", "settings"]));
  });

  it("refuses made-up apps, bad keys, empty announcements and unknown actions", () => {
    expect(readWorkspaceAction({ action: "set_client", key: "@oldstone.ie", name: "x", apps: ["vardil"] }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "set_client", key: "nobody", name: "x", apps: [] }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "announce", title: "", body: "x" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "drop_tables" }).ok).toBe(false);
    expect(readWorkspaceAction({ action: "remove_announcement", id: "'; DROP TABLE x" }).ok).toBe(false);
  });

  it("lets every client ask about an app, and keeps the rest for Vardil staff", () => {
    expect(STAFF_ACTIONS.has("ask_app")).toBe(false);
    for (const a of ["set_client", "delete_client", "announce", "remove_announcement", "handle_request"]) expect(STAFF_ACTIONS.has(a)).toBe(true);
    expect(readWorkspaceAction({ action: "ask_app", app: "invoicing", firm: "ABC" }).ok).toBe(true);
  });
});
