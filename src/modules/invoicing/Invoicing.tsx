import { Fragment, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { clearHold, confirmSupplierInvoice, issueInvoice, markExported, markInvoicePaid, markPurchasesExported, readSupplierInvoice, reopenSupplierInvoice, signOffSupplierInvoice } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { CostCategoryKey, Db, SalesInvoice, SupplierInvoice } from "@/data/types";
import { buildExport, type ExportRow, PACKAGE_NAME } from "@/lib/accounts-export";
import { invoiceNo } from "@/lib/billing";
import { dFull, dShort, plural } from "@/lib/format";
import { allocationBalance, jobRefMatches, suggestCategory } from "@/lib/job-costs";
import { gross, money0, money2, pct1, r2 } from "@/lib/money";
import { projectCosts } from "@/data/figures";
import { buildPurchaseExport, needsSignOff, NOMINAL, type PurchaseLine, profitabilityCsv, purchaseLines, readyToExport, SIGN_OFF_OVER } from "@/lib/purchases";
import { daysBetween } from "@/lib/status";
import { Badge, Button, cx, Empty, NumInput, PageBody, PageHead, Panel, Section, Segmented, type Tone } from "@/ui";
import { toast } from "@/ui/toast";

function useInv() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const project = (id: string) => db.projects.find((p) => p.id === id);
  const client = (id: string) => db.clients.find((c) => c.id === id);
  return { db, day, region, access, canEdit: access.may("manageInvoices"), project, client };
}
/** Hand a file to the browser to save. */
function saveFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
const vatOf = (i: SalesInvoice) => r2((i.net * i.vatPct) / 100);

/**
 * Client invoices as a table that always fits its page (Oisin, 17 Nov: no scrolling across). Text
 * columns wrap, a short extra fact gets a column (`extra`), anything long about an invoice goes on
 * a line of its own under it (`under`), and on a phone or a narrow window each invoice is a stacked
 * block, not a row (below 1024 pixels, where seven columns no longer fit beside the sidebar).
 */
