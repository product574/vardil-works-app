import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { decideCert, decideExpense, decideHoliday, decideOvertimeClaim, decideSiteRequest, decideSpend, markExpensePaid, moveRepair, undoExpensePaid } from "@/data/actions";
import { useState } from "react";
import { useData, useDay, usePrefs } from "@/data/store";
import type { CertSubmission, Db, Expense, OvertimeClaim } from "@/data/types";
import { restDayKindOf } from "@/lib/bank-holidays";
import { suggestedSplit } from "@/lib/overtime-claims";
import { dFull, dShort, plural, when } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { type Approver, approverWords, chainOf, mayApprove } from "@/lib/purchases";
import { ApproveDialog, SendBackDialog } from "@/modules/invoicing/purchase-shared";
import { directorQueue, recentlyDecided } from "@/lib/requests";
import { Badge, Button, type DeclineAsk, DeclineDialog, DeclineNote, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

const KIND: Record<string, string> = { personnel: "People", own_plant: "Our plant", hired_plant: "Plant to hire", other: "Something else" };

/**
 * Everything waiting for the managing director's yes or no, in one place (Aodhan, 16 Nov):
 * leave, people and plant asked for by the sites, and money people want to spend.
 */
export function Requests() {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const q = directorQueue(db, { crewToOffice: !access.apps.on("projects") });
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  const total = Object.values(q).reduce((n, list) => n + list.length, 0);
  return (
    <>
      <PageHead
        title="Requests"
        note={total === 0 ? "Nothing is waiting for a yes or no." : `${plural(total, "thing")} waiting for you: leave, requests from the phones and the sites, overtime claims, repairs, certificates to check, reimbursements${access.apps.on("invoicing") ? (chainOf(db.approvalLimits) === "accounts-limit" ? `, and supplier invoices over the ${money0(limit, region)} accounts may approve` : ", and invoices the site managers have approved") : ""}.`}
      />
      <PageBody className="grid max-w-6xl gap-6">
        <RequestsBody />
      </PageBody>
    </>
  );
}

/**
 * Everything waiting, section by section. Admin, Requests shows it all; the Dashboard shows the
 * same sections (19 Nov) without the list of answers already given.
 */
export function RequestsBody({ embedded }: { embedded?: boolean }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const canLeave = access.may("approveLeave");
  const canAnswer = access.may("answerRequests");
  const q = directorQueue(db, { crewToOffice: !access.apps.on("projects") });
  const canPay = canAnswer || access.may("exportPayroll");
  const canCerts = access.may("manageStaff");
  const [claimBox, setClaimBox] = useState<OvertimeClaim | null>(null);
  const [certBox, setCertBox] = useState<CertSubmission | null>(null);
  const [payBox, setPayBox] = useState<Expense | null>(null);
  // Supplier invoices waiting for the managing director: Invoicing's rule and limit (merged 19 Nov).
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  const approver: Approver = { personId: access.personId, handles: access.may("manageInvoices"), approvesAll: access.may("approveInvoices"), approvesOwnSites: access.may("approveSubInvoices") };
  const [invBox, setInvBox] = useState<{ what: "approve" | "back"; id: string } | null>(null);
  const boxInv = db.supplierInvoices.find((x) => x.id === invBox?.id);
  const total = Object.values(q).reduce((n, list) => n + list.length, 0);
  const person = (id: string) => db.people.find((p) => p.id === id);
  const project = (id: string | null) => db.projects.find((p) => p.id === id);
  const planned = (personId: string, from: string, to: string) => db.plan.filter((p) => p.personId === personId && p.date >= from && p.date <= to).length;
  const decided = recentlyDecided(db, day);
  // Every no here can carry a note saying why (17 Nov): Decline opens a box for it, which can be left empty.
  const [no, setNo] = useState<DeclineAsk | null>(null);
  const yesNo = (allowed: boolean, onNo: (note: string) => void, onYes: () => void, what: string, hint?: string) =>
    allowed ? (
      <td className="text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" aria-label={`Decline: ${what}`} onClick={() => setNo({ title: "Decline this request?", about: `${what[0]!.toUpperCase()}${what.slice(1)}.`, ...(hint ? { hint } : {}), run: onNo })}>
          Decline
        </Button>{" "}
        <Button size="sm" aria-label={`Approve: ${what}`} onClick={onYes}>
          Approve
        </Button>
      </td>
    ) : (
      <td className="text-[0.93rem] text-muted">Waiting</td>
    );

  return (
    <>
        {total === 0 && (
          <Panel>
            <Empty title="Nothing is waiting">Leave, requests from the phones, overtime claims, repairs, certificates and reimbursements all arrive here.</Empty>
          </Panel>
        )}

        {q.leave.length > 0 && (
          <Section title={`Leave (${q.leave.length})`} aside={<Link to="/people/holidays" className="font-medium text-accent-ink underline-offset-2 hover:underline">All leave</Link>}>
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Dates</th>
                    <th>Why</th>
                    <th>Clashes with plan</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.leave.map((h) => {
                    const p = person(h.personId);
                    const clash = planned(h.personId, h.from, h.to);
                    return (
                      <tr key={h.id}>
                        <td>
                          <span className="font-medium">{p?.name}</span>
                          <span className="block text-[0.87rem] text-muted">{p?.trade}, asked by {h.via.toLowerCase()}</span>
                        </td>
                        <td className="whitespace-nowrap">{h.from === h.to ? dFull(h.from) : `${dShort(h.from)} to ${dFull(h.to)}`}</td>
                        <td className="text-muted">{h.note ?? "-"}</td>
                        <td>{clash > 0 ? <Badge tone="warn">{plural(clash, "day")} already planned</Badge> : <span className="text-muted">None</span>}</td>
                        {yesNo(
                          canLeave,
                          (note) => { decideHoliday(h.id, false, note); toast(`Leave declined for ${p?.name}${note ? ", with your note" : ""}`); },
                          () => { const cleared = decideHoliday(h.id, true); toast(`Leave approved for ${p?.name}${cleared > 0 ? `. ${plural(cleared, "planned day")} taken off the week ahead` : ""}`); },
                          `leave for ${p?.name}`,
                          `Say why, if it helps. ${p?.name?.split(" ")[0]} sees it with the answer on the site phone.`,
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.site.length > 0 && (
          <Section title={`From the sites (${q.site.length})`} aside={<Link to="/projects/requests" className="font-medium text-accent-ink underline-offset-2 hover:underline">All site requests</Link>}>
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>What</th>
                    <th>Needed</th>
                    <th>Asked by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.site.map((r) => {
                    const p = project(r.projectId);
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">
                          {p ? (
                            <>
                              <Link to={`/projects/${p.code}?tab=requests`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                                {p.code}
                              </Link>{" "}
                              {p.name}
                            </>
                          ) : (
                            // From a site manager's phone, not tied to one site (Oisin, 17 Nov).
                            <>
                              <span className="font-medium">General</span>
                              <span className="block text-[0.87rem] text-muted">Not for one site</span>
                            </>
                          )}
                        </td>
                        <td>
                          <span className="font-medium">{r.description}{r.quantity > 1 ? ` x ${r.quantity}` : ""}</span>
                          <span className="block text-[0.87rem] text-muted">{KIND[r.kind]}{r.notes ? `. ${r.notes}` : ""}</span>
                        </td>
                        <td className="whitespace-nowrap">{r.neededFrom === r.neededTo ? dFull(r.neededFrom) : `${dShort(r.neededFrom)} to ${dShort(r.neededTo)}`}</td>
                        <td>
                          {r.requestedBy}
                          <span className="block text-[0.87rem] text-muted">
                            {when(r.forwardedAt ?? r.createdAt, day)}
                            {r.raisedBy ? `. First asked by ${r.raisedBy}` : ""}
                          </span>
                        </td>
                        {yesNo(
                          canAnswer,
                          (note) => { decideSiteRequest(r.id, false, note); toast(`Turned down: ${r.description}${note ? ", with your note" : ""}`); },
                          () => { const out = decideSiteRequest(r.id, true); toast(out === "planned" ? `Agreed: ${r.description}. They are on the plan for ${p?.code} that day` : `Agreed: ${r.description}. It stays on Requests until the office has arranged it`); },
                          r.description,
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.claims.length > 0 && (
          <Section title={`Overtime claims (${q.claims.length})`} aside="Claimed on the phone. Approved hours go on the timesheet for that day">
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label="Overtime claims">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Day</th>
                    <th>Site</th>
                    <th className="num">Hours</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.claims.map((c) => {
                    const p = person(c.personId);
                    const site = project(c.projectId);
                    return (
                      <tr key={c.id}>
                        <td>
                          <span className="font-medium">{p?.name}</span>
                          {c.note && <span className="block text-[0.87rem] text-muted">{c.note}</span>}
                        </td>
                        <td className="whitespace-nowrap">{dFull(c.date)}</td>
                        <td>{site ? `${site.code} ${site.name}` : "-"}</td>
                        <td className="num">{c.hours}</td>
                        {canAnswer ? (
                          <td className="text-right whitespace-nowrap">
                            <Button size="sm" variant="ghost" aria-label={`Decline: overtime for ${p?.name}`} onClick={() => setNo({ title: "Decline this overtime claim?", about: `${p?.name}, ${c.hours} hours on ${dFull(c.date)}.`, run: (note) => { const problem = decideOvertimeClaim(c.id, false, { note }); toast(problem ?? `Overtime declined for ${p?.name}`); } })}>
                              Decline
                            </Button>{" "}
                            <Button size="sm" aria-label={`Approve: overtime for ${p?.name}`} onClick={() => setClaimBox(c)}>
                              Approve
                            </Button>
                          </td>
                        ) : (
                          <td className="text-[0.93rem] text-muted">Waiting</td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.repairs.length > 0 && (
          <Section title={`Repairs reported (${q.repairs.length})`} aside={<Link to="/admin/repairs" className="font-medium text-accent-ink underline-offset-2 hover:underline">All repairs</Link>}>
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label="Repairs reported">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>Where</th>
                    <th>Reported by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.repairs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="font-medium">{r.item.name}</span>
                        <span className="block text-[0.87rem] text-muted">{r.what}</span>
                      </td>
                      <td>{r.where}</td>
                      <td>
                        {person(r.personId)?.name}
                        <span className="block text-[0.87rem] text-muted">{when(r.at, day)}</span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {canAnswer ? (
                          <Button size="sm" onClick={() => { moveRepair(r.id, "In hand"); toast(`${r.item.name}: in hand. ${person(r.personId)?.name?.split(" ")[0]} sees it on the phone`); }}>
                            Take in hand
                          </Button>
                        ) : (
                          <span className="text-[0.93rem] text-muted">Waiting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.certs.length > 0 && (
          <Section title={`Certificates to check (${q.certs.length})`} aside="Sent from the phone. They count once accepted">
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label="Certificates to check">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Certificate</th>
                    <th>Runs out</th>
                    <th>Sent</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.certs.map((c) => (
                    <tr key={c.id}>
                      <td className="font-medium">{person(c.personId)?.name}</td>
                      <td>
                        {c.name}
                        <span className="block text-[0.87rem] text-muted">{c.certId || c.licence ? "A new one for the one on file" : "Not on file yet"}</span>
                      </td>
                      <td className="whitespace-nowrap">{dFull(c.expires)}</td>
                      <td className="text-muted">{when(c.sentAt, day)}</td>
                      <td className="text-right">
                        {canCerts ? (
                          <Button size="sm" onClick={() => setCertBox(c)}>
                            Check
                          </Button>
                        ) : (
                          <span className="text-[0.93rem] text-muted">Waiting</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.spend.length > 0 && (
          <Section title={`Spending (${q.spend.length})`} aside="Asked for with Something to buy. After a yes the office places the order (Projects, Orders and deliveries)">
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>What</th>
                    <th>For</th>
                    {access.seeValues && <th className="num">Before VAT</th>}
                    <th>Asked by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.spend.map((x) => {
                    const p = project(x.projectId);
                    return (
                      <tr key={x.id}>
                        <td>
                          <span className="font-medium">{x.what}</span>
                          <span className="block text-[0.87rem] text-muted">{x.supplier === "Not chosen yet" ? "Supplier not chosen yet" : `From ${x.supplier}`}. {x.reason}</span>
                        </td>
                        <td className="whitespace-nowrap">{p ? `${p.code} ${p.name}` : "The firm"}</td>
                        {access.seeValues && <td className="num whitespace-nowrap">{money2(x.amount, region)}</td>}
                        <td>
                          {person(x.requestedById)?.name}
                          <span className="block text-[0.87rem] text-muted">{when(x.createdAt, day)}</span>
                        </td>
                        {yesNo(
                          canAnswer,
                          (note) => { decideSpend(x.id, false, note); toast(`Turned down: ${x.what}${note ? ", with your note" : ""}`); },
                          () => { decideSpend(x.id, true); toast(`Agreed: ${x.what}. It is on the office's list to order`); },
                          x.what,
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.expenses.length > 0 && (
          <Section title={`Reimbursements (${q.expenses.length})`} aside="Claimed from the phone. Approve, then mark paid once the money has gone">
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>What for</th>
                    <th>Paid</th>
                    <th className="num">Amount</th>
                    <th>Receipt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.expenses.map((x) => {
                    const p = person(x.personId);
                    const site = project(x.projectId);
                    return (
                      <tr key={x.id}>
                        <td>
                          <span className="font-medium">{p?.name}</span>
                          <span className="block text-[0.87rem] text-muted">{p?.trade}</span>
                        </td>
                        <td>
                          {x.kind}
                          <span className="block text-[0.87rem] text-muted">
                            {x.what}
                            {site ? `. ${site.code}` : ""}
                          </span>
                        </td>
                        <td className="whitespace-nowrap">{dShort(x.date)}</td>
                        <td className="num">{money2(x.amount, region)}</td>
                        <td>
                          {x.receipt ? (
                            <a href={x.receipt.dataUrl} download={`Receipt ${p?.name} ${x.date}.jpg`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                              Open
                            </a>
                          ) : (
                            <span className="text-muted">On paper</span>
                          )}
                        </td>
                        {yesNo(
                          canAnswer,
                          (note) => { decideExpense(x.id, false, note); toast(`Reimbursement declined for ${p?.name}${note ? ", with your note" : ""}`); },
                          () => { decideExpense(x.id, true); toast(`Reimbursement approved for ${p?.name}. Mark it paid below once the money has gone`); },
                          `reimbursement for ${p?.name}`,
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.toPay.length > 0 && (
          <Section title={`Ready to be paid (${q.toPay.length})`} aside="Reimbursements approved by a site manager or here. Mark each one paid once the money has gone">
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label="Reimbursements to pay">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>What for</th>
                    <th className="num">Amount</th>
                    <th>Approved</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.toPay.map((x) => (
                    <tr key={x.id}>
                      <td className="font-medium">{person(x.personId)?.name}</td>
                      <td>
                        {x.kind}
                        <span className="block text-[0.87rem] text-muted">{x.what}</span>
                      </td>
                      <td className="num">{money2(x.amount, region)}</td>
                      <td className="text-muted">
                        {x.decidedBy}
                        <span className="block text-[0.87rem]">{x.decidedAt ? when(x.decidedAt, day) : ""}</span>
                      </td>
                      <td className="text-right">
                        {canPay ? (
                          <Button size="sm" aria-label={`Mark paid: ${person(x.personId)?.name}, ${money2(x.amount, region)}`} onClick={() => setPayBox(x)}>
                            Mark paid
                          </Button>
                        ) : (
                          <span className="text-[0.93rem] text-muted">To pay</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}

        {q.invoices.length > 0 && access.apps.on("invoicing") && (
          <Section title={chainOf(db.approvalLimits) === "accounts-limit" ? `Supplier invoices over ${money0(limit, region)} before VAT (${q.invoices.length})` : `Invoices approved by the site, for your yes (${q.invoices.length})`} aside={<Link to="/invoicing/approve" className="font-medium text-accent-ink underline-offset-2 hover:underline">To approve in Invoicing</Link>}>
            <Panel className="overflow-x-auto">
              <table className="tbl" aria-label="Invoices waiting for your approval">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>For</th>
                    <th className="num">Before VAT</th>
                    <th>Checked by</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.invoices.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/invoicing/supplier?inv=${s.id}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                          {s.supplier}
                        </Link>
                        <span className="block text-[0.87rem] text-muted">
                          {s.invoiceNo}
                          {s.fileNo ? `, file ${s.fileNo}` : ""}
                        </span>
                      </td>
                      <td>{[...new Set(s.allocations.map((a) => project(a.projectId)?.code))].join(", ")}</td>
                      <td className="num">{money2(s.subtotal, region)}</td>
                      <td className="text-muted">
                        {s.askedBy}
                        <span className="block text-[0.87rem]">{when(s.askedAt ?? "", day)}</span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {mayApprove(s, approver, limit, db.projects, chainOf(db.approvalLimits)) ? (
                          <span className="inline-flex gap-1.5">
                            <Button size="sm" variant="ghost" aria-label={`Send back: ${s.supplier} ${s.invoiceNo}`} onClick={() => setInvBox({ what: "back", id: s.id })}>
                              Send back
                            </Button>
                            <Button size="sm" aria-label={`Approve: ${s.supplier} ${s.invoiceNo}`} onClick={() => setInvBox({ what: "approve", id: s.id })}>
                              Approve
                            </Button>
                          </span>
                        ) : (
                          <span className="text-[0.93rem] text-muted">Waiting for {approverWords(s, limit, db.projects, (id) => db.people.find((p) => p.id === id)?.name, chainOf(db.approvalLimits))}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </Section>
        )}
        {invBox && boxInv && (invBox.what === "approve" ? <ApproveDialog s={boxInv} onClose={(done) => { setInvBox(null); if (done) toast(`${boxInv.supplier} ${boxInv.invoiceNo} approved into job costs. It is on To be paid`); }} /> : <SendBackDialog s={boxInv} onClose={() => setInvBox(null)} />)}

        {!embedded && decided.length > 0 && <Decided db={db} day={day} items={decided} />}
        <DeclineDialog ask={no} onClose={() => setNo(null)} />
        {claimBox && <ClaimDialog c={claimBox} onClose={() => setClaimBox(null)} />}
        {certBox && <CertDialog s={certBox} onClose={() => setCertBox(null)} />}
        {payBox && <PayDialog x={payBox} onClose={() => setPayBox(null)} />}
    </>
  );
}

/** Answers given in the last fortnight, so a yes or no just given can be checked. */
function Decided({ db, day, items }: { db: Db; day: string; items: ReturnType<typeof recentlyDecided> }) {
  return (
    <Section title="Answered in the last two weeks">
      <Panel>
        <ul className="divide-y divide-line">
          {items.map((d) => {
            const yes = d.kind === "site" ? d.item.decision === "Approved" : d.item.status === "Approved";
            const what =
              d.kind === "site"
                ? `${d.item.description}, ${db.projects.find((p) => p.id === d.item.projectId)?.code ?? "general"}`
                : d.kind === "expense"
                  ? `Reimbursement for ${db.people.find((p) => p.id === d.item.personId)?.name}: ${d.item.kind.toLowerCase()}`
                  : d.item.what;
            const by = d.item.decidedBy;
            return (
              <li key={d.item.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2">
                <Badge tone={yes ? "ok" : "neutral"}>{yes ? "Approved" : "Declined"}</Badge>
                <span className="min-w-0 flex-1">
                  {what}
                  {!yes && <DeclineNote note={d.item.declineNote} />}
                </span>
                <span className="text-[0.93rem] text-muted">
                  {by}, {when(d.at, day)}
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>
    </Section>
  );
}

/** Approve an overtime claim: the hours at each rate, starting from the day's rule, which can be changed. */
function ClaimDialog({ c, onClose }: { c: OvertimeClaim; onClose: () => void }) {
  const db = useData((s) => s.db);
  const split = suggestedSplit(restDayKindOf(db.bankHolidays, c.date), c.hours);
  const [half, setHalf] = useState(split.timeAndHalf);
  const [dbl, setDbl] = useState(split.double);
  const [error, setError] = useState("");
  const who = db.people.find((p) => p.id === c.personId)?.name;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Approve overtime for ${who}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={half + dbl <= 0}
            onClick={() => {
              const problem = decideOvertimeClaim(c.id, true, { timeAndHalf: half, double: dbl });
              if (problem) return setError(problem);
              toast(`Overtime approved for ${who}: on the timesheet for ${dFull(c.date)}`);
              onClose();
            }}
          >
            Confirm approval
          </Button>
        </>
      }
    >
      <p>
        {c.hours} extra hours claimed on {dFull(c.date)}
        {c.note ? `: ${c.note}` : ""}.
      </p>
      <div className="mt-3 flex flex-wrap gap-4">
        <Field label="Time and a half">{(id) => <NumInput id={id} label="Hours at time and a half" className="w-24" value={half} onChange={setHalf} />}</Field>
        <Field label="Double time">{(id) => <NumInput id={id} label="Hours at double time" className="w-24" value={dbl} onChange={setDbl} />}</Field>
      </div>
      <p className="mt-2 text-[0.93rem] text-muted">Split by the day's rule to start with. The hours go on the timesheet for that day.</p>
      {error && <p role="alert" className="mt-2 text-bad">{error}</p>}
    </Dialog>
  );
}

/** Check a certificate sent from the phone: the photo, the date it runs to (which can be corrected), then Accept or Turn down. */
function CertDialog({ s, onClose }: { s: CertSubmission; onClose: () => void }) {
  const db = useData((x) => x.db);
  const [expires, setExpires] = useState(s.expires);
  const [note, setNote] = useState("");
  const who = db.people.find((p) => p.id === s.personId)?.name;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${s.name}, ${who}`}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => { decideCert(s.id, null, note); toast(`Turned down. ${who?.split(" ")[0]} sees why on the phone`); onClose(); }}>
            Turn down
          </Button>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { decideCert(s.id, { expires }); toast(`${s.name} accepted for ${who}, to ${dFull(expires)}`); onClose(); }}>
            Accept
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {s.photo.dataUrl ? <img src={s.photo.dataUrl} alt={`${s.name} sent by ${who}`} className="mx-auto max-h-[40dvh] rounded-md border border-line" /> : <p className="rounded-md bg-surface px-3 py-6 text-center text-muted">Sample: no photo behind this one</p>}
        <p className="text-[0.93rem] text-muted">Sent from the phone {dFull(s.sentAt.slice(0, 10))}. Check the name and the dates on the card before accepting it.</p>
        <Field label="Runs out on">{(id) => <input id={id} type="date" className="field" value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
        <Field label="Note if you turn it down (optional)">{(id) => <input id={id} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="The photo is blurred, send another" />}</Field>
      </div>
    </Dialog>
  );
}

/** Mark a reimbursement paid, after saying what will happen (Oisin, 19 Nov: a confirm pop-up). */
function PayDialog({ x, onClose }: { x: Expense; onClose: () => void }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const who = db.people.find((p) => p.id === x.personId)?.name;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark this reimbursement paid?"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              markExpensePaid(x.id);
              toast(`${money2(x.amount, region)} to ${who} marked paid`, { label: "Undo", run: () => undoExpensePaid(x.id) });
              onClose();
            }}
          >
            Confirm paid
          </Button>
        </>
      }
    >
      <p>
        {money2(x.amount, region)} to {who}, for {x.kind.toLowerCase()}: {x.what}.
      </p>
      <p className="mt-2 text-muted">Only mark it paid once the money has gone to them. Their phone then shows Paid.</p>
    </Dialog>
  );
}
