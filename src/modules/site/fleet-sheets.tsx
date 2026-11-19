/**
 * The site phone's fleet sheets (18 Nov, from the Secure-All build's Ops phone at Oisin's word, on
 * both phones): Report damage (where, what happened, up to 4 photos), which reaches Fleet, Damage
 * reported; and Send a licence (a driving licence or Driver CPC, photographed or a file, with the
 * date it runs to), which goes on the driver's record at once, flagged until the office checks it.
 * Also the line under the Driving check button saying whether today's check is done.
 *
 * These sheets are in English, like the driving check; only their button names are translated.
 */
import { Camera, FileText, Images, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import { actAs, type FileIn, reportDamage, setDriverLicence } from "@/data/actions";
import { useData } from "@/data/store";
import type { Person, Vehicle } from "@/data/types";
import { addDays } from "@/lib/dates";
import { isPdf, shrinkImage } from "@/lib/image";
import { checkToday } from "@/lib/ops";
import { DAMAGE_PICTURES, damagePictureUrl } from "@/lib/sample-pictures";
import { Button, cx, Dialog, Field } from "@/ui";
import { toast } from "@/ui/toast";
import { sampleLicenceFile } from "../fleet/docs";

export type PhoneFile = { key: string; name: string; dataUrl?: string; sample?: string; show: string };
let phoneSeq = 0;

/** A photo from the phone's camera or gallery, shrunk before it is kept; a PDF is kept as it is (licences only). */
export async function fromPhone(f: File, pdfOk: boolean): Promise<PhoneFile> {
  if (f.type.startsWith("image/")) {
    const { dataUrl } = await shrinkImage(f, 1400, 0.75);
    return { key: `p${++phoneSeq}`, name: f.name || "Photo.jpg", dataUrl, show: dataUrl };
  }
  if (pdfOk && (f.type === "application/pdf" || /\.pdf$/i.test(f.name))) {
    if (f.size > 1_200_000) throw new Error("That PDF is too big to send. A photo of it works.");
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(new Error("That file could not be read."));
      r.readAsDataURL(f);
    });
    return { key: `p${++phoneSeq}`, name: f.name, dataUrl, show: "" };
  }
  throw new Error(pdfOk ? "Choose a photo or a PDF." : "Choose a photo.");
}
export const toFileIn = (f: PhoneFile): FileIn => (f.sample ? { name: f.name, dataUrl: "", sample: f.sample } : { name: f.name, dataUrl: f.dataUrl ?? "" });

/** Two ways to add a file on the phone: the camera, or something already on the phone. */
export function AddButtons({ onFiles, pdf }: { onFiles: (files: FileList | null) => void; pdf?: boolean }) {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label="Take a photo" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={files} type="file" accept={pdf ? "image/*,application/pdf" : "image/*"} multiple className="sr-only" tabIndex={-1} aria-label="Choose from the phone" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <Button size="lg" className="flex-1" onClick={() => camera.current?.click()}>
        <Camera size={20} /> Take a photo
      </Button>
      <Button size="lg" className="flex-1" onClick={() => files.current?.click()}>
        <Images size={20} /> From the phone
      </Button>
    </div>
  );
}

export function Thumbs({ files, remove }: { files: PhoneFile[]; remove: (key: string) => void }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={f.key} className="relative">
          {f.show ? (
            <img src={f.show} alt={`Photo ${i + 1}`} className="size-[84px] rounded-lg border border-line object-cover" />
          ) : (
            <span className="grid size-[84px] place-items-center rounded-lg border border-line bg-surface px-1 text-center text-[0.8125rem] text-muted">
              <FileText size={22} />
              PDF
            </span>
          )}
          <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => remove(f.key)} className="press absolute -top-2 -right-2 grid size-7 place-items-center rounded-full bg-ink text-white">
            <X size={14} weight="bold" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The vehicle a person drives, if they have one. */
export const vanOf = (vehicles: Vehicle[], personId: string) => vehicles.find((v) => v.active && v.driverId === personId);

