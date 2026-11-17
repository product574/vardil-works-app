/**
 * Ask AI: the button in the top bar and the panel on the right (decisions 23, 45 and 46).
 *
 * The panel sits beside the screen, which stays usable, so a link in an answer opens that
 * screen behind it while the conversation stays put. On a phone it fills the screen. Only the
 * managing director sees either (Shell.tsx decides).
 */
import { X } from "@phosphor-icons/react";
import { AiSparkle } from "@/ui/AiSparkle";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { DEPARTMENTS } from "@/app/departments";
import { useData, usePrefs } from "@/data/store";
import type { Db } from "@/data/types";
import { Badge, Button, cx } from "@/ui";
import type { DraftCard } from "./execute";
import { type Inline, parseAnswer } from "./markdown";
import { ask } from "./run";
import { type AskTurn, useAsk } from "./state";

export function AskButton() {
  const open = useAsk((s) => s.open);
  const setOpen = useAsk((s) => s.setOpen);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="ask-panel"
      className={cx("press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[0.93rem] font-medium whitespace-nowrap", open ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-ink")}
    >
      <AiSparkle size={18} /> Ask AI
    </button>
  );
}

/** Ask from the search box: opens the panel and asks the words typed there, about the screen behind it. */
export function askFromSearch(question: string, path: string, search: string, db: Db) {
  const s = useAsk.getState();
  s.setOpen(true);
  // While an answer is still arriving the words wait in the question box, so none are lost.
  if (s.busy) useAsk.setState({ prefill: question });
  else void ask(question, { path: `${path}${search}`, title: screenTitle(path, db) });
}

/** What the screen behind the panel is, so "this project" in a question makes sense. */
function screenTitle(path: string, db: Db) {
  const m = /^\/projects\/(C\d+)/i.exec(path);
  if (m) {
    const p = db.projects.find((x) => x.code.toUpperCase() === m[1]!.toUpperCase());
    if (p) return `${p.code} ${p.name}`;
  }
  const q = /^\/sales\/quotes\/(Q-\d+)/i.exec(path);
  if (q) return `Quote ${q[1]}`;
  for (const d of DEPARTMENTS) for (const g of d.groups) for (const i of g.items) if (i.to === path) return `${d.title ?? d.label}: ${i.label}`;
  return "";
}

const FIRM = ["What needs my attention today?", "Which invoices are overdue?", "Whose tickets run out this month?"];

/** Questions worth asking on this screen, so nobody faces an empty box. */
export function suggestionsFor(path: string, db: Db): { about?: { label: string; items: string[] }; firm: string[] } {
  let about: { label: string; items: string[] } | undefined;
  const m = /^\/projects\/(C\d+)/i.exec(path);
  const p = m ? db.projects.find((x) => x.code.toUpperCase() === m[1]!.toUpperCase()) : undefined;
  if (p) {
    const c = db.clients.find((x) => x.id === p.clientId);
    about = {
      label: `About ${p.code} ${p.name}`,
      items: [
        "How far through the work is it?",
        ...(p.status === "Live" || p.status === "Not started" ? ["Who is on this site next week?"] : []),
        "What plant and hire is on site, and what does the hire cost?",
        ...(p.status !== "Not started" ? ["What margin are we making on it?"] : []),
        ...(c && p.status === "Live" ? [`Draft this week's update to ${c.contactName}`] : []),
      ],
    };
  } else if (path.startsWith("/invoicing")) about = { label: "About invoicing", items: ["Which invoices are overdue, and by how much?", "What is ready to invoice, and what is held?", "Which jobs have the thinnest margin so far?", "Draft chasers for the overdue invoices"] };
  else if (path.startsWith("/sales")) about = { label: "About sales", items: ["Which quotes have had no answer?", "Which enquiries still need a quote?", "How many quotes have we won and lost?", "Draft a quote for the newest enquiry"] };
  else if (path.startsWith("/people")) about = { label: "About people", items: ["Who is free next week?", "Whose tickets run out this month?", "Who worked overtime this week?", "Which holiday requests are waiting?"] };
  else if (path.startsWith("/schedule")) about = { label: "About the schedule", items: ["Who is free next week?", "Is anyone double booked?", "Who is on each site on Monday?"] };
  else if (path.startsWith("/plant")) about = { label: "About plant", items: ["What plant is due a service or a check?", "What hire is still on, and what has it cost so far?", "Which vehicles need tax, test or insurance soon?"] };
  else if (path.startsWith("/inbox")) about = { label: "About email", items: ["Which emails still need a reply?", "Draft a reply to the newest enquiry email", "What came in today?"] };
  else if (path.startsWith("/files")) about = { label: "About files", items: ["What is waiting to be sorted?", "Which projects have the most files?"] };
  else if (path.startsWith("/admin/billing")) about = { label: "About billing", items: ["What do we pay for this system each month?", "When is the next invoice, and for how much?"] };
  else if (path.startsWith("/admin")) about = { label: "About requests", items: ["Which requests are waiting for my yes or no?", "Who has asked for leave, and does it clash with the plan?", "What are people asking to spend?"] };
  else if (path.startsWith("/dashboard")) about = { label: "Today", items: ["What needs my attention today?", "Which sites have not sent today's time stamps?", "What is waiting in Approvals?"] };
  const firm = (path.startsWith("/dashboard") ? ["Which invoices are overdue?", "Whose tickets run out this month?", "Which quotes have had no answer?"] : FIRM).filter((f) => !about?.items.some((i) => i.toLowerCase().startsWith(f.toLowerCase().replace(/\?$/, ""))));
  return { about, firm };
}

const NUMERIC = /^[€£$]?\s?-?[\d.,]+\s?(%|days?|hrs?|h)?$/;

export function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "text" ? (
          <Fragment key={i}>{p.text}</Fragment>
        ) : p.kind === "bold" ? (
          <strong key={i} className="font-semibold">
            {p.text}
          </strong>
        ) : (
          <Link key={i} to={p.to} className={cx("text-accent-ink underline decoration-accent/60 underline-offset-[3px] hover:decoration-accent", p.bold ? "font-semibold" : "font-medium")}>
            {p.text}
          </Link>
        ),
      )}
    </>
  );
}

