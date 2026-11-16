import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { useData, usePrefs } from "@/data/store";
import { money0 } from "@/lib/money";
import { quoteTotal } from "@/lib/quotes";
import { Badge, Dialog, PageBody, PageHead, Panel } from "@/ui";
import { ProjectBadge, QuoteBadge } from "@/ui/status";

export function Clients() {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  const { seeValues, can } = useAccess();
  const [params, setParams] = useSearchParams();
  const open = db.clients.find((c) => c.id === params.get("client"));
  const owed = (clientId: string) => db.salesInvoices.filter((i) => i.clientId === clientId && i.status === "Invoiced").reduce((s, i) => s + i.net * (1 + i.vatPct / 100), 0);

  return (
    <>
      <PageHead title="Clients" note="Everyone the firm prices and works for." />
      <PageBody>
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Client</th>
                <th>Type</th>
                <th>Contact</th>
                <th>Account ref</th>
                <th className="num">Terms</th>
                <th className="num">Live projects</th>
                <th className="num">Quotes out</th>
                {seeValues && <th className="num">Owed to us</th>}
                <th>Portal</th>
              </tr>
            </thead>
            <tbody>
              {db.clients.map((c) => (
                <tr key={c.id} className="rowlink" onClick={() => setParams({ client: c.id })}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.type}</td>
                  <td>
                    {c.contactName}
                    <span className="block text-[0.87rem] text-muted">{c.contactPhone}</span>
                  </td>
                  <td>{c.accountRef}</td>
                  <td className="num">{c.termsDays} days</td>
                  <td className="num">{db.projects.filter((p) => p.clientId === c.id && p.status === "Live").length || "-"}</td>
                  <td className="num">{db.quotes.filter((q) => q.clientId === c.id && ["Sent", "Opened", "Queried"].includes(q.status)).length || "-"}</td>
                  {seeValues && <td className="num">{owed(c.id) > 0 ? money0(owed(c.id), region) : "-"}</td>}
                  <td>{c.portalEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </PageBody>

      <Dialog open={!!open} onClose={() => setParams({})} title={open?.name ?? ""} wide>
        {open && (
          <div className="grid gap-4">
            <p>
              {open.type}. {open.contactName}, {open.contactPhone}, {open.contactEmail}. Account {open.accountRef}, {open.termsDays} day terms.
            </p>
            <div>
              <h3 className="mb-1 text-base">Projects</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {db.projects.filter((p) => p.clientId === open.id).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                    {can("projects") ? (
                      <Link to={`/projects/${p.code}`} className="font-medium underline-offset-2 hover:underline">
                        {p.code} {p.name}
                      </Link>
                    ) : (
                      <span className="font-medium">
                        {p.code} {p.name}
                      </span>
                    )}
                    <span className="ml-auto">{seeValues && p.value != null && money0(p.value, region)}</span>
                    <ProjectBadge status={p.status} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1 text-base">Quotes</h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {db.quotes.filter((q) => q.clientId === open.id).map((q) => (
                  <li key={q.id} className="flex items-center gap-3 px-3 py-1.5">
                    <Link to={`/sales/quotes/${q.ref}`} className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
                      {q.ref} {q.title}
                    </Link>
                    <span className="ml-auto shrink-0">{seeValues && money0(quoteTotal(q.lines), region)}</span>
                    <QuoteBadge status={q.status} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
