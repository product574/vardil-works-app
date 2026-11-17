import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { labourState, profitTotals, type SiteProfit, siteProfit } from "@/lib/profitability";
import { scopePercent } from "@/lib/project-costs";
import { costBreakdown } from "@/lib/quotes";
import { Badge, Button, cx, Dialog, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";

const h = (n: number) => (n === 0 ? "-" : n.toLocaleString("en-IE"));

/**
 * Profitability by site (Oisin, 17 Nov), for the managing director alone. For each site: what it
 * has cost in the firm's own people (wages at basic, time and a half and double time, from the
 * timesheets, and the reimbursements approved for it), against the labour it was priced with in
 * its quote and against what the job is worth. The invoices for each job link in later, once
 * Invoicing is sorted out; until then they are on Job costs, beside this screen.
 */
export function Profitability() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const [show, setShow] = useState<"live" | "finished">("live");
  const [openId, setOpenId] = useState<string | null>(null);
  const m = (n: number | null) => money0(n, region);
  const sites = db.projects.filter((p) => (show === "live" ? p.status === "Live" : p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed")).sort((a, b) => a.code.localeCompare(b.code));
  const rows = useMemo(
    () =>
      sites.map((p) => {
        const quote = db.quotes.find((q) => q.id === p.quoteId);
        const done = p.status === "Live" ? scopePercent(db.scopeTasks.filter((t) => t.projectId === p.id)) : 100;
        return { p, done, ...siteProfit(p, db.attendance, db.people, db.expenses, quote ? costBreakdown(quote.costing).labour : null) };
      }),
    [db.attendance, db.people, db.expenses, db.quotes, db.scopeTasks, sites.map((p) => p.id).join()],
  );
  // What each person costs is the managing director's to see, and nobody else's (17 Nov).
  if (access.role !== "md") return <Navigate to={access.home} replace />;
  const total = profitTotals(rows);
  const over = rows.filter((r) => labourState(r.usedPct, r.done) === "over");
  const ahead = rows.filter((r) => labourState(r.usedPct, r.done) === "ahead");
  const open = rows.find((r) => r.p.id === openId);
  return (
    <>
      <PageHead
        title="Profitability"
        note={`${show === "live" ? "Live sites" : "Finished jobs"}, to ${dShort(day)}: ${m(total.wages)} in wages and ${m(total.reimbursements)} in reimbursements. Overtime is ${total.overtimeShare}% of the wage bill, and cost ${m(total.premium)} more than the same hours at the basic rate.`}
        actions={<Segmented label="Which sites" value={show} onChange={setShow} options={[{ value: "live", label: "Live sites" }, { value: "finished", label: "Finished" }]} />}
      />
      <PageBody className="grid max-w-[88rem] gap-5">
        {(over.length > 0 || ahead.length > 0) && (
          <div className={cx("rounded-md px-3 py-2.5", over.length > 0 ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")}>
            {over.length > 0 && (
              <p>
                <span className="font-medium">{over.map((r) => r.p.code).join(", ")}</span> {over.length === 1 ? "has" : "have"} spent more on wages than the quote allowed for labour.
              </p>
            )}
            {ahead.length > 0 && (
              <p>
                <span className="font-medium">{ahead.map((r) => r.p.code).join(", ")}</span>: wages are running ahead of the work done, by ten points or more of the labour allowed.
              </p>
            )}
          </div>
        )}
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={show === "live" ? "No live sites" : "No finished jobs"}>Wages show here once a site has timesheets.</Empty>
          ) : (
            <table className="tbl" aria-label="Employee outgoings by site">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Wages</th>
                  <th className="num">Reimbursements</th>
                  <th className="num">Outgoings for employees</th>
                  <th className="num">Labour allowed in the quote</th>
                  <th className="num">Contract value</th>
                  <th className="num">Left after employees</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const state = labourState(r.usedPct, r.done);
                  return (
                    <tr key={r.p.id}>
                      <td>
                        <button type="button" className="press text-left font-medium text-accent-ink underline-offset-2 hover:underline" aria-label={`${r.p.code} ${r.p.name}: see who the wages went to`} onClick={() => setOpenId(r.p.id)}>
                          {r.p.code}
                        </button>{" "}
                        {r.p.name}
                        <span className="block text-[0.87rem] text-muted">
                          {r.p.status === "Live" ? `${r.done}% of the work done` : r.p.status}, {plural(r.people.length, "person", "people")}
                        </span>
                      </td>
                      <td className="num">
                        <span className="font-medium">{m(r.wages.total)}</span>
                        <span className="block text-[0.87rem] text-muted">
                          basic {m(r.wages.basic)}
                          {r.wages.timeAndHalf > 0 && `, x1.5 ${m(r.wages.timeAndHalf)}`}
                          {r.wages.double > 0 && `, x2 ${m(r.wages.double)}`}
                        </span>
                      </td>
                      <td className="num">{r.reimbursements > 0 ? money2(r.reimbursements, region) : "-"}</td>
                      <td className="num font-medium">{m(r.outgoings)}</td>
                      <td className="num">
                        {r.allowed == null ? (
                          <span className="text-muted">No quote</span>
                        ) : (
                          <>
                            {m(r.allowed)}
                            <span className={cx("block text-[0.87rem]", state === "over" ? "font-medium text-bad" : state === "ahead" ? "font-medium text-warn" : "text-muted")}>{state === "over" ? `${m(r.over)} over` : `${r.usedPct}% used`}</span>
                          </>
                        )}
                      </td>
                      <td className="num">
                        {m(r.value)}
                        {r.shareOfValue != null && <span className="block text-[0.87rem] text-muted">wages are {r.shareOfValue}% of it</span>}
                      </td>
                      <td className={cx("num font-medium", r.left != null && r.left < 0 && "text-bad")}>{m(r.left)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="border-t border-line-strong font-medium">All sites shown</td>
                  <td className="num border-t border-line-strong">
                    <span className="font-medium">{m(total.wages)}</span>
                    <span className="block text-[0.87rem] text-muted">
                      basic {m(total.basic)}, x1.5 {m(total.timeAndHalf)}, x2 {m(total.double)}
                    </span>
                  </td>
                  <td className="num border-t border-line-strong">{total.reimbursements > 0 ? money2(total.reimbursements, region) : "-"}</td>
                  <td className="num border-t border-line-strong font-medium">{m(total.outgoings)}</td>
                  <td className="num border-t border-line-strong">{m(total.allowed)}</td>
                  <td className="num border-t border-line-strong">{m(total.value)}</td>
                  <td className="num border-t border-line-strong font-medium">{m(total.left)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        <p className="max-w-[90ch] text-[0.93rem] text-muted">
          Wages are the hours on the timesheets at each person's hourly rate: a normal day on the 39 hour week (8 hours, 7 on a Friday), time and a half hours at one and a half times the rate, and double time hours at twice it. Weekend and bank holiday work is all at an overtime rate.
          Reimbursements are the ones the director has approved for the site. "Left after employees" is the contract value less those two only: materials, plant and subcontract invoices are not in it yet. They will link in here once Invoicing is settled, and until then they are on{" "}
          <Link to="/profit/costs" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            Job costs
          </Link>
          . Click a site code to see who its wages went to.
        </p>
      </PageBody>
      {open && <SiteDialog row={open} region={region} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** One site's outgoings person by person: rate, days, hours at each rate, wages and reimbursements. */
function SiteDialog({ row, region, onClose }: { row: SiteProfit & { p: Project; done: number }; region: "IE" | "UK"; onClose: () => void }) {
  const m2 = (n: number) => money2(n, region);
  const w = row.wages;
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${row.p.code} ${row.p.name}: outgoings for employees`}
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
          {row.allowed != null && ` The quote allowed ${m2(row.allowed)} for labour: ${row.usedPct}% used with ${row.done}% of the work done.`}
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
