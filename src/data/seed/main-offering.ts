/**
 * Sample records for the main offering (19 Nov): repairs reported from the phone and
 * certificates sent from it, waiting for the office. No random numbers, so nothing else moves.
 */
import { addDays } from "@/lib/dates";
import { onPhoneApp } from "@/lib/phone-auth";
import type { CertSubmission, Db, PhoneAccount, RepairReport } from "../types";
import { at, workdays } from "./util";

export function seedRepairs(db: Db, today: string): RepairReport[] {
  const plant = (ref: string) => db.plant.find((p) => p.assetRef === ref);
  const van = db.vehicles.find((v) => v.active && v.driverId);
  const site = (code: string) => db.projects.find((p) => p.code === code);
  const out: RepairReport[] = [];
  const hoist = plant("HS1");
  if (hoist)
    out.push({ id: "rep-3", personId: "p-109", item: { kind: "plant", refId: hoist.id, name: `${hoist.name} (${hoist.assetRef})` }, where: site("C721") ? `${site("C721")!.code} ${site("C721")!.name}` : "On site", what: "Hoist cuts out half way up with a load on. Has been tagged out of use.", photos: [], at: at(today, "08:20"), status: "Reported", steps: [] });
  const gen = plant("GN1");
  if (gen)
    out.push({ id: "rep-2", personId: "p-103", item: { kind: "plant", refId: gen.id, name: `${gen.name} (${gen.assetRef})` }, where: site("C719") ? `${site("C719")!.code} ${site("C719")!.name}` : "On site", what: "Pull cord snapped. Generator will not start.", photos: [], at: at(workdays(today, -1), "15:40"), status: "In hand", steps: [{ status: "In hand", at: at(today, "07:45"), by: "Pat Scully", note: "New cord ordered, fitting it at the yard tomorrow. Taking GN2 out instead." }] });
  if (van)
    out.push({ id: "rep-1", personId: van.driverId!, item: { kind: "vehicle", refId: van.id, name: `${van.reg}, ${van.make} ${van.model}` }, where: "Oranmore yard", what: "Passenger wing mirror cracked.", photos: [], at: at(workdays(today, -4), "17:05"), status: "Fixed", steps: [{ status: "In hand", at: at(workdays(today, -3), "09:10"), by: "Pat Scully" }, { status: "Fixed", at: at(workdays(today, -2), "14:30"), by: "Pat Scully", note: "Mirror glass replaced at the yard." }] });
  return out;
}

export function seedCertSubmissions(db: Db, today: string): CertSubmission[] {
  const p = db.people.find((x) => x.id === "p-106");
  const c = p?.certs.find((x) => x.name === "Manual handling") ?? p?.certs[0];
  if (!p || !c) return [];
  return [{ id: "cs-1", personId: p.id, kind: "ticket", certId: c.id, name: c.name, expires: addDays(today, 3 * 365), photo: { name: `${c.name}, ${p.name}.jpg`, dataUrl: "" }, sentAt: at(today, "07:30"), status: "Waiting" }];
}

/**
 * The phone app's sign-ins (20 Nov): everyone on it was invited three weeks ago and has set it
 * up, with a password nobody knows ("seed": reset it with a code), and most are signed in. Two
 * are not, so the office has something to do: the last operative alphabetically has not been
 * invited, and the one before has an invite but has not set up.
 */
export function seedPhoneAccounts(db: Db, today: string): PhoneAccount[] {
  const on = db.people.filter(onPhoneApp).sort((a, b) => a.name.localeCompare(b.name));
  const ops = on.filter((p) => p.kind === "Operative");
  const notInvited = ops[ops.length - 1]?.id;
  const notSetUp = ops[ops.length - 2]?.id;
  const invited = at(workdays(today, -15), "16:30");
  return on
    .filter((p) => p.id !== notInvited)
    .map((p): PhoneAccount => {
      if (p.id === notSetUp) return { personId: p.id, invitedAt: at(workdays(today, -1), "11:05"), invitedBy: "Aidan King", codesSent: [], failed: 0 };
      return {
        personId: p.id,
        invitedAt: invited,
        invitedBy: "Aidan King",
        passwordHash: "seed",
        setUpAt: at(workdays(today, -14), "07:40"),
        codesSent: [],
        failed: 0,
        signedInUntil: at(addDays(today, 20), "07:30"),
        lastSignIn: at(addDays(today, -10), "07:30"),
      };
    });
}
