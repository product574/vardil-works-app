import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addProject } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Project } from "@/data/types";
import { addDays } from "@/lib/dates";
import { plural } from "@/lib/format";
import { siteManagerChoices } from "@/lib/site-access";
import { type NewProject, projectProblem, scopeLines } from "@/lib/ways-in";
import { REGION } from "@/lib/money";
import { Button, Dialog, Field, NextStep, NumInput, OptionalNumInput } from "@/ui";
import { toast } from "@/ui/toast";

const PRICED: { value: NewProject["pricedBy"]; label: string; hint: string }[] = [
  { value: "Agreed price", label: "An agreed price", hint: "A fixed price agreed with the client by letter, email or their order." },
  { value: "Schedule of rates", label: "A schedule of rates", hint: "Measured and billed at agreed rates as the work is done. Give an estimate of the value if there is one." },
  { value: "Unpriced", label: "Not priced yet", hint: "Emergency or opening-up works, priced once the extent is known." },
];

/**
 * Add a project that did not come from a tender (21 Nov, decision 241): a repeat client, emergency
 * works, a job on a schedule of rates. Who fills it in: whoever has the office side of projects
 * (the managing director and contracts managers by default). It gets the next site code, starts
 * as Not started, and counts in Sales, Confirmed like any other order, marked "No tender".
 *
 * The scope goes in here, one item a line, because there are no priced items to copy it from.
 */
