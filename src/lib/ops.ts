/**
 * What the office receives from the site phones, shown live beside the phone (18 Nov, from the
 * Secure-All build's Ops phone, at Oisin's word): drivers' checks and defects, damage reports,
 * licences sent, requests, photos, extras, overtime claims and reimbursements. Then "Needs a
 * look": damage and defects first, then vans whose driver is on a site today with no check yet.
 * Pure: no React, no store.
 */
import type { DamageReport, VehicleCheck } from "@/data/types";

export type FeedKind = "check" | "defect" | "damage" | "licence" | "missed" | "request" | "photo" | "extra" | "claim" | "expense" | "repair" | "cert";
export type FeedItem = { at: string; kind: FeedKind; title: string; detail: string; to?: string };

export type FeedInput = {
  checks: VehicleCheck[];
  damage?: DamageReport[];
  /** Licences drivers have sent from the phone that the office has not checked yet. */
  licences?: { driverId: string; which: "driving" | "cpc"; at: string; expiryDate: string }[];
  /** Anything else that came in from a phone, already worded (requests, photos, extras, claims). */
  other?: FeedItem[];
  reg: (vehicleId: string) => string;
  /** A person's name. */
  driver: (personId: string | null) => string;
  /** Where a vehicle is today, for the title: the site its driver is on, if any. */
  siteOf: (vehicleId: string) => string;
};

/** What the office has received since a moment, newest first. */
export function officeFeed(input: FeedInput, since: string): FeedItem[] {
  const items: FeedItem[] = (input.other ?? []).filter((x) => x.at >= since);
  const where = (vehicleId: string) => `${input.reg(vehicleId)}${input.siteOf(vehicleId) ? ` (${input.siteOf(vehicleId)})` : ""}`;
  for (const c of input.checks) {
    if (c.at < since) continue;
    if (c.defects.length) items.push({ at: c.at, kind: "defect", title: `Defect reported, ${where(c.vehicleId)}`, detail: `${c.defects.map((d) => `${d.item}: ${d.note}`).join("; ")}. ${input.driver(c.personId)}.`, to: `/fleet/vehicles/${c.vehicleId}` });
    else items.push({ at: c.at, kind: "check", title: `Driving check, ${where(c.vehicleId)}`, detail: `All OK. ${input.driver(c.personId)}.`, to: `/fleet/vehicles/${c.vehicleId}` });
  }
  for (const d of input.damage ?? []) {
    if (d.at < since) continue;
    items.push({ at: d.at, kind: "damage", title: `Damage reported, ${where(d.vehicleId)}`, detail: `${d.where}: ${d.note} ${input.driver(d.driverId)}, ${d.photos.length === 1 ? "1 photo" : `${d.photos.length} photos`}.`, to: `/fleet/damage?report=${d.id}` });
  }
  for (const l of input.licences ?? []) {
    if (l.at < since) continue;
    items.push({ at: l.at, kind: "licence", title: `New ${l.which === "cpc" ? "Driver CPC" : "driving licence"} sent, ${input.driver(l.driverId)}`, detail: `Runs to ${l.expiryDate}. It is on their record now, flagged to check.`, to: `/fleet/drivers?driver=${l.driverId}` });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** The driving check that counts for today: one on that vehicle today. Checks are newest first. */
export function checkToday(checks: VehicleCheck[], vehicleId: string, day: string): VehicleCheck | undefined {
  return checks.find((c) => c.vehicleId === vehicleId && c.at.slice(0, 10) === day);
}

/** The working day starts at 08:00; a missing check is flagged after an hour's grace. */
export const CHECK_BY = "09:00";

/**
 * What the office should look at first ("defects and missed checks first", as on Secure-All):
 * damage and defects that have come in, then vehicles whose driver is on a site today with no
 * driving check yet, once it is past 09:00. `driving` is each vehicle with its driver on a site today.
 */
export function needsLook(feed: FeedItem[], driving: { vehicleId: string; driverId: string; site: string }[], input: Pick<FeedInput, "checks" | "reg" | "driver">, now: string): FeedItem[] {
  // A repair reported from the phone needs a look too (19 Nov).
  const urgent = feed.filter((f) => f.kind === "damage" || f.kind === "defect" || f.kind === "repair");
  const day = now.slice(0, 10);
  const missed: FeedItem[] =
    now.slice(11, 16) < CHECK_BY
      ? []
      : driving
          .filter((s) => !checkToday(input.checks, s.vehicleId, day))
          .map((s) => ({ at: `${day}T08:00`, kind: "missed", title: `No driving check yet, ${input.reg(s.vehicleId)}`, detail: s.site ? `${input.driver(s.driverId)} is on ${s.site} today.` : `${input.driver(s.driverId)} drives it.`, to: `/fleet/vehicles/${s.vehicleId}` }));
  return [...urgent, ...missed];
}
