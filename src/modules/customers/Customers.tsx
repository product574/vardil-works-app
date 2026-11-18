import { MagnifyingGlass } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addCustomer, type CustomerDetails, updateCustomer } from "@/data/actions";
import { co } from "@/data/place";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Client, ClientType } from "@/data/types";
import { plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { customerFigures } from "@/lib/reports";
import { Badge, Button, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Switch } from "@/ui";
import { toast } from "@/ui/toast";

// Customers (18 Nov): every customer in one list, and each on a page of their own
// (CustomerPage.tsx) with everything the firm has to do with them.

export const TYPES: ClientType[] = ["Private owner", "Church body", "Heritage trust", "Local authority", "Commercial", "Main contractor"];

/** Who may add customers and change their details: whoever prices work or handles invoices. */
export function useCanEditCustomers() {
  const access = useAccess();
  return access.may("priceQuotes") || access.may("manageInvoices");
}

export function Customers() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const canEdit = useCanEditCustomers();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const q = text.trim().toLowerCase();
  const rows = db.clients
    .filter((c) => !q || [c.name, c.contactName, c.type, c.accountRef, c.county, c.contactEmail].some((v) => v?.toLowerCase().includes(q)))
    .map((c) => ({ c, f: customerFigures(db, c.id, day), out: db.quotes.filter((x) => x.clientId === c.id && ["Sent", "Opened", "Queried"].includes(x.status)).length }))
    .sort((a, b) => b.f.sales - a.f.sales || a.c.name.localeCompare(b.c.name));
  const live = db.clients.filter((c) => db.projects.some((p) => p.clientId === c.id && p.status === "Live")).length;
  return (
    <>
      <PageHead
        title="Customers"
        note={`${plural(db.clients.length, "customer")}, ${live} with a job on site now. Open one for their details, projects, tenders, invoices, emails and files, all on one page.`}
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add customer
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-[92rem] grid-cols-1 gap-4">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search customers</span>
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input type="search" className="field pl-8" placeholder="Name, contact, type or Sage account" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={`No customer matches "${text}"`}>Try their name, the contact's name or their Sage account.</Empty>
          ) : (
            <table className="tbl" aria-label="Customers">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th className="num">Live jobs</th>
                  <th className="num">Tenders out</th>
                  {access.seeValues && <th className="num">Sales, 12 months</th>}
                  {access.seeValues && <th className="num">Owed now</th>}
                  <th>Portal</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, f, out }) => (
                  <tr key={c.id} className="rowlink" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td>
                      <Link to={`/customers/${c.id}`} className="font-medium text-accent-ink underline-offset-2 hover:underline" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                      <span className="block text-[0.87rem] text-muted">
                        {c.type}
                        {c.county ? `, ${co(c.county)}` : ""}
                      </span>
                    </td>
                    <td>
                      {c.contactName}
                      <span className="block text-[0.87rem] text-muted">{c.contactPhone}</span>
                    </td>
                    <td className="num">{f.live || "-"}</td>
                    <td className="num">{out || "-"}</td>
                    {access.seeValues && <td className="num">{f.sales > 0 ? money0(f.sales, region) : "-"}</td>}
                    {access.seeValues && <td className="num">{f.owed > 0 ? money0(f.owed, region) : "-"}</td>}
                    <td>{c.portalEnabled ? <Badge tone="ok">On</Badge> : <Badge>Off</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && (
        <CustomerForm
          onClose={(id) => {
            setAdding(false);
            if (id) navigate(`/customers/${id}`);
          }}
        />
      )}
    </>
  );
}

