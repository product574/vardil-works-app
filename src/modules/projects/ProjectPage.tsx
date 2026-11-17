import { DownloadSimple, FilmStrip, Image as ImageIcon } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addPhoto, addRequest, addScopeTask, clearHold, completeProject, notifyHireReturn, raiseExtra, setSnagging, toggleScopeTask } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Db, LANGUAGE_NAME, type PhotoStage, type Project, type RequestKind } from "@/data/types";
import { holdWhy } from "@/lib/billing";
import { addDays } from "@/lib/dates";
import { capital, dFull, dShort, plural, when, whenInline } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { hireEstimate } from "@/lib/job-costs";
import { CATEGORIES } from "@/lib/job-costs";
import { money0, money2, pct1 } from "@/lib/money";
import { labourCost, scopePercent, supplierCostByCategory } from "@/lib/project-costs";
import { mayHandleCrewRequest, withSite } from "@/lib/requests";
import { dueLabel, dueState, nextServiceDate } from "@/lib/status";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, PageBody, PageHead, Panel, Section, Segmented, Switch } from "@/ui";
import { PickFile } from "@/ui/files";
import { CrewRequestButtons } from "./CrewRequestButtons";
import { HoldBadge, Progress, ProjectBadge, Tabs } from "@/ui/status";
import { toast } from "@/ui/toast";
import { FilesTab } from "./ProjectFiles";

type Tab = "overview" | "scope" | "photos" | "files" | "plant" | "requests" | "extras" | "costs" | "history";
export const REQUEST_LABEL: Record<RequestKind, string> = { personnel: "Personnel", own_plant: "Own plant", hired_plant: "Hired plant", other: "Something else" };

export function ProjectPage() {
  const { code } = useParams();
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const p = db.projects.find((x) => x.code === code);

  if (!p || access.scope([p]).length === 0)
    return (
      <PageBody>
        <Empty title={p ? `${p.code} is run by another site manager` : `There is no project ${code}`}>
          <Link to="/projects" className="text-accent-ink underline">
            Back to all projects
          </Link>
        </Empty>
      </PageBody>
    );

  const client = db.clients.find((c) => c.id === p.clientId);
  const tasks = db.scopeTasks.filter((t) => t.projectId === p.id);
  const pct = scopePercent(tasks);
  const openExtras = db.variations.filter((v) => v.projectId === p.id && v.status === "Draft").length;
  const openRequests = db.requests.filter((r) => r.projectId === p.id && r.status === "Open").length;
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "scope", label: "Scope" },
    { value: "photos", label: "Photos" },
    { value: "files", label: "Files", count: db.files.filter((f) => f.projectId === p.id).length },
    { value: "plant", label: "Plant" },
    { value: "requests", label: "Requests", count: openRequests },
    { value: "extras", label: "Extras", count: openExtras },
    ...(access.seeMargins ? [{ value: "costs" as Tab, label: "Costs" }] : []),
    { value: "history", label: "History" },
  ];
  const tab = tabs.find((t) => t.value === params.get("tab"))?.value ?? "overview";

  return (
    <>
      <PageHead
        title={`${p.code} ${p.name}`}
        note={
          <>
            <Link to="/projects" className="text-accent-ink underline-offset-2 hover:underline">
              All projects
            </Link>
            {" / "}
            {client?.name}. {p.location}, {co(p.county)}. {p.heritage}.
          </>
        }
        actions={
          <>
            <HoldBadge p={p} />
            <ProjectBadge status={p.status} />
          </>
        }
      >
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-1 text-[0.93rem]">
          {access.seeValues && <Stat label="Contract value" value={p.value != null ? money0(p.value, region) : "Not priced"} />}
          <Stat label="Scope done" value={<Progress pct={pct} />} />
          <Stat label="On site" value={`${dShort(p.startDate)} to ${dFull(p.endDate)}`} />
          <Stat label="Site manager" value={db.people.find((x) => x.id === p.siteManagerId)?.name ?? "-"} />
        </dl>
        <Tabs label="Project sections" value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} tabs={tabs} />
      </PageHead>
      <PageBody className="max-w-6xl">
        {tab === "overview" && <OverviewTab p={p} db={db} />}
        {tab === "scope" && <ScopeTab p={p} db={db} />}
        {tab === "photos" && <PhotosTab p={p} db={db} />}
        {tab === "files" && <FilesTab p={p} db={db} />}
        {tab === "plant" && <PlantTab p={p} db={db} />}
        {tab === "requests" && <RequestsTab p={p} db={db} />}
        {tab === "extras" && <ExtrasTab p={p} db={db} />}
        {tab === "costs" && access.seeMargins && <CostsTab p={p} db={db} pct={pct} />}
        {tab === "history" && <HistoryTab p={p} />}
      </PageBody>
    </>
  );
}

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-baseline gap-2">
    <dt className="text-muted">{label}</dt>
    <dd className="font-medium">{value}</dd>
  </div>
);

