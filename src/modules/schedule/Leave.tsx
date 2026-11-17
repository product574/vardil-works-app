import { useState } from "react";
import { useAccess } from "@/data/access";
import { decideHoliday } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Db, Holiday } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { leaveGroups, overlapping, workingDays } from "@/lib/roster";
import { Badge, Button, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { RecordLeaveDialog } from "../people/Team";

const told = (cleared: number) => (cleared > 0 ? `. ${plural(cleared, "planned day")} taken off the week ahead` : "");

/** Where someone would normally be: the sites they are on the list for, or their trade. */
function usualSites(db: Db, personId: string) {
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  return [...new Set(db.assignments.filter((a) => a.personId === personId && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)?.code ?? ""))].filter(Boolean).sort();
}

function LeaveList({ db, rows, day }: { db: Db; rows: Holiday[]; day: string }) {
  return (
    <Panel className="overflow-x-auto">
      <table className="tbl table-fixed">
        <thead>
          <tr>
            <th>Name</th>
            <th className="w-44">From</th>
            <th className="w-44">Back after</th>
            <th className="w-28 text-right">Working days</th>
            <th className="w-40">Usually on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => {
            const p = db.people.find((x) => x.id === h.personId);
            const sites = usualSites(db, h.personId);
            return (
              <tr key={h.id}>
                <td>
                  <span className="font-medium">{p?.name}</span>
                  <span className="block text-[0.87rem] text-muted">
                    {p?.trade}
                    {h.note ? `. ${h.note}` : ""}
                  </span>
                </td>
                <td className="whitespace-nowrap">{dFull(h.from)}</td>
                <td className="whitespace-nowrap">
                  {dFull(h.to)}
                  {h.from <= day && h.to >= day && <span className="block text-[0.87rem] text-muted">{plural(workingDays(day, h.to), "working day")} left</span>}
                </td>
                <td className="text-right tabular-nums">{workingDays(h.from, h.to)}</td>
                <td className="text-muted">{sites.length > 0 ? sites.join(", ") : "No site list"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/** Who is off: now, coming up, and back in the last 30 days. Approved leave only. */
export function ScheduleHolidays() {
  const db = useData((s) => s.db);
  const day = useDay();
  const canRecord = useAccess().may("approveLeave");
  const [adding, setAdding] = useState(false);
  const g = leaveGroups(db.holidays, day);
  return (
    <>
      <PageHead
        title="Holidays"
        note={`${plural(g.now.length, "person", "people")} off today, ${g.coming.length} more booked. Approved leave blocks that person on the week ahead.${g.requested.length > 0 ? ` ${plural(g.requested.length, "request")} waiting under Holiday requests.` : ""}`}
        actions={canRecord && <Button onClick={() => setAdding(true)}>Record leave</Button>}
      />
      <PageBody className="grid max-w-6xl gap-6">
        <Section title={`Off today (${g.now.length})`}>{g.now.length === 0 ? <Panel><Empty title="Nobody is off today" /></Panel> : <LeaveList db={db} rows={g.now} day={day} />}</Section>
        <Section title={`Coming up (${g.coming.length})`}>{g.coming.length === 0 ? <Panel><Empty title="No leave booked ahead" /></Panel> : <LeaveList db={db} rows={g.coming} day={day} />}</Section>
        {g.recent.length > 0 && <Section title={`Back in the last 30 days (${g.recent.length})`}><LeaveList db={db} rows={g.recent} day={day} /></Section>}
      </PageBody>
      {adding && <RecordLeaveDialog onClose={() => setAdding(false)} told={told} />}
    </>
  );
}

/** Leave asked for and not yet answered. Whoever has "Approve leave" approves or declines it here; the same requests are in Admin, Requests. */
export function HolidayRequests() {
  const db = useData((s) => s.db);
  const day = useDay();
  const canDecide = useAccess().may("approveLeave");
  const { requested } = leaveGroups(db.holidays, day);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  return (
    <>
      <PageHead
        title="Holiday requests"
        note={`${plural(requested.length, "request")} waiting.${canDecide ? " Approving takes the person off the week ahead for those days." : " Approving or declining needs the \"Approve leave\" permission."}`}
      />
      <PageBody className="grid max-w-4xl gap-3">
        {requested.length === 0 && (
          <Panel>
            <Empty title="No requests waiting">New requests from the site phone, email or the office land here and in Admin, Requests.</Empty>
          </Panel>
        )}
        <ul className="grid gap-3" aria-label="Holiday requests">
          {requested.map((h) => {
            const p = db.people.find((x) => x.id === h.personId);
            const planned = db.plan.filter((x) => x.personId === h.personId && x.date >= h.from && x.date <= h.to);
            const plannedSites = [...new Set(planned.map((x) => code(x.projectId)))].sort();
            const others = overlapping(db.holidays, h);
            return (
              <li key={h.id}>
                <Panel className="grid gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="text-base">{p?.name}</h2>
                    <span className="text-muted">{p?.trade}</span>
                    <span className="ml-auto text-[0.93rem] text-muted">Came in by {h.via.toLowerCase()}</span>
                  </div>
                  <p className="font-medium">
                    {h.from === h.to ? dFull(h.from) : `${dFull(h.from)} to ${dFull(h.to)}`}
                    <span className="font-normal text-muted">, {plural(workingDays(h.from, h.to), "working day")}</span>
                  </p>
                  {h.note && <p>{h.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    {planned.length > 0 ? <Badge tone="warn">{plural(planned.length, "day")} already planned on {plannedSites.join(", ")}</Badge> : <Badge tone="ok">Nothing planned in those days</Badge>}
                    {others.length > 0 && <Badge tone="neutral">Also off then: {others.map((o) => `${db.people.find((x) => x.id === o.personId)?.name} (${dShort(o.from)} to ${dShort(o.to)})`).join(", ")}</Badge>}
                  </div>
                  {canDecide && (
                    <div className="flex justify-end gap-2 pt-1">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          decideHoliday(h.id, false);
                          toast(`Leave declined for ${p?.name}`);
                        }}
                      >
                        Decline
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => {
                          const cleared = decideHoliday(h.id, true);
                          toast(`Leave approved for ${p?.name}${told(cleared)}`);
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  )}
                </Panel>
              </li>
            );
          })}
        </ul>
      </PageBody>
    </>
  );
}
