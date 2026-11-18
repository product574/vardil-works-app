/**
 * Garages: the list, and one garage on a page of its own (decision 44, option B of three
 * pictures; made a full page on 18 Nov): its contact details as links, its figures, then tabs:
 * Invoice history (each row opens that invoice), Vehicles, and Private notes. Notes are dated,
 * can be deleted with a confirm, and are never edited.
 */
import { ArrowLeft, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { addGarage, addGarageNote, deleteGarageNote, updateGarage } from "@/data/actions";
import { useDay } from "@/data/store";
import type { Garage, GarageNote } from "@/data/types";
import { addDays } from "@/lib/dates";
import { invoiceCount, invoiceWarnings, spendLines, totalOf } from "@/lib/fleet-spend";
import { dFull, dShort, plural, tOf } from "@/lib/format";
import { Button, cx, Dialog, Empty, Field, Mail, PageBody, PageHead, Panel, Segmented, Tel } from "@/ui";
import { toast } from "@/ui/toast";
import { InvoiceTable } from "./Invoices";
import { useFleetCan, useMoney, useNames } from "./shared";

export function Garages() {
  const { db } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const day = useDay();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const year = spendLines(db.garageInvoices).filter((l) => l.date >= addDays(day, -365));
  const rows = db.garages
    .map((g) => {
      const ls = year.filter((l) => l.garageId === g.id);
      return { g, total: totalOf(ls), invoices: invoiceCount(ls), vehicles: new Set(ls.map((l) => l.vehicleId)).size };
    })
    .sort((a, b) => b.total - a.total);
  // An older link (?garage=) goes to the garage's own page.
  const old = params.get("garage");
  if (old) return <Navigate to={`/fleet/garages/${old}`} replace />;
  return (
    <>
      <PageHead
        title="Garages"
        note={`${plural(db.garages.length, "garage")}. Spend is for the last 12 months. Open a garage for its invoices, contact details and notes.`}
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={18} /> Add a garage
            </Button>
          )
        }
      />
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No garages yet">Add them here, or as you upload their first invoice.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Garage</th>
                  <th>Location</th>
                  <th>Contact</th>
                  <th className="num">Vehicles</th>
                  <th className="num">Invoices</th>
                  <th className="num">Average invoice</th>
                  <th className="num">Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ g, total, invoices, vehicles }) => (
                  <tr key={g.id} className="rowlink cursor-pointer" onClick={() => navigate(`/fleet/garages/${g.id}`)}>
                    <td className="font-medium">
                      <Link to={`/fleet/garages/${g.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {g.name}
                      </Link>
                    </td>
                    <td>{[g.town, g.county].filter(Boolean).join(", ")}</td>
                    <td className="text-muted">{[g.contact, g.phone].filter(Boolean).join(", ") || "-"}</td>
                    <td className="num">{vehicles}</td>
                    <td className="num">{invoices}</td>
                    <td className="num">{invoices ? m0(total / invoices) : "-"}</td>
                    <td className="num font-medium">{m0(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && <GarageForm onClose={(id) => { setAdding(false); if (id) navigate(`/fleet/garages/${id}`); }} />}
    </>
  );
}

export function GaragePage() {
  const { garageId } = useParams();
  const { db, base } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const day = useDay();
  const [tab, setTab] = useScreenState<"invoices" | "vehicles" | "notes">(`garage.${garageId}.tab`, "invoices");
  const [editing, setEditing] = useState(false);
  const g = db.garages.find((x) => x.id === garageId);
  if (!g)
    return (
      <>
        <PageHead title="Garage not found" note="This garage is not on the list." />
        <PageBody>
          <Link to="/fleet/garages" className="inline-flex items-center gap-1.5 font-medium text-accent-ink hover:underline">
            <ArrowLeft size={16} /> All garages
          </Link>
        </PageBody>
      </>
    );
  const invoices = db.garageInvoices.filter((i) => i.garageId === g.id);
  const lines = spendLines(invoices);
  const year = lines.filter((l) => l.date >= addDays(day, -365));
  const yearInvoices = invoiceCount(year);
  const notes = db.garageNotes.filter((n) => n.garageId === g.id).sort((a, b) => b.at.localeCompare(a.at));
  const warnings = invoiceWarnings(db.garageInvoices, day);
  const vehicles = db.vehicles
    .map((v) => ({ v, ls: lines.filter((l) => l.vehicleId === v.id) }))
    .filter((x) => x.ls.length)
    .map((x) => ({ ...x, total: totalOf(x.ls), last: x.ls.map((l) => l.date).sort().at(-1)! }))
    .sort((a, b) => b.total - a.total);
  return (
    <>
      <PageHead
        title={g.name}
        note={[g.town, g.county && `Co. ${g.county}`].filter(Boolean).join(", ") || "No location recorded"}
        actions={
          can.manage && (
            <Button onClick={() => setEditing(true)}>
              <PencilSimple size={16} /> Edit details
            </Button>
          )
        }
      />
      <PageBody>
        <div className="grid gap-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Panel className="px-4 py-3">
              <h2 className="mb-1.5 text-[1.05rem]">Contact</h2>
              <dl className="grid gap-1.5">
                <Row label="Contact">{g.contact || "Nobody named yet"}</Row>
                <Row label="Phone">{g.phone ? <Tel number={g.phone} /> : "Not recorded"}</Row>
                <Row label="Email">{g.email ? <Mail address={g.email} /> : "Not recorded"}</Row>
                <Row label="Location">{[g.town, g.county].filter(Boolean).join(", ") || "Not recorded"}</Row>
                {g.notes && <Row label="About">{g.notes}</Row>}
              </dl>
            </Panel>
            <Panel className="grid grid-cols-2 sm:grid-cols-4">
              <Figure label="Spend, 12 months" value={m0(totalOf(year))} />
              <Figure label="Invoices, 12 months" value={String(yearInvoices)} />
              <Figure label="Average invoice" value={yearInvoices ? m0(totalOf(year) / yearInvoices) : "-"} />
              <Figure label="To check" value={String(invoices.filter((i) => i.status === "To check").length)} />
            </Panel>
          </div>
          <Segmented
            label="Garage"
            value={tab}
            onChange={setTab}
            options={[
              { value: "invoices", label: "Invoice history", count: invoices.length },
              { value: "vehicles", label: "Vehicles", count: vehicles.length },
              { value: "notes", label: "Private notes", count: notes.length },
            ]}
          />
          {tab === "invoices" && (
            <Panel className="overflow-x-auto">{invoices.length === 0 ? <Empty title="No invoices from this garage yet">Upload one under Invoices and it shows here.</Empty> : <InvoiceTable invoices={invoices} warnings={warnings} hide="garage" />}</Panel>
          )}
          {tab === "vehicles" && (
            <Panel className="overflow-x-auto">
              {vehicles.length === 0 ? (
                <Empty title="No vehicles yet">Vehicles this garage has worked on are listed here.</Empty>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th>Base</th>
                      <th className="num">Visits</th>
                      <th>Last here</th>
                      <th className="num">Spend here, in all</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vehicles.map(({ v, ls, total, last }) => (
                      <tr key={v.id}>
                        <td className="font-medium">
                          <Link to={`/fleet/vehicles/${v.id}`} className="text-accent-ink hover:underline">
                            {v.reg}
                          </Link>
                          <span className="ml-2 font-normal text-muted">{v.make} {v.model}{v.active ? "" : ", removed"}</span>
                        </td>
                        <td>{base(v.baseId)}</td>
                        <td className="num">{invoiceCount(ls)}</td>
                        <td className="whitespace-nowrap">{dFull(last)}</td>
                        <td className="num font-medium">{m0(total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          )}
          {tab === "notes" && <Notes garage={g} notes={notes} />}
        </div>
      </PageBody>
      {editing && <GarageForm g={g} onClose={() => setEditing(false)} />}
    </>
  );
}

function Notes({ garage, notes }: { garage: Garage; notes: GarageNote[] }) {
  const can = useFleetCan();
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState<GarageNote | null>(null);
  const add = () => {
    if (!text.trim()) return;
    addGarageNote(garage.id, text);
    setText("");
    toast("Note added");
  };
  return (
    <Panel className="px-4 py-3">
      <p className="mb-2 text-[0.93rem] text-muted">Only seen inside your company. A note is dated and kept as written: one that is wrong can be deleted and written again.</p>
      <div className={cx("flex flex-wrap items-end gap-2", !can.manage && "hidden")}>
        <Field label="Add a note" className="min-w-0 flex-1 basis-80">
          {(id) => <textarea id={id} rows={2} maxLength={1000} className="field" placeholder="e.g. Closed for the August bank holiday week" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <Button variant="primary" disabled={!text.trim()} onClick={add}>
          Add note
        </Button>
      </div>
      {notes.length === 0 ? (
        <p className="mt-4 text-muted">No notes yet.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[0.87rem] text-muted">
                  {dFull(n.at.slice(0, 10))}, {tOf(n.at)}, {n.by}
                </span>
                {n.text}
              </span>
              <button type="button" aria-label={`Delete the note of ${dShort(n.at.slice(0, 10))}`} hidden={!can.manage} className="press grid size-8 shrink-0 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad" onClick={() => setDeleting(n)}>
                <Trash size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this note?"
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Keep it</Button>
            <Button variant="primary" onClick={() => { if (deleting) deleteGarageNote(deleting.id); setDeleting(null); toast("Note deleted"); }}>
              Delete note
            </Button>
          </>
        }
      >
        <p className="rounded-md bg-canvas px-3 py-2">{deleting?.text}</p>
        <p className="mt-2 text-muted">It cannot be brought back.</p>
      </Dialog>
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-medium break-words">{children}</dd>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line px-4 py-3 max-sm:[&:nth-child(-n+2)]:border-b sm:[&:not(:last-child)]:border-r">
      <p className="text-[0.93rem] text-muted">{label}</p>
      <p className="font-display text-[1.5rem] font-semibold">{value}</p>
    </div>
  );
}

export function GarageForm({ g, onClose }: { g?: Garage; onClose: (addedId?: string) => void }) {
  const [f, setF] = useState({ name: g?.name ?? "", town: g?.town ?? "", county: g?.county ?? "", phone: g?.phone ?? "", email: g?.email ?? "", contact: g?.contact ?? "", notes: g?.notes ?? "" });
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => { setF((x) => ({ ...x, [k]: v })); setError(""); };
  const save = () => {
    if (!f.name.trim()) return setError("Enter the garage's name.");
    const id = g ? (updateGarage(g.id, f), undefined) : addGarage(f);
    toast(g ? "Garage saved" : `${f.name.trim()} added`);
    onClose(id);
  };
  return (
    <Dialog open onClose={() => onClose()} title={g ? `Edit ${g.name}` : "Add a garage"} footer={<><Button onClick={() => onClose()}>Cancel</Button><Button variant="primary" onClick={save}>{g ? "Save changes" : "Add garage"}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">{(id) => <input id={id} className="field" value={f.name} onChange={(e) => set("name", e.target.value)} />}</Field>
        <Field label="Contact">{(id) => <input id={id} className="field" value={f.contact} onChange={(e) => set("contact", e.target.value)} />}</Field>
        <Field label="Location">{(id) => <input id={id} className="field" value={f.town} onChange={(e) => set("town", e.target.value)} />}</Field>
        <Field label="County">{(id) => <input id={id} className="field" value={f.county} onChange={(e) => set("county", e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <input id={id} type="tel" className="field" value={f.phone} onChange={(e) => set("phone", e.target.value)} />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" className="field" value={f.email} onChange={(e) => set("email", e.target.value)} />}</Field>
        <Field label="About the garage" hint="Optional. Dated notes go on the garage's page." className="sm:col-span-2">{(id) => <input id={id} className="field" value={f.notes} onChange={(e) => set("notes", e.target.value)} />}</Field>
        <p role="alert" className="min-h-6 text-bad sm:col-span-2">{error}</p>
      </div>
    </Dialog>
  );
}
