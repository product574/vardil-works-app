/**
 * Upload a garage invoice, or correct a saved one (the same form, filled in). The document sits
 * on the left of a wide window and the form on the right (Oisin, 18 Nov): the AI model reads the
 * document and fills the form, and a person checks each box against it before saving.
 *
 * The fields are the Lovable prototype's (registration, amount, work done, garage, repair date,
 * garage location), plus the invoice number (for the duplicate check), the category, the mileage,
 * and a line per vehicle when one invoice covers several.
 */
import { Plus, Trash } from "@phosphor-icons/react";
import { type FormEvent, useEffect, useState } from "react";
import type { InvoiceReading, Reading } from "@/ai/reading";
import { addGarage, type LineDraft, saveInvoice, updateInvoice } from "@/data/actions";
import { getDay, getDb, useDay } from "@/data/store";
import type { Db, ID, RepairCategory, RepairInvoice } from "@/data/types";
import { normaliseReg } from "@/lib/fleet";
import { CATEGORIES, guessCategory, recentRepair, sameNumber } from "@/lib/fleet-spend";
import { dNear, plural } from "@/lib/format";
import { r2 } from "@/lib/money";
import { Button, Dialog, Field, NumInput, useOnce } from "@/ui";
import { toast } from "@/ui/toast";
import { invoiceDocs, invoiceFiles } from "./docs";
import { useMoney, useNames } from "./shared";
import { type Picked, ReadBanner, Split, UploadPane, useUpload } from "./upload";
import { VehicleForm } from "./VehicleForm";

type LineForm = { key: number; lineId?: ID; reg: string; amount: number; description: string; category: RepairCategory; categoryTouched: boolean; mileage: number };
const blankLine = (key: number): LineForm => ({ key, reg: "", amount: 0, description: "", category: "Other", categoryTouched: false, mileage: 0 });

export type InvoicePreset = { garageId?: ID; invoiceNo?: string; reg?: string; amount?: number; from?: string };

const plain = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|the|and|&)\b/g, "").replace(/[^a-z0-9]/g, "");
/** The garage on the list that an invoice's heading names, if any. */
export function matchGarage(db: Db, name: string): ID | null {
  const n = plain(name);
  if (n.length < 3) return null;
  return db.garages.find((g) => plain(g.name) === n)?.id ?? db.garages.find((g) => plain(g.name).length >= 4 && (n.includes(plain(g.name)) || plain(g.name).includes(n)))?.id ?? null;
}

