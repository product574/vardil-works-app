import { CheckSquare, Plus } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { askFromSearch, Parts } from "@/ai/AskPanel";
import { parseInline } from "@/ai/markdown";
import { dashboardNumbers } from "@/data/kpis";
import { useAccess } from "@/data/access";
import { actorName, addTodo, setTodoDone } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { DepartmentKey } from "@/data/types";
import { addDays } from "@/lib/dates";
import { dFull, dLong, plural, when } from "@/lib/format";
import { money0 } from "@/lib/money";
import { recordsOverview } from "@/lib/overview";
import { todoLate } from "@/lib/renewals";
import { dueWords, outstanding, portalFeed } from "@/lib/portal";
import { Badge, Button, cx, Dialog, Field, PageBody, PageHead, Panel, Section, type Tone } from "@/ui";
import { toast } from "@/ui/toast";
import { ApprovalsPanel } from "./ApprovalsPanel";
import { RequestsBody } from "@/modules/admin/Requests";
import { StateBadge, useCompliance } from "@/modules/compliance/shared";

/**
 * The first screen after sign-in (Aodhan, 16 Nov). Top: the AI overview (option B, worked out
 * from the records) beside the top five sites on site today, the two the same height. Below:
 * approvals, opened and closed in place, beside the portal. The firm at a glance closes it.
 */
export function Overview() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const k = dashboardNumbers(db, day);
  const canSee = (dept: DepartmentKey) => access.can(dept);
  const has = access.apps.on;
  // What the panels show follows the apps the firm has (19 Nov). Drafts to approve come from
  // email, sales, projects and invoicing; without any of them, the yes or no list takes their place.
  const drafts = has("inbox") || has("sales") || has("projects") || has("invoicing");
  const waiting = !drafts && access.can("admin");
  const glance = [has("sales"), has("projects"), has("invoicing"), has("compliance")].filter(Boolean).length > 1;

  return (
    <>
      <PageHead title={dLong(day)} note={`${plural(k.sites.live, "site")} live, ${plural(k.sites.peopleOnSite, "person", "people")} marked on site so far today.`} />
      <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AiOverview />
        <OnSiteToday />
        <TodoPanel />
        {waiting && (
          <Section title="Waiting for your yes or no" aside={<Link to="/admin" className="font-medium text-accent-ink underline-offset-2 hover:underline">Open in Admin</Link>} className="xl:col-span-2">
            <div className="grid gap-5">
              <RequestsBody embedded />
            </div>
          </Section>
        )}
        {has("compliance") && canSee("compliance") && <ComplianceWatch />}
        {drafts && <ApprovalsPanel />}
        {has("portal") && <PortalPanel />}

        {glance && <Section title="The firm at a glance" className="xl:col-span-2">
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
            {has("sales") && <Glance
              heading="Sales"
              to={canSee("sales") ? "/sales" : undefined}
              rows={[
                ["Enquiries to quote", k.sales.enquiriesToQuote, k.sales.enquiriesToQuote > 0 ? "accent" : undefined],
                ["Quotes out, no decision", k.sales.quotesOut],
                ["Opened, not answered", k.sales.openedNotAnswered],
                ["Queried by client", k.sales.queried, k.sales.queried > 0 ? "warn" : undefined],
              ]}
            />}
            {has("projects") && <Glance
              heading="Sites"
              to={canSee("projects") ? "/projects" : undefined}
              rows={[
                ["Live projects", k.sites.live],
                ["Starting soon", k.sites.notStarted],
                ["Time stamps not sent today", k.sites.timeStampsNotSent, k.sites.timeStampsNotSent > 0 ? "warn" : undefined],
                ["Open site requests", k.sites.openRequests, k.sites.openRequests > 0 ? "accent" : undefined],
              ]}
            />}
            {has("invoicing") && <Glance
              heading="Money"
              to={canSee("invoicing") ? "/invoicing" : undefined}
              rows={[
                ["Ready to invoice", access.seeValues ? `${k.money.toInvoice} (${money0(k.money.toInvoiceValue, region)})` : k.money.toInvoice, k.money.toInvoice > 0 ? "accent" : undefined],
                ["Invoices held", k.money.held, k.money.held > 0 ? "warn" : undefined],
                ["Overdue from clients", access.seeValues ? `${k.money.overdue} (${money0(k.money.overdueValue, region)})` : k.money.overdue, k.money.overdue > 0 ? "bad" : undefined],
                ["Supplier invoices to check", k.money.supplierToCheck],
                ["Invoices waiting for approval", k.money.toApprove, k.money.toApprove > 0 ? "warn" : undefined],
                ["Approved, to be paid", access.seeValues ? `${k.money.toPay} (${money0(k.money.toPayValue, region)})` : k.money.toPay, k.money.toPayLate > 0 ? "bad" : undefined],
              ]}
            />}
            {has("compliance") && <Glance
              heading="Compliance"
              to={canSee("compliance") ? "/compliance" : undefined}
              rows={[
                ["Training tickets expired", k.compliance.certsExpired, k.compliance.certsExpired > 0 ? "bad" : undefined],
                ["Tickets expiring in 30 days", k.compliance.certsSoon, k.compliance.certsSoon > 0 ? "warn" : undefined],
                ["Plant and vehicles overdue", k.compliance.plantOverdue + k.compliance.fleetOverdue, k.compliance.plantOverdue + k.compliance.fleetOverdue > 0 ? "bad" : undefined],
                ["Hired plant to return", k.compliance.hiredToReturn, k.compliance.hiredToReturn > 0 ? "warn" : undefined],
              ]}
            />}
          </div>
        </Section>}
      </PageBody>
    </>
  );
}

