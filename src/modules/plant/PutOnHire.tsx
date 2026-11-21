import { useId, useState } from "react";
import { useAccess } from "@/data/access";
import { putOnHire } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { HiredPlant, SiteRequest } from "@/data/types";
import { dShort } from "@/lib/format";
import { hireCompanies, hireProblem } from "@/lib/ways-in";
import { Button, Dialog, Field, NextStep, NumInput, Segmented } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * Put plant on hire (21 Nov, decision 239). The office fills this in once the hire company has
 * confirmed: who from, their reference, the rate and the day it starts. Opened from an approved
 * "Plant to hire" request it starts with what the site asked for, and saving it marks that
 * request dealt with. Opened from the Hired plant list it is a hire nobody had to ask for.
 */
export function PutOnHireDialog({ onClose, request }: { onClose: (id?: string) => void; request?: SiteRequest }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const formId = useId();
  const listId = useId();
  const sites = access
    .scope(db.projects)
    .filter((p) => p.status === "Live" || p.status === "Not started")
    .sort((a, b) => b.code.localeCompare(a.code));
  const known = hireCompanies(db.hiredPlant);
  const [site, setSite] = useState(request?.projectId ?? "");
  const [description, setDescription] = useState(request?.description ?? "");
  const [quantity, setQuantity] = useState(request?.quantity ?? 1);
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [ref, setRef] = useState("");
  const [from, setFrom] = useState(request && request.neededFrom > day ? request.neededFrom : day);
  const [rate, setRate] = useState(0);
  const [unit, setUnit] = useState<HiredPlant["rateUnit"]>("week");
  const [notes, setNotes] = useState(request?.notes ?? "");
  const [tried, setTried] = useState(false);
  const form = { projectId: site, description, quantity, hireCompany: company, hirePhone: phone, hireRef: ref, onHireFrom: from, rate, rateUnit: unit, notes };
  const problem = hireProblem(form);
  const fixed = request ? db.projects.find((p) => p.id === request.projectId) : undefined;
  const pickCompany = (name: string) => {
    setCompany(name);
    const k = known.find((x) => x.name === name);
    if (k && !phone.trim()) setPhone(k.phone);
  };
  const save = () => {
    setTried(true);
    if (problem) return;
    const id = putOnHire(form, request?.id);
    if (!id) return;
    toast(request ? "On hire. The site's request is marked dealt with" : "On hire. It is on the Hired plant list and the site's Plant tab");
    onClose(id);
  };
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title="Put plant on hire"
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Put on hire
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {request && fixed ? (
          <p className="sm:col-span-2">
            <span className="text-muted">Asked for by </span>
            <span className="font-medium">{request.requestedBy}</span>
            <span className="text-muted"> for </span>
            <span className="font-medium">
              {fixed.code} {fixed.name}
            </span>
            <span className="text-muted">
              , needed {dShort(request.neededFrom)} to {dShort(request.neededTo)}. Agreed by {request.decidedBy}.
            </span>
          </p>
        ) : (
          <Field label="Site" className="sm:col-span-2">
            {(id) => (
              <select id={id} className="field" value={site} onChange={(e) => setSite(e.target.value)}>
                <option value="">Choose a site</option>
                {sites.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="What is hired" className="sm:col-span-2">
          {(id) => <input id={id} className="field" value={description} placeholder="20 m articulated boom lift, tracked" onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Hire company">
          {(id) => (
            <>
              <input id={id} className="field" list={listId} value={company} onChange={(e) => pickCompany(e.target.value)} />
              <datalist id={listId}>
                {known.map((k) => (
                  <option key={k.name} value={k.name} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Their phone (optional)">{(id) => <input id={id} className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label="Their hire reference (optional)" hint="On the hire contract or delivery docket. It can follow.">
          {(id) => <input id={id} className="field" value={ref} onChange={(e) => setRef(e.target.value)} />}
        </Field>
        <Field label="On hire from">{(id) => <input id={id} type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Rate before VAT</p>
          <div className="flex items-center gap-2">
            <NumInput label="Rate before VAT" value={rate} onChange={setRate} className="w-28" />
            <Segmented label="Rate is per" value={unit} onChange={setUnit} options={[{ value: "week", label: "A week" }, { value: "day", label: "A day" }]} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">How many</p>
          <NumInput label="How many" value={quantity} onChange={setQuantity} className="w-20" />
        </div>
        <Field label="Note (optional)" className="sm:col-span-2">
          {(id) => <input id={id} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        </Field>
        <p role="alert" className="min-h-5 text-bad sm:col-span-2">
          {tried ? problem : ""}
        </p>
        <div className="sm:col-span-2">
          <NextStep>
            It goes on the Hired plant list and the site's Plant tab, and its cost counts up from the first day. Hire keeps running until the company collects it: when the site is finished with it, press Notify return, then Mark collected.
          </NextStep>
        </div>
      </form>
    </Dialog>
  );
}
