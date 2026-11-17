import { invoiceNo, invoicedLine, paidLine, salesInvoiceFile } from "@/lib/billing";
import { addDays } from "@/lib/dates";
import { money0, r2 } from "@/lib/money";
import { labourCost, scopePercent } from "@/lib/project-costs";
import { dashboardNumbers } from "../kpis";
import { basicHours } from "@/lib/payroll";
import { needsSignOff } from "@/lib/purchases";
import { workWeek } from "@/lib/week";
import type { Activity, Approval, Attendance, Automation, Client, DayInstruction, Db, Expense, FileItem, HiredPlant, Mail, PayrollCheck, PayrollExport, Person, Project, SalesInvoice, ScopeTask, SiteAccess, SupplierInvoice } from "../types";
import type { Craft, ProjectMeta } from "./projects";
import { type Rng, at, lastWeekday, weekday, workdays } from "./util";

// ── Files ─────────────────────────────────────────────────────────────────────

const PHOTOS: Record<Craft, { before: string[]; during: string[]; video: string; after: string[] }> = {
  masonry: { before: ["Elevation before works", "Open joints and cement patching", "Weathered stone, detail"], during: ["Scaffold complete", "Sample panels for approval", "Raking out in progress", "Defect found on opening up"], video: "Walk round with the architect", after: ["Elevation complete", "Finished pointing, detail", "Site cleared"] },
  wall: { before: ["Wall before works", "Collapsed section and loose stone", "Vegetation in the joints"], during: ["Protection and fencing in place", "Unstable section taken down", "Rebuilding in lime", "Defect found on opening up"], video: "Walk round with the engineer", after: ["Wall complete", "Copings, detail", "Site cleared"] },
  brick: { before: ["Brickwork before works", "Cement pointing and spalled bricks", "Existing joints, detail"], during: ["Scaffold complete", "Mortar sample panel", "Raking out by hand", "Defect found on opening up"], video: "Walk round with the architect", after: ["Brickwork complete", "Finished joints, detail", "Site cleared"] },
  roof: { before: ["Roof before works", "Slipped and broken slates", "Rafter ends, detail"], during: ["Scaffold and temporary roof", "Roof stripped, slates stacked", "Rafter repairs in progress", "Defect found on opening up"], video: "Walk round with the engineer", after: ["Roof complete", "Leadwork, detail", "Site cleared"] },
  sash: { before: ["Windows before works", "Rotten sill, detail", "Broken cords and panes"], during: ["Sashes in the workshop", "Splice repair to a sill", "Reglazing in cylinder glass", "Defect found on opening up"], video: "Walk round with the client", after: ["Windows complete", "Painted sash, detail", "Site cleared"] },
  render: { before: ["Elevation before works", "Blown cement render", "Substrate, detail"], during: ["Scaffold complete", "Render removed", "Scratch coat on", "Defect found on opening up"], video: "Walk round with the architect", after: ["Elevation complete", "Limewash finish, detail", "Site cleared"] },
  timber: { before: ["Floors before works", "Decayed joist ends", "Beam bearing, detail"], during: ["Propping in place", "Floorboards lifted and numbered", "Joist repairs in progress", "Defect found on opening up"], video: "Walk round with the engineer", after: ["Floors complete", "Repaired joist, detail", "Areas handed back"] },
};
const REPORT: Record<Craft, string> = { masonry: "Mortar analysis report", wall: "Mortar analysis report", brick: "Mortar analysis report", render: "Lime and substrate report", roof: "Roof and timber survey", sash: "Window survey", timber: "Structural engineer's report" };

/** Working days from one date to another (0 on the same day). */
function span(from: string, to: string) {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) if (![0, 6].includes(new Date(`${addDays(d, 1)}T12:00:00Z`).getUTCDay())) n++;
  return n;
}

export function seedFiles(r: Rng, today: string, projects: Project[], meta: Map<string, ProjectMeta>, names: Map<string, string>, handoverPending: Set<string>) {
  const files: FileItem[] = [];
  let n = 0;
  const add = (f: Omit<FileItem, "id" | "tone">) => files.push({ ...f, id: `f-${++n}`, tone: n % 6 });
  const notAfter = (d: string) => (d > today ? today : d);

  for (const p of projects) {
    const m = meta.get(p.code)!;
    const sm = names.get(p.siteManagerId)!;
    const cm = names.get(p.contractsManagerId)!;
    const base = { projectId: p.id, source: "Upload" as const };
    const doc = (k: number) => notAfter(workdays(m.created, k));
    add({ ...base, folder: "Drawings", name: `${p.code}-A-101 Elevations as existing.pdf`, kind: "drawing", category: "Drawings", sizeKb: r.int(900, 4200), modified: doc(1), addedBy: cm });
    add({ ...base, folder: "Drawings", name: `${p.code}-A-204 Repair schedule.pdf`, kind: "drawing", category: "Drawings", sizeKb: r.int(700, 2600), modified: doc(3), addedBy: cm });
    add({ ...base, folder: "Method statements", name: `${p.code} Method statement.docx`, kind: "doc", category: "Method statements", sizeKb: r.int(120, 480), modified: doc(5), addedBy: cm });
    add({ ...base, folder: "Method statements", name: `${p.code} Risk assessment.pdf`, kind: "pdf", category: "Health and safety", sizeKb: r.int(180, 640), modified: doc(5), addedBy: "Declan Furey" });
    add({ ...base, folder: "Conservation", name: `${p.code} Conservation officer approval.pdf`, kind: "pdf", category: "Conservation reports", sizeKb: r.int(90, 300), modified: doc(7), addedBy: cm });
    add({ ...base, folder: "Conservation", name: `${p.code} ${REPORT[m.craft]}.pdf`, kind: "pdf", category: "Conservation reports", sizeKb: r.int(400, 1500), modified: doc(8), addedBy: cm });
    add({ ...base, folder: "Correspondence", name: `Programme and access, ${p.name}.msg`, kind: "email", category: "Correspondence", sizeKb: r.int(40, 180), modified: doc(9), addedBy: cm, source: "Email" });
    add({ ...base, folder: "Commercial", name: `${p.code} Cost tracker.xlsx`, kind: "sheet", category: "Unclassified", sizeKb: r.int(60, 240), modified: p.status === "Live" ? workdays(today, -r.int(1, 6)) : p.status === "Not started" ? doc(4) : p.endDate, addedBy: "Colm Henebry" });
    if (p.status === "Not started") continue;

    const last = p.status === "Live" ? today : p.endDate;
    const days = span(p.startDate, last);
    const set = PHOTOS[m.craft];
    const photo = (stage: FileItem["stage"], caption: string, frac: number, video = false) =>
      add({ ...base, folder: "Photos and videos", name: `${caption}${video ? ".mp4" : ".jpg"}`, kind: video ? "video" : "image", category: "Photos and videos", stage, caption, sizeKb: video ? r.int(18000, 64000) : r.int(1800, 5200), modified: workdays(p.startDate, Math.round(days * frac)), addedBy: sm, source: "Site app" });
    set.before.forEach((c, i) => photo("Before", c, i * 0.02));
    // A live site keeps sending photos, so its newest is from the last day or two.
    const live = p.status === "Live";
    photo("During", set.during[0]!, live ? 0.2 : 0.15);
    photo("During", set.during[1]!, live ? 0.45 : 0.3);
    photo("During", set.during[2]!, live ? 0.7 : 0.5);
    photo("During", set.video, live ? 0.82 : 0.6, true);
    photo("During", set.during[3]!, live ? Math.max(0, days - 1) / Math.max(1, days) : 0.7);
    if (p.status !== "Live") {
      set.after.forEach((c, i) => photo("After", c, 0.97 + i * 0.015));
      // The pack exists once the handover has gone, or is drafted and waiting for approval.
      if (p.handoverSentAt || handoverPending.has(p.code)) add({ ...base, folder: "Handover", name: `${p.code} Handover pack.pdf`, kind: "pdf", category: "Handover", sizeKb: r.int(3000, 9000), modified: p.handoverSentAt ? p.handoverSentAt.slice(0, 10) : notAfter(workdays(p.endDate, 2)), addedBy: cm });
    }
  }

  // The general area: things emailed in that nobody has filed yet.
  const loose: [string, FileItem["kind"], number, string][] = [
    ["Scaffold handover certificate.pdf", "pdf", 0, "Corrib Scaffolding"],
    ["Delivery docket 44871.jpg", "image", 0, "Pat Scully"],
    ["Revised window schedule rev C.pdf", "drawing", -1, "Duggan Conservation Architects"],
    ["Lime putty batch certificate.pdf", "pdf", -2, "Burren Lime and Stone Supplies"],
    ["Photo from site, no caption.jpg", "image", -2, "Thiago Barbosa"],
    ["Scanned document 0042.pdf", "pdf", -4, "Office scanner"],
  ];
  for (const [name, kind, d, by] of loose) add({ projectId: null, folder: "General to be sorted", name, kind, category: "Unclassified", sizeKb: r.int(80, 2400), modified: workdays(today, d), addedBy: by, source: "Email" });

  return files;
}

