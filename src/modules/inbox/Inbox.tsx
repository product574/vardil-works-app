import { Paperclip } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { discardReplyDraft, moveMail, routeMail, saveReplyDraft, sendReply, setMailRead, tagMail } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Mail, MailIntent } from "@/data/types";
import { tOf, when } from "@/lib/format";
import { Badge, Button, cx, Empty, Field, PageBody, PageHead, Panel, Segmented, type Tone } from "@/ui";
import { toast } from "@/ui/toast";

const INTENTS: MailIntent[] = ["Enquiry", "Tender invitation", "Quote query", "Certificate", "Holiday request", "Completion request", "Complaint", "Supplier statement", "Conservation officer", "General"];
const TONE: Partial<Record<MailIntent, Tone>> = { Complaint: "bad", Enquiry: "accent", "Tender invitation": "accent", "Quote query": "warn", "Completion request": "warn", "Holiday request": "ok", Certificate: "ok" };
/** Where the work behind each kind of email is done, so the reader can go straight there. */
const NEXT: Partial<Record<MailIntent, { label: string; to: string }>> = {
  Enquiry: { label: "Open enquiries", to: "/sales/enquiries" },
  "Tender invitation": { label: "Open enquiries", to: "/sales/enquiries" },
  "Quote query": { label: "Open quotes awaiting a response", to: "/sales/awaiting" },
  Certificate: { label: "Open training tickets", to: "/people/certs" },
  "Holiday request": { label: "Open holidays", to: "/people/holidays" },
  "Completion request": { label: "Open completed projects", to: "/projects/completed" },
  "Supplier statement": { label: "Open supplier invoices", to: "/invoicing/supplier" },
};
const TITLE = { Inbox: "Inbox", Sent: "Sent", Archive: "Archive" } as const;

