/**
 * Orders on their way to sites, updates from subcontractors and suppliers, and spending that
 * waits for the managing director (added 16 Nov for the new overview and Admin > Requests).
 *
 * Nothing here is random, so the rest of the sample data is unchanged. Every date is relative
 * to the demo's day, and the suppliers are the ones already on the supplier invoices.
 */
import type { PortalNote, SpendRequest, SupplyOrder } from "../types";
import { at, workdays } from "./util";

const pid = (code: string) => `pr-${code}`;

export function seedSupplies(today: string): SupplyOrder[] {
  const day = (n: number) => workdays(today, n);
  return [
    { id: "su-1", from: "Burren Lime and Stone Supplies", party: "supplier", projectId: pid("C720"), description: "NHL 3.5 natural hydraulic lime, 40 bags", orderedOn: day(-5), dueOn: day(4), status: "Ordered" },
    { id: "su-2", from: "Moher Slate Merchants", party: "supplier", projectId: pid("C721"), description: "Natural slate 500 x 250, 3,000", orderedOn: day(-9), dueOn: day(-2), status: "Part delivered", progress: "1,200 of 3,000" },
    { id: "su-3", from: "Atlantic Lead and Copper", party: "supplier", projectId: pid("C722"), description: "Code 5 lead sheet, 6 rolls", orderedOn: day(-7), dueOn: day(3), status: "Ordered" },
    { id: "su-4", from: "Kinvara Stone Carvers", party: "subcontractor", projectId: pid("C719"), description: "Indent stones carved to template, 14 no.", orderedOn: day(-15), dueOn: day(0), status: "Ready to collect" },
    { id: "su-5", from: "Clearwater Cylinder Glass", party: "supplier", projectId: pid("C720"), description: "Cylinder glass cut to size, 18 panes", orderedOn: day(-6), dueOn: day(-1), status: "Ordered" },
    { id: "su-6", from: "Slieve Bloom Sawmills", party: "supplier", projectId: pid("C721"), description: "Douglas fir 225 x 100, 48 m", orderedOn: day(-8), dueOn: day(-3), status: "Delivered", deliveredOn: day(-3) },
  ];
}

const weekdayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { weekday: "long", timeZone: "UTC" });

export function seedPortalNotes(today: string): PortalNote[] {
  const day = (n: number) => workdays(today, n);
  return [
    { id: "pn-1", at: at(today, "08:10"), party: "subcontractor", from: "Kinvara Stone Carvers", projectId: pid("C719"), text: "The 14 indent stones for C719 are carved to template and ready to collect." },
    { id: "pn-2", at: at(day(-1), "16:30"), party: "supplier", from: "Atlantic Lead and Copper", projectId: pid("C722"), text: `The lead sheet for C722 is held up at the mill. It is now due on ${weekdayName(day(3))}.` },
    { id: "pn-3", at: at(day(-1), "14:20"), party: "supplier", from: "Moher Slate Merchants", projectId: pid("C721"), text: "1,200 slates delivered to C721. The other 1,800 follow when the quarry's next load is cut." },
    { id: "pn-4", at: at(day(-2), "09:40"), party: "subcontractor", from: "Corrib Scaffolding", projectId: pid("C721"), text: "Weekly scaffold inspection at C721 done and the tags renewed. The temporary roof is sound after the wind." },
  ];
}

/** Money people want to spend, waiting for the managing director's yes or no. */
export function seedSpendRequests(today: string, abrasiveWheelsExpiry: string): SpendRequest[] {
  const day = (n: number) => workdays(today, n);
  const spoken = new Date(`${abrasiveWheelsExpiry}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long", timeZone: "UTC" });
  return [
    { id: "sp-1", requestedById: "p-yard", createdAt: at(today, "07:55"), what: "A third 150 litre drum mixer", supplier: "Galway Plant Sales", projectId: null, amount: 1480, reason: "Both mixers are out on site every day now. Buying a third costs less than two months of hiring one.", status: "Waiting" },
    { id: "sp-2", requestedById: "p-hs", createdAt: at(day(-1), "11:30"), what: "Abrasive wheels course for Marek Wiśniewski", supplier: "Midwest Safety Training", projectId: null, amount: 185, reason: `His ticket runs out on ${spoken}, and the next course has one place left.`, status: "Waiting" },
    { id: "sp-3", requestedById: "p-cm1", createdAt: at(day(-2), "15:10"), what: "Lime putty, 40 tubs, bought before the price rise", supplier: "Burren Lime and Stone Supplies", projectId: pid("C720"), amount: 1360, reason: "Burren's prices go up at the start of next month, and Ardmullen House still needs about 40 tubs for its finish coats.", status: "Waiting" },
    // Agreed and not ordered yet (21 Nov): the office's list in Projects, Orders and deliveries.
    { id: "sp-5", requestedById: "p-sm4", createdAt: at(day(-2), "09:15"), what: "Stainless steel cramps and dowels for the cornice returns, 60 no.", supplier: "Atlantic Lead and Copper", projectId: pid("C722"), amount: 420, reason: "The cornice stones go back up the week after next and the fixings on site are mild steel, which the conservation officer will not accept.", status: "Approved", decidedBy: "Aidan King", decidedAt: at(day(-1), "08:20") },
    { id: "sp-4", requestedById: "p-off", createdAt: at(day(-6), "10:05"), what: "Replacement office printer", supplier: "Galway Office Supplies", projectId: null, amount: 640, reason: "The old one is eight years old and jams on every invoice run.", status: "Approved", decidedBy: "Aidan King", decidedAt: at(day(-5), "08:40") },
  ];
}