// ── Money ─────────────────────────────────────────────────────────────────────

type Line = [description: string, unit: string, rate: number, share: number];
type Bill = { supplier: string; category: SupplierInvoice["allocations"][number]["category"]; lines: Line[]; share: number };

const WEST = new Set(["Galway", "Clare", "Mayo", "Donegal", "Roscommon", "Kerry", "Cavan"]);
const skip = (county: string): Bill => ({ supplier: WEST.has(county) ? "Western Skip Hire" : "Leinster Skip and Waste", category: "other", lines: [["6 cubic yard skip exchanges", "no.", 285, 1]], share: 0.08 });
const haulage: Bill = { supplier: "Midland Haulage", category: "transport", lines: [["Haulage of materials to site", "loads", 240, 1]], share: 0.07 };
const scaffold = (county: string): Bill => ({ supplier: WEST.has(county) ? "Corrib Scaffolding" : "Midland Access Hire", category: "plant", lines: [["Scaffold hire", "weeks", WEST.has(county) ? 620 : 740, 1]], share: 0.15 });

/** Who invoices each kind of job, and for what. Shares add up to 1 with the skip, haulage and scaffold bills. */
const BILLS: Record<Craft, Bill[]> = {
  masonry: [
    { supplier: "Burren Lime and Stone Supplies", category: "material", lines: [["NHL 3.5 natural hydraulic lime", "bags", 21.5, 0.55], ["Washed sharp sand", "tonnes", 62, 0.3], ["Matching limestone for indents", "m³", 1850, 0.15]], share: 0.48 },
    { supplier: "Kinvara Stone Carvers", category: "labour", lines: [["Indent stones carved to template", "no.", 310, 1]], share: 0.22 },
  ],
  wall: [
    { supplier: "Burren Lime and Stone Supplies", category: "material", lines: [["NHL 5 natural hydraulic lime", "bags", 23, 0.6], ["Washed sharp sand", "tonnes", 62, 0.4]], share: 0.4 },
    { supplier: "Owenmore Quarry", category: "material", lines: [["Rubble stone, local", "tonnes", 145, 0.85], ["Lime concrete, mixed to order", "m³", 210, 0.15]], share: 0.3 },
  ],
  brick: [
    { supplier: "Burren Lime and Stone Supplies", category: "material", lines: [["NHL 3.5 natural hydraulic lime", "bags", 21.5, 0.6], ["Washed sharp sand", "tonnes", 62, 0.4]], share: 0.42 },
    { supplier: "Dublin Reclaimed Brick", category: "material", lines: [["Reclaimed handmade brick", "no.", 1.85, 1]], share: 0.28 },
  ],
  roof: [
    { supplier: "Moher Slate Merchants", category: "material", lines: [["Natural slate 500 x 250", "thousand", 2950, 1]], share: 0.36 },
    { supplier: "Slieve Bloom Sawmills", category: "material", lines: [["Treated battens 50 x 25", "m", 1.46, 0.55], ["Douglas fir, 225 x 100", "m", 134, 0.45]], share: 0.18 },
    { supplier: "Atlantic Lead and Copper", category: "material", lines: [["Code 5 lead sheet", "rolls", 410, 0.8], ["Copper nails and clips", "lots", 145, 0.2]], share: 0.16 },
  ],
  sash: [
    { supplier: "Slieve Bloom Sawmills", category: "material", lines: [["Joinery-grade redwood", "m³", 1150, 1]], share: 0.3 },
    { supplier: "Liffey Linseed Paints", category: "material", lines: [["Linseed oil paint", "litres", 22.6, 0.8], ["Linseed putty", "kg", 9.5, 0.2]], share: 0.22 },
    { supplier: "Clearwater Cylinder Glass", category: "material", lines: [["Cylinder glass, cut to size", "m²", 138, 1]], share: 0.18 },
  ],
  render: [
    { supplier: "Burren Lime and Stone Supplies", category: "material", lines: [["Lime putty, matured", "tubs", 34, 0.55], ["Goat hair", "kg", 18.2, 0.1], ["Riven oak laths", "bundles", 11, 0.15], ["Washed sharp sand", "tonnes", 62, 0.2]], share: 0.6 },
    { supplier: "Clare Lime Craft", category: "material", lines: [["Hessian and curing sheets", "rolls", 38, 0.5], ["Plastering tools and consumables", "lots", 145, 0.5]], share: 0.1 },
  ],
  timber: [
    { supplier: "Slieve Bloom Sawmills", category: "material", lines: [["Reclaimed pitch pine joists", "m", 48, 0.6], ["Oak bearers, 200 x 200", "m", 165, 0.4]], share: 0.5 },
    { supplier: "Ardfert Structural Supplies", category: "material", lines: [["Resin anchors and stainless fixings", "lots", 145, 1]], share: 0.2 },
  ],
};

/** Supplier invoice numbers, counting back from the newest so they rise with the dates. */
const NUMBERS: Record<string, [prefix: string, newest: number]> = {
  "Burren Lime and Stone Supplies": ["BLS-", 20417],
  "Corrib Scaffolding": ["CS-INV-", 9914],
  "Moher Slate Merchants": ["MSM-", 5521],
  "Shannonside Plant Hire": ["SPH-INV-", 60233],
  "Leinster Skip and Waste": ["LSW-", 30087],
  "Midland Access Hire": ["MAH-", 88120],
  "Slieve Bloom Sawmills": ["SBS-", 7742],
  "Kinvara Stone Carvers": ["KSC-", 318],
  "Liffey Linseed Paints": ["LLP-", 11406],
  "Western Skip Hire": ["WSH-", 4417],
  "Midland Haulage": ["MH-", 2290],
  "Dublin Reclaimed Brick": ["DRB-", 1185],
  "Atlantic Lead and Copper": ["ALC-", 6620],
  "Clearwater Cylinder Glass": ["CCG-", 873],
  "Clare Lime Craft": ["CLC-", 2214],
  "Owenmore Quarry": ["OQ-", 7731],
  "Ardfert Structural Supplies": ["ASS-", 3302],
};

type Ctx = { projects: Project[]; meta: Map<string, ProjectMeta>; attendance: Attendance[]; people: Person[]; scopeTasks: ScopeTask[]; hiredPlant: HiredPlant[]; clients: Client[]; vatPct: number };

