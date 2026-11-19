/**
 * The files kept with each kind of record, ready for the viewer (src/ui/DocViewer.tsx). A real
 * file is shown as it is. The sample data's files are drawn when opened, from the record they
 * belong to (src/lib/sample-docs.ts, src/lib/sample-pictures.ts).
 */
import type { DamageReport, Db, Driver, FleetDoc, Proof, RepairInvoice } from "@/data/types";
import { testName } from "@/lib/fleet-spend";
import { usePrefs } from "@/data/store";
import { licenceCategories } from "@/data/seed/fleet";
import { sampleInvoicePdf, sampleLicencePdf, sampleReceiptPdf } from "@/lib/sample-docs";
import { damagePictureUrl } from "@/lib/sample-pictures";
import type { ViewDoc } from "@/ui/DocViewer";

const list = (first?: Proof, rest?: Proof[]) => [...(first ? [first] : []), ...(rest ?? [])];
/** The firm the sample documents are made out to, as branded now. */
const brand = () => usePrefs.getState().brand;

export const invoiceFiles = (inv: RepairInvoice) => list(inv.file, inv.extraFiles);

export function invoiceDocs(inv: RepairInvoice, db: Db): ViewDoc[] {
  return invoiceFiles(inv).map((p) => {
    if (p.sample !== "invoice") return { name: p.name, proof: p };
    const g = db.garages.find((x) => x.id === inv.garageId);
    return {
      name: p.name,
      stamp: `${inv.invoiceNo}|${inv.date}|${inv.total}|${inv.garageId}|${inv.lines.map((l) => `${l.vehicleId}:${l.amount}:${l.description}`).join(";")}`,
      make: () =>
        sampleInvoicePdf({
          invoiceNo: inv.invoiceNo,
          date: inv.date,
          garage: { name: g?.name ?? "Garage", town: g?.town ?? "", county: g?.county ?? "", phone: g?.phone, email: g?.email },
          customer: brand().legalName,
          attention: "Pat Scully",
          lines: inv.lines.map((l) => {
            const v = db.vehicles.find((x) => x.id === l.vehicleId);
            return { reg: v?.reg ?? "", makeModel: v ? `${v.make} ${v.model}` : "", description: l.description || l.category, mileage: l.mileage, amount: l.amount };
          }),
          total: inv.total,
          vat: inv.vat,
        }),
    };
  });
}

export function fleetDocDocs(d: FleetDoc, db: Db): ViewDoc[] {
  return list(d.proof, d.extraProofs).map((p) => {
    if (p.sample !== "receipt") return { name: p.name, proof: p };
    const v = db.vehicles.find((x) => x.id === d.vehicleId);
    return { name: p.name, stamp: `${d.id}|${d.expiryDate}|${d.amount}`, make: () => sampleReceiptPdf({ item: d.category, testName: v ? testName(v.kind, brand().region) : "CVRT", reg: v?.reg ?? "", makeModel: v ? `${v.make} ${v.model}` : "", paidDate: d.date, expiryDate: d.expiryDate, amount: d.amount, what: d.note, paidBy: brand().legalName, currency: brand().region === "UK" ? "GBP" : "EUR" }) };
  });
}

export function licenceDocs(d: Driver, which: "driving" | "cpc"): ViewDoc[] {
  const l = d.licences?.[which];
  if (!l) return [];
  return list(l.proof, l.extraProofs).map((p) => (p.sample === "licence" ? { name: p.name, stamp: `${d.id}|${which}|${l.expiryDate}|${d.name}`, make: () => sampleLicencePdf({ which, name: d.name, expiryDate: l.expiryDate, ref: `${d.id.toUpperCase()}-${which === "cpc" ? "CPC" : "DL"}`, categories: licenceCategories(d.id) }) } : { name: p.name, proof: p }));
}

/** A sample licence sheet for a driver, as a file that can be picked: for the phone's "use a sample" button in the demo. */
export function sampleLicenceFile(d: Pick<Driver, "id" | "name">, which: "driving" | "cpc", expiryDate: string): { name: string; dataUrl: string } {
  return { name: `${d.name}, ${which === "cpc" ? "Driver CPC" : "driving licence"}.pdf`, dataUrl: sampleLicencePdf({ which, name: d.name, expiryDate, ref: `${d.id.toUpperCase()}-${which === "cpc" ? "CPC" : "DL"}`, categories: licenceCategories(d.id) }) };
}

export function damageDocs(r: DamageReport): ViewDoc[] {
  return r.photos.map((p) => {
    const drawn = p.sample?.startsWith("damage/") ? damagePictureUrl(p.sample.slice(7)) : null;
    return drawn ? { name: p.name, dataUrl: drawn } : { name: p.name, proof: p };
  });
}
