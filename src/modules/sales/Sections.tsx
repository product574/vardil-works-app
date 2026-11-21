import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project, Quote } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { money0, pct1 } from "@/lib/money";
import { marginFlag, quoteTotal } from "@/lib/quotes";
import { tenderWinRate } from "@/lib/reports";
import { daysBetween } from "@/lib/status";
import { checksDone, estMargin, LOST_DAYS, pipeline, projectEstMargin, returnTone, returnWords, subsState, TENDER_CHECKS, tenderList, type TenderList } from "@/lib/tenders";
import { useScreenState } from "@/app/screen-state";
import { Badge, Button, cx, Dialog, Empty, Field, NextStep, OptionalNumInput, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { MarginCell } from "@/ui/margin";
import { setEstMargin } from "@/data/actions";
import { QuoteBadge } from "@/ui/status";

/**
 * Sales, Tenders (20 Nov, the Oldstone template): every tender being priced or out with a client,
 * with where it is, its return date, the subcontractors' prices and the checks. Opens a tender on
 * its own sections. The drag-and-drop board is the next tab.
 */
export function Tenders() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const [show, setShow] = useScreenState<TenderList>("tenders-list", "pricing");
  const listOf = (q: Quote) => tenderList(q, db.projects, day);
  const count = (l: TenderList) => db.quotes.filter((q) => listOf(q) === l).length;
  const newest = (a: Quote, b: Quote) => (b.respondedAt ?? b.sentAt ?? "").localeCompare(a.respondedAt ?? a.sentAt ?? "");
  const rows = db.quotes
    .filter((q) => listOf(q) === show)
    .sort((a, b) => (show === "pricing" ? (a.tender?.returnBy ?? "").localeCompare(b.tender?.returnBy ?? "") : newest(a, b)));
  const tabBtn = (l: TenderList, label: string) => (
    <button key={l} role="tab" type="button" aria-selected={show === l} onClick={() => setShow(l)} className={cx("press h-8 rounded px-3 text-[0.93rem] font-medium", show === l ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink")}>
      {label}
      <span className="ml-1.5 font-normal opacity-80">{count(l)}</span>
    </button>
  );
  const empty: Record<TenderList, string> = {
    pricing: "Price an enquiry from Enquiries to start a tender.",
    out: "Nothing is out with a client.",
    won: "No won tender has a project running or waiting to start.",
    lost: `Nothing lost in the last ${LOST_DAYS} days.`,
    archive: "Nothing archived yet.",
  };
  return (
    <>
      <PageHead
        title="Tenders"
        note={`Every tender being priced, out with a client, won with its job not closed yet, or lost in the last ${LOST_DAYS} days. A won tender goes to the archive once its job is closed, and a lost one after ${LOST_DAYS} days. Open one for its documents, subcontractors, photos, workings and the checks.`}
      />
      <PageBody className="grid max-w-[90rem] grid-cols-1 gap-4">
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-3 overflow-x-auto whitespace-nowrap" role="tablist" aria-label="Tenders shown">
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
            {tabBtn("pricing", "Being priced")}
            {tabBtn("out", "With the client")}
            {tabBtn("won", "Won, live")}
            {tabBtn("lost", `Lost, last ${LOST_DAYS} days`)}
          </div>
          {/* Set apart from the four above (Oisin, 21 Nov): what is finished with. */}
          <span aria-hidden className="h-7 w-px bg-line-strong" />
          <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">{tabBtn("archive", "Archive")}</div>
        </div>
        {show === "archive" ? (
          <>
            <Section title={`Won, job closed (${rows.filter((q) => q.status === "Accepted").length})`} aside="Won tenders whose job is finished and fully paid.">
              <TenderTable rows={rows.filter((q) => q.status === "Accepted")} list="archive" empty="No won tender has a closed job yet." />
            </Section>
            <Section title={`Lost, over ${LOST_DAYS} days ago (${rows.filter((q) => q.status === "Declined").length})`} aside={`Declined more than ${LOST_DAYS} days ago, kept with everything that was on them.`}>
              <TenderTable rows={rows.filter((q) => q.status === "Declined")} list="archive" empty={`Nothing lost more than ${LOST_DAYS} days ago.`} />
            </Section>
          </>
        ) : (
          <TenderTable rows={rows} list={show} empty={empty[show]} />
        )}
      </PageBody>
    </>
  );

  function TenderTable({ rows, list, empty }: { rows: Quote[]; list: TenderList; empty: string }) {
    const enquiry = (q: Quote) => db.enquiries.find((e) => e.id === q.enquiryId);
    const project = (q: Quote) => db.projects.find((p) => p.quoteId === q.id);
    const decided = list === "won" || list === "lost" || list === "archive";
    return (
      <Panel className="overflow-x-auto">
        {rows.length === 0 ? (
          <Empty title="No tenders here">{empty}</Empty>
        ) : (
          <table className="tbl" aria-label="Tenders">
            <thead>
              <tr>
                <th>Tender</th>
                <th>Location</th>
                <th>{decided ? "Answered" : "Return date"}</th>
                {access.seeValues && <th className="num">Value</th>}
                {access.seeMargins && <th className="num">Est. margin</th>}
                {decided ? <th>{list === "lost" || rows.every((q) => q.status === "Declined") ? "Outcome" : "Job"}</th> : <><th>Subcontractors</th><th>Checks</th></>}
                <th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const e = enquiry(q);
                const p = project(q);
                const subs = subsState(q.tender?.subPrices ?? []);
                return (
                  <tr key={q.id}>
                    <td className="min-w-[16rem]">
                      <Link to={`/sales/quotes/${q.ref}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                        {q.ref} {q.title.split(":")[0]}
                      </Link>
                      <span className="block text-[0.87rem] text-muted">{db.clients.find((c) => c.id === q.clientId)?.name}</span>
                    </td>
                    <td>{e ? `${e.location.split(",").at(-1)?.trim()}, ${co(e.county)}` : "-"}</td>
                    {decided ? (
                      <td>{q.respondedAt ? dShort(q.respondedAt.slice(0, 10)) : "-"}</td>
                    ) : (
                      <td>
                        {q.tender ? dShort(q.tender.returnBy) : "-"}
                        <Badge tone={returnTone(q, day)} className="mt-0.5 block w-fit">
                          {returnWords(q, day)}
                        </Badge>
                      </td>
                    )}
                    {access.seeValues && <td className="num">{money0(quoteTotal(q.lines), region)}</td>}
                    {access.seeMargins && <MarginCell m={estMargin(q)} />}
                    {decided ? (
                      <td>
                        {q.status === "Declined" ? (
                          <span className="text-muted">Declined</span>
                        ) : p ? (
                          <Link to={`/projects/${p.code}`} className="text-accent-ink underline-offset-2 hover:underline">
                            {p.code} {p.status}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                    ) : (
                      <>
                        <td className={cx(subs.missing.length && list === "pricing" ? "text-warn" : "text-muted")}>{subs.asked ? `${subs.back} of ${subs.asked} back${subs.missing.length && list === "pricing" ? `, ${subs.missing.length} to pick` : ""}` : "None needed"}</td>
                        <td className={cx(checksDone(q) === TENDER_CHECKS.length ? "text-ok" : "text-muted")}>
                          {checksDone(q)} of {TENDER_CHECKS.length}
                        </td>
                      </>
                    )}
                    <td>
                      <QuoteBadge status={q.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    );
  }
}


/** Sales, Confirmed: tenders won that are not yet live projects, with their start dates. */
export function Confirmed() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const { confirmed, confirmedValue } = pipeline(db.quotes, db.projects);
  const [setting, setSetting] = useState<Project | null>(null);
  const wonLately = db.quotes.filter((q) => q.status === "Accepted" && q.respondedAt && daysBetween(q.respondedAt.slice(0, 10), day) <= 60).length;
  return (
    <>
      <PageHead
        title="Confirmed"
        note={`${plural(confirmed.length, "order")} confirmed and not started yet${access.seeValues ? `, ${money0(confirmedValue, region)} before VAT` : ""}. ${plural(wonLately, "tender")} won in the last 60 days in all; the rest are live projects now. A job that skipped the tender stage is added in Projects, Not started, and counts here marked "No tender".`}
      />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-4">
        <Panel className="overflow-x-auto">
          {confirmed.length === 0 ? (
            <Empty title="Nothing confirmed and waiting to start">A tender recorded as won becomes a project here until its first day on site. A job with no tender is added in Projects, Not started.</Empty>
          ) : (
            <table className="tbl" aria-label="Confirmed orders">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>From tender</th>
                  <th>Purchase order</th>
                  {access.seeValues && <th className="num">Value</th>}
                  {access.seeMargins && <th className="num">Est. margin</th>}
                  <th>Starts</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.map((p) => {
                  const q = db.quotes.find((x) => x.id === p.quoteId);
                  const days = daysBetween(day, p.startDate);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/projects/${p.code}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                          {p.code} {p.name}
                        </Link>
                        <span className="block text-[0.87rem] text-muted">
                          {p.location}, {co(p.county)}
                        </span>
                      </td>
                      <td>{db.clients.find((c) => c.id === p.clientId)?.name}</td>
                      <td>{q ? <Link to={`/sales/quotes/${q.ref}`} className="text-accent-ink underline-offset-2 hover:underline">{q.ref}</Link> : <Badge>No tender</Badge>}</td>
                      <td>{q?.poNumber ?? p.orderRef ?? "To follow"}</td>
                      {access.seeValues && <td className="num">{p.value != null ? money0(p.value, region) : "-"}</td>}
                      {access.seeMargins &&
                        (q ? (
                          <MarginCell m={projectEstMargin(p, db.quotes)} note="From the tender" />
                        ) : (
                          <td className="num">
                            {p.estMargin != null ? <span className={cx(marginFlag(p.estMargin) === "loss" ? "text-bad" : marginFlag(p.estMargin) === "thin" ? "text-warn" : "")}>{pct1(p.estMargin)}</span> : <span className="text-muted">Not given</span>}
                            {access.may("manageProjects") && (
                              <button type="button" onClick={() => setSetting(p)} className="mt-0.5 block w-full text-right text-[0.87rem] font-medium text-accent-ink underline-offset-2 hover:underline">
                                {p.estMargin != null ? "Change" : "Set margin"}
                              </button>
                            )}
                          </td>
                        ))}
                      <td>
                        {dFull(p.startDate)}
                        <span className="block text-[0.87rem] text-muted">{days > 0 ? `In ${plural(days, "day")}` : days === 0 ? "Today" : "Due to have started"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {setting && <SetMarginDialog project={setting} onClose={() => setSetting(null)} />}
    </>
  );
}

/**
 * Sales, Pipeline (Jimmy's template): the value of the tendered works and the list, and the value
 * of the confirmed orders and the list. Bars rather than text up top, as he asked.
 */
export function Pipeline() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const pl = pipeline(db.quotes, db.projects);
  const win = tenderWinRate(db.quotes, day);
  const m = (n: number) => (access.seeValues ? money0(n, region) : "");
  const biggest = Math.max(pl.tenderedValue, pl.confirmedValue, pl.pricingValue, 1);
  const bars = [
    { label: "Being priced", value: pl.pricingValue, n: pl.pricing.length, tone: "bg-line-strong" },
    { label: "Tendered, waiting for an answer", value: pl.tenderedValue, n: pl.tendered.length, tone: "bg-accent" },
    { label: "Confirmed, not started", value: pl.confirmedValue, n: pl.confirmed.length, tone: "bg-ok" },
  ];
  return (
    <>
      <PageHead title="Pipeline" note={`Work tendered and waiting for an answer, and work confirmed and waiting to start. ${win.won} of the ${win.decided} tenders decided in the last 12 months were won (${win.pct}%).`} />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-5">
        <Panel className="px-4 py-3">
          <ul className="grid gap-3" aria-label="Pipeline by stage">
            {bars.map((b) => (
              <li key={b.label} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[16rem_minmax(0,1fr)_8rem]">
                <span className="font-medium">
                  {b.label} <span className="font-normal text-muted">({b.n})</span>
                </span>
                <span className="h-4 overflow-hidden rounded-full bg-line" role="img" aria-label={`${b.label}: ${access.seeValues ? m(b.value) : plural(b.n, "tender")}`}>
                  <span className={cx("block h-full", b.tone)} style={{ width: `${access.seeValues ? (b.value / biggest) * 100 : (b.n / Math.max(1, ...bars.map((x) => x.n))) * 100}%` }} />
                </span>
                <span className="text-right font-display text-[1.15rem] font-semibold tabular-nums">{access.seeValues ? m(b.value) : b.n}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="grid gap-5 lg:grid-cols-2">
          <Section title={`Tendered works${access.seeValues ? `, ${m(pl.tenderedValue)}` : ""}`}>
            <Panel>
              <ul className="divide-y divide-line" aria-label="Tendered works">
                {pl.tendered.length === 0 && <li className="px-4 py-2 text-muted">Nothing out with a client.</li>}
                {pl.tendered.map(({ q, value }) => (
                  <li key={q.id}>
                    <Link to={`/sales/quotes/${q.ref}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 hover:bg-accent-soft">
                      <span className="min-w-0 flex-1 basis-52">
                        <span className="font-medium">{q.ref}</span> {q.title.split(":")[0]}
                        <span className="block text-[0.87rem] text-muted">
                          {db.clients.find((c) => c.id === q.clientId)?.name}, out {q.sentAt ? plural(daysBetween(q.sentAt.slice(0, 10), day), "day") : ""}
                        </span>
                      </span>
                      <QuoteBadge status={q.status} />
                      {access.seeMargins && <MarginSpan m={estMargin(q)} />}
                      {access.seeValues && <span className="w-24 text-right tabular-nums">{m(value)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
          <Section title={`Confirmed orders${access.seeValues ? `, ${m(pl.confirmedValue)}` : ""}`}>
            <Panel>
              <ul className="divide-y divide-line" aria-label="Confirmed orders">
                {pl.confirmed.length === 0 && <li className="px-4 py-2 text-muted">Nothing confirmed and waiting to start.</li>}
                {pl.confirmed.map((p) => (
                  <li key={p.id}>
                    <Link to={`/projects/${p.code}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 hover:bg-accent-soft">
                      <span className="min-w-0 flex-1 basis-52">
                        <span className="font-medium">{p.code}</span> {p.name}
                        <span className="block text-[0.87rem] text-muted">
                          {db.clients.find((c) => c.id === p.clientId)?.name}, starts {dShort(p.startDate)}
                          {!p.quoteId && ", no tender"}
                        </span>
                      </span>
                      {access.seeMargins && <MarginSpan m={projectEstMargin(p, db.quotes)} />}
                      {access.seeValues && <span className="w-24 text-right tabular-nums">{p.value != null ? m(p.value) : "-"}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        </div>
        {pl.pricing.length > 0 && (
          <Section title={`Being priced${access.seeValues ? `, ${m(pl.pricingValue)} so far` : ""}`}>
            <Panel>
              <ul className="divide-y divide-line" aria-label="Tenders being priced">
                {pl.pricing.map(({ q, value }) => (
                  <li key={q.id}>
                    <Link to={`/sales/quotes/${q.ref}`} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2 hover:bg-accent-soft">
                      <span className="min-w-0 flex-1 basis-52">
                        <span className="font-medium">{q.ref}</span> {q.title.split(":")[0]}
                      </span>
                      <Badge tone={returnTone(q, day)}>{returnWords(q, day)}</Badge>
                      {access.seeMargins && <MarginSpan m={estMargin(q)} />}
                      {access.seeValues && <span className="w-24 text-right tabular-nums">{m(value)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        )}
      </PageBody>
    </>
  );
}

/** The Pipeline's lists: the estimated margin beside the value, "est." so it is not taken for the actual. */
function MarginSpan({ m }: { m: number | null }) {
  const flag = marginFlag(m);
  return (
    <span className={cx("w-24 text-right text-[0.93rem] tabular-nums", m == null ? "text-muted" : flag === "loss" ? "text-bad" : flag === "thin" ? "text-warn" : "text-muted")} title="Estimated margin">
      {m == null ? "No est." : `${pct1(m)} est.`}
    </span>
  );
}

/** A job with no tender: its estimated margin typed in, changed or taken away (21 Nov). */
function SetMarginDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const [v, setV] = useState<number | null>(project.estMargin ?? null);
  const problem = v != null && (v < -100 || v >= 100) ? "A margin is between -100% and 100%." : null;
  return (
    <Dialog open
      title={`Estimated margin, ${project.code}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!!problem}
            onClick={() => {
              setEstMargin(project.id, v);
              toast(v == null ? `${project.code}: estimated margin taken away` : `${project.code}: estimated margin ${pct1(v)}`);
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <p className="mb-3 text-muted">{project.name} came in without a tender, so its margin is what you expect it to make. It is optional: leave the box empty for none.</p>
      <Field label="Estimated margin %" hint={problem ?? "As a percentage of the contract value, for example 22.5"}>{(id) => <OptionalNumInput id={id} value={v} onChange={setV} className="w-32" placeholder="Not given" />}</Field>
      <NextStep>It shows in Confirmed and the Pipeline. Once the job is finished, the actual margin from Job costs is set beside it on the customer's line in Customers.</NextStep>
    </Dialog>
  );
}
