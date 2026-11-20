import { afterEach, describe, expect, it, vi } from "vitest";
import { alertsOn, sendAlert, signInAlert } from "./alerts";

const ENV = { ALERT_TO: "hello@vardil.com", ALERT_FROM: "demo@vardil.com", CF_API_TOKEN: "tok", CF_ACCOUNT_ID: "acc", CF_API_BASE: "https://cf.test/v4" };
afterEach(() => vi.unstubAllGlobals());

describe("the email to Vardil when a prospect opens their demo", () => {
  it("is on only with an address to send to, one to send from, an account and a key", () => {
    expect(alertsOn(ENV)).toBe(true);
    expect(alertsOn({ ...ENV, ALERT_TO: "" })).toBe(false);
    expect(alertsOn({ ...ENV, CF_API_TOKEN: "", ALERT_API_TOKEN: "other" })).toBe(true);
  });

  it("says who and which client", () => {
    const a = signInAlert("majella@oldstone.ie", "Oldstone", "https://demo.vardil.com");
    expect(a.subject).toBe("Oldstone: majella@oldstone.ie opened their demo");
    expect(a.text).toContain("https://demo.vardil.com/vardil/clients");
  });

  it("goes through Cloudflare's Email Service, and a failure only returns false", async () => {
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: new Headers(init.headers).get("authorization") });
      return new Response("{}", { status: calls.length === 1 ? 200 : 500 });
    });
    expect(await sendAlert(ENV, "S", "T")).toBe(true);
    expect(calls[0]).toEqual({ url: "https://cf.test/v4/accounts/acc/email/sending/send", body: { to: "hello@vardil.com", from: "demo@vardil.com", subject: "S", text: "T" }, auth: "Bearer tok" });
    expect(await sendAlert(ENV, "S", "T")).toBe(false);
    expect(await sendAlert({}, "S", "T")).toBe(false);
    expect(calls.length).toBe(2);
  });
});
