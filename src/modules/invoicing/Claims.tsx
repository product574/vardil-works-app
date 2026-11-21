import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { unmarkInvoicePaid } from "@/data/actions";
import type { SalesInvoice } from "@/data/types";
import { CLAIM_LABEL, CLAIM_TONE, claimRows, claimsDue, claimSummary, jobPaidShown, monthOf, type PaidShown, paidState } from "@/lib/claims";
import { dFull, dShort, plural } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { invoiceNo } from "@/lib/billing";
import { STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/invoices";
import { daysBetween } from "@/lib/status";
import { Badge, Button, cx, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";
import { DraftInvoiceDialog } from "./ClientInvoices";
import { ClientPaidDialog, PaidSwitch, useInv } from "./shared";

const monthName = (d: string) => new Date(`${monthOf(d)}-01T12:00:00Z`).toLocaleDateString("en-IE", { month: "long", timeZone: "UTC" });

/**
 * Money in opens here (20 Nov, the call with Jimmy, Oldstone's managing director): "the most
 * important thing was to get that payment claim in at the end of each month, religiously". So,
 * kept simple as he asked: every job to be claimed this month, with a column saying whether this
 * month's claim has gone (green) or not (red). A job opens to its invoices. The full invoice list,
 * with its tabs and aged debt, is the next tab along.
 */
export function PaymentClaims() {
  const { db, day, region, access, canEdit, client } = useInv();
  const navigate = useNavigate();
  const [open, setOpen] = useState<string | null>(null);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [paying, setPaying] = useState<SalesInvoice | null>(null);
  const [paidShown, setPaidShown] = useState<PaidShown>("all");
  const every = claimRows(db, day);
  const sum = claimSummary(every);
  const stateOf = (projectId: string) => paidState(db.salesInvoices.filter((i) => i.projectId === projectId), day);
  const rows = every.filter((r) => jobPaidShown(stateOf(r.project.id), paidShown));
  const paidCounts = { unpaid: every.filter((r) => jobPaidShown(stateOf(r.project.id), "unpaid")).length, paid: every.filter((r) => jobPaidShown(stateOf(r.project.id), "paid")).length };
  const due = claimsDue(day, db.bankHolidays);
  const left = daysBetween(day, due);
  const money = access.seeValues;
  return (
    <>
      <PageHead
        title="Payment claims"
        note={`${monthName(day)}'s claims are due out by ${dFull(due)}${left > 0 ? `, in ${plural(left, "day")}` : left === 0 ? ", today" : ""}. ${sum.issued} of ${sum.total} issued. Get every claim in by the end of the month: the sooner it is in, the sooner it is paid.`}
      />
      <PageBody className="grid max-w-[80rem] grid-cols-1 gap-4">
        <div className="grid grid-cols-3 gap-3 max-sm:grid-cols-1" aria-label="This month's claims">
          <Figure label="Issued this month" value={`${sum.issued} of ${sum.total}`} tone={sum.toGo ? undefined : "ok"} />
          <Figure label="Still to go out" value={String(sum.toGo)} tone={sum.toGo ? "bad" : "ok"} />
          <Figure label="Due out by" value={dShort(due)} tone={left <= 5 && sum.toGo ? "bad" : undefined} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PaidSwitch value={paidShown} onChange={setPaidShown} counts={paidCounts} />
          <span className="text-[0.93rem] text-muted">{paidShown === "unpaid" ? "Jobs with an invoice sent and not paid yet." : paidShown === "paid" ? "Jobs where every invoice sent has been paid." : "Open a job to mark its invoices paid."}</span>
        </div>
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label={`Payment claims for ${monthName(day)}`}>
            <thead>
              <tr>
                <th className="w-8" aria-label="Show invoices" />
                <th>Project</th>
                <th>Stage</th>
                {money && <th className="num">Claimed to date</th>}
                {money && <th className="num">Left to claim</th>}
                <th>{monthName(day)} claim</th>
                <th>Paid</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.project;
                const c = client(p.clientId);
                const isOpen = open === p.id;
                const pay = stateOf(p.id);
                const invoices = db.salesInvoices.filter((i) => i.projectId === p.id).sort((a, b) => (b.issuedOn ?? "9999").localeCompare(a.issuedOn ?? "9999"));
                return (
                  <Fragment key={p.id}>
                    <tr className={cx(isOpen && "bg-side")}>
                      <td>
                        <button type="button" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} the invoices for ${p.code}`} onClick={() => setOpen(isOpen ? null : p.id)} className="press grid size-8 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink">
                          {isOpen ? <CaretDown size={16} weight="bold" /> : <CaretRight size={16} weight="bold" />}
                        </button>
                      </td>
                      <td>
                        <Link to={`/projects/${p.code}`} className="font-medium underline-offset-2 hover:underline">
                          {p.code} {p.name}
                        </Link>
                        <span className="block text-[0.87rem] text-muted">{c?.name}</span>
                      </td>
                      <td>{p.status === "Live" ? "Live" : "Finished"}</td>
                      {money && <td className="num">{money0(r.claimed, region)}</td>}
                      {money && <td className="num">{money0(r.left, region)}</td>}
                      <td>
                        <Badge tone={CLAIM_TONE[r.state]}>{CLAIM_LABEL[r.state]}</Badge>
                        {r.invoice && (
                          <span className="mt-0.5 block text-[0.87rem] text-muted">
                            {invoiceNo(r.invoice)}
                            {r.state === "issued" && r.invoice.issuedOn ? `, ${dShort(r.invoice.issuedOn)}` : ""}
                            {money ? `, ${money0(r.invoice.net, region)}` : ""}
                          </span>
                        )}
                      </td>
                      <td>
                        {pay.sent === 0 ? (
                          <span className="text-muted">Nothing sent yet</span>
                        ) : (
                          <>
                            <Badge tone={pay.unpaid === 0 ? "ok" : pay.overdue ? "bad" : "warn"}>{pay.unpaid === 0 ? "All paid" : `${pay.unpaid} not paid`}</Badge>
                            <span className="mt-0.5 block text-[0.87rem] text-muted">
                              {pay.paid} of {pay.sent} paid
                              {pay.unpaid > 0 && money ? `, ${money0(pay.owed, region)} owed` : ""}
                              {pay.overdue > 0 ? `, ${pay.overdue} late` : ""}
                            </span>
                          </>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {r.state === "to-issue" || r.state === "final" ? (
                          canEdit && (
                            <Button size="sm" onClick={() => setDrafting(p.id)}>
                              {r.state === "final" ? "Draft the final account" : "Draft this month's claim"}
                            </Button>
                          )
                        ) : (
                          r.invoice && (
                            <Link to={`/invoicing/client/${r.invoice.ref}`} className="text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
                              {r.state === "draft" ? "Open and send" : r.state === "held" ? "See why it is held" : "Open the claim"}
                            </Link>
                          )
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-side">
                        <td />
                        <td colSpan={money ? 7 : 5} className="pt-0">
                          {invoices.length === 0 ? (
                            <p className="py-1 text-muted">Nothing invoiced on {p.code} yet.</p>
                          ) : (
                            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label={`Invoices for ${p.code}`}>
                              {invoices.map((i) => {
                                const st = stageOf(i, day);
                                return (
                                  <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5">
                                    <Link to={`/invoicing/client/${i.ref}`} className="w-24 font-medium text-accent-ink underline-offset-2 hover:underline">
                                      {invoiceNo(i)}
                                    </Link>
                                    <span className="min-w-0 flex-1 basis-56">{i.description}</span>
                                    <span className="w-24 text-[0.93rem] text-muted">{i.issuedOn ? dShort(i.issuedOn) : "Not sent"}</span>
                                    {money && <span className="w-28 text-right tabular-nums">{money2(i.net, region)}</span>}
                                    <Badge tone={STAGE_TONE[st]}>{st === "paid" && i.paidOn ? `Paid ${dShort(i.paidOn)}` : STAGE_LABEL[st]}</Badge>
                                    {/* Paid or not, marked right here (21 Nov): the same confirm box and Undo as on the invoice list. */}
                                    <span className="w-24 text-right">
                                      {canEdit && (st === "sent" || st === "overdue") && (
                                        <Button size="sm" onClick={() => setPaying(i)} aria-label={`Mark ${invoiceNo(i)} paid`}>
                                          Mark paid
                                        </Button>
                                      )}
                                      {canEdit && st === "paid" && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          aria-label={`Undo paid for ${invoiceNo(i)}`}
                                          onClick={() => {
                                            unmarkInvoicePaid(i.id);
                                            toast(`${invoiceNo(i)} is not paid again`);
                                          }}
                                        >
                                          Undo paid
                                        </Button>
                                      )}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="px-3 py-3 text-muted">{every.length === 0 ? "No live or finished jobs to claim on this month." : paidShown === "unpaid" ? "Nothing sent is waiting to be paid." : "No job has everything paid yet."}</p>}
        </Panel>
        <p className="text-[0.93rem] text-muted">
          A claim counts as issued once it has been sent to the client this month. Live jobs are claimed every month; a finished job needs its final account.{" "}
          <Link to="/invoicing" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            All client invoices
          </Link>
        </p>
      </PageBody>
      <ClientPaidDialog invoice={paying} onClose={() => setPaying(null)} />
      <DraftInvoiceDialog
        open={!!drafting}
        projectId={drafting ?? undefined}
        onClose={() => setDrafting(null)}
        onSaved={(ref) => {
          setDrafting(null);
          toast(`Drafted. Check it and send it to the client`);
          navigate(`/invoicing/client/${ref}`);
        }}
      />
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <span className="block text-[0.93rem] text-muted">{label}</span>
      <span className={cx("font-display text-[1.6rem] leading-tight font-semibold tabular-nums", tone === "bad" && "text-bad", tone === "ok" && "text-ok")}>{value}</span>
    </div>
  );
}
