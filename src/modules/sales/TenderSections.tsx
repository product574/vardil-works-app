import { Check, FileText, Image as ImageIcon, Plus, Trash } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addTenderFile, askSubPrice, chaseQuote, declineQuote, pickSubPrice, recordSubPrice, removeTenderFile, sendQuote, setBuildsoftTotal, setTenderCheck, setTenderReturn } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Quote, TenderFileKind } from "@/data/types";
import { addDays } from "@/lib/dates";
import { dFull, dShort, plural, when } from "@/lib/format";
import { readAttachment, shrinkImage } from "@/lib/image";
import { money2 } from "@/lib/money";
import { quoteTotal } from "@/lib/quotes";
import { allChecked, buildsoftDiff, cheapest, checksDone, DOC_KINDS, returnTone, returnWords, subsState, TENDER_CHECKS, tenderStage, WORKINGS_KINDS } from "@/lib/tenders";
import { Badge, Button, cx, Dialog, Empty, Field, NumInput, Panel, Section, Tel } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

/** A tender can be changed while it is being priced, and by someone who prices quotes. */
const useTender = (q: Quote) => {
  const access = useAccess();
  const editable = access.may("priceQuotes") && tenderStage(q) === "pricing";
  return { access, editable, region: usePrefs((s) => s.brand.region), day: useDay() };
};

// ── Overview: the project, where it is, the client, the return date ───────────

export function TenderOverview({ q }: { q: Quote }) {
  const db = useData((s) => s.db);
  const { editable, access, region, day } = useTender(q);
  const e = db.enquiries.find((x) => x.id === q.enquiryId);
  const c = db.clients.find((x) => x.id === q.clientId);
  const subs = subsState(q.tender?.subPrices ?? []);
  const photos = (q.tender?.files ?? []).filter((f) => f.kind === "Site photo").length;
  const docs = (q.tender?.files ?? []).filter((f) => DOC_KINDS.includes(f.kind)).length;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="The project">
        <Panel className="px-4 py-3">
          <p className="font-medium">{q.title}</p>
          {e && <p className="mt-1 text-muted">{e.description}</p>}
          <dl className="mt-3 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Location</dt>
            <dd>{e ? `${e.location}, ${co(e.county)}` : "Not recorded"}</dd>
            <dt className="text-muted">Kind of work</dt>
            <dd>{q.kind ?? "Not set"}</dd>
            <dt className="text-muted">Came in</dt>
            <dd>{e ? `${dFull(e.receivedAt.slice(0, 10))}, ${e.source.toLowerCase()}, logged by ${e.loggedBy}` : "Not recorded"}</dd>
            {access.seeValues && (
              <>
                <dt className="text-muted">Tender value</dt>
                <dd className="font-medium">{money2(quoteTotal(q.lines), region)} before VAT</dd>
              </>
            )}
          </dl>
        </Panel>
      </Section>
      <Section title="Client">
        <Panel className="px-4 py-3">
          <Link to={`/customers/${q.clientId}`} className="font-medium text-accent-ink underline-offset-2 hover:underline">
            {c?.name}
          </Link>
          <dl className="mt-2 grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <dt className="text-muted">Contact</dt>
            <dd>{e?.contactName ?? c?.contactName}</dd>
            <dt className="text-muted">Phone</dt>
            <dd>{c ? <Tel number={c.contactPhone} /> : "-"}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{c?.contactEmail}</dd>
            <dt className="text-muted">Pays in</dt>
            <dd>{c ? `${c.termsDays} days` : "-"}</dd>
          </dl>
        </Panel>
      </Section>
      <Section title="Return date">
        <Panel className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.4rem] leading-tight font-semibold">{q.tender ? dFull(q.tender.returnBy) : "Not set"}</p>
            <Badge tone={returnTone(q, day)} className="mt-1">
              {returnWords(q, day)}
            </Badge>
          </div>
          {editable && (
            <Field label="Change the return date">
              {(id) => <input id={id} type="date" className="field w-44" value={q.tender?.returnBy ?? ""} min={day} onChange={(ev) => ev.target.value && setTenderReturn(q.id, ev.target.value)} />}
            </Field>
          )}
        </Panel>
      </Section>
      <Section title="Where the tender is">
        <Panel>
          <ul className="divide-y divide-line">
            <Progress to="?tab=documents" label="Tender documents" value={plural(docs, "file")} />
            <Progress to="?tab=subcontractors" label="Subcontractors" value={subs.asked ? `${subs.back} of ${subs.asked} prices back${subs.missing.length ? `, ${plural(subs.missing.length, "trade")} not picked yet` : ", all picked"}` : "None asked"} tone={subs.missing.length ? "warn" : "ok"} />
            <Progress to="?tab=photos" label="Photos" value={plural(photos, "photo")} />
            <Progress to="?tab=completed" label="Checks" value={`${checksDone(q)} of ${TENDER_CHECKS.length} done`} tone={allChecked(q) ? "ok" : "warn"} />
          </ul>
        </Panel>
      </Section>
    </div>
  );
}

