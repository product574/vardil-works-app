import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { recordPayrollExport } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import { addDays } from "@/lib/dates";
import { dFull, dShort, plural, when } from "@/lib/format";
import { blocking, FLAG_TEXT, payrollCsv, payrollWeek, STANDARD_WEEK } from "@/lib/payroll";
import { workWeek } from "@/lib/week";
import { Badge, Button, cx, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

const wd = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });
const h = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE", { maximumFractionDigits: 2 }));

/**
 * The week's hours for Sage Payroll (Oldstone call, 16 Nov). Site managers record the days; here
 * the accounts reviewer checks the week and sends the hours to Sage as a file. Pay rates, tax,
 * USC, pension, union fees and the bank payment are all worked out in Sage, never here.
 */
export function PayrollExport() {
  const db = useData((s) => s.db);
  const day = useDay();
  const canExport = useAccess().may("exportPayroll");
  const thisMon = workWeek(day)[0]!;
  const weeks = Array.from({ length: 6 }, (_, i) => addDays(thisMon, -7 * (i + 1)));
  const [week, setWeek] = useState(weeks[0]!);
  const days = workWeek(week);
  const lines = payrollWeek(week, db.attendance, db.people);
  const ready = lines.filter((l) => !blocking(l));
  const held = lines.filter(blocking);
  const done = db.payrollExports.filter((x) => x.weekStart === week);
  const file = payrollCsv(week, lines);
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
    toast(`Hours for ${plural(ready.length, "person", "people")} exported for Sage Payroll, week ending ${dShort(days[4])}`);
  };
  return (
    <>
      <PageHead
        title="Payroll export"
        note={`Week ending ${dFull(days[4])}: ${plural(lines.length, "person", "people")}, ${h(total("total"))} hours. Hours only go to Sage Payroll; rates, tax, deductions and the bank payment are done in Sage.`}
        actions={
          canExport && (
            <Button variant="primary" disabled={ready.length === 0} onClick={download}>
              {done.length > 0 ? "Export again" : "Export hours to Sage Payroll"}
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Week" className="field w-auto" value={week} onChange={(e) => setWeek(e.target.value)}>
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {i === 0 ? "Last week, " : ""}week ending {dShort(addDays(w, 4))}
              </option>
            ))}
          </select>
          {done.length > 0 ? (
            <Badge tone="ok">
              Exported {when(done[0]!.at, day)} by {done[0]!.by}
            </Badge>
          ) : (
            <Badge tone="warn">Not exported yet</Badge>
          )}
        </div>
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
            <table className="tbl" aria-label={`Hours for the week ending ${dShort(days[4])}`}>
              <thead>
                <tr>
                  <th>Sage no.</th>
                  <th>Name</th>
                  {days.map((d) => (
                    <th key={d}>
                      {wd(d)} {Number(d.slice(8))}
                    </th>
                  ))}
                  <th className="num">Basic hours</th>
                  <th className="num">Overtime x1.5</th>
                  <th className="num">Overtime x2</th>
                  <th className="num">Total</th>
                  <th>To check</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.personId} className={cx(blocking(l) && "bg-warn-soft/40")}>
                    <td className="tabular-nums">{l.sageNo ?? <span className="text-warn">None</span>}</td>
                    <td className="font-medium">{l.name}</td>
                    {days.map((d) => (
                      <td key={d} className={cx("whitespace-nowrap", !l.days[d] && "text-faint")}>
                        {l.days[d] || "-"}
                      </td>
                    ))}
                    <td className="num">{h(l.basic)}</td>
                    <td className="num">{l.timeAndHalf ? h(l.timeAndHalf) : "-"}</td>
                    <td className="num">{l.double ? h(l.double) : "-"}</td>
                    <td className="num font-medium">{h(l.total)}</td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {l.flags.map((f) => (
                          <Badge key={f} tone={f === "no-sage" || f === "not-sent" ? "warn" : "neutral"}>
                            {FLAG_TEXT[f]}
                          </Badge>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={7} className="border-t border-line-strong font-medium">
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
        <p className="text-[0.93rem] text-muted">A full week is {STANDARD_WEEK} hours: 8 a day Monday to Thursday and 7 on Friday, half that for a half day. Overtime is the hours marked over on the timesheet, at the rate marked there: x1.5 is time and a half, x2 is double time. Total is hours worked. "Under 39 hours" is only a note for the reviewer: short weeks go to Sage as they are.</p>
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
                    <td>{dFull(addDays(x.weekStart, 4))}</td>
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
