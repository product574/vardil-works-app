/**
 * The two "add" buttons in the top bar of every screen (Oisin, 21 Nov): a to-do, for yourself or
 * for a colleague, and a file to be sorted under a project's name. Each is one small box, the
 * same wherever it is opened (the Dashboard's own Add opens the same to-do box), and each says
 * what happens next.
 */
import { CheckSquare, FilePlus, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { actorName, addLooseFile, addTodo } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Db, FileKind } from "@/data/types";
import { addDays } from "@/lib/dates";
import { dFull } from "@/lib/format";
import { PROOF_LIMIT_KB, shrinkImage } from "@/lib/image";
import { isFinished } from "@/lib/project-filter";
import { Button, cx, Dialog, Field, NextStep } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";
import { placeOf } from "./apps";
import { departmentFor } from "./departments";

/** The screen someone is on, in words, for the line a to-do keeps: a job by its code and name, anything else by its app and section. */
export function screenName(path: string, db: Pick<Db, "projects" | "clients" | "quotes">): string {
  const job = /^\/projects\/(C\d+)/i.exec(path);
  const p = job && db.projects.find((x) => x.code.toLowerCase() === job[1]!.toLowerCase());
  if (p) return `${p.code} ${p.name}`;
  const tender = /^\/sales\/quotes\/([^/?]+)/.exec(path);
  if (tender) return `Tender ${decodeURIComponent(tender[1]!)}`;
  const invoice = /^\/invoicing\/client\/([^/?]+)/.exec(path);
  if (invoice) return `Invoice ${decodeURIComponent(invoice[1]!)}`;
  const customer = /^\/customers\/([^/?]+)/.exec(path);
  const c = customer && db.clients.find((x) => x.id === customer[1]);
  if (c) return c.name;
  const place = placeOf(path);
  if (place) return place.app.label === place.section.label ? place.app.label : `${place.app.label}, ${place.section.label}`;
  return departmentFor(path).label;
}

/** The job a screen is about, if it is one job's page. */
const jobOf = (path: string, db: Pick<Db, "projects">) => {
  const m = /^\/projects\/(C\d+)/i.exec(path);
  return m ? db.projects.find((x) => x.code.toLowerCase() === m[1]!.toLowerCase()) : undefined;
};

/** The next working day, for a to-do's "by when" to start on. */
const nextWorkday = (day: string) => {
  let d = addDays(day, 1);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
};

export function QuickAddButtons({ className }: { className?: string }) {
  const access = useAccess();
  const [box, setBox] = useState<"pick" | "todo" | "file" | null>(null);
  const files = access.can("files");
  const btn = "press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 text-[0.93rem] font-medium text-ink hover:border-accent hover:text-accent-ink";
  return (
    <div className={cx("flex shrink-0 items-center gap-1.5", className)} role="group" aria-label="Add from any screen">
      {/* On a phone the bar has room for one button: it asks which, then opens the same box. */}
      <button type="button" className={cx(btn, "sm:hidden")} aria-label={files ? "Add a to-do or a file" : "Add a to-do"} onClick={() => setBox(files ? "pick" : "todo")}>
        <Plus size={18} weight="bold" />
      </button>
      <button type="button" className={cx(btn, "max-sm:hidden")} aria-label="Add a to-do" title="Add a to-do" onClick={() => setBox("todo")}>
        <CheckSquare size={18} /> <span className="hidden lg:inline">To-do</span>
      </button>
      {files && (
        <button type="button" className={cx(btn, "max-sm:hidden")} aria-label="Add a file to be sorted" title="Add a file to be sorted" onClick={() => setBox("file")}>
          <FilePlus size={18} /> <span className="hidden lg:inline">File</span>
        </button>
      )}
      {box === "pick" && (
        <Dialog open onClose={() => setBox(null)} title="Add">
          <div className="grid gap-2">
            <Button size="lg" onClick={() => setBox("todo")}>
              <CheckSquare size={18} /> A to-do
            </Button>
            <Button size="lg" onClick={() => setBox("file")}>
              <FilePlus size={18} /> A file to be sorted
            </Button>
          </div>
        </Dialog>
      )}
      {box === "todo" && <QuickTodoDialog onClose={() => setBox(null)} />}
      {box === "file" && <QuickFileDialog onClose={() => setBox(null)} />}
    </div>
  );
}

/**
 * "Add a to-do": what, by when, and whose list. It keeps the screen it was added from, so the
 * to-do opens that screen again. `plain` leaves the screen out (the Dashboard's own Add button:
 * there is nothing to go back to).
 */
