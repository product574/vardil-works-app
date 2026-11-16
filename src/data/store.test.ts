import { describe, expect, it } from "vitest";
import { DEFAULT_BRAND } from "@/config/brand";
import { useData, usePrefs } from "./store";

describe("preferences and sample data are kept apart", () => {
  it("follows the brand file until something is edited, then keeps only the edit", () => {
    expect(usePrefs.getState().brand).toEqual(DEFAULT_BRAND);
    usePrefs.getState().setBrand({ accent: "#225544" });
    expect(usePrefs.getState().brandEdits).toEqual({ accent: "#225544" });
    expect(usePrefs.getState().brand.brandName).toBe(DEFAULT_BRAND.brandName);
    usePrefs.getState().resetBrand();
    expect(usePrefs.getState().brand).toEqual(DEFAULT_BRAND);
  });

  it("resetting the demo data leaves preferences alone", () => {
    usePrefs.getState().setTheme("dark");
    usePrefs.getState().setRole("accounts");
    const before = useData.getState().db.approvals.length;
    useData.getState().mutate((db) => {
      db.approvals.pop();
    });
    expect(useData.getState().db.approvals.length).toBe(before - 1);
    useData.getState().reset();
    expect(useData.getState().db.approvals.length).toBe(before);
    expect(usePrefs.getState().theme).toBe("dark");
    expect(usePrefs.getState().role).toBe("accounts");
  });

  it("uses the brand's email domain for the invented staff", () => {
    expect(useData.getState().db.people[0]!.email.endsWith(`@${DEFAULT_BRAND.emailDomain}`)).toBe(true);
  });
});
