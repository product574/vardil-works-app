import { ArrowLeft, CalendarBlank, CalendarDots, Camera, CaretRight, ClipboardText, HandPalm, Megaphone, PlusCircle, Receipt, Tray, Truck } from "@phosphor-icons/react";
import { useState } from "react";
import { useAccess } from "@/data/access";
import { actAs, markAttendance, requestPerson, sendTimeStamps, setDayInstruction } from "@/data/actions";
import { co } from "@/data/place";
import { useData } from "@/data/store";
import type { Person, Project } from "@/data/types";
import { personWeek, planClashes } from "@/lib/availability";
import { MONTHS, rollingWorkdays } from "@/lib/dates";
import { dShort, dWeekday, plural, when } from "@/lib/format";
import { crewRequests } from "@/lib/requests";
import { dayInstruction, dayRoster, managerJobs, whereabouts } from "@/lib/roster";
import { attendanceShort, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "@/lib/week";
import { CrewRequestButtons } from "@/modules/projects/CrewRequestButtons";
import { Badge, Button, cx, Dialog, Field, NumInput, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { AskSheet, BIG, DrivingSheet, ExpenseSheet, ExtraSheet, longDate, PhotoSheet, ProfileButton, ProfileSheet } from "./sheets";

type Sheet = "time" | "week" | "month" | "notes" | "crew" | "photo" | "extra" | "ask" | "general" | "expense" | "driving" | "profile" | null;

const KIND: Record<string, string> = { personnel: "People", own_plant: "Our plant", hired_plant: "Plant to hire", other: "Something else" };

/**
 * A site manager's phone (Oisin, 17 Nov). The front page is the jobs he runs and any he has been
 * given (Admin, Site access), with his profile at the top left and, apart from the jobs, a general
 * request that is not for one site, the driving check and reimbursements. Inside a job: the
 * timesheet, the week and month ahead (to look at and to ask for people, never to change the plan),
 * the day's site instructions, what the crew has asked for, photos, extra work and his own requests.
 */
export function ManagerPhone({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const jobs = managerJobs(db.projects, me.id, db.siteAccess);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const job = jobs.find((p) => p.id === jobId);
  // Marked on the timesheet once the site has marked anyone today, otherwise who is planned: the same rule as the week and month ahead.
  const today = (id: string) => dayRoster(db.attendance, db.plan, id, day, day);
  // His own general requests still open with the office.
  const general = db.requests.filter((r) => r.projectId === null && r.requestedById === me.id && r.status === "Open").length;
  const waiting = (id: string) => crewRequests(db.requests, [id]).length;
  const note = job ? dayInstruction(db.dayInstructions, job.id, day) : undefined;
  const close = () => setSheet(null);
  return (
    <div className="w-full max-w-[24rem] overflow-hidden rounded-2xl border border-line-strong bg-canvas" aria-label="Phone screen" lang="en">
      <div className="bg-accent-strong px-4 py-3 text-white">
        {job ? (
          <>
            <button type="button" onClick={() => { setJobId(null); setSheet(null); }} className="press -ml-1 mb-1 inline-flex min-h-9 items-center gap-1 rounded px-1 text-[0.93rem] opacity-90 hover:opacity-100">
              <ArrowLeft size={16} /> All my jobs
            </button>
            <p className="font-display text-[1.35rem] leading-tight font-semibold">
              {job.code} {job.name}
            </p>
            <p className="text-[0.93rem] opacity-90">
              {job.location}, {co(job.county)}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <ProfileButton name={me.name} label="My profile" onClick={() => setSheet("profile")} />
              <p className="text-[0.93rem] opacity-90">Today, {longDate(day)}</p>
            </div>
            <p className="font-display text-[1.35rem] leading-tight font-semibold">{me.name}</p>
            <p className="text-[0.93rem] opacity-90">Site manager, {plural(jobs.length, "job")}</p>
          </>
        )}
      </div>
      {!job ? (
        <div className="grid gap-3 px-4 py-4">
          <h2 className="text-base">My jobs</h2>
          {jobs.length === 0 && <p className="rounded-lg bg-warn-soft px-3 py-3 text-warn">You are not running a job at the moment. Ring the office if that is wrong.</p>}
          <ul className="grid gap-3" aria-label="My jobs">
            {jobs.map((p) => (
              <li key={p.id}>
                <button type="button" className={cx(BIG, "min-h-20 py-3")} onClick={() => setJobId(p.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block">
                      {p.code} {p.name}
                    </span>
                    <span className="block text-[0.93rem] font-normal text-muted">
                      {p.location}, {co(p.county)}. {p.status === "Live" ? `${plural(today(p.id).rows.length, "person", "people")} ${today(p.id).from === "timesheet" ? "on site today" : "down for today"}` : `Starts ${dShort(p.startDate)}`}
                    </span>
                    {p.siteManagerId !== me.id && <span className="block text-[0.93rem] font-normal text-muted">Run by {db.people.find((x) => x.id === p.siteManagerId)?.name}. Given to you by the office</span>}
                    {waiting(p.id) > 0 && (
                      <span className="mt-1 block">
                        <Badge tone="warn">{plural(waiting(p.id), "request")} from the crew</Badge>
                      </span>
                    )}
                  </span>
                  <CaretRight size={20} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
          <h2 className="mt-2 text-base">General</h2>
          <button type="button" className={BIG} onClick={() => setSheet("general")}>
            <HandPalm size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Make a request
              <span className="block text-[0.87rem] font-normal text-muted">Not for one job. It goes to the office</span>
            </span>
            {general > 0 && <Badge tone="accent">{general} waiting</Badge>}
          </button>
          <h2 className="mt-2 text-base">Vehicle and expenses</h2>
          <button type="button" className={BIG} onClick={() => setSheet("driving")}>
            <Truck size={24} className="text-accent-ink" /> Driving check
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("expense")}>
            <Receipt size={24} className="text-accent-ink" /> Claim a reimbursement
          </button>
        </div>
      ) : (
        <div className="grid gap-3 px-4 py-4">
          <button type="button" className={BIG} onClick={() => setSheet("time")}>
            <ClipboardText size={24} className="text-accent-ink" /> Timesheet
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("week")}>
            <CalendarBlank size={24} className="text-accent-ink" /> Week ahead
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("month")}>
            <CalendarDots size={24} className="text-accent-ink" /> Month ahead
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("notes")}>
            <Megaphone size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Site instructions
              <span className="block text-[0.87rem] font-normal text-muted">{note ? "Up for today" : "Nothing up for today"}</span>
            </span>
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("crew")}>
            <Tray size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">Requests from the crew</span>
            {waiting(job.id) > 0 && <Badge tone="warn">{waiting(job.id)}</Badge>}
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("photo")}>
            <Camera size={24} className="text-accent-ink" /> Send a photo
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("extra")}>
            <PlusCircle size={24} className="text-accent-ink" /> Report extra work
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("ask")}>
            <HandPalm size={24} className="text-accent-ink" /> Make a request
          </button>
        </div>
      )}
      {job && sheet === "time" && <TimeSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "week" && <SiteWeekSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "month" && <SiteMonthSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "notes" && <InstructionsSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "crew" && <CrewRequestsSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "photo" && <PhotoSheet site={job} me={me} lang="en" onClose={close} />}
      {job && sheet === "extra" && <ExtraSheet site={job} me={me} lang="en" onClose={close} />}
      {job && sheet === "ask" && <AskSheet site={job} me={me} lang="en" day={day} onClose={close} />}
      {sheet === "general" && <AskSheet site={null} me={me} lang="en" day={day} onClose={close} />}
      {sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={null} sites={jobs} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "profile" && <ProfileSheet me={me} lang="en" day={day} onClose={close} />}
    </div>
  );
}

