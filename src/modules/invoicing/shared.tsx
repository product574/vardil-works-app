/**
 * Pieces every invoicing screen uses: who is looking and what they may do, the invoice drawn
 * as paper, its PDF, and the dialog that sends it.
 */
import { DownloadSimple, Eye, Paperclip } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useAccess } from "@/data/access";
import { actorName, markInvoicePaid, sendInvoice, unmarkInvoicePaid } from "@/data/actions";
import { useData, useDay, useInvoiceDesign, useInvoiceEmail, usePrefs } from "@/data/store";
import type { Client, Project, SalesInvoice } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { addDays } from "@/lib/dates";
import { dFull } from "@/lib/format";
import { money2 } from "@/lib/money";
import { asSent, billingEmail, emailFor, grossOf, type InvoiceDoc, invoiceDoc, nextAccountsNo, pdfName, STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/invoices";
import { invoicePdf, type PdfLogo } from "@/lib/pdf";
import type { PaidShown } from "@/lib/claims";
import { Badge, Button, cx, Dialog, Field, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { PORTAL } from "@/lib/apps";

export function useInv() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const project = (id: string) => db.projects.find((p) => p.id === id);
  const client = (id: string) => db.clients.find((c) => c.id === id);
  return { db, day, region, access, canEdit: access.may("manageInvoices"), project, client };
}

export function StageBadge({ i, className }: { i: SalesInvoice; className?: string }) {
  const stage = stageOf(i, useDay());
  return (
    <Badge tone={STAGE_TONE[stage]} className={className}>
      {STAGE_LABEL[stage]}
    </Badge>
  );
}

/** The document for one invoice, in the firm's design. */
export function useInvoiceDoc(i: SalesInvoice | undefined, client: Client | undefined, project: Project | undefined): InvoiceDoc | null {
  const design = useInvoiceDesign();
  const brand = usePrefs((s) => s.brand);
  const today = useDay();
  return i ? invoiceDoc({ invoice: i, client, project, design, company: brand.legalName, region: brand.region, today }) : null;
}

/**
 * The invoice as it prints. Always white paper with dark ink, in dark mode too: it is a
 * document, like the client copy of a quote.
 */
export function InvoicePaper({ doc, className }: { doc: InvoiceDoc; className?: string }) {
  const brand = usePrefs((s) => s.brand);
  const muted = "text-[#5b6875]";
  // The firm's colour, for the title, the two headings and the numbers at the foot (21 Nov, after Oldstone's own paper).
  const inColour = { color: brand.accent };
  return (
    <div aria-label={`${doc.title} ${doc.number} as the client receives it`} className={cx("rounded-lg border border-line bg-white px-7 py-7 text-[0.93rem] text-[#1b2733] shadow-pop", className)}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          <p className="font-display text-[1.6rem] leading-none font-semibold" style={inColour}>
            {doc.title}
          </p>
          {doc.stamp && <p className={cx("mt-1.5 text-[0.87rem] font-semibold tracking-wide uppercase", doc.stamp === "Paid" ? "text-[#1a7f4f]" : muted)}>{doc.stamp}</p>}
        </div>
        <div className="ml-auto text-right">
          {doc.showLogo && brand.logoUrl ? <img src={brand.logoUrl} alt={doc.seller.name} className="ml-auto h-14 w-auto max-w-[15rem] object-contain" /> : <p className="font-display text-[1.35rem] leading-tight font-semibold">{doc.seller.name}</p>}
        </div>
      </div>
      <div className="mt-7 grid gap-x-4 gap-y-4 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.85fr)_minmax(0,1.2fr)]">
        <div aria-label="Who it is to">
          {doc.billTo.map((l, n) => (
            <p key={`${n}${l}`} className={n === 0 ? "font-semibold" : undefined}>
              {l}
            </p>
          ))}
        </div>
        <div aria-label="Who it is from">
          {doc.showLogo && brand.logoUrl && <p className="font-semibold">{doc.seller.name}</p>}
          {doc.seller.address.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div className="text-[0.85rem] leading-[1.65] break-words">
          {doc.seller.contact.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
      <dl className="mt-6 ml-auto grid w-fit max-w-full grid-cols-[auto_minmax(0,auto)] gap-x-5 gap-y-0.5">
        {doc.facts.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className={cx("text-right text-[0.87rem]", muted)}>{k}:</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <table className="mt-7 w-full">
        <thead>
          <tr className="text-left">
            <th className="pb-1.5 pr-3 font-semibold underline underline-offset-4" style={inColour}>
              Description
            </th>
            <th className="pb-1.5 text-right font-semibold underline underline-offset-4" style={inColour}>
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, n) => (
            <tr key={n} className="align-top">
              <td className="py-1 pr-3">{l.description}</td>
              <td className="py-1 text-right whitespace-nowrap tabular-nums">{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-8 ml-auto grid w-72 max-w-full grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1">
        {doc.totals.map((t) => (
          <div key={t.label} className="contents">
            <dt className={cx(t.strong ? "pt-1.5 font-semibold" : muted)}>{t.label}:</dt>
            {/* The total sits between a single rule and a double one, as on a ledger. */}
            <dd className={cx("text-right tabular-nums", t.strong && "border-t border-b-[3px] border-double border-[#1b2733] pt-1.5 pb-1 font-semibold")}>{t.value}</dd>
          </div>
        ))}
      </dl>
      <div className={cx("mt-7 grid gap-0.5 text-[0.87rem]", muted)}>
        {doc.notes.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      {doc.bank.length > 0 && (
        <div className={cx("mt-3 text-[0.87rem]", muted)}>
          <p className="font-semibold text-[#1b2733]">Bank details</p>
          {doc.bank.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}
      <div className="mt-7 flex flex-wrap gap-x-8 gap-y-1 text-[0.87rem] font-semibold" style={inColour}>
        {doc.seller.registration.map(([k, v]) => (
          <p key={k}>
            {k} <span className="ml-3">{v}</span>
          </p>
        ))}
      </div>
      {doc.footer && <p className={cx("mt-2 text-[0.87rem]", muted)}>{doc.footer}</p>}
    </div>
  );
}

/** The firm's logo as the PDF needs it: a JPEG on white, with its size. Null when there is no logo or it cannot be read. */
function logoForPdf(url: string): Promise<PdfLogo | null> {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const g = canvas.getContext("2d");
        if (!g || !canvas.width) return resolve(null);
        g.fillStyle = "#fff";
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.drawImage(img, 0, 0);
        const raw = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1] ?? "");
        resolve({ jpeg: Uint8Array.from(raw, (ch) => ch.charCodeAt(0)), width: canvas.width, height: canvas.height });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function saveFile(name: string, data: Uint8Array | string, type: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Make the PDF of an invoice and hand it to the browser as a download. */
export async function downloadInvoicePdf(doc: InvoiceDoc) {
  const brand = usePrefs.getState().brand;
  const logo = doc.showLogo ? await logoForPdf(brand.logoUrl) : null;
  const name = pdfName(doc.number, brand.legalName);
  saveFile(name, invoicePdf(doc, { accent: brand.accent, logo: logo ?? undefined }), "application/pdf");
  return name;
}

/**
 * Send an invoice: the email as it will read, written from the email template and free to
 * change, with the PDF attached, and a tick for the client's portal. A draft gets its number
 * and dates as it goes.
 */
export function SendInvoiceDialog({ invoice, onClose }: { invoice: SalesInvoice | null; onClose: (sentAs?: string) => void }) {
  return invoice ? <SendForm key={invoice.id} i={invoice} onClose={onClose} /> : null;
}

function SendForm({ i, onClose }: { i: SalesInvoice; onClose: (sentAs?: string) => void }) {
  const { db, day, region, client, project } = useInv();
  const formId = useId();
  const brand = usePrefs((s) => s.brand);
  const template = useInvoiceEmail();
  const c = client(i.clientId);
  const p = project(i.projectId);
  const again = i.status === "Invoiced";
  // A draft takes the next number and its dates the moment it goes, so the email can already quote them.
  const number = again ? invoiceNo(i) : nextAccountsNo(db.salesInvoices);
  const dueOn = again ? (i.dueOn ?? day) : addDays(day, c?.termsDays ?? 30);
  const start = emailFor(template, { invoice: i, number, dueOn, client: c, project: p, sender: actorName(db), company: brand.legalName, region });
  const [to, setTo] = useState(billingEmail(c));
  const [subject, setSubject] = useState(start.subject);
  const [body, setBody] = useState(start.body);
  const [email, setEmail] = useState(true);
  const [portal, setPortal] = useState(PORTAL && !!c?.portalEnabled);
  const attachment = pdfName(number, brand.legalName);
  // The attachment as it will go: a draft already carries the number and dates it takes on sending.
  const design = useInvoiceDesign();
  const doc = invoiceDoc({ invoice: asSent(i, number, day, dueOn), client: c, project: p, design, company: brand.legalName, region, today: day });
  const okTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
  const blocked = (!email && !portal) || (email && (!okTo || !subject.trim() || !body.trim()));
  const send = () => {
    sendInvoice(i.id, { email, portal, to: to.trim(), subject: subject.trim(), body, attachment });
    const how = [email && `emailed to ${to.trim()}`, portal && "put in their portal"].filter(Boolean).join(" and ");
    toast(`${number} ${how}${again ? "" : `. Due ${dFull(dueOn)}`}`);
    onClose(number);
  };
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={again ? `Send ${number} again` : "Send this invoice to the client"}
      wide
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={blocked}>
            {again ? "Send again" : "Send invoice"}
          </Button>
        </>
      }
    >
    <form
      id={formId}
      className="grid grid-cols-1 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!blocked) send();
      }}
    >
      <p className="text-muted">
        {again ? "It goes again exactly as it was issued." : `It goes out as ${number}, dated today and due ${dFull(dueOn)} on ${c?.name ?? "the client"}'s ${c?.termsDays ?? 30} day terms.`}
      </p>
      <div className="grid gap-x-5 gap-y-1">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} /> Email it with the PDF attached
        </label>
        {PORTAL && (
          <label className={cx("flex items-center gap-2", !c?.portalEnabled && "text-muted")}>
            <input type="checkbox" checked={portal} disabled={!c?.portalEnabled} onChange={(e) => setPortal(e.target.checked)} /> Put it in the client's portal
            {!c?.portalEnabled && <span className="text-[0.87rem]">(the portal is switched off for {c?.name})</span>}
          </label>
        )}
      </div>
      {email && (
        <>
          <Field label="To" hint={c?.billingEmail ? `${c.name}'s address for invoices.` : `${c?.contactName ?? "The contact"}'s own address. A separate address for invoices can be kept under Sales, Clients.`}>
            {(id) => <input id={id} type="email" autoComplete="off" className="field" value={to} onChange={(e) => setTo(e.target.value)} />}
          </Field>
          <Field label="Subject">{(id) => <input id={id} className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
          <Field label="Message" hint="Written from the email template. Change anything for this one invoice.">
            {(id) => <textarea id={id} rows={9} className="field" value={body} onChange={(e) => setBody(e.target.value)} />}
          </Field>
          <AttachedInvoice doc={doc} name={attachment} />
        </>
      )}
      {blocked && <p className="text-[0.93rem] text-warn">{!email && !portal ? "Tick at least one way of sending it." : !okTo ? "The address it goes to is not a full email address." : "The email needs a subject and a message."}</p>}
    </form>
    </Dialog>
  );
}

/**
 * "Not paid" and "Paid" on top of every Finance list (Oisin, 21 Nov), with All to see both. The
 * same three buttons everywhere, so it is always the same place to look.
 */
export function PaidSwitch({ value, onChange, counts }: { value: PaidShown; onChange: (v: PaidShown) => void; counts?: { unpaid: number; paid: number } }) {
  return (
    <Segmented
      label="Paid or not paid"
      value={value}
      onChange={onChange}
      options={[
        { value: "all", label: "All" },
        { value: "unpaid", label: "Not paid", count: counts?.unpaid },
        { value: "paid", label: "Paid", count: counts?.paid },
      ]}
    />
  );
}

/**
 * The PDF that goes with the email (21 Nov): a card with a small picture of the page, its file
 * name, Preview (the whole page, as the client will open it) and Download. The picture is the
 * page itself drawn small, so it always matches what is sent.
 */
export function AttachedInvoice({ doc, name }: { doc: InvoiceDoc; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[0.93rem] font-medium">Attached</p>
      <div className="flex items-stretch gap-3 rounded-md border border-line-strong bg-surface p-2">
        <button type="button" onClick={() => setOpen(true)} aria-label={`Preview the attached ${doc.title.toLowerCase()} ${doc.number}`} className="press relative h-[6.5rem] w-[4.6rem] shrink-0 overflow-hidden rounded border border-line bg-white">
          {/* The real page at one sixth of its size: nothing in it can be clicked or read by a screen reader twice. */}
          <span aria-hidden className="pointer-events-none absolute top-0 left-0 block w-[27.6rem] origin-top-left scale-[0.1667]">
            <InvoicePaper doc={doc} className="rounded-none border-0 shadow-none" />
          </span>
        </button>
        <div className="grid min-w-0 flex-1 content-center gap-1">
          <p className="flex min-w-0 items-center gap-1.5 font-medium">
            <Paperclip size={16} className="shrink-0 text-muted" /> <span className="min-w-0 truncate">{name}</span>
          </p>
          <p className="text-[0.87rem] text-muted">
            PDF, {doc.number}, {doc.totals.at(-1)?.value}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setOpen(true)}>
              <Eye size={15} /> Preview
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void downloadInvoicePdf(doc).then((n) => toast(`${n} downloaded`))}>
              <DownloadSimple size={15} /> Download
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title={name} wide footer={<><Button onClick={() => void downloadInvoicePdf(doc).then((n) => toast(`${n} downloaded`))}>Download PDF</Button><Button variant="primary" onClick={() => setOpen(false)}>Back to the email</Button></>}>
        <InvoicePaper doc={doc} className="shadow-none" />
      </Dialog>
    </div>
  );
}

/**
 * "Mark this invoice as paid?" Nothing changes until Confirm paid is pressed. The client sees
 * it as paid in their portal straight away; the tick also emails them a receipt. Paid can be
 * undone afterwards, from the message or from the invoice.
 */
export function ClientPaidDialog({ invoice, onClose }: { invoice: SalesInvoice | null; onClose: () => void }) {
  if (!invoice) return null;
  return <PaidForm key={invoice.id} i={invoice} onClose={onClose} />;
}

function PaidForm({ i, onClose }: { i: SalesInvoice; onClose: () => void }) {
  const { day, region, client, project } = useInv();
  const formId = useId();
  const c = client(i.clientId);
  const p = project(i.projectId);
  const no = invoiceNo(i);
  const to = billingEmail(c);
  const [paidOn, setPaidOn] = useState(day);
  const [email, setEmail] = useState(!!to);
  const bad = !paidOn || paidOn > day || (!!i.issuedOn && paidOn < i.issuedOn);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark this invoice as paid?"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
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
          markInvoicePaid(i.id, { paidOn, email: email && !!to });
          toast(`${no} marked paid${PORTAL && c?.portalEnabled ? `. ${c.contactName} is told in the portal${email && to ? " and by email" : ""}` : email && to ? `. Receipt emailed to ${to}` : ""}`, { label: "Undo", run: () => unmarkInvoicePaid(i.id) });
          onClose();
        }}
      >
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt className="text-muted">Invoice</dt>
          <dd className="font-medium">
            {no}, {i.description}
          </dd>
          <dt className="text-muted">Client</dt>
          <dd>
            {c?.name}, {p?.code} {p?.name}
          </dd>
          <dt className="text-muted">Amount</dt>
          <dd>
            <span className="font-medium">{money2(grossOf(i), region)}</span> with VAT
          </dd>
        </dl>
        <Field label="Paid on" className="max-w-[12rem]">
          {(id) => <input id={id} type="date" className="field" max={day} min={i.issuedOn} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />}
        </Field>
        <div className="grid gap-1">
          <p className="text-muted">{!PORTAL ? `${c?.name ?? "The client"} is only told if you email them a receipt.` : c?.portalEnabled ? `${c.name} sees it as paid in their portal as soon as you confirm.` : `The portal is switched off for ${c?.name ?? "this client"}, so they are only told if you email them.`}</p>
          <label className={cx("flex items-center gap-2", !to && "text-muted")}>
            <input type="checkbox" checked={email && !!to} disabled={!to} onChange={(e) => setEmail(e.target.checked)} /> Also email a receipt to {to || "the client (no address on file)"}
          </label>
        </div>
        {bad && <p className="text-[0.93rem] text-warn">The date paid cannot be before the invoice was sent or after today.</p>}
      </form>
    </Dialog>
  );
}
