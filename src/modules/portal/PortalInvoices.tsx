import { useState } from "react";
import { clientSaysPaid, clientSendsDocument, raiseInvoiceQuery } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Client, Project, SalesInvoice } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { dShort, plural } from "@/lib/format";
import { readProof } from "@/lib/image";
import { daysLate, grossOf } from "@/lib/invoices";
import { money2 } from "@/lib/money";
import { downloadInvoicePdf, InvoicePaper, useInvoiceDoc } from "@/modules/invoicing/shared";
import { Badge, Button, Dialog, Field, Panel } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

/**
 * A client's invoices for one project, as they see them in the portal (18 Nov): each can be
 * opened and downloaded as the same PDF that was emailed, asked about, and marked as paid at
 * their end. Asking raises a query for accounts; "we have paid this" flags it for accounts to
 * match against the bank.
 */
export function PortalInvoices({ project, client }: { project: Project; client: Client }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const [openId, setOpenId] = useState("");
  const [askId, setAskId] = useState("");
  const [text, setText] = useState("");
  const invoices = db.salesInvoices.filter((i) => i.projectId === project.id && (i.status === "Invoiced" || i.status === "Paid"));
  const find = (id: string) => invoices.find((i) => i.id === id);
  const asking = find(askId);
  return (
    <Panel>
      {invoices.length === 0 ? (
        <p className="px-3 py-2.5 text-muted">Nothing has been invoiced yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {invoices.map((i) => {
            const late = daysLate(i, day);
            const query = db.invoiceQueries.find((q) => q.salesInvoiceId === i.id);
            return (
              <li key={i.id} className="px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{i.description}</span>
                    <span className="text-[0.87rem] text-muted">
                      {invoiceNo(i)}, issued {dShort(i.issuedOn)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {money2(grossOf(i), region)}
                    <span className="block">{i.status === "Paid" ? <Badge tone="ok">Paid {dShort(i.paidOn)}</Badge> : <Badge tone={late > 0 ? "bad" : "neutral"}>{late > 0 ? `${plural(late, "day")} overdue` : `Due ${dShort(i.dueOn)}`}</Badge>}</span>
                  </span>
                </div>
                {i.status !== "Paid" && i.clientPaidOn && <p className="mt-1 text-[0.87rem] text-muted">You told us on {dShort(i.clientPaidOn)} that this is paid. We will confirm once it reaches our bank.</p>}
                {query && (
                  <div className="mt-1.5 grid gap-1 rounded-md bg-side px-2.5 py-2 text-[0.93rem]">
                    <p>
                      <span className="text-muted">You asked on {dShort(query.raisedAt.slice(0, 10))}:</span> {query.text}
                    </p>
                    {query.replies.map((r, n) => (
                      <p key={n}>
                        <span className="text-muted">
                          {r.who} replied on {dShort(r.at.slice(0, 10))}:
                        </span>{" "}
                        {r.text}
                      </p>
                    ))}
                    {query.status === "Open" && query.replies.length === 0 && <p className="text-muted">We will come back to you here.</p>}
                    {query.status === "Settled" && <p className="text-muted">Settled: {query.outcome}</p>}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setOpenId(i.id)}>
                    Open invoice
                  </Button>
                  {!(query && query.status === "Open") && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setText("");
                        setAskId(i.id);
                      }}
                    >
                      Ask about this invoice
                    </Button>
                  )}
                  {i.status === "Invoiced" && !i.clientPaidOn && (
                    <Button
                      size="sm"
                      onClick={() => {
                        clientSaysPaid(i.id, client.contactName);
                        toast("Thank you. Accounts will confirm it once it reaches the bank");
                      }}
                    >
                      We have paid this
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <PaperDialog invoice={find(openId)} client={client} project={project} onClose={() => setOpenId("")} />
      <Dialog
        open={!!asking}
        onClose={() => setAskId("")}
        title={asking ? `Ask about ${invoiceNo(asking)}` : ""}
        footer={
          <>
            <Button onClick={() => setAskId("")}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!text.trim()}
              onClick={() => {
                if (!asking) return;
                raiseInvoiceQuery(asking.id, { via: "Portal", raisedBy: client.contactName, text });
                toast("Question sent to accounts. The reply will appear here");
                setAskId("");
              }}
            >
              Send question
            </Button>
          </>
        }
      >
        <Field label="Your question" hint="It goes to the accounts team, and nobody will chase this invoice until it is answered.">
          {(id) => <textarea id={id} rows={4} className="field" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      </Dialog>
    </Panel>
  );
}

function PaperDialog({ invoice, client, project, onClose }: { invoice: SalesInvoice | undefined; client: Client; project: Project; onClose: () => void }) {
  const doc = useInvoiceDoc(invoice, client, project);
  return (
    <Dialog
      open={!!invoice}
      onClose={onClose}
      title={invoice ? `Invoice ${invoiceNo(invoice)}` : ""}
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {doc && (
            <Button variant="primary" onClick={() => void downloadInvoicePdf(doc).then((name) => toast(`${name} downloaded`))}>
              Download PDF
            </Button>
          )}
        </>
      }
    >
      {doc && <InvoicePaper doc={doc} className="shadow-none" />}
    </Dialog>
  );
}

const KINDS = ["Purchase order", "Payment certificate", "Other document"];

/** Send the contractor a document for this project: a purchase order, a payment certificate. */
export function PortalSendDocument({ project, client }: { project: Project; client: Client }) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState(KINDS[0]!);
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setFile(null);
          setError("");
          setOpen(true);
        }}
      >
        Send us a document
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Send a document for ${project.name}`}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!file}
              onClick={() => {
                if (!file) return;
                clientSendsDocument(project.id, client.contactName, what, file);
                toast(`${what} sent. It is with the office now`);
                setOpen(false);
              }}
            >
              Send document
            </Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Field label="What it is">
            {(id) => (
              <select id={id} className="field" value={what} onChange={(e) => setWhat(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            )}
          </Field>
          <PickFile accept="image/*,application/pdf" what="document" chosen={file?.name} onFile={(f) => { setError(""); readProof(f).then(setFile).catch((e: Error) => setError(e.message.replace("Attach a photo of the card or a PDF of the certificate.", "Attach a photo or a PDF."))); }} />
          {error && <p className="text-[0.93rem] text-warn">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
