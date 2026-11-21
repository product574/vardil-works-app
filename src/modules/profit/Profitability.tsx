import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { jobInvoices } from "@/data/figures";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { jobBars, type MoneyIn, moneyIn, profitState, profitTotals, type SiteProfit, siteProfit, THIN_PROFIT_PCT } from "@/lib/profitability";
import { invoiceNo } from "@/lib/billing";
import type { SalesInvoice } from "@/data/types";
import { scopePercent } from "@/lib/project-costs";
import { Badge, Button, cx, Dialog, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

const h = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE"));
const pct = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("en-IE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/**
 * Profitability by site (Oisin, 17 Nov), for the managing director alone. For every site, live
 * or finished: wages (basic, time and a half and double time, from the timesheets), the
 * reimbursements approved for it, and the checked invoices that came in for it under four
 * headings, plant and hire, materials, subcontractors and other (after round ten). Live sites
 * end with what is left of the contract value after all costs so far; finished jobs with the
 * net profit and its percentage. The labour allowed in the quote was taken out at his word.
 */
export function Profitability() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const [show, setShow] = useState<"live" | "finished">("live");
  const [openId, setOpenId] = useState<string | null>(null);
  // Bars first (21 Nov); the table of every column is one press away.
  const [view, setView] = useState<"bars" | "table">("bars");
  const m = (n: number | null) => money0(n, region);
  const finished = show === "finished";
  const sites = db.projects.filter((p) => (finished ? p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed" : p.status === "Live")).sort((a, b) => a.code.localeCompare(b.code));
  const rows = useMemo(
    () =>
      sites.map((p) => {
        const done = p.status === "Live" ? scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id)) : 100;
        return { p, done, inn: moneyIn(p.id, db.salesInvoices), ...siteProfit(p, db.attendance, db.people, db.expenses, jobInvoices(db, p)) };
      }),
    [db.attendance, db.people, db.expenses, db.supplierInvoices, db.salesInvoices, db.scopeTasks, sites.map((p) => p.id).join()],
  );
  // What each person costs is the managing director's to see, and nobody else's (17 Nov).
  if (access.role !== "md") return <Navigate to={access.home} replace />;
  const total = profitTotals(rows);
  const lost = rows.filter((r) => profitState(r.netPct) === "loss");
  const thin = rows.filter((r) => profitState(r.netPct) === "thin");
  const open = rows.find((r) => r.p.id === openId);
  const siteCell = (r: (typeof rows)[number]) => (
    <td className="min-w-[10.5rem]">
      <button type="button" className="press text-left font-medium text-accent-ink underline-offset-2 hover:underline" aria-label={`${r.p.code} ${r.p.name}: see who the wages went to`} onClick={() => setOpenId(r.p.id)}>
        {r.p.code}
      </button>{" "}
      {r.p.name}
      <span className="block text-[0.87rem] text-muted">
        {r.p.status === "Live" ? `${r.done}% of the work done` : r.p.status}, {plural(r.people.length, "person", "people")}
      </span>
    </td>
  );
  const wagesCell = (w: { total: number; basic: number; timeAndHalf: number; double: number }, cls?: string) => (
    <td className={cx("num", cls)}>
      <span className="font-medium">{m(w.total)}</span>
      {/* One rate a line, so the column stays narrow enough for every cost to fit beside it. */}
      <span className="block text-[0.87rem] text-muted">basic {m(w.basic)}</span>
      {w.timeAndHalf > 0 && <span className="block text-[0.87rem] text-muted">x1.5 {m(w.timeAndHalf)}</span>}
      {w.double > 0 && <span className="block text-[0.87rem] text-muted">x2 {m(w.double)}</span>}
    </td>
  );
  const top = "border-t border-line-strong";
  // The four kinds of invoice, in the same order on both tabs (after round ten).
  const invoiceHeads = (
    <>
      <th className="num">Plant and hire</th>
      <th className="num">Materials</th>
      <th className="num">Subcontractors</th>
      <th className="num">Other</th>
    </>
  );
  const invoiceCells = (r: { plantHire: number; materials: number; subcontractors: number; other: number }, cls?: string) => (
    <>
      {[r.plantHire, r.materials, r.subcontractors, r.other].map((n, i) => (
        <td key={i} className={cx("num", cls)}>
          {n !== 0 ? m(n) : "-"}
        </td>
      ))}
    </>
  );
  return (
    <>
      <PageHead
        title="Profitability"
        note={
          finished
            ? `Finished jobs, to ${dShort(day)}: ${m(total.value)} of work, ${m(total.costs)} in costs, ${m(total.netProfit)} net profit (${pct(total.netPct)}).`
            : `Live sites, to ${dShort(day)}: ${m(total.costs)} in costs so far, ${m(total.wages)} of it wages. Overtime is ${total.overtimeShare}% of the wage bill, and cost ${m(total.premium)} more than the same hours at the basic rate.`
        }
        actions={
          <>
            <Segmented label="Shown as" value={view} onChange={setView} options={[{ value: "bars", label: "Bars" }, { value: "table", label: "Table" }]} />
            <Segmented label="Which sites" value={show} onChange={setShow} options={[{ value: "live", label: "Live sites" }, { value: "finished", label: "Finished" }]} />
          </>
        }
      />
      <PageBody className="grid max-w-[88rem] gap-5">
        {finished && (lost.length > 0 || thin.length > 0) && (
          <div className={cx("rounded-md px-3 py-2.5", lost.length > 0 ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")} role="note" aria-label="Jobs to look at">
            {lost.length > 0 && (
              <p>
                <span className="font-medium">{lost.map((r) => r.p.code).join(", ")}</span> made a loss: {lost.length === 1 ? "it" : "they"} cost more than the contract value.
              </p>
            )}
            {thin.length > 0 && (
              <p>
                <span className="font-medium">{thin.map((r) => r.p.code).join(", ")}</span>: net profit under {THIN_PROFIT_PCT}% of the contract value.
              </p>
            )}
          </div>
        )}
        {view === "bars" && rows.length > 0 && (
          <>
            <BarKey />
            <ul aria-label="Money in and out by job" className="grid gap-3">
              {rows.map((r) => (
                <li key={r.p.id}>
                  <JobBarRow row={r} m={m} onOpen={() => setOpenId(r.p.id)} />
                </li>
              ))}
            </ul>
          </>
        )}
        <Panel className={cx("overflow-x-auto", view === "bars" && rows.length > 0 && "hidden")}>
          {rows.length === 0 ? (
            <Empty title={finished ? "No finished jobs" : "No live sites"}>Wages show here once a site has timesheets.</Empty>
          ) : finished ? (
            <table className="tbl [&_td]:px-2.5 [&_th]:px-2.5 [&_th]:align-bottom [&_th]:whitespace-normal" aria-label="Net profit by finished job">
              <thead>
                <tr>
                  <th>Job</th>
                  <th className="num">Contract value</th>
                  <th className="num">Wages</th>
                  <th className="num">Reimbursements</th>
                  {invoiceHeads}
                  <th className="num">Net profit</th>
                  <th className="num">Net profit %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const state = profitState(r.netPct);
                  const tone = state === "loss" ? "text-bad" : state === "thin" ? "text-warn" : "";
                  return (
                    <tr key={r.p.id}>
                      {siteCell(r)}
                      <td className="num">{m(r.value)}</td>
                      {wagesCell(r.wages)}
                      <td className="num">{r.reimbursements > 0 ? money2(r.reimbursements, region) : "-"}</td>
                      {invoiceCells(r)}
                      <td className={cx("num font-medium", tone)}>{m(r.netProfit)}</td>
                      <td className={cx("num font-medium", tone)}>{pct(r.netPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className={cx(top, "font-medium")}>All jobs shown</td>
                  <td className={cx("num", top)}>{m(total.value)}</td>
                  {wagesCell({ total: total.wages, basic: total.basic, timeAndHalf: total.timeAndHalf, double: total.double }, top)}
                  <td className={cx("num", top)}>{total.reimbursements > 0 ? money2(total.reimbursements, region) : "-"}</td>
                  {invoiceCells(total, top)}
                  <td className={cx("num font-medium", top)}>{m(total.netProfit)}</td>
                  <td className={cx("num font-medium", top)}>{pct(total.netPct)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="tbl [&_td]:px-2.5 [&_th]:px-2.5 [&_th]:align-bottom [&_th]:whitespace-normal" aria-label="Costs by live site">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Wages</th>
                  <th className="num">Reimbursements</th>
                  {invoiceHeads}
                  <th className="num">Total costs so far</th>
                  <th className="num">Contract value</th>
                  <th className="num">Left after all costs so far</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id}>
                    {siteCell(r)}
                    {wagesCell(r.wages)}
                    <td className="num">{r.reimbursements > 0 ? money2(r.reimbursements, region) : "-"}</td>
                    {invoiceCells(r)}
                    <td className="num font-medium">{m(r.costs)}</td>
                    <td className="num">
                      {m(r.value)}
                      {r.shareOfValue != null && <span className="block text-[0.87rem] whitespace-normal text-muted">wages {r.shareOfValue}% of it</span>}
                    </td>
                    <td className={cx("num font-medium", r.netProfit != null && r.netProfit < 0 && "text-bad")}>{m(r.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={cx(top, "font-medium")}>All sites shown</td>
                  {wagesCell({ total: total.wages, basic: total.basic, timeAndHalf: total.timeAndHalf, double: total.double }, top)}
                  <td className={cx("num", top)}>{total.reimbursements > 0 ? money2(total.reimbursements, region) : "-"}</td>
                  {invoiceCells(total, top)}
                  <td className={cx("num font-medium", top)}>{m(total.costs)}</td>
                  <td className={cx("num", top)}>{m(total.value)}</td>
                  <td className={cx("num font-medium", top)}>{m(total.netProfit)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        <p className="max-w-[90ch] text-[0.93rem] text-muted">
          {finished
            ? "Net profit is the contract value, agreed extras included, less everything the job cost. The percentage is that as a share of the contract value. "
            : "Left after all costs so far is the contract value, agreed extras included, less everything the site has cost to date. "}
          Wages are the hours on the timesheets at each person's hourly rate: a normal day on the 39 hour week (8 hours, 7 on a Friday), time and a half hours at one and a half times the rate, and double time hours at twice it. Reimbursements are the ones the director has approved for the site.
          The four invoice columns are the invoices checked and posted to the job: plant and hire (scaffold, generators and small tools included), materials, subcontractors, and other (carriage and anything else). Plant still on hire, and the firm's own plant, count once an invoice for it is checked. Heading by heading they are on{" "}
          <Link to="/invoicing/costs" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Job costs
          </Link>
          . Money in is what has been invoiced to the client before VAT. Click a {finished ? "job" : "site"} to see its invoices, who its wages went to and what it cost.
        </p>
      </PageBody>
      {open && <SiteDialog row={open} finished={finished} region={region} invoices={db.salesInvoices.filter((i) => i.projectId === open.p.id)} onClose={() => setOpenId(null)} />}
    </>
  );
}

type Row = SiteProfit & { p: Project; done: number; inn: MoneyIn };

/** What the bars mean, once, above the list. */
function BarKey() {
  const sw = "inline-block h-3 w-6 rounded-sm align-middle";
  return (
    <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.87rem] text-muted" aria-label="What the bars show">
      <span>
        <span aria-hidden className={cx(sw, "bg-accent")} /> Paid by the client
      </span>
      <span>
        <span aria-hidden className={cx(sw, "bg-accent/45")} /> Invoiced, not paid yet
      </span>
      <span>
        <span aria-hidden className={cx(sw, "border border-dashed border-accent")} /> Still on the contract
      </span>
      <span>
        <span aria-hidden className={cx(sw, "bg-ink/55")} /> Money out (costs so far)
      </span>
    </p>
  );
}

/**
 * One job as two bars (21 Nov): money in over money out. The whole row is a button that opens
 * the job's detail. The outline on the top bar is the contract value; what is empty inside it is
 * still to invoice.
 */
function JobBarRow({ row, m, onOpen }: { row: Row; m: (n: number | null) => string; onOpen: () => void }) {
  const b = jobBars(row.value, row.inn, row.costs);
  const live = row.p.status === "Live";
  const label = `${row.p.code} ${row.p.name}: ${m(row.inn.invoiced)} in of ${m(row.value)} on the contract, ${m(row.costs)} out. See the detail`;
  return (
    <button type="button" onClick={onOpen} aria-label={label} className="press block w-full rounded-lg border border-line bg-surface px-4 py-3 text-left hover:border-line-strong">
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="font-medium text-accent-ink">{row.p.code}</span>
        <span className="font-medium">{row.p.name}</span>
        <span className="text-[0.87rem] text-muted">{live ? `${row.done}% of the work done` : row.p.status}</span>
        <span className="ml-auto text-[0.93rem] text-muted">
          Contract <span className="font-medium text-ink tabular-nums">{m(row.value)}</span>
        </span>
      </span>
      <span className="mt-2 grid grid-cols-[2.2rem_minmax(0,1fr)_6.5rem] items-center gap-x-2 gap-y-1.5">
        <span className="text-[0.87rem] text-muted">In</span>
        <span className="relative block h-5" data-bar="in">
          {/* The contract as an empty outline; money in fills it from the left. */}
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-sm border border-dashed border-accent" style={{ width: `${b.contract}%` }} data-part="contract" />
          <span aria-hidden className="absolute inset-y-0 left-0 rounded-l-sm bg-accent" style={{ width: `${b.paid}%` }} data-part="paid" />
          <span aria-hidden className="absolute inset-y-0 bg-accent/45" style={{ left: `${b.paid}%`, width: `${b.unpaid}%` }} data-part="unpaid" />
        </span>
        <span className="text-right font-medium tabular-nums">{m(row.inn.invoiced)}</span>
        <span className="text-[0.87rem] text-muted">Out</span>
        <span className="relative block h-5" data-bar="out">
          <span aria-hidden className={cx("absolute inset-y-0 left-0 rounded-sm", b.over ? "bg-bad" : "bg-ink/55")} style={{ width: `${b.out}%` }} data-part="out" />
        </span>
        <span className={cx("text-right font-medium tabular-nums", b.over && "text-bad")}>{m(row.costs)}</span>
      </span>
      <span className="mt-2 flex flex-wrap gap-x-5 gap-y-0.5 text-[0.87rem] text-muted">
        <span>Paid {m(row.inn.paid)}</span>
        <span>Invoiced, not paid {m(row.inn.unpaid)}</span>
        <span>Still to invoice {m(b.toInvoice)}</span>
        {b.over ? (
          <span className="font-medium text-bad">Costs have passed the contract value by {m(row.costs - (row.value ?? 0))}</span>
        ) : b.ahead < 0 ? (
          <span className="font-medium text-warn">Costs are {m(-b.ahead)} ahead of what is invoiced</span>
        ) : (
          <span>
            {live ? "Invoiced less costs so far" : "Net profit"}: <span className="font-medium text-ink">{m(live ? b.ahead : row.netProfit)}</span>
          </span>
        )}
      </span>
    </button>
  );
}

const INVOICE_STATE: Record<SalesInvoice["status"], string> = { "To invoice": "Draft, not sent", Held: "On hold", Invoiced: "Sent, not paid", Paid: "Paid" };

/** One site in detail: money in invoice by invoice, then its outgoings person by person and by heading. */
function SiteDialog({ row, finished, region, invoices, onClose }: { row: Row; finished: boolean; region: "IE" | "UK"; invoices: SalesInvoice[]; onClose: () => void }) {
  const m2 = (n: number) => money2(n, region);
  const w = row.wages;
  const b = jobBars(row.value, row.inn, row.costs);
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${row.p.code} ${row.p.name}: money in and out${finished ? "" : " so far"}`}
      footer={
        <>
          <Link to={`/projects/${row.p.code}?tab=costs`} className="mr-auto text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
            Open the project's costs
          </Link>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Section title="Money in" aside={`${m2(row.inn.invoiced)} invoiced of ${row.value == null ? "no contract value" : m2(row.value)}: ${m2(row.inn.paid)} paid, ${m2(row.inn.unpaid)} not paid yet, ${m2(b.toInvoice)} still to invoice`}>
          <div className="overflow-x-auto rounded-md border border-line">
            {invoices.length === 0 ? (
              <p className="px-3 py-3 text-muted">Nothing has been invoiced on this job yet.</p>
            ) : (
              <table className="tbl" aria-label={`Invoices to the client on ${row.p.code}`}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>For</th>
                    <th className="num">Before VAT</th>
                    <th>Where it stands</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <Link to={`/invoicing/client/${invoiceNo(i)}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                          {invoiceNo(i)}
                        </Link>
                      </td>
                      <td>{i.description}</td>
                      <td className="num">{m2(i.net)}</td>
                      <td>
                        <Badge tone={i.status === "Paid" ? "ok" : i.status === "Invoiced" ? "accent" : i.status === "Held" ? "warn" : "neutral"}>{INVOICE_STATE[i.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>
        <h3 className="font-display text-[1.05rem] font-semibold">Money out</h3>
        <p className="text-muted">
          {m2(w.total)} in wages{row.reimbursements > 0 ? ` and ${m2(row.reimbursements)} in reimbursements` : ""}, {plural(row.people.length, "person", "people")}. Overtime cost {m2(w.premium)} more than the same hours at the basic rate.
        </p>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="tbl" aria-label={`Who the wages on ${row.p.code} went to`}>
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Rate an hour</th>
                <th className="num">Days</th>
                <th className="num">Weekend days</th>
                <th className="num">Basic hours</th>
                <th className="num">Hours x1.5</th>
                <th className="num">Hours x2</th>
                <th className="num">Wages</th>
                <th className="num">Reimbursed</th>
              </tr>
            </thead>
            <tbody>
              {row.people.map((p) => (
                <tr key={p.personId}>
                  <td>
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-[0.87rem] text-muted">{p.trade}</span>
                  </td>
                  <td className="num">{m2(p.hourlyRate)}</td>
                  <td className="num">{h(p.days)}</td>
                  <td className="num">{h(p.restDays)}</td>
                  <td className="num">{h(p.wages.basicHours)}</td>
                  <td className="num">{h(p.wages.timeAndHalfHours)}</td>
                  <td className="num">{h(p.wages.doubleHours)}</td>
                  <td className="num font-medium">{m2(p.wages.total)}</td>
                  <td className="num">{p.reimbursements > 0 ? m2(p.reimbursements) : "-"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="border-t border-line-strong font-medium">
                  Total on {row.p.code}
                </td>
                <td className="num border-t border-line-strong">{h(w.basicHours)}</td>
                <td className="num border-t border-line-strong">{h(w.timeAndHalfHours)}</td>
                <td className="num border-t border-line-strong">{h(w.doubleHours)}</td>
                <td className="num border-t border-line-strong font-medium">{m2(w.total)}</td>
                <td className="num border-t border-line-strong">{row.reimbursements > 0 ? m2(row.reimbursements) : "-"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <Section title={finished ? "What the job cost" : "What it has cost so far"}>
          <ul className="grid gap-1 text-[0.93rem] sm:grid-cols-2" aria-label="What the job cost">
            {(
              [
                ["Contract value", row.value],
                ["Wages", w.total],
                ["Reimbursements", row.reimbursements],
                ["Plant and hire", row.plantHire],
                ["Materials", row.materials],
                ["Subcontractors", row.subcontractors],
                ["Other", row.other],
                ["Costs in all", row.costs],
              ] as [string, number | null][]
            ).map(([label, n]) => (
              <li key={label}>
                {label}: <span className="font-medium">{n == null ? "-" : m2(n)}</span>
              </li>
            ))}
            <li className="sm:col-span-2">
              {finished ? "Net profit" : "Left after all costs so far"}: <span className={cx("font-medium", row.netProfit != null && row.netProfit < 0 && "text-bad")}>{row.netProfit == null ? "-" : m2(row.netProfit)}</span>{" "}
              <span className="text-muted">({pct(row.netPct)} of the contract value)</span>
            </li>
          </ul>
        </Section>
        <Section title="Wages by rate">
          <ul className="grid gap-1 text-[0.93rem] sm:grid-cols-3" aria-label="Wages by rate">
            <li>
              Basic: <span className="font-medium">{m2(w.basic)}</span> <span className="text-muted">for {h(w.basicHours)} hours</span>
            </li>
            <li>
              Time and a half: <span className="font-medium">{m2(w.timeAndHalf)}</span> <span className="text-muted">for {h(w.timeAndHalfHours)} hours</span>
            </li>
            <li>
              Double time: <span className="font-medium">{m2(w.double)}</span> <span className="text-muted">for {h(w.doubleHours)} hours</span>
            </li>
          </ul>
        </Section>
        {row.people.some((p) => p.restDays > 0) && <Badge tone="neutral">Weekend days are Saturdays, Sundays and bank holidays worked: all overtime, no basic hours</Badge>}
      </div>
    </Dialog>
  );
}
