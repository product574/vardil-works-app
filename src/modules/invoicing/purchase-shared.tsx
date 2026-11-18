// What the screens for supplier and subcontractor invoices share: who may approve, the badge,
// and the three confirm boxes (approve, send back, mark paid). Used from Invoicing, from
// Projects (a site manager approving a subcontractor) and from the subcontractor portal.
import { DownloadSimple } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useAccess } from "@/data/access";
import { approvePurchase, markPurchasePaid, sendBackPurchase, unmarkPurchasePaid } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Allocation, SupplierInvoice } from "@/data/types";
import { dFull } from "@/lib/format";
import { money2 } from "@/lib/money";
import { type Approver, approverWords, mayApprove, partyOf, payBy, PURCHASE_LABEL, PURCHASE_TONE, purchaseStage } from "@/lib/purchases";
import { subInsuranceFlags } from "@/lib/compliance";
import { Badge, Button, cx, Dialog, Field } from "@/ui";
import { toast } from "@/ui/toast";

export function usePurchases() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  const approver: Approver = { personId: access.personId, handles: access.may("manageInvoices"), approvesAll: access.may("approveInvoices"), approvesOwnSites: access.may("approveSubInvoices") };
  const nameOf = (id: string) => db.people.find((p) => p.id === id)?.name;
  return {
    db,
    day,
    region,
    access,
    limit,
    /** Check invoices, send them for approval, mark them paid: accounts. */
    canEdit: access.may("manageInvoices"),
    canApprove: (s: SupplierInvoice) => mayApprove(s, approver, limit, db.projects),
    waitsFor: (s: SupplierInvoice) => approverWords(s, limit, db.projects, nameOf),
    project: (id: string | undefined) => db.projects.find((p) => p.id === id),
    sub: (id: string | undefined) => db.subcontractors.find((x) => x.id === id),
  };
}

export function PurchaseBadge({ s, className }: { s: SupplierInvoice; className?: string }) {
  const stage = purchaseStage(s);
  return (
    <Badge tone={PURCHASE_TONE[stage]} className={className}>
      {PURCHASE_LABEL[stage]}
    </Badge>
  );
}

/** The copy of the invoice that came with it, to open or keep. */
export function CopyLink({ s, className }: { s: SupplierInvoice; className?: string }) {
  if (!s.copy) return null;
  return (
    <a href={s.copy.dataUrl} download={s.copy.name} className={cx("inline-flex items-center gap-1.5 font-medium text-accent-ink underline-offset-2 hover:underline", className)}>
      <DownloadSimple size={16} /> {s.copy.name}
    </a>
  );
}

const what = (s: SupplierInvoice) => (s.docType === "credit_note" ? "credit note" : "invoice");

/** The facts everyone confirming something should see first: whose it is, its number and its size. */
function Summary({ s }: { s: SupplierInvoice }) {
  const { region } = usePurchases();
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
      <dt className="text-muted">From</dt>
      <dd className="font-medium">{s.supplier}</dd>
      <dt className="text-muted">{s.docType === "credit_note" ? "Credit note" : "Invoice"}</dt>
      <dd>
        {s.invoiceNo}, dated {dFull(s.invoiceDate)}
      </dd>
      <dt className="text-muted">Amount</dt>
      <dd>
        <span className="font-medium">{money2(s.total, region)}</span> with VAT, {money2(s.subtotal, region)} before
      </dd>
    </dl>
  );
}

/**
 * "Approve this invoice?" Nothing is approved until Confirm approval is pressed. `allocations`
 * are the lines as they stand on the check screen, when it is approved straight from there.
 */
