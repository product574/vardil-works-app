import { ACCOUNTS_EXPORT } from "@/lib/accounts-export";
import { DotsThree, MagnifyingGlass, Trash } from "@phosphor-icons/react";
import { useEffect, useId, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { deleteDraftInvoice, draftInvoice, issueInvoice, saveDraftInvoice, unmarkInvoicePaid } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useInvoiceDesign, usePrefs } from "@/data/store";
import { holdWords } from "@/lib/snags";
import type { InvoiceLine, SalesInvoice } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { dShort, plural } from "@/lib/format";
import { AGE_BUCKETS, agedDebt, billedSoFar, billingEmail, doneNotBilled, draftStarts, dueWords, grossOf, inAgeBucket, invoiceDoc, leftToBill, linesNet, lineTotal, matches, openQuery, routeWords, type Show, shows, stageOf, VAT_RATES } from "@/lib/invoices";
import { money0, money2, r2, REGION } from "@/lib/money";
import { scopePercent } from "@/lib/project-costs";
import { Badge, Button, cx, Dialog, Empty, Field, Menu, MenuItem, NumInput, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { ClientPaidDialog, downloadInvoicePdf, PaidSwitch, SendInvoiceDialog, StageBadge, useInv } from "./shared";

const ORDER = { draft: 0, held: 1, overdue: 2, sent: 3, paid: 4 } as const;
const TABS: { value: Show; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts" },
  { value: "held", label: "On hold" },
  { value: "unpaid", label: "Sent" },
  { value: "overdue", label: "Overdue" },
  { value: "paid", label: "Paid" },
];
const ADDRESS: Record<Show, string> = { all: "/invoicing", draft: "/invoicing?show=draft", paid: "/invoicing?show=paid", held: "/invoicing/held", unpaid: "/invoicing/invoiced", overdue: "/invoicing/invoiced?show=overdue", sent: "/invoicing/invoiced" };

/** One square of the aged debt strip. Pressing it shows those invoices in the list below; pressing it again shows all that is owed. */
function AgeTile({ to, current, label, amount, count, tone, className }: { to: string; current: boolean; label: string; amount: string; count: number; tone?: "warn" | "bad"; className?: string }) {
  return (
    <Link to={to} aria-current={current ? "true" : undefined} className={cx("press block px-3 py-2", current ? "bg-accent-soft" : "hover:bg-accent-soft/60", className)}>
      <span className="block text-[0.87rem] text-muted">{label}</span>
      <span className={cx("block text-[1.15rem] font-medium", tone === "bad" && "text-bad", tone === "warn" && "text-warn")}>{amount}</span>
      <span className="block text-[0.87rem] text-muted">{plural(count, "invoice")}</span>
    </Link>
  );
}

// Below 1280 wide (Tailwind's xl) a row becomes a block: invoice and total, then client and
// project, then sent, due, status and in accounts, each with its heading, then the buttons.
const STACK_ROW = "max-xl:grid max-xl:grid-cols-2 max-xl:gap-x-4 max-xl:gap-y-2 max-xl:border-b max-xl:border-line max-xl:px-3 max-xl:py-3 max-xl:last:border-b-0 sm:max-xl:grid-cols-4 [&>td]:max-xl:border-0 [&>td]:max-xl:p-0";
const LABELLED = "max-xl:before:block max-xl:before:text-[0.8rem] max-xl:before:text-muted max-xl:before:content-[attr(data-label)]";

/**
 * Every invoice to a client in one list: drafts still to go, held ones, what has been sent and
 * is owed, and what has been paid. The tabs filter it; each row's menu moves an invoice on.
 */

export function ClientInvoices() {
  const { db, day, region, access, canEdit, project, client } = useInv();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const design = useInvoiceDesign();
  const brand = usePrefs((s) => s.brand);
  const [text, setText] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState<SalesInvoice | null>(null);
  const [paying, setPaying] = useState<SalesInvoice | null>(null);

  const q = params.get("show");
  const show: Show = pathname.endsWith("/held") ? "held" : pathname.endsWith("/invoiced") ? (q === "overdue" ? "overdue" : "unpaid") : q === "draft" || q === "paid" ? q : "all";
  // The squares over the list narrow "Sent" to one age band: /invoicing/invoiced?age=1 is 1 to 30 days late.
  const band = params.get("age");
  const age = show === "unpaid" && band !== null && /^[0-3]$/.test(band) ? Number(band) : null;
  const all = db.salesInvoices;
  const count = (s: Show) => all.filter((i) => shows(i, s, day)).length;
  const rows = all
    .filter((i) => shows(i, show, day) && (age === null || inAgeBucket(i, age, day)) && matches(i, text, client(i.clientId), project(i.projectId)))
    .sort((a, b) => ORDER[stageOf(a, day)] - ORDER[stageOf(b, day)] || (stageOf(a, day) === "paid" ? (b.paidOn ?? "").localeCompare(a.paidOn ?? "") : (a.dueOn ?? "").localeCompare(b.dueOn ?? "")) || a.ref.localeCompare(b.ref));
  const debt = agedDebt(all, day);
  const drafts = count("draft");
  const pdf = (i: SalesInvoice) => downloadInvoicePdf(invoiceDoc({ invoice: i, client: client(i.clientId), project: project(i.projectId), design, company: brand.legalName, region, today: day })).then((name) => toast(`${name} downloaded`));

  return (
    <>
      <PageHead
        title="Client invoices"
        note={`${plural(debt.count, "invoice")} sent and not yet paid${access.seeValues ? `, ${money0(debt.gross, region)} owed including VAT` : ""}. ${count("overdue")} past the due date. ${drafts === 0 ? "No drafts waiting to go." : `${plural(drafts, "draft")} waiting to be sent.`}`}
        actions={
          <>
            <PaidSwitch value={show === "paid" ? "paid" : show === "unpaid" || show === "overdue" ? "unpaid" : "all"} onChange={(v) => navigate(ADDRESS[v === "paid" ? "paid" : v === "unpaid" ? "unpaid" : "all"])} counts={{ unpaid: count("unpaid"), paid: count("paid") }} />
            {canEdit && (
              <Button variant="primary" onClick={() => setDrafting(true)}>
                Draft an invoice
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        {access.seeValues && show !== "draft" && show !== "held" && show !== "paid" && (
          // Five across from 640 wide; on a phone the total on top and the four bands two by two, so nothing scrolls sideways.
          <Panel>
            <nav aria-label="Aged debt" className="grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
              <AgeTile to="/invoicing/invoiced" current={show === "unpaid" && age === null} label="Owed to us, with VAT" amount={money0(debt.gross, region)} count={debt.count} className="max-sm:col-span-2 max-sm:border-b max-sm:border-line" />
              {debt.buckets.map((b, n) => (
                <AgeTile key={b.label} to={age === n ? "/invoicing/invoiced" : `/invoicing/invoiced?age=${n}`} current={age === n} label={b.label} amount={money0(b.gross, region)} count={b.count} tone={b.count === 0 || n === 0 ? undefined : n === 3 ? "bad" : "warn"} className={cx(n < 2 && "max-sm:border-b max-sm:border-line", n % 2 === 1 && "max-sm:border-l max-sm:border-line")} />
              ))}
            </nav>
          </Panel>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {/* On a narrow screen the tabs go onto a second line rather than scrolling sideways. */}
          <div className="max-w-full min-w-0 [&>[role=tablist]]:flex-wrap">
            <Segmented label="Invoices shown" value={show} onChange={(s) => navigate(ADDRESS[s])} options={TABS.map((t) => ({ ...t, count: count(t.value) }))} />
          </div>
          <label className="relative ml-auto w-full max-w-xs">
            <span className="sr-only">Search client invoices</span>
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
            <input type="search" className="field pl-8" placeholder="Number, client, project or order number" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
        </div>
        {/* Below 1280 wide each invoice is a block of its own, so nothing is dragged sideways or cut off (Oisin, decision 84). */}
        <Panel>
          {rows.length === 0 ? (
            <Empty title={text ? `No invoice matches "${text}"` : age !== null ? `No invoice is ${age === 0 ? "sent and not yet due" : (AGE_BUCKETS[age] ?? "").toLowerCase()}` : show === "draft" ? "No drafts waiting to go" : show === "held" ? "Nothing is held" : show === "overdue" ? "Nothing is overdue" : show === "paid" ? "Nothing paid yet" : "No invoices here yet"}>
              {text ? "Try the invoice number, the client's name, the site code or their order number." : show === "draft" ? "A stage payment appears here when its stage is reached, a final account when a project is marked complete, or draft one by hand." : show === "held" ? "A final account is held while an extra is waiting to be agreed or snagging is open." : undefined}
            </Empty>
          ) : (
            <table className="tbl max-xl:block">
              <thead className="max-xl:hidden">
                <tr>
                  <th>Invoice</th>
                  <th>Client and project</th>
                  <th>Sent</th>
                  <th>Due</th>
                  {access.seeValues && <th className="num">Total with VAT</th>}
                  <th>Status</th>
                  {ACCOUNTS_EXPORT && <th>In accounts</th>}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="max-xl:block">
                {rows.map((i) => {
                  const p = project(i.projectId);
                  const c = client(i.clientId);
                  const stage = stageOf(i, day);
                  const no = invoiceNo(i);
                  const query = openQuery(db.invoiceQueries, i.id);
                  return (
                    <tr key={i.id} data-invoice={no} className={STACK_ROW}>
                      <td className="max-xl:col-span-2 sm:max-xl:col-span-3 sm:max-xl:row-start-1">
                        <Link to={`/invoicing/client/${no}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                          {no}
                        </Link>
                        <span className="block max-w-[20rem] text-[0.87rem] text-muted">{i.description}</span>
                      </td>
                      <td className="max-xl:col-span-2 sm:max-xl:col-span-4 sm:max-xl:row-start-2">
                        {access.can("customers") ? (
                          <Link to={`/customers/${i.clientId}`} className="text-accent-ink underline-offset-2 hover:underline">
                            {c?.name}
                          </Link>
                        ) : (
                          c?.name
                        )}
                        <Link to={`/projects/${p?.code}`} className="block text-[0.87rem] text-muted underline-offset-2 hover:text-accent-ink hover:underline">
                          {p?.code} {p?.name}
                        </Link>
                      </td>
                      <td className={cx("whitespace-nowrap", LABELLED)} data-label="Sent">
                        {i.issuedOn ? dShort(i.issuedOn) : <span className="text-muted">Not sent</span>}
                        {i.sentVia && <span className="block text-[0.87rem] text-muted">{routeWords(i.sentVia)}</span>}
                      </td>
                      <td className={cx("whitespace-nowrap", LABELLED)} data-label="Due">
                        {stage === "held" ? <span className="text-muted">-</span> : i.dueOn ? dShort(i.dueOn) : <span className="text-muted">{c?.termsDays ?? 30} days after sending</span>}
                        {(stage === "sent" || stage === "overdue") && <span className={cx("block text-[0.87rem]", stage === "overdue" ? "text-bad" : "text-muted")}>{dueWords(i, day)}</span>}
                        {stage === "paid" && <span className="block text-[0.87rem] text-muted">Paid {dShort(i.paidOn)}</span>}
                      </td>
                      {access.seeValues && (
                        <td data-label="Total with VAT" className="num font-medium max-xl:text-left max-sm:before:block max-sm:before:text-[0.8rem] max-sm:before:font-normal max-sm:before:text-muted max-sm:before:content-[attr(data-label)] sm:max-xl:col-start-4 sm:max-xl:row-start-1 sm:max-xl:text-right">
                          {money2(grossOf(i), region)}
                          <span className="block text-[0.87rem] font-normal text-muted">{money2(i.net, region)} before VAT</span>
                        </td>
                      )}
                      <td className={LABELLED} data-label="Status">
                        <StageBadge i={i} />
                        {stage === "held" && <span className="mt-1 block max-w-[18rem] text-[0.87rem] text-warn">{holdWords(db.projects.find((x) => x.id === i.projectId), db.variations, db.snags, i.holdReason).replace(/^On hold because /, "Because ").replace(/^On hold: /, "")}</span>}
                        {query && (
                          <Link to="/invoicing/queries" className="mt-1 block">
                            <Badge tone="warn">Query open</Badge>
                          </Link>
                        )}
                        {i.clientPaidOn && stage !== "paid" && <span className="mt-1 block text-[0.87rem] text-muted">Client says paid {dShort(i.clientPaidOn)}</span>}
                      </td>
                      {ACCOUNTS_EXPORT && <td className={cx("whitespace-nowrap", LABELLED)} data-label="In accounts">{i.exportedAt ? dShort(i.exportedAt.slice(0, 10)) : i.issuedOn ? <span className="text-muted">Not yet</span> : ""}</td>}
                      <td className="text-right whitespace-nowrap max-xl:col-span-2 max-xl:text-left sm:max-xl:col-span-4">
                        <span className="inline-flex items-center gap-1.5">
                          {canEdit && stage === "draft" && (
                            <Button size="sm" onClick={() => setSending(i)}>
                              Send
                            </Button>
                          )}
                          {canEdit && (stage === "sent" || stage === "overdue") && (
                            <Button size="sm" onClick={() => setPaying(i)}>
                              Mark paid
                            </Button>
                          )}
                          {canEdit && stage === "paid" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                unmarkInvoicePaid(i.id);
                                toast(`${no} is unpaid again`);
                              }}
                            >
                              Undo paid
                            </Button>
                          )}
                          {/* A hold is dealt with where its reasons are (21 Nov): the project's variations and snags, where a manager can also clear it after a confirm box. */}
                          {stage === "held" && (
                            <Link to={`/projects/${p?.code}?tab=extras`} className="text-accent-ink underline-offset-2 hover:underline">
                              See what is open
                            </Link>
                          )}
                          <Menu label={`More for ${no}`} trigger={<DotsThree size={20} weight="bold" />}>
                            {(close) => (
                              <>
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    navigate(`/invoicing/client/${no}`);
                                  }}
                                >
                                  Open the invoice
                                </MenuItem>
                                <MenuItem
                                  onClick={() => {
                                    close();
                                    void pdf(i);
                                  }}
                                >
                                  Download the PDF
                                </MenuItem>
                                {canEdit && (stage === "sent" || stage === "overdue") && (
                                  <MenuItem
                                    onClick={() => {
                                      close();
                                      setSending(i);
                                    }}
                                  >
                                    Send it again
                                  </MenuItem>
                                )}
                                {canEdit && stage === "draft" && (
                                  <MenuItem
                                    onClick={() => {
                                      close();
                                      issueInvoice(i.id);
                                      // Read back the number that issuing gave it.
                                      const done = useData.getState().db.salesInvoices.find((x) => x.id === i.id);
                                      toast(`${done ? invoiceNo(done) : no} marked as sent. No email went from here`);
                                    }}
                                  >
                                    Mark as sent, by post or by hand
                                  </MenuItem>
                                )}
                                {canEdit && stage === "draft" && i.manual && (
                                  <MenuItem
                                    tone="bad"
                                    onClick={() => {
                                      close();
                                      deleteDraftInvoice(i.id);
                                      toast(`Draft ${i.ref} deleted`);
                                    }}
                                  >
                                    Delete this draft
                                  </MenuItem>
                                )}
                              </>
                            )}
                          </Menu>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      <DraftInvoiceDialog open={drafting} onClose={() => setDrafting(false)} onSaved={(ref) => navigate(`/invoicing/client/${ref}`)} />
      <SendInvoiceDialog invoice={sending} onClose={() => setSending(null)} />
      <ClientPaidDialog invoice={paying} onClose={() => setPaying(null)} />
    </>
  );
}

type DraftLine = Omit<InvoiceLine, "id">;

/**
 * Draft an invoice against a project. Picking the project fills in who it is billed to, their
 * order number, terms and VAT from the records; the lines start from the next stage, an agreed
 * extra or dayworks, and everything can be changed before the draft is made.
 * With `edit`, the same form changes a draft that already exists.
 */
/** `projectId`: start on this project (Money in, Payment claims: "Draft this month's claim"). */
export function DraftInvoiceDialog({ open, onClose, onSaved, edit, projectId }: { open: boolean; onClose: () => void; onSaved: (ref: string) => void; edit?: SalesInvoice; projectId?: string }) {
  return open ? <DraftForm key={edit?.id ?? projectId ?? "new"} edit={edit} preset={projectId} onClose={onClose} onSaved={onSaved} /> : null;
}

function DraftForm({ edit, preset, onClose, onSaved }: { edit?: SalesInvoice; preset?: string; onClose: () => void; onSaved: (ref: string) => void }) {
  const { db, region, access } = useInv();
  const formId = useId();
  const [find, setFind] = useState("");
  const [projectId, setProjectId] = useState(edit?.projectId ?? "");
  const [start, setStart] = useState("stage");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [lines, setLines] = useState<DraftLine[]>(edit ? (edit.lines ?? [{ description: edit.description, qty: 1, unit: "item", rate: edit.net }]).map(({ description: d, qty, unit, rate }) => ({ description: d, qty, unit, rate })) : []);
  const [vatPct, setVatPct] = useState(edit?.vatPct ?? REGION[region].vatPct);
  const [poNumber, setPoNumber] = useState(edit?.poNumber ?? "");
  const [notes, setNotes] = useState(edit?.notes ?? "");

  const p = db.projects.find((x) => x.id === projectId);
  const c = db.clients.find((x) => x.id === p?.clientId);
  // One raised from a stage or a finished job follows the contract: its figure is not typed here.
  const locked = !!edit && !edit.manual;
  const percentDone = (proj: typeof p) => (proj ? (proj.status === "Live" || proj.status === "Not started" ? scopePercent(db.scopeTasks.filter((t) => t.projectId === proj.id)) : 100) : 0);
  const suggested = p ? doneNotBilled(p, percentDone(p), db.salesInvoices) : 0;
  const starts = p ? draftStarts(p, db.salesInvoices, db.variations, suggested) : [];
  const needle = find.trim().toLowerCase();
  const found = db.projects
    .filter((x) => x.status !== "Closed" && x.value != null)
    .filter((x) => !needle || [x.code, x.name, db.clients.find((cl) => cl.id === x.clientId)?.name ?? ""].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => b.code.localeCompare(a.code))
    .slice(0, needle ? 8 : 6);

  const choose = (id: string) => {
    const proj = db.projects.find((x) => x.id === id);
    if (!proj) return;
    const first = draftStarts(proj, db.salesInvoices, db.variations, doneNotBilled(proj, percentDone(proj), db.salesInvoices))[0]!;
    setProjectId(id);
    setStart(first.key);
    setDescription(first.description);
    setLines(first.lines.map((l) => ({ ...l })));
    setPoNumber(db.quotes.find((x) => x.id === proj.quoteId)?.poNumber ?? "");
  };
  // Opened for one project: start on it, as if it had been picked.
  useEffect(() => {
    if (preset && !edit) choose(preset);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const begin = (key: string) => {
    const s = starts.find((x) => x.key === key);
    if (!s) return;
    setStart(key);
    setDescription(s.description);
    setLines(s.lines.map((l) => ({ ...l })));
  };
  const setLine = (n: number, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l, k) => (k === n ? { ...l, ...patch } : l)));

  const net = linesNet(lines);
  const vat = r2((net * vatPct) / 100);
  const left = p ? leftToBill(p, db.salesInvoices, edit?.id) : 0;
  const billed = p ? billedSoFar(p.id, db.salesInvoices) : { invoiced: 0, paid: 0 };
  const over = !locked && !!p && net > left + 0.005;
  const problem = !p
    ? "Choose the project this invoice is for."
    : locked
      ? ""
      : !description.trim()
        ? "Say what the invoice is for."
        : lines.length === 0 || lines.some((l) => !l.description.trim())
          ? "Every line needs a description."
          : net <= 0
            ? "Give at least one line a quantity and a rate."
            : over
              ? `That is ${money2(net - left, region)} more than is left to bill on ${p.code}. Lower the amount, or agree an extra on the project first.`
              : "";
  const save = () => {
    if (problem || !p) return;
    if (edit) {
      saveDraftInvoice(edit.id, { description: description.trim(), lines, vatPct, poNumber: poNumber.trim(), notes: notes.trim() });
      toast(`Draft ${edit.ref} changed`);
      onClose();
      return;
    }
    const ref = draftInvoice({ projectId: p.id, description: description.trim(), lines, vatPct, poNumber: poNumber.trim(), notes: notes.trim() });
    toast(`Draft ${ref} made for ${p.code}. Check it, then send it`);
    onClose();
    onSaved(ref);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={edit ? `Change draft ${edit.ref}` : "Draft an invoice"}
      wide
      footer={
        <>
          {p && !edit && <p className="mr-auto self-center text-[0.93rem] text-muted">Nothing goes to the client yet. You check the invoice, then send it.</p>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!p || !!problem}>
            {edit ? "Save the draft" : "Create draft invoice"}
          </Button>
        </>
      }
    >
    <form
      id={formId}
      className="grid grid-cols-1 gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!p ? (
        <div>
          <Field label="Project" hint="Type a site code, a project name or a client. The details below fill themselves in from the records.">
            {(id) => <input id={id} autoFocus className="field" placeholder="For example C720, Ardmullen or Dunmoy" value={find} onChange={(e) => setFind(e.target.value)} />}
          </Field>
          <ul aria-label="Projects found" className="mt-2 divide-y divide-line rounded-md border border-line">
            {found.length === 0 && <li className="px-3 py-2 text-muted">No project matches "{find}".</li>}
            {found.map((x) => {
              const rest = leftToBill(x, db.salesInvoices);
              return (
                <li key={x.id}>
                  <button type="button" className="press flex w-full flex-wrap items-baseline gap-x-3 px-3 py-2 text-left hover:bg-accent-soft/60" onClick={() => choose(x.id)}>
                    <span className="font-medium">
                      {x.code} {x.name}
                    </span>
                    <span className="text-muted">{db.clients.find((cl) => cl.id === x.clientId)?.name}</span>
                    <span className="ml-auto text-[0.93rem] text-muted">{access.seeValues ? `${money0(rest, region)} left to bill` : x.status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <>
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Project</p>
              <p>
                {p.code} {p.name}
                {!edit && (
                  <button type="button" className="ml-2 text-[0.93rem] text-accent-ink underline-offset-2 hover:underline" onClick={() => setProjectId("")}>
                    Change
                  </button>
                )}
              </p>
              <p className="text-[0.93rem] text-muted">
                {p.location}, {co(p.county)}
              </p>
              {access.seeValues && (
                <p className="mt-1 text-[0.93rem] text-muted">
                  Contract {money0(p.value, region)}. Invoiced so far {money0(billed.invoiced, region)}. Left to bill {money0(left, region)}.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Billed to</p>
              <p>{c?.name}</p>
              <p className="text-[0.93rem] text-muted">
                {[c?.contactName, c?.address, c?.county && co(c.county)].filter(Boolean).join(", ")}
              </p>
              <p className="mt-1 text-[0.93rem] text-muted">
                Emailed to {billingEmail(c)}. Due {c?.termsDays ?? 30} days after sending.
              </p>
            </div>
          </div>

          {!locked && !edit && (
            <Field label="Start from" hint={`${percentDone(p)}% of the work on ${p.code} is ticked off${access.seeValues ? `, and ${money0(suggested, region)} of it is not on an invoice yet` : ""}. Everything below can still be changed.`}>
              {(id) => (
                <select id={id} className="field" value={start} onChange={(e) => begin(e.target.value)}>
                  {starts.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <Field label="What it is for" hint="Shown in the invoice list and in the email.">
              {(id) => <input id={id} className="field" disabled={locked} placeholder="Stage payment 2: west elevation" value={description} onChange={(e) => setDescription(e.target.value)} />}
            </Field>
            <Field label="Client's order number" hint="Printed on the invoice.">
              {(id) => <input id={id} className="field" placeholder="None given" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />}
            </Field>
          </div>

          <div>
            <p className="mb-1 text-[0.93rem] font-medium">Lines</p>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="min-w-[14rem]">Description</th>
                    <th className="num w-20">Qty</th>
                    <th className="w-24">Unit</th>
                    <th className="num w-28">Rate</th>
                    <th className="num w-28">Amount</th>
                    <th className="w-10" aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, n) => (
                    <tr key={n}>
                      <td>{locked ? l.description : <input aria-label={`Description of line ${n + 1}`} className="field h-8" value={l.description} onChange={(e) => setLine(n, { description: e.target.value })} />}</td>
                      <td className="num">{locked ? l.qty : <NumInput label={`Quantity of line ${n + 1}`} className="w-16" value={l.qty} onChange={(v) => setLine(n, { qty: v })} />}</td>
                      <td>{locked ? l.unit : <input aria-label={`Unit of line ${n + 1}`} className="field h-8" value={l.unit} onChange={(e) => setLine(n, { unit: e.target.value })} />}</td>
                      <td className="num">{locked ? money2(l.rate, region) : <NumInput label={`Rate of line ${n + 1}`} className="w-24" value={l.rate} onChange={(v) => setLine(n, { rate: v })} />}</td>
                      <td className="num">{money2(lineTotal(l), region)}</td>
                      <td>
                        {!locked && lines.length > 1 && (
                          <button type="button" aria-label={`Remove line ${n + 1}`} className="press grid size-8 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad" onClick={() => setLines((ls) => ls.filter((_, k) => k !== n))}>
                            <Trash size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {locked ? (
              <p className="mt-1.5 text-[0.93rem] text-muted">This invoice was raised from the project, so its figure follows the contract. The order number and the notes can be changed.</p>
            ) : (
              <Button size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, { description: "", qty: 1, unit: "item", rate: 0 }])}>
                Add a line
              </Button>
            )}
          </div>

          <div className="grid items-start gap-x-5 gap-y-3 sm:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="grid gap-3">
              <Field label="VAT">
                {(id) => (
                  <select id={id} className="field" disabled={locked} value={vatPct} onChange={(e) => setVatPct(Number(e.target.value))}>
                    {VAT_RATES[region].map((r) => (
                      <option key={r.pct} value={r.pct}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Notes printed on the invoice" hint="Optional.">
                {(id) => <textarea id={id} rows={2} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />}
              </Field>
            </div>
            <dl aria-label="Invoice total" className="grid grid-cols-2 gap-y-1 rounded-md border border-line bg-side px-3 py-2.5">
              <dt className="text-muted">Subtotal</dt>
              <dd className="text-right">{money2(net, region)}</dd>
              <dt className="text-muted">VAT at {vatPct}%</dt>
              <dd className="text-right">{money2(vat, region)}</dd>
              <dt className="border-t border-line-strong pt-1 font-medium">Total</dt>
              <dd className="border-t border-line-strong pt-1 text-right font-medium">{money2(r2(net + vat), region)}</dd>
              {!locked && access.seeValues && (
                <>
                  <dt className="pt-1 text-[0.87rem] text-muted">Left on the contract after this</dt>
                  <dd className={cx("pt-1 text-right text-[0.87rem]", over ? "text-bad" : "text-muted")}>{money2(r2(left - net), region)}</dd>
                </>
              )}
            </dl>
          </div>
        </>
      )}
      {p && problem && <p className="text-[0.93rem] text-warn">{problem}</p>}
    </form>
    </Dialog>
  );
}
