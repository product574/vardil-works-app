import { useState } from "react";
import { useAccess } from "@/data/access";
import { actAs, claimOvertime, decideOvertimeClaim } from "@/data/actions";
import { useData } from "@/data/store";
import type { OvertimeClaim, Person, Project } from "@/data/types";
import { bankHolidayOn, isBankHoliday, restDayKindOf } from "@/lib/bank-holidays";
import { addDays, weekStartOf } from "@/lib/dates";
import { dWeekday, plural, whenInline } from "@/lib/format";
import { EARLY_START_NOTE, overtimeText, REST_DAY_RULE } from "@/lib/overtime";
import { claimDays, claimHours, hoursText, type HoursWeek, hoursWeek, suggestedSplit } from "@/lib/overtime-claims";
import { weekExported } from "@/lib/payroll";
import { siteOn } from "@/lib/roster";
import { attendanceShort } from "@/lib/week";
import { Badge, Button, DeclineNote, Dialog, Field, NumInput } from "@/ui";
import { toast } from "@/ui/toast";

const hrs = (n: number) => `${n} ${n === 1 ? "hour" : "hours"}`;

/** A claim's state as whoever made it reads it. */
function ClaimState({ c }: { c: OvertimeClaim }) {
  if (c.status === "Waiting") return <Badge tone="accent">Waiting for your site manager</Badge>;
  if (c.status === "Approved")
    return (
      <span className="text-[0.93rem] text-ok">
        Approved by {c.decidedBy}: {overtimeText({ overtimeHours: c.overtimeHours ?? 0, doubleHours: c.doubleHours ?? 0 })}. It is on your timesheet.
      </span>
    );
  return (
    <span className="text-[0.93rem] text-muted">
      Declined by {c.decidedBy}.
      <DeclineNote note={c.declineNote} />
    </span>
  );
}

/**
 * My hours and overtime, on the operative's phone (Oisin, 17 Nov, round ten): what the
 * timesheets hold for them this week so far and last week, to check it is right, and a way to
 * claim overtime that is missing. Hours only, no pay. In English, like the driving check.
 */
