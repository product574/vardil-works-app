import { beforeEach, describe, expect, it } from "vitest";
import { actAs, decideExpense, enterPhoneCode, invitePhone, sendPhoneCode, setEmployeeActive, setPersonPhone, setPhonePassword, signOutEverywhere, tryPhonePassword } from "./actions";
import { useData } from "./store";
import { hashPassword, onPhoneApp, phoneState } from "@/lib/phone-auth";

const db = () => useData.getState().db;
const acc = (id: string) => db().phoneAccounts.find((a) => a.personId === id);
const NOW = "2026-11-20T10:00:00";

describe("the phone app's sign-in (20 Nov)", () => {
  beforeEach(() => useData.getState().reset());

  it("seeds two people for the office to deal with, and the rest signed in", () => {
    const on = db().people.filter(onPhoneApp);
    const states = on.map((p) => phoneState(acc(p.id), NOW));
    expect(states.filter((s) => s === "not-invited")).toHaveLength(1);
    expect(states.filter((s) => s === "invited")).toHaveLength(1);
    expect(states.filter((s) => s === "signed-in").length).toBe(on.length - 2);
  });

  it("goes invite, code, password, then signs in for 30 days", async () => {
    const p = db().people.filter(onPhoneApp).find((x) => !acc(x.id))!;
    invitePhone(p.id);
    expect(phoneState(acc(p.id), NOW)).toBe("invited");
    const code = sendPhoneCode(p.id, "setup")!;
    expect(code).toMatch(/^\d{6}$/);
    expect(setPhonePassword(p.id, "x")).toBe(false); // not before the code
    expect(enterPhoneCode(p.id, "000000")).toBe(code === "000000" ? "ok" : "wrong");
    expect(enterPhoneCode(p.id, code)).toBe("ok");
    const hash = await hashPassword(p.id, "lime mortar gable");
    expect(setPhonePassword(p.id, hash)).toBe(true);
    expect(acc(p.id)!.signedInUntil! > acc(p.id)!.lastSignIn!).toBe(true);
    signOutEverywhere(p.id);
    expect(acc(p.id)!.signedInUntil).toBeUndefined();
    expect(tryPhonePassword(p.id, "wrong")).toMatchObject({ ok: false, left: 4 });
    expect(tryPhonePassword(p.id, hash)).toEqual({ ok: true });
  });

  it("locks after 5 wrong passwords, and allows 3 codes an hour", () => {
    const p = db().people.filter(onPhoneApp).find((x) => acc(x.id)?.passwordHash === "seed")!;
    for (let i = 0; i < 4; i++) expect(tryPhonePassword(p.id, "nope").ok).toBe(false);
    expect(tryPhonePassword(p.id, "nope")).toMatchObject({ ok: false, locked: true });
    expect(tryPhonePassword(p.id, "seed")).toMatchObject({ ok: false, locked: true });
    expect(sendPhoneCode(p.id, "reset")).not.toBeNull();
    expect(sendPhoneCode(p.id, "reset")).not.toBeNull();
    expect(sendPhoneCode(p.id, "reset")).not.toBeNull();
    expect(sendPhoneCode(p.id, "reset")).toBeNull();
  });

  it("signs out when the office changes the number or archives the person", () => {
    const [a, b] = db().people.filter(onPhoneApp).filter((x) => acc(x.id)?.signedInUntil);
    expect(setPersonPhone(a!.id, b!.phone)).toMatch(/Someone else/);
    expect(setPersonPhone(a!.id, "089 400 1234")).toBeNull();
    expect(acc(a!.id)!.signedInUntil).toBeUndefined();
    setEmployeeActive(b!.id, false);
    expect(acc(b!.id)!.signedInUntil).toBeUndefined();
  });

  it("puts a site manager's yes on the office's list to pay, in his name", () => {
    const x = db().expenses.find((e) => e.status === "Waiting")!;
    const sm = db().people.find((p) => p.level === "site")!;
    actAs(sm.id, () => decideExpense(x.id, true));
    const after = db().expenses.find((e) => e.id === x.id)!;
    expect(after.status).toBe("Approved");
    expect(after.decidedBy).toBe(sm.name);
    expect(after.paidAt).toBeUndefined();
  });
});
