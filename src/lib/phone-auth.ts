/**
 * Signing in to the phone app (Oisin, 20 Nov). The number must be the one on the employee
 * register, the office sends the invite, the first time is a one-time code by text, then the
 * worker sets their own password. The rules he agreed: at least 8 characters with easy ones
 * refused, 5 wrong tries then a 15 minute lock, codes last 10 minutes and at most 3 an hour,
 * signed in for 30 days on the phone, and only the office changes a number.
 * Pure rules, no React or store. Stamps are "YYYY-MM-DDTHH:MM:SS" with no time zone.
 */
import type { PhoneAccount } from "@/data/types";

export const MIN_PASSWORD = 8;
export const MAX_TRIES = 5;
export const LOCK_MINUTES = 15;
export const CODE_MINUTES = 10;
export const CODES_PER_HOUR = 3;
export const SESSION_DAYS = 30;

/** A number as digits only, with Irish and UK country codes turned into the leading 0. */
export function phoneDigits(typed: string): string {
  let d = typed.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (d.startsWith("+353")) d = `0${d.slice(4)}`;
  else if (d.startsWith("+44")) d = `0${d.slice(3)}`;
  return d.replace(/\D/g, "");
}

/** The active person on the register with this number, or null. Needs at least 7 digits. */
export function personByPhone<P extends { phone: string; active: boolean }>(people: P[], typed: string): P | null {
  const d = phoneDigits(typed);
  if (d.length < 7) return null;
  return people.find((p) => p.active && phoneDigits(p.phone) === d) ?? null;
}

/** "087 *** 4567": enough to recognise, not enough to copy. */
export function maskPhone(phone: string): string {
  const d = phoneDigits(phone);
  if (d.length < 7) return phone;
  return `${d.slice(0, 3)} *** ${d.slice(-4)}`;
}

/** Passwords that are refused however long they are. Lower case; a real build checks a breached-password list on the server. */
const EASY = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890", "87654321",
  "qwertyui", "qwerty123", "qwertyuiop", "iloveyou", "letmein1", "welcome1", "welcome123", "abcdefgh", "abc12345",
  "football", "liverpool", "manchester", "construction", "building", "11111111", "00000000", "changeme", "secret123",
]);

/** Why a password will not do, in plain words, or null when it is fine. */
export function passwordProblem(password: string, name = ""): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  const lower = password.toLowerCase();
  if (EASY.has(lower) || /^(.)\1+$/.test(password) || (/^\d+$/.test(password) && isRun(password))) return "That password is too easy to guess. Try three words you will remember.";
  const first = name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.length >= 3 && lower.includes(first)) return "Do not use your own name in it.";
  return null;
}

function isRun(digits: string) {
  const up = "01234567890123456789";
  const down = "98765432109876543210";
  return up.includes(digits) || down.includes(digits);
}

/** A stamp moved on by some minutes. */
export function addMinutes(stamp: string, minutes: number): string {
  return new Date(new Date(`${stamp}Z`).getTime() + minutes * 60_000).toISOString().slice(0, 19);
}

/** How many more codes may be sent in the hour before `now`. */
export function codesLeft(acc: Pick<PhoneAccount, "codesSent"> | undefined, now: string): number {
  const since = addMinutes(now, -60);
  return Math.max(0, CODES_PER_HOUR - (acc?.codesSent ?? []).filter((s) => s > since).length);
}

export type CodeCheck = "ok" | "wrong" | "expired" | "none";

/** Whether a typed code is the one sent, and still in its 10 minutes. */
export function checkCode(acc: Pick<PhoneAccount, "code"> | undefined, typed: string, now: string): CodeCheck {
  const c = acc?.code;
  if (!c) return "none";
  if (addMinutes(c.sentAt, CODE_MINUTES) < now) return "expired";
  return typed.replace(/\D/g, "") === c.code ? "ok" : "wrong";
}

export function isLocked(acc: Pick<PhoneAccount, "lockedUntil"> | undefined, now: string): boolean {
  return !!acc?.lockedUntil && acc.lockedUntil > now;
}

export function triesLeft(acc: Pick<PhoneAccount, "failed"> | undefined): number {
  return Math.max(0, MAX_TRIES - (acc?.failed ?? 0));
}

export function sessionOpen(acc: Pick<PhoneAccount, "signedInUntil"> | undefined, now: string): boolean {
  return !!acc?.signedInUntil && acc.signedInUntil > now;
}

/** Where someone stands with the app, as the employee register shows it. */
export type PhoneState = "not-invited" | "invited" | "set-up" | "signed-in";

export function phoneState(acc: PhoneAccount | undefined, now: string): PhoneState {
  if (!acc?.invitedAt) return "not-invited";
  if (!acc.passwordHash) return "invited";
  return sessionOpen(acc, now) ? "signed-in" : "set-up";
}

export const PHONE_STATE_LABEL: Record<PhoneState, string> = {
  "not-invited": "Not invited",
  invited: "Invited, not set up",
  "set-up": "Set up, signed out",
  "signed-in": "Signed in",
};

/** Who gets the app for now: operatives and site managers (office staff later, Oisin, 20 Nov). */
export function onPhoneApp(p: { kind: string; level?: string; isSiteManager?: boolean; active: boolean }): boolean {
  return p.active && (p.kind === "Operative" || p.level === "site" || !!p.isSiteManager);
}

/** The password, hashed with the person's id. REAL BUILD: a slow hash (Argon2 or bcrypt) on the server. */
export async function hashPassword(personId: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${personId}:${password}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
