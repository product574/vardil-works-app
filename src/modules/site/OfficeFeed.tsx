/**
 * What the office receives (18 Nov, from the Secure-All build's Ops phone, at Oisin's word): beside
 * the site phone, live, everything the phones have sent since yesterday evening, newest first.
 * On top, "Needs a look": damage and defects, then vehicles whose driver has no driving check yet
 * today, once it is past 09:00 (src/lib/ops.ts). Each line opens the screen it belongs to.
 */
import { Broadcast, CarProfile, ClipboardText, Clock, HandPalm, IdentificationCard, Image, PlusCircle, Receipt, WarningCircle, Wrench } from "@phosphor-icons/react";
import { useAccess } from "@/data/access";
import { type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { nowStamp } from "@/data/actions";
import { useData, usePrefs } from "@/data/store";
import { addDays } from "@/lib/dates";
import { dFull, dShort } from "@/lib/format";
import { money2 } from "@/lib/money";
import { type FeedItem, type FeedKind, needsLook, officeFeed } from "@/lib/ops";
import { driverSiteOn } from "@/lib/roster";
import { cx } from "@/ui";

const FEED_ICON: Record<FeedKind, { icon: ReactNode; tone: string }> = {
  defect: { icon: <WarningCircle size={16} />, tone: "bg-warn-soft text-warn" },
  check: { icon: <ClipboardText size={16} />, tone: "bg-ok-soft text-ok" },
  damage: { icon: <CarProfile size={16} />, tone: "bg-bad-soft text-bad" },
  licence: { icon: <IdentificationCard size={16} />, tone: "bg-accent-soft text-accent-ink" },
  missed: { icon: <ClipboardText size={16} />, tone: "bg-warn-soft text-warn" },
  request: { icon: <HandPalm size={16} />, tone: "bg-accent-soft text-accent-ink" },
  photo: { icon: <Image size={16} />, tone: "bg-accent-soft text-accent-ink" },
  extra: { icon: <PlusCircle size={16} />, tone: "bg-warn-soft text-warn" },
  claim: { icon: <Clock size={16} />, tone: "bg-accent-soft text-accent-ink" },
  expense: { icon: <Receipt size={16} />, tone: "bg-accent-soft text-accent-ink" },
  repair: { icon: <Wrench size={16} />, tone: "bg-bad-soft text-bad" },
  cert: { icon: <IdentificationCard size={16} />, tone: "bg-accent-soft text-accent-ink" },
};

function FeedRow({ it, day }: { it: FeedItem; day: string }) {
  const body = (
    <>
      <span className="w-12 shrink-0 pt-px text-[0.93rem] text-muted tabular-nums">{it.kind === "missed" ? "Now" : it.at.slice(0, 10) === day ? it.at.slice(11, 16) : `${it.at.slice(11, 16)}*`}</span>
      <span className={cx("grid size-7 shrink-0 place-items-center rounded-full", FEED_ICON[it.kind].tone)}>{FEED_ICON[it.kind].icon}</span>
      <span className="min-w-0">
        <span className="font-semibold">{it.title}</span>
        <span className="block text-muted">{it.detail}</span>
      </span>
    </>
  );
  return it.to ? (
    <Link to={it.to} className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent-soft/40">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 px-4 py-2.5">{body}</div>
  );
}

/** The clock, read again every 30 seconds so a missed check shows when 09:00 passes. */
function useNow() {
  const [now, setNow] = useState(nowStamp);
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowStamp()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function OfficeFeed({ day }: { day: string }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const now = useNow();
  const apps = useAccess().apps;
  // Driving checks, damage and licences are Fleet's; extras and photos are Projects' (19 Nov).
  const fleet = apps.on("fleet");
  const projectsOn = apps.on("projects");
  const since = `${addDays(day, -1)}T17:00`;
  const person = (id: string | null | undefined) => db.people.find((p) => p.id === id)?.name ?? "Someone";
  const code = (id: string | null | undefined) => db.projects.find((p) => p.id === id)?.code ?? "";
  const siteOf = (vehicleId: string) => {
    const driverId = db.vehicles.find((v) => v.id === vehicleId)?.driverId;
    return driverId ? code(driverSiteOn(driverId, day, db.attendance, db.plan, db.projects)) : "";
  };
  const names = { reg: (id: string) => db.vehicles.find((v) => v.id === id)?.reg ?? "a vehicle", driver: person, siteOf };
  const licences = db.people.flatMap((p) => (["driving", "cpc"] as const).flatMap((k) => (p.licences?.[k]?.fromPhoneAt ? [{ driverId: p.id, which: k, at: p.licences[k]!.fromPhoneAt!, expiryDate: dFull(p.licences[k]!.expiryDate) }] : [])));
  // Everything else the phones send, worded for the feed.
  const other: FeedItem[] = [
    ...db.requests.filter((r) => r.createdAt >= since).map((r): FeedItem => ({ at: r.createdAt, kind: "request", title: `Request from ${r.requestedBy}${r.projectId ? `, ${code(r.projectId)}` : ""}`, detail: `${r.description}.${r.heldBy === "site" && projectsOn ? " With the site manager first." : ""}`, to: projectsOn ? "/projects/requests" : "/admin" })),
    ...db.repairs.filter((r) => r.at >= since && r.status !== "Fixed").map((r): FeedItem => ({ at: r.at, kind: "repair", title: `Repair reported, ${r.item.name}`, detail: `${r.where}: ${r.what} ${person(r.personId)}.`, to: "/admin/repairs" })),
    ...db.certSubmissions.filter((c) => c.sentAt >= since && c.status === "Waiting").map((c): FeedItem => ({ at: c.sentAt, kind: "cert", title: `Certificate sent, ${person(c.personId)}`, detail: `${c.name}, runs to ${dFull(c.expires)}. Waiting for a check.`, to: "/admin" })),
    ...db.variations.filter((v) => projectsOn && v.raisedAt >= since).map((v): FeedItem => ({ at: v.raisedAt, kind: "extra", title: `Extra work reported, ${code(v.projectId)}`, detail: `${v.description} ${person(v.raisedById)}.`, to: "/projects/extras" })),
    ...db.overtimeClaims.filter((c) => c.createdAt >= since).map((c): FeedItem => ({ at: c.createdAt, kind: "claim", title: `Overtime claimed, ${person(c.personId)}`, detail: `${c.hours} hours on ${code(c.projectId)}, ${dShort(c.date)}. ${projectsOn ? "With the site manager." : "Waiting in Admin."}`, to: projectsOn ? "/people/timesheet" : "/admin" })),
    ...db.expenses.filter((x) => x.createdAt >= since).map((x): FeedItem => ({ at: x.createdAt, kind: "expense", title: `Reimbursement claimed, ${person(x.personId)}`, detail: `${x.kind}, ${money2(x.amount, region)}. Waiting for the director.`, to: "/admin" })),
    ...db.activity.filter((a) => projectsOn && a.what === "Added a photo" && a.at >= since).map((a): FeedItem => ({ at: a.at, kind: "photo", title: `Photo, ${a.target}`, detail: `${a.who}.`, to: "/files/photos" })),
  ];
  const items = officeFeed({ checks: fleet ? db.vehicleChecks : [], damage: fleet ? db.damageReports.filter((d) => d.status === "New") : [], licences: fleet ? licences : [], other, ...names }, since);
  // Every vehicle with a driver who is not on leave today is expected to have its check.
  const away = (id: string) => db.holidays.some((h) => h.personId === id && h.status === "Approved" && day >= h.from && day <= h.to);
  const driving = db.vehicles.filter((v) => fleet && v.active && v.driverId && !away(v.driverId)).map((v) => ({ vehicleId: v.id, driverId: v.driverId!, site: siteOf(v.id) }));
  const look = needsLook(items, driving, { checks: db.vehicleChecks, ...names }, now);
  return (
    <section aria-label="What the office receives" className="w-full rounded-[10px] border border-line bg-surface">
      <h2 className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 text-[1.1rem]">
        <Broadcast size={20} className="text-accent-ink" /> What the office receives
        <span className="ml-auto font-sans text-[0.93rem] font-normal text-muted">Live, since yesterday evening</span>
      </h2>
      {look.length > 0 && (
        <div role="group" aria-label="Needs a look" className="border-t border-line bg-warn-soft/50">
          <p className="px-4 pt-2.5 text-[0.93rem] font-semibold">Needs a look ({look.length})</p>
          <ul className="pb-1">
            {look.slice(0, 8).map((it, i) => (
              <li key={`look-${it.kind}-${it.at}-${i}`}>
                <FeedRow it={it} day={day} />
              </li>
            ))}
          </ul>
          {look.length > 8 && <p className="px-4 pb-2.5 text-[0.87rem] text-muted">And {look.length - 8} more in the list below.</p>}
        </div>
      )}
      {items.length === 0 ? (
        <p className="border-t border-line px-4 py-3 text-muted">Nothing yet. Checks, damage reports, licences, requests, photos and extras from the phones show here as they happen.</p>
      ) : (
        <ul aria-label="Everything, newest first">
          {items.slice(0, 40).map((it, i) => (
            <li key={`${it.at}-${i}`} className="border-t border-line">
              <FeedRow it={it} day={day} />
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-line px-4 py-2 text-[0.87rem] text-muted">* yesterday evening.{fleet ? " Driving checks are expected by 09:00 on every vehicle with a driver." : ""}</p>
    </section>
  );
}
