import { usePrefs } from "@/data/store";
import { PACKAGE } from "@/lib/accounts-export";
import { PageBody, PageHead, Panel } from "@/ui";

/**
 * What the system connects to in a real build (Admin, 16 Nov, after the templates Aodhan shared
 * all had one). In the demo nothing is connected, and the page says so: the sample data stands
 * in for each one.
 */
export function Connections() {
  const brand = usePrefs((s) => s.brand);
  const uk = brand.region === "UK";
  const rows: [name: string, what: string][] = [
    ["Microsoft 365", `Email for info@, accounts@ and each person's own mailbox. A reply approved here goes out from Outlook, in the same thread.`],
    [PACKAGE, "Client invoices and approved supplier and subcontractor invoices go across with their nominal codes and departments, so nobody types them twice. Sage keeps the VAT return, payroll and the bank."],
    [uk ? "HMRC, Construction Industry Scheme" : "Revenue, Relevant Contracts Tax", uk ? "Subcontractors verified and the right deduction taken before each payment." : "Subcontract payments notified and the deduction rate checked before each payment."],
    ["The firm's bank", "Payments in are matched to invoices each morning, so Overdue is right before anyone looks."],
    ["SharePoint", "Project files kept in the firm's own storage, one folder per project, the same folders as on each project's Files tab."],
  ];
  return (
    <>
      <PageHead title="Connections" note="The systems this connects to when it is built for a firm. In this demo nothing is connected: the sample data stands in for each one, and nothing leaves this browser." />
      <PageBody>
        <Panel className="max-w-5xl overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>System</th>
                <th>What it does here</th>
                <th>In this demo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, what]) => (
                <tr key={name}>
                  <td className="font-medium whitespace-nowrap">{name}</td>
                  <td>{what}</td>
                  <td className="whitespace-nowrap text-muted">Sample data</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </PageBody>
    </>
  );
}
