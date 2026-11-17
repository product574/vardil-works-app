import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { planDays, type PlanMark, removeFromRoster, sendWeekAhead, setPlanDay } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay } from "@/data/store";
import { type Db, LANGUAGE_NAME, type Person, type Project } from "@/data/types";
import { type DayState, daysLabel, openDays, partLoad, personWeek, planClashes, planShort } from "@/lib/availability";
import { dropOutcome, firstOnSite, planSteps, stepsToPlan } from "@/lib/roster";
import { addDays } from "@/lib/dates";
import { dShort, dWeekday, plural } from "@/lib/format";
import { attendanceShort, nextWorkWeek, workWeek } from "@/lib/week";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, Mail, NumInput, PageBody, PageHead, Panel, Section, Segmented, Tel, type Tone } from "@/ui";
import { toast } from "@/ui/toast";

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
  const [dragging, setDragging] = useState<Drag | null>(null);
  const [busy, setBusy] = useState<{ person: Person; site: Project; date: string } | null>(null);
  const [adding, setAdding] = useState<{ siteId: string; date: string } | null>(null);
  // Someone just put on a site for the first time this week: ask whether they are there for the rest of it (Oisin, 17 Nov).
  const [rest, setRest] = useState<{ person: Person; site: Project; date: string; moveFrom?: string } | null>(null);
  const offerRest = (person: Person, site: Project, date: string, moveFrom?: string) => setRest(firstOnSite(db.plan, person.id, site.id, week, date) ? { person, site, date, moveFrom } : null);
  const restSteps =
    rest && week.includes(rest.date)
      ? planSteps(personWeek(db.plan, db.holidays, liveIds, rest.person.id, week.filter((d) => d > rest.date)), rest.site.id, { running: (d) => d >= rest.site.startDate && d <= rest.site.endDate, onBusy: "skip", moveFrom: rest.moveFrom })
      : [];
  const restDays = stepsToPlan(restSteps);

  /** What dropping a name on a site and day does: plan, move, refuse, or ask first if it would double book. */
  const dropOn = (drag: Drag, site: Project, date: string) => {
    setDragging(null);
    const person = db.people.find((p) => p.id === drag.personId);
    if (!person || !canEdit || date <= day || date < site.startDate || date > site.endDate) return;
    const state = personWeek(db.plan, db.holidays, liveIds, person.id, [date])[0]!;
    // Dragged from another site on the same day: a move, not a second booking.
    if (drag.fromSiteId && drag.fromDate === date && drag.fromSiteId !== site.id) {
      const was = db.plan.find((p) => p.projectId === drag.fromSiteId && p.personId === person.id && p.date === date);
      setPlanDay(drag.fromSiteId, person.id, date, null);
      setPlanDay(site.id, person.id, date, { part: was?.part === "half" ? "half" : "full", overtimeHours: was?.overtimeHours ?? 0 });
      toast(`${person.name} moved from ${code(drag.fromSiteId)} to ${site.code}, ${dWeekday(date)}`);
      offerRest(person, site, date, drag.fromSiteId);
      return;
    }
    const outcome = dropOutcome(state, site.id);
    if (outcome === "already") return toast(`${person.name} is already on ${site.code} on ${dWeekday(date)}`);
    if (outcome === "leave") return toast(`${person.name} is on leave on ${dWeekday(date)}`);
    if (outcome === "busy") return setBusy({ person, site, date });
    const half = state.load === 0.5;
    setPlanDay(site.id, person.id, date, { part: half ? "half" : "full", overtimeHours: 0 });
    toast(`${person.name} put on ${site.code}, ${dWeekday(date)}${half ? ", half day" : ""}`);
    offerRest(person, site, date);
  };

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
      <PageBody className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid min-w-0 gap-4">
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
          {rest && restDays.length > 0 && (
            <div role="group" aria-label="Here for the rest of the week?" className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-md border border-accent bg-surface px-3 py-2.5 shadow-pop">
              <p className="min-w-0 flex-1">
                <span className="font-medium">
                  {rest.person.name} is on {rest.site.code} on {dWeekday(rest.date)}.
                </span>{" "}
                Here for the rest of the week?{" "}
                <span className="text-muted">
                  {daysLabel(restDays.map((x) => x.date), week)}
                  {restDays.some((x) => x.action === "move") && rest.moveFrom ? `, moved from ${code(rest.moveFrom)}` : ""}
                  {restSteps.some((x) => x.action === "busy") ? `. ${daysLabel(restSteps.filter((x) => x.action === "busy").map((x) => x.date), week)} stays as planned elsewhere` : ""}
                </span>
              </p>
              <Button onClick={() => setRest(null)}>No</Button>
              <Button
                variant="primary"
                onClick={() => {
                  planDays(rest.site.id, rest.person.id, restDays.map((x) => ({ date: x.date, half: x.action === "half", ...(x.action === "move" ? { moveFrom: rest.moveFrom } : {}) })));
                  toast(`${rest.person.name} is on ${rest.site.code} for the rest of the week: ${daysLabel(restDays.map((x) => x.date), week)}`);
                  setRest(null);
                }}
              >
                Yes
              </Button>
            </div>
          )}
          {sites.length === 0 ? (
            <Panel>
              <Empty title="No sites are running in this week">Move to another week, or check the project start and finish dates.</Empty>
            </Panel>
          ) : (
            <WeekGrid
              sites={sites}
              week={week}
              db={db}
              day={day}
              canEdit={canEdit}
              clashes={clashes}
              liveIds={liveIds}
              dragging={dragging}
              onDragEnd={() => setDragging(null)}
              onDragStart={setDragging}
              onDrop={dropOn}
              onPerson={(person, siteId) => setOpenPerson({ person, siteId })}
              onAdd={(siteId, date) => setAdding({ siteId, date })}
            />
          )}
          {canEdit && ahead.length > 0 && <p className="text-[0.93rem] text-muted">Drag a name from Not placed onto a site and day to put them there, or drag a name already in the grid to another site on the same day to move them. Each day also has an Add button, for phones and keyboards. The first time someone goes on a site in the week you are asked whether they are there for the rest of it. Click a name for their details and their week.</p>}
        </div>
        {ahead.length > 0 && <NotPlaced db={db} week={week} ahead={ahead} weekOf={weekOf} canEdit={canEdit} onDragStart={setDragging} onDragEnd={() => setDragging(null)} onPerson={(person) => setOpenPerson({ person })} />}
      </PageBody>
      {busy && <BusyDialog {...busy} db={db} onMoved={(from) => offerRest(busy.person, busy.site, busy.date, from)} onClose={() => setBusy(null)} />}
      {adding && <AddToDayDialog {...adding} db={db} liveIds={liveIds} onAdded={offerRest} onClose={() => setAdding(null)} />}
      {openPerson && live && <PersonBox key={live.id + (openPerson.siteId ?? "")} person={live} siteId={openPerson.siteId} db={db} week={week} day={day} liveIds={liveIds} canEdit={canEdit} onDay={(date) => setOpenDay({ person: live, date, siteId: openPerson.siteId, lockSite: false })} onClose={() => setOpenPerson(null)} />}
      {openDay && <PlanDayDialog key={`${openDay.person.id}|${openDay.date}|${openDay.siteId ?? ""}`} {...openDay} db={db} liveIds={liveIds} sites={db.projects.filter((p) => (p.status === "Live" || p.status === "Not started") && p.startDate <= openDay.date && p.endDate >= openDay.date)} onClose={() => setOpenDay(null)} />}
    </>
  );
}