export function seedMoney(r: Rng, today: string, ctx: Ctx) {
  const pid = (code: string) => `pr-${code}`;
  const day = (n: number) => workdays(today, n);
  const supplierVat = ctx.vatPct === 20 ? 20 : 23;
  const proj = new Map(ctx.projects.map((p) => [p.code, p]));
  type Draft = Omit<SupplierInvoice, "id" | "invoiceNo" | "vat" | "total" | "fileName"> & { invoiceNo?: string };
  const drafts: Draft[] = [];

  const add = (d: { supplier: string; no?: string; date: string; job: string | null; status: SupplierInvoice["readStatus"]; lines: [string, number][]; alloc?: [code: string, category: SupplierInvoice["allocations"][number]["category"], amount: number][]; credit?: boolean; subtotal?: number; time?: string }) => {
    const subtotal = d.subtotal ?? r2(d.lines.reduce((s, [, a]) => s + a, 0));
    const received = workdays(d.date, 1) > today ? today : workdays(d.date, 1);
    const confirmedOn = workdays(received, r.int(1, 2)) > today ? today : workdays(received, 1);
    drafts.push({
      supplier: d.supplier,
      invoiceNo: d.no,
      invoiceDate: d.date,
      docType: d.credit ? "credit_note" : "invoice",
      subtotal,
      jobRef: d.job,
      receivedAt: at(received, d.time ?? "08:15"),
      readStatus: d.status,
      lines: d.lines.map(([description, amount]) => ({ description, amount })),
      allocations: (d.alloc ?? []).map(([code, category, amount], j) => ({ id: "", projectId: pid(code), category, amount, description: d.lines[j]?.[0] ?? d.lines[0]?.[0] ?? "" })),
      confirmedBy: d.status === "confirmed" ? "Maeve Quirke" : undefined,
      confirmedAt: d.status === "confirmed" ? at(confirmedOn, "10:30") : undefined,
    });
  };

  // The newest paperwork, still to be checked, plus a credit note and the traffic lights.
  add({ supplier: "Burren Lime and Stone Supplies", no: "BLS-20417", date: day(-3), job: "C719", status: "needs_review", lines: [["NHL 3.5 natural hydraulic lime, 60 bags", 1290], ["Washed sharp sand, 12 tonnes", 744], ["Delivery, Rathdoon", 352.5]] });
  add({ supplier: "Corrib Scaffolding", no: "CS-INV-9914", date: day(-4), job: "C721", status: "needs_review", lines: [["Temporary roof hire, 2 weeks", 1760], ["Tower scaffold hire, 2 weeks", 1240], ["Scaffold inspections and tags, 2 weeks", 100]] });
  add({ supplier: "Moher Slate Merchants", no: "MSM-5521", date: day(-2), job: null, status: "needs_review", lines: [["Natural slate 500 x 250, 3,000 no.", 8850]] });
  // These two came in this morning after the reader's 08:00 run, so they wait for the next one.
  add({ supplier: "Shannonside Plant Hire", no: "SPH-INV-60233", date: day(-1), job: "C720", status: "not_read", lines: [], subtotal: 585, time: "08:41" });
  add({ supplier: "Leinster Skip and Waste", no: "LSW-30087", date: day(-1), job: "C723", status: "not_read", lines: [], subtotal: 285, time: "08:47" });
  add({ supplier: "Burren Lime and Stone Supplies", no: "BLS-CN-0061", date: day(-26), job: "C719", status: "confirmed", credit: true, lines: [["Credit: 10 bags NHL 3.5 returned unopened", 215]], alloc: [["C719", "material", 215]] });
  add({ supplier: "Shannonside Plant Hire", no: "SPH-INV-59870", date: day(-5), job: "C724", status: "confirmed", lines: [["Traffic lights hire, 1 week", 165], ["Delivery and collection", 90]], alloc: [["C724", "plant", 165], ["C724", "transport", 90]] });
  const covered = new Set(["hp-5", "hp-6", "hp-7"]);

  // Hire, invoiced every four weeks in arrears, up to the period the newest paperwork covers.
  for (const h of ctx.hiredPlant) {
    if (covered.has(h.id)) continue;
    const code = ctx.projects.find((p) => p.id === h.projectId)!.code;
    const until = h.collectedAt ? h.collectedAt.slice(0, 10) : day(-6);
    for (let from = h.onHireFrom; ; ) {
      const to = workdays(from, 19);
      const end = to > until ? until : to;
      const weeks = Math.max(1, Math.round(span(from, end) / 5));
      if (end <= from || (to > until && !h.collectedAt)) break;
      const amount = r2(h.rateUnit === "week" ? h.rate * h.quantity * weeks : h.rate * h.quantity * weeks * 7);
      add({ supplier: h.hireCompany, date: workdays(end, 1) > today ? today : workdays(end, 1), job: code, status: "confirmed", lines: [[`${h.description}${h.quantity > 1 ? `, ${h.quantity} no.` : ""}, ${weeks} week${weeks === 1 ? "" : "s"}`, amount]], alloc: [[code, "plant", amount]] });
      if (to >= until) break;
      from = workdays(to, 1);
    }
  }

  // Everything else each job has bought so far, built so its margin lands where the story has it.
  const rate = new Map(ctx.people.map((p) => [p.id, p.hourlyRate]));
  for (const p of ctx.projects) {
    if (p.status === "Not started") continue;
    const m = ctx.meta.get(p.code)!;
    const labour = labourCost(ctx.attendance.filter((a) => a.projectId === p.id).map((a) => ({ status: a.status, overtimeHours: a.overtimeHours, overtimeRate: a.overtimeRate, hourlyRate: rate.get(a.personId) ?? 0 })));
    const pct = p.status === "Live" ? scopePercent(ctx.scopeTasks.filter((t) => t.projectId === p.id)) : 100;
    const earned = ((p.value ?? 0) * pct) / 100;
    const known = drafts.filter((d) => d.readStatus === "confirmed").flatMap((d) => d.allocations.filter((a) => a.projectId === p.id).map((a) => (d.docType === "credit_note" ? -a.amount : a.amount))).reduce((s, x) => s + x, 0);
    const fill = earned * (1 - (m.margin + (r.next() - 0.5) * 1.6) / 100) - labour - known;
    if (fill < 400) continue;
    const hired = ctx.hiredPlant.some((h) => h.projectId === p.id);
    const bills = [...BILLS[m.craft], skip(p.county), haulage, ...(hired ? [] : [scaffold(p.county)])];
    const totalShare = bills.reduce((s, b) => s + b.share, 0);
    const last = p.status === "Live" ? day(-7) : p.endDate;
    const days = span(m.startDate, last);
    bills.forEach((b, i) => {
      const amount = (fill * b.share) / totalShare;
      // Bigger bills come in two or three deliveries across the job, of different sizes.
      const parts = amount > 6000 ? 3 : amount > 2500 ? 2 : 1;
      const weights = Array.from({ length: parts }, () => 0.7 + r.next() * 0.6);
      const sum = weights.reduce((s, w) => s + w, 0);
      for (let k = 0; k < parts; k++) {
        const part = (amount * weights[k]!) / sum;
        const bought = b.lines.map(([desc, unit, unitRate, share]) => [desc, unit, unitRate, Math.round((part * share) / unitRate)] as const);
        // Something too small to buy is left off; a delivery always has at least one thing on it.
        const kept = bought.filter(([, , , qty]) => qty > 0);
        const first = bought[0]!;
        const chosen = kept.length ? kept : [[first[0], first[1], first[2], 1] as const];
        const lines = chosen.map(([desc, unit, unitRate, qty]) => [`${desc}, ${qty.toLocaleString("en-IE")} ${unit}`, r2(qty * unitRate)] as [string, number]);
        const frac = (k + 1) / (parts + 1) - 0.08 + ((i % 3) * 0.05);
        const date = workdays(m.startDate, Math.max(2, Math.round(days * Math.min(0.97, frac))));
        add({ supplier: b.supplier, date: weekday(date > last ? last : date), job: r.chance(0.85) ? p.code : null, status: "confirmed", lines, alloc: lines.map(([, a]) => [p.code, b.category, a]) });
      }
    });
  }

  // Number each supplier's invoices in date order, counting back from its newest known number.
  const bySupplier = new Map<string, Draft[]>();
  for (const d of drafts) bySupplier.set(d.supplier, [...(bySupplier.get(d.supplier) ?? []), d]);
  for (const [supplier, list] of bySupplier) {
    const [prefix, newest] = NUMBERS[supplier] ?? ["INV-", 1000];
    const taken = new Set(list.filter((d) => d.invoiceNo).map((d) => d.invoiceNo));
    let next = newest;
    for (const d of [...list].filter((x) => !x.invoiceNo).sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))) {
      do next -= r.int(3, 17);
      while (taken.has(`${prefix}${next}`));
      d.invoiceNo = `${prefix}${next}`;
    }
  }

  drafts.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || (a.invoiceNo ?? "").localeCompare(b.invoiceNo ?? ""));
  const supplierInvoices: SupplierInvoice[] = drafts.map((d, i) => {
    const vat = r2((d.subtotal * supplierVat) / 100);
    return { ...d, id: `si-${i + 1}`, invoiceNo: d.invoiceNo!, vat, total: r2(d.subtotal + vat), fileName: `${d.supplier} ${d.invoiceNo}.pdf`, allocations: d.allocations.map((a, j) => ({ ...a, id: `al-${i + 1}-${j + 1}` })) };
  });

  // Sales invoices: stage payments as the work reaches milestones, final accounts once it is done.
  const salesInvoices = seedSales(r, today, ctx, proj);
  return { supplierInvoices, salesInvoices };
}

