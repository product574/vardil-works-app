import { Blueprint, DownloadSimple, EnvelopeSimple, FileDoc, FilePdf, FileXls, FilmStrip, Folder, Image as ImageIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { addFile } from "@/data/actions";
import type { Db, FileCategory, FileItem, FileKind, Project } from "@/data/types";
import { dFull, dShort, plural } from "@/lib/format";
import { isPdf, PROOF_LIMIT_KB, shrinkImage } from "@/lib/image";
import { Button, Dialog, Empty, Field, Panel } from "@/ui";
import { PickFile } from "@/ui/files";
import { toast } from "@/ui/toast";

/**
 * A project's files, on its own page (16 Nov: the separate Files section was taken out). Every
 * project has the same folders, like a shared drive, so anyone can find a drawing or a
 * certificate without asking.
 */
const FOLDERS: FileCategory[] = ["Drawings", "Method statements", "Conservation reports", "Health and safety", "Correspondence", "Photos and videos", "Invoices", "Handover", "Programme"];
const ICON: Record<FileKind, typeof FilePdf> = { pdf: FilePdf, image: ImageIcon, video: FilmStrip, doc: FileDoc, sheet: FileXls, email: EnvelopeSimple, drawing: Blueprint };
const size = (kb: number) => (kb >= 1000 ? `${(kb / 1000).toFixed(1)} MB` : `${kb} KB`);

export function FilesTab({ p, db }: { p: Project; db: Db }) {
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [view, setView] = useState<FileItem | null>(null);
  const folder = FOLDERS.find((f) => f === params.get("folder"));
  const mine = db.files.filter((f) => f.projectId === p.id);
  const inFolder = mine.filter((f) => f.category === folder).sort((a, b) => b.modified.localeCompare(a.modified));
  const go = (f?: FileCategory) => setParams(f ? { tab: "files", folder: f } : { tab: "files" }, { replace: true });

  return (
    <div className="grid max-w-5xl gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex flex-wrap items-center gap-1.5 text-[1.05rem]">
          {folder ? (
            <button type="button" className="press font-medium text-accent-ink underline-offset-2 hover:underline" onClick={() => go()}>
              All folders
            </button>
          ) : (
            <span className="font-medium">{plural(mine.length, "file")} in {plural(FOLDERS.filter((f) => mine.some((x) => x.category === f)).length, "folder")}</span>
          )}
          {folder && (
            <>
              <span className="text-muted">/</span>
              <span className="font-medium">{folder}</span>
              <span className="text-muted">({inFolder.length})</span>
            </>
          )}
        </p>
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          Add a file
        </Button>
      </div>
      <Panel className="overflow-x-auto">
        {!folder ? (
          <ul className="divide-y divide-line">
            {FOLDERS.map((f) => {
              const files = mine.filter((x) => x.category === f);
              const latest = files.map((x) => x.modified).sort().pop();
              return (
                <li key={f}>
                  <button type="button" className="press flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent-soft/60" onClick={() => go(f)}>
                    <Folder size={20} className={files.length ? "text-accent-ink" : "text-faint"} />
                    <span className="flex-1 font-medium">{f}</span>
                    <span className="w-24 text-right text-muted">{plural(files.length, "file")}</span>
                    <span className="w-40 text-right text-[0.93rem] text-muted max-sm:hidden">{latest ? `Last changed ${dShort(latest)}` : "Empty"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : inFolder.length === 0 ? (
          <Empty title={`Nothing in ${folder} yet`}>Use Add a file to put something here.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Size</th>
                <th>Changed</th>
                <th>Added by</th>
                <th>Came in by</th>
              </tr>
            </thead>
            <tbody>
              {inFolder.map((f) => (
                <tr key={f.id}>
                  <td className="max-w-[26rem]">
                    <FileName f={f} onOpen={setView} />
                  </td>
                  <td className="num whitespace-nowrap">{size(f.sizeKb)}</td>
                  <td className="whitespace-nowrap">{dFull(f.modified)}</td>
                  <td>{f.addedBy}</td>
                  <td className="text-muted">{f.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-[0.93rem] text-muted">The sample files are records with no document behind them. Files you add are real and open from their name.</p>
      <FileViewer f={view} onClose={() => setView(null)} />
      {adding && <AddFileDialog projectId={p.id} projectCode={p.code} startFolder={folder ?? "Drawings"} onClose={() => setAdding(false)} />}
    </div>
  );
}

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
