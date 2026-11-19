/**
 * Garage invoices: the list with its warnings, and one invoice on a page of its own (Oisin,
 * 18 Nov) with the invoice itself shown beside the details. From there it is marked checked, put
 * back to check (with a note saying why), corrected, or deleted. The upload form is InvoiceForm.tsx.
 */
import { ArrowLeft, PencilSimple, Trash, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { deleteInvoice, setInvoiceStatus } from "@/data/actions";
import { getDay, useDay } from "@/data/store";
import type { ID, RepairInvoice } from "@/data/types";
import { CATEGORIES as ALL_CATEGORIES, invoiceWarnings, type InvoiceWarning, warningsFor } from "@/lib/fleet-spend";
import { dFull, dNear, plural, tOf } from "@/lib/format";
import { Badge, Button, Dialog, Empty, Field, Mail, PageBody, PageHead, Panel, Segmented, Tel } from "@/ui";
import { DocViewer } from "@/ui/DocViewer";
import { toast } from "@/ui/toast";
import { invoiceDocs } from "./docs";
import { UploadInvoiceDialog } from "./InvoiceForm";
import { FilterSelect, useFleetCan, useMoney, useNames } from "./shared";

export const CATEGORIES = ALL_CATEGORIES;
export { UploadInvoiceDialog, type InvoicePreset } from "./InvoiceForm";

// ── The list ──────────────────────────────────────────────────────────────────

export function Invoices() {
  const { db, reg } = useNames();
  const can = useFleetCan();
  const day = useDay();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useScreenState<"To check" | "Checked" | "all">("invoices.status", "all");
  const [garageId, setGarageId] = useScreenState("invoices.garage", "");
  const [q, setQ] = useScreenState("invoices.q", "");
  const [uploading, setUploading] = useState(false);
  const warnings = invoiceWarnings(db.garageInvoices, day);
  const toCheck = db.garageInvoices.filter((i) => i.status === "To check").length;

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/[\s-]/g, "");
    return db.garageInvoices.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (!garageId || i.garageId === garageId) &&
        (!s || i.invoiceNo.toLowerCase().replace(/[\s-]/g, "").includes(s) || i.lines.some((l) => reg(l.vehicleId).toLowerCase().replace(/-/g, "").includes(s) || l.description.toLowerCase().replace(/\s/g, "").includes(s))),
    );
  }, [db.garageInvoices, status, garageId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = rows.slice(0, 200);
  const openInvoice = (id: ID) => navigate(`/fleet/invoices/${id}`);
  // An older link (?invoice=) goes to the invoice's own page.
  const old = params.get("invoice");
  if (old) return <Navigate to={`/fleet/invoices/${old}`} replace />;

  return (
    <>
      <PageHead
        title="Invoices"
        note={`${plural(db.garageInvoices.length, "garage invoice")}, ${toCheck} to check.`}
        actions={
          can.manage && (
            <Button variant="primary" onClick={() => setUploading(true)}>
              <UploadSimple size={18} /> Upload an invoice
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All" }, { value: "To check", label: `To check (${toCheck})` }, { value: "Checked", label: "Checked" }]} />
          <FilterSelect label="Garage" all="All garages" value={garageId} onChange={setGarageId} options={db.garages.map((g) => ({ value: g.id, label: g.name }))} />
          <input type="search" aria-label="Search invoices" placeholder="Invoice number, registration or work" className="field h-9 max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </PageHead>
      <PageBody>
        <div className="grid gap-4">
          {warnings.length > 0 && <WarningsPanel warnings={warnings} onOpen={openInvoice} />}
          <Panel className="overflow-x-auto">
            {shown.length === 0 ? (
              <Empty title={db.garageInvoices.length ? "No invoices match" : "No invoices yet"}>{db.garageInvoices.length ? "Clear the search or pick All to see everything." : "Upload the first garage invoice with the button at the top right."}</Empty>
            ) : (
              <InvoiceTable invoices={shown} warnings={warnings} />
            )}
            {rows.length > shown.length && <p className="px-4 py-2 text-[0.93rem] text-muted">Showing the newest 200 of {rows.length}. Search or filter to find older ones.</p>}
          </Panel>
        </div>
      </PageBody>
      {uploading && <UploadInvoiceDialog onClose={(id) => { setUploading(false); if (id) openInvoice(id); }} />}
    </>
  );
}

/**
 * Invoices as a list, each row opening that invoice's page: used on the Invoices screen, a
 * garage's page, and in a route's or a base's window. `hide` leaves a column out where it would
 * say the same thing on every row.
 */
export function InvoiceTable({ invoices, warnings = [], hide, onOpen }: { invoices: RepairInvoice[]; warnings?: InvoiceWarning[]; hide?: "garage"; onOpen?: (id: ID) => void }) {
  const { garage, reg } = useNames();
  const { m2 } = useMoney();
  const navigate = useNavigate();
  const openInvoice = (id: ID) => (onOpen ? onOpen(id) : navigate(`/fleet/invoices/${id}`));
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Invoice</th>
          {hide !== "garage" && <th>Garage</th>}
          <th>Vehicles</th>
          <th>Work done</th>
          <th className="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((i) => {
          const w = warningsFor(warnings, i.id);
          return (
            <tr key={i.id} className="rowlink cursor-pointer" onClick={() => openInvoice(i.id)}>
              <td className="whitespace-nowrap text-muted">{dNear(i.date, getDay())}</td>
              <td className="font-medium whitespace-nowrap">
                <Link to={`/fleet/invoices/${i.id}`} onClick={(e) => { e.stopPropagation(); if (onOpen) { e.preventDefault(); onOpen(i.id); } }} className="hover:underline">
                  {i.invoiceNo || "No number"}
                </Link>
              </td>
              {hide !== "garage" && (
                <td>
                  <Link to={`/fleet/garages/${i.garageId}`} onClick={(e) => e.stopPropagation()} className="text-accent-ink hover:underline">
                    {garage(i.garageId)}
                  </Link>
                </td>
              )}
              <td className="whitespace-nowrap">{i.lines.map((l) => reg(l.vehicleId)).join(", ")}</td>
              <td className="max-w-[22rem] truncate text-muted">{i.lines.length > 1 ? `${i.lines.length} vehicles` : (i.lines[0]?.description ?? "")}</td>
              <td className="num font-medium">{m2(i.total)}</td>
              <td>
                <span className="flex flex-wrap gap-1">
                  <Badge tone={i.status === "Checked" ? "ok" : "accent"}>{i.status}</Badge>
                  {w.map((x) => (
                    <Badge key={x.kind} tone="bad">
                      {x.kind === "duplicate" ? "Duplicate number" : "Repeat repair"}
                    </Badge>
                  ))}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WarningsPanel({ warnings, onOpen }: { warnings: InvoiceWarning[]; onOpen: (id: ID) => void }) {
  const { garage, reg, db } = useNames();
  const no = (id: ID) => db.garageInvoices.find((i) => i.id === id)?.invoiceNo ?? "";
  return (
    <section aria-label="Warnings" className="rounded-lg border border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-warn-soft px-4 py-3">
      <p className="flex items-center gap-2 font-medium">
        <WarningCircle size={20} className="text-warn" /> {plural(warnings.length, "thing")} to look at
      </p>
      <ul className="mt-2 grid gap-1.5">
        {warnings.map((w, k) => (
          <li key={k} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {w.kind === "duplicate" ? (
                <>
                  <b className="font-medium">Duplicate number.</b> {garage(w.garageId)} invoice {w.invoiceNo} has been entered {w.invoiceIds.length} times.
                </>
              ) : (
                <>
                  <b className="font-medium">Repeat repair.</b> {reg(w.vehicleId)} was repaired twice in {w.days} days ({dNear(w.first, getDay())} and {dNear(w.second, getDay())}).
                </>
              )}
            </span>
            <span className="flex gap-1.5">
              {w.invoiceIds.map((id) => (
                <button key={id} type="button" className="press rounded-md border border-line-strong bg-surface px-2 py-0.5 text-[0.93rem] font-medium hover:border-accent" onClick={() => onOpen(id)}>
                  Open {no(id)}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── One invoice, on its own page ──────────────────────────────────────────────

export function InvoicePage() {
  const { invoiceId } = useParams();
  const { db, garage, base, driver, reg, site } = useNames();
  const can = useFleetCan();
  const { m2 } = useMoney();
  const day = useDay();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [puttingBack, setPuttingBack] = useState(false);
  const inv = db.garageInvoices.find((i) => i.id === invoiceId);
  const docs = useMemo(() => (inv ? invoiceDocs(inv, db) : []), [inv, db.garages, db.vehicles]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inv)
    return (
      <>
        <PageHead title="Invoice not found" note="This invoice is not here any more. It may have been deleted." />
        <PageBody>
          <Link to="/fleet/invoices" className="inline-flex items-center gap-1.5 font-medium text-accent-ink hover:underline">
            <ArrowLeft size={16} /> All invoices
          </Link>
        </PageBody>
      </>
    );
  const warnings = warningsFor(invoiceWarnings(db.garageInvoices, day), inv.id);
  const g = db.garages.find((x) => x.id === inv.garageId);
  const history: { at: string; text: string; note?: string }[] = [
    { at: inv.enteredAt, text: `Entered by ${inv.enteredBy}` },
    ...(inv.backNotes ?? []).map((n) => ({ at: n.at, text: `Put back to check by ${n.by}`, note: n.text })),
    ...(inv.editedAt ? [{ at: inv.editedAt, text: `Corrected by ${inv.editedBy ?? "someone"}` }] : []),
    ...(inv.checkedAt ? [{ at: inv.checkedAt, text: `Marked checked by ${inv.checkedBy ?? "someone"}` }] : []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <>
      <PageHead
        title={`Invoice ${inv.invoiceNo || "with no number"}`}
        note={
          <>
            <Link to={`/fleet/garages/${inv.garageId}`} className="font-medium text-accent-ink hover:underline">
              {g ? `${g.name}, ${g.town}` : garage(inv.garageId)}
            </Link>
            , {dFull(inv.date)}, {m2(inv.total)}
          </>
        }
        actions={
          <>
            {can.manage && (
              <>
                <Button variant="ghost" className="text-bad" onClick={() => setConfirmDelete(true)}>
                  <Trash size={16} /> Delete
                </Button>
                <Button onClick={() => setEditing(true)}>
                  <PencilSimple size={16} /> Edit
                </Button>
              </>
            )}
            {can.check &&
              (inv.status === "To check" ? (
                <Button variant="primary" onClick={() => { setInvoiceStatus(inv.id, "Checked"); toast(`${inv.invoiceNo} marked checked`); }}>
                  Mark checked
                </Button>
              ) : (
                <Button onClick={() => setPuttingBack(true)}>Put back to check</Button>
              ))}
          </>
        }
      >
        <p className="mt-2 flex flex-wrap gap-1.5">
          <Badge tone={inv.status === "Checked" ? "ok" : "accent"}>{inv.status === "Checked" ? `Checked by ${inv.checkedBy ?? "someone"}` : "To check"}</Badge>
          {warnings.map((x) => (
            <Badge key={x.kind} tone="bad">
              {x.kind === "duplicate" ? "Duplicate number" : "Repeat repair"}
            </Badge>
          ))}
        </p>
      </PageHead>
      <PageBody>
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid gap-4">
            {warnings.map((w, k) => (
              <p key={k} className="rounded-md bg-bad-soft px-3 py-2 text-bad">
                {w.kind === "duplicate" ? `This number has been entered ${w.invoiceIds.length} times for ${garage(w.garageId)}. If it is the same invoice, delete the extra one.` : `${reg(w.vehicleId)} was repaired twice in ${w.days} days (${dNear(w.first, getDay())} and ${dNear(w.second, getDay())}).`}{" "}
                {w.invoiceIds.filter((id) => id !== inv.id).map((id) => (
                  <Link key={id} to={`/fleet/invoices/${id}`} className="font-medium underline">
                    Open the other one
                  </Link>
                ))}
              </p>
            ))}
            <Panel className="px-4 py-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Fact label="Garage">
                  <Link to={`/fleet/garages/${inv.garageId}`} className="text-accent-ink hover:underline">
                    {garage(inv.garageId)}
                  </Link>
                  {g && <span className="block text-[0.93rem] font-normal text-muted">{[g.town, g.county].filter(Boolean).join(", ")}</span>}
                </Fact>
                <Fact label="Garage contact">
                  {g?.contact || "-"}
                  {g?.phone && <span className="block text-[0.93rem] font-normal"><Tel number={g.phone} /></span>}
                  {g?.email && <span className="block text-[0.93rem] font-normal"><Mail address={g.email} /></span>}
                </Fact>
                <Fact label="Invoice number">{inv.invoiceNo || "None"}</Fact>
                <Fact label="Repair date">{dFull(inv.date)}</Fact>
                <Fact label="Total, VAT included">{m2(inv.total)}</Fact>
                <Fact label="VAT on it">{inv.vat != null ? m2(inv.vat) : "Not recorded"}</Fact>
                {inv.poNumber && <Fact label="Order number">{inv.poNumber}</Fact>}
              </dl>
            </Panel>
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Base, driver and site then</th>
                    <th>Work done</th>
                    <th className="num">Mileage</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="font-medium whitespace-nowrap">
                        <Link to={`/fleet/vehicles/${l.vehicleId}`} className="text-accent-ink hover:underline">
                          {reg(l.vehicleId)}
                        </Link>
                      </td>
                      <td>
                        {base(l.baseId)}
                        {l.driverId ? <span className="block text-[0.87rem] text-muted">Driver: {driver(l.driverId)}</span> : <span className="block text-[0.87rem] text-muted">Pool vehicle</span>}
                        {l.siteId && <span className="block text-[0.87rem] text-muted">On site that day: <Link to={`/projects/${db.projects.find((p) => p.id === l.siteId)?.code}`} className="text-accent-ink hover:underline">{site(l.siteId)}</Link></span>}
                      </td>
                      <td>
                        {l.description || "-"}
                        <span className="block text-[0.87rem] text-muted">{l.category}</span>
                      </td>
                      <td className="num whitespace-nowrap">{l.mileage ? `${l.mileage.toLocaleString("en-IE")} km` : "-"}</td>
                      <td className="num font-medium">{m2(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
            <Panel className="px-4 py-3">
              <h2 className="mb-1 text-[1.05rem]">Notes and history</h2>
              {inv.notes && <p className="mb-2">{inv.notes}</p>}
              <ul className="grid gap-1.5">
                {history.map((h, k) => (
                  <li key={k}>
                    <span className="text-muted">
                      {dFull(h.at.slice(0, 10))}, {tOf(h.at)}:
                    </span>{" "}
                    {h.text}
                    {h.note && <span className="block rounded-md bg-warn-soft px-2.5 py-1.5 text-warn">Why: {h.note}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
          <DocViewer
            docs={docs}
            className="h-[calc(100dvh-17rem)] min-h-[26rem] xl:sticky xl:top-2"
            empty={
              <span>
                No file is attached to this invoice.
                <br />
                {can.manage && (
                  <button type="button" className="mt-2 font-medium text-accent-ink underline" onClick={() => setEditing(true)}>
                    Add the file
                  </button>
                )}
              </span>
            }
          />
        </div>
      </PageBody>
      {editing && <UploadInvoiceDialog editing={inv} onClose={() => setEditing(false)} />}
      {puttingBack && <PutBackDialog inv={inv} onClose={() => setPuttingBack(false)} />}
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this invoice?"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
            <Button
              variant="primary"
              onClick={() => {
                deleteInvoice(inv.id);
                toast(`Invoice ${inv.invoiceNo} deleted`);
                setConfirmDelete(false);
                navigate("/fleet/invoices", { replace: true });
              }}
            >
              Delete invoice
            </Button>
          </>
        }
      >
        <p>
          {inv.invoiceNo || "This invoice"} from {garage(inv.garageId)}, {m2(inv.total)}, comes off every total and report. Use this for an invoice entered twice or by mistake. It cannot be undone.
        </p>
      </Dialog>
    </>
  );
}

/** Putting a checked invoice back to check needs a note saying why (Oisin, 18 Nov). */
function PutBackDialog({ inv, onClose }: { inv: RepairInvoice; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const go = () => {
    if (!note.trim()) return setError("Say why it is going back to check.");
    setInvoiceStatus(inv.id, "To check", note);
    toast(`${inv.invoiceNo} is back to check`);
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={`Put ${inv.invoiceNo || "this invoice"} back to check?`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={go}>Put back to check</Button></>}>
      <Field label="Why is it going back?" hint="Needed. It is kept on the invoice and in the Activity log, so whoever checks it next knows what to look at.">
        {(id) => <textarea id={id} rows={3} maxLength={500} autoFocus className="field" placeholder="e.g. The amount does not match the garage's statement" value={note} onChange={(e) => { setNote(e.target.value); setError(""); }} />}
      </Field>
      <p role="alert" className="mt-2 min-h-6 text-bad">{error}</p>
    </Dialog>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.87rem] text-muted">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
