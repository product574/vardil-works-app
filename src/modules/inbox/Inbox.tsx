import {
  Archive,
  ArrowBendUpLeft,
  ArrowBendUpRight,
  ArrowLeft,
  ArrowsDownUp,
  CaretLeft,
  CaretRight,
  ChatsCircle,
  EnvelopeSimple,
  FileText,
  FolderSimple,
  MagnifyingGlass,
  Paperclip,
  PaperPlaneTilt,
  PencilSimpleLine,
  Star,
  Tag,
  Tray,
} from "@phosphor-icons/react";
import { type DragEvent as ReactDragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { composeMail, discardReplyDraft, moveMail, routeMail, saveReplyDraft, sendReply, setMailRead, setStar, shareMailToChat, startReply, tagMail, toggleStar } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Db, Mail, MailIntent } from "@/data/types";
import { tOf, when } from "@/lib/format";
import { actionItems, byDay, folderCounts, inFolder, isFocused, type MailFolder, newestFirst, rowWhen, searchMail, snippet, summary, withLabel } from "@/lib/mail";
import { Avatar, Badge, Button, cx, Dialog, Empty, Field, Menu, MenuItem, type Tone, useOnce } from "@/ui";
import { toast } from "@/ui/toast";

const LABELS: MailIntent[] = ["Enquiry", "Tender invitation", "Quote query", "Certificate", "Holiday request", "Completion request", "Complaint", "Supplier statement", "Conservation officer", "General"];
const TONE: Partial<Record<MailIntent, Tone>> = { Complaint: "bad", Enquiry: "accent", "Tender invitation": "accent", "Quote query": "warn", "Completion request": "warn", "Holiday request": "ok", Certificate: "ok" };
/** Where the work behind each kind of email is done, shown as Linked under the email. */
const NEXT: Partial<Record<MailIntent, { label: string; to: string }>> = {
  Enquiry: { label: "Enquiries", to: "/sales/enquiries" },
  "Tender invitation": { label: "Enquiries", to: "/sales/enquiries" },
  "Quote query": { label: "Quotes awaiting a response", to: "/sales/awaiting" },
  Certificate: { label: "Training tickets", to: "/people/certs" },
  "Holiday request": { label: "Holidays", to: "/people/holidays" },
  "Completion request": { label: "Completed projects", to: "/projects/completed" },
  "Supplier statement": { label: "Supplier invoices", to: "/invoicing/supplier" },
};
const FOLDERS: { folder: MailFolder; to: string; icon: typeof Tray }[] = [
  { folder: "Inbox", to: "/inbox", icon: Tray },
  { folder: "Starred", to: "/inbox/starred", icon: Star },
  { folder: "Sent", to: "/inbox/sent", icon: PaperPlaneTilt },
  { folder: "Drafts", to: "/inbox/drafts", icon: FileText },
  { folder: "Archive", to: "/inbox/archive", icon: Archive },
];

type View = { folder: MailFolder } | { label: MailIntent };
type Draft = { to: string; cc?: string; bcc?: string; subject: string; body: string };

/** What a dragged email row carries: the ids of the emails being moved. */
const DRAG_TYPE = "application/x-abc-mail-ids";

/** One folder: Inbox, Starred, Sent, Drafts or Archive. */
export function Inbox({ folder }: { folder: MailFolder }) {
  return <Mailbox view={{ folder }} />;
}

/** Everything with one label, wherever it is filed. */
export function InboxLabel() {
  const { label = "" } = useParams();
  const l = LABELS.find((x) => x === decodeURIComponent(label));
  return l ? <Mailbox key={l} view={{ label: l }} /> : <Mailbox view={{ folder: "Inbox" }} />;
}

/**
 * Email, laid out like Gmail as in the reference demos (16 Nov, Oisin): a side panel with
 * Compose, the folders and the labels; the list grouped by day, with a checkbox, a star and an
 * avatar on each row; an opened email with its toolbar, the reply drafted for it, and a Summary
 * panel on the right.
 */