function seedSales(r: Rng, today: string, ctx: Ctx, proj: Map<string, Project>) {
  const terms = (p: Project) => ctx.clients.find((c) => c.id === p.clientId)?.termsDays ?? 30;
  const taskDone = (code: string, n: number) => {
    const t = ctx.scopeTasks.filter((x) => x.projectId === `pr-${code}`)[n - 1];
    return t?.completedAt?.slice(0, 10);
  };
  type S = { code: string; description: string; share: number; status: SalesInvoice["status"]; issued?: string; paid?: boolean; holdReason?: string; raised: string };
  const rows: S[] = [];
  const final = (code: string, status: S["status"], opts: { issuedAfter?: number; paid?: boolean; holdReason?: string } = {}) => {
    const p = proj.get(code)!;
    rows.push({ code, description: "Final account", share: 1, status, issued: opts.issuedAfter != null ? workdays(p.endDate, opts.issuedAfter) : undefined, paid: opts.paid, holdReason: opts.holdReason, raised: workdays(p.endDate, 1) });
  };
  const stage = (code: string, n: number, after: number, from: number, description: string, status: S["status"], paid = false) => {
    const done = taskDone(code, after)!;
    const total = ctx.scopeTasks.filter((x) => x.projectId === `pr-${code}`).length;
    const issued = workdays(done, 2) > today ? today : workdays(done, 2);
    rows.push({ code, description: `Stage payment ${n}: ${description}`, share: (after - from) / total, status, issued: status === "To invoice" ? undefined : issued, paid, raised: issued });
  };

  final("C709", "Paid", { issuedAfter: 3, paid: true });
  final("C710", "Paid", { issuedAfter: 3, paid: true });
  final("C712", "Paid", { issuedAfter: 3, paid: true });
  final("C711", "Invoiced", { issuedAfter: 4 });
  final("C713", "Invoiced", { issuedAfter: 6 });
  stage("C719", 1, 4, 0, "scaffold and north elevation", "Paid", true);
  stage("C720", 1, 4, 0, "render removal and first coats", "Invoiced");
  stage("C721", 1, 2, 0, "temporary roof and strip", "Invoiced");
  stage("C722", 1, 2, 0, "scaffold and cleaning trials", "Invoiced");
  stage("C719", 2, 6, 4, "west elevation", "Invoiced");
  final("C714", "To invoice");
  final("C717", "To invoice");
  stage("C723", 1, 4, 0, "rear elevation and railings", "To invoice");
  final("C715", "Held", { holdReason: "Extras to be agreed: lime concrete footing to the collapsed section" });
  final("C716", "Held", { holdReason: "Snagging open: two sashes sticking after painting" });

  rows.sort((a, b) => (a.issued ?? a.raised).localeCompare(b.issued ?? b.raised));
  let accounts = 10400;
  // Maeve sends a month's invoices to the accounts package on the first Tuesday of the next month.
  const exportDay = (issued: string) => {
    const [y, m] = issued.split("-").map(Number) as [number, number];
    let d = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = addDays(d, 1);
    return d < today ? d : undefined;
  };
  return rows.map((s, i): SalesInvoice => {
    const p = proj.get(s.code)!;
    const net = r2(Math.round(((p.value ?? 0) * s.share) / 10) * 10);
    const dueOn = s.issued ? addDays(s.issued, terms(p)) : undefined;
    const paidOn = s.paid && s.issued ? weekday(addDays(s.issued, terms(p) - r.int(1, 6))) : undefined;
    const paid = !!paidOn && paidOn < today;
    const exported = s.issued ? exportDay(s.issued) : undefined;
    return {
      id: `inv-${i + 1}`,
      ref: `INV-${5201 + i}`,
      projectId: p.id,
      clientId: p.clientId,
      description: s.description,
      net,
      vatPct: ctx.vatPct,
      // A payment not due in yet leaves the invoice outstanding.
      status: s.status === "Paid" && !paid ? "Invoiced" : s.status,
      holdReason: s.holdReason,
      issuedOn: s.issued,
      dueOn,
      paidOn: paid ? paidOn : undefined,
      accountsNo: s.issued ? `SI-${++accounts}` : undefined,
      exportedAt: exported ? at(exported, "14:20") : undefined,
    };
  });
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

/** "Monday 30 November", as a person writes it in an email. */
const spoken = (d: string) => {
  const date = new Date(`${d}T12:00:00Z`);
  const o = (x: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-IE", { ...x, timeZone: "UTC" });
  return `${o({ weekday: "long" })} ${o({ day: "numeric", month: "long" })}`;
};

/** The shared inbox. `leave` is the week Sinéad asks for, so her email and the holiday request agree. */
export function seedMail(today: string, domain: string, leave: { from: string; to: string }): Mail[] {
  const day = (n: number) => workdays(today, n);
  const m = (id: number, d: number, time: string, mailbox: string, fromName: string, fromAddress: string, intent: Mail["intent"], routedToId: string, subject: string, body: string, reply: string, extra: Partial<Mail> = {}): Mail => ({
    id: `mail-${id}`,
    mailbox: `${mailbox}@${domain}`,
    folder: "Inbox",
    fromName,
    fromAddress,
    subject,
    body,
    receivedAt: at(day(d), time),
    read: d < -1,
    intent,
    routedToId,
    replyDraft: { subject: `RE: ${subject}`, body: reply },
    ...extra,
  });
  return [
    m(1, 0, "08:50", "info", "Eleanor Prendiville", "eleanor.prendiville@mailbox.example", "Enquiry", "p-cm1",
      "Damp in the north gable at Glebe House",
      "Good morning,\n\nThank you again for the work on our sash windows. Two of them are still sticking, as Cathal knows.\n\nWhile we have you, we now have damp coming through the north gable. The render is cement, put on in the 1980s we think, and it has blown in several places.\n\nCould somebody look at it, and give us a price to take it off and redo it in lime before the spring?\n\nKind regards,\nEleanor Prendiville",
      "Dear Eleanor,\n\nThank you, and I'm sorry the two sashes are still sticking. Cathal will be back to ease them.\n\nCement render on a solid stone gable very often traps moisture in the way you describe. I would want to see it before pricing, and can look at the gable on the same visit: would Tuesday or Wednesday morning next week suit?\n\nKind regards,\nTadhg Morrissey",
      { clientId: "c-09" }),
    m(2, 0, "07:42", "tenders", "Bernard Mulqueen", "bmulqueen@carrowbegcoco.example", "Tender invitation", "p-qs",
      "Invitation to tender: Kilcashel Courthouse portico stone repairs",
      "Dear Sirs,\n\nCarrowbeg County Council invites tenders for conservation repairs to the portico of Kilcashel Courthouse, a protected structure. The works comprise stone repairs to four columns and the entablature, with associated leadwork.\n\nTender documents are attached. Tenders are to be returned by 12:00 noon three weeks from today. A site visit can be arranged through this office.\n\nBernard Mulqueen\nSenior Executive Architect",
      "Dear Bernard,\n\nThank you for the invitation. We confirm we intend to tender for the portico repairs at Kilcashel Courthouse and have the documents.\n\nWe would like to take up the site visit. Colm Henebry, our quantity surveyor, is free any morning next week.\n\nKind regards,\nColm Henebry",
      { clientId: "c-06", attachment: "Kilcashel Courthouse tender documents.zip", starred: true }),
    m(3, -1, "15:14", "info", "Susan Kane", "estate.office@ardmullen.example", "Quote query", "p-cm1",
      "Walled garden quote: can it be phased?",
      "Tadhg,\n\nThank you for the quote for the north wall. Could you price it in two phases, with the gateway arch first? The owner wants the arch made safe before winter and may leave the rest until next year.\n\nSusan",
      "Dear Susan,\n\nYes, that works. Phase 1 would be the gateway arch and 6 m of wall either side, which carries most of the scaffold and set-up cost. Phase 2 would be the remaining 31 m.\n\nI will send a revised quote showing both phases separately in the next few days.\n\nKind regards,\nTadhg Morrissey",
      { clientId: "c-02", starred: true }),
    m(4, -1, "11:02", "info", "Mindaugas Petrauskas", `mindaugas.petrauskas@${domain}`, "Certificate", "p-hs",
      "MEWP ticket renewed",
      "Hi Declan,\n\nI did the renewal course on Saturday. New card attached, valid for five years.\n\nMindaugas",
      "Thanks Mindaugas. I'll record the new expiry date and put the card on your file today.\n\nDeclan",
      { attachment: "MEWP operator card.jpg" }),
    m(5, -1, "09:30", "info", "Sinéad Colgan", `sinead.colgan@${domain}`, "Holiday request", "p-off",
      `Leave request, ${spoken(leave.from).replace(/^\w+ /, "")} to ${spoken(leave.to).replace(/^\w+ /, "")}`,
      `Hi Niamh,\n\nCould I book ${spoken(leave.from)} to ${spoken(leave.to)} off? My sister is getting married in Westport.\n\nThanks,\nSinéad`,
      "Hi Sinéad,\n\nThat's logged for approval. Cathal has the finish coat at Ardmullen planned for that week, so I've flagged it to him as well. You'll hear back in the next day or two.\n\nNiamh"),
    m(6, -2, "16:48", "info", "Annabel Thorpe", "athorpe@fitzgarretproperty.example", "General", "p-cm1",
      "Photo record of the front elevation for our insurers",
      "Hello,\n\nOur insurers have asked for a dated photo record of the front elevation of no. 14 before and during the repointing. Do you have one you can share?\n\nAnnabel Thorpe",
      "Dear Annabel,\n\nWe do. Every stage is photographed and dated from the site phones. I've attached the photographs of the front elevation so far, before and during. The completed set will be in your handover pack.\n\nKind regards,\nTadhg Morrissey",
      { clientId: "c-05" }),
    m(7, -2, "10:20", "info", "Imelda Fahy", "imelda.fahy@mailbox.example", "Complaint", "p-cm2",
      "Dust on Main Street from the courthouse",
      "To whom it may concern,\n\nI run the pharmacy opposite the courthouse. This morning there was stone dust across the front of the shop and on customers' cars. I understand the work has to be done but this is not acceptable.\n\nImelda Fahy",
      "Dear Ms Fahy,\n\nI'm sorry about the dust. A section of debris netting had come loose at the east end of the scaffold. It has been refixed, and cutting is now done only inside the enclosed bay with water suppression.\n\nOur site manager, Darragh Lenihan, will call in to see you. If your shopfront needs washing down, we will arrange it.\n\nYours sincerely,\nAisling Rafter"),
    m(8, -3, "14:05", "accounts", "Corrib Scaffolding accounts", "accounts@corribscaffolding.example", "Supplier statement", "p-acc",
      "Statement of account",
      "Please find attached our statement of account to date. Three invoices are outstanding. Our terms are 30 days from invoice date.\n\nAccounts department\nCorrib Scaffolding",
      "Thank you for the statement. Two of the three invoices are approved and on Friday's payment run. The third, CS-INV-9914, is being checked against the hire dockets and will follow once confirmed.\n\nMaeve Quirke",
      { attachment: "Statement.pdf" }),
    m(9, -3, "09:12", "info", "Úna Cregan", "ucregan@dunmoycoco.example", "Conservation officer", "p-cm2",
      "Courthouse: replacement cornice section approved",
      "Aisling,\n\nI inspected the first replacement cornice section, fixed as a sample, on site this morning. It is approved for the rest of the street elevation. Please do not use the poultice on the limestone columns without a further trial.\n\nÚna Cregan\nArchitectural Conservation Officer",
      "Dear Úna,\n\nThank you. Noted: the sample section is approved for the street elevation, and no poultice on the columns until a further trial is approved. I've filed your approval with the project and will add both points to the site instructions today.\n\nKind regards,\nAisling Rafter",
      { clientId: "c-04" }),
    m(10, -4, "12:36", "info", "Stephen Aylward", "s.aylward@harcourtleeson.example", "General", "p-cm2",
      "Granary Quay: permit to work for river elevation",
      "Aisling, permits for the river elevation need 48 hours' notice and a tide table attached. Please pass on to your site team.\n\nStephen",
      "Stephen, understood. Róisín has the tide tables and will raise permits 48 hours ahead from now on.\n\nAisling",
      { clientId: "c-07" }),
    m(11, -5, "17:20", "tenders", "Lorcan Vaughan", "lorcan@inishbegtrust.example", "Enquiry", "p-cm2",
      "Inishbeg Boathouse: storm damage",
      "Dear Aisling,\n\nLast month's storms took part of the slipway wall and the seaward gable of the boathouse. Our architect is preparing a specification. Would you be interested in pricing it? It is tidal working.\n\nLorcan Vaughan",
      "Dear Lorcan,\n\nWe would, and thank you for thinking of us. We know the building from the pier store. Please send the specification when it is ready, and we will arrange a visit at a low spring tide.\n\nKind regards,\nAisling Rafter",
      { clientId: "c-10" }),
    m(12, -6, "15:05", "info", "Pat Scully", `pat.scully@${domain}`, "General", "p-cm1",
      "Compressor CP1 off for repair",
      "Tadhg, CP1 lost pressure this morning and has gone to Oranmore Commercials. Back next week at the earliest. If anyone needs breakers in the meantime we will have to hire.\n\nPat",
      "Thanks Pat. Nobody has breakers planned this week. Let me know when it's back and I'll put it on the plant list for Derrybawn.\n\nTadhg"),
    // Sent and filed, so neither folder opens empty. Each matches the records and Team chat.
    { ...m(13, -4, "10:05", "orders", "Tadhg Morrissey", `orders@${domain}`, "General", "p-cm1",
      "Order for St Finian's Church: NHL 3.5",
      "Hello,\n\nPlease deliver 40 bags of NHL 3.5 to St Finian's Church, site code C719, by the end of next week. The site manager is Eoin Brosnan.\n\nThanks,\nTadhg Morrissey", ""),
      folder: "Sent", read: true, replyDraft: undefined, to: "Burren Lime and Stone Supplies" },
    { ...m(14, -1, "16:20", "info", "Niamh Lavelle", `info@${domain}`, "General", "p-off",
      "Safe Pass course: two places in January",
      "Hello,\n\nCould you book two places on the January Safe Pass course in Athlone? Names to follow by the end of the week.\n\nThanks,\nNiamh Lavelle", ""),
      folder: "Sent", read: true, replyDraft: undefined, to: "Midland Safety Training" },
    { ...m(15, -6, "11:40", "orders", "Burren Lime and Stone Supplies", "dispatch@burrenlime.example", "Supplier statement", "p-acc",
      "Delivery note: Granary Quay Warehouses",
      "Delivered today to Granary Quay Warehouses: 24 bags of NHL 2 and 1 tonne of washed sharp sand. Signed for on site.\n\nDispatch\nBurren Lime and Stone Supplies", "",
      { attachment: "Delivery note 50812.pdf" }),
      folder: "Archive", read: true, replyDraft: undefined },
  ];
}

// ── Management layer ──────────────────────────────────────────────────────────

export function seedManagement(today: string) {
  const day = (n: number) => workdays(today, n);
  const approvals: Approval[] = [
    { id: "ap-1", kind: "variation", title: "Variation: cracked quoins at belfry level", rationale: "Raised by Marek Wiśniewski from the site phone, written in Polish and translated.", createdAt: "", status: "Pending", variationId: "var-1", projectId: "pr-C719" },
    { id: "ap-2", kind: "variation", title: "Variation: rotten lintel over first floor window", rationale: "Raised by Thiago Barbosa from the site phone, written in Portuguese and translated.", createdAt: "", status: "Pending", variationId: "var-2", projectId: "pr-C720" },
    { id: "ap-3", kind: "variation", title: "Variation: extra cornice to replace, street side", rationale: "Raised by Ionuț Marin from the site phone, written in Romanian and translated.", createdAt: "", status: "Pending", variationId: "var-3", projectId: "pr-C722" },
    { id: "ap-11", kind: "variation", title: "Variation: lime concrete footing, St Colman's wall", rationale: "Raised on site by Shane Culloty, the site manager. The final account is held until it is agreed.", createdAt: "", status: "Pending", variationId: "var-5", projectId: "pr-C715" },
    { id: "ap-4", kind: "quote", title: "Quote Q-2619: Rathdoon Parish Hall windows and doors", rationale: "Drafted from the enquiry email and priced from your rates for sash window repairs.", createdAt: at(day(-1), "10:15"), status: "Pending", quoteId: "q-19" },
    { id: "ap-5", kind: "weekly_summary", title: "Weekly summary for directors", rationale: "Drafted on Friday at 07:00 from the week so far: attendance, scope progress, costs and invoices.", createdAt: at(lastWeekday(today, 5), "07:00"), status: "Pending", body: "" },
    {
      id: "ap-6", kind: "handover", title: "Handover email: Brandonmore Lodge", rationale: "Scope is fully ticked off with no extras or snagging flagged.", createdAt: "", status: "Pending", projectId: "pr-C717",
      body: "Dear Susan,\n\nThe lime render and limewash to the lodge and stable range at Brandonmore are complete.\n\nYour handover pack is attached. It holds the photo record (before, during and after), the mortar and limewash specification as applied, and care notes for the first winter. The limewash will keep hardening for some months: please avoid power washing.\n\nIf anything needs attention, tell us within ten working days and we will come back to it before the final account is issued.\n\nKind regards,\nTadhg Morrissey",
    },
    { id: "ap-7", kind: "reply", title: "Reply to Imelda Fahy: dust on Main Street", rationale: "Tagged as a complaint and routed to Aisling Rafter.", createdAt: at(day(-2), "10:22"), status: "Pending", mailId: "mail-7" },
    // Written from the training tickets in fillManagementDates, like the weekly summary.
    { id: "ap-12", kind: "cert_reminder", title: "Training ticket reminder to the site managers", rationale: "Drafted on Monday at 08:00 from every ticket that has run out or runs out within 30 days.", createdAt: at(lastWeekday(today, 1), "08:00"), status: "Pending", body: "" },
    { id: "ap-8", kind: "variation", title: "Variation: wall plate, mill race side", rationale: "Raised by Brendan Looby from the site phone.", createdAt: "", status: "Approved", variationId: "var-4", projectId: "pr-C721", resolvedBy: "Aisling Rafter", resolvedAt: at(day(-7), "09:10") },
    { id: "ap-9", kind: "handover", title: "Handover email: Abbey Mill Chimney", rationale: "Scope is fully ticked off with no extras or snagging flagged.", createdAt: "", status: "Approved", projectId: "pr-C714", resolvedBy: "Aisling Rafter", resolvedAt: "" },
    { id: "ap-10", kind: "reply", title: "Reply to a marketing email", rationale: "Tagged as general.", createdAt: at(day(-6), "09:00"), status: "Discarded", resolvedBy: "Niamh Lavelle", resolvedAt: at(day(-6), "09:20") },
  ];

  const automations: Automation[] = [
    { id: "au-1", department: "inbox", name: "Incoming email tagged and routed", when: "On new email", trigger: "An email arrives in a shared mailbox.", effect: "Tags it (enquiry, tender, certificate and so on), routes it to the right person and drafts a reply.", enabled: true, lastRun: at(today, "08:50"), runs: 412 },
    { id: "au-2", department: "sales", name: "Enquiry logged, first quote drafted", when: "On new enquiry", trigger: "An email is tagged as an enquiry.", effect: "Logs the enquiry and, where there is enough to price, drafts a quote from your rates for that kind of work. The draft waits for approval.", enabled: true, lastRun: at(today, "08:52"), runs: 37 },
    { id: "au-3", department: "sales", name: "Unanswered quote flagged", when: "Daily at 09:00", trigger: "A quote has been out for 7 days with no answer.", effect: "Puts it on Awaiting response with a reminder to chase the client contact.", enabled: true, lastRun: at(day(-1), "09:00"), runs: 58 },
    { id: "au-4", department: "projects", name: "Accepted quote becomes a project", when: "On quote accepted", trigger: "A client accepts a quote.", effect: "Creates the project with the next site code, copies the scope from the quote and names the contracts manager.", enabled: true, lastRun: "", runs: 21 },
    { id: "au-5", department: "schedule", name: "Week ahead sent to operatives", when: "Fridays at 15:00", trigger: "The week ahead is confirmed by a contracts manager.", effect: "Sends every operative their sites for next week, in their own language.", enabled: true, lastRun: at(lastWeekday(day(-1), 5), "15:00"), runs: 44 },
    { id: "au-6", department: "site", name: "Site notes translated", when: "On new site note", trigger: "An operative writes a note or raises extras in a language other than English.", effect: "Translates it to English for the office and keeps the original beside it.", enabled: true, lastRun: "", runs: 129 },
    { id: "au-7", department: "projects", name: "Extras raised: variation drafted, final account held", when: "On extras found", trigger: "Someone on site flags extra work.", effect: "Drafts a variation for approval and holds the project's final account until it is agreed.", enabled: true, lastRun: "", runs: 26 },
    { id: "au-8", department: "projects", name: "Project complete: handover pack drafted", when: "On scope complete", trigger: "The last scope item is ticked off with no extras or snagging open.", effect: "Builds the handover pack from the photo record and drafts the email to the client.", enabled: true, lastRun: "", runs: 14 },
    { id: "au-9", department: "invoicing", name: "Supplier invoice read and costed", when: "Every hour", trigger: "Each hour of the working day, for every supplier invoice emailed or uploaded since the last run.", effect: "Reads supplier, number, dates and amounts, checks the sums, and suggests which project and cost heading it belongs to.", enabled: true, lastRun: at(today, "08:00"), runs: 203 },
    { id: "au-10", department: "people", name: "Daily attendance archive", when: "Daily at 13:00", trigger: "13:00 on a working day.", effect: "Locks the day's time stamps for every site and flags any site that has not sent them.", enabled: true, lastRun: at(day(-1), "13:00"), runs: 261 },
    { id: "au-11", department: "people", name: "Training ticket reminders", when: "Mondays at 08:00", trigger: "A ticket has run out or runs out inside 30 days.", effect: "Drafts one email to the site managers listing each ticket, the person and their site. It waits in Approvals.", enabled: true, lastRun: at(lastWeekday(today, 1), "08:00"), runs: 31 },
    { id: "au-12", department: "plant", name: "Plant and vehicle renewals flagged", when: "Daily at 07:00", trigger: "A service, examination, test, tax or insurance date is inside 30 days or has passed.", effect: "Puts it on the plant overview and, if overdue, on the dashboard.", enabled: true, lastRun: at(today, "07:00"), runs: 298 },
    { id: "au-13", department: "dashboard", name: "Weekly summary for directors", when: "Fridays at 07:00", trigger: "End of the working week.", effect: "Drafts a one-page summary of progress, money and compliance for approval.", enabled: true, lastRun: at(lastWeekday(today, 5), "07:00"), runs: 43 },
    { id: "au-14", department: "portal", name: "Client told when a quote is ready", when: "On quote sent", trigger: "A quote is sent.", effect: "Shows it in the client's portal and records when they open it.", enabled: false, runs: 0 },
  ];

  return { approvals, automations };
}

/**
 * The Monday reminder to the site managers: every training ticket that has run out or runs out
 * within 30 days of that Monday, with the person's sites, so nobody works without one in date.
 */
export function ticketReminder(db: Db, monday: string) {
  const spoken = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "long", timeZone: "UTC" });
  const soon = addDays(monday, 30);
  const sites = (personId: string) => {
    const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
    const codes = db.assignments.filter((x) => x.personId === personId && live.has(x.projectId)).map((x) => db.projects.find((p) => p.id === x.projectId)!.code);
    return codes.length ? ` (${[...new Set(codes)].sort().join(", ")})` : "";
  };
  const rows = db.people
    .filter((p) => p.active)
    .flatMap((p) => p.certs.filter((c) => c.expires <= soon).map((c) => ({ p, c })))
    .sort((x, y) => x.c.expires.localeCompare(y.c.expires));
  const line = ({ p, c }: (typeof rows)[number]) => `- ${p.name}, ${p.trade.toLowerCase()}${sites(p.id)}: ${c.name}, ${c.expires < monday ? "ran out on" : "runs out on"} ${spoken(c.expires)}`;
  const gone = rows.filter((x) => x.c.expires < monday);
  const due = rows.filter((x) => x.c.expires >= monday);
  return [
    "Hello all,",
    "",
    "These training tickets have run out or run out in the next 30 days. Please make sure nobody works on site without a ticket in date, and book any renewal course through me.",
    ...(gone.length ? ["", "Run out already:", ...gone.map(line)] : []),
    ...(due.length ? ["", "Running out soon:", ...due.map(line)] : []),
    "",
    "Kind regards,",
    "Declan Furey",
    "Health and safety officer",
  ].join("\n");
}

