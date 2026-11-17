import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { planDays, setPlanDay } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Db, Project } from "@/data/types";
import { personWeek, planClashes } from "@/lib/availability";
import { isBankHoliday } from "@/lib/bank-holidays";
import { addDays, datesBetween, daysInMonth, isWeekend, MONTHS } from "@/lib/dates";
import { dShort, dWeekday, plural } from "@/lib/format";
import { dayRoster, planSteps, stepsToPlan, whereabouts } from "@/lib/roster";
import { shiftMonth } from "@/lib/week";
import { Button, cx, Dialog, Empty, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";

const wd = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "short", timeZone: "UTC" });
const fullDate = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const onLeave = (db: Db, personId: string, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);
// Column widths in pixels. The table is laid out to these, so the grid does not shift as names load.
const SITE_W = 192;
const DAY_W = 152;
const WEEKEND_W = 32;
const plain = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * The month as a grid (Oisin, 17 Nov, in the layout of his own planning tool): a row per site, a
 * column per day, and in each square the names for that site that day. Days gone show who was on
 * site from the timesheet; days to come show the plan, the same plan the week ahead shows, so a
 * change in either appears in both. Click a square to add or remove people. Weekends are greyed
 * out, and the grid scrolls sideways across the whole month.
 */
export function MonthAhead() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const canEdit = access.may("planWeek");
  const [ym, setYm] = useState(day.slice(0, 7));
  const [open, setOpen] = useState<{ siteId: string; date: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const all = daysInMonth(y, m);
  const days = all.filter((d) => !isWeekend(d));
  const inMonth = new Set(days);
  // A job that finished during the month still has its days worked to show.
  const worked = new Set(db.attendance.filter((a) => inMonth.has(a.date)).map((a) => a.projectId));
  const sites = access
    .scope(db.projects)
    .filter((p) => ((p.status === "Live" || p.status === "Not started") && p.startDate <= days[days.length - 1]! && p.endDate >= days[0]!) || worked.has(p.id))
    .sort((a, b) => a.code.localeCompare(b.code));
  const liveIds = useMemo(() => new Set(db.projects.filter((p) => p.status === "Live" || p.status === "Not started").map((p) => p.id)), [db.projects]);
  const clashes = useMemo(() => planClashes(db.plan.filter((p) => liveIds.has(p.projectId) && p.date > day && inMonth.has(p.date))), [db.plan, liveIds, day, ym]);
  const cells = useMemo(() => {
    const out = new Map<string, ReturnType<typeof dayRoster>>();
    for (const s of sites) for (const d of days) out.set(`${s.id}|${d}`, dayRoster(db.attendance, db.plan, s.id, d, day));
    return out;
  }, [db.attendance, db.plan, day, ym, sites.length]);
  // A Saturday or Sunday is a narrow grey strip unless someone worked it or is down for it (17 Nov):
  // then it opens out to show the names, still greyed. Weekend work is planned on the week ahead.
  const weekendCell = (siteId: string, d: string) => dayRoster(db.attendance, db.plan, siteId, d, day);
  const weekendUsed = new Set(all.filter((d) => isWeekend(d) && sites.some((s) => weekendCell(s.id, d).rows.length > 0)));
  const widthOf = (d: string) => (!isWeekend(d) || weekendUsed.has(d) ? DAY_W : WEEKEND_W);
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  const operatives = db.people.filter((p) => p.active && p.kind === "Operative");
  // Totals: days gone count who attended, days to come who is planned.
  const busy = (d: string) => new Set(sites.flatMap((s) => cells.get(`${s.id}|${d}`)?.rows.map((r) => r.personId) ?? [])).size;
  const leave = (d: string) => operatives.filter((p) => onLeave(db, p.id, d)).length;
  const thisMonth = ym === day.slice(0, 7);

  // Open on today's column, with the site names still in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const th = el.querySelector<HTMLElement>(`[data-day="${day}"]`);
    el.scrollLeft = 0;
    // Measured on screen: a sticky heading's offsetLeft is not relative to the table.
    if (th) el.scrollLeft = Math.max(0, th.getBoundingClientRect().left - el.getBoundingClientRect().left - SITE_W);
  }, [ym, day]);
  const scrollWeek = (by: number) => scroller.current?.scrollBy({ left: by * (5 * DAY_W + 2 * WEEKEND_W), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const openSite = open && sites.find((s) => s.id === open.siteId);

  return (
    <>
      <PageHead title="Month ahead" note={`${MONTHS[m - 1]} ${y}. Days gone show who was on site, from the timesheet. Days to come show the plan, the same one as the week ahead, so a change in either shows in both.${canEdit ? " Click a day to add or remove people." : ""}`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setYm(shiftMonth(ym, -1))}>
            Earlier month
          </Button>
          <Button size="sm" onClick={() => setYm(shiftMonth(ym, 1))}>
            Later month
          </Button>
          {!thisMonth && (
            <Button size="sm" variant="ghost" onClick={() => setYm(day.slice(0, 7))}>
              Back to this month
            </Button>
          )}
          <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          <Button size="sm" aria-label="Scroll back a week" onClick={() => scrollWeek(-1)}>
            <CaretLeft size={14} /> Week
          </Button>
          <Button size="sm" aria-label="Scroll on a week" onClick={() => scrollWeek(1)}>
            Week <CaretRight size={14} />
          </Button>
          <span className="text-[0.93rem] text-muted">Scroll sideways to read every day.</span>
        </div>
      </PageHead>
      <PageBody>
        {sites.length === 0 ? (
          <Panel>
            <Empty title="No sites are running in this month" />
          </Panel>
        ) : (
          <div ref={scroller} tabIndex={0} role="region" aria-label="Month ahead grid, scrolls sideways" className="max-h-[calc(100dvh-21rem)] min-h-72 overflow-auto rounded-md border border-line bg-surface">
            <table className="table-fixed border-separate border-spacing-0" style={{ width: SITE_W + all.reduce((w, d) => w + widthOf(d), 0) }} aria-label={`Month ahead, ${MONTHS[m - 1]} ${y}`}>
              <thead>
                <tr>
                  <th scope="col" style={{ width: SITE_W }} className="sticky top-0 left-0 z-30 border-r border-b border-line-strong bg-surface px-3 py-2 text-left text-[0.93rem] font-medium text-muted">
                    Site
                  </th>
                  {all.map((d) =>
                    isWeekend(d) && weekendUsed.has(d) ? (
                      <th key={d} scope="col" data-day={d} style={{ width: DAY_W }} className="sticky top-0 z-20 border-b border-l border-line-strong bg-canvas px-2 py-2 text-left text-muted">
                        <span className="font-display text-[1.02rem] font-semibold">
                          {wd(d)} {Number(d.slice(8))}
                        </span>
                        <span className="ml-1.5 text-[0.87rem] font-normal">weekend</span>
                      </th>
                    ) : isWeekend(d) ? (
                      <th key={d} aria-hidden style={{ width: WEEKEND_W }} className="sticky top-0 z-20 border-b border-line-strong bg-canvas px-0 py-2 text-center text-[0.87rem] font-normal text-faint">
                        {wd(d)[0]}
                        <span className="block">{Number(d.slice(8))}</span>
                      </th>
                    ) : (
                      <th key={d} scope="col" data-day={d} style={{ width: DAY_W }} className={cx("sticky top-0 z-20 border-b border-l border-line-strong px-2 py-2 text-left", d === day ? "bg-accent-soft text-accent-ink" : "bg-surface", d < day && "text-muted")}>
                        <span className="font-display text-[1.02rem] font-semibold">
                          {wd(d)} {Number(d.slice(8))}
                        </span>
                        {d === day && <span className="ml-1.5 text-[0.87rem] font-normal">today</span>}
                        {isBankHoliday(db.bankHolidays, d) && <span className="block text-[0.87rem] font-normal text-warn">Bank holiday</span>}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr key={s.id}>
                    <th scope="row" className="sticky left-0 z-10 border-r border-b border-line bg-surface px-3 py-2 text-left align-top font-normal">
                      <Link to={`/projects/${s.code}`} className="block font-display text-[1.05rem] leading-tight font-semibold underline-offset-2 hover:underline">
                        {s.code}
                      </Link>
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[0.87rem] text-muted">{db.people.find((p) => p.id === s.siteManagerId)?.name}</span>
                      <span className="block text-[0.87rem] text-muted">
                        {dShort(s.startDate)} to {dShort(s.endDate)}
                      </span>
                    </th>
                    {all.map((d) => {
                      if (isWeekend(d) && weekendUsed.has(d)) {
                        const w = weekendCell(s.id, d);
                        const names = [...w.rows].sort((a, b) => name(a.personId).localeCompare(name(b.personId)));
                        return (
                          <td key={d} className="border-b border-l border-line bg-canvas p-1 align-top" data-cell={`${s.code} ${d}`} aria-label={names.length > 0 ? `${s.code}, ${dWeekday(d)}: ${plural(names.length, "person", "people")}, ${w.from === "timesheet" ? "worked" : "planned"}` : undefined}>
                            {names.map((r) => (
                              <span key={r.personId} className={cx("block truncate rounded px-1.5 py-0.5 text-[0.87rem]", w.from === "timesheet" ? "text-muted" : "font-medium text-ink")}>
                                {name(r.personId)}
                                {r.note && <span className="font-normal"> {r.note}</span>}
                              </span>
                            ))}
                          </td>
                        );
                      }
                      if (isWeekend(d)) return <td key={d} aria-hidden className="border-b border-line bg-canvas" />;
                      const running = d >= s.startDate && d <= s.endDate;
                      const cell = cells.get(`${s.id}|${d}`);
                      const rows = [...(cell?.rows ?? [])].sort((a, b) => name(a.personId).localeCompare(name(b.personId)));
                      const gone = cell?.from === "timesheet";
                      if (!running && rows.length === 0) return <td key={d} className="border-b border-l border-line bg-canvas" data-cell={`${s.code} ${d}`} />;
                      return (
                        <td key={d} className="border-b border-l border-line p-1 align-top" data-cell={`${s.code} ${d}`}>
                          <button
                            type="button"
                            aria-label={`${s.code}, ${dWeekday(d)}: ${plural(rows.length, "person", "people")}${gone ? ", from the timesheet" : ", planned"}. Open the day`}
                            className="press flex min-h-20 w-full flex-col gap-0.5 rounded-md p-0.5 text-left hover:bg-accent-soft/60"
                            onClick={() => setOpen({ siteId: s.id, date: d })}
                          >
                            {rows.map((r) => {
                              const clash = !gone && clashes.has(`${r.personId}|${d}`);
                              return (
                                <span key={r.personId} className={cx("block truncate rounded px-1.5 py-0.5 text-[0.87rem]", gone ? "text-muted" : clash ? "bg-bad-soft font-medium text-bad" : "bg-accent-soft font-medium text-accent-ink")}>
                                  {name(r.personId)}
                                  {r.note && <span className="font-normal"> {r.note}</span>}
                                </span>
                              );
                            })}
                            {rows.length === 0 && <span className="px-1.5 py-0.5 text-[0.87rem] text-faint">{gone ? "Nobody marked" : canEdit && d > day ? "Add" : "Nobody yet"}</span>}
                          </button>
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
                    <th scope="row" className={cx("sticky left-0 z-10 border-r border-line bg-surface px-3 py-1.5 text-left font-medium", i === 0 && "border-t border-line-strong")}>
                      {label}
                    </th>
                    {all.map((d) => {
                      if (isWeekend(d)) return <td key={d} aria-hidden className={cx("bg-canvas", i === 0 && "border-t border-line-strong")} />;
                      const n = fn(d);
                      return (
                        <td key={d} className={cx("border-l border-line px-2 py-1.5 tabular-nums", i === 0 && "border-t border-line-strong", label === "Free" && n != null && n > 3 && "font-medium text-warn")}>
                          {n == null ? "" : n || <span className="text-faint">0</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.93rem] text-muted">Weekends are greyed out, and open out to show names only where someone worked or is down for one; weekend work is planned on the week ahead. Anyone planned on two sites the same day is shown in red, on this screen and on the week ahead. "Free" counts operatives with no site and no leave that day; more than three free is shown in amber.</p>
      </PageBody>
      {open && openSite && <MonthDayDialog key={`${open.siteId}|${open.date}`} site={openSite} date={open.date} db={db} day={day} canEdit={canEdit} liveIds={liveIds} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * One square of the month: who is down for that site that day, with a way to take someone off
 * and to add a person, on that day alone or repeated each weekday until a date. A day gone shows
 * who was on site from the timesheet, and cannot be changed here.
 */
function MonthDayDialog({ site, date, db, day, canEdit, liveIds, onClose }: { site: Project; date: string; db: Db; day: string; canEdit: boolean; liveIds: Set<string>; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [personId, setPersonId] = useState("");
  const [until, setUntil] = useState(date);
  const roster = dayRoster(db.attendance, db.plan, site.id, date, day);
  const gone = roster.from === "timesheet";
  const person = (id: string) => db.people.find((p) => p.id === id);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  const running = (d: string) => d >= site.startDate && d <= site.endDate;
  const editable = canEdit && !gone && date > day && running(date);
  const clashes = gone ? new Map<string, string[]>() : planClashes(db.plan.filter((p) => liveIds.has(p.projectId) && p.date === date));
  const rows = [...roster.rows].sort((a, b) => (person(a.personId)?.name ?? "").localeCompare(person(b.personId)?.name ?? ""));
  const pool = !editable
    ? []
    : db.people
        .filter((p) => p.active && p.kind === "Operative" && !roster.rows.some((r) => r.personId === p.id))
        .map((p) => ({ p, st: personWeek(db.plan, db.holidays, liveIds, p.id, [date])[0]! }))
        .filter(({ p }) => !q.trim() || plain(`${p.name} ${p.trade}`).includes(plain(q.trim())))
        .sort((a, b) => Number(a.st.leave) - Number(b.st.leave) || a.st.load - b.st.load || a.p.name.localeCompare(b.p.name));
  const last = until < date ? date : until;
  const steps = personId ? planSteps(personWeek(db.plan, db.holidays, liveIds, personId, datesBetween(date, last).filter((d) => !isWeekend(d))), site.id, { running, onBusy: "clash" }) : [];
  const todo = stepsToPlan(steps);
  const count = (a: string) => steps.filter((s) => s.action === a).length;
  const picked = person(personId);
  return (
    <Dialog open onClose={onClose} title={`${site.code}, ${fullDate(date)}`}>
      <div className="grid gap-4">
        <p className="text-muted">
          {site.name}. {gone ? "Who was on site, from the timesheet." : rows.length === 0 ? "" : `${plural(rows.length, "person", "people")} planned.`}
        </p>
        {rows.length === 0 ? (
          <p>{gone ? "Nobody was marked in that day." : "No one planned yet."}</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line" aria-label={gone ? "On site that day" : "Planned that day"}>
            {rows.map((r) => {
              const p = person(r.personId);
              const clash = clashes.get(`${r.personId}|${date}`)?.filter((x) => x !== site.id);
              return (
                <li key={r.personId} className={cx("flex min-h-11 items-center gap-2 px-3 py-1", clash && clash.length > 0 && "bg-bad-soft/50")}>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p?.name}</span>
                    <span className="text-muted">
                      , {p?.trade}
                      {r.note ? `, ${r.note}` : ""}
                    </span>
                    {clash && clash.length > 0 && <span className="block text-[0.87rem] text-bad">Also planned on {clash.map(code).join(", ")} that day</span>}
                  </span>
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Take ${p?.name} off ${site.code} that day`}
                      className="press grid size-9 shrink-0 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
                      onClick={() => {
                        setPlanDay(site.id, r.personId, date, null);
                        toast(`${p?.name} taken off ${site.code}, ${dWeekday(date)}`);
                      }}
                    >
                      <X size={18} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {editable && (
          <form
            className="grid gap-3 rounded-lg bg-canvas p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!picked || todo.length === 0) return;
              const n = planDays(site.id, picked.id, todo.map((s) => ({ date: s.date, half: s.action === "half" })));
              toast(`${picked.name} added to ${site.code}, ${plural(n, "day")}${count("clash") > 0 ? `. ${plural(count("clash"), "day")} double booked, shown in red` : ""}`);
              setPersonId("");
              setQ("");
              setUntil(date);
            }}
          >
            <div className="grid gap-1.5">
              <label htmlFor="month-add-person" className="font-medium">
                Add person
              </label>
              <input id="month-add-person" type="search" className="field h-10" placeholder="Search employee" autoComplete="off" value={q} onChange={(e) => { setQ(e.target.value); setPersonId(""); }} />
              <ul role="listbox" aria-label="Employees" className="max-h-44 divide-y divide-line overflow-y-auto rounded-md border border-line bg-surface">
                {pool.length === 0 && <li className="px-3 py-2 text-muted">Nobody matches.</li>}
                {pool.map(({ p, st }) => (
                  <li key={p.id} role="option" aria-selected={personId === p.id} aria-disabled={st.leave}>
                    <button
                      type="button"
                      disabled={st.leave}
                      onClick={() => setPersonId(p.id)}
                      className={cx("press flex min-h-9 w-full items-baseline gap-2 px-3 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60", personId === p.id ? "bg-accent-soft font-medium text-accent-ink" : "hover:bg-accent-soft/60")}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {p.name}
                        <span className="font-normal text-muted">, {p.trade}</span>
                      </span>
                      <span className={cx("shrink-0 text-[0.87rem]", st.leave ? "text-warn" : st.load >= 1 ? "text-muted" : "text-accent-ink")}>{whereabouts(st, code)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <label className="flex flex-wrap items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Repeat each weekday until</span>
              <input type="date" aria-label="Repeat each weekday until" className="field h-10 w-auto" min={date} max={site.endDate < addDays(date, 62) ? site.endDate : addDays(date, 62)} value={until} onChange={(e) => setUntil(e.target.value || date)} />
            </label>
            {picked && (
              <p className="text-[0.93rem] text-muted" aria-live="polite">
                {todo.length === 0 ? `Nothing to add for ${picked.name.split(" ")[0]} in those days.` : `Adds ${plural(todo.length, "day")} for ${picked.name.split(" ")[0]}: ${dShort(todo[0]!.date)}${todo.length > 1 ? ` to ${dShort(todo[todo.length - 1]!.date)}` : ""}.`}
                {count("clash") > 0 && <span className="text-bad"> {plural(count("clash"), "day")} double book with another site and will show in red.</span>}
                {count("leave") > 0 && ` ${plural(count("leave"), "day")} of leave skipped.`}
                {count("already") > 0 && ` Already on ${site.code} for ${plural(count("already"), "day")}.`}
                {count("off") > 0 && ` ${site.code} is not running on ${plural(count("off"), "day")}.`}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!picked || todo.length === 0}>
              Add to {site.code}
            </Button>
          </form>
        )}
        {!editable && !gone && <p className="text-[0.93rem] text-muted">{!canEdit ? 'Changing the plan needs the "Plan the week ahead" permission.' : date <= day ? "Today is already under way, so it is changed on the timesheet, not here." : `${site.code} is not running that day.`}</p>}
      </div>
    </Dialog>
  );
}
