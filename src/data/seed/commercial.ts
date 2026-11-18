import { addDays } from "@/lib/dates";
import { r2 } from "@/lib/money";
import { type Costing, type QuoteLine, quoteTotal } from "@/lib/quotes";
import type { Client, Enquiry, Quote, QuoteStatus } from "../types";
import { type Rng, at, round5, weekday, workdays } from "./util";

export const CLIENTS: Client[] = [
  { id: "c-01", name: "Rathdoon Select Vestry", type: "Church body", contactName: "Rev. Hilary Stanford", contactPhone: "045 555 0141", contactEmail: "rector@rathdoonparish.example", accountRef: "RATH01", termsDays: 30, portalEnabled: true, address: "The Rectory, Church Road, Rathdoon", county: "Kildare", billingEmail: "treasurer@rathdoonparish.example" },
  { id: "c-02", name: "Ardmullen Estate", type: "Private owner", contactName: "Susan Kane", contactPhone: "091 555 0162", contactEmail: "estate.office@ardmullen.example", accountRef: "ARDM01", termsDays: 30, portalEnabled: true, address: "Estate Office, Ardmullen House, Kilcolgan", county: "Galway" },
  { id: "c-03", name: "Ballyfinn Heritage Trust", type: "Heritage trust", contactName: "Deirdre Ó Loinsigh", contactPhone: "065 555 0118", contactEmail: "deirdre@ballyfinntrust.example", accountRef: "BALL01", termsDays: 45, portalEnabled: true, address: "The Mill House, Ballyfinn", county: "Clare", billingEmail: "accounts@ballyfinntrust.example" },
  { id: "c-04", name: "Dunmoy County Council", type: "Local authority", contactName: "Fintan Garrihy", contactPhone: "090 555 0133", contactEmail: "fgarrihy@dunmoycoco.example", accountRef: "DUNM01", termsDays: 45, portalEnabled: true, address: "County Buildings, Main Street, Dunmoy", county: "Roscommon", billingEmail: "creditors@dunmoycoco.example" },
  { id: "c-05", name: "Fitzgarret Property Holdings", type: "Commercial", contactName: "Annabel Thorpe", contactPhone: "01 555 0177", contactEmail: "athorpe@fitzgarretproperty.example", accountRef: "FITZ01", termsDays: 30, portalEnabled: true, address: "22 Fitzgarret Square", county: "Dublin", billingEmail: "payables@fitzgarretproperty.example" },
  { id: "c-06", name: "Carrowbeg County Council", type: "Local authority", contactName: "Bernard Mulqueen", contactPhone: "094 555 0126", contactEmail: "bmulqueen@carrowbegcoco.example", accountRef: "CARR01", termsDays: 60, portalEnabled: false, address: "Aras an Chontae, Carrowbeg", county: "Mayo", billingEmail: "creditors@carrowbegcoco.example" },
  { id: "c-07", name: "Harcourt and Leeson Building", type: "Main contractor", contactName: "Stephen Aylward", contactPhone: "051 555 0109", contactEmail: "s.aylward@harcourtleeson.example", accountRef: "HARC01", termsDays: 45, portalEnabled: true, address: "Harcourt House, The Quay", county: "Waterford", billingEmail: "accounts@harcourtleeson.example" },
  { id: "c-08", name: "Diocese of Killanure", type: "Church body", contactName: "Fr. Malachy Prunty", contactPhone: "049 555 0154", contactEmail: "property@killanurediocese.example", accountRef: "KILL01", termsDays: 30, portalEnabled: false, address: "Diocesan Office, Cathedral Close, Killanure", county: "Cavan" },
  { id: "c-09", name: "Mr and Mrs Prendiville", type: "Private owner", contactName: "Eleanor Prendiville", contactPhone: "066 555 0185", contactEmail: "eleanor.prendiville@mailbox.example", accountRef: "PREN01", termsDays: 14, portalEnabled: false, address: "Glebe House, Castlegregory", county: "Kerry" },
  { id: "c-10", name: "Inishbeg Heritage Trust", type: "Heritage trust", contactName: "Lorcan Vaughan", contactPhone: "074 555 0192", contactEmail: "lorcan@inishbegtrust.example", accountRef: "INIS01", termsDays: 45, portalEnabled: true, address: "The Boathouse Office, Inishbeg", county: "Donegal" },
  // Customers for past work only (added 18 Nov with the year of history behind the reports).
  { id: "c-11", name: "Rosmore Abbey Trust", type: "Heritage trust", contactName: "Gráinne Fortune", contactPhone: "053 555 0137", contactEmail: "grainne@rosmoreabbey.example", accountRef: "ROSM01", termsDays: 45, portalEnabled: false, address: "The Gate Lodge, Rosmore", county: "Wexford" },
  { id: "c-12", name: "Kilbrack Hotels", type: "Commercial", contactName: "Declan Moynihan", contactPhone: "066 555 0148", contactEmail: "dmoynihan@kilbrackhotels.example", accountRef: "KILB01", termsDays: 30, portalEnabled: false, address: "Kilbrack House Hotel, Ventry Road", county: "Kerry" },
];

/**
 * A priced item: [description, unit, rate, min qty, max qty, fixed, same as]. A fixed quantity is
 * never scaled, and nor are items priced per "item". "Same as" copies the quantity of an earlier
 * item, so the area raked out is the area repointed, and the roof stripped is the roof slated.
 */
