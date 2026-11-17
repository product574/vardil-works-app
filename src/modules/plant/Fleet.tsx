import { PencilSimple, Plus, UploadSimple } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addFleetDoc, addVehicle, removeVehicle, renewVehicle, setVehicleDriver, updateVehicle } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { FleetDoc, FleetDocCategory, Vehicle } from "@/data/types";
import { addDays } from "@/lib/dates";
import { latestCheck, monthsBefore, normaliseReg, parseSellAmount, readFleetFile, repairSpend, searchVehicles, SPEND_PERIODS, type SpendPeriod } from "@/lib/fleet";
import { dFull, dShort, plural, when } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { dueLabel, dueState, nextServiceDate } from "@/lib/status";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, PageBody, PageHead, Panel, Section, Segmented, Switch } from "@/ui";
import { ProofField, ProofLink, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";
import { DUE_TONE, RenewDialog } from "./Plant";

type Item = "tax" | "test" | "insurance";
const ITEMS: Item[] = ["tax", "test", "insurance"];
const CATEGORIES: FleetDocCategory[] = ["repairs", "tax", "test", "insurance"];
/** The roadworthiness test has a different name on each side of the border. */
const useLabels = () => {
  const region = usePrefs((s) => s.brand.region);
  const label: Record<FleetDocCategory, string> = { tax: "Motor tax", test: region === "UK" ? "MOT" : "CVRT", insurance: "Insurance", repairs: "Repair" };
  return label;
};

function useFleet() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const [params, setParams] = useSearchParams();
  const open = db.vehicles.find((v) => v.id === params.get("vehicle"));
  const driver = (v: Vehicle) => db.people.find((p) => p.id === v.driverId)?.name;
  return { db, day, region, seeValues: access.seeValues, canEdit: access.may("managePlant"), open, driver, show: (id: string) => setParams({ vehicle: id }), close: () => setParams({}) };
}

/**
 * The Fleet page (Oisin, 17 Nov), laid out like his own Oldstone fleet tool so it is easy to
 * use: three tabs (Vehicle stats, Vehicle documents, Repair spend) and the same three buttons
 * on every one. Upload document is the main one: a receipt or certificate goes in once, is
 * matched to its vehicle by the registration, and its spend and dates follow from there.
 */
const TABS = [
  { to: "/plant/fleet", label: "Vehicle stats", end: true },
  { to: "/plant/fleet/documents", label: "Vehicle documents", end: false },
  { to: "/plant/fleet/repairs", label: "Repair spend", end: false },
];

/** Which of the three dialogs is open, and for which vehicle if one was picked first. */
type Opened = { kind: "upload"; vehicleId?: string } | { kind: "add" } | { kind: "edit"; vehicleId?: string };

function FleetFrame({ note, tools, children }: { note: ReactNode; tools?: ReactNode; children: (open: (d: Opened) => void) => ReactNode }) {
  const { db, canEdit } = useFleet();
  const [opened, setOpened] = useState<Opened | null>(null);
  const none = !db.vehicles.some((v) => v.active);
  return (
    <>
      <PageHead
        title="Fleet"
        note={note}
        actions={
          canEdit && (
            <>
              <Button variant="primary" onClick={() => setOpened({ kind: "upload" })}>
                <UploadSimple size={16} /> Upload document
              </Button>
              <Button onClick={() => setOpened({ kind: "add" })}>
                <Plus size={16} /> Add vehicle
              </Button>
              <Button onClick={() => setOpened({ kind: "edit" })} disabled={none}>
                <PencilSimple size={16} /> Edit vehicle
              </Button>
            </>
          )
        }
      >
        <nav aria-label="Fleet sections" className="mt-3 inline-flex max-w-full flex-wrap rounded-md border border-line-strong bg-surface p-0.5">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => cx("press h-9 rounded px-3 leading-9 font-medium whitespace-nowrap", isActive ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink")}>
              {t.label}
            </NavLink>
          ))}
        </nav>
        {tools && !none && <div className="mt-3 flex flex-wrap items-center gap-2">{tools}</div>}
      </PageHead>
      {none ? (
        <PageBody>
          <Panel className="max-w-3xl px-5 py-4">
            <h2 className="text-[1.15rem]">Start by adding your vehicles</h2>
            <p className="mt-1 max-w-[65ch] text-muted">Add each van, pickup or tipper once. After that, upload receipts and certificates as they come in: each is matched to the right vehicle by its registration, and the repair spend and renewal dates look after themselves.</p>
            {canEdit && (
              <Button variant="primary" className="mt-3" onClick={() => setOpened({ kind: "add" })}>
                <Plus size={16} /> Add your first vehicle
              </Button>
            )}
          </Panel>
        </PageBody>
      ) : (
        children(setOpened)
      )}
      {opened?.kind === "upload" && <UploadDialog vehicleId={opened.vehicleId} onClose={() => setOpened(null)} onAdd={() => setOpened({ kind: "add" })} />}
      {opened?.kind === "add" && <AddVehicleDialog onClose={() => setOpened(null)} />}
      {opened?.kind === "edit" && <EditVehicleDialog vehicleId={opened.vehicleId} onClose={() => setOpened(null)} />}
    </>
  );
}

