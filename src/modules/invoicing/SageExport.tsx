import { useState } from "react";
import { Link } from "react-router-dom";
import { markExported } from "@/data/actions";
import { usePrefs } from "@/data/store";
import type { SalesInvoice } from "@/data/types";
import { buildExport, exportTable, exportTotals, PACKAGE_NAME } from "@/lib/accounts-export";
import { invoiceNo } from "@/lib/billing";
import { dFull, plural, tOf } from "@/lib/format";
import { exportRowOf, SALES_NOMINALS } from "@/lib/invoices";
import { money2 } from "@/lib/money";
import { Button, cx, Empty, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { saveFile, useInv } from "./shared";

const LINK = "text-accent-ink underline-offset-2 hover:underline";

/**
 * Sends invoices to the accounts package as a file in that package's own layout. The table on
 * screen is the file, row for row, so anyone can see what the package will take in before it
 * goes. The log keeps every file that has gone, and gives it again if it is needed.
 */
export function AccountsExport() {
  const { db, canEdit, region, project, client } = useInv();
  const pkg = usePrefs((s) => s.brand.accountsPackage);
  const setBrand = usePrefs((s) => s.setBrand);
  const [tab, setTab] = useState<"waiting" | "log">("waiting");
  const name = PACKAGE_NAME[pkg];
  const rowOf = (i: SalesInvoice) => exportRowOf(i, client(i.clientId), project(i.projectId));
  const issued = db.salesInvoices.filter((i) => i.issuedOn).sort((a, b) => (a.issuedOn ?? "").localeCompare(b.issuedOn ?? "") || invoiceNo(a).localeCompare(invoiceNo(b)));
  const waiting = issued.filter((i) => !i.exportedAt);
  const rows = waiting.map(rowOf);
  const table = exportTable(pkg, rows);
  const totals = exportTotals(rows);
  const numbers = new Set(waiting.map(invoiceNo));
  // Invoices exported at the same moment went in the same file.
  const batches = [...new Set(issued.filter((i) => i.exportedAt).map((i) => i.exportedAt!))].sort().reverse().map((at) => ({ at, list: issued.filter((i) => i.exportedAt === at) }));

  const download = () => {
    const file = buildExport(pkg, rows);
    saveFile(file.fileName, file.text, "text/csv");
    markExported(waiting.map((i) => i.id), name);
    toast(`${plural(waiting.length, "invoice")} exported for ${name}. The file is in the export log`);
  };
  const again = (list: SalesInvoice[]) => {
    const file = buildExport(pkg, list.map(rowOf));
    saveFile(file.fileName, file.text, "text/csv");
    toast(`${file.fileName} downloaded again`);
  };

  return (
    <>
      <PageHead
        title={`${name} export`}
        note={`Invoices that have been sent go to ${name} as a file it imports, so nobody types them in twice. ${plural(waiting.length, "invoice")} waiting, ${issued.length - waiting.length} already there.`}
        actions={
          canEdit &&
          tab === "waiting" && (
            <Button variant="primary" disabled={waiting.length === 0} onClick={download}>
              Download CSV for {name}
            </Button>
          )
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <Segmented label="Export shown" value={tab} onChange={setTab} options={[{ value: "waiting", label: "Waiting to go", count: waiting.length }, { value: "log", label: "Export log", count: batches.length }]} />
          <span className="flex items-center gap-2">
            <span className="text-[0.93rem] text-muted">Accounts package</span>
            <Segmented label="Accounts package" value={pkg} onChange={(v) => setBrand({ accountsPackage: v })} options={[{ value: "sage50", label: "Sage 50" }, { value: "xero", label: "Xero" }, { value: "sheet", label: "Spreadsheet" }]} />
          </span>
        </div>
      </PageHead>
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        {tab === "waiting" ? (
          <>
            <p className="max-w-[90ch] text-muted">
              {pkg === "sage50"
                ? `Sales day book, one row per invoice, with no heading row in the file. Nominal codes: ${SALES_NOMINALS.map(([code, what]) => `${code} ${what.toLowerCase()}`).join(", ")}. Dept is the project number. Tax codes: T3 is 13.5%, T1 the standard rate, T0 no VAT. ${name} works out the VAT return itself; nothing here touches it.`
                : pkg === "xero"
                  ? "Xero's own sales invoice layout: its starred column names, one line per invoice, the site code as a tracking option."
                  : "A plain sheet with headings, for any other package or for the accountant."}
            </p>
            <Panel className="overflow-x-auto">
              {waiting.length === 0 ? (
                <Empty title={`Everything sent is already in ${name}`}>Send an invoice from Client invoices and it will wait here for the next export.</Empty>
              ) : (
                <table className="tbl" aria-label={`What ${name} will receive`}>
                  <thead>
                    <tr>
                      {table.head.map((h, n) => (
                        <th key={h} className={cx(table.numeric.includes(n) && "num")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((r, k) => (
                      <tr key={k}>
                        {r.map((v, n) => (
                          <td key={n} className={cx("whitespace-nowrap", table.numeric.includes(n) && "num")}>
                            {numbers.has(String(v)) ? (
                              <Link to={`/invoicing/client/${v}`} className={LINK}>
                                {v}
                              </Link>
                            ) : (
                              v
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
            {waiting.length > 0 && (
              <p className="text-[0.93rem] text-muted">
                {plural(waiting.length, "row")}. Net {money2(totals.net, region)}, VAT {money2(totals.vat, region)}. The file will be {buildExport(pkg, rows).fileName}.
              </p>
            )}
          </>
        ) : (
          <Section title="Files that have gone" aside="Newest first">
            <Panel className="overflow-x-auto">
              {batches.length === 0 ? (
                <Empty title="Nothing has been exported yet" />
              ) : (
                <table className="tbl">
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
                    {batches.map((b) => {
                      const t = exportTotals(b.list.map(rowOf));
                      return (
                        <tr key={b.at}>
                          <td className="whitespace-nowrap">
                            {dFull(b.at.slice(0, 10))}
                            <span className="block text-[0.87rem] text-muted">at {tOf(b.at)}</span>
                          </td>
                          <td>
                            <span className="flex max-w-[44rem] flex-wrap gap-x-3 gap-y-0.5">
                              {b.list.map((i) => (
                                <Link key={i.id} to={`/invoicing/client/${invoiceNo(i)}`} className={LINK}>
                                  {invoiceNo(i)}
                                </Link>
                              ))}
                            </span>
                            <span className="block text-[0.87rem] text-muted">{plural(b.list.length, "invoice")}</span>
                          </td>
                          <td className="num">{money2(t.net, region)}</td>
                          <td className="num">{money2(t.vat, region)}</td>
                          <td className="text-right">
                            <Button size="sm" onClick={() => again(b.list)}>
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
        )}
      </PageBody>
    </>
  );
}