type Item = [string, string, number, number, number, boolean?, number?];
export type WorkKind = "repoint" | "slate" | "sash" | "render" | "facade" | "wall" | "brick" | "timber";
const FIXED = true;
export const WORK: Record<WorkKind, { title: string; items: Item[]; trades: [string, number][]; materials: [string, string, number][]; plant: [string, number][] }> = {
  repoint: {
    title: "Lime repointing",
    items: [
      ["Rake out defective and cement mortar by hand to 25 mm depth", "m²", 38, 60, 420],
      ["Repoint in NHL 3.5 lime mortar, flush finish brushed back", "m²", 92, 60, 420, false, 0],
      ["Stone indent repairs in matching limestone", "no.", 310, 4, 22],
      ["Protect and cure new work with hessian and misting", "item", 1450, 1, 1],
      ["Independent scaffold, design, erect, adapt and strike", "item", 7200, 1, 2],
    ],
    trades: [["Stonemason", 29.5], ["General operative", 19.5]],
    materials: [["NHL 3.5 natural hydraulic lime", "bag", 21.5], ["Washed sharp sand", "tonne", 62], ["Matching limestone for indents", "m³", 1850]],
    plant: [["Mortar mixer", 18], ["Hoist", 42]],
  },
  slate: {
    title: "Roof re-slating",
    items: [
      ["Strip existing slates, sort and store sound slates for reuse", "m²", 34, 90, 380],
      ["Re-slate in natural blue-black slate on new battens with copper nails", "m²", 148, 90, 380, false, 0],
      ["Code 5 lead flashings, soakers and valley linings", "lin m", 126, 18, 70],
      ["Spliced repairs to decayed rafter ends in matching softwood", "no.", 285, 6, 28],
      ["Overhaul and refix cast iron rainwater goods", "lin m", 64, 30, 90],
    ],
    trades: [["Roofer and slater", 28], ["Leadworker", 30], ["Carpenter", 25.5]],
    materials: [["Natural slate 500 x 250", "thousand", 2950], ["Code 5 lead sheet", "roll", 410], ["Treated battens and copper nails", "lot", 1280]],
    plant: [["Hoist", 42], ["Scaffold tower", 26]],
  },
  sash: {
    title: "Sash window repairs",
    items: [
      ["Overhaul sliding sash window: ease, re-cord, rebalance and draughtproof", "no.", 680, 8, 46],
      ["Splice repairs to sills and bottom rails in matching redwood", "no.", 240, 6, 30],
      ["Reglaze broken panes in cylinder glass with linseed putty", "no.", 95, 10, 60],
      ["Prepare and paint in linseed oil paint, three coats", "no.", 190, 8, 46],
    ],
    trades: [["Conservation joiner", 29], ["Painter and decorator", 24]],
    materials: [["Joinery-grade redwood", "m³", 1150], ["Cylinder glass", "m²", 138], ["Linseed oil paint and putty", "lot", 640]],
    plant: [["Scaffold tower", 26]],
  },
  render: {
    title: "Lime render and plaster",
    items: [
      ["Remove cement render carefully by hand and cart away", "m²", 46, 80, 360],
      ["Three-coat lime render, haired backing coats, wood float finish", "m²", 118, 80, 360, false, 0],
      ["Limewash, four coats, pigmented to approved sample", "m²", 19, 80, 360, false, 0],
      ["Lath and lime plaster ceiling repairs", "m²", 165, 12, 70],
    ],
    trades: [["Lime plasterer", 28.5], ["General operative", 19.5]],
    materials: [["Lime putty, matured", "tub", 34], ["Goat hair and laths", "lot", 520], ["Washed sharp sand", "tonne", 62]],
    plant: [["Mortar mixer", 18], ["Dehumidifier", 14]],
  },
  facade: {
    title: "Stone façade repairs and cleaning",
    items: [
      ["Superheated steam cleaning of ashlar façade", "m²", 28, 150, 620],
      ["Lime mortar repairs to weathered mouldings and string courses", "no.", 220, 10, 48],
      ["New carved limestone cornice sections to match existing", "lin m", 540, 3, 16],
      ["Poultice treatment to iron and copper staining", "m²", 74, 6, 40],
      ["Independent scaffold with debris netting and pavement gantry", "item", 9800, 1, 1],
    ],
    trades: [["Stonemason", 29.5], ["General operative", 19.5]],
    materials: [["Carved limestone", "m³", 2400], ["Repair mortar, colour matched", "bag", 38], ["Cleaning poultice", "tub", 86]],
    plant: [["Steam cleaning unit", 95], ["Hoist", 42]],
  },
  wall: {
    title: "Masonry wall and bridge repairs",
    items: [
      ["Take down and rebuild rubble stone parapet in lime mortar", "lin m", 420, 12, 60],
      ["Remove ivy and woody growth, treat roots", "item", 1850, 1, 1],
      ["Cope with salvaged and new matching stone", "lin m", 96, 12, 60, false, 0],
      ["Traffic management, single lane with lights", "day", 480, 4, 18],
    ],
    trades: [["Stonemason", 29.5], ["General operative", 19.5]],
    materials: [["NHL 5 natural hydraulic lime", "bag", 23], ["Rubble stone, local", "tonne", 145], ["Washed sharp sand", "tonne", 62]],
    plant: [["Mortar mixer", 18], ["Mini digger", 110]],
  },
  brick: {
    title: "Brick repointing and railings",
    items: [
      ["Independent scaffold to front and rear elevations, erect and strike", "item", 6900, 1, 1],
      ["Rake out brick joints by hand, no grinders", "m²", 42, 180, 380],
      ["Repoint brickwork in NHL 3.5 lime mortar, flush joint", "m²", 88, 120, 260],
      ["Tuck pointing to the front elevation in lime putty", "m²", 125, 60, 140],
      ["Brick repairs in reclaimed handmade brick", "no.", 65, 40, 160],
      ["Refurbish cast iron railings: strip, repair, prime and paint in linseed oil paint", "lin m", 210, 14, 26],
    ],
    trades: [["Bricklayer", 28], ["Painter and decorator", 23.5]],
    materials: [["NHL 3.5 natural hydraulic lime", "bag", 21.5], ["Reclaimed handmade brick", "no.", 1.85], ["Linseed oil paint", "litre", 22.6]],
    plant: [["Scaffold tower", 26]],
  },
  timber: {
    title: "Structural timber repairs",
    items: [
      ["Temporary propping to floors while beams are repaired", "item", 4800, 1, 1],
      ["Lift and number floorboards, set aside for reuse", "m²", 18, 300, 700],
      ["Splice repairs to decayed joist ends in reclaimed pitch pine", "no.", 240, 40, 120],
      ["New oak bearers to failed beam ends, with resin anchors", "no.", 680, 8, 24],
      ["Relay floorboards, with matching reclaimed boards where decayed", "m²", 64, 300, 700, false, 1],
      ["Helical stainless steel crack stitching to the river elevation", "lin m", 95, 40, 120],
    ],
    trades: [["Conservation joiner", 29], ["Apprentice joiner", 16.5]],
    materials: [["Reclaimed pitch pine joists", "m", 48], ["Oak bearers, 200 x 200", "m", 165], ["Stainless helical bars and grout", "lot", 860]],
    plant: [["Acrow props, hired", 36], ["Generator", 25]],
  },
};

