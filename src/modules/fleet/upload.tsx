/**
 * What every upload form shares (from the Secure-All build, 18 Nov): the document on the left of a
 * wide window, the form on the right, and the AI model reading the document to fill the form in
 * for a person to check. Several files can be added (page two of an invoice, the back of a
 * licence) and clicked between. The model only fills boxes: nothing is saved until the person
 * presses the button. Where the AI cannot read (no server, or no "Manage plant and fleet"), the
 * file's name is still read for a registration and a kind, as ABC's Fleet did before (Oisin kept it).
 */
import { ArrowsClockwise, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { type DragEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { isReadable, READ_OFF_WORDS, readDocument, readOff } from "@/ai/read";
import type { Reading, ReadKind } from "@/ai/reading";
import type { FileIn } from "@/data/actions";
import { useAccess } from "@/data/access";
import { getDb } from "@/data/store";
import type { Db, Proof } from "@/data/types";
import { readFleetFile } from "@/lib/fleet";
import { readUpload } from "@/lib/image";
import { Button, cx } from "@/ui";
import { AiSparkle } from "@/ui/AiSparkle";
import { DocViewer, type ViewDoc } from "@/ui/DocViewer";
import { useFileLimitKb } from "./shared";

export type Picked = { name: string; dataUrl: string };
/** One file in an upload: just picked (`dataUrl`), or already kept with the record (`kept`). */
export type UpFile = { key: string; doc: ViewDoc; picked?: Picked; kept?: Proof };
export type ReadStatus = { state: "idle" | "reading" | "read" | "failed" | "off"; message?: string; notes?: string };

/**
 * What a file's name says, as a reading the forms can take: the registration of a vehicle on the
 * fleet, and whether it is an invoice, motor tax, a test or insurance (`readFleetFile`). Null when
 * the name says nothing useful, and for "any" (Upload a document) unless the kind is known.
 */
export function readingFromName(kind: ReadKind, name: string, db: Pick<Db, "vehicles">): { reading: Reading; said: string } | null {
  const got = readFleetFile(name, db.vehicles);
  const reg = got.vehicle?.reg ?? "";
  if (kind === "any" && !got.category) return null;
  if (!reg && !got.category) return null;
  const what = got.category === "repairs" ? "a garage invoice" : got.category === "tax" ? "motor tax" : got.category === "test" ? "a test" : got.category === "insurance" ? "insurance" : "";
  const said = `From the file's name: ${[reg, what].filter(Boolean).join(", ")}. Check it against the document.`;
  if (kind === "invoice" || (kind === "any" && got.category === "repairs"))
    return { said, reading: { kind: "invoice", garageName: "", garageTown: "", garageCounty: "", invoiceNo: "", date: "", vat: 0, total: 0, lines: reg ? [{ reg, amount: 0, description: "", mileage: 0, category: "Other" }] : [], notes: "" } };
  const docType = got.category && got.category !== "repairs" ? got.category : "other";
  return { said, reading: { kind: "renewal", docType, reg, name: "", expiryDate: "", paidDate: "", amount: 0, notes: "" } };
}

let fileSeq = 0;
const fromPicked = (p: Picked): UpFile => ({ key: `f${++fileSeq}`, doc: { name: p.name, dataUrl: p.dataUrl }, picked: p });

export function useUpload(opts: {
  kind: ReadKind;
  /** Files picked before this form opened (the Dashboard's "Upload a document"). */
  initial?: Picked[];
  /** What was already read from them, so they are not read twice. */
  initialReading?: Reading | null;
  /** Files already kept with the record being corrected, as the viewer shows them. */
  kept?: { doc: ViewDoc; proof: Proof }[];
  onRead: (r: Reading) => void;
}) {
  const limit = useFileLimitKb();
  const canManage = useAccess().may("managePlant");
  const [files, setFiles] = useState<UpFile[]>(() => [...(opts.kept ?? []).map((k, i) => ({ key: `k${i}`, doc: k.doc, kept: k.proof })), ...(opts.initial ?? []).map(fromPicked)]);
  const [error, setError] = useState("");
  const off = readOff(canManage);
  const [status, setStatus] = useState<ReadStatus>(off ? { state: "off", message: READ_OFF_WORDS[off] } : { state: "idle" });
  const onRead = useRef(opts.onRead);
  onRead.current = opts.onRead;
  const busy = useRef(false);

  const read = async (f: Picked | undefined) => {
    if (!f || busy.current) return;
    const offNow = readOff(canManage);
    if (offNow) {
      const guess = readingFromName(opts.kind, f.name, getDb());
      if (guess) {
        onRead.current(guess.reading);
        setStatus({ state: "off", message: `${guess.said} ${READ_OFF_WORDS[offNow]}` });
      }
      return;
    }
    if (!isReadable(f.dataUrl)) return setStatus({ state: "failed", message: "The AI reads PDFs and photos. This file is kept, so type the details in from it." });
    busy.current = true;
    setStatus({ state: "reading" });
    const res = await readDocument(opts.kind, f, getDb(), canManage);
    busy.current = false;
    if (!res.ok) return setStatus({ state: res.off ? "off" : "failed", message: res.message });
    onRead.current(res.reading);
    setStatus({ state: "read", notes: res.reading.notes || undefined });
  };

  // A reading handed in with the files fills the form once; files handed in with none are read now.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (opts.initialReading) {
      onRead.current(opts.initialReading);
      setStatus({ state: "read", notes: opts.initialReading.notes || undefined });
    } else if (opts.initial?.length) void read(opts.initial[0]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (list: FileList | File[] | null | undefined) => {
    const picked = [...(list ?? [])].slice(0, 6);
    if (!picked.length) return;
    setError("");
    const hadNew = files.some((f) => f.picked);
    const ready: Picked[] = [];
    for (const f of picked) {
      try {
        ready.push(await readUpload(f, limit));
      } catch (e) {
        setError((e as Error).message);
      }
    }
    if (!ready.length) return;
    setFiles((fs) => [...fs, ...ready.map(fromPicked)].slice(0, 8));
    // The first file added is read straight away; later pages are read with "Read again" if wanted.
    if (!hadNew) void read(ready[0]);
  };
  const remove = (key: string) => setFiles((fs) => fs.filter((f) => f.key !== key));

  return {
    files,
    add,
    remove,
    error,
    status,
    /** Read the given file again (or the first one picked). */
    readAgain: (key?: string) => void read((files.find((f) => f.key === key) ?? files.find((f) => f.picked))?.picked),
    /** The files to keep with the record: the kept ones still there, then the new ones. */
    fileIns: (): FileIn[] => files.map((f) => f.kept ?? f.picked!),
    /** True when a file was added or taken off since the form opened. */
    changed: files.some((f) => f.picked) || files.filter((f) => f.kept).length !== (opts.kept?.length ?? 0),
  };
}
export type Upload = ReturnType<typeof useUpload>;

const ACCEPT = "application/pdf,image/*,.doc,.docx,.xls,.xlsx";

/** The left half: the document, with buttons to add another file or take the one on show off. */
export function UploadPane({ up, what = "file" }: { up: Upload; what?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [shown, setShown] = useState(0);
  const limit = useFileLimitKb();
  const current = up.files[Math.min(shown, up.files.length - 1)];
  useEffect(() => setShown((s) => Math.min(s, Math.max(0, up.files.length - 1))), [up.files.length]);
  // A new file goes on show.
  const count = useRef(up.files.length);
  useEffect(() => {
    if (up.files.length > count.current) setShown(up.files.length - 1);
    count.current = up.files.length;
  }, [up.files.length]);
  const drop = { onDragOver: (e: DragEvent) => { e.preventDefault(); setDragging(true); }, onDragLeave: () => setDragging(false), onDrop: (e: DragEvent) => { e.preventDefault(); setDragging(false); void up.add(e.dataTransfer.files); } };
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" {...drop}>
      <input ref={input} type="file" multiple className="sr-only" tabIndex={-1} aria-label={`Choose the ${what}`} accept={ACCEPT} onChange={(e) => { void up.add(e.target.files); e.target.value = ""; }} />
      {up.files.length === 0 ? (
        <div className={cx("grid min-h-[14rem] flex-1 place-items-center rounded-lg border-2 border-dashed px-4 py-6 text-center", dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-canvas")}>
          <div>
            <Button variant="primary" onClick={() => input.current?.click()}>
              <UploadSimple size={18} /> Choose the {what}
            </Button>
            <p className="mt-2 text-[0.93rem] text-muted">or drop it here. PDF, JPG, PNG, Word or Excel, up to {limit >= 10_000 ? "10 MB" : "1.2 MB in the demo"}.</p>
            <p className="mt-1 text-[0.93rem] text-muted">It shows here beside the form so each box can be checked against it.</p>
          </div>
        </div>
      ) : (
        <>
          <DocViewer docs={up.files.map((f) => f.doc)} start={Math.min(shown, up.files.length - 1)} onShow={setShown} className={cx("min-h-[18rem] flex-1 max-lg:h-[22rem] max-lg:flex-none", dragging && "ring-2 ring-accent")} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => input.current?.click()}>
              <Plus size={16} /> Add another page or file
            </Button>
            {current && (
              <Button size="sm" variant="ghost" onClick={() => up.remove(current.key)}>
                <Trash size={16} /> Take this file off
              </Button>
            )}
            {current?.picked && up.status.state !== "off" && up.status.state !== "reading" && (
              <Button size="sm" variant="ghost" onClick={() => up.readAgain(current.key)}>
                <ArrowsClockwise size={16} /> Read this file again
              </Button>
            )}
          </div>
        </>
      )}
      {up.error && <p role="alert" className="text-bad">{up.error}</p>}
    </div>
  );
}

/** The line above the form saying where its contents came from. */
export function ReadBanner({ up }: { up: Upload }) {
  const s = up.status;
  if (s.state === "reading")
    return (
      <p role="status" className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 font-medium text-accent-ink">
        <AiSparkle size={18} className="shrink-0" /> Reading the document. The boxes fill in a moment.
      </p>
    );
  if (s.state === "read")
    return (
      <div role="status" className="rounded-md bg-accent-soft px-3 py-2 text-accent-ink">
        <p className="flex items-center gap-2 font-medium">
          <AiSparkle size={18} className="shrink-0" /> Read by AI. Check each box against the document before saving.
        </p>
        {s.notes && <p className="mt-1 text-[0.93rem]">The AI adds: {s.notes}</p>}
      </div>
    );
  if (s.state === "failed") return <p role="status" className="rounded-md bg-warn-soft px-3 py-2 text-warn">{s.message}</p>;
  if (s.state === "off") return <p className="rounded-md bg-canvas px-3 py-2 text-[0.93rem] text-muted">{s.message}</p>;
  return up.files.some((f) => f.picked) ? null : <p className="rounded-md bg-canvas px-3 py-2 text-[0.93rem] text-muted">Add the file first: the AI reads it and fills these boxes in for you to check.</p>;
}

/** The two halves of a wide upload window: the document on the left, the form on the right. */
export function Split({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="min-h-0 border-line p-3 max-lg:border-b lg:border-r">{left}</div>
      <div className="min-h-0 p-4 lg:overflow-y-auto">{right}</div>
    </div>
  );
}

/** A warning the person can save past: the document does not look like it belongs here. */
export function Mismatch({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] bg-bad-soft px-3 py-2 text-bad">
      {lines.map((l) => (
        <p key={l} className="font-medium">{l}</p>
      ))}
      <p className="mt-1 text-[0.93rem]">Check the right document is in the right place. It can still be saved with "Save anyway", and the Activity log will say so.</p>
    </div>
  );
}
