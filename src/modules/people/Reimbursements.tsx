import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { exportExpenses } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import { dFull, dShort, plural, when } from "@/lib/format";
import { money2 } from "@/lib/money";
import { owedByPerson, reimbursementCsv, sentForPayment, toPay } from "@/lib/reimbursements";
import { Badge, Button, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * Reimbursements for the office to pay (the call with Oldstone's managing director, 17 Nov:
 * "once reimbursements are approved by the director, have them ready to export to the office
 * staff to pay"). A claim made on the site phone is answered in Admin; an approved one waits
 * here until the office exports the list, and from then it is with them for payment.
 */
export function Reimbursements() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const canExport = access.may("exportPayroll");
  const waiting = db.expenses.filter((x) => x.status === "Waiting");
  const pay = toPay(db.expenses);
  const sent = sentForPayment(db.expenses);
  const person = (id: string) => db.people.find((p) => p.id === id);
  const site = (id: string | null) => db.projects.find((p) => p.id === id)?.code ?? "General";
  const total = pay.reduce((n, x) => n + x.amount, 0);
  const owed = owedByPerson(pay);
  const noNumber = owed.filter((o) => !person(o.personId)?.sageNo);
  const file = reimbursementCsv(day, pay, db.people, db.projects);
  const download = () => {
    const url = URL.createObjectURL(new Blob([file.text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName;
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    exportExpenses(pay.map((x) => x.id));
    toast(`${plural(pay.length, "reimbursement")} exported for payment, ${money2(total, region)}`);
  };
  return (
    <>
      <PageHead
        title="Reimbursements"
        note={
          pay.length === 0
            ? `Nothing is waiting to be paid.${waiting.length ? ` ${plural(waiting.length, "claim")} ${waiting.length === 1 ? "is" : "are"} still with the director for a yes or no.` : ""}`
            : `${plural(pay.length, "approved claim")} to pay back, ${money2(total, region)} to ${plural(owed.length, "person", "people")}.${waiting.length ? ` ${waiting.length} more ${waiting.length === 1 ? "is" : "are"} still with the director for a yes or no.` : ""}`
        }
        actions={
          canExport && (
            <Button variant="primary" disabled={pay.length === 0} onClick={download}>
              Export for payment
            </Button>
          )
        }
      >
        <ol className="mt-3 flex max-w-[95ch] flex-wrap gap-x-5 gap-y-1 text-[0.93rem] text-muted" aria-label="How a reimbursement gets paid">
          <li>1. Someone claims on the site phone, with the receipt.</li>
          <li>
            2. The director says yes or no in{" "}
            {access.can("admin") ? (
              <Link to="/admin" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                Admin, Requests
              </Link>
            ) : (
              "Admin, Requests"
            )}
            .
          </li>
          <li>3. The office exports the approved ones here and pays them. Each goes out once.</li>
        </ol>
      </PageHead>
      <PageBody className="grid max-w-6xl gap-6">
        <Section title={`To pay (${pay.length})`} aside={pay.length ? `${money2(total, region)} in all` : undefined}>
          <Panel className="overflow-x-auto">
            {pay.length === 0 ? (
              <Empty title="Nothing to pay">Approved reimbursements arrive here from Admin, Requests, ready to export.</Empty>
            ) : (
              <table className="tbl" aria-label="Reimbursements to pay">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Paid on</th>
                    <th>For</th>
                    <th>Site</th>
                    <th>Approved</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pay.map((x) => {
                    const p = person(x.personId);
                    return (
                      <tr key={x.id}>
                        <td className="whitespace-nowrap">
                          <span className="font-medium">{p?.name}</span>
                          <span className="block text-[0.87rem] text-muted">{p?.sageNo ? `Sage no. ${p.sageNo}` : "No Sage number"}</span>
                        </td>
                        <td className="whitespace-nowrap">{dShort(x.date)}</td>
                        <td>
                          {x.kind}
                          <span className="block text-[0.87rem] text-muted">{x.what}</span>
                        </td>
                        <td>{site(x.projectId)}</td>
                        <td className="whitespace-nowrap text-muted">
                          {x.decidedBy}
                          {x.decidedAt && <span className="block text-[0.87rem]">{when(x.decidedAt, day)}</span>}
                        </td>
                        <td className="num font-medium">{money2(x.amount, region)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5} className="border-t border-line-strong font-medium">
                      Total to pay
                    </td>
                    <td className="num border-t border-line-strong font-medium">{money2(total, region)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </Panel>
          {noNumber.length > 0 && (
            <p className="mt-2 text-[0.93rem] text-warn">
              {noNumber.map((o) => person(o.personId)?.name).join(", ")} {noNumber.length === 1 ? "has" : "have"} no Sage employee number, so the office will have to match {noNumber.length === 1 ? "that row" : "those rows"} by name.
            </p>
          )}
          {pay.length > 0 && !canExport && <p className="mt-2 text-[0.93rem] text-muted">Exporting is for whoever has "Export hours and reimbursements for payment", the accounts office by default.</p>}
        </Section>
        {pay.length > 0 && (
          <Section title="What the office will receive" aside={file.fileName}>
            <Panel className="overflow-x-auto">
              <pre className="px-3 py-2.5 font-mono text-[0.87rem] leading-relaxed whitespace-pre">{file.text.trim()}</pre>
            </Panel>
            <p className="mt-2 text-[0.93rem] text-muted">One row per claim, with the employee number payroll knows each person by. The amount is what was paid on the receipt, VAT included. How it is paid, with the wages or by bank transfer, is the office's choice.</p>
          </Section>
        )}
        <Section title={`Sent for payment (${sent.length})`}>
          <Panel className="overflow-x-auto">
            {sent.length === 0 ? (
              <Empty title="Nothing sent yet" />
            ) : (
              <table className="tbl" aria-label="Reimbursements sent for payment">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Paid on</th>
                    <th>For</th>
                    <th>Site</th>
                    <th>Sent for payment</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sent.slice(0, 30).map((x) => (
                    <tr key={x.id}>
                      <td className="font-medium whitespace-nowrap">{person(x.personId)?.name}</td>
                      <td className="whitespace-nowrap">{dFull(x.date)}</td>
                      <td>
                        {x.kind}
                        <span className="block text-[0.87rem] text-muted">{x.what}</span>
                      </td>
                      <td>{site(x.projectId)}</td>
                      <td className="whitespace-nowrap">
                        <Badge tone="ok">{when(x.exportedAt!, day)}</Badge>
                        <span className="block text-[0.87rem] text-muted">{x.exportedBy}</span>
                      </td>
                      <td className="num">{money2(x.amount, region)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
