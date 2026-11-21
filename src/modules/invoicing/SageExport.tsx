import { DownloadSimple } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { markExported, markPurchasesExported } from "@/data/actions";
import type { SalesInvoice, SupplierInvoice } from "@/data/types";
import { ACCOUNTS_EXPORT, buildPurchaseExport, buildSalesExport, exportTotals, PACKAGE, purchaseTable, purchaseTotals, salesTable } from "@/lib/accounts-export";
import { invoiceNo } from "@/lib/billing";
import { dFull, dShort, plural, tOf } from "@/lib/format";
import { exportRowOf, SALES_NOMINALS } from "@/lib/invoices";
import { money2 } from "@/lib/money";
import { PURCHASE_NOMINALS, purchaseRows } from "@/lib/purchases";
import { Button, cx, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { purchaseAddress } from "./Purchases";
import { saveFile, useInv } from "./shared";

const LINK = "text-accent-ink underline-offset-2 hover:underline";
type Book = "sales" | "purchases";
type Shown = "all" | "new" | "sent";

/** One row on screen: the cells Sage gets, the invoice it belongs to, and when Sage had it. */
type Row = { cells: (string | number)[]; to: string; ref: string; sentAt?: string };

/**
 * Sends invoices to Sage as a file it imports. One list, laid out row for row as the file is,
 * so anyone can see what Sage will take in. Each row says whether Sage already has it; the
 * download takes only the rows it does not have, so nothing goes in twice. Every file that
 * has gone is kept below and can be had again.
 */
export function AccountsExport() {
  const { db, canEdit, region, project, client } = useInv();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState<Shown>("all");
  const book: Book = params.get("book") === "purchases" ? "purchases" : "sales";
  // Out of Finance since 21 Nov: an old link lands on the client invoices.
  if (!ACCOUNTS_EXPORT) return <Navigate to="/invoicing" replace />;

  // Sales day book: every client invoice that has been sent.
  const rowOf = (i: SalesInvoice) => exportRowOf(i, client(i.clientId), project(i.projectId));
  const issued = db.salesInvoices.filter((i) => i.issuedOn);
  // Purchase day book: every supplier and subcontractor invoice that has been approved.
  const linesOf = (s: SupplierInvoice) => purchaseRows(s, db.projects, db.subcontractors);
  const approved = db.supplierInvoices.filter((s) => s.readStatus === "confirmed");

  const newSales = issued.filter((i) => !i.exportedAt);
  const newBought = approved.filter((s) => !s.exportedAt);
  const table = book === "sales" ? salesTable([]) : purchaseTable([]);
  const all: Row[] =
    book === "sales"
      ? issued.map((i) => ({ cells: salesTable([rowOf(i)]).rows[0]!, to: `/invoicing/client/${invoiceNo(i)}`, ref: invoiceNo(i), sentAt: i.exportedAt }))
      : approved.flatMap((s) => purchaseTable(linesOf(s)).rows.map((cells) => ({ cells, to: purchaseAddress(s), ref: s.invoiceNo, sentAt: s.exportedAt })));
  // What Sage does not have yet comes first; then the newest that it has.
  const order = (r: Row) => (r.sentAt ? `1${r.sentAt}` : "2");
  const rows = all.filter((r) => shown === "all" || (shown === "new") === !r.sentAt).sort((a, b) => order(b).localeCompare(order(a)) || b.ref.localeCompare(a.ref));
  const waiting = book === "sales" ? newSales.length : newBought.length;
  const totals = book === "sales" ? exportTotals(newSales.map(rowOf)) : purchaseTotals(newBought.flatMap(linesOf));
  const fileName = book === "sales" ? buildSalesExport(newSales.map(rowOf)).fileName : buildPurchaseExport(newBought.flatMap(linesOf)).fileName;
  // Invoices exported at the same moment went in the same file.
  const stamped = book === "sales" ? issued.map((i) => i.exportedAt) : approved.map((s) => s.exportedAt);
  const batches = [...new Set(stamped.filter((t): t is string => !!t))].sort().reverse();

  const download = () => {
    if (book === "sales") {
      const file = buildSalesExport(newSales.map(rowOf));
      saveFile(file.fileName, file.text, "text/csv");
      markExported(newSales.map((i) => i.id), PACKAGE);
    } else {
      const file = buildPurchaseExport(newBought.flatMap(linesOf));
      saveFile(file.fileName, file.text, "text/csv");
      markPurchasesExported(newBought.map((s) => s.id), PACKAGE);
    }
    toast(`${plural(waiting, "invoice")} exported for ${PACKAGE}. The file is kept under Earlier files`);
  };
  const again = (at: string) => {
    const file = book === "sales" ? buildSalesExport(issued.filter((i) => i.exportedAt === at).map(rowOf)) : buildPurchaseExport(approved.filter((s) => s.exportedAt === at).flatMap(linesOf));
    saveFile(file.fileName, file.text, "text/csv");
    toast(`${file.fileName} downloaded again`);
  };
  const inBatch = (at: string) => (book === "sales" ? issued.filter((i) => i.exportedAt === at).map((i) => ({ no: invoiceNo(i), to: `/invoicing/client/${invoiceNo(i)}` })) : approved.filter((s) => s.exportedAt === at).map((s) => ({ no: s.invoiceNo, to: purchaseAddress(s) })));
  const batchTotals = (at: string) => (book === "sales" ? exportTotals(issued.filter((i) => i.exportedAt === at).map(rowOf)) : purchaseTotals(approved.filter((s) => s.exportedAt === at).flatMap(linesOf)));
  const nominals = book === "sales" ? SALES_NOMINALS.map(([code, what]) => `${code} ${what}`) : Object.values(PURCHASE_NOMINALS).map(([code, what]) => `${code} ${what}`);

  return (
    <>
      <PageHead title={`${PACKAGE} export`} note={`Invoices go to ${PACKAGE} as a file it imports, so nobody types them in twice. ${plural(newSales.length, "client invoice")} and ${plural(newBought.length, "supplier or subcontractor invoice")} not yet in ${PACKAGE}. ${PACKAGE} keeps the VAT return, payroll and the bank: nothing here touches them.`}>
        <div className="mt-3 max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
          <Segmented
            label="Day book"
            value={book}
            onChange={(v) => {
              setShown("all");
              setParams(v === "purchases" ? { book: "purchases" } : {});
            }}
            options={[
              { value: "sales", label: "Sales", count: newSales.length },
              { value: "purchases", label: "Purchases", count: newBought.length },
            ]}
          />
        </div>
      </PageHead>
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="mr-auto max-w-[92ch] text-muted">
            {book === "sales" ? "Sales day book, one row per invoice" : "Purchase day book, one row per line of each approved invoice"}, nominal codes {nominals.join(", ")}. Dept is the site number.{book === "purchases" ? " Ref is their invoice number, Ex ref our file number." : ""}
          </p>
          {canEdit && (
            <Button variant="primary" disabled={waiting === 0} onClick={download}>
              <DownloadSimple size={16} /> Download CSV
            </Button>
          )}
        </div>
        <div className="max-w-full min-w-0 overflow-x-auto whitespace-nowrap">
          <Segmented
            label="Rows shown"
            value={shown}
            onChange={setShown}
            options={[
              { value: "all", label: "All", count: all.length },
              { value: "new", label: `Not yet in ${PACKAGE}`, count: all.filter((r) => !r.sentAt).length },
              { value: "sent", label: `In ${PACKAGE}`, count: all.filter((r) => r.sentAt).length },
            ]}
          />
        </div>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={shown === "new" ? `Everything is already in ${PACKAGE}` : shown === "sent" ? `Nothing has gone to ${PACKAGE} yet` : "Nothing to export yet"}>
              {book === "sales" ? "Send an invoice from Client invoices and it appears here for the next export." : "An invoice appears here as soon as it is approved."}
            </Empty>
          ) : (
            <table className="tbl" aria-label={`What ${PACKAGE} receives, ${book}`}>
              <thead>
                <tr>
                  {table.head.map((h, n) => (
                    <th key={h} className={cx(table.numeric.includes(n) && "num")}>
                      {h}
                    </th>
                  ))}
                  <th>In {PACKAGE}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, k) => (
                  <tr key={k}>
                    {r.cells.map((v, n) => (
                      <td key={n} className={cx(n === 6 ? "min-w-[16rem]" : "whitespace-nowrap", table.numeric.includes(n) && "num")}>
                        {n === 5 ? (
                          <Link to={r.to} className={LINK}>
                            {v}
                          </Link>
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                    <td className="whitespace-nowrap">{r.sentAt ? dShort(r.sentAt.slice(0, 10)) : <span className="font-medium text-warn">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="text-[0.93rem] text-muted">
          {waiting === 0 ? `Everything here is already in ${PACKAGE}.` : `${plural(waiting, "invoice")} not yet in ${PACKAGE}: net ${money2(totals.net, region)}, VAT ${money2(totals.vat, region)}. Download CSV takes only these, as ${fileName}, with no heading row.`} Tax codes: {region === "UK" ? "T1 is the standard rate, T5 is 5%, T0 no VAT." : "T3 is 13.5%, T1 the standard rate, T0 no VAT."}
        </p>
        <Section title="Earlier files" aside="Newest first">
          <Panel className="overflow-x-auto">
            {batches.length === 0 ? (
              <Empty title={`Nothing has gone to ${PACKAGE} yet`} />
            ) : (
              <table className="tbl" aria-label="Earlier files">
                <thead>
                  <tr>
                    <th>Exported</th>
                    <th>Invoices in the file</th>
                    <th className="num">Net</th>
                    <th className="num">VAT</th>
                    <th aria-label="Download" />
                  </tr>
                </thead>
                <tbody>
                  {batches.map((at) => {
                    const list = inBatch(at);
                    const t = batchTotals(at);
                    return (
                      <tr key={at}>
                        <td className="whitespace-nowrap">
                          {dFull(at.slice(0, 10))}
                          <span className="block text-[0.87rem] text-muted">at {tOf(at)}</span>
                        </td>
                        <td>
                          <span className="flex max-w-[44rem] flex-wrap gap-x-3 gap-y-0.5">
                            {list.slice(0, 12).map((i) => (
                              <Link key={`${i.no}|${i.to}`} to={i.to} className={LINK}>
                                {i.no}
                              </Link>
                            ))}
                            {list.length > 12 && <span className="text-muted">and {list.length - 12} more</span>}
                          </span>
                          <span className="block text-[0.87rem] text-muted">{plural(list.length, "invoice")}</span>
                        </td>
                        <td className="num">{money2(t.net, region)}</td>
                        <td className="num">{money2(t.vat, region)}</td>
                        <td className="text-right">
                          <Button size="sm" onClick={() => again(at)}>
                            Download again
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
