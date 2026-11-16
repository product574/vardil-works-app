import { Camera, DownloadSimple, FilePdf, Paperclip } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { Proof } from "@/data/types";
import { isPdf, readProof } from "@/lib/image";
import { Button, cx, Dialog } from "./index";

/**
 * Two ways to bring a file in: the device camera, or a file already on the device.
 * On a phone or tablet "Take a photo" opens the camera; on a computer it opens the file chooser.
 */
export function PickFile({ accept = "image/*", onFile, chosen, what = "photo" }: { accept?: string; onFile: (f: File) => void; chosen?: string; what?: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const take = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = "";
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => camera.current?.click()}>
          <Camera size={16} /> Take a photo
        </Button>
        <Button onClick={() => file.current?.click()}>
          <Paperclip size={16} /> Choose a file
        </Button>
        {chosen && <span className="min-w-0 truncate text-[0.93rem] text-muted">{chosen}</span>}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-label={`Take a ${what} with the camera`} onChange={take} />
      <input ref={file} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-label={`Choose a ${what} from this device`} onChange={take} />
    </div>
  );
}

/** A saved card or certificate: opens to look at, with a download. */
export function ProofLink({ proof, title, className }: { proof: Proof; title: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={cx("press font-medium text-accent-ink underline-offset-2 hover:underline", className)} onClick={() => setOpen(true)}>
        View proof
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        wide
        footer={
          <a href={proof.dataUrl} download={proof.name} className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium hover:bg-accent-soft">
            <DownloadSimple size={16} /> Download
          </a>
        }
      >
        {isPdf(proof.dataUrl) ? (
          <p className="flex items-center gap-2">
            <FilePdf size={22} className="text-muted" /> {proof.name}
          </p>
        ) : (
          <img src={proof.dataUrl} alt={`Proof: ${title}`} className="mx-auto max-h-[55dvh] rounded-md border border-line" />
        )}
        <p className="mt-3 text-[0.93rem] text-muted">
          {proof.name}. Attached by {proof.addedBy} on {new Date(proof.addedAt).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric" })}.
        </p>
      </Dialog>
    </>
  );
}

/** Reads a chosen file into a proof, with the message to show if it cannot be used. */
export function useProofPick() {
  const [proof, setProof] = useState<{ name: string; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
  const pick = (f: File) => {
    setError("");
    readProof(f)
      .then(setProof)
      .catch((e: Error) => {
        setProof(null);
        setError(e.message);
      });
  };
  return { proof, error, pick };
}

export function ProofField({ pick, proof, error, hint = "A photo of the new card, or a PDF of the certificate. On a phone, Take a photo opens the camera." }: { pick: (f: File) => void; proof: { name: string } | null; error: string; hint?: string }) {
  return (
    <div>
      <p className="mb-1 text-[0.93rem] font-medium">Proof</p>
      <PickFile accept="image/*,application/pdf" what="proof" onFile={pick} chosen={proof?.name} />
      <p className="mt-1 text-[0.87rem] text-muted">{hint}</p>
      <p role="alert" className="text-bad">
        {error}
      </p>
    </div>
  );
}

