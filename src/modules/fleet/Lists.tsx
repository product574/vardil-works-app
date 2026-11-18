/**
 * Drivers and bases (from the Secure-All build, 18 Nov): the lists behind the filters, each with
 * its repair spend over the last 12 months. A driver opens to their details and licences (each
 * with its copy to look at); a base opens in a wide window with its repairs listed, each opening
 * its invoice. Garages have a page of their own (Garages.tsx). ABC has no routes: a van has a driver.
 */
import { CheckCircle, Plus } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { addBase, addDriver, confirmLicence, setDriverActive, updateBase } from "@/data/actions";
import { getDay, useDay } from "@/data/store";
import type { Base, BaseKind, Driver, Licence } from "@/data/types";
import { addDays } from "@/lib/dates";
import { type SpendLine, spendLines, totalOf } from "@/lib/fleet-spend";
import { dFull, dNear, plural, tOf } from "@/lib/format";
import { dueLabel, dueState } from "@/lib/status";
import { Badge, Button, Dialog, Empty, Field, PageBody, PageHead, Panel, Segmented, Tel, type Tone } from "@/ui";
import { toast } from "@/ui/toast";
import { LicenceDialog } from "./DocForms";
import { licenceDocs } from "./docs";
import { FileLink, useDrivers, useFleetCan, useMoney, useNames } from "./shared";

function useYear() {
  const { db } = useNames();
  const day = useDay();
  const from = addDays(day, -365);
  return useMemo(() => spendLines(db.garageInvoices).filter((l) => l.date >= from), [db.garageInvoices, from]);
}

/** Open or close a pop-up by a setting in the address, so Back comes back to it open. */
function useOpen(name: string): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  return [
    params.get(name),
    (id) =>
      setParams(
        (p) => {
          if (id) p.set(name, id);
          else p.delete(name);
          return p;
        },
        { replace: !id },
      ),
  ];
}

