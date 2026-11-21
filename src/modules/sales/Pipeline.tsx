import { DotsSixVertical } from "@phosphor-icons/react";
import { type DragEvent, type FormEvent, type ReactNode, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { acceptQuote, addClient, declineQuote, discardQuoteDraft, draftQuoteFromEnquiry, logEnquiry, queryQuote, quoteBackToDraft, sendQuote } from "@/data/actions";
import { ageDays } from "@/data/kpis";
import { useData, useDay, usePrefs } from "@/data/store";
import type { ClientType, Db, Enquiry, Quote } from "@/data/types";
import { dShort, plural } from "@/lib/format";
import { money0, pct1 } from "@/lib/money";
import { boardMove, type MoveKind, type Stage, STAGE_LABEL, stageOf } from "@/lib/pipeline";
import { marginFlag, quoteTotal } from "@/lib/quotes";
import { estMargin, LOST_DAYS, lostLately } from "@/lib/tenders";
import { Button, cx, Dialog, Empty, Field, PageBody, PageHead, Panel, Switch } from "@/ui";
import { EnquiryBadge } from "@/ui/status";
import { toast } from "@/ui/toast";
import { PORTAL } from "@/lib/apps";

export const quoteMargin = estMargin;
const clientName = (db: Db, id: string) => db.clients.find((c) => c.id === id)?.name ?? "";

type Column = { stage: Stage; label: string; hint: string; enquiries?: Enquiry[]; quotes?: Quote[] };

/** A card on the board: an enquiry waiting for a price, or a quote. */
type Card = { kind: "enquiry"; e: Enquiry } | { kind: "quote"; q: Quote };
const cardRef = (c: Card) => (c.kind === "enquiry" ? c.e.ref : c.q.ref);
const cardStage = (c: Card): Stage => (c.kind === "enquiry" ? "enquiry" : stageOf(c.q.status));
const moveFor = (c: Card, to: Stage) => boardMove(cardStage(c), to, c.kind === "enquiry" || !!c.q.enquiryId);

/** What a drop does, shown in each column while a card is dragged. */
const DROP: Record<MoveKind, string> = {
  draft: "Drop to draft a quote from it",
  discard: "Drop to discard the draft",
  send: "Drop to send it to the client",
  resend: "Drop to send the revised quote",
  backToDraft: "Drop to pull it back and change it",
  query: "Drop to record the client's question",
  accept: "Drop to record it as won",
  decline: "Drop to record it as declined",
  reopen: "Drop to reopen it",
};

/** The sales pipeline as a board: one column per stage, a card per enquiry or quote. Cards move between columns. */
export function PipelineBoard() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { seeValues, seeMargins, may } = useAccess();
  const canPrice = may("priceQuotes");
  const hideDeclined = usePrefs((s) => s.boardHideDeclined);
  const setHideDeclined = usePrefs((s) => s.setBoardHideDeclined);
  const showLost = !hideDeclined;
  const setShowLost = (on: boolean) => setHideDeclined(!on);
  const [allDone, setAllDone] = useState<Partial<Record<Stage, boolean>>>({});
  const [logging, setLogging] = useState(false);
  const [openEnquiry, setOpenEnquiry] = useState<Enquiry | null>(null);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [moving, setMoving] = useState<{ card: Card; to: Stage | null } | null>(null);

  const columns = useMemo<Column[]>(() => {
    const by = (...s: Quote["status"][]) => db.quotes.filter((q) => s.includes(q.status)).sort((a, b) => (b.sentAt ?? "9").localeCompare(a.sentAt ?? "9"));
    const cols: Column[] = [
      { stage: "enquiry", label: "To quote", hint: "Enquiries with no quote yet", enquiries: db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId) },
      { stage: "drafting", label: "Drafting", hint: "Being priced or waiting for approval", quotes: by("Draft", "Awaiting approval") },
      { stage: "sent", label: "Sent", hint: "With the client, no answer yet", quotes: by("Sent") },
      { stage: "queried", label: "Queried", hint: "Client has a question", quotes: by("Queried") },
      { stage: "won", label: "Won", hint: "Accepted, now a project", quotes: by("Accepted") },
    ];
    // The last 90 days, as in Tenders, "Lost, last 90 days"; older ones are in the archive.
    if (showLost) cols.push({ stage: "lost", label: "Declined", hint: `Not going ahead, last ${LOST_DAYS} days`, quotes: by("Declined").filter((q) => lostLately(q, day)) });
    return cols;
  }, [db.enquiries, db.quotes, showLost, day]);

  const startDrag = (ev: DragEvent, card: Card) => {
    ev.dataTransfer.setData("text/plain", cardRef(card));
    ev.dataTransfer.effectAllowed = "move";
    // After the browser has taken its picture of the card: changing the page during dragstart can cancel the drag.
    requestAnimationFrame(() => setDragging(card));
  };
  const endDrag = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <>
      <PageHead
        title="Pipeline"
        note={
          canPrice
            ? "Every enquiry and quote, by stage. Drag a card to another column to move it, or use the handle on its corner. Open a card to price it, send it or record the client's answer."
            : "Every enquiry and quote, by stage. Open a card to see it."
        }
        actions={
          <>
            <label className="flex items-center gap-2 text-[0.93rem] text-muted">
              <Switch on={showLost} onChange={() => setShowLost(!showLost)} label="Show declined quotes" /> Show declined
            </label>
            {canPrice && (
              <Button variant="primary" onClick={() => setLogging(true)}>
                Log enquiry
              </Button>
            )}
          </>
        }
      />
      <PageBody className="overflow-x-auto">
        <div className="grid grid-flow-col gap-3" style={{ gridAutoColumns: "minmax(12rem, 1fr)" }}>
          {columns.map((col) => {
            const quotes = col.quotes ?? [];
            const shown = (col.stage === "won" || col.stage === "lost") && !allDone[col.stage] ? quotes.slice(0, 4) : quotes;
            const count = (col.enquiries?.length ?? 0) + quotes.length;
            const total = quotes.reduce((s, q) => s + quoteTotal(q.lines), 0);
            const home = dragging && cardStage(dragging) === col.stage;
            const mv = dragging && !home ? moveFor(dragging, col.stage) : null;
            const card = (c: Card, body: ReactNode) => (
              <li
                key={cardRef(c)}
                draggable={canPrice}
                onDragStart={canPrice ? (ev) => startDrag(ev, c) : undefined}
                onDragEnd={endDrag}
                className={cx("relative", dragging && cardRef(dragging) === cardRef(c) && "opacity-50")}
              >
                {body}
                {canPrice && (
                  <button
                    type="button"
                    aria-label={`Move ${cardRef(c)}`}
                    title="Move to another column"
                    onClick={() => setMoving({ card: c, to: null })}
                    className="press absolute top-1.5 right-1.5 grid size-7 cursor-grab place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink"
                  >
                    <DotsSixVertical size={16} weight="bold" />
                  </button>
                )}
              </li>
            );
            return (
              <section
                key={col.stage}
                aria-label={col.label}
                onDragOver={(ev) => {
                  if (!mv?.ok) return;
                  ev.preventDefault();
                  ev.dataTransfer.dropEffect = "move";
                  if (over !== col.stage) setOver(col.stage);
                }}
                onDragLeave={(ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver((o) => (o === col.stage ? null : o));
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  if (dragging && mv?.ok) setMoving({ card: dragging, to: col.stage });
                  endDrag();
                }}
                className={cx(
                  "flex min-w-0 flex-col rounded-md transition-colors",
                  mv?.ok && "bg-accent-soft/40 outline-2 outline-offset-2 outline-accent/50 outline-dashed",
                  mv?.ok && over === col.stage && "bg-accent-soft outline-accent outline-solid",
                  mv && !mv.ok && "opacity-55",
                )}
              >
                <header className="mb-2 border-b-2 border-line-strong pb-1.5">
                  <h2 className="flex items-baseline gap-2 text-base">
                    {col.label} <span className="font-sans font-normal text-muted">{count}</span>
                    {seeValues && quotes.length > 0 && <span className="ml-auto font-sans text-[0.93rem] font-normal text-muted">{money0(total, region)}</span>}
                  </h2>
                  {/* Two lines tall in every column, so the cards line up and nothing jumps while a card is dragged. */}
                  <p className={cx("min-h-[2lh] text-[0.87rem]", mv?.ok ? "font-medium text-accent-ink" : "text-muted")}>{mv?.ok ? DROP[mv.kind] : col.hint}</p>
                </header>
                <ul className="grid gap-2">
                  {col.enquiries?.map((e) =>
                    card(
                      { kind: "enquiry", e },
                      <button type="button" onClick={() => setOpenEnquiry(e)} className="press block w-full rounded-md border border-line bg-surface p-2.5 text-left hover:border-accent">
                        <span className={cx("flex items-baseline gap-2", canPrice && "pr-7")}>
                          <span className="font-medium whitespace-nowrap">{e.ref}</span>
                          <span className="ml-auto text-[0.87rem] text-muted">{ageLabel(ageDays(e.receivedAt, day))}</span>
                        </span>
                        <span className="block text-[0.93rem]">{clientName(db, e.clientId)}</span>
                        <span className="mt-0.5 line-clamp-2 text-[0.93rem] text-muted">{e.description}</span>
                      </button>,
                    ),
                  )}
                  {shown.map((q) => {
                    const m = quoteMargin(q);
                    const flag = marginFlag(m);
                    return card(
                      { kind: "quote", q },
                      <Link to={`/sales/quotes/${q.ref}`} className="press block rounded-md border border-line bg-surface p-2.5 hover:border-accent">
                        <span className={cx("flex items-baseline gap-2", canPrice && "pr-7")}>
                          <span className="font-medium whitespace-nowrap">{q.ref}</span>
                          {q.status === "Awaiting approval" || q.status === "Draft" ? (
                            <span className={cx("ml-auto text-[0.87rem]", q.status === "Draft" ? "text-muted" : "text-accent-ink")}>{q.status === "Draft" ? "Draft" : "Needs approval"}</span>
                          ) : q.status === "Accepted" || q.status === "Declined" ? (
                            <span className="ml-auto text-[0.87rem] text-muted">{dShort(q.respondedAt)}</span>
                          ) : (
                            <span className="ml-auto text-[0.87rem] text-muted">{ageLabel(ageDays(q.sentAt, day))}</span>
                          )}
                        </span>
                        <span className="block text-[0.93rem]">{clientName(db, q.clientId)}</span>
                        <span className="mt-0.5 line-clamp-2 text-[0.93rem] text-muted">{q.title}</span>
                        {seeValues && (
                          <span className="mt-1.5 flex items-baseline gap-2 border-t border-line pt-1.5">
                            <span className="font-medium">{money0(quoteTotal(q.lines), region)}</span>
                            {seeMargins && m != null && <span className={cx("ml-auto text-[0.93rem]", flag === "loss" ? "text-bad" : flag === "thin" ? "text-warn" : "text-muted")}>{pct1(m)} margin</span>}
                          </span>
                        )}
                      </Link>,
                    );
                  })}
                </ul>
                {count === 0 && <p className="rounded-md border border-dashed border-line-strong px-2.5 py-4 text-center text-[0.93rem] text-muted">Nothing at this stage</p>}
                {(col.stage === "won" || col.stage === "lost") && quotes.length > 4 && (
                  <Button variant="ghost" size="sm" className="mt-2 self-start" onClick={() => setAllDone((v) => ({ ...v, [col.stage]: !v[col.stage] }))}>
                    {allDone[col.stage] ? "Show the latest 4" : `Show all ${quotes.length}`}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      </PageBody>
      <LogEnquiryDialog open={logging} onClose={() => setLogging(false)} />
      <EnquiryDialog enquiry={openEnquiry} onClose={() => setOpenEnquiry(null)} />
      <MoveDialog
        moving={moving}
        onPick={(to) => setMoving((m) => (m ? { ...m, to } : m))}
        onClose={() => setMoving(null)}
        onDeclined={() => setShowLost(true)}
      />
    </>
  );
}

/**
 * Moving a card: pick a column (from the handle), or confirm a drop. Each move says what it does to
 * the records before it happens, and asks for what it needs (the client's question, a purchase order).
 */
function MoveDialog({ moving, onPick, onClose, onDeclined }: { moving: { card: Card; to: Stage | null } | null; onPick: (to: Stage | null) => void; onClose: () => void; onDeclined: () => void }) {
  const db = useData((s) => s.db);
  const [question, setQuestion] = useState("");
  const [po, setPo] = useState("");
  const [picked, setPicked] = useState(false);
  const card = moving?.card;
  const to = moving?.to ?? null;
  const close = () => {
    setQuestion("");
    setPo("");
    setPicked(false);
    onClose();
  };
  if (!card) return null;
  const ref = cardRef(card);
  const from = cardStage(card);
  const q = card.kind === "quote" ? card.q : null;
  const e = card.kind === "enquiry" ? card.e : db.enquiries.find((x) => x.id === q?.enquiryId);
  const client = db.clients.find((c) => c.id === (q?.clientId ?? e?.clientId));
  const mv = to ? moveFor(card, to) : null;

  const what: Record<MoveKind, string> = {
    draft: `A quote is drafted from ${ref}, priced from your rate books. It waits in Drafting and in Approvals until someone checks it and sends it.`,
    discard: `The draft ${ref} is thrown away, with the approval waiting for it, and ${e?.ref ?? "its enquiry"} goes back to To quote.`,
    send: `${ref} goes to ${client?.contactName} at ${client?.name}${PORTAL ? " and shows in their portal" : " by email"}.${q?.status === "Awaiting approval" ? " The approval waiting for it is closed." : ""}`,
    resend: `The revised ${ref} goes to ${client?.contactName} again, as the answer to their question.`,
    backToDraft: `${ref} comes back from ${client?.name} so it can be changed.${PORTAL ? " It leaves their portal until it is sent again." : " Tell them a revised tender is on its way."}`,
    query: `Record what ${client?.contactName} asked, by phone or email. ${ref} moves to Queried, where it can be repriced and sent again.`,
    accept: `${client?.name} accepts ${ref}. A project is created with the next site code, with the priced items as its scope.`,
    decline: `${ref} is recorded as declined by ${client?.name}, and its enquiry as lost.`,
    reopen: `${ref} is reopened as a draft, so it can be changed and sent again.`,
  };
  const label: Record<MoveKind, string> = {
    draft: "Draft the quote",
    discard: "Discard the draft",
    send: q?.status === "Awaiting approval" ? "Approve and send" : "Send to client",
    resend: "Send revised quote",
    backToDraft: "Pull it back",
    query: "Record the question",
    accept: "Accept and create project",
    decline: "Record as declined",
    reopen: "Reopen it",
  };

  const run = (kind: MoveKind) => {
    if (kind === "draft" && card.kind === "enquiry") toast(`${draftQuoteFromEnquiry(card.e.id)} drafted from ${ref}. It waits in Approvals.`);
    if (!q) return close();
    if (kind === "discard") {
      discardQuoteDraft(q.id);
      toast(`${ref} discarded. ${e?.ref ?? "Its enquiry"} is back in To quote.`);
    } else if (kind === "send" || kind === "resend") {
      sendQuote(q.id);
      toast(`${ref} marked as sent to ${client?.contactName}`);
    } else if (kind === "backToDraft" || kind === "reopen") {
      quoteBackToDraft(q.id);
      toast(kind === "reopen" ? `${ref} reopened in Drafting` : `${ref} is back in Drafting`);
    } else if (kind === "query") {
      queryQuote(q.id, question);
      toast(`Question recorded on ${ref}`);
    } else if (kind === "accept") {
      toast(`Project ${acceptQuote(q.id, po)} created from ${ref}`);
    } else if (kind === "decline") {
      declineQuote(q.id);
      onDeclined();
      toast(`${ref} recorded as declined`);
    }
    close();
  };

  const stages: Stage[] = ["enquiry", "drafting", "sent", "queried", "won", "lost"];
  return (
    <Dialog
      open
      onClose={close}
      title={mv?.ok ? `Move ${ref} to ${STAGE_LABEL[to!]}` : `Move ${ref}`}
      footer={
        mv?.ok ? (
          <>
            <Button onClick={() => (picked ? onPick(null) : close())}>{picked ? "Back" : "Cancel"}</Button>
            <Button variant={mv.kind === "discard" || mv.kind === "decline" ? "danger" : "primary"} disabled={mv.kind === "query" && !question.trim()} onClick={() => run(mv.kind)}>
              {label[mv.kind]}
            </Button>
          </>
        ) : (
          <Button onClick={close}>Cancel</Button>
        )
      }
    >
      {mv?.ok ? (
        <>
          <p>{what[mv.kind]}</p>
          {mv.kind === "query" && (
            <Field label="Their question">{(id) => <textarea id={id} rows={3} className="field mt-1" value={question} onChange={(ev) => setQuestion(ev.target.value)} placeholder="Could the north wall be priced as a second phase?" />}</Field>
          )}
          {mv.kind === "accept" && (
            <Field label="Client's purchase order number" hint="Leave blank if the order was given by phone and the paperwork is to follow.">
              {(id) => <input id={id} className="field" value={po} onChange={(ev) => setPo(ev.target.value)} placeholder="PO-10452" />}
            </Field>
          )}
        </>
      ) : (
        <>
          <p className="mb-3 text-muted">
            {ref} is in {STAGE_LABEL[from]}. Where should it go?
          </p>
          <ul className="grid gap-1.5">
            {stages
              .filter((s) => s !== from)
              .map((s) => {
                const m = moveFor(card, s);
                return (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={!m.ok}
                      onClick={() => {
                        setPicked(true);
                        onPick(s);
                      }}
                      className="press flex w-full items-baseline gap-3 rounded-md border border-line px-3 py-2 text-left enabled:hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="w-20 shrink-0 font-medium">{STAGE_LABEL[s]}</span>
                      <span className="text-[0.93rem] text-muted">{m.ok ? DROP[m.kind].replace(/^Drop to /, "").replace(/^./, (c) => c.toUpperCase()) : m.why}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </>
      )}
    </Dialog>
  );
}

const ageLabel = (d: number) => (d === 0 ? "Today" : plural(d, "day"));
/** How an enquiry came in, as it reads after the date it arrived. */
const CAME_IN: Record<Enquiry["source"], string> = { Phone: "by phone", Email: "by email", Tender: "as a tender", "Site visit": "at a site visit", "Existing client": "from an existing client", "Architect referral": "through an architect" };

/** The enquiry log as a list, newest first. */
export function Enquiries() {
  const db = useData((s) => s.db);
  const [logging, setLogging] = useState(false);
  const [open, setOpen] = useState<Enquiry | null>(null);
  const canPrice = useAccess().may("priceQuotes");
  const [q, setQ] = useState("");
  // Newest first: a year of past enquiries sits under today's.
  const rows = db.enquiries
    .filter((e) => !q.trim() || `${e.ref} ${e.location} ${e.county} ${e.description} ${clientName(db, e.clientId)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.ref.localeCompare(a.ref, undefined, { numeric: true }));

  return (
    <>
      <PageHead title="Enquiries" note="Every request for a price, however it came in." actions={canPrice && <Button variant="primary" onClick={() => setLogging(true)}>Log enquiry</Button>}>
        <input type="search" aria-label="Search enquiries" placeholder="Search by client, place or work" className="field mt-3 max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="No enquiries match">Clear the search to see them all.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Received</th>
                  <th>Client</th>
                  <th>Location</th>
                  <th>Work</th>
                  <th>Came in by</th>
                  <th>Status</th>
                  <th>Quote</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const quote = db.quotes.find((x) => x.id === e.quoteId);
                  return (
                    <tr key={e.id} className="rowlink" onClick={() => setOpen(e)}>
                      <td className="font-medium whitespace-nowrap">{e.ref}</td>
                      <td className="whitespace-nowrap">{dShort(e.receivedAt)}</td>
                      <td>{clientName(db, e.clientId)}</td>
                      <td>
                        {e.location}
                        <span className="block text-[0.87rem] text-muted">{e.county}</span>
                      </td>
                      <td className="max-w-[26rem]">{e.description}</td>
                      <td className="whitespace-nowrap">{e.source}</td>
                      <td>
                        <EnquiryBadge status={e.status} />
                      </td>
                      <td className="whitespace-nowrap">
                        {quote ? (
                          <Link to={`/sales/quotes/${quote.ref}`} onClick={(ev) => ev.stopPropagation()} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                            {quote.ref}
                          </Link>
                        ) : (
                          <span className="text-muted">None yet</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      <LogEnquiryDialog open={logging} onClose={() => setLogging(false)} />
      <EnquiryDialog enquiry={open} onClose={() => setOpen(null)} />
    </>
  );
}

function EnquiryDialog({ enquiry, onClose }: { enquiry: Enquiry | null; onClose: () => void }) {
  const navigate = useNavigate();
  const db = useData((s) => s.db);
  const day = useDay();
  // Read the live record, so the dialog reflects a quote drafted a moment ago.
  const e = db.enquiries.find((x) => x.id === enquiry?.id) ?? null;
  const quote = db.quotes.find((x) => x.id === e?.quoteId);
  const canPrice = useAccess().may("priceQuotes");
  return (
    <Dialog
      open={!!e}
      onClose={onClose}
      title={e ? `${e.ref}: ${e.location}` : ""}
      footer={
        e &&
        (quote ? (
          <Button variant="primary" onClick={() => navigate(`/sales/quotes/${quote.ref}`)}>
            Open quote {quote.ref}
          </Button>
        ) : (
          canPrice && <Button
            variant="primary"
            onClick={() => {
              const ref = draftQuoteFromEnquiry(e.id);
              toast(`${ref} drafted and sent to Approvals`);
              navigate(`/sales/quotes/${ref}`);
            }}
          >
            Draft a quote from this
          </Button>
        ))
      }
    >
      {e && (
        <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[8rem_1fr]">
          <dt className="text-muted">Client</dt>
          <dd>
            {clientName(db, e.clientId)}, {e.contactName}
          </dd>
          <dt className="text-muted">Where</dt>
          <dd>
            {e.location}, {e.county}
          </dd>
          <dt className="text-muted">Received</dt>
          <dd>
            {dShort(e.receivedAt)} {CAME_IN[e.source]}, logged by {e.loggedBy} ({ageDays(e.receivedAt, day) === 0 ? "today" : `${ageLabel(ageDays(e.receivedAt, day))} ago`})
          </dd>
          <dt className="text-muted">Work</dt>
          <dd>{e.description}</dd>
          {e.notes && (
            <>
              <dt className="text-muted">Notes</dt>
              <dd>{e.notes}</dd>
            </>
          )}
          {!quote && <p className="text-[0.93rem] text-muted sm:col-span-2">Drafting prices the work from your rates for this kind of job. The draft goes to Approvals; nothing reaches the client until someone approves it.</p>}
        </dl>
      )}
    </Dialog>
  );
}

const SOURCES: Enquiry["source"][] = ["Phone", "Email", "Tender", "Site visit", "Existing client", "Architect referral"];
const COUNTIES = ["Carlow", "Cavan", "Clare", "Cork", "Donegal", "Dublin", "Galway", "Kerry", "Kildare", "Kilkenny", "Laois", "Leitrim", "Limerick", "Longford", "Louth", "Mayo", "Meath", "Monaghan", "Offaly", "Roscommon", "Sligo", "Tipperary", "Waterford", "Westmeath", "Wexford", "Wicklow"];

const CLIENT_TYPES: ClientType[] = ["Private owner", "Local authority", "Church body", "Heritage trust", "Main contractor", "Commercial"];
const NEW = "new";

function LogEnquiryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clients = useData((s) => s.db.clients);
  const [clientId, setClientId] = useState(clients[0]?.id ?? NEW);
  const [name, setName] = useState("");
  const [type, setType] = useState<ClientType>("Private owner");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [county, setCounty] = useState("Galway");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<Enquiry["source"]>("Phone");
  const [error, setError] = useState("");
  const isNew = clientId === NEW;
  const clear = () => setError("");

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (isNew && (!name.trim() || !contact.trim())) return setError("Add the new client's name and a contact person.");
    if (isNew && clients.some((c) => c.name.toLowerCase() === name.trim().toLowerCase())) return setError("There is already a client with that name. Pick them from the list instead.");
    if (!location.trim() || !description.trim()) return setError("Add where the work is and what is needed.");
    const id = isNew ? addClient({ name: name.trim(), type, contactName: contact.trim(), contactPhone: phone.trim(), contactEmail: email.trim() }) : clientId;
    const contactName = isNew ? contact.trim() : (clients.find((c) => c.id === id)?.contactName ?? "");
    logEnquiry({ clientId: id, contactName, location: location.trim(), county, description: description.trim(), source, notes: "" });
    toast(isNew ? `Enquiry logged and ${name.trim()} added as a client` : "Enquiry logged");
    setClientId(id);
    for (const reset of [setName, setContact, setPhone, setEmail, setLocation, setDescription]) reset("");
    clear();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Log an enquiry">
      <form id="log-enquiry" onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Client" className="sm:col-span-2">
          {(id) => (
            <select id={id} className="field" value={clientId} onChange={(e) => { setClientId(e.target.value); clear(); }}>
              <option value={NEW}>New client (not on the list)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {isNew && (
          <fieldset className="fade-in grid gap-3 rounded-md bg-side p-3 sm:col-span-2 sm:grid-cols-2">
            <legend className="sr-only">New client details</legend>
            <Field label="Client name">{(id) => <input id={id} className="field" autoComplete="organization" value={name} placeholder="Name of the person or organisation" onChange={(e) => { setName(e.target.value); clear(); }} />}</Field>
            <Field label="Type of client">
              {(id) => (
                <select id={id} className="field" value={type} onChange={(e) => setType(e.target.value as ClientType)}>
                  {CLIENT_TYPES.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Contact person">{(id) => <input id={id} className="field" autoComplete="name" value={contact} onChange={(e) => { setContact(e.target.value); clear(); }} />}</Field>
            <Field label="Phone">{(id) => <input id={id} className="field" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
            <Field label="Email" className="sm:col-span-2">{(id) => <input id={id} className="field" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <p className="text-[0.93rem] text-muted sm:col-span-2">They are added to Customers with 30 day terms. Only the name and a contact are needed now; the rest can be filled in on their customer page.</p>
          </fieldset>
        )}
        <Field label="Building or address">{(id) => <input id={id} className="field" value={location} placeholder="The Old Forge, Main Street" onChange={(e) => { setLocation(e.target.value); clear(); }} />}</Field>
        <Field label="County">
          {(id) => (
            <select id={id} className="field" value={county} onChange={(e) => setCounty(e.target.value)}>
              {COUNTIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="What is needed" className="sm:col-span-2">
          {(id) => <textarea id={id} rows={3} className="field" value={description} placeholder="Repoint the front elevation in lime, about 120 square metres" onChange={(e) => { setDescription(e.target.value); clear(); }} />}
        </Field>
        <Field label="Came in by">
          {(id) => (
            <select id={id} className="field" value={source} onChange={(e) => setSource(e.target.value as Enquiry["source"])}>
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
        </Field>
        <p role="alert" className="self-end text-bad sm:col-span-2">
          {error}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Log enquiry
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
