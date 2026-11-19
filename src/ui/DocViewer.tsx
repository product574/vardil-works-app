/**
 * A document or picture shown inside the page (from the Secure-All build, 18 Nov): the invoice
 * beside its form, a licence, a receipt, the photos on a damage report. A PDF opens in the browser's own viewer;
 * a picture can be zoomed and scrolled; with several files there are arrows to click between
 * them. Nothing is sent anywhere to show it.
 *
 * A file is `dataUrl` (just picked), a kept `proof` (kept in the browser), or `make` for the
 * sample data's documents, which are drawn when opened.
 */
import { ArrowSquareOut, CaretLeft, CaretRight, DownloadSimple, FileText, MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useState } from "react";
import { dataUrlToBlob, proofUrl } from "@/lib/files";
import type { Proof } from "@/data/types";
import { cx } from "./index";

/** `stamp` changes when a drawn sample document should be drawn again (its record was edited). */
export type ViewDoc = { name: string; dataUrl?: string; proof?: Proof; make?: () => string; stamp?: string };

type Shown = { kind: "pdf" | "image" | "other"; url: string; revoke?: boolean } | { kind: "missing" } | null;

const kindOf = (name: string, type: string): "pdf" | "image" | "other" => (type === "application/pdf" || /\.pdf$/i.test(name) ? "pdf" : type.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg)$/i.test(name) ? "image" : "other");

/** Some phone browsers have no PDF viewer of their own; they say so, and get a link instead of an empty frame. */
const canShowPdf = () => typeof navigator === "undefined" || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false;

async function resolve(doc: ViewDoc): Promise<Shown> {
  const data = doc.dataUrl ?? doc.make?.() ?? doc.proof?.dataUrl;
  if (data) {
    const type = data.slice(5, data.search(/[;,]/));
    const kind = kindOf(doc.name, type);
    if (kind === "image") return { kind, url: data };
    // A PDF is shown from a blob: address, typed as a PDF whatever it claims, so nothing in it can run as a page.
    const blob = dataUrlToBlob(data);
    return { kind, url: URL.createObjectURL(kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob), revoke: true };
  }
  if (!doc.proof) return { kind: "missing" };
  const url = await proofUrl(doc.proof);
  if (!url) return { kind: "missing" };
  const kind = kindOf(doc.name, "");
  if (kind === "image") return { kind, url };
  try {
    const blob = await (await fetch(url)).blob();
    return { kind, url: URL.createObjectURL(kind === "pdf" ? new Blob([blob], { type: "application/pdf" }) : blob), revoke: true };
  } catch {
    return { kind: "missing" };
  }
}

export function DocViewer({ docs, className, empty, start = 0, onShow }: { docs: ViewDoc[]; className?: string; /** Shown when there is no file. */ empty?: ReactNode; start?: number; onShow?: (index: number) => void }) {
  const [at, setAt] = useState(start);
  const [zoom, setZoom] = useState(1);
  const [shown, setShown] = useState<Shown>(null);
  const index = Math.min(at, Math.max(0, docs.length - 1));
  const doc = docs[index];
  // Whoever holds the list can say which file to show (a file just added goes straight on show).
  useEffect(() => setAt(start), [start]);
  useEffect(() => {
    if (docs.length > 0) setAt((a) => Math.min(a, docs.length - 1));
  }, [docs.length]);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    setShown(null);
    setZoom(1);
    if (!doc) return;
    void resolve(doc).then((s) => {
      if (s && "url" in s && s.revoke) made = s.url;
      if (live) setShown(s);
      else if (made) URL.revokeObjectURL(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
    // The file itself, not the object around it: a parent that redraws must not reload the preview.
  }, [doc?.name, doc?.dataUrl, doc?.proof, doc?.stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (i: number) => {
    setAt(i);
    onShow?.(i);
  };

  if (!doc) return <div className={cx("grid place-items-center rounded-lg border border-dashed border-line-strong bg-canvas p-6 text-center text-muted", className)}>{empty ?? "No file attached."}</div>;
  const url = shown && "url" in shown ? shown.url : null;
  const tool = "press grid size-8 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink disabled:text-faint disabled:hover:bg-transparent";
  return (
    <figure aria-label={`Preview of ${doc.name}`} className={cx("flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-canvas", className)}>
      <figcaption className="flex h-10 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 text-[0.93rem]">
        {docs.length > 1 && (
          <>
            <button type="button" aria-label="Previous file" className={tool} disabled={index === 0} onClick={() => go(index - 1)}>
              <CaretLeft size={18} />
            </button>
            <span className="whitespace-nowrap text-muted" aria-live="polite">
              {index + 1} of {docs.length}
            </span>
            <button type="button" aria-label="Next file" className={tool} disabled={index === docs.length - 1} onClick={() => go(index + 1)}>
              <CaretRight size={18} />
            </button>
          </>
        )}
        <span className="min-w-0 flex-1 truncate px-1 font-medium" title={doc.name}>
          {doc.name}
        </span>
        {shown && "url" in shown && shown.kind === "image" && (
          <>
            <button type="button" aria-label="Zoom out" className={tool} disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}>
              <MagnifyingGlassMinus size={18} />
            </button>
            <button type="button" aria-label="Zoom in" className={tool} disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))}>
              <MagnifyingGlassPlus size={18} />
            </button>
          </>
        )}
        {url && (
          <>
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open in a new tab" title="Open in a new tab" className={tool}>
              <ArrowSquareOut size={18} />
            </a>
            <a href={url} download={doc.name} aria-label="Download" title="Download" className={tool}>
              <DownloadSimple size={18} />
            </a>
          </>
        )}
      </figcaption>
      <div className="min-h-0 flex-1 overflow-auto">
        {!shown ? (
          <p className="p-6 text-center text-muted">Opening the file.</p>
        ) : shown.kind === "missing" ? (
          <p className="p-6 text-center text-muted">This file could not be opened just now. Try again in a moment.</p>
        ) : shown.kind === "pdf" && !canShowPdf() ? (
          <p className="p-6 text-center text-muted">
            This browser cannot show a PDF inside the page.{" "}
            <a href={shown.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent-ink underline">
              Open it in a new tab
            </a>
            .
          </p>
        ) : shown.kind === "pdf" ? (
          <iframe title={doc.name} src={`${shown.url}#navpanes=0&view=FitH`} className="block size-full min-h-[24rem] border-0 bg-white" />
        ) : shown.kind === "image" ? (
          <img src={shown.url} alt={doc.name} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="mx-auto block bg-white" />
        ) : (
          <p className="flex items-center justify-center gap-2 p-6 text-muted">
            <FileText size={22} /> This kind of file cannot be shown here. Use Download to open it.
          </p>
        )}
      </div>
    </figure>
  );
}