/** Repairs as a short list, each row opening its invoice. */
export function RepairList({ lines, empty }: { lines: SpendLine[]; empty: string }) {
  const { reg, garage } = useNames();
  const { m2 } = useMoney();
  const navigate = useNavigate();
  const rows = [...lines].sort((a, b) => b.date.localeCompare(a.date));
  if (!rows.length) return <p className="px-3 py-3 text-muted">{empty}</p>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Invoice</th>
          <th>Vehicle</th>
          <th>Work done</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.id} className="rowlink cursor-pointer" title="Open this invoice" onClick={() => navigate(`/fleet/invoices/${l.invoiceId}`)}>
            <td className="whitespace-nowrap text-muted">{dNear(l.date, getDay())}</td>
            <td className="whitespace-nowrap">
              <Link to={`/fleet/invoices/${l.invoiceId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent-ink hover:underline">
                {l.invoiceNo || "No number"}
              </Link>
              <span className="block text-[0.87rem] text-muted">{garage(l.garageId)}</span>
            </td>
            <td className="whitespace-nowrap">{reg(l.vehicleId)}</td>
            <td>{l.description || l.category}</td>
            <td className="num font-medium">{m2(l.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Drivers ───────────────────────────────────────────────────────────────────

const LICENCE_TONE: Record<string, Tone> = { overdue: "bad", soon: "warn", ok: "ok" };

/** A licence's state as a badge: overdue, due soon or fine, or "Not on file". Flagged when it came from the phone and is still to check. */
function LicenceBadge({ l }: { l?: Licence }) {
  const day = useDay();
  if (!l?.expiryDate) return <span className="text-muted">Not on file</span>;
  const state = dueState(l.expiryDate, day);
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={LICENCE_TONE[state]}>{state === "ok" ? `To ${dNear(l.expiryDate, getDay())}` : dueLabel(l.expiryDate, day)}</Badge>
      {l.fromPhoneAt && <Badge tone="accent">From the phone, to check</Badge>}
    </span>
  );
}

/**
 * Drivers (18 Nov): the people from People who are on the driver list, with the van each drives
 * and their licences (driving licence and Driver CPC). Their name, phone and email stay People's.
 * Click a driver for their licences; taking one off the list asks first and moves them to "Left".
 */
export function Drivers() {
  const { db, base } = useNames();
  const can = useFleetCan();
  const drivers = useDrivers();
  const { m0 } = useMoney();
  const year = useYear();
  const [openId, setOpen] = useOpen("driver");
  const [tab, setTab] = useScreenState<"on" | "left">("drivers.tab", "on");
  const [adding, setAdding] = useState(false);
  const open = drivers.find((d) => d.id === openId);
  const rows = drivers
    .filter((d) => (tab === "on" ? d.active : !d.active))
    .map((d) => ({ d, vans: db.vehicles.filter((v) => v.active && v.driverId === d.id), total: totalOf(year.filter((l) => l.driverId === d.id)) }));
  const left = drivers.filter((d) => !d.active).length;
  const toCheck = drivers.filter((d) => d.active && (d.licences?.driving?.fromPhoneAt || d.licences?.cpc?.fromPhoneAt)).length;
  return (
    <>
      <PageHead
        title="Drivers"
        note={`${plural(drivers.filter((d) => d.active).length, "driver")}${toCheck ? `, ${plural(toCheck, "licence")} sent from the phone to check` : ""}. Drivers are people from People. Repairs count against whoever drives the van, over the last 12 months.`}
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add a driver
            </Button>
          )
        }
      >
        <div className="mt-3">
          <Segmented label="Drivers" value={tab} onChange={setTab} options={[{ value: "on", label: "On the list" }, { value: "left", label: `Left (${left})` }]} />
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={tab === "on" ? "No drivers yet" : "Nobody has left"}>{tab === "on" ? "Add drivers from People here, then give each a van under Vehicles." : "Drivers taken off the list are kept here with their history."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Van</th>
                  <th>Base</th>
                  <th>Driving licence</th>
                  <th>Driver CPC</th>
                  <th className="num">Repairs on their vans</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, vans, total }) => (
                  <tr key={d.id} className="rowlink cursor-pointer" onClick={() => setOpen(d.id)}>
                    <td>
                      <span className="font-medium">{d.name}</span>
                      <span className="block text-[0.87rem] text-muted">{d.trade}{!d.active && d.leftAt ? `. Left ${dNear(d.leftAt, getDay())}` : ""}</span>
                    </td>
                    <td className="whitespace-nowrap">{vans.length ? vans.map((v) => v.reg).join(", ") : <span className="text-muted">Pool vans</span>}</td>
                    <td>{d.baseId ? base(d.baseId) : <span className="text-muted">-</span>}</td>
                    <td><LicenceBadge l={d.licences?.driving} /></td>
                    <td><LicenceBadge l={d.licences?.cpc} /></td>
                    <td className="num font-medium">{m0(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="mt-3 max-w-[70ch] text-[0.93rem] text-muted">A driver can send a new licence from the site phone: it shows here at once, flagged until someone in the office has checked it. A Driver CPC is needed to drive the 7 tonne tippers.</p>
      </PageBody>
      {adding && <AddDriver onClose={() => setAdding(false)} />}
      {open && <DriverBox key={open.id} d={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Put someone from People on the driver list. */
function AddDriver({ onClose }: { onClose: () => void }) {
  const { db } = useNames();
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState("");
  const choices = db.people.filter((p) => p.active && !p.drives).sort((a, b) => a.name.localeCompare(b.name));
  const save = () => {
    const p = db.people.find((x) => x.id === personId);
    if (!p) return setError("Pick the person.");
    addDriver(p.id);
    toast(`${p.name} is on the driver list. Record their licence next`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add a driver" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add driver</Button></>}>
      <div className="grid gap-3">
        <Field label="Person">
          {(id) => (
            <select id={id} className="field" value={personId} onChange={(e) => { setPersonId(e.target.value); setError(""); }}>
              <option value="">Pick from People</option>
              {choices.map((p) => <option key={p.id} value={p.id}>{p.name}, {p.trade}</option>)}
            </select>
          )}
        </Field>
        <p className="text-[0.93rem] text-muted">Someone new to the firm is added under People, Employee register first. Their name, phone and email are kept there.</p>
        <p role="alert" className="min-h-6 text-bad">{error}</p>
      </div>
    </Dialog>
  );
}

/** A driver: their details from People, the van they drive, their licences, and taking them off the list (with a confirm). */
function DriverBox({ d, onClose }: { d: Driver; onClose: () => void }) {
  const { db, base } = useNames();
  const can = useFleetCan();
  const [confirmOff, setConfirmOff] = useState(false);
  const [licence, setLicence] = useState<"driving" | "cpc" | null>(null);
  const vans = db.vehicles.filter((v) => v.active && v.driverId === d.id);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={d.name}
      footer={
        <>
          {!can.manage ? null : d.active ? (
            <Button variant="ghost" className="mr-auto text-bad" onClick={() => setConfirmOff(true)}>
              Take off the list
            </Button>
          ) : (
            <Button variant="ghost" className="mr-auto" onClick={() => { setDriverActive(d.id, true); toast(`${d.name} is back on the list`); onClose(); }}>
              Bring back
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>Done</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {!d.active && <p className="rounded-md bg-canvas px-3 py-2 text-muted">Left {d.leftAt ? dFull(d.leftAt) : ""}. Their checks, repairs and damage reports are kept.</p>}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div><dt className="text-[0.87rem] text-muted">Job</dt><dd>{d.trade}</dd></div>
          <div><dt className="text-[0.87rem] text-muted">Phone</dt><dd>{d.phone ? <Tel number={d.phone} /> : "-"}</dd></div>
          <div><dt className="text-[0.87rem] text-muted">Email</dt><dd className="break-all">{d.email || "-"}</dd></div>
          <div>
            <dt className="text-[0.87rem] text-muted">Drives</dt>
            <dd>
              {vans.length ? vans.map((v, i) => (
                <span key={v.id}>
                  {i > 0 && ", "}
                  <Link to={`/fleet/vehicles/${v.id}`} className="font-medium text-accent-ink hover:underline">{v.reg}</Link> <span className="text-muted">{v.make} {v.model}, {base(v.baseId)}</span>
                </span>
              )) : "The pool vans"}
            </dd>
          </div>
        </dl>
        <p className="text-[0.93rem] text-muted">Name, phone and email are kept under <Link to="/people" className="text-accent-ink underline-offset-2 hover:underline">People, Employee register</Link>.</p>
        <section aria-label="Licences" className="grid gap-2 sm:grid-cols-2">
          {(["driving", "cpc"] as const).map((k) => {
            const l = d.licences?.[k];
            const what = k === "cpc" ? "Driver CPC" : "Driving licence";
            const docs = licenceDocs(d, k);
            return (
              <div key={k} className="rounded-lg border border-line px-3 py-2.5">
                <p className="flex items-center justify-between gap-2">
                  <span className="font-medium">{what}</span>
                  <LicenceBadge l={l} />
                </p>
                <p className="text-[0.93rem] text-muted">{l ? `Runs to ${dFull(l.expiryDate)}` : k === "cpc" ? "Only needed to drive the 7 tonne tippers" : "No date on file yet"}</p>
                {l?.fromPhoneAt && (
                  <p className="mt-1 rounded-md bg-accent-soft px-2.5 py-1.5 text-[0.93rem] text-accent-ink">
                    Sent from the site phone on {dNear(l.fromPhoneAt.slice(0, 10), getDay())} at {tOf(l.fromPhoneAt)}. Open the copy and check the date against it.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {docs.length > 0 && (
                    <FileLink docs={docs} title={`${d.name}, ${what.toLowerCase()}`} note={`Runs to ${l ? dFull(l.expiryDate) : ""}.`}>
                      Open the copy{docs.length > 1 ? ` (${docs.length} files)` : ""}
                    </FileLink>
                  )}
                  {l?.fromPhoneAt && can.manage && (
                    <Button size="sm" onClick={() => { confirmLicence(d.id, k); toast(`${d.name}'s ${what.toLowerCase()} checked`); }}>
                      <CheckCircle size={16} /> Checked
                    </Button>
                  )}
                  {can.manage && <Button size="sm" aria-label={l ? undefined : `Add the ${what.toLowerCase()}`} onClick={() => setLicence(k)}>{l ? "Record a renewal" : "Add"}</Button>}
                </div>
              </div>
            );
          })}
        </section>
      </div>
      {licence && <LicenceDialog d={d} which={licence} onClose={() => setLicence(null)} />}
      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={`Take ${d.name} off the list?`}
        footer={
          <>
            <Button onClick={() => setConfirmOff(false)}>Keep them</Button>
            <Button
              variant="primary"
              onClick={() => {
                setDriverActive(d.id, false);
                toast(`${d.name} moved to Left. Their history is kept`);
                setConfirmOff(false);
                onClose();
              }}
            >
              Take off the list
            </Button>
          </>
        }
      >
        <p>They move to Left. Their checks, repairs and damage reports stay on record, and they can be brought back. Any van they drive keeps them as its driver until you change it under Vehicles.</p>
      </Dialog>
    </Dialog>
  );
}

