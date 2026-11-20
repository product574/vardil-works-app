import { ArrowLeft, ChatText, EnvelopeSimple, PaperPlaneTilt, Question } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { addInvoiceComment, clearHold, deleteDraftInvoice, emailAboutInvoice, issueInvoice, markExported, raiseInvoiceQuery, unmarkInvoicePaid } from "@/data/actions";
import { useDay } from "@/data/store";
import type { InvoiceQuery, SalesInvoice } from "@/data/types";
import { buildSalesExport, PACKAGE } from "@/lib/accounts-export";
import { invoiceNo } from "@/lib/billing";
import { dFull, dShort, when } from "@/lib/format";
import { billedSoFar, billingEmail, dueWords, exportRowOf, grossOf, leftToBill, openQuery, routeWords, stageOf, threadFor, type ThreadItem } from "@/lib/invoices";
import { money0, money2 } from "@/lib/money";
import { Badge, Button, cx, Dialog, Empty, Fact, Field, Menu, MenuItem, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { ProjectBadge } from "@/ui/status";
import { toast } from "@/ui/toast";
import { DraftInvoiceDialog } from "./ClientInvoices";
import { ClientPaidDialog, downloadInvoicePdf, InvoicePaper, saveFile, SendInvoiceDialog, StageBadge, useInv, useInvoiceDoc } from "./shared";
import { PORTAL } from "@/lib/apps";

const LINK = "text-accent-ink underline-offset-2 hover:underline";

/**
 * One client invoice on a page of its own: the paper as the client gets it, and beside it the
 * client and project it belongs to, every email and comment about it, and its history. The
 * buttons along the top move it on: send, mark paid (and undo), PDF, the accounts package.
 */
export function InvoicePage() {
  const { ref = "" } = useParams();
  const { db, day, region, access, canEdit, project, client } = useInv();
  const navigate = useNavigate();
  const i = db.salesInvoices.find((x) => invoiceNo(x).toLowerCase() === ref.toLowerCase() || x.ref.toLowerCase() === ref.toLowerCase());
  const p = i ? project(i.projectId) : undefined;
  const c = i ? client(i.clientId) : undefined;
  const doc = useInvoiceDoc(i, c, p);
  const [sending, setSending] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const no = i ? invoiceNo(i) : "";

  // A link made while it was a draft (INV-5216) lands on the number it went out under (SI-10412).
  useEffect(() => {
    if (i && ref !== no) navigate(`/invoicing/client/${no}`, { replace: true });
  }, [i, ref, no, navigate]);

  if (!i || !doc)
    return (
      <>
        <PageHead title="Invoice not found" />
        <PageBody>
          <Panel className="max-w-3xl">
            <Empty title={`There is no client invoice numbered ${ref}`}>
              It may have been a draft that was deleted. <Link to="/invoicing" className={LINK}>Open the list of client invoices</Link>.
            </Empty>
          </Panel>
        </PageBody>
      </>
    );

  const stage = stageOf(i, day);
  const query = openQuery(db.invoiceQueries, i.id);
  const out = stage === "sent" || stage === "overdue";
  const pkgName = PACKAGE;
  const pdf = () => downloadInvoicePdf(doc).then((name) => toast(`${name} downloaded`));
  const exportNow = () => {
    const file = buildSalesExport([exportRowOf(i, c, p)]);
    saveFile(file.fileName, file.text, "text/csv");
    markExported([i.id], pkgName);
    toast(`${no} exported for ${pkgName}`);
  };
  const billed = p ? billedSoFar(p.id, db.salesInvoices) : { invoiced: 0, paid: 0 };

  return (
    <>
      <PageHead
        title={`Invoice ${no}`}
        note={
          <>
            <StageBadge i={i} className="mr-2" />
            {i.description}, {p?.code} {p?.name}, for {c?.name}.
          </>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate("/invoicing")}>
              <ArrowLeft size={16} /> Client invoices
            </Button>
            <Button onClick={() => void pdf()}>Download PDF</Button>
            {canEdit && stage === "draft" && <Button onClick={() => setEditing(true)}>Change the draft</Button>}
            {canEdit && out && <Button onClick={() => setSending(true)}>Send again</Button>}
            {canEdit && stage === "paid" && (
              <Button
                onClick={() => {
                  unmarkInvoicePaid(i.id);
                  toast(`${no} is unpaid again`);
                }}
              >
                Undo paid
              </Button>
            )}
            {canEdit && stage === "draft" && (
              <Button variant="primary" onClick={() => setSending(true)}>
                <PaperPlaneTilt size={16} /> Send to client
              </Button>
            )}
            {canEdit && out && (
              <Button variant="primary" onClick={() => setPaying(true)}>
                Mark paid
              </Button>
            )}
            {canEdit && (
              <Menu label={`More for ${no}`} trigger={<span className="px-1 font-medium">More</span>}>
                {(close) => (
                  <>
                    {(out || stage === "paid") && !i.exportedAt && (
                      <MenuItem
                        onClick={() => {
                          close();
                          exportNow();
                        }}
                      >
                        Export to {pkgName} now
                      </MenuItem>
                    )}
                    {(out || stage === "paid") && !query && (
                      <MenuItem
                        onClick={() => {
                          close();
                          setAsking(true);
                        }}
                      >
                        Log a query from the client
                      </MenuItem>
                    )}
                    {stage === "draft" && (
                      <MenuItem
                        onClick={() => {
                          close();
                          issueInvoice(i.id);
                          toast("Marked as sent. No email went from here");
                        }}
                      >
                        Mark as sent, by post or by hand
                      </MenuItem>
                    )}
                    {stage === "draft" && i.manual && (
                      <MenuItem
                        tone="bad"
                        onClick={() => {
                          close();
                          deleteDraftInvoice(i.id);
                          toast(`Draft ${i.ref} deleted`);
                          navigate("/invoicing?show=draft");
                        }}
                      >
                        Delete this draft
                      </MenuItem>
                    )}
                    <MenuItem
                      onClick={() => {
                        close();
                        navigate("/invoicing/design");
                      }}
                    >
                      Change how invoices look
                    </MenuItem>
                  </>
                )}
              </Menu>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <Panel className="overflow-x-auto">
          <dl aria-label="Where this invoice stands" className="grid min-w-[44rem] grid-cols-4 divide-x divide-line">
            <div className="px-3 py-2">
              <dt className="text-[0.87rem] text-muted">Total with VAT</dt>
              <dd className="text-[1.15rem] font-medium">{access.seeValues ? money2(grossOf(i), region) : "Hidden for you"}</dd>
              <dd className="text-[0.87rem] text-muted">{access.seeValues ? `${money2(i.net, region)} before VAT at ${i.vatPct}%` : ""}</dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[0.87rem] text-muted">Sent to the client</dt>
              <dd className={cx("text-[1.15rem] font-medium", !i.issuedOn && "text-warn")}>{i.issuedOn ? dFull(i.issuedOn) : stage === "held" ? "Held" : "Not yet"}</dd>
              <dd className="text-[0.87rem] text-muted">{i.issuedOn ? `${routeWords(i.sentVia)}${i.sentTo && i.sentVia?.includes("email") ? `, to ${i.sentTo}` : ""}` : stage === "held" ? i.holdReason : "A draft. Nobody outside the office has seen it."}</dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[0.87rem] text-muted">Paid</dt>
              <dd className={cx("text-[1.15rem] font-medium", stage === "overdue" && "text-bad", stage === "paid" && "text-ok")}>{stage === "paid" ? dFull(i.paidOn) : out ? "Not yet" : "-"}</dd>
              <dd className="text-[0.87rem] text-muted">{out ? `Due ${dFull(i.dueOn)}. ${dueWords(i, day)}.` : stage === "paid" ? `It was due ${dFull(i.dueOn)}.` : `Due ${c?.termsDays ?? 30} days after it is sent.`}</dd>
            </div>
            <div className="px-3 py-2">
              <dt className="text-[0.87rem] text-muted">In {pkgName}</dt>
              <dd className={cx("text-[1.15rem] font-medium", i.issuedOn && !i.exportedAt && "text-warn")}>{i.exportedAt ? dFull(i.exportedAt.slice(0, 10)) : i.issuedOn ? "Not yet" : "-"}</dd>
              <dd className="text-[0.87rem] text-muted">
                {i.exportedAt ? `Exported. Any correction is made in ${PACKAGE}.` : i.issuedOn ? (
                  <>
                    Goes with the next export.{" "}
                    <Link to="/invoicing/export" className={LINK}>
                      Open the export
                    </Link>
                  </>
                ) : (
                  "Only invoices that have been sent are exported."
                )}
              </dd>
            </div>
          </dl>
        </Panel>

        {stage === "held" && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-warn-soft px-3 py-2 text-warn">
            <p className="mr-auto">Held: {i.holdReason ?? "a manager has held it"}. It cannot go to the client until the hold is cleared on the project.</p>
            {access.may("manageProjects") ? (
              <Button
                size="sm"
                onClick={() => {
                  clearHold(i.projectId);
                  toast(`Hold cleared on ${p?.code}. The invoice is now a draft, ready to send`);
                }}
              >
                Clear hold
              </Button>
            ) : (
              <Link to={`/projects/${p?.code}?tab=extras`} className="font-medium underline underline-offset-2">
                Open the project
              </Link>
            )}
          </div>
        )}
        {query && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-warn-soft px-3 py-2 text-warn">
            <p className="mr-auto">
              {query.raisedBy} asked on {dShort(query.raisedAt.slice(0, 10))}: "{query.text}" Hold off chasing payment until it is settled.
            </p>
            <Link to="/invoicing/queries" className="font-medium underline underline-offset-2">
              Answer it under Client queries
            </Link>
          </div>
        )}
        {i.clientPaidOn && out && (
          <p className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">
            {c?.contactName} said {PORTAL ? "in the portal " : ""}on {dShort(i.clientPaidOn)} that this has been paid. Check it against the bank, then mark it paid.
          </p>
        )}

        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <InvoicePaper doc={doc} />
          <div className="grid min-w-0 grid-cols-1 gap-5">
            <Section title="Linked records">
              <Panel className="px-3 py-1">
                <dl>
                  <Fact label="Client">
                    {access.can("customers") ? (
                      <Link to={`/customers/${i.clientId}`} className={LINK}>
                        {c?.name}
                      </Link>
                    ) : (
                      c?.name
                    )}
                    <span className="block text-[0.93rem] text-muted">
                      {c?.contactName}, {c?.contactPhone}
                    </span>
                    <span className="block text-[0.93rem] text-muted">
                      Invoices go to {billingEmail(c)}. Terms {c?.termsDays} days.
                    </span>
                  </Fact>
                  <Fact label="Project">
                    <Link to={`/projects/${p?.code}`} className={LINK}>
                      {p?.code} {p?.name}
                    </Link>{" "}
                    {p && <ProjectBadge status={p.status} />}
                    {access.seeValues && p && (
                      <span className="block text-[0.93rem] text-muted">
                        Contract {money0(p.value, region)}. Invoiced {money0(billed.invoiced, region)}, paid {money0(billed.paid, region)}. Left to bill {money0(leftToBill(p, db.salesInvoices), region)}.
                      </span>
                    )}
                  </Fact>
                  <Fact label="Their order">{i.poNumber ?? <span className="text-muted">None given</span>}</Fact>
                  {db.salesInvoices.filter((x) => x.projectId === i.projectId && x.id !== i.id).length > 0 && (
                    <Fact label="Same project">
                      <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {db.salesInvoices
                          .filter((x) => x.projectId === i.projectId && x.id !== i.id)
                          .map((x) => (
                            <Link key={x.id} to={`/invoicing/client/${invoiceNo(x)}`} className={LINK}>
                              {invoiceNo(x)}
                            </Link>
                          ))}
                      </span>
                    </Fact>
                  )}
                </dl>
              </Panel>
            </Section>
            <Thread i={i} canEdit={canEdit} />
            <Section title="History">
              <Panel>
                <ol className="divide-y divide-line">
                  {(i.history ?? []).map((h, n) => (
                    <li key={n} className="flex items-baseline gap-3 px-3 py-1.5">
                      <span className="min-w-0 flex-1">{h.what}</span>
                      <span className="shrink-0 text-right text-[0.87rem] text-muted">
                        {h.who}, {when(h.at, day)}
                      </span>
                    </li>
                  ))}
                  {(i.history ?? []).length === 0 && <li className="px-3 py-2 text-muted">Nothing has happened to it yet.</li>}
                </ol>
              </Panel>
            </Section>
          </div>
        </div>
      </PageBody>
      <SendInvoiceDialog invoice={sending ? i : null} onClose={() => setSending(false)} />
      <ClientPaidDialog invoice={paying ? i : null} onClose={() => setPaying(false)} />
      <DraftInvoiceDialog open={editing} edit={i} onClose={() => setEditing(false)} onSaved={() => undefined} />
      <LogQueryDialog invoice={asking ? i : null} who={c?.contactName ?? ""} onClose={() => setAsking(false)} />
    </>
  );
}

const KIND: Record<ThreadItem["kind"], { label: string; tone: "neutral" | "accent" | "ok" | "warn" }> = {
  sent: { label: "Email sent", tone: "accent" },
  received: { label: "Email in", tone: "neutral" },
  comment: { label: "Office only", tone: "neutral" },
  query: { label: "Client query", tone: "warn" },
  reply: { label: "Reply", tone: "accent" },
  settled: { label: "Settled", tone: "ok" },
};

/** Everything said about the invoice, oldest first, and a box to email the client or leave a comment for the office. */
function Thread({ i, canEdit }: { i: SalesInvoice; canEdit: boolean }) {
  const { db, project, client } = useInv();
  const day = useDay();
  const c = client(i.clientId);
  const p = project(i.projectId);
  const items = threadFor(db, i.id);
  const [mode, setMode] = useState<"email" | "comment">("email");
  const [subject, setSubject] = useState(`${invoiceNo(i)}, ${p?.name ?? ""}`);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const to = billingEmail(c);
  const send = () => {
    if (!text.trim()) return;
    if (mode === "email") {
      emailAboutInvoice(i.id, { to, subject: subject.trim() || invoiceNo(i), body: text.trim() });
      toast(`Email sent to ${to}. A copy is under Email, Sent`);
    } else {
      addInvoiceComment(i.id, text);
      toast("Comment added. Only the office sees it");
    }
    setText("");
  };
  return (
    <Section title="Emails and comments" aside={items.length ? `${items.length} so far` : undefined}>
      <Panel>
        {items.length === 0 ? (
          <p className="px-3 py-2.5 text-muted">Nothing has been said about this invoice yet. The email that sends it will appear here.</p>
        ) : (
          <ol className="divide-y divide-line">
            {items.map((t, n) => (
              <li key={n} className="px-3 py-2">
                <button type="button" aria-expanded={open === n} className="press flex w-full flex-wrap items-baseline gap-x-2 text-left" onClick={() => setOpen(open === n ? null : n)}>
                  <Badge tone={KIND[t.kind].tone}>{KIND[t.kind].label}</Badge>
                  <span className="min-w-0 flex-1 truncate font-medium">{t.title}</span>
                  <span className="shrink-0 text-[0.87rem] text-muted">
                    {t.who}, {when(t.at, day)}
                  </span>
                </button>
                <p className={cx("mt-1 whitespace-pre-line text-[0.93rem]", open !== n && "line-clamp-2 text-muted")}>{t.text.replace(/^To: [^\n]*\n\n/, "")}</p>
                {open === n && t.to && (
                  <Link to={t.to} className={cx(LINK, "mt-1 inline-block text-[0.93rem]")}>
                    Open in Email
                  </Link>
                )}
              </li>
            ))}
          </ol>
        )}
        {canEdit && (
          <form
            className="grid gap-2 border-t border-line bg-side px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Segmented label="What to write" value={mode} onChange={setMode} options={[{ value: "email", label: "Email the client" }, { value: "comment", label: "Comment for the office" }]} />
            {mode === "email" && (
              <>
                <p className="text-[0.93rem] text-muted">To {c?.contactName}, {to}</p>
                <input aria-label="Subject" className="field" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </>
            )}
            <textarea aria-label={mode === "email" ? "Message to the client" : "Comment for the office"} rows={3} className="field" placeholder={mode === "email" ? "Ask a question or add a line about this invoice" : "A note for whoever picks this invoice up next"} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end">
              <Button type="submit" disabled={!text.trim()}>
                {mode === "email" ? (
                  <>
                    <EnvelopeSimple size={16} /> Send email
                  </>
                ) : (
                  <>
                    <ChatText size={16} /> Add comment
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </Panel>
    </Section>
  );
}

/** A client rang or wrote with a question about an invoice: the office logs it so it is not chased meanwhile. */
export function LogQueryDialog({ invoice, who, onClose }: { invoice: SalesInvoice | null; who: string; onClose: () => void }) {
  const [via, setVia] = useState<InvoiceQuery["via"]>("Phone");
  const [by, setBy] = useState(who);
  const [text, setText] = useState("");
  useEffect(() => {
    if (invoice) {
      setBy(who);
      setText("");
      setVia("Phone");
    }
  }, [invoice, who]);
  return (
    <Dialog
      open={!!invoice}
      onClose={onClose}
      title={invoice ? `Log a query on ${invoiceNo(invoice)}` : ""}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!text.trim() || !by.trim()}
            onClick={() => {
              if (!invoice) return;
              raiseInvoiceQuery(invoice.id, { via, raisedBy: by.trim(), text });
              toast("Query logged. Chasing is on hold until it is settled");
              onClose();
            }}
          >
            <Question size={16} /> Log the query
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">How it came in</p>
          <Segmented label="How the query came in" value={via} onChange={setVia} options={[{ value: "Phone", label: "Phone" }, { value: "Email", label: "Email" }, ...(PORTAL ? [{ value: "Portal" as const, label: "Portal" }] : [])]} />
        </div>
        <Field label="Who asked">{(id) => <input id={id} className="field" value={by} onChange={(e) => setBy(e.target.value)} />}</Field>
        <Field label="What they asked" hint="In their words, as near as you can.">
          {(id) => <textarea id={id} rows={4} className="field" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
