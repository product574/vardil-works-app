/**
 * The forms that take a document other than a garage invoice (from the Secure-All build, 18 Nov):
 * a renewal of motor tax, the test (CVRT, NCT or MOT), or insurance; a driver's driving licence or
 * Driver CPC; and any other vehicle
 * document. Each shows the document on the left and the form on the right, has the AI model read
 * the document to fill the form in, and warns when the document does not look like it belongs
 * (another vehicle's registration, another person's name). Also the Dashboard's "Upload a
 * document", which works out what a document is and opens the right one of these.
 */
import { UploadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InvoiceReading, Reading, RenewalReading } from "@/ai/reading";
import { addFleetDoc, renewVehicle, setDriverLicence } from "@/data/actions";
import { getDb, useDay } from "@/data/store";
import type { Driver, FleetDocCategory, ID, Vehicle } from "@/data/types";
import { addDays } from "@/lib/dates";
import { driversOf } from "@/lib/fleet";
import { type ComplianceKey } from "@/lib/fleet-spend";
import { dFull } from "@/lib/format";
import { namesMatch, regsMatch } from "@/lib/match";
import { Button, Dialog, Field, NumInput } from "@/ui";
import { AiSparkle } from "@/ui/AiSparkle";
import { toast } from "@/ui/toast";
import { licenceDocs } from "./docs";
import { UploadInvoiceDialog } from "./InvoiceForm";
import { useDrivers, useNames, useRegionWords } from "./shared";
import { Mismatch, type Picked, ReadBanner, Split, UploadPane, useUpload } from "./upload";

const DOC_WORDS: Record<RenewalReading["docType"], string> = { tax: "a motor tax document", test: "a test document", insurance: "an insurance document", driving: "a driving licence", cpc: "a Driver CPC card", other: "another kind of document" };
const newestFirst = (a: Vehicle, b: Vehicle) => b.reg.localeCompare(a.reg, "en", { numeric: true });