export function ApproveDialog({ s, allocations, onClose }: { s: SupplierInvoice; allocations?: Omit<Allocation, "id">[]; onClose: (done: boolean) => void }) {
  const { project, sub } = usePurchases();
  const day = useDay();
  // A subcontractor's lapsed insurance is flagged here, not held (Compliance, 18 Nov): the approver decides.
  const flags = s.subcontractorId && sub(s.subcontractorId) ? subInsuranceFlags(sub(s.subcontractorId)!, day) : [];
  const lines = allocations ?? s.allocations;
  const codes = [...new Set(lines.map((l) => project(l.projectId)).filter((p) => !!p).map((p) => `${p.code} ${p.name}`))];
  const credit = s.docType === "credit_note";
  return (
    <Dialog
      open
      onClose={() => onClose(false)}
      title={`Approve this ${what(s)}?`}
      footer={
        <>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              approvePurchase(s.id, allocations);
              toast(credit ? `${s.supplier} ${s.invoiceNo} approved and taken off job costs` : `${s.supplier} ${s.invoiceNo} approved. It is with accounts to be paid`);
              onClose(true);
            }}
          >
            Confirm approval
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Summary s={s} />
        {flags.length > 0 && <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">{flags.join(". ")}. You can still approve; ask them to send the new schedule through their portal.</p>}
        <p className="text-muted">
          {credit ? `It comes off the job costs of ${codes.join(" and ")}. Nothing is paid on a credit note.` : `It goes into the job costs of ${codes.join(" and ")}, and on to accounts, who pay it by ${dFull(payBy(s))} and mark it paid.`}
        </p>
      </div>
    </Dialog>
  );
}

/** Send it back instead of approving it, with the reason. A subcontractor reads the reason in their portal. */
export function SendBackDialog({ s, onClose }: { s: SupplierInvoice; onClose: (done: boolean) => void }) {
  const { sub } = usePurchases();
  const formId = useId();
  const [reason, setReason] = useState("");
  const contact = sub(s.subcontractorId)?.contactName;
  return (
    <Dialog
      open
      onClose={() => onClose(false)}
      title={`Send this ${what(s)} back?`}
      footer={
        <>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!reason.trim()}>
            Send it back
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) return;
          sendBackPurchase(s.id, reason);
          toast(`${s.supplier} ${s.invoiceNo} sent back`);
          onClose(true);
        }}
      >
        <Summary s={s} />
        <Field label="What is wrong with it" hint={partyOf(s) === "subcontractor" ? `${contact ?? s.supplier} reads this in their portal, beside the invoice.` : "Accounts see this on the invoice and put it right before asking again."}>
          {(id) => <textarea id={id} rows={3} className="field" value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}

/**
 * "Mark this invoice as paid?" Accounts pay through the bank, then say so here. A
 * subcontractor is told in their portal every time; the tick also emails them a remittance
 * advice. Paid can be undone afterwards.
 */
export function PaidDialog({ s, onClose }: { s: SupplierInvoice; onClose: (done: boolean) => void }) {
  const { day, sub } = usePurchases();
  const formId = useId();
  const [paidOn, setPaidOn] = useState(day);
  const [ref, setRef] = useState("");
  const [email, setEmail] = useState(true);
  const to = sub(s.subcontractorId);
  const bad = !paidOn || paidOn > day || paidOn < s.invoiceDate;
  return (
    <Dialog
      open
      onClose={() => onClose(false)}
      title="Mark this invoice as paid?"
      footer={
        <>
          <Button onClick={() => onClose(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={bad}>
            Confirm paid
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid grid-cols-1 gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (bad) return;
          markPurchasePaid(s.id, { paidOn, ref, email: !!to && email });
          toast(`${s.supplier} ${s.invoiceNo} marked paid${to ? (email ? `. ${to.contactName} is told in the portal and by email` : `. ${to.contactName} is told in the portal`) : ""}`, { label: "Undo", run: () => unmarkPurchasePaid(s.id) });
          onClose(true);
        }}
      >
        <Summary s={s} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Paid on">{(id) => <input id={id} type="date" className="field" max={day} min={s.invoiceDate} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}</Field>
          <Field label="Payment reference" hint="Optional. As on the bank transfer.">
            {(id) => <input id={id} className="field" autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} />}
          </Field>
        </div>
        {to ? (
          <div className="grid gap-1">
            <p className="text-muted">{to.name} sees it as paid in their portal as soon as you confirm.</p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Also email a remittance advice to {to.email}
            </label>
          </div>
        ) : (
          <p className="text-muted">Mark it paid once the payment has left the bank. The bank and its reconciliation stay in Sage.</p>
        )}
        {bad && <p className="text-[0.93rem] text-warn">The date paid cannot be before the invoice or after today.</p>}
      </form>
    </Dialog>
  );
}
