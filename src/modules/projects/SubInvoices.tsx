import { useState } from "react";
import { Link } from "react-router-dom";
import type { Project, Subcontractor, SupplierInvoice } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { money2 } from "@/lib/money";
import { partyOf, payBy, purchaseStage, recently } from "@/lib/purchases";
import { Button, cx, Empty, PageBody, PageHead, Panel, Section, Segmented, Tel } from "@/ui";
import { ApproveDialog, CopyLink, PurchaseBadge, SendBackDialog, usePurchases } from "@/modules/invoicing/purchase-shared";

/**
 * What the subcontractors on someone's sites have invoiced. A site manager sees the sites
 * they run and approves an invoice once the work is done as invoiced; it then goes into the
 * job's costs and on to accounts to be paid. Each site is listed with its subcontractors one
 * under the other, since several share a site.
 */
export function SubcontractorInvoicesForSites() {
  const { db, day, region, access, canApprove, waitsFor } = usePurchases();
  const [show, setShow] = useState<"waiting" | "all">("waiting");
  const [box, setBox] = useState<{ s: SupplierInvoice; what: "approve" | "back" } | null>(null);
  const sites = access.scope(db.projects);
  const mineIds = new Set(sites.map((p) => p.id));
  const all = db.supplierInvoices.filter((s) => partyOf(s) === "subcontractor" && s.allocations.some((a) => mineIds.has(a.projectId)));
  const waiting = all.filter((s) => purchaseStage(s) === "approve");
  // "Everything" is what is still moving, and what was paid in the last two months.
  const current = all.filter((s) => purchaseStage(s) !== "paid" || recently(s.paidOn, day, 60));
  const shown = show === "waiting" ? waiting : current;
  const yours = waiting.filter(canApprove).length;
  const onSite = (p: Project) => shown.filter((s) => s.allocations.some((a) => a.projectId === p.id));
  const withRows = sites.filter((p) => onSite(p).length > 0).sort((a, b) => b.code.localeCompare(a.code));
  const subsOf = (rows: SupplierInvoice[]) => [...new Set(rows.map((s) => s.subcontractorId))].map((id) => db.subcontractors.find((x) => x.id === id)).filter((x): x is Subcontractor => !!x).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHead
        title="Subcontractor invoices"
        note={`${plural(waiting.length, "invoice")} from subcontractors waiting for approval on ${access.allProjects ? "the sites" : "your sites"}${yours > 0 ? `, ${yours} of them yours to approve` : ""}. Approve one when the work has been done as invoiced: it goes into the job's costs and on to accounts to be paid. Send it back, with the reason, when it has not.`}
      />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-5">
        <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
          <Segmented
            label="Invoices shown"
            value={show}
            onChange={setShow}
            options={[
              { value: "waiting", label: "Waiting for approval", count: waiting.length },
              { value: "all", label: "Everything on these sites", count: current.length },
            ]}
          />
        </div>
        {withRows.length === 0 && (
          <Panel>
            <Empty title={show === "waiting" ? "Nothing is waiting for approval" : "No subcontractor invoices on these sites yet"}>A subcontractor sends an invoice in through their portal, and it appears here for the site it is for.</Empty>
          </Panel>
        )}
        {withRows.map((p) => {
          const rows = onSite(p);
          const subs = subsOf(rows);
          return (
            <Section
              key={p.id}
              title={
                <Link to={`/projects/${p.code}`} className="underline-offset-2 hover:underline">
                  {p.code} {p.name}
                </Link>
              }
              aside={plural(subs.length, "subcontractor")}
            >
              <Panel className="overflow-x-auto">
                <table className="tbl" aria-label={`Subcontractor invoices for ${p.code}`}>
                  <thead>
                    <tr>
                      <th className="w-[22%]">Invoice</th>
                      <th>What it is for</th>
                      <th className="num">Total with VAT</th>
                      <th>Where it stands</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  {subs.map((sub) => (
                    <tbody key={sub.id} aria-label={`${sub.name} at ${p.code}`}>
                      <tr>
                        <th colSpan={5} scope="rowgroup" className="bg-side text-left font-medium normal-case">
                          {sub.name}
                          <span className="ml-2 font-normal text-muted">
                            {sub.trade}. {sub.contactName}, <Tel number={sub.phone} />
                          </span>
                        </th>
                      </tr>
                      {rows
                        .filter((s) => s.subcontractorId === sub.id)
                        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
                        .map((s) => {
                          const stage = purchaseStage(s);
                          return (
                            <tr key={s.id}>
                              <td>
                                <span className="font-medium">{s.invoiceNo}</span>
                                <span className="block text-[0.87rem] text-muted">
                                  {dShort(s.invoiceDate)}, {s.via === "portal" ? "through the portal" : "by email"}
                                </span>
                                <CopyLink s={s} className="text-[0.87rem]" />
                              </td>
                              <td className="max-w-[26rem]">
                                {s.lines.map((l, n) => (
                                  <span key={n} className="block">
                                    {l.description}
                                    {s.lines.length > 1 && <span className="text-muted">, {money2(l.amount, region)}</span>}
                                  </span>
                                ))}
                              </td>
                              <td className="num font-medium">
                                {money2(s.total, region)}
                                <span className="block text-[0.87rem] font-normal text-muted">{money2(s.subtotal, region)} before VAT</span>
                              </td>
                              <td>
                                <PurchaseBadge s={s} />
                                <span className={cx("mt-1 block max-w-[20rem] text-[0.87rem]", stage === "back" ? "text-bad" : "text-muted")}>
                                  {stage === "approve" && `Waiting for ${waitsFor(s)}`}
                                  {stage === "back" && `${s.sentBack?.by}: ${s.sentBack?.reason}`}
                                  {stage === "check" && "With accounts, being checked"}
                                  {stage === "pay" && `Approved by ${s.confirmedBy}. Accounts pay it by ${dShort(payBy(s))}`}
                                  {stage === "paid" && `Paid ${dShort(s.paidOn)}`}
                                </span>
                              </td>
                              <td className="text-right whitespace-nowrap">
                                {stage === "approve" && canApprove(s) && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <Button size="sm" aria-label={`Send back ${s.invoiceNo}`} onClick={() => setBox({ s, what: "back" })}>
                                      Send back
                                    </Button>
                                    <Button size="sm" aria-label={`Approve ${s.invoiceNo}`} onClick={() => setBox({ s, what: "approve" })}>
                                      Approve
                                    </Button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  ))}
                </table>
              </Panel>
            </Section>
          );
        })}
      </PageBody>
      {box?.what === "approve" && <ApproveDialog s={box.s} onClose={() => setBox(null)} />}
      {box?.what === "back" && <SendBackDialog s={box.s} onClose={() => setBox(null)} />}
    </>
  );
}
