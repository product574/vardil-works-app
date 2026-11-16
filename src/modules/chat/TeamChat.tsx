import { type ReactNode, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { closeChatMessage, passChatMessage, postChatReply, reopenChatMessage, saveChatDraft, tagChatMessage } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { ChatMessage, ChatTag, Db } from "@/data/types";
import { CHAT_APP_NAME, CHAT_TAGS, type ChatView, channelLabel, channelList, chatList, routeReason, threadAround } from "@/lib/chat";
import { when } from "@/lib/format";
import { Avatar, Badge, Button, cx, Empty, Field, PageBody, PageHead, Panel, Segmented, type Tone } from "@/ui";
import { toast } from "@/ui/toast";

const TONE: Record<ChatTag, Tone> = { "Plant request": "warn", Supplies: "warn", Labour: "accent", "Client query": "accent", Complaint: "bad", Safety: "bad", Accounts: "neutral", Decision: "accent", Question: "neutral" };
const TITLE: Record<ChatView, string> = { open: "Needs action", mine: "Passed to me", done: "Done" };

/**
 * Team chat (step 2, decision 64, option C): what the AI picked out of the firm's Teams or Slack
 * channels, laid out like Email. The list on the left, and the open message with the conversation
 * around it, who it went to and why, and the reply drafted for them. The chat itself stays in
 * Teams or Slack; a reply approved here is posted back into the channel.
 */
export function TeamChat({ view }: { view: ChatView }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const app = usePrefs((s) => s.brand.chatApp);
  const [where, setWhere] = useState<"all" | "sites" | "office">("all");
  const all = chatList(db.chatMessages, view, access.personId);
  const isSite = (m: ChatMessage) => !!db.chatChannels.find((c) => c.id === m.channelId)?.projectId;
  const list = all.filter((m) => where === "all" || (where === "sites") === isSite(m));
  const n = all.length;
  const note =
    view === "done"
      ? "Answered from here, or closed because it was sorted another way."
      : `${n} ${n === 1 ? "message" : "messages"} from ${view === "mine" ? "every channel, passed to you" : "every channel"} that someone has to act on. Each one is tagged, passed to the right person and given a drafted reply. The conversation itself stays in ${CHAT_APP_NAME[app]}.`;
  return (
    <Board
      title={TITLE[view]}
      note={note}
      list={list}
      emptyTitle={view === "done" ? "Nothing done yet" : where === "all" ? "Nothing waiting" : "Nothing matches"}
      actions={
        <Segmented
          label="Channels shown"
          value={where}
          onChange={setWhere}
          options={[
            { value: "all", label: "All", count: n },
            { value: "sites", label: "Sites", count: all.filter(isSite).length },
            { value: "office", label: "Office", count: all.filter((m) => !isSite(m)).length },
          ]}
        />
      }
    />
  );
}

/** One channel: everything picked out of it, open ones first. */
export function TeamChatChannel() {
  const { channelId = "" } = useParams();
  const db = useData((s) => s.db);
  const app = usePrefs((s) => s.brand.chatApp);
  const ch = db.chatChannels.find((c) => c.id === channelId);
  if (!ch) {
    return (
      <>
        <PageHead title="No such channel" />
        <PageBody>
          <Panel>
            <Empty title="This channel is not here">It may have been renamed or closed. Pick a channel from the list on the left.</Empty>
          </Panel>
        </PageBody>
      </>
    );
  }
  const list = channelList(db.chatMessages, ch.id);
  const open = list.filter((m) => m.action!.status === "Open").length;
  const project = db.projects.find((p) => p.id === ch.projectId);
  return (
    <Board
      key={ch.id}
      title={channelLabel(ch, app)}
      note={
        <>
          {ch.purpose}, in {CHAT_APP_NAME[app]}. {open === 0 ? "Nothing waiting on anyone." : `${open} waiting on someone.`}{" "}
          {project && (
            <Link to={`/projects/${project.code}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Open {project.code}
            </Link>
          )}
        </>
      }
      list={list}
      emptyTitle="Nothing picked out of this channel"
      showChannel={false}
    />
  );
}

function Board({ title, note, actions, list, emptyTitle, showChannel = true }: { title: string; note: ReactNode; actions?: ReactNode; list: ChatMessage[]; emptyTitle: string; showChannel?: boolean }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const app = usePrefs((s) => s.brand.chatApp);
  const [params, setParams] = useSearchParams();
  const open = list.find((m) => m.id === params.get("msg")) ?? list[0];
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "Someone";
  const label = (m: ChatMessage) => channelLabel(db.chatChannels.find((c) => c.id === m.channelId) ?? { name: "Team chat" }, app);
  return (
    <>
      <PageHead title={title} note={note} actions={actions} />
      <PageBody className="grid max-w-[92rem] items-start gap-4 lg:grid-cols-[24rem_minmax(0,1fr)]">
        <Panel>
          {list.length === 0 ? (
            <Empty title={emptyTitle}>New messages from the channels arrive here as they are picked out.</Empty>
          ) : (
            <ul className={cx("divide-y divide-line overflow-y-auto lg:max-h-[calc(100dvh-15rem)]", open ? "max-h-56" : "max-h-none")} aria-label={`${title} messages`}>
              {list.map((m) => {
                const a = m.action!;
                return (
                  <li key={m.id}>
                    <button type="button" aria-current={m.id === open?.id} onClick={() => setParams({ msg: m.id })} className={cx("press w-full px-3 py-2 text-left", m.id === open?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                      <span className="flex items-baseline gap-2">
                        <span className={cx("min-w-0 flex-1 truncate", a.status === "Open" && "font-semibold")}>{name(m.authorId)}</span>
                        <span className="shrink-0 text-[0.87rem] text-muted">{when(m.at, day)}</span>
                      </span>
                      <span className={cx("block truncate", a.status === "Open" ? "font-medium" : "text-muted")}>{m.text}</span>
                      <span className="mt-1 flex items-center gap-2 text-[0.87rem] text-muted">
                        <Badge tone={TONE[a.tag]}>{a.tag}</Badge>
                        {showChannel && <span className="min-w-0 truncate">{label(m)}</span>}
                        <span className="ml-auto shrink-0">
                          {a.status === "Open" ? `${name(a.toId).split(" ")[0]}${a.draft ? ", reply drafted" : ""}` : a.outcome === "Replied" ? "Replied" : "Closed"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
        {open ? (
          <Reading key={open.id} m={open} db={db} onGone={() => setParams({})} />
        ) : (
          <Panel className="hidden lg:block">
            <Empty title="Nothing to open">A message opens here with the conversation around it and the reply drafted for it.</Empty>
          </Panel>
        )}
      </PageBody>
    </>
  );
}

function Reading({ m, db, onGone }: { m: ChatMessage; db: Db; onGone: () => void }) {
  const day = useDay();
  const access = useAccess();
  const app = usePrefs((s) => s.brand.chatApp);
  const a = m.action!;
  const canPost = access.may("approveDrafts");
  const ch = db.chatChannels.find((c) => c.id === m.channelId);
  const project = db.projects.find((p) => p.id === ch?.projectId);
  const person = (id: string) => db.people.find((p) => p.id === id);
  const to = person(a.toId);
  const office = db.people.filter((p) => p.active && p.kind === "Management").sort((x, y) => x.name.localeCompare(y.name));
  const { earlier, shown } = threadAround(db.chatMessages, m);
  const chName = ch ? channelLabel(ch, app) : "the channel";
  return (
    <div className="grid min-w-0 gap-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3">
          <h2 className="text-[1.2rem]">{chName}</h2>
          <Badge tone={TONE[a.tag]}>{a.tag}</Badge>
          {project && access.can("projects") && (
            <Link to={`/projects/${project.code}`} className="ml-auto text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline">
              {project.code} {project.name}
            </Link>
          )}
        </div>
        <ol className="grid gap-1 px-2 py-2" aria-label="Conversation">
          {earlier > 0 && <li className="px-2 py-1 text-[0.87rem] text-muted">{earlier} earlier {earlier === 1 ? "message" : "messages"} in {chName}</li>}
          {shown.map((x) => {
            const who = person(x.authorId)?.name ?? "Someone";
            return (
              <li key={x.id} className={cx("flex gap-3 rounded-md px-2 py-2", x.id === m.id && "bg-canvas shadow-[inset_3px_0_0_var(--accent)]")} aria-current={x.id === m.id ? "true" : undefined}>
                <Avatar name={who} />
                <div className="min-w-0">
                  <p>
                    <span className="font-semibold">{who}</span> <span className="text-[0.87rem] text-muted">{when(x.at, day)}</span>
                    {x.replyTo === m.id && <span className="text-[0.87rem] text-muted">, posted from here</span>}
                  </p>
                  <p className="max-w-[72ch]">{x.text}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {a.status === "Open" && to && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[0.93rem]">
            <p className="basis-full text-muted">{routeReason(a.tag, to, project, a.passedBy)}</p>
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Tagged as</span>
              <select aria-label="Tag" className="field h-8 w-auto" value={a.tag} onChange={(e) => { tagChatMessage(m.id, e.target.value as ChatTag); toast(`Tagged as ${e.target.value}`); }}>
                {CHAT_TAGS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              <span className="text-muted">Passed to</span>
              <select aria-label="Passed to" className="field h-8 w-auto" value={a.toId} onChange={(e) => { passChatMessage(m.id, e.target.value); toast(`Passed to ${person(e.target.value)?.name}`); }}>
                {office.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {a.status === "Done" && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 text-[0.93rem]">
            <p className="mr-auto text-muted">
              {a.outcome === "Replied" ? `Replied in ${chName}` : "Closed without a reply"}
              {a.resolvedBy ? `, by ${a.resolvedBy}` : ""}
              {a.resolvedAt ? `, ${when(a.resolvedAt, day).replace(/^(Today|Yesterday)/, (w) => w.toLowerCase())}` : ""}.
            </p>
            {a.outcome === "Done without reply" && (
              <Button size="sm" onClick={() => { reopenChatMessage(m.id); toast("Back in Needs action"); onGone(); }}>
                Move back to Needs action
              </Button>
            )}
          </div>
        )}
      </Panel>

      {a.status === "Open" && (
        <Panel className="px-4 py-3">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h3 className="mr-auto text-base">Drafted for you</h3>
            <span className="text-[0.87rem] text-muted">Written for {to?.name ?? "them"} from the conversation and the records. Nothing is posted until a person approves it.</span>
          </div>
          <Field label={`Reply in ${chName}, as ${to?.name ?? "them"}`}>
            {(id) => <textarea id={id} rows={4} className="field" disabled={!canPost} value={a.draft ?? ""} placeholder="Write a reply" onChange={(e) => saveChatDraft(m.id, e.target.value)} />}
          </Field>
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            {!canPost && <p className="mr-auto text-[0.93rem] text-muted">Posting needs the "Approve drafts" permission.</p>}
            <Button variant="ghost" onClick={() => { closeChatMessage(m.id); toast("Marked done. Nothing was posted"); onGone(); }}>
              Mark done, no reply
            </Button>
            {canPost && (
              <Button
                variant="primary"
                disabled={!a.draft?.trim()}
                onClick={() => {
                  postChatReply(m.id);
                  toast(`Reply posted in ${chName}`);
                  onGone();
                }}
              >
                Approve and post
              </Button>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
