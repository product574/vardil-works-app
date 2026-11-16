import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { clearHold, closeRequest, draftHandover } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Db, Project, ProjectStatus } from "@/data/types";
import { dShort, plural, when, whenInline } from "@/lib/format";
import { money0 } from "@/lib/money";
import { scopePercent } from "@/lib/project-costs";
import { Badge, Button, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { HoldBadge, Progress, ProjectBadge } from "@/ui/status";
import { toast } from "@/ui/toast";
import { REQUEST_LABEL } from "./ProjectPage";

const pctOf = (db: Db, p: Project) => scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id));
const person = (db: Db, id: string) => db.people.find((x) => x.id === id)?.name ?? "-";
const clientOf = (db: Db, p: Project) => db.clients.find((c) => c.id === p.clientId)?.name ?? "-";

type Filter = "All" | ProjectStatus;

export function AllProjects() {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("Live");
  const [q, setQ] = useState("");
  const mine = access.scope(db.projects);
  const count = (s: ProjectStatus) => mine.filter((p) => p.status === s).length;
  const rows = mine
    .filter((p) => filter === "All" || p.status === filter)
    .filter((p) => !q.trim() || `${p.code} ${p.name} ${p.county} ${clientOf(db, p)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.code.localeCompare(a.code));

  return (
    <>
      <PageHead title="All projects" note={!access.allProjects ? "The projects you run. Other site managers' projects are not shown to you." : "Every contract, each with its site code."}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Project status" value={filter} onChange={setFilter} options={[{ value: "Live", label: "Live", count: count("Live") }, { value: "Not started", label: "Not started", count: count("Not started") }, { value: "Complete", label: "Complete", count: count("Complete") }, { value: "Invoiced", label: "Invoiced", count: count("Invoiced") }, { value: "Closed", label: "Closed", count: count("Closed") }, { value: "All", label: "All", count: mine.length }]} />
          <input type="search" aria-label="Search projects" placeholder="Search by code, name, client or county" className="field max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No projects match">Choose another status or clear the search.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Site manager</th>
                  <th>On site</th>
                  <th>Scope done</th>
                  {access.seeValues && <th className="num">Value</th>}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="rowlink" onClick={() => navigate(`/projects/${p.code}`)}>
                    <td className="font-medium">
                      <Link to={`/projects/${p.code}`} onClick={(e) => e.stopPropagation()}>
                        {p.code}
                      </Link>
                    </td>
                    <td>
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-[0.87rem] text-muted">
                        {p.location}, {co(p.county)}
                      </span>
                    </td>
                    <td>{clientOf(db, p)}</td>
                    <td>{person(db, p.siteManagerId)}</td>
                    <td className="whitespace-nowrap">
                      {dShort(p.startDate)} to {dShort(p.endDate)}
                    </td>
                    <td>
                      <Progress pct={pctOf(db, p)} />
                    </td>
                    {access.seeValues && <td className="num">{p.value != null ? money0(p.value, region) : "-"}</td>}
                    <td>
                      <span className="flex items-center gap-1.5">
                        <ProjectBadge status={p.status} />
                        <HoldBadge p={p} />
                      </span>
                    </td>
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

export function OnSiteToday() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const live = access.scope(db.projects).filter((p) => p.status === "Live");
  const marked = new Set(db.attendance.filter((a) => a.date === day).map((a) => a.personId)).size;
  return (
    <>
      <PageHead title="On site today" note={`${plural(live.length, "site")} live, ${plural(marked, "person", "people")} marked on site so far.`} />
      <PageBody className="grid max-w-5xl gap-5">
        {live.length === 0 && (
          <Panel>
            <Empty title="No live sites today" />
          </Panel>
        )}
        {live.map((p) => {
          const roster = db.assignments.filter((a) => a.projectId === p.id);
          const today = db.attendance.filter((a) => a.projectId === p.id && a.date === day);
          const sent = today.length > 0 && today.every((a) => a.sent);
          return (
            <Section
              key={p.id}
              title={
                <Link to={`/projects/${p.code}`} className="underline-offset-2 hover:underline">
                  {p.code} {p.name}
                </Link>
              }
              aside={`${person(db, p.siteManagerId)}, ${co(p.county)}`}
            >
              <Panel>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line px-3 py-2">
                  <span>
                    <span className="font-medium">{today.length}</span> of {roster.length} marked on site
                  </span>
                  <Badge tone={sent ? "ok" : today.length > 0 ? "warn" : "neutral"}>{sent ? "Time stamps sent" : today.length > 0 ? "Marked, not sent" : "Not marked yet"}</Badge>
                  <span className="ml-auto">
                    <Progress pct={pctOf(db, p)} />
                  </span>
                </div>
                <p className="px-3 py-2 text-[0.93rem]">
                  {roster.map((a, i) => {
                    const here = today.some((t) => t.personId === a.personId);
                    return (
                      <span key={a.id} className={here ? "" : "text-muted"}>
                        {i > 0 && ", "}
                        {person(db, a.personId)}
                      </span>
                    );
                  })}
                </p>
                {p.siteInstructions && <p className="border-t border-line px-3 py-2 text-[0.93rem] text-muted">{p.siteInstructions}</p>}
              </Panel>
            </Section>
          );
        })}
      </PageBody>
    </>
  );
}

export function ExtrasAndSnagging() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const manager = access.may("manageProjects");
  const holds = access.scope(db.projects).filter((p) => p.invoiceHold);
  // On a live project nothing is held yet: its final account will be, once the work is complete.
  const held = holds.filter((p) => p.status !== "Live" && p.status !== "Not started");
  const toCome = holds.filter((p) => !held.includes(p));
  const open = access.scope(db.projects).flatMap((p) => db.variations.filter((v) => v.projectId === p.id && v.status === "Draft").map((v) => ({ p, v })));
  return (
    <>
      <PageHead title="Extras and snagging" note={`${plural(held.length, "final account")} held. Clearing a hold is a manager's decision and is written to the project's history.`} />
      <PageBody className="grid max-w-5xl gap-6">
        <Section title={`Invoices held (${held.length})`}>
          <Panel>
            {held.length === 0 ? (
              <Empty title="No invoices are held">A finished project's final account is held while an extra is waiting to be agreed or snagging is open.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {held.map((p) => {
                  const waiting = db.variations.filter((v) => v.projectId === p.id && v.status === "Draft").length;
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link to={`/projects/${p.code}?tab=extras`} className="font-medium underline-offset-2 hover:underline">
                          {p.code} {p.name}
                        </Link>
                        <p className="text-[0.93rem] text-muted">
                          {clientOf(db, p)}. {[p.extrasFlag && `${plural(waiting, "variation")} awaiting approval`, p.snaggingFlag && "Snagging open"].filter(Boolean).join(", ")}.
                        </p>
                      </div>
                      {access.seeValues && p.value != null && <span className="font-medium">{money0(p.value, region)}</span>}
                      <ProjectBadge status={p.status} />
                      {manager && (
                        <Button
                          size="sm"
                          onClick={() => {
                            clearHold(p.id);
                            toast(`Hold cleared on ${p.code}`);
                          }}
                        >
                          Clear hold
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          {toCome.length > 0 && (
            <p className="mt-2 text-[0.93rem] text-muted">
              Still on site, so nothing is held yet. These final accounts will be held when the work is complete:{" "}
              {toCome.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link to={`/projects/${p.code}?tab=extras`} className="text-accent-ink underline-offset-2 hover:underline">
                    {p.code} {p.name}
                  </Link>{" "}
                  ({[p.extrasFlag && "extras to agree", p.snaggingFlag && "snagging open"].filter(Boolean).join(", ")})
                </span>
              ))}
              .
            </p>
          )}
        </Section>
        <Section title={`Variations awaiting approval (${open.length})`} aside={access.can("dashboard") ? <Link to="/dashboard" className="font-medium text-accent-ink underline-offset-2 hover:underline">Open approvals</Link> : undefined}>
          <Panel>
            {open.length === 0 ? (
              <Empty title="Nothing is waiting" />
            ) : (
              <ul className="divide-y divide-line">
                {open.map(({ p, v }) => (
                  <li key={v.id} className="flex flex-wrap items-baseline gap-x-4 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link to={`/projects/${p.code}?tab=extras`} className="font-medium underline-offset-2 hover:underline">
                        {p.code} {p.name}
                      </Link>
                      <p>{v.measured}</p>
                      <p className="text-[0.93rem] text-muted">
                        Raised by {person(db, v.raisedById)}, {whenInline(v.raisedAt, day)}
                      </p>
                    </div>
                    {access.seeValues && <span className="font-medium">{money0(v.estimatedValue, region)}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}

export function Completed() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const navigate = useNavigate();
  const rows = access.scope(db.projects).filter((p) => p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed").sort((a, b) => b.endDate.localeCompare(a.endDate));
  return (
    <>
      <PageHead title="Completed" note="Finished work and where each one stands on handover." />
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No completed projects yet" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Finished</th>
                  {access.seeValues && <th className="num">Value</th>}
                  <th>Status</th>
                  <th>Handover</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const drafted = db.approvals.some((a) => a.kind === "handover" && a.projectId === p.id && a.status === "Pending");
                  return (
                    <tr key={p.id} className="rowlink" onClick={() => navigate(`/projects/${p.code}`)}>
                      <td className="font-medium">{p.code}</td>
                      <td>{p.name}</td>
                      <td>{clientOf(db, p)}</td>
                      <td className="whitespace-nowrap">{dShort(p.endDate)}</td>
                      {access.seeValues && <td className="num">{p.value != null ? money0(p.value, region) : "-"}</td>}
                      <td>
                        <ProjectBadge status={p.status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {p.handoverSentAt ? (
                          <span className="text-ok">Sent {whenInline(p.handoverSentAt, day)}</span>
                        ) : p.invoiceHold ? (
                          <Badge tone="warn">Held: {[p.extrasFlag && "extras", p.snaggingFlag && "snagging"].filter(Boolean).join(" and ")}</Badge>
                        ) : drafted ? (
                          <Badge tone="accent">Draft in approvals</Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => {
                              draftHandover(p.id);
                              toast("Handover email drafted and sent to Approvals");
                            }}
                          >
                            Draft handover
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

export function SiteRequests() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const office = access.may("manageProjects");
  const [show, setShow] = useState<"Open" | "Done">("Open");
  const ids = new Set(access.scope(db.projects).map((p) => p.id));
  const all = db.requests.filter((r) => ids.has(r.projectId));
  const rows = all.filter((r) => r.status === show);
  return (
    <>
      <PageHead title="Requests" note="What the sites have asked the office for: people, the firm's own plant, and plant to hire. Each waits for the managing director's yes or no in Admin. New requests are made from a project's Requests tab." actions={<Segmented label="Request status" value={show} onChange={setShow} options={[{ value: "Open", label: "Open", count: all.filter((r) => r.status === "Open").length }, { value: "Done", label: "Dealt with", count: all.filter((r) => r.status === "Done").length }]} />} />
      <PageBody>
        <Panel className="max-w-5xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={show === "Open" ? "No open requests" : "Nothing dealt with yet"} />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>What</th>
                  <th>Site</th>
                  <th>Needed</th>
                  <th>Asked by</th>
                  <th>Yes or no</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const p = db.projects.find((x) => x.id === r.projectId)!;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Badge>{REQUEST_LABEL[r.kind]}</Badge>
                      </td>
                      <td>
                        <span className="font-medium">{r.description}</span>
                        {r.quantity > 1 && <span className="text-muted"> x {r.quantity}</span>}
                        {r.notes && <span className="block text-[0.87rem] text-muted">{r.notes}</span>}
                      </td>
                      <td>
                        <Link to={`/projects/${p.code}?tab=requests`} className="underline-offset-2 hover:underline">
                          {p.code} {p.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">
                        {dShort(r.neededFrom)} to {dShort(r.neededTo)}
                      </td>
                      <td>
                        {r.requestedBy}
                        <span className="block text-[0.87rem] text-muted">{when(r.createdAt, day)}</span>
                      </td>
                      <td>
                        {r.decision ? (
                          <>
                            <Badge tone={r.decision === "Approved" ? "ok" : "neutral"}>{r.decision}</Badge>
                            <span className="block text-[0.87rem] text-muted">{r.decidedBy}</span>
                          </>
                        ) : (
                          <span className="text-muted">Waiting</span>
                        )}
                      </td>
                      <td className="text-right">
                        {r.status === "Open" && office && (
                          <Button
                            size="sm"
                            onClick={() => {
                              closeRequest(r.id);
                              toast("Request marked as dealt with");
                            }}
                          >
                            Mark dealt with
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
