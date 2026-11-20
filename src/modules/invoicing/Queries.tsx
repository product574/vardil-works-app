import { useState } from "react";
import { Link } from "react-router-dom";
import { replyToInvoiceQuery, settleInvoiceQuery } from "@/data/actions";
import type { InvoiceQuery } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { dFull, plural, when } from "@/lib/format";
import { dueWords, grossOf, stageOf } from "@/lib/invoices";
import { money2 } from "@/lib/money";
import { Badge, Button, Empty, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { LogQueryDialog } from "./InvoicePage";
import { StageBadge, useInv } from "./shared";
import { PORTAL } from "@/lib/apps";

const LINK = "text-accent-ink underline-offset-2 hover:underline";
const VIA: Record<InvoiceQuery["via"], string> = { Portal: "in the portal", Email: "by email", Phone: "by phone" };

/**
 * Invoices a client has questioned or disputed. An open query stops the invoice being chased;
 * the office replies (the client sees it in their portal) and settles it with what was agreed.
 */
export function ClientQueries() {
  const { db, canEdit } = useInv();
  const [logFor, setLogFor] = useState("");
  const open = db.invoiceQueries.filter((q) => q.status === "Open").sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));
  const settled = db.invoiceQueries.filter((q) => q.status === "Settled").sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""));
  const askable = db.salesInvoices.filter((i) => (i.status === "Invoiced" || i.status === "Paid") && !db.invoiceQueries.some((q) => q.salesInvoiceId === i.id && q.status === "Open")).sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""));
  const picked = db.salesInvoices.find((i) => i.id === logFor) ?? null;
  return (
    <>
      <PageHead
        title="Client queries"
        note={`${open.length === 0 ? "No invoice is being questioned" : `${plural(open.length, "invoice")} being questioned by a client`}. While a query is open the invoice is not chased. ${plural(settled.length, "query", "queries")} settled.`}
        actions={
          canEdit && (
            <label className="flex items-center gap-2 text-[0.93rem]">
              <span className="text-muted">A client rang or wrote?</span>
              <select aria-label="Invoice to log a query on" className="field w-auto" value="" onChange={(e) => setLogFor(e.target.value)}>
                <option value="">Log a query on an invoice</option>
                {askable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {invoiceNo(i)}, {db.clients.find((c) => c.id === i.clientId)?.name}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      <PageBody className="grid max-w-5xl grid-cols-1 gap-6">
        <Section title={`Open (${open.length})`}>
          {open.length === 0 ? (
            <Panel>
              <Empty title="Nothing is being questioned">{PORTAL ? "When a client asks about an invoice in their portal, or you log a call or an email, it appears here." : "When a client questions an invoice, log the call or the email on that invoice and it appears here."}</Empty>
            </Panel>
          ) : (
            <div className="grid gap-3">
              {open.map((q) => (
                <QueryCard key={q.id} q={q} />
              ))}
            </div>
          )}
        </Section>
        {settled.length > 0 && (
          <Section title={`Settled (${settled.length})`} aside="Newest first">
            <div className="grid gap-3">
              {settled.map((q) => (
                <QueryCard key={q.id} q={q} />
              ))}
            </div>
          </Section>
        )}
      </PageBody>
      <LogQueryDialog invoice={picked} who={db.clients.find((c) => c.id === picked?.clientId)?.contactName ?? ""} onClose={() => setLogFor("")} />
    </>
  );
}

function QueryCard({ q }: { q: InvoiceQuery }) {
  const { db, day, region, access, canEdit, project, client } = useInv();
  const [reply, setReply] = useState("");
  const [outcome, setOutcome] = useState("");
  const i = db.salesInvoices.find((x) => x.id === q.salesInvoiceId);
  if (!i) return null;
  const p = project(i.projectId);
  const c = client(i.clientId);
  const stage = stageOf(i, day);
  const isOpen = q.status === "Open";
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2.5">
        <Link to={`/invoicing/client/${invoiceNo(i)}`} className={`${LINK} font-medium`}>
          {invoiceNo(i)}
        </Link>
        <StageBadge i={i} />
        {access.can("customers") ? (
          <Link to={`/customers/${i.clientId}`} className={LINK}>
            {c?.name}
          </Link>
        ) : (
          <span>{c?.name}</span>
        )}
        <Link to={`/projects/${p?.code}`} className={LINK}>
          {p?.code} {p?.name}
        </Link>
        <span className="ml-auto text-right text-[0.93rem] text-muted">
          {access.seeValues && `${money2(grossOf(i), region)} with VAT. `}
          {stage === "paid" ? `Paid ${dFull(i.paidOn)}` : dueWords(i, day)}
        </span>
      </div>
      <div className="grid gap-2 px-4 py-3">
        <p>
          <span className="font-medium">{q.raisedBy}</span> <span className="text-muted">asked {VIA[q.via]}, {when(q.raisedAt, day)}:</span>
        </p>
        <p className="border-l-2 border-line-strong pl-3">{q.text}</p>
        {q.replies.map((r, n) => (
          <div key={n}>
            <p>
              <span className="font-medium">{r.who}</span> <span className="text-muted">replied, {when(r.at, day)}:</span>
            </p>
            <p className="border-l-2 border-accent pl-3">{r.text}</p>
          </div>
        ))}
        {!isOpen && (
          <p>
            <Badge tone="ok">Settled</Badge> <span className="ml-1">{q.outcome}</span>{" "}
            <span className="text-muted">
              {q.settledBy}, {when(q.settledAt, day)}
            </span>
          </p>
        )}
      </div>
      {isOpen && canEdit && (
        <div className="grid gap-3 border-t border-line bg-side px-4 py-3 md:grid-cols-2">
          <form
            className="grid content-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              replyToInvoiceQuery(q.id, reply);
              toast(`Reply sent. ${PORTAL && c?.portalEnabled ? `${q.raisedBy} sees it in the portal` : "It is on the invoice for whoever rings them back"}`);
              setReply("");
            }}
          >
            <label className="text-[0.93rem] font-medium" htmlFor={`reply-${q.id}`}>
              Reply to {q.raisedBy}
            </label>
            <textarea id={`reply-${q.id}`} rows={3} className="field" value={reply} onChange={(e) => setReply(e.target.value)} />
            <div>
              <Button type="submit" disabled={!reply.trim()}>
                Send reply
              </Button>
            </div>
          </form>
          <form
            className="grid content-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!outcome.trim()) return;
              settleInvoiceQuery(q.id, outcome);
              toast(`Query on ${invoiceNo(i)} settled. It can be chased again`);
            }}
          >
            <label className="text-[0.93rem] font-medium" htmlFor={`settle-${q.id}`}>
              What was agreed
            </label>
            <textarea id={`settle-${q.id}`} rows={3} className="field" placeholder="For example: breakdown sent, the invoice stands as it is" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
            <div>
              <Button type="submit" disabled={!outcome.trim()}>
                Settle the query
              </Button>
            </div>
          </form>
        </div>
      )}
    </Panel>
  );
}
