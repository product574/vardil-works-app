import { describe, expect, it } from "vitest";
import { addMinutes, checkCode, codesLeft, hashPassword, isLocked, maskPhone, onPhoneApp, passwordProblem, personByPhone, phoneDigits, phoneState, sessionOpen, triesLeft } from "./phone-auth";

const people = [
  { id: "a", name: "Eoin Brosnan", phone: "087 123 4567", active: true },
  { id: "b", name: "Left Firm", phone: "086 555 0000", active: false },
];

describe("phone numbers", () => {
  it("reads a number however it is typed", () => {
    expect(phoneDigits("087 123 4567")).toBe("0871234567");
    expect(phoneDigits("+353 87 123 4567")).toBe("0871234567");
    expect(phoneDigits("00353871234567")).toBe("0871234567");
    expect(phoneDigits("+44 7700 900123")).toBe("07700900123");
  });
  it("finds only an active person on the register", () => {
    expect(personByPhone(people, "+353871234567")?.id).toBe("a");
    expect(personByPhone(people, "086 555 0000")).toBeNull();
    expect(personByPhone(people, "087")).toBeNull();
    expect(personByPhone(people, "089 999 9999")).toBeNull();
  });
  it("masks the middle", () => {
    expect(maskPhone("087 123 4567")).toBe("087 *** 4567");
  });
});

describe("passwords", () => {
  it("needs 8 characters", () => {
    expect(passwordProblem("short1")).toMatch(/8 characters/);
  });
  it("refuses easy ones", () => {
    for (const p of ["password", "Password1", "12345678", "aaaaaaaa", "87654321", "qwertyuiop"]) expect(passwordProblem(p)).toMatch(/too easy/);
  });
  it("refuses the person's own name", () => {
    expect(passwordProblem("eoin2024!", "Eoin Brosnan")).toMatch(/name/);
  });
  it("takes a long ordinary one", () => {
    expect(passwordProblem("lime mortar gable", "Eoin Brosnan")).toBeNull();
    expect(passwordProblem("48291736")).toBeNull();
  });
  it("hashes with the person's id, so two people with one password differ", async () => {
    const a = await hashPassword("p-1", "lime mortar gable");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPassword("p-1", "lime mortar gable")).toBe(a);
    expect(await hashPassword("p-2", "lime mortar gable")).not.toBe(a);
  });
});

describe("codes, tries and sessions", () => {
  const now = "2026-11-20T10:00:00";
  it("allows 3 codes an hour", () => {
    expect(codesLeft(undefined, now)).toBe(3);
    expect(codesLeft({ codesSent: ["2026-11-20T09:10:00", "2026-11-20T09:40:00"] }, now)).toBe(1);
    expect(codesLeft({ codesSent: ["2026-11-20T09:10:00", "2026-11-20T09:40:00", "2026-11-20T09:50:00"] }, now)).toBe(0);
    expect(codesLeft({ codesSent: ["2026-11-20T08:10:00", "2026-11-20T08:40:00", "2026-11-20T08:50:00"] }, now)).toBe(3);
  });
  it("takes a code only in its 10 minutes", () => {
    const acc = { code: { code: "482913", sentAt: "2026-11-20T09:55:00", purpose: "setup" as const } };
    expect(checkCode(acc, "482 913", now)).toBe("ok");
    expect(checkCode(acc, "111111", now)).toBe("wrong");
    expect(checkCode(acc, "482913", addMinutes(now, 6))).toBe("expired");
    expect(checkCode({}, "482913", now)).toBe("none");
  });
  it("locks and counts tries", () => {
    expect(isLocked({ lockedUntil: "2026-11-20T10:15:00" }, now)).toBe(true);
    expect(isLocked({ lockedUntil: "2026-11-20T09:59:00" }, now)).toBe(false);
    expect(triesLeft({ failed: 3 })).toBe(2);
  });
  it("says where someone stands", () => {
    expect(phoneState(undefined, now)).toBe("not-invited");
    expect(phoneState({ personId: "a", invitedAt: now, codesSent: [], failed: 0 }, now)).toBe("invited");
    expect(phoneState({ personId: "a", invitedAt: now, passwordHash: "x", codesSent: [], failed: 0 }, now)).toBe("set-up");
    expect(phoneState({ personId: "a", invitedAt: now, passwordHash: "x", signedInUntil: "2026-12-20T10:00:00", codesSent: [], failed: 0 }, now)).toBe("signed-in");
    expect(sessionOpen({ signedInUntil: "2026-11-20T09:00:00" }, now)).toBe(false);
  });
  it("is for operatives and site managers only, for now", () => {
    expect(onPhoneApp({ kind: "Operative", active: true })).toBe(true);
    expect(onPhoneApp({ kind: "Management", level: "site", active: true })).toBe(true);
    expect(onPhoneApp({ kind: "Management", level: "accounts", active: true })).toBe(false);
    expect(onPhoneApp({ kind: "Operative", active: false })).toBe(false);
  });
});
