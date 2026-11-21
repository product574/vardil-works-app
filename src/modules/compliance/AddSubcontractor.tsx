import { useId, useState } from "react";
import { addSubcontractor } from "@/data/actions";
import { useData } from "@/data/store";
import { subProblem } from "@/lib/ways-in";
import { Button, Dialog, Field, NextStep, NumInput } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * Add a subcontractor (21 Nov, decision 240). Who fills it in: whoever keeps the company and
 * subcontractor papers (the managing director and accounts by default). Opened from Resources,
 * Training, Subcontractors, or from inside Add invoice when the name on an invoice is not on
 * file, in which case the name and the job come with it.
 *
 * A new firm starts with no papers, so Compliance flags its insurances and safety statement as
 * missing, and a method statement for each site it is put on, until the office records them.
 */
export function AddSubcontractorDialog({ onClose, name: startName, projectId }: { onClose: (id?: string) => void; name?: string; projectId?: string }) {
  const db = useData((s) => s.db);
  const formId = useId();
  const tradesId = useId();
  const sites = db.projects.filter((p) => p.status === "Live" || p.status === "Not started").sort((a, b) => b.code.localeCompare(a.code));
  const trades = [...new Set(db.subcontractors.map((s) => s.trade))].sort();
  const [name, setName] = useState(startName ?? "");
  const [trade, setTrade] = useState("");
  const [contactName, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [termsDays, setTerms] = useState(30);
  const [on, setOn] = useState<string[]>(projectId && sites.some((p) => p.id === projectId) ? [projectId] : []);
  const [tried, setTried] = useState(false);
  const form = { name, trade, contactName, email, phone, termsDays, projectIds: on };
  const problem = subProblem(form, db.subcontractors);
  const save = () => {
    setTried(true);
    if (problem) return;
    const id = addSubcontractor(form);
    if (!id) return;
    toast(`${name.trim()} added. Their insurances and safety statement show as missing until recorded`);
    onClose(id);
  };
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title="Add a subcontractor"
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Add subcontractor
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          save();
        }}
      >
        <Field label="Firm's name" hint="As it is written on their invoices." className="sm:col-span-2">
          {(id) => <input id={id} className="field" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Trade">
          {(id) => (
            <>
              <input id={id} className="field" list={tradesId} value={trade} placeholder="Scaffolding" onChange={(e) => setTrade(e.target.value)} />
              <datalist id={tradesId}>
                {trades.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="Contact name">{(id) => <input id={id} className="field" value={contactName} onChange={(e) => setContact(e.target.value)} />}</Field>
        <Field label="Email for remittances">{(id) => <input id={id} type="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Phone">{(id) => <input id={id} className="field" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Payment terms, days</p>
          <NumInput label="Payment terms, days" value={termsDays} onChange={setTerms} className="w-24" />
        </div>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-[0.93rem] font-medium">Sites they are on (optional)</legend>
          <div className="grid max-h-40 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
            {sites.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={on.includes(p.id)} onChange={(e) => setOn((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
                <span>
                  {p.code} {p.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p role="alert" className="min-h-5 text-bad sm:col-span-2">
          {tried ? problem : ""}
        </p>
        <div className="sm:col-span-2">
          <NextStep>
            They join the list in Resources, Training, Subcontractors with their papers flagged as missing: public and employers' liability insurance, a safety statement, and a method statement for each site ticked. Record each one there as it comes in. Their invoices can be added straight away; whoever approves one sees the flag.
          </NextStep>
        </div>
      </form>
    </Dialog>
  );
}
