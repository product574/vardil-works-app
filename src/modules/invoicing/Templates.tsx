import { useState } from "react";
import { Link } from "react-router-dom";
import { useClientLook } from "@/app/workspace";
import { actorName } from "@/data/actions";
import { useInvoiceDesign, useInvoiceEmail, usePrefs } from "@/data/store";
import { invoiceNo } from "@/lib/billing";
import { DEFAULT_EMAIL, emailFor, type InvoiceDesign, PLACEHOLDERS, pdfName } from "@/lib/invoices";
import { Button, Field, PageBody, PageHead, Panel, Section, Switch } from "@/ui";
import { toast } from "@/ui/toast";
import { downloadInvoicePdf, InvoicePaper, useInv, useInvoiceDoc } from "./shared";

const LINK = "text-accent-ink underline-offset-2 hover:underline";

/** The invoice the templates are previewed with: the newest one that has gone out, or failing that any. */
function useSample() {
  const { db, project, client } = useInv();
  const i = [...db.salesInvoices].filter((x) => x.issuedOn).sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""))[0] ?? db.salesInvoices[0];
  return { i, c: i ? client(i.clientId) : undefined, p: i ? project(i.projectId) : undefined };
}

const SHOWS: [keyof Pick<InvoiceDesign, "showLogo" | "showBank" | "showSite" | "rule">, string, string][] = [
  ["showLogo", "Logo", "Your logo above the firm's name."],
  ["showBank", "Bank details", "Where to pay, under the terms."],
  ["showSite", "Site and our reference", "The site address and the project code."],
  ["rule", "Line in your colour", "A rule in the brand colour under the heading."],
];

/**
 * How every invoice from the firm looks: the firm's details, where to pay, the wording under the
 * totals and what is shown. The paper on the right redraws as each box changes, and the PDF is
 * drawn from the same design.
 */
export function InvoiceDesignPage() {
  const { canEdit: may } = useInv();
  // A client's invoice paper is set by Vardil in Vardil HQ (20 Nov), and shown here as it is.
  const look = useClientLook();
  const canEdit = may && !look.set;
  const design = useInvoiceDesign();
  const set = usePrefs((s) => s.setInvoiceDesign);
  const reset = usePrefs((s) => s.resetInvoiceDesign);
  const changed = usePrefs((s) => Object.keys(s.invoiceDesignEdits).length > 0);
  const logo = usePrefs((s) => s.brand.logoUrl);
  const { i, c, p } = useSample();
  const doc = useInvoiceDoc(i, c, p);
  const text = (key: keyof InvoiceDesign, label: string, hint?: string, rows?: number) => (
    <Field label={label} hint={hint}>
      {(id) =>
        rows ? (
          <textarea id={id} rows={rows} className="field" disabled={!canEdit} value={String(design[key])} onChange={(e) => set({ [key]: e.target.value })} />
        ) : (
          <input id={id} className="field" disabled={!canEdit} value={String(design[key])} onChange={(e) => set({ [key]: e.target.value })} />
        )
      }
    </Field>
  );
  return (
    <>
      <PageHead
        title="Invoice design"
        note={look.set ? (look.staff ? "Set for this client in Vardil HQ, Clients. Change it there." : "What is printed on every invoice you send. It is set up for you by Vardil: to change anything on it, contact us.") : "What is printed on every invoice you send. Changes show on the right as you type and apply to every invoice from now on, on screen, in the client's portal and in the PDF."}
        actions={
          <>
            {canEdit && changed && (
              <Button
                variant="ghost"
                onClick={() => {
                  reset();
                  toast("The invoice design is back to how it started");
                }}
              >
                Back to the starting design
              </Button>
            )}
            {doc && <Button onClick={() => void downloadInvoicePdf(doc).then((n) => toast(`${n} downloaded`))}>Download a sample PDF</Button>}
          </>
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.2fr)]">
        <div className="grid grid-cols-1 gap-5">
          <Section title="Your details">
            <Panel className="grid gap-3 px-4 py-4">
              {text("address", "Address", "One line each: street, town, county.", 3)}
              <div className="grid gap-3 sm:grid-cols-2">
                {text("phone", "Phone")}
                {text("email", "Email for accounts")}
                {text("vatNumber", "VAT number")}
                {text("companyNumber", "Company number")}
              </div>
              <p className="text-[0.93rem] text-muted">
                The firm's name, colour and logo come from{" "}
                <Link to="/settings" className={LINK}>
                  Settings, Branding
                </Link>
                {logo ? "." : ". No logo has been added yet, so the name is printed instead."}
              </p>
            </Panel>
          </Section>
          <Section title="Getting paid">
            <Panel className="grid gap-3 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {text("bankName", "Bank")}
                {text("iban", "IBAN")}
                {text("bic", "BIC")}
              </div>
              {text("terms", "Terms under the totals", "{terms} becomes each client's own payment days.", 2)}
              {text("footer", "Last line of the page")}
            </Panel>
          </Section>
          <Section title="What is shown">
            <Panel>
              <ul className="divide-y divide-line">
                {SHOWS.map(([key, label, what]) => (
                  <li key={key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{label}</span>
                      <span className="block text-[0.93rem] text-muted">{what}</span>
                    </span>
                    {canEdit ? <Switch on={design[key]} onChange={() => set({ [key]: !design[key] })} label={`Show on invoices: ${label}`} /> : <span className="text-muted">{design[key] ? "Shown" : "Hidden"}</span>}
                  </li>
                ))}
              </ul>
            </Panel>
          </Section>
        </div>
        <Section title="How it prints" aside={i ? `Shown with ${invoiceNo(i)}, ${c?.name}` : undefined}>
          {doc ? <InvoicePaper doc={doc} /> : <Panel className="px-4 py-6 text-muted">There is no invoice to preview with yet.</Panel>}
        </Section>
      </PageBody>
    </>
  );
}