export function HoursSheet({ me, day, onClose }: { me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  // The day a claim is being made for; an empty string opens the form on today.
  const [claiming, setClaiming] = useState<string | null>(null);
  const thisWeek = hoursWeek(db.attendance, me.id, day, day);
  const lastSunday = addDays(weekStartOf(day), -1);
  const lastWeek = hoursWeek(db.attendance, me.id, lastSunday, lastSunday);
  const canClaim = new Set(claimDays(day));
  const mine = db.overtimeClaims.filter((c) => c.personId === me.id && c.date >= addDays(day, -14)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const waitingOn = (date: string) => mine.some((c) => c.date === date && c.status === "Waiting");
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const onLeave = (date: string) => db.holidays.some((h) => h.personId === me.id && h.status === "Approved" && date >= h.from && date <= h.to);
  const week = (title: string, w: HoursWeek) => (
    <section aria-label={title}>
      <h3 className="mb-1 text-base">{title}</h3>
      {w.days.length === 0 ? (
        <p className="text-muted">Nothing yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label={`${title}, day by day`}>
          {w.days.map((d) => (
            <li key={d.date} className="flex items-center gap-2 px-3 py-2">
              <span className="w-[5.5rem] shrink-0 text-[0.93rem] text-muted">{dWeekday(d.date)}</span>
              <span className="min-w-0 flex-1">
                {d.entries.length === 0 ? (
                  <span className="text-muted">{onLeave(d.date) ? "Leave" : isBankHoliday(db.bankHolidays, d.date) ? `${bankHolidayOn(db.bankHolidays, d.date)?.name}, not worked` : d.date === day ? "Not marked yet" : "Not marked in"}</span>
                ) : (
                  d.entries.map((e) => (
                    <span key={e.projectId} className="block">
                      <span className="font-medium">{code(e.projectId)}</span> {hoursText(e)}
                    </span>
                  ))
                )}
                {waitingOn(d.date) && <span className="block text-[0.87rem] text-accent-ink">Overtime claim waiting</span>}
              </span>
              {canClaim.has(d.date) && !waitingOn(d.date) && (
                <Button size="sm" aria-label={`Claim overtime for ${dWeekday(d.date)}`} onClick={() => setClaiming(d.date)}>
                  Claim
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1.5 text-[0.93rem]" aria-label={`${title}, totals`}>
        <span className="font-medium">{hrs(w.total)}</span> in all: {hrs(w.basic)} basic{w.timeAndHalf > 0 ? `, ${hrs(w.timeAndHalf)} at time and a half` : ""}
        {w.double > 0 ? `, ${hrs(w.double)} at double time` : ""}.
      </p>
    </section>
  );
  return (
    <>
      <Dialog open onClose={onClose} title="My hours and overtime">
        <div className="grid gap-4" lang="en">
          <p className="text-[0.93rem] text-muted">What is on the timesheet for you, as your site manager marked it. Check it is right. Hours only: pay is worked out by payroll.</p>
          <div className="grid gap-1.5">
            <Button variant="primary" size="lg" className="w-full" onClick={() => setClaiming("")}>
              Claim overtime
            </Button>
            <p className="text-[0.87rem] text-muted">Only if you worked extra hours, today or in the last 7 days. You do not need to do anything for normal hours.</p>
          </div>
          {mine.length > 0 && (
            <section aria-label="My overtime claims">
              <h3 className="mb-1 text-base">My overtime claims</h3>
              <ul className="grid gap-2" aria-label="My overtime claims, newest first">
                {mine.map((c) => (
                  <li key={c.id} className="rounded-md border border-line bg-surface px-3 py-2">
                    <p>
                      <span className="font-medium">{dWeekday(c.date)}</span>, {code(c.projectId)}: {claimHours(c.hours)}
                    </p>
                    {c.note && <p className="text-[0.93rem] text-muted">"{c.note}"</p>}
                    <p className="mt-1">
                      <ClaimState c={c} />
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {week("This week so far", thisWeek)}
          {week("Last week", lastWeek)}
        </div>
      </Dialog>
      {claiming !== null && <ClaimSheet me={me} day={day} date={claiming || day} onClose={() => setClaiming(null)} />}
    </>
  );
}

/** Claim overtime for one day: the day, the site, the extra hours and a note. It goes to that site's manager. */
function ClaimSheet({ me, day, date: start, onClose }: { me: Person; day: string; date: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const live = db.projects.filter((p) => p.status === "Live");
  const liveIds = new Set(live.map((p) => p.id));
  const [date, setDate] = useState(start);
  // The site they were on that day: where they were marked in, else where they were down for, else their own site.
  const usual = (d: string) => db.attendance.find((a) => a.personId === me.id && a.date === d && liveIds.has(a.projectId))?.projectId ?? siteOn(me.id, d, db.attendance, db.plan, liveIds) ?? db.assignments.find((a) => a.personId === me.id && liveIds.has(a.projectId))?.projectId ?? "";
  const [siteId, setSiteId] = useState(usual(start));
  const [hours, setHours] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const mineFirst = [...live].sort((a, b) => Number(db.assignments.some((x) => x.personId === me.id && x.projectId === b.id)) - Number(db.assignments.some((x) => x.personId === me.id && x.projectId === a.id)) || a.code.localeCompare(b.code));
  const site = live.find((p) => p.id === siteId);
  const manager = db.people.find((p) => p.id === site?.siteManagerId);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Claim overtime"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={() => {
              const problem = actAs(me.id, () => claimOvertime(me.id, siteId, date, hours, note));
              if (problem) return setError(problem);
              toast(`Overtime claim sent${manager ? ` to ${manager.name}` : ""}: ${claimHours(hours)}, ${dWeekday(date)}`);
              onClose();
            }}
          >
            Send claim
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        <Field label="Day">
          {(id) => (
            <select
              id={id}
              className="field h-11"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSiteId(usual(e.target.value));
                setError("");
              }}
            >
              {claimDays(day).map((d) => (
                <option key={d} value={d}>
                  {d === day ? `Today, ${dWeekday(d)}` : dWeekday(d)}
                  {isBankHoliday(db.bankHolidays, d) ? `, ${bankHolidayOn(db.bankHolidays, d)?.name}` : ""}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Site">
          {(id) => (
            <select id={id} className="field h-11" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {!siteId && <option value="">Choose the site</option>}
              {mineFirst.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Extra hours" hint="How many hours you worked over a normal day. On a Saturday, a Sunday or a bank holiday, all the hours you worked.">
          {(id) => <NumInput id={id} label="Extra hours" className="h-11 w-24" value={hours} onChange={setHours} />}
        </Field>
        <Field label="What was it for (optional)">{(id) => <input id={id} className="field h-11" value={note} maxLength={160} placeholder="Stayed on to finish the pour" onChange={(e) => setNote(e.target.value)} />}</Field>
        <p className="text-[0.93rem] text-muted">{manager ? `${manager.name} gets this on the phone and says yes or no.` : "Your site manager says yes or no."} Once it is approved the hours go on your timesheet for that day.</p>
        {error && (
          <p role="alert" className="text-[0.93rem] text-bad">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/**
 * Overtime claims from the crew, on the site manager's phone (round ten): each claim with the
 * hours split by the day's rule, to change and approve or to decline with an optional note.
 * Approving adds the hours to that day on the timesheet.
 */
export function OvertimeClaimsSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const office = access.may("checkPayroll") || access.may("exportPayroll");
  const all = db.overtimeClaims.filter((c) => c.projectId === site.id);
  const waiting = all.filter((c) => c.status === "Waiting").sort((a, b) => a.date.localeCompare(b.date));
  const answered = all.filter((c) => c.status !== "Waiting" && c.date >= addDays(day, -14)).sort((a, b) => (b.decidedAt ?? "").localeCompare(a.decidedAt ?? ""));
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  return (
    <Dialog open onClose={onClose} title={`Overtime claims, ${site.code}`}>
      <div className="grid gap-4">
        {waiting.length === 0 ? (
          <p className="text-muted">No overtime claims are waiting on {site.code}. When someone on the crew claims extra hours from their phone, it lands here.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Overtime claims to answer">
            {waiting.map((c) => (
              <ClaimCard key={c.id} c={c} name={name(c.personId)} me={me} day={day} locked={weekExported(db.payrollExports, c.date) && !office} />
            ))}
          </ul>
        )}
        {answered.length > 0 && (
          <section>
            <h3 className="mb-1 text-base">Answered</h3>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Overtime claims answered">
              {answered.map((c) => (
                <li key={c.id} className="px-3 py-2 text-[0.93rem]">
                  <span className="font-medium">{name(c.personId)}</span>, {dWeekday(c.date)}: {c.status === "Approved" ? `approved, ${overtimeText({ overtimeHours: c.overtimeHours ?? 0, doubleHours: c.doubleHours ?? 0 })}` : `declined, ${claimHours(c.hours)}`}
                  <span className="block text-[0.87rem] text-muted">
                    {c.decidedBy}, {whenInline(c.decidedAt, day)}
                  </span>
                  {c.status === "Declined" && <DeclineNote note={c.declineNote} />}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}

function ClaimCard({ c, name, me, day, locked }: { c: OvertimeClaim; name: string; me: Person; day: string; locked: boolean }) {
  const db = useData((s) => s.db);
  const kind = restDayKindOf(db.bankHolidays, c.date);
  const start = suggestedSplit(kind, c.hours);
  const [half, setHalf] = useState(start.timeAndHalf);
  const [double, setDouble] = useState(start.double);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const allDouble = kind === "sunday" || kind === "bank-holiday";
  const timeAndHalf = allDouble ? 0 : half;
  const on = db.attendance.find((a) => a.projectId === c.projectId && a.personId === c.personId && a.date === c.date);
  return (
    <li className="grid gap-2 rounded-lg border border-line bg-surface p-3">
      <p>
        <span className="font-medium">{name}</span>, {dWeekday(c.date)}
        {isBankHoliday(db.bankHolidays, c.date) ? `, ${bankHolidayOn(db.bankHolidays, c.date)?.name}` : ""}: <span className="font-medium">{claimHours(c.hours)}</span>
      </p>
      {c.note && <p className="text-[0.93rem] text-muted">"{c.note}"</p>}
      <p className="text-[0.87rem] text-muted">
        Claimed {whenInline(c.createdAt, day)}. On the timesheet that day: {on ? attendanceShort(on) : "not marked in"}.
      </p>
      {locked ? (
        <p className="text-[0.93rem] text-muted">That week's hours have gone to payroll. The office answers this one.</p>
      ) : declining ? (
        <div className="grid gap-2">
          <Field label="Note (optional)" hint="Say why, if it helps. They see it on their phone.">
            {(id) => <input id={id} className="field h-11" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDeclining(false)}>Back</Button>
            <Button
              variant="primary"
              aria-label={`Decline the claim from ${name}`}
              onClick={() => {
                actAs(me.id, () => decideOvertimeClaim(c.id, false, { note }));
                toast(`Claim declined for ${name}`);
              }}
            >
              Decline claim
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.93rem]">
            <label className="flex items-center gap-1.5">
              <NumInput label={`${name} hours at time and a half`} className="h-10 w-16" value={timeAndHalf} onChange={setHalf} disabled={allDouble} />
              <span className="text-muted">at x1.5</span>
            </label>
            <label className="flex items-center gap-1.5">
              <NumInput label={`${name} hours at double time`} className="h-10 w-16" value={double} onChange={setDouble} />
              <span className="text-muted">at x2</span>
            </label>
          </div>
          <p className="text-[0.87rem] text-muted">{kind ? REST_DAY_RULE[kind] : `After a normal day it is time and a half up to midnight, double time only past midnight. ${EARLY_START_NOTE}`}</p>
          {error && (
            <p role="alert" className="text-[0.93rem] text-bad">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button aria-label={`Decline the claim from ${name}, ${dWeekday(c.date)}`} onClick={() => setDeclining(true)}>
              Decline
            </Button>
            <Button
              variant="primary"
              aria-label={`Approve the claim from ${name}, ${dWeekday(c.date)}`}
              onClick={() => {
                const problem = actAs(me.id, () => decideOvertimeClaim(c.id, true, { timeAndHalf, double }));
                if (problem) return setError(problem);
                toast(`Approved: ${overtimeText({ overtimeHours: timeAndHalf, doubleHours: double })} added for ${name}, ${dWeekday(c.date)}`);
              }}
            >
              Approve
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/** How many overtime claims are waiting on a site: the number on the job card and the button. */
export const claimsWaiting = (claims: OvertimeClaim[], siteId: string) => claims.filter((c) => c.projectId === siteId && c.status === "Waiting").length;

/** For the job card: "2 overtime claims". */
export const claimsLabel = (n: number) => plural(n, "overtime claim");
