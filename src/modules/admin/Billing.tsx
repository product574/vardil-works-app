import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { useData, useDay, usePrefs } from "@/data/store";
import { dFull, dShort, plural } from "@/lib/format";
import { money2 } from "@/lib/money";
import { currentPlan, invoicePaid, nextInvoice } from "@/lib/subscription";
import { Badge, Button, Dialog, PageBody, PageHead, Panel, Section } from "@/ui";
import { PORTAL } from "@/lib/apps";

const monthName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * What the firm pays for this system (Admin, asked for on 16 Nov after the reference templates):
 * the plan, the next invoice, and the invoices for the three months before this one.
 */
export function Billing() {
  const db = useData((s) => s.db);
  const day = useDay();
  const brand = usePrefs((s) => s.brand);
  const [changing, setChanging] = useState(false);
  const md = useAccess().role === "md";
  const plan = currentPlan(db);
  const next = nextInvoice(db, day);
  const m = (n: number) => money2(n, brand.region);
  // What the firm pays is the managing director's to see, even when Admin is switched on for another level.
  if (!md) return <Navigate to="/admin" replace />;
  return (
    <>
      <PageHead title="Billing" note={`What ${brand.brandName} pays Vardil for this system: one invoice a month for the month before, taken by direct debit.`} />
      <PageBody className="grid max-w-4xl gap-5">
        <Panel className="px-4 py-3.5">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[1.08rem]">{plan.plan}</h2>
              <p className="mt-1">
                {plural(next.users, "person", "people")} with a sign-in, at {m(plan.perUser)} each a month before VAT. Site phones are included{PORTAL ? ", and so is the client portal" : ""}.
              </p>
              <p className="mt-1 text-muted">
                Next invoice on {dFull(next.issuedOn)}, for {monthName(next.month)}: {m(next.amount)} before VAT.
              </p>
            </div>
            <Button onClick={() => setChanging(true)}>Change plan</Button>
          </div>
        </Panel>
        <Section title="Past invoices" aside="The three months before this one">
          <Panel className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>For</th>
                  <th>Issued</th>
                  <th className="num">People</th>
                  <th className="num">Amount before VAT</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {db.subscriptionInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="font-medium whitespace-nowrap">{inv.number}</td>
                    <td className="whitespace-nowrap">{monthName(inv.month)}</td>
                    <td className="whitespace-nowrap">{dFull(inv.issuedOn)}</td>
                    <td className="num">{inv.users}</td>
                    <td className="num whitespace-nowrap">{m(inv.amount)}</td>
                    <td className="whitespace-nowrap">
                      {invoicePaid(inv, day) ? (
                        <>
                          <Badge tone="ok">Paid</Badge> <span className="text-muted">{dShort(inv.collectOn)}</span>
                        </>
                      ) : (
                        <>
                          <Badge tone="warn">Due</Badge> <span className="text-muted">Taken on {dShort(inv.collectOn)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </Section>
      </PageBody>
      <Dialog open={changing} onClose={() => setChanging(false)} title="Change plan" footer={<Button onClick={() => setChanging(false)}>Close</Button>}>
        <p>The plan follows the team. Everyone in the office or running a site who signs in counts as one person, and each invoice follows the count for its month. Operatives on the site phone {PORTAL ? "and clients in the portal " : ""}are not counted.</p>
        <p className="mt-2">
          To add someone, add them in People; who can sign in, and to what, is in{" "}
          <Link to="/admin/access" className="font-medium text-accent-ink underline decoration-accent/60 underline-offset-[3px] hover:decoration-accent" onClick={() => setChanging(false)}>
            Roles and access
          </Link>
          . To add a department or change how you pay, ask Vardil.
        </p>
      </Dialog>
    </>
  );
}