/**
 * Option B: up to three things that need a decision, each with one button, then up to four
 * facts worth knowing. Worked out from the records as they stand (Aodhan's pick, 16 Nov), so it
 * changes the moment something is approved or answered.
 */
function AiOverview() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const o = recordsOverview(db, day, {
    money: (n) => money0(n, region),
    seeValues: access.seeValues,
    seeMargins: access.seeMargins,
    canAsk: access.askAi,
    answersRequests: access.can("admin") && access.may("answerRequests"),
    checksPayroll: access.can("people") && access.may("checkPayroll"),
    exportsPayroll: access.can("people") && access.may("exportPayroll"),
    apps: access.apps.on,
  });
  return (
    <Section title="AI overview" aside={<span className="text-[0.93rem] text-muted">Worked out from today's records</span>} className="flex flex-col">
      <Panel className="flex-1 px-4 py-3">
        <h3 className="mb-1 font-sans text-[0.93rem] font-semibold text-muted">Needs your decision</h3>
        {o.decisions.length === 0 ? (
          <p className="mb-3 text-muted">Nothing needs a decision from you right now.</p>
        ) : (
          <ul className="mb-3 divide-y divide-line">
            {o.decisions.map((d) => (
              <li key={d.text} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 first:pt-1">
                <span className="min-w-0 flex-1 basis-64">
                  <Parts parts={parseInline(d.text)} />
                </span>
                {d.button && (
                  <Button
                    size="sm"
                    onClick={() => {
                      if (d.button!.ask) askFromSearch(d.button!.ask, pathname, search, db);
                      else if (d.button!.to) navigate(d.button!.to);
                    }}
                  >
                    {d.button.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {o.facts.length > 0 && (
          <>
            <h3 className="mb-1 font-sans text-[0.93rem] font-semibold text-muted">Worth knowing</h3>
            <ul className="grid list-disc gap-1 pl-5 marker:text-faint">
              {o.facts.map((f) => (
                <li key={f}>
                  <Parts parts={parseInline(f)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </Section>
  );
}

/** The five busiest live sites today, then a link to the rest (Aodhan: top five, to keep it level with the overview). */
function OnSiteToday() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const live = db.projects
    .filter((p) => p.status === "Live")
    .map((p) => ({ p, today: db.attendance.filter((a) => a.projectId === p.id && a.date === day) }))
    .sort((a, b) => b.today.length - a.today.length || a.p.code.localeCompare(b.p.code));
  const rest = live.length - 5;
  const all = access.can("people") ? "/people/timesheet" : "/projects";
  return (
    <Section
      title="On site today"
      className="flex flex-col"
      aside={
        access.can("people") && (
          <Link to="/people/timesheet" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Open timesheet
          </Link>
        )
      }
    >
      <Panel className="flex flex-1 flex-col">
        <table className="tbl">
          <thead>
            <tr>
              <th>Site</th>
              <th className="num">People</th>
              <th>Time stamps</th>
            </tr>
          </thead>
          <tbody>
            {live.slice(0, 5).map(({ p, today }) => {
              const sent = today.length > 0 && today.every((a) => a.sent);
              const tone: Tone = sent ? "ok" : today.length > 0 ? "warn" : "neutral";
              return (
                <tr key={p.id}>
                  <td>
                    <span className="font-medium">{p.code}</span> {p.name}
                    <span className="block text-[0.87rem] text-muted">{db.people.find((x) => x.id === p.siteManagerId)?.name}</span>
                  </td>
                  <td className="num">{today.length || "-"}</td>
                  <td>
                    <Badge tone={tone}>{sent ? "Sent" : today.length > 0 ? "Marked, not sent" : "Not marked yet"}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rest > 0 && (
          <Link to={all} className="mt-auto block border-t border-line px-3 py-2 text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
            All {live.length} sites ({rest} more)
          </Link>
        )}
      </Panel>
    </Section>
  );
}

const PARTY: Record<string, string> = { client: "client", subcontractor: "subcontractor", supplier: "supplier" };

/**
 * The portal at a glance (Aodhan, 16 Nov): the latest from clients and subcontractors, and what
 * is still outstanding, invoices from clients and supplies to sites.
 */
function PortalPanel() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const feed = portalFeed(db, day, 4);
  const due = outstanding(db, day);
  const head = (label: string) => <li className="border-t border-line bg-side px-3 py-1.5 text-[0.87rem] font-semibold text-muted first:border-t-0">{label}</li>;
  const rowCls = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2 hover:bg-accent-soft";
  return (
    <Section
      title="Portal"
      aside={
        // As tall as the Waiting and Done switch beside Approvals, so the two panels start level.
        <span className="inline-flex h-9 items-center">
          {access.can("portal") && (
            <Link to="/portal" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Open portal
            </Link>
          )}
        </span>
      }
    >
      <Panel>
        <ul className="divide-y divide-line">
          {head("Latest from clients and subcontractors")}
          {feed.length === 0 && <li className="px-3 py-2 text-muted">Nothing new in the last two weeks.</li>}
          {feed.map((f) => (
            <li key={`${f.at}${f.who}`}>
              <Wrap to={f.to} className={rowCls}>
                <span className="font-medium">
                  {f.who} <span className="text-[0.87rem] font-normal text-muted">{PARTY[f.party]}</span>
                </span>
                <span className="text-[0.93rem] text-muted">{when(f.at, day)}</span>
                <span className="col-span-2 text-[0.93rem] text-muted">{f.text}</span>
              </Wrap>
            </li>
          ))}
          {head("Outstanding")}
          {due.length === 0 && <li className="px-3 py-2 text-muted">Nothing outstanding.</li>}
          {due.map((x) =>
            x.kind === "invoice" ? (
              <li key={x.ref}>
                <Wrap to={x.to} className={rowCls}>
                  <span className="font-medium">
                    {x.who} <span className="text-[0.87rem] font-normal text-muted">invoice {x.ref}</span>
                  </span>
                  <span className="font-medium text-bad">{access.seeValues ? money0(x.gross, region) : "Overdue"}</span>
                  <span className="col-span-2 text-[0.93rem] text-muted">{plural(x.daysLate, "day")} late.</span>
                </Wrap>
              </li>
            ) : (
              <li key={x.order.id}>
                <Wrap to={x.to} className={rowCls}>
                  <span className="font-medium">
                    {x.who} <span className="text-[0.87rem] font-normal text-muted">{x.order.party === "subcontractor" ? "subcontractor" : "supplies"}</span>
                  </span>
                  <span className={cx("text-[0.93rem]", x.order.status === "Ready to collect" ? "text-accent-ink" : x.daysLate > 0 ? "text-warn" : "text-muted")}>
                    {x.order.status === "Ready to collect" || x.order.status === "Part delivered" ? x.order.status : dueWords(x.order.dueOn, day)}
                  </span>
                  <span className="col-span-2 text-[0.93rem] text-muted">
                    {x.order.description}, for {x.code}.{x.order.progress ? ` ${x.order.progress} delivered so far.` : ""}
                  </span>
                </Wrap>
              </li>
            ),
          )}
        </ul>
      </Panel>
    </Section>
  );
}

function Wrap({ to, className, children }: { to?: string; className: string; children: ReactNode }) {
  return to ? (
    <Link to={to} className={cx("block", className)}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

const NUM_TONE: Record<Tone, string> = { neutral: "", accent: "text-accent-ink", ok: "text-ok", warn: "text-warn", bad: "text-bad" };

/** A short column of counts under one heading. Rows are plain text: the number is the point. */
function Glance({ heading, to, rows }: { heading: string; to?: string; rows: [label: string, value: number | string, tone?: Tone][] }) {
  return (
    <div>
      <h3 className="mb-1 flex items-baseline border-b border-line-strong pb-1 text-base">
        {heading}
        {to && (
          <Link to={to} className="ml-auto font-sans text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
            Open
          </Link>
        )}
      </h3>
      <dl>
        {rows.map(([label, value, tone]) => (
          <div key={label} className="flex items-baseline gap-3 border-b border-line py-1.5 last:border-0">
            <dt className="text-muted">{label}</dt>
            <dd className={cx("ml-auto text-[1.08rem] font-medium", tone && NUM_TONE[tone])}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
      className="xl:col-span-2"
    >
      <Panel>
        <ul aria-label="To do" className="grid py-1 sm:grid-cols-2 xl:grid-cols-3">
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
          {open.length === 0 && <li className="px-4 py-2 text-muted sm:col-span-2 xl:col-span-3">Nothing on your list. Add a job here, or use "To-do" on a renewal in Fleet or a row in Compliance.</li>}
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

/**
 * Compliance monitoring on the dashboard (19 Nov, the main offering): the four figures that
 * matter, each opening Compliance on that list, and the things to see to first.
 */
function ComplianceWatch() {
  const { rows, day, access } = useCompliance();
  const mine = rows.filter((r) => (r.area !== "fleet" || access.apps.on("fleet")) && (r.area !== "machinery" || access.apps.on("plant")));
  const figures: { key: string; label: string; n: number; tone: Tone }[] = [
    { key: "expired", label: "Run out or missing", n: mine.filter((r) => r.state === "expired" || r.state === "missing").length, tone: "bad" },
    { key: "blocks", label: "Stopping work", n: mine.filter((r) => r.blocks).length, tone: "bad" },
    { key: "due", label: "Due in 30 days", n: mine.filter((r) => r.state === "due").length, tone: "warn" },
    { key: "proof", label: "Proof needed", n: mine.filter((r) => r.proofNeeded).length, tone: "accent" },
  ];
  const first = mine.filter((r) => r.state !== "ok").sort((a, b) => Number(b.blocks) - Number(a.blocks) || (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 6);
  return (
    <Section title="Compliance" aside={<Link to="/compliance" className="font-medium text-accent-ink underline-offset-2 hover:underline">Open Compliance</Link>} className="xl:col-span-2">
      <div className="grid gap-3 sm:grid-cols-4">
        {figures.map((f) => (
          <Link key={f.key} to={`/compliance?show=${f.key}`} className="press rounded-lg border border-line bg-surface px-4 py-3 hover:border-accent">
            <span className="block text-[0.93rem] text-muted">{f.label}</span>
            <span className={cx("font-display text-[1.6rem] leading-tight font-semibold tabular-nums", f.n > 0 && (f.tone === "bad" ? "text-bad" : f.tone === "warn" ? "text-warn" : "text-accent-ink"))}>{f.n}</span>
          </Link>
        ))}
      </div>
      {first.length > 0 && (
        <Panel className="mt-3">
          <ul className="divide-y divide-line" aria-label="Compliance to see to first">
            {first.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="font-medium">{r.who}</span>
                  <span className="text-muted">, {r.item}</span>
                  {r.blocks && <span className="block text-[0.87rem] text-bad">Stops work until renewed</span>}
                </span>
                <StateBadge r={r} day={day} />
                <Link to={r.to ?? "/compliance"} className="text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Section>
  );
}
