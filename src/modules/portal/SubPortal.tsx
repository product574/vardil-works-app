import { useId, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { recordSubPaper, recordSubWorker, subcontractorSendsInvoice } from "@/data/actions";
import { type ComplianceRow, complianceRows, renewedTo, subFlags } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { StateBadge } from "@/modules/compliance/shared";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project, Subcontractor, SupplierInvoice } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { VAT_RATES } from "@/lib/invoices";
import { money2, r2 } from "@/lib/money";
import { approverWords, portalStanding, purchaseStage, recently } from "@/lib/purchases";
import { CopyLink } from "@/modules/invoicing/purchase-shared";
import { Badge, Button, cx, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Tel } from "@/ui";
import { PickFile, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";

/**
 * What a subcontractor sees when they sign in (18 Nov): the sites they are on, the invoices
 * they have sent for each, where each one stands, and a way to send the next. Several
 * subcontractors share a site, and each sees only their own: the list on the left, for office
 * staff, is every site with its subcontractors one under the other, to pick whose portal to
 * look at. There is no subcontractor sign-in yet (decision 69), so this is always a preview.
 */
export function SubPortal() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const brand = usePrefs((s) => s.brand);
  const [params, setParams] = useSearchParams();
  const [sendFor, setSendFor] = useState<string | null>(null);
  const [paper, setPaper] = useState<ComplianceRow | null>(null);
  if (role === "client") return <Navigate to="/portal" replace />;

  const sites = db.projects.filter((p) => db.subcontractors.some((s) => s.projectIds.includes(p.id))).sort((a, b) => a.code.localeCompare(b.code));
  const on = (p: Project) => db.subcontractors.filter((s) => s.projectIds.includes(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const first = sites[0];
  const site = sites.find((p) => p.id === params.get("site")) ?? first;
  const sub = db.subcontractors.find((s) => s.id === params.get("sub")) ?? (site ? on(site)[0] : undefined);
  if (!sub || !site)
    return (
      <PageBody>
        <Panel>
          <Empty title="No subcontractors on any site yet" />
        </Panel>
      </PageBody>
    );

  const mine = db.supplierInvoices.filter((s) => s.subcontractorId === sub.id);
  // Their sites: the one picked on the left first, then the rest they are on, then any they have invoiced before.
  const theirs = [site, ...db.projects.filter((p) => p.id !== site.id && sub.projectIds.includes(p.id)), ...db.projects.filter((p) => p.id !== site.id && !sub.projectIds.includes(p.id) && mine.some((s) => s.allocations.some((a) => a.projectId === p.id)))].filter((p) => sub.projectIds.includes(p.id) || mine.some((s) => s.allocations.some((a) => a.projectId === p.id)));
  const sum = (list: SupplierInvoice[]) => r2(list.reduce((t, s) => t + s.total, 0));
  const waiting = mine.filter((s) => purchaseStage(s) === "approve");
  const approved = mine.filter((s) => purchaseStage(s) === "pay");
  const paid = mine.filter((s) => purchaseStage(s) === "paid" && recently(s.paidOn, day));
  const back = mine.filter((s) => purchaseStage(s) === "back");
  const codeOf = (s: SupplierInvoice) => db.projects.find((p) => p.id === s.allocations[0]?.projectId)?.code ?? "";
  // An invoice can only be sent for a site they are on now.
  const onNow = theirs.filter((p) => sub.projectIds.includes(p.id));

  return (
    <>
      <PageHead
        title={sub.name}
        note={`${brand.legalName} subcontractor portal. ${sub.contactName} sees ${plural(theirs.length, "site")} and ${plural(mine.length, "invoice")} of their own, and nothing of any other subcontractor's.`}
        actions={
          onNow.length > 0 && (
            <Button variant="primary" onClick={() => setSendFor(onNow[0]!.id)}>
              Send an invoice
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-[84rem] grid-cols-1 items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Panel>
          <p className="border-b border-line px-3 py-2 font-medium">Subcontractors by site</p>
          <ul className="max-h-64 overflow-y-auto lg:max-h-none" aria-label="Subcontractors by site">
            {sites.map((p) => (
              <li key={p.id}>
                <p className="bg-side px-3 py-1 text-[0.87rem] font-medium text-muted">
                  {p.code} {p.name}
                </p>
                <ul>
                  {on(p).map((s) => {
                    const current = s.id === sub.id && p.id === site.id;
                    const n = db.supplierInvoices.filter((x) => x.subcontractorId === s.id && purchaseStage(x) === "approve" && x.allocations.some((a) => a.projectId === p.id)).length;
                    return (
                      <li key={s.id}>
                        <button type="button" aria-current={current} aria-label={`${s.name} at ${p.code}`} onClick={() => setParams({ sub: s.id, site: p.id })} className={cx("press flex w-full items-baseline gap-2 px-3 py-2 text-left", current ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{s.name}</span>
                            <span className="block text-[0.87rem] text-muted">{s.trade}</span>
                          </span>
                          {n > 0 && <span className="shrink-0 text-[0.87rem] text-warn">{n} waiting</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="grid min-w-0 gap-6" aria-label={`What ${sub.name} sees`}>
          <p className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">
            This is exactly what {sub.contactName} of {sub.name} sees. Other subcontractors on the same site, costs and internal notes never appear here.
          </p>

          {(paid.length > 0 || back.length > 0) && (
            <ul className="grid gap-2" aria-label="News on your invoices">
              {back.map((s) => (
                <li key={s.id} className="rounded-md bg-bad-soft px-3 py-2 text-bad">
                  <span className="font-medium">Sent back: invoice {s.invoiceNo} for {codeOf(s)}.</span> {s.sentBack?.by} wrote on {dShort(s.sentBack?.at.slice(0, 10))}: {s.sentBack?.reason}
                </li>
              ))}
              {paid.map((s) => (
                <li key={s.id} className="rounded-md bg-ok-soft px-3 py-2 text-ok">
                  <span className="font-medium">Paid: invoice {s.invoiceNo} for {codeOf(s)}.</span> {money2(s.total, brand.region)} was paid on {dFull(s.paidOn)}{s.paidRef ? `, ${s.paidRef}` : ""}.
                </li>
              ))}
            </ul>
          )}

          <Panel className="overflow-x-auto">
            <dl aria-label="Your invoices at a glance" className="grid min-w-[30rem] grid-cols-3 divide-x divide-line">
              {(
                [
                  ["Waiting for approval", waiting],
                  ["Approved, to be paid", approved],
                  ["Paid in the last 30 days", paid],
                ] as const
              ).map(([label, list]) => (
                <div key={label} className="px-3 py-2">
                  <dt className="text-[0.87rem] text-muted">{label}</dt>
                  <dd className="text-[1.15rem] font-medium">{money2(sum(list), brand.region)}</dd>
                  <dd className="text-[0.87rem] text-muted">{plural(list.length, "invoice")}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <SubPapers sub={sub} onSend={setPaper} />

          {theirs.map((p) => {
            const rows = mine.filter((s) => s.allocations.some((a) => a.projectId === p.id)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
            const manager = db.people.find((x) => x.id === p.siteManagerId);
            const here = sub.projectIds.includes(p.id);
            return (
              <section key={p.id} aria-label={`${p.code} ${p.name}`} className="grid gap-3">
                <div className="flex flex-wrap items-end gap-3 border-b-2 border-line-strong pb-2">
                  <div className="mr-auto">
                    <h2 className="text-[1.35rem]">{p.name}</h2>
                    <p className="text-muted">
                      {p.location}, {co(p.county)}. Our reference {p.code}.{manager && here ? (
                        <>
                          {" "}
                          Site manager {manager.name}, <Tel number={manager.phone} />.
                        </>
                      ) : (
                        !here && " You are no longer on this site."
                      )}
                    </p>
                  </div>
                  {here && (
                    <Button size="sm" onClick={() => setSendFor(p.id)}>
                      Send an invoice for {p.code}
                    </Button>
                  )}
                </div>
                <Panel className="overflow-x-auto">
                  {rows.length === 0 ? (
                    <p className="px-3 py-2.5 text-muted">You have not sent an invoice for this site yet.</p>
                  ) : (
                    <table className="tbl" aria-label={`Your invoices for ${p.code}`}>
                      <thead>
                        <tr>
                          <th>Your invoice</th>
                          <th>What it is for</th>
                          <th className="num">Total with VAT</th>
                          <th>Where it stands</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((s) => {
                          const st = portalStanding(s);
                          return (
                            <tr key={s.id}>
                              <td className="whitespace-nowrap">
                                <span className="font-medium">{s.invoiceNo}</span>
                                <span className="block text-[0.87rem] text-muted">{dShort(s.invoiceDate)}</span>
                                <CopyLink s={s} className="text-[0.87rem]" />
                              </td>
                              <td className="max-w-[24rem]">{s.lines.map((l) => l.description).join("; ")}</td>
                              <td className="num font-medium">
                                {money2(s.total, brand.region)}
                                <span className="block text-[0.87rem] font-normal text-muted">{money2(s.subtotal, brand.region)} before VAT</span>
                              </td>
                              <td>
                                <Badge tone={st.tone}>{st.label}</Badge>
                                <span className={cx("mt-1 block max-w-[20rem] text-[0.87rem]", st.tone === "bad" ? "text-bad" : "text-muted")}>{st.detail}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Panel>
              </section>
            );
          })}
        </div>
      </PageBody>
      {sendFor && <SendInvoice key={`${sub.id}|${sendFor}`} sub={sub} sites={onNow} projectId={sendFor} onClose={() => setSendFor(null)} />}
      {paper && <SendPaper key={paper.key} sub={sub} row={paper} onClose={() => setPaper(null)} />}
    </>
  );
}

/**
 * Their papers (Compliance, 18 Nov): insurances, safety statement, a method statement for each
 * site and their people's Safe Pass, each with where it stands and a way to send the new one.
 */
function SubPapers({ sub, onSend }: { sub: Subcontractor; onSend: (r: ComplianceRow) => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const rows = complianceRows(db, day).filter((r) => (r.ref.kind === "subPaper" || r.ref.kind === "subWorker") && r.ref.subId === sub.id);
  const flags = subFlags(sub, db.projects.filter((p) => p.status === "Live" || p.status === "Not started"), day);
  return (
    <section aria-label="Your papers" className="grid gap-2">
      <h2 className="text-[1.15rem]">Your papers</h2>
      <p className="text-muted">We need these in date to have you on site. Send a new one here when it is renewed: we check it and it shows here straight away.</p>
      {flags.length > 0 && <p className="rounded-md bg-bad-soft px-3 py-2 text-bad">Out of date or missing: {flags.join("; ")}. Your invoices are flagged to whoever approves them until these come in.</p>}
      <Panel className="overflow-x-auto">
        <table className="tbl" aria-label="Your papers, and your people's cards">
          <thead>
            <tr>
              <th>Paper</th>
              <th>Runs to</th>
              <th>Where it stands</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <span className="font-medium">{r.ref.kind === "subWorker" ? `${r.who}: ${r.item}` : r.item}</span>
                </td>
                <td className="whitespace-nowrap">{r.due ? dFull(r.due) : r.state === "missing" ? "-" : "No end date"}</td>
                <td>
                  <StateBadge r={r} day={day} />
                </td>
                <td className="text-right">
                  <Button size="sm" onClick={() => onSend(r)}>
                    {r.state === "missing" ? "Send it" : "Send a new one"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </section>
  );
}

/** Send a paper through the portal: the date it runs to, a reference, and a copy. */
function SendPaper({ sub, row, onClose }: { sub: Subcontractor; row: ComplianceRow; onClose: () => void }) {
  const day = useDay();
  const db = useData((s) => s.db);
  const ref = row.ref;
  const worker = ref.kind === "subWorker";
  const rams = ref.kind === "subPaper" && ref.paper === "Method statement";
  const [expires, setExpires] = useState(worker ? renewedTo("Safe Pass", day) : addDays(day, 365));
  const [reference, setReference] = useState("");
  const { proof, error, pick } = useProofPick();
  const code = ref.kind === "subPaper" && ref.projectId ? db.projects.find((p) => p.id === ref.projectId)?.code : "";
  return (
    <Dialog
      open
      onClose={onClose}
      title={worker ? `${row.who}: new ${row.item}` : rams ? `Method statement for ${code}` : `New ${row.item.split(",")[0]!.toLowerCase()}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!proof || (!rams && expires <= day)}
            onClick={() => {
              if (ref.kind === "subWorker") recordSubWorker(sub.id, ref.workerId, row.who, expires, proof, "Portal");
              else if (ref.kind === "subPaper") recordSubPaper(sub.id, { kind: ref.paper, projectId: ref.projectId, expires: rams ? undefined : expires, reference: reference || (rams ? `RAMS for ${code}` : "") }, "Portal", proof);
              toast("Sent. Thank you: it is on file with us now");
              onClose();
            }}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {!rams && (
          <Field label={worker ? "Card runs out" : ref.kind === "subPaper" && ref.paper === "Safety statement" ? "Next review due" : "Runs to"}>
            {(id) => <input id={id} type="date" className="field" min={addDays(day, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}
          </Field>
        )}
        {!worker && <Field label="Reference" hint="Optional: a policy number or the document's title.">{(id) => <input id={id} className="field" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>}
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">A copy</p>
          <PickFile accept="image/*,application/pdf" what="copy" onFile={pick} chosen={proof?.name} />
          <p className="mt-1 text-[0.87rem] text-muted">A PDF of the schedule or statement, or a photo of the card.</p>
          <p role="alert" className="text-bad">
            {error}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/** The form a subcontractor fills in to send an invoice: which site, their number, what for, how much, and a copy. */
function SendInvoice({ sub, sites, projectId, onClose }: { sub: Subcontractor; sites: Project[]; projectId: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const formId = useId();
  const rates = VAT_RATES[region];
  const [site, setSite] = useState(sites.some((x) => x.id === projectId) ? projectId : (sites[0]?.id ?? ""));
  const [no, setNo] = useState("");
  const [date, setDate] = useState(day);
  const [text, setText] = useState("");
  const [net, setNet] = useState(0);
  const [vatPct, setVatPct] = useState(rates[0]!.pct);
  const copy = useProofPick();
  const vat = r2((net * vatPct) / 100);
  const dup = !!no.trim() && db.supplierInvoices.some((x) => x.subcontractorId === sub.id && x.invoiceNo.trim().toLowerCase() === no.trim().toLowerCase());
  const problem = !no.trim() ? "Give the invoice its number." : dup ? `You have already sent ${no.trim()}. A corrected invoice needs a number of its own.` : !text.trim() ? "Say what the invoice is for." : !(net > 0) ? "Enter the amount before VAT." : !date || date > day ? "The invoice date cannot be after today." : "";
  const p = sites.find((x) => x.id === site);
  const limit = db.approvalLimits.find((x) => x.id === "supplier")?.amount ?? 500;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Send an invoice"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId} disabled={!!problem}>
            Send invoice
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem || !p) return;
          const id = subcontractorSendsInvoice(sub.id, { projectId: p.id, invoiceNo: no, invoiceDate: date, description: text, net, vatPct, copy: copy.proof ?? undefined });
          if (!id) return;
          const who = approverWords({ party: "subcontractor", subtotal: net, allocations: [{ id: "", projectId: p.id, category: "labour", amount: net, description: text }] }, limit, db.projects, (personId) => db.people.find((x) => x.id === personId)?.name);
          toast(`${no.trim()} sent for ${p.code}. It is with ${who} to approve`);
          onClose();
        }}
      >
        <Field label="Site" className="sm:col-span-2" hint="One invoice for each site, so it can be checked against the work done there.">
          {(id) => (
            <select id={id} className="field" value={site} onChange={(e) => setSite(e.target.value)}>
              {sites.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} {x.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Your invoice number">{(id) => <input id={id} className="field" autoComplete="off" value={no} onChange={(e) => setNo(e.target.value)} />}</Field>
        <Field label="Invoice date">{(id) => <input id={id} type="date" className="field" max={day} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="What it is for" className="sm:col-span-2" hint="The work and the dates or weeks it covers.">
          {(id) => <textarea id={id} rows={2} className="field" value={text} onChange={(e) => setText(e.target.value)} />}
        </Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Amount before VAT</p>
          <NumInput label="Amount before VAT" className="w-full" value={net} onChange={setNet} />
        </div>
        <Field label="VAT">
          {(id) => (
            <select id={id} className="field" value={vatPct} onChange={(e) => setVatPct(Number(e.target.value))}>
              {rates.map((r) => (
                <option key={r.pct} value={r.pct}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p className="sm:col-span-2">
          VAT {money2(vat, region)}. <span className="font-medium">Total {money2(r2(net + vat), region)}</span>
        </p>
        <div className="sm:col-span-2">
          <p className="mb-1 text-[0.93rem] font-medium">A copy of the invoice</p>
          <PickFile accept="image/*,application/pdf" what="copy of the invoice" onFile={copy.pick} chosen={copy.proof?.name} />
          <p className="mt-1 text-[0.87rem] text-muted">A PDF, or a photo of the paper. It can be sent without, but whoever approves it will want to see it.</p>
          <p role="alert" className="text-bad">
            {copy.error}
          </p>
        </div>
        {problem && (no.trim() || text.trim() || net > 0) && <p className="text-[0.93rem] text-warn sm:col-span-2">{problem}</p>}
      </form>
    </Dialog>
  );
}