type TabProps = { p: Project; db: Db };

function OverviewTab({ p, db }: TabProps) {
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { seeValues, can } = useAccess();
  const client = db.clients.find((c) => c.id === p.clientId);
  const quote = db.quotes.find((q) => q.id === p.quoteId);
  const roster = db.assignments.filter((a) => a.projectId === p.id).map((a) => db.people.find((x) => x.id === a.personId)!);
  const today = db.attendance.filter((a) => a.projectId === p.id && a.date === day);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="grid content-start gap-6">
        <Section title="The works">
          <p className="max-w-[70ch]">{p.description}</p>
        </Section>
        {p.siteInstructions && (
          <Section title="Site instructions">
            <p className="max-w-[70ch] rounded-md border-l-4 border-accent bg-surface px-3 py-2">{p.siteInstructions}</p>
            <p className="mt-1 text-[0.93rem] text-muted">Shown to every operative on their phone, in their own language.</p>
          </Section>
        )}
        {roster.length > 0 && (
          <Section title={`Crew (${roster.length})`} aside={can("people") ? <Link to={`/people/timesheet?site=${p.id}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">Open timesheet</Link> : undefined}>
            <Panel>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Trade</th>
                    <th>Today</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((person) => {
                    const a = today.find((x) => x.personId === person.id);
                    return (
                      <tr key={person.id}>
                        <td className="font-medium">{person.name}</td>
                        <td>{person.trade}</td>
                        <td>{a ? <Badge tone="ok">{a.status === "half" ? "Half day" : a.overtimeHours > 0 ? `Full day + ${a.overtimeHours}h` : "Full day"}</Badge> : <span className="text-muted">Not marked</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}
      </div>
      <Section title="Key facts">
        <Panel>
          <dl className="px-3 py-1">
            <Fact label="Client">
              {client?.name}
              <span className="block text-[0.93rem] text-muted">
                {client?.contactName}, {client?.contactPhone}
              </span>
            </Fact>
            <Fact label="Location">
              {p.location}, {co(p.county)}
            </Fact>
            <Fact label="Heritage status">{p.heritage}</Fact>
            <Fact label="Contracts manager">{db.people.find((x) => x.id === p.contractsManagerId)?.name}</Fact>
            <Fact label="Site manager">{db.people.find((x) => x.id === p.siteManagerId)?.name}</Fact>
            <Fact label="Start">{dFull(p.startDate)}</Fact>
            <Fact label="Finish">{dFull(p.endDate)}</Fact>
            <Fact label="Priced by">{quote && can("sales") ? <Link to={`/sales/quotes/${quote.ref}`} className="text-accent-ink underline-offset-2 hover:underline">Quote {quote.ref}</Link> : quote ? `Quote ${quote.ref}` : p.pricedBy}</Fact>
            {seeValues && <Fact label="Contract value">{p.value != null ? money2(p.value, region) : "Not priced"}</Fact>}
            {quote?.poNumber && <Fact label="Purchase order">{quote.poNumber}</Fact>}
            {p.handoverSentAt && <Fact label="Handover sent">{when(p.handoverSentAt, day)}</Fact>}
          </dl>
        </Panel>
      </Section>
    </div>
  );
}

function ScopeTab({ p, db }: TabProps) {
  const day = useDay();
  const [text, setText] = useState("");
  const groups = db.scopeGroups.filter((g) => g.projectId === p.id);
  const tasks = db.scopeTasks.filter((t) => t.projectId === p.id);
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addScopeTask(p.id, text);
    setText("");
    toast("Scope item added");
  };
  return (
    <div className="grid max-w-3xl gap-5">
      {allDone && p.status === "Live" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-ok-soft px-3 py-2.5 text-ok">
          <p className="flex-1">Every scope item is ticked off. Completing the project raises its final account and drafts the handover email.</p>
          <Button
            variant="primary"
            onClick={() => {
              completeProject(p.id);
              toast(`${p.code} marked complete`);
            }}
          >
            Mark project complete
          </Button>
        </div>
      )}
      {groups.map((g) => {
        const list = tasks.filter((t) => t.groupId === g.id);
        return (
          <Section key={g.id} title={g.label} aside={`${list.filter((t) => t.done).length} of ${list.length} done`}>
            <Panel>
              <ul className="divide-y divide-line">
                {list.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 hover:bg-accent-soft">
                      <input type="checkbox" className="mt-1 size-4 accent-[var(--accent-strong)]" checked={t.done} disabled={p.status !== "Live"} onChange={() => toggleScopeTask(t.id)} />
                      <span className={cx("flex-1", t.done && "text-muted")}>{t.description}</span>
                      {t.done && t.completedAt && (
                        <span className="shrink-0 text-[0.87rem] text-muted">
                          {t.completedBy}, {when(t.completedAt, day)}
                        </span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        );
      })}
      {p.status === "Live" && (
        <form onSubmit={submit} className="flex gap-2">
          <input aria-label="New scope item" className="field" placeholder="Add a scope item, for example: Repoint chimney stack" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit">Add item</Button>
        </form>
      )}
      {p.status === "Not started" && <p className="text-muted">Scope can be ticked off once the project is live.</p>}
    </div>
  );
}

function PhotosTab({ p, db }: TabProps) {
  const [stage, setStage] = useState<"All" | PhotoStage>("All");
  const [adding, setAdding] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const all = db.files.filter((f) => f.projectId === p.id && f.category === "Photos and videos").sort((a, b) => b.modified.localeCompare(a.modified));
  const shown = all.filter((f) => stage === "All" || f.stage === stage);
  const n = (s: PhotoStage) => all.filter((f) => f.stage === s).length;
  const view = all.find((f) => f.id === viewId && f.dataUrl);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Photo stage" value={stage} onChange={setStage} options={[{ value: "All", label: "All", count: all.length }, { value: "Before", label: "Before", count: n("Before") }, { value: "During", label: "During", count: n("During") }, { value: "After", label: "After", count: n("After") }]} />
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          Add a photo
        </Button>
      </div>
      {shown.length === 0 ? (
        <Panel>
          <Empty title="No photos at this stage yet">Photos taken on the site phone land here on their own, dated and tagged.</Empty>
        </Panel>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {shown.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-md border border-line bg-surface">
              {f.dataUrl ? (
                <button type="button" className="press block aspect-[4/3] w-full" aria-label={`Open photo: ${f.caption}`} onClick={() => setViewId(f.id)}>
                  <img src={f.dataUrl} alt={f.caption ?? ""} className="size-full object-cover" />
                </button>
              ) : (
                <div className="grid aspect-[4/3] place-items-center text-accent-ink" style={{ background: `color-mix(in srgb, var(--accent) ${14 + f.tone * 7}%, var(--side))` }}>
                  {f.kind === "video" ? <FilmStrip size={28} /> : <ImageIcon size={28} />}
                </div>
              )}
              <div className="px-2.5 py-2">
                <p className="line-clamp-2 text-[0.93rem] font-medium">{f.caption}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[0.87rem] text-muted">
                  {dShort(f.modified)}
                  <Badge className="ml-auto">{f.stage}</Badge>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[0.93rem] text-muted">The sample photos have no real image behind them, so they show as tiles. Photos you add are real: click one to open or download it.</p>
      {adding && <AddPhotoDialog projectId={p.id} onClose={() => setAdding(false)} />}
      <Dialog
        open={!!view}
        onClose={() => setViewId(null)}
        title={view?.caption ?? ""}
        wide
        footer={
          view?.dataUrl && (
            <a href={view.dataUrl} download={view.name} className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium hover:bg-accent-soft">
              <DownloadSimple size={16} /> Download
            </a>
          )
        }
      >
        {view?.dataUrl && (
          <>
            <img src={view.dataUrl} alt={view.caption ?? ""} className="mx-auto max-h-[58dvh] rounded-md border border-line" />
            <p className="mt-3 text-[0.93rem] text-muted">
              {view.stage}. Added by {view.addedBy} on {dShort(view.modified)}. {view.sizeKb} KB.
            </p>
          </>
        )}
      </Dialog>
    </div>
  );
}

/** Take a photo with the camera or choose one from the device, then caption it and say what stage it shows. */
function AddPhotoDialog({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [caption, setCaption] = useState("");
  const [stage, setStage] = useState<PhotoStage>("During");
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const pick = (f: File) => {
    setError("");
    shrinkImage(f)
      .then((pic) => {
        setPicture(pic);
        setFileName(f.name);
        // A camera roll name such as IMG_2041 is no use as a caption, so only offer real words.
        const words = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
        if (!caption.trim() && /[a-z]{3,}\s+[a-z]{2,}/i.test(words)) setCaption(words);
      })
      .catch((e: Error) => {
        setPicture(null);
        setError(e.message);
      });
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a photo"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!picture || !caption.trim()}
            onClick={() => {
              if (!picture) return;
              addPhoto(projectId, caption, stage, picture);
              toast("Photo added");
              onClose();
            }}
          >
            Add photo
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Photo</p>
          <PickFile accept="image/*" onFile={pick} chosen={fileName} />
          <p className="mt-1 text-[0.87rem] text-muted">On a phone or tablet, Take a photo opens the camera. On a computer, pick any picture from your files or downloads.</p>
          <p role="alert" className="text-bad">
            {error}
          </p>
          {picture && <img src={picture.dataUrl} alt="The photo about to be added" className="mt-1 max-h-48 rounded-md border border-line" />}
        </div>
        <Field label="Caption" hint="The file is named after the caption, as on the site phone.">
          {(id) => <input id={id} className="field" value={caption} placeholder="South gable, cracked lintel" onChange={(e) => setCaption(e.target.value)} />}
        </Field>
        <Field label="Stage">
          {(id) => (
            <select id={id} className="field" value={stage} onChange={(e) => setStage(e.target.value as PhotoStage)}>
              <option>Before</option>
              <option>During</option>
              <option>After</option>
            </select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function PlantTab({ p, db }: TabProps) {
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { seeValues } = useAccess();
  const own = db.plant.filter((x) => x.projectId === p.id);
  const hired = db.hiredPlant.filter((x) => x.projectId === p.id);
  return (
    <div className="grid gap-6">
      <Section title={`Own plant on this site (${own.length})`}>
        <Panel className="overflow-x-auto">
          {own.length === 0 ? (
            <Empty title="None of the firm's plant is here">Request it from the Requests tab and the yard will send it out.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Item</th>
                  <th>Spec</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {own.map((x) => {
                  const dates = [...x.renewals.map((r) => ({ what: r.kind, date: r.expires })), { what: "Service", date: nextServiceDate(x.service, day).date }].sort((a, b) => a.date.localeCompare(b.date));
                  const next = dates[0]!;
                  const state = dueState(next.date, day);
                  return (
                    <tr key={x.id}>
                      <td className="font-medium">{x.assetRef}</td>
                      <td>{x.name}</td>
                      <td className="text-muted">{x.spec}</td>
                      <td>
                        <Badge tone={state === "overdue" ? "bad" : state === "soon" ? "warn" : "neutral"}>
                          {next.what}: {dueLabel(next.date, day).toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </Section>
      <Section title={`Hired plant (${hired.length})`}>
        <Panel className="overflow-x-auto">
          {hired.length === 0 ? (
            <Empty title="Nothing on hire for this site" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Hire company</th>
                  <th>Ref</th>
                  <th>On hire from</th>
                  {seeValues && <th className="num">Hire to date</th>}
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {hired.map((h) => {
                  const est = hireEstimate(h.rate * h.quantity, h.rateUnit, h.onHireFrom, h.collectedAt?.slice(0, 10) ?? null, day);
                  return (
                    <tr key={h.id}>
                      <td>
                        <span className="font-medium">{h.description}</span>
                        {h.quantity > 1 && <span className="text-muted"> x {h.quantity}</span>}
                        {h.notes && <span className="block text-[0.87rem] text-muted">{h.notes}</span>}
                      </td>
                      <td>
                        {h.hireCompany}
                        <span className="block text-[0.87rem] text-muted">{h.hirePhone}</span>
                      </td>
                      <td>{h.hireRef}</td>
                      <td className="whitespace-nowrap">{dShort(h.onHireFrom)}</td>
                      {seeValues && <td className="num">{est ? money0(est.total, region) : "-"}</td>}
                      <td>
                        <Badge tone={h.status === "On hire" ? "neutral" : h.status === "Return notified" ? "warn" : "ok"}>{h.status}</Badge>
                      </td>
                      <td className="text-right">
                        {h.status === "On hire" && (
                          <Button
                            size="sm"
                            onClick={() => {
                              notifyHireReturn(h.id);
                              toast("Return notified. It now shows for collection under Plant");
                            }}
                          >
                            Notify return
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
        {seeValues && hired.length > 0 && <p className="mt-2 text-[0.93rem] text-muted">Hire to date is an estimate from the rate and days on hire. Actual cost comes from the hire company's invoices.</p>}
      </Section>
    </div>
  );
}

function RequestsTab({ p, db }: TabProps) {
  const day = useDay();
  const access = useAccess();
  const canHandle = mayHandleCrewRequest(p, access.personId, access.siteAccess);
  const [kind, setKind] = useState<RequestKind>("personnel");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [from, setFrom] = useState(addDays(day, 1));
  const [to, setTo] = useState(addDays(day, 5));
  const [error, setError] = useState("");
  const list = db.requests.filter((r) => r.projectId === p.id);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return setError("Say what is needed.");
    if (to < from) return setError("The end date is before the start date.");
    addRequest({ projectId: p.id, kind, description: description.trim(), quantity: Math.max(1, Number(quantity) || 1), neededFrom: from, neededTo: to, notes: "" });
    setDescription("");
    setError("");
    toast("Request sent to the office");
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {p.status !== "Live" && p.status !== "Not started" ? (
        <p className="text-muted">This project is finished, so no new requests can be made.</p>
      ) : (
        <Section title="Ask the office for something">
          <form onSubmit={submit} className="grid gap-3 rounded-lg border border-line bg-surface p-3">
            <Field label="What kind">
              {(id) => (
                <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
                  <option value="personnel">People</option>
                  <option value="own_plant">Our own plant</option>
                  <option value="hired_plant">Hired plant</option>
                </select>
              )}
            </Field>
            <Field label="What is needed">{(id) => <input id={id} className="field" value={description} placeholder="Two general operatives for scaffold adaptation" onChange={(e) => { setDescription(e.target.value); setError(""); }} />}</Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="How many">{(id) => <input id={id} className="field" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />}</Field>
              <Field label="From">{(id) => <input id={id} type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
              <Field label="Until">{(id) => <input id={id} type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
            </div>
            <p role="alert" className="min-h-5 text-bad">
              {error}
            </p>
            <Button type="submit" variant="primary" className="justify-self-start">
              Send request
            </Button>
          </form>
        </Section>
      )}
      <Section title={`Requests from this site (${list.length})`}>
        <Panel>
          {list.length === 0 ? (
            <Empty title="No requests yet" />
          ) : (
            <ul className="divide-y divide-line">
              {list.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-3 py-2.5">
                  <Badge className="mt-0.5 w-24 justify-center">{REQUEST_LABEL[r.kind]}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.description}
                      {r.quantity > 1 && <span className="font-normal text-muted"> x {r.quantity}</span>}
                    </p>
                    <p className="text-[0.93rem] text-muted">
                      {r.neededFrom === r.neededTo ? dShort(r.neededFrom) : `${dShort(r.neededFrom)} to ${dShort(r.neededTo)}`}. Asked by {r.requestedBy}, {whenInline(r.forwardedAt ?? r.createdAt, day)}.{r.raisedBy && ` First asked by ${r.raisedBy}.`}
                      {r.notes && ` ${r.notes}.`}
                    </p>
                    {withSite(r) && canHandle && (
                      <div className="mt-2">
                        <CrewRequestButtons id={r.id} what={r.description} />
                      </div>
                    )}
                  </div>
                  <Badge tone={withSite(r) ? "warn" : r.status === "Open" ? "accent" : "ok"}>{withSite(r) ? "With the site manager" : r.status === "Open" ? "With the office" : r.heldBy === "site" ? "Dealt with on site" : "Dealt with"}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Section>
    </div>
  );
}

function ExtrasTab({ p, db }: TabProps) {
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { seeValues, may } = useAccess();
  const manager = may("manageProjects");
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [measured, setMeasured] = useState("");
  const [value, setValue] = useState("");
  const list = db.variations.filter((v) => v.projectId === p.id);
  return (
    <div className="grid gap-5">
      {p.invoiceHold && (
        <div className="flex flex-wrap items-center gap-3 rounded-md bg-warn-soft px-3 py-2.5 text-warn">
          <p className="flex-1">
            {p.status === "Live"
              ? `${capital(holdWhy(p))}, so the final account will be held when the work is complete. Stage payments are not held.`
              : `The final account is held: ${holdWhy(p)}. It is not invoiced until the hold is cleared.`}
          </p>
          {manager && (
            <Button
              onClick={() => {
                clearHold(p.id);
                toast("Hold cleared and written to the project history");
              }}
            >
              Clear the hold
            </Button>
          )}
        </div>
      )}
      <Section
        title={`Extras and variations (${list.length})`}
        aside={
          p.status === "Live" || p.status === "Complete" ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              Raise an extra
            </Button>
          ) : undefined
        }
      >
        <Panel>
          {list.length === 0 ? (
            <Empty title="No extras raised">Work found on opening up is raised here or from the site phone. It is drafted as a variation and waits for approval.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {list.map((v) => {
                const by = db.people.find((x) => x.id === v.raisedById);
                return (
                  <li key={v.id} className="grid gap-1 px-3 py-2.5">
                    <div className="flex flex-wrap items-baseline gap-3">
                      <p className="font-medium">{v.measured}</p>
                      {seeValues && <span className="ml-auto font-medium">{money2(v.estimatedValue, region)}</span>}
                      <Badge tone={v.status === "Approved" ? "ok" : v.status === "Rejected" ? "bad" : "accent"}>{v.status === "Draft" ? "Awaiting approval" : v.status}</Badge>
                    </div>
                    <p>{v.description}</p>
                    {v.original && v.originalLanguage && (
                      <p lang={v.originalLanguage} className="rounded bg-side px-2 py-1 text-[0.93rem] text-muted">
                        As written in {LANGUAGE_NAME[v.originalLanguage]}: {v.original}
                      </p>
                    )}
                    <p className="text-[0.93rem] text-muted">
                      Raised by {by?.name}, {whenInline(v.raisedAt, day)}.{v.approvedBy && ` Approved by ${v.approvedBy}.`}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </Section>
      {manager && (p.status === "Live" || p.status === "Complete") && (
        <label className="flex items-center gap-3">
          <Switch on={p.snaggingFlag} label="Snagging open" onChange={() => { setSnagging(p.id, !p.snaggingFlag); toast(p.snaggingFlag ? "Snagging closed" : p.status === "Live" ? "Snagging opened" : "Snagging opened. Final account held"); }} />
          <span>
            Snagging open
            <span className="block text-[0.93rem] text-muted">{p.status === "Live" ? "While this is on, the final account will be held when the work is complete." : "While this is on, the final account is held."}</span>
          </span>
        </label>
      )}
      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        title="Raise an extra"
        footer={
          <>
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!description.trim() || !measured.trim()}
              onClick={() => {
                raiseExtra(p.id, { description: description.trim(), measured: measured.trim(), estimatedValue: Number(value.replace(/[^\d.]/g, "")) || 0 });
                setAdding(false);
                setDescription("");
                setMeasured("");
                setValue("");
                toast(p.status === "Live" ? "Variation drafted for approval" : "Variation drafted for approval. Final account held");
              }}
            >
              Raise extra
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="What was found">{(id) => <textarea id={id} rows={3} className="field" value={description} placeholder="Lintel over the rear door is rotten through and needs replacing" onChange={(e) => setDescription(e.target.value)} />}</Field>
          <Field label="Measured extra">{(id) => <input id={id} className="field" value={measured} placeholder="1 no. oak lintel, 1.2 m long" onChange={(e) => setMeasured(e.target.value)} />}</Field>
          {seeValues && <Field label="Estimated value, ex VAT" hint="Leave blank if the office is to price it.">{(id) => <input id={id} className="field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>}
        </div>
      </Dialog>
    </div>
  );
}

function CostsTab({ p, db, pct }: TabProps & { pct: number }) {
  const region = usePrefs((s) => s.brand.region);
  const rate = new Map(db.people.map((x) => [x.id, x.hourlyRate]));
  const att = db.attendance.filter((a) => a.projectId === p.id);
  const labour = labourCost(att.map((a) => ({ status: a.status, overtimeHours: a.overtimeHours, hourlyRate: rate.get(a.personId) ?? 0 })));
  const supplier = supplierCostByCategory(db.supplierInvoices.filter((s) => s.readStatus === "confirmed").flatMap((s) => s.allocations.filter((a) => a.projectId === p.id).map((a) => ({ category: a.category, amount: a.amount, credit: s.docType === "credit_note" }))));
  const supplierTotal = Object.values(supplier).reduce((s, n) => s + n, 0);
  const cost = labour + supplierTotal;
  const earned = ((p.value ?? 0) * pct) / 100;
  const invoiced = db.salesInvoices.filter((i) => i.projectId === p.id && (i.status === "Invoiced" || i.status === "Paid")).reduce((s, i) => s + i.net, 0);
  const margin = earned > 0 ? ((earned - cost) / earned) * 100 : null;
  const unconfirmed = db.supplierInvoices.filter((s) => s.readStatus !== "confirmed" && s.jobRef === p.code).length;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Cost to date">
        <Panel>
          <table className="tbl">
            <tbody>
              <tr>
                <td>
                  Labour
                  <span className="block text-[0.87rem] text-muted">{plural(att.length, "attendance entry", "attendance entries")} at each person's hourly rate, overtime at time and a half</span>
                </td>
                <td className="num">{money2(labour, region)}</td>
              </tr>
              {CATEGORIES.filter(([k]) => supplier[k]).map(([k, label]) => (
                <tr key={k}>
                  <td>
                    {label}
                    <span className="block text-[0.87rem] text-muted">Confirmed supplier invoices</span>
                  </td>
                  <td className="num">{money2(supplier[k]!, region)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="border-t border-line-strong font-medium">Total cost to date</td>
                <td className="num border-t border-line-strong text-[1.08rem] font-medium">{money2(cost, region)}</td>
              </tr>
            </tfoot>
          </table>
        </Panel>
        {unconfirmed > 0 && <p className="mt-2 text-[0.93rem] text-warn">{plural(unconfirmed, "supplier invoice")} for this project {unconfirmed === 1 ? "is" : "are"} waiting to be checked and {unconfirmed === 1 ? "is" : "are"} not counted yet.</p>}
      </Section>
      <Section title="Against the contract">
        <Panel>
          <dl className="px-3 py-1">
            <Fact label="Contract value">{p.value != null ? money2(p.value, region) : "Not priced"}</Fact>
            <Fact label="Scope done">{pct}%</Fact>
            <Fact label="Value earned">{money2(earned, region)}</Fact>
            <Fact label="Cost to date">{money2(cost, region)}</Fact>
            <Fact label="Margin to date">
              <span className={cx("font-medium", margin != null && margin < 0 && "text-bad", margin != null && margin >= 0 && margin < 12 && "text-warn")}>{margin == null ? "-" : pct1(margin)}</span>
            </Fact>
            <Fact label="Invoiced so far">{money2(invoiced, region)}</Fact>
          </dl>
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">Value earned is the contract value multiplied by the share of scope ticked off.</p>
      </Section>
    </div>
  );
}

function HistoryTab({ p }: { p: Project }) {
  const day = useDay();
  return (
    <Panel className="max-w-3xl">
      <ol className="divide-y divide-line">
        {[...p.audit].reverse().map((a, i) => (
          <li key={i} className="flex flex-wrap gap-x-4 px-3 py-2">
            <span className="w-36 shrink-0 text-muted">{when(a.at, day)}</span>
            <span className="flex-1">{a.what}</span>
            <span className="text-muted">{a.who}</span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