/**
 * The directors' weekly summary, written from the records so every figure in it matches the
 * screens. `region` only picks the currency sign.
 */
export function weeklySummary(db: Db, demoToday: string, region: "IE" | "UK" = "IE") {
  // Written at 07:00 on Friday, so it covers Monday to Thursday and is as of that morning.
  const today = lastWeekday(demoToday, 5);
  const n = dashboardNumbers(db, today);
  const words = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const count = (k: number) => words[k] ?? String(k);
  const money = (v: number) => money0(v, region);
  const monday = lastWeekday(today, 1);
  const week = db.attendance.filter((a) => a.date >= monday && a.date < today);
  const hours = week.reduce((s, a) => s + (a.status === "full" ? 8 : 4) + a.overtimeHours, 0);
  const overtime = week.reduce((s, a) => s + a.overtimeHours, 0);
  const project = (code: string) => db.projects.find((p) => p.code === code)!;
  // Only what had happened by 07:00 that Friday: on a Monday the records also hold Friday's work.
  const asOf = at(today, "07:00");
  const progress = (code: string) => {
    const tasks = db.scopeTasks.filter((t) => t.projectId === project(code).id);
    const doneBy = (t: (typeof tasks)[number]) => t.done && (t.completedAt ?? "") < asOf;
    const next = tasks.find((t) => !doneBy(t));
    return `${project(code).name}, ${tasks.filter(doneBy).length} of ${tasks.length} scope items done${next ? `, next: ${next.description.charAt(0).toLowerCase()}${next.description.slice(1)}` : ""}.`;
  };
  const drafts = db.variations.filter((v) => v.status === "Draft" && v.raisedAt < asOf);
  const held = db.salesInvoices.filter((i) => i.status === "Held");
  const overdue = db.salesInvoices.filter((i) => i.status === "Invoiced" && i.dueOn && i.dueOn < today).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  const daysLate = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
  const oldest = overdue[0];
  const waitingSupplier = db.supplierInvoices.filter((s) => s.receivedAt < asOf && !(s.readStatus === "confirmed" && (s.confirmedAt ?? "") < asOf));
  const unread = waitingSupplier.filter((s) => s.readStatus === "not_read").length;
  const toInvoice = db.salesInvoices.filter((i) => i.status === "To invoice" || (i.issuedOn != null && i.issuedOn >= today));
  const hoist = db.plant.find((p) => p.assetRef === "HS2");
  const hoistOut = hoist?.renewals.some((x) => x.kind === "Thorough examination" && x.expires < today);
  const name = (projectId: string) => db.projects.find((p) => p.id === projectId)?.name ?? "";

  return [
    "Week in brief",
    `${count(n.sites.live)} sites live. ${new Set(week.map((a) => a.personId)).size} people on site across the week, ${hours.toLocaleString("en-IE")} hours recorded, ${overtime} of them overtime.`,
    `Progress: ${["C719", "C720", "C721"].map(progress).join(" ")}`,
    `Watch list: ${count(drafts.length).toLowerCase()} variations are waiting for approval (${drafts.map((v) => name(v.projectId)).join(", ")}), worth ${money(drafts.reduce((s, v) => s + v.estimatedValue, 0))} between them. ${count(held.length)} final accounts are held: ${held.map((i) => `${name(i.projectId)} for ${i.holdReason?.toLowerCase().startsWith("snag") ? "snagging" : "extras"}`).join(", ")}.`,
    `Money: ${count(overdue.length).toLowerCase()} invoices are past their due date, ${money(n.money.overdueValue)} in all${oldest ? `; the longest overdue is ${name(oldest.projectId)}, ${daysLate(oldest.dueOn!)} days late` : ""}. ${count(toInvoice.length)} are ready to invoice, worth ${money(toInvoice.reduce((s, i) => s + i.net, 0))}. ${count(waitingSupplier.length)} supplier invoices are waiting to be checked${unread ? `, ${count(unread).toLowerCase()} of them not read yet` : ""}.`,
    `Compliance: ${count(n.compliance.certsExpired).toLowerCase()} training tickets have expired and ${count(n.compliance.certsSoon).toLowerCase()} more expire inside 30 days.${hoistOut ? " Hoist HS2 is overdue its thorough examination and should not be used until it is done." : ""}`,
  ].join("\n\n");
}

