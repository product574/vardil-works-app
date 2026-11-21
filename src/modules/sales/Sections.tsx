import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Quote } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { quoteTotal } from "@/lib/quotes";
import { tenderWinRate } from "@/lib/reports";
import { daysBetween } from "@/lib/status";
import { checksDone, pipeline, returnTone, returnWords, subsState, TENDER_CHECKS, tenderStage, type TenderStage } from "@/lib/tenders";
import { Badge, cx, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
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
  const [show, setShow] = useState<TenderStage>("pricing");
  const recent = (q: Quote) => (q.respondedAt ?? "") >= `${day.slice(0, 4)}` && daysBetween(q.respondedAt!.slice(0, 10), day) <= 90;
  const count = (st: TenderStage) => db.quotes.filter((q) => tenderStage(q) === st && (st === "pricing" || st === "out" || (q.respondedAt && recent(q)))).length;
  const rows = db.quotes
    .filter((q) => tenderStage(q) === show && (show === "pricing" || show === "out" || (q.respondedAt && recent(q))))
    .sort((a, b) => (show === "pricing" ? (a.tender?.returnBy ?? "").localeCompare(b.tender?.returnBy ?? "") : (b.sentAt ?? "").localeCompare(a.sentAt ?? "")));
  const enquiry = (q: Quote) => db.enquiries.find((e) => e.id === q.enquiryId);
  return (
    <>
      <PageHead title="Tenders" note="Every tender being priced or out with a client. Open one for its documents, subcontractors, photos, workings and the checks before it goes." />
      <PageBody className="grid max-w-[90rem] grid-cols-1 gap-4">
        <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
          <Segmented
            label="Tenders shown"
            value={show}
            onChange={setShow}
            options={[
              { value: "pricing", label: "Being priced", count: count("pricing") },
              { value: "out", label: "With the client", count: count("out") },
              { value: "won", label: "Won, last 90 days", count: count("won") },
              { value: "lost", label: "Lost, last 90 days", count: count("lost") },
            ]}
          />
        </div>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No tenders here">{show === "pricing" ? "Price an enquiry from Enquiries to start a tender." : "Nothing in the last 90 days."}</Empty>
          ) : (
            <table className="tbl" aria-label="Tenders">
              <thead>
                <tr>
                  <th>Tender</th>
                  <th>Location</th>
                  <th>Return date</th>
                  {access.seeValues && <th className="num">Value</th>}
                  <th>Subcontractors</th>
                  <th>Checks</th>
                  <th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => {
                  const e = enquiry(q);
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
                      <td>
                        {q.tender ? dShort(q.tender.returnBy) : "-"}
                        <Badge tone={returnTone(q, day)} className="mt-0.5 block w-fit">
                          {returnWords(q, day)}
                        </Badge>
                      </td>
                      {access.seeValues && <td className="num">{money0(quoteTotal(q.lines), region)}</td>}
                      <td className={cx(subs.missing.length && tenderStage(q) === "pricing" ? "text-warn" : "text-muted")}>{subs.asked ? `${subs.back} of ${subs.asked} back${subs.missing.length && tenderStage(q) === "pricing" ? `, ${subs.missing.length} to pick` : ""}` : "None needed"}</td>
                      <td className={cx(checksDone(q) === TENDER_CHECKS.length ? "text-ok" : "text-muted")}>
                        {checksDone(q)} of {TENDER_CHECKS.length}
                      </td>
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
      </PageBody>
    </>
  );
}

/** Sales, Confirmed: tenders won that are not yet live projects, with their start dates. */
export function Confirmed() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const { confirmed, confirmedValue } = pipeline(db.quotes, db.projects);
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