type WeekOf = (personId: string) => DayState[];

/** Everyone who still has a free day in the week, grouped by trade, so whoever is doing the roster can see who is left. */
function NotPlaced({ db, week, ahead, weekOf, canEdit, onDragStart, onDragEnd, onPerson }: { db: Db; week: string[]; ahead: string[]; weekOf: WeekOf; canEdit: boolean; onDragStart: (d: Drag) => void; onDragEnd: () => void; onPerson: (p: Person) => void }) {
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
          Operatives with a free day or half day in the week of {dShort(week[0])}. {allWeek} free all week. {canEdit ? "Drag a name onto a site and day, or click it for their week." : "Click a name for their week."}
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
              <button
                type="button"
                draggable={canEdit}
                onDragStart={(ev) => {
                  ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ personId: p.id }));
                  ev.dataTransfer.effectAllowed = "move";
                  requestAnimationFrame(() => onDragStart({ personId: p.id }));
                }}
                onDragEnd={onDragEnd}
                title={canEdit ? "Drag onto a site and day, or click for their week" : undefined}
                className={cx("press flex min-h-11 w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-accent-soft", canEdit && "cursor-grab active:cursor-grabbing")}
                onClick={() => onPerson(p)}
              >
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

/** A name being dragged: who, and where from if it was picked up in the grid. */
type Drag = { personId: string; fromSiteId?: string; fromDate?: string };
const DRAG_TYPE = "application/x-abc-person";

