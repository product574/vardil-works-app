import { useId, useState } from "react";
import { addPurchaseInvoice } from "@/data/actions";
import type { CostCategoryKey, SupplierInvoice } from "@/data/types";
import { VAT_RATES } from "@/lib/invoices";
import { readProof } from "@/lib/image";
import { suggestCategory } from "@/lib/job-costs";
import { money2, r2 } from "@/lib/money";
import { addPurchaseProblem, ARRIVED, knownPayees, readInvoiceName } from "@/lib/purchases";
import { Button, Dialog, Field, NumInput, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { usePurchases } from "./purchase-shared";

/** Cost headings in the words used on screen. The keys match src/lib/job-costs.ts. */
export const HEADINGS: [CostCategoryKey, string][] = [
  ["material", "Materials"],
  ["plant", "Hired plant"],
  ["equipment", "Equipment"],
  ["labour", "Labour and subcontractors"],
  ["transport", "Transport"],
  ["other", "Other"],
];

/**
 * Add invoice (20 Nov, decision 237): how a supplier's or subcontractor's invoice gets into Money
 * out. The office chooses the PDF or photographs the paper, checks the boxes against it, picks the
 * job, and it goes for approval: the job's site manager, then the managing director, under the
 * firm's chain (Admin, Invoice approvals). Whoever adds it is the one who checks it, so there is
 * no second look by accounts in between.
 *
 * In this demo the file's name is read for who it is from, its number and the job (REAL BUILD: the
 * invoice itself is read). Every box can be changed before it is added.
 */
export function AddInvoiceDialog({ onClose }: { onClose: (id?: string) => void }) {
  const { db, day, region, chain, waitsFor } = usePurchases();
  const formId = useId();
  const rates = VAT_RATES[region];
  const payees = knownPayees(db.supplierInvoices, db.subcontractors);
  const jobs = db.projects.filter((p) => p.status === "Live" || p.status === "Complete" || p.status === "Not started").sort((a, b) => b.code.localeCompare(a.code));
  const [copy, setCopy] = useState<{ name: string; dataUrl: string } | null>(null);
  const [fileError, setFileError] = useState("");
  const [read, setRead] = useState("");
  const [from, setFrom] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(day);
  const [description, setDescription] = useState("");
  const [net, setNet] = useState(0);
  const [vatPct, setVatPct] = useState(rates[1]?.pct ?? rates[0]!.pct);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<CostCategoryKey>("material");
  const [via, setVia] = useState<NonNullable<SupplierInvoice["via"]>>("email");
  const [tried, setTried] = useState(false);

  const sub = db.subcontractors.find((s) => s.name.trim().toLowerCase() === from.trim().toLowerCase());
  const job = db.projects.find((p) => p.id === projectId);
  const vat = r2((net * vatPct) / 100);
  const problem = addPurchaseProblem({ from, invoiceNo, invoiceDate, net, projectId }, day, db.supplierInvoices);
  // Who it will wait for, worked out from the same rule the queue uses.
  const next = job ? waitsFor({ party: sub ? "subcontractor" : "supplier", subtotal: net, allocations: [{ id: "x", projectId, category, amount: net, description }], siteStep: chain !== "accounts-limit" } as SupplierInvoice) : "";

  const pick = (f: File) => {
    setFileError("");
    readProof(f)
      .then((c) => {
        setCopy(c);
        const got = readInvoiceName(c.name, payees, db.projects.map((p) => p.code));
        const found: string[] = [];
        if (got.from && !from.trim()) {
          setFrom(got.from);
          found.push(`from ${got.from}`);
          // A subcontractor's work carries the building rate; a supplier's goods the standard rate.
          if (db.subcontractors.some((s) => s.name === got.from)) setVatPct(rates[0]!.pct);
        }
        if (got.invoiceNo && !invoiceNo.trim()) {
          setInvoiceNo(got.invoiceNo);
          found.push(`number ${got.invoiceNo}`);
        }
        const p = got.code ? db.projects.find((x) => x.code === got.code) : undefined;
        if (p && !projectId) {
          setProjectId(p.id);
          found.push(`job ${p.code}`);
        }
        setRead(found.length ? `Read from the file's name: ${found.join(", ")}. Check each box against the invoice.` : "Nothing could be read from the file's name. Fill in the boxes from the invoice.");
      })
      .catch(() => {
        setCopy(null);
        setFileError("Choose a PDF or a photo of the invoice. A PDF can be up to 1.2 MB in this demo.");
      });
  };

  const add = (send: boolean) => {
    setTried(true);
    if (problem) return;
    const id = addPurchaseInvoice({ from, invoiceNo, invoiceDate, description, net, vatPct, projectId, category, via, ...(copy ? { copy } : {}), send });
    if (!id) return;
    toast(send ? `Added. Waiting for ${next}` : "Added. It waits in Money out to be checked");
    onClose(id);
  };

  return (
    <Dialog
      open
      onClose={() => onClose()}
      title="Add an invoice"
      wide
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button onClick={() => add(false)}>Save to check later</Button>
          <Button variant="primary" type="submit" form={formId}>
            Add and send for approval
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(true);
        }}
      >
        <div className="sm:col-span-2">
          <p className="mb-1 text-[0.93rem] font-medium">1. The invoice itself</p>
          <PickFile accept="image/*,application/pdf" what="copy of the invoice" onFile={pick} chosen={copy?.name} />
          <p className="mt-1 text-[0.87rem] text-muted">{read || "The PDF from the email, or a photo of the paper. Whoever approves it sees this copy beside the figures."}</p>
          <p role="alert" className="text-bad">
            {fileError}
          </p>
        </div>
        <p className="text-[0.93rem] font-medium sm:col-span-2">2. Check it against the invoice</p>
        <Field label="Who it is from" hint={sub ? `${sub.name} is a subcontractor on file, so this goes in with their invoices.` : "Start typing: suppliers and subcontractors on file are offered."}>
          {(id) => (
            <>
              <input id={id} className="field" list={`${id}-names`} autoComplete="off" value={from} onChange={(e) => setFrom(e.target.value)} />
              <datalist id={`${id}-names`}>
                {payees.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Invoice number">{(id) => <input id={id} className="field" autoComplete="off" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />}</Field>
        <Field label="Invoice date">{(id) => <input id={id} type="date" className="field" max={day} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />}</Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">How it arrived</p>
          <Segmented label="How it arrived" value={via} onChange={setVia} options={ARRIVED} />
        </div>
        <Field label="What it is for" className="sm:col-span-2">
          {(id) => (
            <input
              id={id}
              className="field"
              value={description}
              placeholder="Lime putty, 40 tubs"
              onChange={(e) => {
                setDescription(e.target.value);
                // The cost heading follows the wording until someone picks one themselves.
                if (!sub) setCategory(suggestCategory(e.target.value) as CostCategoryKey);
              }}
            />
          )}
        </Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Amount before VAT</p>
          <NumInput label="Amount before VAT" className="w-full" value={net} onChange={setNet} />
        </div>
        <Field label="VAT" hint={`VAT ${money2(vat, region)}. Total ${money2(r2(net + vat), region)}.`}>
          {(id) => (
            <select id={id} className="field" value={vatPct} onChange={(e) => setVatPct(Number(e.target.value))}>
              {rates.map((r) => (
                <option key={r.pct} value={r.pct}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="text-[0.93rem] font-medium sm:col-span-2">3. Where it belongs</p>
        <Field label="Job">
          {(id) => (
            <select id={id} className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Choose the job</option>
              {jobs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Cost heading" hint={sub ? "A subcontractor's invoice always goes under labour and subcontractors." : undefined}>
          {(id) => (
            <select id={id} className="field" value={sub ? "labour" : category} disabled={!!sub} onChange={(e) => setCategory(e.target.value as CostCategoryKey)}>
              {HEADINGS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p role="alert" className="min-h-5 text-bad sm:col-span-2">
          {tried ? problem : ""}
        </p>
        <p className="rounded-md bg-side px-3 py-2 text-[0.93rem] text-muted sm:col-span-2">
          {job ? `Add and send for approval: it waits for ${next}. ` : "Add and send for approval: it goes to whoever approves for the job you choose. "}
          Once approved it moves to To be paid, where the office pays it and marks it paid. For an invoice that covers more than one job, use Save to check later and split its lines in Money out.
        </p>
      </form>
    </Dialog>
  );
}
