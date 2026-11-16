import { type FormEvent, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addFleetDoc, addVehicle, removeVehicle, renewVehicle, setVehicleDriver } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { FleetDoc, FleetDocCategory, Vehicle } from "@/data/types";
import { addDays } from "@/lib/dates";
import { parseSellAmount, regionOf } from "@/lib/fleet";
import { dFull, dShort, plural } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { dueLabel, dueState, nextServiceDate } from "@/lib/status";
import { Badge, Button, Dialog, Empty, Fact, Field, PageBody, PageHead, Panel, Section, Segmented, Switch } from "@/ui";
import { ProofField, ProofLink, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";
import { DUE_TONE, RenewDialog } from "./Plant";

type Item = "tax" | "test" | "insurance";
const ITEMS: Item[] = ["tax", "test", "insurance"];
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

export function Vehicles() {
  const { db, day, region, canEdit, open, driver, show, close } = useFleet();
  const label = useLabels();
  const [removed, setRemoved] = useState(false);
  const [adding, setAdding] = useState(false);
  const active = db.vehicles.filter((v) => v.active);
  const rows = db.vehicles.filter((v) => v.active !== removed).sort((a, b) => a.reg.localeCompare(b.reg));
  const worst = active.flatMap((v) => ITEMS.map((i) => dueState(v.compliance[i].expiryDate, day)));
  return (
    <>
      <PageHead
        title="Vehicles"
        note={`${active.length} on the road. ${worst.filter((s) => s === "overdue").length} documents out of date, ${worst.filter((s) => s === "soon").length} due inside 30 days. A vehicle with anything out of date should not leave the yard.`}
        actions={canEdit && <Button variant="primary" onClick={() => setAdding(true)}>Add vehicle</Button>}
      >
        <label className="mt-3 flex w-fit items-center gap-2 text-[0.93rem] text-muted">
          <Switch on={removed} onChange={() => setRemoved((v) => !v)} label="Show vehicles removed from the fleet" /> Show removed
        </label>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No vehicles have been removed" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reg</th>
                  <th>Vehicle</th>
                  <th>Based</th>
                  <th>Driver</th>
                  <th className="num">Mileage, km</th>
                  {removed ? <th>Sold for</th> : ITEMS.map((i) => <th key={i}>{label[i]}</th>)}
                  {!removed && <th>Next service</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const svc = nextServiceDate(v.service, day);
                  return (
                    <tr key={v.id} className="rowlink" onClick={() => show(v.id)}>
                      <td className="font-medium whitespace-nowrap">{v.reg}</td>
                      <td>
                        {v.model}
                        <span className="block text-[0.87rem] text-muted">{v.kind}</span>
                      </td>
                      <td>{v.baseLocation}</td>
                      <td>{driver(v) ?? <span className="text-muted">Pool</span>}</td>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {open && <VehicleDialog v={open} onClose={close} />}
      {adding && <AddVehicleDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function VehicleDialog({ v, onClose }: { v: Vehicle; onClose: () => void }) {
  const { db, day, region, seeValues, canEdit, driver } = useFleet();
  const label = useLabels();
  const [renew, setRenew] = useState<Item | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sell, setSell] = useState("");
  const [error, setError] = useState("");
  const svc = nextServiceDate(v.service, day);
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
          v.active &&
          (removing ? (
            <form
              className="flex w-full flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const r = parseSellAmount(sell);
                if (!r.ok) return setError("Enter what it sold for, or NA if it was not sold.");
                removeVehicle(v.id, r.value);
                toast(`${v.reg} removed from the fleet. Its documents are kept`);
                onClose();
              }}
            >
              <label className="mr-auto flex items-center gap-2 text-[0.93rem]">
                Sold for
                <input aria-label="Sold for" className="field h-9 w-32" placeholder="4200 or NA" value={sell} onChange={(e) => { setSell(e.target.value); setError(""); }} />
                <span role="alert" className="text-bad">{error}</span>
              </label>
              <Button onClick={() => setRemoving(false)}>Cancel</Button>
              <Button type="submit" variant="danger">
                Remove vehicle
              </Button>
            </form>
          ) : (
            <Button variant="danger" onClick={() => setRemoving(true)}>
              Remove from fleet
            </Button>
          ))
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

function AddVehicleDialog({ onClose }: { onClose: () => void }) {
  const db = useData((s) => s.db);
  const [reg, setReg] = useState("");
  const [model, setModel] = useState("");
  const [kind, setKind] = useState<Vehicle["kind"]>("Van");
  const [base, setBase] = useState("Galway");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reg.trim() || !model.trim()) return setError("Registration and model are needed.");
    if (db.vehicles.some((v) => v.reg === reg.trim().toUpperCase().replace(/\s+/g, "-"))) return setError("That registration is already on the fleet.");
    addVehicle({ reg, model: model.trim(), kind, baseLocation: base.trim() || "Galway", purchasePrice: Number(price.replace(/[€£,\s]/g, "")) || 0 });
    toast(`${reg.trim().toUpperCase()} added to the fleet`);
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
        <Field label="Purchase price">{(id) => <input id={id} className="field" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />}</Field>
        <p role="alert" className="self-end text-bad">
          {error}
        </p>
        <p className="text-[0.93rem] text-muted sm:col-span-2">Tax, test and insurance start a year out. Open the vehicle afterwards to put in the real dates.</p>
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

/** Every receipt and certificate for every vehicle, newest first. */
export function VehicleDocuments() {
  const { db, region, seeValues, canEdit } = useFleet();
  const label = useLabels();
  const [cat, setCat] = useState<"all" | FleetDocCategory>("all");
  const [vehicleId, setVehicleId] = useState("");
  const [adding, setAdding] = useState(false);
  const reg = (id: string) => db.vehicles.find((v) => v.id === id)?.reg ?? "";
  const rows = db.fleetDocs.filter((d) => (cat === "all" || d.category === cat) && (!vehicleId || d.vehicleId === vehicleId));
  const n = (c: FleetDocCategory) => db.fleetDocs.filter((d) => d.category === c && (!vehicleId || d.vehicleId === vehicleId)).length;
  return (
    <>
      <PageHead title="Vehicle documents" note={`${db.fleetDocs.length} on file across ${db.vehicles.length} vehicles, including ones since removed.`} actions={canEdit && <Button onClick={() => setAdding(true)}>Add a document</Button>}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Kind of document" value={cat} onChange={setCat} options={[{ value: "all", label: "All" }, { value: "repairs", label: "Repairs", count: n("repairs") }, { value: "tax", label: label.tax, count: n("tax") }, { value: "test", label: label.test, count: n("test") }, { value: "insurance", label: "Insurance", count: n("insurance") }]} />
          <select aria-label="Vehicle" className="field w-auto" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">Every vehicle</option>
            {[...db.vehicles].sort((a, b) => a.reg.localeCompare(b.reg)).map((v) => (
              <option key={v.id} value={v.id}>
                {v.reg} {v.model}
              </option>
            ))}
          </select>
        </div>
      </PageHead>
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No documents match" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Kind</th>
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
                    <td className="font-medium whitespace-nowrap">{reg(d.vehicleId)}</td>
                    <td>{label[d.category]}</td>
                    <td>
                      {d.workDone ?? <span className="text-muted">Renewal</span>}
                      {d.garage && <span className="block text-[0.87rem] text-muted">{d.garage}, {d.garageLocation}</span>}
                    </td>
                    <td className="whitespace-nowrap">{d.expiryDate ? dFull(d.expiryDate) : <span className="text-muted">-</span>}</td>
                    {seeValues && <td className="num">{money2(d.amount, region)}</td>}
                    <td className="text-[0.93rem]">{d.proof ? <ProofLink proof={d.proof} title={`${reg(d.vehicleId)} ${label[d.category]}`} /> : <span className="text-muted">{d.fileName}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        {rows.length > 80 && <p className="mt-2 text-[0.93rem] text-muted">Showing the newest 80 of {rows.length}. Pick a vehicle or a kind to narrow it.</p>}
      </PageBody>
      {adding && <AddDocDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function AddDocDialog({ onClose }: { onClose: () => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const label = useLabels();
  const vehicles = db.vehicles.filter((v) => v.active).sort((a, b) => a.reg.localeCompare(b.reg));
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [category, setCategory] = useState<FleetDocCategory>("repairs");
  const [date, setDate] = useState(day);
  const [amount, setAmount] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [garage, setGarage] = useState("");
  const [place, setPlace] = useState("");
  const [expiry, setExpiry] = useState(addDays(day, 365));
  const [error, setError] = useState("");
  const { proof, error: fileError, pick } = useProofPick();
  const repair = category === "repairs";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const paid = Number(amount.replace(/[€£,\s]/g, ""));
    if (!amount.trim() || !Number.isFinite(paid) || paid < 0) return setError("Enter the amount on the receipt.");
    if (repair && (!workDone.trim() || !garage.trim())) return setError("Say what was done and which garage did it.");
    addFleetDoc({ vehicleId, category, date, amount: paid, ...(repair ? { workDone: workDone.trim(), garage: garage.trim(), garageLocation: place.trim() || "Unknown" } : { expiryDate: expiry }) }, proof);
    toast(`${label[category]} filed for ${db.vehicles.find((v) => v.id === vehicleId)?.reg}`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add a vehicle document">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Vehicle">
          {(id) => (
            <select id={id} className="field" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reg} {v.model}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Kind of document">
          {(id) => (
            <select id={id} className="field" value={category} onChange={(e) => setCategory(e.target.value as FleetDocCategory)}>
              {(["repairs", "tax", "test", "insurance"] as FleetDocCategory[]).map((c) => (
                <option key={c} value={c}>
                  {label[c]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Date">{(id) => <input id={id} type="date" className="field" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Amount">{(id) => <input id={id} className="field" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setError(""); }} />}</Field>
        {repair ? (
          <>
            <Field label="Work done" className="sm:col-span-2">{(id) => <input id={id} className="field" placeholder="Front brake discs and pads" value={workDone} onChange={(e) => { setWorkDone(e.target.value); setError(""); }} />}</Field>
            <Field label="Garage">{(id) => <input id={id} className="field" value={garage} onChange={(e) => { setGarage(e.target.value); setError(""); }} />}</Field>
            <Field label="Town and county">{(id) => <input id={id} className="field" placeholder="Oranmore, Galway" value={place} onChange={(e) => setPlace(e.target.value)} />}</Field>
          </>
        ) : (
          <Field label="Expires" className="sm:col-span-2">{(id) => <input id={id} type="date" className="field" min={date} value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</Field>
        )}
        <div className="sm:col-span-2">
          <ProofField pick={pick} proof={proof} error={fileError} hint="A photo or PDF of the receipt or certificate." />
        </div>
        <p role="alert" className="text-bad sm:col-span-2">
          {error}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            File document
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** What the fleet costs to keep on the road: by vehicle, by garage and by quarter. Figures only, no charts. */
export function RepairSpend() {
  const { db, day, region } = useFleet();
  const repairs = db.fleetDocs.filter((d) => d.category === "repairs");
  const yearAgo = addDays(day, -365);
  const twoAgo = addDays(day, -730);
  const sum = (list: FleetDoc[]) => list.reduce((s, d) => s + d.amount, 0);
  const byVehicle = db.vehicles
    .map((v) => {
      const mine = repairs.filter((d) => d.vehicleId === v.id);
      const last = mine.filter((d) => d.date > yearAgo);
      const big = [...mine].sort((a, b) => b.amount - a.amount)[0];
      return { v, jobs: mine.length, last: sum(last), before: sum(mine.filter((d) => d.date <= yearAgo && d.date > twoAgo)), total: sum(mine), per1000: v.mileage > 0 ? (sum(mine) / v.mileage) * 1000 : 0, big };
    })
    .sort((a, b) => b.last - a.last);
  const garages = [...new Set(repairs.map((d) => d.garage ?? "Unknown"))]
    .map((g) => {
      const mine = repairs.filter((d) => (d.garage ?? "Unknown") === g);
      return { g, where: regionOf(mine[0]?.garageLocation), jobs: mine.length, total: sum(mine) };
    })
    .sort((a, b) => b.total - a.total);
  const quarter = (d: string) => `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`;
  const quarters = [...new Set(repairs.filter((d) => d.date > twoAgo).map((d) => quarter(d.date)))].sort().reverse();
  const top = byVehicle[0];
  const year = sum(repairs.filter((d) => d.date > yearAgo));
  return (
    <>
      <PageHead title="Repair spend" note={`${money0(year, region)} on repairs in the last 12 months across ${db.vehicles.length} vehicles.${top ? ` The dearest to run was ${top.v.reg} (${top.v.model}) at ${money0(top.last, region)}.` : ""}`} />
      <PageBody className="grid max-w-6xl gap-6">
        <Section title="By vehicle" aside="Dearest in the last 12 months first">
          <Panel className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reg</th>
                  <th>Vehicle</th>
                  <th className="num">Jobs</th>
                  <th className="num">Last 12 months</th>
                  <th className="num">12 months before</th>
                  <th className="num">All time</th>
                  <th className="num">Per 1,000 km</th>
                  <th>Biggest job</th>
                </tr>
              </thead>
              <tbody>
                {byVehicle.map(({ v, jobs, last, before, total, per1000, big }) => (
                  <tr key={v.id}>
                    <td className="font-medium whitespace-nowrap">
                      {v.reg}
                      {!v.active && <span className="block text-[0.87rem] font-normal text-muted">Removed</span>}
                    </td>
                    <td>
                      {v.model}
                      <span className="block text-[0.87rem] text-muted">Bought {v.purchaseMonth.slice(0, 4)}</span>
                    </td>
                    <td className="num">{jobs}</td>
                    <td className="num font-medium">{money0(last, region)}</td>
                    <td className="num">{money0(before, region)}</td>
                    <td className="num">{money0(total, region)}</td>
                    <td className="num">{money2(per1000, region)}</td>
                    <td className="text-muted">{big ? `${big.workDone}, ${money0(big.amount, region)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="border-t border-line-strong font-medium">Whole fleet</td>
                  <td className="num border-t border-line-strong">{repairs.length}</td>
                  <td className="num border-t border-line-strong font-medium">{money0(year, region)}</td>
                  <td className="num border-t border-line-strong">{money0(sum(repairs.filter((d) => d.date <= yearAgo && d.date > twoAgo)), region)}</td>
                  <td className="num border-t border-line-strong">{money0(sum(repairs), region)}</td>
                  <td colSpan={2} className="border-t border-line-strong" />
                </tr>
              </tfoot>
            </table>
          </Panel>
        </Section>
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Section title="By garage">
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Garage</th>
                    <th className="num">Jobs</th>
                    <th className="num">Total</th>
                    <th className="num">Average job</th>
                  </tr>
                </thead>
                <tbody>
                  {garages.map((g) => (
                    <tr key={g.g}>
                      <td>
                        {g.g}
                        <span className="block text-[0.87rem] text-muted">{g.where}</span>
                      </td>
                      <td className="num">{g.jobs}</td>
                      <td className="num">{money0(g.total, region)}</td>
                      <td className="num">{money0(g.total / g.jobs, region)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
          <Section title="By quarter" aside="Last two years">
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Quarter</th>
                    <th className="num">Jobs</th>
                    <th className="num">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((q) => {
                    const mine = repairs.filter((d) => d.date > twoAgo && quarter(d.date) === q);
                    return (
                      <tr key={q}>
                        <td>{q}</td>
                        <td className="num">{plural(mine.length, "job")}</td>
                        <td className="num">{money0(sum(mine), region)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        </div>
      </PageBody>
    </>
  );
}