/** Priced items for quotes whose work is not just one of the kinds above. */
const ITEMS: Record<number, Item[]> = {
  1: [
    ["Tied scaffold to the tower, design, erect, adapt and strike", "item", 14800, 1, 1],
    ["Rake out defective and cement mortar by hand to 25 mm depth", "m²", 38, 300, 700],
    ["Repoint in NHL 3.5 lime mortar, flush finish brushed back", "m²", 92, 300, 700, false, 1],
    ["Stone indent repairs in matching limestone", "no.", 310, 8, 24],
    ["Strip lead, renew boarding and relay in code 7 lead, tower and vestry roofs", "m²", 265, 60, 140],
    ["Code 5 lead flashings, drips and outlets", "lin m", 126, 20, 60],
    ["Lightning conductor refixed and tested", "item", 1850, 1, 1],
    ["Protect and cure new work with hessian and misting", "item", 1450, 1, 1],
  ],
  2: [
    ["Independent scaffold to the east wing, erect and strike", "item", 6400, 1, 1],
    ["Remove cement render carefully by hand and cart away", "m²", 46, 200, 420],
    ["Three-coat lime render, haired backing coats, wood float finish", "m²", 118, 200, 420, false, 1],
    ["Limewash, four coats, pigmented to approved sample", "m²", 19, 200, 420, false, 1],
    ["Overhaul sliding sash window: ease, re-cord, rebalance and draughtproof", "no.", 680, 34, 34, FIXED],
    ["Splice repairs to sills and bottom rails in matching redwood", "no.", 240, 22, 22, FIXED],
    ["Prepare and paint sashes in linseed oil paint, three coats", "no.", 190, 34, 34, FIXED],
    ["Lath and lime plaster repairs, drawing room ceiling", "m²", 165, 18, 40],
  ],
  4: [
    ["Independent scaffold with debris netting and pavement gantry", "item", 9800, 1, 1],
    ["Superheated steam cleaning of the ashlar façade", "m²", 28, 700, 900],
    ["Lime mortar repairs to weathered mouldings and string courses", "no.", 220, 30, 60],
    ["Indent repairs to sills, quoins and dressings in matching limestone", "no.", 310, 30, 60],
    ["New carved limestone cornice sections to match existing", "lin m", 540, 18, 30],
    ["Lead weathering to the cornice", "lin m", 185, 40, 70],
    ["Repoint open joints in lime", "m²", 92, 150, 300],
    ["Poultice trial and treatment to staining", "m²", 74, 10, 25],
  ],
  8: [
    ["Scaffold to the chimney stack, erect and strike", "item", 2400, 1, 1],
    ["Take down the chimney stack to sound brickwork", "item", 1650, 1, 1],
    ["Rebuild the chimney stack in reclaimed brick and lime, with new pots", "item", 6800, 1, 1],
    ["Code 5 lead flashings and soakers to the stack", "item", 1450, 1, 1],
    ["Lath and lime plaster ceiling repairs", "m²", 165, 40, 120],
    ["Limewash to the repaired ceilings, three coats", "m²", 14, 80, 200, false, 4],
  ],
  9: [
    ["Overhaul sliding sash window: ease, re-cord, rebalance and draughtproof", "no.", 680, 22, 22, FIXED],
    ["Splice repairs to sills and bottom rails in matching redwood", "no.", 240, 6, 18],
    ["Reglaze broken panes in cylinder glass with linseed putty", "no.", 95, 10, 40],
    ["Prepare and paint in linseed oil paint, three coats", "no.", 190, 22, 22, FIXED],
    ["Overhaul the main doors and frames", "item", 3800, 1, 1],
    ["Repair the clock turret louvres in oak", "item", 4200, 1, 1],
  ],
  10: [
    ["Strip existing slates, sort and store sound slates for reuse", "m²", 34, 200, 420],
    ["Re-slate in natural blue-black slate on new battens with copper nails", "m²", 148, 200, 420, false, 0],
    ["Code 5 lead flashings, soakers and ridges", "lin m", 126, 30, 70],
    ["Spliced repairs to decayed rafter ends in matching softwood", "no.", 285, 6, 20],
    ["Remove cement render from the seaward gables", "m²", 46, 60, 140],
    ["Three-coat lime render to the seaward gables", "m²", 118, 60, 140, false, 4],
  ],
  11: [
    ["Archaeological monitoring and recording", "item", 4800, 1, 1],
    ["Remove ivy and woody growth, treat roots", "item", 2600, 1, 1],
    ["Consolidate the wall core and rebuild loose facing in lime mortar", "m²", 210, 150, 260],
    ["Cope the wall head with salvaged stone", "lin m", 96, 60, 90],
    ["Scaffold and propping to the leaning section", "item", 6800, 1, 1],
    ["Pedestrian management on Abbey Lane", "week", 380, 6, 10],
  ],
  12: [
    ["Overhaul sliding sash window: ease, re-cord, rebalance and draughtproof", "no.", 680, 12, 12, FIXED],
    ["Splice repairs to sills and bottom rails in matching redwood", "no.", 240, 5, 5, FIXED],
    ["Reglaze broken panes in cylinder glass with linseed putty", "no.", 95, 14, 14, FIXED],
    ["Prepare and paint in linseed oil paint, three coats", "no.", 190, 12, 12, FIXED],
    ["Scaffold tower and protection to the rear windows", "item", 1200, 1, 1],
  ],
  13: [
    ["Temporary dam and pumping to the mill race", "item", 2600, 1, 1],
    ["Rake out defective and cement mortar by hand to 25 mm depth", "m²", 38, 120, 300],
    ["Repoint in NHL 5 lime mortar, suitable for damp conditions", "m²", 96, 120, 300, false, 1],
    ["Stone indent repairs in matching limestone", "no.", 310, 4, 12],
    ["Remove vegetation and treat roots", "item", 950, 1, 1],
  ],
  14: [
    ["Pedestrian barriers and protection to the steps", "item", 1200, 1, 1],
    ["Take up and rebed the granite steps in lime mortar", "no.", 680, 6, 6, FIXED],
    ["Indent repairs to step nosings in matching granite", "no.", 420, 4, 12],
    ["Steam clean the limestone plinth", "m²", 28, 20, 60],
    ["Repoint the plinth in lime mortar", "m²", 92, 20, 60, false, 3],
    ["Poultice treatment to iron staining", "m²", 74, 4, 12],
  ],
  16: [
    ["Take down and rebuild the garden wall in lime mortar", "lin m", 940, 43, 43, FIXED],
    ["Rebuild the gateway arch on new centring", "item", 14800, 1, 1],
    ["Remove ivy and woody growth, treat roots", "item", 1850, 1, 1],
    ["Cope with salvaged and new matching stone", "lin m", 96, 43, 43, FIXED],
    ["Scaffold and propping to the gateway arch", "item", 3200, 1, 1],
  ],
  17: [
    ["Internal scaffold and floor protection", "item", 5200, 1, 1],
    ["Hack off gypsum plaster and cart away", "m²", 22, 300, 700],
    ["Three-coat lime plaster, haired backing coats", "m²", 98, 300, 700, false, 1],
    ["Limewash, three coats", "m²", 14, 300, 700, false, 1],
  ],
  19: [
    ["Overhaul sliding sash window: ease, re-cord, rebalance and draughtproof", "no.", 680, 14, 14, FIXED],
    ["Splice repairs to sills and bottom rails in matching redwood", "no.", 240, 4, 10],
    ["Reglaze broken panes in cylinder glass with linseed putty", "no.", 95, 6, 20],
    ["Prepare and paint in linseed oil paint, three coats", "no.", 190, 14, 14, FIXED],
    ["Overhaul the main entrance doors, ironmongery overhauled", "item", 2900, 1, 1],
    ["Repair and paint the vestry door", "item", 1100, 1, 1],
  ],
  20: [
    ["Scaffold to the portico, with protection to the entrance", "item", 8600, 1, 1],
    ["Stone repairs to the four columns: indents and mortar repairs", "no.", 4800, 4, 4, FIXED],
    ["Repairs to the entablature and pediment mouldings", "lin m", 540, 10, 30],
    ["Code 6 lead weathering to the entablature", "lin m", 185, 18, 30],
    ["Poultice treatment to staining, after a trial", "m²", 74, 10, 40],
    ["Repoint open joints in lime", "m²", 92, 40, 120],
  ],
};

