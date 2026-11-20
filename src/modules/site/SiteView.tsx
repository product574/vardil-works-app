import { Phone } from "@phosphor-icons/react";
import { useState } from "react";
import { useData } from "@/data/store";
import { type Language, type Person, type Project } from "@/data/types";
import { personWeek } from "@/lib/availability";
import { dayInstruction, personDay } from "@/lib/roster";
import { overtimeText, overtimeTotal } from "@/lib/overtime";
import { fullWeek, nextWorkWeek, overtimeNote, workWeek } from "@/lib/week";
import { Dialog, Segmented } from "@/ui";
import { PhoneAppView } from "./PhoneApp";
import { ManagerCard } from "./sheets";
import { MORE, WORDS } from "./words";



/**
 * The site phone (Oisin, 20 Nov): the phone app for the people on site, one app whose home screen
 * follows the role, with or without the Projects app (PhoneApp.tsx). The two phones of 17 Nov
 * went into it: an operative's tiles, and a site manager's sites, each opening the whole job.
 */
export function SiteView() {
  return <PhoneAppView />;
}

/**
 * My week: where the operative is each day, and beside each site its site manager. Tapping the
 * manager's name opens his details with a Call now button (Oisin, 17 Nov).
 */
export function WeekSheet({ me, lang, day, onClose }: { me: Person; lang: Language; day: string; onClose: () => void }) {
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
