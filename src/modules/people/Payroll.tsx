import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { checkPayrollWeek, recordPayrollExport, startDirectMessage } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import { addDays } from "@/lib/dates";
import { dFull, dShort, plural, when } from "@/lib/format";
import { blocking, FLAG_TEXT, flagText, OVERTIME_TO_QUERY, payrollCsv, payrollWeek, STANDARD_WEEK, weekCheck, weekEnd } from "@/lib/payroll";
import { workWeek } from "@/lib/week";
import { Badge, Button, cx, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

const wd = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });
const h = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE", { maximumFractionDigits: 2 }));

/**
 * The week's hours for Sage Payroll (Oldstone calls, 16 and 17 Nov). Three steps, each a
 * person's: site managers send the days; a manager looks the week over here and marks it
 * checked; then the office exports the hours to Sage as a file, by hand. Nothing is sent on
 * its own. Pay rates, tax, USC, pension, union fees and the bank payment are all worked out in
 * Sage, never here.
 */
export function PayrollExport() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const navigate = useNavigate();
  const canExport = access.may("exportPayroll");
  const canCheck = access.may("checkPayroll");
  const thisMon = workWeek(day)[0]!;
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(thisMon, -7 * (i + 1)));
  const [week, setWeek] = useState(weeks[0]!);
  const days = workWeek(week);
  // The pay week runs Monday to Sunday (17 Nov), so it ends on the Sunday and takes in that weekend's time stamps.
  const end = weekEnd(week);
  const bankHolidays = db.bankHolidays.map((b) => b.date);
  const lines = payrollWeek(week, db.attendance, db.people, bankHolidays);
  const weekendWork = lines.some((l) => l.weekend);
  const ready = lines.filter((l) => !blocking(l));
  const held = lines.filter(blocking);
  const done = db.payrollExports.filter((x) => x.weekStart === week);
  const { check, stale } = weekCheck(db.payrollChecks, db.attendanceChanges, week, db.attendance);
  const checked = !!check && !stale;
  const file = payrollCsv(week, lines);
  // Whoever runs the sites someone worked on that week: the person to ask when a line looks wrong.
  const managers = (siteIds: string[]) => [...new Set(siteIds.map((id) => db.projects.find((p) => p.id === id)?.siteManagerId).filter((id): id is string => !!id && id !== access.personId))].map((id) => db.people.find((p) => p.id === id)).filter((p) => !!p);
  const ask = (personId: string) => {
    const id = startDirectMessage(personId);
    if (id) navigate(`/chat/${id}`);
  };
  const total = (k: "basic" | "overtime" | "timeAndHalf" | "double" | "total", list = lines) => list.reduce((n, l) => n + l[k], 0);
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    recordPayrollExport(week, ready.map((l) => l.personId));
    toast(`Hours for ${plural(ready.length, "person", "people")} exported for Sage Payroll, week ending ${dShort(end)}`);
  };
  return (
    <>
      <PageHead
        title="Payroll export"
        note={`Week ending ${dFull(end)}, Monday to Sunday: ${plural(lines.length, "person", "people")}, ${h(total("total"))} hours. Hours only go to Sage Payroll; rates, tax, deductions and the bank payment are done in Sage.`}
        actions={
          <>
            {canCheck && !checked && lines.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  checkPayrollWeek(week);
                  toast(`Week ending ${dShort(end)} marked as checked. It can go to Sage Payroll now`);
                }}
              >
                {stale ? "Mark as checked again" : "Mark the week as checked"}
              </Button>
            )}
            {canExport && (
              <Button variant={checked ? "primary" : "outline"} disabled={ready.length === 0 || !checked} onClick={download} title={checked ? undefined : "A manager checks the week first"}>
                {done.length > 0 ? "Export again" : "Export hours to Sage Payroll"}
              </Button>
            )}
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Week" className="field w-auto" value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {i === 0 ? "Last week, " : ""}week ending {dShort(weekEnd(w))}
              </option>
            ))}
          </select>
          {!check ? <Badge tone="warn">Not checked yet</Badge> : stale ? <Badge tone="warn">Changed since {check.by} checked it</Badge> : <Badge tone="ok">Checked {when(check.at, day)} by {check.by}</Badge>}
          {done.length > 0 ? (
            <Badge tone="ok">
              Exported {when(done[0]!.at, day)} by {done[0]!.by}
            </Badge>
          ) : (
            <Badge tone="warn">Not exported yet</Badge>
          )}
        </div>
        <ol className="mt-3 flex max-w-[95ch] flex-wrap gap-x-5 gap-y-1 text-[0.93rem] text-muted" aria-label="How a week gets to payroll">
          <li>1. Site managers send each day's time stamps.</li>
          <li>2. A manager checks the week here{checked ? "" : canCheck ? ": that is the button above" : ", which is still to do"}.</li>
          <li>3. The office exports the file to Sage Payroll by hand. Nothing is sent on its own.</li>
        </ol>
      </PageHead>
      <PageBody className="grid max-w-[88rem] gap-5">
        {held.length > 0 && (
          <div className="rounded-md bg-warn-soft px-3 py-2.5 text-warn">
            <p className="font-medium">{plural(held.length, "person", "people")} left out of the file until sorted</p>
            <ul className="mt-1">
              {held.map((l) => (
                <li key={l.personId}>
                  {l.name}: {l.flags.filter((f) => f === "no-sage" || f === "not-sent").map((f) => FLAG_TEXT[f].charAt(0).toLowerCase() + FLAG_TEXT[f].slice(1)).join(", ")}.{" "}
                  {l.flags.includes("no-sage") ? (
                    <Link to={`/people?person=${l.personId}`} className="font-medium underline underline-offset-2">
                      Add their Sage number
                    </Link>
                  ) : (
                    <Link to="/people/timesheet" className="font-medium underline underline-offset-2">
                      Open the timesheet
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <Panel className="overflow-x-auto">
          {lines.length === 0 ? (
            <Empty title="No attendance recorded in this week" />
          ) : (
            <table className="tbl" aria-label={`Hours for the week ending ${dShort(end)}`}>
              <thead>
                <tr>
                  <th>Sage no.</th>
                  <th>Name</th>
                  {days.map((d) => (
                    <th key={d}>
                      {wd(d)} {Number(d.slice(8))}
                      {bankHolidays.includes(d) && <span className="block font-normal text-muted">Bank holiday</span>}
                    </th>
                  ))}
                  {weekendWork && <th>Sat, Sun</th>}
                  <th className="num w-[4.5rem] whitespace-normal">Basic hours</th>
                  <th className="num w-[5rem] whitespace-normal">Overtime x1.5</th>
                  <th className="num w-[5rem] whitespace-normal">Overtime x2</th>
                  <th className="num">Total</th>
                  <th>To check</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.personId} className={cx(blocking(l) && "bg-warn-soft/40")}>
                    <td className="tabular-nums">{l.sageNo ?? <span className="text-warn">None</span>}</td>
                    <td className="font-medium whitespace-nowrap">{l.name}</td>
                    {days.map((d) => (
                      <td key={d} className={cx(!l.days[d] && "text-faint")}>
                        {l.days[d] || "-"}
                      </td>
                    ))}
                    {weekendWork && <td className={cx(!l.weekend && "text-faint")}>{l.weekend || "-"}</td>}
                    <td className="num">{h(l.basic)}</td>
                    <td className="num">{l.timeAndHalf ? h(l.timeAndHalf) : "-"}</td>
                    <td className="num">{l.double ? h(l.double) : "-"}</td>
                    <td className="num font-medium">{h(l.total)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {l.flags.map((f) => (
                          <Badge key={f} tone={f === "no-sage" || f === "not-sent" || f === "much-overtime" || f === "double-only" ? "warn" : "neutral"}>
                            {flagText(f, l)}
                          </Badge>
                        ))}
                      </span>
                      {access.can("chat") &&
                        managers(l.siteIds).map((m) => (
                          <button key={m.id} type="button" className="press mt-1 block text-[0.87rem] font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => ask(m.id)} aria-label={`Ask ${m.name} about ${l.name}'s week`}>
                            Ask {m.name}
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={weekendWork ? 8 : 7} className="border-t border-line-strong font-medium">
                    Total
                  </td>
                  <td className="num border-t border-line-strong">{h(total("basic"))}</td>
                  <td className="num border-t border-line-strong">{h(total("timeAndHalf"))}</td>
                  <td className="num border-t border-line-strong">{h(total("double"))}</td>
                  <td className="num border-t border-line-strong font-medium">{h(total("total"))}</td>
                  <td className="border-t border-line-strong" />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        <p className="text-[0.93rem] text-muted">A full week is {STANDARD_WEEK} hours: 8 a day Monday to Thursday and 7 on Friday, half that for a half day. Overtime is the hours marked over on the timesheet, at the rate marked there: x1.5 is time and a half, x2 is double time, and a day can have both. Saturday, Sunday and bank holiday time stamps are all overtime and go with the week they fall in, Monday to Sunday. Total is hours worked. "A lot of overtime" marks {OVERTIME_TO_QUERY} hours or more in the week. "Double time, no time and a half" is usually an early start entered as overtime, which it is not. If a line looks wrong, Ask opens a message to the site manager in Team chat. "Under {STANDARD_WEEK} hours" is only a note for the reviewer: short weeks go to Sage as they are, and a week with a bank holiday in it is measured against the hours left.</p>
        {ready.length > 0 && (
          <Section title="What Sage Payroll will receive" aside={file.fileName}>
            <Panel className="overflow-x-auto">
              <pre className="px-3 py-2.5 font-mono text-[0.87rem] leading-relaxed whitespace-pre">{file.text.trim()}</pre>
            </Panel>
            <p className="mt-2 text-[0.93rem] text-muted">One row per person, matched on their Sage employee number, with basic hours and overtime hours at each rate. The column layout will be set to the sample payroll file from the accounts office before this goes live.</p>
          </Section>
        )}
        <Section title="Weeks already sent">
          <Panel className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Week ending</th>
                  <th className="num">People</th>
                  <th className="num">Hours</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {db.payrollExports.slice(0, 8).map((x) => (
                  <tr key={x.id}>
                    <td>{dFull(weekEnd(x.weekStart))}</td>
                    <td className="num">{x.people}</td>
                    <td className="num">{h(x.hours)}</td>
                    <td className="text-muted">
                      {when(x.at, day)} by {x.by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
