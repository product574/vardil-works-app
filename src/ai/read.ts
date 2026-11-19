/**
 * Reading an uploaded document with the AI model: the page's side (18 Nov, brought across from
 * the Secure-All build at Oisin's word). The file goes to /api/read on the hosted demo, behind
 * Cloudflare Access like Ask AI; what comes back fills the form for a person to check. Nothing is
 * saved by the model.
 *
 * Who may: anyone with "Manage plant and fleet" (Oisin's pick). That is checked here, on the
 * page, as Ask AI's managing-director rule is; the server checks the Cloudflare Access sign-in
 * (a real build checks the person there too, see "REAL BUILD" in functions/api/read.ts). On a copy with no server (the preview, a local build) the form is typed in, and the
 * file's name is still read for a registration and a kind (`readFleetFile` in src/lib/fleet.ts).
 */
import { authMode } from "@/app/auth";
import { logAiRead } from "@/data/actions";
import type { Db } from "@/data/types";
import { driversOf } from "@/lib/fleet";
import { READ_LIMITS, READABLE_TYPES, type ReadableType, type Reading, type ReadKind } from "./reading";

export type ReadOff = "local" | "access";

/** Why the AI cannot read documents here, or null when it can. `canManage` is the person's "Manage plant and fleet". */
export function readOff(canManage = true): ReadOff | null {
  if (typeof window === "undefined" || window.location.protocol === "file:" || authMode !== "access") return "local";
  if (!canManage) return "access";
  return null;
}

export const READ_OFF_WORDS: Record<ReadOff, string> = {
  local: "AI reading works on the hosted demo. On this copy, type the details in from the document.",
  access: "AI reading is for people who manage plant and fleet. Type the details in from the document.",
};

/** What the model is told is on the fleet, so it can match a registration, a garage or a name. */
export function readContext(db: Db): string {
  const lines = [
    `Vehicles: ${db.vehicles.map((v) => `${v.reg} ${v.make} ${v.model}`).join("; ")}`,
    `Garages: ${db.garages.map((g) => [g.name, g.town, g.county].filter(Boolean).join(", ")).join("; ")}`,
    `Drivers: ${driversOf(db.people, db.vehicles).filter((d) => d.active).map((d) => d.name).join("; ")}`,
  ];
  return lines.join("\n").slice(0, READ_LIMITS.context);
}

export type ReadResult = { ok: true; reading: Reading } | { ok: false; message: string; off?: boolean };

const mediaType = (dataUrl: string) => dataUrl.slice(5, dataUrl.indexOf(";"));
export const isReadable = (dataUrl: string) => (READABLE_TYPES as readonly string[]).includes(mediaType(dataUrl));

export async function readDocument(kind: ReadKind, file: { name: string; dataUrl: string }, db: Db, canManage = true): Promise<ReadResult> {
  const off = readOff(canManage);
  if (off) return { ok: false, message: READ_OFF_WORDS[off], off: true };
  const type = mediaType(file.dataUrl);
  if (!isReadable(file.dataUrl)) return { ok: false, message: "The AI reads PDFs and photos. This file is kept, so type the details in from it." };
  const data = file.dataUrl.slice(file.dataUrl.indexOf(",") + 1);
  if (data.length > READ_LIMITS.data) return { ok: false, message: "This file is too big for the AI to read. It is kept, so type the details in from it." };
  let res: Response;
  try {
    res = await fetch("/api/read", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, mediaType: type as ReadableType, data, context: readContext(db) }),
    });
  } catch {
    return { ok: false, message: "The AI could not be reached just now. Type the details in, or try Read again." };
  }
  if (!res.ok) {
    let error = "";
    try {
      error = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      /* not JSON */
    }
    if (res.status === 401) return { ok: false, message: "Your sign-in has run out. Reload the page to have documents read." };
    if (res.status === 403) return { ok: false, message: READ_OFF_WORDS.access, off: true };
    if (res.status === 404 || res.status === 405) return { ok: false, message: READ_OFF_WORDS.local, off: true };
    if (res.status === 413) return { ok: false, message: "This file is too big for the AI to read. It is kept, so type the details in from it." };
    if (res.status === 422) return { ok: false, message: "The AI could not make this document out. Type the details in from it." };
    if (res.status === 503 && error === "not_configured") return { ok: false, message: "AI reading is not switched on for this site yet. Type the details in.", off: true };
    return { ok: false, message: "The AI is busy just now. Type the details in, or try Read again in a minute." };
  }
  try {
    const body = (await res.json()) as { reading?: Reading };
    if (!body.reading) return { ok: false, message: "The AI could not make this document out. Type the details in from it." };
    logAiRead(body.reading.kind === "invoice" ? "A garage invoice" : "A document", file.name);
    return { ok: true, reading: body.reading };
  } catch {
    return { ok: false, message: "The AI could not make this document out. Type the details in from it." };
  }
}
