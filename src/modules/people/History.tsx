import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay } from "@/data/store";
import type { Project } from "@/data/types";
import { dWeekday, plural, when } from "@/lib/format";
import { overtimeRate } from "@/lib/overtime";
import { basicHours } from "@/lib/payroll";
import { type Period, periodDays, periodLabel, periodOptions, perSite } from "@/lib/roster";
import { attendanceShort } from "@/lib/week";
import { Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

const n1 = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE"));

type View = "totals" | "days" | "corrections";

/**
 * Attendance for a period (last week, this week, or a month): totals per person for payroll, the
 * day-by-day record, and every correction. Each can be laid out for everyone together or per
 * site (Oisin, 17 Nov; the switch is at the top right, as on the plant overview): a heading per
 * site with its site manager, then that site's people, days or corrections.
 */
export function AttendanceHistory() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [period, setPeriod] = useState<Period>(day.slice(0, 7));
  const [siteId, setSiteId] = useState("all");
  const [view, setView] = useState<View>("totals");
  const [layout, setLayout] = useState<"all" | "sites">("all");
  const inPeriod = useMemo(() => new Set(periodDays(period, day)), [period, day]);
  const sites = access.scope(db.projects).filter((p) => db.attendance.some((a) => a.projectId === p.id));
  const siteIds = new Set(sites.map((p) => p.id));
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "-";
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "-";

  const rows = useMemo(() => db.attendance.filter((a) => inPeriod.has(a.date) && siteIds.has(a.projectId) && (siteId === "all" || a.projectId === siteId)), [db.attendance, inPeriod, siteId, sites.length]);
  const totals = useMemo(() => {
    // `overtime` is every overtime hour; `double` is the part at double time, the rest being time and a half (17 Nov).
    const m = new Map<string, { full: number; half: number; overtime: number; double: number; hours: number; sites: Set<string> }>();
    for (const a of rows) {
      const t = m.get(a.personId) ?? { full: 0, half: 0, overtime: 0, double: 0, hours: 0, sites: new Set<string>() };
      if (a.status === "full") t.full++;
      else t.half++;
      t.overtime += a.overtimeHours;
      if (overtimeRate(a) === 2) t.double += a.overtimeHours;
      t.hours += basicHours(a.date, a.status);
      t.sites.add(code(a.projectId));
      m.set(a.personId, t);
    }
    return [...m.entries()].map(([personId, t]) => ({ personId, ...t })).sort((a, b) => name(a.personId).localeCompare(name(b.personId)));
  }, [rows]);
  const changes = db.attendanceChanges.filter((c) => inPeriod.has(c.date) && siteIds.has(c.projectId) && (siteId === "all" || c.projectId === siteId));
  const label = periodLabel(period, day);
  const Label = label.charAt(0).toUpperCase() + label.slice(1);
  const inLabel = label.startsWith("last") || label.startsWith("this") ? label : `in ${label}`;
  // Per site: every site with attendance in the period, busiest first, then any that were running with nothing recorded.
  const bySite = useMemo(() => perSite(rows, name), [rows]);
  const span = [...inPeriod].sort();
  const idle = span.length === 0 ? [] : access
    .scope(db.projects)
    .filter((p) => (p.status === "Live" || p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed") && p.startDate <= span[span.length - 1]! && p.endDate >= span[0]! && !bySite.some((b) => b.projectId === p.id) && (siteId === "all" || p.id === siteId))
    .sort((a, b) => a.code.localeCompare(b.code));
  const byDate = (list: typeof rows) => [...list].sort((a, b) => b.date.localeCompare(a.date) || name(a.personId).localeCompare(name(b.personId)));
  // One heading per site, as on the plant overview: the site, then who runs it and where.
  const siteHead = (site: Project, aside: string) => ({
    title: (
      <Link to={`/projects/${site.code}`} className="underline-offset-2 hover:underline">
        {site.code} {site.name}
      </Link>
    ),
    aside: `${db.people.find((p) => p.id === site.siteManagerId)?.name}, ${co(site.county)}${aside ? `. ${aside}` : ""}`,
  });
  const nothing = (what: string) =>
    idle.map((site) => (
      <Section key={site.id} {...siteHead(site, "")}>
        <Panel>
          <p className="px-3 py-3 text-muted">
            No {what} on this site {inLabel}.
          </p>
        </Panel>
      </Section>
    ));

  return (
    <>
      <PageHead
        title="Attendance history"
        note={`${Label}: ${plural(rows.length, "attendance entry", "attendance entries")} for ${plural(totals.length, "person", "people")}.`}
        actions={<Segmented label="Attendance layout" value={layout} onChange={setLayout} options={[{ value: "all", label: "Everyone" }, { value: "sites", label: "Per site" }]} />}
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
          <Segmented label="History view" value={view} onChange={setView} options={[{ value: "totals", label: "Totals for payroll" }, { value: "days", label: "Day by day" }, { value: "corrections", label: "Corrections", count: changes.length }]} />
        </div>
      </PageHead>
      <PageBody>
        {layout === "all" && view === "totals" && (
          <Panel className="max-w-4xl overflow-x-auto">
            {totals.length === 0 ? (
              <Empty title={`No attendance recorded ${inLabel}`}>Choose another period or another site.</Empty>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Sites</th>
                    <th className="num">Full days</th>
                    <th className="num">Half days</th>
                    <th className="num">Basic hours</th>
                    <th className="num">Overtime x1.5</th>
                    <th className="num">Overtime x2</th>
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
                      <td className="num">{t.overtime - t.double || "-"}</td>
                      <td className="num">{t.double || "-"}</td>
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
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.overtime - t.double, 0)}</td>
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.double, 0)}</td>
                    <td className="num border-t border-line-strong font-medium">{totals.reduce((s, t) => s + t.hours + t.overtime, 0).toLocaleString("en-IE")}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
        )}

        {layout === "all" && view === "days" && (
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
                  {byDate(rows).slice(0, 400).map((a) => (
                    <tr key={a.id}>
                      <td className="whitespace-nowrap">{dWeekday(a.date)}</td>
                      <td className="font-medium">{name(a.personId)}</td>
                      <td>{code(a.projectId)}</td>
                      <td>{attendanceShort(a.status, a.overtimeHours, a.overtimeRate)}</td>
                      <td className="text-muted">{a.savedBy}</td>
                      <td className={a.sent ? "text-muted" : "text-warn"}>{a.sent ? "Yes" : "Not yet"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        )}

        {layout === "all" && view === "corrections" && (
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

        {/* Per site: the same three views, under a heading for each site. */}
        {layout === "sites" && view === "totals" && (
          <div className="grid max-w-5xl gap-6">
            {bySite.length === 0 && idle.length === 0 && (
              <Panel>
                <Empty title="No sites were running in this period" />
              </Panel>
            )}
            {bySite.map((s) => {
              const site = db.projects.find((p) => p.id === s.projectId)!;
              return (
                <Section key={s.projectId} {...siteHead(site, `${plural(s.people.length, "person", "people")}, ${n1(s.days)} days`)}>
                  <Panel>
                    <table className="tbl table-fixed" aria-label={`${site.code} ${site.name}, ${label}`}>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th className="num w-[11%] whitespace-normal">Full days</th>
                          <th className="num w-[11%] whitespace-normal">Half days</th>
                          <th className="num w-[12%] whitespace-normal">Basic hours</th>
                          <th className="num w-[13%] whitespace-normal">Overtime x1.5</th>
                          <th className="num w-[13%] whitespace-normal">Overtime x2</th>
                          <th className="num w-[12%] whitespace-normal">Total hours</th>
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
                              <td className="num">{n1(p.hours)}</td>
                              <td className="num">{n1(p.overtime - p.double)}</td>
                              <td className="num">{n1(p.double)}</td>
                              <td className="num font-medium">{n1(p.hours + p.overtime)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="border-t border-line-strong font-medium">Total on {site.code}</td>
                          <td className="num border-t border-line-strong">{n1(s.people.reduce((n, p) => n + p.full, 0))}</td>
                          <td className="num border-t border-line-strong">{n1(s.people.reduce((n, p) => n + p.half, 0))}</td>
                          <td className="num border-t border-line-strong">{n1(s.hours)}</td>
                          <td className="num border-t border-line-strong">{n1(s.overtime - s.double)}</td>
                          <td className="num border-t border-line-strong">{n1(s.double)}</td>
                          <td className="num border-t border-line-strong font-medium">{n1(s.hours + s.overtime)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </Panel>
                </Section>
              );
            })}
            {nothing("attendance recorded")}
          </div>
        )}

        {layout === "sites" && view === "days" && (
          <div className="grid max-w-5xl gap-6">
            {bySite.length === 0 && idle.length === 0 && (
              <Panel>
                <Empty title="No sites were running in this period" />
              </Panel>
            )}
            {bySite.map((s) => {
              const site = db.projects.find((p) => p.id === s.projectId)!;
              const list = byDate(rows.filter((a) => a.projectId === s.projectId));
              const unsent = list.filter((a) => !a.sent).length;
              return (
                <Section key={s.projectId} {...siteHead(site, `${plural(list.length, "entry", "entries")}${unsent > 0 ? `, ${unsent} not sent yet` : ""}`)}>
                  <Panel>
                    <table className="tbl table-fixed" aria-label={`${site.code} ${site.name}, day by day, ${label}`}>
                      <thead>
                        <tr>
                          <th className="w-[22%]">Date</th>
                          <th>Name</th>
                          <th className="w-[18%]">Attendance</th>
                          <th className="w-[22%]">Marked by</th>
                          <th className="w-[10%]">Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.slice(0, 400).map((a) => (
                          <tr key={a.id}>
                            <td>{dWeekday(a.date)}</td>
                            <td className="font-medium">{name(a.personId)}</td>
                            <td>{attendanceShort(a.status, a.overtimeHours, a.overtimeRate)}</td>
                            <td className="text-muted">{a.savedBy}</td>
                            <td className={a.sent ? "text-muted" : "text-warn"}>{a.sent ? "Yes" : "Not yet"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Panel>
                </Section>
              );
            })}
            {nothing("attendance recorded")}
          </div>
        )}

        {layout === "sites" && view === "corrections" && (
          <div className="grid max-w-5xl gap-6">
            {changes.length === 0 && (
              <Panel>
                <Empty title="No corrections in this period">When a sent day is changed from the timesheet, the old value, the new value, who changed it and why are listed here, under the site it was on.</Empty>
              </Panel>
            )}
            {[...new Set(changes.map((c) => c.projectId))]
              .map((id) => db.projects.find((p) => p.id === id)!)
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((site) => {
                const list = changes.filter((c) => c.projectId === site.id);
                return (
                  <Section key={site.id} {...siteHead(site, plural(list.length, "correction"))}>
                    <Panel>
                      <table className="tbl table-fixed" aria-label={`${site.code} ${site.name}, corrections, ${label}`}>
                        <thead>
                          <tr>
                            <th className="w-[17%]">Day corrected</th>
                            <th>Name</th>
                            <th className="w-[11%]">Was</th>
                            <th className="w-[11%]">Now</th>
                            <th className="w-[22%]">Reason</th>
                            <th className="w-[18%]">Changed by</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((c) => (
                            <tr key={c.id}>
                              <td>{dWeekday(c.date)}</td>
                              <td className="font-medium">{name(c.personId)}</td>
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
                    </Panel>
                  </Section>
                );
              })}
          </div>
        )}

        {view === "totals" && rows.length > 0 && (
          <p className="mt-3 max-w-[75ch] text-[0.93rem] text-muted">
            Basic hours follow a 39 hour week: 8 a day Monday to Thursday, 7 on Friday, half that for a half day. Overtime is shown at the rate it was marked at on the timesheet: x1.5 is time and a half, x2 is double time (midnight to 8am, Saturday after 12 noon, Sunday and bank holidays). Total hours are hours worked. Pay and deductions are worked out in Sage Payroll; send a week's hours from{" "}
            <Link to="/people/payroll" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Payroll export
            </Link>
            .
          </p>
        )}
      </PageBody>
    </>
  );
}
