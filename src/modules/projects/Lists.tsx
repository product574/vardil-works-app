import { Plus } from "@phosphor-icons/react";
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
import { crewRequests, mayHandleCrewRequest, requestsFor, withOffice } from "@/lib/requests";
import { holdLines, takesRequests, takesSnags } from "@/lib/snags";
import { dayRoster } from "@/lib/roster";
import { Badge, Button, DeclineNote, Dialog, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { HoldBadge, Progress, ProjectBadge } from "@/ui/status";
import { toast } from "@/ui/toast";
import { AddSnagDialog, NewRequestDialog, NewVariationDialog } from "./AddDialogs";
import { CrewRequestButtons } from "./CrewRequestButtons";
import { SnagList } from "./Snags";
import { REQUEST_LABEL } from "./ProjectPage";

const pctOf = (db: Db, p: Project) => scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id));
const person = (db: Db, id: string) => db.people.find((x) => x.id === id)?.name ?? "-";
const clientOf = (db: Db, p: Project) => db.clients.find((c) => c.id === p.clientId)?.name ?? "-";

type Filter = "All" | ProjectStatus;

/** Projects, Live projects (20 Nov, the Oldstone template): the live jobs only, opening each on its own page. */
export const LiveProjects = () => <AllProjects fixed="Live" />;
/** Projects, Not started: confirmed and waiting to start. */
export const NotStarted = () => <AllProjects fixed="Not started" />;