function Mailbox({ view }: { view: View }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const [params, setParams] = useSearchParams();
  const [compose, setCompose] = useState<Draft | null>(null);
  const [tab, setTab] = useState<"focused" | "other">("focused");
  const [q, setQ] = useState("");
  const [oldest, setOldest] = useState(false);
  const title = "folder" in view ? view.folder : view.label;
  const all = ("folder" in view ? inFolder(db.mails, view.folder) : withLabel(db.mails, view.label)).sort(newestFirst);
  const tabbed = "folder" in view && view.folder === "Inbox";
  const shown = searchMail(tabbed && !q ? all.filter((m) => (tab === "focused") === isFocused(m)) : all, q);
  const list = oldest ? [...shown].reverse() : shown;
  const openId = params.get("mail");
  const open = openId ? db.mails.find((m) => m.id === openId) : undefined;
  // "New email" from Team chat arrives as ?compose=1&to=address.
  useEffect(() => {
    if (params.get("compose") !== "1") return;
    setCompose({ to: params.get("to") ?? "", subject: "", body: "" });
    setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <div className="flex min-w-0 flex-1">
      <MailSidebar db={db} onCompose={() => setCompose({ to: "", subject: "", body: "" })} />
      <section className="min-w-0 flex-1 overflow-y-auto bg-surface pb-24">
        <MobileFolders onCompose={() => setCompose({ to: "", subject: "", body: "" })} />
        {open ? (
          <Reading key={open.id} m={open} list={list} title={title} onPick={(id) => setParams({ mail: id })} onBack={() => setParams({})} onForward={(d) => setCompose(d)} />
        ) : (
          <MailList
            title={title}
            view={view}
            list={list}
            total={all.length}
            day={day}
            q={q}
            setQ={setQ}
            tab={tabbed ? tab : null}
            setTab={setTab}
            counts={{ focused: all.filter(isFocused).length, other: all.filter((m) => !isFocused(m)).length }}
            oldest={oldest}
            setOldest={setOldest}
            onOpen={(m) => {
              setParams({ mail: m.id });
              if (!m.read) setMailRead(m.id, true);
            }}
          />
        )}
      </section>
      <ComposeDialog draft={compose} onClose={() => setCompose(null)} />
    </div>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────

/** Dropping emails on a folder or label files them there, as in Gmail. */
function dropOn(target: { folder: MailFolder } | { label: MailIntent }, ids: string[]) {
  if (!ids.length) return;
  const n = ids.length === 1 ? "Email" : `${ids.length} emails`;
  if ("label" in target) {
    for (const id of ids) tagMail(id, target.label);
    toast(`${n} labelled ${target.label}`);
  } else if (target.folder === "Starred") {
    for (const id of ids) setStar(id, true);
    toast(`${n} starred`);
  } else if (target.folder === "Inbox" || target.folder === "Archive") {
    for (const id of ids) moveMail(id, target.folder);
    toast(`${n} moved to ${target.folder.toLowerCase()}`);
  }
}

function MailSidebar({ db, onCompose }: { db: Db; onCompose: () => void }) {
  const access = useAccess();
  const person = db.people.find((p) => p.id === access.personId);
  const counts = folderCounts(db.mails);
  const labels = LABELS.map((l) => ({ l, n: db.mails.filter((m) => m.folder === "Inbox" && m.intent === l && !m.read).length, any: withLabel(db.mails, l).length > 0 })).filter((x) => x.any);
  return (
    <aside aria-label="Email folders" className="hidden w-64 shrink-0 flex-col border-r border-line bg-side md:flex">
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-surface">
          <EnvelopeSimple size={20} weight="fill" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-medium">{person?.name ?? "Email"}</span>
          <span className="block truncate text-[0.87rem] text-muted">{person?.email}</span>
        </span>
      </div>
      <div className="px-4 pb-2">
        <Button variant="primary" size="lg" className="w-full" onClick={onCompose}>
          <PencilSimpleLine size={18} /> Compose
        </Button>
      </div>
      <nav aria-label="Folders and labels" className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-28">
        <ul className="mt-1">
          {FOLDERS.map(({ folder, to, icon: Icon }) => {
            const n = folder === "Inbox" ? counts.Inbox : folder === "Drafts" ? counts.Drafts : 0;
            return (
              <li key={folder}>
                <SideLink to={to} end icon={<Icon size={18} />} label={folder} n={n} quiet={folder === "Drafts"} onDropIds={folder === "Sent" || folder === "Drafts" ? undefined : (ids) => dropOn({ folder }, ids)} />
              </li>
            );
          })}
        </ul>
        <p className="px-2 pt-4 pb-1 text-[0.87rem] text-muted">Labels</p>
        <ul>
          {labels.map(({ l, n }) => (
            <li key={l}>
              <SideLink to={`/inbox/label/${encodeURIComponent(l)}`} icon={<Tag size={18} />} label={l} n={n} onDropIds={(ids) => dropOn({ label: l }, ids)} />
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

/**
 * `quiet`: a plain count, not bold (Drafts, as in Gmail: a draft is not something new).
 * `onDropIds`: email rows can be dragged onto it; it lights up while one is over it.
 */
function SideLink({ to, end, icon, label, n, quiet, onDropIds }: { to: string; end?: boolean; icon: ReactNode; label: string; n: number; quiet?: boolean; onDropIds?: (ids: string[]) => void }) {
  const [over, setOver] = useState(false);
  const accepts = (e: ReactDragEvent) => !!onDropIds && e.dataTransfer.types.includes(DRAG_TYPE);
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      onDragOver={(e) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!accepts(e)) return;
        e.preventDefault();
        try { onDropIds!(JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[]); } catch { /* not ours */ }
      }}
      className={({ isActive }) => cx("press flex h-10 items-center gap-2.5 rounded-md px-2", over ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_2px_var(--accent)]" : isActive ? "bg-surface font-medium text-accent-ink shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-surface/70", n > 0 && !quiet && "font-semibold")}
    >
      <span className="text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {n > 0 && (quiet ? <span className="text-[0.87rem] text-muted">{n}</span> : <span className="min-w-5 rounded bg-accent-strong px-1 text-center text-[0.87rem] leading-5 font-medium text-white">{n}</span>)}
    </NavLink>
  );
}

/** On a phone the side panel becomes a row across the top. */
function MobileFolders({ onCompose }: { onCompose: () => void }) {
  return (
    <nav aria-label="Folders" className="flex items-center gap-1 overflow-x-auto border-b border-line bg-side px-3 py-2 md:hidden">
      <Button variant="primary" onClick={onCompose} className="h-11">
        <PencilSimpleLine size={18} /> Compose
      </Button>
      {FOLDERS.map(({ folder, to }) => (
        <NavLink key={folder} to={to} end className={({ isActive }) => cx("h-11 shrink-0 rounded-md px-3 leading-[2.75rem] whitespace-nowrap", isActive ? "bg-surface font-medium text-accent-ink" : "text-muted")}>
          {folder}
        </NavLink>
      ))}
    </nav>
  );
}

// ── The list ──────────────────────────────────────────────────────────────────

function MailList(props: {
  title: string;
  view: View;
  list: Mail[];
  total: number;
  day: string;
  q: string;
  setQ: (q: string) => void;
  tab: "focused" | "other" | null;
  setTab: (t: "focused" | "other") => void;
  counts: { focused: number; other: number };
  oldest: boolean;
  setOldest: (b: boolean) => void;
  onOpen: (m: Mail) => void;
}) {
  const { title, view, list, day, q, setQ, tab, setTab, counts, oldest, setOldest, onOpen } = props;
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sent = "folder" in view && view.folder === "Sent";
  const archive = "folder" in view && view.folder === "Archive";
  const chosen = list.filter((m) => picked.has(m.id));
  const allPicked = list.length > 0 && chosen.length === list.length;
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const groups = byDay(list, day);

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h1 className="text-[1.3rem]">{title}</h1>
        <label className="relative ml-auto w-full max-w-md sm:w-auto sm:flex-1">
          <span className="sr-only">Search mail</span>
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input type="search" className="field rounded-full pl-10" placeholder="Search mail" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </header>

      {tab && !q && (
        <div role="tablist" aria-label="Inbox tabs" className="flex gap-1 border-b border-line px-4 py-2">
          {(["focused", "other"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setPicked(new Set()); }} className={cx("press h-9 rounded-md px-3 text-[0.93rem] font-medium", tab === t ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink")}>
              {t === "focused" ? "Focused" : "Other"} <span className="ml-1 font-normal opacity-80">{counts[t]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex min-h-12 items-center gap-2 border-b border-line px-4 py-1.5">
        <label className="grid size-9 place-items-center">
          <span className="sr-only">Select all</span>
          <input type="checkbox" className="size-[18px] accent-[var(--accent)]" checked={allPicked} disabled={!list.length} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((m) => m.id)))} />
        </label>
        {chosen.length > 0 ? (
          <>
            <span className="text-[0.93rem] text-muted">{chosen.length} selected</span>
            {!sent && (
              <Button size="sm" onClick={() => { for (const m of chosen) moveMail(m.id, archive ? "Inbox" : "Archive"); toast(archive ? `${chosen.length} moved to the inbox` : `${chosen.length} archived`); setPicked(new Set()); }}>
                <Archive size={16} /> {archive ? "Move to inbox" : "Archive"}
              </Button>
            )}
            {!sent && (
              <Menu label="Label the selected emails" trigger={<span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[0.87rem] font-medium"><Tag size={16} /> Label</span>}>
                {(close) => LABELS.map((l) => (
                  <MenuItem key={l} onClick={() => { close(); for (const m of chosen) tagMail(m.id, l); toast(`${chosen.length} labelled ${l}`); setPicked(new Set()); }}>
                    <Tag size={16} className="text-faint" /> {l}
                  </MenuItem>
                ))}
              </Menu>
            )}
            <Button size="sm" onClick={() => { for (const m of chosen) setMailRead(m.id, true); setPicked(new Set()); }}>Mark as read</Button>
            <Button size="sm" onClick={() => { for (const m of chosen) setMailRead(m.id, false); setPicked(new Set()); }}>Mark as unread</Button>
          </>
        ) : (
          <span className="text-[0.93rem] text-muted">{q ? `${list.length} found` : `${list.length} ${list.length === 1 ? "email" : "emails"}`}</span>
        )}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setOldest(!oldest)} aria-label={oldest ? "Oldest first, show newest first" : "Newest first, show oldest first"}>
          <ArrowsDownUp size={16} /> {oldest ? "Oldest" : "Newest"}
        </Button>
      </div>

      {list.length === 0 ? (
        <div className="p-6">
          <Empty title={q ? "Nothing matches" : `Nothing in ${title.toLowerCase()}`}>{q ? "Try fewer words, or a name." : "Emails filed here show up as they come in."}</Empty>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h2 className="border-b border-line bg-canvas px-4 py-1.5 font-sans text-[0.87rem] font-medium text-muted">{g.label}</h2>
            <ul aria-label={`${title} emails, ${g.label}`}>
              {g.mails.map((m) => (
                <Row key={m.id} m={m} day={day} sent={sent} picked={picked.has(m.id)} dragIds={picked.has(m.id) ? [...picked] : [m.id]} onPick={() => toggle(m.id)} onOpen={() => onOpen(m)} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function Row({ m, day, sent, picked, dragIds, onPick, onOpen }: { m: Mail; day: string; sent: boolean; picked: boolean; dragIds: string[]; onPick: () => void; onOpen: () => void }) {
  const unread = !m.read && !sent;
  const who = sent ? `To: ${m.to ?? m.fromName}` : m.fromName;
  return (
    <li
      draggable={!sent}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds));
        e.dataTransfer.setData("text/plain", dragIds.length === 1 ? m.subject : `${dragIds.length} emails`);
        e.dataTransfer.effectAllowed = "move";
      }}
      title={sent ? undefined : "Drag onto a label or folder to file it"}
      className={cx("flex items-start gap-1 border-b border-line px-2 py-1.5", picked ? "bg-accent-soft" : unread ? "bg-surface" : "bg-canvas/40", "hover:bg-accent-soft/60")}>
      <label className="grid size-11 shrink-0 place-items-center">
        <span className="sr-only">Select {m.subject}</span>
        <input type="checkbox" className="size-[18px] accent-[var(--accent)]" checked={picked} onChange={onPick} />
      </label>
      <button type="button" aria-label={m.starred ? `Unstar ${m.subject}` : `Star ${m.subject}`} aria-pressed={!!m.starred} onClick={() => toggleStar(m.id)} className={cx("press grid size-11 shrink-0 place-items-center rounded-md hover:bg-accent-soft", m.starred ? "text-accent" : "text-faint")}>
        <Star size={18} weight={m.starred ? "fill" : "regular"} />
      </button>
      <button type="button" onClick={onOpen} className="press flex min-w-0 flex-1 items-start gap-3 py-1.5 pr-2 text-left">
        <Avatar name={sent ? (m.to ?? m.fromName) : m.fromName} size={36} />
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate", unread && "font-semibold")}>{who}</span>
          <span className={cx("block truncate", unread ? "font-semibold" : "font-medium")}>{m.subject}</span>
          <span className="block truncate text-[0.93rem] text-muted">{snippet(m.body)}</span>
          {m.attachment && (
            <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-[0.87rem]">
              <Paperclip size={14} className="shrink-0 text-muted" /> <span className="truncate">{m.attachment}</span>
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={cx("text-[0.87rem]", unread ? "font-semibold text-ink" : "text-muted")}>{rowWhen(m.receivedAt, day)}</span>
          <span className="flex items-center gap-1.5">
            {m.attachment && <Paperclip size={14} className="text-muted" aria-label="Has an attachment" />}
            {unread && <span className="size-2 rounded-full bg-accent" aria-label="Unread" />}
          </span>
          {!sent && <Badge tone={TONE[m.intent] ?? "neutral"}>{m.intent}</Badge>}
        </span>
      </button>
    </li>
  );
}

// ── An open email ─────────────────────────────────────────────────────────────

function Reading({ m, list, title, onPick, onBack, onForward }: { m: Mail; list: Mail[]; title: string; onPick: (id: string) => void; onBack: () => void; onForward: (d: Draft) => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const navigate = useNavigate();
  const canSend = access.may("approveDrafts");
  const sent = m.folder === "Sent";
  const i = list.findIndex((x) => x.id === m.id);
  const prev = i > 0 ? list[i - 1] : undefined;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : undefined;
  const office = db.people.filter((p) => p.active && p.kind === "Management").sort((a, b) => a.name.localeCompare(b.name));
  const project = db.projects.find((p) => p.clientId === m.clientId && p.status === "Live") ?? db.projects.find((p) => p.clientId === m.clientId);
  const link = NEXT[m.intent];
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [send] = useOnce(() => {
    sendReply(m.id);
    toast(`Reply sent to ${m.fromName}. The email is archived`);
    onBack();
  });

  useEffect(() => {
    if (!m.read) setMailRead(m.id, true);
  }, [m.id, m.read]);

  const go = (x?: Mail) => x && onPick(x.id);
  const reply = () => {
    if (!m.replyDraft) startReply(m.id);
    setTimeout(() => replyRef.current?.focus(), 50);
  };

  return (
    <>
      <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-1 border-b border-line bg-surface px-2 py-1">
        <Button variant="ghost" onClick={onBack} aria-label={`Back to ${title}`}>
          <ArrowLeft size={18} /> Back
        </Button>
        <p className="mr-auto hidden min-w-0 flex-1 truncate px-2 font-medium lg:block">{m.subject}</p>
        {i >= 0 && <span className="px-2 text-[0.93rem] text-muted">{i + 1} of {list.length}</span>}
        <IconButton label="Newer email" onClick={() => go(prev)} disabled={!prev}><CaretLeft size={18} /></IconButton>
        <IconButton label="Older email" onClick={() => go(next)} disabled={!next}><CaretRight size={18} /></IconButton>
        {!sent && (
          <IconButton label={m.folder === "Archive" ? "Move to inbox" : "Archive"} onClick={() => { moveMail(m.id, m.folder === "Archive" ? "Inbox" : "Archive"); toast(m.folder === "Archive" ? "Moved back to the inbox" : "Archived"); onBack(); }}>
            {m.folder === "Archive" ? <Tray size={18} /> : <Archive size={18} />}
          </IconButton>
        )}
        <IconButton label={m.starred ? "Unstar" : "Star"} pressed={!!m.starred} onClick={() => toggleStar(m.id)}>
          <Star size={18} weight={m.starred ? "fill" : "regular"} className={m.starred ? "text-accent" : undefined} />
        </IconButton>
        {!sent && (
          <IconButton label="Mark as unread" onClick={() => { setMailRead(m.id, false); onBack(); }}>
            <EnvelopeSimple size={18} />
          </IconButton>
        )}
        {!sent && (
          <Menu label="Label" trigger={<span className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.93rem] font-medium text-muted hover:bg-accent-soft hover:text-accent-ink"><Tag size={18} /> Label</span>}>
            {(close) => LABELS.map((l) => (
              <MenuItem key={l} onClick={() => { close(); tagMail(m.id, l); toast(`Labelled ${l}`); }}>
                <Tag size={16} className={l === m.intent ? "text-accent" : "text-faint"} /> <span className={cx(l === m.intent && "font-medium")}>{l}</span>
              </MenuItem>
            ))}
          </Menu>
        )}
        {!sent && (
          <Menu label="Move" trigger={<span className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[0.93rem] font-medium text-muted hover:bg-accent-soft hover:text-accent-ink"><FolderSimple size={18} /> Move</span>}>
            {(close) => (["Inbox", "Archive"] as const).map((f) => (
              <MenuItem key={f} onClick={() => { close(); moveMail(m.id, f); toast(`Moved to ${f.toLowerCase()}`); onBack(); }}>
                {f === "Inbox" ? <Tray size={16} className="text-faint" /> : <Archive size={16} className="text-faint" />} {f}
              </MenuItem>
            ))}
          </Menu>
        )}
      </div>

      <div className="grid items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-4">
          <div>
            <h1 className="text-[1.45rem] [text-wrap:balance]">{m.subject}</h1>
            {!sent && <Badge tone={TONE[m.intent] ?? "neutral"} className="mt-1.5">{m.intent}</Badge>}
          </div>

          <article className="rounded-lg border border-line bg-surface">
            <header className="flex items-start gap-3 px-4 pt-4">
              <Avatar name={m.fromName} size={36} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-semibold">{m.fromName}</p>
                <p className="truncate text-[0.93rem] text-muted">{sent ? `to ${m.to ?? "the client"}${m.cc ? `, cc ${m.cc}` : ""}` : `to ${m.mailbox}`}</p>
              </div>
              <p className="shrink-0 text-[0.93rem] text-muted">{m.receivedAt.slice(0, 10) === day ? `Today, ${tOf(m.receivedAt)}` : when(m.receivedAt, day)}</p>
            </header>
            <p className="max-w-[72ch] px-4 py-3 whitespace-pre-line">{m.body}</p>
            {m.attachment && (
              <p className="mx-4 mb-3 inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[0.93rem]">
                <Paperclip size={15} className="text-muted" /> {m.attachment}
              </p>
            )}
            {(link || project) && (
              <div className="mx-4 mb-4 flex flex-wrap items-center gap-2 rounded-md bg-canvas px-3 py-2">
                <span className="text-[0.87rem] font-medium text-muted">Linked</span>
                {link && access.can(link.to.split("/")[1] as never) && <LinkChip to={link.to}>{link.label}</LinkChip>}
                {project && access.can("projects") && <LinkChip to={`/projects/${project.code}`}>{project.code} {project.name}</LinkChip>}
              </div>
            )}
          </article>

          {!sent && (
            <section aria-label="Your reply" className="rounded-lg border border-line bg-surface px-4 py-3">
              {m.replyDraft ? (
                <>
                  <p className="mb-2 flex items-center gap-2 text-[0.93rem] text-muted">
                    <span className="font-medium text-accent-ink">Drafted for you</span> Reply to {m.fromName}. Nothing goes out until a person sends it.
                  </p>
                  <Field label="Reply">
                    {(id) => <textarea ref={replyRef} id={id} rows={Math.min(14, Math.max(6, m.replyDraft!.body.split("\n").length + 1))} className="field" disabled={!canSend} value={m.replyDraft!.body} onChange={(e) => saveReplyDraft(m.id, { body: e.target.value })} />}
                  </Field>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {canSend ? (
                      <>
                        <Button variant="primary" disabled={!m.replyDraft.body.trim()} onClick={() => void send()}>
                          <PaperPlaneTilt size={16} /> Send reply
                        </Button>
                        <Button variant="ghost" onClick={() => { discardReplyDraft(m.id); toast("Draft discarded. The email stays where it is"); }}>Discard</Button>
                      </>
                    ) : (
                      <p className="text-[0.93rem] text-muted">Sending needs the "Approve drafts" permission.</p>
                    )}
                    <span className="ml-auto flex flex-wrap gap-2">
                      <Button onClick={() => onForward({ to: "", subject: `Fwd: ${m.subject}`, body: `\n\n---------- Forwarded message ----------\nFrom: ${m.fromName} <${m.fromAddress}>\nSubject: ${m.subject}\n\n${m.body}` })}>
                        <ArrowBendUpRight size={16} /> Forward
                      </Button>
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={reply} disabled={!canSend}><ArrowBendUpLeft size={16} /> Reply</Button>
                  <Button onClick={() => onForward({ to: "", subject: `Fwd: ${m.subject}`, body: `\n\n---------- Forwarded message ----------\nFrom: ${m.fromName} <${m.fromAddress}>\nSubject: ${m.subject}\n\n${m.body}` })}>
                    <ArrowBendUpRight size={16} /> Forward
                  </Button>
                </div>
              )}
            </section>
          )}
        </div>

        <aside aria-label="Summary" className="grid gap-4 rounded-lg border border-line bg-side p-4 lg:sticky lg:top-16">
          <div>
            <h2 className="text-base">Summary</h2>
            <p className="mt-1.5 text-[0.93rem]">{summary(m)}</p>
          </div>
          {!sent && (
            <div>
              <h3 className="text-[0.93rem] text-muted">Action items</h3>
              <ul className="mt-1.5 grid gap-1">
                {actionItems(m.intent).map((a, k) => (
                  <li key={a}>
                    <label className="flex min-h-9 items-start gap-2.5 text-[0.93rem]">
                      <input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-[var(--accent)]" checked={done.has(k)} onChange={() => setDone((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                      <span className={cx(done.has(k) && "text-muted line-through")}>{a}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!sent && (
            <label className="grid gap-1 text-[0.93rem]">
              <span className="text-muted">Passed to</span>
              <select aria-label="Passed to" className="field" value={m.routedToId} onChange={(e) => { routeMail(m.id, e.target.value); toast(`Passed to ${db.people.find((p) => p.id === e.target.value)?.name}`); }}>
                {office.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}, {p.trade}</option>
                ))}
              </select>
            </label>
          )}
          {access.can("chat") && (
            <Button
              onClick={() => {
                const ch = shareMailToChat(m.id);
                if (ch) { toast("Shared in Team chat"); navigate(`/chat/${ch}`); }
              }}
            >
              <ChatsCircle size={18} /> Discuss in Team chat
            </Button>
          )}
        </aside>
      </div>
    </>
  );
}

function IconButton({ label, onClick, disabled, pressed, children }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className="press grid size-9 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink disabled:opacity-40">
      {children}
    </button>
  );
}

function LinkChip({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex h-8 items-center rounded-full border border-accent/40 bg-surface px-3 text-[0.93rem] font-medium text-accent-ink hover:border-accent">
      {children}
    </Link>
  );
}

// ── Compose ───────────────────────────────────────────────────────────────────

function ComposeDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const navigate = useNavigate();
  const [d, setD] = useState<Draft>({ to: "", subject: "", body: "" });
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  useEffect(() => {
    if (draft) {
      setD(draft);
      setShowCc(!!draft.cc);
      setShowBcc(!!draft.bcc);
    }
  }, [draft]);
  const [send] = useOnce(() => {
    if (!d.to.trim()) return;
    composeMail(d);
    toast(`Sent to ${d.to.trim()}${d.cc?.trim() ? `, copied to ${d.cc.trim()}` : ""}`);
    onClose();
    navigate("/inbox/sent");
  });
  return (
    <Dialog
      open={!!draft}
      onClose={onClose}
      title="New email"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Discard</Button>
          <Button variant="primary" disabled={!d.to.trim()} onClick={() => void send()}>
            <PaperPlaneTilt size={16} /> Send
          </Button>
        </>
      }
    >
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="grid gap-3">
          <Field label="To">{(id) => <input id={id} className="field" type="text" inputMode="email" autoComplete="email" placeholder="Name or email address" value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} autoFocus={!d.to} />}</Field>
          {showCc && <Field label="Cc">{(id) => <input id={id} className="field" type="text" inputMode="email" placeholder="Copy someone in" value={d.cc ?? ""} onChange={(e) => setD({ ...d, cc: e.target.value })} autoFocus />}</Field>}
          {showBcc && <Field label="Bcc" hint="They get a copy, and nobody else sees they did.">{(id) => <input id={id} className="field" type="text" inputMode="email" value={d.bcc ?? ""} onChange={(e) => setD({ ...d, bcc: e.target.value })} autoFocus />}</Field>}
          {(!showCc || !showBcc) && (
            <div className="-mt-2 flex gap-1">
              {!showCc && <Button variant="ghost" size="sm" onClick={() => setShowCc(true)}>Add Cc</Button>}
              {!showBcc && <Button variant="ghost" size="sm" onClick={() => setShowBcc(true)}>Add Bcc</Button>}
            </div>
          )}
        </div>
        <Field label="Subject">{(id) => <input id={id} className="field" value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />}</Field>
        <Field label="Message">{(id) => <textarea id={id} rows={10} className="field" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} />}</Field>
      </form>
    </Dialog>
  );
}