/**
 * The week as one grid (Oisin, 17 Nov): a row per site, a column per day, and in each cell
 * everyone down for that site that day, one line each, so a busy day makes a taller cell.
 */
function WeekGrid({ sites, week, db, day, canEdit, clashes, liveIds, dragging, onDragStart, onDragEnd, onDrop, onPerson, onAdd }: { sites: Project[]; week: string[]; db: Db; day: string; canEdit: boolean; clashes: Map<string, string[]>; liveIds: Set<string>; dragging: Drag | null; onDragStart: (d: Drag) => void; onDragEnd: () => void; onDrop: (d: Drag, site: Project, date: string) => void; onPerson: (p: Person, siteId: string) => void; onAdd: (siteId: string, date: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const person = (id: string) => db.people.find((p) => p.id === id);
  const draggingState = (date: string) => (dragging ? personWeek(db.plan, db.holidays, liveIds, dragging.personId, [date])[0]! : null);
  const total = (d: string) => (d > day ? new Set(db.plan.filter((p) => p.date === d && sites.some((s) => s.id === p.projectId)).map((p) => p.personId)).size : new Set(db.attendance.filter((a) => a.date === d && sites.some((s) => s.id === a.projectId)).map((a) => a.personId)).size);
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface">
      <table className="w-full min-w-[56rem] table-fixed border-collapse" aria-label="Week ahead by site and day">
        <thead>
          <tr className="border-b border-line-strong">
            <th scope="col" className="w-56 px-3 py-2.5 text-left text-[0.93rem] font-medium text-muted">
              Site
            </th>
            {week.map((d) => (
              <th key={d} scope="col" className={cx("border-l border-line px-2 py-2.5 text-left", d <= day && "text-muted")}>
                <span className="block font-display text-[1.05rem] font-semibold">{wd(d)}</span>
                <span className="block text-[0.93rem] font-normal text-muted">
                  {dShort(d)}, {plural(total(d), "person", "people")}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <tr key={site.id} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-3 py-3 text-left align-top font-normal">
                <Link to={`/projects/${site.code}`} className="block font-display text-[1.1rem] leading-tight font-semibold underline-offset-2 hover:underline">
                  {site.code}
                </Link>
                <span className="block font-medium">{site.name}</span>
                <span className="block text-[0.87rem] text-muted">
                  {db.people.find((p) => p.id === site.siteManagerId)?.name}, {co(site.county)}
                  {site.status === "Not started" ? `. Starts ${dShort(site.startDate)}` : ""}
                </span>
              </th>
              {week.map((d) => {
                const key = `${site.id}|${d}`;
                const running = d >= site.startDate && d <= site.endDate;
                const past = d <= day;
                const editable = canEdit && running && !past;
                const entries = past
                  ? db.attendance.filter((a) => a.projectId === site.id && a.date === d).map((a) => ({ id: a.id, personId: a.personId, text: attendanceShort(a.status, a.overtimeHours) === "Full" ? "" : attendanceShort(a.status, a.overtimeHours).toLowerCase() }))
                  : db.plan.filter((p) => p.projectId === site.id && p.date === d).map((p) => ({ id: p.id, personId: p.personId, text: p.part === "half" ? "half day" : p.overtimeHours ? `+${p.overtimeHours}h` : "" }));
                const sorted = entries.sort((a, b) => (person(a.personId)?.name ?? "").localeCompare(person(b.personId)?.name ?? ""));
                const st = editable ? draggingState(d) : null;
                const outcome = st && dragging ? (dragging.fromDate === d && dragging.fromSiteId && dragging.fromSiteId !== site.id ? "free" : dropOutcome(st, site.id)) : null;
                const hint = outcome === "free" ? (dragging?.fromSiteId && dragging.fromDate === d ? "Move here" : "Drop to put on") : outcome === "busy" ? "On another site: drop to choose" : outcome === "leave" ? "On leave" : outcome === "already" ? "Already here" : "";
                return (
                  <td
                    key={d}
                    className={cx(
                      "border-l border-line p-1.5 align-top transition-colors",
                      !running && "bg-canvas",
                      dragging && !editable && "opacity-50",
                      outcome === "free" && "bg-accent-soft",
                      outcome === "busy" && "bg-warn-soft",
                      (outcome === "leave" || outcome === "already") && "opacity-50",
                      over === key && outcome && outcome !== "leave" && outcome !== "already" && "outline-2 -outline-offset-2 outline-accent",
                    )}
                    data-cell={`${site.code} ${d}`}
                    title={hint || undefined}
                    onDragOver={(e) => {
                      if (!editable || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (over !== key) setOver(key);
                    }}
                    onDragLeave={() => setOver((o) => (o === key ? null : o))}
                    onDrop={(e) => {
                      setOver(null);
                      if (!editable) return;
                      e.preventDefault();
                      try {
                        onDrop(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as Drag, site, d);
                      } catch {
                        onDragEnd();
                      }
                    }}
                  >
                    <div className="flex min-h-24 flex-col gap-1" aria-label={`${site.code}, ${dWeekday(d)}: ${plural(sorted.length, "person", "people")}`}>
                      {!running ? (
                        <span className="px-1.5 py-1 text-[0.93rem] text-faint">{d > site.endDate ? "Finished" : "Not started"}</span>
                      ) : (
                        <>
                          {sorted.map((e) => {
                            const p = person(e.personId);
                            if (!p) return null;
                            const clash = !past ? clashes.get(`${p.id}|${d}`)?.filter((x) => x !== site.id) : undefined;
                            return (
                              <button
                                key={e.id}
                                type="button"
                                draggable={editable}
                                onDragStart={(ev) => {
                                  const drag: Drag = { personId: p.id, fromSiteId: site.id, fromDate: d };
                                  ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify(drag));
                                  ev.dataTransfer.effectAllowed = "move";
                                  // Next frame: changing the page inside dragstart makes Chrome cancel the drag.
                                  requestAnimationFrame(() => onDragStart(drag));
                                }}
                                onDragEnd={onDragEnd}
                                onClick={() => onPerson(p, site.id)}
                                aria-label={`${p.name}: contact details and options`}
                                title={clash && clash.length > 0 ? `Also on ${clash.map(code).join(", ")}: more than one day's work` : editable ? "Click for details, or drag to another site on this day" : undefined}
                                className={cx(
                                  "press flex min-h-9 w-full items-baseline gap-1 rounded-md px-2 py-1 text-left text-[0.93rem]",
                                  past ? "bg-canvas text-muted" : clash && clash.length > 0 ? "bg-bad-soft font-medium text-bad" : "bg-accent-soft font-medium text-accent-ink",
                                  editable && "cursor-grab active:cursor-grabbing",
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                                {e.text && <span className="shrink-0 font-normal">{e.text}</span>}
                                {clash && clash.length > 0 && <span className="shrink-0 font-normal">+{clash.map(code).join(", ")}</span>}
                              </button>
                            );
                          })}
                          {sorted.length === 0 && <span className={cx("px-1.5 py-1 text-[0.93rem]", hint ? "font-medium text-accent-ink" : "text-faint")}>{hint || (past ? "Nobody marked" : "Nobody yet")}</span>}
                          {editable && (
                            <button type="button" aria-label={`Add someone to ${site.code} on ${dWeekday(d)}`} tabIndex={dragging ? -1 : undefined} className={cx(dragging && "invisible", "press mt-auto flex min-h-9 items-center justify-center rounded-md border border-dashed border-line-strong text-[0.93rem] text-muted hover:border-accent hover:text-accent-ink")} onClick={() => onAdd(site.id, d)}>
                              Add
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Dropped someone on a day they already have a full day elsewhere: move them, put them on both, or leave it. */
function BusyDialog({ person, site, date, db, onMoved, onClose }: { person: Person; site: Project; date: string; db: Db; onMoved: (fromSiteId?: string) => void; onClose: () => void }) {
  const elsewhere = db.plan.filter((p) => p.personId === person.id && p.date === date && p.projectId !== site.id);
  const codes = elsewhere.map((p) => db.projects.find((x) => x.id === p.projectId)?.code ?? "").join(" and ");
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${person.name} is on ${codes} that day`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            onClick={() => {
              setPlanDay(site.id, person.id, date, { part: "full", overtimeHours: 0 });
              toast(`${person.name} put on ${site.code} as well. This double books ${dWeekday(date)}: sort it out before sending`);
              onClose();
            }}
          >
            Put on both
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              for (const e of elsewhere) setPlanDay(e.projectId, person.id, date, null);
              setPlanDay(site.id, person.id, date, { part: "full", overtimeHours: 0 });
              toast(`${person.name} moved from ${codes} to ${site.code}, ${dWeekday(date)}`);
              onMoved(elsewhere.length === 1 ? elsewhere[0]!.projectId : undefined);
              onClose();
            }}
          >
            Move to {site.code}
          </Button>
        </>
      }
    >
      <p>
        {person.name.split(" ")[0]} already has a full day on {codes} on {dWeekday(date)}. Move them to {site.code} for that day, or put them on both, which double books the day and stops the week being sent until it is sorted.
      </p>
    </Dialog>
  );
}

/** The Add button in a cell: everyone free that day, by trade, one tap to put them on. */
function AddToDayDialog({ siteId, date, db, liveIds, onAdded, onClose }: { siteId: string; date: string; db: Db; liveIds: Set<string>; onAdded: (person: Person, site: Project, date: string) => void; onClose: () => void }) {
  const site = db.projects.find((p) => p.id === siteId)!;
  const [trade, setTrade] = useState("");
  const free = db.people
    .filter((p) => p.active && p.kind === "Operative")
    .map((p) => ({ p, st: personWeek(db.plan, db.holidays, liveIds, p.id, [date])[0]! }))
    .filter(({ st }) => dropOutcome(st, siteId) === "free")
    .sort((a, b) => a.p.trade.localeCompare(b.p.trade) || a.p.name.localeCompare(b.p.name));
  const trades = [...new Set(free.map((x) => x.p.trade))];
  const shown = free.filter((x) => !trade || x.p.trade === trade);
  return (
    <Dialog open onClose={onClose} title={`Add to ${site.code}, ${dWeekday(date)}`}>
      <div className="grid gap-3">
        <p className="text-[0.93rem] text-muted">{plural(free.length, "person", "people")} free that day. Choose one to put them on {site.code} {site.name} for the day.</p>
        {trades.length > 1 && (
          <select aria-label="Show one trade" className="field" value={trade} onChange={(e) => setTrade(e.target.value)}>
            <option value="">All trades</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t} ({free.filter((x) => x.p.trade === t).length})
              </option>
            ))}
          </select>
        )}
        {free.length === 0 ? (
          <Empty title="Nobody is free that day">Take someone off another site first, or drag them here to move them.</Empty>
        ) : (
          <ul className="grid max-h-[50dvh] gap-1.5 overflow-y-auto" aria-label="Free that day">
            {shown.map(({ p, st }) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="press flex min-h-11 w-full items-baseline gap-2 rounded-md border border-line-strong px-3 py-2 text-left hover:border-accent hover:bg-accent-soft"
                  onClick={() => {
                    const half = st.load === 0.5;
                    setPlanDay(site.id, p.id, date, { part: half ? "half" : "full", overtimeHours: 0 });
                    toast(`${p.name} put on ${site.code}, ${dWeekday(date)}${half ? ", half day" : ""}`);
                    onAdded(p, site, date);
                    onClose();
                  }}
                >
                  <span className="min-w-0 flex-1 font-medium">{p.name}</span>
                  <span className="text-[0.87rem] text-muted">
                    {p.trade}
                    {st.load === 0.5 ? ", half day free" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

type Where = "On site" | "Planned" | "On leave" | "Not planned";
const WHERE_TONE: Record<Where, Tone> = { "On site": "ok", Planned: "accent", "On leave": "warn", "Not planned": "bad" };

/** Every operative and where they are today. */
export function WhoIsWhere() {
  const db = useData((s) => s.db);
  const day = useDay();
  const [show, setShow] = useState<"All" | Where | "Per site">("All");
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
  // Per site (Oisin, 17 Nov), laid out like the plant overview: a heading per live site, then who is there today.
  const live = db.projects.filter((p) => p.status === "Live").sort((a, b) => a.code.localeCompare(b.code));
  const onSite = (id: string) => rows.filter((r) => r.where !== "On leave" && r.where !== "Not planned" && r.sites.some((s) => s.id === id));
  const elsewhere = rows.filter((r) => r.where === "On leave" || r.where === "Not planned" || r.sites.length === 0);

  return (
    <>
      <PageHead title="Who is where" note={`${dWeekday(day)}: ${n("On site")} marked on site, ${n("Planned")} expected but not marked yet, ${n("On leave")} on leave, ${n("Not planned")} with nowhere to be.`} actions={<Segmented label="Where people are" value={show} onChange={setShow} options={[{ value: "All", label: "All", count: rows.length }, { value: "On site", label: "On site", count: n("On site") }, { value: "Per site", label: "Per site" }, { value: "Planned", label: "Not marked yet", count: n("Planned") }, { value: "On leave", label: "On leave", count: n("On leave") }, { value: "Not planned", label: "Not planned", count: n("Not planned") }]} />} />
      <PageBody className={show === "Per site" ? "grid max-w-5xl gap-6" : undefined}>
        {show === "Per site" && (
          <>
            {live.map((site) => {
              const people = onSite(site.id);
              const marked = people.filter((r) => r.where === "On site").length;
              return (
                <Section
                  key={site.id}
                  title={
                    <Link to={`/projects/${site.code}`} className="underline-offset-2 hover:underline">
                      {site.code} {site.name}
                    </Link>
                  }
                  aside={`${db.people.find((p) => p.id === site.siteManagerId)?.name}, ${co(site.county)}. ${marked} on site${people.length > marked ? `, ${people.length - marked} not marked yet` : ""}`}
                >
                  <Panel className="overflow-x-auto">
                    {people.length === 0 ? (
                      <p className="px-3 py-3 text-muted">Nobody is on this site today.</p>
                    ) : (
                      <table className="tbl table-fixed" aria-label={`${site.code} ${site.name} today`}>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th className="w-56">Trade</th>
                            <th className="w-36">Status</th>
                            <th className="w-36">Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {people.map(({ p, where, sites }) => (
                            <tr key={p.id}>
                              <td className="font-medium">
                                {p.name}
                                {sites.length > 1 && <span className="block text-[0.87rem] font-normal text-muted">Also {sites.filter((x) => x.id !== site.id).map((x) => x.code).join(", ")} today</span>}
                              </td>
                              <td>{p.trade}</td>
                              <td>
                                <Badge tone={WHERE_TONE[where]}>{where === "Planned" ? "Not marked yet" : where}</Badge>
                              </td>
                              <td className="whitespace-nowrap">
                                <Tel number={p.phone} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Panel>
                </Section>
              );
            })}
            {elsewhere.length > 0 && (
              <Section title="Not on a site today" aside={`${elsewhere.length} on leave or with nowhere to be`}>
                <Panel className="overflow-x-auto">
                  <table className="tbl table-fixed" aria-label="Not on a site today">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th className="w-56">Trade</th>
                        <th className="w-36">Status</th>
                        <th className="w-36">Phone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elsewhere.map(({ p, where }) => (
                        <tr key={p.id}>
                          <td className="font-medium">{p.name}</td>
                          <td>{p.trade}</td>
                          <td>
                            <Badge tone={WHERE_TONE[where]}>{where === "Planned" ? "Not marked yet" : where}</Badge>
                          </td>
                          <td className="whitespace-nowrap">
                            <Tel number={p.phone} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              </Section>
            )}
          </>
        )}
        {show !== "Per site" && (
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
        )}
      </PageBody>
    </>
  );
}
