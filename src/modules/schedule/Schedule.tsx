import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { planPerson, type PlanMark, removeFromRoster, sendWeekAhead, setPlanDay } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay } from "@/data/store";
import { type Db, LANGUAGE_NAME, type Person, type Project } from "@/data/types";
import { availabilityLine, type DayState, daysLabel, freeDays, openDays, partLoad, personWeek, planClashes, planShort } from "@/lib/availability";
import { addDays, MONTHS } from "@/lib/dates";
import { dShort, dWeekday, plural } from "@/lib/format";
import { attendanceShort, nextWorkWeek, shiftMonth, workdaysOfMonth, workWeek } from "@/lib/week";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, Mail, NumInput, PageBody, PageHead, Panel, Section, Segmented, Tel, type Tone } from "@/ui";
import { toast } from "@/ui/toast";

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const wd = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });
const onLeave = (db: Db, personId: string, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);

type PersonContext = { person: Person; siteId?: string };
/** A day being planned: who, when, and the site if it was opened from a site's own grid. */
type DayContext = { person: Person; date: string; siteId?: string; lockSite: boolean };

/** Next week's plan, one block per site, with everyone still free listed alongside. */
export function WeekAhead() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const canEdit = access.may("planWeek");
  const [week, setWeek] = useState(() => nextWorkWeek(day));
  const [openPerson, setOpenPerson] = useState<PersonContext | null>(null);
  const [openDay, setOpenDay] = useState<DayContext | null>(null);
  const running = (p: Project) => (p.status === "Live" || p.status === "Not started") && p.startDate <= week[4]! && p.endDate >= week[0]!;
  const sites = access.scope(db.projects).filter(running);
  const liveIds = useMemo(() => new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id)), [db.projects]);
  const clashes = useMemo(() => planClashes(db.plan.filter((p) => liveIds.has(p.projectId) && week.includes(p.date))), [db.plan, week, liveIds]);
  // One line per person and pair of sites, however many days it runs to.
  const clashLines = useMemo(() => {
    const groups = new Map<string, { key: string; personId: string; siteIds: string[]; dates: string[] }>();
    for (const [k, siteIds] of clashes) {
      const [personId = "", date = ""] = k.split("|");
      const key = `${personId}|${[...siteIds].sort().join("+")}`;
      const g = groups.get(key) ?? { key, personId, siteIds, dates: [] };
      g.dates.push(date);
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({ ...g, dates: g.dates.sort() }));
  }, [clashes]);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  const inWeek = db.plan.filter((p) => week.includes(p.date) && sites.some((s) => s.id === p.projectId));
  const plannedPeople = new Set(inWeek.map((p) => p.personId)).size;
  const empty = sites.filter((s) => !inWeek.some((p) => p.projectId === s.id));
  const isNext = week[0] === nextWorkWeek(day)[0];
  // Days that can still be planned: nothing today or earlier.
  const ahead = week.filter((d) => d > day);
  const weekOf = (personId: string) => personWeek(db.plan, db.holidays, liveIds, personId, ahead);
  const live = openPerson && db.people.find((p) => p.id === openPerson.person.id);

  return (
    <>
      <PageHead
        title="Week ahead"
        note={`Week of ${dShort(week[0])}: ${plural(plannedPeople, "person", "people")} planned across ${plural(sites.length - empty.length, "site")}.${empty.length > 0 ? ` Nobody is planned yet on ${empty.map((s) => `${s.code} ${s.name}`).join(", ")}.` : ""}${canEdit ? "" : " You can see the plan; changing it needs the \"Plan the week ahead\" permission."}`}
        actions={
          canEdit && (
            <Button
              variant="primary"
              disabled={clashes.size > 0 || week[4]! <= day}
              onClick={() => {
                const n = sendWeekAhead(week);
                toast(`Week of ${dShort(week[0])} sent to ${plural(n, "person", "people")}, each in their own language`);
              }}
            >
              Send week to operatives
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setWeek(workWeek(addDays(week[0]!, -7)))}>
            Earlier week
          </Button>
          <Button size="sm" onClick={() => setWeek(workWeek(addDays(week[0]!, 7)))}>
            Later week
          </Button>
          {!isNext && (
            <Button size="sm" variant="ghost" onClick={() => setWeek(nextWorkWeek(day))}>
              Back to next week
            </Button>
          )}
        </div>
      </PageHead>
      <PageBody className="grid max-w-[88rem] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 gap-5">
          {clashes.size > 0 && (
            <div className="rounded-md bg-bad-soft px-3 py-2.5 text-bad">
              <p className="font-medium">{plural(clashes.size, "double booking")} to sort out before the week can be sent</p>
              <ul className="mt-1">
                {clashLines.map((c) => (
                  <li key={c.key}>
                    {name(c.personId)} is on {c.siteIds.map(code).join(" and ")} {c.dates.length === 1 ? `on ${dWeekday(c.dates[0]!)}` : `${daysLabel(c.dates, week)} (${c.dates.length} days)`}. Take one of them off.
                  </li>
                ))}
              </ul>
            </div>
          )}
          {sites.length === 0 && (
            <Panel>
              <Empty title="No sites are running in this week">Move to another week, or check the project start and finish dates.</Empty>
            </Panel>
          )}
          {sites.map((site) => (
            <SiteWeek key={site.id} site={site} week={week} db={db} day={day} canEdit={canEdit} clashes={clashes} weekOf={weekOf} ahead={ahead} onPerson={(person) => setOpenPerson({ person, siteId: site.id })} onDay={(person, date) => setOpenDay({ person, date, siteId: site.id, lockSite: true })} />
          ))}
        </div>
        {ahead.length > 0 && <NotPlaced db={db} week={week} ahead={ahead} weekOf={weekOf} onPerson={(person) => setOpenPerson({ person })} />}
      </PageBody>
      {openPerson && live && <PersonBox key={live.id + (openPerson.siteId ?? "")} person={live} siteId={openPerson.siteId} db={db} week={week} day={day} liveIds={liveIds} canEdit={canEdit} onDay={(date) => setOpenDay({ person: live, date, siteId: openPerson.siteId, lockSite: false })} onClose={() => setOpenPerson(null)} />}
      {openDay && <PlanDayDialog key={`${openDay.person.id}|${openDay.date}|${openDay.siteId ?? ""}`} {...openDay} db={db} liveIds={liveIds} sites={db.projects.filter((p) => (p.status === "Live" || p.status === "Not started") && p.startDate <= openDay.date && p.endDate >= openDay.date)} onClose={() => setOpenDay(null)} />}
    </>
  );
}

