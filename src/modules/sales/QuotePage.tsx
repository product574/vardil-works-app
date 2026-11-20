import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { X } from "@phosphor-icons/react";
import { acceptQuote, addCostRow, addQuoteLine, type CostGroup, removeCostRow, removeQuoteLine, setCostField, setCostLump, setQuoteLineField } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import { gross, money2, pct1, REGION } from "@/lib/money";
import { costBreakdown, lineValue, marginFlag, marginPct, quoteTotal } from "@/lib/quotes";
import { Button, cx, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { QuoteBadge, Tabs } from "@/ui/status";
import { dFull } from "@/lib/format";
import { DOC_KINDS, returnTone, returnWords, subsState } from "@/lib/tenders";
import { BuildsoftPanel, TenderCompleted, TenderFiles, TenderOverview, TenderSubcontractors, WorkingsFiles } from "./TenderSections";
import { Badge } from "@/ui";
import { toast } from "@/ui/toast";

export function QuotePage() {
  const { ref } = useParams();
  const navigate = useNavigate();
  const db = useData((s) => s.db);
  const day = useDay();
  const brand = usePrefs((s) => s.brand);
  const { seeValues, seeMargins, may } = useAccess();
  const canPrice = may("priceQuotes");
  const [view, setView] = useState<"costing" | "client">("costing");
  const [params, setParams] = useSearchParams();
  const [accepting, setAccepting] = useState(false);
  const [po, setPo] = useState("");

  const q = db.quotes.find((x) => x.ref === ref);
  if (!q)
    return (
      <PageBody>
        <Empty title={`There is no quote ${ref}`}>
          It may have been cleared by a demo reset. <Link to="/sales/tenders" className="text-accent-ink underline">Back to the tenders</Link>
        </Empty>
      </PageBody>
    );

  const client = db.clients.find((c) => c.id === q.clientId);
  const project = db.projects.find((p) => p.quoteId === q.id);
  const region = brand.region;
  const sell = quoteTotal(q.lines);
  const cost = costBreakdown(q.costing);
  const m = marginPct(sell, cost.total);
  const flag = marginFlag(m);
  const editable = canPrice && (q.status === "Draft" || q.status === "Awaiting approval" || q.status === "Queried");
  const out = q.status === "Sent" || q.status === "Opened" || q.status === "Queried";
  const vat = REGION[region].vatPct;
  // The tender's own sections (20 Nov, the Oldstone template), each an address of its own.
  type Tab = "overview" | "documents" | "subcontractors" | "photos" | "workings" | "completed";
  const files = q.tender?.files ?? [];
  const subs = subsState(q.tender?.subPrices ?? []);
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "documents", label: "Tender documents", count: files.filter((f) => DOC_KINDS.includes(f.kind)).length },
    { value: "subcontractors", label: "Subcontractors", count: subs.missing.length },
    { value: "photos", label: "Photos", count: files.filter((f) => f.kind === "Site photo").length },
    { value: "workings", label: "Workings and Buildsoft" },
    { value: "completed", label: "Tender completed" },
  ];
  const tab = tabs.find((t) => t.value === params.get("tab"))?.value ?? "overview";

  return (
    <>
      <PageHead
        title={`${q.ref} ${q.title}`}
        note={
          <>
            <Link to="/sales/tenders" className="text-accent-ink underline-offset-2 hover:underline">
              Tenders
            </Link>
            {" / "}
            {client?.name}, attention {client?.contactName}
          </>
        }
        actions={
          <>
            <Badge tone={returnTone(q, day)}>{returnWords(q, day)}</Badge>
            <QuoteBadge status={q.status} />
            {out && canPrice && (
              <Button variant="primary" onClick={() => setAccepting(true)}>
                Record acceptance
              </Button>
            )}
            {project && (
              <Button variant="primary" onClick={() => navigate(`/projects/${project.code}`)}>
                Open project {project.code}
              </Button>
            )}
          </>
        }
      >
        <Tabs label="Tender sections" value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} tabs={tabs} />
      </PageHead>
      <PageBody className="grid max-w-6xl gap-5">
        {q.query && (
          <p className="rounded-md bg-warn-soft px-3 py-2 text-warn">
            {client?.contactName} asked: "{q.query}"
          </p>
        )}
        {q.drafted && (q.status === "Awaiting approval" || q.status === "Draft") && <p className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">Drafted for you from the enquiry, priced from your rates. Check the quantities, then send.</p>}

        {tab === "overview" && <TenderOverview q={q} />}
        {tab === "documents" && <TenderFiles q={q} kinds={DOC_KINDS} title="Tender documents" empty="No tender documents yet" />}
        {tab === "subcontractors" && <TenderSubcontractors q={q} />}
        {tab === "photos" && <TenderFiles q={q} kinds={["Site photo"]} photos title="Site photos" empty="No photos yet" />}
        {tab === "completed" && <TenderCompleted q={q} />}
        {tab === "workings" && seeValues && (
          <div className="flex justify-end">
            <Segmented label="Quote view" value={view} onChange={setView} options={[{ value: "costing", label: "Costing" }, { value: "client", label: "Client copy" }]} />
          </div>
        )}
        {tab !== "workings" ? null : view === "client" && seeValues ? (
          <ClientCopy quoteRef={q.ref} />
        ) : (
          <>
            <Section title="Priced items" aside={editable ? "Edit, add or remove items until the quote is sent" : undefined}>
              <Panel className="overflow-x-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Qty</th>
                      <th>Unit</th>
                      {seeValues && <th className="num">Rate</th>}
                      {seeValues && <th className="num">Value</th>}
                      {editable && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {q.lines.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-muted">
                          No items yet. Add the first one below.
                        </td>
                      </tr>
                    )}
                    {q.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="min-w-[18rem]">{editable ? <input aria-label="Item description" className="field h-8" value={l.description} placeholder="Describe the work" onChange={(e) => setQuoteLineField(q.id, l.id, "description", e.target.value)} /> : l.description}</td>
                        <td className="num">{editable ? <NumInput label={`Quantity: ${l.description}`} className="w-20" value={l.qty} onChange={(n) => setQuoteLineField(q.id, l.id, "qty", n)} /> : l.qty.toLocaleString("en-IE")}</td>
                        <td>{editable ? <input aria-label={`Unit: ${l.description}`} className="field h-8 w-20" value={l.unit} onChange={(e) => setQuoteLineField(q.id, l.id, "unit", e.target.value)} /> : l.unit}</td>
                        {seeValues && <td className="num">{editable ? <NumInput label={`Rate: ${l.description}`} className="w-24" value={l.rate} onChange={(n) => setQuoteLineField(q.id, l.id, "rate", n)} /> : money2(l.rate, region)}</td>}
                        {seeValues && <td className="num align-middle!">{money2(lineValue(l), region)}</td>}
                        {editable && (
                          <td className="w-10 text-right">
                            <RemoveButton label={`Remove item: ${l.description || "blank item"}`} onClick={() => removeQuoteLine(q.id, l.id)} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                  {seeValues && (
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="num border-t border-line-strong font-medium">
                          Quote total, ex VAT
                        </td>
                        <td className="num border-t border-line-strong text-[1.08rem] font-medium">{money2(sell, region)}</td>
                        {editable && <td className="border-t border-line-strong" />}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </Panel>
              {editable && (
                <Button size="sm" className="mt-2" onClick={() => addQuoteLine(q.id)}>
                  Add an item
                </Button>
              )}
            </Section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              {seeMargins && (
                <Section title="What it costs us" aside={editable ? "Edit, add or remove cost lines" : undefined}>
                  {editable ? (
                    renderCostEditor()
                  ) : (
                    <Panel className="overflow-x-auto">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th>Heading</th>
                            <th>Made up of</th>
                            <th className="num">Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="font-medium">Labour</td>
                            <td className="text-muted">{q.costing.labour.map((l) => `${l.trade} ${l.hours} hrs`).join(", ")}</td>
                            <td className="num">{money2(cost.labour, region)}</td>
                          </tr>
                          <tr>
                            <td className="font-medium">Materials</td>
                            <td className="text-muted">{q.costing.materials.map((x) => `${x.item} ${x.qty} ${x.unit}`).join(", ")}</td>
                            <td className="num">{money2(cost.materials, region)}</td>
                          </tr>
                          <tr>
                            <td className="font-medium">Plant</td>
                            <td className="text-muted">{q.costing.plant.map((x) => `${x.item} ${x.days} days`).join(", ")}</td>
                            <td className="num">{money2(cost.plant, region)}</td>
                          </tr>
                          <tr>
                            <td className="font-medium">Subcontract</td>
                            <td className="text-muted">Scaffolding and specialists</td>
                            <td className="num">{money2(cost.subcontract, region)}</td>
                          </tr>
                          <tr>
                            <td className="font-medium">Preliminaries</td>
                            <td className="text-muted">Site set-up, welfare, supervision</td>
                            <td className="num">{money2(cost.prelims, region)}</td>
                          </tr>
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={2} className="num border-t border-line-strong font-medium">
                              Estimated cost
                            </td>
                            <td className="num border-t border-line-strong font-medium">{money2(cost.total, region)}</td>
                          </tr>
                          <tr>
                            <td colSpan={2} className="num font-medium">
                              Margin
                            </td>
                            <td className={cx("num text-[1.08rem] font-medium", flag === "loss" && "text-bad", flag === "thin" && "text-warn")}>{m == null ? "-" : pct1(m)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </Panel>
                  )}
                  {flag !== "none" && <p className={cx("mt-2", flag === "loss" ? "text-bad" : "text-warn")}>{flag === "loss" ? "This quote loses money at these rates." : "Margin is under 12%. Worth a second look before it goes out."}</p>}
                </Section>
              )}

              <div className="grid content-start gap-5">
                <BuildsoftPanel q={q} />
                <WorkingsFiles q={q} />
              </div>
            </div>
          </>
        )}
      </PageBody>

      <Dialog
        open={accepting}
        onClose={() => setAccepting(false)}
        title={`Record acceptance of ${q.ref}`}
        footer={
          <>
            <Button onClick={() => setAccepting(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const code = acceptQuote(q.id, po);
                setAccepting(false);
                toast(`Project ${code} created from ${q.ref}`);
                navigate(`/projects/${code}`);
              }}
            >
              Accept and create project
            </Button>
          </>
        }
      >
        <p className="mb-3">Accepting creates a project with the next site code, copies the priced items in as its scope, and names a contracts manager.</p>
        <Field label="Client's purchase order number" hint="Leave blank if the order was given by phone and the paperwork is to follow.">
          {(id) => <input id={id} className="field" value={po} onChange={(e) => setPo(e.target.value)} placeholder="PO-10452" />}
        </Field>
      </Dialog>
    </>
  );

  /**
   * The cost build-up as editable lines, grouped by heading. Totals and margin update as you type.
   * Called as a plain function, not used as a component: a component defined inside another one is
   * rebuilt on every keystroke, which would throw the cursor out of the box being typed in.
   */
  function renderCostEditor() {
    const c = q!.costing;
    const groups: { key: CostGroup; title: string; name: string; qtyField: string; qtyLabel: string; add: string; rows: { name: string; qty: number; unit?: string; rate: number }[] }[] = [
      { key: "labour", title: "Labour", name: "trade", qtyField: "hours", qtyLabel: "Hours", add: "Add labour", rows: c.labour.map((x) => ({ name: x.trade, qty: x.hours, rate: x.rate })) },
      { key: "materials", title: "Materials", name: "item", qtyField: "qty", qtyLabel: "Qty", add: "Add material", rows: c.materials.map((x) => ({ name: x.item, qty: x.qty, unit: x.unit, rate: x.rate })) },
      { key: "plant", title: "Plant", name: "item", qtyField: "days", qtyLabel: "Days", add: "Add plant", rows: c.plant.map((x) => ({ name: x.item, qty: x.days, rate: x.rate })) },
    ];
    return (
      <Panel className="overflow-x-auto">
        <table className="tbl">
          {groups.map((g) => (
            <tbody key={g.key}>
              <tr>
                <th className="bg-side! font-medium text-ink!">{g.title}</th>
                <th className="num bg-side!">{g.qtyLabel}</th>
                <th className="bg-side!">{g.key === "materials" ? "Unit" : ""}</th>
                <th className="num bg-side!">Rate</th>
                <th className="num bg-side!">{money2(cost[g.key], region)}</th>
                <th className="bg-side!" />
              </tr>
              {g.rows.map((r, i) => (
                <tr key={i}>
                  <td className="min-w-[11rem]">
                    <input aria-label={`${g.title} line ${i + 1}`} className="field h-8" value={r.name} placeholder={g.key === "labour" ? "Trade" : "Item"} onChange={(e) => setCostField(q!.id, g.key, i, g.name, e.target.value)} />
                  </td>
                  <td className="num">
                    <NumInput label={`${g.qtyLabel}: ${r.name}`} className="w-18" value={r.qty} onChange={(n) => setCostField(q!.id, g.key, i, g.qtyField, n)} />
                  </td>
                  <td>{r.unit != null && <input aria-label={`Unit: ${r.name}`} className="field h-8 w-18" value={r.unit} onChange={(e) => setCostField(q!.id, g.key, i, "unit", e.target.value)} />}</td>
                  <td className="num">
                    <NumInput label={`Rate: ${r.name}`} className="w-20" value={r.rate} onChange={(n) => setCostField(q!.id, g.key, i, "rate", n)} />
                  </td>
                  <td className="num align-middle!">{money2(r.qty * r.rate, region)}</td>
                  <td className="w-10 text-right">
                    <RemoveButton label={`Remove ${g.title.toLowerCase()} line: ${r.name || "blank"}`} onClick={() => removeCostRow(q!.id, g.key, i)} />
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={6}>
                  <Button size="sm" variant="ghost" onClick={() => addCostRow(q!.id, g.key)}>
                    {g.add}
                  </Button>
                </td>
              </tr>
            </tbody>
          ))}
          <tbody>
            <tr>
              <td colSpan={4}>
                <span className="font-medium">Subcontract</span>
                <span className="block text-[0.87rem] text-muted">Scaffolding and specialists</span>
              </td>
              <td className="num">
                <NumInput label="Subcontract cost" className="w-28" value={c.subcontract} onChange={(n) => setCostLump(q!.id, "subcontract", n)} />
              </td>
              <td />
            </tr>
            <tr>
              <td colSpan={4}>
                <span className="font-medium">Preliminaries</span>
                <span className="block text-[0.87rem] text-muted">Site set-up, welfare, supervision</span>
              </td>
              <td className="num">
                <NumInput label="Preliminaries cost" className="w-28" value={c.prelims} onChange={(n) => setCostLump(q!.id, "prelims", n)} />
              </td>
              <td />
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="num border-t border-line-strong font-medium">
                Estimated cost
              </td>
              <td className="num border-t border-line-strong font-medium">{money2(cost.total, region)}</td>
              <td className="border-t border-line-strong" />
            </tr>
            <tr>
              <td colSpan={4} className="num font-medium">
                Margin
              </td>
              <td className={cx("num text-[1.08rem] font-medium", flag === "loss" && "text-bad", flag === "thin" && "text-warn")}>{m == null ? "-" : pct1(m)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Panel>
    );
  }

  /** The quote as the client receives it: headed paper, no costs, terms at the foot. */
  function ClientCopy({ quoteRef }: { quoteRef: string }) {
    const sentDay = q!.sentAt?.slice(0, 10) ?? day;
    return (
      <div className="mx-auto w-full max-w-3xl rounded-lg border border-line bg-white px-8 py-8 text-[#1b2733] shadow-pop sm:px-12">
        <div className="flex flex-wrap items-start gap-4 border-b-2 border-[#1b2733] pb-4">
          <div>
            {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.legalName} className="h-10 w-auto" /> : <p className="font-display text-[1.7rem] leading-none font-semibold">{brand.brandName}</p>}
            <p className="mt-1 text-[0.93rem] text-[#5b6875]">{brand.tagline}</p>
          </div>
          <div className="ml-auto text-right text-[0.93rem]">
            <p className="font-display text-[1.3rem] font-semibold">Quotation {quoteRef}</p>
            <p>{dFull(sentDay)}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[0.87rem] text-[#5b6875]">For</p>
            <p className="font-medium">{client?.name}</p>
            <p>{client?.contactName}</p>
          </div>
          <div>
            <p className="text-[0.87rem] text-[#5b6875]">Works</p>
            <p className="font-medium">{q!.title}</p>
          </div>
        </div>
        <table className="mt-6 w-full border-collapse text-[0.93rem]">
          <thead>
            <tr className="border-b border-[#1b2733] text-left">
              <th className="py-1.5 pr-3 font-medium">Item</th>
              <th className="py-1.5 pr-3 text-right font-medium">Qty</th>
              <th className="py-1.5 pr-3 font-medium">Unit</th>
              <th className="py-1.5 pr-3 text-right font-medium">Rate</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {q!.lines.map((l) => (
              <tr key={l.id} className="border-b border-[#dce2e8] align-top">
                <td className="py-1.5 pr-3">{l.description}</td>
                <td className="py-1.5 pr-3 text-right">{l.qty.toLocaleString("en-IE")}</td>
                <td className="py-1.5 pr-3">{l.unit}</td>
                <td className="py-1.5 pr-3 text-right whitespace-nowrap">{money2(l.rate, region)}</td>
                <td className="py-1.5 text-right whitespace-nowrap">{money2(lineValue(l), region)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="mt-4 ml-auto grid w-64 grid-cols-[1fr_auto] gap-x-6 gap-y-1">
          <dt>Total excluding VAT</dt>
          <dd className="text-right">{money2(sell, region)}</dd>
          <dt>VAT at {vat}%</dt>
          <dd className="text-right">{money2(gross(sell, vat) - sell, region)}</dd>
          <dt className="border-t border-[#1b2733] pt-1 font-medium">Total</dt>
          <dd className="border-t border-[#1b2733] pt-1 text-right font-medium">{money2(gross(sell, vat), region)}</dd>
        </dl>
        <div className="mt-6 border-t border-[#dce2e8] pt-3 text-[0.87rem] text-[#5b6875]">
          <p>This quotation is valid for {q!.validDays} days. All work is carried out in lime-based materials to conservation practice, and is subject to the approval of the conservation officer where the building is protected.</p>
          <p className="mt-1">Work found on opening up that could not be seen at survey is measured, photographed and agreed with you in writing before it is carried out.</p>
          <p className="mt-1">Payment terms: {client?.termsDays} days from invoice. {brand.legalName}.</p>
        </div>
      </div>
    );
  }
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title="Remove" onClick={onClick} className="press grid size-8 place-items-center rounded-md text-muted hover:bg-bad-soft hover:text-bad">
      <X size={16} />
    </button>
  );
}
