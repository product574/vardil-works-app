import { withOffice } from "@/lib/requests";
import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addPlant, collectHire, movePlant, notifyHireReturn, recordPlantService, setPlantRepair } from "@/data/actions";
import { plantBlocks } from "@/lib/compliance";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Db, HiredPlant, PlantItem, Project } from "@/data/types";
import { addDays, weekStartOf } from "@/lib/dates";
import { dFull, dShort, plural } from "@/lib/format";
import { hireEstimate } from "@/lib/job-costs";
import { money0, money2 } from "@/lib/money";
import { type DueState, dueLabel, dueState, nextServiceDate } from "@/lib/status";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, PageBody, PageHead, Panel, Section, Segmented, Tel, type Tone } from "@/ui";
import { ProofLink } from "@/ui/files";
import { toast } from "@/ui/toast";

export const DUE_TONE: Record<DueState, Tone> = { overdue: "bad", soon: "warn", ok: "neutral" };

/** The next thing due on a piece of plant: a certificate or its service, whichever comes first. */
export function nextDue(x: PlantItem, day: string) {
  const dates = [...x.renewals.map((r) => ({ what: r.kind, date: r.expires })), { what: "Service", date: nextServiceDate(x.service, day).date }];
  return dates.sort((a, b) => a.date.localeCompare(b.date))[0]!;
}
const DueBadge = ({ x, day }: { x: PlantItem; day: string }) => {
  const n = nextDue(x, day);
  return (
    <Badge tone={DUE_TONE[dueState(n.date, day)]}>
      {n.what}: {dueLabel(n.date, day).toLowerCase()}
    </Badge>
  );
};
const where = (db: Db, x: PlantItem) => (x.projectId ? (db.projects.find((p) => p.id === x.projectId)?.code ?? "-") : "Yard");
const hireCost = (h: HiredPlant, day: string) => (hireEstimate(h.rate, h.rateUnit, h.onHireFrom, h.collectedAt?.slice(0, 10), day)?.total ?? 0) * h.quantity;

function usePlant() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const [params, setParams] = useSearchParams();
  const open = db.plant.find((p) => p.id === params.get("item"));
  return { db, day, access, region, canEdit: access.may("managePlant"), open, show: (id: string) => setParams({ item: id }), close: () => setParams({}) };
}

