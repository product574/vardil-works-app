import { CalendarBlank, Camera, Phone, SignOut, Truck } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { actAs, addPhoto, addRequest, claimExpense, raiseExtra, requestLeave, sendTicketPhoto, submitVehicleCheck } from "@/data/actions";
import { stateOf, ticketBlocks, vehicleBlocks } from "@/lib/compliance";
import { useData, usePrefs } from "@/data/store";
import { type ExpenseKind, type Language, LANGUAGE_NAME, type Person, type Project, type RequestKind } from "@/data/types";
import { addDays } from "@/lib/dates";
import { type CheckAnswer, checkedCount, checkReady, CHECK_ITEMS, DRIVING_CHECK } from "@/lib/driving";
import { dShort, plural } from "@/lib/format";
import { shrinkImage } from "@/lib/image";
import { workingDays } from "@/lib/roster";
import { Avatar, Badge, Button, cx, DeclineNote, Dialog, Field, NumInput } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { EXTRAS, MORE, WORDS } from "./words";

// What both phones share (the operative's in SiteView.tsx, the site manager's in ManagerPhone.tsx):
// the large buttons, the profile, and the sheets for a photo, extra work, a request, the driving
// check and a reimbursement.

export const BIG = "press flex min-h-16 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-left text-[1.05rem] font-medium hover:border-accent hover:text-accent-ink";
export const longDate = (d: string, locale = "en-IE") => new Date(d + "T12:00:00Z").toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** The round initials button at the top left of a phone. It opens the person's profile. */
export function ProfileButton({ name, label, onClick }: { name: string; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="press -ml-1 grid size-11 shrink-0 place-items-center rounded-full hover:bg-white/15">
      <span className="grid size-9 place-items-center rounded-full bg-white text-[0.87rem] font-semibold text-accent-ink">
        {name
          .split(" ")
          .map((w) => w[0])
          .slice(0, 2)
          .join("")}
      </span>
    </button>
  );
}