/** The line under the Driving check button: today's check on their van, done or not. */
export function CheckLine({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const van = vanOf(db.vehicles, me.id);
  if (!van) return null;
  const done = checkToday(db.vehicleChecks, van.id, day);
  return (
    <span lang="en" className={cx("block text-[0.87rem] font-normal", done?.defects.length ? "text-bad" : done ? "text-muted" : "text-warn")}>
      {van.reg}: {done ? `done at ${done.at.slice(11, 16)}${done.defects.length ? ", defect reported" : ", all OK"}` : "not done yet today"}
    </span>
  );
}

/** Report damage to a vehicle: where, what happened, and photos. It reaches Fleet, Damage reported. */
export function DamageSheet({ me, onClose }: { me: Person; onClose: () => void }) {
  const db = useData((s) => s.db);
  const mine = vanOf(db.vehicles, me.id);
  const vehicles = db.vehicles.filter((v) => v.active).sort((a, b) => a.reg.localeCompare(b.reg));
  const [vehicleId, setVehicleId] = useState(mine?.id ?? "");
  const [where, setWhere] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<PhoneFile[]>([]);
  const [error, setError] = useState("");
  const van = vehicles.find((v) => v.id === vehicleId);
  const add = async (list: FileList | null) => {
    setError("");
    for (const f of [...(list ?? [])].slice(0, 4)) {
      try {
        const p = await fromPhone(f, false);
        setPhotos((ps) => (ps.length >= 4 ? ps : [...ps, p]));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };
  const sample = () => {
    const name = DAMAGE_PICTURES[photos.length % DAMAGE_PICTURES.length]!;
    setPhotos((ps) => (ps.length >= 4 ? ps : [...ps, { key: `p${++phoneSeq}`, name: `Photo ${ps.length + 1}`, sample: `damage/${name}`, show: damagePictureUrl(name) ?? "" }]));
  };
  const ready = !!van && note.trim().length > 2;
  const send = () => {
    if (!van || !ready) return;
    actAs(me.id, () => reportDamage({ vehicleId: van.id, driverId: me.id, where: where.trim() || "Not said", note }, photos.map(toFileIn)));
    toast(`Damage report sent to the office${photos.length ? `, with ${photos.length === 1 ? "1 photo" : `${photos.length} photos`}` : ""}`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Report damage"
      footer={
        <>
          <Button size="lg" onClick={onClose}>Cancel</Button>
          <Button size="lg" variant="primary" disabled={!ready} onClick={send}>
            Send to the office
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        {mine ? (
          <p className="rounded-lg bg-surface px-3 py-2.5">
            <span className="font-medium">{mine.reg}</span>, {mine.make} {mine.model}
          </p>
        ) : (
          <Field label="Which vehicle?">
            {(id) => (
              <select id={id} className="field h-11" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">Choose the vehicle</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.reg}, {v.make} {v.model}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <p className="text-[0.93rem] text-muted">Say what happened and add photos. The office sees it straight away.</p>
        <Field label="Where are you?">{(id) => <input id={id} className="field h-11" placeholder="e.g. Site entrance, Derrybawn Bridge" value={where} onChange={(e) => setWhere(e.target.value)} />}</Field>
        <Field label="What happened?">{(id) => <textarea id={id} rows={3} className="field" placeholder="What is damaged, and how it happened" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        <div className="grid gap-2">
          <p className="text-[0.93rem] font-medium">Photos ({photos.length} of 4)</p>
          <Thumbs files={photos} remove={(key) => setPhotos((ps) => ps.filter((p) => p.key !== key))} />
          {photos.length < 4 && <AddButtons onFiles={(l) => void add(l)} />}
          {photos.length < 4 && (
            <button type="button" onClick={sample} className="press rounded-lg border border-dashed border-line-strong py-2.5 text-[0.93rem] font-medium text-muted">
              Add a sample picture (demo)
            </button>
          )}
          {error && <p role="alert" className="text-bad">{error}</p>}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Send a new driving licence or Driver CPC: a photo or a file (front and back), and the date it
 * runs to. It goes on the driver's record in Fleet, Drivers at once, flagged until the office has
 * checked it. Someone not yet on the driver list goes on it.
 */
export function LicenceSheet({ me, day, onClose }: { me: Person; day: string; onClose: () => void }) {
  const [which, setWhich] = useState<"driving" | "cpc">("driving");
  const [files, setFiles] = useState<PhoneFile[]>([]);
  const [expiry, setExpiry] = useState("");
  const [error, setError] = useState("");
  const add = async (list: FileList | null) => {
    setError("");
    for (const f of [...(list ?? [])].slice(0, 2)) {
      try {
        const p = await fromPhone(f, true);
        setFiles((fs) => (fs.length >= 2 ? fs : [...fs, p]));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };
  const sample = () => {
    // A sample sheet in this person's name: a driving licence for ten years, a CPC for five.
    const runs = addDays(day, which === "cpc" ? 1826 : 3652);
    const s = sampleLicenceFile({ id: me.id, name: me.name }, which, runs);
    setFiles([{ key: `p${++phoneSeq}`, name: s.name, dataUrl: s.dataUrl, show: "" }]);
    setExpiry(runs);
  };
  const ready = files.length > 0 && !!expiry;
  const what = which === "cpc" ? "Driver CPC" : "driving licence";
  const send = () => {
    if (!ready) return;
    actAs(me.id, () => setDriverLicence(me.id, which, expiry, files.map(toFileIn), { fromPhone: true }));
    toast(`Your ${what} is on your record now. The office will check it`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Send a licence"
      footer={
        <>
          <Button size="lg" onClick={onClose}>Cancel</Button>
          <Button size="lg" variant="primary" disabled={!ready} onClick={send}>
            Send to the office
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        <p className="text-[0.93rem] text-muted">A new licence goes on your record as soon as you send it, and the office checks it.</p>
        <div role="group" aria-label="Which licence" className="flex gap-2">
          {(["driving", "cpc"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={which === k} onClick={() => setWhich(k)} className={cx("press min-h-11 flex-1 rounded-lg font-medium", which === k ? "bg-accent-strong text-white" : "border border-line-strong bg-surface")}>
              {k === "cpc" ? "Driver CPC" : "Driving licence"}
            </button>
          ))}
        </div>
        <div className="grid gap-2">
          <p className="text-[0.93rem] font-medium">The licence ({files.length} of 2, front and back)</p>
          <Thumbs files={files.map((f) => ({ ...f, show: f.dataUrl && isPdf(f.dataUrl) ? "" : f.show }))} remove={(key) => setFiles((fs) => fs.filter((f) => f.key !== key))} />
          {files.length < 2 && <AddButtons pdf onFiles={(l) => void add(l)} />}
          {files.length === 0 && (
            <button type="button" onClick={sample} className="press rounded-lg border border-dashed border-line-strong py-2.5 text-[0.93rem] font-medium text-muted">
              Use a sample licence (demo)
            </button>
          )}
          {error && <p role="alert" className="text-bad">{error}</p>}
        </div>
        <Field label="Runs to">{(id) => <input id={id} type="date" className="field h-11" value={expiry} onChange={(e) => setExpiry(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
