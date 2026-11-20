import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { projectCosts } from "@/data/figures";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Client, Db } from "@/data/types";
import { invoiceNo } from "@/lib/billing";
import { dFull, dShort, plural, tOf } from "@/lib/format";
import { dueWords, grossOf, openQuery, STAGE_LABEL, STAGE_TONE, stageOf } from "@/lib/invoices";
import { money0, money2 } from "@/lib/money";
import { customerFigures, customerTimeline, jobRow } from "@/lib/reports";
import { Badge, Button, cx, Empty, Fact, Mail, PageBody, PageHead, Panel, Section, Tel } from "@/ui";
import { ProjectBadge, QuoteBadge, Tabs } from "@/ui/status";
import { CustomerForm, useCanEditCustomers } from "./Customers";
import { PORTAL } from "@/lib/apps";

const LINK = "text-accent-ink underline-offset-2 hover:underline";
type Tab = "overview" | "projects" | "tenders" | "invoices" | "emails" | "files";
const pctText = (n: number) => `${n.toFixed(1)}%`;

/**
 * One customer and everything the firm has to do with them (18 Nov), with tabs like a
 * project's page: their details and figures, their projects, tenders, invoices, emails and
 * files. Each row opens its record in its own section.
 */
export function CustomerPage() {
  const { id } = useParams();
  const db = useData((s) => s.db);
  const [params, setParams] = useSearchParams();
  const canEdit = useCanEditCustomers();
  const [editing, setEditing] = useState(false);
  const c = db.clients.find((x) => x.id === id);
  if (!c)
    return (
      <PageBody>
        <Panel className="max-w-3xl">
          <Empty title="There is no such customer">
            They may have been added in another browser.{" "}
            <Link to="/customers" className={LINK}>
              See all customers
            </Link>
            .
          </Empty>
        </Panel>
      </PageBody>
    );
  const projects = db.projects.filter((p) => p.clientId === c.id);
  const quotes = db.quotes.filter((q) => q.clientId === c.id);
  const invoices = db.salesInvoices.filter((i) => i.clientId === c.id);
  const mails = db.mails.filter((m) => m.clientId === c.id);
  const files = db.files.filter((f) => projects.some((p) => p.id === f.projectId));
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "overview", label: "Overview" },
    { value: "projects", label: "Projects", count: projects.length },
    { value: "tenders", label: "Tenders", count: quotes.length },
    { value: "invoices", label: "Invoices", count: invoices.length },
    { value: "emails", label: "Emails", count: mails.length },
    { value: "files", label: "Files", count: files.length },
  ];
  const tab = tabs.find((t) => t.value === params.get("tab"))?.value ?? "overview";
  return (
    <>
      <PageHead
        title={c.name}
        note={
          <>
            <Link to="/customers" className={LINK}>
              All customers
            </Link>
            {" / "}
            {c.type}. {c.contactName}, {c.contactPhone}
            {c.contactEmail ? `, ${c.contactEmail}` : ""}.
          </>
        }
        actions={canEdit && <Button onClick={() => setEditing(true)}>Edit details</Button>}
      >
        <Tabs label="Customer sections" value={tab} onChange={(v) => setParams(v === "overview" ? {} : { tab: v }, { replace: true })} tabs={tabs} />
      </PageHead>
      <PageBody className="max-w-6xl">
        {tab === "overview" && <OverviewTab c={c} db={db} />}
        {tab === "projects" && <ProjectsTab c={c} db={db} />}
        {tab === "tenders" && <TendersTab c={c} db={db} />}
        {tab === "invoices" && <InvoicesTab c={c} db={db} />}
        {tab === "emails" && <EmailsTab c={c} db={db} />}
        {tab === "files" && <FilesTab c={c} db={db} />}
      </PageBody>
      {editing && <CustomerForm client={c} onClose={() => setEditing(false)} />}
    </>
  );
}