/** A site manager's details on the operative's phone, with a button to ring him now (Oisin, 17 Nov). */
export function ManagerCard({ manager, site, lang, onClose }: { manager: Person; site: Project; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  return (
    <Dialog open onClose={onClose} title={manager.name}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={manager.name} size={48} />
          <div>
            <p className="font-display text-[1.2rem] font-semibold">{manager.name}</p>
            <p className="text-muted">
              {t.manager}, {site.code} {site.name}
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" lang="en">
          <dt className="text-muted">Phone</dt>
          <dd className="tabular-nums">{manager.phone}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{manager.email}</dd>
        </dl>
        <a href={`tel:${manager.phone.replace(/\s/g, "")}`} className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent-strong px-5 text-[1.05rem] font-medium text-white hover:brightness-110">
          <Phone size={20} /> {MORE[lang].callNow}
        </a>
      </div>
    </Dialog>
  );
}

export function PhotoSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  const [caption, setCaption] = useState("");
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.photo}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!picture || !caption.trim()}
            onClick={() => {
              if (!picture) return;
              actAs(me.id, () => addPhoto(site.id, caption, "During", picture));
              toast(t.photoSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang={lang}>
        <PickFile accept="image/*" onFile={(f) => { setError(""); shrinkImage(f).then(setPicture).catch((e: Error) => { setPicture(null); setError(e.message); }); }} />
        {!picture && <p className="text-[0.93rem] text-muted">{t.takeOrChoose}</p>}
        <p role="alert" className="text-bad">
          {error}
        </p>
        {picture && <img src={picture.dataUrl} alt="" className="max-h-44 rounded-md border border-line" />}
        <Field label={t.caption}>{(id) => <input id={id} className="field h-11 text-[1.02rem]" value={caption} onChange={(e) => setCaption(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}

export function ExtraSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  const [pick, setPick] = useState(0);
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.extra}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            onClick={() => {
              const e = EXTRAS[pick]!;
              const foreign = me.language !== "en";
              actAs(me.id, () =>
                raiseExtra(site.id, {
                  description: note.trim() && !foreign ? `${e.en}. ${note.trim()}` : e.en,
                  measured: "To be measured on site",
                  estimatedValue: 0,
                  ...(foreign ? { original: note.trim() ? `${e[me.language]}. ${note.trim()}` : e[me.language], originalLanguage: me.language } : {}),
                }),
              );
              toast(t.extraSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <fieldset className="grid gap-2" lang={lang}>
        <legend className="mb-1 font-medium">{t.found}</legend>
        {EXTRAS.map((e, i) => (
          <label key={e.en} className={cx("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5", pick === i ? "border-accent bg-accent-soft" : "border-line-strong")}>
            <input type="radio" name="extra" className="mt-1" checked={pick === i} onChange={() => setPick(i)} />
            <span>{e[lang]}</span>
          </label>
        ))}
        <Field label={t.note} className="mt-2">
          {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </fieldset>
    </Dialog>
  );
}

/**
 * Make a request. From an operative it goes to their site manager, who forwards it to management
 * or deals with it on site (Oisin, 17 Nov); from a site manager it goes straight to management.
 * With no site it is the site manager's general request, not tied to one job: it is listed
 * underneath with where it stands, so he can see the office's answer.
 */
export function AskSheet({ site, me, lang, day, toManager, onClose }: { site: Project | null; me: Person; lang: Language; day: string; toManager?: boolean; onClose: () => void }) {
  const t = WORDS[lang];
  const requests = useData((s) => s.db.requests);
  const [kind, setKind] = useState<RequestKind>(site ? "own_plant" : "other");
  const [text, setText] = useState("");
  // A site manager can ask for anything; the crew's form keeps to people and plant, in their own language.
  const kinds: [RequestKind, string][] = [["own_plant", t.ownPlant], ["hired_plant", t.hirePlant], ["personnel", t.people], ...(toManager ? [] : ([["other", "Something else"]] as [RequestKind, string][]))];
  const mine = site ? [] : requests.filter((r) => r.projectId === null && r.requestedById === me.id).slice(0, 4);
  const state = (r: (typeof mine)[number]) => (r.decision === "Declined" ? `Turned down by ${r.decidedBy}${r.declineNote ? `. Note: ${r.declineNote}` : ""}` : r.status === "Done" ? "Dealt with" : r.decision === "Approved" ? `Agreed by ${r.decidedBy}, the office is arranging it` : "Waiting for the office");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.ask}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!text.trim()}
            onClick={() => {
              actAs(me.id, () => addRequest({ projectId: site?.id ?? null, kind, description: text.trim(), quantity: 1, neededFrom: addDays(day, 1), neededTo: addDays(day, 7), notes: lang === "en" ? "Sent from the site phone" : `Sent from the site phone in ${LANGUAGE_NAME[lang]}`, ...(toManager && site ? { heldBy: "site" as const } : {}) }));
              toast(toManager ? t.askSent : "Request sent to the office");
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      {!site && <p className="mb-3 text-[0.93rem] text-muted">A general request, not for one job: a course, kit for yourself, something for all your sites. It goes to the office for a yes or no.</p>}
      <fieldset className="grid gap-2" lang={lang}>
        <legend className="mb-1 font-medium">{t.need}</legend>
        {kinds.map(([k, label]) => (
          <label key={k} className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5", kind === k ? "border-accent bg-accent-soft" : "border-line-strong")}>
            <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
            <span>{label}</span>
          </label>
        ))}
        <Field label={t.what} className="mt-2">
          {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      </fieldset>
      {mine.length > 0 && (
        <section className="mt-4">
          <h3 className="mb-1 text-[0.93rem] font-medium">Your general requests</h3>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Your general requests">
            {mine.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <span className="block">{r.description}</span>
                <span className="block text-[0.87rem] text-muted">{state(r)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Dialog>
  );
}

/**
 * The driver's walkaround check (Oisin, 17 Nov): the vehicle they drive, then each item OK or a
 * defect, three sections, and Submit once everything is answered. A defect needs a note.
 */
export function DrivingSheet({ me, day, onClose }: { me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const vehicles = db.vehicles.filter((v) => v.active);
  const mine = vehicles.find((v) => v.driverId === me.id);
  const [vehicleId, setVehicleId] = useState(mine?.id ?? "");
  const [answers, setAnswers] = useState<Record<string, CheckAnswer>>({});
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const done = checkedCount(answers);
  const last = db.vehicleChecks.find((c) => c.vehicleId === vehicleId && c.at.slice(0, 10) === day);
  const set = (item: string, a: CheckAnswer) => setAnswers((x) => ({ ...x, [item]: a }));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Driving check"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!vehicle || !checkReady(answers)}
            onClick={() => {
              const defects = CHECK_ITEMS.filter((i) => !answers[i]!.ok).map((i) => ({ item: i, note: answers[i]!.note!.trim() }));
              actAs(me.id, () => submitVehicleCheck(vehicleId, defects));
              toast(defects.length ? `${plural(defects.length, "defect")} sent to the yard. Do not drive ${vehicle?.reg} until it has been looked at` : `Check sent for ${vehicle?.reg}. All OK`);
              onClose();
            }}
          >
            Submit check
          </Button>
        </>
      }
    >
      <div className="grid gap-4" lang="en">
        <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Truck size={20} className="text-accent-ink" />
            <p className="flex-1 font-medium">{mine ? "Assigned vehicle" : "Which vehicle?"}</p>
            <span className="text-[0.87rem] text-muted tabular-nums">
              {done}/{CHECK_ITEMS.length} checked
            </span>
          </div>
          {mine ? (
            <p className="mt-1">
              {mine.reg}, {mine.make} {mine.model}
            </p>
          ) : (
            <select aria-label="Vehicle" className="field mt-2 h-11" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
              <option value="">Choose the vehicle</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.reg}, {v.make} {v.model}
                </option>
              ))}
            </select>
          )}
          {/* Tax, test or insurance out of date (Compliance, kept when the two chats were merged): do not drive it. */}
          {vehicle && vehicleBlocks(vehicle, day).length > 0 && (
            <p role="status" className="mt-2 rounded-md bg-bad-soft px-2.5 py-2 text-bad">
              <span className="font-medium">Do not drive {vehicle.reg}.</span> Its {vehicleBlocks(vehicle, day).map((k) => (k === "tax" ? "motor tax" : k === "test" ? "test" : "insurance")).join(" and ")} {vehicleBlocks(vehicle, day).length === 1 ? "has" : "have"} run out. The office renews it in Fleet.
            </p>
          )}
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${(done / CHECK_ITEMS.length) * 100}%` }} />
          </div>
          {last && <p className="mt-2 text-[0.87rem] text-muted">Already checked today at {last.at.slice(11, 16)}{last.defects.length ? `, ${plural(last.defects.length, "defect")} reported` : ", all OK"}.</p>}
        </div>
        {DRIVING_CHECK.map((sec, n) => (
          <fieldset key={sec.title} className="grid gap-2">
            <legend className="mb-1 text-[0.87rem] font-semibold tracking-wide text-muted uppercase">
              {n + 1}. {sec.title}
            </legend>
            {sec.items.map((item) => {
              const a = answers[item];
              return (
                <div key={item} className={cx("rounded-lg border px-3 py-2.5", a && !a.ok ? "border-bad bg-bad-soft/40" : a?.ok ? "border-line bg-surface" : "border-line-strong bg-surface")}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1">{item}</p>
                    <div className="flex shrink-0 gap-1.5" role="group" aria-label={item}>
                      <button type="button" aria-pressed={a?.ok === true} onClick={() => set(item, { ok: true })} className={cx("press min-h-11 min-w-12 rounded-md px-2.5 text-[0.93rem] font-medium", a?.ok === true ? "bg-ok text-white" : "bg-canvas text-muted hover:text-ink")}>
                        OK
                      </button>
                      <button type="button" aria-pressed={a?.ok === false} onClick={() => set(item, { ok: false, note: a?.note ?? "" })} className={cx("press min-h-11 rounded-md px-2.5 text-[0.93rem] font-medium", a?.ok === false ? "bg-bad text-white" : "bg-canvas text-muted hover:text-ink")}>
                        Defect
                      </button>
                    </div>
                  </div>
                  {a && !a.ok && (
                    <Field label="What is wrong?" className="mt-2">
                      {(id) => <textarea id={id} rows={2} className="field text-[1.02rem]" value={a.note ?? ""} onChange={(e) => set(item, { ok: false, note: e.target.value })} />}
                    </Field>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
    </Dialog>
  );
}

/** The operative's own details, their leave, a way to ask for holidays, and signing out (Oisin, 17 Nov). */
export function ProfileSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const role = usePrefs((s) => s.role);
  const setRole = usePrefs((s) => s.setRole);
  const navigate = useNavigate();
  const [asking, setAsking] = useState(false);
  const [from, setFrom] = useState(addDays(day, 14));
  const [to, setTo] = useState(addDays(day, 18));
  const [note, setNote] = useState("");
  const leave = db.holidays.filter((h) => h.personId === me.id && h.to >= addDays(day, -30)).sort((a, b) => a.from.localeCompare(b.from));
  const m = MORE[lang];
  return (
    <Dialog open onClose={onClose} title={m.profile}>
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} size={48} />
          <div>
            <p className="font-display text-[1.2rem] font-semibold">{me.name}</p>
            <p className="text-muted">{me.trade}</p>
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" lang="en">
          <dt className="text-muted">Phone</dt>
          <dd>{me.phone}</dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{me.email}</dd>
          <dt className="text-muted">Language</dt>
          <dd>{LANGUAGE_NAME[me.language]}</dd>
          {me.sageNo && (
            <>
              <dt className="text-muted">Employee no.</dt>
              <dd className="tabular-nums">{me.sageNo}</dd>
            </>
          )}
        </dl>
        <MyTickets me={me} lang={lang} day={day} />
        <div lang="en">
          <h3 className="mb-1 text-base">Holidays</h3>
          {leave.length === 0 ? (
            <p className="text-muted">None booked.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line" aria-label="My holidays">
              {leave.map((h) => (
                <li key={h.id} className="flex items-center gap-2 px-2.5 py-1.5">
                  <span className="flex-1">
                    {dShort(h.from)}
                    {h.to !== h.from && ` to ${dShort(h.to)}`}
                    {h.status === "Declined" && <DeclineNote note={h.declineNote} />}
                  </span>
                  <Badge tone={h.status === "Approved" ? "ok" : h.status === "Declined" ? "bad" : "accent"}>{h.status === "Requested" ? "Waiting" : h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {asking ? (
            <form
              className="mt-3 grid gap-2 rounded-lg border border-line bg-surface p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (to < from) return;
                actAs(me.id, () => requestLeave(me.id, from, to, note));
                toast(`Holiday request sent to the office: ${plural(workingDays(from, to), "working day")}`);
                setAsking(false);
                setNote("");
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <Field label="First day off">{(id) => <input id={id} type="date" className="field h-11" min={addDays(day, 1)} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
                <Field label="Last day off">{(id) => <input id={id} type="date" className="field h-11" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
              </div>
              <Field label="Reason (optional)">{(id) => <input id={id} className="field h-11" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
              {to < from ? <p className="text-bad">The last day is before the first day.</p> : <p className="text-[0.93rem] text-muted">{plural(workingDays(from, to), "working day")}. The office approves or declines it.</p>}
              <div className="flex justify-end gap-2">
                <Button onClick={() => setAsking(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={to < from}>
                  Send request
                </Button>
              </div>
            </form>
          ) : (
            <Button size="lg" className="mt-3 w-full" onClick={() => setAsking(true)}>
              <CalendarBlank size={20} /> {m.requestLeave}
            </Button>
          )}
        </div>
        <MyClaims me={me} />
        <Button
          size="lg"
          variant="danger"
          className="w-full"
          onClick={() => {
            setRole(null);
            navigate("/who", { replace: true });
          }}
        >
          <SignOut size={20} /> {m.signOut}
          {role !== "operative" && <span className="sr-only"> of the demo role</span>}
        </Button>
      </div>
    </Dialog>
  );
}

const EXPENSE_KINDS: ExpenseKind[] = ["Fuel", "Materials", "Parking and tolls", "Tools and PPE", "Other"];

/**
 * Claim back money paid out of your own pocket for the firm (Oisin, 17 Nov): what for, how much,
 * which site, and a photo of the receipt. It waits for the director in Admin, Requests.
 */
export function ExpenseSheet({ me, day, siteId, sites, onClose }: { me: Person; day: string; siteId: string | null; sites: Project[]; onClose: () => void }) {
  const region = usePrefs((s) => s.brand.region);
  const [kind, setKind] = useState<ExpenseKind>("Fuel");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(day);
  const [what, setWhat] = useState("");
  const [projectId, setProjectId] = useState(siteId ?? "");
  const [receipt, setReceipt] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  const ready = amount > 0 && what.trim().length > 0 && date <= day;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Claim a reimbursement"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!ready}
            onClick={() => {
              actAs(me.id, () => claimExpense({ personId: me.id, kind, what: what.trim(), amount, date, projectId: projectId || null, ...(receipt ? { receipt } : {}) }));
              toast(`Claim for ${amount.toFixed(2)} sent to the office${receipt ? "" : ". Hand in the paper receipt"}`);
              onClose();
            }}
          >
            Send claim
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang="en">
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">What was it for?</legend>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={cx("press min-h-11 rounded-lg border px-3", kind === k ? "border-accent bg-accent-soft font-medium text-accent-ink" : "border-line-strong")}>
                {k}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Amount paid (${region === "UK" ? "£" : "€"}, with VAT)`}>{() => <NumInput label="Amount paid" className="h-11 w-full text-[1.02rem]" value={amount} onChange={setAmount} />}</Field>
          <Field label="Day paid">{(id) => <input id={id} type="date" className="field h-11" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <Field label="What did you buy?">{(id) => <input id={id} className="field h-11 text-[1.02rem]" value={what} placeholder="Diesel for the van" onChange={(e) => setWhat(e.target.value)} />}</Field>
        <Field label="For which site">
          {(id) => (
            <select id={id} className="field h-11" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Not for one site</option>
              {sites.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div>
          <p className="mb-1 font-medium">Photo of the receipt</p>
          <PickFile accept="image/*" onFile={(f) => { setError(""); shrinkImage(f).then(setReceipt).catch((e: Error) => { setReceipt(null); setError(e.message); }); }} />
          <p role="alert" className="text-bad">
            {error}
          </p>
          {receipt ? <img src={receipt.dataUrl} alt="The receipt" className="mt-2 max-h-40 rounded-md border border-line" /> : <p className="text-[0.93rem] text-muted">Take a photo of it, or hand the paper receipt in to the office.</p>}
        </div>
      </div>
    </Dialog>
  );
}

/** The person's own claims and where each one stands. */
export function MyClaims({ me }: { me: Person }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const claims = db.expenses.filter((x) => x.personId === me.id).slice(0, 6);
  if (claims.length === 0) return null;
  return (
    <div lang="en">
      <h3 className="mb-1 text-base">Reimbursements</h3>
      <ul className="divide-y divide-line rounded-md border border-line" aria-label="My reimbursements">
        {claims.map((x) => (
          <li key={x.id} className="flex items-center gap-2 px-2.5 py-1.5">
            <span className="min-w-0 flex-1">
              {x.kind}, {dShort(x.date)}
              {x.status === "Declined" && <DeclineNote note={x.declineNote} />}
              {x.status === "Approved" && <span className="block text-[0.87rem] text-muted">{x.exportedAt ? `With the office for payment since ${dShort(x.exportedAt.slice(0, 10))}` : "On the office's list to pay"}</span>}
            </span>
            <span className="tabular-nums">{region === "UK" ? "£" : "€"}{x.amount.toFixed(2)}</span>
            <Badge tone={x.status === "Approved" ? "ok" : x.status === "Declined" ? "bad" : "accent"}>{x.status === "Approved" ? (x.exportedAt ? "Sent for payment" : "Approved") : x.status}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Their own tickets in the profile (Compliance, merged 19 Nov at Oisin's word: in the profile,
 * with the red "you cannot work" card on the front page): each with when it runs out, the ones
 * that stop work said plainly, and a photo of a new card to send to the office to check.
 */
function MyTickets({ me, lang, day }: { me: Person; lang: Language; day: string }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  const person = db.people.find((p) => p.id === me.id) ?? me;
  const [sending, setSending] = useState<string | null>(null);
  const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const stops = ticketBlocks(person, day);
  const sorted = [...person.certs].sort((a, b) => a.expires.localeCompare(b.expires));
  const cert = person.certs.find((c) => c.id === sending);
  return (
    <div lang={lang}>
      <h3 className="mb-1 text-base">{t.myTickets}</h3>
      <ul className="divide-y divide-line rounded-md border border-line" aria-label={t.myTickets}>
        {sorted.map((c) => {
          const state = stateOf(c.expires, day);
          const blocks = stops.some((b) => b.ticket === c.name);
          return (
            <li key={c.id} className="grid gap-1.5 px-2.5 py-2">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1">{c.name}</span>
                <Badge tone={state === "expired" ? "bad" : state === "due" ? "warn" : "ok"}>
                  {state === "expired" ? t.ranOut : t.runsOut} {short(c.expires)}
                </Badge>
              </span>
              {blocks && <span className="text-[0.93rem] text-bad">{t.cannotWork}</span>}
              {c.sentPhoto ? (
                <span className="text-[0.93rem] text-accent-ink">{t.cardWaiting}</span>
              ) : (
                state !== "ok" && (
                  <Button size="lg" className="justify-self-start" onClick={() => setSending(c.id)}>
                    <Camera size={18} /> {t.sendCard}
                  </Button>
                )
              )}
            </li>
          );
        })}
      </ul>
      {cert && <CardPhotoSheet me={person} certId={cert.id} certName={cert.name} lang={lang} onClose={() => setSending(null)} />}
    </div>
  );
}

/** A photo of a new card, taken or chosen on the phone, sent for the office to check in Compliance. */
function CardPhotoSheet({ me, certId, certName, lang, onClose }: { me: Person; certId: string; certName: string; lang: Language; onClose: () => void }) {
  const t = WORDS[lang];
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={t.sendCard}
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={!picture}
            onClick={() => {
              if (!picture) return;
              actAs(me.id, () => sendTicketPhoto(me.id, certId, { name: `${certName}, ${me.name}.jpg`, dataUrl: picture.dataUrl }));
              toast(t.cardSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
      <div className="grid gap-3" lang={lang}>
        <p className="font-medium">{certName}</p>
        <PickFile accept="image/*" what="card" onFile={(f) => { setError(""); shrinkImage(f).then(setPicture).catch((e: Error) => { setPicture(null); setError(e.message); }); }} />
        {!picture && <p className="text-[0.93rem] text-muted">{t.takeOrChoose}</p>}
        <p role="alert" className="text-bad">
          {error}
        </p>
        {picture && <img src={picture.dataUrl} alt="" className="max-h-44 rounded-md border border-line" />}
      </div>
    </Dialog>
  );
}
