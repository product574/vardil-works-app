import { useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { unmarkInvoicePaid, unmarkPurchasePaid } from "@/data/actions";
import { useDay, usePrefs } from "@/data/store";
import type { Db, Project, SalesInvoice, SupplierInvoice } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { dShort } from "@/lib/format";
import { STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/invoices";
import { money2 } from "@/lib/money";
import { partyOf, purchaseStage } from "@/lib/purchases";
import { PaidDialog, PurchaseBadge } from "@/modules/invoicing/purchase-shared";
import { ClientPaidDialog, PaidSwitch } from "@/modules/invoicing/shared";
import type { PaidShown } from "@/lib/claims";
import { Badge, Button, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

const LINK = "font-medium text-accent-ink underline-offset-2 hover:underline";

/**
 * A job's invoices on its own Costs tab (Oisin, 21 Nov): money in (what has been invoiced to the
 * client) and money out (what suppliers and subcontractors have invoiced against it), each marked
 * Paid or Not paid. Whoever handles invoices marks one paid right here, with the same confirm box
 * and Undo as in Finance, so the two places cannot disagree.
 */
export function JobInvoices({ p, db }: { p: Project; db: Db }) {
  const access = useAccess();
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const [shown, setShown] = useState<PaidShown>("all");
  const [payingIn, setPayingIn] = useState<SalesInvoice | null>(null);
  const [payingOut, setPayingOut] = useState<SupplierInvoice | null>(null);
  const may = access.may("manageInvoices");
  const m = (n: number) => money2(n, region);
  const allIn = db.salesInvoices.filter((i) => i.projectId === p.id).sort((a, b) => (a.issuedOn ?? "9999").localeCompare(b.issuedOn ?? "9999"));
  const allOut = db.supplierInvoices.filter((s) => s.allocations.some((a) => a.projectId === p.id)).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  const inShown = (i: SalesInvoice) => shown === "all" || (shown === "paid" ? i.status === "Paid" : i.status === "Invoiced");
  const outShown = (s: SupplierInvoice) => shown === "all" || (shown === "paid" ? purchaseStage(s) === "paid" : purchaseStage(s) !== "paid" && purchaseStage(s) !== "credit");
  const moneyIn = allIn.filter(inShown);
  const moneyOut = allOut.filter(outShown);
  // What of an invoice is charged to this job: one invoice can be split over several.
  const share = (s: SupplierInvoice) => s.allocations.filter((a) => a.projectId === p.id).reduce((sum, a) => sum + a.amount, 0) * (s.docType === "credit_note" ? -1 : 1);
  const counts = {
    unpaid: allIn.filter((i) => i.status === "Invoiced").length + allOut.filter((s) => purchaseStage(s) !== "paid" && purchaseStage(s) !== "credit").length,
    paid: allIn.filter((i) => i.status === "Paid").length + allOut.filter((s) => purchaseStage(s) === "paid").length,
  };
  return (
    <div className="grid gap-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-[1.15rem] font-semibold">Invoices on {p.code}</h2>
        <PaidSwitch value={shown} onChange={setShown} counts={counts} />
      </div>
      <Section title="Money in: invoices to the client" aside={`${allIn.filter((i) => i.status === "Paid").length} of ${allIn.filter((i) => i.status === "Paid" || i.status === "Invoiced").length} sent are paid`}>
        <Panel className="overflow-x-auto">
          {moneyIn.length === 0 ? (
            <p className="px-3 py-3 text-muted">{allIn.length === 0 ? "Nothing has been invoiced to the client on this job yet." : shown === "paid" ? "None paid yet." : "Nothing sent is waiting to be paid."}</p>
          ) : (
            <table className="tbl" aria-label={`Invoices to the client on ${p.code}`}>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>For</th>
                  <th>Sent</th>
                  <th>Due</th>
                  {access.seeValues && <th className="num">Before VAT</th>}
                  <th>Paid</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {moneyIn.map((i) => {
                  const st = stageOf(i, day);
                  const no = invoiceNo(i);
                  return (
                    <tr key={i.id}>
                      <td>
                        {access.can("invoicing") ? (
                          <Link to={`/invoicing/client/${no}`} className={LINK}>
                            {no}
                          </Link>
                        ) : (
                          <span className="font-medium">{no}</span>
                        )}
                      </td>
                      <td>{i.description}</td>
                      <td className="whitespace-nowrap">{i.issuedOn ? dShort(i.issuedOn) : "-"}</td>
                      <td className="whitespace-nowrap">{i.dueOn ? dShort(i.dueOn) : "-"}</td>
                      {access.seeValues && <td className="num">{m(i.net)}</td>}
                      <td>
                        <Badge tone={STAGE_TONE[st]}>{st === "paid" ? `Paid${i.paidOn ? ` ${dShort(i.paidOn)}` : ""}` : st === "sent" || st === "overdue" ? (st === "overdue" ? "Not paid, late" : "Not paid") : STAGE_LABEL[st]}</Badge>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {may && (st === "sent" || st === "overdue") && (
                          <Button size="sm" aria-label={`Mark ${no} paid`} onClick={() => setPayingIn(i)}>
                            Mark paid
                          </Button>
                        )}
                        {may && st === "paid" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Undo paid for ${no}`}
                            onClick={() => {
                              unmarkInvoicePaid(i.id);
                              toast(`${no} is not paid again`);
                            }}
                          >
                            Undo paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </Section>
      <Section title="Money out: invoices from suppliers and subcontractors" aside={`${allOut.filter((s) => purchaseStage(s) === "paid").length} of ${allOut.length} are paid`}>
        <Panel className="overflow-x-auto">
          {moneyOut.length === 0 ? (
            <p className="px-3 py-3 text-muted">{allOut.length === 0 ? "No invoice has been charged to this job yet." : shown === "paid" ? "None paid yet." : "Nothing is waiting to be paid."}</p>
          ) : (
            <table className="tbl" aria-label={`Invoices from suppliers and subcontractors on ${p.code}`}>
              <thead>
                <tr>
                  <th>From</th>
                  <th>Their number</th>
                  <th>Dated</th>
                  <th className="num">Charged to {p.code}</th>
                  <th>Paid</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {moneyOut.map((s) => {
                  const st = purchaseStage(s);
                  return (
                    <tr key={s.id}>
                      <td>
                        <span className="font-medium">{s.supplier}</span>
                        <span className="block text-[0.87rem] text-muted">{partyOf(s) === "subcontractor" ? "Subcontractor" : "Supplier"}</span>
                      </td>
                      <td>
                        {access.can("invoicing") ? (
                          <Link to={`/invoicing/${partyOf(s)}?inv=${s.id}`} className={LINK}>
                            {s.invoiceNo}
                          </Link>
                        ) : (
                          s.invoiceNo
                        )}
                      </td>
                      <td className="whitespace-nowrap">{dShort(s.invoiceDate)}</td>
                      <td className="num">{m(share(s))}</td>
                      <td>{st === "paid" ? <Badge tone="ok">Paid{s.paidOn ? ` ${dShort(s.paidOn)}` : ""}</Badge> : st === "pay" ? <Badge tone="accent">Not paid, approved</Badge> : <PurchaseBadge s={s} />}</td>
                      <td className="text-right whitespace-nowrap">
                        {may && st === "pay" && (
                          <Button size="sm" aria-label={`Mark ${s.invoiceNo} from ${s.supplier} paid`} onClick={() => setPayingOut(s)}>
                            Mark paid
                          </Button>
                        )}
                        {may && st === "paid" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Undo paid for ${s.invoiceNo} from ${s.supplier}`}
                            onClick={() => {
                              unmarkPurchasePaid(s.id);
                              toast(`${s.invoiceNo} is not paid again`);
                            }}
                          >
                            Undo paid
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">An invoice can be marked paid once it has been approved. Until then its mark says whose yes it is waiting for.</p>
      </Section>
      <ClientPaidDialog invoice={payingIn} onClose={() => setPayingIn(null)} />
      {payingOut && <PaidDialog s={payingOut} onClose={() => setPayingOut(null)} />}
    </div>
  );
}