/** The shared inbox in three panes: folders in the sidebar, the list, and the open email with its drafted reply. */
export function Inbox({ folder }: { folder: "Inbox" | "Sent" | "Archive" }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<"all" | "unread" | "mine">("all");
  const inFolder = db.mails.filter((m) => m.folder === folder).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const list = inFolder.filter((m) => show === "all" || (show === "unread" ? !m.read : m.routedToId === access.personId));
  const open = inFolder.find((m) => m.id === params.get("mail")) ?? (folder === "Inbox" ? undefined : list[0]);
  const person = (id: string) => db.people.find((p) => p.id === id);
  const unread = inFolder.filter((m) => !m.read).length;
  const pick = (m: Mail) => {
    setParams({ mail: m.id });
    if (!m.read) setMailRead(m.id, true);
  };

  return (
    <>
      <PageHead
        title={TITLE[folder]}
        note={folder === "Inbox" ? `${inFolder.length} emails across the firm's shared addresses, ${unread} unread. Each one is tagged, passed to the right person and given a drafted reply as it arrives.` : folder === "Sent" ? "Replies that have gone out, each approved by a person first." : "Dealt with and filed."}
        actions={
          folder === "Inbox" && (
            <Segmented
              label="Emails shown"
              value={show}
              onChange={setShow}
              options={[
                { value: "all", label: "All", count: inFolder.length },
                { value: "unread", label: "Unread", count: unread },
                { value: "mine", label: "Passed to me", count: inFolder.filter((m) => m.routedToId === access.personId).length },
              ]}
            />
          )
        }
      />
      <PageBody className="grid max-w-[92rem] items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Panel>
          {list.length === 0 ? (
            <Empty title={show === "all" ? `Nothing in ${TITLE[folder].toLowerCase()}` : "Nothing matches"} />
          ) : (
            <ul className={cx("divide-y divide-line overflow-y-auto lg:max-h-[calc(100dvh-15rem)]", open ? "max-h-56" : "max-h-none")} aria-label={`${TITLE[folder]} emails`}>
              {list.map((m) => (
                <li key={m.id}>
                  <button type="button" aria-current={m.id === open?.id} onClick={() => pick(m)} className={cx("press w-full px-3 py-2 text-left", m.id === open?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                    <span className="flex items-baseline gap-2">
                      {!m.read && <span className="size-2 shrink-0 self-center rounded-full bg-accent" aria-label="Unread" />}
                      <span className={cx("min-w-0 flex-1 truncate", !m.read && "font-semibold")}>{m.fromName}</span>
                      <span className="shrink-0 text-[0.87rem] text-muted">{when(m.receivedAt, day)}</span>
                    </span>
                    <span className={cx("block truncate", !m.read ? "font-medium" : "text-muted")}>{m.subject}</span>
                    <span className="mt-1 flex items-center gap-2 text-[0.87rem] text-muted">
                      <Badge tone={TONE[m.intent] ?? "neutral"}>{m.intent}</Badge>
                      {folder !== "Sent" && <span className="ml-auto truncate">{person(m.routedToId)?.name.split(" ")[0]}</span>}
                      {m.replyDraft && <span className="shrink-0">Reply drafted</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {open ? (
          <Reading key={open.id} m={open} folder={folder} onGone={() => setParams({})} />
        ) : (
          <Panel className="hidden lg:block">
            <Empty title="Choose an email">It opens here, with the reply that has been drafted for it.</Empty>
          </Panel>
        )}
      </PageBody>
    </>
  );
}

function Reading({ m, folder, onGone }: { m: Mail; folder: "Inbox" | "Sent" | "Archive"; onGone: () => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const canSend = access.may("approveDrafts");
  const office = db.people.filter((p) => p.active && p.kind === "Management").sort((a, b) => a.name.localeCompare(b.name));
  const next = NEXT[m.intent];
  const draft = m.replyDraft;
  return (
    <div className="grid min-w-0 gap-4">
      <Panel>
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[1.2rem]">{m.subject}</h2>
          <p className="mt-0.5 text-[0.93rem] text-muted">
            {folder === "Sent" ? `Sent by ${m.fromName}` : `From ${m.fromName}, ${m.fromAddress}`}. {m.receivedAt.slice(0, 10) === day ? `Today at ${tOf(m.receivedAt)}` : when(m.receivedAt, day)}, to {m.mailbox}.
          </p>
          {folder !== "Sent" && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.93rem]">
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Tagged as</span>
                <select aria-label="Tag" className="field h-8 w-auto" value={m.intent} onChange={(e) => { tagMail(m.id, e.target.value as MailIntent); toast(`Tagged as ${e.target.value}`); }}>
                  {INTENTS.map((i) => (
                    <option key={i}>{i}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-muted">Passed to</span>
                <select aria-label="Passed to" className="field h-8 w-auto" value={m.routedToId} onChange={(e) => { routeMail(m.id, e.target.value); toast(`Passed to ${db.people.find((p) => p.id === e.target.value)?.name}`); }}>
                  {office.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}, {p.trade}
                    </option>
                  ))}
                </select>
              </label>
              {next && access.can(next.to.split("/")[1] as never) && (
                <Link to={next.to} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                  {next.label}
                </Link>
              )}
            </div>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="max-w-[72ch] whitespace-pre-line">{m.body}</p>
          {m.attachment && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[0.93rem]">
              <Paperclip size={15} className="text-muted" /> {m.attachment}
            </p>
          )}
        </div>
        {folder !== "Sent" && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-2.5">
            <Button size="sm" variant="ghost" onClick={() => { setMailRead(m.id, false); onGone(); }}>
              Mark unread
            </Button>
            <Button
              size="sm"
              onClick={() => {
                moveMail(m.id, folder === "Archive" ? "Inbox" : "Archive");
                toast(folder === "Archive" ? "Moved back to the inbox" : "Archived");
                onGone();
              }}
            >
              {folder === "Archive" ? "Move back to inbox" : "Archive, no reply needed"}
            </Button>
          </div>
        )}
      </Panel>

      {draft && folder !== "Sent" && (
        <Panel className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h3 className="mr-auto text-base">Drafted reply</h3>
            <span className="text-[0.87rem] text-muted">Written for you from the email and what the system knows about the job. Nothing goes out until a person sends it.</span>
          </div>
          <div className="grid gap-3">
            <Field label="Subject">{(id) => <input id={id} className="field" disabled={!canSend} value={draft.subject} onChange={(e) => saveReplyDraft(m.id, { subject: e.target.value })} />}</Field>
            <Field label="Reply">{(id) => <textarea id={id} rows={Math.min(16, Math.max(7, draft.body.split("\n").length + 2))} className="field" disabled={!canSend} value={draft.body} onChange={(e) => saveReplyDraft(m.id, { body: e.target.value })} />}</Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {!canSend && <p className="mr-auto text-[0.93rem] text-muted">Sending needs the "Approve drafts" permission.</p>}
            {canSend && (
              <>
                <Button variant="ghost" onClick={() => { discardReplyDraft(m.id); toast("Draft discarded. The email stays in the inbox"); }}>
                  Discard draft
                </Button>
                <Button
                  variant="primary"
                  disabled={!draft.body.trim()}
                  onClick={() => {
                    sendReply(m.id);
                    toast(`Reply sent to ${m.fromName}. The email is archived`);
                    onGone();
                  }}
                >
                  Send reply
                </Button>
              </>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
