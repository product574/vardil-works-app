import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { setApprovalLimit, setPayChain } from "@/data/actions";
import { useData, usePrefs } from "@/data/store";
import type { PayChain } from "@/data/types";
import { plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { approveStep, CHAIN_WORDS, chainOf, purchaseStage } from "@/lib/purchases";
import { Button, cx, NumInput, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";

const ORDER: PayChain[] = ["site-md", "site", "accounts-limit"];

/**
 * Who approves the invoices the firm pays (20 Nov, from the call with Jimmy, Oldstone's managing
 * director: "approved by the site manager, then it goes to me ... in other organisations the site
 * manager might be enough, or it goes to the finance manager"). Set once per firm from its answers
 * to the onboarding form; the managing director's to change. Jimmy's own chain is the default.
 */
export function InvoiceApprovals() {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const chain = chainOf(db.approvalLimits);
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  const [amount, setAmount] = useState(limit);
  const waiting = db.supplierInvoices.filter((s) => purchaseStage(s) === "approve");
  const atSite = waiting.filter((s) => approveStep(s) === "site").length;
  if (!access.may("approveInvoices")) return <Navigate to="/admin" replace />;
  return (
    <>
      <PageHead
        title="Invoice approvals"
        note="Who says yes to an invoice from a supplier or a subcontractor before the office pays it. Each firm sets this from its answers to the onboarding form."
      />
      <PageBody className="grid max-w-4xl gap-4">
        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">The steps an invoice goes through</legend>
          {ORDER.map((k) => {
            const on = chain === k;
            return (
              <label key={k} className={cx("flex cursor-pointer gap-3 rounded-lg border bg-surface px-4 py-3", on ? "border-accent shadow-[inset_0_0_0_1px_var(--accent)]" : "border-line hover:border-accent")}>
                <input
                  type="radio"
                  name="chain"
                  className="mt-1 size-4.5 shrink-0 accent-[var(--accent-strong)]"
                  checked={on}
                  onChange={() => {
                    setPayChain(k);
                    toast(`Invoices now go: ${CHAIN_WORDS[k].title.toLowerCase()}`);
                  }}
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {CHAIN_WORDS[k].title}
                    {k === "site-md" && <span className="ml-2 font-normal text-muted">as Oldstone works</span>}
                  </span>
                  <ol className="mt-1 list-decimal pl-5 text-[0.93rem] text-muted">
                    {CHAIN_WORDS[k].steps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </span>
              </label>
            );
          })}
        </fieldset>

        {chain === "accounts-limit" && (
          <Panel className="flex flex-wrap items-end gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="font-medium">What accounts may approve, before VAT</p>
              <p className="text-[0.93rem] text-muted">Above this, a supplier's invoice waits for the managing director. Set it to 0 and every one does.</p>
            </div>
            <NumInput label="Limit before VAT" className="w-32" value={amount} onChange={setAmount} />
            <Button
              disabled={amount < 0 || amount === limit}
              onClick={() => {
                setApprovalLimit(amount);
                toast(`Accounts now approve supplier invoices up to ${money0(Math.round(amount), region)} before VAT`);
              }}
            >
              Save the limit
            </Button>
          </Panel>
        )}

        <p className="text-[0.93rem] text-muted">
          Invoices already waiting keep the steps they were sent with: {plural(waiting.length, "invoice")} waiting now, {atSite} of them on a site manager. A change applies to the next invoice sent for approval.{" "}
          <Link to="/invoicing/approve" className="font-medium text-accent-ink underline-offset-2 hover:underline">
            See what is waiting
          </Link>
        </p>
      </PageBody>
    </>
  );
}
