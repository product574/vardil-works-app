import { X } from "@phosphor-icons/react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addToRoster, correctAttendance, decideOvertimeClaim, markAttendance, removeFromRoster, sendTimeStamps, stampRestDay } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Attendance, BankHoliday, OvertimeClaim, Person } from "@/data/types";
import { bankHolidayOn, isBankHoliday, restDayKindOf as kindOf, restDaysBetween } from "@/lib/bank-holidays";
import { addDays } from "@/lib/dates";
import { dLong, dShort, dWeekday, plural, whenInline } from "@/lib/format";
import { DOUBLE_WITHOUT_HALF, doubleOf, doubleWithoutHalf, EARLY_START_NOTE, OVERTIME_RULES, overtimeText, overtimeTotal, rateShort, REST_DAY_RULE, restDayProblem } from "@/lib/overtime";
import { claimHours, suggestedSplit } from "@/lib/overtime-claims";
import { weekExported } from "@/lib/payroll";
import { type AttendanceChoice as Choice, attendanceChoice, attendanceShort, choiceMark as toMark, type DayMark, fullWeek, restDayMark, workWeek } from "@/lib/week";
import { Button, cx, type DeclineAsk, DeclineDialog, DeclineNote, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * The week's attendance for one site. Today's column is filled in and sent; earlier days are
 * corrected with a reason. The grid is Monday to Friday. Work on a Saturday, a Sunday or a bank
 * holiday is the exception, so it goes in with the Overtime time stamp button (Oisin, 17 Nov).
 *
 * Under the grid is "Overtime" (round ten): every hour at an overtime rate on this site in the
 * week shown, whether it was marked on a normal day, stamped for a rest day or claimed by an
 * operative from the phone, and the claims still waiting for a yes or no.
 */
export function Timesheet() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const [weekOf, setWeekOf] = useState(day);
  const [fix, setFix] = useState<{ person: Person; date: string } | null>(null);
  const [adding, setAdding] = useState("");
  const [stamping, setStamping] = useState(false);
  const [fixStamp, setFixStamp] = useState<Attendance | null>(null);
  const [approving, setApproving] = useState<OvertimeClaim | null>(null);
  const [no, setNo] = useState<DeclineAsk | null>(null);

  const sites = access.scope(db.projects).filter((p) => p.status === "Live");
  const site = sites.find((p) => p.id === params.get("site")) ?? sites[0];
  if (!site)
    return (
      <>
        <PageHead title="Timesheet" />
        <PageBody>
          <Panel>
            <Empty title="No live sites">Attendance is marked against live projects. Set a project live to start.</Empty>
          </Panel>
        </PageBody>
      </>
    );

  const week = workWeek(weekOf);
  const thisWeek = week.includes(day);
  const holidays = db.bankHolidays;
  // Overtime on this site in the week shown, Monday to Sunday (round ten): every entry with hours
  // at an overtime rate, on a normal day or a rest day, and the operatives' claims for those days.
  const days7 = fullWeek(weekOf);
  const byDayThenName = (a: { date: string; personId: string }, b: { date: string; personId: string }) => a.date.localeCompare(b.date) || nameOf(db.people, a.personId).localeCompare(nameOf(db.people, b.personId));
  const overtime = db.attendance.filter((a) => a.projectId === site.id && days7.includes(a.date) && overtimeTotal(a) > 0).sort(byDayThenName);
  const claims = db.overtimeClaims.filter((c) => c.projectId === site.id);
  const waiting = claims.filter((c) => c.status === "Waiting" && days7.includes(c.date)).sort(byDayThenName);
  const declined = claims.filter((c) => c.status === "Declined" && days7.includes(c.date)).sort(byDayThenName);
  // Claims waiting for a day in another week: say so, with a way to that week's sheet.
  const waitingElsewhere = claims.filter((c) => c.status === "Waiting" && !days7.includes(c.date)).sort((a, b) => b.date.localeCompare(a.date));
  const claimBehind = (a: Attendance) => claims.find((c) => c.status === "Approved" && c.personId === a.personId && c.date === a.date);
  // On this week's sheet the weekend is still to come, so say where last weekend's stamps are.
  const lastWeekend = thisWeek ? db.attendance.filter((a) => a.projectId === site.id && a.status === "restday" && fullWeek(addDays(week[0]!, -7)).includes(a.date)) : [];
  const roster = db.assignments
    .filter((a) => a.projectId === site.id)
    .map((a) => db.people.find((p) => p.id === a.personId)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  // A normal day's entry. A bank holiday's time stamp is listed under the grid, not in it.
  const entry = (personId: string, date: string) => db.attendance.find((a) => a.projectId === site.id && a.personId === personId && a.date === date && a.status !== "restday");
  const leave = (personId: string, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);
  // Counts on screen cover the people on this site's list now. Someone taken off the list
  // keeps their attendance, and anything of theirs not yet sent still goes with the day.
  const onList = (a: Attendance) => roster.some((r) => r.id === a.personId);
  const markedOn = (date: string) => db.attendance.filter((a) => a.projectId === site.id && a.date === date && a.status !== "restday" && onList(a));
  const today = markedOn(day);
  const unsentShown = today.filter((a) => !a.sent).length;
  const unsent = db.attendance.filter((a) => a.projectId === site.id && a.date === day && !a.sent).length;
  const spare = db.people.filter((p) => p.active && p.kind === "Operative" && !roster.some((r) => r.id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const canMark = access.may("markTime");
  // Once a week has gone to payroll only the office changes it: whoever checks or exports the
  // payroll (round ten). Until then anyone who may correct a day can, site managers included.
  const office = access.may("checkPayroll") || access.may("exportPayroll");
  const gone = (date: string) => weekExported(db.payrollExports, date) && !office;
  const locked = gone(week[0]!);
  const canCorrect = access.may("correctTime") && !locked;
  const answer = canMark;

  return (
    <>
      <PageHead
        title="Timesheet"
        note={`${site.code} ${site.name}. ${today.length} of ${roster.length} marked for today${today.length > 0 ? (unsentShown > 0 ? `, ${unsentShown} not sent yet` : ", all sent") : ""}. Time stamps lock at 13:00 each working day.`}
        actions={
          canMark && (
            <>
              <Button onClick={() => setStamping(true)}>Overtime time stamp</Button>
              <Button
                variant="primary"
                disabled={unsent === 0}
                onClick={() => {
                  const n = sendTimeStamps(site.id, day);
                  toast(`Time stamps sent for ${plural(n, "person", "people")}`);
                }}
              >
                Send today's time stamps
              </Button>
            </>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Site" className="field w-auto max-w-full" value={site.id} onChange={(e) => setParams({ site: e.target.value }, { replace: true })}>
            {sites.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.name}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => setWeekOf(addDays(week[0]!, -7))}>
            Earlier week
          </Button>
          <Button size="sm" disabled={thisWeek} onClick={() => setWeekOf(addDays(week[0]!, 7))}>
            Later week
          </Button>
          {!thisWeek && (
            <Button size="sm" variant="ghost" onClick={() => setWeekOf(day)}>
              Back to this week
            </Button>
          )}
          <span className="text-[0.93rem] text-muted">Week of {dShort(week[0])}</span>
        </div>
        <OvertimeRules className="mt-3" />
      </PageHead>
      <PageBody className="grid max-w-6xl gap-4">
        <Panel className="overflow-x-auto">
          {/* At the top of the week's table, where it is looked for (Oisin, round ten); it was under the grid. */}
          {canMark && (
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <select aria-label="Add someone to this site" className="field w-auto max-w-full" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Add someone to this site</option>
                {spare.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}
                  </option>
                ))}
              </select>
              <Button
                disabled={!adding}
                onClick={() => {
                  addToRoster(site.id, adding);
                  toast(`${db.people.find((p) => p.id === adding)?.name} added to ${site.code}`);
                  setAdding("");
                }}
              >
                Add to site
              </Button>
              <span className="text-[0.93rem] text-muted">
                {roster.length === 1 ? "1 person" : `${roster.length} people`} on {site.code} now.
              </span>
            </div>
          )}
          <table className="tbl">
            <thead>
              <tr>
                <th className="min-w-[13rem]">Name</th>
                {week.map((d) => (
                  <th key={d} className={cx("w-[9.5rem]", d === day && "bg-accent-soft! text-accent-ink!")}>
                    {dWeekday(d)}
                    {d === day && <span className="font-normal"> (today)</span>}
                    {isBankHoliday(holidays, d) && <span className="block font-normal text-muted">{bankHolidayOn(holidays, d)?.name}</span>}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty title="Nobody is on this site's roster yet">Add people with the box above, or plan them on from the week ahead.</Empty>
                  </td>
                </tr>
              )}
              {roster.map((person) => (
                <tr key={person.id}>
                  <td>
                    <span className="font-medium">{person.name}</span>
                    <span className="block text-[0.87rem] text-muted">{person.trade}</span>
                  </td>
                  {week.map((d) => (
                    <td key={d} className={cx("align-middle!", d === day && "min-w-[14rem] bg-accent-soft/50")}>
                      <Cell person={person} date={d} day={day} startDate={site.startDate} bankHoliday={isBankHoliday(holidays, d)} canMark={canMark} canCorrect={canCorrect} a={entry(person.id, d)} onLeave={leave(person.id, d)} onMark={(mark) => markAttendance(site.id, person.id, d, mark)} onFix={() => setFix({ person, date: d })} />
                    </td>
                  ))}
                  <td className="w-10 text-right align-middle!">
                    {canMark && <button
                      type="button"
                      aria-label={`Take ${person.name} off this site`}
                      title="Take off this site"
                      className="press grid size-8 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
                      onClick={() => {
                        removeFromRoster(site.id, person.id);
                        toast(`${person.name} taken off ${site.code}. Past attendance is kept`);
                      }}
                    >
                      <X size={16} />
                    </button>}
                  </td>
                </tr>
              ))}
            </tbody>
            {roster.length > 0 && (
              <tfoot>
                <tr>
                  <td className="border-t border-line-strong text-muted">Marked on site</td>
                  {week.map((d) => (
                    <td key={d} className="border-t border-line-strong text-muted">
                      {d > day ? "" : isBankHoliday(holidays, d) && markedOn(d).length === 0 ? "Bank holiday" : `${markedOn(d).length} of ${roster.length}`}
                    </td>
                  ))}
                  <td className="border-t border-line-strong" />
                </tr>
              </tfoot>
            )}
          </table>
        </Panel>

        <Section title="Overtime" aside={`Week of ${dShort(week[0])}, to ${dWeekday(days7[6])}`}>
          {waiting.length > 0 && (
            <Panel className="mb-3">
              <h3 className="border-b border-line px-3 py-2 text-[0.93rem] font-medium">Claimed from the phone, waiting for a yes or no</h3>
              <ul className="divide-y divide-line" aria-label="Overtime claims to answer">
                {waiting.map((c) => {
                  const who = nameOf(db.people, c.personId);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <p className="min-w-0 flex-1">
                        <span className="font-medium">{who}</span>, {dWeekday(c.date)}: {claimHours(c.hours)}
                        {c.note && <span className="block text-[0.93rem] text-muted">"{c.note}"</span>}
                        <span className="block text-[0.87rem] text-muted">Claimed {whenInline(c.createdAt, day)}</span>
                      </p>
                      {answer && !gone(c.date) ? (
                        <span className="flex gap-2">
                          <Button size="sm" aria-label={`Decline the overtime claim from ${who}, ${dWeekday(c.date)}`} onClick={() => setNo({ title: `Decline ${who}'s overtime claim`, about: `${claimHours(c.hours)} on ${dWeekday(c.date)}. Nothing is added to the timesheet.`, confirm: "Decline claim", run: (note) => { decideOvertimeClaim(c.id, false, { note }); toast(`Claim declined for ${who}`); } })}>
                            Decline
                          </Button>
                          <Button size="sm" variant="primary" aria-label={`Approve the overtime claim from ${who}, ${dWeekday(c.date)}`} onClick={() => setApproving(c)}>
                            Approve
                          </Button>
                        </span>
                      ) : (
                        <span className="text-[0.93rem] text-muted">{gone(c.date) ? "That week has gone to payroll: the office answers it" : "Waiting for the site manager"}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
          <Panel className="overflow-x-auto">
            {overtime.length === 0 ? (
              <p className="px-3 py-3 text-muted">
                No overtime on this site in this week.{canMark ? " Overtime after a normal day is marked in the grid (Full + overtime). Use Overtime time stamp, at the top right, for a Saturday, a Sunday or a bank holiday." : ""}
              </p>
            ) : (
              <table className="tbl" aria-label="Overtime in this week">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Name</th>
                    <th>Hours</th>
                    <th>How it came in</th>
                    <th>Saved</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {overtime.map((a) => {
                    const p = db.people.find((x) => x.id === a.personId);
                    const claim = claimBehind(a);
                    const rest = a.status === "restday";
                    return (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap">
                          {dWeekday(a.date)}
                          {isBankHoliday(holidays, a.date) && <span className="block text-[0.87rem] text-muted">{bankHolidayOn(holidays, a.date)?.name}</span>}
                        </td>
                        <td>
                          <span className="font-medium">{p?.name}</span>
                          <span className="block text-[0.87rem] text-muted">{p?.trade}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          {overtimeText(a)}
                          {doubleWithoutHalf(a) && <span className="block text-[0.87rem] text-warn">Double time, no time and a half</span>}
                        </td>
                        <td className="text-muted">
                          {claim ? `Claimed from the phone, approved by ${claim.decidedBy}` : rest ? "Overtime time stamp" : "Marked on the timesheet"}
                          {!a.sent && <span className="block text-[0.87rem]">Not sent yet</span>}
                        </td>
                        <td className="text-muted">
                          {a.savedBy}, {whenInline(a.savedAt, day)}
                        </td>
                        <td className="text-right">
                          {canCorrect && (rest || a.sent) && p && (
                            <Button size="sm" aria-label={`Change the ${rest ? "time stamp" : "overtime"} for ${p.name}, ${dWeekday(a.date)}`} onClick={() => (rest ? setFixStamp(a) : setFix({ person: p, date: a.date }))}>
                              Change
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="border-t border-line-strong text-muted" colSpan={2}>
                      {plural(overtime.length, "entry", "entries")} for {plural(new Set(overtime.map((a) => a.personId)).size, "person", "people")}
                    </td>
                    <td className="border-t border-line-strong whitespace-nowrap font-medium" colSpan={4}>
                      {overtimeText({ overtimeHours: overtime.reduce((n, a) => n + a.overtimeHours, 0), doubleHours: overtime.reduce((n, a) => n + doubleOf(a), 0) })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
          {declined.length > 0 && (
            <ul className="mt-2 grid gap-1 text-[0.93rem] text-muted" aria-label="Overtime claims declined">
              {declined.map((c) => (
                <li key={c.id}>
                  Declined: {nameOf(db.people, c.personId)}, {dWeekday(c.date)}, {claimHours(c.hours)}. {c.decidedBy}, {whenInline(c.decidedAt, day)}.
                  <DeclineNote note={c.declineNote} />
                </li>
              ))}
            </ul>
          )}
          {waitingElsewhere.length > 0 && (
            <p className="mt-2 text-[0.93rem] text-muted">
              {plural(waitingElsewhere.length, "overtime claim is", "overtime claims are")} waiting on another week's sheet:{" "}
              <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => setWeekOf(waitingElsewhere[0]!.date)}>
                show the week of {dShort(workWeek(waitingElsewhere[0]!.date)[0])}
              </button>
              .
            </p>
          )}
          {lastWeekend.length > 0 && (
            <p className="mt-2 text-[0.93rem] text-muted">
              Last weekend has {plural(lastWeekend.length, "time stamp")} on this site. They are on last week's sheet:{" "}
              <button type="button" className="font-medium text-accent-ink underline underline-offset-2" onClick={() => setWeekOf(addDays(week[0]!, -7))}>
                show last week
              </button>
              .
            </p>
          )}
        </Section>

        {locked && <p className="text-[0.93rem] text-muted">This week's hours have gone to payroll. Only the office, whoever checks or exports the payroll, can change them now.</p>}
        {!canMark && <p className="text-[0.93rem] text-muted">You can read this timesheet{canCorrect ? " and correct earlier days" : ""}. Marking today is for people with the "Mark the timesheet" permission.</p>}
        {canMark && !locked && <p className="text-[0.93rem] text-muted">Click any earlier day to correct it. Every correction keeps the old value, who changed it and why.</p>}
      </PageBody>

      {fix && <CorrectDialog key={`${fix.person.id}-${fix.date}`} person={fix.person} date={fix.date} bankHoliday={isBankHoliday(holidays, fix.date)} a={entry(fix.person.id, fix.date)} onClose={() => setFix(null)} onSave={(mark, reason) => correctAttendance(site.id, fix.person.id, fix.date, mark, reason)} />}
      {stamping && (
        <RestDayDialog
          site={`${site.code} ${site.name}`}
          holidays={holidays}
          // The rest days of the week shown and of the week before it, up to today, newest first.
          days={restDaysBetween(holidays, addDays(week[0]!, -7), days7[6]! < day ? days7[6]! : day).filter((d) => !gone(d))}
          first={restDaysBetween(holidays, week[0]!, days7[6]! < day ? days7[6]! : day).filter((d) => !gone(d))[0]}
          crew={roster}
          others={db.people.filter((p) => p.active && p.kind === "Operative" && !roster.some((r) => r.id === p.id)).sort((a, b) => a.name.localeCompare(b.name))}
          onClose={() => setStamping(false)}
          onSave={(date, personIds, timeAndHalf, double) => {
            const refused: string[] = [];
            let saved = 0;
            for (const id of personIds) {
              const problem = stampRestDay(site.id, id, date, timeAndHalf, double);
              if (problem) refused.push(`${nameOf(db.people, id)}: ${problem}`);
              else saved++;
            }
            if (saved > 0) {
              toast(`${plural(saved, "time stamp")} saved for ${dWeekday(date)}`);
              // Show the week the stamp is in, so it is there to see in the list.
              setWeekOf(date);
            }
            return refused;
          }}
        />
      )}
      {approving && <ClaimDialog key={approving.id} claim={approving} person={nameOf(db.people, approving.personId)} holidays={holidays} on={db.attendance.find((a) => a.projectId === approving.projectId && a.personId === approving.personId && a.date === approving.date)} onClose={() => setApproving(null)} />}
      <DeclineDialog ask={no} onClose={() => setNo(null)} />
      {fixStamp && <RestDayFix key={fixStamp.id} a={fixStamp} person={nameOf(db.people, fixStamp.personId)} holidays={holidays} onClose={() => setFixStamp(null)} onSave={(mark, reason) => correctAttendance(site.id, fixStamp.personId, fixStamp.date, mark, reason)} />}
    </>
  );
}

const nameOf = (people: Person[], id: string) => people.find((p) => p.id === id)?.name ?? "-";

type Mark = DayMark | null;

function Cell({ person, date, day, startDate, bankHoliday, a, onLeave, onMark, onFix, canMark, canCorrect }: { person: Person; date: string; day: string; startDate: string; bankHoliday: boolean; a: Attendance | undefined; onLeave: boolean; onMark: (m: Mark) => void; onFix: () => void; canMark: boolean; canCorrect: boolean }) {
  if (date > day) return <span className="text-faint">{onLeave ? "Leave" : bankHoliday ? "Bank holiday" : ""}</span>;
  if (onLeave && !a) return <span className="inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[0.93rem] text-warn">Leave</span>;
  if (date < startDate) return <span className="text-faint">Not started</span>;
  // Nobody is marked a normal day on a bank holiday. Work on one goes in as an overtime time stamp, listed under the grid.
  if (bankHoliday && !a) return <span className="px-2 text-faint">Bank holiday</span>;

  // Today, until the day is sent: marked straight in the grid.
  const text = a ? attendanceShort(a) : "Not in";
  const odd = !!a && doubleWithoutHalf(a);
  if (date === day && !a?.sent && !canMark) return <span className="px-2 text-muted">{a ? text : "Not marked"}</span>;
  if ((date < day || a?.sent) && !canCorrect) return <span className={cx("px-2", a ? (a.status === "half" ? "text-warn" : "") : "text-muted")}>{text}</span>;
  if (date === day && !a?.sent) return <TodayMark key={person.id} person={person} a={a} onMark={onMark} />;

  // Sent days change only through a correction.
  return (
    <button type="button" onClick={onFix} title={odd ? DOUBLE_WITHOUT_HALF : "Correct this day"} aria-label={`${person.name}, ${dShort(date)}: ${a ? text : "not in"}${odd ? `. ${DOUBLE_WITHOUT_HALF}` : ""}. Correct this day`} className={cx("press min-h-8 w-full rounded-md px-2 py-1 text-left hover:bg-accent-soft", a ? (a.status === "half" || odd ? "text-warn" : "text-ink") : "border border-dashed border-line-strong text-muted")}>
      {a ? text : "Not in"}
    </button>
  );
}

/**
 * Today's mark for one person: not marked, a full day, a half day, or a full day with overtime.
 * Overtime opens two boxes of hours, one at each rate, since a day can have both (17 Nov).
 */
function TodayMark({ person, a, onMark }: { person: Person; a: Attendance | undefined; onMark: (m: Mark) => void }) {
  // The boxes stay open while someone is typing, even while both read nought.
  const [open, setOpen] = useState(!!a && overtimeTotal(a) > 0);
  const choice: Choice = open && a?.status === "full" ? "overtime" : attendanceChoice(a);
  const half = a?.overtimeHours ?? 0;
  const double = a ? doubleOf(a) : 0;
  return (
    <span className="grid gap-1">
      <select
        aria-label={`Today for ${person.name}`}
        className={cx("field h-8 min-w-0 px-1.5", choice === "" && "text-muted")}
        value={choice}
        onChange={(e) => {
          const c = e.target.value as Choice;
          setOpen(c === "overtime");
          // Overtime starts at one hour at time and a half, the usual case, and is typed over.
          onMark(c === "overtime" ? toMark(c, half || 1, double) : toMark(c));
        }}
      >
        <option value="">Not marked</option>
        <option value="full">Full day</option>
        <option value="half">Half day</option>
        <option value="overtime">Full + overtime</option>
      </select>
      {choice === "overtime" && (
        <span className="flex items-center gap-1 text-[0.87rem] text-muted">
          <span>x1.5</span>
          <NumInput label={`Hours at time and a half for ${person.name}`} className="w-12 shrink-0 px-1.5" value={half} onChange={(n) => onMark(toMark("overtime", n, double))} />
          <span className="ml-1">x2</span>
          <NumInput label={`Hours at double time for ${person.name}`} className="w-12 shrink-0 px-1.5" value={double} onChange={(n) => onMark(toMark("overtime", half, n))} />
        </span>
      )}
      {a && doubleWithoutHalf(a) && <span className="text-[0.87rem] text-warn">{DOUBLE_WITHOUT_HALF}.</span>}
    </span>
  );
}

/**
 * Correct a day that has gone to the office, with a reason. Shared with the site manager's
 * phone, where sent days are changed the same way (round ten). A bank holiday holds an overtime
 * time stamp or nothing, never a normal day, so on one the only correction is "Not in".
 */
export function CorrectDialog({ person, date, a, bankHoliday, onClose, onSave }: { person: Person; date: string; a: Attendance | undefined; bankHoliday?: boolean; onClose: () => void; onSave: (mark: Mark, reason: string) => void }) {
  const [choice, setChoice] = useState<Choice>(bankHoliday ? "" : attendanceChoice(a));
  const [half, setHalf] = useState(a?.overtimeHours || 0);
  const [double, setDouble] = useState(a ? doubleOf(a) : 0);
  const [reason, setReason] = useState("");
  const was = a ? attendanceShort(a) : "Not in";
  const next = toMark(choice, half, double);
  const now = next ? attendanceShort(next) : "Not in";
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Correct ${person.name}, ${dLong(date)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!reason.trim() || was === now}
            onClick={() => {
              onSave(next, reason);
              toast(`Corrected: ${was} to ${now}`);
              onClose();
            }}
          >
            Save correction
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-muted">
          Recorded as <span className="font-medium text-ink">{was}</span>
          {a && `, saved by ${a.savedBy}`}.
        </p>
        <Field label="Should be">
          {(id) => (
            <select
              id={id}
              className="field"
              value={choice}
              onChange={(e) => {
                const c = e.target.value as Choice;
                setChoice(c);
                if (c === "overtime" && half + double <= 0) setHalf(1);
              }}
            >
              <option value="">Not in</option>
              {!bankHoliday && <option value="full">Full day</option>}
              {!bankHoliday && <option value="half">Half day</option>}
              {!bankHoliday && <option value="overtime">Full + overtime</option>}
            </select>
          )}
        </Field>
        {bankHoliday && <p className="text-[0.93rem] text-muted">This is a bank holiday. Nobody is marked a normal day on one: work that day goes in with Overtime time stamp, at double time.</p>}
        {choice === "overtime" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hours at time and a half">{(id) => <NumInput id={id} label="Hours at time and a half" className="h-9 w-full" value={half} onChange={setHalf} />}</Field>
              <Field label="Hours at double time">{(id) => <NumInput id={id} label="Hours at double time" className="h-9 w-full" value={double} onChange={setDouble} />}</Field>
            </div>
            <p className="text-[0.93rem] text-muted">Time and a half runs from the end of a normal day's hours up to midnight. Double time is only for work that carries on past midnight. {EARLY_START_NOTE}</p>
            {next && doubleWithoutHalf(next) && <p className="text-[0.93rem] text-warn">{DOUBLE_WITHOUT_HALF}. It will be saved, and flagged for the manager's weekly check.</p>}
          </>
        )}
        <Field label="Reason for the correction" hint="Kept with the change in the attendance history.">
          {(id) => <input id={id} className="field" value={reason} placeholder="Left at lunch for a hospital appointment" onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}

const dayLabel = (holidays: BankHoliday[], date: string) => `${dWeekday(date)}${isBankHoliday(holidays, date) ? `, ${bankHolidayOn(holidays, date)?.name}` : ""}`;

/** The two boxes of hours for a rest day, with the rule for that day. Sunday and bank holiday hours are all double time. */
function RestDayHours({ holidays, date, half, double, setHalf, setDouble }: { holidays: BankHoliday[]; date: string; half: number; double: number; setHalf: (n: number) => void; setDouble: (n: number) => void }) {
  const kind = kindOf(holidays, date);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hours at time and a half">{(id) => <NumInput id={id} label="Hours at time and a half" className="h-9 w-full" value={kind === "saturday" ? half : 0} onChange={setHalf} disabled={kind !== "saturday"} />}</Field>
        <Field label="Hours at double time">{(id) => <NumInput id={id} label="Hours at double time" className="h-9 w-full" value={double} onChange={setDouble} />}</Field>
      </div>
      {kind && <p className="text-[0.93rem] text-muted">{REST_DAY_RULE[kind]} There is no normal day on a rest day: every hour is overtime.</p>}
    </>
  );
}

/**
 * Overtime time stamp (Oisin, 17 Nov; "Weekend time stamp" until round ten): put people in for a
 * Saturday, a Sunday or a bank holiday. Overtime after a normal day is marked in the grid.
 * Pick the day, tick who worked (this site's crew, and anyone else in the firm), and type the
 * hours at each rate. One stamp is saved for each person ticked.
 */
function RestDayDialog({ site, holidays, days, first, crew, others, onClose, onSave }: { site: string; holidays: BankHoliday[]; days: string[]; first?: string; crew: Person[]; others: Person[]; onClose: () => void; onSave: (date: string, personIds: string[], timeAndHalf: number, double: number) => string[] }) {
  const [date, setDate] = useState(first ?? days[0] ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [extra, setExtra] = useState<Person[]>([]);
  const [half, setHalf] = useState(0);
  const [double, setDouble] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const kind = date ? kindOf(holidays, date) : null;
  const timeAndHalf = kind === "saturday" ? half : 0;
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = () => {
    if (!date || !kind) return setErrors(["Pick the day"]);
    if (picked.length === 0) return setErrors(["Tick who worked"]);
    const problem = restDayProblem(kind, timeAndHalf, double);
    if (problem) return setErrors([problem]);
    const refused = onSave(date, picked, timeAndHalf, double);
    if (refused.length === 0) onClose();
    else setErrors(refused);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Overtime time stamp"
      footer={
        <>
          <span className="mr-auto text-[0.93rem] text-muted">{site}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={days.length === 0} onClick={save}>
            Save time stamp
          </Button>
        </>
      }
    >
      {days.length === 0 ? (
        <p className="text-muted">There is no Saturday, Sunday or bank holiday in this week or the week before that has already been. Come back once the weekend is over.</p>
      ) : (
        <div className="grid gap-3">
          <Field label="Day" hint="Saturdays, Sundays and bank holidays, newest first. Overtime after a normal day is marked in the grid.">
            {(id) => (
              <select id={id} className="field" value={date} onChange={(e) => setDate(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayLabel(holidays, d)}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <fieldset>
            <legend className="mb-1 text-[0.93rem] font-medium">Who worked</legend>
            <ul className="grid max-h-56 gap-px overflow-y-auto rounded-md border border-line" aria-label="People to stamp">
              {[...crew, ...extra].map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-9 cursor-pointer items-center gap-2 px-2.5 py-1 hover:bg-accent-soft/60">
                    <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-[0.87rem] text-muted">{p.trade}</span>
                    {extra.some((x) => x.id === p.id) && <span className="ml-auto text-[0.87rem] text-muted">From another site</span>}
                  </label>
                </li>
              ))}
              {crew.length + extra.length === 0 && <li className="px-2.5 py-2 text-muted">Nobody is on this site's list. Add people from the box below.</li>}
            </ul>
            <select
              aria-label="Add someone from another site"
              className="field mt-2"
              value=""
              onChange={(e) => {
                const p = others.find((x) => x.id === e.target.value);
                if (!p) return;
                setExtra((x) => [...x, p]);
                setPicked((x) => [...x, p.id]);
              }}
            >
              <option value="">Add someone from another site</option>
              {others
                .filter((p) => !extra.some((x) => x.id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}
                  </option>
                ))}
            </select>
          </fieldset>
          {date && <RestDayHours holidays={holidays} date={date} half={half} double={double} setHalf={setHalf} setDouble={setDouble} />}
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

/**
 * Approve an overtime claim (round ten). The hours claimed start split by the rule for the day
 * and whoever approves can change them. Approving adds them to that day on the timesheet.
 */
function ClaimDialog({ claim, person, holidays, on, onClose }: { claim: OvertimeClaim; person: string; holidays: BankHoliday[]; on: Attendance | undefined; onClose: () => void }) {
  const kind = kindOf(holidays, claim.date);
  const start = suggestedSplit(kind, claim.hours);
  const [half, setHalf] = useState(start.timeAndHalf);
  const [double, setDouble] = useState(start.double);
  const [error, setError] = useState("");
  const allDouble = kind === "sunday" || kind === "bank-holiday";
  const timeAndHalf = allDouble ? 0 : half;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve overtime for ${person}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              const problem = decideOvertimeClaim(claim.id, true, { timeAndHalf, double });
              if (problem) return setError(problem);
              toast(`Approved: ${overtimeText({ overtimeHours: timeAndHalf, doubleHours: double })} added for ${person}, ${dWeekday(claim.date)}`);
              onClose();
            }}
          >
            Approve and add to the timesheet
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p>
          {dayLabel(holidays, claim.date)}: <span className="font-medium">{claimHours(claim.hours)}</span> claimed.
          {claim.note && <span className="block text-muted">"{claim.note}"</span>}
        </p>
        <p className="text-[0.93rem] text-muted">
          On the timesheet that day: <span className="font-medium text-ink">{on ? attendanceShort(on) : "Not marked in"}</span>. The hours you approve are added to it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Hours at time and a half">{(id) => <NumInput id={id} label="Hours at time and a half" className="h-9 w-full" value={timeAndHalf} onChange={setHalf} disabled={allDouble} />}</Field>
          <Field label="Hours at double time">{(id) => <NumInput id={id} label="Hours at double time" className="h-9 w-full" value={double} onChange={setDouble} />}</Field>
        </div>
        <p className="text-[0.93rem] text-muted">{kind ? REST_DAY_RULE[kind] : `Time and a half runs from the end of a normal day's hours up to midnight. Double time is only for work that carries on past midnight. ${EARLY_START_NOTE}`}</p>
        {error && (
          <p role="alert" className="text-[0.93rem] text-bad">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** Change or remove an overtime time stamp for a Saturday, a Sunday or a bank holiday. It has gone to the office, so this is a correction, with a reason. */
function RestDayFix({ a, person, holidays, onClose, onSave }: { a: Attendance; person: string; holidays: BankHoliday[]; onClose: () => void; onSave: (mark: Mark, reason: string) => void }) {
  const kind = kindOf(holidays, a.date) ?? "bank-holiday";
  const [half, setHalf] = useState(a.overtimeHours);
  const [double, setDouble] = useState(doubleOf(a));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const timeAndHalf = kind === "saturday" ? half : 0;
  const was = attendanceShort(a);
  const next = restDayMark(timeAndHalf, double);
  const now = attendanceShort(next);
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Change the time stamp for ${person}`}
      footer={
        <>
          <Button
            className="mr-auto"
            disabled={!reason.trim()}
            onClick={() => {
              onSave(null, reason);
              toast(`Time stamp removed for ${person}, ${dWeekday(a.date)}`);
              onClose();
            }}
          >
            Remove time stamp
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!reason.trim() || was === now}
            onClick={() => {
              const problem = restDayProblem(kind, timeAndHalf, double);
              if (problem) return setError(problem);
              onSave(next, reason);
              toast(`Corrected: ${was} to ${now}`);
              onClose();
            }}
          >
            Save correction
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-muted">
          {dayLabel(holidays, a.date)}. Recorded as <span className="font-medium text-ink">{was}</span>, saved by {a.savedBy}.
        </p>
        <RestDayHours holidays={holidays} date={a.date} half={half} double={double} setHalf={setHalf} setDouble={setDouble} />
        <Field label="Reason for the change" hint="Kept with the change in the attendance history. Needed to change or remove it.">
          {(id) => <input id={id} className="field" value={reason} placeholder="Finished at 1pm, not 2pm" onChange={(e) => setReason(e.target.value)} />}
        </Field>
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
 * The firm's overtime rule, at the top of the Timesheet tab (Oisin, 17 Nov, and the call with
 * Oldstone's managing director the same day: "at the top of the tab, say double is between
 * the hours of ... and time and a half is between ..."). Whoever marks a day picks the rate
 * from it. One line for each rate, so it does not push the grid down the page.
 */
export function OvertimeRules({ className }: { className?: string }) {
  return (
    <section aria-label="Overtime rates" className={cx("max-w-[95ch] rounded-md bg-canvas px-3 py-2 text-[0.93rem]", className)}>
      <h2 className="sr-only">Overtime rates</h2>
      <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_minmax(0,1fr)]">
        {OVERTIME_RULES.map((r) => (
          <div key={r.rate} className="contents">
            <dt className="font-medium whitespace-nowrap">
              {r.rate === 2 ? "Double time" : "Time and a half"} <span className="font-normal text-muted">({rateShort(r.rate)})</span>
            </dt>
            <dd className="text-muted">{r.when.join(". ")}.</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-muted">{EARLY_START_NOTE} A day can have hours at both rates. Saturday, Sunday and bank holiday work goes in with Overtime time stamp.</p>
    </section>
  );
}
