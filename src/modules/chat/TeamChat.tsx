import { ArrowLeft, ChatsCircle, Hash, Paperclip, PaperPlaneRight, UsersThree, X } from "@phosphor-icons/react";
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { markChannelRead, sendChatMessage } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { ChatChannel, ChatMessage, Db } from "@/data/types";
import { CHAT_APP_NAME, byDay, channelTitle, insertMention, mentionQuery, myChannels, splitMentions, unreadCount } from "@/lib/chat";
import { tOf } from "@/lib/format";
import { Avatar, cx, Empty, Menu } from "@/ui";

/**
 * Team chat, laid out like Ping in the reference demos (16 Nov, Oisin): a side panel with the
 * channels and direct messages the signed-in person belongs to, and the open conversation with
 * a message box along the bottom. The channels are the firm's own Teams or Slack ones (Admin,
 * Connections). On a phone the list and the conversation are one screen each.
 */
export function TeamChat() {
  const { channelId } = useParams();
  const db = useData((s) => s.db);
  const me = useAccess().personId;
  const app = usePrefs((s) => s.brand.chatApp);
  const { channels, dms } = myChannels(db.chatChannels, me);
  const open = [...channels, ...dms].find((c) => c.id === channelId) ?? (channelId ? undefined : channels[0] ?? dms[0]);
  const nameOf = (id: string) => db.people.find((p) => p.id === id)?.name ?? "Someone";
  const person = db.people.find((p) => p.id === me);

  return (
    <div className="flex min-w-0 flex-1">
      <aside aria-label="Team chat" className={cx("w-full shrink-0 flex-col border-r border-line bg-side md:flex md:w-64", channelId ? "hidden" : "flex")}>
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-surface">
            <ChatsCircle size={20} weight="fill" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block font-display text-[1.1rem] font-semibold">Team chat</span>
            <span className="block text-[0.87rem] text-muted">{CHAT_APP_NAME[app]}</span>
          </span>
        </div>
        <nav aria-label="Channels and direct messages" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-28">
          <p className="px-2 pt-3 pb-1 text-[0.87rem] text-muted">Channels</p>
          <ul>
            {channels.map((c) => (
              <ChannelLink key={c.id} c={c} active={c.id === open?.id} label={channelTitle(c, me, nameOf, app)} unread={unreadCount(db.chatMessages, c, me)} icon={<Hash size={18} className="shrink-0 text-muted" />} />
            ))}
          </ul>
          {dms.length > 0 && (
            <>
              <p className="px-2 pt-4 pb-1 text-[0.87rem] text-muted">Direct messages</p>
              <ul>
                {dms.map((c) => {
                  const label = channelTitle(c, me, nameOf, app);
                  return <ChannelLink key={c.id} c={c} active={c.id === open?.id} label={label} unread={unreadCount(db.chatMessages, c, me)} icon={<Avatar name={label} size={22} />} />;
                })}
              </ul>
            </>
          )}
        </nav>
        {person && (
          <div className="hidden items-center gap-2.5 border-t border-line px-4 py-3 md:flex">
            <Avatar name={person.name} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.93rem] font-medium">{person.name}</span>
              <span className="block truncate text-[0.87rem] text-muted">{person.email}</span>
            </span>
          </div>
        )}
      </aside>

      <section className={cx("min-w-0 flex-1 flex-col", channelId ? "flex" : "hidden md:flex")}>
        {open ? (
          <Conversation key={open.id} ch={open} db={db} title={channelTitle(open, me, nameOf, app)} />
        ) : (
          <div className="p-5">
            <Empty title={channelId ? "This conversation is not here" : "No channels yet"}>
              {channelId ? "It may have been closed, or you are not a member. Pick one from the list." : "Channels you are added to in Teams or Slack show here."}
            </Empty>
          </div>
        )}
      </section>
    </div>
  );
}

function ChannelLink({ c, active, label, unread, icon }: { c: ChatChannel; active: boolean; label: string; unread: number; icon: ReactNode }) {
  return (
    <li>
      <NavLink
        to={`/chat/${c.id}`}
        title={label}
        aria-current={active ? "page" : undefined}
        className={cx("press flex h-10 items-center gap-2 rounded-md px-2", active ? "bg-surface font-medium text-accent-ink shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-surface/70", unread > 0 && !active && "font-semibold")}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {unread > 0 && !active && <span className="min-w-5 rounded bg-accent-strong px-1 text-center text-[0.87rem] leading-5 font-medium text-white">{unread}</span>}
      </NavLink>
    </li>
  );
}

