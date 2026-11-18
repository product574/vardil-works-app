import { X } from "@phosphor-icons/react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addToRoster, correctAttendance, markAttendance, removeFromRoster, sendTimeStamps } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Attendance, Person } from "@/data/types";
import { blocksText, ticketBlocks } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { dLong, dShort, plural } from "@/lib/format";
import { attendanceChoice, attendanceShort, workWeek } from "@/lib/week";
import { Button, cx, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";

type Choice = "" | "full" | "half" | "overtime";
const toMark = (c: Choice, hours: number) => (c === "" ? null : c === "half" ? { status: "half" as const, overtimeHours: 0 } : { status: "full" as const, overtimeHours: c === "overtime" ? Math.max(0.5, hours) : 0 });

/** The week's attendance for one site. Today's column is filled in and sent; earlier days are corrected with a reason. */
export function Timesheet() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const [weekOf, setWeekOf] = useState(day);
  const [fix, setFix] = useState<{ person: Person; date: string } | null>(null);
  const [adding, setAdding] = useState("");

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
  const roster = db.assignments
    .filter((a) => a.projectId === site.id)
    .map((a) => db.people.find((p) => p.id === a.personId)!)
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
  const entry = (personId: string, date: string) => db.attendance.find((a) => a.projectId === site.id && a.personId === personId && a.date === date);
  const leave = (personId: string, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);
  // Counts on screen cover the people on this site's list now. Someone taken off the list
  // keeps their attendance, and anything of theirs not yet sent still goes with the day.
  const onList = (a: Attendance) => roster.some((r) => r.id === a.personId);
  const markedOn = (date: string) => db.attendance.filter((a) => a.projectId === site.id && a.date === date && onList(a));
  const today = markedOn(day);
  const unsentShown = today.filter((a) => !a.sent).length;
  const unsent = db.attendance.filter((a) => a.projectId === site.id && a.date === day && !a.sent).length;
  const spare = db.people.filter((p) => p.active && p.kind === "Operative" && !roster.some((r) => r.id === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const canMark = access.may("markTime");
  const canCorrect = access.may("correctTime");

  return (
    <>
      <PageHead
        title="Timesheet"
        note={`${site.code} ${site.name}. ${today.length} of ${roster.length} marked for today${today.length > 0 ? (unsentShown > 0 ? `, ${unsentShown} not sent yet` : ", all sent") : ""}. Time stamps lock at 13:00 each working day.`}
        actions={
          canMark && (
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
      </PageHead>
      <PageBody className="grid max-w-6xl gap-4">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th className="min-w-[13rem]">Name</th>
                {week.map((d) => (
                  <th key={d} className={cx("w-[9.5rem]", d === day && "bg-accent-soft! text-accent-ink!")}>
                    {new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" })} {dShort(d)}
                    {d === day && <span className="font-normal"> (today)</span>}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty title="Nobody is on this site's roster yet">Add people below, or plan them on from the week ahead.</Empty>
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
                      <Cell person={person} date={d} day={day} startDate={site.startDate} canMark={canMark} canCorrect={canCorrect} a={entry(person.id, d)} onLeave={leave(person.id, d)} onMark={(mark) => markAttendance(site.id, person.id, d, mark)} onFix={() => setFix({ person, date: d })} />
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
                      {d > day ? "" : `${markedOn(d).length} of ${roster.length}`}
                    </td>
                  ))}
                  <td className="border-t border-line-strong" />
                </tr>
              </tfoot>
            )}
          </table>
        </Panel>

        {!canMark && <p className="text-[0.93rem] text-muted">You can read this timesheet{canCorrect ? " and correct earlier days" : ""}. Marking today is for people with the "Mark the timesheet" permission.</p>}
        <div className={cx("flex flex-wrap items-center gap-2", !canMark && "hidden")}>
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
          <p className="text-[0.93rem] text-muted">Click any earlier day to correct it. Every correction keeps the old value, who changed it and why.</p>
        </div>
      </PageBody>

      {fix && <CorrectDialog key={`${fix.person.id}-${fix.date}`} person={fix.person} date={fix.date} a={entry(fix.person.id, fix.date)} onClose={() => setFix(null)} onSave={(mark, reason) => correctAttendance(site.id, fix.person.id, fix.date, mark, reason)} />}
    </>
  );
}

type Mark = ReturnType<typeof toMark>;

function Cell({ person, date, day, startDate, a, onLeave, onMark, onFix, canMark, canCorrect }: { person: Person; date: string; day: string; startDate: string; a: Attendance | undefined; onLeave: boolean; onMark: (m: Mark) => void; onFix: () => void; canMark: boolean; canCorrect: boolean }) {
  if (date > day) return <span className="text-faint">{onLeave ? "Leave" : ""}</span>;
  if (onLeave && !a) return <span className="inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[0.93rem] text-warn">Leave</span>;
  if (date < startDate) return <span className="text-faint">Not started</span>;

  // Someone whose Safe Pass or trade ticket has run out cannot be marked on site (Compliance, 18 Nov).
  const blocks = !a ? ticketBlocks(person, date) : [];
  if (blocks.length > 0 && (date === day || !canCorrect))
    return (
      <span className="block px-2 text-[0.87rem] leading-tight font-medium text-bad" title={`Cannot be marked on site: ${blocksText(blocks)}`}>
        Cannot work: {blocksText(blocks)}
      </span>
    );

  // Today, until the day is sent: marked straight in the grid.
  const text = a ? attendanceShort(a.status, a.overtimeHours) : "Not in";
  if (date === day && !a?.sent && !canMark) return <span className="px-2 text-muted">{a ? text : "Not marked"}</span>;
  if ((date < day || a?.sent) && !canCorrect) return <span className={cx("px-2", a ? (a.status === "half" ? "text-warn" : "") : "text-muted")}>{text}</span>;
  if (date === day && !a?.sent) {
    const choice = attendanceChoice(a);
    return (
      <span className="flex items-center gap-1.5">
        <select aria-label={`Today for ${person.name}`} className={cx("field h-8 min-w-0 flex-1 px-1.5", choice === "" && "text-muted")} value={choice} onChange={(e) => onMark(toMark(e.target.value as Choice, a?.overtimeHours || 1))}>
          <option value="">Not marked</option>
          <option value="full">Full day</option>
          <option value="half">Half day</option>
          <option value="overtime">Full + overtime</option>
        </select>
        {choice === "overtime" && <NumInput label={`Overtime hours for ${person.name}`} className="w-12 shrink-0 px-1.5" value={a?.overtimeHours ?? 1} onChange={(n) => onMark(toMark("overtime", n))} />}
      </span>
    );
  }

  // Sent days change only through a correction.
  return (
    <button type="button" onClick={onFix} title="Correct this day" aria-label={`${person.name}, ${dShort(date)}: ${a ? attendanceShort(a.status, a.overtimeHours) : "not in"}. Correct this day`} className={cx("press h-8 w-full rounded-md px-2 text-left hover:bg-accent-soft", a ? (a.status === "half" ? "text-warn" : "text-ink") : "border border-dashed border-line-strong text-muted")}>
      {a ? attendanceShort(a.status, a.overtimeHours) : "Not in"}
    </button>
  );
}

function CorrectDialog({ person, date, a, onClose, onSave }: { person: Person; date: string; a: Attendance | undefined; onClose: () => void; onSave: (mark: Mark, reason: string) => void }) {
  const [choice, setChoice] = useState<Choice>(attendanceChoice(a));
  const [hours, setHours] = useState(a?.overtimeHours || 1);
  const [reason, setReason] = useState("");
  const was = a ? attendanceShort(a.status, a.overtimeHours) : "Not in";
  const next = toMark(choice, hours);
  const now = next ? attendanceShort(next.status, next.overtimeHours) : "Not in";
  const blocks = ticketBlocks(person, date);
  const refused = blocks.length > 0 && next !== null;
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
            disabled={!reason.trim() || was === now || refused}
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
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Should be">
            {(id) => (
              <select id={id} className="field" value={choice} onChange={(e) => setChoice(e.target.value as Choice)}>
                <option value="">Not in</option>
                <option value="full">Full day</option>
                <option value="half">Half day</option>
                <option value="overtime">Full + overtime</option>
              </select>
            )}
          </Field>
          {choice === "overtime" && <Field label="Overtime hours">{() => <NumInput label="Overtime hours" className="h-9 w-full" value={hours} onChange={setHours} />}</Field>}
        </div>
        {refused && <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">{person.name} cannot be marked on site that day: {blocksText(blocks)}.</p>}
        <Field label="Reason for the correction" hint="Kept with the change in the attendance history.">
          {(id) => <input id={id} className="field" value={reason} placeholder="Left at lunch for a hospital appointment" onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
