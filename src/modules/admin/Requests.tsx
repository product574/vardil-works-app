import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { decideExpense, decideHoliday, decideSiteRequest, decideSpend, signOffSupplierInvoice } from "@/data/actions";
import { useState } from "react";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Db } from "@/data/types";
import { dFull, dShort, plural, when } from "@/lib/format";
import { money0, money2 } from "@/lib/money";
import { SIGN_OFF_OVER } from "@/lib/purchases";
import { directorQueue, recentlyDecided } from "@/lib/requests";
import { Badge, Button, type DeclineAsk, DeclineDialog, DeclineNote, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

const KIND: Record<string, string> = { personnel: "People", own_plant: "Our plant", hired_plant: "Plant to hire", other: "Something else" };

/**
 * Everything waiting for the managing director's yes or no, in one place (Aodhan, 16 Nov):
 * leave, people and plant asked for by the sites, and money people want to spend.
 */
export function Requests() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const canLeave = access.may("approveLeave");
  const canAnswer = access.may("answerRequests");
  const q = directorQueue(db);
  const total = q.leave.length + q.site.length + q.spend.length + q.invoices.length + q.expenses.length;
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
      <PageHead
        title="Requests"
        note={total === 0 ? "Nothing is waiting for a yes or no." : `${plural(total, "request")} waiting for a yes or no: leave, people and plant the sites have asked for, money people want to spend, reimbursements, and supplier invoices over ${money0(SIGN_OFF_OVER, region)}.`}
      />
      <PageBody className="grid max-w-6xl gap-6">
        {total === 0 && (
          <Panel>
            <Empty title="Nothing is waiting">Leave requests, requests from the sites and spending all arrive here for a yes or no.</Empty>
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

        {q.spend.length > 0 && (
          <Section title={`Spending (${q.spend.length})`}>
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
                          <span className="block text-[0.87rem] text-muted">From {x.supplier}. {x.reason}</span>
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
                          () => { decideSpend(x.id, true); toast(`Agreed: ${x.what}`); },
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
          <Section title={`Reimbursements (${q.expenses.length})`} aside={<>Claimed from the site phone. Approved ones go to <Link to="/people/reimbursements" className="font-medium text-accent-ink underline-offset-2 hover:underline">Reimbursements to pay</Link></>}>
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
                          () => { decideExpense(x.id, true); toast(`Reimbursement approved for ${p?.name}. It is on the office's list to pay`); },
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

        {q.invoices.length > 0 && (
          <Section title={`Supplier invoices over ${money0(SIGN_OFF_OVER, region)} (${q.invoices.length})`} aside={<Link to="/invoicing/export" className="font-medium text-accent-ink underline-offset-2 hover:underline">Accounts export</Link>}>
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>For</th>
                    <th className="num">Gross</th>
                    <th>Confirmed by</th>
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
                          {s.invoiceNo}, file no. {s.fileNo}
                        </span>
                      </td>
                      <td>{[...new Set(s.allocations.map((a) => project(a.projectId)?.code))].join(", ")}</td>
                      <td className="num">{money2(s.total, region)}</td>
                      <td className="text-muted">
                        {s.confirmedBy}
                        <span className="block text-[0.87rem]">{when(s.confirmedAt ?? "", day)}</span>
                      </td>
                      <td className="text-right">
                        {canAnswer ? (
                          <Button size="sm" aria-label={`Sign off: ${s.supplier} ${s.invoiceNo}`} onClick={() => { signOffSupplierInvoice(s.id); toast(`${s.supplier} ${s.invoiceNo} signed off. It goes with the next accounts export`); }}>
                            Sign off
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

        {decided.length > 0 && <Decided db={db} day={day} items={decided} />}
        <DeclineDialog ask={no} onClose={() => setNo(null)} />
      </PageBody>
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
