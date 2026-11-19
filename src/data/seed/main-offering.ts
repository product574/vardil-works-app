/**
 * Sample records for the main offering (19 Nov): repairs reported from the phone and
 * certificates sent from it, waiting for the office. No random numbers, so nothing else moves.
 */
import { addDays } from "@/lib/dates";
import type { CertSubmission, Db, RepairReport } from "../types";
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