/** A stamp plus some minutes. Stamps carry no time zone, so the arithmetic is done as if UTC. */
const plus = (stamp: string, minutes: number) => new Date(Date.parse(`${stamp}Z`) + minutes * 60_000).toISOString().slice(0, 19);

/** Dates on approvals and automations that follow from the records they are about. */
export function fillManagementDates(db: Db, today: string, region: "IE" | "UK") {
  const v = (id: string) => db.variations.find((x) => x.id === id)!;
  const p = (code: string) => db.projects.find((x) => x.code === code)!;
  for (const a of db.approvals) {
    if (a.variationId) a.createdAt = plus(v(a.variationId).raisedAt, 2);
    if (a.id === "ap-6") a.createdAt = at(workdays(p("C717").endDate, 2), "16:35");
    if (a.id === "ap-9") {
      a.createdAt = at(workdays(p("C714").endDate, 1), "16:35");
      a.resolvedAt = p("C714").handoverSentAt;
    }
    if (a.kind === "weekly_summary") a.body = weeklySummary(db, today, region);
    if (a.kind === "cert_reminder") {
      const domain = db.people.find((x) => x.id === "p-md")?.email.split("@")[1] ?? "example.com";
      a.email = { toName: "The site managers", toAddress: `sitemanagers@${domain}`, subject: "Training tickets to renew" };
      a.body = ticketReminder(db, a.createdAt.slice(0, 10));
    }
  }
  const latest = (xs: string[]) => xs.filter((x) => x <= at(today, "23:59")).sort().pop();
  const auto = (id: string, stamp: string | undefined) => {
    const a = db.automations.find((x) => x.id === id);
    if (a && stamp) a.lastRun = stamp;
  };
  auto("au-4", latest(db.projects.flatMap((x) => x.audit.filter((e) => e.what.startsWith("Project created from")).map((e) => e.at))));
  auto("au-6", latest(db.variations.filter((x) => x.original).map((x) => plus(x.raisedAt, 1))));
  auto("au-7", latest(db.variations.map((x) => plus(x.raisedAt, 2))));
  auto("au-8", latest(db.approvals.filter((x) => x.kind === "handover").map((x) => x.createdAt)));

  // Invoicing goes in each project's history, as issuing and marking paid write it on screen.
  const accounts = db.people.find((x) => x.level === "accounts")?.name ?? "Accounts";
  for (const i of db.salesInvoices) {
    const pr = db.projects.find((x) => x.id === i.projectId)!;
    if (i.issuedOn) pr.audit.push({ at: at(i.issuedOn, "10:40"), who: accounts, what: invoicedLine(invoiceNo(i), i.description) });
    if (i.paidOn) {
      const rest = db.salesInvoices.filter((x) => x.projectId === pr.id && x.id !== i.id);
      const closing = pr.status === "Closed" && rest.every((x) => x.status === "Paid" && (x.paidOn ?? "") <= i.paidOn!);
      pr.audit.push({ at: at(i.paidOn, "11:15"), who: accounts, what: paidLine(invoiceNo(i), closing) });
    }
  }
  for (const pr of db.projects) pr.audit.sort((a, b) => a.at.localeCompare(b.at));

  // Every invoice's PDF is filed with its project: supplier invoices once they are checked, sales invoices once issued.
  let n = db.files.length;
  const file = (projectId: string, name: string, modified: string, addedBy: string, source: FileItem["source"]) =>
    db.files.push({ id: `f-${++n}`, projectId, folder: "Invoices", category: "Invoices", name, kind: "pdf", sizeKb: 90 + (name.length * 7) % 160, modified, addedBy, source, tone: n % 6 });
  for (const s of db.supplierInvoices.filter((x) => x.readStatus === "confirmed")) for (const projectId of new Set(s.allocations.map((a) => a.projectId))) file(projectId, s.fileName, s.receivedAt.slice(0, 10), s.supplier, "Email");
  for (const i of db.salesInvoices.filter((x) => x.issuedOn)) file(i.projectId, salesInvoiceFile(invoiceNo(i), i.description), i.issuedOn!, accounts, "Upload");
}

