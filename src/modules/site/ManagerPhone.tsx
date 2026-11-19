import { ArrowLeft, CalendarBlank, CalendarDots, CalendarPlus, Camera, CarProfile, CaretRight, ClipboardText, Clock, HandPalm, IdentificationCard, Invoice, Ladder, Megaphone, PlusCircle, Receipt, Tray, Truck, UserMinus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useAccess } from "@/data/access";
import { blocksText, bookingFor, scaffoldDue, scaffoldUnsafe, standing, subInsuranceFlags, ticketBlocks } from "@/lib/compliance";
import { approverWords, partyOf, purchaseStage, runsSite, sitesOf } from "@/lib/purchases";
import { money2 } from "@/lib/money";
import { ApproveDialog, SendBackDialog } from "@/modules/invoicing/purchase-shared";
import { actAs, addToRoster, correctAttendance, inspectScaffold, markAttendance, requestPerson, sendTimeStamps, setDayInstruction, stampRestDay } from "@/data/actions";
import { co } from "@/data/place";
import { useData, usePrefs } from "@/data/store";
import type { Db, Person, Project, SupplierInvoice } from "@/data/types";
import { personWeek, planClashes } from "@/lib/availability";
import { bankHolidayOn, isBankHoliday, restDayKindOf, restDaysBetween } from "@/lib/bank-holidays";
import { addDays, datesBetween, isWeekend, MONTHS, rollingWorkdays, weekStartOf } from "@/lib/dates";
import { dShort, dWeekday, plural, when } from "@/lib/format";
import { DOUBLE_WITHOUT_HALF, doubleOf, doubleWithoutHalf, EARLY_START_NOTE, REST_DAY_RULE, restDayProblem } from "@/lib/overtime";
import { weekExported } from "@/lib/payroll";
import { crewRequests } from "@/lib/requests";
import { dayInstruction, dayRoster, managerJobs, whereabouts } from "@/lib/roster";
import { attendanceShort, fullWeek, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "@/lib/week";
import { CorrectDialog } from "@/modules/people/Timesheet";
import { CrewRequestButtons } from "@/modules/projects/CrewRequestButtons";
import { Badge, Button, cx, DeclineNote, Dialog, Field, NumInput, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { CheckLine, DamageSheet, LicenceSheet } from "./fleet-sheets";
import { claimsLabel, claimsWaiting, OvertimeClaimsSheet } from "./hours";
import { AskSheet, BIG, DrivingSheet, ExpenseSheet, ExtraSheet, longDate, PhotoSheet, ProfileButton, ProfileSheet } from "./sheets";

type Sheet = "time" | "weekend" | "claims" | "week" | "month" | "notes" | "crew" | "photo" | "extra" | "ask" | "general" | "expense" | "driving" | "damage" | "licence" | "profile" | "cannot" | "scaffolds" | "subs" | null;

const KIND: Record<string, string> = { personnel: "People", own_plant: "Our plant", hired_plant: "Plant to hire", other: "Something else" };

/**
 * A site manager's phone (Oisin, 17 Nov). The front page is the jobs he runs and any he has been
 * given (Admin, Site access), with his profile at the top left and, apart from the jobs, a general
 * request that is not for one site, the driving check and reimbursements. Inside a job: the
 * timesheet (any day back to the Monday of last week, sent days included, since round ten), the
 * crew's overtime claims, the week and month ahead (to look at and to ask for people, never to change the plan),
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
  // Opening a job, or going back to the list, starts at the top of the phone's screen, as an app does.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = root.current?.closest("section");
    if (frame && frame.scrollHeight > frame.clientHeight) frame.scrollTo({ top: 0 });
  }, [jobId]);
  return (
    <div ref={root} className="min-h-full w-full bg-canvas" lang="en">
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
                    {(waiting(p.id) > 0 || claimsWaiting(db.overtimeClaims, p.id) > 0 || cannotWork(db, p.id, day).length > 0) && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {cannotWork(db, p.id, day).length > 0 && <Badge tone="bad">{plural(cannotWork(db, p.id, day).length, "person", "people")} cannot work</Badge>}
                        {waiting(p.id) > 0 && <Badge tone="warn">{plural(waiting(p.id), "request")} from the crew</Badge>}
                        {claimsWaiting(db.overtimeClaims, p.id) > 0 && <Badge tone="accent">{claimsLabel(claimsWaiting(db.overtimeClaims, p.id))}</Badge>}
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
            <Truck size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Driving check
              <CheckLine me={me} day={day} />
            </span>
          </button>
          {/* From the Secure-All build's Ops phone (18 Nov): damage to a vehicle, and a new licence. */}
          <button type="button" className={BIG} onClick={() => setSheet("damage")}>
            <CarProfile size={24} className="text-accent-ink" /> Report damage
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("licence")}>
            <IdentificationCard size={24} className="text-accent-ink" /> Send a licence
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
          <button type="button" className={BIG} onClick={() => setSheet("weekend")}>
            <CalendarPlus size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Overtime time stamp
              <span className="block text-[0.87rem] font-normal text-muted">Saturday, Sunday or a bank holiday</span>
            </span>
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("claims")}>
            <Clock size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Overtime claims
              <span className="block text-[0.87rem] font-normal text-muted">Extra hours the crew have claimed</span>
            </span>
            {claimsWaiting(db.overtimeClaims, job.id) > 0 && <Badge tone="accent">{claimsWaiting(db.overtimeClaims, job.id)}</Badge>}
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
          {/* From Compliance and Invoicing (merged 19 Nov, Oisin's picks): who cannot work, the scaffold register, and subcontractor invoices. */}
          <button type="button" className={BIG} onClick={() => setSheet("cannot")}>
            <UserMinus size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Who cannot work
              <span className="block text-[0.87rem] font-normal text-muted">A ticket run out on this job</span>
            </span>
            {cannotWork(db, job.id, day).length > 0 && <Badge tone="bad">{cannotWork(db, job.id, day).length}</Badge>}
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("scaffolds")}>
            <Ladder size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Scaffold inspections
              <span className="block text-[0.87rem] font-normal text-muted">Every 7 days and after any change</span>
            </span>
            {scaffoldsDue(db, job.id, day) > 0 && <Badge tone="warn">{scaffoldsDue(db, job.id, day)}</Badge>}
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("subs")}>
            <Invoice size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              Subcontractor invoices
              <span className="block text-[0.87rem] font-normal text-muted">Approve what was done on site</span>
            </span>
            {subsWaiting(db, job.id).length > 0 && <Badge tone="accent">{subsWaiting(db, job.id).length}</Badge>}
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
      {job && sheet === "weekend" && <WeekendSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "claims" && <OvertimeClaimsSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "week" && <SiteWeekSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "month" && <SiteMonthSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "notes" && <InstructionsSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "crew" && <CrewRequestsSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "cannot" && <CannotWorkSheet site={job} day={day} onClose={close} />}
      {job && sheet === "scaffolds" && <ScaffoldSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "subs" && <SubInvoiceSheet site={job} me={me} day={day} onClose={close} />}
      {job && sheet === "photo" && <PhotoSheet site={job} me={me} lang="en" onClose={close} />}
      {job && sheet === "extra" && <ExtraSheet site={job} me={me} lang="en" onClose={close} />}
      {job && sheet === "ask" && <AskSheet site={job} me={me} lang="en" day={day} onClose={close} />}
      {sheet === "general" && <AskSheet site={null} me={me} lang="en" day={day} onClose={close} />}
      {sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={null} sites={jobs} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "damage" && <DamageSheet me={me} onClose={close} />}
      {sheet === "licence" && <LicenceSheet me={me} day={day} onClose={close} />}
      {sheet === "profile" && <ProfileSheet me={me} lang="en" day={day} onClose={close} />}
    </div>
  );
}

