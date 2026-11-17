import { CalendarBlank, Camera, HandPalm, Phone, PlusCircle, Receipt, Truck } from "@phosphor-icons/react";
import { useState } from "react";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Language, LANGUAGE_NAME, type Person, type Project } from "@/data/types";
import { personWeek } from "@/lib/availability";
import { dayInstruction, managerJobs, personDay, siteOn } from "@/lib/roster";
import { nextWorkWeek, workWeek } from "@/lib/week";
import { Dialog, PageBody, PageHead, Segmented } from "@/ui";
import { ManagerPhone } from "./ManagerPhone";
import { AskSheet, BIG, DrivingSheet, ExpenseSheet, ExtraSheet, longDate, ManagerCard, PhotoSheet, ProfileButton, ProfileSheet } from "./sheets";
import { INSTRUCTIONS, MORE, WORDS } from "./words";

type Sheet = "photo" | "extra" | "ask" | "week" | "driving" | "profile" | "expense" | "manager" | null;

type PhoneOf = "operative" | "manager";

/**
 * The site phone. Two kinds of phone (Oisin, 17 Nov): an operative's, which is one Today screen
 * with large buttons in their own language (below), and a site manager's, which opens on the jobs
 * they run (ManagerPhone.tsx). On a computer it is drawn at phone width so it can be shown on a call.
 */