export function QuickTodoDialog({ onClose, plain }: { onClose: () => void; plain?: boolean }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const { pathname, search } = useLocation();
  const me = actorName(db);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(nextWorkday(day));
  const [forName, setForName] = useState(me);
  const [link, setLink] = useState(!plain);
  const [error, setError] = useState("");
  const from = screenName(pathname, db);
  // Anyone with a sign-in to the office screens can be given one: they have a Dashboard to find it on.
  const colleagues = db.people.filter((p) => !!p.level && p.active && p.name !== me).sort((a, b) => a.name.localeCompare(b.name));
  const other = forName !== me;
  const save = () => {
    if (!title.trim()) return setError("Say what needs doing.");
    if (!due) return setError("Say by when.");
    addTodo({ title, due, forName, ...(link ? { to: pathname + search, from } : {}) });
    toast(other ? `Given to ${forName}. It is on their Dashboard, due ${dFull(due)}` : `On your to-do list, due ${dFull(due)}`);
    onClose();
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a to-do"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Add
          </Button>
        </>
      }
    >
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="What">{(id) => <input id={id} autoFocus className="field" value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }} placeholder="Ring Burren Lime about Thursday's delivery" />}</Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="By when">{(id) => <input id={id} type="date" className="field" value={due} min={day} onChange={(e) => setDue(e.target.value)} />}</Field>
          <Field label="For">
            {(id) => (
              <select id={id} className="field" value={forName} onChange={(e) => setForName(e.target.value)}>
                <option value={me}>Me ({me})</option>
                {colleagues.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}, {p.trade}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {!plain && (
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={link} onChange={(e) => setLink(e.target.checked)} />
            <span>
              Link it to this screen
              <span className="block text-[0.93rem] text-muted">From: {from}. The to-do opens it again.</span>
            </span>
          </label>
        )}
        <p role="alert" className="min-h-6 text-bad">
          {error}
        </p>
        <NextStep>{other ? `It goes on ${forName}'s list on their Dashboard, marked as from you. Your own Dashboard shows when they tick it off.` : "It goes on your list on the Dashboard, soonest first. Tick it off there when it is done."}</NextStep>
      </form>
    </Dialog>
  );
}

/**
 * "Add a file to be sorted": pick the project it is for, choose the file or photograph the
 * paper, and it waits in Projects, Files, To be sorted under that project's name until someone
 * puts it in its folder. On a job's own page the project is already picked.
 */
export function QuickFileDialog({ onClose }: { onClose: () => void }) {
  const db = useData((s) => s.db);
  const access = useAccess();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mine = access.scope(db.projects);
  const live = mine.filter((p) => !isFinished(p.status)).sort((a, b) => a.code.localeCompare(b.code));
  const archive = mine.filter((p) => isFinished(p.status)).sort((a, b) => b.code.localeCompare(a.code));
  const here = jobOf(pathname, { projects: mine });
  const [projectId, setProjectId] = useState(here?.id ?? "");
  const [file, setFile] = useState<{ name: string; kind: FileKind; sizeKb: number; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
  const project = mine.find((p) => p.id === projectId);
  const pick = (f: File) => {
    setError("");
    if (f.type.startsWith("image/"))
      return shrinkImage(f)
        .then((pic) => setFile({ name: f.name, kind: "image", ...pic }))
        .catch((e: Error) => setError(e.message));
    if (f.type !== "application/pdf") return setError("The demo keeps pictures and PDFs. Other kinds of file would upload to the server in the real system.");
    if (f.size / 1024 > PROOF_LIMIT_KB) return setError(`That PDF is over ${PROOF_LIMIT_KB / 1000} MB, too big for the demo to keep in the browser.`);
    const r = new FileReader();
    r.onload = () => setFile({ name: f.name, kind: "pdf", sizeKb: Math.round(f.size / 1024), dataUrl: String(r.result) });
    r.readAsDataURL(f);
  };
  const where = project ? `${project.code} ${project.name}` : "No project yet";
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a file to be sorted"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => {
              if (!file) return;
              addLooseFile(file, project?.id ?? null);
              toast(`${file.name} is in To be sorted, under ${where}`, { label: "Open To be sorted", run: () => navigate("/files/unsorted") });
              onClose();
            }}
          >
            Add file
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Project" hint="It is listed under this project's name until it is put in a folder.">
          {(id) => (
            <select id={id} className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project yet</option>
              <optgroup label="Live projects">
                {live.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.name}
                  </option>
                ))}
              </optgroup>
              {archive.length > 0 && (
                <optgroup label="Archive: finished jobs">
                  {archive.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} {p.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </Field>
        <div>
          <p className="mb-1 font-medium">The file</p>
          <PickFile accept="image/*,application/pdf" what="file" chosen={file ? `${file.name}, ${file.sizeKb} KB` : undefined} onFile={pick} />
          <p className="mt-1 text-[0.87rem] text-muted">A picture or a PDF. Photograph a docket or a drawing with the camera, or choose a file.</p>
        </div>
        <p role="alert" className="min-h-6 text-bad">
          {error}
        </p>
        <NextStep>It waits in Projects, Files, To be sorted, under {where}. Whoever sorts the files there picks its folder, and it then sits with the project's other files.</NextStep>
      </div>
    </Dialog>
  );
}