/** The people on a job: its site list plus anyone planned there on the given days. */
function crewOf(db: ReturnType<typeof useData.getState>["db"], siteId: string, days: string[]) {
  const ids = new Set([...db.assignments.filter((a) => a.projectId === siteId).map((a) => a.personId), ...db.plan.filter((p) => p.projectId === siteId && days.includes(p.date)).map((p) => p.personId)]);
  return [...ids].map((id) => db.people.find((p) => p.id === id)).filter((p): p is Person => !!p && p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The timesheet for one job, on the phone. Today is marked and sent as before: full day, half
 * day or not in for each person, with overtime at each rate on a full day. Since round ten
 * (Oisin, 17 Nov: "add/edit timesheets even if it is already sent in ... filled out on the
 * phone") the Day box goes back to the Monday of last week, and a day that has been sent, or
 * an earlier day, is changed here with a short reason, kept as a correction as in the office.
 * Once a week has gone to payroll only the office changes it.
 */
function TimeSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const canMark = access.may("markTime");
  const office = access.may("checkPayroll") || access.may("exportPayroll");
  // Normal days from the Monday of last week up to today, newest first, from the day the job started.
  const days = datesBetween(addDays(weekStartOf(day), -7), day)
    .filter((d) => !isWeekend(d) && d >= site.startDate)
    .reverse();
  const [date, setDate] = useState(day);
  const [fix, setFix] = useState<Person | null>(null);
  const [adding, setAdding] = useState("");
  const isToday = date === day;
  const holiday = isBankHoliday(db.bankHolidays, date);
  const locked = weekExported(db.payrollExports, date) && !office;
  const canCorrect = access.may("correctTime") && !locked;
  const people = crewOf(db, site.id, [date]);
  const entry = (personId: string) => db.attendance.find((a) => a.projectId === site.id && a.personId === personId && a.date === date && a.status !== "restday");
  const unsent = db.attendance.filter((a) => a.projectId === site.id && a.date === day && !a.sent).length;
  const marked = people.filter((p) => entry(p.id)).length;
  const spare = db.people.filter((p) => p.active && p.kind === "Operative" && !db.assignments.some((a) => a.projectId === site.id && a.personId === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`Timesheet, ${dWeekday(date)}`}
        footer={
          <>
            <Button size="lg" onClick={onClose}>
              Close
            </Button>
            {canMark && isToday && (
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
        <div className="mb-3 grid gap-2">
          <Field label="Day" hint="Today, and back to the Monday of last week.">
            {(id) => (
              <select id={id} className="field h-11" value={date} onChange={(e) => setDate(e.target.value)}>
                {(days.length > 0 ? days : [day]).map((d) => (
                  <option key={d} value={d}>
                    {d === day ? `Today, ${dWeekday(d)}` : dWeekday(d)}
                    {isBankHoliday(db.bankHolidays, d) ? `, ${bankHolidayOn(db.bankHolidays, d)?.name}` : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {canMark && !locked && (
            <div className="flex items-center gap-2">
              <select aria-label="Add someone to this site" className="field h-11 min-w-0 flex-1" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Add someone to this site</option>
                {spare.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}
                  </option>
                ))}
              </select>
              <Button
                size="lg"
                disabled={!adding}
                onClick={() => {
                  actAs(me.id, () => addToRoster(site.id, adding));
                  toast(`${db.people.find((p) => p.id === adding)?.name} added to ${site.code}`);
                  setAdding("");
                }}
              >
                Add
              </Button>
            </div>
          )}
        </div>
        <p className="mb-2 text-[0.93rem] text-muted">
          {site.code}: {marked} of {people.length} marked{isToday && unsent > 0 ? `, ${unsent} not sent yet` : ""}.{canMark ? "" : " Marking needs the \"Mark the timesheet\" permission."}
        </p>
        {holiday && <p className="mb-2 rounded-md bg-warn-soft px-3 py-2 text-[0.93rem] text-warn">{bankHolidayOn(db.bankHolidays, date)?.name} is a bank holiday. Nobody is marked a normal day on it: put anyone who worked in with Overtime time stamp.</p>}
        {locked && <p className="mb-2 rounded-md bg-canvas px-3 py-2 text-[0.93rem] text-muted">This week's hours have gone to payroll. Only the office can change them now.</p>}
        <ul className="divide-y divide-line" aria-label={isToday ? "People on site today" : `People on site ${dWeekday(date)}`}>
          {people.map((p) => {
            const a = entry(p.id);
            const value = !a ? "out" : a.status === "half" ? "half" : "full";
            // A Safe Pass or trade ticket run out (Compliance): they cannot be marked on site that day.
            const stops = !a ? ticketBlocks(p, date) : [];
            const live = isToday && !a?.sent && canMark && !holiday && stops.length === 0;
            return (
              <li key={p.id} className="grid gap-1.5 py-2.5">
                <p className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                  <span className="text-[0.87rem] text-muted">{p.trade}</span>
                </p>
                {stops.length > 0 ? (
                  <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">Cannot work: {blocksText(stops, day)}. The office renews it in Compliance.</p>
                ) : !live ? (
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-muted">
                      {a ? attendanceShort(a) : holiday ? "Bank holiday" : "Not in"}
                      {a?.sent ? ", sent" : ""}
                    </p>
                    {/* A sent day, or an earlier one, is changed with a reason (round ten). */}
                    {canCorrect && (!holiday || a) && (
                      <Button size="sm" aria-label={`Change ${p.name}, ${dWeekday(date)}`} onClick={() => setFix(p)}>
                        Change
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Segmented
                      label={`${p.name} today`}
                      value={value}
                      onChange={(v) => actAs(me.id, () => markAttendance(site.id, p.id, day, v === "out" ? null : { status: v, overtimeHours: v === "full" ? (a?.overtimeHours ?? 0) : 0, doubleHours: v === "full" && a ? doubleOf(a) : 0 }))}
                      options={[{ value: "full", label: "Full" }, { value: "half", label: "Half" }, { value: "out", label: "Not in" }]}
                    />
                    {/* Overtime on a full day, typed at each rate: a day can have both (17 Nov). */}
                    {a?.status === "full" && (
                      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.93rem]">
                        <span className="text-muted">Hours over:</span>
                        <label className="flex items-center gap-1.5">
                          <NumInput label={`${p.name} hours at time and a half`} className="h-9 w-14" value={a.overtimeHours} onChange={(h) => actAs(me.id, () => markAttendance(site.id, p.id, day, { status: "full", overtimeHours: Math.max(0, h), doubleHours: doubleOf(a) }))} />
                          <span className="text-muted">at x1.5</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                          <NumInput label={`${p.name} hours at double time`} className="h-9 w-14" value={doubleOf(a)} onChange={(h) => actAs(me.id, () => markAttendance(site.id, p.id, day, { status: "full", overtimeHours: a.overtimeHours, doubleHours: Math.max(0, h) }))} />
                          <span className="text-muted">at x2</span>
                        </label>
                        {doubleWithoutHalf(a) && <span className="w-full text-[0.87rem] text-warn">{DOUBLE_WITHOUT_HALF}.</span>}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {people.length === 0 && <p className="text-muted">Nobody is on this job's list yet. Add someone with the box above.</p>}
        {canMark && <p className="mt-3 text-[0.93rem] text-muted">Time and a half (x1.5) is after a normal day's hours, up to midnight. Double time (x2) is only for work that carries on past midnight. {EARLY_START_NOTE}{canCorrect ? " A day already sent is changed with Change, and a short reason." : ""}</p>}
      </Dialog>
      {fix && <CorrectDialog key={`${fix.id}-${date}`} person={fix} date={date} bankHoliday={holiday} a={entry(fix.id)} onClose={() => setFix(null)} onSave={(mark, reason) => actAs(me.id, () => correctAttendance(site.id, fix.id, date, mark, reason))} />}
    </>
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
          Asked for: {person(r.personId!)?.name}. {r.decision === "Declined" ? `Turned down by ${r.decidedBy}${r.declineNote ? `. Note: ${r.declineNote}` : ""}` : r.decision === "Approved" ? "Agreed, the office is arranging it" : "Waiting for the office"}
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

/**
 * Overtime time stamp from the phone (Oisin, 17 Nov; "Weekend time stamp" until round ten): the same stamp the office makes on the
 * Timesheet, for a Saturday, a Sunday or a bank holiday that has been. Pick the day, tick who
 * worked (the job's crew, and anyone else in the firm), and type the hours at each rate.
 */
function WeekendSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const canMark = access.may("markTime");
  const holidays = db.bankHolidays;
  // The rest days of the last two weeks, newest first, from the day the job started. A week that
  // has gone to payroll is the office's to change, so its days are not offered here.
  const office = access.may("checkPayroll") || access.may("exportPayroll");
  const days = restDaysBetween(holidays, addDays(day, -14), day).filter((d) => d >= site.startDate && (office || !weekExported(db.payrollExports, d)));
  const [date, setDate] = useState(days[0] ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState<Person[]>([]);
  const [half, setHalf] = useState(0);
  const [double, setDouble] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const kind = date ? restDayKindOf(holidays, date) : null;
  const timeAndHalf = kind === "saturday" ? half : 0;
  const crew = crewOf(db, site.id, [date]);
  const others = db.people.filter((p) => p.active && p.kind === "Operative" && !crew.some((c) => c.id === p.id) && !extra.some((x) => x.id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const label = (d: string) => `${dWeekday(d)}${isBankHoliday(holidays, d) ? `, ${bankHolidayOn(holidays, d)?.name}` : ""}`;
  const done = db.attendance.filter((a) => a.projectId === site.id && a.status === "restday" && a.date === date);
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  const save = () => {
    if (!date || !kind) return setErrors(["Pick the day"]);
    if (picked.length === 0) return setErrors(["Tick who worked"]);
    const problem = restDayProblem(kind, timeAndHalf, double);
    if (problem) return setErrors([problem]);
    const refused: string[] = [];
    let saved = 0;
    for (const id of picked) {
      const no = actAs(me.id, () => stampRestDay(site.id, id, date, timeAndHalf, double));
      if (no) refused.push(`${name(id)}: ${no}`);
      else saved++;
    }
    if (saved > 0) toast(`${plural(saved, "time stamp")} saved for ${site.code}, ${dWeekday(date)}`);
    if (refused.length === 0) onClose();
    else {
      setErrors(refused);
      setPicked([]);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Overtime time stamp, ${site.code}`}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Close
          </Button>
          {canMark && days.length > 0 && (
            <Button size="lg" variant="primary" onClick={save}>
              Save time stamp
            </Button>
          )}
        </>
      }
    >
      {!canMark ? (
        <p className="text-muted">Time stamps need the "Mark the timesheet" permission.</p>
      ) : days.length === 0 ? (
        <p className="text-muted">There has been no Saturday, Sunday or bank holiday on this job in the last two weeks.</p>
      ) : (
        <div className="grid gap-3">
          <Field label="Day">
            {(id) => (
              <select id={id} className="field h-11" value={date} onChange={(e) => { setDate(e.target.value); setErrors([]); }}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {label(d)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {done.length > 0 && (
            <p className="rounded-md bg-canvas px-3 py-2 text-[0.93rem] text-muted">
              Already stamped that day: {done.map((a) => `${name(a.personId)} (${attendanceShort(a)})`).join(", ")}.
            </p>
          )}
          <fieldset>
            <legend className="mb-1 text-[0.93rem] font-medium">Who worked</legend>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="People to stamp">
              {[...crew, ...extra].map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-11 items-center gap-2.5 px-3 py-1">
                    <input type="checkbox" className="size-5" checked={picked.includes(p.id)} onChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))} />
                    <span className="min-w-0 flex-1">{p.name}</span>
                    <span className="text-[0.87rem] text-muted">{extra.some((x) => x.id === p.id) ? "From another site" : p.trade}</span>
                  </label>
                </li>
              ))}
            </ul>
            <select
              aria-label="Add someone from another site"
              className="field mt-2 h-11"
              value=""
              onChange={(e) => {
                const p = others.find((x) => x.id === e.target.value);
                if (!p) return;
                setExtra((x) => [...x, p]);
                setPicked((x) => [...x, p.id]);
              }}
            >
              <option value="">Add someone from another site</option>
              {others.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.trade}
                </option>
              ))}
            </select>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hours at time and a half">{(id) => <NumInput id={id} label="Hours at time and a half" className="h-11 w-full" value={timeAndHalf} onChange={setHalf} disabled={kind !== "saturday"} />}</Field>
            <Field label="Hours at double time">{(id) => <NumInput id={id} label="Hours at double time" className="h-11 w-full" value={double} onChange={setDouble} />}</Field>
          </div>
          {kind && <p className="text-[0.93rem] text-muted">{REST_DAY_RULE[kind]} There is no normal day on a rest day: every hour is overtime.</p>}
          {errors.length > 0 && (
            <ul role="alert" className="grid gap-1 text-[0.93rem] text-bad">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Next week on one job, day by day: who is down, and a button to ask for someone. Nothing here changes the plan. */
function SiteWeekSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  // Monday to Friday, and the Saturday or Sunday after them when anyone is down for it (17 Nov).
  const week = [...nextWorkWeek(day), ...fullWeek(nextWorkWeek(day)[0]!).slice(5).filter((d) => db.plan.some((p) => p.projectId === site.id && p.date === d))];
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
                  // Whole weeks (round ten): a day from the month next door is shown too, a little fainter.
                  const n = running ? count(d) : null;
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
                    <li key={d} className={cx(!inMonth && "opacity-70")} data-outside={!inMonth || undefined}>
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
                    {r.decision === "Declined" && <DeclineNote note={r.declineNote} />}
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

// ── From Compliance and Invoicing (merged 19 Nov) ─────────────────────────────

/** The crew of a job planned on it today or in the next two weeks whose needed ticket has run out on one of those days. */
function cannotWork(db: Db, siteId: string, day: string) {
  const until = addDays(day, 14);
  const days = [...new Set(db.plan.filter((e) => e.projectId === siteId && e.date >= day && e.date <= until).map((e) => e.date))].sort();
  return crewOf(db, siteId, days)
    .map((p) => {
      const planned = db.plan.filter((e) => e.projectId === siteId && e.personId === p.id && e.date >= day && e.date <= until).map((e) => e.date).sort();
      const onList = db.assignments.some((a) => a.projectId === siteId && a.personId === p.id);
      const checkDays = [...new Set([...(onList ? [day] : []), ...planned])].sort();
      const first = checkDays.find((d) => ticketBlocks(p, d).length > 0);
      return first ? { person: p, from: first, blocks: ticketBlocks(p, first), planned: planned.filter((d) => ticketBlocks(p, d).length > 0) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

const scaffoldsDue = (db: Db, siteId: string, day: string) => db.scaffolds.filter((s) => s.projectId === siteId && standing(s) && (scaffoldDue(s) < day || scaffoldUnsafe(s))).length;

const subsWaiting = (db: Db, siteId: string) => db.supplierInvoices.filter((s) => partyOf(s) === "subcontractor" && sitesOf(s).includes(siteId) && purchaseStage(s) === "approve");

function CannotWorkSheet({ site, day, onClose }: { site: Project; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const rows = cannotWork(db, site.id, day);
  return (
    <Dialog open onClose={onClose} title="Who cannot work">
      <div className="grid gap-3">
        <p className="text-[0.93rem] text-muted">On {site.code}, today and the next two weeks. Someone whose Safe Pass or trade ticket has run out cannot be marked or planned until it is renewed. The office renews it in Compliance.</p>
        {rows.length === 0 ? (
          <p>Everyone on {site.code} has the tickets they need.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line" aria-label={`Who cannot work on ${site.code}`}>
            {rows.map((r) => {
              const course = bookingFor(db.courses, r.person.id, r.blocks[0]!.ticket);
              return (
                <li key={r.person.id} className="grid gap-0.5 px-3 py-2.5">
                  <span className="font-medium">{r.person.name}</span>
                  <span className="text-[0.93rem] text-muted">{r.person.trade}</span>
                  <span className="text-[0.93rem] text-bad">
                    {r.from <= day ? "Cannot work today" : `Cannot work from ${dWeekday(r.from)}`}: {blocksText(r.blocks, day)}
                  </span>
                  {r.planned.length > 0 && <span className="text-[0.93rem]">Planned here {r.planned.length > 3 ? `on ${plural(r.planned.length, "day")} from ${dShort(r.planned[0]!)}` : r.planned.map((d) => dShort(d)).join(", ")}: the office takes them off or renews the ticket</span>}
                  {course && <span className="text-[0.93rem] text-accent-ink">Booked on the {course.ticket} course, {dShort(course.date)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

/** The job's scaffold register on the phone: each one standing, its last inspection, and a new one recorded on the spot. */
function ScaffoldSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const canInspect = access.may("recordInspections");
  const list = db.scaffolds.filter((s) => s.projectId === site.id && standing(s)).sort((a, b) => a.ref.localeCompare(b.ref));
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<"Safe to use" | "Not safe to use">("Safe to use");
  const [note, setNote] = useState("");
  return (
    <Dialog open onClose={onClose} title="Scaffold inspections">
      <div className="grid gap-3">
        <p className="text-[0.93rem] text-muted">Each scaffold and tower on {site.code} is inspected every 7 days and after any change. One tagged not safe stays "Do not use" until it is inspected safe.</p>
        {list.length === 0 && <p>No scaffold or tower is standing on {site.code}.</p>}
        <ul className="grid gap-2" aria-label={`Scaffolds on ${site.code}`}>
          {list.map((s) => {
            const last = s.inspections[0];
            const due = scaffoldDue(s);
            const unsafe = scaffoldUnsafe(s);
            const late = due < day;
            return (
              <li key={s.id} className="grid gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 font-medium">
                    {s.ref} {s.kind}
                  </span>
                  <Badge tone={unsafe || late ? "bad" : due <= addDays(day, 1) ? "warn" : "ok"}>{unsafe ? "Do not use" : late ? "Inspection overdue" : `Next by ${dShort(due)}`}</Badge>
                </span>
                <span className="text-[0.93rem] text-muted">{s.description}</span>
                <span className="text-[0.93rem]">{last ? `Last inspected ${dShort(last.date)} by ${last.by}: ${last.result.toLowerCase()}` : "Not inspected yet"}</span>
                {canInspect && open !== s.id && (
                  <Button size="lg" className="justify-self-start" onClick={() => { setOpen(s.id); setResult("Safe to use"); setNote(""); }}>
                    Record an inspection
                  </Button>
                )}
                {open === s.id && (
                  <div className="grid gap-2 rounded-md bg-canvas p-2.5">
                    <Segmented label={`${s.ref} inspection result`} value={result} onChange={setResult} options={[{ value: "Safe to use", label: "Safe to use" }, { value: "Not safe to use", label: "Not safe" }]} />
                    <Field label="What was seen" hint={result === "Not safe to use" ? "Say what is wrong, so it can be put right." : "Optional."}>
                      {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={note} onChange={(e) => setNote(e.target.value)} />}
                    </Field>
                    <div className="flex gap-2">
                      <Button size="lg" onClick={() => setOpen(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="lg"
                        variant="primary"
                        disabled={result === "Not safe to use" && !note.trim()}
                        onClick={() => {
                          actAs(me.id, () => inspectScaffold(s.id, result, note));
                          toast(`${s.ref} inspected: ${result.toLowerCase()}`);
                          setOpen(null);
                        }}
                      >
                        Save inspection
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}

/** Subcontractor invoices for this job waiting for approval: the site manager approves what was done, or sends it back. */
function SubInvoiceSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const [box, setBox] = useState<{ what: "approve" | "back"; s: SupplierInvoice } | null>(null);
  const list = subsWaiting(db, site.id);
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  const mine = runsSite(site, me.id);
  return (
    <>
      <Dialog open onClose={onClose} title="Subcontractor invoices">
        <div className="grid gap-3">
          <p className="text-[0.93rem] text-muted">Invoices subcontractors sent in for {site.code}. Only the site knows the work was done, so they wait for the person running it or the managing director. Once approved, accounts pay them.</p>
          {list.length === 0 && <p>Nothing waiting for approval on {site.code}.</p>}
          <ul className="grid gap-2" aria-label={`Subcontractor invoices for ${site.code}`}>
            {list.map((s) => {
              const sub = db.subcontractors.find((x) => x.id === s.subcontractorId);
              const flags = sub ? subInsuranceFlags(sub, day) : [];
              return (
                <li key={s.id} className="grid gap-1 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 font-medium">{s.supplier}</span>
                    <span className="tabular-nums">{money2(s.subtotal, region)}</span>
                  </span>
                  <span className="text-[0.93rem] text-muted">
                    {s.invoiceNo}, {dShort(s.invoiceDate)}. Before VAT
                  </span>
                  <span className="text-[0.93rem]">{s.lines.map((l) => l.description).join("; ")}</span>
                  {flags.length > 0 && <span className="text-[0.93rem] text-bad">{flags.join(". ")}</span>}
                  {mine ? (
                    <span className="mt-1 flex gap-2">
                      <Button size="lg" onClick={() => setBox({ what: "back", s })}>
                        Send back
                      </Button>
                      <Button size="lg" variant="primary" onClick={() => setBox({ what: "approve", s })}>
                        Approve
                      </Button>
                    </span>
                  ) : (
                    <span className="text-[0.93rem] text-muted">Waiting for {approverWords(s, limit, db.projects, (id) => db.people.find((p) => p.id === id)?.name)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Dialog>
      {box?.what === "approve" && <ApproveDialog s={box.s} actor={me.id} onClose={() => setBox(null)} />}
      {box?.what === "back" && <SendBackDialog s={box.s} actor={me.id} onClose={() => setBox(null)} />}
    </>
  );
}