/** The activity log, dated to the records it describes. */
export function seedActivity(db: Db, today: string): Activity[] {
  const day = (n: number) => workdays(today, n);
  const a = (n: number, stamp: string, who: string, what: string, target: string, department: Activity["department"]): Activity => ({ id: `act-${n}`, at: stamp, who, what, target, department });
  const project = (code: string) => db.projects.find((p) => p.code === code)!;
  const markedToday = db.attendance.filter((x) => x.projectId === project("C719").id && x.date === today).length;
  const n = dashboardNumbers(db, today);
  const exports = db.salesInvoices.filter((i) => i.exportedAt).map((i) => i.exportedAt!);
  const lastExport = exports.sort().pop();
  const exported = lastExport ? db.salesInvoices.filter((i) => i.exportedAt === lastExport).length : 0;
  const confirmed = db.supplierInvoices.filter((s) => s.readStatus === "confirmed" && s.supplier === "Burren Lime and Stone Supplies" && s.docType === "invoice").sort((x, y) => (y.confirmedAt ?? "").localeCompare(x.confirmedAt ?? ""))[0];
  const variation = (id: string) => db.variations.find((v) => v.id === id)!;
  const hire = (id: string) => db.hiredPlant.find((h) => h.id === id)!;
  const operatives = db.people.filter((p) => p.active && p.kind === "Operative").length;
  const c714 = project("C714");
  const list: Activity[] = [
    a(1, at(today, "08:52"), "Assistant", "Tagged an email as an enquiry and drafted a reply", "Damp in the north gable at Glebe House", "inbox"),
    a(2, hire("hp-6").returnNotifiedAt!, "Cathal Minogue", "Notified a hired plant return", "12 m scissor lift, Ardmullen House", "plant"),
    a(3, at(today, "08:25"), "Cathal Minogue", "Sent the day's time stamps", "Ardmullen House", "people"),
    a(4, at(today, "08:20"), "Eoin Brosnan", "Marked attendance", `St Finian's Church, ${markedToday} people`, "people"),
    a(5, at(today, "08:05"), "Eoin Brosnan", "Requested personnel", "Two general operatives, St Finian's Church", "projects"),
    a(6, at(today, "07:00"), "Assistant", "Flagged plant and vehicle renewals", `${n.compliance.plantOverdue + n.compliance.fleetOverdue} items overdue`, "plant"),
    a(7, at(lastWeekday(today, 5), "07:00"), "Assistant", "Drafted the weekly summary for directors", "Weekly summary", "dashboard"),
    a(8, at(day(-1), "16:45"), "Cathal Minogue", "Requested plant", "Dehumidifiers, Ardmullen House", "projects"),
    a(9, hire("hp-5").returnNotifiedAt!, "Shane Culloty", "Notified a hired plant return", "6 cubic yard skip, 14 Fitzgarret Square", "plant"),
    a(10, plus(variation("var-1").raisedAt, 2), "Assistant", "Drafted a variation for approval", "Cracked quoins, St Finian's Church", "projects"),
    a(11, variation("var-1").raisedAt, "Marek Wiśniewski", "Raised extras from site", "St Finian's Church", "site"),
    a(12, at(day(-1), "12:40"), "Róisín Garvey", "Sent the day's time stamps", "The Old Corn Mill", "people"),
    a(13, at(day(-1), "10:15"), "Assistant", "Drafted a quote from an enquiry", "Q-2619 Rathdoon Parish Hall", "sales"),
    a(14, at(day(-1), "09:30"), "Róisín Garvey", "Requested hired plant", "Boom lift, The Old Corn Mill", "projects"),
    a(15, at(day(-2), "16:35"), "Assistant", "Drafted a handover email", "Brandonmore Lodge", "projects"),
    a(16, at(day(-2), "12:10"), "Darragh Lenihan", "Requested personnel", "Stonemason, Dunmoy Courthouse", "projects"),
    a(17, plus(variation("var-2").raisedAt, 2), "Assistant", "Drafted a variation for approval", "Rotten lintel, Ardmullen House", "projects"),
    a(18, plus(variation("var-3").raisedAt, 2), "Assistant", "Drafted a variation for approval", "Extra cornice, Dunmoy Courthouse", "projects"),
    a(19, at(day(-3), "09:20"), "Aisling Rafter", "Filed a conservation officer approval", "Dunmoy Courthouse", "files"),
    a(20, at(lastWeekday(day(-1), 5), "15:00"), "Tadhg Morrissey", "Sent the week ahead to operatives", `${operatives} people, 7 sites`, "schedule"),
    a(21, hire("hp-9").collectedAt!, "Pat Scully", "Marked hired plant as collected", "Mortar silo, Brandonmore Lodge", "plant"),
    a(22, at(day(-6), "14:50"), "Pat Scully", "Sent plant for repair", "CP1 towable compressor", "plant"),
    a(23, at(day(-7), "09:10"), "Aisling Rafter", "Approved a variation", "Wall plate, The Old Corn Mill", "projects"),
    // Approving a quote is what sends it.
    a(24, db.quotes.find((q) => q.ref === "Q-2613")!.sentAt!, "Aidan King", "Approved a quote", "Q-2613 Ballyfinn Mill race walls", "sales"),
    a(25, c714.handoverSentAt!, "Aisling Rafter", "Sent a handover pack", "Abbey Mill Chimney", "projects"),
  ];
  if (confirmed?.confirmedAt) list.push(a(26, confirmed.confirmedAt, "Maeve Quirke", "Confirmed supplier invoice costs", `${confirmed.supplier} ${confirmed.invoiceNo}`, "invoicing"));
  if (lastExport) list.push(a(27, lastExport, "Maeve Quirke", "Exported invoices to accounts", `${exported} invoice${exported === 1 ? "" : "s"}`, "invoicing"));
  return list.filter((x) => x.at <= at(today, "23:59")).sort((x, y) => y.at.localeCompare(x.at));
}

