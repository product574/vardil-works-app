import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmSupplierInvoice, readSupplierInvoice, reopenSupplierInvoice } from "@/data/actions";
import { usePrefs } from "@/data/store";
import type { CostCategoryKey, Db, SupplierInvoice } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { allocationBalance, jobRefMatches, suggestCategory } from "@/lib/job-costs";
import { money0, money2, pct1 } from "@/lib/money";
import { projectCosts } from "@/data/figures";
import { Badge, Button, cx, Empty, NumInput, PageBody, PageHead, Panel, Section, type Tone } from "@/ui";
import { toast } from "@/ui/toast";
import { useInv } from "./shared";

// Money out: supplier invoices and job costs. Client invoices are in ClientInvoices.tsx and
// InvoicePage.tsx, the accounts export in SageExport.tsx.

// ── Supplier invoices ─────────────────────────────────────────────────────────

const READ: Record<SupplierInvoice["readStatus"], { label: string; tone: Tone }> = { not_read: { label: "Not read yet", tone: "neutral" }, needs_review: { label: "To check", tone: "warn" }, confirmed: { label: "Confirmed", tone: "ok" } };
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
  return s.lines.map((l) => ({ description: l.description, amount: l.amount, projectId: job?.id ?? "", category: suggestCategory(l.description) as CostCategoryKey }));
}

