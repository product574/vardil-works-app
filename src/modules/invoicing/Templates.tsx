import { useState } from "react";
import { useClientLook } from "@/app/workspace";
import { actorName } from "@/data/actions";
import { useInvoiceDesign, useInvoiceEmail, usePrefs } from "@/data/store";
import { invoiceNo } from "@/lib/billing";
import { DEFAULT_EMAIL, emailFor, type InvoiceDesign, PLACEHOLDERS, pdfName } from "@/lib/invoices";
import { shrinkImage } from "@/lib/image";
import { Button, Field, PageBody, PageHead, Panel, Section, Switch } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { downloadInvoicePdf, InvoicePaper, useInv, useInvoiceDoc } from "./shared";


/** The invoice the templates are previewed with: the newest one that has gone out, or failing that any. */
function useSample() {
  const { db, project, client } = useInv();
  const i = [...db.salesInvoices].filter((x) => x.issuedOn).sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""))[0] ?? db.salesInvoices[0];
  return { i, c: i ? client(i.clientId) : undefined, p: i ? project(i.projectId) : undefined };
}

const SHOWS: [keyof Pick<InvoiceDesign, "showLogo" | "showBank" | "showSite">, string, string][] = [
  ["showLogo", "Logo", "Your logo at the top right. Without it, the firm's name is printed there."],
  ["showBank", "Bank details", "Where to pay, under the terms."],
  ["showSite", "Site address", "The site's name and address, under the contract number."],
];

/**
 * What is printed on every invoice the firm sends, and nothing else (21 Nov): the logo, uploaded
 * here as a picture, the title on the page, the firm's address and contact details, its VAT
 * number, and where to pay. The layout is the one on Oldstone's own paper. The page on the right
 * redraws as each box changes, and the PDF is drawn from the same design.
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
  const setBrand = usePrefs((s) => s.setBrand);
  const [logoError, setLogoError] = useState("");
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
        note={look.set ? (look.staff ? "Set for this client in Vardil HQ, Clients. Change it there." : "What is printed on every invoice you send. It is set up for you by Vardil: to change anything on it, contact us.") : "Only what is printed on the invoices you send: your logo, the title, your address and contact details, your VAT number and where to pay. Changes show on the right as you type and apply to every invoice from now on, on screen and in the PDF."}
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
          <Section title="Logo">
            <Panel className="grid gap-2 px-4 py-4">
              <div className="flex flex-wrap items-center gap-3">
                {logo ? <img src={logo} alt="The logo on your invoices" className="h-12 w-auto max-w-[12rem] rounded border border-line bg-white object-contain p-1" /> : <span className="text-muted">No logo yet: the firm's name is printed instead.</span>}
                {canEdit && (
                  <>
                    <PickFile
                      accept="image/*"
                      what="logo"
                      onFile={(f) => {
                        setLogoError("");
                        shrinkImage(f, 480, 0.9)
                          .then((pic) => {
                            setBrand({ logoUrl: pic.dataUrl });
                            toast("Logo changed, here and everywhere else it shows");
                          })
                          .catch((e: Error) => setLogoError(e.message));
                      }}
                    />
                    {logo && (
                      <Button variant="ghost" onClick={() => setBrand({ logoUrl: "" })}>
                        Remove logo
                      </Button>
                    )}
                  </>
                )}
              </div>
              <p className="text-[0.87rem] text-muted">A picture from your computer or phone. A wide logo on a white or clear background prints best. It is the firm's one logo, so it changes in the top bar and on tender copies too.</p>
              <p role="alert" className="text-bad">
                {logoError}
              </p>
            </Panel>
          </Section>
          <Section title="On the page">
            <Panel className="grid gap-3 px-4 py-4">
              {text("title", "Title on the page", "Printed top left in your colour. Most firms use Invoice; type your own, such as Credit Note, and the labels follow (Credit No., Total Credit).")}
              {text("address", "Address", "One line each: street, town, county.", 3)}
              <div className="grid gap-3 sm:grid-cols-2">
                {text("phone", "Phone")}
                {text("email", "Email for accounts")}
                {text("website", "Website")}
                {text("vatNumber", "VAT number", "Printed at the foot of the page.")}
                {text("companyNumber", "Company number", "Leave empty to leave it off.")}
              </div>
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
