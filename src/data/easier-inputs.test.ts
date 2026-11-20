import { describe, expect, it } from "vitest";
import { APPS } from "@/app/apps";
import { DEPARTMENTS } from "@/app/departments";
import { APP_KEYS, OFFERED_LEVELS, PACKAGES, packageOf, PAUSED_APPS, PORTAL, SOLD_APPS } from "@/lib/apps";
import { rosterBlocker } from "@/lib/roster-send";
import { buildSeed } from "./seed";

const { db } = buildSeed("2026-11-20");

/**
 * The round of 20 Nov that made the demo easier to put things into (decisions 230 to 238): what
 * went (Admin, Connections; the Portal, for now; the Opened stage) and what the sample data has to
 * look like for the screens to tell one story about how each record gets in.
 */
describe("what went on 20 Nov, and the sample data that follows from it", () => {
  it("Connections is not in Admin, and email and WhatsApp are set up from the start", () => {
    const admin = DEPARTMENTS.find((d) => d.key === "admin")!;
    expect(admin.groups.flatMap((g) => g.items).some((i) => i.to === "/admin/connections" || i.label === "Connections")).toBe(false);
    expect(rosterBlocker(db.connections)).toBeNull();
    expect([db.connections.email?.by, db.connections.whatsapp?.by]).toEqual(["Vardil", "Vardil"]);
    expect(db.connections.email!.account).toMatch(/^office@/);
  });

  it("the Portal is paused: in no package, not sold, no client sign-in level, and nothing in the sample data came through it", () => {
    expect(PAUSED_APPS).toEqual(["portal"]);
    expect(PORTAL).toBe(false);
    expect(PACKAGES.every((p) => !p.apps.includes("portal"))).toBe(true);
    expect(SOLD_APPS).not.toContain("portal");
    expect(OFFERED_LEVELS).toEqual(["md", "contracts", "site", "accounts", "operative"]);
    // A package is recognised with or without the paused app in the list it is given.
    expect(packageOf([...APP_KEYS], true)?.key).toBe("full");
    expect(packageOf(APP_KEYS.filter((k) => k !== "portal"), true)?.key).toBe("full");
    expect(db.supplierInvoices.some((s) => s.via === "portal")).toBe(false);
    expect(db.salesInvoices.some((i) => (i.sentVia ?? []).includes("portal"))).toBe(false);
    expect(db.invoiceQueries.some((q) => q.via === "Portal")).toBe(false);
    expect(db.subcontractors.flatMap((s) => s.papers).some((p) => p.via === "Portal")).toBe(false);
    expect(db.automations.some((a) => a.department === "portal")).toBe(false);
    expect(db.mails.some((m) => /in your (client )?portal/.test(m.body))).toBe(false);
  });

  it("the Portal section is still on the map, so taking it off the paused list is all it takes to bring it back", () => {
    expect(APPS.find((a) => a.key === "projects")!.sections.map((s) => s.key)).toContain("portal");
  });

  it("no tender is Opened, and none carries a time it was opened", () => {
    expect(new Set(db.quotes.map((q) => q.status))).toEqual(new Set(["Draft", "Awaiting approval", "Sent", "Queried", "Accepted", "Declined"]));
    expect(db.quotes.some((q) => "openedAt" in q)).toBe(false);
    expect(db.quotes.filter((q) => q.status === "Sent").length).toBeGreaterThanOrEqual(4);
  });

  it("no invoice arrives unread by itself: every one in Money out has been added and read", () => {
    expect(db.supplierInvoices.some((s) => s.readStatus === "not_read")).toBe(false);
    expect(db.supplierInvoices.filter((s) => s.readStatus === "needs_review" && !s.askedAt && !s.sentBack).every((s) => s.lines.length > 0)).toBe(true);
  });
});