/** The queue on the left, then the invoice itself beside what was read from it. */
export function SupplierInvoices() {
  const { db, region } = useInv();
  const [params, setParams] = useSearchParams();
  const order = { needs_review: 0, not_read: 1, confirmed: 2 };
  const all = [...db.supplierInvoices].sort((a, b) => order[a.readStatus] - order[b.readStatus] || b.receivedAt.localeCompare(a.receivedAt));
  const open = all.find((s) => s.id === params.get("inv")) ?? all[0];
  const todo = all.filter((s) => s.readStatus !== "confirmed").length;
  return (
    <>
      <PageHead title="Supplier invoices" note={`${todo} to deal with. Each invoice is read within the hour of arriving; you check the reading against the paper, say which job each line belongs to, and approve it into job costs.`} />
      <PageBody className="grid max-w-[92rem] items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Panel>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto lg:max-h-[calc(100dvh-17rem)]" aria-label="Supplier invoices">
            {all.map((s, i) => (
              <li key={s.id}>
                {s.readStatus === "confirmed" && all[i - 1]?.readStatus !== "confirmed" && <p className="bg-side px-3 py-1 text-[0.87rem] font-medium text-muted">Confirmed, newest first ({all.length - todo})</p>}
                <button type="button" aria-current={s.id === open?.id} onClick={() => setParams({ inv: s.id })} className={cx("press w-full px-3 py-2 text-left", s.id === open?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{s.supplier}</span>
                    <span className="text-[0.93rem]">{money0(s.docType === "credit_note" ? -s.total : s.total, region)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-[0.87rem] text-muted">
                    {s.invoiceNo}
                    <Badge tone={READ[s.readStatus].tone} className="ml-auto">
                      {READ[s.readStatus].label}
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        {open && <InvoiceCheck key={`${open.id}|${open.readStatus}`} s={open} pin={() => setParams({ inv: open.id }, { replace: true })} />}
      </PageBody>
    </>
  );
}

/** `pin` keeps this invoice on screen after an action moves it down the queue, so the result can be seen. */
function InvoiceCheck({ s, pin }: { s: SupplierInvoice; pin: () => void }) {
  const { db, region, canEdit } = useInv();
  const legalName = usePrefs((x) => x.brand.legalName);
  const [lines, setLines] = useState<Line[]>(() => suggestLines(s, db));
  const credit = s.docType === "credit_note";
  const projects = db.projects.filter((p) => p.status === "Live" || p.status === "Complete" || lines.some((l) => l.projectId === p.id)).sort((a, b) => a.code.localeCompare(b.code));
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));
  const balance = allocationBalance(s.subtotal, lines.map((l) => ({ amount_ex_vat: l.amount })));
  const job = s.jobRef ? db.projects.find((p) => jobRefMatches(s.jobRef!, p.code)) : undefined;
  const dup = db.supplierInvoices.find((x) => x.id !== s.id && x.supplier === s.supplier && x.invoiceNo === s.invoiceNo);
  const warnings = [
    !s.jobRef && "No job reference was found on the invoice, so each line needs a project choosing.",
    lines.some((l) => !l.projectId) && "A line has no project yet.",
    Math.abs(balance) > 0.02 && `The lines add up to ${money2(s.subtotal - balance, region)}, but the invoice subtotal is ${money2(s.subtotal, region)}.`,
    job && lines.some((l) => l.projectId && l.projectId !== job.id) && `The invoice says ${job.code}, but a line is going to another project.`,
    dup && `${s.supplier} ${s.invoiceNo} is already on file. Check it is not a duplicate.`,
  ].filter((w): w is string => !!w);
  const blocked = lines.length === 0 || lines.some((l) => !l.projectId) || Math.abs(balance) > 0.02;
  const editable = canEdit && s.readStatus === "needs_review";

  return (
    <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
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
      </div>

      <div className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-[1.15rem]">Read from the invoice</h2>
          <Badge tone={READ[s.readStatus].tone}>{READ[s.readStatus].label}</Badge>
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
                    <td className="w-40 text-muted">Supplier</td>
                    <td>{s.supplier}</td>
                    <td className="w-40 text-muted">Number, date</td>
                    <td>
                      {s.invoiceNo}, {dShort(s.invoiceDate)}
                    </td>
                  </tr>
                  <tr>
                    <td className="text-muted">Job reference</td>
                    <td>{s.jobRef ? `${s.jobRef}${job ? `, ${job.name}` : " (no such project)"}` : <Badge tone="warn">None found</Badge>}</td>
                    <td className="text-muted">Subtotal, VAT, total</td>
                    <td className="whitespace-nowrap">
                      {money2(s.subtotal, region)}, {money2(s.vat, region)}, {money2(s.total, region)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Panel>
            {warnings.length > 0 && s.readStatus === "needs_review" && (
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
            <div className="flex flex-wrap items-center justify-end gap-2">
              {s.readStatus === "confirmed" ? (
                <>
                  <p className="mr-auto text-[0.93rem] text-muted">
                    Confirmed by {s.confirmedBy} on {dFull(s.confirmedAt?.slice(0, 10))}. It is in the job costs of {[...new Set(s.allocations.map((a) => db.projects.find((p) => p.id === a.projectId)?.code))].join(" and ")}.
                  </p>
                  {canEdit && (
                    <Button
                      onClick={() => {
                        pin();
                        reopenSupplierInvoice(s.id);
                        toast("Reopened. It is out of job costs until confirmed again");
                      }}
                    >
                      Reopen
                    </Button>
                  )}
                </>
              ) : canEdit ? (
                <>
                  {blocked && <p className="mr-auto text-[0.93rem] text-muted">Give every line a project, and make the lines add up to the subtotal, before approving.</p>}
                  <Button
                    variant="primary"
                    disabled={blocked}
                    onClick={() => {
                      pin();
                      confirmSupplierInvoice(s.id, lines.map((l) => ({ projectId: l.projectId, category: l.category, amount: l.amount, description: l.description })));
                      toast(`${s.supplier} ${s.invoiceNo} approved into job costs`);
                    }}
                  >
                    Approve to job costs
                  </Button>
                </>
              ) : (
                <p className="text-[0.93rem] text-muted">Approving needs the "Handle invoices" permission.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

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
      <PageHead title="Job costs" note="Labour comes from the timesheets at each person's rate, everything else from supplier invoices once they are confirmed. Margin so far compares cost with the value of the work done." />
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
                        {plural(waiting, "supplier invoice")} not confirmed yet
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
