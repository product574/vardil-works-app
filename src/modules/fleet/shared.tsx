/** Pieces the Fleet screens share: names from ids, the drivers, money, the region's words, a file link. */
import { FileText, UploadSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useAccess } from "@/data/access";
import { useData, usePrefs } from "@/data/store";
import type { Driver, ID, Vehicle } from "@/data/types";
import { driversOf } from "@/lib/fleet";
import { testName } from "@/lib/fleet-spend";
import { readUpload } from "@/lib/image";
import { money0, money2, REGION } from "@/lib/money";
import { Button, cx, Dialog } from "@/ui";
import { DocViewer, type ViewDoc } from "@/ui/DocViewer";

export function useNames() {
  const db = useData((s) => s.db);
  return {
    db,
    base: (id: ID | null | undefined) => (id ? (db.bases.find((b) => b.id === id)?.name ?? "Unknown base") : "No base"),
    garage: (id: ID | null | undefined) => (id ? (db.garages.find((g) => g.id === id)?.name ?? "Unknown garage") : "No garage"),
    driver: (id: ID | null | undefined) => (id ? (db.people.find((d) => d.id === id)?.name ?? "Unknown driver") : "No driver"),
    /** A site by its project id: "C721 The Old Corn Mill". */
    site: (id: ID | null | undefined) => {
      const p = id ? db.projects.find((x) => x.id === id) : undefined;
      return p ? `${p.code} ${p.name}` : "No site";
    },
    siteCode: (id: ID | null | undefined) => (id ? (db.projects.find((x) => x.id === id)?.code ?? "") : ""),
    reg: (id: ID | null | undefined) => (id ? (db.vehicles.find((v) => v.id === id)?.reg ?? "Unknown vehicle") : "No vehicle"),
    vehicle: (id: ID | null | undefined) => db.vehicles.find((v) => v.id === id),
  };
}

/**
 * What the signed-in person may do in Fleet (18 Nov): "Manage plant and fleet" adds and changes
 * records; checking a garage invoice is also open to whoever has "Handle invoices" (Oisin's pick).
 * Everyone else with Fleet switched on can look.
 */
export function useFleetCan() {
  const access = useAccess();
  const manage = access.may("managePlant");
  return { manage, check: manage || access.may("manageInvoices") };
}

/** Fleet's drivers: people on the driver list, with their licences (`driversOf` in src/lib/fleet.ts). */
export function useDrivers(): Driver[] {
  const people = useData((s) => s.db.people);
  const vehicles = useData((s) => s.db.vehicles);
  return useMemo(() => driversOf(people, vehicles), [people, vehicles]);
}

/** The region's words: the test a vehicle takes (CVRT, NCT or MOT) and what road tax is called. */
export function useRegionWords() {
  const region = usePrefs((s) => s.brand.region);
  return { region, test: (kind: Vehicle["kind"]) => testName(kind, region), tax: REGION[region].roadTax, testWord: region === "UK" ? "MOT" : "CVRT or NCT" };
}

export function useMoney() {
  const region = usePrefs((s) => s.brand.region);
  return { m0: (n: number | null | undefined) => money0(n, region), m2: (n: number | null | undefined) => money2(n, region) };
}

/** How big a file may be: small, because the demo keeps files in the browser. A real build uploads them. */
export function useFileLimitKb() {
  return 1_200;
}

/** A kept file or files (invoice, receipt, licence, photos): a link that opens them in a wide window to look at. */
export function FileLink({ docs, title, className, children, note }: { docs: ViewDoc[]; title: string; className?: string; children?: React.ReactNode; note?: string }) {
  const [open, setOpen] = useState(false);
  if (!docs.length) return null;
  return (
    <>
      <button type="button" className={cx("press inline-flex items-center gap-1 font-medium text-accent-ink underline-offset-2 hover:underline", className)} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {children ?? (
          <>
            <FileText size={16} /> {docs[0]!.name}
            {docs.length > 1 && ` and ${docs.length - 1} more`}
          </>
        )}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} size="xl" split footer={<Button onClick={() => setOpen(false)}>Close</Button>}>
        {open && (
          <div className="flex h-full flex-col gap-2 p-3">
            <DocViewer docs={docs} className="min-h-[20rem] flex-1" />
            {note && <p className="text-[0.93rem] text-muted">{note}</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}

/** A filter box: a label and a select, with "All" first. */
export function FilterSelect({ label, value, onChange, all, options }: { label: string; value: string; onChange: (v: string) => void; all: string; options: { value: string; label: string }[] }) {
  return (
    <label className="flex h-9 items-center gap-1.5 rounded-md border border-line-strong bg-surface pl-2.5 text-[0.93rem]">
      <span className="text-muted">{label}</span>
      <select aria-label={label} className="h-full max-w-[12rem] min-w-0 truncate rounded-r-md bg-transparent pr-2 font-medium outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Pick one file (PDF, photo, Word or Excel), read into the page within the login's size limit. */
export function useFilePick() {
  const limit = useFileLimitKb();
  const [file, setFile] = useState<{ name: string; dataUrl: string } | null>(null);
  const [error, setError] = useState("");
  const pick = (f: File | undefined) => {
    if (!f) return;
    setError("");
    readUpload(f, limit).then(setFile).catch((e: Error) => setError(e.message));
  };
  return { file, error, pick };
}

export function FilePicker({ label, file, error, pick }: { label: string; file: { name: string } | null; error: string; pick: (f: File | undefined) => void }) {
  return (
    <div>
      <p className="mb-1 text-[0.93rem] font-medium">{label}</p>
      <label className="press inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-line-strong px-3 font-medium hover:bg-accent-soft">
        <UploadSimple size={16} /> {file ? "Choose another" : "Choose a file"}
        <input type="file" className="sr-only" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {file && <span className="ml-2 text-[0.93rem] text-muted">{file.name}</span>}
      {error && <p role="alert" className="mt-1 text-bad">{error}</p>}
    </div>
  );
}
