import { ArrowLeft, CalendarBlank, Receipt, CalendarDots, Camera, CaretRight, ClipboardText, HandPalm, Phone, PlusCircle, SignOut, Truck, X } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { actAs, addPhoto, addRequest, claimExpense, markAttendance, raiseExtra, requestLeave, sendTimeStamps, setPlanDay, submitVehicleCheck } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { type ExpenseKind, type Language, LANGUAGE_NAME, type Person, type Project, type RequestKind } from "@/data/types";
import { openDays, personWeek, planClashes, planShort } from "@/lib/availability";
import { addDays, MONTHS } from "@/lib/dates";
import { dShort, dWeekday, plural } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { type CheckAnswer, checkedCount, checkReady, CHECK_ITEMS, DRIVING_CHECK } from "@/lib/driving";
import { managerJobs, workingDays } from "@/lib/roster";
import { dueLabel, dueState } from "@/lib/status";
import { attendanceShort, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "@/lib/week";
import { Avatar, Badge, Button, cx, Dialog, Field, NumInput, PageBody, PageHead, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { EXTRAS, INSTRUCTIONS, MORE, WORDS } from "./words";

type Sheet = "photo" | "extra" | "ask" | "week" | "driving" | "profile" | "expense" | null;

type PhoneOf = "operative" | "manager";

/**
 * The site phone. Two kinds of phone (Oisin, 17 Nov): an operative's, which is one Today screen
 * with large buttons in their own language (unchanged), and a site manager's, which opens on the
 * jobs they run and, inside a job, the timesheet, the week and month ahead, photos, extras and
 * requests. On a computer it is drawn at phone width so it can be shown on a call.
 */
export function SiteView() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const access = useAccess();
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const crew = db.people.filter((p) => p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
  const managers = db.people.filter((p) => p.active && db.projects.some((x) => x.siteManagerId === p.id && (x.status === "Live" || x.status === "Not started"))).sort((a, b) => a.name.localeCompare(b.name));
  const [of, setOf] = useState<PhoneOf>(role === "site" ? "manager" : "operative");
  // A site manager signed in sees their own phone; the office can look at anyone's.
  const [managerId, setManagerId] = useState(role === "site" && access.personId ? access.personId : (managers[0]?.id ?? ""));
  const me = crew.find((p) => p.id === operativeId) ?? crew[0];
  const manager = managers.find((p) => p.id === managerId) ?? managers[0];
  // English first when the phone opens (Aodhan, 16 Nov); the operative's own language is one tap away.
  const [english, setEnglish] = useState(true);
  const office = role !== "operative" && role !== "site";
  const kind: PhoneOf = role === "operative" ? "operative" : of;
  if (kind === "operative" && !me) return null;
  const lang: Language = english || !me ? "en" : me.language;
  return (
    <>
      <PageHead
        title="Site phone view"
        note={kind === "operative" ? "What each operative sees on their own phone, in English or their own language. Photos, extras and requests sent from here land in the office straight away." : "What a site manager sees on their phone: the jobs they run, and in each one the timesheet, the week and month ahead, photos, extra work and requests."}
        actions={
          role !== "operative" && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Phone of" value={kind} onChange={setOf} options={[{ value: "operative", label: "Operative" }, { value: "manager", label: "Site manager" }]} />
              {kind === "operative" && me && (
                <label className="flex items-center gap-2 text-[0.93rem]">
                  <span className="text-muted">Signed in as</span>
                  <select aria-label="Operative to view the phone as" className="field w-auto" value={me.id} onChange={(e) => { setOperative(e.target.value); setEnglish(false); }}>
                    {crew.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}, {LANGUAGE_NAME[p.language]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "manager" && office && manager && (
                <label className="flex items-center gap-2 text-[0.93rem]">
                  <span className="text-muted">Signed in as</span>
                  <select aria-label="Site manager to view the phone as" className="field w-auto" value={manager.id} onChange={(e) => setManagerId(e.target.value)}>
                    {managers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )
        }
      />
      <PageBody className="grid justify-items-center gap-3">
        {kind === "operative" && me && (
          <>
            {me.language !== "en" && (
              <Segmented label="Language shown" value={english ? "en" : "own"} onChange={(v) => setEnglish(v === "en")} options={[{ value: "en", label: "English" }, { value: "own", label: LANGUAGE_NAME[me.language] }]} />
            )}
            <Phone_ key={me.id} me={me} lang={lang} day={day} />
          </>
        )}
        {kind === "manager" && (manager ? <ManagerPhone key={manager.id} me={manager} day={day} /> : <p className="text-muted">No site manager is running a job at the moment.</p>)}
      </PageBody>
    </>
  );
}

const BIG = "press flex min-h-16 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-left text-[1.05rem] font-medium hover:border-accent hover:text-accent-ink";
const longDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

type ManagerSheet = "time" | "week" | "month" | "photo" | "extra" | "ask" | "expense" | null;

/** A site manager's phone: their jobs first, then one job with everything they do on it. */
function ManagerPhone({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const jobs = managerJobs(db.projects, me.id);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ManagerSheet>(null);
  const job = jobs.find((p) => p.id === jobId);
  const onToday = (id: string) => new Set(db.plan.filter((p) => p.projectId === id && p.date === day).map((p) => p.personId)).size;
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
            <p className="text-[0.93rem] opacity-90">Today, {longDate(day)}</p>
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
                      {p.location}, {co(p.county)}. {p.status === "Live" ? `${plural(onToday(p.id), "person", "people")} on site today` : `Starts ${dShort(p.startDate)}`}
                    </span>
                  </span>
                  <CaretRight size={20} className="shrink-0 text-muted" />
                </button>
              </li>
            ))}
          </ul>
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
          <button type="button" className={BIG} onClick={() => setSheet("photo")}>
            <Camera size={24} className="text-accent-ink" /> Send a photo
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("extra")}>
            <PlusCircle size={24} className="text-accent-ink" /> Report extra work
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("ask")}>
            <HandPalm size={24} className="text-accent-ink" /> Make a request
          </button>
          <button type="button" className={BIG} onClick={() => setSheet("expense")}>
            <Receipt size={24} className="text-accent-ink" /> Claim a reimbursement
          </button>
        </div>
      )}
      {job && sheet === "time" && <TimeSheet site={job} me={me} day={day} onClose={() => setSheet(null)} />}
      {job && sheet === "week" && <SiteWeekSheet site={job} me={me} day={day} onClose={() => setSheet(null)} />}
      {job && sheet === "month" && <SiteMonthSheet site={job} day={day} onClose={() => setSheet(null)} />}
      {job && sheet === "photo" && <PhotoSheet site={job} me={me} lang="en" onClose={() => setSheet(null)} />}
      {job && sheet === "extra" && <ExtraSheet site={job} me={me} lang="en" onClose={() => setSheet(null)} />}
      {job && sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={job.id} sites={jobs} onClose={() => setSheet(null)} />}
      {job && sheet === "ask" && <AskSheet site={job} me={me} lang="en" day={day} title="Make a request" onClose={() => setSheet(null)} />}
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

/** Next week on one job, day by day: who is down, take someone off, add someone free that day. */
function SiteWeekSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const canPlan = access.may("planWeek");
  const week = nextWorkWeek(day);
  const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
  const clashes = planClashes(db.plan.filter((p) => live.has(p.projectId) && week.includes(p.date)));
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const operatives = db.people.filter((p) => p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Dialog open onClose={onClose} title={`Week ahead, ${site.code}`}>
      <p className="mb-2 text-[0.93rem] text-muted">Week of {dShort(week[0])}.{canPlan ? " Add someone free that day, or take someone off." : ""}</p>
      <ul className="grid gap-3">
        {week.map((d) => {
          const open = d >= site.startDate && d <= site.endDate;
          const entries = db.plan.filter((p) => p.projectId === site.id && p.date === d);
          const free = operatives.filter((p) => !entries.some((e) => e.personId === p.id) && openDays(personWeek(db.plan, db.holidays, live, p.id, [d])).length > 0);
          return (
            <li key={d} className="rounded-lg border border-line bg-surface">
              <p className="flex items-baseline justify-between border-b border-line px-3 py-2">
                <span className="font-medium">{dWeekday(d)}</span>
                <span className="text-[0.87rem] text-muted">{open ? plural(entries.length, "person", "people") : d < site.startDate ? "Not started" : "Finished"}</span>
              </p>
              {open && (
                <ul className="divide-y divide-line" aria-label={`Planned on ${dWeekday(d)}`}>
                  {entries.map((e) => {
                    const p = db.people.find((x) => x.id === e.personId);
                    const clash = clashes.get(`${e.personId}|${d}`)?.filter((s) => s !== site.id);
                    return (
                      <li key={e.id} className="flex min-h-11 items-center gap-2 px-3">
                        <span className="min-w-0 flex-1">
                          {p?.name}
                          {(e.part === "half" || e.overtimeHours) && <span className="text-muted">, {planShort(e).toLowerCase()}</span>}
                          {clash && clash.length > 0 && <span className="block text-[0.87rem] text-bad">Also on {clash.map(code).join(", ")}</span>}
                        </span>
                        {canPlan && (
                          <button
                            type="button"
                            aria-label={`Take ${p?.name} off ${dWeekday(d)}`}
                            className="press grid size-11 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
                            onClick={() => {
                              actAs(me.id, () => setPlanDay(site.id, e.personId, d, null));
                              toast(`${p?.name} taken off ${site.code} on ${dWeekday(d)}`);
                            }}
                          >
                            <X size={18} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {canPlan && (
                    <li className="px-3 py-2">
                      <select
                        aria-label={`Add someone on ${dWeekday(d)}`}
                        className="field h-11"
                        value=""
                        onChange={(ev) => {
                          const p = operatives.find((x) => x.id === ev.target.value);
                          if (!p) return;
                          actAs(me.id, () => setPlanDay(site.id, p.id, d, { part: "full", overtimeHours: 0 }));
                          toast(`${p.name} put on ${site.code}, ${dWeekday(d)}`);
                        }}
                      >
                        <option value="">Add someone free that day ({free.length})</option>
                        {free.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}, {p.trade}
                          </option>
                        ))}
                      </select>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Headcount on one job for every working day of a month: who attended for days gone, who is planned for days to come. */
function SiteMonthSheet({ site, day, onClose }: { site: Project; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const [ym, setYm] = useState(day.slice(0, 7));
  const days = workdaysOfMonth(ym);
  const markedToday = db.attendance.some((a) => a.projectId === site.id && a.date === day);
  const fromPlan = (d: string) => d > day || (d === day && !markedToday);
  const count = (d: string) => (fromPlan(d) ? db.plan : db.attendance).filter((x) => x.projectId === site.id && x.date === d).length;
  const weeks = [...new Set(days.map((d) => workWeek(d)[0]!))];
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return (
    <Dialog open onClose={onClose} title={`Month ahead, ${site.code}`}>
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
              return (
                <li key={d} className={cx("rounded-md border px-1 py-1.5", !inMonth ? "border-transparent opacity-0" : d === day ? "border-accent bg-accent-soft" : "border-line bg-surface")} aria-hidden={!inMonth}>
                  <span className="block text-[0.87rem] text-muted">
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" }).slice(0, 2)} {Number(d.slice(8))}
                  </span>
                  <span className={cx("block text-[1.05rem] font-semibold tabular-nums", n === 0 && "text-faint")}>{n === null ? "-" : n}</span>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <p className="mt-3 text-[0.87rem] text-muted">Each number is the people on {site.code} that day: who attended for days gone, who is planned for days to come.</p>
    </Dialog>
  );
}

function Phone_({ me, lang, day }: { me: Person; lang: Language; day: string }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const mine = db.assignments.filter((a) => a.personId === me.id && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)!);
  const site = mine.find((p) => db.attendance.some((a) => a.projectId === p.id && a.personId === me.id && a.date === day)) ?? mine[0];
  const manager = db.people.find((p) => p.id === site?.siteManagerId);
  const translated = site ? INSTRUCTIONS[site.code]?.[lang] : undefined;
  const instructions = lang === "en" || showOriginal || !translated ? site?.siteInstructions : translated;
  const dateText = new Date(day + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const big = "press flex min-h-16 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-left text-[1.05rem] font-medium hover:border-accent hover:text-accent-ink";
  return (
    <div className="w-full max-w-[24rem] overflow-hidden rounded-2xl border border-line-strong bg-canvas" aria-label="Phone screen" lang={lang}>
      <div className="bg-accent-strong px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={MORE[lang].profile} title={MORE[lang].profile} onClick={() => setSheet("profile")} className="press -ml-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/15">
            <span className="grid size-9 place-items-center rounded-full bg-white text-[0.87rem] font-semibold text-accent-ink">{me.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
          </button>
          <p className="text-[0.93rem] opacity-90">
            {t.today}, {dateText}
          </p>
        </div>
        <p className="font-display text-[1.35rem] leading-tight font-semibold">{site ? `${site.code} ${site.name}` : me.name}</p>
        {site && (
          <p className="text-[0.93rem] opacity-90">
            {site.location}, {co(site.county)}. {t.start}
          </p>
        )}
      </div>
      <div className="grid gap-3 px-4 py-4">
        {!site ? (
          <p className="rounded-lg bg-warn-soft px-3 py-3 text-warn">{t.noSite}</p>
        ) : (
          <>
            {manager && (
              <a href={`tel:${manager.phone.replace(/\s/g, "")}`} className="press flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.87rem] text-muted">{t.manager}</span>
                  <span className="font-medium">{manager.name}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-3 py-2 font-medium text-accent-ink">
                  <Phone size={18} /> {t.call}
                </span>
              </a>
            )}
            {site.siteInstructions && (
              <div className="rounded-lg bg-surface px-3 py-3">
                <p className="font-medium">{t.instructions}</p>
                <p className="mt-1 text-[1.02rem] leading-relaxed" lang={showOriginal || !translated ? "en" : lang}>
                  {instructions}
                </p>
                {translated && lang !== "en" && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[0.87rem] text-muted">
                    {!showOriginal && t.translated}
                    <button type="button" className="press font-medium text-accent-ink underline underline-offset-2" onClick={() => setShowOriginal((v) => !v)}>
                      {showOriginal ? t.mine : t.original}
                    </button>
                  </p>
                )}
              </div>
            )}
            <button type="button" className={big} onClick={() => setSheet("photo")}>
              <Camera size={24} className="text-accent-ink" /> {t.photo}
            </button>
            <button type="button" className={big} onClick={() => setSheet("extra")}>
              <PlusCircle size={24} className="text-accent-ink" /> {t.extra}
            </button>
            <button type="button" className={big} onClick={() => setSheet("ask")}>
              <HandPalm size={24} className="text-accent-ink" /> {t.ask}
            </button>
          </>
        )}
        <button type="button" className={big} onClick={() => setSheet("expense")}>
          <Receipt size={24} className="text-accent-ink" /> {MORE[lang].expense}
        </button>
        <button type="button" className={big} onClick={() => setSheet("driving")}>
          <Truck size={24} className="text-accent-ink" /> {MORE[lang].driving}
        </button>
        <button type="button" className={big} onClick={() => setSheet("week")}>
          <CalendarBlank size={24} className="text-accent-ink" /> {t.week}
        </button>
      </div>
      {site && sheet === "photo" && <PhotoSheet site={site} me={me} lang={lang} onClose={() => setSheet(null)} />}
      {site && sheet === "extra" && <ExtraSheet site={site} me={me} lang={lang} onClose={() => setSheet(null)} />}
      {site && sheet === "ask" && <AskSheet site={site} me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
      {sheet === "week" && <WeekSheet me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={() => setSheet(null)} />}
      {sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={site?.id ?? null} sites={mine} onClose={() => setSheet(null)} />}
      {sheet === "profile" && <ProfileSheet me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
    </div>
  );
}

function PhotoSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  const [caption, setCaption] = useState("");
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.photo}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!picture || !caption.trim()}
            onClick={() => {
              if (!picture) return;
              actAs(me.id, () => addPhoto(site.id, caption, "During", picture));
              toast(t.photoSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang={lang}>
        <PickFile accept="image/*" onFile={(f) => { setError(""); shrinkImage(f).then(setPicture).catch((e: Error) => { setPicture(null); setError(e.message); }); }} />
        {!picture && <p className="text-[0.93rem] text-muted">{t.takeOrChoose}</p>}
        <p role="alert" className="text-bad">
          {error}
        </p>
        {picture && <img src={picture.dataUrl} alt="" className="max-h-44 rounded-md border border-line" />}
        <Field label={t.caption}>{(id) => <input id={id} className="field h-11 text-[1.02rem]" value={caption} onChange={(e) => setCaption(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

function ExtraSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  const [pick, setPick] = useState(0);
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.extra}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={() => {
              const e = EXTRAS[pick]!;
              const foreign = me.language !== "en";
              actAs(me.id, () =>
                raiseExtra(site.id, {
                  description: note.trim() && !foreign ? `${e.en}. ${note.trim()}` : e.en,
                  measured: "To be measured on site",
                  estimatedValue: 0,
                  ...(foreign ? { original: note.trim() ? `${e[me.language]}. ${note.trim()}` : e[me.language], originalLanguage: me.language } : {}),
                }),
              );
              toast(t.extraSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-2" lang={lang}>
        <legend className="mb-1 font-medium">{t.found}</legend>
        {EXTRAS.map((e, i) => (
          <label key={e.en} className={cx("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5", pick === i ? "border-accent bg-accent-soft" : "border-line-strong")}>
            <input type="radio" name="extra" className="mt-1" checked={pick === i} onChange={() => setPick(i)} />
            <span>{e[lang]}</span>
          </label>
        ))}
        <Field label={t.note} className="mt-2">
          {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </fieldset>
    </Dialog>
  );
}

function AskSheet({ site, me, lang, day, title, onClose }: { site: Project; me: Person; lang: Language; day: string; title?: string; onClose: () => void }) {
  const t = WORDS[lang];
  const [kind, setKind] = useState<RequestKind>("own_plant");
  const [text, setText] = useState("");
  const kinds: [RequestKind, string][] = [["own_plant", t.ownPlant], ["hired_plant", t.hirePlant], ["personnel", t.people]];
  return (
    <Dialog
      open
      onClose={onClose}
      title={title ?? t.ask}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              actAs(me.id, () => addRequest({ projectId: site.id, kind, description: text.trim(), quantity: 1, neededFrom: addDays(day, 1), neededTo: addDays(day, 7), notes: lang === "en" ? "Sent from the site phone" : `Sent from the site phone in ${LANGUAGE_NAME[lang]}` }));
              toast(t.askSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-2" lang={lang}>
        <legend className="mb-1 font-medium">{t.need}</legend>
        {kinds.map(([k, label]) => (
          <label key={k} className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5", kind === k ? "border-accent bg-accent-soft" : "border-line-strong")}>
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
            <span>{label}</span>
          </label>
        ))}
        <Field label={t.what} className="mt-2">
          {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      </fieldset>
    </Dialog>
  );
}

function WeekSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  // After Friday's work the week that matters is the next one.
  const week = workWeek(new Date(day + "T12:00:00Z").getUTCDay() >= 5 ? addDays(day, 3) : day);
  const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
  const states = personWeek(db.plan, db.holidays, live, me.id, week);
  const project = (id: string) => db.projects.find((p) => p.id === id);
  return (
    <Dialog open onClose={onClose} title={t.week}>
      <ul className="divide-y divide-line" lang={lang}>
        {states.map((d) => {
          const entries = db.plan.filter((p) => p.personId === me.id && p.date === d.date && live.has(p.projectId));
          return (
            <li key={d.date} className="flex items-baseline gap-3 py-2.5">
              <span className="w-28 shrink-0 text-muted">{new Date(d.date + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <span className="min-w-0 flex-1 font-medium">
                {d.leave
                  ? t.leave
                  : entries.length === 0
                    ? <span className="font-normal text-muted">{t.free}</span>
                    : entries.map((e) => (
                        <span key={e.id} className="block">
                          {project(e.projectId)?.code} {project(e.projectId)?.name}
                          {e.part === "half" && <span className="font-normal text-muted">, {t.half}</span>}
                          {e.overtimeHours ? <span className="font-normal text-muted">, +{e.overtimeHours}h</span> : null}
                        </span>
                      ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/**
 * The driver's walkaround check (Oisin, 17 Nov): the vehicle they drive, then each item OK or a
 * defect, three sections, and Submit once everything is answered. A defect needs a note.
 */
function DrivingSheet({ me, day, onClose }: { me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const vehicles = db.vehicles.filter((v) => v.active);
  const mine = vehicles.find((v) => v.driverId === me.id);
  const [vehicleId, setVehicleId] = useState(mine?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, CheckAnswer>>({});
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const done = checkedCount(answers);
  const last = db.vehicleChecks.find((c) => c.vehicleId === vehicleId && c.at.slice(0, 10) === day);
  const set = (item: string, a: CheckAnswer) => setAnswers((x) => ({ ...x, [item]: a }));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Driving check"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!vehicle || !checkReady(answers)}
            onClick={() => {
              const defects = CHECK_ITEMS.filter((i) => !answers[i]!.ok).map((i) => ({ item: i, note: answers[i]!.note!.trim() }));
              actAs(me.id, () => submitVehicleCheck(vehicleId, defects));
              toast(defects.length ? `${plural(defects.length, "defect")} sent to the yard. Do not drive ${vehicle?.reg} until it has been looked at` : `Check sent for ${vehicle?.reg}. All OK`);
              onClose();
            }}
          >
            Submit check
          </Button>
        </>
      }
    >
      <div className="grid gap-4" lang="en">
        <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Truck size={20} className="text-accent-ink" />
            <p className="flex-1 font-medium">{mine ? "Assigned vehicle" : "Which vehicle?"}</p>
            <span className="text-[0.87rem] text-muted tabular-nums">
              {done}/{CHECK_ITEMS.length} checked
            </span>
          </div>
          {mine ? (
            <p className="mt-1">
              {mine.reg}, {mine.model}
            </p>
          ) : (
            <select aria-label="Vehicle" className="field mt-2 h-11" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Choose the vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reg}, {v.model}
                </option>
              ))}
            </select>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${(done / CHECK_ITEMS.length) * 100}%` }} />
          </div>
          {last && <p className="mt-2 text-[0.87rem] text-muted">Already checked today at {last.at.slice(11, 16)}{last.defects.length ? `, ${plural(last.defects.length, "defect")} reported` : ", all OK"}.</p>}
        </div>
        {DRIVING_CHECK.map((sec, n) => (
          <fieldset key={sec.title} className="grid gap-2">
            <legend className="mb-1 text-[0.87rem] font-semibold tracking-wide text-muted uppercase">
              {n + 1}. {sec.title}
            </legend>
            {sec.items.map((item) => {
              const a = answers[item];
              return (
                <div key={item} className={cx("rounded-lg border px-3 py-2.5", a && !a.ok ? "border-bad bg-bad-soft/40" : a?.ok ? "border-line bg-surface" : "border-line-strong bg-surface")}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1">{item}</p>
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={item}>
                      <button type="button" aria-pressed={a?.ok === true} onClick={() => set(item, { ok: true })} className={cx("press min-h-11 min-w-12 rounded-md px-2.5 text-[0.93rem] font-medium", a?.ok === true ? "bg-ok text-white" : "bg-canvas text-muted hover:text-ink")}>
                        OK
                      </button>
                      <button type="button" aria-pressed={a?.ok === false} onClick={() => set(item, { ok: false, note: a?.note ?? "" })} className={cx("press min-h-11 rounded-md px-2.5 text-[0.93rem] font-medium", a?.ok === false ? "bg-bad text-white" : "bg-canvas text-muted hover:text-ink")}>
                        Defect
                      </button>
                    </div>
                  </div>
                  {a && !a.ok && (
                    <Field label="What is wrong?" className="mt-2">
                      {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={a.note ?? ""} onChange={(e) => set(item, { ok: false, note: e.target.value })} />}
                    </Field>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}

/** The operative's own details, their leave, a way to ask for holidays, and signing out (Oisin, 17 Nov). */
function ProfileSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const role = usePrefs((s) => s.role);
  const setRole = usePrefs((s) => s.setRole);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState(addDays(day, 14));
  const [to, setTo] = useState(addDays(day, 18));
  const [note, setNote] = useState("");
  const leave = db.holidays.filter((h) => h.personId === me.id && h.to >= addDays(day, -30)).sort((a, b) => a.from.localeCompare(b.from));
  const m = MORE[lang];
  return (
    <Dialog open onClose={onClose} title={m.profile}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} size={48} />
          <div>
            <p className="font-display text-[1.2rem] font-semibold">{me.name}</p>
            <p className="text-muted">{me.trade}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" lang="en">
          <dt className="text-muted">Phone</dt>
          <dd>{me.phone}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{me.email}</dd>
          <dt className="text-muted">Language</dt>
          <dd>{LANGUAGE_NAME[me.language]}</dd>
          {me.sageNo && (
            <>
              <dt className="text-muted">Employee no.</dt>
              <dd className="tabular-nums">{me.sageNo}</dd>
            </>
          )}
        </dl>
        <div lang="en">
          <h3 className="mb-1 text-base">Tickets</h3>
          <ul className="divide-y divide-line rounded-md border border-line">
            {me.certs.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="flex-1">{c.name}</span>
                <Badge tone={dueState(c.expires, day) === "overdue" ? "bad" : dueState(c.expires, day) === "soon" ? "warn" : "ok"}>{dueLabel(c.expires, day)}</Badge>
              </li>
            ))}
          </ul>
        </div>
        <div lang="en">
          <h3 className="mb-1 text-base">Holidays</h3>
          {leave.length === 0 ? (
            <p className="text-muted">None booked.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line" aria-label="My holidays">
              {leave.map((h) => (
                <li key={h.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="flex-1">
                    {dShort(h.from)}
                    {h.to !== h.from && ` to ${dShort(h.to)}`}
                  </span>
                  <Badge tone={h.status === "Approved" ? "ok" : h.status === "Declined" ? "bad" : "accent"}>{h.status === "Requested" ? "Waiting" : h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {asking ? (
            <form
              className="mt-3 grid gap-2 rounded-lg border border-line bg-surface p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (to < from) return;
                actAs(me.id, () => requestLeave(me.id, from, to, note));
                toast(`Holiday request sent to the office: ${plural(workingDays(from, to), "working day")}`);
                setAsking(false);
                setNote("");
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <Field label="First day off">{(id) => <input id={id} type="date" className="field h-11" min={addDays(day, 1)} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
                <Field label="Last day off">{(id) => <input id={id} type="date" className="field h-11" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
              </div>
              <Field label="Reason (optional)">{(id) => <input id={id} className="field h-11" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              {to < from ? <p className="text-bad">The last day is before the first day.</p> : <p className="text-[0.93rem] text-muted">{plural(workingDays(from, to), "working day")}. The office approves or declines it.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAsking(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={to < from}>
                  Send request
                </Button>
              </div>
            </form>
          ) : (
            <Button size="lg" className="mt-3 w-full" onClick={() => setAsking(true)}>
              <CalendarBlank size={20} /> {m.requestLeave}
            </Button>
          )}
        </div>
        <MyClaims me={me} />
        <Button
          size="lg"
          variant="danger"
          className="w-full"
          onClick={() => {
            setRole(null);
            navigate("/who", { replace: true });
          }}
        >
          <SignOut size={20} /> {m.signOut}
          {role !== "operative" && <span className="sr-only"> of the demo role</span>}
        </Button>
      </div>
    </Dialog>
  );
}

const EXPENSE_KINDS: ExpenseKind[] = ["Fuel", "Materials", "Parking and tolls", "Tools and PPE", "Other"];

/**
 * Claim back money paid out of your own pocket for the firm (Oisin, 17 Nov): what for, how much,
 * which site, and a photo of the receipt. It waits for the director in Admin, Requests.
 */
function ExpenseSheet({ me, day, siteId, sites, onClose }: { me: Person; day: string; siteId: string | null; sites: Project[]; onClose: () => void }) {
  const region = usePrefs((s) => s.brand.region);
  const [kind, setKind] = useState<ExpenseKind>("Fuel");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(day);
  const [what, setWhat] = useState("");
  const [projectId, setProjectId] = useState(siteId ?? "");
  const [receipt, setReceipt] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  const ready = amount > 0 && what.trim().length > 0 && date <= day;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Claim a reimbursement"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!ready}
            onClick={() => {
              actAs(me.id, () => claimExpense({ personId: me.id, kind, what: what.trim(), amount, date, projectId: projectId || null, ...(receipt ? { receipt } : {}) }));
              toast(`Claim for ${amount.toFixed(2)} sent to the office${receipt ? "" : ". Hand in the paper receipt"}`);
              onClose();
            }}
          >
            Send claim
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">What was it for?</legend>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx("press min-h-11 rounded-lg border px-3", kind === k ? "border-accent bg-accent-soft font-medium text-accent-ink" : "border-line-strong")}>
                {k}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Amount paid (${region === "UK" ? "£" : "€"}, with VAT)`}>{() => <NumInput label="Amount paid" className="h-11 w-full text-[1.02rem]" value={amount} onChange={setAmount} />}</Field>
          <Field label="Day paid">{(id) => <input id={id} type="date" className="field h-11" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <Field label="What did you buy?">{(id) => <input id={id} className="field h-11 text-[1.02rem]" value={what} placeholder="Diesel for the van" onChange={(e) => setWhat(e.target.value)} />}</Field>
        <Field label="For which site">
          {(id) => (
            <select id={id} className="field h-11" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Not for one site</option>
              {sites.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div>
          <p className="mb-1 font-medium">Photo of the receipt</p>
          <PickFile accept="image/*" onFile={(f) => { setError(""); shrinkImage(f).then(setReceipt).catch((e: Error) => { setReceipt(null); setError(e.message); }); }} />
          <p role="alert" className="text-bad">
            {error}
          </p>
          {receipt ? <img src={receipt.dataUrl} alt="The receipt" className="mt-2 max-h-40 rounded-md border border-line" /> : <p className="text-[0.93rem] text-muted">Take a photo of it, or hand the paper receipt in to the office.</p>}
        </div>
      </div>
    </Dialog>
  );
}

/** The person's own claims and where each one stands. */
function MyClaims({ me }: { me: Person }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const claims = db.expenses.filter((x) => x.personId === me.id).slice(0, 6);
  if (claims.length === 0) return null;
  return (
    <div lang="en">
      <h3 className="mb-1 text-base">Reimbursements</h3>
      <ul className="divide-y divide-line rounded-md border border-line" aria-label="My reimbursements">
        {claims.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              {x.kind}, {dShort(x.date)}
            </span>
            <span className="tabular-nums">{region === "UK" ? "£" : "€"}{x.amount.toFixed(2)}</span>
            <Badge tone={x.status === "Approved" ? "ok" : x.status === "Declined" ? "bad" : "accent"}>{x.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}
