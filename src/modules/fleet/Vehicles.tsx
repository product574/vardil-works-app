/**
 * Vehicles (from the Secure-All build, 18 Nov): the list, and one vehicle on a page of its own
 * with its details, its driver and where they are today, its last driving check from the phone,
 * its next service (kept from ABC's own Fleet), its renewals, its repair history (each repair
 * opens its invoice), its documents and any damage reported. Also Vehicle documents, where every
 * file opens beside the list.
 */
import { ArrowLeft, Plus, UploadSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { deleteVehicle, markDiscOn, removeVehicle, restoreVehicle, updateMileage, vehicleRecords } from "@/data/actions";
import { getDay, useDay } from "@/data/store";
import type { Vehicle } from "@/data/types";
import { addDays } from "@/lib/dates";
import { parseSellAmount } from "@/lib/fleet";
import { complianceDue, type ComplianceKey, spendLines, totalOf } from "@/lib/fleet-spend";
import { dFull, dNear, monthYear, plural, tOf } from "@/lib/format";
import { discLate } from "@/lib/renewals";
import { driverSiteOn } from "@/lib/roster";
import { daysBetween, dueLabel, dueState, nextServiceDate } from "@/lib/status";
import { Badge, Button, cx, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Segmented, type Tone } from "@/ui";
import { toast } from "@/ui/toast";
import { AddDocDialog, DOC_LABEL, RenewDialog } from "./DocForms";
import { fleetDocDocs } from "./docs";
import { UploadInvoiceDialog } from "./InvoiceForm";
import { FileLink, FilterSelect, useFleetCan, useMoney, useNames, useRegionWords } from "./shared";
import { VehicleForm } from "./VehicleForm";

const DUE_TONE: Record<string, Tone> = { overdue: "bad", soon: "warn", ok: "ok" };

// ── The list ──────────────────────────────────────────────────────────────────

export function Vehicles() {
  const { db, base, driver } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const words = useRegionWords();
  const day = useDay();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useScreenState<"live" | "removed">("vehicles.tab", "live");
  const [baseId, setBaseId] = useScreenState("vehicles.base", "");
  const [q, setQ] = useScreenState("vehicles.q", "");
  const [adding, setAdding] = useState(false);
  const lines = useMemo(() => spendLines(db.garageInvoices), [db.garageInvoices]);
  const yearAgo = addDays(day, -365);
  const rows = db.vehicles
    .filter((v) => (tab === "live" ? v.active : !v.active) && (!baseId || v.baseId === baseId))
    .filter((v) => {
      const s = q.trim().toLowerCase().replace(/-/g, "");
      return !s || `${v.reg.replace(/-/g, "")} ${v.make} ${v.model} ${v.driverId ? driver(v.driverId) : ""}`.toLowerCase().includes(s);
    })
    .sort((a, b) => a.reg.localeCompare(b.reg));
  const due = (v: Vehicle) => complianceDue([v], day, words.region).filter((x) => x.state !== "ok");
  // The next service, kept from ABC's own Fleet: shown when it is due inside 30 days.
  const service = (v: Vehicle) => {
    const next = nextServiceDate(v.service, day);
    const state = dueState(next.date, day);
    return state === "ok" ? null : { state, date: next.date };
  };
  const live = db.vehicles.filter((v) => v.active).length;
  // An older link (?vehicle=) goes to the vehicle's own page.
  const old = params.get("vehicle");
  if (old) return <Navigate to={`/fleet/vehicles/${old}`} replace />;

  return (
    <>
      <PageHead
        title="Vehicles"
        note={`${plural(live, "vehicle")} on the fleet${db.vehicles.length > live ? `, ${db.vehicles.length - live} removed` : ""}.`}
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add vehicle
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Vehicles" value={tab} onChange={setTab} options={[{ value: "live", label: "On the fleet" }, { value: "removed", label: "Removed" }]} />
          <FilterSelect label="Base" all="All bases" value={baseId} onChange={setBaseId} options={db.bases.map((b) => ({ value: b.id, label: b.name }))} />
          <input type="search" aria-label="Search vehicles" placeholder="Registration, make or driver" className="field h-9 max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={db.vehicles.length ? "No vehicles match" : "No vehicles yet"}>{db.vehicles.length ? "Clear the search to see them all." : "Add the first vehicle with the button at the top right."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reg</th>
                  <th>Make and model</th>
                  <th>Use</th>
                  <th>Base</th>
                  <th>Driver</th>
                  <th className="num">Mileage</th>
                  <th className="num">Repairs, 12 months</th>
                  <th>{tab === "live" ? "Coming up" : "Removed"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id} className="rowlink cursor-pointer" onClick={() => navigate(`/fleet/vehicles/${v.id}`)}>
                    <td className="font-medium whitespace-nowrap">
                      <Link to={`/fleet/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {v.reg}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{v.make} {v.model}</td>
                    <td className="text-muted">{v.division}</td>
                    <td>{base(v.baseId)}</td>
                    <td>{v.driverId ? driver(v.driverId) : <span className="text-muted">Pool vehicle</span>}</td>
                    <td className="num">
                      {v.mileage.toLocaleString("en-IE")} km
                      {v.mileageAt && <span className="block text-[0.87rem] text-muted">as of {dNear(v.mileageAt, getDay())}</span>}
                    </td>
                    <td className="num">{m0(totalOf(lines.filter((l) => l.vehicleId === v.id && l.date >= yearAgo)))}</td>
                    <td>
                      {tab === "live" ? (
                        <span className="flex flex-wrap gap-1">
                          {due(v).map((x) => (
                            <Badge key={x.item} tone={DUE_TONE[x.state]}>
                              {x.label} {x.state === "overdue" ? "overdue" : `due ${dNear(x.expiry, getDay())}`}
                            </Badge>
                          ))}
                          {service(v) && <Badge tone={DUE_TONE[service(v)!.state]}>Service {service(v)!.state === "overdue" ? "overdue" : `due ${dNear(service(v)!.date, getDay())}`}</Badge>}
                        </span>
                      ) : (
                        <span className="text-muted">{v.removedAt ? dNear(v.removedAt, getDay()) : ""}{v.sellPrice != null ? `, sold for ${m0(v.sellPrice)}` : ", not sold"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && <VehicleForm onClose={(id) => { setAdding(false); if (id) navigate(`/fleet/vehicles/${id}`); }} />}
    </>
  );
}

// ── One vehicle, on its own page ──────────────────────────────────────────────

export function VehiclePage() {
  const { vehicleId } = useParams();
  const { db, base, driver, garage, site } = useNames();
  const can = useFleetCan();
  const words = useRegionWords();
  const navigate = useNavigate();
  const day = useDay();
  const { m0, m2 } = useMoney();
  const [mileage, setMileage] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [renew, setRenew] = useState<ComplianceKey | null>(null);
  const v = db.vehicles.find((x) => x.id === vehicleId);
  if (!v)
    return (
      <>
        <PageHead title="Vehicle not found" note="This vehicle is not on the list any more. It may have been deleted." />
        <PageBody>
          <Link to="/fleet/vehicles" className="inline-flex items-center gap-1.5 font-medium text-accent-ink hover:underline">
            <ArrowLeft size={16} /> All vehicles
          </Link>
        </PageBody>
      </>
    );
  const records = vehicleRecords(db, v.id);
  const deletable = records.invoices + records.documents + records.checks + records.damage === 0;
  // Where the driver is today, by the same rule as Who is where (timesheet, else the plan).
  const onSite = v.driverId ? driverSiteOn(v.driverId, day, db.attendance, db.plan, db.projects) : undefined;
  const lastCheck = db.vehicleChecks.find((c) => c.vehicleId === v.id);
  const service = nextServiceDate(v.service, day);
  const serviceState = dueState(service.date, day);
  const history = spendLines(db.garageInvoices).filter((l) => l.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date));
  const yearAgo = addDays(day, -365);
  const docs = db.fleetDocs.filter((d) => d.vehicleId === v.id);
  const damage = db.damageReports.filter((d) => d.vehicleId === v.id);
  const items: { key: ComplianceKey; label: string }[] = [
    { key: "tax", label: words.tax },
    { key: "test", label: words.test(v.kind) },
    { key: "insurance", label: "Insurance" },
  ];
  return (
    <>
      <PageHead
        title={`${v.reg}, ${v.make} ${v.model}`}
        note={`${base(v.baseId)}, ${v.driverId ? `driven by ${driver(v.driverId)}` : "pool vehicle, no driver"}. ${v.division}.`}
        actions={
          can.manage && (
          <>
            {deletable ? (
              <Button variant="ghost" className="text-bad" onClick={() => setDeleting(true)}>
                Delete vehicle
              </Button>
            ) : v.active ? (
              <Button variant="ghost" onClick={() => setRemoving(true)}>
                Remove from the fleet
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => { restoreVehicle(v.id); toast(`${v.reg} is back on the fleet`); }}>
                Put back on the fleet
              </Button>
            )}
            <Button onClick={() => setEditing(true)}>Edit vehicle</Button>
            <Button variant="primary" onClick={() => setUploading(true)}>
              <UploadSimple size={18} /> Upload an invoice
            </Button>
          </>
          )
        }
      />
      <PageBody>
        <div className="grid gap-4">
          {!v.active && (
            <p className="rounded-md bg-canvas px-3 py-2 text-muted">
              Removed from the fleet {v.removedAt ? `on ${dFull(v.removedAt)}` : ""}, {v.sellPrice != null ? `sold for ${m0(v.sellPrice)}` : "not sold"}. Its history is kept.
            </p>
          )}
          <Panel className="px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Fact label="Base" value={base(v.baseId)} />
              <Fact label="Driver" value={v.driverId ? driver(v.driverId) : "Pool vehicle, no driver"} />
              <Fact label="Use" value={v.division} />
              <Fact label="Type" value={`${v.kind}, ${v.fuel.toLowerCase()}`} />
              <Fact label="Owned or leased" value={v.ownership} />
              <Fact label="Bought" value={v.purchaseMonth ? `${monthYear(v.purchaseMonth)}${v.purchasePrice ? `, ${m0(v.purchasePrice)}` : ""}` : "-"} />
              <div>
                <dt className="text-[0.87rem] text-muted">Mileage</dt>
                <dd className="font-medium">{v.mileage.toLocaleString("en-IE")} km</dd>
                <dd className="text-[0.87rem] text-muted">
                  Last updated {v.mileageAt ? dFull(v.mileageAt) : "never"}
                  {v.mileageFrom === "invoice" ? ", from a garage invoice" : v.mileageAt ? ", typed in" : ""}.{" "}
                  {v.active && can.manage && (
                    <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => setMileage(true)}>
                      Update mileage
                    </button>
                  )}
                </dd>
              </div>
              <Fact label="Repairs" value={`${m0(totalOf(history.filter((l) => l.date >= yearAgo)))} in 12 months, ${m0(totalOf(history))} in all`} />
              <div>
                <dt className="text-[0.87rem] text-muted">Next service</dt>
                <dd className="font-medium">{dFull(service.date)}</dd>
                <dd className={cx("text-[0.87rem]", serviceState === "overdue" ? "font-medium text-bad" : serviceState === "soon" ? "text-warn" : "text-muted")}>{serviceState === "overdue" ? "Overdue" : service.remaining}</dd>
              </div>
            </dl>
            {v.active && (
              <div aria-label="Who has it today" className="mt-3 grid gap-1 rounded-lg bg-canvas px-3 py-2.5">
                <p className="font-medium">
                  {v.driverId ? (
                    <>
                      {driver(v.driverId)}
                      {onSite ? (
                        <>
                          {" "}is on{" "}
                          <Link to={`/projects/${db.projects.find((p) => p.id === onSite)?.code}`} className="text-accent-ink hover:underline">
                            {site(onSite)}
                          </Link>{" "}
                          today.
                        </>
                      ) : (
                        " is not on a site today."
                      )}
                    </>
                  ) : (
                    "A pool vehicle: it stays at the yard until someone takes it."
                  )}
                </p>
                <p className={cx("text-[0.93rem]", lastCheck?.defects.length ? "font-medium text-bad" : "text-muted")}>
                  {lastCheck
                    ? `Last driving check from the phone: ${lastCheck.at.slice(0, 10) === day ? "today" : dNear(lastCheck.at.slice(0, 10), getDay())} at ${tOf(lastCheck.at)}, by ${driver(lastCheck.personId)}. ${lastCheck.defects.length ? `Defect: ${lastCheck.defects.map((d) => `${d.item}, ${d.note}`).join("; ")}.` : "All OK."}`
                    : "No driving check from the phone yet."}
                </p>
              </div>
            )}
          </Panel>

          <section aria-label="Renewals">
            <h2 className="mb-2 text-[1.08rem]">{words.tax}, {words.test(v.kind)} and insurance</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {items.map(({ key, label }) => {
                const c = v.compliance[key];
                const state = c.expiryDate ? dueState(c.expiryDate, day) : null;
                return (
                  <Panel key={key} className="px-3 py-2.5">
                    <p className="flex items-center justify-between gap-2">
                      <span className="font-medium">{label}</span>
                      {state && <Badge tone={DUE_TONE[state]}>{dueLabel(c.expiryDate, day)}</Badge>}
                    </p>
                    <p className="text-[0.93rem] text-muted">{c.expiryDate ? `Runs to ${dFull(c.expiryDate)}${c.amount ? `, ${m2(c.amount)}` : ""}` : "No date recorded yet"}</p>
                    {c.discPending && (
                      <p className={cx("mt-1 text-[0.93rem]", discLate({ discWaiting: daysBetween(c.paidDate, day) }) ? "font-medium text-bad" : "text-warn")}>New disc not ticked on yet ({plural(daysBetween(c.paidDate, day), "day")}).</p>
                    )}
                    {v.active && can.manage && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setRenew(key)}>
                          Record renewal
                        </Button>
                        {c.discPending && (
                          <Button size="sm" onClick={() => { markDiscOn(v.id, key); toast(`${v.reg}: new disc is on`); }}>
                            Disc is on
                          </Button>
                        )}
                      </div>
                    )}
                  </Panel>
                );
              })}
            </div>
          </section>

          <section aria-label="Repair history">
            <h2 className="mb-2 text-[1.08rem]">Repair history</h2>
            <Panel className="overflow-x-auto">
              {history.length === 0 ? (
                <p className="px-4 py-3 text-muted">No garage invoices for this vehicle yet.</p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice</th>
                      <th>Garage</th>
                      <th>Work done</th>
                      <th>Driver then</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((l) => (
                      <tr key={l.id} className="rowlink cursor-pointer" title="Open this invoice" onClick={() => navigate(`/fleet/invoices/${l.invoiceId}`)}>
                        <td className="whitespace-nowrap text-muted">{dNear(l.date, getDay())}</td>
                        <td className="whitespace-nowrap">
                          <Link to={`/fleet/invoices/${l.invoiceId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent-ink hover:underline">
                            {l.invoiceNo || "No number"}
                          </Link>
                        </td>
                        <td>
                          <Link to={`/fleet/garages/${l.garageId}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                            {garage(l.garageId)}
                          </Link>
                        </td>
                        <td>{l.description || l.category}</td>
                        <td className="text-muted">{driver(l.driverId)}</td>
                        <td className="num font-medium">{m2(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </section>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-label="Documents">
              <div className="mb-2 flex items-center gap-3">
                <h2 className="text-[1.08rem]">Documents on file</h2>
                {v.active && can.manage && (
                  <Button size="sm" className="ml-auto" onClick={() => setAddingDoc(true)}>
                    <Plus size={16} /> Add a document
                  </Button>
                )}
              </div>
              <Panel className="overflow-x-auto">
                {docs.length === 0 ? (
                  <p className="px-4 py-3 text-muted">Nothing on file yet. Renewals recorded above are filed here with their receipt.</p>
                ) : (
                  <table className="tbl">
                    <tbody>
                      {docs.map((d) => (
                        <tr key={d.id}>
                          <td>
                            {d.note || (d.category === "test" ? words.test(v.kind) : d.category === "tax" ? words.tax : DOC_LABEL[d.category])}
                            <span className="block text-[0.87rem] text-muted">Added {dNear(d.date, getDay())}{d.expiryDate ? `, runs to ${dFull(d.expiryDate)}` : ""}</span>
                          </td>
                          <td className="text-right">{d.proof ? <FileLink docs={fleetDocDocs(d, db)} title={`${v.reg}, ${d.note || DOC_LABEL[d.category]}`}>Open</FileLink> : <span className="text-muted">On paper file</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </section>
            <section aria-label="Damage reported">
              <h2 className="mb-2 text-[1.08rem]">Damage reported</h2>
              <Panel>
                {damage.length === 0 ? (
                  <p className="px-4 py-3 text-muted">No damage reported for this vehicle.</p>
                ) : (
                  <ul>
                    {damage.map((d) => (
                      <li key={d.id} className="border-b border-line last:border-0">
                        <Link to={`/fleet/damage?report=${d.id}`} className="block px-4 py-2.5 hover:bg-accent-soft/40">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{dNear(d.at.slice(0, 10), getDay())}, {tOf(d.at)}</span>
                            <Badge tone={d.status === "New" ? "bad" : "ok"}>{d.status}</Badge>
                            <span className="ml-auto text-[0.93rem] text-muted">{plural(d.photos.length, "photo")}</span>
                          </span>
                          <span className="block truncate text-[0.93rem] text-muted">{d.where}: {d.note}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </section>
          </div>
        </div>
      </PageBody>
      {editing && <VehicleForm v={v} onClose={() => setEditing(false)} />}
      {removing && <RemoveDialog v={v} onClose={() => setRemoving(false)} />}
      {uploading && <UploadInvoiceDialog presetVehicleId={v.id} onClose={(id) => { setUploading(false); if (id) navigate(`/fleet/invoices/${id}`); }} />}
      {renew && <RenewDialog v={v} item={renew} onClose={() => setRenew(null)} />}
      {addingDoc && <AddDocDialog vehicleId={v.id} onClose={() => setAddingDoc(false)} />}
      {mileage && <MileageDialog v={v} onClose={() => setMileage(false)} />}
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${v.reg}?`}
        footer={
          <>
            <Button onClick={() => setDeleting(false)}>Keep it</Button>
            <Button
              variant="primary"
              onClick={() => {
                if (deleteVehicle(v.id)) {
                  toast(`${v.reg} deleted. Add it again with the right details`);
                  navigate("/fleet/vehicles", { replace: true });
                } else toast("It has records filed against it now, so it cannot be deleted");
                setDeleting(false);
              }}
            >
              Delete vehicle
            </Button>
          </>
        }
      >
        <p>For a vehicle added by mistake or with the wrong registration, make or model. Nothing is filed against it yet, so it can be deleted and added again. It cannot be undone.</p>
      </Dialog>
    </>
  );
}

/** Mileage typed in by the director, right as of today (until it comes from DCI). */
function MileageDialog({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const [km, setKm] = useState(v.mileage);
  const [error, setError] = useState("");
  const save = () => {
    if (!(km > 0)) return setError("Enter the reading on the dashboard, in km.");
    if (km < v.mileage && !error.startsWith("That is lower")) return setError(`That is lower than the last reading (${v.mileage.toLocaleString("en-IE")} km). Press Save again if it is right.`);
    updateMileage(v.id, km);
    toast(`${v.reg} mileage updated`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Update mileage, ${v.reg}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Mileage today (km)">{() => <NumInput label="Mileage today" className="w-full" value={km} onChange={(n) => { setKm(Math.round(n)); setError(""); }} />}</Field>
        <p className="text-[0.93rem] text-muted">Saved as right on today's date. Once DCI is linked, mileage will come from your DCI records instead.</p>
        <p role="alert" className="min-h-6 text-bad">
          {error}
        </p>
      </div>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.87rem] text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function RemoveDialog({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const go = () => {
    const parsed = parseSellAmount(amount);
    if (!parsed.ok) return setError("Enter what it sold for, or NA if it was not sold.");
    removeVehicle(v.id, parsed.value);
    toast(`${v.reg} removed from the fleet. Its history is kept`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove ${v.reg} from the fleet?`}
      footer={
        <>
          <Button onClick={onClose}>Keep it</Button>
          <Button variant="primary" onClick={go}>
            Remove vehicle
          </Button>
        </>
      }
    >
      <p className="mb-3">It leaves the fleet and the lists, and moves to Removed with its full repair history, which still counts in past totals.</p>
      <Field label="Sale amount" hint="What it sold for, or NA if it was not sold (scrapped, written off or returned to the lessor).">
        {(id) => <input id={id} className="field" inputMode="decimal" placeholder="e.g. 6500 or NA" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && go()} />}
      </Field>
      <p role="alert" className="mt-2 min-h-6 text-bad">
        {error}
      </p>
    </Dialog>
  );
}

// ── Vehicle documents ─────────────────────────────────────────────────────────

export function VehicleDocuments() {
  const { db, reg } = useNames();
  const can = useFleetCan();
  const { m2 } = useMoney();
  const [vehicleId, setVehicleId] = useScreenState("documents.vehicle", "");
  const [adding, setAdding] = useState(false);
  const rows = db.fleetDocs.filter((d) => !vehicleId || d.vehicleId === vehicleId);
  return (
    <>
      <PageHead
        title="Vehicle documents"
        note={`${plural(db.fleetDocs.length, "document")} on file. Open one to see it beside the list. Garage invoices are under Invoices.`}
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add a document
            </Button>
          )
        }
      >
        <div className="mt-3">
          <FilterSelect label="Vehicle" all="All vehicles" value={vehicleId} onChange={setVehicleId} options={db.vehicles.map((v) => ({ value: v.id, label: v.reg }))} />
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No documents yet">Renewals recorded on a vehicle, and documents added here, are listed with their file.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Added on</th>
                  <th>Vehicle</th>
                  <th>What</th>
                  <th>Runs to</th>
                  <th className="num">Amount</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap text-muted">{dNear(d.date, getDay())}</td>
                    <td className="font-medium whitespace-nowrap">
                      <Link to={`/fleet/vehicles/${d.vehicleId}`} className="text-accent-ink hover:underline">
                        {reg(d.vehicleId)}
                      </Link>
                    </td>
                    <td>{d.note || DOC_LABEL[d.category]}</td>
                    <td className="whitespace-nowrap">{d.expiryDate ? dFull(d.expiryDate) : "-"}</td>
                    <td className="num">{d.amount ? m2(d.amount) : "-"}</td>
                    <td>{d.proof ? <FileLink docs={fleetDocDocs(d, db)} title={`${reg(d.vehicleId)}, ${d.note || DOC_LABEL[d.category]}`} /> : <span className="text-muted">{d.fileName}, on paper file</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && <AddDocDialog onClose={() => setAdding(false)} />}
    </>
  );
}
