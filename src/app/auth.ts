/**
 * Who may open the demo.
 *
 * Two modes, chosen when the site is built (see .env.example):
 *  - "access": the hosted demo (`npm run build:cloudflare`). Cloudflare Access stands in front
 *    of every address and asks for a one-time code, emailed to an approved address, before a
 *    single file is sent. The app never handles a password. It asks Cloudflare who is signed in
 *    (`/cdn-cgi/access/get-identity`) to show their email, and as a tripwire: if Cloudflare
 *    cannot say, the sign-in has run out or this copy is not behind Access, and the demo stays
 *    shut.
 *  - "local": your own machine, the browser tests and the single-file preview. The username
 *    and a hash of the password are compiled into the page, so anyone who reads the code can
 *    get past it. Never use it on the public internet (`npm run build` refuses).
 *
 * Roles are chosen afterwards on the mock sign-in page and carry no security weight at all.
 */
const env = import.meta.env;
export const authMode: "access" | "local" = (env.VITE_LOGIN as string | undefined)?.trim() === "access" ? "access" : "local";
const USERNAME = ((env.VITE_DEMO_USERNAME as string | undefined)?.trim() || "demo").toLowerCase();
const PASSWORD_HASH = (env.VITE_DEMO_PASSWORD_SHA256 as string | undefined)?.trim().toLowerCase();

/** True when nobody has set a password yet, so the sign-in page can show the default. */
export const usingDefaultLogin = authMode === "local" && !PASSWORD_HASH;

/** Cloudflare Access answers these two addresses on every hostname it protects. */
const IDENTITY_URL = "/cdn-cgi/access/get-identity";
const LOGOUT_URL = "/cdn-cgi/access/logout";
const GATE_KEY = "cod.gate";

let memoryPass = false;
let identity: Promise<string | null> | null = null;
let knownEmail: string | null = null;

/** Asks Cloudflare once per page load who is signed in. Null when it cannot say. */
function accessIdentity(): Promise<string | null> {
  identity ??= (async () => {
    try {
      const res = await fetch(IDENTITY_URL, { credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
      const body = (await res.json()) as { email?: unknown };
      knownEmail = typeof body.email === "string" && body.email.includes("@") ? body.email : null;
      return knownEmail;
    } catch {
      return null;
    }
  })();
  return identity;
}

/** The email Cloudflare signed this person in with, once known (Access mode only). */
export function signedInEmail() {
  return knownEmail;
}

async function sha256(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type SignInResult = { ok: true } | { ok: false; message: string };
const WRONG = "That username or password is not right. Check the details you were sent and try again.";

/** The local-mode password check. In Access mode Cloudflare signs people in, not the app. */
export async function signIn(username: string, password: string): Promise<SignInResult> {
  if (authMode === "access") return { ok: false, message: "Reload the page to sign in with your email." };
  if (!username.trim() || !password) return { ok: false, message: "Enter the username and password you were sent." };
  if (username.trim().toLowerCase() !== USERNAME) return { ok: false, message: WRONG };

  const ok = PASSWORD_HASH ? (await sha256(password)) === PASSWORD_HASH : password === "demo";
  if (!ok) return { ok: false, message: WRONG };
  try {
    sessionStorage.setItem(GATE_KEY, "1");
  } catch {
    /* storage blocked: the session simply will not survive a refresh */
  }
  memoryPass = true;
  return { ok: true };
}

export async function isSignedIn(): Promise<boolean> {
  if (authMode === "access") return (await accessIdentity()) !== null;
  if (memoryPass) return true;
  try {
    return sessionStorage.getItem(GATE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Signs out. In Access mode this hands over to Cloudflare, which ends the sign-in and shows its
 * own signed-out page, so the caller should not navigate anywhere itself ("left").
 */
export async function signOut(): Promise<"left" | "signed-out"> {
  memoryPass = false;
  try {
    sessionStorage.removeItem(GATE_KEY);
  } catch {
    /* nothing to clear */
  }
  if (authMode === "access") {
    window.location.assign(LOGOUT_URL);
    return "left";
  }
  return "signed-out";
}