/**
 * The wording of the email that carries an invoice. Words in braces are filled in for each
 * invoice; the preview shows a real one.
 */
export function EmailTemplatePage() {
  const { db, day, region, canEdit } = useInv();
  const brand = usePrefs((s) => s.brand);
  const saved = useInvoiceEmail();
  const setEmail = usePrefs((s) => s.setInvoiceEmail);
  const custom = usePrefs((s) => s.invoiceEmail !== null);
  const [subject, setSubject] = useState(saved.subject);
  const [body, setBody] = useState(saved.body);
  const { i, c, p } = useSample();
  const preview = i ? emailFor({ subject, body }, { invoice: i, number: invoiceNo(i), dueOn: i.dueOn ?? day, client: c, project: p, sender: actorName(db), company: brand.legalName, region }) : null;
  const dirty = subject !== saved.subject || body !== saved.body;
  return (
    <>
      <PageHead
        title="Email template"
        note="Every invoice email starts from this wording. Whoever sends an invoice can still change the email for that one invoice before it goes."
        actions={
          canEdit && (
            <>
              {custom && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEmail(null);
                    setSubject(DEFAULT_EMAIL.subject);
                    setBody(DEFAULT_EMAIL.body);
                    toast("Back to the standard wording");
                  }}
                >
                  Back to the standard wording
                </Button>
              )}
              <Button
                variant="primary"
                disabled={!dirty || !subject.trim() || !body.trim()}
                onClick={() => {
                  setEmail({ subject: subject.trim(), body });
                  toast("Email template saved. The next invoice sent will use it");
                }}
              >
                Save template
              </Button>
            </>
          )
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Section title="Template">
          <Panel className="grid gap-3 px-4 py-4">
            <Field label="Subject">{(id) => <input id={id} className="field" disabled={!canEdit} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
            <Field label="Message">{(id) => <textarea id={id} rows={12} className="field" disabled={!canEdit} value={body} onChange={(e) => setBody(e.target.value)} />}</Field>
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Words that fill themselves in</p>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[0.93rem]">
                {PLACEHOLDERS.map(([key, means]) => (
                  <div key={key} className="contents">
                    <dt className="font-medium">{`{${key}}`}</dt>
                    <dd className="text-muted">{means}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>
        </Section>
        <Section title="As the client reads it" aside={i ? `Shown with ${invoiceNo(i)}, ${c?.name}` : undefined}>
          <Panel className="px-4 py-4">
            {preview ? (
              <>
                <p className="text-[0.93rem] text-muted">Subject</p>
                <p className="font-medium">{preview.subject}</p>
                <p className="mt-3 border-t border-line pt-3 whitespace-pre-line">{preview.body}</p>
                {i && <p className="mt-3 border-t border-line pt-3 text-[0.93rem] text-muted">Attached: {pdfName(invoiceNo(i), brand.legalName)}</p>}
              </>
            ) : (
              <p className="text-muted">There is no invoice to preview with yet.</p>
            )}
          </Panel>
        </Section>
      </PageBody>
    </>
  );
}