/** Build priced lines, scaled so they come to the target value. Fixed quantities and lump sums stay as they are. */
export function linesFor(r: Rng, kind: WorkKind, target: number, idPrefix: string, items: Item[] = WORK[kind].items): QuoteLine[] {
  const lines = items.map(([description, unit, rate, lo, hi, fixed], i) => ({ id: `${idPrefix}-l${i + 1}`, description, unit, rate, qty: r.int(lo, hi), keep: fixed === true || unit === "item" }));
  const linked = () => items.forEach((it, i) => it[6] != null && (lines[i]!.qty = lines[it[6]]!.qty));
  linked();
  const kept = quoteTotal(lines.filter((l) => l.keep));
  const scalable = quoteTotal(lines.filter((l) => !l.keep));
  const k = scalable > 0 ? Math.max(0.2, (target - kept) / scalable) : 1;
  for (const l of lines) if (!l.keep) l.qty = Math.max(1, Math.round(l.qty * k));
  linked();
  return lines.map(({ keep: _keep, ...l }) => l);
}

/** A believable cost build-up for a selling price and margin: mostly labour, as conservation work is. */
export function costingFor(kind: WorkKind, sell: number, margin: number): Costing {
  const spec = WORK[kind];
  const cost = sell * (1 - margin / 100);
  // Plant is priced for the days it is needed, and those follow from the labour: a crew of two
  // to six, the first item for the whole job and any other for half of it, never more than an
  // eighth of the cost. The plant allowance left over goes to labour, so the total stays the same.
  const avgRate = spec.trades.reduce((s, [, rate]) => s + rate, 0) / spec.trades.length;
  const hoursGuess = (cost * 0.56) / avgRate;
  const crew = Math.min(6, Math.max(2, Math.ceil(hoursGuess / 500)));
  const jobDays = Math.max(2, Math.round(hoursGuess / (8 * crew)));
  const full = spec.plant.map(([, rate], i) => Math.round(jobDays * (i === 0 ? 1 : 0.5)) * rate).reduce((s, c) => s + c, 0);
  const scale = Math.min(1, (cost * 0.125) / Math.max(1, full));
  const plant = spec.plant.map(([item, rate], i) => ({ item, rate, days: Math.max(2, Math.round(jobDays * (i === 0 ? 1 : 0.5) * scale)) }));
  const labourCost = cost * 0.62 - plant.reduce((s, x) => s + x.days * x.rate, 0);
  const labour = spec.trades.map(([trade, rate], i) => {
    const share = i === 0 ? 0.62 : 0.38 / Math.max(1, spec.trades.length - 1);
    return { trade, rate, hours: Math.max(8, round5((labourCost * share) / rate)) };
  });
  const matCost = cost * 0.2;
  const materials = spec.materials.map(([item, unit, rate], i) => {
    const share = i === 0 ? 0.55 : 0.45 / Math.max(1, spec.materials.length - 1);
    return { item, unit, rate, qty: Math.max(1, Math.round((matCost * share) / rate)) };
  });
  return { labour, materials, plant, subcontract: r2(Math.round((cost * 0.1) / 50) * 50), prelims: r2(Math.round((cost * 0.08) / 50) * 50) };
}

type QSeed = { n: number; clientId: string; kind: WorkKind; title: string; location: string; county: string; target: number; margin: number; status: QuoteStatus; sentDaysAgo?: number; drafted?: boolean; po?: string; query?: string; source: Enquiry["source"]; loggedBy: string; enquiryStatus: Enquiry["status"]; chasedDaysAgo?: number; responded?: [days: number, time: string] };

/**
 * The sales pipeline. The first block are won jobs that became projects (see projects.ts, which
 * links to these quote ids, and works out what each was priced at from its crew), the rest are
 * live quotes at every stage.
 */