const plain = (parts: Inline[]) => parts.map((p) => p.text).join("");

export function Answer({ text }: { text: string }) {
  const blocks = useMemo(() => parseAnswer(text), [text]);
  return (
    <div className="grid gap-2">
      {blocks.map((b, i) => {
        if (b.kind === "p")
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <Fragment key={j}>
                  {j > 0 && <br />}
                  <Parts parts={l} />
                </Fragment>
              ))}
            </p>
          );
        if (b.kind === "table")
          return (
            <div key={i} className="overflow-x-auto rounded-md border border-line">
              <table className="tbl">
                <thead>
                  <tr>
                    {b.head.map((h, j) => (
                      <th key={j} className={cx(b.rows.every((r) => NUMERIC.test(plain(r[j] ?? []).trim())) && "num")}>
                        <Parts parts={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r, j) => (
                    <tr key={j}>
                      {r.map((c, k) => (
                        <td key={k} className={cx(NUMERIC.test(plain(c).trim()) && "num")}>
                          <Parts parts={c} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        const List = b.kind === "ul" ? "ul" : "ol";
        return (
          <List key={i} className={cx("grid gap-1 pl-5", b.kind === "ul" ? "list-disc" : "list-decimal")}>
            {b.items.map((it, j) => (
              <li key={j}>
                <Parts parts={it} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function Draft({ c }: { c: DraftCard }) {
  return (
    <div className="mt-2.5 rounded-lg border border-line-strong px-3 pt-2.5 pb-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Badge tone="accent">Drafted for you</Badge>
        <span className="text-[0.87rem] text-muted">{c.label}, waiting in Approvals</span>
      </div>
      <p className="font-medium">{c.title}</p>
      {c.to && <p className="text-[0.87rem] text-muted">To {c.to}</p>}
      {c.excerpt && <p className="mt-1.5 text-[0.93rem] text-muted">{c.excerpt}</p>}
      <Link to={`/dashboard?open=${c.approvalId}`} className="mt-2 inline-block font-medium text-accent-ink underline decoration-accent/60 underline-offset-[3px] hover:decoration-accent">
        Open in Approvals
      </Link>
    </div>
  );
}

function Turn({ t }: { t: AskTurn }) {
  return (
    <div className="grid gap-2.5" data-turn={t.status}>
      <p className="ml-auto w-fit max-w-[88%] rounded-lg bg-accent-soft px-3 py-1.5 whitespace-pre-wrap">{t.question}</p>
      <div>
        {t.status === "waiting" && !t.text && <p className="text-[0.93rem] text-muted">Reading the records</p>}
        {t.text && <Answer text={t.text} />}
        {t.cards.map((c) => (
          <Draft key={c.approvalId} c={c} />
        ))}
        {t.note && <p className="mt-2 text-[0.87rem] text-muted">{t.note}</p>}
        {t.error && <p className={cx("text-[0.93rem] text-bad", t.text && "mt-2")}>{t.error}</p>}
      </div>
    </div>
  );
}

export function AskPanel() {
  const turns = useAsk((s) => s.turns);
  const busy = useAsk((s) => s.busy);
  const remaining = useAsk((s) => s.remaining);
  const unavailable = useAsk((s) => s.unavailable);
  const setOpen = useAsk((s) => s.setOpen);
  const clear = useAsk((s) => s.clear);
  const db = useData((s) => s.db);
  const brandName = usePrefs((s) => s.brand.brandName);
  const location = useLocation();
  const [draft, setDraft] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const tips = suggestionsFor(location.pathname, db);
  const last = turns[turns.length - 1];

  useEffect(() => {
    input.current?.focus();
  }, []);
  const prefill = useAsk((s) => s.prefill);
  useEffect(() => {
    if (!prefill) return;
    setDraft(prefill);
    useAsk.setState({ prefill: null });
    input.current?.focus();
  }, [prefill]);
  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, last?.text, last?.cards.length, last?.error]);

  const close = () => {
    setOpen(false);
    document.querySelector<HTMLElement>("[aria-controls=ask-panel]")?.focus();
  };
  const send = (text?: string) => {
    const q = (text ?? draft).trim();
    if (!q || busy || unavailable) return;
    setDraft("");
    if (input.current) input.current.style.height = "";
    void ask(q, { path: `${location.pathname}${location.search}`, title: screenTitle(location.pathname, db) });
  };

  return (
    <aside
      id="ask-panel"
      aria-label="Ask AI"
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      onClick={(e) => {
        // On a phone the panel covers the screen, so following a link closes it to show the screen.
        if ((e.target as HTMLElement).closest("a[href]") && window.matchMedia("(max-width: 767px)").matches) setOpen(false);
      }}
      className="ask-open fixed inset-0 z-50 flex flex-col bg-surface md:static md:z-auto md:w-[27rem] md:shrink-0 md:border-l md:border-line"
    >
      <div className="flex min-h-13 items-center gap-1 border-b border-line py-2 pr-2.5 pl-4">
        <h2 className="flex flex-1 items-center gap-1.5 text-[1.15rem]">
          <AiSparkle size={20} /> Ask AI
        </h2>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={clear}>
            New conversation
          </Button>
        )}
        <button type="button" aria-label="Close Ask AI" onClick={close} className="press grid size-9 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink">
          <X size={18} />
        </button>
      </div>

      <div ref={list} className="grid flex-1 content-start gap-5 overflow-y-auto px-4 py-4" aria-live="polite" aria-busy={busy}>
        {turns.length === 0 && (
          <div className="grid gap-3">
            <p className="text-muted">Ask about anything in the firm's records: projects, quotes, money, people, plant and the inbox. Each answer links to the screen it came from, and anything it drafts waits in Approvals.</p>
            {!unavailable &&
              [tips.about, { label: "Across the firm", items: tips.firm }]
                .filter((g): g is { label: string; items: string[] } => !!g && g.items.length > 0)
                .map((g) => (
                  <div key={g.label}>
                    <p className="mb-1.5 text-[0.87rem] text-muted">{g.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.items.map((s) => (
                        <button key={s} type="button" onClick={() => send(s)} className="press min-h-8 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-left text-[0.87rem] font-medium hover:border-accent hover:text-accent-ink">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
          </div>
        )}
        {turns.map((t) => (
          <Turn key={t.id} t={t} />
        ))}
        {unavailable && !turns.some((t) => t.error === unavailable) && <p className="text-[0.93rem] text-muted">{unavailable}</p>}
      </div>

      <form
        className="border-t border-line px-4 pt-3 pb-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="flex items-end gap-2">
          <textarea
            ref={input}
            rows={1}
            value={draft}
            maxLength={2000}
            disabled={!!unavailable}
            aria-label="Your question"
            placeholder="AI Assistant"
            className="field max-h-40 min-h-9 flex-1 resize-none"
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight + 2, 160)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button variant="primary" type="submit" disabled={busy || !draft.trim() || !!unavailable}>
            Ask
          </Button>
        </div>
        <p className="mt-2 text-[0.87rem] text-muted">
          Answers come from {brandName}'s sample records. Questions and answers are kept by Vardil to improve the demo.
          {remaining != null && ` ${remaining === 0 ? "No" : remaining} question${remaining === 1 ? "" : "s"} left today.`}
        </p>
      </form>
    </aside>
  );
}
