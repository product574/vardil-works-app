import { useMemo, useState } from "react";
import { useAccess } from "@/data/access";
import { useData, useDay } from "@/data/store";
import { MONTHS } from "@/lib/dates";
import { dWeekday, plural, when } from "@/lib/format";
import { paidHours } from "@/lib/project-costs";
import { attendanceShort, shiftMonth } from "@/lib/week";
import { Button, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

/** A month of attendance: totals per person for payroll, the day-by-day record, and every correction. */
export function AttendanceHistory() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [ym, setYm] = useState(day.slice(0, 7));
  const [siteId, setSiteId] = useState("all");
  const [view, setView] = useState<"totals" | "days" | "corrections">("totals");
  const sites = access.scope(db.projects).filter((p) => db.attendance.some((a) => a.projectId === p.id));
  const siteIds = new Set(sites.map((p) => p.id));
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "-";
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "-";

  const rows = useMemo(() => db.attendance.filter((a) => a.date.startsWith(ym) && siteIds.has(a.projectId) && (siteId === "all" || a.projectId === siteId)), [db.attendance, ym, siteId, sites.length]);
  const totals = useMemo(() => {
    const m = new Map<string, { full: number; half: number; overtime: number; hours: number; sites: Set<string> }>();
    for (const a of rows) {
      const t = m.get(a.personId) ?? { full: 0, half: 0, overtime: 0, hours: 0, sites: new Set<string>() };
      if (a.status === "full") t.full++;
      else t.half++;
      t.overtime += a.overtimeHours;
      t.hours += paidHours(a.status, a.overtimeHours);
      t.sites.add(code(a.projectId));
      m.set(a.personId, t);
    }
    return [...m.entries()].map(([personId, t]) => ({ personId, ...t })).sort((a, b) => name(a.personId).localeCompare(name(b.personId)));
  }, [rows]);
  const changes = db.attendanceChanges.filter((c) => c.date.startsWith(ym) && siteIds.has(c.projectId) && (siteId === "all" || c.projectId === siteId));
  const [y, m] = ym.split("-").map(Number) as [number, number];

  return (
    <>
      <PageHead title="Attendance history" note={`${MONTHS[m - 1]} ${y}: ${plural(rows.length, "attendance entry", "attendance entries")} for ${plural(totals.length, "person", "people")}.`} actions={<Segmented label="History view" value={view} onChange={setView} options={[{ value: "totals", label: "Totals for payroll" }, { value: "days", label: "Day by day" }, { value: "corrections", label: "Corrections", count: changes.length }]} />}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setYm(shiftMonth(ym, -1))}>
            Earlier month
          </Button>
          <Button size="sm" disabled={ym >= day.slice(0, 7)} onClick={() => setYm(shiftMonth(ym, 1))}>
            Later month
          </Button>
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
              <Empty title="No attendance recorded in this month">Choose an earlier month or another site.</Empty>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Sites</th>
                    <th className="num">Full days</th>
                    <th className="num">Half days</th>
                    <th className="num">Overtime hours</th>
                    <th className="num">Paid hours</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.personId}>
                      <td className="font-medium">{name(t.personId)}</td>
                      <td className="text-muted">{[...t.sites].sort().join(", ")}</td>
                      <td className="num">{t.full}</td>
                      <td className="num">{t.half || "-"}</td>
                      <td className="num">{t.overtime || "-"}</td>
                      <td className="num font-medium">{t.hours.toLocaleString("en-IE")}</td>
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
                    <td className="num border-t border-line-strong">{totals.reduce((s, t) => s + t.overtime, 0)}</td>
                    <td className="num border-t border-line-strong font-medium">{totals.reduce((s, t) => s + t.hours, 0).toLocaleString("en-IE")}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
        )}
        {view === "totals" && totals.length > 0 && <p className="mt-2 text-[0.93rem] text-muted">Paid hours count a full day as 8, a half day as 4, and overtime at time and a half.</p>}

        {view === "days" && (
          <Panel className="max-w-4xl overflow-x-auto">
            {rows.length === 0 ? (
              <Empty title="No attendance recorded in this month" />
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
          <Section title="Corrections this month">
            <Panel className="max-w-4xl overflow-x-auto">
              {changes.length === 0 ? (
                <Empty title="No corrections this month">When a sent day is changed from the timesheet, the old value, the new value, who changed it and why are listed here.</Empty>
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
      </PageBody>
    </>
  );
}