function SalesTable({ rows, extra, under, action }: { rows: SalesInvoice[]; extra?: { head: string; cell: (i: SalesInvoice) => React.ReactNode }; under?: (i: SalesInvoice) => React.ReactNode; action?: (i: SalesInvoice) => React.ReactNode }) {
  const { region, access, project, client } = useInv();
  const cols = 3 + (extra ? 1 : 0) + (access.seeValues ? 3 : 0) + (action ? 1 : 0);
  // On a phone a cell is a line of the invoice's block, not a column.
  const line = "max-lg:block max-lg:border-0 max-lg:py-0.5";
  const block = "max-lg:block max-lg:border-b max-lg:border-line max-lg:pb-2 max-lg:last:border-b-0";
  return (
    <table className="tbl max-lg:block">
      <thead className="max-lg:hidden">
        <tr>
          <th>Invoice</th>
          <th>Project</th>
          <th>Client</th>
          {extra && <th>{extra.head}</th>}
          {access.seeValues && <th className="num">Net</th>}
          {access.seeValues && <th className="num">VAT</th>}
          {access.seeValues && <th className="num">Gross</th>}
          {action && <th />}
        </tr>
      </thead>
      <tbody className="max-lg:block">
        {rows.map((i) => {
          const p = project(i.projectId);
          return (
            <Fragment key={i.id}>
              <tr className={cx("max-lg:block max-lg:pt-2", under ? "[&>td]:border-b-0" : block)} data-invoice={invoiceNo(i)}>
                <td className={line}>
                  <span className="font-medium whitespace-nowrap">{invoiceNo(i)}</span>
                  <span className="block text-[0.87rem] text-muted max-lg:ml-2 max-lg:inline">{i.description}</span>
                </td>
                <td className={line}>
                  <Link to={`/projects/${p?.code}`} className="whitespace-nowrap text-accent-ink underline-offset-2 hover:underline">
                    {p?.code}
                  </Link>{" "}
                  <span className="text-muted">{p?.name}</span>
                </td>
                <td className={line}>{client(i.clientId)?.name}</td>
                {extra && (
                  <td className={line}>
                    <span className="text-muted lg:hidden">{extra.head}: </span>
                    {extra.cell(i)}
                  </td>
                )}
                {access.seeValues && <td className="num max-lg:hidden">{money2(i.net, region)}</td>}
                {access.seeValues && (
                  <td className="num max-lg:hidden">
                    {money2(vatOf(i), region)}
                    <span className="block text-[0.87rem] text-muted">{i.vatPct}%</span>
                  </td>
                )}
                {access.seeValues && (
                  <td className={cx("num font-medium max-lg:text-left", line)}>
                    {money2(gross(i.net, i.vatPct), region)}
                    <span className="font-normal text-muted lg:hidden"> with VAT at {i.vatPct}%</span>
                  </td>
                )}
                {action && <td className={cx("text-right whitespace-nowrap max-lg:pt-1.5 max-lg:text-left", line)}>{action(i)}</td>}
              </tr>
              {under && (
                <tr className={block}>
                  <td colSpan={cols} className={cx("pt-0", line)}>
                    {under(i)}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Work that is ready to bill: stage payments reached and final accounts on finished jobs. */
export function ToInvoice() {
  const { db, region, access, canEdit } = useInv();
  const rows = db.salesInvoices.filter((i) => i.status === "To invoice");
  const held = db.salesInvoices.filter((i) => i.status === "Held").length;
  const total = rows.reduce((s, i) => s + i.net, 0);
  return (
    <>
      <PageHead title="To invoice" note={`${plural(rows.length, "invoice")} ready to go${access.seeValues ? `, ${money0(total, region)} before VAT` : ""}. ${held > 0 ? `${held} more ${held === 1 ? "is" : "are"} held until extras or snagging are settled.` : ""}`} />
      <PageBody>
        <Panel className="max-w-6xl">
          {rows.length === 0 ? (
            <Empty title="Nothing is waiting to be invoiced">A final account appears here when a project is marked complete, and a stage payment when its stage is reached.</Empty>
          ) : (
            <SalesTable
              rows={rows}
              action={(i) =>
                canEdit && (
                  <Button
                    size="sm"
                    onClick={() => {
                      issueInvoice(i.id);
                      // Read back what issuing gave it: its number and the due date on the client's terms.
                      const done = useData.getState().db.salesInvoices.find((x) => x.id === i.id);
                      toast(`${done ? invoiceNo(done) : i.ref} issued, due ${dShort(done?.dueOn)}. It is on the accounts export list`);
                    }}
                  >
                    Issue invoice
                  </Button>
                )
              }
            />
          )}
        </Panel>
      </PageBody>
    </>
  );
}

/** Invoices that must not go out yet, with the reason. The hold is cleared on the project. */
export function HeldInvoices() {
  const { db, access, project } = useInv();
  const rows = db.salesInvoices.filter((i) => i.status === "Held");
  return (
    <>
      <PageHead title="Held" note="A final account is held automatically while an extra is waiting to be agreed or snagging is open, so nothing is billed short or billed twice. The reason is under each invoice." />
      <PageBody>
        <Panel className="max-w-6xl">
          {rows.length === 0 ? (
            <Empty title="Nothing is held" />
          ) : (
            <SalesTable
              rows={rows}
              // Why it is held, on a line of its own under the invoice, so a long reason never pushes the table off the page.
              under={(i) => <span className="inline-block rounded bg-warn-soft px-1.5 py-0.5 text-[0.87rem] leading-snug font-medium text-warn">{i.holdReason ?? "Held"}</span>}
              action={(i) =>
                access.may("manageProjects") ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      clearHold(i.projectId);
                      toast(`Hold cleared on ${project(i.projectId)?.code}. The invoice has moved to To invoice`);
                    }}
                  >
                    Clear hold
                  </Button>
                ) : (
                  <Link to={`/projects/${project(i.projectId)?.code}?tab=extras`} className="text-accent-ink underline-offset-2 hover:underline">
                    Open project
                  </Link>
                )
              }
            />
          )}
        </Panel>
      </PageBody>
    </>
  );
}

const BUCKETS = ["Not yet due", "1 to 30 days late", "31 to 60 days late", "Over 60 days late"] as const;
const bucket = (late: number) => (late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3);

/** What has been billed: who owes what and how late it is, then what has been paid. */
export function Invoiced() {
  const { db, day, region, access, canEdit } = useInv();
  const [show, setShow] = useState<"unpaid" | "paid">("unpaid");
  const unpaid = db.salesInvoices.filter((i) => i.status === "Invoiced").sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const paid = db.salesInvoices.filter((i) => i.status === "Paid").sort((a, b) => (b.paidOn ?? "").localeCompare(a.paidOn ?? ""));
  const late = (i: SalesInvoice) => daysBetween(i.dueOn ?? day, day);
  const owed = (n: number) => unpaid.filter((i) => bucket(late(i)) === n);
  const sum = (list: SalesInvoice[]) => list.reduce((s, i) => s + gross(i.net, i.vatPct), 0);
  return (
    <>
      <PageHead
        title="Invoiced"
        note={`${plural(unpaid.length, "invoice")} unpaid${access.seeValues ? `, ${money0(sum(unpaid), region)} owed including VAT` : ""}. ${unpaid.filter((i) => late(i) > 0).length} past their due date.`}
        actions={<Segmented label="Invoices shown" value={show} onChange={setShow} options={[{ value: "unpaid", label: "Unpaid", count: unpaid.length }, { value: "paid", label: "Paid", count: paid.length }]} />}
      />
      <PageBody className="grid max-w-6xl gap-5">
        {show === "unpaid" && access.seeValues && (
          <Section title="Aged debt">
            <Panel className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    {BUCKETS.map((b) => (
                      <th key={b} className="num">
                        {b}
                      </th>
                    ))}
                    <th className="num">Total owed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {BUCKETS.map((b, n) => (
                      <td key={b} className={cx("num", n === 3 && owed(n).length > 0 && "font-medium text-bad", n > 0 && n < 3 && owed(n).length > 0 && "text-warn")}>
                        {money0(sum(owed(n)), region)}
                        <span className="block text-[0.87rem] text-muted">{plural(owed(n).length, "invoice")}</span>
                      </td>
                    ))}
                    <td className="num font-medium">{money0(sum(unpaid), region)}</td>
                  </tr>
                </tbody>
              </table>
            </Panel>
          </Section>
        )}
        <Panel className="overflow-x-auto">
          {(show === "unpaid" ? unpaid : paid).length === 0 ? (
            <Empty title={show === "unpaid" ? "Everything billed has been paid" : "Nothing paid yet"} />
          ) : (
            <SalesTable
              rows={show === "unpaid" ? unpaid : paid}
              extra={
                show === "unpaid"
                  ? {
                      head: "Due",
                      cell: (i) => (
                        <>
                          {dFull(i.dueOn)}
                          <span className="block">
                            <Badge tone={(["neutral", "warn", "warn", "bad"] as Tone[])[bucket(late(i))]}>{late(i) > 0 ? `${plural(late(i), "day")} late` : late(i) === 0 ? "Due today" : `Due in ${plural(-late(i), "day")}`}</Badge>
                          </span>
                        </>
                      ),
                    }
                  : { head: "Paid", cell: (i) => dFull(i.paidOn) }
              }
              action={
                show === "unpaid" && canEdit
                  ? (i) => (
                      <Button
                        size="sm"
                        onClick={() => {
                          markInvoicePaid(i.id);
                          toast(`${invoiceNo(i)} marked paid`);
                        }}
                      >
                        Mark paid
                      </Button>
                    )
                  : undefined
              }
            />
          )}
        </Panel>
      </PageBody>
    </>
  );
}

/** Sends issued invoices to the accounts package as a file in that package's own layout. */
export function AccountsExport() {
  const { db, canEdit, project, client } = useInv();
  const pkg = usePrefs((s) => s.brand.accountsPackage);
  const setBrand = usePrefs((s) => s.setBrand);
  const issued = db.salesInvoices.filter((i) => i.issuedOn).sort((a, b) => (a.issuedOn ?? "").localeCompare(b.issuedOn ?? ""));
  const waiting = issued.filter((i) => !i.exportedAt);
  const row = (i: SalesInvoice): ExportRow => ({ accountRef: client(i.clientId)?.accountRef ?? "", clientName: client(i.clientId)?.name ?? "", invoiceNo: invoiceNo(i), issuedOn: i.issuedOn!, dueOn: i.dueOn ?? i.issuedOn!, details: `${project(i.projectId)?.code} ${i.description}`, net: i.net, vatPct: i.vatPct, siteCode: project(i.projectId)?.code ?? "" });
  const file = buildExport(pkg, waiting.map(row));
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    markExported(waiting.map((i) => i.id), PACKAGE_NAME[pkg]);
    toast(`${plural(waiting.length, "invoice")} exported for ${PACKAGE_NAME[pkg]}`);
  };
  return (
    <>
      <PageHead
        title="Accounts export"
        note={`Sales invoices you issue and supplier invoices you confirm go to ${PACKAGE_NAME[pkg]} as files it can import, so nobody types them in twice. ${plural(waiting.length, "sales invoice")} waiting. VAT returns, bank reconciliation and payroll stay in ${PACKAGE_NAME[pkg]}.`}
        actions={
          canEdit && (
            <Button variant="primary" disabled={waiting.length === 0} onClick={download}>
              Download file for {PACKAGE_NAME[pkg]}
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[0.93rem] text-muted">Accounts package</span>
          <Segmented label="Accounts package" value={pkg} onChange={(v) => setBrand({ accountsPackage: v })} options={[{ value: "sage50", label: "Sage 50" }, { value: "xero", label: "Xero" }, { value: "sheet", label: "Spreadsheet" }]} />
        </div>
      </PageHead>
      <PageBody className="grid max-w-6xl gap-5">
        <h2 className="text-[1.15rem]">Sales invoices</h2>
        <Section title={`Waiting to go (${waiting.length})`}>
          <Panel className="overflow-x-auto">{waiting.length === 0 ? <Empty title="Everything issued has been exported">Issue an invoice under To invoice and it will appear here.</Empty> : <SalesTable rows={waiting} extra={{ head: "Issued", cell: (i) => dFull(i.issuedOn) }} />}</Panel>
        </Section>
        {waiting.length > 0 && (
          <Section title={`What ${PACKAGE_NAME[pkg]} will receive`} aside={file.fileName}>
            <Panel className="overflow-x-auto">
              <pre className="px-3 py-2.5 font-mono text-[0.87rem] leading-relaxed whitespace-pre">{file.text.trim()}</pre>
            </Panel>
            <p className="mt-2 text-[0.93rem] text-muted">{pkg === "sage50" ? "Sage 50 layout: one SI line per invoice, no heading row, nominal code 4000, the project number as the department, tax code T1." : pkg === "xero" ? "Xero layout: its own starred column names, one line per invoice, the site code as a tracking option." : "A plain sheet with headings, for any other package or for the accountant."}</p>
          </Section>
        )}
        <Section title="Sales invoices already exported" aside="Newest first">
          <Panel className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Client</th>
                  <th>Issued</th>
                  <th>Exported</th>
                </tr>
              </thead>
              <tbody>
                {issued.filter((i) => i.exportedAt).reverse().slice(0, 12).map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium">{i.accountsNo}</td>
                    <td>{client(i.clientId)?.name}</td>
                    <td>{dFull(i.issuedOn)}</td>
                    <td className="text-muted">{dFull(i.exportedAt?.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
        <Purchases />
      </PageBody>
    </>
  );
}

/** Confirmed supplier invoices as purchase invoices, with nominal codes and the project as the department (Oldstone call, 16 Nov). */
function Purchases() {
  const { db, region, canEdit, access, project } = useInv();
  const pkg = usePrefs((s) => s.brand.accountsPackage);
  const confirmed = db.supplierInvoices.filter((s) => s.readStatus === "confirmed" && !s.exportedAt).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));
  const ready = confirmed.filter(readyToExport);
  const waiting = confirmed.filter((s) => !readyToExport(s));
  const lines: PurchaseLine[] = ready.flatMap((s) => purchaseLines(s, (id) => project(id)?.code ?? ""));
  const file = buildPurchaseExport(pkg, lines);
  const canSignOff = access.may("answerRequests");
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[1.15rem]">Supplier invoices</h2>
        {canEdit && (
          <Button
            variant="primary"
            className="ml-auto"
            disabled={ready.length === 0}
            onClick={() => {
              saveFile(file.fileName, file.text);
              markPurchasesExported(ready.map((s) => s.id), PACKAGE_NAME[pkg]);
              toast(`${plural(ready.length, "supplier invoice")} exported for ${PACKAGE_NAME[pkg]}`);
            }}
          >
            Download purchase file for {PACKAGE_NAME[pkg]}
          </Button>
        )}
      </div>
      {waiting.length > 0 && (
        <Section title={`Waiting for sign-off (${waiting.length})`} aside={`Over ${money0(SIGN_OFF_OVER, region)}: the director signs these off first`}>
          <Panel className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Invoice</th>
                  <th>Project</th>
                  <th className="num">Gross</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {waiting.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.supplier}</td>
                    <td>
                      <Link to={`/invoicing/supplier?inv=${s.id}`} className="text-accent-ink underline-offset-2 hover:underline">
                        {s.invoiceNo}
                      </Link>
                    </td>
                    <td>{[...new Set(s.allocations.map((a) => project(a.projectId)?.code))].join(", ")}</td>
                    <td className="num">{money2(s.total, region)}</td>
                    <td className="text-right">
                      {canSignOff ? (
                        <Button size="sm" onClick={() => { signOffSupplierInvoice(s.id); toast(`${s.supplier} ${s.invoiceNo} signed off`); }}>
                          Sign off
                        </Button>
                      ) : (
                        <span className="text-[0.93rem] text-muted">With Admin, Requests</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      )}
      <Section title={`Ready to go (${ready.length})`}>
        <Panel className="overflow-x-auto">
          {ready.length === 0 ? (
            <Empty title="Nothing waiting">Confirm a supplier invoice to job costs and it will appear here.</Empty>
          ) : (
            <pre className="px-3 py-2.5 font-mono text-[0.87rem] leading-relaxed whitespace-pre" aria-label="Purchase file">{file.text.trim()}</pre>
          )}
        </Panel>
        {ready.length > 0 && <p className="mt-2 text-[0.93rem] text-muted">{pkg === "sage50" ? "Sage 50 layout: a PI line (PC for a credit) per job and cost heading, the supplier account, nominal code (5000 materials, 5100 carriage, 5200 plant hire, 5201 tools, 5300 subcontractors, 5900 other), the project number as the department, the supplier's invoice number, tax code T1 at 23%, and the office file number as the extra reference." : pkg === "xero" ? "Xero bills layout: one line per job and cost heading, the nominal code as the account and the site code as a tracking option." : "A plain sheet with headings, for any other package or for the accountant."}</p>}
      </Section>
    </>
  );
}

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
                    {s.readStatus === "confirmed" && !readyToExport(s) ? (
                      <Badge tone="warn" className="ml-auto">
                        Sign-off
                      </Badge>
                    ) : (
                      <Badge tone={READ[s.readStatus].tone} className="ml-auto">
                        {READ[s.readStatus].label}
                      </Badge>
                    )}
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
  const { db, region, canEdit, access } = useInv();
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
            {s.readStatus === "confirmed" && <ForAccounts s={s} canSignOff={access.may("answerRequests")} pin={pin} />}
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

/**
 * What goes to the accounts package for a confirmed invoice, with the fields Majella keys into
 * Sage by hand today (Oldstone call, 16 Nov), and the director's sign-off when it is over the limit.
 */
function ForAccounts({ s, canSignOff, pin }: { s: SupplierInvoice; canSignOff: boolean; pin: () => void }) {
  const { db, region } = useInv();
  const pkg = usePrefs((x) => x.brand.accountsPackage);
  const lines = purchaseLines(s, (id) => db.projects.find((p) => p.id === id)?.code ?? "");
  const over = needsSignOff(s);
  return (
    <Section title={`For ${PACKAGE_NAME[pkg]}`} aside={`File no. ${s.fileNo ?? "-"}`}>
      <Panel className="overflow-x-auto">
        <table className="tbl" aria-label="Purchase lines for the accounts package">
          <thead>
            <tr>
              <th>Supplier account</th>
              <th>Nominal</th>
              <th>Department</th>
              <th className="num">Net</th>
              <th>Tax code</th>
              <th className="num">VAT</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{l.accountRef}</td>
                <td>
                  {l.nominal}
                  <span className="block text-[0.87rem] text-muted">{Object.values(NOMINAL).find((n) => n.code === l.nominal)?.name}</span>
                </td>
                <td>
                  {l.dept}
                  <span className="block text-[0.87rem] text-muted">{l.siteCode}</span>
                </td>
                <td className="num">{money2(l.type === "PC" ? -l.net : l.net, region)}</td>
                <td>{l.taxCode}</td>
                <td className="num">{money2(l.type === "PC" ? -l.tax : l.tax, region)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.93rem]">
        {s.exportedAt ? (
          <Badge tone="ok">Sent to {PACKAGE_NAME[pkg]} {dFull(s.exportedAt.slice(0, 10))}</Badge>
        ) : over && !s.signOff ? (
          <Badge tone="warn">Over {money0(SIGN_OFF_OVER, region)}: waiting for the director to sign off</Badge>
        ) : (
          <Badge tone="accent">Ready for the next accounts export</Badge>
        )}
        {s.signOff && <span className="text-muted">Signed off by {s.signOff.by} on {dFull(s.signOff.at.slice(0, 10))}.</span>}
        {over && !s.signOff && canSignOff && (
          <Button
            size="sm"
            variant="primary"
            className="ml-auto"
            onClick={() => {
              pin();
              signOffSupplierInvoice(s.id);
              toast(`${s.supplier} ${s.invoiceNo} signed off. It goes with the next accounts export`);
            }}
          >
            Sign off
          </Button>
        )}
      </div>
    </Section>
  );
}

/** Cost against value for every job that is running or just finished. */
export function JobCosts() {
  const { db, day, region, access } = useInv();
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
      <PageHead
        title="Job costs"
        note="Labour comes from the timesheets at each person's rate, everything else from supplier invoices once they are confirmed. Margin so far compares cost with the value of the work done."
        actions={
          <Button
            onClick={() => {
              saveFile(
                `profitability-report-${day}.csv`,
                profitabilityCsv(rows.map(({ p, labour, plant, material, other, earned }) => ({ code: p.code, name: p.name, contract: p.value ?? 0, done: r2(earned), labour, material, plant, other }))),
              );
              toast("Profitability report downloaded");
            }}
          >
            Download profitability report
          </Button>
        }
      />
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
