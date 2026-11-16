import { useMemo, useState } from "react";
import { DEPARTMENTS } from "@/app/departments";
import { useDay, useDb } from "@/data/store";
import { plural, when } from "@/lib/format";
import { Empty, PageBody, PageHead, Panel } from "@/ui";

export function ActivityLog() {
  const activity = useDb((db) => db.activity);
  const day = useDay();
  const [dept, setDept] = useState("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return activity.filter((a) => (dept === "all" || a.department === dept) && (!s || `${a.who} ${a.what} ${a.target}`.toLowerCase().includes(s)));
  }, [activity, dept, q]);
  const name = (key: string) => DEPARTMENTS.find((d) => d.key === key)?.label ?? key;

  return (
    <>
      <PageHead title="Activity log" note="Who did what, newest first. Work prepared by the system is recorded under Assistant.">
        <div className="mt-3 flex flex-wrap gap-2">
          <input type="search" aria-label="Search the activity log" placeholder="Search by person, action or record" className="field max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Department" className="field w-auto" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="all">All departments</option>
            {DEPARTMENTS.filter((d) => activity.some((a) => a.department === d.key)).map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <span className="self-center text-[0.93rem] text-muted">{plural(rows.length, "entry", "entries")}</span>
        </div>
      </PageHead>
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No entries match">Clear the search or choose all departments to see everything.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>What</th>
                  <th>Record</th>
                  <th>Department</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-muted">{when(a.at, day)}</td>
                    <td className="whitespace-nowrap font-medium">{a.who}</td>
                    <td>{a.what}</td>
                    <td>{a.target}</td>
                    <td className="whitespace-nowrap text-muted">{name(a.department)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