/**
 * Supplier invoices as accounts keep them (Oldstone call, 16 Nov): a file number for the paper
 * copy in date order, the director's sign-off on anything over the limit, and the monthly run to
 * the accounts package on the first Tuesday of the next month. The newest two over the limit are
 * still waiting for him, so Admin, Requests has them.
 */
export function fillPurchases(db: Db, today: string) {
  [...db.supplierInvoices].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id)).forEach((s, i) => (s.fileNo = 11400 + i));
  const exportDay = (d: string) => {
    const [y, m] = d.split("-").map(Number) as [number, number];
    let e = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    while (new Date(`${e}T12:00:00Z`).getUTCDay() !== 2) e = addDays(e, 1);
    return e < today ? e : undefined;
  };
  const confirmed = db.supplierInvoices.filter((s) => s.readStatus === "confirmed" && s.confirmedAt).sort((a, b) => b.confirmedAt!.localeCompare(a.confirmedAt!));
  let waiting = 0;
  for (const s of confirmed) {
    const done = s.confirmedAt!.slice(0, 10);
    const exported = exportDay(done);
    if (needsSignOff(s)) {
      if (!exported && waiting < 2) {
        waiting++;
        s.signOffAsked = s.confirmedAt;
        continue;
      }
      s.signOff = { by: "Aidan King", at: at(workdays(done, 1) < today ? workdays(done, 1) : done, "08:40") };
    }
    if (exported) s.exportedAt = at(exported, "14:30");
  }
}

/** Every finished week of hours went to Sage Payroll on the Tuesday after; last week is waiting when today is Monday or Tuesday morning's work. */
export function seedPayrollExports(db: Db, today: string): PayrollExport[] {
  const out: PayrollExport[] = [];
  let mon = addDays(workWeek(today)[0]!, -7);
  for (let i = 0; i < 8; i++, mon = addDays(mon, -7)) {
    const sent = addDays(mon, 8);
    if (sent >= today) continue;
    const days = workWeek(mon);
    const rows = db.attendance.filter((a) => days.includes(a.date));
    out.push({ id: `pay-${mon}`, weekStart: mon, at: at(sent, "11:15"), by: "Maeve Quirke", people: new Set(rows.map((a) => a.personId)).size, hours: rows.reduce((n, a) => n + basicHours(a.date, a.status) + a.overtimeHours, 0) });
  }
  return out;
}

/** Each week that went to Sage Payroll was checked by a contracts manager the afternoon before (17 Nov). */
export function seedPayrollChecks(exports: PayrollExport[]): PayrollCheck[] {
  return exports.map((x) => ({ id: `chk-${x.weekStart}`, weekStart: x.weekStart, at: at(addDays(x.weekStart, 7), "16:20"), by: "Tadhg Morrissey" }));
}

/**
 * Two claims waiting for the director, one approved and waiting for the office to pay, and one
 * already sent for payment. Sample receipts have no picture behind them.
 */
export function seedExpenses(today: string): Expense[] {
  return [
    { id: "ex-4", personId: "p-111", createdAt: at(workdays(today, -3), "16:35"), date: workdays(today, -3), kind: "Materials", what: "Box of slate hooks and two ridge fixings, the delivery was short", amount: 31.4, projectId: "pr-C721", status: "Approved", decidedBy: "Aidan King", decidedAt: at(workdays(today, -2), "08:50") },
    { id: "ex-3", personId: "p-104", createdAt: at(workdays(today, -1), "17:40"), date: workdays(today, -1), kind: "Materials", what: "Bag of hydrated lime and a hawk from the builders' providers, ran short on site", amount: 46.8, projectId: "pr-C724", status: "Waiting" },
    { id: "ex-2", personId: "p-sm2", createdAt: at(today, "07:55"), date: today, kind: "Fuel", what: "Diesel for the crew van, the fuel card was declined", amount: 92.15, projectId: "pr-C720", status: "Waiting" },
    { id: "ex-1", personId: "p-110", createdAt: at(workdays(today, -6), "16:10"), date: workdays(today, -6), kind: "Parking and tolls", what: "M50 toll and parking at the builders' providers", amount: 9.6, projectId: null, status: "Approved", decidedBy: "Aidan King", decidedAt: at(workdays(today, -5), "09:05"), exportedAt: at(workdays(today, -4), "11:20"), exportedBy: "Maeve Quirke" },
  ];
}

/**
 * One site given to a site manager who does not run it, so Admin, Site access opens with an
 * example: Róisín Garvey runs two live sites, so Shane Culloty can open Granary Quay as well.
 */
export function seedSiteAccess(today: string): SiteAccess[] {
  return [{ id: "sa-1", personId: "p-sm5", projectId: "pr-C725", by: "Aidan King", at: at(workdays(today, -3), "16:20") }];
}

/** What two site managers put up for their crews this morning, so the operative's phone has today's instructions. */
export function seedDayInstructions(today: string): DayInstruction[] {
  return [
    { id: "di-1", projectId: "pr-C719", date: today, text: "The scaffold inspector is on the belfry lift from 10:00. Keep off that lift until I give the all clear. Toolbox talk on working at height at 12:45 in the cabin.", by: "Eoin Brosnan", at: at(today, "07:35") },
    { id: "di-2", projectId: "pr-C720", date: today, text: "The drawing room is sealed for the ceiling work. Boot covers on and dust sheets down before you go in. Keep the yard gate clear, the skip is being changed mid morning.", by: "Cathal Minogue", at: at(today, "07:50") },
  ];
}
