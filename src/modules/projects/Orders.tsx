import { Plus } from "@phosphor-icons/react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { markDelivered, placeOrder, undoDelivered } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project, SpendRequest, SupplyOrder } from "@/data/types";
import { buyingFor, daysLate, deliveredLately, mayMarkDelivered, onOrder, orderProblem, toOrder } from "@/lib/buying";
import { addDays } from "@/lib/dates";
import { dShort, plural, whenInline } from "@/lib/format";
import { money0 } from "@/lib/money";
import { Badge, Button, DeclineNote, Dialog, Empty, Field, NextStep, PageBody, PageHead, Panel, Section } from "@/ui";
import { toast } from "@/ui/toast";
import { NewRequestDialog } from "./AddDialogs";

/**
 * Orders and deliveries (21 Nov, decisions 242 and 243): buying for a site from the ask to the
 * delivery. Someone asks to buy something (New request, "Something to buy"); the managing
 * director says yes or no in Admin; the office places the order here; the site marks it
 * delivered. The same lists are on a project's Site requests tab, for that site alone.
 */

/** The office records the order it has placed for an approved request. */
export function PlaceOrderDialog({ spend, onClose }: { spend: SpendRequest; onClose: () => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const formId = useId();
  const listId = useId();
  const [supplier, setSupplier] = useState(spend.supplier === "Not chosen yet" ? "" : spend.supplier);
  const [dueOn, setDueOn] = useState(addDays(day, 5));
  const [tried, setTried] = useState(false);
  const p = db.projects.find((x) => x.id === spend.projectId);
  const known = [...new Set([...db.supplierInvoices.map((s) => s.supplier), ...db.subcontractors.map((s) => s.name)])].sort();
  const problem = orderProblem({ supplier, dueOn }, day);
  const save = () => {
    setTried(true);
    if (problem) return;
    if (!placeOrder(spend.id, { supplier, dueOn })) return;
    toast(p ? `Order recorded. ${p.code} will mark it delivered when it arrives` : "Order recorded. Mark it delivered when it arrives");
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Order placed"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Record the order
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
        <p>
          <span className="font-medium">{spend.what}</span>
          <span className="text-muted">
            , {money0(spend.amount, region)} before VAT, for {p ? `${p.code} ${p.name}` : "the firm"}. Agreed by {spend.decidedBy}.
          </span>
        </p>
        <Field label="Ordered from">
          {(id) => (
            <>
              <input id={id} className="field" list={listId} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              <datalist id={listId}>
                {known.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={p ? "Due on site" : "Due"}>{(id) => <input id={id} type="date" className="field" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />}</Field>
        <p role="alert" className="min-h-5 text-bad">
          {tried ? problem : ""}
        </p>
        <NextStep>
          {p ? "It shows under On order for the site, with the day it is due. The site manager marks it delivered when it arrives, on this screen or on his phone." : "It shows under On order. The office marks it delivered when it arrives."} The supplier's invoice is added in Finance, Money out, when it comes.
        </NextStep>
      </form>
    </Dialog>
  );
}

const dueText = (o: SupplyOrder, today: string) => {
  const late = daysLate(o, today);
  return late > 0 ? `${plural(late, "day")} late` : o.dueOn === today ? "Due today" : `Due ${dShort(o.dueOn)}`;
};

/** One order's line and its Mark delivered button, shared by the screens and the phone. */
export function DeliveredButton({ o, size = "sm" }: { o: SupplyOrder; size?: "sm" | "md" | "lg" }) {
  return (
    <Button
      size={size}
      variant="primary"
      onClick={() => {
        markDelivered(o.id);
        toast(`Marked delivered: ${o.description}`, { label: "Undo", run: () => undoDelivered(o.id) });
      }}
    >
      Mark delivered
    </Button>
  );
}

/** The four lists, for one project or for every site the person covers. */
export function BuyingLists({ project }: { project?: Project }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const office = access.may("manageProjects");
  const [ordering, setOrdering] = useState<SpendRequest | null>(null);
  const siteIds = project ? new Set([project.id]) : access.allProjects ? null : new Set(access.scope(db.projects).map((p) => p.id));
  const { spend, orders } = buyingFor(db, siteIds, project ? null : access.personId);
  const waiting = spend.filter((s) => s.status === "Waiting").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const approved = toOrder(spend);
  const declined = spend.filter((s) => s.status === "Declined" && whenRecent(s.decidedAt, day));
  const coming = onOrder(orders);
  const here = deliveredLately(orders, day);
  const site = (id: string | null) => {
    const p = db.projects.find((x) => x.id === id);
    if (project) return null;
    return p ? (
      <Link to={`/projects/${p.code}?tab=requests`} className="underline-offset-2 hover:underline">
        {p.code} {p.name}
      </Link>
    ) : (
      <span>For the firm, not one site</span>
    );
  };
  const name = (id: string) => db.people.find((x) => x.id === id)?.name ?? "";
  const nothing = waiting.length + approved.length + declined.length + coming.length + here.length === 0;
  if (nothing)
    return (
      <Panel>
        <Empty title="Nothing asked for or on order">Ask to buy something with New request, choosing Something to buy. After the managing director's yes the office orders it, and it is marked delivered here when it arrives.</Empty>
      </Panel>
    );
  return (
    <>
      {waiting.length + declined.length > 0 && (
        <Section title={`Asked for, waiting for a yes or no (${waiting.length})`} aside="With the managing director, in Admin, Requests">
          <Panel>
            <ul className="divide-y divide-line" aria-label="Asked for, waiting for a yes or no">
              {[...waiting, ...declined].map((s) => (
                <li key={s.id} className="flex flex-wrap items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">
                      {s.what}
                      {access.seeValues && <span className="font-normal text-muted">, {money0(s.amount, region)} before VAT</span>}
                    </p>
                    <p className="text-[0.93rem] text-muted">
                      {site(s.projectId)}
                      {!project && ". "}Asked by {name(s.requestedById)}, {whenInline(s.createdAt, day)}. {s.reason}
                    </p>
                    {s.status === "Declined" && <DeclineNote note={s.declineNote} className="text-[0.93rem]" />}
                  </div>
                  {s.status === "Declined" ? <Badge>Declined by {s.decidedBy}</Badge> : <Badge tone="accent">Waiting</Badge>}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
      {approved.length > 0 && (
        <Section title={`Approved, to be ordered (${approved.length})`} aside={office ? "Place each order with the supplier, then record it here" : "With the office, who place the order"}>
          <Panel>
            <ul className="divide-y divide-line" aria-label="Approved, to be ordered">
              {approved.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">
                      {s.what}
                      {access.seeValues && <span className="font-normal text-muted">, {money0(s.amount, region)} before VAT</span>}
                    </p>
                    <p className="text-[0.93rem] text-muted">
                      {site(s.projectId)}
                      {!project && ". "}Asked by {name(s.requestedById)}. Agreed by {s.decidedBy}
                      {s.decidedAt ? `, ${whenInline(s.decidedAt, day)}` : ""}.{s.supplier && s.supplier !== "Not chosen yet" ? ` Supplier suggested: ${s.supplier}.` : ""}
                    </p>
                  </div>
                  {office ? (
                    <Button size="sm" variant="primary" onClick={() => setOrdering(s)}>
                      Order placed
                    </Button>
                  ) : (
                    <Badge tone="accent">With the office</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
      <Section title={`On order (${coming.length})`} aside="Whoever runs the site marks each one delivered when it arrives">
        <Panel>
          {coming.length === 0 ? (
            <Empty title="Nothing on order" />
          ) : (
            <ul className="divide-y divide-line" aria-label="On order">
              {coming.map((o) => {
                const late = daysLate(o, day) > 0;
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="font-medium">{o.description}</p>
                      <p className="text-[0.93rem] text-muted">
                        {site(o.projectId)}
                        {!project && ". "}From {o.from}, ordered {dShort(o.orderedOn)}
                        {o.orderedBy ? ` by ${o.orderedBy}` : ""}.{o.progress ? ` ${o.progress} here so far.` : ""}
                      </p>
                    </div>
                    <Badge tone={late ? "bad" : o.status === "Ordered" ? "neutral" : "warn"}>{o.status === "Ordered" || late ? dueText(o, day) : o.status}</Badge>
                    {mayMarkDelivered(o, db.projects, access.personId, access.siteAccess, office) && <DeliveredButton o={o} />}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </Section>
      {here.length > 0 && (
        <Section title={`Delivered in the last 30 days (${here.length})`}>
          <Panel>
            <ul className="divide-y divide-line" aria-label="Delivered in the last 30 days">
              {here.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="font-medium">{o.description}</p>
                    <p className="text-[0.93rem] text-muted">
                      {site(o.projectId)}
                      {!project && ". "}From {o.from}. Delivered {dShort(o.deliveredOn!)}
                      {o.deliveredBy ? `, marked by ${o.deliveredBy}` : ""}.
                    </p>
                  </div>
                  <Badge tone="ok">Delivered</Badge>
                </li>
              ))}
            </ul>
          </Panel>
        </Section>
      )}
      {ordering && <PlaceOrderDialog spend={ordering} onClose={() => setOrdering(null)} />}
    </>
  );
}

/** A no in the last fortnight is still worth showing to whoever asked. */
const whenRecent = (stamp: string | undefined, today: string) => !!stamp && stamp.slice(0, 10) >= addDays(today, -14);

/** Projects, Requests and variations, Orders and deliveries. */
export function OrdersAndDeliveries() {
  const db = useData((s) => s.db);
  const access = useAccess();
  const [adding, setAdding] = useState(false);
  const canAdd = access.scope(db.projects).some((p) => p.status === "Live" || p.status === "Not started");
  return (
    <>
      <PageHead
        title="Orders and deliveries"
        note="Buying for the sites, from the ask to the delivery. Anyone who can open this section asks with Something to buy. The managing director says yes or no in Admin, Requests. The office places the order and records it here. Whoever runs the site marks it delivered when it arrives, here or on the phone. The supplier's invoice is then added in Finance, Money out."
        actions={
          canAdd && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              <Plus size={16} /> Something to buy
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-5xl gap-6">
        <BuyingLists />
      </PageBody>
      {adding && <NewRequestDialog buy onClose={() => setAdding(false)} />}
    </>
  );
}