/** Plant home: what is where today. A block per site, then the yard, then anything away for repair. */
export function PlantOverview() {
  const { db, day, access, canEdit, open, show, close } = usePlant();
  const [only, setOnly] = useState<"all" | "attention">("all");
  const sites = access.scope(db.projects).filter((p) => p.status === "Live");
  const hired = db.hiredPlant.filter((h) => h.status !== "Collected");
  const flagged = (x: PlantItem) => dueState(nextDue(x, day).date, day) !== "ok" || x.status === "Off for repair";
  const own = (list: PlantItem[]) => list.filter((x) => only === "all" || flagged(x));
  const hire = (list: HiredPlant[]) => list.filter((h) => only === "all" || h.status === "Return notified");
  const overdue = db.plant.filter((x) => dueState(nextDue(x, day).date, day) === "overdue").length;
  const soon = db.plant.filter((x) => dueState(nextDue(x, day).date, day) === "soon").length;
  const waiting = hired.filter((h) => h.status === "Return notified").length;
  const asked = db.requests.filter((r) => withOffice(r) && (r.kind === "own_plant" || r.kind === "hired_plant") && sites.some((s) => s.id === r.projectId));
  const yard = db.plant.filter((x) => !x.projectId && x.status !== "Off for repair");
  const repair = db.plant.filter((x) => x.status === "Off for repair");

  const rows = (ownList: PlantItem[], hireList: HiredPlant[]) => (
    <Panel className="overflow-x-auto">
      <table className="tbl table-fixed">
        <thead>
          <tr>
            <th className="w-16">Ref</th>
            <th>Item</th>
            <th className="w-48">Whose</th>
            <th className="w-64">Next due</th>
            <th className="w-36" />
          </tr>
        </thead>
        <tbody>
          {ownList.map((x) => (
            <tr key={x.id} className="rowlink" onClick={() => show(x.id)}>
              <td className="font-medium">{x.assetRef}</td>
              <td>
                {x.name}
                <span className="block text-[0.87rem] text-muted">{x.spec}</span>
              </td>
              <td>Own</td>
              <td>{x.status === "Off for repair" ? <Badge tone="bad">Off for repair</Badge> : <DueBadge x={x} day={day} />}</td>
              <td />
            </tr>
          ))}
          {hireList.map((h) => (
            <tr key={h.id}>
              <td className="text-muted">Hire</td>
              <td>
                {h.description}
                {h.quantity > 1 && <span className="text-muted"> x {h.quantity}</span>}
                <span className="block text-[0.87rem] text-muted">On hire since {dShort(h.onHireFrom)}, ref {h.hireRef}</span>
              </td>
              <td>
                {h.hireCompany}
                <span className="block text-[0.87rem]">
                  <Tel number={h.hirePhone} />
                </span>
              </td>
              <td>{h.status === "Return notified" ? <Badge tone="warn">Return notified, awaiting collection</Badge> : <span className="text-muted">On hire</span>}</td>
              <td className="text-right">{canEdit && <HireAction h={h} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );

  return (
    <>
      <PageHead
        title="Plant overview"
        note={`${db.plant.length} items of our own plant and ${hired.length} on hire. ${overdue} overdue, ${soon} due inside 30 days, ${repair.length} off for repair, ${plural(waiting, "hire")} waiting to be collected.`}
        actions={
          <Segmented
            label="Plant shown"
            value={only}
            onChange={setOnly}
            options={[
              { value: "all", label: "Everything" },
              { value: "attention", label: "Needs attention", count: db.plant.filter(flagged).length + waiting },
            ]}
          />
        }
      />
      <PageBody className="grid max-w-6xl gap-6">
        {sites.map((s) => {
          const o = own(db.plant.filter((x) => x.projectId === s.id));
          const h = hire(hired.filter((x) => x.projectId === s.id));
          if (o.length + h.length === 0) return null;
          return (
            <Section
              key={s.id}
              title={
                <Link to={`/projects/${s.code}?tab=plant`} className="underline-offset-2 hover:underline">
                  {s.code} {s.name}
                </Link>
              }
              aside={`${db.people.find((p) => p.id === s.siteManagerId)?.name}, ${co(s.county)}`}
            >
              {rows(o, h)}
            </Section>
          );
        })}
        {own(yard).length > 0 && (
          <Section title="In the yard" aside={`${yard.length} free to send out`}>
            {rows(own(yard), [])}
          </Section>
        )}
        {repair.length > 0 && <Section title="Off for repair">{rows(repair, [])}</Section>}
        {only === "all" && asked.length > 0 && (
          <Section title={`Asked for by sites (${asked.length})`} aside={<Link to="/projects/requests" className="font-medium text-accent-ink underline-offset-2 hover:underline">Open requests</Link>}>
            <Panel>
              <ul className="divide-y divide-line">
                {asked.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 px-3 py-2">
                    <span className="font-medium">{db.projects.find((p) => p.id === r.projectId)?.code}</span>
                    <span className="min-w-0 flex-1">
                      {r.description}
                      {r.quantity > 1 && ` x ${r.quantity}`}
                    </span>
                    <span className="text-muted">
                      {r.kind === "own_plant" ? "Own plant" : "To hire"}, {dShort(r.neededFrom)} to {dShort(r.neededTo)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        )}
      </PageBody>
      {open && <PlantDialog x={open} onClose={close} />}
    </>
  );
}

function HireAction({ h }: { h: HiredPlant }) {
  if (h.status === "On hire")
    return (
      <Button size="sm" onClick={() => { notifyHireReturn(h.id); toast(`${h.hireCompany} told to collect: ${h.description}`); }}>
        Notify return
      </Button>
    );
  if (h.status === "Return notified")
    return (
      <Button size="sm" onClick={() => { collectHire(h.id); toast(`Collected. Hire stopped on ${h.description}`); }}>
        Mark collected
      </Button>
    );
  return null;
}

/** One item of the firm's own plant: where it is, its service clock, its certificates and its history. */
function PlantDialog({ x, onClose }: { x: PlantItem; onClose: () => void }) {
  const { db, day, canEdit } = usePlant();
  const [note, setNote] = useState("");
  const svc = nextServiceDate(x.service, day);
  const sites = db.projects.filter((p) => p.status === "Live");
  // A machine whose examination, test, inspection or insurance has run out cannot go to a site (Compliance, 18 Nov).
  const blocks = plantBlocks(x, day);
  const blockText = blocks.map((r) => r.kind.toLowerCase()).join(" and ");
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`${x.assetRef} ${x.name}`}
        wide
        footer={
          canEdit && (
            <Button
              variant={x.status === "Off for repair" ? "outline" : "danger"}
              onClick={() => {
                setPlantRepair(x.id, x.status !== "Off for repair");
                toast(x.status === "Off for repair" ? `${x.assetRef} back in service` : `${x.assetRef} marked off for repair`);
              }}
            >
              {x.status === "Off for repair" ? "Back from repair" : "Send for repair"}
            </Button>
          )
        }
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="grid content-start gap-4">
            <dl>
              <Fact label="Kind">{x.kind}</Fact>
              <Fact label="Spec">{x.spec}</Fact>
              <Fact label="Finance">{x.finance}</Fact>
              <Fact label="Status">{x.status}</Fact>
              <Fact label="Where">
                {canEdit ? (
                  <select
                    aria-label={`Where ${x.assetRef} is`}
                    className="field h-8"
                    value={x.projectId ?? ""}
                    onChange={(e) => {
                      const ok = movePlant(x.id, e.target.value || null);
                      toast(ok ? `${x.assetRef} moved to ${e.target.value ? db.projects.find((p) => p.id === e.target.value)?.code : "the yard"}` : `${x.assetRef} cannot go to a site until its ${blockText} is renewed`);
                    }}
                  >
                    <option value="">Yard</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id} disabled={blocks.length > 0 && s.id !== x.projectId}>
                        {s.code} {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  where(db, x)
                )}
              </Fact>
            </dl>
            {blocks.length > 0 && (
              <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">
                Its {blockText} ran out on {dFull(blocks[0]!.expires)}. {x.projectId ? "It may not be used on site, and should come back to the yard" : "It cannot go to a site"} until that is renewed in{" "}
                <Link to="/compliance/machinery" className="font-medium underline">
                  Compliance
                </Link>
                .
              </p>
            )}
            <div>
              <h3 className="mb-1 text-base">Service</h3>
              <p>
                Next due {dFull(svc.date)} <Badge tone={DUE_TONE[dueState(svc.date, day)]}>{dueLabel(svc.date, day)}</Badge>
              </p>
              <p className="text-[0.93rem] text-muted">
                {x.service.basis === "hours" ? `${x.service.meterNow.toLocaleString("en-IE")} hrs on the clock, ${svc.remaining}. Serviced every ${x.service.intervalHours} hrs.` : `Serviced ${svc.remaining}.`} Last serviced {dFull(x.service.lastServiced)}.
              </p>
              {canEdit && (
                <div className="mt-2 flex gap-2">
                  <input aria-label="Service note" className="field h-8" placeholder="What was done (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button
                    size="sm"
                    onClick={() => {
                      recordPlantService(x.id, note);
                      setNote("");
                      toast(`Service recorded for ${x.assetRef}`);
                    }}
                  >
                    Record service
                  </Button>
                </div>
              )}
            </div>
          </div>
          <div className="grid content-start gap-4">
            <div>
              <h3 className="mb-1 flex items-baseline gap-2 text-base">
                Checks and certificates
                <Link to="/compliance/machinery" className="text-[0.93rem] font-normal text-accent-ink underline-offset-2 hover:underline">
                  Renew in Compliance
                </Link>
              </h3>
              {x.renewals.length === 0 ? (
                <p className="text-muted">None needed for this item.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {x.renewals.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        {r.kind}
                        <span className="block text-[0.87rem] text-muted">{r.proof ? <ProofLink proof={r.proof} title={`${x.assetRef} ${r.kind}`} /> : (r.doc ?? "No certificate on file")}</span>
                      </span>
                      {r.proofNeeded && <Badge tone="warn">Proof needed</Badge>}
                      <Badge tone={DUE_TONE[dueState(r.expires, day)]}>{dueLabel(r.expires, day)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-1 text-base">Service history</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {x.serviceHistory.map((h) => (
                  <li key={h.id} className="px-2.5 py-1.5">
                    {dFull(h.date)}
                    {h.meter != null && <span className="text-muted">, {h.meter.toLocaleString("en-IE")} hrs</span>}
                    <span className="block text-[0.87rem] text-muted">{h.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Twelve weeks ahead: where each item is booked, what is on hire, and what sites have asked for. */
export function PlantCalendar() {
  const { db, day, access, open, show, close } = usePlant();
  const start = weekStartOf(day);
  const N = 12;
  const weeks = Array.from({ length: N }, (_, i) => addDays(start, i * 7));
  const end = addDays(start, N * 7 - 1);
  const col = (date: string) => Math.max(0, Math.min(N - 1, Math.floor((Date.parse(date) - Date.parse(start)) / (7 * 86_400_000))));
  const sites = new Map(access.scope(db.projects).map((p) => [p.id, p] as [string, Project]));
  type Bar = { from: string; to: string; label: string; tone: "own" | "hire" | "ask" };
  const row = (key: string, label: string, sub: string, bars: Bar[], onClick?: () => void) => (
    <div key={key} className="grid grid-cols-[13rem_minmax(0,1fr)] items-center border-t border-line">
      <div className="px-3 py-1.5">
        {onClick ? (
          <button type="button" className="press text-left font-medium text-accent-ink underline decoration-line-strong underline-offset-2" onClick={onClick}>
            {label}
          </button>
        ) : (
          <span className="font-medium">{label}</span>
        )}
        <span className="block truncate text-[0.87rem] text-muted">{sub}</span>
      </div>
      <div className="grid h-full grid-cols-12 items-center gap-x-1 border-l border-line px-1 py-1">
        {bars.map((b, i) => {
          const a = col(b.from < start ? start : b.from);
          const z = col(b.to > end ? end : b.to);
          if (b.to < start || b.from > end) return null;
          return (
            <span key={i} style={{ gridColumn: `${a + 1} / ${z + 2}`, gridRow: 1 }} title={`${b.label}: ${dShort(b.from)} to ${dShort(b.to)}`} className={cx("truncate rounded px-1.5 py-0.5 text-[0.87rem]", b.tone === "own" && "bg-accent-soft text-accent-ink", b.tone === "hire" && "bg-warn-soft text-warn", b.tone === "ask" && "border border-dashed border-line-strong text-muted")}>
              {b.label}
            </span>
          );
        })}
      </div>
    </div>
  );
  const own = db.plant.filter((x) => x.projectId && sites.has(x.projectId)).sort((a, b) => where(db, a).localeCompare(where(db, b)) || a.assetRef.localeCompare(b.assetRef));
  const free = db.plant.filter((x) => !x.projectId && x.status === "Available");
  const hired = db.hiredPlant.filter((h) => h.status !== "Collected" && sites.has(h.projectId));
  // Plant asked for on a site. A general request has no site to show it against.
  const asked = db.requests.filter((r): r is typeof r & { projectId: string } => withOffice(r) && (r.kind === "own_plant" || r.kind === "hired_plant") && r.projectId !== null && sites.has(r.projectId));
  return (
    <>
      <PageHead title="Plant calendar" note="The next twelve weeks. Own plant is shown on its site until that project is due to finish, hired plant until it is collected, and dashed bars are what sites have asked for." />
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          <div className="min-w-[52rem]">
            <div className="grid grid-cols-[13rem_minmax(0,1fr)] text-[0.87rem] text-muted">
              <div className="px-3 py-2">Item</div>
              <div className="grid grid-cols-12 gap-x-1 border-l border-line px-1 py-2">
                {weeks.map((w) => (
                  <span key={w} className="truncate">{dShort(w)}</span>
                ))}
              </div>
            </div>
            {own.map((x) => row(x.id, `${x.assetRef} ${x.kind}`, x.name, [{ from: start, to: sites.get(x.projectId!)!.endDate, label: where(db, x), tone: "own" }], () => show(x.id)))}
            {hired.map((h) => row(h.id, h.description, `Hire, ${h.hireCompany}`, [{ from: h.onHireFrom, to: h.status === "Return notified" ? addDays(day, 2) : sites.get(h.projectId)!.endDate, label: `${sites.get(h.projectId)!.code} hire${h.status === "Return notified" ? ", going back" : ""}`, tone: "hire" }]))}
            {asked.map((r) => row(r.id, r.description, r.kind === "own_plant" ? "Asked for, own plant" : "Asked for, to hire", [{ from: r.neededFrom, to: r.neededTo, label: `${sites.get(r.projectId)!.code} request`, tone: "ask" }]))}
            {free.map((x) => row(x.id, `${x.assetRef} ${x.kind}`, x.name, [], () => show(x.id)))}
          </div>
        </Panel>
        <p className="mt-2 max-w-6xl text-[0.93rem] text-muted">Rows with no bar are in the yard and free. Click an item's name to move it or see its certificates.</p>
      </PageBody>
      {open && <PlantDialog x={open} onClose={close} />}
    </>
  );
}

/** Every item the firm owns, with its service and certificate position. */
export function PlantRegister() {
  const { db, day, canEdit, open, show, close } = usePlant();
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<"All" | PlantItem["status"]>("All");
  const [kind, setKind] = useState("");
  const kinds = [...new Set(db.plant.map((x) => x.kind))].sort();
  const rows = db.plant.filter((x) => (status === "All" || x.status === status) && (!kind || x.kind === kind)).sort((a, b) => a.assetRef.localeCompare(b.assetRef));
  const n = (s: PlantItem["status"]) => db.plant.filter((x) => x.status === s).length;
  return (
    <>
      <PageHead title="Own plant" note={`${db.plant.length} items. ${n("On site")} on site, ${n("Available")} in the yard, ${n("Off for repair")} off for repair.`} actions={canEdit && <Button variant="primary" onClick={() => setAdding(true)}>Add plant</Button>}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Plant status" value={status} onChange={setStatus} options={[{ value: "All", label: "All" }, { value: "On site", label: "On site", count: n("On site") }, { value: "Available", label: "In the yard", count: n("Available") }, { value: "Off for repair", label: "Off for repair", count: n("Off for repair") }]} />
          <select aria-label="Kind of plant" className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Every kind</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="Nothing matches">Choose All, or another kind.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Item</th>
                  <th>Kind</th>
                  <th>Where</th>
                  <th>Finance</th>
                  <th>Next service</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => {
                  const svc = nextServiceDate(x.service, day);
                  return (
                    <tr key={x.id} className="rowlink" onClick={() => show(x.id)}>
                      <td className="font-medium">{x.assetRef}</td>
                      <td>
                        {x.name}
                        <span className="block text-[0.87rem] text-muted">{x.spec}</span>
                      </td>
                      <td>{x.kind}</td>
                      <td>{x.status === "Off for repair" ? <Badge tone="bad">Off for repair</Badge> : where(db, x)}</td>
                      <td className="text-muted">{x.finance}</td>
                      <td className="whitespace-nowrap">
                        {dShort(svc.date)}
                        <span className="block text-[0.87rem] text-muted">{svc.remaining}</span>
                      </td>
                      <td>
                        <DueBadge x={x} day={day} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {open && <PlantDialog x={open} onClose={close} />}
      {adding && <AddPlantDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddPlantDialog({ onClose }: { onClose: () => void }) {
  const db = useData((x) => x.db);
  const kinds = [...new Set(db.plant.map((x) => x.kind))].sort();
  const [ref, setRef] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState(kinds[0] ?? "");
  const [spec, setSpec] = useState("");
  const [finance, setFinance] = useState("Owned outright");
  const [basis, setBasis] = useState<"hours" | "months">("months");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ref.trim() || !name.trim() || !kind.trim()) return setError("Reference, name and kind are needed.");
    if (db.plant.some((x) => x.assetRef === ref.trim().toUpperCase())) return setError("That reference is already in use.");
    addPlant({ assetRef: ref, name, kind, spec, finance, basis });
    toast(`${ref.trim().toUpperCase()} added. It is in the yard, ready to send out`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add an item of plant">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Reference" hint="The tag on the machine, such as MX5.">{(id) => <input id={id} className="field" value={ref} onChange={(e) => { setRef(e.target.value); setError(""); }} />}</Field>
        <Field label="Name">{(id) => <input id={id} className="field" placeholder="Belle 150 drum mixer" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />}</Field>
        <Field label="Kind">
          {(id) => (
            <>
              <input id={id} className="field" list="plant-kinds" value={kind} onChange={(e) => { setKind(e.target.value); setError(""); }} />
              <datalist id="plant-kinds">
                {kinds.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Spec">{(id) => <input id={id} className="field" placeholder="150 litre, petrol" value={spec} onChange={(e) => setSpec(e.target.value)} />}</Field>
        <Field label="Finance">{(id) => <input id={id} className="field" value={finance} onChange={(e) => setFinance(e.target.value)} />}</Field>
        <Field label="Serviced by">
          {(id) => (
            <select id={id} className="field" value={basis} onChange={(e) => setBasis(e.target.value as "hours" | "months")}>
              <option value="months">The calendar, every 12 months</option>
              <option value="hours">Hours on the clock, every 250</option>
            </select>
          )}
        </Field>
        <p role="alert" className="text-bad sm:col-span-2">
          {error}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Add plant
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Everything on hire: who from, what it is costing, and getting it collected so the hire stops. */
export function HiredPlantList() {
  const { db, day, access, region, canEdit } = usePlant();
  const [show, setShow] = useState<HiredPlant["status"]>("On hire");
  const ids = new Set(access.scope(db.projects).map((p) => p.id));
  const all = db.hiredPlant.filter((h) => ids.has(h.projectId));
  const rows = all.filter((h) => h.status === show).sort((a, b) => a.onHireFrom.localeCompare(b.onHireFrom));
  const n = (s: HiredPlant["status"]) => all.filter((h) => h.status === s).length;
  const weekly = all.filter((h) => h.status !== "Collected").reduce((s, h) => s + (h.rateUnit === "week" ? h.rate : h.rate * 7) * h.quantity, 0);
  return (
    <>
      <PageHead
        title="Hired plant"
        note={`${n("On hire") + n("Return notified")} items on hire${access.seeValues ? `, costing about ${money0(weekly, region)} a week` : ""}. Hire keeps running until the company collects, so a return notified and not collected is still being paid for.`}
        actions={<Segmented label="Hire status" value={show} onChange={setShow} options={[{ value: "On hire", label: "On hire", count: n("On hire") }, { value: "Return notified", label: "Return notified", count: n("Return notified") }, { value: "Collected", label: "Collected", count: n("Collected") }]} />}
      />
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={show === "Return notified" ? "Nothing is waiting to be collected" : "Nothing here"} />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Site</th>
                  <th>Hire company</th>
                  <th>On hire from</th>
                  {access.seeValues && <th className="num">Rate</th>}
                  {access.seeValues && <th className="num">Cost so far</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <span className="font-medium">{h.description}</span>
                      {h.quantity > 1 && <span className="text-muted"> x {h.quantity}</span>}
                      <span className="block text-[0.87rem] text-muted">
                        Ref {h.hireRef}
                        {h.notes ? `. ${h.notes}` : ""}
                      </span>
                    </td>
                    <td>
                      <Link to={`/projects/${db.projects.find((p) => p.id === h.projectId)?.code}?tab=plant`} className="text-accent-ink underline-offset-2 hover:underline">
                        {db.projects.find((p) => p.id === h.projectId)?.code}
                      </Link>
                    </td>
                    <td>
                      {h.hireCompany}
                      <span className="block text-[0.87rem]">
                        <Tel number={h.hirePhone} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      {dFull(h.onHireFrom)}
                      {h.returnNotifiedAt && <span className="block text-[0.87rem] text-muted">Return notified {dShort(h.returnNotifiedAt.slice(0, 10))}</span>}
                      {h.collectedAt && <span className="block text-[0.87rem] text-muted">Collected {dShort(h.collectedAt.slice(0, 10))}</span>}
                    </td>
                    {access.seeValues && (
                      <td className="num">
                        {money2(h.rate, region)} a {h.rateUnit}
                      </td>
                    )}
                    {access.seeValues && <td className="num">{money0(hireCost(h, day), region)}</td>}
                    <td className="text-right">{canEdit && <HireAction h={h} />}</td>
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
