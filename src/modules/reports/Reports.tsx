import { DownloadSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { useData, useDay, usePrefs } from "@/data/store";
import { dFull, dShort, plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { conversionByKind, csvOf, finishedInYear, JOB_SORTS, type JobRow, type JobSort, onTime, overdueFromClients, paidInYear, salesByCustomer, salesInYear, sortJobs, tenderWinRate, topByMargin, totals, whereMoneyGoes, yearStart } from "@/lib/reports";
import { Button, cx, Empty, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";

// Reports (18 Nov): the firm's figures over the last 12 months, from the HVAC reports Oisin
// likes, made for a contractor. Every figure comes from src/lib/reports.ts.

const LINK = "text-accent-ink underline-offset-2 hover:underline";

function useReports() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const period = `Last 12 months: ${dFull(yearStart(day))} to ${dFull(day)}`;
  return { db, day, region, access, period, m: (n: number) => money0(n, region) };
}

/** A report as a spreadsheet file, downloaded straight from the browser. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${name} downloaded`);
}

function CsvButton({ name, head, rows }: { name: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <Button size="sm" onClick={() => download(name, csvOf(head, rows))}>
      <DownloadSimple size={16} /> Export CSV
    </Button>
  );
}

/** One line of a bar chart: what it is, the figure on the right, the bar under, and a line of detail. */
function BarRow({ label, figure, share, detail }: { label: ReactNode; figure: ReactNode; share: number; detail?: ReactNode }) {
  return (
    <li className="px-4 py-2">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="shrink-0 font-medium tabular-nums">{figure}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, share))}%` }} />
      </div>
      {detail && <p className="mt-0.5 text-[0.87rem] text-muted">{detail}</p>}
    </li>
  );
}

/** A report panel: a heading, a link to the full report or a button, and the content. */
function Box({ title, to, action, children, className }: { title: string; to?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Panel className={cx("flex flex-col", className)}>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <h2 className="mr-auto text-[1.08rem]">{title}</h2>
        {action}
        {to && (
          <Link to={to} className={cx("text-[0.93rem] font-medium", LINK)}>
            Open the report
          </Link>
        )}
      </div>
      {children}
    </Panel>
  );
}

/** The figures across the top. Each can link to where it comes from. */
function Tiles({ items }: { items: { label: string; value: string; note: string; tone?: "ok" | "warn" | "bad"; to?: string }[] }) {
  return (
    <Panel className="overflow-hidden">
      {/* Two to a row on a phone (an odd last one takes the whole row), all in one row from tablet width. */}
      <dl aria-label="Key figures" className="grid grid-cols-2 gap-px bg-line md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: items.length }}>
        {items.map((t) => {
          const body = (
            <>
              <dt className="text-[0.87rem] text-muted">{t.label}</dt>
              <dd className={cx("text-[1.35rem] font-medium tabular-nums", t.tone === "ok" && "text-ok", t.tone === "warn" && "text-warn", t.tone === "bad" && "text-bad")}>{t.value}</dd>
              <dd className="text-[0.87rem] text-muted">{t.note}</dd>
            </>
          );
          return (
            <div key={t.label} className="bg-surface max-md:odd:last:col-span-2">
              {t.to ? (
                <Link to={t.to} className="press block px-4 py-3 hover:bg-accent-soft/60">
                  {body}
                </Link>
              ) : (
                <div className="px-4 py-3">{body}</div>
              )}
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}

const pctText = (n: number) => `${n.toFixed(1)}%`;

function NoMargins() {
  return (
    <Panel>
      <Empty title="Costs and margins are switched off for you">The managing director can switch them on under Admin, Roles and access.</Empty>
    </Panel>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

export function ReportsOverview() {
  const { db, day, access, period, m } = useReports();
  const win = tenderWinRate(db.quotes, day);
  const sales = salesInYear(db.salesInvoices, day);
  const paid = paidInYear(db, day);
  const avg = totals(paid);
  const late = overdueFromClients(db.salesInvoices, day);
  const due = onTime(finishedInYear(db, day));
  const customers = salesByCustomer(db, day);
  const top = topByMargin(db, day);
  const money = whereMoneyGoes(db, day);
  const kinds = conversionByKind(db.quotes, day);
  const best = customers[0]?.total ?? 1;
  return (
    <>
      <PageHead title="Reports" note={`${period}. Every figure comes from the records behind it, so it matches the screen it links to.`} />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <Tiles
          items={[
            { label: "Tender win rate", value: pctText(win.pct), note: `${win.won} won of ${win.decided} decided`, to: "/reports/tenders" },
            ...(access.seeMargins ? [{ label: "Average margin, paid jobs", value: pctText(avg.pct), note: `${plural(paid.length, "job")} paid in full`, tone: avg.pct < 10 ? ("warn" as const) : undefined, to: "/reports/margin" }] : []),
            ...(access.seeValues
              ? [
                  { label: "Sales, last 12 months", value: m(sales), note: "Invoiced, before VAT", to: "/reports/customers" },
                  { label: "Overdue from clients", value: m(late.gross), note: `${plural(late.count, "invoice")}, with VAT`, tone: late.count > 0 ? ("bad" as const) : undefined, to: "/invoicing/invoiced?show=overdue" },
                ]
              : []),
            { label: "Jobs finished on time", value: pctText(due.pct), note: `${due.onTime} of ${due.jobs} finished by the planned date`, tone: due.pct < 75 ? ("warn" as const) : ("ok" as const), to: "/reports/margin?sort=finished" },
          ]}
        />
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {access.seeValues && (
            <Box title="Sales by customer (top 6)" to="/reports/customers">
              <ul className="py-1" aria-label="Sales by customer, top 6">
                {customers.slice(0, 6).map((c) => (
                  <BarRow
                    key={c.client.id}
                    label={
                      <Link to={`/customers/${c.client.id}`} className={LINK}>
                        {c.client.name}
                      </Link>
                    }
                    figure={m(c.total)}
                    share={(c.total / best) * 100}
                  />
                ))}
              </ul>
            </Box>
          )}
          {access.seeMargins && (
            <Box title="Most profitable jobs paid in full (top 10)" to="/reports/margin">
              <ProfitTable jobs={top} />
            </Box>
          )}
          {access.seeMargins && (
            <Box title="Where the money goes" action={<span className="text-[0.93rem] text-muted">{m(money.total)} of job costs</span>}>
              <ul className="py-1" aria-label="Where the money goes">
                {money.rows.map((r) => (
                  <BarRow key={r.heading} label={r.heading} figure={`${m(r.amount)} · ${pctText(r.pct)}`} share={r.pct} detail={r.hint} />
                ))}
              </ul>
            </Box>
          )}
          <Box title="Tender win rate by kind of work" to="/reports/tenders">
            <ul className="py-1" aria-label="Tender win rate by kind of work">
              {kinds.slice(0, 6).map((k) => (
                <BarRow key={k.kind} label={k.kind} figure={pctText(k.pct)} share={k.pct} detail={`${k.won} won of ${k.decided} decided`} />
              ))}
            </ul>
          </Box>
        </div>
      </PageBody>
    </>
  );
}

/** Job, price, cost, margin and margin %, for the top 10 on the overview. */
function ProfitTable({ jobs }: { jobs: JobRow[] }) {
  const { m } = useReports();
  if (jobs.length === 0) return <Empty title="No job has been paid in full in the last 12 months" />;
  return (
    <div className="overflow-x-auto">
      <table className="tbl" aria-label="Most profitable jobs paid in full">
        <thead>
          <tr>
            <th>Job</th>
            <th className="num">Price</th>
            <th className="num">Cost</th>
            <th className="num">Margin</th>
            <th className="num">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j.project.id}>
              <td>
                <Link to={`/projects/${j.project.code}?tab=costs`} className={cx("font-medium", LINK)}>
                  {j.project.code}
                </Link>{" "}
                <span className="text-[0.93rem]">{j.project.name}</span>
              </td>
              <td className="num">{m(j.revenue)}</td>
              <td className="num text-muted">{m(j.cost)}</td>
              <td className={cx("num font-medium", j.margin < 0 ? "text-bad" : "text-ok")}>{m(j.margin)}</td>
              <td className="num font-medium">{pctText(j.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sales by customer ─────────────────────────────────────────────────────────

export function SalesByCustomerReport() {
  const { db, day, access, period, m } = useReports();
  const list = salesByCustomer(db, day);
  const total = salesInYear(db.salesInvoices, day);
  const best = list[0]?.total ?? 1;
  return (
    <>
      <PageHead title="Sales by customer" note={`${period}. Client invoices sent in that time, paid or not, before VAT: the sales Sage has. ${plural(list.length, "customer")}, ${access.seeValues ? m(total) : "values hidden"} in all.`} />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-4">
        {!access.seeValues ? (
          <Panel>
            <Empty title="Contract values are switched off for you">The managing director can switch them on under Admin, Roles and access.</Empty>
          </Panel>
        ) : (
          <Box title="Sales by customer" action={<CsvButton name={`sales-by-customer-${day}.csv`} head={["Customer", "Type", "Sales before VAT", "Projects", "Average per project", "Invoices"]} rows={list.map((c) => [c.client.name, c.client.type, c.total.toFixed(2), c.projects, c.average.toFixed(2), c.invoices])} />}>
            {list.length === 0 ? (
              <Empty title="Nothing has been invoiced in the last 12 months" />
            ) : (
              <ul className="py-1" aria-label="Sales by customer">
                {list.map((c) => (
                  <BarRow
                    key={c.client.id}
                    label={
                      <Link to={`/customers/${c.client.id}`} className={LINK}>
                        {c.client.name}
                      </Link>
                    }
                    figure={m(c.total)}
                    share={(c.total / best) * 100}
                    detail={`${plural(c.projects, "project")} · average ${m(c.average)} · ${c.client.type}`}
                  />
                ))}
              </ul>
            )}
          </Box>
        )}
      </PageBody>
    </>
  );
}

// ── Gross margin ──────────────────────────────────────────────────────────────

export function GrossMarginReport() {
  const { db, day, access, period, m } = useReports();
  const [params, setParams] = useSearchParams();
  const sort = (JOB_SORTS.find((s) => s.value === params.get("sort"))?.value ?? "pct") as JobSort;
  const jobs = finishedInYear(db, day);
  const t = totals(jobs);
  const byPct = sortJobs(jobs, "pct");
  const best = byPct[0];
  const weakest = byPct[byPct.length - 1];
  const rows = sortJobs(jobs, sort);
  const late = jobs.filter((j) => j.late).length;
  if (!access.seeMargins)
    return (
      <>
        <PageHead title="Gross margin" />
        <PageBody className="max-w-3xl">
          <NoMargins />
        </PageBody>
      </>
    );
  return (
    <>
      <PageHead title="Gross margin" note={`${period}. Every job finished in that time, invoiced and paid or not. Revenue is the contract value with its agreed extras; cost is the timesheets and the approved supplier and subcontractor invoices, as on Job costs.`} />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <Tiles
          items={[
            { label: "Revenue", value: m(t.revenue), note: `${plural(t.jobs, "job")} finished` },
            { label: "Cost to do them", value: m(t.cost), note: "Labour, materials, subcontractors, plant" },
            { label: "Gross margin", value: `${m(t.margin)} (${pctText(t.pct)})`, note: "Revenue less cost", tone: t.pct >= 15 ? "ok" : "warn" },
            { label: "Losing money", value: String(t.losing), note: t.losing === 0 ? "No job cost more than it earned" : plural(t.losing, "job") + " cost more than it earned", tone: t.losing > 0 ? "bad" : undefined },
          ]}
        />
        {best && weakest && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <JobCard heading="Best margin" j={best} tone="ok" />
            <JobCard heading="Weakest margin" j={weakest} tone="warn" />
          </div>
        )}
        <Box
          title="Margin by job"
          action={
            <>
              <label className="flex items-center gap-2 text-[0.93rem]">
                <span className="text-muted">Sort</span>
                <select aria-label="Sort jobs by" className="field h-8 w-auto" value={sort} onChange={(e) => setParams(e.target.value === "pct" ? {} : { sort: e.target.value }, { replace: true })}>
                  {JOB_SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <CsvButton name={`gross-margin-by-job-${day}.csv`} head={["Job", "Name", "Customer", "Finished", "Planned finish", "Revenue", "Cost", "Margin", "Margin %"]} rows={rows.map((j) => [j.project.code, j.project.name, j.client?.name ?? "", j.finished, j.project.plannedEnd ?? "", j.revenue.toFixed(2), j.cost.toFixed(2), j.margin.toFixed(2), j.pct])} />
            </>
          }
        >
          {rows.length === 0 ? (
            <Empty title="No job has finished in the last 12 months" />
          ) : (
            <div className="overflow-x-auto">
              <table className="tbl" aria-label="Margin by job">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Finished</th>
                    <th className="num">Revenue</th>
                    <th className="num">Cost</th>
                    <th className="num">Margin</th>
                    <th className="num">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((j) => (
                    <tr key={j.project.id}>
                      <td className="min-w-[16rem]">
                        <Link to={`/projects/${j.project.code}?tab=costs`} className={cx("font-medium", LINK)}>
                          {j.project.code} {j.project.name}
                        </Link>
                        <Link to={`/customers/${j.project.clientId}`} className="block text-[0.87rem] text-muted underline-offset-2 hover:text-accent-ink hover:underline">
                          {j.client?.name}
                        </Link>
                        <div className="mt-1 h-1.5 max-w-[14rem] overflow-hidden rounded-full bg-line" aria-hidden>
                          <div className={cx("h-full rounded-full", j.margin < 0 ? "bg-bad" : "bg-ok")} style={{ width: `${Math.max(2, Math.min(100, (j.pct / 35) * 100))}%` }} />
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        {dShort(j.finished)}
                        <span className={cx("block text-[0.87rem]", j.late ? "text-warn" : "text-muted")}>{j.late ? `Late, planned ${dShort(j.project.plannedEnd)}` : "On time"}</span>
                      </td>
                      <td className="num">{m(j.revenue)}</td>
                      <td className="num text-muted">{m(j.cost)}</td>
                      <td className={cx("num font-medium", j.margin < 0 ? "text-bad" : "text-ok")}>{m(j.margin)}</td>
                      <td className="num font-medium">{pctText(j.pct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="border-t border-line-strong font-medium">All {plural(t.jobs, "job")}</td>
                    <td className="border-t border-line-strong text-[0.93rem] text-muted">{late === 0 ? "All on time" : `${late} late`}</td>
                    <td className="num border-t border-line-strong">{m(t.revenue)}</td>
                    <td className="num border-t border-line-strong">{m(t.cost)}</td>
                    <td className="num border-t border-line-strong font-medium">{m(t.margin)}</td>
                    <td className="num border-t border-line-strong font-medium">{pctText(t.pct)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Box>
      </PageBody>
    </>
  );
}

function JobCard({ heading, j, tone }: { heading: string; j: JobRow; tone: "ok" | "warn" }) {
  const { m } = useReports();
  return (
    <Link to={`/projects/${j.project.code}?tab=costs`} className={cx("press block rounded-lg border px-4 py-3", tone === "ok" ? "border-ok/40 bg-ok-soft" : "border-warn/40 bg-warn-soft")}>
      <span className="block text-[0.87rem] text-muted">{heading}</span>
      <span className="block font-medium">
        {j.project.code} {j.project.name}
      </span>
      <span className="block text-[0.93rem]">
        {m(j.margin)} margin on {m(j.revenue)}, {pctText(j.pct)}. {j.client?.name}.
      </span>
    </Link>
  );
}

// ── Tender conversion ─────────────────────────────────────────────────────────

export function TenderConversionReport() {
  const { db, day, access, period, m } = useReports();
  const kinds = conversionByKind(db.quotes, day);
  const all = tenderWinRate(db.quotes, day);
  return (
    <>
      <PageHead title="Tender conversion" note={`${period}. Tenders the client said yes or no to in that time, by the kind of work they priced. Tenders still out count once they are decided.`} />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-4">
        <Box title="Tender win rate by kind of work" action={<CsvButton name={`tender-conversion-${day}.csv`} head={["Kind of work", "Won", "Decided", "Win rate %", "Value won"]} rows={kinds.map((k) => [k.kind, k.won, k.decided, k.pct, k.valueWon.toFixed(2)])} />}>
          {kinds.length === 0 ? (
            <Empty title="No tender has been decided in the last 12 months" />
          ) : (
            <ul className="py-1" aria-label="Tender win rate by kind of work">
              {kinds.map((k) => (
                <BarRow key={k.kind} label={k.kind} figure={pctText(k.pct)} share={k.pct} detail={`${k.won} won of ${k.decided} decided${access.seeValues ? `, ${m(k.valueWon)} won` : ""}`} />
              ))}
            </ul>
          )}
          <p className="border-t border-line px-4 py-2.5 text-[0.93rem] text-muted">
            Overall win rate {pctText(all.pct)}: {all.won} won of {all.decided} decided{access.seeValues ? `, ${m(all.valueWon)} won` : ""}. Each tender is on the{" "}
            <Link to="/sales" className={LINK}>
              Sales board
            </Link>
            .
          </p>
        </Box>
      </PageBody>
    </>
  );
}
