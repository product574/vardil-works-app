import { MagnifyingGlass } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { readSupplierInvoice, reopenSupplierInvoice, sendForApproval, setApprovalLimit, takeBackPurchase, unmarkPurchasePaid } from "@/data/actions";
import { usePrefs } from "@/data/store";
import type { CostCategoryKey, Db, SupplierInvoice } from "@/data/types";
import { PACKAGE } from "@/lib/accounts-export";
import { dFull, dShort, plural, tOf } from "@/lib/format";
import { allocationBalance, jobRefMatches, suggestCategory } from "@/lib/job-costs";
import { money0, money2, r2 } from "@/lib/money";
import { limitWords, needsAccounts, owedOut, partyOf, payBy, payWords, purchaseStage, type PurchaseStage, sitesOf, viaWords } from "@/lib/purchases";
import { isPdf } from "@/lib/image";
import { Button, cx, Dialog, Empty, NumInput, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { ApproveDialog, CopyLink, PaidDialog, PurchaseBadge, SendBackDialog, usePurchases } from "./purchase-shared";

// Money out: invoices from suppliers and subcontractors. Each is checked, approved into job
// costs, paid by accounts and marked paid. The rules are in src/lib/purchases.ts.

const LINK = "text-accent-ink underline-offset-2 hover:underline";
type Party = "supplier" | "subcontractor";

/** Cost headings in the words used on screen. The keys match src/lib/job-costs.ts. */
const HEADINGS: [CostCategoryKey, string][] = [
  ["material", "Materials"],
  ["plant", "Hired plant"],
  ["equipment", "Equipment"],
  ["labour", "Labour and subcontractors"],
  ["transport", "Transport"],
  ["other", "Other"],
];
const categoryLabel = (k: string) => HEADINGS.find(([key]) => key === k)?.[1] ?? "Other";
type Line = { description: string; amount: number; projectId: string; category: CostCategoryKey };

/** Where each line most likely belongs: the job written on the invoice, and a cost heading from the wording. */
function suggestLines(s: SupplierInvoice, db: Db): Line[] {
  if (s.allocations.length > 0) return s.allocations.map((a) => ({ description: a.description, amount: a.amount, projectId: a.projectId, category: a.category }));
  const job = s.jobRef ? db.projects.find((p) => jobRefMatches(s.jobRef!, p.code)) : undefined;
  return s.lines.map((l) => ({ description: l.description, amount: l.amount, projectId: job?.id ?? "", category: (partyOf(s) === "subcontractor" ? "labour" : suggestCategory(l.description)) as CostCategoryKey }));
}

/** The address of one invoice's own page, in the list it belongs to. */
export const purchaseAddress = (s: Pick<SupplierInvoice, "id" | "party">) => `/invoicing/${partyOf(s) === "subcontractor" ? "subcontractor" : "supplier"}?inv=${s.id}`;

const RANK: Record<PurchaseStage, number> = { back: 0, check: 1, unread: 2, approve: 3, pay: 4, paid: 5, credit: 5 };
const GROUP = ["With accounts", "With accounts", "With accounts", "Waiting for approval", "To be paid", "Paid, newest first"];

export function SupplierInvoices() {
  return <PurchaseQueue party="supplier" />;
}

export function SubcontractorInvoices() {
  return <PurchaseQueue party="subcontractor" />;
}

/**
 * The queue on the left, then the invoice itself beside what was read from it. Suppliers are
 * listed by where each invoice stands; subcontractors by site, since several share a site.
 */
function PurchaseQueue({ party }: { party: Party }) {
  const { db, region, limit, project } = usePurchases();
  const [params, setParams] = useSearchParams();
  const mine = db.supplierInvoices.filter((s) => partyOf(s) === party);
  const siteOf = (s: SupplierInvoice) => project(s.allocations[0]?.projectId) ?? db.projects.find((p) => !!s.jobRef && jobRefMatches(s.jobRef, p.code));
  const live = (s: SupplierInvoice) => (siteOf(s)?.status === "Live" ? 0 : 1);
  const all =
    party === "supplier"
      ? [...mine].sort((a, b) => RANK[purchaseStage(a)] - RANK[purchaseStage(b)] || b.receivedAt.localeCompare(a.receivedAt))
      : [...mine].sort((a, b) => live(a) - live(b) || (siteOf(b)?.code ?? "").localeCompare(siteOf(a)?.code ?? "") || a.supplier.localeCompare(b.supplier) || b.receivedAt.localeCompare(a.receivedAt));
  const heading = (s: SupplierInvoice) => (party === "supplier" ? GROUP[RANK[purchaseStage(s)]]! : siteOf(s) ? `${siteOf(s)!.code} ${siteOf(s)!.name}` : "No site yet");
  const open = all.find((s) => s.id === params.get("inv")) ?? all[0];
  const todo = mine.filter(needsAccounts).length;
  const waiting = mine.filter((s) => purchaseStage(s) === "approve").length;
  return (
    <>
      <PageHead
        title={party === "supplier" ? "Supplier invoices" : "Subcontractor invoices"}
        note={
          party === "supplier"
            ? `${todo} to deal with, ${waiting} waiting for approval. Each invoice is read within the hour of arriving; accounts check the reading against the paper and say which job each line belongs to. Up to ${money0(limit, region)} before VAT accounts approve it themselves; above that the managing director approves. Approved invoices go to To be paid.`
            : `${waiting} waiting for approval, ${todo} with accounts. Subcontractors send their invoices in through the portal, one for each site. The site's manager or the managing director approves each one, then accounts pay it.`
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto lg:max-h-[calc(100dvh-17rem)]" aria-label={party === "supplier" ? "Supplier invoices" : "Subcontractor invoices, by site"}>
            {all.map((s, i) => (
              <li key={s.id}>
                {(i === 0 || heading(all[i - 1]!) !== heading(s)) && (
                  <p className="bg-side px-3 py-1 text-[0.87rem] font-medium text-muted">
                    {heading(s)} ({all.filter((x) => heading(x) === heading(s)).length})
                  </p>
                )}
                <button type="button" aria-current={s.id === open?.id} onClick={() => setParams({ inv: s.id })} className={cx("press w-full px-3 py-2 text-left", s.id === open?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{s.supplier}</span>
                    <span className="text-[0.93rem]">{money0(s.docType === "credit_note" ? -s.total : s.total, region)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[0.87rem] text-muted">
                    <span className="min-w-0 truncate">{s.invoiceNo}</span>
                    <PurchaseBadge s={s} className="ml-auto shrink-0 whitespace-nowrap" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {all.length === 0 && <Empty title="No invoices here yet" />}
        </Panel>
        {open && <PurchaseDetail key={`${open.id}|${purchaseStage(open)}`} s={open} pin={() => setParams({ inv: open.id }, { replace: true })} />}
      </PageBody>
    </>
  );
}

/** `pin` keeps this invoice on screen after an action moves it down the queue, so the result can be seen. */
function PurchaseDetail({ s, pin }: { s: SupplierInvoice; pin: () => void }) {
  const { db, day, region, limit, canEdit, canApprove, waitsFor, sub } = usePurchases();
  const legalName = usePrefs((x) => x.brand.legalName);
  const [lines, setLines] = useState<Line[]>(() => suggestLines(s, db));
  const [box, setBox] = useState<"approve" | "back" | "paid" | null>(null);
  const stage = purchaseStage(s);
  const credit = s.docType === "credit_note";
  const subbie = partyOf(s) === "subcontractor";
  const projects = db.projects.filter((p) => p.status === "Live" || p.status === "Complete" || lines.some((l) => l.projectId === p.id)).sort((a, b) => a.code.localeCompare(b.code));
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const balance = allocationBalance(s.subtotal, lines.map((l) => ({ amount_ex_vat: l.amount })));
  const job = s.jobRef ? db.projects.find((p) => jobRefMatches(s.jobRef!, p.code)) : undefined;
  const dup = db.supplierInvoices.find((x) => x.id !== s.id && x.supplier === s.supplier && x.invoiceNo === s.invoiceNo);
  const open = stage === "check" || stage === "back";
  const warnings = [
    !s.jobRef && "No job reference was found on the invoice, so each line needs a project choosing.",
    lines.some((l) => !l.projectId) && "A line has no project yet.",
    Math.abs(balance) > 0.02 && `The lines add up to ${money2(s.subtotal - balance, region)}, but the invoice subtotal is ${money2(s.subtotal, region)}.`,
    job && lines.some((l) => l.projectId && l.projectId !== job.id) && `The invoice says ${job.code}, but a line is going to another project.`,
    dup && `${s.supplier} ${s.invoiceNo} is already on file. Check it is not a duplicate.`,
  ].filter((w): w is string => !!w);
  const blocked = lines.length === 0 || lines.some((l) => !l.projectId) || Math.abs(balance) > 0.02;
  const editable = canEdit && open;
  const asChecked = lines.map((l) => ({ projectId: l.projectId, category: l.category, amount: l.amount, description: l.description }));
  // Whether the person looking may approve it as it now stands on screen (a subcontractor's invoice depends on its site).
  const mine = canApprove({ ...s, allocations: open ? asChecked.map((a, n) => ({ ...a, id: String(n) })) : s.allocations });
  const codes = [...new Set(s.allocations.map((a) => db.projects.find((p) => p.id === a.projectId)?.code))].join(" and ");
  const to = sub(s.subcontractorId);
  const trail = [
    `Arrived ${viaWords(s)} on ${dFull(s.receivedAt.slice(0, 10))}${s.fileNo ? `, filed as ${s.fileNo}` : ""}`,
    s.sentBack && `Sent back by ${s.sentBack.by} on ${dFull(s.sentBack.at.slice(0, 10))}`,
    s.askedAt && `${s.via === "portal" ? "Sent in by" : "Checked by"} ${s.askedBy} on ${dFull(s.askedAt.slice(0, 10))}`,
    s.confirmedAt && `Approved by ${s.confirmedBy} on ${dFull(s.confirmedAt.slice(0, 10))}`,
    s.paidOn && `Paid on ${dFull(s.paidOn)} by ${s.paidBy}${s.paidRef ? `, ${s.paidRef}` : ""}`,
    s.exportedAt && `Went to ${PACKAGE} on ${dFull(s.exportedAt.slice(0, 10))}`,
  ].filter((t): t is string => !!t);

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <div className="rounded-lg border border-line bg-white px-5 py-5 text-[#1b2733] shadow-pop" aria-label="The invoice as received">
        <div className="flex flex-wrap items-start gap-3 border-b-2 border-[#1b2733] pb-3">
          <div>
            <p className="font-display text-[1.3rem] leading-tight font-semibold">{s.supplier}</p>
            <p className="text-[0.87rem] text-[#5b6875]">{s.fileName}</p>
          </div>
          <div className="ml-auto text-right text-[0.93rem]">
            <p className="font-display text-[1.1rem] font-semibold">{credit ? "Credit note" : "Invoice"} {s.invoiceNo}</p>
            <p>{dFull(s.invoiceDate)}</p>
          </div>
        </div>
        <p className="mt-3 text-[0.93rem]">
          <span className="text-[#5b6875]">To</span> {legalName}
          <span className="ml-4 text-[#5b6875]">Your ref</span> {s.jobRef ?? "none given"}
        </p>
        {s.readStatus === "not_read" ? (
          <p className="mt-6 rounded-md border border-dashed border-[#b8c2cc] px-3 py-6 text-center text-[#5b6875]">Arrived by email this morning and not read yet.</p>
        ) : (
          <table className="mt-4 w-full text-[0.93rem]">
            <tbody>
              {s.lines.map((l, i) => (
                <tr key={i} className="border-b border-[#dfe5ea]">
                  <td className="py-1.5 pr-3">{l.description}</td>
                  <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{money2(l.amount, region)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <dl className="mt-4 ml-auto grid w-56 grid-cols-2 gap-y-1 text-[0.93rem]">
          <dt className="text-[#5b6875]">Subtotal</dt>
          <dd className="text-right tabular-nums">{money2(s.subtotal, region)}</dd>
          <dt className="text-[#5b6875]">VAT</dt>
          <dd className="text-right tabular-nums">{money2(s.vat, region)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold tabular-nums">{money2(s.total, region)}</dd>
        </dl>
        {s.copy && (
          <div className="mt-4 border-t border-[#dfe5ea] pt-3 text-[0.93rem]">
            <p className="text-[#5b6875]">The copy that came with it</p>
            {!isPdf(s.copy.dataUrl) && <img src={s.copy.dataUrl} alt={`${s.supplier} ${s.invoiceNo}, as sent in`} className="mt-2 max-h-80 rounded-md border border-[#dfe5ea]" />}
            <CopyLink s={s} className="mt-2 !text-[#2f5f8a]" />
          </div>
        )}
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[1.15rem]">{s.via === "portal" ? "Sent in through the portal" : "Read from the invoice"}</h2>
          <PurchaseBadge s={s} />
        </div>
        {s.readStatus === "not_read" ? (
          <Panel>
            <Empty title="This one has not been read yet">Reading pulls out the supplier, the numbers, the job reference and each line, and suggests where each line belongs.</Empty>
            {canEdit && (
              <div className="border-t border-line px-3 py-3 text-right">
                <Button
                  variant="primary"
                  onClick={() => {
                    pin();
                    readSupplierInvoice(s.id);
                    toast(`${s.supplier} ${s.invoiceNo} read. Check it against the paper`);
                  }}
                >
                  Read this invoice
                </Button>
              </div>
            )}
          </Panel>
        ) : (
          <>
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <tbody>
                  <tr>
                    <td className="w-40 text-muted">{subbie ? "Subcontractor" : "Supplier"}</td>
                    <td>
                      {s.supplier}
                      {to && <span className="block text-[0.87rem] text-muted">{to.trade}, {to.contactName}</span>}
                    </td>
                    <td className="w-40 text-muted">Number, date</td>
                    <td>
                      {s.invoiceNo}, {dShort(s.invoiceDate)}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted">Job reference</td>
                    <td>{s.jobRef ? `${s.jobRef}${job ? `, ${job.name}` : " (no such project)"}` : <span className="text-warn">None found</span>}</td>
                    <td className="text-muted">Subtotal, VAT, total</td>
                    <td className="whitespace-nowrap">
                      {money2(s.subtotal, region)}, {money2(s.vat, region)}, {money2(s.total, region)}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted">Our file number</td>
                    <td>{s.fileNo ?? "-"}</td>
                    <td className="text-muted">To be paid by</td>
                    <td className="whitespace-nowrap">
                      {credit ? "Nothing to pay" : dFull(payBy(s))}
                      {stage === "pay" && <span className={cx("ml-2 text-[0.87rem]", payBy(s) < day ? "text-bad" : "text-muted")}>{payWords(s, day)}</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            {s.sentBack && stage === "back" && (
              <p className="rounded-md bg-bad-soft px-3 py-2 text-bad">
                Sent back by {s.sentBack.by} on {dFull(s.sentBack.at.slice(0, 10))}: {s.sentBack.reason}
              </p>
            )}
            {warnings.length > 0 && open && (
              <ul className="rounded-md bg-warn-soft px-3 py-2 text-warn">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <Section title="Where each line goes" aside={editable ? "Suggested for you. Change anything that is wrong" : undefined}>
              <Panel className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="min-w-[9rem]">Line</th>
                      <th className="w-32">Project</th>
                      <th className="w-44">Cost heading</th>
                      <th className="num w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.description}</td>
                        <td>
                          {editable ? (
                            <select aria-label={`Project for: ${l.description}`} className={cx("field h-8", !l.projectId && "border-warn")} value={l.projectId} onChange={(e) => set(i, { projectId: e.target.value })}>
                              <option value="">Choose a project</option>
                              {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.code} {p.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            (db.projects.find((p) => p.id === l.projectId)?.code ?? "-")
                          )}
                        </td>
                        <td>
                          {editable ? (
                            <select aria-label={`Cost heading for: ${l.description}`} className="field h-8" value={l.category} onChange={(e) => set(i, { category: e.target.value as CostCategoryKey })}>
                              {HEADINGS.map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            categoryLabel(l.category)
                          )}
                        </td>
                        <td className="num">{editable ? <NumInput label={`Amount for: ${l.description}`} className="w-20" value={l.amount} onChange={(n) => set(i, { amount: n })} /> : money2(credit ? -l.amount : l.amount, region)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </Section>

            <div className="flex flex-wrap items-center justify-end gap-2" aria-label="What happens next">
              {open &&
                (mine ? (
                  <>
                    <p className="mr-auto max-w-[60ch] text-[0.93rem] text-muted">{blocked ? "Give every line a project, and make the lines add up to the subtotal, before approving." : subbie ? (stage === "back" ? `It is back with ${s.supplier}, who can send a corrected invoice. Approve this one only if it has since been put right.` : "You may approve this one. It then goes to accounts to be paid.") : limitWords(s, limit, region)}</p>
                    <Button variant="primary" disabled={blocked} onClick={() => setBox("approve")}>
                      Approve to job costs
                    </Button>
                  </>
                ) : canEdit ? (
                  <>
                    <p className="mr-auto max-w-[60ch] text-[0.93rem] text-muted">{blocked ? "Give every line a project, and make the lines add up to the subtotal, before sending it on." : subbie ? `A subcontractor's invoice is approved by whoever runs the site: ${waitsFor({ ...s, allocations: asChecked.map((a, n) => ({ ...a, id: String(n) })) })}.` : limitWords(s, limit, region)}</p>
                    <Button
                      variant="primary"
                      disabled={blocked}
                      onClick={() => {
                        pin();
                        sendForApproval(s.id, asChecked);
                        toast(`${s.supplier} ${s.invoiceNo} sent for approval`);
                      }}
                    >
                      Send for approval
                    </Button>
                  </>
                ) : (
                  <p className="text-[0.93rem] text-muted">Checking an invoice needs the "Handle invoices" permission.</p>
                ))}
              {stage === "approve" && (
                <>
                  <p className="mr-auto max-w-[60ch] text-[0.93rem] text-muted">
                    {s.via === "portal" ? "Sent in" : "Checked"} by {s.askedBy} on {dFull(s.askedAt?.slice(0, 10))} at {tOf(s.askedAt ?? "")}. Waiting for {waitsFor(s)}.
                  </p>
                  {mine ? (
                    <>
                      <Button onClick={() => setBox("back")}>Send back</Button>
                      <Button variant="primary" onClick={() => setBox("approve")}>
                        Approve to job costs
                      </Button>
                    </>
                  ) : (
                    canEdit &&
                    s.via !== "portal" && (
                      <Button
                        onClick={() => {
                          pin();
                          takeBackPurchase(s.id);
                          toast("Taken back. Change it and send it for approval again");
                        }}
                      >
                        Take it back to change
                      </Button>
                    )
                  )}
                </>
              )}
              {(stage === "pay" || stage === "credit") && (
                <>
                  <p className="mr-auto max-w-[60ch] text-[0.93rem] text-muted">
                    Approved by {s.confirmedBy} on {dFull(s.confirmedAt?.slice(0, 10))}. It is {credit ? "off" : "in"} the job costs of {codes}.{s.exportedAt ? ` ${PACKAGE} has had it since ${dShort(s.exportedAt.slice(0, 10))}.` : ""}
                  </p>
                  {(canEdit || mine) && !s.exportedAt && (
                    <Button
                      onClick={() => {
                        pin();
                        reopenSupplierInvoice(s.id);
                        toast("Reopened. It is out of job costs until approved again");
                      }}
                    >
                      Reopen
                    </Button>
                  )}
                  {stage === "pay" && canEdit && (
                    <Button variant="primary" onClick={() => setBox("paid")}>
                      Mark paid
                    </Button>
                  )}
                </>
              )}
              {stage === "paid" && (
                <>
                  <p className="mr-auto max-w-[60ch] text-[0.93rem] text-muted">
                    Paid on {dFull(s.paidOn)} by {s.paidBy}
                    {s.paidRef ? `, ${s.paidRef}` : ""}.{to ? ` ${to.name} sees it as paid in their portal.` : ""}
                  </p>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        pin();
                        unmarkPurchasePaid(s.id);
                        toast(`${s.supplier} ${s.invoiceNo} is waiting to be paid again`);
                      }}
                    >
                      Undo paid
                    </Button>
                  )}
                </>
              )}
            </div>
            <ul className="text-[0.87rem] text-muted" aria-label="What has happened to this invoice">
              {trail.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </div>
      {box === "approve" && (
        <ApproveDialog
          s={s}
          allocations={open ? asChecked : undefined}
          onClose={(done) => {
            if (done) pin();
            setBox(null);
          }}
        />
      )}
      {box === "back" && (
        <SendBackDialog
          s={s}
          onClose={(done) => {
            if (done) pin();
            setBox(null);
          }}
        />
      )}
      {box === "paid" && (
        <PaidDialog
          s={s}
          onClose={(done) => {
            if (done) pin();
            setBox(null);
          }}
        />
      )}
    </div>
  );
}

// ── To approve ────────────────────────────────────────────────────────────────

type Filter = "all" | Party;
const PARTY_TABS = (count: (f: Filter) => number): { value: Filter; label: string; count: number }[] => [
  { value: "all", label: "All", count: count("all") },
  { value: "supplier", label: "Suppliers", count: count("supplier") },
  { value: "subcontractor", label: "Subcontractors", count: count("subcontractor") },
];

/**
 * Every invoice waiting for someone to approve it. Whoever is looking sees Approve and Send
 * back on the ones they may decide, and who the others are waiting for.
 */
export function ToApprove() {
  const { db, region, limit, access, canApprove, waitsFor, project } = usePurchases();
  const [filter, setFilter] = useState<Filter>("all");
  const [box, setBox] = useState<{ s: SupplierInvoice; what: "approve" | "back" } | null>(null);
  const [changing, setChanging] = useState(false);
  const waiting = db.supplierInvoices.filter((s) => purchaseStage(s) === "approve").sort((a, b) => (a.askedAt ?? "").localeCompare(b.askedAt ?? ""));
  const count = (f: Filter) => waiting.filter((s) => f === "all" || partyOf(s) === f).length;
  const rows = waiting.filter((s) => filter === "all" || partyOf(s) === filter);
  const yours = waiting.filter(canApprove).length;
  return (
    <>
      <PageHead
        title="To approve"
        note={`${plural(waiting.length, "invoice")} waiting for approval, ${money2(r2(waiting.reduce((t, s) => t + s.subtotal, 0)), region)} before VAT. ${yours === 0 ? "None of them is yours to approve." : `${yours} of them ${yours === 1 ? "is" : "are"} yours to approve.`} Accounts approve a supplier's invoice up to ${money0(limit, region)} before VAT; above that the managing director approves. A subcontractor's invoice is approved by the manager of its site or the managing director.`}
        actions={access.may("approveInvoices") && <Button onClick={() => setChanging(true)}>Change the {money0(limit, region)} limit</Button>}
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
          <Segmented label="Invoices to approve" value={filter} onChange={setFilter} options={PARTY_TABS(count)} />
        </div>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="Nothing is waiting for approval">An invoice comes here once accounts have checked it, or a subcontractor has sent one in through the portal.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Invoice</th>
                  <th>Site</th>
                  <th className="num">Total with VAT</th>
                  <th>Waiting for</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-medium">{s.supplier}</span>
                      <span className="block text-[0.87rem] text-muted">{partyOf(s) === "subcontractor" ? "Subcontractor" : "Supplier"}, {viaWords(s)}</span>
                    </td>
                    <td>
                      <Link to={purchaseAddress(s)} className={cx("font-medium", LINK)}>
                        {s.invoiceNo}
                      </Link>
                      <span className="block max-w-[22rem] text-[0.87rem] text-muted">{s.lines[0]?.description}{s.lines.length > 1 ? `, and ${plural(s.lines.length - 1, "more line")}` : ""}</span>
                    </td>
                    <td>
                      {sitesOf(s).map((id) => (
                        <Link key={id} to={`/projects/${project(id)?.code}`} className={cx("block", LINK)}>
                          {project(id)?.code} {project(id)?.name}
                        </Link>
                      ))}
                    </td>
                    <td className="num font-medium">
                      {money2(s.total, region)}
                      <span className="block text-[0.87rem] font-normal text-muted">{money2(s.subtotal, region)} before VAT</span>
                    </td>
                    <td>
                      {capitalFirst(waitsFor(s))}
                      <span className="block text-[0.87rem] text-muted">since {dShort(s.askedAt?.slice(0, 10))}, {s.via === "portal" ? "sent in" : "checked"} by {s.askedBy}</span>
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {canApprove(s) && (
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
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {box?.what === "approve" && <ApproveDialog s={box.s} onClose={() => setBox(null)} />}
      {box?.what === "back" && <SendBackDialog s={box.s} onClose={() => setBox(null)} />}
      {changing && <LimitDialog limit={limit} onClose={() => setChanging(false)} />}
    </>
  );
}

const capitalFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function LimitDialog({ limit, onClose }: { limit: number; onClose: () => void }) {
  const [amount, setAmount] = useState(limit);
  return (
    <Dialog
      open
      onClose={onClose}
      title="What accounts may approve"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={amount < 0}
            onClick={() => {
              setApprovalLimit(amount);
              toast(amount === 0 ? "Every supplier invoice now goes to the managing director" : `Accounts now approve supplier invoices up to ${Math.round(amount)} before VAT`);
              onClose();
            }}
          >
            Save the limit
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-muted">Accounts approve a supplier's invoice themselves up to this amount before VAT. Anything above it waits for the managing director. Set it to 0 and every supplier invoice goes to the managing director.</p>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Limit before VAT</p>
          <NumInput label="Limit before VAT" className="w-32" value={amount} onChange={setAmount} />
        </div>
        <p className="text-[0.93rem] text-muted">Invoices already waiting stay where they are. A subcontractor's invoice is never approved by accounts, whatever its size.</p>
      </div>
    </Dialog>
  );
}

// ── To be paid ────────────────────────────────────────────────────────────────

/**
 * Approved invoices for accounts to pay, soonest first, and the ones already paid. Paying is
 * done through the bank; marking it here is what tells a subcontractor, in their portal.
 */
export function ToPay() {
  const { db, day, region, canEdit, project } = usePurchases();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>("all");
  const [text, setText] = useState("");
  const [paying, setPaying] = useState<SupplierInvoice | null>(null);
  const tab = params.get("show") === "paid" ? "paid" : "pay";
  const owed = owedOut(db.supplierInvoices, day);
  const inTab = db.supplierInvoices.filter((s) => purchaseStage(s) === tab);
  const count = (f: Filter) => inTab.filter((s) => f === "all" || partyOf(s) === f).length;
  const q = text.trim().toLowerCase();
  const rows = inTab
    .filter((s) => (filter === "all" || partyOf(s) === filter) && (!q || [s.supplier, s.invoiceNo, s.fileNo, ...sitesOf(s).map((id) => `${project(id)?.code} ${project(id)?.name}`)].some((v) => v?.toLowerCase().includes(q))))
    .sort((a, b) => (tab === "pay" ? payBy(a).localeCompare(payBy(b)) : (b.paidOn ?? "").localeCompare(a.paidOn ?? "")) || a.supplier.localeCompare(b.supplier));
  return (
    <>
      <PageHead
        title="To be paid"
        note={`${plural(owed.count, "approved invoice")} to pay, ${money2(owed.total, region)} including VAT. ${owed.lateCount === 0 ? "None is past its date." : `${owed.lateCount} past ${owed.lateCount === 1 ? "its" : "their"} date, ${money2(owed.lateTotal, region)}.`} Pay each one through the bank, then mark it paid here: a subcontractor is told in their portal straight away.`}
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
            <Segmented
              label="Invoices shown"
              value={tab}
              onChange={(v) => setParams(v === "paid" ? { show: "paid" } : {})}
              options={[
                { value: "pay", label: "To be paid", count: owed.count },
                { value: "paid", label: "Paid", count: db.supplierInvoices.filter((s) => purchaseStage(s) === "paid").length },
              ]}
            />
          </div>
          <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
            <Segmented label="Who is paid" value={filter} onChange={setFilter} options={PARTY_TABS(count)} />
          </div>
          <label className="relative ml-auto w-full max-w-xs">
            <span className="sr-only">Search invoices to pay</span>
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
            <input type="search" className="field pl-8" placeholder="Who, invoice number or site" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={q ? `Nothing matches "${text}"` : tab === "pay" ? "Nothing is waiting to be paid" : "Nothing has been paid yet"}>{tab === "pay" && !q ? "An invoice comes here as soon as it is approved." : undefined}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Pay to</th>
                  <th>Invoice</th>
                  <th>Site</th>
                  <th>Approved</th>
                  <th>{tab === "pay" ? "To be paid by" : "Paid"}</th>
                  <th className="num">Total with VAT</th>
                  <th>In {PACKAGE}</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-medium">{s.supplier}</span>
                      <span className="block text-[0.87rem] text-muted">{partyOf(s) === "subcontractor" ? "Subcontractor" : "Supplier"}</span>
                    </td>
                    <td>
                      <Link to={purchaseAddress(s)} className={cx("font-medium", LINK)}>
                        {s.invoiceNo}
                      </Link>
                      <span className="block text-[0.87rem] text-muted">File {s.fileNo}</span>
                    </td>
                    <td>{sitesOf(s).map((id) => project(id)?.code).join(", ")}</td>
                    <td className="whitespace-nowrap">
                      {dShort(s.confirmedAt?.slice(0, 10))}
                      <span className="block text-[0.87rem] text-muted">by {s.confirmedBy}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {tab === "pay" ? (
                        <>
                          {dShort(payBy(s))}
                          <span className={cx("block text-[0.87rem]", payBy(s) < day ? "text-bad" : "text-muted")}>{payWords(s, day)}</span>
                        </>
                      ) : (
                        <>
                          {dShort(s.paidOn)}
                          <span className="block text-[0.87rem] text-muted">{s.paidRef ?? `by ${s.paidBy}`}</span>
                        </>
                      )}
                    </td>
                    <td className="num font-medium">
                      {money2(s.total, region)}
                      <span className="block text-[0.87rem] font-normal text-muted">{money2(s.subtotal, region)} before VAT</span>
                    </td>
                    <td className="whitespace-nowrap">{s.exportedAt ? dShort(s.exportedAt.slice(0, 10)) : <span className="text-muted">Not yet</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      {canEdit &&
                        (tab === "pay" ? (
                          <Button size="sm" aria-label={`Mark ${s.invoiceNo} paid`} onClick={() => setPaying(s)}>
                            Mark paid
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            aria-label={`Undo paid for ${s.invoiceNo}`}
                            onClick={() => {
                              unmarkPurchasePaid(s.id);
                              toast(`${s.supplier} ${s.invoiceNo} is waiting to be paid again`);
                            }}
                          >
                            Undo paid
                          </Button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {paying && <PaidDialog s={paying} onClose={() => setPaying(null)} />}
    </>
  );
}
