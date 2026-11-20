import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { approveApproval, discardApproval, reopenApproval, saveApprovalBody, saveApprovalSubject, saveReplyDraft, saveVariationFields } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Approval, type ApprovalKind, type Client, type Db, LANGUAGE_NAME } from "@/data/types";
import { rankApprovals } from "@/lib/approvals";
import { when } from "@/lib/format";
import { money2, pct1 } from "@/lib/money";
import { costBreakdown, lineValue, marginFlag, marginPct, quoteTotal } from "@/lib/quotes";
import { Badge, Button, cx, type DeclineAsk, DeclineDialog, DeclineNote, Empty, Field, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";

export const APPROVAL_LABEL: Record<ApprovalKind, string> = {
  variation: "Variation",
  quote: "Quote",
  weekly_summary: "Weekly summary",
  handover: "Handover",
  reply: "Reply",
  cert_reminder: "Ticket reminder",
  chaser: "Chaser",
  client_update: "Client update",
};

const DONE_TEXT: Record<ApprovalKind, string> = {
  variation: "Variation approved and added to the contract value",
  quote: "Quote approved and marked as sent",
  weekly_summary: "Weekly summary approved",
  handover: "Handover pack marked as sent",
  reply: "Reply approved and filed under Sent",
  cert_reminder: "Reminder approved and filed under Sent",
  chaser: "Chaser approved and filed under Sent",
  client_update: "Update approved and filed under Sent",
};

/** Kinds whose approval sends an email: once approved there is no taking it back. */
const SENDS = new Set<ApprovalKind>(["reply", "chaser", "client_update", "cert_reminder", "handover", "quote"]);

/**
 * Approvals on the overview (Aodhan, 16 Nov): no separate page. A row opens in place and closes
 * again when clicked, and none is open until someone opens one. Anything to or from a client
 * comes first. A link with ?open=<id> (from Ask AI or the AI overview) opens that row.
 */
export function ApprovalsPanel({ className, title = "Approvals" }: { className?: string; title?: string }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const [params, setParams] = useSearchParams();
  const canApprove = useAccess().may("approveDrafts");
  const openId = params.get("open");
  const opened = db.approvals.find((a) => a.id === openId);
  const [tab, setTab] = useState<"waiting" | "done">(opened && opened.status !== "Pending" ? "done" : "waiting");
  // Discarding a draft can carry a note saying why (Oisin, 17 Nov). It is optional.
  const [no, setNo] = useState<DeclineAsk | null>(null);
  const pending = db.approvals.filter((a) => a.status === "Pending");
  const resolved = db.approvals.filter((a) => a.status !== "Pending");
  const ranked = rankApprovals(tab === "waiting" ? pending : resolved, db);
  const empty = ranked.client.length + ranked.internal.length === 0;

  const setOpen = (id: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (id) next.set("open", id);
        else next.delete("open");
        return next;
      },
      { replace: true },
    );

  // A link to one approval shows it, on the right tab, scrolled into view.
  useEffect(() => {
    if (!opened) return;
    setTab(opened.status === "Pending" ? "waiting" : "done");
    requestAnimationFrame(() => document.getElementById(`approval-${opened.id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    // Only when the address asks for a different row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const row = (a: Approval, c?: Client) => {
    const open = a.id === openId;
    return (
      <li key={a.id} id={`approval-${a.id}`} className={cx("scroll-mt-20", open && "bg-surface")}>
        <button type="button" aria-expanded={open} onClick={() => setOpen(open ? null : a.id)} className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-accent-soft">
          <span className="mt-1 text-muted">{open ? <CaretDown size={14} weight="bold" /> : <CaretRight size={14} weight="bold" />}</span>
          <Badge tone={a.status === "Pending" ? "accent" : a.status === "Approved" ? "ok" : "neutral"} className="mt-0.5 shrink-0 justify-center sm:w-32">
            {APPROVAL_LABEL[a.kind]}
          </Badge>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{a.title}</span>
            <span className="block text-[0.93rem] text-muted">{c ? `${c.name}. ` : ""}{a.rationale}</span>
            {a.status === "Discarded" && <DeclineNote note={a.discardNote} className="text-[0.93rem]" />}
          </span>
          <span className="shrink-0 text-right text-[0.93rem] text-muted max-sm:hidden">
            {a.status === "Pending" ? when(a.createdAt, day) : `${a.status} by ${a.resolvedBy}`}
            {a.status !== "Pending" && <span className="block">{when(a.resolvedAt, day)}</span>}
          </span>
        </button>
        {open && (
          <div className="fade-in border-t border-line px-3 pt-3 pb-4 md:pl-11">
            <Detail a={a} db={db} />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {!canApprove ? (
                <p className="mr-auto text-[0.93rem] text-muted">You can read this draft. Approving or discarding it is for someone with the "Approve drafts" permission.</p>
              ) : a.status === "Pending" ? (
                <>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setNo({
                        title: "Discard this draft?",
                        about: a.title,
                        hint: "Say why, if it helps. The note is kept with the draft under Discarded and in the activity log.",
                        confirm: "Discard",
                        run: (note) => {
                          discardApproval(a.id, note);
                          setOpen(null);
                          toast(note ? "Draft discarded, with your note" : "Draft discarded");
                        },
                      })
                    }
                  >
                    Discard
                  </Button>
                  <Button variant="primary" onClick={() => { approveApproval(a.id); setOpen(null); toast(DONE_TEXT[a.kind]); }}>
                    Approve {APPROVAL_LABEL[a.kind].toLowerCase()}
                  </Button>
                </>
              ) : a.status === "Discarded" ? (
                <Button onClick={() => { reopenApproval(a.id); setTab("waiting"); toast("Moved back to waiting"); }}>Move back to waiting</Button>
              ) : (
                <p className="mr-auto text-[0.93rem] text-muted">{SENDS.has(a.kind) ? "Approved and sent, so it cannot be taken back here." : "Approved. Its change to the records has been made."}</p>
              )}
            </div>
          </div>
        )}
      </li>
    );
  };

  const group = (label: string, n: number) => (
    <li className="border-t border-line bg-side px-3 py-1.5 text-[0.87rem] font-semibold text-muted first:border-t-0" aria-hidden="true">
      {label} ({n})
    </li>
  );

  return (
    <Section
      title={title}
      className={className}
      aside={
        <Segmented
          label="Approval status"
          value={tab}
          onChange={(v) => { setTab(v); setOpen(null); }}
          options={[
            { value: "waiting", label: "Waiting", count: pending.length },
            { value: "done", label: "Done", count: resolved.length },
          ]}
        />
      }
    >
      <Panel>
        {empty ? (
          <Empty title={tab === "waiting" ? "Nothing is waiting for approval" : "Nothing has been approved or discarded yet"}>
            {tab === "waiting" ? "Drafts arrive as work happens: extras raised on site, enquiries by email, projects finishing." : "Approved and discarded drafts are kept here."}
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {ranked.client.length > 0 && group("With a client", ranked.client.length)}
            {ranked.client.map(({ a, c }) => row(a, c))}
            {ranked.internal.length > 0 && group("Internal", ranked.internal.length)}
            {ranked.internal.map((a) => row(a))}
          </ul>
        )}
      </Panel>
      <p className="mt-2 text-[0.93rem] text-muted">Click a row to open it here, and click it again to close it. Nothing is sent, priced or filed until a person approves it.</p>
      <DeclineDialog ask={no} onClose={() => setNo(null)} />
    </Section>
  );
}

function Detail({ a, db }: { a: Approval; db: Db }) {
  const locked = a.status !== "Pending";
  if (a.kind === "variation") return <VariationDetail a={a} db={db} locked={locked} />;
  if (a.kind === "quote") return <QuoteDetail a={a} db={db} />;
  if (a.kind === "reply") return <ReplyDetail a={a} db={db} locked={locked} />;
  if (a.email) return <EmailDetail a={a} locked={locked} />;
  if (a.kind === "handover") return <HandoverDetail a={a} db={db} locked={locked} />;
  return <BodyEditor a={a} locked={locked} label="Summary" />;
}

/** Where an email goes and which mailbox it goes from, said before anyone approves it. */
function Route({ to, from }: { to: string; from: string }) {
  return (
    <p className="text-[0.93rem] text-muted">
      To {to}, from {from}
    </p>
  );
}

/** An email drafted for approval: who it goes to, its subject and its text, the last two editable. */
function EmailDetail({ a, locked }: { a: Approval; locked: boolean }) {
  const domain = usePrefs((s) => s.brand.emailDomain);
  const email = a.email!;
  return (
    <div className="grid gap-3">
      <Route to={`${email.toName} <${email.toAddress}>`} from={`${a.kind === "chaser" ? "accounts" : "info"}@${domain}`} />
      <Field label="Subject">{(id) => <input id={id} className="field" disabled={locked} value={email.subject} onChange={(e) => saveApprovalSubject(a.id, e.target.value)} />}</Field>
      <Field label="Email" hint={locked ? undefined : "Edit anything before approving. What you approve is what goes out."}>
        {(id) => <textarea id={id} rows={Math.min(18, Math.max(8, (a.body ?? "").split("\n").length + 2))} className="field" disabled={locked} value={a.body ?? ""} onChange={(e) => saveApprovalBody(a.id, e.target.value)} />}
      </Field>
    </div>
  );
}

function HandoverDetail({ a, db, locked }: { a: Approval; db: Db; locked: boolean }) {
  const domain = usePrefs((s) => s.brand.emailDomain);
  const c = db.clients.find((x) => x.id === db.projects.find((p) => p.id === a.projectId)?.clientId);
  return (
    <div className="grid gap-3">
      {c && <Route to={`${c.contactName} <${c.contactEmail}>`} from={`info@${domain}`} />}
      <BodyEditor a={a} locked={locked} label="Email to the client" />
    </div>
  );
}

function VariationDetail({ a, db, locked }: { a: Approval; db: Db; locked: boolean }) {
  const region = usePrefs((s) => s.brand.region);
  const { seeValues } = useAccess();
  const v = db.variations.find((x) => x.id === a.variationId);
  const project = db.projects.find((p) => p.id === v?.projectId);
  const raisedBy = db.people.find((p) => p.id === v?.raisedById);
  if (!v) return <p className="text-muted">This variation no longer exists.</p>;
  return (
    <div className="grid gap-3">
      <p className="text-[0.93rem] text-muted">
        {project?.code} {project?.name}. Raised by {raisedBy?.name}, {raisedBy?.trade.toLowerCase()}.
        {seeValues && project?.value != null && ` Contract value now ${money2(project.value, region)}.`}
      </p>
      {v.original && v.originalLanguage && (
        <div className="rounded-md bg-side px-3 py-2">
          <p className="text-[0.87rem] text-muted">As written on site, in {LANGUAGE_NAME[v.originalLanguage]}</p>
          <p lang={v.originalLanguage}>{v.original}</p>
        </div>
      )}
      <Field label={v.original ? "English translation" : "Description"}>
        {(id) => <textarea id={id} rows={3} className="field" disabled={locked} value={v.description} onChange={(e) => saveVariationFields(v.id, { description: e.target.value, measured: v.measured, estimatedValue: v.estimatedValue })} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Measured extra">
          {(id) => <input id={id} className="field" disabled={locked} value={v.measured} onChange={(e) => saveVariationFields(v.id, { description: v.description, measured: e.target.value, estimatedValue: v.estimatedValue })} />}
        </Field>
        <Field label="Estimated value, ex VAT">
          {(id) => <input id={id} className="field text-right" inputMode="decimal" disabled={locked} value={String(v.estimatedValue)} onChange={(e) => saveVariationFields(v.id, { description: v.description, measured: v.measured, estimatedValue: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} />}
        </Field>
      </div>
      {!locked && project && <VariationEffect db={db} variationId={v.id} projectId={project.id} />}
    </div>
  );
}

/** What approving a variation does to the money, which depends on where the project is. */
function VariationEffect({ db, variationId, projectId }: { db: Db; variationId: string; projectId: string }) {
  const p = db.projects.find((x) => x.id === projectId)!;
  const others = db.variations.filter((x) => x.projectId === projectId && x.status === "Draft" && x.id !== variationId).length;
  const final = db.salesInvoices.find((i) => i.projectId === projectId && i.description === "Final account");
  const held = final?.status === "Held";
  const text =
    !final || p.status === "Live"
      ? "Approving adds it to the contract value, so it is billed with the final account when the work is complete."
      : held && others > 0
        ? `The final account is held until every extra on this project is agreed, and ${others} more ${others === 1 ? "is" : "are"} waiting. Approving adds this one to it.`
        : held && p.snaggingFlag
          ? "Approving adds it to the final account, which stays held until snagging is closed."
          : held
            ? "The final account is held until this is agreed. Approving adds it to the final account and releases it to invoicing."
            : final.status === "To invoice"
              ? "Approving adds it to the final account, which is ready to invoice."
              : "The final account has gone out already, so approving puts this extra on an invoice of its own.";
  return <p className={cx("text-[0.93rem]", held ? "text-warn" : "text-muted")}>{text}</p>;
}

function QuoteDetail({ a, db }: { a: Approval; db: Db }) {
  const region = usePrefs((s) => s.brand.region);
  const { seeMargins } = useAccess();
  const q = db.quotes.find((x) => x.id === a.quoteId);
  const client = db.clients.find((c) => c.id === q?.clientId);
  if (!q) return <p className="text-muted">This quote no longer exists.</p>;
  const sell = quoteTotal(q.lines);
  const cost = costBreakdown(q.costing).total;
  const m = marginPct(sell, cost);
  const flag = marginFlag(m);
  return (
    <div className="grid gap-3">
      <p className="text-[0.93rem] text-muted">
        {q.ref} for {client?.name}, attention {client?.contactName}. Valid for {q.validDays} days. Approving sends it and puts it in the client's portal.
      </p>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="tbl">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Qty</th>
              <th>Unit</th>
              <th className="num">Rate</th>
              <th className="num">Value</th>
            </tr>
          </thead>
          <tbody>
            {q.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{l.qty}</td>
                <td>{l.unit}</td>
                <td className="num">{money2(l.rate, region)}</td>
                <td className="num">{money2(lineValue(l), region)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1">
        <dt className="text-muted">Quote total, ex VAT</dt>
        <dd className="text-right font-medium">{money2(sell, region)}</dd>
        {seeMargins && (
          <>
            <dt className="text-muted">Estimated cost</dt>
            <dd className="text-right">{money2(cost, region)}</dd>
            <dt className="text-muted">Margin</dt>
            <dd className={cx("text-right font-medium", flag === "loss" && "text-bad", flag === "thin" && "text-warn")}>{m == null ? "-" : pct1(m)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function ReplyDetail({ a, db, locked }: { a: Approval; db: Db; locked: boolean }) {
  const mail = db.mails.find((m) => m.id === a.mailId);
  if (!mail) return <p className="text-muted">This email no longer exists.</p>;
  const draft = mail.replyDraft;
  return (
    <div className="grid gap-3">
      <div className="rounded-md bg-side px-3 py-2">
        <p className="text-[0.87rem] text-muted">
          From {mail.fromName}: {mail.subject}
        </p>
        <p className="whitespace-pre-line">{mail.body}</p>
      </div>
      {!draft ? (
        <p className="text-muted">{a.status === "Discarded" ? "The draft was discarded and the email answered from the Inbox instead." : "The reply has been sent. The copy is in Email, under Sent."}</p>
      ) : locked ? (
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Drafted reply</p>
          <p className="rounded-md border border-line px-3 py-2 whitespace-pre-line">{draft.body}</p>
        </div>
      ) : (
        <>
          <Route to={`${mail.fromName} <${mail.fromAddress}>`} from={mail.mailbox} />
          <Field label="Subject">{(id) => <input id={id} className="field" value={draft.subject} onChange={(e) => saveReplyDraft(mail.id, { subject: e.target.value })} />}</Field>
          <Field label="Drafted reply" hint="Edit anything before approving. What you approve is what goes out.">
            {(id) => <textarea id={id} rows={Math.min(16, Math.max(7, draft.body.split("\n").length + 2))} className="field" value={draft.body} onChange={(e) => saveReplyDraft(mail.id, { body: e.target.value })} />}
          </Field>
        </>
      )}
    </div>
  );
}

function BodyEditor({ a, locked, label }: { a: Approval; locked: boolean; label: string }) {
  return (
    <Field label={label} hint={locked ? undefined : "Edit anything before approving. What you approve is what goes out."}>
      {(id) => <textarea id={id} rows={12} className="field" disabled={locked} value={a.body ?? ""} onChange={(e) => saveApprovalBody(a.id, e.target.value)} />}
    </Field>
  );
}