type WeekOf = (personId: string) => DayState[];

/** Everyone who still has a free day in the week, grouped by trade, so whoever is doing the roster can see who is left. */
function NotPlaced({ db, week, ahead, weekOf, onPerson }: { db: Db; week: string[]; ahead: string[]; weekOf: WeekOf; onPerson: (p: Person) => void }) {
  const [trade, setTrade] = useState("");
  const rows = db.people
    .filter((p) => p.active && p.kind === "Operative")
    .map((p) => ({ p, free: openDays(weekOf(p.id)) }))
    .filter((r) => r.free.length > 0)
    .sort((a, b) => a.p.trade.localeCompare(b.p.trade) || b.free.length - a.free.length || a.p.name.localeCompare(b.p.name));
  const trades = [...new Set(rows.map((r) => r.p.trade))];
  const shown = rows.filter((r) => !trade || r.p.trade === trade);
  const allWeek = rows.filter((r) => r.free.length === ahead.length).length;
  return (
    <aside aria-label="Not placed this week" className="order-first rounded-md border border-line bg-surface xl:sticky xl:top-4 xl:order-none">
      <div className="border-b border-line px-3 py-2.5">
        <h2 className="text-base">
          Not placed <span className="font-normal text-muted">{rows.length}</span>
        </h2>
        <p className="mt-0.5 text-[0.87rem] text-muted">
          Operatives with a free day or half day in the week of {dShort(week[0])}. {allWeek} free all week. Click a name to place them.
        </p>
        {trades.length > 1 && (
          <select aria-label="Show one trade" className="field mt-2 h-8" value={trades.includes(trade) ? trade : ""} onChange={(e) => setTrade(e.target.value)}>
            <option value="">All trades</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t} ({rows.filter((r) => r.p.trade === t).length})
              </option>
            ))}
          </select>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 text-muted">Everyone has a site or approved leave for every day.</p>
      ) : (
        <ul className="max-h-56 divide-y divide-line overflow-y-auto xl:max-h-[calc(100dvh-21rem)]">
          {shown.map(({ p, free }) => (
            <li key={p.id}>
              <button type="button" className="press flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-accent-soft" onClick={() => onPerson(p)}>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-[0.87rem] text-muted">{p.trade}</span>
                </span>
                <span className={cx("shrink-0 text-[0.87rem]", free.length === ahead.length ? "font-medium text-accent-ink" : "text-muted")}>{free.length === ahead.length ? "All week" : daysLabel(free, ahead)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/** A person's contact details and their week. Each day ahead is a button that opens the day planner. */
function PersonBox({ person, siteId, db, week, day, liveIds, canEdit, onDay, onClose }: { person: Person; siteId?: string; db: Db; week: string[]; day: string; liveIds: Set<string>; canEdit: boolean; onDay: (date: string) => void; onClose: () => void }) {
  const site = db.projects.find((p) => p.id === siteId);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const states = personWeek(db.plan, db.holidays, liveIds, person.id, week);
  const entries = (date: string) => db.plan.filter((p) => p.personId === person.id && p.date === date && liveIds.has(p.projectId));
  return (
    <Dialog
      open
      onClose={onClose}
      title={person.name}
      footer={
        canEdit &&
        site && (
          <Button
            variant="danger"
            onClick={() => {
              removeFromRoster(site.id, person.id);
              toast(`${person.name} taken off ${site.code}. Attendance already recorded is kept`);
              onClose();
            }}
          >
            Take off {site.code}
          </Button>
        )
      }
    >
      <div className="grid gap-4">
        <dl>
          <Fact label="Trade">
            {person.trade}
            {person.category ? `, category ${person.category}` : ""}
          </Fact>
          <Fact label="Phone">
            <Tel number={person.phone} className="font-medium" />
          </Fact>
          <Fact label="Email">
            <Mail address={person.email} />
          </Fact>
          <Fact label="Language">{LANGUAGE_NAME[person.language]}</Fact>
        </dl>
        <div>
          <h3 className="mb-1 text-base">Week of {dShort(week[0])}</h3>
          <ul className="grid grid-cols-5 gap-1.5 text-center text-[0.87rem]">
            {states.map((d) => {
              const tone = d.load > 1 ? "border-transparent bg-bad-soft text-bad" : d.leave ? "border-transparent bg-warn-soft text-warn" : d.load > 0 ? "border-transparent bg-accent-soft text-accent-ink" : "border-dashed border-line-strong text-muted";
              const text = d.leave ? "Leave" : d.sites.length > 0 ? entries(d.date).map((e) => `${code(e.projectId)}${e.part === "half" ? " half" : e.overtimeHours ? ` +${e.overtimeHours}h` : ""}`).join(" + ") : d.date <= day ? "-" : "Free";
              const inner = (
                <>
                  <span className="block text-muted">{wd(d.date)}</span>
                  <span className="block font-medium">{text}</span>
                  {d.load === 0.5 && <span className="block text-muted">half free</span>}
                </>
              );
              const pickable = canEdit && d.date > day && !d.leave;
              return (
                <li key={d.date}>
                  {pickable ? (
                    <button type="button" aria-label={`${dWeekday(d.date)}: ${text}. Plan this day`} className={cx("press w-full rounded-md border px-1 py-1.5 hover:border-accent", tone)} onClick={() => onDay(d.date)}>
                      {inner}
                    </button>
                  ) : (
                    <div className={cx("rounded-md border px-1 py-1.5", tone)}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {canEdit && <p className="mt-2 text-[0.93rem] text-muted">Click a day to put {person.name.split(" ")[0]} on a site for a full day, a half day or with overtime, or to change or clear what is there.</p>}
        </div>
      </div>
    </Dialog>
  );
}

const CHOICES = [
  { value: "full", label: "Full day" },
  { value: "half", label: "Half day" },
  { value: "overtime", label: "Full day + overtime" },
] as const;
type Choice = (typeof CHOICES)[number]["value"];

/** Plan one person for one day: which site, and whether it is a full day, a half day or a full day with overtime. */
function PlanDayDialog({ person, date, siteId, lockSite, db, liveIds, sites, onClose }: DayContext & { db: Db; liveIds: Set<string>; sites: Project[]; onClose: () => void }) {
  const all = db.plan.filter((p) => p.personId === person.id && p.date === date && liveIds.has(p.projectId));
  const entryOn = (id: string) => all.find((p) => p.projectId === id);
  const choiceOf = (id: string): Choice => {
    const e = entryOn(id);
    return e?.part === "half" ? "half" : e?.overtimeHours ? "overtime" : "full";
  };
  // Opened from a person's week: start on the site they are already on that day, if there is exactly one.
  const start = siteId && sites.some((s) => s.id === siteId) && (lockSite || entryOn(siteId)) ? siteId : all.length === 1 ? all[0]!.projectId : "";
  const [target, setTarget] = useState(start);
  const [choice, setChoice] = useState<Choice>(start ? choiceOf(start) : "full");
  const [hours, setHours] = useState(entryOn(start)?.overtimeHours || 2);
  const site = sites.find((s) => s.id === target);
  const existing = target ? entryOn(target) : undefined;
  const others = all.filter((p) => p.projectId !== target);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const load = others.reduce((n, p) => n + partLoad(p), 0) + (choice === "half" ? 0.5 : 1);
  const first = person.name.split(" ")[0];
  const mark: PlanMark = { part: choice === "half" ? "half" : "full", overtimeHours: choice === "overtime" ? Math.max(0.5, hours) : 0 };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${person.name}, ${dWeekday(date)}`}
      footer={
        <>
          {existing && site && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={() => {
                setPlanDay(site.id, person.id, date, null);
                toast(`${person.name} taken off ${site.code} on ${dWeekday(date)}`);
                onClose();
              }}
            >
              Take off this day
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!site}
            onClick={() => {
              if (!site) return;
              setPlanDay(site.id, person.id, date, mark);
              toast(`${person.name}: ${planShort({ part: mark.part === "half" ? "half" : undefined, overtimeHours: mark.overtimeHours }).toLowerCase()} at ${site.code}, ${dWeekday(date)}`);
              onClose();
            }}
          >
            {existing ? "Save change" : site ? `Put on ${site.code}` : "Put on site"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {lockSite && site ? (
          <p>
            <span className="text-muted">Site</span> <span className="font-medium">{site.code} {site.name}</span>
          </p>
        ) : (
          <Field label="Site">
            {(id) => (
              <select
                id={id}
                className="field"
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  setChoice(e.target.value ? choiceOf(e.target.value) : "full");
                }}
              >
                <option value="">Choose a site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} {s.name}
                    {entryOn(s.id) ? " (already on)" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">How long</p>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="How long" value={choice} onChange={setChoice} options={[...CHOICES]} />
            {choice === "overtime" && (
              <label className="flex items-center gap-1.5 text-[0.93rem]">
                <NumInput label="Overtime hours" className="h-9 w-16" value={hours} onChange={setHours} /> hours over
              </label>
            )}
          </div>
        </div>
        {others.length > 0 && (
          <p className={cx("rounded-md px-2.5 py-2 text-[0.93rem]", load > 1 ? "bg-bad-soft text-bad" : "bg-accent-soft text-accent-ink")}>
            {first} is already down for {others.map((p) => `${p.part === "half" ? "a half day" : "a full day"} on ${code(p.projectId)}`).join(" and ")} that day. {load > 1 ? "Saving this double books the day, and the week cannot be sent until it is sorted." : "With a half day here that makes one full day split across two sites."}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function SiteWeek({ site, week, db, day, canEdit, clashes, weekOf, ahead, onPerson, onDay }: { site: Project; week: string[]; db: Db; day: string; canEdit: boolean; clashes: Map<string, string[]>; weekOf: WeekOf; ahead: string[]; onPerson: (p: Person) => void; onDay: (p: Person, date: string) => void }) {
  const ids = new Set([...db.assignments.filter((a) => a.projectId === site.id).map((a) => a.personId), ...db.plan.filter((p) => p.projectId === site.id && week.includes(p.date)).map((p) => p.personId)]);
  const people = [...ids].map((id) => db.people.find((p) => p.id === id)).filter((p): p is Person => !!p && p.active).sort((a, b) => a.name.localeCompare(b.name));
  const planned = (personId: string, date: string) => db.plan.find((p) => p.projectId === site.id && p.personId === personId && p.date === date);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";

  return (
    <Section
      title={
        <Link to={`/projects/${site.code}`} className="underline-offset-2 hover:underline">
          {site.code} {site.name}
        </Link>
      }
      aside={`${db.people.find((p) => p.id === site.siteManagerId)?.name}, ${co(site.county)}${site.status === "Not started" ? `. Starts ${dShort(site.startDate)}` : ""}`}
    >
      <Panel className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th className="min-w-[12rem]">Name</th>
              {week.map((d) => (
                <th key={d} className="w-[8.25rem]">
                  {wd(d)} {dShort(d)}
                  <span className="ml-1.5 font-normal">{d > day ? db.plan.filter((p) => p.projectId === site.id && p.date === d).length : ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted">
                  Nobody is planned here this week.
                </td>
              </tr>
            )}
            {people.map((person) => (
              <tr key={person.id}>
                <td>
                  <button type="button" className="press -mx-1 rounded px-1 text-left hover:bg-accent-soft" title="Contact details and options" aria-label={`${person.name}: contact details and options`} onClick={() => onPerson(person)}>
                    <span className="font-medium text-accent-ink underline decoration-line-strong underline-offset-2">{person.name}</span>
                    <span className="block text-[0.87rem] text-muted">{person.trade}</span>
                  </button>
                </td>
                {week.map((d) => {
                  const off = d < site.startDate || d > site.endDate;
                  const leave = onLeave(db, person.id, d);
                  const entry = planned(person.id, d);
                  const on = !!entry;
                  const clash = on ? clashes.get(`${person.id}|${d}`) : undefined;
                  if (d <= day) {
                    const a = db.attendance.find((x) => x.projectId === site.id && x.personId === person.id && x.date === d);
                    return (
                      <td key={d} className="align-middle! text-muted">
                        {a ? attendanceShort(a.status, a.overtimeHours) : leave ? "Leave" : "-"}
                      </td>
                    );
                  }
                  if (leave) return <td key={d} className="align-middle!"><span className="inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[0.93rem] text-warn">Leave</span></td>;
                  if (off) return <td key={d} className="align-middle! text-faint">{d > site.endDate ? "Finished" : "Not started"}</td>;
                  const others = clash?.filter((s) => s !== site.id).map(code).join(", ");
                  const text = entry ? planShort(entry) : "";
                  return (
                    <td key={d} className="align-middle!">
                      <button
                        type="button"
                        disabled={!canEdit}
                        aria-pressed={on}
                        aria-label={`${person.name}, ${dWeekday(d)}: ${on ? (clash ? `${text.toLowerCase()}, clashes with ${others}` : text.toLowerCase()) : "not planned"}`}
                        title={clash ? `${text}. Also planned on ${others}: more than one day's work` : canEdit ? (on ? "Change or clear this day" : "Put on site this day") : undefined}
                        onClick={() => onDay(person, d)}
                        className={cx("press block h-8 w-full truncate rounded-md px-2 text-left text-[0.93rem] whitespace-nowrap disabled:cursor-default", clash ? "bg-bad-soft font-medium text-bad" : on ? "bg-accent-soft font-medium text-accent-ink" : "border border-dashed border-line-strong text-muted", canEdit && !on && "hover:border-accent hover:text-accent-ink")}
                      >
                        {clash ? `Clash: ${others}` : on ? text : canEdit ? "Add" : "-"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      {canEdit && <AddToSite site={site} db={db} onSite={ids} days={ahead.filter((d) => d >= site.startDate && d <= site.endDate)} weekOf={weekOf} />}
    </Section>
  );
}

/** Add someone to a site: choose the trade first, then a person, with where each one already is this week. */
function AddToSite({ site, db, onSite, days, weekOf }: { site: Project; db: Db; onSite: Set<string>; days: string[]; weekOf: WeekOf }) {
  const [trade, setTrade] = useState("");
  const [personId, setPersonId] = useState("");
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const pool = db.people
    .filter((p) => p.active && p.kind === "Operative" && !onSite.has(p.id))
    .map((p) => {
      const w = weekOf(p.id).filter((d) => days.includes(d.date));
      return { p, w, free: freeDays(w) };
    });
  const trades = [...new Set(pool.map((x) => x.p.trade))].sort();
  const options = pool.filter((x) => x.p.trade === trade).sort((a, b) => b.free.length - a.free.length || a.p.name.localeCompare(b.p.name));
  const pick = options.find((x) => x.p.id === personId);
  const first = pick?.p.name.split(" ")[0];
  if (days.length === 0) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Trade to add to ${site.code}`}
          className="field h-8 w-auto max-w-full"
          value={trade}
          onChange={(e) => {
            setTrade(e.target.value);
            setPersonId("");
          }}
        >
          <option value="">Add to {site.code}: choose a trade</option>
          {trades.map((t) => {
            const of = pool.filter((x) => x.p.trade === t);
            return (
              <option key={t} value={t}>
                {t} ({of.filter((x) => x.free.length > 0).length} free of {of.length})
              </option>
            );
          })}
        </select>
        <select aria-label={`Person to add to ${site.code}`} className="field h-8 w-auto max-w-full" disabled={!trade} value={pick ? personId : ""} onChange={(e) => setPersonId(e.target.value)}>
          <option value="">{trade ? "Choose a person" : "Then a person"}</option>
          {options.map(({ p, w }) => (
            <option key={p.id} value={p.id}>
              {p.name}: {lowerFirst(availabilityLine(w, code))}
            </option>
          ))}
        </select>
        {pick && pick.free.length > 0 && (
          <Button
            size="sm"
            onClick={() => {
              planPerson(site.id, pick.p.id, pick.free);
              toast(`${pick.p.name} planned on ${site.code}, ${daysLabel(pick.free, days)}`);
              setPersonId("");
            }}
          >
            {pick.free.length === days.length ? "Plan for the week" : "Plan free days"}
          </Button>
        )}
        {pick && pick.free.length === 0 && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              planPerson(site.id, pick.p.id, days);
              toast(`${pick.p.name} planned on ${site.code}. This double books: sort it out before sending`);
              setPersonId("");
            }}
          >
            Plan anyway
          </Button>
        )}
      </div>
      {pick && pick.free.length < days.length && (
        <p className="text-[0.93rem] text-warn">
          {availabilityLine(pick.w, code)}. {pick.free.length > 0 ? `Only ${first}'s free days will be planned here.` : `${first} has no free day this week, so planning here double books. Leave days are never planned.`}
        </p>
      )}
    </div>
  );
}

/** Headcount per site for every working day of a month. Past days show who actually attended. */
export function MonthAhead() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [ym, setYm] = useState(day.slice(0, 7));
  const days = workdaysOfMonth(ym);
  const inMonth = new Set(days);
  // A job that finished during the month still has its days worked to show.
  const worked = new Set(db.attendance.filter((a) => inMonth.has(a.date)).map((a) => a.projectId));
  const sites = access
    .scope(db.projects)
    .filter((p) => ((p.status === "Live" || p.status === "Not started") && p.startDate <= days[days.length - 1]! && p.endDate >= days[0]!) || worked.has(p.id))
    .sort((a, b) => a.code.localeCompare(b.code));
  const operatives = db.people.filter((p) => p.active && p.kind === "Operative");
  // Days gone count who attended and days to come who is planned. Today counts who is marked, or
  // who is planned on a site that has not been marked yet.
  const markedToday = new Set(db.attendance.filter((a) => a.date === day).map((a) => a.projectId));
  const fromPlan = (d: string, siteId: string) => d > day || (d === day && !markedToday.has(siteId));
  const count = (siteId: string, d: string) => (fromPlan(d, siteId) ? db.plan : db.attendance).filter((x) => x.projectId === siteId && x.date === d).length;
  const leave = (d: string) => operatives.filter((p) => onLeave(db, p.id, d)).length;
  const busy = (d: string) => new Set([...db.attendance.filter((a) => a.date === d && !fromPlan(d, a.projectId)), ...db.plan.filter((p) => p.date === d && fromPlan(d, p.projectId))].map((x) => x.personId)).size;
  const max = Math.max(1, ...sites.flatMap((s) => days.map((d) => count(s.id, d))));
  const [y, m] = ym.split("-").map(Number) as [number, number];

  return (
    <>
      <PageHead title="Month ahead" note={`${MONTHS[m - 1]} ${y}. Each number is the people on that site that day: who attended for days gone, who is planned for days to come. Today shows who is marked, or who is planned where nothing is marked yet.`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setYm(shiftMonth(ym, -1))}>
            Earlier month
          </Button>
          <Button size="sm" onClick={() => setYm(shiftMonth(ym, 1))}>
            Later month
          </Button>
          {ym !== day.slice(0, 7) && (
            <Button size="sm" variant="ghost" onClick={() => setYm(day.slice(0, 7))}>
              Back to this month
            </Button>
          )}
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {sites.length === 0 ? (
            <Empty title="No sites are running in this month" />
          ) : (
            <table className="tbl text-[0.93rem]">
              <thead>
                <tr>
                  <th className="min-w-[13rem]">Site</th>
                  {days.map((d) => (
                    <th key={d} className={cx("px-1! text-center", d === day && "bg-accent-soft! text-accent-ink!", new Date(d + "T12:00:00Z").getUTCDay() === 1 && "border-l border-line")}>
                      <span className="block font-normal">{wd(d).slice(0, 2)}</span>
                      {Number(d.slice(8))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link to={`/projects/${s.code}`} className="font-medium underline-offset-2 hover:underline">
                        {s.code}
                      </Link>{" "}
                      {s.name}
                    </td>
                    {days.map((d) => {
                      const n = count(s.id, d);
                      const off = d < s.startDate || d > s.endDate;
                      return (
                        <td key={d} className={cx("px-1! text-center", new Date(d + "T12:00:00Z").getUTCDay() === 1 && "border-l border-line", d <= day && "text-muted")} style={n > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(8 + (n / max) * 26)}%, transparent)` } : undefined}>
                          {off ? "" : n || <span className="text-faint">0</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {(
                  [
                    ["On a site", (d: string) => busy(d)],
                    ["On leave", (d: string) => leave(d)],
                    ["Free", (d: string) => (d <= day ? null : Math.max(0, operatives.length - busy(d) - leave(d)))],
                  ] as [string, (d: string) => number | null][]
                ).map(([label, fn], i) => (
                  <tr key={label}>
                    <td className={cx("font-medium", i === 0 && "border-t border-line-strong")}>{label}</td>
                    {days.map((d) => {
                      const n = fn(d);
                      return (
                        <td key={d} className={cx("px-1! text-center", i === 0 && "border-t border-line-strong", new Date(d + "T12:00:00Z").getUTCDay() === 1 && "border-l border-line", label === "Free" && n != null && n > 3 && "font-medium text-warn")}>
                          {n == null ? "" : n || <span className="text-faint">0</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            </table>
          )}
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">"Free" counts operatives with no site and no leave that day. More than three free is shown in amber: people are being paid with nowhere to go.</p>
      </PageBody>
    </>
  );
}

type Where = "On site" | "Planned" | "On leave" | "Not planned";
const WHERE_TONE: Record<Where, Tone> = { "On site": "ok", Planned: "accent", "On leave": "warn", "Not planned": "bad" };

/** Every operative and where they are today. */
export function WhoIsWhere() {
  const db = useData((s) => s.db);
  const day = useDay();
  const [show, setShow] = useState<"All" | Where>("All");
  const rows = db.people
    .filter((p) => p.active && p.kind === "Operative")
    .map((p) => {
      const marked = db.attendance.filter((a) => a.personId === p.id && a.date === day);
      const plannedOn = db.plan.filter((x) => x.personId === p.id && x.date === day);
      const roster = db.assignments.filter((a) => a.personId === p.id);
      const where: Where = marked.length ? "On site" : onLeave(db, p.id, day) ? "On leave" : plannedOn.length || roster.length ? "Planned" : "Not planned";
      const siteIds = marked.length ? marked.map((a) => a.projectId) : plannedOn.length ? plannedOn.map((x) => x.projectId) : roster.map((a) => a.projectId);
      return { p, where, sites: where === "On leave" ? [] : [...new Set(siteIds)].map((id) => db.projects.find((x) => x.id === id)!).filter((x) => x && x.status === "Live") };
    })
    .sort((a, b) => (a.sites[0]?.code ?? "~").localeCompare(b.sites[0]?.code ?? "~") || a.p.name.localeCompare(b.p.name));
  const n = (w: Where) => rows.filter((r) => r.where === w).length;
  const shown = rows.filter((r) => show === "All" || r.where === show);

  return (
    <>
      <PageHead title="Who is where" note={`${dWeekday(day)}: ${n("On site")} marked on site, ${n("Planned")} expected but not marked yet, ${n("On leave")} on leave, ${n("Not planned")} with nowhere to be.`} actions={<Segmented label="Where people are" value={show} onChange={setShow} options={[{ value: "All", label: "All", count: rows.length }, { value: "On site", label: "On site", count: n("On site") }, { value: "Planned", label: "Not marked yet", count: n("Planned") }, { value: "On leave", label: "On leave", count: n("On leave") }, { value: "Not planned", label: "Not planned", count: n("Not planned") }]} />} />
      <PageBody>
        <Panel className="max-w-5xl overflow-x-auto">
          {shown.length === 0 ? (
            <Empty title="Nobody in this group today" />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Trade</th>
                  <th>Site today</th>
                  <th>Status</th>
                  <th>Phone</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ p, where, sites }) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td>{p.trade}</td>
                    <td>
                      {sites.length === 0 ? (
                        <span className="text-muted">-</span>
                      ) : (
                        sites.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && ", "}
                            <Link to={`/projects/${s.code}`} className="underline-offset-2 hover:underline">
                              {s.code} {s.name}
                            </Link>
                          </span>
                        ))
                      )}
                    </td>
                    <td>
                      <Badge tone={WHERE_TONE[where]}>{where === "Planned" ? "Not marked yet" : where}</Badge>
                    </td>
                    <td className="whitespace-nowrap">{p.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
