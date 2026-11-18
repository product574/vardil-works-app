import { Link } from "react-router-dom";
import { plural } from "@/lib/format";
import { money0, pct1 } from "@/lib/money";
import { projectCosts } from "@/data/figures";
import { cx, Empty, PageBody, PageHead, Panel } from "@/ui";
import { useInv } from "./shared";

// Job costs. Client invoices are in ClientInvoices.tsx and InvoicePage.tsx, supplier and
// subcontractor invoices in Purchases.tsx, the Sage export in SageExport.tsx.

/** Cost against value for every job that is running or just finished. */
export function JobCosts() {
  const { db, region, access } = useInv();
  if (!access.seeMargins)
    return (
      <>
        <PageHead title="Job costs" />
        <PageBody>
          <Panel className="max-w-3xl">
            <Empty title="Costs and margins are switched off for you">The managing director can switch them on under Admin, Roles and access.</Empty>
          </Panel>
        </PageBody>
      </>
    );
  const rows = access
    .scope(db.projects)
    .filter((p) => p.status === "Live" || p.status === "Complete")
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((p) => ({ p, ...projectCosts(db, p) }));
  const total = (k: "labour" | "plant" | "material" | "other" | "cost") => rows.reduce((s, r) => s + r[k], 0);
  return (
    <>
      <PageHead title="Job costs" note="Labour comes from the timesheets at each person's rate, everything else from supplier and subcontractor invoices once they are approved. Margin so far compares cost with the value of the work done." />
      <PageBody>
        <Panel className="max-w-[88rem] overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Contract value</th>
                <th className="num">Done</th>
                <th className="num">Labour</th>
                <th className="num">Plant and hire</th>
                <th className="num">Materials</th>
                <th className="num">Subcontract and other</th>
                <th className="num">Cost to date</th>
                <th className="num">Margin so far</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, labour, plant, material, other, cost, pct, margin, waiting }) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/projects/${p.code}?tab=costs`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                      {p.code}
                    </Link>{" "}
                    {p.name}
                    {waiting > 0 && (
                      <span className="block text-[0.87rem] text-warn">
                        {plural(waiting, "invoice")} not approved yet
                      </span>
                    )}
                  </td>
                  <td className="num">{money0(p.value, region)}</td>
                  <td className="num">{pct}%</td>
                  <td className="num">{money0(labour, region)}</td>
                  <td className="num">{money0(plant, region)}</td>
                  <td className="num">{money0(material, region)}</td>
                  <td className="num">{money0(other, region)}</td>
                  <td className="num font-medium">{money0(cost, region)}</td>
                  <td className={cx("num font-medium", margin != null && margin < 0 && "text-bad", margin != null && margin >= 0 && margin < 10 && "text-warn")}>{margin == null ? "-" : pct1(margin)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="border-t border-line-strong font-medium">All jobs shown</td>
                <td className="num border-t border-line-strong">{money0(rows.reduce((s, r) => s + (r.p.value ?? 0), 0), region)}</td>
                <td className="border-t border-line-strong" />
                <td className="num border-t border-line-strong">{money0(total("labour"), region)}</td>
                <td className="num border-t border-line-strong">{money0(total("plant"), region)}</td>
                <td className="num border-t border-line-strong">{money0(total("material"), region)}</td>
                <td className="num border-t border-line-strong">{money0(total("other"), region)}</td>
                <td className="num border-t border-line-strong font-medium">{money0(total("cost"), region)}</td>
                <td className="border-t border-line-strong" />
              </tr>
            </tfoot>
          </table>
        </Panel>
      </PageBody>
    </>
  );
}
