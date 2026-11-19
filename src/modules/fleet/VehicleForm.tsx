/**
 * Adding or editing a vehicle (from the Secure-All build, 18 Nov): registration, make and model,
 * type, fuel, base, driver, use, owned or leased, purchase price and month, and mileage.
 *
 * - A van has a driver, picked from People (anyone not yet on the driver list goes on it), or none
 *   for a pool van at the yard.
 * - The registration, make and model cannot be changed once added, so editing shows them as
 *   text. A vehicle typed in wrongly is deleted while it has no records, and added again.
 * - A base can be made here too ("A new base"). The same form opens from Upload invoice when a
 *   registration is not on the fleet yet (`initialReg`).
 */
import { type FormEvent, useState } from "react";
import { addBase, addDriver, addVehicle, regTaken, updateVehicle, type VehicleFields } from "@/data/actions";
import { getDb } from "@/data/store";
import type { Fuel, ID, Vehicle, VehicleKind } from "@/data/types";
import { normaliseReg } from "@/lib/fleet";
import { Button, Dialog, Field, NumInput, useOnce } from "@/ui";
import { toast } from "@/ui/toast";
import { useNames } from "./shared";

const KINDS: VehicleKind[] = ["Van", "Crew van", "Pickup", "Tipper", "Car"];
const FUELS: Fuel[] = ["Diesel", "Petrol", "Hybrid", "Electric"];
export const DIVISIONS = ["Site crew van", "Site manager's van", "Site manager's pickup", "Muck away and materials", "Scaffold and materials", "Joinery", "Leadwork", "Yard", "Contracts manager", "Health and safety", "Management", "Pool van", "Other"];
/** The choice in a list that means "make a new one here". Never a real id. */
const NEW = "new";

