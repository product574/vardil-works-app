/**
 * Vardil HQ (Vardil Works until 19 Nov): the level above the managing director, for Vardil's own people (19 Nov).
 *
 * Nothing about it may reach a demo client, so it is kept apart from the app in two ways:
 *
 *  1. Its screens live in their own files (`src/staff/`), built into a folder of their own
 *     (`/staff/`). On the hosted demo a second Cloudflare Access application guards that folder
 *     and lets in only Vardil email addresses (see README, "Vardil HQ"). A client who is let
 *     into the demo gets a refusal for those files, so their browser never holds the code.
 *  2. The app only asks for those files when the signed-in email ends in a Vardil domain, so a
 *     client's browser does not even try.
 *
 * Checking the email in the page is a courtesy, not the protection: anyone can edit page code in
 * their own browser. The protection is Cloudflare refusing the files.
 *
 * The staff files are built only for the hosted demo (VITE_LOGIN=access) or when a copy is built
 * with VITE_STAFF=1 (your own computer). Any other build, including the shareable single-file
 * preview, leaves them out entirely, so they cannot leak from it.
 */
import type { ComponentType } from "react";
import { authMode, isSignedIn, signedInEmail } from "./auth";
import { DEPARTMENTS } from "./departments";

export type StaffModule = typeof import("@/staff/entry");

/** Null in a build that leaves the staff files out. The condition is folded at build time, so the files are not even emitted then. */
export const staffEntry: (() => Promise<StaffModule>) | null = import.meta.env.VITE_LOGIN === "access" || import.meta.env.VITE_STAFF === "1" ? () => import("@/staff/entry") : null;

const DOMAINS = String(import.meta.env.VITE_STAFF_DOMAINS ?? "vardil.com")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** The pieces the shell draws for staff. Null for everyone else. */
export type StaffUi = { Bar: ComponentType; RoleEntry: ComponentType<{ onPick: () => void }> };

export const staff: { is: boolean; ui: StaffUi | null } = { is: false, ui: null };

/** Where an email is a Vardil one. Exported for tests. */
export const isStaffEmail = (email: string | null | undefined, domains: string[] = DOMAINS) => {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  return at > 0 && domains.includes(e.slice(at + 1));
};

/** Run once before the app is drawn. Decides whether this person is Vardil staff and, if so, fetches the staff files. */
export async function initStaff() {
  if (!staffEntry) return;
  if (authMode === "access") {
    if (!(await isSignedIn())) return;
    if (!isStaffEmail(signedInEmail())) return;
  }
  const TRIED = "cod.staffTry";
  try {
    const m = await staffEntry();
    try {
      sessionStorage.removeItem(TRIED);
    } catch {
      /* nothing to clear */
    }
    if (!DEPARTMENTS.some((d) => d.key === m.department.key)) DEPARTMENTS.splice(DEPARTMENTS.findIndex((d) => d.key === "admin") + 1, 0, m.department);
    staff.ui = { Bar: m.StaffBar, RoleEntry: m.StaffRoleEntry };
    staff.is = true;
  } catch {
    // The first time, Cloudflare may want this browser to pass through its sign-in for the staff folder, which a
    // script fetch cannot follow. So go there once as a page (public/staff/ready.html sends the browser back to the
    // role page). If it still fails, Cloudflare refused: carry on as an ordinary visitor.
    if (authMode !== "access") return;
    let tried = true;
    try {
      tried = sessionStorage.getItem(TRIED) === "1";
      if (!tried) sessionStorage.setItem(TRIED, "1");
    } catch {
      /* storage blocked: do not risk a loop */
    }
    if (!tried) {
      window.location.assign("/staff/ready.html");
      await new Promise(() => {});
    }
  }
}
