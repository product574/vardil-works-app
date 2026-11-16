import { Blueprint, DownloadSimple, EnvelopeSimple, FileDoc, FilePdf, FileXls, FilmStrip, Folder, Image as ImageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addFile, fileIt } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { Db, FileCategory, FileItem, FileKind, PhotoStage } from "@/data/types";
import { type FilingContext, suggestFiling } from "@/lib/filing";
import { dFull, dShort, plural } from "@/lib/format";
import { isPdf, PROOF_LIMIT_KB, shrinkImage } from "@/lib/image";
import { Badge, Button, cx, Dialog, Empty, Field, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

const FOLDERS: FileCategory[] = ["Drawings", "Method statements", "Conservation reports", "Health and safety", "Correspondence", "Photos and videos", "Invoices", "Handover"];
const ICON: Record<FileKind, typeof FilePdf> = { pdf: FilePdf, image: ImageIcon, video: FilmStrip, doc: FileDoc, sheet: FileXls, email: EnvelopeSimple, drawing: Blueprint };
const size = (kb: number) => (kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${kb} KB`);

function FileName({ f, onOpen }: { f: FileItem; onOpen: (f: FileItem) => void }) {
  const Icon = ICON[f.kind];
  return (
    <span className="flex items-center gap-2">
      <Icon size={18} className="shrink-0 text-muted" />
      {f.dataUrl ? (
        <button type="button" className="press min-w-0 truncate text-left font-medium text-accent-ink underline decoration-line-strong underline-offset-2" onClick={() => onOpen(f)}>
          {f.name}
        </button>
      ) : (
        <span className="min-w-0 truncate font-medium">{f.name}</span>
      )}
    </span>
  );
}

/** Opens a file that was added during the demo (a picture or a PDF), with a download. */
function FileViewer({ f, onClose }: { f: FileItem | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!f}
      onClose={onClose}
      title={f?.name ?? ""}
      wide
      footer={
        f?.dataUrl && (
          <a href={f.dataUrl} download={f.name} className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium hover:bg-accent-soft">
            <DownloadSimple size={16} /> Download
          </a>
        )
      }
    >
      {f?.dataUrl && (isPdf(f.dataUrl) ? <p className="text-muted">A PDF of {size(f.sizeKb)}. Use Download to open it.</p> : <img src={f.dataUrl} alt={f.caption ?? f.name} className="mx-auto max-h-[58dvh] rounded-md border border-line" />)}
      {f && (
        <p className="mt-3 text-[0.93rem] text-muted">
          Added by {f.addedBy} on {dFull(f.modified)}.
        </p>
      )}
    </Dialog>
  );
}

/** Folders per project, like a shared drive: pick a project, then a folder. A search box looks across everything. */
export function ProjectFiles() {
  const db = useData((s) => s.db);
  const access = useAccess();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<FileItem | null>(null);
  const projects = access.scope(db.projects).filter((p) => db.files.some((f) => f.projectId === p.id)).sort((a, b) => b.code.localeCompare(a.code));
  const project = projects.find((p) => p.code === params.get("project")) ?? projects.find((p) => p.status === "Live") ?? projects[0];
  const folder = FOLDERS.find((f) => f === params.get("folder"));
  const mine = db.files.filter((f) => f.projectId === project?.id);
  const inFolder = mine.filter((f) => f.category === folder).sort((a, b) => b.modified.localeCompare(a.modified));
  const ids = new Set(projects.map((p) => p.id));
  const term = q.trim().toLowerCase();
  const found = term ? db.files.filter((f) => f.projectId && ids.has(f.projectId) && `${f.name} ${f.caption ?? ""}`.toLowerCase().includes(term)).slice(0, 60) : [];
  const code = (id: string | null) => db.projects.find((p) => p.id === id)?.code ?? "";
  const unsorted = db.files.filter((f) => f.projectId === null).length;

  const table = (rows: FileItem[], withPlace: boolean) => (
    <table className="tbl">
      <thead>
        <tr>
          <th>Name</th>
          {withPlace && <th>Where</th>}
          <th className="num">Size</th>
          <th>Changed</th>
          <th>Added by</th>
          <th>Came in by</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.id}>
            <td className="max-w-[26rem]">
              <FileName f={f} onOpen={setView} />
            </td>
            {withPlace && (
              <td className="whitespace-nowrap">
                <Link to={`/files?project=${code(f.projectId)}&folder=${encodeURIComponent(f.category)}`} className="text-accent-ink underline-offset-2 hover:underline" onClick={() => setQ("")}>
                  {code(f.projectId)} / {f.category}
                </Link>
              </td>
            )}
            <td className="num whitespace-nowrap">{size(f.sizeKb)}</td>
            <td className="whitespace-nowrap">{dFull(f.modified)}</td>
            <td>{f.addedBy}</td>
            <td className="text-muted">{f.source}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      <PageHead title="Project files" note={`${db.files.filter((f) => f.projectId && ids.has(f.projectId)).length} files across ${plural(projects.length, "project")}. Every project has the same folders, so anyone can find a drawing or a certificate without asking.`} actions={project && <Button onClick={() => setAdding(true)}>Add a file</Button>}>
        <input type="search" aria-label="Search all files" placeholder="Search every project by file name" className="field mt-3 max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      </PageHead>
      <PageBody className="grid max-w-6xl items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Panel>
          <ul className="max-h-56 divide-y divide-line overflow-y-auto lg:max-h-[calc(100dvh-19rem)]" aria-label="Projects">
            {projects.map((p) => (
              <li key={p.id}>
                <button type="button" aria-current={!term && p.id === project?.id} onClick={() => { setQ(""); setParams({ project: p.code }); }} className={cx("press flex w-full items-baseline gap-2 px-3 py-1.5 text-left", !term && p.id === project?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                  <span className="font-medium">{p.code}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="text-[0.87rem] text-muted">{db.files.filter((f) => f.projectId === p.id).length}</span>
                </button>
              </li>
            ))}
          </ul>
          <Link to="/files/unsorted" className="flex items-baseline gap-2 border-t border-line px-3 py-2 text-accent-ink hover:bg-accent-soft/60">
            <span className="flex-1 font-medium">To be sorted</span>
            <span className="text-[0.87rem]">{unsorted}</span>
          </Link>
        </Panel>

        <div className="grid min-w-0 gap-3">
          {term ? (
            <>
              <p className="text-muted">{found.length === 0 ? `Nothing is called anything like "${q.trim()}".` : `${plural(found.length, "file")} matching "${q.trim()}"${found.length === 60 ? " (first 60 shown)" : ""}.`}</p>
              {found.length > 0 && <Panel className="overflow-x-auto">{table(found, true)}</Panel>}
            </>
          ) : !project ? (
            <Panel>
              <Empty title="No project files yet" />
            </Panel>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-1.5 text-[1.05rem]">
                {folder ? (
                  <button type="button" className="press font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => setParams({ project: project.code })}>
                    {project.code} {project.name}
                  </button>
                ) : (
                  <span className="font-medium">
                    {project.code} {project.name}
                  </span>
                )}
                {folder && (
                  <>
                    <span className="text-muted">/</span>
                    <span className="font-medium">{folder}</span>
                    <span className="text-muted">({inFolder.length})</span>
                  </>
                )}
              </p>
              <Panel className="overflow-x-auto">
                {!folder ? (
                  <ul className="divide-y divide-line">
                    {FOLDERS.map((f) => {
                      const files = mine.filter((x) => x.category === f);
                      const latest = files.map((x) => x.modified).sort().pop();
                      return (
                        <li key={f}>
                          <button type="button" className="press flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent-soft/60" onClick={() => setParams({ project: project.code, folder: f })}>
                            <Folder size={20} className={files.length ? "text-accent-ink" : "text-faint"} />
                            <span className="flex-1 font-medium">{f}</span>
                            <span className="w-24 text-right text-muted">{plural(files.length, "file")}</span>
                            <span className="w-40 text-right text-[0.93rem] text-muted">{latest ? `Last changed ${dShort(latest)}` : "Empty"}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : inFolder.length === 0 ? (
                  <Empty title={`Nothing in ${folder} yet`}>Use Add a file, or file something here from To be sorted.</Empty>
                ) : (
                  table(inFolder, false)
                )}
              </Panel>
              <p className="text-[0.93rem] text-muted">The sample files are records with no document behind them. Files you add are real and open from their name.</p>
            </>
          )}
        </div>
      </PageBody>
      <FileViewer f={view} onClose={() => setView(null)} />
      {adding && project && <AddFileDialog projectId={project.id} projectCode={project.code} startFolder={folder ?? "Drawings"} onClose={() => setAdding(false)} />}
    </>
  );
}

function AddFileDialog({ projectId, projectCode, startFolder, onClose }: { projectId: string; projectCode: string; startFolder: FileCategory; onClose: () => void }) {
  const [folder, setFolder] = useState<FileCategory>(startFolder);
  const [file, setFile] = useState<{ name: string; kind: FileKind; sizeKb: number; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
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
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add a file to ${projectCode}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => {
              if (!file) return;
              addFile(projectId, folder, file);
              toast(`${file.name} added to ${projectCode} ${folder}`);
              onClose();
            }}
          >
            Add file
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Folder">
          {(id) => (
            <select id={id} className="field" value={folder} onChange={(e) => setFolder(e.target.value as FileCategory)}>
              {FOLDERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          )}
        </Field>
        <div>
          <p className="mb-1 text-[0.93rem] font-medium">File</p>
          <PickFile accept="image/*,application/pdf" what="file" onFile={pick} chosen={file?.name} />
          <p className="mt-1 text-[0.87rem] text-muted">A picture or a PDF. On a phone, Take a photo opens the camera.</p>
          <p role="alert" className="text-bad">
            {error}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/** Every photo and video on every project, newest first. */
export function AllPhotos() {
  const db = useData((s) => s.db);
  const access = useAccess();
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"All" | PhotoStage>("All");
  const [view, setView] = useState<FileItem | null>(null);
  const projects = access.scope(db.projects);
  const ids = new Set(projects.filter((p) => !code || p.code === code).map((p) => p.id));
  const all = db.files.filter((f) => f.projectId && ids.has(f.projectId) && f.category === "Photos and videos").sort((a, b) => b.modified.localeCompare(a.modified));
  const shown = all.filter((f) => stage === "All" || f.stage === stage);
  const n = (s: PhotoStage) => all.filter((f) => f.stage === s).length;
  const withPhotos = projects.filter((p) => db.files.some((f) => f.projectId === p.id && f.category === "Photos and videos")).sort((a, b) => b.code.localeCompare(a.code));
  return (
    <>
      <PageHead title="Photos and videos" note={`${all.length} from site${code ? ` on ${code}` : " across every project"}. Photos sent from the site phone land here on their own, dated and tagged before, during or after.`}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select aria-label="Project" className="field w-auto" value={code} onChange={(e) => setCode(e.target.value)}>
            <option value="">Every project</option>
            {withPhotos.map((p) => (
              <option key={p.id} value={p.code}>
                {p.code} {p.name}
              </option>
            ))}
          </select>
          <Segmented label="Photo stage" value={stage} onChange={setStage} options={[{ value: "All", label: "All", count: all.length }, { value: "Before", label: "Before", count: n("Before") }, { value: "During", label: "During", count: n("During") }, { value: "After", label: "After", count: n("After") }]} />
        </div>
      </PageHead>
      <PageBody>
        {shown.length === 0 ? (
          <Panel>
            <Empty title="No photos match" />
          </Panel>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {shown.slice(0, 90).map((f) => (
              <li key={f.id} className="overflow-hidden rounded-md border border-line bg-surface">
                {f.dataUrl ? (
                  <button type="button" className="press block aspect-[4/3] w-full" aria-label={`Open photo: ${f.caption}`} onClick={() => setView(f)}>
                    <img src={f.dataUrl} alt={f.caption ?? ""} className="size-full object-cover" />
                  </button>
                ) : (
                  <div className="grid aspect-[4/3] place-items-center text-accent-ink" style={{ background: `color-mix(in srgb, var(--accent) ${14 + f.tone * 7}%, var(--side))` }}>
                    {f.kind === "video" ? <FilmStrip size={26} /> : <ImageIcon size={26} />}
                  </div>
                )}
                <div className="px-2.5 py-2">
                  <p className="line-clamp-2 text-[0.93rem] font-medium">{f.caption ?? f.name}</p>
                  <p className="mt-0.5 flex items-center gap-2 text-[0.87rem] text-muted">
                    <Link to={`/projects/${db.projects.find((p) => p.id === f.projectId)?.code}?tab=photos`} className="text-accent-ink underline-offset-2 hover:underline">
                      {db.projects.find((p) => p.id === f.projectId)?.code}
                    </Link>
                    {dShort(f.modified)}
                    {f.stage && <Badge className="ml-auto">{f.stage}</Badge>}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 90 && <p className="mt-3 text-[0.93rem] text-muted">Showing the newest 90 of {shown.length}. Pick a project to see the rest.</p>}
      </PageBody>
      <FileViewer f={view} onClose={() => setView(null)} />
    </>
  );
}

const filingContext = (db: Db): FilingContext => {
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const byCode = new Map(db.projects.map((p) => [p.code, p.id]));
  return {
    projects: db.projects,
    rosters: db.assignments.filter((a) => live.has(a.projectId)).map((a) => ({ personName: db.people.find((p) => p.id === a.personId)?.name ?? "", projectId: a.projectId })),
    suppliers: [
      ...db.supplierInvoices.filter((s) => s.jobRef && byCode.has(s.jobRef)).map((s) => ({ name: s.supplier, projectId: byCode.get(s.jobRef!)! })),
      ...db.hiredPlant.filter((h) => h.status !== "Collected").map((h) => ({ name: h.hireCompany, projectId: h.projectId })),
    ].filter((s) => live.has(s.projectId)),
  };
};

/** Things emailed in that nobody has filed. Each comes with a suggested project and folder, and the reason. */
export function ToBeSorted() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const ctx = filingContext(db);
  // Someone who sees only their own projects files only into those: a suggestion for another
  // project is shown as needing a project, with the reason.
  const mine = new Set(access.scope(db.projects).map((p) => p.id));
  const rows = db.files
    .filter((f) => f.projectId === null)
    .map((f) => {
      const s = suggestFiling(f, ctx);
      return { f, s: s.projectId && !mine.has(s.projectId) ? { ...s, projectId: null, why: `${s.why}, which is not one of your projects` } : s };
    });
  const [picked, setPicked] = useState<Record<string, { projectId?: string; category?: FileCategory }>>({});
  const live = db.projects.filter((p) => mine.has(p.id) && (p.status === "Live" || p.status === "Not started")).sort((a, b) => a.code.localeCompare(b.code));
  const choice = (id: string, s: { projectId: string | null; category: string }) => ({ projectId: picked[id]?.projectId ?? s.projectId ?? "", category: picked[id]?.category ?? (s.category as FileCategory) });
  const ready = rows.filter(({ f, s }) => choice(f.id, s).projectId);
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  return (
    <>
      <PageHead
        title="To be sorted"
        note={rows.length === 0 ? "Nothing is waiting. Whatever arrives by email without a home lands here." : `${plural(rows.length, "file")} arrived without a home. Each has been read and given a suggested project and folder; change either before filing.`}
        actions={
          ready.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                for (const { f, s } of ready) fileIt(f.id, choice(f.id, s).projectId, choice(f.id, s).category);
                toast(`${plural(ready.length, "file")} filed`);
              }}
            >
              File the {ready.length} with a project
            </Button>
          )
        }
      />
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title="All filed">New arrivals without a project will appear here with a suggestion.</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>File</th>
                  <th>From</th>
                  <th>Suggested, and why</th>
                  <th className="w-52">Project</th>
                  <th className="w-48">Folder</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ f, s }) => {
                  const c = choice(f.id, s);
                  return (
                    <tr key={f.id}>
                      <td className="max-w-[18rem]">
                        <FileName f={f} onOpen={() => undefined} />
                        <span className="block pl-[26px] text-[0.87rem] text-muted">
                          {size(f.sizeKb)}, {f.modified === day ? "today" : dShort(f.modified)}
                        </span>
                      </td>
                      <td>{f.addedBy}</td>
                      <td>
                        {s.projectId ? <Badge tone="accent">{code(s.projectId)} / {s.category}</Badge> : <Badge tone="warn">Needs a project</Badge>}
                        <span className="mt-0.5 block text-[0.87rem] text-muted">{s.why}</span>
                      </td>
                      <td>
                        <select aria-label={`Project for ${f.name}`} className="field h-8" value={c.projectId} onChange={(e) => setPicked((p) => ({ ...p, [f.id]: { ...p[f.id], projectId: e.target.value } }))}>
                          <option value="">Choose a project</option>
                          {live.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select aria-label={`Folder for ${f.name}`} className="field h-8" value={c.category} onChange={(e) => setPicked((p) => ({ ...p, [f.id]: { ...p[f.id], category: e.target.value as FileCategory } }))}>
                          {FOLDERS.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          disabled={!c.projectId}
                          onClick={() => {
                            fileIt(f.id, c.projectId, c.category);
                            toast(`${f.name} filed under ${code(c.projectId)} ${c.category}`);
                          }}
                        >
                          File it
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