// ── Bases ─────────────────────────────────────────────────────────────────────

export function Bases() {
  const { db } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const year = useYear();
  const [adding, setAdding] = useState(false);
  const [openId, setOpen] = useOpen("base");
  const open = db.bases.find((b) => b.id === openId);
  const drivers = useDrivers();
  const rows = db.bases.map((b) => ({ b, vehicles: db.vehicles.filter((v) => v.active && v.baseId === b.id).length, drivers: drivers.filter((d) => d.active && d.baseId === b.id).length, total: totalOf(year.filter((l) => l.baseId === b.id)) })).sort((a, b) => b.total - a.total);
  return (
    <>
      <PageHead
        title="Bases"
        note="Where vehicles are kept: the yards and the head office. A repair counts against the base the vehicle was at on the day. Open a base for its vehicles and repairs."
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add a base
            </Button>
          )
        }
      />
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No bases yet">Add the places your vehicles are kept, such as a yard.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Base</th>
                  <th>Kind</th>
                  <th>County</th>
                  <th>Region</th>
                  <th className="num">Vehicles</th>
                  <th className="num">Drivers</th>
                  <th className="num">Repairs, 12 months</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ b, vehicles, drivers, total }) => (
                  <tr key={b.id} className="rowlink cursor-pointer" onClick={() => setOpen(b.id)}>
                    <td className="font-medium">{b.name}</td>
                    <td>{b.kind}</td>
                    <td>{b.county}</td>
                    <td>{b.region}</td>
                    <td className="num">{vehicles}</td>
                    <td className="num">{drivers}</td>
                    <td className="num font-medium">{m0(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && <BaseForm onClose={() => setAdding(false)} />}
      {open && <BaseForm key={open.id} b={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function BaseForm({ b, onClose }: { b?: Base; onClose: () => void }) {
  const { db, driver } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const year = useYear();
  const [name, setName] = useState(b?.name ?? "");
  const [county, setCounty] = useState(b?.county ?? "");
  const [region, setRegion] = useState(b?.region ?? "");
  const [kind, setKind] = useState<BaseKind>(b?.kind ?? "Yard");
  const [error, setError] = useState("");
  const save = () => {
    if (!name.trim()) return setError("Enter the base's name.");
    if (b) updateBase(b.id, { name, county, region, kind });
    else addBase({ name, county, region, kind });
    toast(b ? `${name.trim()} saved` : `${name.trim()} added`);
    onClose();
  };
  const vehicles = b ? db.vehicles.filter((v) => v.active && v.baseId === b.id).sort((x, y) => x.reg.localeCompare(y.reg)) : [];
  const repairs = b ? year.filter((l) => l.baseId === b.id) : [];
  const form = (
    <div className="grid content-start gap-3 sm:grid-cols-2">
      <Field label="Kind">
        {(id) => (
          <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as BaseKind)}>
            <option value="Yard">Yard</option>
            <option value="Office">Office</option>
          </select>
        )}
      </Field>
      <Field label="Name">{(id) => <input id={id} className="field" placeholder="e.g. Naas yard" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />}</Field>
      <Field label="County">{(id) => <input id={id} className="field" value={county} onChange={(e) => setCounty(e.target.value)} />}</Field>
      <Field label="Region">{(id) => <input id={id} className="field" placeholder="e.g. West" value={region} onChange={(e) => setRegion(e.target.value)} />}</Field>
      <p role="alert" className="min-h-6 text-bad sm:col-span-2">{error}</p>
    </div>
  );
  return (
    <Dialog open size={b ? "xl" : "md"} onClose={onClose} title={b ? b.name : "Add a base"} footer={<><Button onClick={onClose}>{can.manage ? "Cancel" : "Close"}</Button>{can.manage && <Button variant="primary" onClick={save}>{b ? "Save changes" : "Add base"}</Button>}</>}>
      {!b ? (
        form
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="grid content-start gap-4">
            {form}
            <section aria-label="Vehicles kept here">
              <h3 className="mb-1.5 text-[1.05rem]">Vehicles kept here ({vehicles.length})</h3>
              {vehicles.length === 0 ? (
                <p className="text-muted">No vehicles are kept here.</p>
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {vehicles.map((v) => (
                    <li key={v.id}>
                      <Link to={`/fleet/vehicles/${v.id}`} className="block rounded-md border border-line-strong px-2.5 py-1 hover:border-accent">
                        <span className="font-medium text-accent-ink">{v.reg}</span> <span className="text-muted">{v.make} {v.model}</span>
                        <span className="block text-[0.87rem] text-muted">{v.driverId ? driver(v.driverId) : "Pool vehicle"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <section aria-label="Repairs at this base">
            <h3 className="mb-1.5 text-[1.05rem]">
              Repairs at this base, last 12 months <span className="font-sans text-[0.93rem] font-normal text-muted">{m0(totalOf(repairs))}</span>
            </h3>
            <div className="max-h-[30rem] overflow-auto rounded-lg border border-line">
              <RepairList lines={repairs} empty="No repairs counted against this base in the last 12 months." />
            </div>
          </section>
        </div>
      )}
    </Dialog>
  );
}