function Conversation({ ch, db, title }: { ch: ChatChannel; db: Db; title: string }) {
  const day = useDay();
  const access = useAccess();
  const me = access.personId;
  const [text, setText] = useState("");
  const [file, setFile] = useState<string | null>(null);
  const [pick, setPick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groups = byDay(db.chatMessages, ch.id, day);
  const count = db.chatMessages.filter((m) => m.channelId === ch.id).length;
  const members = ch.memberIds.map((id) => db.people.find((p) => p.id === id)).filter((p) => !!p);
  const names = db.people.filter((p) => p.kind === "Management").map((p) => p.name);
  const project = db.projects.find((p) => p.id === ch.projectId);
  const q = mentionQuery(text);
  const matches = q === null ? [] : members.filter((p) => p.id !== me && p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6);

  useEffect(() => {
    markChannelRead(ch.id);
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [ch.id, count]);
  useEffect(() => setPick(0), [q]);

  const send = () => {
    if (!text.trim() && !file) return;
    sendChatMessage(ch.id, text, file ?? undefined);
    setText("");
    setFile(null);
    boxRef.current?.focus();
  };
  const choose = (name: string) => {
    setText(insertMention(text, name));
    boxRef.current?.focus();
  };

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-4">
        <Link to="/chat" aria-label="Back to channels" className="press -ml-1 grid size-11 place-items-center rounded-md text-muted hover:bg-accent-soft md:hidden">
          <ArrowLeft size={20} />
        </Link>
        {ch.kind === "dm" ? <Avatar name={title} /> : <Hash size={20} className="text-muted" />}
        <h1 className="min-w-0 truncate text-[1.15rem]">{title}</h1>
        {project && access.can("projects") && (
          <Link to={`/projects/${project.code}`} className="ml-2 hidden shrink-0 text-[0.93rem] font-medium text-accent-ink underline-offset-2 hover:underline sm:inline">
            Open {project.code}
          </Link>
        )}
        {ch.kind === "channel" && (
          <div className="ml-auto">
            <Menu
              label={`${members.length} members`}
              trigger={
                <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-[0.93rem] font-medium text-accent-ink">
                  <UsersThree size={18} /> {members.length}
                </span>
              }
            >
              {() => (
                <div className="w-72 p-1">
                  <p className="px-2 pt-1 pb-2 text-[0.87rem] text-muted">{ch.purpose}</p>
                  <ul className="grid gap-0.5">
                    {members.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 px-2 py-1">
                        <Avatar name={p.name} size={24} />
                        <span className="min-w-0 truncate">{p.name}</span>
                        <span className="ml-auto truncate text-[0.87rem] text-muted">{p.trade}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Menu>
          </div>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-label={`Messages in ${title}`} role="log">
        {groups.length === 0 && <Empty title="No messages yet">Say hello. Everyone in {ch.kind === "dm" ? "this conversation" : "the channel"} sees it.</Empty>}
        {groups.map((g) => (
          <Fragment key={g.label}>
            <div className="my-3 flex items-center gap-3 text-[0.87rem] text-muted" role="separator" aria-label={g.label}>
              <span className="h-px flex-1 bg-line" />
              {g.label}
              <span className="h-px flex-1 bg-line" />
            </div>
            <ol className="grid gap-1">
              {g.messages.map((m) => (
                <Message key={m.id} m={m} db={db} names={names} />
              ))}
            </ol>
          </Fragment>
        ))}
      </div>

      <div className="relative shrink-0 px-4 pt-2 pb-24">
        {matches.length > 0 && (
          <ul role="listbox" aria-label="People to mention" className="absolute bottom-[calc(100%-1rem)] left-16 z-10 w-72 rounded-lg border border-line bg-surface p-1 shadow-pop">
            {matches.map((p, i) => (
              <li key={p.id} role="option" aria-selected={i === pick}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p.name); }} className={cx("flex h-10 w-full items-center gap-2 rounded-md px-2 text-left", i === pick ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                  <Avatar name={p.name} size={24} />
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="ml-auto truncate text-[0.87rem] text-muted">{p.trade}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {file && (
          <p className="mb-2 ml-14 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface py-1 pr-1 pl-2 text-[0.93rem]">
            <Paperclip size={15} className="text-muted" /> {file}
            <button type="button" aria-label="Remove the file" onClick={() => setFile(null)} className="press grid size-7 place-items-center rounded text-muted hover:bg-accent-soft">
              <X size={14} />
            </button>
          </p>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f.name); e.target.value = ""; }} />
          <button type="button" aria-label="Attach a file" onClick={() => fileRef.current?.click()} className="press grid size-11 shrink-0 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink">
            <Paperclip size={20} />
          </button>
          <textarea
            ref={boxRef}
            rows={1}
            aria-label={`Message ${title}`}
            placeholder="Type a message... Use @ to mention"
            className="field min-h-11 flex-1 resize-none py-2.5"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (matches.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                e.preventDefault();
                setPick((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length);
              } else if (matches.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
                e.preventDefault();
                choose(matches[pick]!.name);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="submit" aria-label="Send message" disabled={!text.trim() && !file} className="press grid size-11 shrink-0 place-items-center rounded-full bg-accent-strong text-white disabled:opacity-50">
            <PaperPlaneRight size={20} weight="fill" />
          </button>
        </form>
      </div>
    </>
  );
}

function Message({ m, db, names }: { m: ChatMessage; db: Db; names: string[] }) {
  const who = db.people.find((p) => p.id === m.authorId)?.name ?? "Someone";
  return (
    <li className="flex gap-3 rounded-md px-1 py-1.5">
      <Avatar name={who} />
      <div className="min-w-0">
        <p className="leading-tight">
          <span className="font-semibold">{who}</span> <span className="text-[0.87rem] text-muted">{tOf(m.at)}</span>
        </p>
        {m.text && (
          <p className="mt-0.5 max-w-[72ch] whitespace-pre-line">
            {splitMentions(m.text, names).map((part, i) => (part.mention ? <strong key={i} className="font-semibold text-accent-ink">{part.text}</strong> : <Fragment key={i}>{part.text}</Fragment>))}
          </p>
        )}
        {m.attachment && (
          <p className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[0.93rem]">
            <Paperclip size={15} className="text-muted" /> {m.attachment}
          </p>
        )}
      </div>
    </li>
  );
}
