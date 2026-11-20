/**
 * Sheets for the one phone every employee has in the main offering (19 Nov): Report a repair,
 * My certificates (every ticket and licence, with a new one sent for the office to check), and
 * the company holidays. In English, like the other sheets; only button names are translated.
 */
import { Camera, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { actAs, reportRepair, submitCert } from "@/data/actions";
import { useData } from "@/data/store";
import type { LicenceKey, Person, RepairReport } from "@/data/types";
import { companyYears, holidayRows } from "@/lib/bank-holidays";
import { stateOf } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { dFull, dShort, plural } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { Badge, Button, cx, Dialog, Field, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { AddButtons, fromPhone, type PhoneFile, Thumbs, toFileIn } from "./fleet-sheets";

const REPAIR_TONE = { Reported: "accent", "In hand": "warn", Fixed: "ok" } as const;

/**
 * Report a repair: anything broken, picked from the firm's plant and vehicles or typed, where it
 * is, what is wrong and up to 4 photos. It waits in Admin, Repairs for a manager, and its steps
 * (In hand, Fixed) show here.
 */
export function RepairSheet({ me, onClose }: { me: Person; onClose: () => void }) {
  const db = useData((s) => s.db);
  const plant = [...db.plant].sort((a, b) => a.assetRef.localeCompare(b.assetRef));
  const vehicles = db.vehicles.filter((v) => v.active).sort((a, b) => a.reg.localeCompare(b.reg));
  const mine = vehicles.find((v) => v.driverId === me.id);
  const [group, setGroup] = useState<"vehicle" | "plant">(mine ? "vehicle" : "plant");
  const [pick, setPick] = useState(mine ? `vehicle:${mine.id}` : "");
  const [other, setOther] = useState("");
  const [where, setWhere] = useState("");
  const [what, setWhat] = useState("");
  const [photos, setPhotos] = useState<PhoneFile[]>([]);
  const [error, setError] = useState("");
  const [kind, refId] = pick.split(":") as [string, string];
  const item: RepairReport["item"] | null =
    kind === "plant" ? (() => { const p = plant.find((x) => x.id === refId); return p ? { kind: "plant", refId: p.id, name: `${p.name} (${p.assetRef})` } : null; })()
    : kind === "vehicle" ? (() => { const v = vehicles.find((x) => x.id === refId); return v ? { kind: "vehicle", refId: v.id, name: `${v.reg}, ${v.make} ${v.model}` } : null; })()
    : kind === "other" && other.trim() ? { kind: "other", name: other.trim() } : null;
  const ready = !!item && what.trim().length > 2;
  const reports = db.repairs.filter((r) => r.personId === me.id).slice(0, 5);
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
  return (
    <Dialog
      open
      onClose={onClose}
      title="Report a repair"
      footer={
        <>
          <Button size="lg" onClick={onClose}>Cancel</Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!ready}
            onClick={() => {
              if (!item) return;
              actAs(me.id, () => reportRepair({ personId: me.id, item, where: where.trim() || "Not said", what }, photos.map(toFileIn)));
              toast(`Repair reported: ${item.name}. The office will update you here`);
              onClose();
            }}
          >
            Send to the office
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        {/* Vehicle or plant first, then the item from that list (Oisin, 20 Nov). */}
        <Segmented
          label="Vehicle or plant"
          value={group}
          onChange={(g) => {
            setGroup(g);
            setPick(g === "vehicle" && mine ? `vehicle:${mine.id}` : "");
          }}
          options={[{ value: "vehicle", label: "Vehicle" }, { value: "plant", label: "Plant" }]}
        />
        <Field label={group === "vehicle" ? "Which vehicle?" : "Which plant?"}>
          {(id) => (
            <select id={id} className="field h-11" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{group === "vehicle" ? "Choose the vehicle" : "Choose the plant"}</option>
              {group === "vehicle"
                ? vehicles.map((v) => (
                    <option key={v.id} value={`vehicle:${v.id}`}>
                      {v.reg}, {v.make} {v.model}
                    </option>
                  ))
                : plant.map((p) => (
                    <option key={p.id} value={`plant:${p.id}`}>
                      {p.assetRef} {p.name}
                    </option>
                  ))}
              <option value="other:">Not on the list</option>
            </select>
          )}
        </Field>
        {kind === "other" && <Field label="What is it?">{(id) => <input id={id} className="field h-11" value={other} placeholder="e.g. Site office door lock" onChange={(e) => setOther(e.target.value)} />}</Field>}
        <Field label="Where is it?">{(id) => <input id={id} className="field h-11" value={where} placeholder="e.g. C721, by the north gable" onChange={(e) => setWhere(e.target.value)} />}</Field>
        <Field label="What is wrong?">{(id) => <textarea id={id} rows={3} className="field" value={what} placeholder="What it is doing, and whether it is safe to use" onChange={(e) => setWhat(e.target.value)} />}</Field>
        <div className="grid gap-2">
          <p className="text-[0.93rem] font-medium">Photos ({photos.length} of 4)</p>
          <Thumbs files={photos} remove={(key) => setPhotos((ps) => ps.filter((p) => p.key !== key))} />
          {photos.length < 4 && <AddButtons onFiles={(l) => void add(l)} />}
          {error && <p role="alert" className="text-bad">{error}</p>}
        </div>
        {reports.length > 0 && (
          <section>
            <h3 className="mb-1 text-[0.93rem] font-medium">Your repairs</h3>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Your repairs">
              {reports.map((r) => {
                const last = r.steps[r.steps.length - 1];
                return (
                  <li key={r.id} className="grid gap-0.5 px-3 py-2">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1">{r.item.name}</span>
                      <Badge tone={REPAIR_TONE[r.status]}>{r.status}</Badge>
                    </span>
                    <span className="text-[0.87rem] text-muted">
                      {last ? `${last.by}, ${dShort(last.at.slice(0, 10))}${last.note ? `: ${last.note}` : ""}` : `Sent ${dShort(r.at.slice(0, 10))}, waiting for the office`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}

type Row = { key: string; name: string; expires: string | null; certId?: string; licence?: LicenceKey };

/**
 * My certificates (19 Nov): every ticket and licence on file with when it runs out, and a way
 * to send a new one, or one not on file yet. What is sent counts for nothing until the office
 * has checked it (Oisin's pick), and says so here until then.
 */
export function MyCerts({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const person = db.people.find((p) => p.id === me.id) ?? me;
  const [sending, setSending] = useState<Row | "new" | null>(null);
  const rows: Row[] = [
    ...[...person.certs].sort((a, b) => a.expires.localeCompare(b.expires)).map((c) => ({ key: `c:${c.id}`, name: c.name, expires: c.expires, certId: c.id })),
    ...(person.licences?.driving || person.drives ? [{ key: "l:driving", name: "Driving licence", expires: person.licences?.driving?.expiryDate ?? null, licence: "driving" as const }] : []),
    ...(person.licences?.cpc ? [{ key: "l:cpc", name: "Driver CPC", expires: person.licences.cpc.expiryDate, licence: "cpc" as const }] : []),
  ];
  const sent = db.certSubmissions.filter((s) => s.personId === me.id);
  const waitingFor = (r: Row) => sent.find((s) => s.status === "Waiting" && ((r.certId && s.certId === r.certId) || (r.licence && s.licence === r.licence)));
  const newOnes = sent.filter((s) => s.status === "Waiting" && !s.certId && !s.licence);
  const answered = sent.filter((s) => s.status !== "Waiting").slice(0, 3);
  return (
    <div lang="en">
      <h3 className="mb-1 text-base">My certificates</h3>
      <ul className="divide-y divide-line rounded-md border border-line" aria-label="My certificates">
        {rows.map((r) => {
          const state = r.expires ? stateOf(r.expires, day) : "expired";
          const w = waitingFor(r);
          return (
            <li key={r.key} className="grid gap-1.5 px-2.5 py-2">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1">{r.name}</span>
                <Badge tone={state === "expired" ? "bad" : state === "due" ? "warn" : "ok"}>{r.expires ? `${state === "expired" ? "Ran out" : "Runs out"} ${dShort(r.expires)}` : "None on file"}</Badge>
              </span>
              {w ? (
                <span className="text-[0.93rem] text-accent-ink">New one sent {dShort(w.sentAt.slice(0, 10))}, waiting for the office to check</span>
              ) : (
                <Button size="sm" className={cx("justify-self-start", state === "ok" && "text-muted")} onClick={() => setSending(r)}>
                  <Camera size={16} /> Send a new one
                </Button>
              )}
            </li>
          );
        })}
        {newOnes.map((s) => (
          <li key={s.id} className="flex items-baseline gap-2 px-2.5 py-2">
            <span className="min-w-0 flex-1">{s.name}</span>
            <Badge tone="accent">Waiting for the office</Badge>
          </li>
        ))}
      </ul>
      <Button size="lg" className="mt-2 w-full" onClick={() => setSending("new")}>
        <Plus size={18} /> Add a certificate
      </Button>
      {answered.length > 0 && (
        <ul className="mt-2 grid gap-1 text-[0.93rem]" aria-label="Checked by the office">
          {answered.map((s) => (
            <li key={s.id} className={s.status === "Accepted" ? "text-ok" : "text-bad"}>
              {s.name}: {s.status === "Accepted" ? `accepted by ${s.decidedBy}` : `turned down by ${s.decidedBy}${s.note ? `. ${s.note}` : ""}`}
            </li>
          ))}
        </ul>
      )}
      {sending && <CertSheet me={person} row={sending === "new" ? null : sending} day={day} onClose={() => setSending(null)} />}
    </div>
  );
}

function CertSheet({ me, row, day, onClose }: { me: Person; row: Row | null; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const known = [...new Set(db.people.flatMap((p) => p.certs.map((c) => c.name)))].filter((n) => !me.certs.some((c) => c.name === n)).sort();
  const [name, setName] = useState(row?.name ?? "");
  const [typed, setTyped] = useState("");
  const [expires, setExpires] = useState(addDays(day, row?.licence ? 10 * 365 : 3 * 365));
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  const finalName = row ? row.name : name === "other" ? typed.trim() : name;
  const ready = !!picture && !!finalName && expires > day;
  return (
    <Dialog
      open
      onClose={onClose}
      title={row ? `New ${row.name.toLowerCase().startsWith("driv") ? row.name.toLowerCase() : row.name}` : "Add a certificate"}
      footer={
        <>
          <Button size="lg" onClick={onClose}>Cancel</Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!ready}
            onClick={() => {
              if (!picture) return;
              actAs(me.id, () => submitCert({ personId: me.id, kind: row?.licence ? "licence" : "ticket", ...(row?.certId ? { certId: row.certId } : {}), ...(row?.licence ? { licence: row.licence } : {}), name: finalName, expires, photo: { name: `${finalName}, ${me.name}.jpg`, dataUrl: picture.dataUrl } }));
              toast(`${finalName} sent. The office checks it before it counts`);
              onClose();
            }}
          >
            Send to the office
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        {!row && (
          <Field label="Which certificate?">
            {(id) => (
              <select id={id} className="field h-11" value={name} onChange={(e) => setName(e.target.value)}>
                <option value="">Choose it</option>
                {known.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="other">Something else</option>
              </select>
            )}
          </Field>
        )}
        {!row && name === "other" && <Field label="Name of the certificate">{(id) => <input id={id} className="field h-11" value={typed} onChange={(e) => setTyped(e.target.value)} />}</Field>}
        <Field label="Runs out on">{(id) => <input id={id} type="date" className="field h-11" min={addDays(day, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
        <div>
          <p className="mb-1 font-medium">Photo of the card or certificate</p>
          <PickFile accept="image/*" what="card" onFile={(f) => { setError(""); shrinkImage(f).then(setPicture).catch((e: Error) => { setPicture(null); setError(e.message); }); }} />
          <p role="alert" className="text-bad">{error}</p>
          {picture ? <img src={picture.dataUrl} alt="" className="mt-2 max-h-44 rounded-md border border-line" /> : <p className="text-[0.93rem] text-muted">The office checks the name and the dates on it before it counts.</p>}
        </div>
      </div>
    </Dialog>
  );
}

/** The days the firm is shut, from today to the end of next year, on the phone (Oisin's pick, 19 Nov). */
export function CompanyHolidays({ day }: { day: string }) {
  const list = useData((s) => s.db.bankHolidays);
  const rows = companyYears(day).flatMap((y) => holidayRows(list, y)).filter((r) => (r.kind === "day" ? r.date : r.to) >= day).slice(0, 8);
  return (
    <div lang="en">
      <h3 className="mb-1 text-base">Company holidays</h3>
      {rows.length === 0 ? (
        <p className="text-muted">None coming up.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line" aria-label="Company holidays">
          {rows.map((r) => (
            <li key={r.kind === "day" ? r.date : r.closure + r.from} className="flex items-baseline gap-2 px-2.5 py-1.5">
              <span className="min-w-0 flex-1">{r.name}</span>
              <span className="text-[0.93rem] text-muted">{r.kind === "day" ? dFull(r.date) : `${dShort(r.from)} to ${dFull(r.to)}, ${plural(r.days, "day")}`}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