export function SiteView() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const access = useAccess();
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const crew = db.people.filter((p) => p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
  // Anyone with a job on their phone: the people who run a site, and anyone given one (Admin, Site access).
  const managers = db.people.filter((p) => p.active && p.kind === "Management" && managerJobs(db.projects, p.id, db.siteAccess).length > 0).sort((a, b) => a.name.localeCompare(b.name));
  const [of, setOf] = useState<PhoneOf>(role === "site" ? "manager" : "operative");
  // A site manager signed in sees their own phone; the office can look at anyone's.
  const [managerId, setManagerId] = useState(role === "site" && access.personId ? access.personId : (managers[0]?.id ?? ""));
  const me = crew.find((p) => p.id === operativeId) ?? crew[0];
  const manager = managers.find((p) => p.id === managerId) ?? managers[0];
  // English first when the phone opens (Aodhan, 16 Nov); the operative's own language is one tap away.
  const [english, setEnglish] = useState(true);
  const office = role !== "operative" && role !== "site";
  const kind: PhoneOf = role === "operative" ? "operative" : of;
  if (kind === "operative" && !me) return null;
  const lang: Language = english || !me ? "en" : me.language;
  return (
    <>
      <PageHead
        title="Site phone view"
        note={kind === "operative" ? "What each operative sees on their own phone, in English or their own language. Photos and extras land in the office straight away; a request goes to their site manager first." : "What a site manager sees on their phone: the jobs they run, and in each one the timesheet, the week and month ahead, the day's site instructions, what the crew has asked for, photos, extra work and requests."}
        actions={
          role !== "operative" && (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented label="Phone of" value={kind} onChange={setOf} options={[{ value: "operative", label: "Operative" }, { value: "manager", label: "Site manager" }]} />
              {kind === "operative" && me && (
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
              )}
              {kind === "manager" && office && manager && (
                <label className="flex items-center gap-2 text-[0.93rem]">
                  <span className="text-muted">Signed in as</span>
                  <select aria-label="Site manager to view the phone as" className="field w-auto" value={manager.id} onChange={(e) => setManagerId(e.target.value)}>
                    {managers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )
        }
      />
      <PageBody className="grid justify-items-center gap-3">
        {kind === "operative" && me && (
          <>
            {me.language !== "en" && (
              <Segmented label="Language shown" value={english ? "en" : "own"} onChange={(v) => setEnglish(v === "en")} options={[{ value: "en", label: "English" }, { value: "own", label: LANGUAGE_NAME[me.language] }]} />
            )}
            <Phone_ key={me.id} me={me} lang={lang} day={day} />
          </>
        )}
        {kind === "manager" && (manager ? <ManagerPhone key={manager.id} me={manager} day={day} /> : <p className="text-muted">No site manager is running a job at the moment.</p>)}
      </PageBody>
    </>
  );
}

/**
 * The operative's phone: one Today screen. The site and its manager are the ones for that day
 * (where they were marked in, else where they are planned), with the manager's instructions for
 * the day above the standing site instructions (Oisin, 17 Nov).
 */
function Phone_({ me, lang, day }: { me: Person; lang: Language; day: string }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  const m = MORE[lang];
  const [sheet, setSheet] = useState<Sheet>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const mine = db.assignments.filter((a) => a.personId === me.id && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)!);
  const todays = siteOn(me.id, day, db.attendance, db.plan, live);
  const site = db.projects.find((p) => p.id === todays) ?? mine[0];
  const manager = db.people.find((p) => p.id === site?.siteManagerId);
  const note = dayInstruction(db.dayInstructions, site?.id, day);
  const translated = site ? INSTRUCTIONS[site.code]?.[lang] : undefined;
  const instructions = lang === "en" || showOriginal || !translated ? site?.siteInstructions : translated;
  const close = () => setSheet(null);
  return (
    <div className="w-full max-w-[24rem] overflow-hidden rounded-2xl border border-line-strong bg-canvas" aria-label="Phone screen" lang={lang}>
      <div className="bg-accent-strong px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <ProfileButton name={me.name} label={m.profile} onClick={() => setSheet("profile")} />
          <p className="text-[0.93rem] opacity-90">
            {t.today}, {longDate(day, lang === "en" ? "en-IE" : lang)}
          </p>
        </div>
        <p className="font-display text-[1.35rem] leading-tight font-semibold">{site ? `${site.code} ${site.name}` : me.name}</p>
        {site && (
          <p className="text-[0.93rem] opacity-90">
            {site.location}, {co(site.county)}. {t.start}
          </p>
        )}
      </div>
      <div className="grid gap-3 px-4 py-4">
        {!site ? (
          <p className="rounded-lg bg-warn-soft px-3 py-3 text-warn">{t.noSite}</p>
        ) : (
          <>
            {manager && (
              <div className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2.5">
                <button type="button" className="press min-w-0 flex-1 rounded text-left" aria-label={`${t.manager}: ${manager.name}`} onClick={() => setSheet("manager")}>
                  <span className="block text-[0.87rem] text-muted">{t.manager}</span>
                  <span className="font-medium text-accent-ink underline decoration-line-strong underline-offset-2">{manager.name}</span>
                </button>
                <a href={`tel:${manager.phone.replace(/\s/g, "")}`} className="press inline-flex min-h-11 items-center gap-1.5 rounded-md bg-accent-soft px-3 font-medium text-accent-ink">
                  <Phone size={18} /> {t.call}
                </a>
              </div>
            )}
            {note && (
              <div className="rounded-lg border-l-4 border-accent bg-surface px-3 py-3" aria-label={m.todayNote}>
                <p className="font-medium">{m.todayNote}</p>
                <p className="mt-1 text-[1.02rem] leading-relaxed" lang="en">
                  {note.text}
                </p>
                <p className="mt-2 text-[0.87rem] text-muted">
                  {note.by}, {note.at.slice(11, 16)}
                  {m.asWritten ? `. ${m.asWritten}` : ""}
                </p>
              </div>
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
            <button type="button" className={BIG} onClick={() => setSheet("photo")}>
              <Camera size={24} className="text-accent-ink" /> {t.photo}
            </button>
            <button type="button" className={BIG} onClick={() => setSheet("extra")}>
              <PlusCircle size={24} className="text-accent-ink" /> {t.extra}
            </button>
            <button type="button" className={BIG} onClick={() => setSheet("ask")}>
              <HandPalm size={24} className="text-accent-ink" /> {t.ask}
            </button>
          </>
        )}
        <button type="button" className={BIG} onClick={() => setSheet("expense")}>
          <Receipt size={24} className="text-accent-ink" /> {m.expense}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("driving")}>
          <Truck size={24} className="text-accent-ink" /> {m.driving}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("week")}>
          <CalendarBlank size={24} className="text-accent-ink" /> {t.week}
        </button>
      </div>
      {site && sheet === "photo" && <PhotoSheet site={site} me={me} lang={lang} onClose={close} />}
      {site && sheet === "extra" && <ExtraSheet site={site} me={me} lang={lang} onClose={close} />}
      {site && sheet === "ask" && <AskSheet site={site} me={me} lang={lang} day={day} toManager onClose={close} />}
      {site && manager && sheet === "manager" && <ManagerCard manager={manager} site={site} lang={lang} onClose={close} />}
      {sheet === "week" && <WeekSheet me={me} lang={lang} day={day} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={site?.id ?? null} sites={mine} onClose={close} />}
      {sheet === "profile" && <ProfileSheet me={me} lang={lang} day={day} onClose={close} />}
    </div>
  );
}

/**
 * My week: where the operative is each day, and beside each site its site manager. Tapping the
 * manager's name opens his details with a Call now button (Oisin, 17 Nov).
 */
function WeekSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const t = WORDS[lang];
  const m = MORE[lang];
  const [card, setCard] = useState<{ manager: Person; site: Project } | null>(null);
  // This week or the one being planned (17 Nov). After Friday's work the week that matters is the next one.
  const [which, setWhich] = useState<"this" | "next">(new Date(day + "T12:00:00Z").getUTCDay() >= 5 ? "next" : "this");
  const week = which === "next" ? nextWorkWeek(day) : workWeek(day);
  const live = new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id));
  const states = personWeek(db.plan, db.holidays, live, me.id, week);
  const project = (id: string) => db.projects.find((p) => p.id === id);
  return (
    <>
      <Dialog open onClose={onClose} title={t.week}>
        <div className="mb-2" lang={lang}>
          <Segmented label={t.week} value={which} onChange={setWhich} options={[{ value: "this", label: m.thisWeek }, { value: "next", label: m.nextWeek }]} />
        </div>
        <ul className="divide-y divide-line" lang={lang} aria-label={which === "next" ? m.nextWeek : m.thisWeek}>
          {states.map((d) => {
            // A day gone shows where they were marked in on the timesheet; a day to come shows the plan.
            // The office's week and month ahead read the same two records the same way, so all three agree.
            const mine = personDay(db.attendance, db.plan, me.id, d.date, day, live);
            const gone = mine.from === "timesheet";
            const entries = mine.rows;
            return (
              <li key={d.date} className="flex items-baseline gap-3 py-2.5">
                <span className="w-24 shrink-0 text-muted">{new Date(d.date + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</span>
                <span className="min-w-0 flex-1 font-medium">
                  {entries.length === 0 ? (
                    d.leave ? t.leave : <span className="font-normal text-muted">{gone ? m.notIn : t.free}</span>
                  ) : (
                    entries.map((e) => {
                      const site = project(e.projectId);
                      const manager = db.people.find((p) => p.id === site?.siteManagerId);
                      const note = dayInstruction(db.dayInstructions, e.projectId, d.date);
                      return (
                        <span key={e.projectId} className="block">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className={d.date < day ? "font-normal text-muted" : undefined}>
                              {site?.code} {site?.name}
                              {e.half && <span className="font-normal text-muted">, {t.half}</span>}
                              {e.overtimeHours ? <span className="font-normal text-muted">, +{e.overtimeHours}h</span> : null}
                            </span>
                            {site && manager && (
                              <button type="button" aria-label={`${t.manager}: ${manager.name}, ${site.code}`} className="press -my-1 inline-flex min-h-9 items-center gap-1 rounded text-[0.93rem] font-normal text-accent-ink underline decoration-line-strong underline-offset-2" onClick={() => setCard({ manager, site })}>
                                <Phone size={15} /> {manager.name}
                              </button>
                            )}
                          </span>
                          {note && (
                            <span className="mt-0.5 block text-[0.87rem] font-normal text-muted" lang="en">
                              {note.text}
                            </span>
                          )}
                        </span>
                      );
                    })
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Dialog>
      {card && <ManagerCard manager={card.manager} site={card.site} lang={lang} onClose={() => setCard(null)} />}
    </>
  );
}
