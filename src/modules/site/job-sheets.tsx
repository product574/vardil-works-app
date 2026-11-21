/**
 * Two sheets inside a site on the site manager's phone (21 Nov, decisions 243 and 247): the snag
 * list, and what is on order for the site. Both carry his name on what he does, also when the
 * office is looking at his phone.
 */
import { useState } from "react";
import { actAs, addSnag, fixSnag, markDelivered, reopenSnag, undoDelivered } from "@/data/actions";
import { useData } from "@/data/store";
import type { Db, Person, Project, Snag } from "@/data/types";
import { daysLate, deliveredLately, onOrder, toOrder } from "@/lib/buying";
import { dShort, plural } from "@/lib/format";
import { openSnags } from "@/lib/snags";
import { Badge, Button, Dialog, Field, Segmented } from "@/ui";
import { PickFile, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";

export const snagsOpen = (db: Pick<Db, "snags">, siteId: string) => openSnags(db.snags, siteId).length;
export const ordersComing = (db: Pick<Db, "supplies">, siteId: string) => onOrder(db.supplies.filter((o) => o.projectId === siteId));

/**
 * The site's snag list. The site manager adds each snag as he walks the job, with a photo from the
 * camera, and marks it fixed when it is put right. The final account is on hold while any is open.
 */
export function SnagsSheet({ site, me, onClose }: { site: Project; me: Person; onClose: () => void }) {
  const db = useData((s) => s.db);
  const all = db.snags.filter((x) => x.projectId === site.id);
  const open = all.filter((x) => x.status === "Open");
  const fixed = all.filter((x) => x.status === "Fixed");
  const [adding, setAdding] = useState(false);
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [from, setFrom] = useState<Snag["from"]>("own");
  const [fixBy, setFixBy] = useState("");
  const [tried, setTried] = useState(false);
  const photo = useProofPick();
  const crew = [...new Set(db.assignments.filter((a) => a.projectId === site.id).map((a) => db.people.find((x) => x.id === a.personId)?.name).filter((n): n is string => !!n))].sort();
  const subs = db.subcontractors.filter((s) => s.projectIds.includes(site.id)).map((s) => s.name);
  const save = () => {
    setTried(true);
    if (!what.trim()) return;
    actAs(me.id, () => addSnag(site.id, { what, where, from, fixBy, ...(photo.proof ? { photo: photo.proof } : {}) }));
    toast("Snag added to the list");
    setAdding(false);
    setWhat("");
    setWhere("");
    setFixBy("");
    setTried(false);
  };
  return (
    <Dialog open onClose={onClose} title="Snags">
      <div className="grid gap-3">
        <p className="text-[0.93rem] text-muted">
          {open.length === 0 ? `No snag is open on ${site.code}.` : `${plural(open.length, "snag")} open on ${site.code}.`} The final account is on hold while any snag is open.
        </p>
        {!adding && (
          <Button size="lg" variant="primary" onClick={() => setAdding(true)}>
            Add a snag
          </Button>
        )}
        {adding && (
          <div className="grid gap-2.5 rounded-lg border border-line-strong bg-surface p-3">
            <Field label="What is wrong">{(id) => <input id={id} className="field text-[1.02rem]" value={what} onChange={(e) => setWhat(e.target.value)} />}</Field>
            <Field label="Where on the job (optional)">{(id) => <input id={id} className="field text-[1.02rem]" value={where} onChange={(e) => setWhere(e.target.value)} />}</Field>
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Whose list it is from</p>
              <Segmented label="Whose list it is from" value={from} onChange={setFrom} options={[{ value: "own", label: "Our own walk-round" }, { value: "client", label: "The client's" }]} />
            </div>
            <Field label="Who is to fix it (optional)">
              {(id) => (
                <select id={id} className="field text-[1.02rem]" value={fixBy} onChange={(e) => setFixBy(e.target.value)}>
                  <option value="">Not decided yet</option>
                  {crew.length > 0 && (
                    <optgroup label="Our people on this job">
                      {crew.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </optgroup>
                  )}
                  {subs.length > 0 && (
                    <optgroup label="Subcontractors on this job">
                      {subs.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </Field>
            <div>
              <p className="mb-1 text-[0.93rem] font-medium">Photo (optional)</p>
              <PickFile accept="image/*" what="photo of the snag" onFile={photo.pick} chosen={photo.proof?.name} />
              <p role="alert" className="text-bad">
                {photo.error}
              </p>
            </div>
            <p role="alert" className="min-h-5 text-bad">
              {tried && !what.trim() ? "Say what is wrong." : ""}
            </p>
            <div className="flex justify-end gap-2">
              <Button size="lg" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button size="lg" variant="primary" onClick={save}>
                Add snag
              </Button>
            </div>
          </div>
        )}
        <ul className="grid gap-2" aria-label={`Snags on ${site.code}`}>
          {[...open, ...fixed].map((s) => (
            <li key={s.id} className="grid gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 font-medium">{s.what}</span>
                <Badge tone={s.status === "Open" ? "warn" : "ok"}>{s.status}</Badge>
              </span>
              <span className="text-[0.93rem] text-muted">
                {[s.where, s.from === "client" ? "The client's list" : "Our own walk-round", s.fixBy ? `To fix: ${s.fixBy}` : "Nobody down to fix it yet"].filter(Boolean).join(". ")}.
              </span>
              {s.photo && <img src={s.photo.dataUrl} alt={`Photo of the snag: ${s.what}`} className="max-h-40 justify-self-start rounded-md border border-line" />}
              {s.status === "Open" ? (
                <Button
                  size="lg"
                  className="justify-self-start"
                  onClick={() => {
                    actAs(me.id, () => fixSnag(s.id));
                    toast("Snag marked fixed", { label: "Undo", run: () => reopenSnag(s.id) });
                  }}
                >
                  Mark fixed
                </Button>
              ) : (
                <span className="text-[0.93rem]">
                  Fixed {s.fixedAt ? dShort(s.fixedAt.slice(0, 10)) : ""} by {s.fixedBy}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}

/** What is on order for the site, and Mark delivered when it arrives. */
export function DeliveriesSheet({ site, me, day, onClose }: { site: Project; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const mine = db.supplies.filter((o) => o.projectId === site.id);
  const coming = onOrder(mine);
  const here = deliveredLately(mine, day).slice(0, 5);
  const waiting = db.spendRequests.filter((s) => s.projectId === site.id && s.status === "Waiting");
  const approved = toOrder(db.spendRequests.filter((s) => s.projectId === site.id));
  return (
    <Dialog open onClose={onClose} title="Orders and deliveries">
      <div className="grid gap-3">
        <p className="text-[0.93rem] text-muted">What is on its way to {site.code}. Mark each one delivered when it arrives, so the office knows it is here before the invoice comes. To ask for something, use Make a request and choose Something to buy.</p>
        {coming.length === 0 && <p>Nothing is on order for {site.code}.</p>}
        <ul className="grid gap-2" aria-label={`On order for ${site.code}`}>
          {coming.map((o) => {
            const late = daysLate(o, day);
            return (
              <li key={o.id} className="grid gap-1.5 rounded-lg border border-line bg-surface px-3 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 font-medium">{o.description}</span>
                  <Badge tone={late > 0 ? "bad" : "neutral"}>{late > 0 ? `${plural(late, "day")} late` : o.dueOn === day ? "Due today" : `Due ${dShort(o.dueOn)}`}</Badge>
                </span>
                <span className="text-[0.93rem] text-muted">
                  From {o.from}, ordered {dShort(o.orderedOn)}.{o.progress ? ` ${o.progress} here so far.` : ""}
                  {o.status === "Ready to collect" ? " Ready to collect." : ""}
                </span>
                <Button
                  size="lg"
                  variant="primary"
                  className="justify-self-start"
                  onClick={() => {
                    actAs(me.id, () => markDelivered(o.id));
                    toast(`Marked delivered: ${o.description}`, { label: "Undo", run: () => undoDelivered(o.id) });
                  }}
                >
                  Mark delivered
                </Button>
              </li>
            );
          })}
        </ul>
        {waiting.length + approved.length > 0 && (
          <section>
            <h3 className="mb-1 text-[0.93rem] font-medium">Asked for, not ordered yet</h3>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Asked for, not ordered yet">
              {[...approved, ...waiting].map((s) => (
                <li key={s.id} className="flex items-baseline gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">{s.what}</span>
                  <span className="text-[0.87rem] text-muted">{s.status === "Approved" ? "Agreed, the office is ordering it" : "Waiting for a yes or no"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {here.length > 0 && (
          <section>
            <h3 className="mb-1 text-[0.93rem] font-medium">Delivered lately</h3>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface" aria-label="Delivered lately">
              {here.map((o) => (
                <li key={o.id} className="flex items-baseline gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1">{o.description}</span>
                  <span className="text-[0.87rem] text-muted">{dShort(o.deliveredOn!)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  );
}