export function VehicleForm({ v, initialReg, onClose }: { v?: Vehicle; initialReg?: string; onClose: (addedId?: ID) => void }) {
  const { db } = useNames();
  const [f, setF] = useState<VehicleFields>(
    v
      ? { reg: v.reg, make: v.make, model: v.model, kind: v.kind, fuel: v.fuel, division: v.division, ownership: v.ownership, baseId: v.baseId, driverId: v.driverId, purchasePrice: v.purchasePrice, purchaseMonth: v.purchaseMonth, mileage: v.mileage }
      : { reg: initialReg ? normaliseReg(initialReg) : "", make: "", model: "", kind: "Van", fuel: "Diesel", division: DIVISIONS[0]!, ownership: "Owned", baseId: db.bases[0]?.id ?? null, driverId: null, purchasePrice: null, purchaseMonth: null, mileage: 0 },
  );
  const [newBase, setNewBase] = useState({ name: "", county: "" });
  const [error, setError] = useState("");
  const set = (patch: Partial<VehicleFields>) => {
    setF((x) => ({ ...x, ...patch }));
    setError("");
  };
  // Drivers first, then everyone else at the firm (picking one of them puts them on the driver list).
  const people = db.people.filter((p) => p.active || p.id === f.driverId).sort((a, b) => Number(!!b.drives) - Number(!!a.drives) || a.name.localeCompare(b.name));
  const [save, busy] = useOnce(() => {
    if (!v) {
      if (!f.reg.trim()) return setError("Enter the registration.");
      if (!f.make.trim() && !f.model.trim()) return setError("Enter the make and model.");
      if (regTaken(getDb(), f.reg)) return setError(`${normaliseReg(f.reg)} is already on the list.`);
    }
    if (f.baseId === NEW && !newBase.name.trim()) return setError("Enter the new base's name.");
    // A base typed here is made first, unless one of that name is already there.
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const baseId = f.baseId === NEW ? (getDb().bases.find((b) => same(b.name, newBase.name))?.id ?? addBase({ name: newBase.name, county: newBase.county, region: "" })) : f.baseId;
    const fields: VehicleFields = { ...f, baseId };
    if (f.driverId && !getDb().people.find((p) => p.id === f.driverId)?.drives) addDriver(f.driverId);
    if (v) {
      const { reg: _r, make: _m, model: _o, mileage: _k, ...changes } = fields;
      updateVehicle(v.id, changes);
      toast(`${v.reg} saved`);
      onClose();
    } else {
      const id = addVehicle(fields);
      toast(`${normaliseReg(f.reg)} added to the fleet`);
      onClose(id ?? undefined);
    }
  });
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={v ? `Edit ${v.reg}` : "Add vehicle"}
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            {v ? "Save changes" : "Add vehicle"}
          </Button>
        </>
      }
    >
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e: FormEvent) => { e.preventDefault(); void save(); }}>
        {v ? (
          <div className="rounded-lg bg-canvas px-3 py-2.5 sm:col-span-2">
            <p className="font-medium">
              {v.reg}, {v.make} {v.model}
            </p>
            <p className="text-[0.93rem] text-muted">The registration, make and model cannot be changed. If they were typed in wrongly, delete the vehicle while it has no records and add it again.</p>
          </div>
        ) : (
          <>
            <Field label="Registration">{(id) => <input id={id} className="field uppercase" placeholder="e.g. 251-G-1234" autoCapitalize="characters" value={f.reg} onChange={(e) => set({ reg: e.target.value })} />}</Field>
            <Field label="Make">{(id) => <input id={id} className="field" placeholder="e.g. Ford" value={f.make} onChange={(e) => set({ make: e.target.value })} />}</Field>
            <Field label="Model">{(id) => <input id={id} className="field" placeholder="e.g. Transit" value={f.model} onChange={(e) => set({ model: e.target.value })} />}</Field>
            <Field label="Mileage (km)">{() => <NumInput label="Mileage" className="w-full" value={f.mileage} onChange={(n) => set({ mileage: Math.round(n) })} />}</Field>
          </>
        )}
        <Field label="Type">
          {(id) => (
            <select id={id} className="field" value={f.kind} onChange={(e) => set({ kind: e.target.value as VehicleKind })}>
              {KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Fuel">
          {(id) => (
            <select id={id} className="field" value={f.fuel} onChange={(e) => set({ fuel: e.target.value as Fuel })}>
              {FUELS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Base location">
          {(id) => (
            <select id={id} className="field" value={f.baseId ?? ""} onChange={(e) => set({ baseId: e.target.value || null })}>
              <option value="">No base</option>
              {db.bases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.kind === "Office" ? " (office)" : ""}
                </option>
              ))}
              <option value={NEW}>A new base</option>
            </select>
          )}
        </Field>
        <Field label="Driver" hint="From People">
          {(id) => (
            <select id={id} className="field" value={f.driverId ?? ""} onChange={(e) => set({ driverId: e.target.value || null })}>
              <option value="">Pool vehicle, no driver</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.trade}
                  {p.drives ? "" : " (not a driver yet)"}
                </option>
              ))}
            </select>
          )}
        </Field>
        {f.baseId === NEW && (
          <div className="grid gap-3 rounded-lg bg-canvas px-3 py-3 sm:col-span-2 sm:grid-cols-2">
            <Field label="New base's name">{(id) => <input id={id} className="field" placeholder="e.g. Naas yard" value={newBase.name} onChange={(e) => { setNewBase({ ...newBase, name: e.target.value }); setError(""); }} />}</Field>
            <Field label="County" hint="Optional">{(id) => <input id={id} className="field" placeholder="e.g. Kildare" value={newBase.county} onChange={(e) => setNewBase({ ...newBase, county: e.target.value })} />}</Field>
          </div>
        )}
        <Field label="Use">
          {(id) => (
            <select id={id} className="field" value={f.division} onChange={(e) => set({ division: e.target.value })}>
              {[...new Set([...DIVISIONS, f.division])].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Owned or leased">
          {(id) => (
            <select id={id} className="field" value={f.ownership} onChange={(e) => set({ ownership: e.target.value as Vehicle["ownership"] })}>
              <option>Owned</option>
              <option>Leased</option>
            </select>
          )}
        </Field>
        <Field label="Purchase price" hint="Optional">{() => <NumInput label="Purchase price" className="w-full" value={f.purchasePrice ?? 0} onChange={(n) => set({ purchasePrice: n > 0 ? n : null })} />}</Field>
        <Field label="Purchase month" hint="Optional">{(id) => <input id={id} type="month" className="field" value={f.purchaseMonth ?? ""} onChange={(e) => set({ purchaseMonth: e.target.value || null })} />}</Field>
        <p role="alert" className="min-h-6 text-bad sm:col-span-2">
          {error}
        </p>
        <button type="submit" className="sr-only" tabIndex={-1}>
          Save
        </button>
      </form>
    </Dialog>
  );
}
