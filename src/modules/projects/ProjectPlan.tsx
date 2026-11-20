import { FileText, Paperclip } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addFile } from "@/data/actions";
import { useDay } from "@/data/store";
import type { Db, Project } from "@/data/types";
import { addDays, weekStartOf } from "@/lib/dates";
import { dFull, dShort, plural } from "@/lib/format";
import { readAttachment } from "@/lib/image";
import { along, PROGRAMME_LABEL, programme, programmeWeeks, type ProgrammeState } from "@/lib/programme";
import { dayRoster } from "@/lib/roster";
import { isRestDay } from "@/lib/bank-holidays";
import { Badge, Button, cx, Dialog, Panel, Section } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

type TabProps = { p: Project; db: Db };
const BAR: Record<ProgrammeState, string> = { done: "bg-ok", late: "bg-bad", now: "bg-accent", later: "bg-line-strong" };
const TONE: Record<ProgrammeState, "ok" | "bad" | "accent" | "neutral"> = { done: "ok", late: "bad", now: "accent", later: "neutral" };

/**
 * Programme (20 Nov, the Oldstone template): the scope as bars across the weeks, worked out from
 * the job's start and finish, with today marked. The client's own programme file sits above it.
 */
export function ProgrammeChart({ p, db }: TabProps) {
  const day = useDay();
  const access = useAccess();
  const [attaching, setAttaching] = useState(false);
  const tasks = db.scopeTasks.filter((t) => t.projectId === p.id);
  const rows = programme(p, tasks, day);
  // Week labels, dropping any that would sit on top of the one before or run off the end.
  const weeks = programmeWeeks(p.startDate, p.endDate).reduce<{ w: string; at: number }[]>((out, w) => {
    const at = along(w < p.startDate ? p.startDate : w, p.startDate, p.endDate);
    if (at <= 0.92 && (out.length === 0 || at - out.at(-1)!.at >= 0.07)) out.push({ w: w < p.startDate ? p.startDate : w, at });
    return out;
  }, []);
  const files = db.files.filter((f) => f.projectId === p.id && f.category === "Programme");
  const late = rows.filter((r) => r.state === "late").length;
  const todayAt = along(day, p.startDate, p.endDate);
  const inRange = day >= p.startDate && day <= p.endDate;
  return (
    <Section
      title="Programme"
      aside={
        access.may("manageProjects") && (
          <Button size="sm" onClick={() => setAttaching(true)}>
            <Paperclip size={16} /> Attach programme file
          </Button>
        )
      }
    >
      <p className="mb-3 max-w-[75ch] text-muted">
        {dFull(p.startDate)} to {dFull(p.endDate)}. Each item of the scope as a bar, worked out from the job's dates; tick items off below as they are done.{" "}
        {late > 0 ? <span className="text-bad">{plural(late, "item")} running late.</span> : rows.length ? "Nothing running late." : ""}
      </p>
      {files.length > 0 && (
        <Panel className="mb-3">
          <ul className="divide-y divide-line" aria-label="Programme files">
            {files.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2">
                <FileText size={20} className="text-accent-ink" />
                {f.dataUrl ? (
                  <a href={f.dataUrl} download={f.name} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                    {f.name}
                  </a>
                ) : (
                  <span className="font-medium">{f.name}</span>
                )}
                <span className="text-[0.87rem] text-muted">
                  {f.addedBy}, {dShort(f.modified)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {rows.length === 0 ? (
        <Panel className="px-4 py-3 text-muted">No scope items yet, so there is nothing to draw. Add them below.</Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <div className="min-w-[44rem]" role="table" aria-label={`Programme for ${p.code}`}>
            <div role="row" className="grid grid-cols-[16rem_minmax(0,1fr)_8rem] border-b border-line bg-side text-[0.87rem] text-muted">
              <span role="columnheader" className="px-3 py-1.5">
                Scope item
              </span>
              <span role="columnheader" className="relative mr-3 h-7">
                {weeks.map(({ w, at }) => (
                  <span key={w} className="absolute top-1.5 border-l border-line pl-1 whitespace-nowrap" style={{ left: `${at * 100}%` }}>
                    {dShort(w)}
                  </span>
                ))}
              </span>
              <span role="columnheader" className="px-3 py-1.5">
                Where it is
              </span>
            </div>
            {rows.map((r) => {
              const left = along(r.start, p.startDate, p.endDate) * 100;
              const width = Math.max(1.5, along(r.end, p.startDate, p.endDate) * 100 - left);
              return (
                <div role="row" key={r.id} className="grid grid-cols-[16rem_minmax(0,1fr)_8rem] items-center border-b border-line last:border-0">
                  <span role="cell" className="truncate px-3 py-2" title={r.label}>
                    {r.label}
                  </span>
                  <span role="cell" className="relative mr-3 h-8">
                    {inRange && <span aria-hidden className="absolute inset-y-0 w-0.5 bg-bad/60" style={{ left: `${todayAt * 100}%` }} />}
                    <span className={cx("absolute top-2 h-4 rounded-sm", BAR[r.state])} style={{ left: `${left}%`, width: `${width}%` }} title={`${dShort(r.start)} to ${dShort(r.end)}`} />
                  </span>
                  <span role="cell" className="px-3 py-2">
                    <Badge tone={TONE[r.state]}>{r.state === "late" ? `Late ${plural(r.lateBy, "day")}` : PROGRAMME_LABEL[r.state]}</Badge>
                  </span>
                </div>
              );
            })}
          </div>
          {inRange && <p className="border-t border-line px-3 py-1.5 text-[0.87rem] text-muted">The red line is today, {dShort(day)}.</p>}
        </Panel>
      )}
      {attaching && <AttachProgramme p={p} onClose={() => setAttaching(false)} />}
    </Section>
  );
}

function AttachProgramme({ p, onClose }: { p: Project; onClose: () => void }) {
  const [file, setFile] = useState<{ name: string; dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Attach the programme for ${p.code}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => {
              if (!file) return;
              addFile(p.id, "Programme", { name: file.name, kind: file.dataUrl.startsWith("data:application/pdf") ? "pdf" : "image", sizeKb: file.sizeKb, dataUrl: file.dataUrl });
              toast(`${file.name} attached to ${p.code}`);
              onClose();
            }}
          >
            Attach
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-muted">The programme from the client or the main contractor, as a PDF or a picture. It is kept in the project's Programme folder too.</p>
        <PickFile
          accept="image/*,application/pdf"
          what="file"
          chosen={file?.name}
          onFile={(f) => {
            setError("");
            readAttachment(f).then(setFile, (e: Error) => setError(e.message));
          }}
        />
        <p role="alert" className="min-h-6 text-bad">
          {error}
        </p>
      </div>
    </Dialog>
  );
}

/**
 * The project's Week ahead (20 Nov): who is down for this site this week and next, day by day,
 * read the same way as Scheduling (`dayRoster`). Planning itself is done in Scheduling.
 */
export function SiteWeekAhead({ p, db }: TabProps) {
  const day = useDay();
  const access = useAccess();
  const weeks = [weekStartOf(day), addDays(weekStartOf(day), 7)];
  const name = (id: string) => db.people.find((x) => x.id === id);
  return (
    <div className="grid gap-5">
      <p className="max-w-[75ch] text-muted">
        Who is down for {p.code} this week and next. Days gone are from the timesheet, days to come from the plan.{" "}
        {access.can("schedule") && (
          <Link to="/schedule" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Plan in Scheduling
          </Link>
        )}
      </p>
      {weeks.map((mon, wi) => (
        <Section key={mon} title={wi === 0 ? "This week" : "Next week"} aside={`From ${dShort(mon)}`}>
          <Panel className="overflow-x-auto">
            <table className="tbl" aria-label={`${wi === 0 ? "This week" : "Next week"} on ${p.code}`}>
              <thead>
                <tr>
                  <th className="w-36">Day</th>
                  <th>Who</th>
                  <th className="num w-20">People</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2, 3, 4].map((n) => {
                  const d = addDays(mon, n);
                  const off = isRestDay(db.bankHolidays, d);
                  const r = dayRoster(db.attendance, db.plan, p.id, d, day);
                  const outside = d < p.startDate || d > p.endDate;
                  return (
                    <tr key={d} className={cx(d === day && "bg-accent-soft/60")}>
                      <td className="font-medium">
                        {dShort(d)}
                        {d === day && <span className="block text-[0.87rem] font-normal text-accent-ink">Today</span>}
                      </td>
                      <td>
                        {off ? (
                          <span className="text-muted">Bank holiday</span>
                        ) : r.rows.length === 0 ? (
                          <span className={outside ? "text-muted" : "text-warn"}>{outside ? "Not on site" : "Nobody down"}</span>
                        ) : (
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                            {r.rows.map((x) => (
                              <span key={x.personId}>
                                {name(x.personId)?.name}
                                {x.note && <span className="text-[0.87rem] text-muted"> {x.note}</span>}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="num">{off ? "" : r.rows.length || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </Section>
      ))}
    </div>
  );
}