function Progress({ to, label, value, tone }: { to: string; label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <li>
      <Link to={to} replace className="flex items-baseline gap-3 px-4 py-2 hover:bg-accent-soft">
        <span className="w-40 shrink-0 font-medium">{label}</span>
        <span className={cx("min-w-0 flex-1", tone === "warn" && "text-warn", tone === "ok" && "text-ok")}>{value}</span>
      </Link>
    </li>
  );
}

// ── Files: tender documents, site photos, workings ────────────────────────────

/** The files of some kinds kept with the tender, with a way to add one. `photos`: show them as tiles. */
export function TenderFiles({ q, kinds, photos = false, title, empty }: { q: Quote; kinds: TenderFileKind[]; photos?: boolean; title: string; empty: string }) {
  const { editable, day } = useTender(q);
  const access = useAccess();
  const canAdd = access.may("priceQuotes");
  const [adding, setAdding] = useState(false);
  const files = (q.tender?.files ?? []).filter((f) => kinds.includes(f.kind));
  return (
    <Section
      title={title}
      aside={
        canAdd && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={16} /> {photos ? "Add a photo" : "Add a file"}
          </Button>
        )
      }
    >
      {files.length === 0 ? (
        <Panel>
          <Empty title={empty}>{canAdd ? (photos ? "Take a photo on the site visit, or choose one from this device." : "Add the client's documents as they come in.") : "Nothing here yet."}</Empty>
        </Panel>
      ) : photos ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label={title}>
          {files.map((f) => (
            <li key={f.id} className="overflow-hidden rounded-lg border border-line bg-surface">
              {f.dataUrl ? (
                <img src={f.dataUrl} alt={f.caption ?? f.name} className="aspect-[4/3] w-full object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center text-accent-ink" style={{ background: `color-mix(in srgb, var(--accent) ${14 + (f.tone ?? 0) * 7}%, var(--side))` }}>
                  <ImageIcon size={36} />
                </div>
              )}
              <div className="flex items-start gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{f.caption ?? f.name}</span>
                  <span className="text-[0.87rem] text-muted">
                    {f.addedBy}, {when(f.addedAt, day)}
                  </span>
                </span>
                {editable && <RemoveFile q={q} id={f.id} name={f.caption ?? f.name} />}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Panel>
          <ul className="divide-y divide-line" aria-label={title}>
            {files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                <FileText size={20} className="text-accent-ink" />
                <span className="min-w-0 flex-1 basis-56">
                  {f.dataUrl ? (
                    <a href={f.dataUrl} download={f.name} className="font-medium text-accent-ink underline-offset-2 hover:underline">
                      {f.name}
                    </a>
                  ) : (
                    <span className="font-medium">{f.name}</span>
                  )}
                  <span className="block text-[0.87rem] text-muted">
                    {f.kind}, {f.sizeKb >= 1000 ? `${(f.sizeKb / 1000).toFixed(1)} MB` : `${f.sizeKb} KB`}. Added by {f.addedBy}, {when(f.addedAt, day)}
                  </span>
                </span>
                {editable && <RemoveFile q={q} id={f.id} name={f.name} />}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {adding && <AddFileDialog q={q} kinds={kinds} photos={photos} onClose={() => setAdding(false)} />}
    </Section>
  );
}

function RemoveFile({ q, id, name }: { q: Quote; id: string; name: string }) {
  return (
    <button
      type="button"
      aria-label={`Take off: ${name}`}
      onClick={() => {
        removeTenderFile(q.id, id);
        toast(`${name} taken off ${q.ref}`);
      }}
      className="press grid size-8 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad"
    >
      <Trash size={16} />
    </button>
  );
}

function AddFileDialog({ q, kinds, photos, onClose }: { q: Quote; kinds: TenderFileKind[]; photos: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<TenderFileKind>(photos ? "Site photo" : kinds[0]!);
  const [file, setFile] = useState<{ name: string; dataUrl: string; sizeKb: number } | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const pick = async (f: File) => {
    setError("");
    try {
      if (photos) {
        if (!f.type.startsWith("image/")) throw new Error("Choose a photo: a JPEG, PNG or a picture from the camera.");
        const { dataUrl, sizeKb } = await shrinkImage(f);
        setFile({ name: f.name, dataUrl, sizeKb: Math.max(1, sizeKb) });
      } else setFile(await readAttachment(f));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={photos ? `Add a photo to ${q.ref}` : `Add a file to ${q.ref}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => {
              if (!file) return;
              addTenderFile(q.id, { kind, name: file.name, sizeKb: file.sizeKb, dataUrl: file.dataUrl, caption });
              toast(`${photos ? "Photo" : file.name} added to ${q.ref}`);
              onClose();
            }}
          >
            {photos ? "Add the photo" : "Add the file"}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {!photos && kinds.length > 1 && (
          <Field label="What it is">
            {(id) => (
              <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as TenderFileKind)}>
                {kinds.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            )}
          </Field>
        )}
        <PickFile accept={photos ? "image/*" : "image/*,application/pdf"} what={photos ? "photo" : "file"} chosen={file?.name} onFile={(f) => void pick(f)} />
        {photos && <Field label="What it shows (optional)">{(id) => <input id={id} className="field" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="North gable, cracked render" />}</Field>}
        <p className="text-[0.93rem] text-muted">{photos ? "Photos are shrunk and kept in this browser, as everywhere in the demo." : "Pictures and PDFs, kept in this browser, as everywhere in the demo. The sample documents have no file behind them."}</p>
        <p role="alert" className="min-h-6 text-bad">
          {error}
        </p>
      </div>
    </Dialog>
  );
}

// ── Subcontractors: ask, record their prices, pick one per trade ──────────────

export function TenderSubcontractors({ q }: { q: Quote }) {
  const db = useData((s) => s.db);
  const { editable, region, access } = useTender(q);
  const [asking, setAsking] = useState(false);
  const [pricing, setPricing] = useState<string | null>(null);
  const prices = q.tender?.subPrices ?? [];
  const st = subsState(prices);
  const low = cheapest(prices);
  const money = access.seeValues;
  return (
    <Section
      title="Subcontractors"
      aside={
        editable && (
          <Button size="sm" onClick={() => setAsking(true)}>
            <Plus size={16} /> Ask a subcontractor to price
          </Button>
        )
      }
    >
      <p className="mb-3 max-w-[75ch] text-muted">
        The trades we do not do ourselves. Each subcontractor asked is listed under their trade with the price they came back with. The one picked for each trade goes into the tender's price as subcontract.
        {st.trades.length > 0 && ` ${st.back} of ${st.asked} prices back.`}
        {st.missing.length > 0 && <span className="text-warn"> Still to pick: {st.missing.join(", ")}.</span>}
      </p>
      {prices.length === 0 ? (
        <Panel>
          <Empty title="No subcontractors asked yet">Ask a subcontractor for each trade the job needs: scaffolding, slating, carving and so on.</Empty>
        </Panel>
      ) : (
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label="Subcontractors' prices">
            <thead>
              <tr>
                <th>Subcontractor</th>
                <th>Asked</th>
                {money && <th className="num">Price before VAT</th>}
                <th>Note</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            {st.trades.map((trade) => (
              <tbody key={trade} aria-label={trade}>
                <tr>
                  <th colSpan={money ? 5 : 4} scope="rowgroup" className="bg-side text-left font-medium normal-case">
                    {trade}
                  </th>
                </tr>
                {prices
                  .filter((p) => p.trade === trade)
                  .map((p) => {
                    const sub = db.subcontractors.find((x) => x.id === p.subcontractorId);
                    return (
                      <tr key={p.id} className={cx(p.picked && "bg-ok-soft/50")}>
                        <td>
                          <span className="font-medium">{p.name}</span>
                          {sub && <span className="block text-[0.87rem] text-muted">Works for us now: {sub.contactName}</span>}
                        </td>
                        <td>{dShort(p.askedAt)}</td>
                        {money && (
                          <td className="num">
                            {p.price != null ? (
                              <>
                                <span className="font-medium">{money2(p.price, region)}</span>
                                {low.has(p.id) && <span className="block text-[0.87rem] text-ok">Lowest</span>}
                              </>
                            ) : (
                              <span className="text-warn">Not back yet</span>
                            )}
                          </td>
                        )}
                        <td className="text-[0.93rem] text-muted">{p.note ?? ""}</td>
                        <td className="text-right whitespace-nowrap">
                          {p.picked ? (
                            <Badge tone="ok">
                              <Check size={14} weight="bold" /> Picked
                            </Badge>
                          ) : (
                            editable && (
                              <span className="inline-flex gap-1.5">
                                <Button size="sm" variant="ghost" onClick={() => setPricing(p.id)}>
                                  {p.price != null ? "Change price" : "Record price"}
                                </Button>
                                {p.price != null && (
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      pickSubPrice(q.id, p.id);
                                      toast(`${p.name} picked for ${trade}`);
                                    }}
                                  >
                                    Use this price
                                  </Button>
                                )}
                              </span>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            ))}
            {money && (
              <tfoot>
                <tr>
                  <td colSpan={2} className="num border-t border-line-strong font-medium">
                    Picked, into the tender as subcontract
                  </td>
                  <td className="num border-t border-line-strong text-[1.08rem] font-medium">{money2(st.total, region)}</td>
                  <td colSpan={2} className="border-t border-line-strong" />
                </tr>
              </tfoot>
            )}
          </table>
        </Panel>
      )}
      {asking && <AskDialog q={q} onClose={() => setAsking(false)} />}
      {pricing && <PriceDialog q={q} id={pricing} onClose={() => setPricing(null)} />}
    </Section>
  );
}

function AskDialog({ q, onClose }: { q: Quote; onClose: () => void }) {
  const db = useData((s) => s.db);
  const formId = useId();
  const trades = [...new Set([...db.subcontractors.map((s) => s.trade), ...(q.tender?.subPrices ?? []).map((p) => p.trade)])].sort();
  const [trade, setTrade] = useState(trades[0] ?? "Scaffolding");
  const [who, setWho] = useState("");
  const [name, setName] = useState("");
  const ours = db.subcontractors.filter((s) => s.trade === trade);
  const save = () => {
    const sub = db.subcontractors.find((s) => s.id === who);
    const firm = sub?.name ?? name.trim();
    if (!firm) return;
    askSubPrice(q.id, { trade, name: firm, subcontractorId: sub?.id });
    toast(`${firm} asked to price ${trade.toLowerCase()} on ${q.ref}`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Ask a subcontractor to price"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!who && !name.trim()}>
            Ask them to price
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Trade">
          {(id) => (
            <select
              id={id}
              className="field"
              value={trade}
              onChange={(e) => {
                setTrade(e.target.value);
                setWho("");
              }}
            >
              {trades.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Who">
          {(id) => (
            <select id={id} className="field" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Someone we have not used, typed below</option>
              {ours.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {!who && <Field label="Their name">{(id) => <input id={id} className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Shannon Access Scaffolding" />}</Field>}
        <p className="text-[0.93rem] text-muted">In the demo nothing is sent: the request is recorded here, ready for their price.</p>
      </form>
    </Dialog>
  );
}

function PriceDialog({ q, id, onClose }: { q: Quote; id: string; onClose: () => void }) {
  const sp = q.tender?.subPrices.find((p) => p.id === id);
  const [price, setPrice] = useState(sp?.price ?? 0);
  const [note, setNote] = useState(sp?.note ?? "");
  if (!sp) return null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${sp.name}'s price`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!(price > 0)}
            onClick={() => {
              recordSubPrice(q.id, sp.id, price, note);
              toast(`Price recorded for ${sp.name}`);
              onClose();
            }}
          >
            Save the price
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-muted">For {sp.trade.toLowerCase()} on {q.ref}, before VAT.</p>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Price before VAT</p>
          <NumInput label="Price before VAT" className="w-36" value={price} onChange={setPrice} />
        </div>
        <Field label="Note (optional)">{(fid) => <input id={fid} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Excludes weekend working" />}</Field>
      </div>
    </Dialog>
  );
}

// ── Workings: the Buildsoft total beside the priced items ─────────────────────

export function BuildsoftPanel({ q }: { q: Quote }) {
  const { editable, region, access } = useTender(q);
  const [total, setTotal] = useState(q.tender?.buildsoftTotal ?? 0);
  const diff = buildsoftDiff(q);
  if (!access.seeValues) return null;
  return (
    <Section title="Buildsoft estimate">
      <Panel className="px-4 py-3">
        <p className="text-[0.93rem] text-muted">The total from the Buildsoft estimate, to check against the priced items before the tender goes.</p>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          {editable ? (
            <>
              <div>
                <p className="mb-1 text-[0.93rem] font-medium">Buildsoft total, before VAT</p>
                <NumInput label="Buildsoft total, before VAT" className="w-40" value={total} onChange={setTotal} />
              </div>
              <Button
                disabled={total === (q.tender?.buildsoftTotal ?? 0)}
                onClick={() => {
                  setBuildsoftTotal(q.id, total);
                  toast("Buildsoft total saved");
                }}
              >
                Save
              </Button>
            </>
          ) : (
            <p className="font-medium">{q.tender?.buildsoftTotal != null ? money2(q.tender.buildsoftTotal, region) : "Not entered"}</p>
          )}
        </div>
        {diff != null && <p className={cx("mt-2", diff === 0 ? "text-ok" : "text-warn")}>{diff === 0 ? "Matches the priced items." : `The priced items are ${money2(Math.abs(diff), region)} ${diff > 0 ? "more" : "less"} than the Buildsoft estimate. Check before the tender goes.`}</p>}
      </Panel>
    </Section>
  );
}

export const WorkingsFiles = ({ q }: { q: Quote }) => <TenderFiles q={q} kinds={WORKINGS_KINDS} title="Buildsoft and workings files" empty="No workings files yet" />;

// ── Tender completed: the checks, then submit ─────────────────────────────────

export function TenderCompleted({ q }: { q: Quote }) {
  const db = useData((s) => s.db);
  const { access, region, day } = useTender(q);
  const [submitting, setSubmitting] = useState(false);
  const client = db.clients.find((c) => c.id === q.clientId);
  const stage = tenderStage(q);
  const pricing = stage === "pricing";
  const canPrice = access.may("priceQuotes");
  const canApprove = access.may("approveDrafts");
  const ready = allChecked(q);
  const subs = subsState(q.tender?.subPrices ?? []);
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Section title={pricing ? "Before it goes" : "The checks before it went"}>
        <Panel>
          <ul className="divide-y divide-line" aria-label="Tender checks">
            {TENDER_CHECKS.map((c) => {
              const done = q.tender?.checks[c.key];
              const may = pricing && (c.approve ? canApprove : canPrice);
              const blocked = c.key === "subs" && subs.missing.length > 0;
              return (
                <li key={c.key} className="flex items-start gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label={c.label}
                    className="mt-1 size-5 shrink-0 accent-[var(--accent-strong)]"
                    checked={!!done}
                    disabled={!may || (!done && blocked)}
                    onChange={(e) => {
                      setTenderCheck(q.id, c.key, e.target.checked);
                      toast(e.target.checked ? `${c.label}: ticked` : `${c.label}: taken back`);
                    }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.label}</span>
                    <span className="text-[0.93rem] text-muted">{done ? `${done.by}, ${when(done.at, day)}` : !done && blocked ? `Pick a price for ${subs.missing.join(" and ")} first.` : c.approve && !canApprove ? `${c.hint}. The managing director ticks this.` : c.hint}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
        {pricing && canPrice && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="mr-auto max-w-[55ch] text-[0.93rem] text-muted">{ready ? `Ready to go to ${client?.contactName}. Submitting sends the client copy and puts the tender in the Pipeline as tendered.` : `${TENDER_CHECKS.length - checksDone(q)} still to tick before it can be submitted.`}</p>
            <Button variant="primary" disabled={!ready} onClick={() => setSubmitting(true)}>
              Submit tender
            </Button>
          </div>
        )}
      </Section>
      <WhereItStands q={q} />
      {submitting && (
        <Dialog
          open
          onClose={() => setSubmitting(false)}
          title={`Submit ${q.ref}?`}
          footer={
            <>
              <Button onClick={() => setSubmitting(false)}>Cancel</Button>
              <Button
                variant="primary"
                onClick={() => {
                  sendQuote(q.id);
                  toast(`${q.ref} submitted to ${client?.contactName}`);
                  setSubmitting(false);
                }}
              >
                Confirm and submit
              </Button>
            </>
          }
        >
          <div className="grid gap-2">
            <p>
              The client copy goes to {client?.contactName} at {client?.name}
              {access.seeValues ? `, ${money2(quoteTotal(q.lines), region)} before VAT` : ""}.
            </p>
            <p className="text-muted">It moves to the Pipeline as tendered, waiting for an answer. In the demo nothing leaves the browser.</p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Sent, opened, chased, answered: and chase, or record a decline, while it is out. */
export function WhereItStands({ q }: { q: Quote }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const client = db.clients.find((c) => c.id === q.clientId);
  const out = tenderStage(q) === "out";
  const canPrice = access.may("priceQuotes");
  return (
    <Section title="Where it stands">
      <Panel>
        <dl className="px-3 py-1">
          {[
            ["Return date", q.tender ? dFull(q.tender.returnBy) : "Not set"],
            ["Submitted", q.sentAt ? when(q.sentAt, day) : "Not yet"],
            ["Opened by client", q.openedAt ? when(q.openedAt, day) : "Not yet"],
            ["Last chased", q.chasedAt ? when(q.chasedAt, day) : "Not chased"],
            ["Client answered", q.respondedAt ? when(q.respondedAt, day) : "No answer yet"],
            ["Purchase order", q.poNumber ?? "None"],
            ["Valid until", q.sentAt ? dFull(addDays(q.sentAt.slice(0, 10), q.validDays)) : `${q.validDays} days from sending`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-3 border-b border-line py-1.5 last:border-0">
              <dt className="w-36 shrink-0 text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      {out && canPrice && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() => {
              chaseQuote(q.id);
              toast(`Chase to ${client?.contactName} recorded`);
            }}
          >
            Chase the client
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              declineQuote(q.id);
              toast(`${q.ref} recorded as declined`);
            }}
          >
            Record as declined
          </Button>
        </div>
      )}
    </Section>
  );
}