/** The search box on Vehicle stats and Vehicle documents. */
function FleetSearch({ q, setQ }: { q: string; setQ: (v: string) => void }) {
  return <input type="search" aria-label="Search registration or model" placeholder="Search registration or model" className="field w-full max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />;
}

/** Vehicle stats: every vehicle with its papers, service, driver's check and repairs, found by registration or model. */
export function Vehicles() {
  const { db, day, region, seeValues, open, driver, show, close } = useFleet();
  const label = useLabels();
  const [removed, setRemoved] = useState(false);
  const [q, setQ] = useState("");
  const active = db.vehicles.filter((v) => v.active);
  const rows = searchVehicles(db.vehicles.filter((v) => v.active !== removed), q).sort((a, b) => a.reg.localeCompare(b.reg));
  const worst = active.flatMap((v) => ITEMS.map((i) => dueState(v.compliance[i].expiryDate, day)));
  const year = repairSpend(db.vehicles, db.fleetDocs, monthsBefore(day, 12));
  const person = (id: string) => db.people.find((p) => p.id === id)?.name ?? "A driver";
  const defects = active.filter((v) => (latestCheck(db.vehicleChecks, v.id)?.defects.length ?? 0) > 0).length;
  return (
    <FleetFrame
      note={`${active.length} on the road. ${worst.filter((s) => s === "overdue").length} documents out of date, ${worst.filter((s) => s === "soon").length} due inside 30 days${defects ? `, ${plural(defects, "vehicle")} with a defect reported by its driver` : ""}. A vehicle with anything out of date should not leave the yard.`}
      tools={
        <>
          <FleetSearch q={q} setQ={setQ} />
          <label className="flex w-fit items-center gap-2 text-[0.93rem] text-muted">
            <Switch on={removed} onChange={() => setRemoved((v) => !v)} label="Show vehicles removed from the fleet" /> Show removed
          </label>
        </>
      }
    >
      {(openDialog) => (
        <>
          <PageBody>
            <Panel className="overflow-x-auto">
              {rows.length === 0 ? (
                <Empty title={q ? "No matching vehicles" : "No vehicles have been removed"}>{q ? "Try part of the registration, or the make." : undefined}</Empty>
              ) : (
                <table className="tbl" aria-label={removed ? "Vehicles removed from the fleet" : "Vehicles on the road"}>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Driver</th>
                      <th className="num">Mileage, km</th>
                      {removed ? <th>Sold for</th> : ITEMS.map((i) => <th key={i}>{label[i]}</th>)}
                      {!removed && <th>Next service</th>}
                      {!removed && <th>Driver's check</th>}
                      <th className="num">Repairs, 12 months</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((v) => {
                      const svc = nextServiceDate(v.service, day);
                      const check = latestCheck(db.vehicleChecks, v.id);
                      const spend = year.byVehicle.find((r) => r.vehicle.id === v.id);
                      return (
                        <tr key={v.id} className="rowlink" onClick={() => show(v.id)}>
                          <td className="whitespace-nowrap">
                            <span className="font-medium">{v.reg}</span>
                            <span className="block text-[0.87rem] text-muted">
                              {v.model}, {v.kind.toLowerCase()}
                            </span>
                          </td>
                          <td className="whitespace-nowrap">
                            {driver(v) ?? <span className="text-muted">Pool</span>}
                            <span className="block text-[0.87rem] text-muted">{v.baseLocation}</span>
                          </td>
                          <td className="num">{v.mileage.toLocaleString("en-IE")}</td>
                          {removed ? (
                            <td>{v.sellPrice != null ? money0(v.sellPrice, region) : "Not sold"}</td>
                          ) : (
                            ITEMS.map((i) => (
                              <td key={i}>
                                <Badge tone={DUE_TONE[dueState(v.compliance[i].expiryDate, day)]}>{dueLabel(v.compliance[i].expiryDate, day)}</Badge>
                              </td>
                            ))
                          )}
                          {!removed && (
                            <td className="whitespace-nowrap">
                              {dShort(svc.date)}
                              <span className="block text-[0.87rem] text-muted">{svc.remaining}</span>
                            </td>
                          )}
                          {!removed && (
                            <td>
                              {!check ? (
                                <span className="text-muted">None yet</span>
                              ) : check.defects.length ? (
                                <>
                                  <Badge tone="bad">{plural(check.defects.length, "defect")}</Badge>
                                  <span className="block text-[0.87rem] text-muted">{check.defects[0]!.note}</span>
                                </>
                              ) : (
                                <>
                                  All OK
                                  <span className="block text-[0.87rem] text-muted">{when(check.at, day)}</span>
                                </>
                              )}
                            </td>
                          )}
                          <td className="num whitespace-nowrap">
                            {spend && spend.jobs > 0 ? (
                              <>
                                {seeValues ? money0(spend.spend, region) : plural(spend.jobs, "repair")}
                                {seeValues && <span className="block text-[0.87rem] font-normal text-muted">{plural(spend.jobs, "repair")}</span>}
                              </>
                            ) : (
                              <span className="text-muted">None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
            <p className="mt-2 text-[0.93rem] text-muted">Click a vehicle to open it: renew its papers, see its repairs and its driver's checks. The driver's check is the walkaround each driver does on the site phone before setting off.</p>
          </PageBody>
          {open && <VehicleDialog v={open} onClose={close} onEdit={() => { close(); openDialog({ kind: "edit", vehicleId: open.id }); }} onUpload={() => { close(); openDialog({ kind: "upload", vehicleId: open.id }); }} person={person} />}
        </>
      )}
    </FleetFrame>
  );
}

/** One vehicle: its details, papers to renew, repairs and its driver's checks. Changing it is under Edit vehicle. */
function VehicleDialog({ v, onClose, onEdit, onUpload, person }: { v: Vehicle; onClose: () => void; onEdit: () => void; onUpload: () => void; person: (id: string) => string }) {
  const { db, day, region, seeValues, canEdit, driver } = useFleet();
  const label = useLabels();
  const [renew, setRenew] = useState<Item | null>(null);
  const svc = nextServiceDate(v.service, day);
  const checks = db.vehicleChecks.filter((c) => c.vehicleId === v.id).sort((a, b) => b.at.localeCompare(a.at));
  const repairs = db.fleetDocs.filter((d) => d.vehicleId === v.id && d.category === "repairs");
  const drivers = db.people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`${v.reg} ${v.model}`}
        wide
        footer={
          canEdit &&
          v.active && (
            <>
              <Button onClick={onEdit}>
                <PencilSimple size={16} /> Edit vehicle
              </Button>
              <Button variant="primary" onClick={onUpload}>
                <UploadSimple size={16} /> Upload a document for {v.reg}
              </Button>
            </>
          )
        }
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <dl className="content-start">
            <Fact label="Kind">{v.kind}</Fact>
            <Fact label="Based">{v.baseLocation}</Fact>
            <Fact label="Driver">
              {canEdit && v.active ? (
                <select aria-label={`Driver of ${v.reg}`} className="field h-8" value={v.driverId ?? ""} onChange={(e) => { setVehicleDriver(v.id, e.target.value || null); toast(`${v.reg} driver changed`); }}>
                  <option value="">Pool vehicle</option>
                  {drivers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                (driver(v) ?? "Pool vehicle")
              )}
            </Fact>
            <Fact label="Mileage">{v.mileage.toLocaleString("en-IE")} km</Fact>
            <Fact label="Bought">
              {v.purchaseMonth}
              {seeValues && `, ${money0(v.purchasePrice, region)}`}
            </Fact>
            <Fact label="Next service">
              {dFull(svc.date)}, {svc.remaining}
            </Fact>
            {!v.active && <Fact label="Removed">{v.sellPrice != null ? `Sold for ${money0(v.sellPrice, region)}` : "Not sold"}</Fact>}
          </dl>
          <div className="grid content-start gap-4">
            <div>
              <h3 className="mb-1 text-base">Documents</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {ITEMS.map((i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      {label[i]}
                      <span className="block text-[0.87rem] text-muted">
                        Expires {dFull(v.compliance[i].expiryDate)}
                        {seeValues && v.compliance[i].amount > 0 && `, ${money0(v.compliance[i].amount, region)} paid`}
                      </span>
                    </span>
                    <Badge tone={DUE_TONE[dueState(v.compliance[i].expiryDate, day)]}>{dueLabel(v.compliance[i].expiryDate, day)}</Badge>
                    {canEdit && v.active && (
                      <Button size="sm" onClick={() => setRenew(i)}>
                        Renew
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-base">Repairs ({repairs.length})</h3>
              {repairs.length === 0 ? (
                <p className="text-muted">None recorded.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line">
                  {repairs.slice(0, 5).map((d) => (
                    <li key={d.id} className="flex items-baseline gap-2 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        {d.workDone}
                        <span className="block text-[0.87rem] text-muted">
                          {dFull(d.date)}, {d.garage}
                        </span>
                      </span>
                      {seeValues && <span>{money2(d.amount, region)}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {repairs.length > 5 && <p className="mt-1 text-[0.93rem] text-muted">{repairs.length - 5} earlier repairs are under Vehicle documents.</p>}
            </div>
            <div>
              <h3 className="mb-1 text-base">Driver's checks ({checks.length})</h3>
              {checks.length === 0 ? (
                <p className="text-muted">None yet. Drivers do the walkaround on the site phone before setting off.</p>
              ) : (
                <ul className="divide-y divide-line rounded-md border border-line" aria-label={`Driver's checks on ${v.reg}`}>
                  {checks.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-baseline gap-2 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1">
                        {c.defects.length ? c.defects.map((d) => `${d.item}: ${d.note}`).join(". ") : "All OK"}
                        <span className="block text-[0.87rem] text-muted">
                          {when(c.at, day)}, {person(c.personId)}
                        </span>
                      </span>
                      {c.defects.length > 0 && <Badge tone="bad">{plural(c.defects.length, "defect")}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </Dialog>
      {renew && (
        <RenewDialog
          key={renew}
          title={`Renew ${label[renew].toLowerCase()}, ${v.reg}`}
          defaultExpires={addDays(v.compliance[renew].expiryDate > day ? v.compliance[renew].expiryDate : day, 365)}
          withAmount={v.compliance[renew].amount}
          onClose={() => setRenew(null)}
          onSave={(expires, amount, proof) => {
            renewVehicle(v.id, renew, expires, amount, proof);
            toast(`${label[renew]} for ${v.reg} renewed to ${dFull(expires)}`);
          }}
        />
      )}
    </>
  );
}

const KINDS: Vehicle["kind"][] = ["Van", "Crew van", "Pickup", "Tipper"];

/** People a vehicle can be given to: everyone still with the firm, by name. */
function useDrivers() {
  const people = useData((s) => s.db.people);
  return people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Pick a vehicle by typing part of its registration or its make: the matches are listed to
 * tap, with whoever drives each. Used by Upload document and Edit vehicle.
 */
function VehiclePicker({ vehicles, value, onChange, driver }: { vehicles: Vehicle[]; value: string; onChange: (id: string) => void; driver: (v: Vehicle) => string | undefined }) {
  const [q, setQ] = useState("");
  // The one picked stays at the top of the list, so it is never out of sight.
  const found = searchVehicles(vehicles, q).sort((a, b) => Number(b.id === value) - Number(a.id === value));
  return (
    <div>
      <input type="search" aria-label="Find the vehicle by registration or model" placeholder="Type a registration or a make" className="field" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul role="listbox" aria-label="Vehicles" className="mt-1.5 max-h-44 divide-y divide-line overflow-y-auto rounded-md border border-line">
        {found.length === 0 && <li className="px-2.5 py-2 text-muted">No vehicle on the fleet matches. Add it first with Add vehicle.</li>}
        {found.map((v) => (
          <li key={v.id}>
            <button type="button" role="option" aria-selected={v.id === value} onClick={() => onChange(v.id)} className={cx("press flex min-h-10 w-full items-baseline gap-2 px-2.5 py-1.5 text-left", v.id === value ? "bg-accent-soft text-accent-ink" : "hover:bg-accent-soft/60")}>
              <span className="font-medium whitespace-nowrap">{v.reg}</span>
              <span className="min-w-0 flex-1 truncate">{v.model}</span>
              <span className="shrink-0 text-[0.87rem] text-muted">{driver(v) ?? "Pool"}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AddVehicleDialog({ onClose }: { onClose: () => void }) {
  const db = useData((s) => s.db);
  const drivers = useDrivers();
  const [reg, setReg] = useState("");
  const [model, setModel] = useState("");
  const [kind, setKind] = useState<Vehicle["kind"]>("Van");
  const [base, setBase] = useState("Galway");
  const [driverId, setDriverId] = useState("");
  const [mileage, setMileage] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reg.trim() || !model.trim()) return setError("Registration and model are needed.");
    if (db.vehicles.some((v) => v.reg === normaliseReg(reg))) return setError("That registration is already on the fleet.");
    addVehicle({ reg, model: model.trim(), kind, baseLocation: base.trim() || "Galway", purchasePrice: Number(price.replace(/[€£,\s]/g, "")) || 0, driverId: driverId || null, mileage: Number(mileage.replace(/[,\s]/g, "")) || 0 });
    toast(`${normaliseReg(reg)} added to the fleet`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add a vehicle">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Registration">{(id) => <input id={id} className="field" placeholder="251-G-1234" value={reg} onChange={(e) => { setReg(e.target.value); setError(""); }} />}</Field>
        <Field label="Make and model">{(id) => <input id={id} className="field" placeholder="Ford Transit Custom" value={model} onChange={(e) => { setModel(e.target.value); setError(""); }} />}</Field>
        <Field label="Kind">
          {(id) => (
            <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as Vehicle["kind"])}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Based in">{(id) => <input id={id} className="field" value={base} onChange={(e) => setBase(e.target.value)} />}</Field>
        <Field label="Driver">
          {(id) => (
            <select id={id} className="field" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Pool vehicle</option>
              {drivers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Mileage, km">{(id) => <input id={id} className="field" inputMode="numeric" placeholder="0 if new" value={mileage} onChange={(e) => setMileage(e.target.value)} />}</Field>
        <Field label="Purchase price">{(id) => <input id={id} className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <p role="alert" className="self-end text-bad">
          {error}
        </p>
        <p className="text-[0.93rem] text-muted sm:col-span-2">Tax, test and insurance start a year out. Upload each certificate afterwards and its real date goes in.</p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Add vehicle
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/**
 * Edit vehicle: find it, then put right its registration, make, kind, base, driver or mileage,
 * or take it off the fleet. One place for every change to a vehicle.
 */
function EditVehicleDialog({ vehicleId, onClose }: { vehicleId?: string; onClose: () => void }) {
  const { db, driver } = useFleet();
  const drivers = useDrivers();
  const vehicles = db.vehicles.filter((v) => v.active).sort((a, b) => a.reg.localeCompare(b.reg));
  const [id, setId] = useState(vehicleId ?? "");
  const v = vehicles.find((x) => x.id === id);
  return (
    <Dialog open onClose={onClose} title={v ? `Edit ${v.reg}` : "Edit a vehicle"}>
      {!v ? (
        <div className="grid gap-2">
          <p className="font-medium">Which vehicle?</p>
          <VehiclePicker vehicles={vehicles} value={id} onChange={setId} driver={driver} />
        </div>
      ) : (
        <EditVehicleForm key={v.id} v={v} drivers={drivers} onBack={vehicleId ? undefined : () => setId("")} onClose={onClose} />
      )}
    </Dialog>
  );
}

function EditVehicleForm({ v, drivers, onBack, onClose }: { v: Vehicle; drivers: { id: string; name: string }[]; onBack: (() => void) | undefined; onClose: () => void }) {
  const db = useData((s) => s.db);
  const [reg, setReg] = useState(v.reg);
  const [model, setModel] = useState(v.model);
  const [kind, setKind] = useState<Vehicle["kind"]>(v.kind);
  const [base, setBase] = useState(v.baseLocation);
  const [driverId, setDriverId] = useState(v.driverId ?? "");
  const [mileage, setMileage] = useState(String(v.mileage));
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState(false);
  const [sell, setSell] = useState("");
  const save = (e: FormEvent) => {
    e.preventDefault();
    const km = Number(mileage.replace(/[,\s]/g, ""));
    if (!reg.trim() || !model.trim()) return setError("Registration and model are needed.");
    if (db.vehicles.some((x) => x.id !== v.id && x.reg === normaliseReg(reg))) return setError("That registration is already on the fleet.");
    if (!Number.isFinite(km) || km < 0) return setError("Mileage is a number of kilometres.");
    updateVehicle(v.id, { reg, model, kind, baseLocation: base, driverId: driverId || null, mileage: km });
    toast(`${normaliseReg(reg)} saved`);
    onClose();
  };
  const remove = (e: FormEvent) => {
    e.preventDefault();
    const r = parseSellAmount(sell);
    if (!r.ok) return setError("Enter what it sold for, or NA if it was not sold.");
    removeVehicle(v.id, r.value);
    toast(`${v.reg} removed from the fleet. Its documents are kept`);
    onClose();
  };
  if (removing)
    return (
      <form onSubmit={remove} className="grid gap-3" noValidate>
        <p>
          Take <span className="font-medium">{v.reg} {v.model}</span> off the fleet? Its documents and repair spend are kept, and it can still be seen under Show removed.
        </p>
        <Field label="Sold for" hint="What it sold for, or NA if it was not sold.">{(id) => <input id={id} className="field w-40" placeholder="4200 or NA" value={sell} onChange={(e) => { setSell(e.target.value); setError(""); }} />}</Field>
        <p role="alert" className="text-bad">
          {error}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => { setRemoving(false); setError(""); }}>Cancel</Button>
          <Button type="submit" variant="danger">
            Remove vehicle
          </Button>
        </div>
      </form>
    );
  return (
    <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Field label="Registration">{(id) => <input id={id} className="field" value={reg} onChange={(e) => { setReg(e.target.value); setError(""); }} />}</Field>
      <Field label="Make and model">{(id) => <input id={id} className="field" value={model} onChange={(e) => { setModel(e.target.value); setError(""); }} />}</Field>
      <Field label="Kind">
        {(id) => (
          <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as Vehicle["kind"])}>
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Based in">{(id) => <input id={id} className="field" value={base} onChange={(e) => setBase(e.target.value)} />}</Field>
      <Field label="Driver">
        {(id) => (
          <select id={id} className="field" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">Pool vehicle</option>
            {drivers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Mileage, km">{(id) => <input id={id} className="field" inputMode="numeric" value={mileage} onChange={(e) => { setMileage(e.target.value); setError(""); }} />}</Field>
      <p role="alert" className="text-bad sm:col-span-2">
        {error}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Button variant="danger" onClick={() => { setRemoving(true); setError(""); }}>
          Remove from fleet
        </Button>
        <span className="ml-auto flex gap-2">
          {onBack && <Button onClick={onBack}>Another vehicle</Button>}
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </span>
      </div>
    </form>
  );
}

/**
 * Upload document: the one way a receipt or certificate goes in. Choose the file, and the
 * vehicle is matched by the registration in it; say what it is and what it cost; file it.
 * A repair adds to that vehicle's spend. A tax, test or insurance certificate moves its date.
 */
function UploadDialog({ vehicleId: preset, onClose, onAdd }: { vehicleId?: string; onClose: () => void; onAdd: () => void }) {
  const { db, day, driver } = useFleet();
  const label = useLabels();
  const vehicles = db.vehicles.filter((v) => v.active).sort((a, b) => a.reg.localeCompare(b.reg));
  const [vehicleId, setVehicleId] = useState(preset ?? "");
  const [category, setCategory] = useState<FleetDocCategory>("repairs");
  const [date, setDate] = useState(day);
  const [amount, setAmount] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [garage, setGarage] = useState("");
  const [place, setPlace] = useState("");
  const [expiry, setExpiry] = useState(addDays(day, 365));
  const [error, setError] = useState("");
  const [read, setRead] = useState("");
  const { proof, error: fileError, pick } = useProofPick();
  const repair = category === "repairs";
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  // Reading the file: in the demo its name is read, for the registration and the kind of document.
  const choose = (f: File) => {
    pick(f);
    const r = readFleetFile(f.name, vehicles);
    if (r.vehicle && !preset) setVehicleId(r.vehicle.id);
    if (r.category) setCategory(r.category);
    setRead(preset ? "" : `${r.why}.${r.vehicle ? ` Matched to ${r.vehicle.reg} ${r.vehicle.model}.` : ""}`);
    setError("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const paid = Number(amount.replace(/[€£,\s]/g, ""));
    if (!vehicle) return setError("Pick the vehicle this is for.");
    if (!amount.trim() || !Number.isFinite(paid) || paid < 0) return setError("Enter the amount on the receipt.");
    if (repair && (!workDone.trim() || !garage.trim())) return setError("Say what was done and which garage did it.");
    addFleetDoc({ vehicleId: vehicle.id, category, date, amount: paid, ...(repair ? { workDone: workDone.trim(), garage: garage.trim(), garageLocation: place.trim() || "Unknown" } : { expiryDate: expiry }) }, proof);
    toast(repair ? `Repair filed for ${vehicle.reg}. It is in the repair spend` : `${label[category]} filed for ${vehicle.reg}, good to ${dFull(expiry)}`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={preset && vehicle ? `Upload a document for ${vehicle.reg}` : "Upload a document"} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="grid content-start gap-3">
          <ProofField label="The receipt or certificate" pick={choose} proof={proof} error={fileError} hint="A photo or a PDF. With the registration in the file's name, the vehicle is picked for you." />
          {read && (
            <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-[0.93rem] text-accent-ink">
              {read}
            </p>
          )}
          {!preset && (
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Vehicle</p>
              {vehicles.length === 0 ? (
                <p className="text-muted">
                  No vehicles yet. <button type="button" className="font-medium text-accent-ink underline-offset-2 hover:underline" onClick={onAdd}>Add one first</button>.
                </p>
              ) : (
                <VehiclePicker vehicles={vehicles} value={vehicleId} onChange={(id) => { setVehicleId(id); setError(""); }} driver={driver} />
              )}
            </div>
          )}
        </div>
        <div className="grid content-start gap-3">
          <div>
            <p className="mb-1 text-[0.93rem] font-medium">What is it?</p>
            <Segmented label="Kind of document" value={category} onChange={(c) => { setCategory(c); setError(""); }} options={CATEGORIES.map((c) => ({ value: c, label: c === "repairs" ? "Repair invoice" : label[c] }))} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date">{(id) => <input id={id} type="date" className="field" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Amount">{(id) => <input id={id} className="field" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} />}</Field>
          </div>
          {repair ? (
            <>
              <Field label="Work done">{(id) => <input id={id} className="field" placeholder="Front brake discs and pads" value={workDone} onChange={(e) => { setWorkDone(e.target.value); setError(""); }} />}</Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Garage">{(id) => <input id={id} className="field" value={garage} onChange={(e) => { setGarage(e.target.value); setError(""); }} />}</Field>
                <Field label="Town and county">{(id) => <input id={id} className="field" placeholder="Oranmore, Galway" value={place} onChange={(e) => setPlace(e.target.value)} />}</Field>
              </div>
            </>
          ) : (
            <Field label="Expires" hint={`The vehicle's ${label[category].toLowerCase()} date moves to this.`}>{(id) => <input id={id} type="date" className="field" min={date} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</Field>
          )}
        </div>
        <p role="alert" className="text-bad sm:col-span-2">
          {error}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2">
          <span className="mr-auto text-[0.93rem] text-muted">{vehicle ? `For ${vehicle.reg} ${vehicle.model}` : "No vehicle picked yet"}</span>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            File document
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Every receipt and certificate for every vehicle, newest first, found by registration or model and by category. */
export function VehicleDocuments() {
  const { db, region, seeValues } = useFleet();
  const label = useLabels();
  const [cat, setCat] = useState<"all" | FleetDocCategory>("all");
  const [q, setQ] = useState("");
  const vehicle = (id: string) => db.vehicles.find((v) => v.id === id);
  const found = new Set(searchVehicles(db.vehicles, q).map((v) => v.id));
  const rows = db.fleetDocs.filter((d) => (cat === "all" || d.category === cat) && found.has(d.vehicleId));
  return (
    <FleetFrame
      note={`${db.fleetDocs.length} documents on file across ${db.vehicles.length} vehicles, including ones since removed. Each came in through Upload document or a renewal.`}
      tools={
        <>
          <FleetSearch q={q} setQ={setQ} />
          <select aria-label="Category" className="field w-auto" value={cat} onChange={(e) => setCat(e.target.value as "all" | FleetDocCategory)}>
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "repairs" ? "Repairs" : label[c]}
              </option>
            ))}
          </select>
          <span className="text-[0.93rem] text-muted">{plural(rows.length, "document")}</span>
        </>
      }
    >
      {() => (
        <PageBody>
          <Panel className="max-w-6xl overflow-x-auto">
            {rows.length === 0 ? (
              <Empty title={found.size === 0 ? "No matching vehicles" : "No documents match"}>{found.size === 0 ? "Try part of the registration, or the make." : "Pick another category, or upload the document."}</Empty>
            ) : (
              <table className="tbl" aria-label="Vehicle documents">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Vehicle</th>
                    <th>Category</th>
                    <th>Detail</th>
                    <th>Expires</th>
                    {seeValues && <th className="num">Amount</th>}
                    <th>File</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 80).map((d: FleetDoc) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap">{dFull(d.date)}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-medium">{vehicle(d.vehicleId)?.reg}</span>
                        <span className="block text-[0.87rem] text-muted">{vehicle(d.vehicleId)?.model}</span>
                      </td>
                      <td>{label[d.category]}</td>
                      <td>
                        {d.workDone ?? <span className="text-muted">Renewal</span>}
                        {d.garage && <span className="block text-[0.87rem] text-muted">{d.garage}, {d.garageLocation}</span>}
                      </td>
                      <td className="whitespace-nowrap">{d.expiryDate ? dFull(d.expiryDate) : <span className="text-muted">-</span>}</td>
                      {seeValues && <td className="num">{money2(d.amount, region)}</td>}
                      <td className="text-[0.93rem]">{d.proof ? <ProofLink proof={d.proof} title={`${vehicle(d.vehicleId)?.reg} ${label[d.category]}`} /> : <span className="text-muted">{d.fileName}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
          {rows.length > 80 && <p className="mt-2 text-[0.93rem] text-muted">Showing the newest 80 of {rows.length}. Search for a vehicle or pick a category to narrow it.</p>}
        </PageBody>
      )}
    </FleetFrame>
  );
}

/** What the fleet costs to keep on the road over a chosen period: by vehicle and by garage. Figures only, no charts. */
export function RepairSpend() {
  const { db, day, region, driver } = useFleet();
  const [period, setPeriod] = useState<SpendPeriod>("1y");
  const p = SPEND_PERIODS.find((x) => x.key === period)!;
  const spend = repairSpend(db.vehicles, db.fleetDocs, monthsBefore(day, p.months));
  const top = spend.byVehicle[0];
  return (
    <FleetFrame
      note={
        spend.jobs === 0
          ? `No repairs in ${p.words}. Upload a repair invoice and it is counted here.`
          : `${money0(spend.total, region)} on ${plural(spend.jobs, "repair")} in ${p.words}.${top && top.spend > 0 ? ` The dearest to run was ${top.vehicle.reg} (${top.vehicle.model}) at ${money0(top.spend, region)}.` : ""}`
      }
      tools={<Segmented label="Period" value={period} onChange={setPeriod} options={SPEND_PERIODS.map((x) => ({ value: x.key, label: x.label }))} />}
    >
      {() => (
        <PageBody className="grid max-w-6xl gap-6">
          <Section title="By vehicle" aside={`Dearest in ${p.words} first`}>
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label={`Repair spend by vehicle, ${p.words}`}>
                <thead>
                  <tr>
                    <th>Reg</th>
                    <th>Vehicle</th>
                    <th>Driver</th>
                    <th className="num">Repairs</th>
                    <th className="num">Spend</th>
                    <th>Biggest repair</th>
                    <th className="num">All time</th>
                    <th className="num">Per 1,000 km</th>
                  </tr>
                </thead>
                <tbody>
                  {spend.byVehicle.map(({ vehicle: v, jobs, spend: s, biggest, allTime, per1000 }) => (
                    <tr key={v.id}>
                      <td className="font-medium whitespace-nowrap">
                        {v.reg}
                        {!v.active && <span className="block text-[0.87rem] font-normal text-muted">Removed</span>}
                      </td>
                      <td>{v.model}</td>
                      <td>{driver(v) ?? <span className="text-muted">{v.active ? "Pool" : "-"}</span>}</td>
                      <td className="num">{jobs || <span className="text-muted">-</span>}</td>
                      <td className="num font-medium">{jobs ? money0(s, region) : <span className="font-normal text-muted">-</span>}</td>
                      <td className="text-muted">{biggest ? `${biggest.workDone}, ${money0(biggest.amount, region)}` : "-"}</td>
                      <td className="num">{money0(allTime, region)}</td>
                      <td className="num">{money2(per1000, region)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="border-t border-line-strong font-medium">Whole fleet</td>
                    <td className="num border-t border-line-strong">{spend.jobs}</td>
                    <td className="num border-t border-line-strong font-medium">{money0(spend.total, region)}</td>
                    <td className="border-t border-line-strong" />
                    <td className="num border-t border-line-strong">{money0(spend.byVehicle.reduce((n, r) => n + r.allTime, 0), region)}</td>
                    <td className="border-t border-line-strong" />
                  </tr>
                </tfoot>
              </table>
            </Panel>
            <p className="mt-2 text-[0.93rem] text-muted">Spend and repairs are for {p.words}. All time and the cost per 1,000 km are over the whole time the vehicle has been on the fleet, to compare one with another.</p>
          </Section>
          <Section title="By garage" aside={p.words[0]!.toUpperCase() + p.words.slice(1)}>
            <Panel className="max-w-3xl overflow-x-auto">
              {spend.byGarage.length === 0 ? (
                <Empty title="No repairs in this period" />
              ) : (
                <table className="tbl" aria-label={`Repair spend by garage, ${p.words}`}>
                  <thead>
                    <tr>
                      <th>Garage</th>
                      <th className="num">Repairs</th>
                      <th className="num">Spend</th>
                      <th className="num">Average repair</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spend.byGarage.map((g) => (
                      <tr key={g.garage}>
                        <td>
                          {g.garage}
                          <span className="block text-[0.87rem] text-muted">{g.where}</span>
                        </td>
                        <td className="num">{g.jobs}</td>
                        <td className="num">{money0(g.spend, region)}</td>
                        <td className="num">{money0(g.spend / g.jobs, region)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </Section>
        </PageBody>
      )}
    </FleetFrame>
  );
}
