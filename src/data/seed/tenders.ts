/**
 * The tenders' own sections (20 Nov, the Oldstone template): when each must be back with the
 * client, the documents that came with it, site photos, subcontractors' prices for the trades
 * we do not do ourselves, our workings and the Buildsoft estimate, and the checks before it went.
 *
 * Written last, from the quotes, enquiries and subcontractors already built. No random numbers,
 * so nothing else in the sample data moves.
 */
import type { Db, Quote, SubPrice, Tender, TenderCheck, TenderFile } from "../types";
import { quoteTotal } from "@/lib/quotes";
import { at, workdays } from "./util";
import { WORK } from "./commercial";

/** Trades each kind of work needs from outside, beyond our own crews. Scaffolding on all of them. */
const TRADES: Record<string, string[]> = {
  slate: ["Scaffolding", "Slating and leadwork"],
  facade: ["Scaffolding", "Stone carving"],
  render: ["Scaffolding", "Decorative plasterwork"],
  sash: ["Scaffolding"],
  repoint: ["Scaffolding"],
  wall: ["Scaffolding"],
  brick: ["Scaffolding"],
  timber: ["Scaffolding"],
};

/** Others asked to price beside our usual subcontractor, so there is something to compare. Invented firms. */
const OTHERS: Record<string, string[]> = {
  Scaffolding: ["Shannon Access Scaffolding", "Midland Scaffold Hire"],
  "Slating and leadwork": ["Westport Slate and Lead"],
  "Stone carving": ["Burren Masonry Workshop"],
  "Decorative plasterwork": ["Moyne Lime Plastering"],
};

const round50 = (n: number) => Math.round(n / 50) * 50;

export function seedTenders(db: Db, today: string) {
  const out = (q: Quote) => q.status !== "Draft" && q.status !== "Awaiting approval";
  for (const q of db.quotes) {
    // The year of past tenders (ids q-1xx) keeps only its return date.
    const past = /^q-1\d\d$/.test(q.id);
    const sent = q.sentAt?.slice(0, 10);
    const returnBy = sent ?? workdays(today, q.status === "Awaiting approval" ? 2 : 6);
    if (past) {
      q.tender = { returnBy, files: [], subPrices: [], checks: {} };
      continue;
    }
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    const n = Number(q.id.replace(/\D/g, "")) || 1;
    const received = e?.receivedAt.slice(0, 10) ?? workdays(returnBy, -15);
    const who = e?.loggedBy ?? "Colm Henebry";
    // Nothing in the sample is dated after today: a fresh enquiry's site visit and requests are today at the latest.
    const cap = (d: string) => (d > today ? today : d);
    const visit = cap(workdays(received, 3));
    const workingsDay = sent ? workdays(sent, -1) : workdays(today, -1);
    const f = (i: number, kind: TenderFile["kind"], name: string, sizeKb: number, day: string, by: string, more: Partial<TenderFile> = {}): TenderFile => ({ id: `tf-${q.id}-${i}`, kind, name, sizeKb, addedAt: at(day, "10:15"), addedBy: by, ...more });
    const files: TenderFile[] = [
      f(1, "Specification", "Specification of works.pdf", 380 + n * 7, received, who),
      f(2, "Bill of quantities", "Bill of quantities.xlsx", 64 + n, received, who),
      f(3, "Drawings", "Drawings, elevations and sections.pdf", 2400 + n * 31, received, who),
      f(4, "Site photo", "Site visit, front elevation.jpg", 1800, visit, who, { caption: "Front elevation on the site visit", tone: n % 6 }),
      f(5, "Site photo", "Site visit, defects close up.jpg", 1650, visit, who, { caption: "Defects close up", tone: (n + 2) % 6 }),
      f(6, "Site photo", "Site visit, access and scaffold line.jpg", 1720, visit, who, { caption: "Access and the scaffold line", tone: (n + 4) % 6 }),
      f(7, "Buildsoft", `Buildsoft estimate ${q.ref}.xlsx`, 210 + n * 3, workingsDay, who),
    ];
    if (out(q)) files.push(f(8, "Workings", "Workings and rate build-ups.pdf", 145 + n, workingsDay, who));

    // Each trade's price is shared from the subcontract figure in the costing; ours is the lowest
    // and picked. On the draft, one price has not come back yet and nothing is picked.
    // A quote keeps its kind of work by title ("Roof re-slating"); find its key in the rate books.
    const key = Object.entries(WORK).find(([, w]) => w.title === q.kind)?.[0] ?? "";
    const trades = TRADES[key] ?? ["Scaffolding"];
    const total = q.costing.subcontract;
    // The picked prices add up to the costing's subcontract figure exactly: the last trade takes the rest.
    const first = trades.length === 2 ? Math.round(total * 0.6) : total;
    const subPrices: SubPrice[] = [];
    trades.forEach((trade, t) => {
      const ours = db.subcontractors.find((s) => s.trade === trade);
      const mine = t === 0 ? first : Math.round((total - first) * 100) / 100;
      const asked = cap(workdays(visit, 1));
      const back = workdays(asked, 4 + t);
      const names = [ours?.name ?? `${trade} contractor`, ...(OTHERS[trade] ?? [])];
      names.forEach((name, k) => {
        const notBack = q.status === "Draft" && t === 0 && k === names.length - 1;
        subPrices.push({
          id: `sp-${q.id}-${t}-${k}`,
          trade,
          ...(k === 0 && ours ? { subcontractorId: ours.id } : {}),
          name,
          askedAt: asked,
          ...(notBack ? {} : { price: k === 0 ? mine : round50(mine * (k === 1 ? 1.07 : 1.14)), receivedAt: back > today ? today : back }),
          ...(k === 1 && !notBack ? { note: "Excludes weekend working" } : {}),
          ...(k === 0 && q.status !== "Draft" ? { picked: true } : {}),
        });
      });
    });

    // The checks before it went: all four on a tender that is out; the draft's documents only.
    const checks: Tender["checks"] = {};
    const tick = (k: TenderCheck, day: string, by: string, time: string) => (checks[k] = { by, at: at(day, time) });
    if (out(q)) {
      tick("docs", workdays(sent!, -6), who, "11:20");
      tick("subs", workdays(sent!, -3), who, "15:40");
      tick("workings", workdays(sent!, -1), who, "12:05");
      tick("price", sent!, "Aidan King", "09:30");
    } else if (q.status === "Awaiting approval") {
      tick("docs", workdays(today, -4), who, "11:20");
      tick("subs", workdays(today, -2), who, "15:40");
      tick("workings", workdays(today, -1), who, "12:05");
    } else {
      tick("docs", workdays(today, -2), who, "11:20");
    }
    q.tender = { returnBy, files, subPrices, checks, ...(q.status !== "Draft" ? { buildsoftTotal: quoteTotal(q.lines) } : {}) };
  }
}