/** The people on a job: its site list plus anyone planned there on the given days. */
function crewOf(db: ReturnType<typeof useData.getState>["db"], siteId: string, days: string[]) {
  const ids = new Set([...db.assignments.filter((a) => a.projectId === siteId).map((a) => a.personId), ...db.plan.filter((p) => p.projectId === siteId && days.includes(p.date)).map((p) => p.personId)]);
  return [...ids].map((id) => db.people.find((p) => p.id === id)).filter((p): p is Person => !!p && p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
}

/** Today's timesheet for one job: full day, half day or not in for each person, overtime on a full day, then send. */
function TimeSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const canMark = access.may("markTime");
  const people = crewOf(db, site.id, [day]);
  const entry = (personId: string) => db.attendance.find((a) => a.projectId === site.id && a.personId === personId && a.date === day);
  const unsent = db.attendance.filter((a) => a.projectId === site.id && a.date === day && !a.sent).length;
  const marked = people.filter((p) => entry(p.id)).length;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Timesheet, ${dWeekday(day)}`}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Close
          </Button>
          {canMark && (
            <Button
              size="lg"
              variant="primary"
              disabled={unsent === 0}
              onClick={() => {
                const n = actAs(me.id, () => sendTimeStamps(site.id, day));
                toast(`Today's time stamps sent for ${site.code}, ${plural(n, "person", "people")}`);
                onClose();
              }}
            >
              Send today's time stamps
            </Button>
          )}
        </>
      }
    >
      <p className="mb-2 text-[0.93rem] text-muted">
        {site.code}: {marked} of {people.length} marked{unsent > 0 ? `, ${unsent} not sent yet` : ""}.{canMark ? "" : " Marking needs the \"Mark the timesheet\" permission."}
      </p>
      <ul className="divide-y divide-line" aria-label="People on site today">
        {people.map((p) => {
          const a = entry(p.id);
          const value = !a ? "out" : a.status;
          return (
            <li key={p.id} className="grid gap-1.5 py-2.5">
              <p className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                <span className="text-[0.87rem] text-muted">{p.trade}</span>
              </p>
              {a?.sent || !canMark ? (
                <p className="text-muted">
                  {a ? attendanceShort(a.status, a.overtimeHours) : "Not in"}
                  {a?.sent ? ", sent" : ""}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented
                    label={`${p.name} today`}
                    value={value}
                    onChange={(v) => actAs(me.id, () => markAttendance(site.id, p.id, day, v === "out" ? null : { status: v, overtimeHours: v === "full" ? (a?.overtimeHours ?? 0) : 0 }))}
                    options={[{ value: "full", label: "Full" }, { value: "half", label: "Half" }, { value: "out", label: "Not in" }]}
                  />
                  {a?.status === "full" && (
                    <label className="flex items-center gap-1.5 text-[0.93rem]">
                      <NumInput label={`${p.name} overtime hours`} className="h-9 w-14" value={a.overtimeHours} onChange={(h) => actAs(me.id, () => markAttendance(site.id, p.id, day, { status: "full", overtimeHours: Math.max(0, h) }))} /> hours over
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/**
 * One day on one job, as the phone shows it: who is down (or who was marked in, for days gone),
 * and a way to ask management for a named person that day. The phone never changes the plan
 * itself (Oisin, 17 Nov): the office does that, on the week ahead.
 */
function DayCrew({ site, date, me, day }: { site: Project; date: string; me: Person; day: string }) {
  const db = useData((s) => s.db);
  const [asking, setAsking] = useState(false);
  const [personId, setPersonId] = useState("");
  const [note, setNote] = useState("");
  const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const person = (id: string) => db.people.find((p) => p.id === id);
  // Who was marked in for a day gone, who is planned for a day to come: the rule the office's week and month ahead use.
  const roster = dayRoster(db.attendance, db.plan, site.id, date, day);
  const gone = roster.from === "timesheet";
  const planned = db.plan.filter((p) => p.projectId === site.id && p.date === date);
  const rows = roster.rows.map((r) => ({ id: r.personId, personId: r.personId, text: gone && !r.note ? "full day" : r.note })).sort((a, b) => (person(a.personId)?.name ?? "").localeCompare(person(b.personId)?.name ?? ""));
  const clashes = gone ? new Map<string, string[]>() : planClashes(db.plan.filter((p) => live.has(p.projectId) && p.date === date));
  const asked = db.requests.filter((r) => r.projectId === site.id && r.personId && r.neededFrom === date && r.neededTo === date && (r.status === "Open" || r.decision === "Declined"));
  const canAsk = date > day && date >= site.startDate && date <= site.endDate;
  const pool = !asking
    ? []
    : db.people
        .filter((p) => p.active && p.kind === "Operative" && !planned.some((x) => x.personId === p.id) && !asked.some((r) => r.personId === p.id && r.status === "Open"))
        .map((p) => ({ p, st: personWeek(db.plan, db.holidays, live, p.id, [date])[0]! }))
        .filter(({ st }) => !st.leave)
        .sort((a, b) => a.st.load - b.st.load || a.p.name.localeCompare(b.p.name));
  return (
    <div className="grid gap-2">
      {rows.length === 0 ? (
        <p className="text-muted">{gone ? "Nobody was marked in." : "Nobody is down yet."}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label={`${gone ? "On site" : "Planned"} ${dWeekday(date)}`}>
          {rows.map((r) => {
            const p = person(r.personId);
            const clash = clashes.get(`${r.personId}|${date}`)?.filter((s) => s !== site.id);
            return (
              <li key={r.id} className="flex min-h-11 items-center gap-2 px-3 py-1">
                <span className="min-w-0 flex-1">
                  {p?.name}
                  {clash && clash.length > 0 && <span className="block text-[0.87rem] text-bad">Also on {clash.map(code).join(", ")}</span>}
                </span>
                <span className="shrink-0 text-right text-[0.87rem] text-muted">
                  {p?.trade}
                  {r.text ? `, ${r.text}` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {asked.map((r) => (
        <p key={r.id} className={cx("rounded-md px-3 py-2 text-[0.93rem]", r.decision === "Declined" ? "bg-canvas text-muted" : "bg-accent-soft text-accent-ink")}>
          Asked for: {person(r.personId!)?.name}. {r.decision === "Declined" ? `Turned down by ${r.decidedBy}` : r.decision === "Approved" ? "Agreed, the office is arranging it" : "Waiting for the office"}
        </p>
      ))}
      {canAsk && !asking && (
        <Button size="lg" className="w-full" aria-label={`Request someone for ${dWeekday(date)}`} onClick={() => setAsking(true)}>
          Request someone for this day
        </Button>
      )}
      {canAsk && asking && (
        <form
          className="grid gap-2 rounded-lg border border-line bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const p = person(personId);
            if (!p) return;
            actAs(me.id, () => requestPerson(site.id, p.id, date, note));
            toast(`Request sent to the office: ${p.name} for ${site.code}, ${dWeekday(date)}`);
            setAsking(false);
            setPersonId("");
            setNote("");
          }}
        >
          <Field label="Who do you need?">
            {(id) => (
              <select id={id} className="field h-11" value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Choose a person</option>
                {pool.map(({ p, st }) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}: {whereabouts(st, code)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Why (optional)">{(id) => <input id={id} className="field h-11" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <p className="text-[0.93rem] text-muted">The office says yes or no and changes the plan. They show here once they are down for the day.</p>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!personId}>
              Send request
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Next week on one job, day by day: who is down, and a button to ask for someone. Nothing here changes the plan. */
function SiteWeekSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const week = nextWorkWeek(day);
  return (
    <Dialog open onClose={onClose} title={`Week ahead, ${site.code}`}>
      <p className="mb-2 text-[0.93rem] text-muted">Week of {dShort(week[0])}. The plan is changed in the office. If you need someone on a day, ask for them here.</p>
      <ul className="grid gap-3">
        {week.map((d) => {
          const open = d >= site.startDate && d <= site.endDate;
          const n = dayRoster(db.attendance, db.plan, site.id, d, day).rows.length;
          return (
            <li key={d} className="rounded-lg border border-line">
              <p className="flex items-baseline justify-between border-b border-line px-3 py-2">
                <span className="font-medium">{dWeekday(d)}</span>
                <span className="text-[0.87rem] text-muted">{open ? plural(n, "person", "people") : d < site.startDate ? "Not started" : "Finished"}</span>
              </p>
              {open && (
                <div className="p-3">
                  <DayCrew site={site} date={d} me={me} day={day} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/**
 * A month on one job: a number per working day (who attended for days gone, who is planned for
 * days to come). Tap a day to see who, and to ask for someone on a day still to come.
 */
function SiteMonthSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const [ym, setYm] = useState(day.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const days = workdaysOfMonth(ym);
  const count = (d: string) => dayRoster(db.attendance, db.plan, site.id, d, day).rows.length;
  const weeks = [...new Set(days.map((d) => workWeek(d)[0]!))];
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return (
    <Dialog open onClose={onClose} title={`Month ahead, ${site.code}`}>
      {picked ? (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setPicked(null)}>
              <ArrowLeft size={16} /> Back to the month
            </Button>
            <p className="flex-1 text-right font-medium">{dWeekday(picked)}</p>
          </div>
          <DayCrew key={picked} site={site} date={picked} me={me} day={day} />
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Button size="sm" onClick={() => setYm(shiftMonth(ym, -1))}>
              Earlier
            </Button>
            <p className="flex-1 text-center font-medium">
              {MONTHS[m - 1]} {y}
            </p>
            <Button size="sm" onClick={() => setYm(shiftMonth(ym, 1))}>
              Later
            </Button>
          </div>
          <div className="grid gap-3">
            {weeks.map((w) => (
              <ul key={w} className="grid grid-cols-5 gap-1.5 text-center" aria-label={`Week of ${dShort(w)}`}>
                {workWeek(w).map((d) => {
                  const inMonth = days.includes(d);
                  const running = d >= site.startDate && d <= site.endDate;
                  const n = inMonth && running ? count(d) : null;
                  const inner = (
                    <>
                      <span className="block text-[0.87rem] text-muted">
                        {new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" }).slice(0, 2)} {Number(d.slice(8))}
                      </span>
                      <span className={cx("block text-[1.05rem] font-semibold tabular-nums", n === 0 && "text-faint")}>{n === null ? "-" : n}</span>
                    </>
                  );
                  const box = cx("block w-full rounded-md border px-1 py-1.5", d === day ? "border-accent bg-accent-soft" : "border-line bg-surface");
                  return (
                    <li key={d} className={cx(!inMonth && "opacity-0")} aria-hidden={!inMonth}>
                      {n === null ? (
                        <span className={box}>{inner}</span>
                      ) : (
                        <button type="button" aria-label={`${dWeekday(d)}: ${plural(n, "person", "people")}. See who`} className={cx(box, "press min-h-12 hover:border-accent")} onClick={() => setPicked(d)}>
                          {inner}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ))}
          </div>
          <p className="mt-3 text-[0.87rem] text-muted">Each number is the people on {site.code} that day: who attended for days gone, who is planned for days to come. Tap a day to see who, and to ask for someone.</p>
        </>
      )}
    </Dialog>
  );
}

/** Site instructions for a day: what the site manager wants the crew to know, shown on their phones that day. */
function InstructionsSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const next = rollingWorkdays(day, 1)[0]!;
  const [date, setDate] = useState(day);
  const current = dayInstruction(db.dayInstructions, site.id, date);
  const [text, setText] = useState(current?.text ?? "");
  const crew = dayRoster(db.attendance, db.plan, site.id, date, day).rows.length;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Site instructions, ${site.code}`}
      footer={
        <>
          {current && (
            <Button
              size="lg"
              variant="danger"
              className="mr-auto"
              onClick={() => {
                actAs(me.id, () => setDayInstruction(site.id, date, ""));
                setText("");
                toast(`Instructions for ${dWeekday(date)} taken down`);
              }}
            >
              Take down
            </Button>
          )}
          <Button size="lg" onClick={onClose}>
            Close
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!text.trim() || text.trim() === current?.text}
            onClick={() => {
              actAs(me.id, () => setDayInstruction(site.id, date, text));
              toast(`Instructions put up for ${site.code}, ${dWeekday(date)}. ${plural(crew, "person", "people")} will see them`);
              onClose();
            }}
          >
            Put up
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Segmented
          label="Day the instructions are for"
          value={date}
          onChange={(d) => {
            setDate(d);
            setText(dayInstruction(db.dayInstructions, site.id, d)?.text ?? "");
          }}
          options={[
            { value: day, label: "Today" },
            { value: next, label: dWeekday(next) },
          ]}
        />
        <Field label="What the crew needs to know that day">{(id) => <textarea id={id} rows={5} className="field text-[1.02rem]" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <p className="text-[0.93rem] text-muted">
          {current ? `Put up by ${current.by}, ${when(current.at, day)}. ` : ""}
          It shows on the phone of everyone on {site.code} that day, above the standing site instructions.
        </p>
        {site.siteInstructions && (
          <div className="rounded-lg bg-surface px-3 py-2.5">
            <p className="text-[0.87rem] font-medium text-muted">Standing site instructions</p>
            <p className="mt-1 text-[0.93rem]">{site.siteInstructions}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** What the crew has asked for on their phones: pass each to management as his own request, or mark it dealt with. */
function CrewRequestsSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const list = crewRequests(db.requests, [site.id]);
  const earlier = db.requests.filter((r) => r.projectId === site.id && (r.raisedBy || (r.heldBy === "site" && r.status === "Done"))).slice(0, 4);
  return (
    <Dialog open onClose={onClose} title={`Requests from the crew, ${site.code}`}>
      <div className="grid gap-4">
        {list.length === 0 ? (
          <p className="text-muted">Nothing is waiting. What the crew asks for on their phones comes here first.</p>
        ) : (
          <ul className="grid gap-3" aria-label="Requests from the crew">
            {list.map((r) => (
              <li key={r.id} className="grid gap-2 rounded-lg border border-line-strong bg-surface p-3">
                <p className="font-medium">
                  {r.description}
                  {r.quantity > 1 && <span className="font-normal text-muted"> x {r.quantity}</span>}
                </p>
                <p className="text-[0.93rem] text-muted">
                  {KIND[r.kind]}. Asked by {r.requestedBy}, {when(r.createdAt, day)}. Needed {dShort(r.neededFrom)} to {dShort(r.neededTo)}.
                </p>
                <CrewRequestButtons id={r.id} what={r.description} big as={me.id} />
              </li>
            ))}
          </ul>
        )}
        {earlier.length > 0 && (
          <div>
            <h3 className="mb-1 text-base">Already dealt with</h3>
            <ul className="divide-y divide-line rounded-md border border-line" aria-label="Crew requests already dealt with">
              {earlier.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="min-w-0 flex-1">
                    {r.description}
                    <span className="block text-[0.87rem] text-muted">{r.raisedBy ?? r.requestedBy}</span>
                  </span>
                  <Badge tone={r.raisedBy ? (r.decision === "Approved" ? "ok" : r.decision === "Declined" ? "neutral" : "accent") : "ok"}>{r.raisedBy ? (r.decision ? `Management: ${r.decision.toLowerCase()}` : "With management") : "Dealt with on site"}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
