import { useId, useState } from "react";
import { useAccess } from "@/data/access";
import { addRequest, addSnag, raiseExtra } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Project, RequestKind, Snag } from "@/data/types";
import { addDays } from "@/lib/dates";
import { takesRequests, takesSnags, takesVariations } from "@/lib/snags";
import { Button, Dialog, Field, NumInput, Segmented } from "@/ui";
import { PickFile, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";

/**
 * The three things a person adds in Projects, Requests and variations (20 Nov, decisions 234 and
 * 235): a request to the office, a variation, and a snag. Each is one box, used both from the
 * section's own screens (where the site is picked first) and from a project's page (where the
 * site is already known), so there is one form per thing wherever it is opened.
 *
 * Who may add: anyone who can open the section, for the sites their level covers (a site manager
 * only his own). What happens next is said under each form, so nobody wonders where it went.
 */

/** The sites this person may pick, newest code first. */
function useSites(takes: (p: Project) => boolean) {
  const projects = useData((s) => s.db.projects);
  const access = useAccess();
  return access
    .scope(projects)
    .filter(takes)
    .sort((a, b) => b.code.localeCompare(a.code));
}

const GENERAL = "general";

/** The site box: a list to pick from, or the site named when the box was opened from its page. */
function SiteField({ sites, value, onChange, fixed, general }: { sites: Project[]; value: string; onChange: (id: string) => void; fixed?: Project; general?: boolean }) {
  if (fixed)
    return (
      <p>
        <span className="text-muted">Site </span>
        <span className="font-medium">
          {fixed.code} {fixed.name}
        </span>
      </p>
    );
  return (
    <Field label="Site">
      {(id) => (
        <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose a site</option>
          {sites.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} {p.name}
            </option>
          ))}
          {general && <option value={GENERAL}>General, not for one site</option>}
        </select>
      )}
    </Field>
  );
}

const Next = ({ children }: { children: string }) => <p className="rounded-md bg-side px-3 py-2 text-[0.93rem] text-muted">{children}</p>;

