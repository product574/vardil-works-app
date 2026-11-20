import { Truck, UsersThree, Wrench } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay } from "@/data/store";
import type { Db, Project } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { dayRoster } from "@/lib/roster";
import { Badge, Empty, PageBody, PageHead, Panel, Section } from "@/ui";

const person = (db: Db, id: string) => db.people.find((x) => x.id === id);

/**
 * Projects, Resources today (20 Nov, the Oldstone template): for each live site, where everyone
 * is, the firm's own plant on it, and the plant hired in for it. The people are read the same way
 * as the week and month ahead (`dayRoster`): marked in on the timesheet, else down on the plan.
 * Then what is in the yard and who is not on a site.
 */
export function ResourcesToday() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const live = access.scope(db.projects).filter((p) => p.status === "Live").sort((a, b) => a.code.localeCompare(b.code));
  const peopleOn = (p: Project) => dayRoster(db.attendance, db.plan, p.id, day, day);
  const placed = new Set(live.flatMap((p) => peopleOn(p).rows.map((r) => r.personId)));
  const off = new Set(db.holidays.filter((h) => h.status === "Approved" && h.from <= day && h.to >= day).map((h) => h.personId));
  const free = db.people.filter((p) => p.active && p.kind === "Operative" && !placed.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const yard = db.plant.filter((x) => x.projectId === null);
  const totalPeople = placed.size;
  const totalOwn = db.plant.filter((x) => live.some((p) => p.id === x.projectId)).length;
  const totalHired = db.hiredPlant.filter((h) => h.status !== "Collected" && live.some((p) => p.id === h.projectId)).length;
  return (
    <>
      <PageHead title="Resources today" note={`${plural(live.length, "live site")}: ${plural(totalPeople, "person", "people")}, ${plural(totalOwn, "item")} of our own plant and ${plural(totalHired, "item")} of hired plant on them today.`} />
      <PageBody className="grid max-w-[90rem] grid-cols-1 gap-5">
        {live.length === 0 && (
          <Panel>
            <Empty title="No live sites today" />
          </Panel>
        )}
        {live.map((p) => {
          const roster = peopleOn(p);
          const own = db.plant.filter((x) => x.projectId === p.id);
          const hired = db.hiredPlant.filter((h) => h.projectId === p.id && h.status !== "Collected");
          return (
            <Section
              key={p.id}
              title={
                <Link to={`/projects/${p.code}`} className="underline-offset-2 hover:underline">
                  {p.code} {p.name}
                </Link>
              }
              aside={`${person(db, p.siteManagerId)?.name ?? ""}, ${co(p.county)}`}
            >
              <Panel className="grid gap-0 md:grid-cols-3 md:divide-x md:divide-line">
                <Column icon={<UsersThree size={18} />} title={`People (${roster.rows.length})`} note={roster.from === "timesheet" ? "Marked in on the timesheet" : "Down on the plan, not marked yet"}>
                  {roster.rows.length === 0 && <li className="text-muted">Nobody today.</li>}
                  {roster.rows.map((r) => {
                    const x = person(db, r.personId);
                    return (
                      <li key={r.personId} className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1">
                          {x?.name}
                          <span className="text-[0.87rem] text-muted"> {x?.trade}</span>
                        </span>
                        {r.note && <span className="text-[0.87rem] text-muted">{r.note}</span>}
                      </li>
                    );
                  })}
                </Column>
                <Column icon={<Wrench size={18} />} title={`Our plant (${own.length})`} note="The firm's own, on this site">
                  {own.length === 0 && <li className="text-muted">None of ours on site.</li>}
                  {own.map((x) => (
                    <li key={x.id} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1">
                        {x.name} <span className="text-[0.87rem] text-muted">{x.assetRef}</span>
                      </span>
                      {x.status === "Off for repair" && <Badge tone="warn">Off for repair</Badge>}
                    </li>
                  ))}
                </Column>
                <Column icon={<Truck size={18} />} title={`Hired plant (${hired.length})`} note="Hired in for this site">
                  {hired.length === 0 && <li className="text-muted">Nothing on hire.</li>}
                  {hired.map((h) => (
                    <li key={h.id} className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1">
                        {h.quantity > 1 ? `${h.quantity} x ` : ""}
                        {h.description}
                        <span className="block text-[0.87rem] text-muted">
                          {h.hireCompany}, since {dShort(h.onHireFrom)}
                        </span>
                      </span>
                      {h.status === "Return notified" && <Badge tone="warn">Going back</Badge>}
                    </li>
                  ))}
                </Column>
              </Panel>
            </Section>
          );
        })}
        <div className="grid gap-5 md:grid-cols-2">
          <Section title={`Not on a site today (${free.length})`} aside={access.can("schedule") && <Link to="/schedule" className="font-medium text-accent-ink underline-offset-2 hover:underline">Week ahead</Link>}>
            <Panel className="px-4 py-3">
              <ul className="grid gap-1 sm:grid-cols-2">
                {free.length === 0 && <li className="text-muted">Everyone is on a site.</li>}
                {free.map((x) => (
                  <li key={x.id}>
                    {x.name} <span className="text-[0.87rem] text-muted">{off.has(x.id) ? "on leave" : x.trade}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
          <Section title={`Plant in the yard (${yard.length})`} aside={access.can("plant") && <Link to="/plant" className="font-medium text-accent-ink underline-offset-2 hover:underline">Plant</Link>}>
            <Panel className="px-4 py-3">
              <ul className="grid gap-1 sm:grid-cols-2">
                {yard.length === 0 && <li className="text-muted">Nothing in the yard.</li>}
                {yard.map((x) => (
                  <li key={x.id}>
                    {x.name} <span className="text-[0.87rem] text-muted">{x.status === "Off for repair" ? "off for repair" : x.assetRef}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        </div>
      </PageBody>
    </>
  );
}

function Column({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3 last:border-b-0 md:border-b-0">
      <p className="flex items-center gap-1.5 font-medium">
        <span className="text-accent-ink">{icon}</span>
        {title}
      </p>
      <p className="mb-1.5 text-[0.87rem] text-muted">{note}</p>
      <ul className="grid gap-1">{children}</ul>
    </div>
  );
}