function VehicleSelect({ value, onChange }: { value: ID; onChange: (id: ID) => void }) {
  const { db, base } = useNames();
  return (
    <Field label="Vehicle">
      {(id) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose the vehicle</option>
          {db.vehicles.filter((v) => v.active).sort(newestFirst).map((v) => (
            <option key={v.id} value={v.id}>
              {v.reg}, {v.make} {v.model}, {base(v.baseId)}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

// ── A renewal: motor tax, the test, insurance ─────────────────────────────────

export function RenewDialog({ v, item, initialFiles, initialReading, onClose }: { v?: Vehicle; item?: ComplianceKey; initialFiles?: Picked[]; initialReading?: RenewalReading; onClose: () => void }) {
  const { db } = useNames();
  const day = useDay();
  const [vehicleId, setVehicleId] = useState<ID>(v?.id ?? "");
  const [which, setWhich] = useState<ComplianceKey>(item ?? "tax");
  const vehicle = db.vehicles.find((x) => x.id === vehicleId);
  const nextYear = (veh: Vehicle | undefined, k: ComplianceKey) => addDays(veh?.compliance[k].expiryDate && veh.compliance[k].expiryDate > day ? veh.compliance[k].expiryDate : day, 365);
  const [expiry, setExpiry] = useState(nextYear(v, item ?? "tax"));
  const [amount, setAmount] = useState(v ? v.compliance[item ?? "tax"].amount || 0 : 0);
  const [read, setRead] = useState<RenewalReading | null>(null);
  const [error, setError] = useState("");
  const words = useRegionWords();
  const label = (k: ComplianceKey, veh = vehicle) => (k === "test" ? (veh ? words.test(veh.kind) : words.testWord) : k === "tax" ? words.tax.toLowerCase() : "insurance");

  const fill = (r: Reading) => {
    if (r.kind !== "renewal") return;
    setRead(r);
    if (r.expiryDate) setExpiry(r.expiryDate);
    if (r.amount > 0) setAmount(r.amount);
    if (!v && r.reg) {
      const found = getDb().vehicles.find((x) => regsMatch(x.reg, r.reg) === "match");
      if (found) setVehicleId(found.id);
    }
    if (!item && (r.docType === "tax" || r.docType === "test" || r.docType === "insurance")) setWhich(r.docType);
  };
  const up = useUpload({ kind: "renewal", initial: initialFiles, initialReading, onRead: fill });

  const warn: string[] = [];
  if (read && vehicle && regsMatch(read.reg, vehicle.reg) === "mismatch") warn.push(`This document is for ${read.reg}. You are adding it to ${vehicle.reg}.`);
  if (read && read.docType !== "other" && read.docType !== which) warn.push(`This looks like ${DOC_WORDS[read.docType]}, not ${which === "test" ? `the ${label("test")}` : label(which)}.`);

  const save = () => {
    if (!vehicle) return setError("Choose the vehicle.");
    if (!expiry) return setError("Enter the date it runs to.");
    renewVehicle(vehicle.id, which, expiry, amount, up.fileIns(), warn.length ? { anyway: warn.join(" ") } : {});
    toast(`${vehicle.reg} ${label(which)} recorded, runs to ${dFull(expiry)}`);
    onClose();
  };
  return (
    <Dialog
      open
      size="xl"
      split
      onClose={onClose}
      title={vehicle ? `Record ${label(which)} renewal, ${vehicle.reg}` : "Record a renewal"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={up.status.state === "reading"} onClick={save}>
            {warn.length ? "Save anyway" : "Record renewal"}
          </Button>
        </>
      }
    >
      <Split
        left={<UploadPane up={up} what="payment receipt" />}
        right={
          <div className="grid gap-4">
            <ReadBanner up={up} />
            <Mismatch lines={warn} />
            <div className="grid gap-3 sm:grid-cols-2">
              {!v && <VehicleSelect value={vehicleId} onChange={(id) => { setVehicleId(id); setError(""); }} />}
              {!item && (
                <Field label="What was renewed">
                  {(id) => (
                    <select id={id} className="field" value={which} onChange={(e) => setWhich(e.target.value as ComplianceKey)}>
                      <option value="tax">{words.tax}</option>
                      <option value="test">{vehicle ? words.test(vehicle.kind) : words.testWord}</option>
                      <option value="insurance">Insurance</option>
                    </select>
                  )}
                </Field>
              )}
              <Field label="Runs to">{(id) => <input id={id} type="date" className="field" value={expiry} onChange={(e) => { setExpiry(e.target.value); setError(""); }} />}</Field>
              <Field label="Amount paid">{() => <NumInput label="Amount paid" className="w-full" value={amount} onChange={setAmount} />}</Field>
            </div>
            <p className="text-[0.93rem] text-muted">Add the receipt for what was paid. It is kept with the vehicle's documents, apart from repair invoices. Once the new disc is on the windscreen, tick "Disc is on".</p>
            <p role="alert" className="min-h-6 text-bad">{error}</p>
          </div>
        }
      />
    </Dialog>
  );
}

// ── A driver's licence ────────────────────────────────────────────────────────

export function LicenceDialog({ d, which: fixed, initialFiles, initialReading, onClose }: { d?: Driver; which?: "driving" | "cpc"; initialFiles?: Picked[]; initialReading?: RenewalReading; onClose: () => void }) {
  const drivers = useDrivers();
  const [driverId, setDriverId] = useState<ID>(d?.id ?? "");
  const [which, setWhich] = useState<"driving" | "cpc">(fixed ?? "driving");
  const driver = drivers.find((x) => x.id === driverId);
  const [expiry, setExpiry] = useState(d?.licences?.[fixed ?? "driving"]?.expiryDate ?? "");
  const [read, setRead] = useState<RenewalReading | null>(null);
  const [error, setError] = useState("");
  const label = which === "cpc" ? "Driver CPC" : "driving licence";

  const fill = (r: Reading) => {
    if (r.kind !== "renewal") return;
    setRead(r);
    if (r.expiryDate) setExpiry(r.expiryDate);
    if (!d && r.name) {
      const found = driversOf(getDb().people, getDb().vehicles).find((x) => x.active && namesMatch(x.name, r.name) === "match");
      if (found) setDriverId(found.id);
    }
    if (!fixed && (r.docType === "driving" || r.docType === "cpc")) setWhich(r.docType);
  };
  // The copy already on file shows first. A new file added here replaces it when saved.
  const was = d && fixed ? d.licences?.[fixed] : undefined;
  const wasProofs = [...(was?.proof ? [was.proof] : []), ...(was?.extraProofs ?? [])];
  const up = useUpload({ kind: "renewal", initial: initialFiles, initialReading, kept: d && fixed ? licenceDocs(d, fixed).map((doc, i) => ({ doc, proof: wasProofs[i]! })) : undefined, onRead: fill });
  const fresh = up.files.flatMap((f) => (f.picked ? [f.picked] : []));

  const warn: string[] = [];
  if (read && driver && namesMatch(read.name, driver.name) === "mismatch") warn.push(`This licence says ${read.name}. You are adding it to ${driver.name}.`);
  if (read && read.docType !== "other" && read.docType !== which) warn.push(`This looks like ${DOC_WORDS[read.docType]}, not a ${label}.`);

  const save = () => {
    if (!driver) return setError("Choose the driver.");
    if (!expiry) return setError("Enter the date it runs out.");
    setDriverLicence(driver.id, which, expiry, fresh.length ? fresh : up.fileIns(), warn.length ? { anyway: warn.join(" ") } : {});
    toast(`${driver.name}'s ${label} saved`);
    onClose();
  };
  return (
    <Dialog
      open
      size="xl"
      split
      onClose={onClose}
      title={driver ? `${driver.name}, ${label}` : "Add a licence"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={up.status.state === "reading"} onClick={save}>
            {warn.length ? "Save anyway" : "Save"}
          </Button>
        </>
      }
    >
      <Split
        left={
          <div className="flex h-full min-h-0 flex-col gap-2">
            <UploadPane up={up} what="copy of the licence" />
            {wasProofs.length > 0 && <p className="text-[0.93rem] text-muted">{fresh.length ? "The new file replaces the copy on file when you save." : "This is the copy on file now. Add the new licence to replace it."}</p>}
          </div>
        }
        right={
          <div className="grid gap-4">
            <ReadBanner up={up} />
            <Mismatch lines={warn} />
            <div className="grid gap-3 sm:grid-cols-2">
              {!d && (
                <Field label="Driver">
                  {(id) => (
                    <select id={id} className="field" value={driverId} onChange={(e) => { setDriverId(e.target.value); setError(""); }}>
                      <option value="">Choose the driver</option>
                      {drivers.filter((x) => x.active).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              {!fixed && (
                <Field label="Which licence">
                  {(id) => (
                    <select id={id} className="field" value={which} onChange={(e) => setWhich(e.target.value as "driving" | "cpc")}>
                      <option value="driving">Driving licence</option>
                      <option value="cpc">Driver CPC</option>
                    </select>
                  )}
                </Field>
              )}
              <Field label="Runs to">{(id) => <input id={id} type="date" className="field" value={expiry} onChange={(e) => { setExpiry(e.target.value); setError(""); }} />}</Field>
            </div>
            <p className="text-[0.93rem] text-muted">Add a photo or PDF of the licence, front and back if it has two sides. With the AI reading on, the name on it is checked against the driver.</p>
            <p role="alert" className="min-h-6 text-bad">{error}</p>
          </div>
        }
      />
    </Dialog>
  );
}

// ── Any other vehicle document ────────────────────────────────────────────────

export const DOC_LABEL: Record<FleetDocCategory, string> = { tax: "Motor tax", test: "Test", insurance: "Insurance", other: "Other" };

export function AddDocDialog({ vehicleId: fixedVehicle, initialFiles, initialReading, onClose }: { vehicleId?: ID; initialFiles?: Picked[]; initialReading?: RenewalReading; onClose: () => void }) {
  const { db } = useNames();
  const day = useDay();
  const [vehicleId, setVehicleId] = useState<ID>(fixedVehicle ?? "");
  const [category, setCategory] = useState<FleetDocCategory>("other");
  const [expiry, setExpiry] = useState("");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [read, setRead] = useState<RenewalReading | null>(null);
  const [error, setError] = useState("");
  const vehicle = db.vehicles.find((x) => x.id === vehicleId);

  const fill = (r: Reading) => {
    if (r.kind !== "renewal") return;
    setRead(r);
    if (r.expiryDate) setExpiry(r.expiryDate);
    if (r.amount > 0) setAmount(r.amount);
    if (!fixedVehicle && r.reg) {
      const found = getDb().vehicles.find((x) => regsMatch(x.reg, r.reg) === "match");
      if (found) setVehicleId(found.id);
    }
    setCategory(r.docType === "tax" || r.docType === "test" || r.docType === "insurance" ? r.docType : "other");
  };
  const up = useUpload({ kind: "renewal", initial: initialFiles, initialReading, onRead: fill });
  const warn: string[] = [];
  if (read && vehicle && regsMatch(read.reg, vehicle.reg) === "mismatch") warn.push(`This document is for ${read.reg}. You are adding it to ${vehicle.reg}.`);
  if (read && (read.docType === "driving" || read.docType === "cpc")) warn.push(`This looks like ${DOC_WORDS[read.docType]}, which belongs under Drivers.`);
  const expires = category !== "other";

  const save = () => {
    if (!vehicle) return setError("Choose the vehicle.");
    if (expires && !expiry) return setError("Enter the date it runs to.");
    if (category === "other" && !note.trim()) return setError("Say what the document is.");
    addFleetDoc({ vehicleId: vehicle.id, category, date: day, amount, ...(expiry ? { expiryDate: expiry } : {}), ...(note.trim() ? { note: note.trim() } : {}) }, up.fileIns(), warn.length ? { anyway: warn.join(" ") } : {});
    toast("Document added");
    onClose();
  };
  return (
    <Dialog
      open
      size="xl"
      split
      onClose={onClose}
      title="Add a vehicle document"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={up.status.state === "reading"} onClick={save}>
            {warn.length ? "Save anyway" : "Add document"}
          </Button>
        </>
      }
    >
      <Split
        left={<UploadPane up={up} what="document" />}
        right={
          <div className="grid gap-4">
            <ReadBanner up={up} />
            <Mismatch lines={warn} />
            <div className="grid gap-3 sm:grid-cols-2">
              {!fixedVehicle && <VehicleSelect value={vehicleId} onChange={(id) => { setVehicleId(id); setError(""); }} />}
              <Field label="What it is">
                {(id) => (
                  <select id={id} className="field" value={category} onChange={(e) => setCategory(e.target.value as FleetDocCategory)}>
                    {(Object.keys(DOC_LABEL) as FleetDocCategory[]).map((k) => (
                      <option key={k} value={k}>
                        {k === "other" ? "Another document" : DOC_LABEL[k]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Runs to" hint={expires ? undefined : "Optional"}>{(id) => <input id={id} type="date" className="field" value={expiry} onChange={(e) => { setExpiry(e.target.value); setError(""); }} />}</Field>
              <Field label="Amount" hint="Optional">{() => <NumInput label="Amount" className="w-full" value={amount} onChange={setAmount} />}</Field>
              <Field label={category === "other" ? "What the document is" : "Note"} hint={category === "other" ? undefined : "Optional"} className="sm:col-span-2">
                {(id) => <input id={id} className="field" placeholder={category === "other" ? "e.g. Tachograph calibration certificate" : ""} value={note} onChange={(e) => { setNote(e.target.value); setError(""); }} />}
              </Field>
            </div>
            <p className="text-[0.93rem] text-muted">Today's date is recorded as when it was added. To record a renewal with its receipt, use Record renewal on the vehicle or under Renewals.</p>
            <p role="alert" className="min-h-6 text-bad">{error}</p>
          </div>
        }
      />
    </Dialog>
  );
}

// ── The Dashboard's "Upload a document" ───────────────────────────────────────

type Going = { files: Picked[]; reading?: Reading } & ({ to: "invoice" } | { to: "renewal"; item?: ComplianceKey } | { to: "licence"; which?: "driving" | "cpc" } | { to: "doc" });

/**
 * One button for any document (from the Secure-All build, 18 Nov). The AI model reads it and says
 * what it is (a garage invoice, motor tax, a test, insurance, a licence, something else), and the
 * right form opens filled in with the document beside it. Where the AI cannot read (a copy with
 * no server), the file's name is read, and otherwise the person says what the document is.
 */
export function UploadDocumentButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [going, setGoing] = useState<Going | null>(null);
  const close = () => {
    setOpen(false);
    setGoing(null);
  };
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UploadSimple size={18} /> Upload a document
      </Button>
      {open && !going && <WhatIsIt onClose={close} onGo={setGoing} />}
      {going?.to === "invoice" && <UploadInvoiceDialog initialFiles={going.files} initialReading={going.reading as InvoiceReading | undefined} onClose={(id) => { close(); if (id) navigate(`/fleet/invoices/${id}`); }} />}
      {going?.to === "renewal" && <RenewDialog item={going.reading ? undefined : going.item} initialFiles={going.files} initialReading={going.reading as RenewalReading | undefined} onClose={close} />}
      {going?.to === "licence" && <LicenceDialog which={going.reading ? undefined : going.which} initialFiles={going.files} initialReading={going.reading as RenewalReading | undefined} onClose={close} />}
      {going?.to === "doc" && <AddDocDialog initialFiles={going.files} initialReading={going.reading as RenewalReading | undefined} onClose={close} />}
    </>
  );
}

function WhatIsIt({ onClose, onGo }: { onClose: () => void; onGo: (g: Going) => void }) {
  const words = useRegionWords();
  const [reading, setReading] = useState<Reading | null>(null);
  const up = useUpload({ kind: "any", onRead: setReading });
  const files = up.files.flatMap((f) => (f.picked ? [f.picked] : []));
  // As soon as the AI has said what it is, the right form opens with what it read.
  useEffect(() => {
    if (!reading || !files.length) return;
    if (reading.kind === "invoice") onGo({ to: "invoice", files, reading });
    else if (reading.docType === "driving" || reading.docType === "cpc") onGo({ to: "licence", files, reading });
    else if (reading.docType === "other") onGo({ to: "doc", files, reading });
    else onGo({ to: "renewal", files, reading });
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  const ask = files.length > 0 && (up.status.state === "off" || up.status.state === "failed");
  const choices: { label: string; go: Going }[] = [
    { label: "A garage invoice", go: { to: "invoice", files } },
    { label: "Motor tax", go: { to: "renewal", item: "tax", files } },
    { label: words.testWord, go: { to: "renewal", item: "test", files } },
    { label: "Insurance", go: { to: "renewal", item: "insurance", files } },
    { label: "A driving licence", go: { to: "licence", which: "driving", files } },
    { label: "A Driver CPC", go: { to: "licence", which: "cpc", files } },
    { label: "Another vehicle document", go: { to: "doc", files } },
  ];
  return (
    <Dialog open size={files.length ? "xl" : "md"} split={files.length > 0} onClose={onClose} title="Upload a document" footer={<Button onClick={onClose}>Cancel</Button>}>
      {files.length === 0 ? (
        <div className="grid gap-3">
          <p className="text-muted">A garage invoice, a motor tax, {words.testWord} or insurance document, or a driver's licence. It is read, and the right form opens with the document beside it.</p>
          <UploadPane up={up} what="document" />
        </div>
      ) : (
        <Split
          left={<UploadPane up={up} what="document" />}
          right={
            <div className="grid gap-4">
              {up.status.state === "reading" || (up.status.state === "read" && !ask) ? (
                <p role="status" className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 font-medium text-accent-ink">
                  <AiSparkle size={18} className="shrink-0" /> Reading the document to see what it is.
                </p>
              ) : (
                <>
                  {up.status.message && <p className="rounded-md bg-canvas px-3 py-2 text-[0.93rem] text-muted">{up.status.message}</p>}
                  <p className="font-medium">What is this document?</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {choices.map((c) => (
                      <Button key={c.label} className="justify-start" onClick={() => onGo(c.go)}>
                        {c.label}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          }
        />
      )}
    </Dialog>
  );
}
