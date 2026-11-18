import { Check, FilmStrip, Image as ImageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { acceptQuote, queryQuote } from "@/data/actions";
import { co } from "@/data/place";
import { useData, usePrefs } from "@/data/store";
import type { Client, Db, Project, Quote } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { gross, money0, money2, REGION } from "@/lib/money";
import { scopePercent } from "@/lib/project-costs";
import { quoteTotal } from "@/lib/quotes";
import { Badge, Button, cx, Dialog, Empty, Field, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { PortalInvoices, PortalSendDocument } from "./PortalInvoices";

const SHARED = ["Handover", "Conservation reports", "Drawings"];

/**
 * What a client sees when they sign in: one page that scrolls. Quotes waiting on them first,
 * then each of their projects with progress, photos, documents and invoices. Nothing internal
 * (costs, margins, staff notes) is ever shown here.
 */
export function Portal() {
  const db = useData((s) => s.db);
  const role = usePrefs((s) => s.role);
  const brand = usePrefs((s) => s.brand);
  const clientId = usePrefs((s) => s.portalClientId);
  const setClient = usePrefs((s) => s.setPortalClient);
  const withWork = db.clients.filter((c) => db.projects.some((p) => p.clientId === c.id) || db.quotes.some((q) => q.clientId === c.id)).sort((a, b) => a.name.localeCompare(b.name));
  const client = withWork.find((c) => c.id === clientId) ?? withWork[0];
  if (!client)
    return (
      <PageBody>
        <Panel>
          <Empty title="No clients yet" />
        </Panel>
      </PageBody>
    );
  const quotes = db.quotes.filter((q) => q.clientId === client.id && ["Sent", "Opened", "Queried"].includes(q.status));
  const order = { Live: 0, "Not started": 1, Complete: 2, Invoiced: 3, Closed: 4 } as Record<string, number>;
  const projects = db.projects.filter((p) => p.clientId === client.id).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.code.localeCompare(a.code));
  return (
    <>
      <PageHead
        title={client.name}
        note={`${brand.legalName} client portal. ${client.contactName} sees ${plural(projects.length, "project")} and ${plural(quotes.length, "quote")} waiting on a decision.`}
        actions={
          role !== "client" && (
            <label className="flex items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Viewing as</span>
              <select aria-label="Client to view the portal as" className="field w-auto" value={client.id} onChange={(e) => setClient(e.target.value)}>
                {withWork.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )
        }
      />
      <PageBody className="grid max-w-4xl gap-7">
        {role !== "client" && <p className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">This is exactly what {client.contactName} sees. Costs, margins and internal notes never appear here.</p>}
        {quotes.length > 0 && (
          <Section title="Quotes waiting on you">
            <div className="grid gap-3">
              {quotes.map((q) => (
                <QuoteCard key={q.id} q={q} />
              ))}
            </div>
          </Section>
        )}
        {projects.length === 0 && quotes.length === 0 && (
          <Panel>
            <Empty title="Nothing to show yet">Your quotes and projects will appear here.</Empty>
          </Panel>
        )}
        {projects.map((p) => (
          <ProjectBlock key={p.id} p={p} db={db} client={client} />
        ))}
      </PageBody>
    </>
  );
}

function QuoteCard({ q }: { q: Quote }) {
  const region = usePrefs((s) => s.brand.region);
  const [mode, setMode] = useState<"accept" | "ask" | null>(null);
  const [text, setText] = useState("");
  const net = quoteTotal(q.lines);
  const vat = REGION[region].vatPct;
  return (
    <Panel>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-3">
        <h3 className="mr-auto text-[1.1rem]">
          {q.ref} {q.title}
        </h3>
        {q.status === "Queried" ? <Badge tone="warn">You asked a question</Badge> : <span className="text-muted">Sent {dShort(q.sentAt?.slice(0, 10))}</span>}
      </div>
      <table className="tbl">
        <tbody>
          {q.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.description}</td>
              <td className="num whitespace-nowrap">{money2(l.qty * l.rate, region)}</td>
            </tr>
          ))}
          <tr>
            <td className="text-right text-muted">Total before VAT</td>
            <td className="num font-medium">{money2(net, region)}</td>
          </tr>
          <tr>
            <td className="text-right text-muted">Total including VAT at {vat}%</td>
            <td className="num font-medium">{money2(gross(net, vat), region)}</td>
          </tr>
        </tbody>
      </table>
      {q.query && <p className="border-t border-line px-4 py-2 text-muted">Your question: "{q.query}"{/[.!?]$/.test(q.query) ? "" : "."} We will come back to you with a reply or a revised quote.</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">
        <Button onClick={() => { setText(""); setMode("ask"); }}>Ask a question</Button>
        <Button variant="primary" onClick={() => { setText(""); setMode("accept"); }}>
          Accept this quote
        </Button>
      </div>
      <Dialog
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === "accept" ? `Accept ${q.ref}` : `Ask about ${q.ref}`}
        footer={
          <>
            <Button onClick={() => setMode(null)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={mode === "ask" && !text.trim()}
              onClick={() => {
                if (mode === "accept") {
                  const code = acceptQuote(q.id, text.trim());
                  toast(`Accepted. Your project has been set up as ${code}`);
                } else {
                  queryQuote(q.id, text);
                  toast("Question sent. It has gone to the person who priced the work");
                }
                setMode(null);
              }}
            >
              {mode === "accept" ? "Accept quote" : "Send question"}
            </Button>
          </>
        }
      >
        {mode === "accept" ? (
          <Field label="Your purchase order number" hint="Optional. It will be printed on every invoice for this work.">
            {(id) => <input id={id} className="field" value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
        ) : (
          <Field label="Your question">{(id) => <textarea id={id} rows={4} className="field" value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        )}
      </Dialog>
    </Panel>
  );
}

function ProjectBlock({ p, db, client }: { p: Project; db: Db; client: Client }) {
  const region = usePrefs((s) => s.brand.region);
  const [all, setAll] = useState(false);
  const tasks = db.scopeTasks.filter((t) => t.projectId === p.id);
  const done = p.status !== "Live" && p.status !== "Not started";
  const pct = done ? 100 : scopePercent(tasks);
  const photos = db.files.filter((f) => f.projectId === p.id && f.category === "Photos and videos").sort((a, b) => b.modified.localeCompare(a.modified));
  // The handover pack is the client's once the handover email has gone, not while it waits for approval.
  // Also what the client has sent in themselves: a purchase order, a payment certificate.
  const docs = db.files.filter((f) => f.projectId === p.id && (f.source === "Portal" || (SHARED.includes(f.category) && (f.category !== "Handover" || !!p.handoverSentAt)))).sort((a, b) => b.modified.localeCompare(a.modified));
  const extras = db.variations.filter((v) => v.projectId === p.id && v.status === "Approved");
  const shown = all ? tasks : tasks.slice(0, 6);
  return (
    <section aria-label={`${p.code} ${p.name}`} className="grid gap-4">
      <div className="border-b-2 border-line-strong pb-2">
        <h2 className="text-[1.35rem]">{p.name}</h2>
        <p className="text-muted">
          {p.location}, {co(p.county)}. Our reference {p.code}.
        </p>
      </div>
      <div>
        <p className="font-medium">{p.status === "Not started" ? `Starts ${dFull(p.startDate)}` : done ? `Completed ${dFull(p.endDate)}${p.handoverSentAt ? `. Handover pack sent ${dShort(p.handoverSentAt.slice(0, 10))}` : ""}` : `${pct}% of the work is done. Due to finish ${dFull(p.endDate)}`}</p>
        <div className="mt-1.5 h-2 max-w-md overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${p.name} progress`}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {tasks.length > 0 && (
        <Section title="The work" aside={`${tasks.filter((t) => t.done).length} of ${tasks.length} items done`}>
          <Panel>
            <ul className="divide-y divide-line">
              {shown.map((t) => (
                <li key={t.id} className="flex items-baseline gap-2.5 px-3 py-1.5">
                  <span className={cx("grid size-4 shrink-0 translate-y-0.5 place-items-center rounded-full", t.done || done ? "bg-ok-soft text-ok" : "border border-line-strong")}>{(t.done || done) && <Check size={11} weight="bold" />}</span>
                  <span className="min-w-0 flex-1">{t.description}</span>
                  <span className="shrink-0 text-[0.87rem] text-muted">{t.done || done ? (t.completedAt ? `Done ${dShort(t.completedAt.slice(0, 10))}` : "Done") : "To do"}</span>
                </li>
              ))}
            </ul>
            {tasks.length > 6 && (
              <button type="button" className="press w-full border-t border-line px-3 py-2 text-left font-medium text-accent-ink hover:bg-accent-soft/60" onClick={() => setAll((v) => !v)}>
                {all ? "Show fewer" : `Show all ${tasks.length} items`}
              </button>
            )}
          </Panel>
        </Section>
      )}

      {photos.length > 0 && (
        <Section title="Latest photos" aside={`${photos.length} from site`}>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {photos.slice(0, 8).map((f) => (
              <li key={f.id} className="overflow-hidden rounded-md border border-line bg-surface">
                {f.dataUrl ? (
                  <img src={f.dataUrl} alt={f.caption ?? ""} className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center text-accent-ink" style={{ background: `color-mix(in srgb, var(--accent) ${14 + f.tone * 7}%, var(--side))` }}>
                    {f.kind === "video" ? <FilmStrip size={24} /> : <ImageIcon size={24} />}
                  </div>
                )}
                <p className="line-clamp-2 px-2 pt-1.5 text-[0.87rem] font-medium">{f.caption}</p>
                <p className="px-2 pb-1.5 text-[0.87rem] text-muted">
                  {dShort(f.modified)}, {f.stage?.toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid items-start gap-5 sm:grid-cols-2">
        <Section title="Documents">
          <Panel>
            {docs.length === 0 ? (
              <p className="px-3 py-2.5 text-muted">Drawings, conservation reports and your handover pack appear here as they are issued.</p>
            ) : (
              <ul className="divide-y divide-line">
                {docs.slice(0, 6).map((f) => (
                  <li key={f.id} className="px-3 py-1.5">
                    <span className="block truncate">{f.name}</span>
                    <span className="text-[0.87rem] text-muted">
                      {f.source === "Portal" ? "Sent by you" : f.category}, {dShort(f.modified)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line px-3 py-2">
              <PortalSendDocument project={p} client={client} />
            </div>
          </Panel>
        </Section>
        <Section title="Invoices">
          <PortalInvoices project={p} client={client} />
        </Section>
      </div>
      {extras.length > 0 && (
        <Section title="Extras you have agreed">
          <Panel>
            <ul className="divide-y divide-line">
              {extras.map((v) => (
                <li key={v.id} className="flex items-baseline gap-3 px-3 py-1.5">
                  <span className="min-w-0 flex-1">{v.description}</span>
                  <span className="shrink-0">{money0(v.estimatedValue, region)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
    </section>
  );
}
