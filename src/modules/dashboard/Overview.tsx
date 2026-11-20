import { CheckSquare, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { APPS, type AppKey } from "@/app/apps";
import { useAccess } from "@/data/access";
import { actorName, addTodo, setTodoDone } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import { addDays } from "@/lib/dates";
import { dFull, dLong, plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { type Box as BoxData, financeBox, projectsBox, resourcesBox, salesBox, type Tone } from "@/lib/boxes";
import { waitingOnDirector } from "@/lib/requests";
import { todoLate } from "@/lib/renewals";
import { Button, cx, Dialog, Field, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { RequestsBody } from "@/modules/admin/Requests";

/**
 * The first screen after sign-in: Level 1 of the master demo (20 Nov, the Oldstone template
 * agreed with Jimmy). A box each for Sales, Projects, Resources and Finance, with two or three
 * figures, a bar and what needs attention; clicking a box opens that app. Under them, what is
 * waiting for a yes or no, and the person's own To do.
 */
export function Overview() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const opts = { money: (n: number) => money0(n, region), seeValues: access.seeValues };
  const appOpen = (key: AppKey) => APPS.find((a) => a.key === key)!.sections.flatMap((sec) => sec.tabs).find((t) => access.can(t.dept));
  const live = db.projects.filter((p) => p.status === "Live").length;
  const onSite = new Set(db.attendance.filter((a) => a.date === day).map((a) => a.personId)).size;
  // Drafts to approve come from email, sales, projects and invoicing; without any of them, the
  // yes or no list from Admin takes their place (19 Nov).
  const has = access.apps.on;
  const drafts = has("inbox") || has("sales") || has("projects") || has("invoicing");
  const boxes: { key: AppKey; build: () => BoxData }[] = [
    { key: "sales", build: () => salesBox(db, day, opts) },
    { key: "projects", build: () => projectsBox(db, day) },
    { key: "resources", build: () => resourcesBox(db, day) },
    { key: "finance", build: () => financeBox(db, day, opts) },
  ];
  const shown = boxes.filter((b) => appOpen(b.key));
  return (
    <>
      <PageHead title={dLong(day)} note={`${plural(live, "site")} live, ${plural(onSite, "person", "people")} marked on site so far today.`} />
      <PageBody className="grid gap-6">
        {shown.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2" aria-label="The firm at a glance">
            {shown.map((b) => (
              <AppBox key={b.key} app={APPS.find((a) => a.key === b.key)!} to={appOpen(b.key)!.to} box={b.build()} />
            ))}
          </div>
        )}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {drafts ? (
            <div className="grid content-start gap-3">
              <ApprovalsPanel title="Waiting for your yes or no" />
              {access.can("admin") && <AdminWaiting />}
            </div>
          ) : (
            access.can("admin") && (
              <Section title="Waiting for your yes or no" aside={<Link to="/admin" className="font-medium text-accent-ink underline-offset-2 hover:underline">Open in Admin</Link>}>
                <div className="grid gap-5">
                  <RequestsBody embedded />
                </div>
              </Section>
            )
          )}
          <TodoPanel />
        </div>
      </PageBody>
    </>
  );
}

/** One line under the approvals: what else waits in Admin (leave, site requests, invoices), with a way there. */
function AdminWaiting() {
  const db = useData((s) => s.db);
  const n = waitingOnDirector(db).length;
  if (!n) return null;
  return (
    <p className="rounded-lg border border-line bg-surface px-3 py-2 text-[0.93rem]">
      <span className="font-medium">{plural(n, "request")} from staff and the sites</span> <span className="text-muted">(leave, site requests, overtime, repairs, invoices) are waiting in Admin.</span>{" "}
      <Link to="/admin" className="font-medium text-accent-ink underline-offset-2 hover:underline">
        Open Admin requests
      </Link>
    </p>
  );
}

const TONE_TEXT: Record<Tone, string> = { neutral: "", accent: "text-accent-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad" };
const TONE_BG: Record<Tone, string> = { neutral: "bg-line-strong", accent: "bg-accent", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" };

/** A box for one app: its figures, a bar, and what needs attention. The heading opens the app. */
function AppBox({ app, to, box }: { app: (typeof APPS)[number]; to: string; box: BoxData }) {
  const Icon = app.icon;
  const total = box.bar.parts.reduce((s, p) => s + p.value, 0);
  return (
    <section aria-labelledby={`box-${app.key}`} className="flex flex-col rounded-lg border border-line bg-surface">
      <Link to={to} className="group flex items-center gap-2 border-b border-line px-4 py-2.5 hover:bg-accent-soft">
        <Icon size={22} className="text-accent-ink" />
        <h2 id={`box-${app.key}`} className="text-[1.15rem]">
          {app.label}
        </h2>
        <span className="ml-auto text-[0.93rem] font-medium text-accent-ink group-hover:underline">Open {app.label}</span>
      </Link>
      <dl className="grid grid-cols-3 gap-3 px-4 pt-3">
        {box.figures.map((f) => (
          <div key={f.label} className="min-w-0">
            <dd className={cx("font-display text-[1.5rem] leading-tight font-semibold tabular-nums", f.tone && TONE_TEXT[f.tone])}>{f.value}</dd>
            <dt className="text-[0.87rem] text-muted">{f.label}</dt>
          </div>
        ))}
      </dl>
      <div className="px-4 pt-3">
        <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={box.bar.label}>
          {total > 0 && box.bar.parts.filter((p) => p.value > 0).map((p) => <span key={p.label} className={TONE_BG[p.tone]} style={{ width: `${(p.value / total) * 100}%` }} />)}
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-[0.87rem] text-muted">
          {box.bar.parts.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={cx("inline-block size-2.5 rounded-full", TONE_BG[p.tone])} />
              {p.label} {p.value}
            </span>
          ))}
        </p>
      </div>
      <ul className="mt-2 mb-1 divide-y divide-line border-t border-line" aria-label={`${app.label}: needs attention`}>
        {box.lines.length === 0 && <li className="px-4 py-2 text-muted">Nothing needs attention.</li>}
        {box.lines.map((l) => (
          <li key={l.text}>
            <Link to={l.to} className="flex items-center gap-2.5 px-4 py-2 hover:bg-accent-soft">
              <span aria-hidden className={cx("size-2 shrink-0 rounded-full", TONE_BG[l.tone])} />
              <span className="min-w-0 flex-1">{l.text}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * To do (18 Nov, from the Secure-All build): the signed-in person's own list, what and when, ticked
 * off when done. A renewal in Fleet can be put on it ("Add to my to-do"), and is ticked off by
 * itself once the renewal is recorded. Under the AI overview, across the page.
 */
function TodoPanel() {
  const db = useData((s) => s.db);
  const day = useDay();
  const me = actorName(db);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const mine = db.todos.filter((t) => t.createdBy === me);
  const open = mine.filter((t) => !t.doneAt).sort((a, b) => a.due.localeCompare(b.due));
  const done = mine.filter((t) => t.doneAt).sort((a, b) => b.doneAt!.localeCompare(a.doneAt!)).slice(0, 5);
  const late = open.filter((t) => todoLate(t, day)).length;
  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          <CheckSquare size={20} className="text-accent-ink" /> To do
        </span>
      }
      aside={
        <span className="inline-flex items-center gap-3">
          <span className="text-[0.93rem] text-muted">{open.length ? `${plural(open.length, "thing")} on your list${late ? `, ${late} late` : ""}` : "Your own list"}</span>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={16} /> Add
          </Button>
        </span>
      }
    >
      <Panel>
        <ul aria-label="To do" className="grid py-1">
          {open.map((t) => (
            <li key={t.id} className="flex items-start gap-3 px-4 py-2">
              <input type="checkbox" aria-label={`Done: ${t.title}`} className="mt-1 size-5 shrink-0 accent-[var(--accent-strong)]" checked={false} onChange={() => { setTodoDone(t.id, true); toast("Ticked off"); }} />
              <span className="min-w-0 flex-1">
                <span className="block">{t.title}</span>
                <span className={cx("text-[0.87rem]", todoLate(t, day) ? "font-medium text-bad" : "text-muted")}>{todoLate(t, day) ? "Was due" : "Due"} {dFull(t.due)}</span>
                {t.vehicleId ? (
                  <Link to={`/fleet/vehicles/${t.vehicleId}`} className="ml-2 text-[0.87rem] font-medium text-accent-ink hover:underline">
                    Open the vehicle
                  </Link>
                ) : (
                  t.to && (
                    <Link to={t.to} className="ml-2 text-[0.87rem] font-medium text-accent-ink hover:underline">
                      Open it
                    </Link>
                  )
                )}
              </span>
            </li>
          ))}
          {open.length === 0 && <li className="px-4 py-2 text-muted">Nothing on your list. Add a job here, or use "To-do" on a renewal in Fleet or a row in Compliance.</li>}
        </ul>
        {done.length > 0 && (
          <div className="border-t border-line px-4 py-2">
            <button type="button" className="text-[0.93rem] font-medium text-accent-ink hover:underline" onClick={() => setShowDone((v) => !v)}>
              {showDone ? "Hide" : "Show"} recently done ({done.length})
            </button>
            {showDone && (
              <ul className="mt-1">
                {done.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 py-1.5 text-muted">
                    <input type="checkbox" aria-label={`Not done: ${t.title}`} className="mt-1 size-5 shrink-0 accent-[var(--accent-strong)]" checked onChange={() => setTodoDone(t.id, false)} />
                    <span>
                      <span className="line-through">{t.title}</span> <span className="text-[0.87rem]">by {t.doneBy}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
      {adding && <AddTodo onClose={() => setAdding(false)} />}
    </Section>
  );
}

function AddTodo({ onClose }: { onClose: () => void }) {
  const day = useDay();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(addDays(day, 7));
  const [error, setError] = useState("");
  const save = () => {
    if (!title.trim()) return setError("Say what needs doing.");
    addTodo({ title, due });
    toast("Added to To do");
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title="Add to To do" footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add</Button></>}>
      <div className="grid gap-3">
        <Field label="What">{(id) => <input id={id} className="field" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} placeholder="Book 231-G-4471 in for its service" />}</Field>
        <Field label="Due">{(id) => <input id={id} type="date" className="field" value={due} onChange={(e) => e.target.value && setDue(e.target.value)} />}</Field>
        <p role="alert" className="min-h-6 text-bad">{error}</p>
      </div>
    </Dialog>
  );
}
