import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { useAccess } from "@/data/access";
import { draftHandover } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { dShort, plural, whenInline } from "@/lib/format";
import { money0 } from "@/lib/money";
import { byStatusThenCode, filtersOn, type HandoverFilter, isFinished, matchesProject, NO_FILTER, type ProjectFilter, type StatusFilter, statusGroup } from "@/lib/project-filter";
import { scopePercent } from "@/lib/project-costs";
import type { Db, Project } from "@/data/types";
import { Badge, Button, Empty, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { HoldBadge, Progress, ProjectBadge } from "@/ui/status";
import { toast } from "@/ui/toast";
import { AddProjectDialog } from "./AddProject";

const pctOf = (db: Db, p: Project) => scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id));
const person = (db: Db, id: string) => db.people.find((x) => x.id === id)?.name ?? "";
const clientOf = (db: Db, p: Project) => db.clients.find((c) => c.id === p.clientId)?.name ?? "-";

/** The old Completed list is All projects narrowed to finished jobs: an old link lands there. */
export const Completed = () => <Navigate to="/projects/all?status=finished" replace />;

/**
 * Projects, All projects (Oisin, 21 Nov, in place of Completed): every job the person may open,
 * with a box to look one up and filters for status, handover, site manager and a final account
 * on hold. Finished jobs keep what Completed had: where each stands on handover, with Draft
 * handover on the ones still to go. The filters are remembered for the next visit.
 */
export function AllProjects() {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const navigate = useNavigate();
  const day = useDay();
  const [params] = useSearchParams();
  const [saved, setSaved] = useScreenState<ProjectFilter>("all-projects", NO_FILTER);
  const [adding, setAdding] = useState(false);
  // A link can ask for a status (the old Completed address does); otherwise it is as it was left.
  const asked = params.get("status");
  const f: ProjectFilter = asked === "finished" || asked === "live" || asked === "not-started" ? { ...saved, status: asked } : saved;
  const set = (change: Partial<ProjectFilter>) => {
    setSaved({ ...f, ...change });
    if (asked) navigate("/projects/all", { replace: true });
  };
  const mine = access.scope(db.projects);
  const extra = (p: (typeof mine)[number]) => `${clientOf(db, p)} ${person(db, p.siteManagerId)}`;
  const rows = mine.filter((p) => matchesProject(p, f, extra(p))).sort(byStatusThenCode);
  const count = (s: StatusFilter) => mine.filter((p) => s === "all" || statusGroup(p.status) === s).length;
  const managers = [...new Set(mine.map((p) => p.siteManagerId))].map((id) => ({ id, name: person(db, id) })).filter((m) => m.name).sort((a, b) => a.name.localeCompare(b.name));
  const held = mine.filter((p) => p.invoiceHold).length;
  const on = filtersOn(f);
  const anyFinished = rows.some((p) => isFinished(p.status));

  return (
    <>
      <PageHead
        title="All projects"
        note={`${plural(mine.length, "project")}: ${count("live")} live, ${count("not-started")} waiting to start, ${count("finished")} finished. Look one up, or narrow the list with the filters. A finished job shows where it stands on handover.`}
        actions={
          access.may("manageProjects") && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Add project
            </Button>
          )
        }
      >
        <div className="mt-3 grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full max-w-sm">
              <span className="sr-only">Look up a project</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
              <input type="search" className="field pl-8" placeholder="Look up by code, name, client, place or site manager" value={f.q} onChange={(e) => set({ q: e.target.value })} />
            </label>
            {on > 0 && (
              <Button variant="ghost" onClick={() => set(NO_FILTER)}>
                Clear {plural(on, "filter")}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Filters">
            <div className="max-w-full min-w-0 [&>[role=tablist]]:flex-wrap">
              <Segmented
                label="Status"
                value={f.status}
                onChange={(status) => set({ status })}
                options={[
                  { value: "all", label: "All", count: count("all") },
                  { value: "live", label: "Live", count: count("live") },
                  { value: "not-started", label: "Not started", count: count("not-started") },
                  { value: "finished", label: "Finished", count: count("finished") },
                ]}
              />
            </div>
            <label className="flex items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Handover</span>
              <select className="field w-auto" value={f.handover} onChange={(e) => set({ handover: e.target.value as HandoverFilter })}>
                <option value="any">Any</option>
                <option value="sent">Handover sent</option>
                <option value="not-sent">Not sent yet</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Site manager</span>
              <select className="field w-auto" value={f.siteManagerId} onChange={(e) => set({ siteManagerId: e.target.value })}>
                <option value="">Anyone</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[0.93rem]">
              <input type="checkbox" checked={f.onHold} onChange={(e) => set({ onHold: e.target.checked })} /> Final account on hold
              <span className="text-muted">({held})</span>
            </label>
          </div>
        </div>
      </PageHead>
      <PageBody>
        <p className="mb-2 text-[0.93rem] text-muted" role="status">
          {rows.length === mine.length ? `Showing all ${mine.length}.` : `Showing ${rows.length} of ${mine.length}.`}
        </p>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No projects match">Change a filter, or clear the search.</Empty>
          ) : (
            <table className="tbl" aria-label="All projects">
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
                  {anyFinished && <th>Handover</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const drafted = db.approvals.some((a) => a.kind === "handover" && a.projectId === p.id && a.status === "Pending");
                  return (
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
                      <td>{person(db, p.siteManagerId) || "-"}</td>
                      <td className="whitespace-nowrap">
                        {dShort(p.startDate)} to {dShort(p.endDate)}
                        {p.status === "Live" && p.endDate < day && <span className="block text-[0.87rem] text-bad">Past its finish date</span>}
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
                      {anyFinished && (
                        <td onClick={(e) => e.stopPropagation()}>
                          {!isFinished(p.status) ? (
                            <span className="text-muted">-</span>
                          ) : p.handoverSentAt ? (
                            <span className="text-ok">Sent {whenInline(p.handoverSentAt, day)}</span>
                          ) : p.invoiceHold ? (
                            <Badge tone="warn">Waits on {[p.extrasFlag && "variations", p.snaggingFlag && "snagging"].filter(Boolean).join(" and ") || "the hold"}</Badge>
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
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && (
        <AddProjectDialog
          onClose={(code) => {
            setAdding(false);
            if (code) navigate(`/projects/${code}`);
          }}
        />
      )}
    </>
  );
}
