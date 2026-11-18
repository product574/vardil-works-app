/**
 * Pieces every invoicing screen uses: who is looking and what they may do, the invoice drawn
 * as paper, its PDF, and the dialog that sends it.
 */
import { Paperclip } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { useAccess } from "@/data/access";
import { actorName, sendInvoice } from "@/data/actions";
import { useData, useDay, useInvoiceDesign, useInvoiceEmail, usePrefs } from "@/data/store";
import type { Client, Project, SalesInvoice } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { addDays } from "@/lib/dates";
import { dFull } from "@/lib/format";
import { billingEmail, emailFor, type InvoiceDoc, invoiceDoc, nextAccountsNo, pdfName, STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/invoices";
import { invoicePdf, type PdfLogo } from "@/lib/pdf";
import { Badge, Button, cx, Dialog, Field } from "@/ui";
import { toast } from "@/ui/toast";

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
  return (
    <div aria-label={`${doc.title} ${doc.number} as the client receives it`} className={cx("rounded-lg border border-line bg-white px-7 py-7 text-[0.93rem] text-[#1b2733] shadow-pop", className)}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0">
          {doc.showLogo && brand.logoUrl && <img src={brand.logoUrl} alt="" className="mb-2 h-11 w-auto" />}
          <p className="font-display text-[1.25rem] leading-tight font-semibold">{doc.seller.name}</p>
          {doc.seller.address.map((l) => (
            <p key={l} className={muted}>
              {l}
            </p>
          ))}
        </div>
        <div className="ml-auto text-right">
          <p className="font-display text-[1.9rem] leading-none font-semibold">{doc.title}</p>
          <p className="mt-1 font-semibold">{doc.number}</p>
          {doc.stamp && <p className={cx("text-[0.87rem] font-semibold tracking-wide uppercase", doc.stamp === "Paid" ? "text-[#1a7f4f]" : muted)}>{doc.stamp}</p>}
          {[...doc.seller.contact, ...doc.seller.registration].map((l) => (
            <p key={l} className={muted}>
              {l}
            </p>
          ))}
        </div>
      </div>
      <div className="mt-3 border-t-2" style={{ borderColor: doc.rule ? brand.accent : "#1b2733" }} />
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className={cx("text-[0.8rem] font-semibold tracking-wide uppercase", muted)}>Bill to</p>
          {doc.billTo.map((l, n) => (
            <p key={`${n}${l}`} className={n === 0 ? "font-semibold" : undefined}>
              {l}
            </p>
          ))}
        </div>
        <dl className="grid content-start grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5">
          {doc.facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className={muted}>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <table className="mt-6 w-full">
        <thead>
          <tr className={cx("border-b border-[#1b2733] text-left text-[0.8rem] tracking-wide uppercase", muted)}>
            <th className="py-1.5 pr-3 font-semibold">Description</th>
            <th className="py-1.5 pr-2 text-right font-semibold">Qty</th>
            <th className="py-1.5 pr-3 font-semibold">Unit</th>
            <th className="py-1.5 pr-3 text-right font-semibold">Rate</th>
            <th className="py-1.5 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, n) => (
            <tr key={n} className="border-b border-[#dfe5ea] align-top">
              <td className="py-2 pr-3">{l.description}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{l.qty}</td>
              <td className={cx("py-2 pr-3", muted)}>{l.unit}</td>
              <td className="py-2 pr-3 text-right whitespace-nowrap tabular-nums">{l.rate}</td>
              <td className="py-2 text-right whitespace-nowrap tabular-nums">{l.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-3 ml-auto grid w-64 grid-cols-2 gap-y-1">
        {doc.totals.map((t) => (
          <div key={t.label} className={cx("contents", t.strong && "font-semibold")}>
            <dt className={cx(t.strong ? "border-t border-[#1b2733] pt-1.5" : muted)}>{t.label}</dt>
            <dd className={cx("text-right tabular-nums", t.strong && "border-t border-[#1b2733] pt-1.5")}>{t.value}</dd>
          </div>
        ))}
      </dl>
      <div className={cx("mt-6 grid gap-0.5 text-[0.87rem]", muted)}>
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
      <p className={cx("mt-6 border-t border-[#dfe5ea] pt-2 text-[0.87rem]", muted)}>{doc.footer}</p>
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
  const [portal, setPortal] = useState(!!c?.portalEnabled);
  const attachment = pdfName(number, brand.legalName);
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
        <label className={cx("flex items-center gap-2", !c?.portalEnabled && "text-muted")}>
          <input type="checkbox" checked={portal} disabled={!c?.portalEnabled} onChange={(e) => setPortal(e.target.checked)} /> Put it in the client's portal
          {!c?.portalEnabled && <span className="text-[0.87rem]">(the portal is switched off for {c?.name})</span>}
        </label>
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
          <p className="flex items-center gap-1.5 text-[0.93rem]">
            <Paperclip size={16} className="text-muted" /> {attachment}
          </p>
        </>
      )}
      {blocked && <p className="text-[0.93rem] text-warn">{!email && !portal ? "Tick at least one way of sending it." : !okTo ? "The address it goes to is not a full email address." : "The email needs a subject and a message."}</p>}
    </form>
    </Dialog>
  );
}