/** Ask the office for people, plant or something else. It waits for the managing director's yes or no in Admin. */
export function NewRequestDialog({ onClose, project }: { onClose: () => void; project?: Project }) {
  const day = useDay();
  const sites = useSites(takesRequests);
  const formId = useId();
  const [site, setSite] = useState(project?.id ?? "");
  const [kind, setKind] = useState<RequestKind>("personnel");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [from, setFrom] = useState(addDays(day, 1));
  const [to, setTo] = useState(addDays(day, 5));
  const [notes, setNotes] = useState("");
  const general = site === GENERAL;
  const problem = !site ? "Choose the site it is for." : !description.trim() ? "Say what is needed." : to < from ? "The end date is before the start date." : "";
  const [tried, setTried] = useState(false);
  const send = () => {
    setTried(true);
    if (problem) return;
    addRequest({ projectId: general ? null : site, kind: general ? "other" : kind, description: description.trim(), quantity: Math.max(1, quantity || 1), neededFrom: from, neededTo: to, notes: notes.trim() });
    toast("Request sent. It waits for a yes or no in Admin, Requests");
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="New request"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Send request
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <SiteField sites={sites} value={site} onChange={setSite} fixed={project} general />
        {!general && (
          <Field label="What kind">
            {(id) => (
              <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
                <option value="personnel">People</option>
                <option value="own_plant">Our own plant</option>
                <option value="hired_plant">Plant to hire</option>
                <option value="other">Something else</option>
              </select>
            )}
          </Field>
        )}
        <Field label="What is needed">{(id) => <input id={id} className="field" value={description} placeholder="Two general operatives for scaffold adaptation" onChange={(e) => setDescription(e.target.value)} />}</Field>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="mb-1 text-[0.93rem] font-medium">How many</p>
            <NumInput label="How many" value={quantity} onChange={setQuantity} />
          </div>
          <Field label="From">{(id) => <input id={id} type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Until">{(id) => <input id={id} type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <Field label="Note (optional)">{(id) => <input id={id} className="field" value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
        <p role="alert" className="min-h-5 text-bad">
          {tried ? problem : ""}
        </p>
        <Next>It goes to the managing director for a yes or no (Admin, Requests). A yes stays open until the office has arranged it.</Next>
      </form>
    </Dialog>
  );
}

/** Extra work found on a job: drafted as a variation, it waits for approval and holds the job's final account. */
export function NewVariationDialog({ onClose, project }: { onClose: () => void; project?: Project }) {
  const sites = useSites(takesVariations);
  const all = useData((s) => s.db.projects);
  const { seeValues } = useAccess();
  const formId = useId();
  const [site, setSite] = useState(project?.id ?? "");
  const [description, setDescription] = useState("");
  const [measured, setMeasured] = useState("");
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const p = all.find((x) => x.id === site);
  const problem = !site ? "Choose the site it is for." : !description.trim() ? "Say what was found." : !measured.trim() ? "Say what the extra work measures: how many, how long, how much." : "";
  const send = () => {
    setTried(true);
    if (problem) return;
    raiseExtra(site, { description: description.trim(), measured: measured.trim(), estimatedValue: Number(value.replace(/[^\d.]/g, "")) || 0 });
    toast(p?.status === "Live" ? "Variation drafted. It waits for approval on the Dashboard" : "Variation drafted for approval. The final account is on hold until it is agreed");
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="New variation"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Draft variation
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <SiteField sites={sites} value={site} onChange={setSite} fixed={project} />
        <Field label="What was found">{(id) => <textarea id={id} rows={3} className="field" value={description} placeholder="Lintel over the rear door is rotten through and needs replacing" onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Measured extra work">{(id) => <input id={id} className="field" value={measured} placeholder="1 no. oak lintel, 1.2 m long" onChange={(e) => setMeasured(e.target.value)} />}</Field>
        {seeValues && (
          <Field label="Estimated value, before VAT" hint="Leave blank if the office is to price it.">
            {(id) => <input id={id} className="field" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}
          </Field>
        )}
        <p role="alert" className="min-h-5 text-bad">
          {tried ? problem : ""}
        </p>
        <Next>It waits for approval on the Dashboard. Approving it adds its value to the contract. Until it is approved or discarded, the job's final account is on hold.</Next>
      </form>
    </Dialog>
  );
}

/** One snag for a job's list. While any snag on the job is open, its final account is on hold. */
export function AddSnagDialog({ onClose, project }: { onClose: () => void; project?: Project }) {
  const sites = useSites(takesSnags);
  const db = useData((s) => s.db);
  const formId = useId();
  const [site, setSite] = useState(project?.id ?? "");
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [from, setFrom] = useState<Snag["from"]>("client");
  const [fixBy, setFixBy] = useState("");
  const photo = useProofPick();
  const [tried, setTried] = useState(false);
  const p = db.projects.find((x) => x.id === site);
  // Who could put it right: the people on that site's list, then the subcontractors on it.
  const crew = p ? db.assignments.filter((a) => a.projectId === p.id).map((a) => db.people.find((x) => x.id === a.personId)?.name) : [];
  const worked = p ? [...new Set(db.attendance.filter((a) => a.projectId === p.id).map((a) => a.personId))].map((id) => db.people.find((x) => x.id === id && x.active)?.name) : [];
  const subs = p ? db.subcontractors.filter((s) => s.projectIds.includes(p.id)).map((s) => s.name) : [];
  const fixers = [...new Set([...crew, ...worked].filter((n): n is string => !!n))].sort();
  const problem = !site ? "Choose the site it is on." : !what.trim() ? "Say what is wrong." : "";
  const send = () => {
    setTried(true);
    if (problem) return;
    addSnag(site, { what, where, from, fixBy, ...(photo.proof ? { photo: photo.proof } : {}) });
    toast(p?.status === "Live" ? "Snag added. The final account will be on hold until it is fixed" : "Snag added. The final account is on hold until every snag is fixed");
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a snag"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form={formId}>
            Add snag
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <SiteField sites={sites} value={site} onChange={setSite} fixed={project} />
        <Field label="What is wrong">{(id) => <input id={id} className="field" value={what} placeholder="Sash sticking after painting" onChange={(e) => setWhat(e.target.value)} />}</Field>
        <Field label="Where on the job (optional)">{(id) => <input id={id} className="field" value={where} placeholder="First floor, back bedroom" onChange={(e) => setWhere(e.target.value)} />}</Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">Whose list it is from</p>
          <Segmented label="Whose list it is from" value={from} onChange={setFrom} options={[{ value: "client", label: "The client's" }, { value: "own", label: "Our own walk-round" }]} />
        </div>
        <Field label="Who is to fix it (optional)">
          {(id) => (
            <select id={id} className="field" value={fixBy} onChange={(e) => setFixBy(e.target.value)} disabled={!p}>
              <option value="">Not decided yet</option>
              {fixers.length > 0 && (
                <optgroup label="Our people on this job">
                  {fixers.map((n) => (
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
          {tried ? problem : ""}
        </p>
        <Next>It joins the job's snag list as open. The job's final account is on hold until every snag on it is marked fixed.</Next>
      </form>
    </Dialog>
  );
}
