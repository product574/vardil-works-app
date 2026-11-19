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
