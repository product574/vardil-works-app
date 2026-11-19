import { CalendarBlank, Camera, CarProfile, Clock, HandPalm, IdentificationCard, Phone, PlusCircle, Receipt, Truck, Wrench } from "@phosphor-icons/react";
import { useState } from "react";
import { useAccess } from "@/data/access";
import { bookingFor, stateOf, ticketBlocks, vehicleBlocks } from "@/lib/compliance";
import { REGION } from "@/lib/money";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Language, LANGUAGE_NAME, type Person, type Project } from "@/data/types";
import { personWeek } from "@/lib/availability";
import { dayInstruction, managerJobs, personDay, siteOn } from "@/lib/roster";
import { overtimeText, overtimeTotal } from "@/lib/overtime";
import { fullWeek, nextWorkWeek, overtimeNote, workWeek } from "@/lib/week";
import { Badge, cx, Dialog, PageBody, PageHead, Segmented } from "@/ui";
import { CheckLine, DamageSheet, LicenceSheet } from "./fleet-sheets";
import { HoursSheet } from "./hours";
import { OfficeFeed } from "./OfficeFeed";
import { RepairSheet } from "./one-sheets";
import { PhoneFrame } from "./PhoneFrame";
import { ManagerPhone } from "./ManagerPhone";
import { AskSheet, BIG, DrivingSheet, ExpenseSheet, ExtraSheet, longDate, ManagerCard, PhotoSheet, ProfileButton, ProfileSheet } from "./sheets";
import { INSTRUCTIONS, MORE, WORDS } from "./words";

type Sheet = "photo" | "extra" | "ask" | "week" | "hours" | "driving" | "damage" | "licence" | "profile" | "expense" | "manager" | null;

type PhoneOf = "operative" | "manager";

/**
 * The site phone. Two kinds of phone (Oisin, 17 Nov): an operative's, which is one Today screen
 * with large buttons in their own language (below), and a site manager's, which opens on the jobs
 * they run (ManagerPhone.tsx). On a wide screen both are drawn side by side, each in a phone-sized
 * frame that scrolls inside itself (merged 19 Nov); narrower, one at a time with a switch; on a
 * real phone, with no frame.
 */
export function SiteView() {
  const access = useAccess();
  // The main offering (19 Nov): without Projects there are no jobs on a phone, so every employee
  // has the same one phone, whatever their level.
  return access.apps.on("projects") ? <TwoPhones /> : <OnePhoneView />;
}