const blank: CustomerDetails = { name: "", type: "Private owner", contactName: "", contactPhone: "", contactEmail: "", address: "", county: "", billingEmail: "", termsDays: 30, portalEnabled: false };
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Add a customer (no `client`) or change one's details. `onClose` gets the customer's id when something was saved. */
export function CustomerForm({ client, onClose }: { client?: Client; onClose: (id?: string) => void }) {
  const db = useData((s) => s.db);
  const formId = useId();
  const [f, setF] = useState<CustomerDetails>(() => (client ? { name: client.name, type: client.type, contactName: client.contactName, contactPhone: client.contactPhone, contactEmail: client.contactEmail, address: client.address ?? "", county: client.county ?? "", billingEmail: client.billingEmail ?? "", termsDays: client.termsDays, portalEnabled: client.portalEnabled } : blank));
  const set = (patch: Partial<CustomerDetails>) => setF((x) => ({ ...x, ...patch }));
  const dup = db.clients.some((c) => c.id !== client?.id && c.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const problem = !f.name.trim()
    ? "Give the customer a name."
    : dup
      ? `${f.name.trim()} is already a customer.`
      : !f.contactName.trim()
        ? "Name the person to deal with."
        : !f.contactPhone.trim() && !f.contactEmail.trim()
          ? "Give a phone number or an email address for them."
          : f.contactEmail.trim() && !isEmail(f.contactEmail)
            ? "The contact's email is not a full email address."
            : f.billingEmail?.trim() && !isEmail(f.billingEmail)
              ? "The email for invoices is not a full email address."
              : "";
  // Shown once they have started, or pressed the button with something missing.
  const [tried, setTried] = useState(false);
  const touched = tried || !!(f.name || f.contactName);
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={client ? `Change ${client.name}'s details` : "Add a customer"}
      wide
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            {client ? "Save details" : "Add customer"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (problem) return setTried(true);
          if (client) {
            updateCustomer(client.id, f);
            toast(`${f.name.trim()}'s details saved`);
            onClose(client.id);
          } else {
            const id = addCustomer(f);
            toast(`${f.name.trim()} added to Customers`);
            onClose(id);
          }
        }}
      >
        <Field label="Name" className="sm:col-span-2">
          {(id) => <input id={id} className="field" autoComplete="organization" value={f.name} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <Field label="Kind of customer">
          {(id) => (
            <select id={id} className="field" value={f.type} onChange={(e) => set({ type: e.target.value as ClientType })}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Person to deal with">{(id) => <input id={id} className="field" autoComplete="name" value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} />}</Field>
        <Field label="Phone">{(id) => <input id={id} type="tel" inputMode="tel" autoComplete="tel" className="field" value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />}</Field>
        <Field label="Email">{(id) => <input id={id} type="email" autoComplete="email" className="field" value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />}</Field>
        <Field label="Address" hint="Where invoices are addressed: street and town.">
          {(id) => <input id={id} className="field" autoComplete="street-address" value={f.address} onChange={(e) => set({ address: e.target.value })} />}
        </Field>
        <Field label="County">{(id) => <input id={id} className="field" value={f.county} onChange={(e) => set({ county: e.target.value })} />}</Field>
        <Field label="Email for invoices" hint="Optional. Without one, invoices go to the contact's email." className="sm:col-span-2">
          {(id) => <input id={id} type="email" className="field" value={f.billingEmail} onChange={(e) => set({ billingEmail: e.target.value })} />}
        </Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Payment terms, days</p>
          <NumInput label="Payment terms, days" className="w-24" value={f.termsDays} onChange={(n) => set({ termsDays: n })} />
        </div>
        <div className="flex items-center gap-3 self-end pb-1.5">
          <Switch on={f.portalEnabled} label="Client portal" onChange={() => set({ portalEnabled: !f.portalEnabled })} />
          <span>Client portal {f.portalEnabled ? "on" : "off"}</span>
        </div>
        {client && <p className="text-[0.93rem] text-muted sm:col-span-2">Sage account {client.accountRef} stays as it is, so Sage keeps matching their invoices.</p>}
        {problem && touched && <p className="text-[0.93rem] text-warn sm:col-span-2">{problem}</p>}
      </form>
    </Dialog>
  );
}
