import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay } from "@/data/store";
import { dWeekday, plural, when } from "@/lib/format";
import { basicHours } from "@/lib/payroll";
import { type Period, periodDays, periodLabel, periodOptions, perSite } from "@/lib/roster";
import { attendanceShort } from "@/lib/week";
import { Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

const n1 = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE"));

/**
 * Attendance for a period (last week, this week, or a month): totals per person for payroll, the
 * day-by-day record, every correction, and per site (Oisin, 17 Nov), laid out like the plant
 * overview: a heading per site, then the people who worked there.
 */
export function AttendanceHistory() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [period, setPeriod] = useState<Period>(day.slice(0, 7));
  const [siteId, setSiteId] = useState("all");
  const [view, setView] = useState<"totals" | "days" | "corrections" | "sites">("totals");
  const inPeriod = useMemo(() => new Set(periodDays(period, day)), [period, day]);
  const sites = access.scope(db.projects).filter((p) => db.attendance.some((a) => a.projectId === p.id));
  const siteIds = new Set(sites.map((p) => p.id));
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "-";
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "-";

  const rows = useMemo(() => db.attendance.filter((a) => inPeriod.has(a.date) && siteIds.has(a.projectId) && (siteId === "all" || a.projectId === siteId)), [db.attendance, inPeriod, siteId, sites.length]);
  const totals = useMemo(() => {
    const m = new Map<string, { full: number; half: number; overtime: number; hours: number; sites: Set<string> }>();
    for (const a of rows) {
      const t = m.get(a.personId) ?? { full: 0, half: 0, overtime: 0, hours: 0, sites: new Set<string>() };
      if (a.status === "full") t.full++;
      else t.half++;
      t.overtime += a.overtimeHours;
      t.hours += basicHours(a.date, a.status);
      t.sites.add(code(a.projectId));
      m.set(a.personId, t);
    }
    return [...m.entries()].map(([personId, t]) => ({ personId, ...t })).sort((a, b) => name(a.personId).localeCompare(name(b.personId)));
  }, [rows]);
  const changes = db.attendanceChanges.filter((c) => inPeriod.has(c.date) && siteIds.has(c.projectId) && (siteId === "all" || c.projectId === siteId));
  const label = periodLabel(period, day);
  const Label = label.charAt(0).toUpperCase() + label.slice(1);
  // Per site: every site that was running in the period, busiest first, then any with nothing recorded.
  const bySite = useMemo(() => perSite(rows, name), [rows]);
  const span = [...inPeriod].sort();
  const idle = span.length === 0 ? [] : access
    .scope(db.projects)
    .filter((p) => (p.status === "Live" || p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed") && p.startDate <= span[span.length - 1]! && p.endDate >= span[0]! && !bySite.some((b) => b.projectId === p.id) && (siteId === "all" || p.id === siteId))
    .sort((a, b) => a.code.localeCompare(b.code));

  return (
    <>
      <PageHead
        title="Attendance history"
        note={`${Label}: ${plural(rows.length, "attendance entry", "attendance entries")} for ${plural(totals.length, "person", "people")}.`}
        actions={<Segmented label="History view" value={view} onChange={setView} options={[{ value: "totals", label: "Totals for payroll" }, { value: "days", label: "Day by day" }, { value: "corrections", label: "Corrections", count: changes.length }, { value: "sites", label: "Per site" }]} />}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Period" className="field w-auto max-w-full" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {periodOptions(day).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select aria-label="Site" className="field w-auto max-w-full" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="all">All sites</option>
            {sites.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} {p.name}
              </option>
            ))}
          </select>
        </div>
      </PageHead>
      <PageBody>
        {view === "totals" && (
          <Panel className="max-w-4xl overflow-x-auto">
            {totals.length === 0 ? (
              <Empty title={`No attendance recorded ${label.startsWith("last") || label.startsWith("this") ? label : `in ${label}`}`}>Choose another period or another site.</Empty>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Sites</th>
                    <th className="num">Full days</th>
                    <th className="num">Half days</th>
                    <th className="num">Basic hours</th>
                    <th className="num">Overtime hours</th>
                    <th className="num">Total hours</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.personId}>
                      <td className="font-medium">{name(t.personId)}</td>
                      <td className="text-muted">{[...t.sites].sort().join(", ")}</td>
                      <td className="num">{t.full}</td>
                      <td className="num">{t.half || "-"}</td>
                      <td className="num">{t.hours.toLocaleString("en-IE")}</td>
                      <td className="num">{t.overtime || "-"}</td>
                      <td className="num font-medium">{(t.hours + t.overtime).toLocaleString("en-IE")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2} className="border-t border-line-strong font-medium">
                      Total
                    </td>
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.full, 0)}</td>
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.half, 0)}</td>
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.hours, 0).toLocaleString("en-IE")}</td>
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.overtime, 0)}</td>
                    <td className="num border-t border-line-strong font-medium">{totals.reduce((s, t) => s + t.hours + t.overtime, 0).toLocaleString("en-IE")}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
        )}
        {view === "totals" && totals.length > 0 && <p className="mt-2 text-[0.93rem] text-muted">Basic hours follow a 39 hour week: 8 a day Monday to Thursday, 7 on Friday, half that for a half day. Pay, overtime rates and deductions are worked out in Sage Payroll; send a week's hours from <Link to="/people/payroll" className="font-medium text-accent-ink underline-offset-2 hover:underline">Payroll export</Link>.</p>}

        {view === "days" && (
          <Panel className="max-w-4xl overflow-x-auto">
            {rows.length === 0 ? (
              <Empty title="No attendance recorded in this period" />
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Site</th>
                    <th>Attendance</th>
                    <th>Marked by</th>
                    <th>Sent</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].sort((a, b) => b.date.localeCompare(a.date) || name(a.personId).localeCompare(name(b.personId))).slice(0, 400).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{dWeekday(a.date)}</td>
                      <td className="font-medium">{name(a.personId)}</td>
                      <td>{code(a.projectId)}</td>
                      <td>{attendanceShort(a.status, a.overtimeHours)}</td>
                      <td className="text-muted">{a.savedBy}</td>
                      <td className={a.sent ? "text-muted" : "text-warn"}>{a.sent ? "Yes" : "Not yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}

        {view === "corrections" && (
          <Section title={`Corrections, ${label}`}>
            <Panel className="max-w-4xl overflow-x-auto">
              {changes.length === 0 ? (
                <Empty title="No corrections in this period">When a sent day is changed from the timesheet, the old value, the new value, who changed it and why are listed here.</Empty>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Day corrected</th>
                      <th>Name</th>
                      <th>Site</th>
                      <th>Was</th>
                      <th>Now</th>
                      <th>Reason</th>
                      <th>Changed by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c) => (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap">{dWeekday(c.date)}</td>
                        <td className="font-medium">{name(c.personId)}</td>
                        <td>{code(c.projectId)}</td>
                        <td>{c.from}</td>
                        <td>{c.to}</td>
                        <td>{c.reason}</td>
                        <td className="text-muted">
                          {c.by}
                          <span className="block text-[0.87rem]">{when(c.at, day)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </Section>
        )}
        {view === "sites" && (
          <div className="grid max-w-5xl gap-6">
            {bySite.length === 0 && idle.length === 0 && (
              <Panel>
                <Empty title="No sites were running in this period" />
              </Panel>
            )}
            {bySite.map((s) => {
              const site = db.projects.find((p) => p.id === s.projectId)!;
              return (
                <Section
                  key={s.projectId}
                  title={
                    <Link to={`/projects/${site.code}`} className="underline-offset-2 hover:underline">
                      {site.code} {site.name}
                    </Link>
                  }
                  aside={`${db.people.find((p) => p.id === site.siteManagerId)?.name}, ${co(site.county)}. ${plural(s.people.length, "person", "people")}, ${n1(s.days)} days`}
                >
                  <Panel className="overflow-x-auto">
                    <table className="tbl table-fixed" aria-label={`${site.code} ${site.name}, ${label}`}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th className="w-28 num">Full days</th>
                          <th className="w-28 num">Half days</th>
                          <th className="w-32 num">Overtime hours</th>
                          <th className="w-28 num">Days in all</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.people.map((p) => {
                          const person = db.people.find((x) => x.id === p.personId);
                          return (
                            <tr key={p.personId}>
                              <td>
                                <span className="font-medium">{person?.name}</span>
                                <span className="block text-[0.87rem] text-muted">{person?.trade}</span>
                              </td>
                              <td className="num">{n1(p.full)}</td>
                              <td className="num">{n1(p.half)}</td>
                              <td className="num">{n1(p.overtime)}</td>
                              <td className="num font-medium">{n1(p.days)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Panel>
                </Section>
              );
            })}
            {idle.map((site) => (
              <Section key={site.id} title={`${site.code} ${site.name}`} aside={`${db.people.find((p) => p.id === site.siteManagerId)?.name}, ${co(site.county)}`}>
                <Panel>
                  <p className="px-3 py-3 text-muted">No attendance recorded on this site {label.startsWith("last") || label.startsWith("this") ? label : `in ${label}`}.</p>
                </Panel>
              </Section>
            ))}
            {bySite.length > 0 && <p className="text-[0.93rem] text-muted">A half day counts as half a day in "Days in all". Paid hours are under Totals for payroll.</p>}
          </div>
        )}
      </PageBody>
    </>
  );
}