function TwoPhones() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const access = useAccess();
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const crew = db.people.filter((p) => p.active && p.kind === "Operative").sort((a, b) => a.name.localeCompare(b.name));
  // Anyone with a job on their phone: the people who run a site, and anyone given one (Admin, Site access).
  const managers = db.people.filter((p) => p.active && p.kind === "Management" && managerJobs(db.projects, p.id, db.siteAccess).length > 0).sort((a, b) => a.name.localeCompare(b.name));
  // Below a wide screen there is room for one phone: this switch picks which (merged 19 Nov).
  const [of, setOf] = useState<PhoneOf>(role === "site" ? "manager" : "operative");
  // A site manager signed in sees their own phone; the office can look at anyone's.
  const [managerId, setManagerId] = useState(role === "site" && access.personId ? access.personId : (managers[0]?.id ?? ""));
  const me = crew.find((p) => p.id === operativeId) ?? crew[0];
  const manager = managers.find((p) => p.id === managerId) ?? managers[0];
  // English first when the phone opens (Aodhan, 16 Nov); the operative's own language is one tap away.
  const [english, setEnglish] = useState(true);
  const office = role !== "operative" && role !== "site";
  const both = role !== "operative";
  if (!both && !me) return null;
  const lang: Language = english || !me ? "en" : me.language;
  return (
    <>
      <PageHead
        title="Site phone view"
        note={both ? "An operative's phone and a site manager's, side by side. Each scrolls inside itself, and its buttons open on the phone." : "What you see on your own phone, in English or your own language."}
        actions={
          both && (
            <div className="xl:hidden">
              <Segmented label="Phone of" value={of} onChange={setOf} options={[{ value: "operative", label: "Operative" }, { value: "manager", label: "Site manager" }]} />
            </div>
          )
        }
      />
      {/* Both phones side by side (Oisin's pick C, merged 19 Nov), then, for the office, what they send in, live. */}
      <PageBody className={cx("grid items-start gap-6", office && "min-[90rem]:grid-cols-[auto_minmax(0,1fr)]")}>
        <div className="flex flex-wrap items-start justify-center gap-6 xl:flex-nowrap xl:justify-start">
          {me && (
            <div className={cx("grid w-full justify-items-center gap-2 sm:w-auto", both && of !== "operative" && "max-xl:hidden")}>
              <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
                {both && (
                  <label className="flex items-center gap-2 text-[0.93rem]">
                    <span className="text-muted">Operative</span>
                    <select aria-label="Operative to view the phone as" className="field w-auto max-w-[15rem]" value={me.id} onChange={(e) => { setOperative(e.target.value); setEnglish(false); }}>
                      {crew.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}, {LANGUAGE_NAME[p.language]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {me.language !== "en" && <Segmented label="Language shown" value={english ? "en" : "own"} onChange={(v) => setEnglish(v === "en")} options={[{ value: "en", label: "English" }, { value: "own", label: LANGUAGE_NAME[me.language] }]} />}
              </div>
              <PhoneFrame label="Operative's phone">
                <Phone_ key={me.id} me={me} lang={lang} day={day} />
              </PhoneFrame>
            </div>
          )}
          {both && (
            <div className={cx("grid w-full justify-items-center gap-2 sm:w-auto", of !== "manager" && "max-xl:hidden")}>
              <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
                {office && manager ? (
                  <label className="flex items-center gap-2 text-[0.93rem]">
                    <span className="text-muted">Site manager</span>
                    <select aria-label="Site manager to view the phone as" className="field w-auto max-w-[15rem]" value={manager.id} onChange={(e) => setManagerId(e.target.value)}>
                      {managers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="text-[0.93rem] text-muted">{manager ? `Your phone, ${manager.name}` : ""}</span>
                )}
              </div>
              {manager ? (
                <PhoneFrame label="Site manager's phone">
                  <ManagerPhone key={manager.id} me={manager} day={day} />
                </PhoneFrame>
              ) : (
                <p className="text-muted">No site manager is running a job at the moment.</p>
              )}
            </div>
          )}
        </div>
        {office && <OfficeFeed day={day} />}
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
  const fleetOn = useAccess().apps.on("fleet");
  // Their own overtime claims still waiting for the site manager.
  const claimsOpen = db.overtimeClaims.filter((c) => c.personId === me.id && c.status === "Waiting").length;
  // Compliance on the phone (18 Nov): a ticket that stops work, and the van they drive.
  const blocks = ticketBlocks(me, day);
  const van = db.vehicles.find((v) => v.active && v.driverId === me.id);
  const vanGone = van ? vehicleBlocks(van, day) : [];
  const vanDue = van ? (["tax", "test", "insurance"] as const).filter((k) => stateOf(van.compliance[k].expiryDate, day) === "due") : [];
  const region = REGION[usePrefs.getState().brand.region];
  const vanLabel = (k: "tax" | "test" | "insurance") => (k === "tax" ? region.roadTax : k === "test" ? region.vehicleTest : "Insurance");
  const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <div className="min-h-full w-full bg-canvas" lang={lang}>
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
        {fleetOn && (
        <button type="button" className={BIG} onClick={() => setSheet("driving")}>
          <Truck size={24} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">
            {m.driving}
            <CheckLine me={me} day={day} />
          </span>
        </button>
        )}
        {/* From the Secure-All build's Ops phone (18 Nov): damage to a vehicle, and a new licence. Fleet's, so only with Fleet (19 Nov). */}
        {fleetOn && (
        <>
        <button type="button" className={BIG} onClick={() => setSheet("damage")}>
          <CarProfile size={24} className="text-accent-ink" /> {m.damage}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("licence")}>
          <IdentificationCard size={24} className="text-accent-ink" /> {m.licence}
        </button>
        </>
        )}
        <button type="button" className={BIG} onClick={() => setSheet("week")}>
          <CalendarBlank size={24} className="text-accent-ink" /> {t.week}
        </button>
        {/* Last week's hours to check, and a way to claim overtime (Oisin, round ten). */}
        <button type="button" className={BIG} onClick={() => setSheet("hours")}>
          <Clock size={24} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">{m.hours}</span>
          {claimsOpen > 0 && <Badge tone="accent">{claimsOpen}</Badge>}
        </button>
      </div>
      {site && sheet === "photo" && <PhotoSheet site={site} me={me} lang={lang} onClose={close} />}
      {site && sheet === "extra" && <ExtraSheet site={site} me={me} lang={lang} onClose={close} />}
      {site && sheet === "ask" && <AskSheet site={site} me={me} lang={lang} day={day} toManager onClose={close} />}
      {site && manager && sheet === "manager" && <ManagerCard manager={manager} site={site} lang={lang} onClose={close} />}
      {sheet === "week" && <WeekSheet me={me} lang={lang} day={day} onClose={close} />}
      {sheet === "hours" && <HoursSheet me={me} day={day} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "damage" && <DamageSheet me={me} onClose={close} />}
      {sheet === "licence" && <LicenceSheet me={me} day={day} onClose={close} />}
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
  // Monday to Friday, then the Saturday or Sunday only when they worked it or are down for it (17 Nov).
  const weekend = fullWeek(week[0]!).slice(5).filter((d) => personDay(db.attendance, db.plan, me.id, d, day, live).rows.length > 0);
  const states = [...personWeek(db.plan, db.holidays, live, me.id, week), ...weekend.map((date) => ({ date, leave: false }))];
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
                              {gone && e.restday ? <span className="font-normal text-muted">, {overtimeText(e)}</span> : overtimeTotal(e) > 0 ? <span className="font-normal text-muted">, {gone ? overtimeNote(e) : `+${e.overtimeHours}h`}</span> : null}
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

/**
 * The main offering's phone (Oisin, 19 Nov): "one app with the same features for all employees".
 * Report a repair, Claim a reimbursement, Make a request, My week and My hours with overtime
 * claims, and My profile (holidays, certificates, company holidays). Everything it sends goes to
 * Admin for a manager. The office can look at anyone's.
 */
function OnePhoneView() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const access = useAccess();
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const everyone = db.people.filter((p) => p.active && (p.kind === "Operative" || p.kind === "Management")).sort((a, b) => a.name.localeCompare(b.name));
  const own = role === "operative" ? operativeId : role !== "md" && role !== "contracts" && role !== "accounts" ? access.personId : null;
  const [pick, setPick] = useState(operativeId);
  const me = everyone.find((p) => p.id === (own ?? pick)) ?? everyone[0];
  const [english, setEnglish] = useState(true);
  const office = !own;
  if (!me) return null;
  const lang: Language = english ? "en" : me.language;
  return (
    <>
      <PageHead title="Site phone view" note={office ? "The one app every employee has: the same buttons for everyone. Pick anyone to see their phone." : "What you see on your own phone."} />
      <PageBody className={cx("grid items-start gap-6", office && "min-[90rem]:grid-cols-[auto_minmax(0,1fr)]")}>
        <div className="grid w-full justify-items-center gap-2 sm:w-auto">
          <div className="flex min-h-11 flex-wrap items-center justify-center gap-2">
            {office && (
              <label className="flex items-center gap-2 text-[0.93rem]">
                <span className="text-muted">Employee</span>
                <select aria-label="Employee to view the phone as" className="field w-auto max-w-[16rem]" value={me.id} onChange={(e) => { setPick(e.target.value); if (everyone.find((p) => p.id === e.target.value)?.kind === "Operative") setOperative(e.target.value); setEnglish(true); }}>
                  {everyone.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.trade}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {me.language !== "en" && <Segmented label="Language shown" value={english ? "en" : "own"} onChange={(v) => setEnglish(v === "en")} options={[{ value: "en", label: "English" }, { value: "own", label: LANGUAGE_NAME[me.language] }]} />}
          </div>
          <PhoneFrame label="Employee's phone">
            <OnePhone key={me.id} me={me} lang={lang} day={day} />
          </PhoneFrame>
        </div>
        {office && <OfficeFeed day={day} />}
      </PageBody>
    </>
  );
}

type OneSheet = "repair" | "expense" | "ask" | "week" | "hours" | "driving" | "profile" | null;

function OnePhone({ me, lang, day }: { me: Person; lang: Language; day: string }) {
  const db = useData((s) => s.db);
  const fleetOn = useAccess().apps.on("fleet");
  const t = WORDS[lang];
  const m = MORE[lang];
  const [sheet, setSheet] = useState<OneSheet>(null);
  const close = () => setSheet(null);
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const mine = db.assignments.filter((a) => a.personId === me.id && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)!);
  const site = db.projects.find((p) => p.id === siteOn(me.id, day, db.attendance, db.plan, live)) ?? mine[0] ?? null;
  const claimsOpen = db.overtimeClaims.filter((c) => c.personId === me.id && c.status === "Waiting").length;
  const repairsOpen = db.repairs.filter((r) => r.personId === me.id && r.status !== "Fixed").length;
  const blocks = ticketBlocks(me, day);
  const short = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString(lang === "en" ? "en-IE" : lang, { day: "numeric", month: "short", timeZone: "UTC" });
  const brand = usePrefs((s) => s.brand);
  return (
    <div className="min-h-full w-full bg-canvas" lang={lang}>
      <div className="bg-accent-strong px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <ProfileButton name={me.name} label={m.profile} onClick={() => setSheet("profile")} />
          <p className="text-[0.93rem] opacity-90">{longDate(day, lang === "en" ? "en-IE" : lang)}</p>
        </div>
        <p className="font-display text-[1.35rem] leading-tight font-semibold">{me.name}</p>
        <p className="text-[0.93rem] opacity-90">
          {me.trade}, {brand.brandName}
        </p>
      </div>
      <div className="grid gap-3 px-4 py-4">
        {blocks.length > 0 && (
          <div className="rounded-lg bg-bad-soft px-3 py-3 text-bad" role="status">
            <p className="font-medium">{blocks.map((b) => (b.expires ? `${b.ticket} ${t.ranOut} ${short(b.expires)}` : b.ticket)).join(", ")}</p>
            <p className="mt-0.5">{t.cannotWork}</p>
          </div>
        )}
        <button type="button" className={BIG} onClick={() => setSheet("repair")}>
          <Wrench size={24} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">{m.repair}</span>
          {repairsOpen > 0 && <Badge tone="accent">{repairsOpen}</Badge>}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("expense")}>
          <Receipt size={24} className="text-accent-ink" /> {m.expense}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("ask")}>
          <HandPalm size={24} className="text-accent-ink" /> {t.ask}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("week")}>
          <CalendarBlank size={24} className="text-accent-ink" /> {t.week}
        </button>
        <button type="button" className={BIG} onClick={() => setSheet("hours")}>
          <Clock size={24} className="shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">{m.hours}</span>
          {claimsOpen > 0 && <Badge tone="accent">{claimsOpen}</Badge>}
        </button>
        {/* The driving check belongs to the Fleet offering (19 Nov). */}
        {fleetOn && (
          <button type="button" className={BIG} onClick={() => setSheet("driving")}>
            <Truck size={24} className="shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1">
              {m.driving}
              <CheckLine me={me} day={day} />
            </span>
          </button>
        )}
        <button type="button" className={BIG} onClick={() => setSheet("profile")}>
          <IdentificationCard size={24} className="text-accent-ink" /> {m.profile}
        </button>
      </div>
      {sheet === "repair" && <RepairSheet me={me} onClose={close} />}
      {sheet === "expense" && <ExpenseSheet me={me} day={day} siteId={site?.id ?? null} sites={mine} onClose={close} />}
      {sheet === "ask" && <AskSheet site={site} me={me} lang={lang} day={day} onClose={close} />}
      {sheet === "week" && <WeekSheet me={me} lang={lang} day={day} onClose={close} />}
      {sheet === "hours" && <HoursSheet me={me} day={day} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "profile" && <ProfileSheet me={me} lang={lang} day={day} simple onClose={close} />}
    </div>
  );
}