const PIPELINE: QSeed[] = [
  { n: 1, clientId: "c-01", kind: "repoint", title: "St Finian's Church: tower repointing and lead roof renewal", location: "St Finian's Church, Rathdoon", county: "Kildare", target: 186000, margin: 24, status: "Accepted", sentDaysAgo: 96, po: "RSV-2026-014", source: "Architect referral", loggedBy: "Niamh Lavelle", enquiryStatus: "Won" },
  { n: 2, clientId: "c-02", kind: "render", title: "Ardmullen House: lime render and sash windows, east wing", location: "Ardmullen House, Kilcolgan", county: "Galway", target: 142500, margin: 27, status: "Accepted", sentDaysAgo: 88, po: "ARD-0457", source: "Existing client", loggedBy: "Tadhg Morrissey", enquiryStatus: "Won" },
  { n: 3, clientId: "c-03", kind: "slate", title: "The Old Corn Mill: re-slating and structural timber repairs", location: "The Old Corn Mill, Ballyfinn", county: "Clare", target: 214000, margin: 21, status: "Accepted", sentDaysAgo: 80, po: "BHT-PO-0092", source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Won" },
  { n: 4, clientId: "c-04", kind: "facade", title: "Dunmoy Courthouse: façade stone repairs and cleaning", location: "Dunmoy Courthouse, Main Street, Dunmoy", county: "Roscommon", target: 268000, margin: 19, status: "Accepted", sentDaysAgo: 71, po: "DCC-4471-26", source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Won" },
  { n: 5, clientId: "c-05", kind: "brick", title: "14 Fitzgarret Square: brick repointing and railings", location: "14 Fitzgarret Square", county: "Dublin", target: 97500, margin: 29, status: "Accepted", sentDaysAgo: 60, po: "FPH-10288", source: "Email", loggedBy: "Niamh Lavelle", enquiryStatus: "Won" },
  { n: 6, clientId: "c-06", kind: "wall", title: "Derrybawn Bridge: parapet rebuilding", location: "Derrybawn Bridge, Glenasmole Road", county: "Wicklow", target: 58400, margin: 23, status: "Accepted", sentDaysAgo: 52, po: "CCC-BR-0319", source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Won" },
  { n: 7, clientId: "c-07", kind: "timber", title: "Granary Quay Warehouses: floor repairs and crack stitching", location: "Granary Quay, Passage East", county: "Waterford", target: 176000, margin: 17, status: "Accepted", sentDaysAgo: 47, po: "HLB-SUB-2231", source: "Existing client", loggedBy: "Aisling Rafter", enquiryStatus: "Won" },
  { n: 8, clientId: "c-08", kind: "render", title: "Tullyvin Gate Lodge: lime plaster ceilings and chimney rebuild", location: "Tullyvin Gate Lodge, Cootehill Road", county: "Cavan", target: 46800, margin: 26, status: "Accepted", sentDaysAgo: 30, po: "DK-PROP-778", source: "Phone", loggedBy: "Niamh Lavelle", enquiryStatus: "Won" },
  { n: 9, clientId: "c-06", kind: "sash", title: "Market House, Kilcashel: window and joinery repairs", location: "Market House, The Square, Kilcashel", county: "Mayo", target: 33500, margin: 25, status: "Accepted", sentDaysAgo: 24, po: "CCC-MH-0352", source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Won" },
  { n: 10, clientId: "c-10", kind: "slate", title: "Carrowkeel Lightkeepers' Cottages: roofs and render", location: "Carrowkeel Head", county: "Donegal", target: 131000, margin: 22, status: "Accepted", sentDaysAgo: 18, po: "IHT-2026-031", source: "Architect referral", loggedBy: "Aisling Rafter", enquiryStatus: "Won" },

  { n: 11, clientId: "c-04", kind: "wall", title: "Dunmoy Town Walls: section 3 consolidation", location: "Abbey Lane, Dunmoy", county: "Roscommon", target: 84200, margin: 22, status: "Sent", sentDaysAgo: 19, chasedDaysAgo: 9, source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Quoted" },
  { n: 12, clientId: "c-05", kind: "sash", title: "8 Fitzgarret Square: twelve sash windows", location: "8 Fitzgarret Square", county: "Dublin", target: 15200, margin: 31, status: "Sent", sentDaysAgo: 12, source: "Existing client", loggedBy: "Niamh Lavelle", enquiryStatus: "Quoted" },
  { n: 13, clientId: "c-03", kind: "repoint", title: "Ballyfinn Mill race walls: repointing", location: "The Old Corn Mill, Ballyfinn", county: "Clare", target: 38600, margin: 24, status: "Sent", sentDaysAgo: 8, source: "Existing client", loggedBy: "Tadhg Morrissey", enquiryStatus: "Quoted" },
  { n: 14, clientId: "c-05", kind: "facade", title: "22 Fitzgarret Square: stone steps and plinth", location: "22 Fitzgarret Square", county: "Dublin", target: 16800, margin: 28, status: "Opened", sentDaysAgo: 15, source: "Existing client", loggedBy: "Aisling Rafter", enquiryStatus: "Quoted" },
  { n: 15, clientId: "c-08", kind: "slate", title: "St Brecan's Oratory: roof repairs", location: "St Brecan's Oratory, Killanure", county: "Cavan", target: 54700, margin: 9, status: "Opened", sentDaysAgo: 10, source: "Email", loggedBy: "Niamh Lavelle", enquiryStatus: "Quoted" },
  { n: 16, clientId: "c-02", kind: "wall", title: "Ardmullen walled garden: north wall rebuild", location: "Ardmullen House, Kilcolgan", county: "Galway", target: 71300, margin: 25, status: "Queried", sentDaysAgo: 9, source: "Existing client", loggedBy: "Tadhg Morrissey", enquiryStatus: "Quoted", responded: [-1, "15:14"], query: "Could you price the north wall in two phases, with the gateway arch first? The owner wants the arch safe before winter." },
  { n: 17, clientId: "c-07", kind: "render", title: "Granary Quay block C: internal lime plaster", location: "Granary Quay, Passage East", county: "Waterford", target: 92600, margin: 14, status: "Declined", sentDaysAgo: 26, source: "Existing client", loggedBy: "Aisling Rafter", enquiryStatus: "Lost" },
  { n: 18, clientId: "c-10", kind: "repoint", title: "Inishbeg signal tower: repointing", location: "Inishbeg Head", county: "Donegal", target: 44100, margin: 23, status: "Declined", sentDaysAgo: 33, source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Lost" },
  { n: 19, clientId: "c-01", kind: "sash", title: "Rathdoon Parish Hall: windows and doors", location: "Parish Hall, Church Road, Rathdoon", county: "Kildare", target: 21000, margin: 27, status: "Awaiting approval", drafted: true, source: "Email", loggedBy: "Niamh Lavelle", enquiryStatus: "Logged" },
  { n: 20, clientId: "c-06", kind: "facade", title: "Kilcashel Courthouse: portico stone repairs", location: "Courthouse, Kilcashel", county: "Mayo", target: 52000, margin: 20, status: "Draft", source: "Tender", loggedBy: "Colm Henebry", enquiryStatus: "Logged" },
];

/** The margin a quote was priced at, for projects.ts to work out what each won job was worth. */
export const quotedMargin = (n: number) => PIPELINE.find((q) => q.n === n)?.margin ?? PAST.find((q) => q.n === n)?.margin ?? 22;

// ── The year before (added 18 Nov, for Reports) ──────────────────────────────

/**
 * Tenders from the year before today's pipeline: the twelve won jobs behind the finished
 * projects C697 to C708 (projects.ts), and the ones that were lost. `sent` is in working days
 * from today. Won ones are priced from their crews, like today's (quoteTargets).
 */
type Past = { n: number; clientId: string; kind: WorkKind; title: string; location: string; county: string; sent: number; margin: number; won: boolean; target?: number; po?: string; source: Enquiry["source"]; loggedBy: string };
const T = "Colm Henebry", N = "Niamh Lavelle", TM = "Tadhg Morrissey", A = "Aisling Rafter";
const PAST: Past[] = [
  { n: 101, clientId: "c-11", kind: "wall", title: "Rosmore Abbey: cloister walls consolidation", location: "Rosmore Abbey", county: "Wexford", sent: -292, margin: 25, won: true, po: "RAT-0112", source: "Architect referral", loggedBy: TM },
  { n: 102, clientId: "c-01", kind: "slate", title: "Rathdoon Rectory: re-slating", location: "The Rectory, Church Road, Rathdoon", county: "Kildare", sent: -288, margin: 23, won: true, po: "RSV-2025-041", source: "Existing client", loggedBy: N },
  { n: 103, clientId: "c-02", kind: "render", title: "Ardmullen stable yard: lime render", location: "Ardmullen House, Kilcolgan", county: "Galway", sent: -285, margin: 26, won: true, po: "ARD-0391", source: "Existing client", loggedBy: TM },
  { n: 104, clientId: "c-04", kind: "repoint", title: "Dunmoy Market Cross: stone repairs and repointing", location: "The Square, Dunmoy", county: "Roscommon", sent: -280, margin: 28, won: true, po: "DCC-3982-25", source: "Tender", loggedBy: T },
  { n: 105, clientId: "c-12", kind: "sash", title: "Kilbrack House Hotel: sash windows", location: "Kilbrack House Hotel, Ventry Road", county: "Kerry", sent: -278, margin: 24, won: true, po: "KHH-2211", source: "Email", loggedBy: N },
  { n: 106, clientId: "c-05", kind: "brick", title: "6 Fitzgarret Square: brick repointing", location: "6 Fitzgarret Square", county: "Dublin", sent: -274, margin: 26, won: true, po: "FPH-09871", source: "Existing client", loggedBy: A },
  { n: 107, clientId: "c-06", kind: "wall", title: "Pound Bridge, Carrowbeg: parapet rebuilding", location: "Pound Bridge, Carrowbeg", county: "Mayo", sent: -256, margin: 22, won: true, po: "CCC-BR-0287", source: "Tender", loggedBy: T },
  { n: 108, clientId: "c-03", kind: "slate", title: "Ballyfinn Miller's Cottage: roof", location: "Miller's Cottage, Ballyfinn", county: "Clare", sent: -258, margin: 24, won: true, po: "BHT-PO-0071", source: "Existing client", loggedBy: A },
  { n: 109, clientId: "c-07", kind: "timber", title: "Passage East Maltings: floor repairs", location: "The Maltings, Passage East", county: "Waterford", sent: -248, margin: 18, won: true, po: "HLB-SUB-2098", source: "Existing client", loggedBy: A },
  { n: 110, clientId: "c-08", kind: "render", title: "Killanure Presbytery: lime plaster ceilings", location: "The Presbytery, Cathedral Close, Killanure", county: "Cavan", sent: -245, margin: 26, won: true, po: "DK-PROP-701", source: "Phone", loggedBy: N },
  { n: 111, clientId: "c-09", kind: "slate", title: "Glebe House: outbuildings re-roof", location: "Glebe House, Castlegregory", county: "Kerry", sent: -227, margin: 27, won: true, po: "PREN-2026-01", source: "Email", loggedBy: N },
  { n: 112, clientId: "c-10", kind: "render", title: "Inishbeg Coastguard Station: lime render and repointing", location: "Coastguard Station, Inishbeg", county: "Donegal", sent: -230, margin: 23, won: true, po: "IHT-2026-004", source: "Architect referral", loggedBy: A },

  { n: 121, clientId: "c-04", kind: "facade", title: "Dunmoy Library: portico cleaning and repairs", location: "Library, Church Street, Dunmoy", county: "Roscommon", sent: -248, margin: 21, won: false, target: 96000, source: "Tender", loggedBy: T },
  { n: 122, clientId: "c-06", kind: "wall", title: "Carrowbeg harbour wall: repointing and rebuilding", location: "Carrowbeg Harbour", county: "Mayo", sent: -244, margin: 19, won: false, target: 142000, source: "Tender", loggedBy: T },
  { n: 123, clientId: "c-08", kind: "slate", title: "St Mel's Church, Killanure: re-slating", location: "St Mel's Church, Killanure", county: "Cavan", sent: -239, margin: 20, won: false, target: 188000, source: "Tender", loggedBy: T },
  { n: 124, clientId: "c-05", kind: "sash", title: "3 Fitzgarret Square: sash windows", location: "3 Fitzgarret Square", county: "Dublin", sent: -236, margin: 28, won: false, target: 22400, source: "Existing client", loggedBy: N },
  { n: 125, clientId: "c-11", kind: "render", title: "Rosmore Abbey guest house: lime render", location: "Rosmore Abbey", county: "Wexford", sent: -224, margin: 24, won: false, target: 58700, source: "Existing client", loggedBy: TM },
  { n: 126, clientId: "c-04", kind: "wall", title: "Dunmoy Town Walls: section 2 consolidation", location: "Abbey Lane, Dunmoy", county: "Roscommon", sent: -221, margin: 21, won: false, target: 121000, source: "Tender", loggedBy: T },
  { n: 127, clientId: "c-03", kind: "timber", title: "Ballyfinn Mill loft: floor repairs", location: "The Old Corn Mill, Ballyfinn", county: "Clare", sent: -216, margin: 22, won: false, target: 47300, source: "Existing client", loggedBy: A },
  { n: 128, clientId: "c-12", kind: "render", title: "Kilbrack House Hotel: dining room ceilings", location: "Kilbrack House Hotel, Ventry Road", county: "Kerry", sent: -211, margin: 26, won: false, target: 36800, source: "Existing client", loggedBy: N },
  { n: 129, clientId: "c-06", kind: "facade", title: "Carrowbeg Courthouse: stone repairs", location: "Courthouse, Carrowbeg", county: "Mayo", sent: -208, margin: 18, won: false, target: 164000, source: "Tender", loggedBy: T },
  { n: 130, clientId: "c-07", kind: "brick", title: "Harcourt House: brick repointing", location: "Harcourt House, The Quay", county: "Waterford", sent: -203, margin: 20, won: false, target: 74500, source: "Existing client", loggedBy: A },
  { n: 131, clientId: "c-10", kind: "slate", title: "Inishbeg Boathouse: roof repairs", location: "Inishbeg Boathouse", county: "Donegal", sent: -198, margin: 23, won: false, target: 41200, source: "Existing client", loggedBy: A },
  { n: 132, clientId: "c-01", kind: "render", title: "Rathdoon Parochial House: lime render", location: "Parochial House, Church Road, Rathdoon", county: "Kildare", sent: -192, margin: 25, won: false, target: 52600, source: "Existing client", loggedBy: TM },
  { n: 133, clientId: "c-04", kind: "repoint", title: "Dunmoy Bridewell: gate piers", location: "Gaol Lane, Dunmoy", county: "Roscommon", sent: -187, margin: 27, won: false, target: 18900, source: "Tender", loggedBy: T },
  { n: 134, clientId: "c-08", kind: "sash", title: "Killanure Diocesan Office: windows", location: "Diocesan Office, Cathedral Close, Killanure", county: "Cavan", sent: -181, margin: 24, won: false, target: 33100, source: "Phone", loggedBy: N },
  { n: 135, clientId: "c-06", kind: "wall", title: "Ballyhale Bridge, Carrowbeg: parapets", location: "Ballyhale Bridge, Carrowbeg", county: "Mayo", sent: -174, margin: 20, won: false, target: 61800, source: "Tender", loggedBy: T },
  { n: 136, clientId: "c-02", kind: "timber", title: "Ardmullen House: library floor", location: "Ardmullen House, Kilcolgan", county: "Galway", sent: -168, margin: 26, won: false, target: 44600, source: "Existing client", loggedBy: TM },
  { n: 137, clientId: "c-03", kind: "repoint", title: "Ballyfinn chapel: repointing", location: "Chapel Lane, Ballyfinn", county: "Clare", sent: -160, margin: 23, won: false, target: 39400, source: "Architect referral", loggedBy: A },
  { n: 138, clientId: "c-05", kind: "facade", title: "18 Fitzgarret Square: portico", location: "18 Fitzgarret Square", county: "Dublin", sent: -152, margin: 22, won: false, target: 57200, source: "Existing client", loggedBy: N },
  { n: 139, clientId: "c-07", kind: "render", title: "Granary Quay block A: internal lime plaster", location: "Granary Quay, Passage East", county: "Waterford", sent: -145, margin: 16, won: false, target: 88300, source: "Existing client", loggedBy: A },
  { n: 140, clientId: "c-04", kind: "facade", title: "Dunmoy Market House: façade cleaning", location: "Market House, Dunmoy", county: "Roscommon", sent: -138, margin: 20, won: false, target: 71900, source: "Tender", loggedBy: T },
  { n: 141, clientId: "c-11", kind: "wall", title: "Rosmore Abbey: precinct wall", location: "Rosmore Abbey", county: "Wexford", sent: -128, margin: 22, won: false, target: 66400, source: "Existing client", loggedBy: TM },
  { n: 142, clientId: "c-06", kind: "slate", title: "Carrowbeg Library: roof repairs", location: "Library, Carrowbeg", county: "Mayo", sent: -119, margin: 19, won: false, target: 83700, source: "Tender", loggedBy: T },
  { n: 143, clientId: "c-12", kind: "sash", title: "Kilbrack House Hotel: east wing windows", location: "Kilbrack House Hotel, Ventry Road", county: "Kerry", sent: -108, margin: 25, won: false, target: 41800, source: "Existing client", loggedBy: N },
  { n: 144, clientId: "c-08", kind: "repoint", title: "Killanure Cathedral tower: repointing", location: "Cathedral Close, Killanure", county: "Cavan", sent: -101, margin: 18, won: false, target: 154000, source: "Tender", loggedBy: T },
];

/**
 * The year's tenders before today's pipeline, with their enquiries. They have their own random
 * sequence and number below today's (Q-2601 and ENQ-1401 stay where they are), so nothing in
 * today's sample data moves. Lost tenders are answered a week or three after going out.
 */
export function seedPastCommercial(r: Rng, today: string, targets: Map<number, number>) {
  const quotes: Quote[] = [];
  const enquiries: Enquiry[] = [];
  for (const q of PAST) {
    const id = `q-${q.n}`;
    const enqId = `e-${q.n}`;
    const lines = linesFor(r, q.kind, targets.get(q.n) ?? q.target ?? 40000, id);
    const sell = quoteTotal(lines);
    const sentDay = workdays(today, q.sent);
    const responded = workdays(sentDay, q.won ? r.int(3, 7) : r.int(6, 16));
    quotes.push({ id, ref: "", enquiryId: enqId, clientId: q.clientId, title: q.title, status: q.won ? "Accepted" : "Declined", lines, costing: costingFor(q.kind, sell, q.margin), sentAt: at(sentDay, "16:20"), openedAt: at(workdays(sentDay, 1), "09:40"), respondedAt: at(responded, "11:15"), poNumber: q.po, validDays: 60, drafted: false, kind: WORK[q.kind].title });
    enquiries.push({ id: enqId, ref: "", receivedAt: at(workdays(sentDay, -r.int(4, 9)), "10:05"), source: q.source, loggedBy: q.loggedBy, clientId: q.clientId, contactName: CLIENTS.find((c) => c.id === q.clientId)!.contactName, location: q.location, county: q.county, description: ((d) => d.charAt(0).toUpperCase() + d.slice(1))(q.title.split(": ")[1] ?? q.title), status: q.won ? "Won" : "Lost", quoteId: id, notes: "" });
  }
  // Numbered in the order they went out, below today's first quote and enquiry.
  [...quotes].sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? "")).forEach((q, i) => (q.ref = `Q-${2601 - quotes.length + i}`));
  [...enquiries].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)).forEach((e, i) => (e.ref = `ENQ-${1401 - enquiries.length + i}`));
  return { quotes, enquiries };
}

/** When the two newest quotes' enquiries came in: from the emails in the inbox (office.ts). */
const RECEIVED: Record<number, [days: number, time: string]> = { 19: [-1, "09:48"], 20: [0, "07:45"] };

export function seedCommercial(r: Rng, today: string, targets: Map<number, number> = new Map()) {
  const enquiries: Enquiry[] = [];
  const quotes: Quote[] = [];

  for (const q of PIPELINE) {
    const id = `q-${String(q.n).padStart(2, "0")}`;
    const enqId = `e-${String(q.n).padStart(2, "0")}`;
    const target = targets.get(q.n) ?? q.target;
    const lines = linesFor(r, q.kind, target, id, ITEMS[q.n]);
    const sell = quoteTotal(lines);
    // Quotes go out on working days; the client opens them the next working day.
    const sentDay = q.sentDaysAgo != null ? weekday(addDays(today, -q.sentDaysAgo)) : undefined;
    const answered = q.status === "Accepted" || q.status === "Declined" || q.status === "Queried";
    const opened = answered || q.status === "Opened";
    const respondedDay = sentDay && answered ? workdays(sentDay, r.int(3, 7)) : undefined;
    quotes.push({
      id,
      ref: `Q-${2600 + q.n}`,
      enquiryId: enqId,
      clientId: q.clientId,
      title: q.title,
      status: q.status,
      lines,
      costing: costingFor(q.kind, sell, q.margin),
      sentAt: sentDay ? at(sentDay, "16:20") : undefined,
      openedAt: sentDay && opened ? at(workdays(sentDay, 1), "09:40") : undefined,
      // The query on the walled garden quote is the email in the inbox from yesterday afternoon.
      respondedAt: q.responded ? at(workdays(today, q.responded[0]), q.responded[1]) : respondedDay ? at(respondedDay < today ? respondedDay : workdays(today, -1), "11:15") : undefined,
      chasedAt: q.chasedDaysAgo != null ? at(workdays(today, -q.chasedDaysAgo), "10:05") : undefined,
      poNumber: q.po,
      validDays: 60,
      drafted: q.drafted ?? false,
      query: q.query,
      kind: WORK[q.kind].title,
    });
    const fixed = RECEIVED[q.n];
    const received = fixed ? workdays(today, fixed[0]) : workdays(sentDay ?? today, -(sentDay ? r.int(4, 9) : r.int(1, 3)));
    enquiries.push({
      id: enqId,
      ref: `ENQ-${1400 + q.n}`,
      receivedAt: at(received, fixed?.[1] ?? "10:05"),
      source: q.source,
      loggedBy: q.loggedBy,
      clientId: q.clientId,
      contactName: CLIENTS.find((c) => c.id === q.clientId)!.contactName,
      location: q.location,
      county: q.county,
      description: ((d) => d.charAt(0).toUpperCase() + d.slice(1))(q.title.split(": ")[1] ?? q.title),
      status: q.enquiryStatus,
      quoteId: id,
      notes: "",
    });
  }

  // Three fresh enquiries with nothing quoted yet, each from an email or call in the inbox.
  const fresh: Omit<Enquiry, "id" | "ref" | "status" | "notes">[] = [
    { receivedAt: at(today, "08:50"), source: "Email", loggedBy: "Niamh Lavelle", clientId: "c-09", contactName: "Eleanor Prendiville", location: "Glebe House, Castlegregory", county: "Kerry", description: "Damp in the north gable. Cement render blown in places, would like it taken off and redone in lime before spring." },
    { receivedAt: at(workdays(today, -1), "14:30"), source: "Phone", loggedBy: "Niamh Lavelle", clientId: "c-04", contactName: "Fintan Garrihy", location: "Old Fever Hospital, Dunmoy", county: "Roscommon", description: "Emergency making safe after slates came down in the storm. Council needs a price for temporary works and a permanent repair." },
    { receivedAt: at(workdays(today, -5), "17:25"), source: "Existing client", loggedBy: "Aisling Rafter", clientId: "c-10", contactName: "Lorcan Vaughan", location: "Inishbeg Boathouse", county: "Donegal", description: "Slipway and boathouse walls, storm damage. Tidal working. Architect is preparing a specification." },
  ];
  fresh.forEach((e, i) => enquiries.push({ ...e, id: `e-${21 + i}`, ref: `ENQ-${1421 + i}`, status: "Logged", notes: i === 1 ? "Rang twice. Wants someone out this week." : "" }));

  // Numbered in the order they came in, as logging them would.
  enquiries.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  enquiries.forEach((e, i) => (e.ref = `ENQ-${1400 + enquiries.length - i}`));
  return { clients: CLIENTS, enquiries, quotes };
}