export function AllProjects({ fixed }: { fixed?: "Live" | "Not started" } = {}) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const navigate = useNavigate();
  const day = useDay();
  const [chosen, setFilter] = useState<Filter>("Live");
  const filter: Filter = fixed ?? chosen;
  const [q, setQ] = useState("");
  const mine = access.scope(db.projects);
  const count = (s: ProjectStatus) => mine.filter((p) => p.status === s).length;
  const rows = mine
    .filter((p) => filter === "All" || p.status === filter)
    .filter((p) => !q.trim() || `${p.code} ${p.name} ${p.county} ${clientOf(db, p)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.code.localeCompare(a.code));

  return (
    <>
      <PageHead
        title={fixed === "Live" ? "Live projects" : fixed === "Not started" ? "Not started" : "All projects"}
        note={`${fixed === "Live" ? `${plural(rows.length, "project")} on site now.` : fixed === "Not started" ? `${plural(rows.length, "project")} confirmed and waiting to start.` : "Every contract, each with its site code."}${!access.allProjects ? " The projects you run; other site managers' are not shown to you." : ""} Open one for its overview, files, programme, week ahead, variations, photos, plant, site requests and costs.`}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!fixed && <Segmented label="Project status" value={filter} onChange={setFilter} options={[{ value: "Live", label: "Live", count: count("Live") }, { value: "Not started", label: "Not started", count: count("Not started") }, { value: "Complete", label: "Complete", count: count("Complete") }, { value: "Invoiced", label: "Invoiced", count: count("Invoiced") }, { value: "Closed", label: "Closed", count: count("Closed") }, { value: "All", label: "All", count: mine.length }]} />}
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
                  <th>{filter === "Not started" ? "Starts" : "On site"}</th>
                  {filter === "Live" && <th className="num">Today</th>}
                  {filter === "Not started" && <th className="num">People planned</th>}
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
                      {p.status === "Live" && p.endDate < day && <span className="block text-[0.87rem] text-bad">Past its finish date</span>}
                    </td>
                    {filter === "Live" && <td className="num">{dayRoster(db.attendance, db.plan, p.id, day, day).rows.length || "-"}</td>}
                    {filter === "Not started" && <td className="num">{new Set(db.plan.filter((e) => e.projectId === p.id).map((e) => e.personId)).size || <span className="text-warn">None yet</span>}</td>}
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

/**
 * Projects, Requests and variations, Variations and snagging (reworded and given its plus buttons
 * on 20 Nov, decisions 234 to 236). Three lists: final accounts on hold, each with why and what
 * lets it go; variations waiting for approval; and every open snag. "On hold" means the firm has
 * not billed the job's last invoice yet. It is not money the client is keeping back.
 */
export function VariationsAndSnagging() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const manager = access.may("manageProjects");
  const [adding, setAdding] = useState<"variation" | "snag" | null>(null);
  const [clearing, setClearing] = useState<Project | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const mine = access.scope(db.projects);
  const ids = new Set(mine.map((p) => p.id));
  const holds = mine.filter((p) => p.invoiceHold);
  // On a live project nothing is on hold yet: its final account will be, once the work is complete.
  const held = holds.filter((p) => p.status !== "Live" && p.status !== "Not started");
  const toCome = holds.filter((p) => !held.includes(p));
  const open = mine.flatMap((p) => db.variations.filter((v) => v.projectId === p.id && v.status === "Draft").map((v) => ({ p, v })));
  const snags = db.snags.filter((s) => ids.has(s.projectId));
  const openSnagRows = snags.filter((s) => s.status === "Open");
  const fixedRows = snags.filter((s) => s.status === "Fixed");
  const canAdd = mine.some(takesSnags);
  return (
    <>
      <PageHead
        title="Variations and snagging"
        note={`${plural(held.length, "final account")} on hold, ${plural(open.length, "variation")} waiting for approval, ${plural(openSnagRows.length, "snag")} open. A final account is the last invoice on a finished job: we hold it back while a variation is not agreed or a snag is open, so the client is billed once and for the right amount.`}
        actions={
          canAdd ? (
            <>
              <Button onClick={() => setAdding("snag")}>
                <Plus size={16} /> Add snag
              </Button>
              <Button variant="primary" onClick={() => setAdding("variation")}>
                <Plus size={16} /> New variation
              </Button>
            </>
          ) : undefined
        }
      />
      <PageBody className="grid max-w-5xl gap-6">
        <Section title={`Final accounts on hold (${held.length})`} aside="Not yet invoiced. Each lets go by itself when its reason is dealt with">
          <Panel>
            {held.length === 0 ? (
              <Empty title="No final account is on hold">A finished project's final account is held back while a variation is waiting to be agreed or a snag is open.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {held.map((p) => {
                  const lines = holdLines(p, db.variations, db.snags);
                  return (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1 basis-72">
                        <Link to={`/projects/${p.code}?tab=variations`} className="font-medium underline-offset-2 hover:underline">
                          {p.code} {p.name}
                        </Link>
                        <p className="text-[0.93rem] text-muted">{clientOf(db, p)}. Work finished {dShort(p.endDate)}.</p>
                        {lines.length === 0 ? (
                          <p className="text-[0.93rem] text-warn">Put on hold by a manager.</p>
                        ) : (
                          lines.map((l) => (
                            <p key={l.why} className="text-[0.93rem] text-warn">
                              On hold because {l.why}. It lets go by {l.lets}.
                            </p>
                          ))
                        )}
                      </div>
                      {access.seeValues && p.value != null && (
                        <span className="text-right">
                          <span className="block font-medium">{money0(p.value, region)}</span>
                          <span className="block text-[0.87rem] text-muted">contract value</span>
                        </span>
                      )}
                      {manager && (
                        <Button size="sm" onClick={() => setClearing(p)}>
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
              Still on site, so nothing is on hold yet. These final accounts will be held when the work is complete, unless what is open is settled first:{" "}
              {toCome.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link to={`/projects/${p.code}?tab=variations`} className="text-accent-ink underline-offset-2 hover:underline">
                    {p.code} {p.name}
                  </Link>{" "}
                  ({[p.extrasFlag && "variations to agree", p.snaggingFlag && "snags open"].filter(Boolean).join(", ")})
                </span>
              ))}
              .
            </p>
          )}
        </Section>
        <Section title={`Variations waiting for approval (${open.length})`} aside={access.can("dashboard") ? <Link to="/dashboard" className="font-medium text-accent-ink underline-offset-2 hover:underline">Approve on the Dashboard</Link> : "The managing director approves each one"}>
          <Panel>
            {open.length === 0 ? (
              <Empty title="Nothing is waiting">Extra work is added here with New variation, on a project's Variations tab, or from the site phone.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {open.map(({ p, v }) => (
                  <li key={v.id} className="flex flex-wrap items-baseline gap-x-4 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link to={`/projects/${p.code}?tab=variations`} className="font-medium underline-offset-2 hover:underline">
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
        <Section
          title={`Open snags (${openSnagRows.length})`}
          aside={
            fixedRows.length > 0 ? (
              <button type="button" className="press font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => setShowFixed((x) => !x)}>
                {showFixed ? "Hide the fixed ones" : `Show ${plural(fixedRows.length, "fixed snag")}`}
              </button>
            ) : undefined
          }
        >
          <Panel>
            <SnagList snags={showFixed ? [...openSnagRows, ...fixedRows] : openSnagRows} projects={db.projects} canFix={() => true} empty="No snag is open" />
          </Panel>
        </Section>
      </PageBody>
      {adding === "variation" && <NewVariationDialog onClose={() => setAdding(null)} />}
      {adding === "snag" && <AddSnagDialog onClose={() => setAdding(null)} />}
      {clearing && <ClearHoldDialog p={clearing} onClose={() => setClearing(null)} />}
    </>
  );
}
/** The old name, kept for links and tests written before 20 Nov. */
export const ExtrasAndSnagging = VariationsAndSnagging;

/**
 * Clearing a hold is a manager's decision to bill the final account anyway. It asks first and says
 * what stays open, because it cannot be put back with one click: the next variation or snag does that.
 */
export function ClearHoldDialog({ p, onClose }: { p: Project; onClose: () => void }) {
  const db = useData((s) => s.db);
  const lines = holdLines(p, db.variations, db.snags);
  const live = p.status === "Live" || p.status === "Not started";
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Clear the hold on ${p.code}?`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              clearHold(p.id);
              toast(`Hold cleared on ${p.code}. ${live ? "Its final account will not be held" : "Its final account can be invoiced in Finance, Money in"}`);
              onClose();
            }}
          >
            Confirm, clear the hold
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        <p>
          {p.code} {p.name}: {live ? "the final account will not be held when the work is complete." : "the final account moves to Finance, Money in, ready to invoice."}
        </p>
        {lines.map((l) => (
          <p key={l.why} className="text-warn">
            Still open: {l.why}. {l.why.includes("variation") ? "Anything approved later is invoiced on its own." : "The snags stay on the list until they are marked fixed."}
          </p>
        ))}
        <p className="text-[0.93rem] text-muted">Your name and the time are written to the project's history.</p>
      </div>
    </Dialog>
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
                          <Badge tone="warn">On hold: {[p.extrasFlag && "variations", p.snaggingFlag && "snagging"].filter(Boolean).join(" and ")}</Badge>
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
  const [adding, setAdding] = useState(false);
  const canAdd = access.scope(db.projects).some(takesRequests);
  const ids = new Set(access.scope(db.projects).map((p) => p.id));
  // Requests on the sites this screen covers, and general ones (not for one site) for the office and for whoever asked.
  const all = requestsFor(db, access.personId);
  // Asked on an operative's phone and still with the site manager (17 Nov): shown apart, above the office's list.
  const crew = crewRequests(db.requests, ids);
  const mine = crew.some((r) => mayHandleCrewRequest(db.projects.find((p) => p.id === r.projectId), access.personId, access.siteAccess));
  const rows = all.filter((r) => (show === "Open" ? withOffice(r) : r.status === "Done"));
  return (
    <>
      <PageHead
        title="Site requests"
        note="What the sites have asked the office for: people, the firm's own plant, plant to hire and anything else, for one site or in general. Add one here with New request, on a project's Site requests tab, or from the site phone. Each waits for the managing director's yes or no in Admin. A request made on an operative's phone goes to the site manager first, who passes it on or deals with it on site."
        actions={
          <>
            <Segmented label="Request status" value={show} onChange={setShow} options={[{ value: "Open", label: "Open", count: all.filter(withOffice).length }, { value: "Done", label: "Dealt with", count: all.filter((r) => r.status === "Done").length }]} />
            {canAdd && (
              <Button variant="primary" onClick={() => setAdding(true)}>
                <Plus size={16} /> New request
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-5xl gap-6">
        {show === "Open" && crew.length > 0 && (
          <Section title={`${mine ? "From your crew" : "With the site managers"} (${crew.length})`} aside="Asked on the site phone. The site manager passes each one to management or deals with it on site">
            <Panel>
              <ul className="divide-y divide-line" aria-label="Requests from the crew">
                {crew.map((r) => {
                  const p = db.projects.find((x) => x.id === r.projectId)!;
                  const can = mayHandleCrewRequest(p, access.personId, access.siteAccess);
                  return (
                    <li key={r.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                      <Badge className="mt-0.5 w-24 justify-center">{REQUEST_LABEL[r.kind]}</Badge>
                      <div className="min-w-0 flex-1 basis-64">
                        <p className="font-medium">
                          {r.description}
                          {r.quantity > 1 && <span className="font-normal text-muted"> x {r.quantity}</span>}
                        </p>
                        <p className="text-[0.93rem] text-muted">
                          <Link to={`/projects/${p.code}?tab=requests`} className="underline-offset-2 hover:underline">
                            {p.code} {p.name}
                          </Link>
                          . Asked by {r.requestedBy}, {when(r.createdAt, day)}. Needed {dShort(r.neededFrom)} to {dShort(r.neededTo)}.
                        </p>
                      </div>
                      {can ? <CrewRequestButtons id={r.id} what={r.description} /> : <span className="text-[0.93rem] text-muted">With {db.people.find((x) => x.id === p.siteManagerId)?.name}</span>}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </Section>
        )}
        <Panel className="overflow-x-auto">
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
                  const p = db.projects.find((x) => x.id === r.projectId);
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
                        {p ? (
                          <Link to={`/projects/${p.code}?tab=requests`} className="underline-offset-2 hover:underline">
                            {p.code} {p.name}
                          </Link>
                        ) : (
                          <span className="text-muted">General, not for one site</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{r.neededFrom === r.neededTo ? dShort(r.neededFrom) : `${dShort(r.neededFrom)} to ${dShort(r.neededTo)}`}</td>
                      <td>
                        {r.requestedBy}
                        <span className="block text-[0.87rem] text-muted">
                          {when(r.forwardedAt ?? r.createdAt, day)}
                          {r.raisedBy ? `. First asked by ${r.raisedBy}` : ""}
                        </span>
                      </td>
                      <td>
                        {r.decision ? (
                          <>
                            <Badge tone={r.decision === "Approved" ? "ok" : "neutral"}>{r.decision}</Badge>
                            <span className="block text-[0.87rem] text-muted">{r.decidedBy}</span>
                            {r.decision === "Declined" && <DeclineNote note={r.declineNote} />}
                          </>
                        ) : r.heldBy === "site" ? (
                          <span className="text-muted">Dealt with on site{r.dealtBy ? ` by ${r.dealtBy}` : ""}</span>
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
      {adding && <NewRequestDialog onClose={() => setAdding(false)} />}
    </>
  );
}
