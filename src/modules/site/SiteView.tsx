import { CalendarBlank, Camera, HandPalm, IdentificationCard, Phone, PlusCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { actAs, addPhoto, addRequest, raiseExtra, sendTicketPhoto } from "@/data/actions";
import { bookingFor, stateOf, ticketBlocks, vehicleBlocks } from "@/lib/compliance";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Language, LANGUAGE_NAME, type Person, type Project, type RequestKind } from "@/data/types";
import { personWeek } from "@/lib/availability";
import { addDays } from "@/lib/dates";
import { REGION } from "@/lib/money";
import { shrinkImage } from "@/lib/image";
import { workWeek } from "@/lib/week";
import { Button, cx, Dialog, Field, PageBody, PageHead, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { EXTRAS, INSTRUCTIONS, WORDS } from "./words";

type Sheet = "photo" | "extra" | "ask" | "week" | "tickets" | null;

/**
 * What an operative sees on their own phone: one Today screen with large buttons, in their
 * own language. On a computer it is drawn at phone width so it can be shown on a call.
 */
export function SiteView() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const crew = db.people.filter((p) => p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
  const me = crew.find((p) => p.id === operativeId) ?? crew[0];
  // English first when the phone opens (Aodhan, 16 Nov); the operative's own language is one tap away.
  const [english, setEnglish] = useState(true);
  if (!me) return null;
  const lang: Language = english ? "en" : me.language;
  return (
    <>
      <PageHead
        title="Site phone view"
        note="What each operative sees on their own phone, in English or their own language. Photos, extras and requests sent from here land in the office straight away."
        actions={
          role !== "operative" && (
            <label className="flex items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Signed in as</span>
              <select aria-label="Operative to view the phone as" className="field w-auto" value={me.id} onChange={(e) => { setOperative(e.target.value); setEnglish(false); }}>
                {crew.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {LANGUAGE_NAME[p.language]}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      <PageBody className="grid justify-items-center gap-3">
        {me.language !== "en" && (
          <Segmented label="Language shown" value={english ? "en" : "own"} onChange={(v) => setEnglish(v === "en")} options={[{ value: "en", label: "English" }, { value: "own", label: LANGUAGE_NAME[me.language] }]} />
        )}
        <Phone_ key={me.id} me={me} lang={lang} day={day} />
      </PageBody>
    </>
  );
}

function Phone_({ me, lang, day }: { me: Person; lang: Language; day: string }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const mine = db.assignments.filter((a) => a.personId === me.id && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)!);
  const site = mine.find((p) => db.attendance.some((a) => a.projectId === p.id && a.personId === me.id && a.date === day)) ?? mine[0];
  const manager = db.people.find((p) => p.id === site?.siteManagerId);
  const translated = site ? INSTRUCTIONS[site.code]?.[lang] : undefined;
  const instructions = lang === "en" || showOriginal || !translated ? site?.siteInstructions : translated;
  const dateText = new Date(day + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  // Compliance on the phone (18 Nov): a ticket that stops work, and the van they drive.
  const blocks = ticketBlocks(me, day);
  const van = db.vehicles.find((v) => v.active && v.driverId === me.id);
  const vanGone = van ? vehicleBlocks(van, day) : [];
  const vanDue = van ? (["tax", "test", "insurance"] as const).filter((k) => stateOf(van.compliance[k].expiryDate, day) === "due") : [];
  const region = REGION[usePrefs.getState().brand.region];
  const vanLabel = (k: "tax" | "test" | "insurance") => (k === "tax" ? region.roadTax : k === "test" ? region.vehicleTest : "Insurance");
  const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const big = "press flex min-h-16 w-full items-center gap-3 rounded-lg border border-line-strong bg-surface px-4 text-left text-[1.05rem] font-medium hover:border-accent hover:text-accent-ink";
  return (
    <div className="w-full max-w-[24rem] overflow-hidden rounded-2xl border border-line-strong bg-canvas" aria-label="Phone screen" lang={lang}>
      <div className="bg-accent-strong px-4 py-3 text-white">
        <p className="text-[0.93rem] opacity-90">
          {t.today}, {dateText}
        </p>
        <p className="font-display text-[1.35rem] leading-tight font-semibold">{site ? `${site.code} ${site.name}` : me.name}</p>
        {site && (
          <p className="text-[0.93rem] opacity-90">
            {site.location}, {co(site.county)}. {t.start}
          </p>
        )}
      </div>
      <div className="grid gap-3 px-4 py-4">
        {blocks.length > 0 && (
          <div className="rounded-lg bg-bad-soft px-3 py-3 text-bad" role="status">
            <p className="font-medium">
              {blocks.map((b) => (b.expires ? `${b.ticket} ${t.ranOut} ${short(b.expires)}` : b.ticket)).join(", ")}
            </p>
            <p className="mt-0.5">{t.cannotWork}</p>
            {bookingFor(db.courses, me.id, blocks[0]!.ticket) && (
              <p className="mt-0.5">
                {t.booked}: {short(bookingFor(db.courses, me.id, blocks[0]!.ticket)!.date)}
              </p>
            )}
          </div>
        )}
        {van && (vanGone.length > 0 || vanDue.length > 0) && (
          <div className={cx("rounded-lg px-3 py-3", vanGone.length ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")} role="status">
            <p className="font-medium">
              {t.van}, {van.reg}: {vanGone.length ? `${vanGone.map(vanLabel).join(", ")} ${t.ranOut}` : vanDue.map((k) => `${vanLabel(k)} ${t.dueBy} ${short(van.compliance[k].expiryDate)}`).join(", ")}
            </p>
            {vanGone.length > 0 && <p className="mt-0.5">{t.doNotDrive}</p>}
          </div>
        )}
        {!site ? (
          <p className="rounded-lg bg-warn-soft px-3 py-3 text-warn">{t.noSite}</p>
        ) : (
          <>
            {manager && (
              <a href={`tel:${manager.phone.replace(/\s/g, "")}`} className="press flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.87rem] text-muted">{t.manager}</span>
                  <span className="font-medium">{manager.name}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-3 py-2 font-medium text-accent-ink">
                  <Phone size={18} /> {t.call}
                </span>
              </a>
            )}
            {site.siteInstructions && (
              <div className="rounded-lg bg-surface px-3 py-3">
                <p className="font-medium">{t.instructions}</p>
                <p className="mt-1 text-[1.02rem] leading-relaxed" lang={showOriginal || !translated ? "en" : lang}>
                  {instructions}
                </p>
                {translated && lang !== "en" && (
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 text-[0.87rem] text-muted">
                    {!showOriginal && t.translated}
                    <button type="button" className="press font-medium text-accent-ink underline underline-offset-2" onClick={() => setShowOriginal((v) => !v)}>
                      {showOriginal ? t.mine : t.original}
                    </button>
                  </p>
                )}
              </div>
            )}
            <button type="button" className={big} onClick={() => setSheet("photo")}>
              <Camera size={24} className="text-accent-ink" /> {t.photo}
            </button>
            <button type="button" className={big} onClick={() => setSheet("extra")}>
              <PlusCircle size={24} className="text-accent-ink" /> {t.extra}
            </button>
            <button type="button" className={big} onClick={() => setSheet("ask")}>
              <HandPalm size={24} className="text-accent-ink" /> {t.ask}
            </button>
          </>
        )}
        <button type="button" className={big} onClick={() => setSheet("week")}>
          <CalendarBlank size={24} className="text-accent-ink" /> {t.week}
        </button>
        <button type="button" className={big} onClick={() => setSheet("tickets")}>
          <IdentificationCard size={24} className="text-accent-ink" /> {t.myTickets}
        </button>
      </div>
      {site && sheet === "photo" && <PhotoSheet site={site} me={me} lang={lang} onClose={() => setSheet(null)} />}
      {site && sheet === "extra" && <ExtraSheet site={site} me={me} lang={lang} onClose={() => setSheet(null)} />}
      {site && sheet === "ask" && <AskSheet site={site} me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
      {sheet === "week" && <WeekSheet me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
      {sheet === "tickets" && <TicketsSheet me={me} lang={lang} day={day} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Their own tickets with the dates, and a photo of a new card to send to the office (Compliance, 18 Nov). */
function TicketsSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const t = WORDS[lang];
  const db = useData((s) => s.db);
  const person = db.people.find((p) => p.id === me.id) ?? me;
  const [sending, setSending] = useState<string | null>(null);
  const [picture, setPicture] = useState<{ dataUrl: string; sizeKb: number } | null>(null);
  const [error, setError] = useState("");
  const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const cert = person.certs.find((c) => c.id === sending);
  const sorted = [...person.certs].sort((a, b) => a.expires.localeCompare(b.expires));
  return (
    <Dialog
      open
      onClose={onClose}
      title={cert ? t.sendCard : t.myTickets}
      footer={
        cert ? (
          <>
            <Button size="lg" onClick={() => { setSending(null); setPicture(null); }}>
              {t.cancel}
            </Button>
            <Button
              size="lg"
              variant="primary"
              disabled={!picture}
              onClick={() => {
                if (!picture) return;
                actAs(me.id, () => sendTicketPhoto(me.id, cert.id, { name: `${cert.name}, ${me.name}.jpg`, dataUrl: picture.dataUrl }));
                toast(t.cardSent);
                setSending(null);
                setPicture(null);
              }}
            >
              {t.send}
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={onClose}>
            {t.cancel}
          </Button>
        )
      }
    >
      <div className="grid gap-3" lang={lang}>
        {cert ? (
          <>
            <p className="font-medium">{cert.name}</p>
            <PickFile accept="image/*" what="card" onFile={(f) => { setError(""); shrinkImage(f).then(setPicture).catch((e: Error) => { setPicture(null); setError(e.message); }); }} />
            {!picture && <p className="text-[0.93rem] text-muted">{t.takeOrChoose}</p>}
            <p role="alert" className="text-bad">
              {error}
            </p>
            {picture && <img src={picture.dataUrl} alt="" className="max-h-44 rounded-md border border-line" />}
          </>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line" aria-label={t.myTickets}>
            {sorted.map((c) => {
              const state = stateOf(c.expires, day);
              const stops = ticketBlocks(person, day).some((b) => b.ticket === c.name);
              return (
                <li key={c.id} className="grid gap-1.5 px-3 py-2.5">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                    <span className={cx("text-[0.93rem]", state === "expired" ? "font-medium text-bad" : state === "due" ? "font-medium text-warn" : "text-muted")}>
                      {state === "expired" ? t.ranOut : t.runsOut} {short(c.expires)}
                    </span>
                  </span>
                  {stops && <span className="text-[0.93rem] text-bad">{t.cannotWork}</span>}
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
        )}
      </div>
    </Dialog>
  );
}

function PhotoSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
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

function ExtraSheet({ site, me, lang, onClose }: { site: Project; me: Person; lang: Language; onClose: () => void }) {
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

function AskSheet({ site, me, lang, day, onClose }: { site: Project; me: Person; lang: Language; day: string; onClose: () => void }) {
  const t = WORDS[lang];
  const [kind, setKind] = useState<RequestKind>("own_plant");
  const [text, setText] = useState("");
  const kinds: [RequestKind, string][] = [["own_plant", t.ownPlant], ["hired_plant", t.hirePlant], ["personnel", t.people]];
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
              actAs(me.id, () => addRequest({ projectId: site.id, kind, description: text.trim(), quantity: 1, neededFrom: addDays(day, 1), neededTo: addDays(day, 7), notes: lang === "en" ? "Sent from the site phone" : `Sent from the site phone in ${LANGUAGE_NAME[lang]}` }));
              toast(t.askSent);
              onClose();
            }}
          >
            {t.send}
          </Button>
        </>
      }
    >
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
    </Dialog>
  );
}

function WeekSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  // After Friday's work the week that matters is the next one.
  const week = workWeek(new Date(day + "T12:00:00Z").getUTCDay() >= 5 ? addDays(day, 3) : day);
  const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
  const states = personWeek(db.plan, db.holidays, live, me.id, week);
  const project = (id: string) => db.projects.find((p) => p.id === id);
  return (
    <Dialog open onClose={onClose} title={t.week}>
      <ul className="divide-y divide-line" lang={lang}>
        {states.map((d) => {
          const entries = db.plan.filter((p) => p.personId === me.id && p.date === d.date && live.has(p.projectId));
          return (
            <li key={d.date} className="flex items-baseline gap-3 py-2.5">
              <span className="w-28 shrink-0 text-muted">{new Date(d.date + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
              <span className="min-w-0 flex-1 font-medium">
                {d.leave
                  ? t.leave
                  : entries.length === 0
                    ? <span className="font-normal text-muted">{t.free}</span>
                    : entries.map((e) => (
                        <span key={e.id} className="block">
                          {project(e.projectId)?.code} {project(e.projectId)?.name}
                          {e.part === "half" && <span className="font-normal text-muted">, {t.half}</span>}
                          {e.overtimeHours ? <span className="font-normal text-muted">, +{e.overtimeHours}h</span> : null}
                        </span>
                      ))}
              </span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
