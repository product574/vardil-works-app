import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { rosterBlocker, rosterMessages } from "./roster-send";
import { nextWorkWeek } from "./week";

const DAY = "2026-11-19";
const { db } = buildSeed(DAY);
const week = nextWorkWeek(DAY);
const args = (connections: typeof db.connections) => ({ week, plan: db.plan, people: db.people, projects: db.projects, holidays: db.holidays, connections, firm: "ABC Construction" });

describe("the week's roster by email and WhatsApp", () => {
  it("needs email or WhatsApp connected first", () => {
    expect(rosterBlocker({})).toMatch(/Connections/);
    expect(rosterBlocker({ email: { provider: "Outlook", account: "office@abc.ie", at: "", by: "" } })).toBeNull();
    expect(rosterMessages(args({}))).toEqual([]);
  });

  it("gives each person planned that week their own days, by each channel connected", () => {
    const both = rosterMessages(args({ email: { provider: "Outlook", account: "o@x.ie", at: "", by: "" }, whatsapp: { number: "+353", at: "", by: "" } }));
    const planned = new Set(db.plan.filter((p) => week.includes(p.date)).map((p) => p.personId));
    expect(new Set(both.map((m) => m.personId))).toEqual(planned);
    const one = both.find((m) => m.via === "whatsapp")!;
    const person = db.people.find((p) => p.id === one.personId)!;
    expect(one.to).toBe(person.phone);
    expect(one.text).toContain(`Hi ${person.name.split(" ")[0]}`);
    expect(one.text.split("\n").filter((l) => /^(Monday|Tuesday|Wednesday|Thursday|Friday)/.test(l))).toHaveLength(5);
    const only = rosterMessages(args({ whatsapp: { number: "+353", at: "", by: "" } }));
    expect(only.every((m) => m.via === "whatsapp")).toBe(true);
    // No dashes in what goes out to people (house rule).
    expect(both.some((m) => /[–—]/.test(m.text))).toBe(false);
  });
});
