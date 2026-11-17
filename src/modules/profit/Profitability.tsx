import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { jobInvoices } from "@/data/figures";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { profitState, profitTotals, type SiteProfit, siteProfit, THIN_PROFIT_PCT } from "@/lib/profitability";
import { scopePercent } from "@/lib/project-costs";
import { Badge, Button, cx, Dialog, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

const h = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE"));
const pct = (n: number | null) => (n == null ? "-" : `${n.toLocaleString("en-IE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

/**
 * Profitability by site (Oisin, 17 Nov), for the managing director alone.
 *
 * Live sites: what each has cost in the firm's own people (wages at basic, time and a half and
 * double time, from the timesheets, and the reimbursements approved for it), against what the
 * job is worth.
 *
 * Finished jobs (round ten): the same, plus the invoices that came in for the job, from
 * subcontractors and from suppliers, and the net profit as an amount and as a share of the
 * contract value. The labour allowed in the quote was taken out everywhere at his word.
 */
export function Profitability() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const [show, setShow] = useState<"live" | "finished">("live");
  const [openId, setOpenId] = useState<string | null>(null);
  const m = (n: number | null) => money0(n, region);
  const finished = show === "finished";
  const sites = db.projects.filter((p) => (finished ? p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed" : p.status === "Live")).sort((a, b) => a.code.localeCompare(b.code));
  const rows = useMemo(
    () =>
      sites.map((p) => {
        const done = p.status === "Live" ? scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id)) : 100;
        return { p, done, ...siteProfit(p, db.attendance, db.people, db.expenses, jobInvoices(db, p)) };
      }),
    [db.attendance, db.people, db.expenses, db.supplierInvoices, db.scopeTasks, sites.map((p) => p.id).join()],
  );
  // What each person costs is the managing director's to see, and nobody else's (17 Nov).
  if (access.role !== "md") return <Navigate to={access.home} replace />;
  const total = profitTotals(rows);
  const lost = rows.filter((r) => profitState(r.netPct) === "loss");
  const thin = rows.filter((r) => profitState(r.netPct) === "thin");
  const open = rows.find((r) => r.p.id === openId);
  const siteCell = (r: (typeof rows)[number]) => (
    <td>
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
      <span className="block text-[0.87rem] text-muted">
        basic {m(w.basic)}
        {w.timeAndHalf > 0 && `, x1.5 ${m(w.timeAndHalf)}`}
        {w.double > 0 && `, x2 ${m(w.double)}`}
      </span>
    </td>
  );
  const top = "border-t border-line-strong";
  return (
    <>
      <PageHead
        title="Profitability"
        note={
          finished
            ? `Finished jobs, to ${dShort(day)}: ${m(total.value)} of work, ${m(total.costs)} in costs, ${m(total.netProfit)} net profit (${pct(total.netPct)}).`
            : `Live sites, to ${dShort(day)}: ${m(total.wages)} in wages and ${m(total.reimbursements)} in reimbursements. Overtime is ${total.overtimeShare}% of the wage bill, and cost ${m(total.premium)} more than the same hours at the basic rate.`
        }
        actions={<Segmented label="Which sites" value={show} onChange={setShow} options={[{ value: "live", label: "Live sites" }, { value: "finished", label: "Finished" }]} />}
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
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={finished ? "No finished jobs" : "No live sites"}>Wages show here once a site has timesheets.</Empty>
          ) : finished ? (
            <table className="tbl" aria-label="Net profit by finished job">
              <thead>
                <tr>
                  <th>Job</th>
                  <th className="num">Contract value</th>
                  <th className="num">Wages</th>
                  <th className="num">Reimbursements</th>
                  <th className="num">Subcontractor invoices</th>
                  <th className="num">Supplier invoices</th>
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
                      <td className="num">{r.subcontractors > 0 ? m(r.subcontractors) : "-"}</td>
                      <td className="num">{r.suppliers > 0 ? m(r.suppliers) : "-"}</td>
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
                  <td className={cx("num", top)}>{m(total.subcontractors)}</td>
                  <td className={cx("num", top)}>{m(total.suppliers)}</td>
                  <td className={cx("num font-medium", top)}>{m(total.netProfit)}</td>
                  <td className={cx("num font-medium", top)}>{pct(total.netPct)}</td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <table className="tbl" aria-label="Employee outgoings by site">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Wages</th>
                  <th className="num">Reimbursements</th>
                  <th className="num">Outgoings for employees</th>
                  <th className="num">Contract value</th>
                  <th className="num">Left after employees</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.p.id}>
                    {siteCell(r)}
                    {wagesCell(r.wages)}
                    <td className="num">{r.reimbursements > 0 ? money2(r.reimbursements, region) : "-"}</td>
                    <td className="num font-medium">{m(r.outgoings)}</td>
                    <td className="num">
                      {m(r.value)}
                      {r.shareOfValue != null && <span className="block text-[0.87rem] text-muted">wages are {r.shareOfValue}% of it</span>}
                    </td>
                    <td className={cx("num font-medium", r.left != null && r.left < 0 && "text-bad")}>{m(r.left)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={cx(top, "font-medium")}>All sites shown</td>
                  {wagesCell({ total: total.wages, basic: total.basic, timeAndHalf: total.timeAndHalf, double: total.double }, top)}
                  <td className={cx("num", top)}>{total.reimbursements > 0 ? money2(total.reimbursements, region) : "-"}</td>
                  <td className={cx("num font-medium", top)}>{m(total.outgoings)}</td>
                  <td className={cx("num", top)}>{m(total.value)}</td>
                  <td className={cx("num font-medium", top)}>{m(total.left)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        {finished ? (
          <p className="max-w-[90ch] text-[0.93rem] text-muted">
            Net profit is the contract value, agreed extras included, less everything the job cost: wages, reimbursements, subcontractor invoices and supplier invoices. The percentage is that as a share of the contract value. Wages are the hours on the timesheets at each person's hourly rate.
            The invoices are the ones checked and posted to the job: subcontractors apart, and under suppliers everything else, materials, plant hire, carriage and the rest. Heading by heading they are on{" "}
            <Link to="/profit/costs" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Job costs
            </Link>
            . Click a job's code to see who its wages went to.
          </p>
        ) : (
          <p className="max-w-[90ch] text-[0.93rem] text-muted">
            Wages are the hours on the timesheets at each person's hourly rate: a normal day on the 39 hour week (8 hours, 7 on a Friday), time and a half hours at one and a half times the rate, and double time hours at twice it. Work on a Saturday, a Sunday or a bank holiday is all at an overtime rate.
            Reimbursements are the ones the director has approved for the site. "Left after employees" is the contract value less those two only. Subcontractor and supplier invoices, and the net profit, are shown once a job is finished, under Finished; while a site is live they are on{" "}
            <Link to="/profit/costs" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Job costs
            </Link>
            . Click a site code to see who its wages went to.
          </p>
        )}
      </PageBody>
      {open && <SiteDialog row={open} finished={finished} region={region} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** One site's outgoings person by person: rate, days, hours at each rate, wages and reimbursements. */
function SiteDialog({ row, finished, region, onClose }: { row: SiteProfit & { p: Project; done: number }; finished: boolean; region: "IE" | "UK"; onClose: () => void }) {
  const m2 = (n: number) => money2(n, region);
  const w = row.wages;
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${row.p.code} ${row.p.name}: ${finished ? "what the job cost" : "outgoings for employees"}`}
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
        {finished && (
          <Section title="What the job cost">
            <ul className="grid gap-1 text-[0.93rem] sm:grid-cols-2" aria-label="What the job cost">
              <li>
                Contract value: <span className="font-medium">{row.value == null ? "-" : m2(row.value)}</span>
              </li>
              <li>
                Wages: <span className="font-medium">{m2(w.total)}</span>
              </li>
              <li>
                Reimbursements: <span className="font-medium">{m2(row.reimbursements)}</span>
              </li>
              <li>
                Subcontractor invoices: <span className="font-medium">{m2(row.subcontractors)}</span>
              </li>
              <li>
                Supplier invoices: <span className="font-medium">{m2(row.suppliers)}</span>
              </li>
              <li>
                Net profit: <span className={cx("font-medium", row.netProfit != null && row.netProfit < 0 && "text-bad")}>{row.netProfit == null ? "-" : m2(row.netProfit)}</span> <span className="text-muted">({pct(row.netPct)} of the contract value)</span>
              </li>
            </ul>
          </Section>
        )}
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
