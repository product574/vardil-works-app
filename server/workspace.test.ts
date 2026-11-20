import { describe, expect, it } from "vitest";
import { isStaff, staffDomains } from "./workspace";

describe("who is Vardil staff on the server", () => {
  it("is decided by the signed-in email's domain, vardil.com unless set", () => {
    const d = staffDomains(undefined);
    expect(isStaff("Oisin@Vardil.com", d)).toBe(true);
    expect(isStaff("x@vardil.com.evil.io", d)).toBe(false);
    expect(isStaff("x@notvardil.com", d)).toBe(false);
    expect(isStaff("client@acme.ie", d)).toBe(false);
    expect(isStaff("a@vardkey.com", staffDomains("vardil.com, vardkey.com"))).toBe(true);
  });
});

import { activityOf } from "./workspace";

describe("what each prospect did (decision 210)", () => {
  it("sums days, visits, apps by day and levels used, and leaves out other people", () => {
    const rows = [
      { email: "a@x.ie", day: "2026-11-18", first_at: "2026-11-18T09:00:00Z", last_at: "2026-11-18T09:40:00Z", visits: 1, apps: '["schedule","people"]', levels: '["md"]' },
      { email: "a@x.ie", day: "2026-11-20", first_at: "2026-11-20T08:00:00Z", last_at: "2026-11-20T15:10:00Z", visits: 2, apps: '["schedule","bogus"]', levels: '["site","nope"]' },
      { email: "b@x.ie", day: "2026-11-20", first_at: "2026-11-20T10:00:00Z", last_at: "2026-11-20T10:05:00Z", visits: 1, apps: "[]", levels: "[]" },
    ];
    const [a, c] = activityOf(["a@x.ie", "c@x.ie"], rows);
    expect(a).toEqual({ email: "a@x.ie", firstAt: "2026-11-18T09:00:00Z", lastAt: "2026-11-20T15:10:00Z", days: 2, visits: 3, apps: { schedule: 2, people: 1 }, levels: ["md", "site"] });
    expect(c).toEqual({ email: "c@x.ie", firstAt: null, lastAt: null, days: 0, visits: 0, apps: {}, levels: [] });
  });
});