function OverviewTab({ c, db }: { c: Client; db: Db }) {
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const setPortalClient = usePrefs((s) => s.setPortalClient);
  const access = useAccess();
  const navigate = useNavigate();
  const f = customerFigures(db, c.id, day);
  const latest = customerTimeline(db, c.id, day, 8);
  const since = [...db.quotes.filter((q) => q.clientId === c.id).map((q) => q.sentAt ?? ""), ...db.projects.filter((p) => p.clientId === c.id).map((p) => p.startDate)].filter(Boolean).sort()[0];
  const tiles = [
    ...(access.seeValues ? [{ label: "Sales, last 12 months", value: money0(f.sales, region), note: "Invoiced, before VAT", to: "?tab=invoices" }] : []),
    ...(access.seeValues ? [{ label: "Owed now", value: money0(f.owed, region), note: "Sent and not paid, with VAT", to: "?tab=invoices" }] : []),
    { label: "Live jobs", value: String(f.live), note: plural(db.projects.filter((p) => p.clientId === c.id).length, "job") + " in all", to: "?tab=projects" },
    ...(access.seeMargins ? [{ label: "Margin, paid jobs", value: f.margin == null ? "-" : pctText(f.margin), note: f.paidJobs ? `${plural(f.paidJobs, "job")} paid in full in 12 months` : "None paid in full in 12 months", to: "?tab=projects" }] : []),
  ];
  return (
    <div className="grid grid-cols-1 gap-5">
      <Panel className="overflow-hidden">
        <dl aria-label="Customer figures" className="grid grid-cols-2 gap-px bg-line md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: tiles.length }}>
          {tiles.map((t) => (
            <div key={t.label} className="bg-surface max-md:odd:last:col-span-2">
              <Link to={t.to} replace className="press block px-4 py-3 hover:bg-accent-soft/60">
                <dt className="text-[0.87rem] text-muted">{t.label}</dt>
                <dd className="text-[1.25rem] font-medium tabular-nums">{t.value}</dd>
                <dd className="text-[0.87rem] text-muted">{t.note}</dd>
              </Link>
            </div>
          ))}
        </dl>
      </Panel>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Section title="Details">
          <Panel className="px-4 py-2">
            <dl>
              <Fact label="Contact">{c.contactName}</Fact>
              <Fact label="Phone">{c.contactPhone ? <Tel number={c.contactPhone} /> : "-"}</Fact>
              <Fact label="Email">{c.contactEmail ? <Mail address={c.contactEmail} /> : "-"}</Fact>
              <Fact label="Address">{c.address ? `${c.address}${c.county ? `, ${co(c.county)}` : ""}` : "-"}</Fact>
              <Fact label="Invoices to">{c.billingEmail ? <Mail address={c.billingEmail} /> : "The contact's email"}</Fact>
              <Fact label="Terms">{c.termsDays} days</Fact>
              <Fact label="Sage account">{c.accountRef}</Fact>
              {PORTAL && (
                <Fact label="Client portal">
                  {c.portalEnabled ? (
                    <button
                      type="button"
                      className={cx("font-medium", LINK)}
                      onClick={() => {
                        setPortalClient(c.id);
                        navigate("/portal");
                      }}
                    >
                      On: see what they see
                    </button>
                  ) : (
                    "Off"
                  )}
                </Fact>
              )}
              <Fact label="Customer since">{since ? dFull(since.slice(0, 10)) : "New"}</Fact>
            </dl>
          </Panel>
        </Section>
        <Section title="Latest">
          <Panel>
            {latest.length === 0 ? (
              <Empty title="Nothing yet">Their tenders, jobs, invoices and emails will show here.</Empty>
            ) : (
              <ul className="divide-y divide-line" aria-label="Latest with this customer">
                {latest.map((h) => (
                  <li key={`${h.at}|${h.what}`} className="flex items-baseline gap-3 px-3 py-2">
                    <span className="w-16 shrink-0 text-[0.87rem] text-muted">{dShort(h.at.slice(0, 10))}</span>
                    <Link to={h.to} className={cx("min-w-0 flex-1", LINK)}>
                      {h.what}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>
      </div>
    </div>
  );
}

function ProjectsTab({ c, db }: { c: Client; db: Db }) {
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const order = { Live: 0, "Not started": 1, Complete: 2, Invoiced: 3, Closed: 4 } as Record<string, number>;
  const list = db.projects.filter((p) => p.clientId === c.id).sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.startDate.localeCompare(a.startDate));
  if (list.length === 0)
    return (
      <Panel>
        <Empty title="No projects yet">A project is set up when one of their tenders is won.</Empty>
      </Panel>
    );
  return (
    <Panel className="overflow-x-auto">
      <table className="tbl" aria-label={`${c.name}'s projects`}>
        <thead>
          <tr>
            <th>Project</th>
            <th>Status</th>
            <th>On site</th>
            <th>Site manager</th>
            {access.seeValues && <th className="num">Value</th>}
            {access.seeMargins && <th className="num">Margin</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const finished = p.status === "Complete" || p.status === "Invoiced" || p.status === "Closed";
            const margin = finished ? jobRow(db, p).pct : projectCosts(db, p).margin;
            return (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.code}`} className={cx("font-medium", LINK)}>
                    {p.code} {p.name}
                  </Link>
                  <span className="block text-[0.87rem] text-muted">{p.location}</span>
                </td>
                <td>
                  <ProjectBadge status={p.status} />
                </td>
                <td className="whitespace-nowrap">
                  {dFull(p.startDate)}
                  <span className="block text-[0.87rem] text-muted">to {dFull(p.endDate)}</span>
                </td>
                <td>{db.people.find((x) => x.id === p.siteManagerId)?.name}</td>
                {access.seeValues && <td className="num">{p.value != null ? money0(p.value, region) : "-"}</td>}
                {access.seeMargins && (
                  <td className="num">
                    {margin == null || p.status === "Not started" ? "-" : pctText(margin)}
                    {!finished && margin != null && p.status !== "Not started" && <span className="block text-[0.87rem] text-muted">so far</span>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function TendersTab({ c, db }: { c: Client; db: Db }) {
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const list = db.quotes.filter((q) => q.clientId === c.id).sort((a, b) => (b.sentAt ?? "9").localeCompare(a.sentAt ?? "9"));
  const decided = list.filter((q) => q.status === "Accepted" || q.status === "Declined");
  const won = decided.filter((q) => q.status === "Accepted").length;
  if (list.length === 0)
    return (
      <Panel>
        <Empty title="No tenders yet">Log an enquiry for them under Sales and draft a quote from it.</Empty>
      </Panel>
    );
  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-muted">{decided.length ? `${won} won of ${decided.length} decided, ${pctText((won / decided.length) * 100)}.` : "None decided yet."}</p>
      <Panel className="overflow-x-auto">
        <table className="tbl" aria-label={`${c.name}'s tenders`}>
          <thead>
            <tr>
              <th>Tender</th>
              <th>Kind of work</th>
              <th>Sent</th>
              <th>Status</th>
              {access.seeValues && <th className="num">Price before VAT</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((q) => (
              <tr key={q.id}>
                <td>
                  <Link to={`/sales/quotes/${q.ref}`} className={cx("font-medium", LINK)}>
                    {q.ref}
                  </Link>
                  <span className="block max-w-[26rem] text-[0.87rem] text-muted">{q.title}</span>
                </td>
                <td>{q.kind ?? "-"}</td>
                <td className="whitespace-nowrap">{q.sentAt ? dShort(q.sentAt.slice(0, 10)) : <span className="text-muted">Not sent</span>}</td>
                <td>
                  <QuoteBadge status={q.status} />
                </td>
                {access.seeValues && <td className="num">{money0(q.lines.reduce((s, l) => s + l.qty * l.rate, 0), region)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function InvoicesTab({ c, db }: { c: Client; db: Db }) {
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const list = db.salesInvoices.filter((i) => i.clientId === c.id).sort((a, b) => (b.issuedOn ?? "9").localeCompare(a.issuedOn ?? "9"));
  if (list.length === 0)
    return (
      <Panel>
        <Empty title="Nothing invoiced yet" />
      </Panel>
    );
  return (
    <Panel className="overflow-x-auto">
      <table className="tbl" aria-label={`${c.name}'s invoices`}>
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Project</th>
            <th>Sent</th>
            <th>Status</th>
            {access.seeValues && <th className="num">Total with VAT</th>}
          </tr>
        </thead>
        <tbody>
          {list.map((i) => {
            const stage = stageOf(i, day);
            const p = db.projects.find((x) => x.id === i.projectId);
            const no = invoiceNo(i);
            return (
              <tr key={i.id}>
                <td>
                  <Link to={`/invoicing/client/${no}`} className={cx("font-medium", LINK)}>
                    {no}
                  </Link>
                  <span className="block max-w-[22rem] text-[0.87rem] text-muted">{i.description}</span>
                </td>
                <td>
                  <Link to={`/projects/${p?.code}`} className={LINK}>
                    {p?.code}
                  </Link>{" "}
                  {p?.name}
                </td>
                <td className="whitespace-nowrap">{i.issuedOn ? dShort(i.issuedOn) : <span className="text-muted">Not sent</span>}</td>
                <td>
                  <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
                  <span className="block text-[0.87rem] text-muted">{stage === "paid" ? `Paid ${dShort(i.paidOn)}` : stage === "sent" || stage === "overdue" ? dueWords(i, day) : ""}</span>
                  {openQuery(db.invoiceQueries, i.id) && <Badge tone="warn">Query open</Badge>}
                </td>
                {access.seeValues && <td className="num">{money2(grossOf(i), region)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function EmailsTab({ c, db }: { c: Client; db: Db }) {
  const access = useAccess();
  const list = db.mails.filter((m) => m.clientId === c.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  if (list.length === 0)
    return (
      <Panel>
        <Empty title="No emails with them yet" />
      </Panel>
    );
  return (
    <Panel className="overflow-x-auto">
      <table className="tbl" aria-label={`Emails with ${c.name}`}>
        <thead>
          <tr>
            <th>When</th>
            <th>Email</th>
            <th>Folder</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const to = m.folder === "Sent" ? `/inbox/sent?mail=${m.id}` : m.folder === "Archive" ? `/inbox/archive?mail=${m.id}` : `/inbox?mail=${m.id}`;
            return (
              <tr key={m.id}>
                <td className="whitespace-nowrap">
                  {dShort(m.receivedAt.slice(0, 10))}
                  <span className="block text-[0.87rem] text-muted">{tOf(m.receivedAt)}</span>
                </td>
                <td>
                  {access.can("inbox") ? (
                    <Link to={to} className={cx("font-medium", LINK)}>
                      {m.subject}
                    </Link>
                  ) : (
                    <span className="font-medium">{m.subject}</span>
                  )}
                  <span className="block text-[0.87rem] text-muted">{m.folder === "Sent" ? `From ${m.fromName}` : `From ${m.fromName}, ${m.fromAddress}`}</span>
                </td>
                <td>{m.folder}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function FilesTab({ c, db }: { c: Client; db: Db }) {
  const access = useAccess();
  const projects = db.projects.filter((p) => p.clientId === c.id).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const sent = db.files.filter((f) => f.source === "Portal" && projects.some((p) => p.id === f.projectId));
  if (projects.length === 0)
    return (
      <Panel>
        <Empty title="No files yet">Files are kept in each project's folders.</Empty>
      </Panel>
    );
  return (
    <div className="grid grid-cols-1 gap-5">
      <Section title="By project">
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label={`${c.name}'s files by project`}>
            <thead>
              <tr>
                <th>Project</th>
                <th className="num">Files</th>
                <th>Folders</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const mine = db.files.filter((f) => f.projectId === p.id);
                const folders = [...new Set(mine.map((f) => f.folder))];
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={access.can("files") ? `/files?project=${p.code}` : `/projects/${p.code}?tab=files`} className={cx("font-medium", LINK)}>
                        {p.code} {p.name}
                      </Link>
                    </td>
                    <td className="num">{mine.length}</td>
                    <td className="text-[0.93rem] text-muted">{folders.join(", ") || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </Section>
      {sent.length > 0 && (
        <Section title={PORTAL ? "Sent in by them through the portal" : "Sent in by them"}>
          <Panel>
            <ul className="divide-y divide-line">
              {sent.map((f) => (
                <li key={f.id} className="flex items-baseline gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">{f.name}</span>
                  <span className="text-[0.87rem] text-muted">{dShort(f.modified)}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
    </div>
  );
}