export function AddProjectDialog({ onClose }: { onClose: (code?: string) => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const access = useAccess();
  const formId = useId();
  const countiesId = useId();
  const clients = [...db.clients].sort((a, b) => a.name.localeCompare(b.name));
  const managers = siteManagerChoices(db, { siteManagerId: "" });
  const contracts = db.people.filter((p) => p.kind === "Management" && p.active && p.level === "contracts").sort((a, b) => a.name.localeCompare(b.name));
  const counties = [...new Set(db.projects.map((p) => p.county).filter(Boolean))].sort();
  const me = contracts.find((p) => p.id === access.personId);
  const [f, setF] = useState<NewProject>({
    clientId: "",
    name: "",
    location: "",
    county: "",
    description: "",
    pricedBy: "Agreed price",
    value: null,
    orderRef: "",
    startDate: addDays(day, 14),
    endDate: addDays(day, 56),
    siteManagerId: "",
    contractsManagerId: me?.id ?? contracts[0]?.id ?? "",
    scope: "",
  });
  const set = <K extends keyof NewProject>(k: K, v: NewProject[K]) => setF((x) => ({ ...x, [k]: v }));
  const [tried, setTried] = useState(false);
  const problem = projectProblem(f);
  const items = scopeLines(f.scope).length;
  const nextCode = `C${Math.max(0, ...db.projects.map((p: Project) => Number(p.code.replace("C", "")) || 0)) + 1}`;
  const priced = PRICED.find((x) => x.value === f.pricedBy)!;
  const save = () => {
    setTried(true);
    if (problem) return;
    const code = addProject(f);
    if (!code) return;
    toast(`${code} set up. It is under Not started, and in Sales, Confirmed`);
    onClose(code);
  };
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title="Add a project"
      wide
      footer={
        <>
          <Button onClick={() => onClose()}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Add project {nextCode}
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
        <p className="text-[0.93rem] text-muted sm:col-span-2">For a job that skipped the tender stage. A tender recorded as won in Sales makes its project by itself, so do not add those here.</p>
        <Field label="Client" hint="A new client is added first in Sales, Customers." className="sm:col-span-2">
          {(id) => (
            <select id={id} className="field" value={f.clientId} onChange={(e) => set("clientId", e.target.value)}>
              <option value="">Choose the client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Project name" className="sm:col-span-2">
          {(id) => <input id={id} className="field" value={f.name} placeholder="Gate lodge chimney, storm repairs" onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label="Where the site is">{(id) => <input id={id} className="field" value={f.location} placeholder="Ardmullen Estate, Athenry" onChange={(e) => set("location", e.target.value)} />}</Field>
        <Field label="County">
          {(id) => (
            <>
              <input id={id} className="field" list={countiesId} value={f.county} onChange={(e) => set("county", e.target.value)} />
              <datalist id={countiesId}>
                {counties.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label="The work, in a sentence" className="sm:col-span-2">
          {(id) => <input id={id} className="field" value={f.description} placeholder="Take down and rebuild the storm-damaged chimney stack in lime mortar" onChange={(e) => set("description", e.target.value)} />}
        </Field>
        <Field label="How it is priced" hint={priced.hint}>
          {(id) => (
            <select id={id} className="field" value={f.pricedBy} onChange={(e) => set("pricedBy", e.target.value as NewProject["pricedBy"])}>
              {PRICED.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
        </Field>
        {f.pricedBy !== "Unpriced" && access.seeValues && (
          <div>
            <p className="mb-1 text-[0.93rem] font-medium">
              {f.pricedBy === "Agreed price" ? "Agreed price" : "Estimated value (optional)"}, {REGION[region].currency === "EUR" ? "euro" : "pounds"} before VAT
            </p>
            <NumInput label="Value before VAT" value={f.value ?? 0} onChange={(n) => set("value", n > 0 ? n : null)} className="h-9 w-full" />
          </div>
        )}
        {access.seeMargins && (
          <Field label="Estimated margin % (optional)" hint="What you expect it to make, as a % of the value. Shown in Sales, Confirmed and the Pipeline. Can be set later.">
            {(id) => <OptionalNumInput id={id} value={f.estMargin ?? null} onChange={(n) => set("estMargin", n)} className="w-32" placeholder="Not given" />}
          </Field>
        )}
        <Field label="Client's order number (optional)" hint="A purchase order, or the letter or email that confirmed it." className={f.pricedBy === "Unpriced" || !access.seeValues ? "" : "sm:col-span-2"}>
          {(id) => <input id={id} className="field" value={f.orderRef} onChange={(e) => set("orderRef", e.target.value)} />}
        </Field>
        <Field label="Starts on site">{(id) => <input id={id} type="date" className="field" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} />}</Field>
        <Field label="Planned finish">{(id) => <input id={id} type="date" className="field" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} />}</Field>
        <Field label="Site manager">
          {(id) => (
            <select id={id} className="field" value={f.siteManagerId} onChange={(e) => set("siteManagerId", e.target.value)}>
              <option value="">Choose who runs the site</option>
              {managers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Contracts manager">
          {(id) => (
            <select id={id} className="field" value={f.contractsManagerId} onChange={(e) => set("contractsManagerId", e.target.value)}>
              {contracts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Scope of work, one item a line (optional)" hint={items ? `${plural(items, "item")}. They become the scope to tick off and the bars on the Programme.` : "Leave it empty to add the scope later on the project's Programme tab."} className="sm:col-span-2">
          {(id) => <textarea id={id} rows={4} className="field" value={f.scope} placeholder={"Scaffold to the chimney stack\nTake down the stack to roof level\nRebuild in salvaged brick and lime mortar\nNew lead flashings"} onChange={(e) => set("scope", e.target.value)} />}
        </Field>
        <p role="alert" className="min-h-5 text-bad sm:col-span-2">
          {tried ? problem : ""}
        </p>
        <div className="sm:col-span-2">
          <NextStep>
            It becomes {nextCode} under Not started, and counts in Sales, Confirmed, marked "No tender". Its site manager can open it at once and it can be planned on the week ahead. It turns live when he or the office presses Start on site on its page. Who else may open it is set in <Link to="/admin/site-access" className="underline underline-offset-2">Admin, Site access</Link>.
          </NextStep>
        </div>
      </form>
    </Dialog>
  );
}