export function UploadInvoiceDialog({
  onClose,
  presetVehicleId,
  preset,
  editing,
  initialFiles,
  initialReading,
}: {
  onClose: (savedId?: ID) => void;
  presetVehicleId?: ID;
  preset?: InvoicePreset;
  /** A saved invoice to correct: the same form, filled in. */
  editing?: RepairInvoice;
  initialFiles?: Picked[];
  initialReading?: InvoiceReading;
}) {
  const { db, reg } = useNames();
  const { m2 } = useMoney();
  const day = useDay();
  const [garageId, setGarageId] = useState(editing?.garageId ?? preset?.garageId ?? "");
  const [newGarage, setNewGarage] = useState({ name: "", town: "", county: "" });
  const [invoiceNo, setInvoiceNo] = useState(editing?.invoiceNo ?? preset?.invoiceNo ?? "");
  const [date, setDate] = useState(editing?.date ?? "");
  const [vat, setVat] = useState(editing?.vat ?? 0);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [lines, setLines] = useState<LineForm[]>(
    editing
      ? editing.lines.map((l, i) => ({ key: i + 1, lineId: l.id, reg: reg(l.vehicleId), amount: l.amount, description: l.description, category: l.category, categoryTouched: true, mileage: l.mileage ?? 0 }))
      : [{ ...blankLine(1), reg: presetVehicleId ? reg(presetVehicleId) : (preset?.reg ?? ""), amount: preset?.amount ?? 0 }],
  );
  const [error, setError] = useState("");
  // The line whose registration is being added to the fleet, from the "Add it now" button.
  const [addingFor, setAddingFor] = useState<number | null>(null);

  /** What the AI read goes into the boxes; a person checks it. A vehicle already chosen (from its own page) is kept. */
  const fill = (r: Reading) => {
    if (r.kind !== "invoice") return;
    const now = getDb();
    const g = matchGarage(now, r.garageName);
    if (g) setGarageId(g);
    else if (r.garageName) {
      setGarageId("new");
      setNewGarage({ name: r.garageName, town: r.garageTown, county: r.garageCounty });
    }
    if (r.invoiceNo) setInvoiceNo(r.invoiceNo);
    if (r.date && r.date <= day) setDate(r.date);
    if (r.vat > 0) setVat(r.vat);
    const read = r.lines.length ? r.lines : r.total > 0 ? [{ reg: "", amount: r.total, description: "", mileage: 0, category: "Other" }] : [];
    if (read.length)
      setLines(
        read.map((l, i) => ({
          key: i + 1,
          reg: l.reg ? normaliseReg(l.reg) : presetVehicleId && read.length === 1 ? reg(presetVehicleId) : "",
          amount: l.amount > 0 ? l.amount : read.length === 1 ? r.total : 0,
          description: l.description,
          category: (CATEGORIES as string[]).includes(l.category) && l.category !== "Other" ? (l.category as RepairCategory) : guessCategory(l.description),
          categoryTouched: l.category !== "Other",
          mileage: l.mileage,
        })),
      );
  };
  const up = useUpload({ kind: "invoice", initial: initialFiles, initialReading, kept: editing ? invoiceDocs(editing, db).map((doc, i) => ({ doc, proof: invoiceFiles(editing)[i]! })) : undefined, onRead: fill });

  const live = db.vehicles.filter((v) => v.active);
  const findVehicle = (r: string) => db.vehicles.find((v) => normaliseReg(v.reg).replace(/-/g, "") === normaliseReg(r).replace(/-/g, ""));
  const repairDate = date || day;
  // An invoice being corrected is not a duplicate of itself, nor a repeat of its own repair.
  const others = editing ? db.garageInvoices.filter((i) => i.id !== editing.id) : db.garageInvoices;
  const dup = garageId && garageId !== "new" ? sameNumber(others, garageId, invoiceNo) : undefined;
  const total = r2(lines.reduce((t, l) => t + (l.amount || 0), 0));

  useEffect(() => setError(""), [garageId, invoiceNo, lines]);

  const setLine = (key: number, patch: Partial<LineForm>) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (patch.description !== undefined && !next.categoryTouched) next.category = guessCategory(next.description);
        return next;
      }),
    );

  const [save, busy] = useOnce(() => {
    if (!garageId) return setError("Choose the garage, or add a new one.");
    if (garageId === "new" && !newGarage.name.trim()) return setError("Enter the new garage's name.");
    const drafts: LineDraft[] = [];
    for (const [i, l] of lines.entries()) {
      const v = findVehicle(l.reg);
      const which = lines.length > 1 ? ` on line ${i + 1}` : "";
      if (!l.reg.trim()) return setError(`Enter the registration${which}.`);
      if (!v) return setError(`${normaliseReg(l.reg)}${which} is not on the fleet yet. Use "Add it now" under the registration, or correct it.`);
      if (!(l.amount > 0)) return setError(`Enter the amount${which}.`);
      drafts.push({ ...(l.lineId ? { id: l.lineId } : {}), vehicleId: v.id, category: l.category, description: l.description, mileage: l.mileage > 0 ? Math.round(l.mileage) : null, amount: l.amount });
    }
    const gid = garageId === "new" ? addGarage({ name: newGarage.name, town: newGarage.town, county: newGarage.county }) : garageId;
    if (editing) {
      const res = updateInvoice(editing.id, { invoiceNo, garageId: gid, date: repairDate, lines: drafts, vat: vat > 0 ? vat : null, notes }, up.changed ? up.fileIns() : undefined);
      toast(res === "unchecked" ? `Invoice ${invoiceNo || "with no number"} corrected. It is back to check` : `Invoice ${invoiceNo || "with no number"} corrected`);
      onClose(editing.id);
    } else {
      const id = saveInvoice({ invoiceNo, garageId: gid, date: repairDate, lines: drafts, vat: vat > 0 ? vat : null, notes }, up.fileIns());
      toast(`Invoice saved, ${m2(total)}. It is marked to check`);
      onClose(id);
    }
  });

  return (
    <Dialog
      open
      size="xl"
      split
      onClose={() => onClose()}
      title={editing ? `Edit invoice ${editing.invoiceNo || "with no number"}` : "Upload an invoice"}
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" disabled={busy || up.status.state === "reading"} onClick={() => void save()}>
            {editing ? "Save changes" : "Confirm and save"}
          </Button>
        </>
      }
    >
      <Split
        left={<UploadPane up={up} what="invoice file" />}
        right={
          <form
            className="grid gap-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void save();
            }}
          >
            {editing ? (
              <p className="text-muted">{editing.status === "Checked" ? "Correct anything that was entered wrongly. This invoice has been checked, so saving a change puts it back to check." : "Correct anything that was entered wrongly, then save."}</p>
            ) : (
              <ReadBanner up={up} />
            )}
            {preset?.from && <p className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">Started from the email from {preset.from}. What the email gave is filled in: check it against the invoice, and attach the file from the email.</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Garage / mechanic" className="sm:col-span-2">
                {(id) => (
                  <select id={id} className="field" value={garageId} onChange={(e) => setGarageId(e.target.value)}>
                    <option value="">Choose the garage</option>
                    {db.garages.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}, {g.town}
                      </option>
                    ))}
                    <option value="new">A new garage</option>
                  </select>
                )}
              </Field>
              {garageId === "new" && (
                <div className="grid gap-3 rounded-lg bg-canvas px-3 py-3 sm:col-span-2 sm:grid-cols-3">
                  <Field label="New garage's name">{(id) => <input id={id} className="field" placeholder="e.g. Corrib Motors" value={newGarage.name} onChange={(e) => setNewGarage({ ...newGarage, name: e.target.value })} />}</Field>
                  <Field label="Garage location">{(id) => <input id={id} className="field" placeholder="e.g. Oranmore" value={newGarage.town} onChange={(e) => setNewGarage({ ...newGarage, town: e.target.value })} />}</Field>
                  <Field label="County">{(id) => <input id={id} className="field" placeholder="e.g. Galway" value={newGarage.county} onChange={(e) => setNewGarage({ ...newGarage, county: e.target.value })} />}</Field>
                </div>
              )}
              <Field label="Invoice number">{(id) => <input id={id} className="field" placeholder="e.g. CM-20418" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />}</Field>
              <Field label="Repair date" hint="The day the work was done. Blank uses today.">
                {(id) => <input id={id} type="date" className="field" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}
              </Field>
            </div>
            {dup && (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">
                Invoice {dup.invoiceNo} from this garage is already in, dated {dNear(dup.date, getDay())}, {m2(dup.total)}. Check this is not the same invoice before saving.
              </p>
            )}

            <datalist id="regs">
              {live.map((v) => (
                <option key={v.id} value={v.reg}>
                  {v.make} {v.model}
                </option>
              ))}
            </datalist>
            <fieldset className="grid gap-3">
              <legend className="mb-1 font-medium">{lines.length > 1 ? `Vehicles on this invoice (${lines.length})` : "Vehicle"}</legend>
              {lines.map((l, i) => {
                const v = l.reg.trim() ? findVehicle(l.reg) : undefined;
                const recent = v ? recentRepair(others, v.id, repairDate) : null;
                return (
                  <div key={l.key} className="grid gap-3 rounded-lg border border-line px-3 py-3">
                    <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
                      <Field label={`Registration${lines.length > 1 ? ` ${i + 1}` : ""}`}>
                        {(id) => <input id={id} list="regs" className="field uppercase" placeholder="e.g. 221-G-1843" autoCapitalize="characters" value={l.reg} onChange={(e) => setLine(l.key, { reg: e.target.value })} />}
                      </Field>
                      <Field label="Amount, VAT included">{() => <NumInput label="Amount" className="w-full" value={l.amount} onChange={(n) => setLine(l.key, { amount: n })} />}</Field>
                      <Field label="Mileage (km)">{() => <NumInput label="Mileage" className="w-full" value={l.mileage} onChange={(n) => setLine(l.key, { mileage: n })} />}</Field>
                      {lines.length > 1 && (
                        <button type="button" aria-label={`Remove vehicle ${i + 1}`} className="press mt-6 grid size-9 place-items-center self-start rounded-md text-muted hover:bg-bad-soft hover:text-bad" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash size={16} />
                        </button>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
                      <Field label="Work done">{(id) => <input id={id} className="field" placeholder="e.g. Rear brake pads" value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />}</Field>
                      <Field label="Category">
                        {(id) => (
                          <select id={id} className="field" value={l.category} onChange={(e) => setLine(l.key, { category: e.target.value as RepairCategory, categoryTouched: true })}>
                            {CATEGORIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        )}
                      </Field>
                    </div>
                    {l.reg.trim().length >= 4 && !v && (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.93rem] text-warn">
                        {normaliseReg(l.reg)} is not on the fleet yet.
                        <Button size="sm" onClick={() => setAddingFor(l.key)}>
                          <Plus size={14} /> Add it now
                        </Button>
                      </p>
                    )}
                    {v && (
                      <p className="text-[0.93rem] text-muted">
                        {v.make} {v.model}, {db.bases.find((b) => b.id === v.baseId)?.name ?? "no base"}, {db.people.find((p) => p.id === v.driverId)?.name ?? "pool vehicle"}
                        {!v.active && ", removed from the fleet"}.
                        {recent && <span className="text-warn"> Last repaired {recent.days === 0 ? "the same day" : `${plural(recent.days, "day")} before`} ({recent.invoiceNo || "no number"}), so this will show as a repeat repair.</span>}
                      </p>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setLines((ls) => [...ls, blankLine(Math.max(...ls.map((x) => x.key)) + 1)])}>
                  <Plus size={16} /> Add another vehicle on this invoice
                </Button>
                <p className="font-medium">Total {m2(total)}</p>
              </div>
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label="VAT on the invoice" hint="Optional">{() => <NumInput label="VAT" className="w-full" value={vat} onChange={setVat} />}</Field>
              <Field label="Notes" hint="Optional">{(id) => <input id={id} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
            </div>
            <p role="alert" aria-live="polite" className="min-h-6 text-bad">
              {error}
            </p>
            <button type="submit" className="sr-only" tabIndex={-1}>
              Save
            </button>
          </form>
        }
      />
      {addingFor != null && (
        <VehicleForm
          initialReg={lines.find((l) => l.key === addingFor)?.reg ?? ""}
          onClose={(addedId) => {
            // Saved under a corrected registration: the invoice line follows it.
            const added = addedId ? getDb().vehicles.find((x) => x.id === addedId) : undefined;
            if (added) setLine(addingFor, { reg: added.reg });
            setAddingFor(null);
          }}
        />
      )}
    </Dialog>
  );
}
