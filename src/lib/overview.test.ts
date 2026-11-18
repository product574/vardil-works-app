import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import { mondayReminder } from "@/lib/compliance";
import type { Db } from "@/data/types";
import { approvalClient, rankApprovals } from "./approvals";
import { recordsOverview, ticketWords } from "./overview";
import { dueWords, outstanding, portalFeed } from "./portal";
import { directorQueue, recentlyDecided, waitingOnDirector } from "./requests";

// Monday 16 Nov 2026, the day Aodhan asked for the new overview.
const DAY = "2026-11-16";
const seed = () => buildSeed(DAY, { emailDomain: "abcconstruction.example", vatPct: 13.5, region: "IE" });
const euro = (n: number) => `€${Math.round(n).toLocaleString("en-IE")}`;
const MD = { money: euro, seeValues: true, seeMargins: true, canAsk: true, answersRequests: true };

describe("the AI overview, worked out from the records (option B)", () => {
  const { db } = seed();
  const o = recordsOverview(db, DAY, MD);

  it("puts at most three decisions first, the held final account at the top", () => {
    expect(o.decisions).toHaveLength(3);
    expect(o.decisions[0]!.text).toBe("Agree the €2,780 extra for lime concrete footing at [St Colman's Graveyard Wall](/projects/C715) to release its €64,100 final account.");
    expect(o.decisions[0]!.button).toEqual({ label: "Open the extra", to: "/dashboard?open=ap-11" });
  });

  it("chases the overdue invoices with figures that match Invoicing", () => {
    const d = o.decisions[1]!;
    expect(d.text).toBe("Chase **€160,773** overdue: [Dunmoy County Council](/invoicing/invoiced), 21 days late, and [Fitzgarret Property Holdings](/invoicing/invoiced), 16 days.");
    // The managing director's button asks Ask AI to draft them; nobody else's does.
    expect(d.button).toEqual({ label: "Draft chasers", ask: "Draft a chaser for each overdue invoice: SI-10404 and SI-10405." });
    const other = recordsOverview(db, DAY, { ...MD, canAsk: false }).decisions[1]!;
    expect(other.button).toEqual({ label: "Open the invoices", to: "/invoicing/invoiced" });
  });

  it("names someone planned who cannot work, the soonest first (Compliance, 18 Nov)", () => {
    expect(o.decisions[2]!.text).toBe("[Tomás Breslin](/compliance/personnel?person=p-124) is planned on C722 today, but their Safe Pass ran out on 15 Nov. They cannot be marked on site until it is renewed; booked on the course on Tuesday 24 Nov. Three other people too.");
    expect(o.decisions[2]!.button).toEqual({ label: "Open the course", to: "/compliance/courses" });
  });

  it("follows with four facts worth knowing", () => {
    expect(o.facts).toEqual([
      "Only Ardmullen House has sent today's time stamps. Six other sites have not yet.",
      "[Q-2615](/sales/quotes/Q-2615) St Brecan's Oratory went out at a 7.8% margin and has been opened.",
      "Nobody is planned yet on [C726](/schedule) next week, and Ionuț Marin is double booked on Wednesday.",
      "Three invoices are [ready to go out](/invoicing), €177,450.",
    ]);
  });

  it("shows no money or margins to someone who may not see them", () => {
    const o2 = recordsOverview(db, DAY, { ...MD, seeValues: false, seeMargins: false });
    const all = [...o2.decisions.map((d) => d.text), ...o2.facts].join(" ");
    expect(all).not.toMatch(/€|%/);
    expect(o2.decisions[1]!.text).toContain("Chase two overdue invoices");
  });

  it("moves on as soon as a decision is made", () => {
    const after = structuredClone(db) as Db;
    after.approvals.find((a) => a.id === "ap-11")!.status = "Approved";
    after.salesInvoices.find((i) => i.status === "Held" && i.projectId === "pr-C715")!.status = "To invoice";
    const o3 = recordsOverview(after, DAY, MD);
    expect(o3.decisions[0]!.text).toMatch(/^Chase/);
    expect(o3.decisions[2]!.text).toMatch(/hoist|scaffold/i);
  });

  it("words tickets the way people say them", () => {
    expect(ticketWords("Scaffolding ticket, advanced")).toBe("advanced scaffolding ticket");
    expect(ticketWords("Safe Pass")).toBe("Safe Pass");
    expect(ticketWords("Manual handling")).toBe("manual handling ticket");
  });
});

describe("approvals: anything with a client first", () => {
  const { db } = seed();
  const pending = db.approvals.filter((a) => a.status === "Pending");

  it("matches a client by the addresses in the client list", () => {
    const r = rankApprovals(pending, db);
    expect(r.client.map((x) => [x.a.id, x.c.name])).toEqual([
      ["ap-4", "Rathdoon Select Vestry"],
      ["ap-6", "Ardmullen Estate"],
    ]);
    // Imelda Fahy is a member of the public, not a client.
    expect(approvalClient(db.approvals.find((a) => a.id === "ap-7")!, db)).toBeUndefined();
    expect(r.internal.map((a) => a.id)).toEqual(["ap-12", "ap-1", "ap-5", "ap-3", "ap-2", "ap-7", "ap-11"]);
  });

  it("puts a reply to a client's email with the client group", () => {
    const m = db.mails.find((x) => x.clientId && x.fromAddress === db.clients.find((c) => c.id === x.clientId)?.contactEmail)!;
    const reply = { ...pending[0]!, id: "ap-x", kind: "reply" as const, mailId: m.id, email: undefined, quoteId: undefined, projectId: undefined };
    expect(approvalClient(reply, db)?.id).toBe(m.clientId);
  });
});

describe("the portal panel", () => {
  const { db } = seed();

  it("shows the latest from subcontractors, suppliers and clients, newest first", () => {
    const f = portalFeed(db, DAY, 4);
    expect(f.map((x) => [x.who, x.party])).toEqual([
      ["Kinvara Stone Carvers", "subcontractor"],
      ["Atlantic Lead and Copper", "supplier"],
      ["Susan Kane, Ardmullen Estate", "client"],
      ["Moher Slate Merchants", "supplier"],
    ]);
    // A client's question shows its first sentence.
    expect(f[2]!.text).toBe('Asked about quote Q-2616: "Could you price the north wall in two phases, with the gateway arch first?"');
  });

  it("lists what is outstanding: overdue invoices, then supplies, the latest first", () => {
    const o = outstanding(db, DAY);
    expect(o.filter((x) => x.kind === "invoice").map((x) => (x.kind === "invoice" ? [x.ref, x.daysLate] : []))).toEqual([
      ["SI-10404", 21],
      ["SI-10405", 16],
    ]);
    expect(o.filter((x) => x.kind === "supply")).toHaveLength(5);
    expect(o.some((x) => x.kind === "supply" && x.order.status === "Delivered")).toBe(false);
  });

  it("says when a supply is due in plain words", () => {
    expect(dueWords("2026-11-16", DAY)).toBe("Due today");
    expect(dueWords("2026-11-17", DAY)).toBe("Due tomorrow");
    expect(dueWords("2026-11-19", DAY)).toBe("Due Thu, 19 Nov");
    expect(dueWords("2026-11-13", DAY)).toBe("3 days late");
  });
});

describe("requests waiting for the managing director's yes or no", () => {
  const { db } = seed();

  it("gathers leave, site requests and spending", () => {
    const q = directorQueue(db);
    expect([q.leave.length, q.site.length, q.spend.length]).toEqual([3, 4, 3]);
    expect(waitingOnDirector(db)).toHaveLength(10);
    // The two site requests already dealt with were agreed first.
    expect(db.requests.filter((r) => r.status === "Done").every((r) => r.decision === "Approved")).toBe(true);
  });

  it("keeps a fortnight of answers to look back on", () => {
    // The office printer (agreed a week ago) and the scaffold tower for C723 (just inside the
    // fortnight); the request agreed before that falls outside it.
    expect(recentlyDecided(db, DAY).map((d) => d.item.id)).toEqual(["sp-4", "rq-5"]);
  });
});

describe("the Monday reminder, every area (Compliance, 18 Nov)", () => {
  const { db } = seed();
  const a = db.approvals.find((x) => x.kind === "cert_reminder")!;

  it("waits in Approvals as an email to the site managers, written from everything in Compliance", () => {
    expect(a.status).toBe("Pending");
    expect(a.email).toEqual({ toName: "The site managers", toAddress: "sitemanagers@abcconstruction.example", subject: "Compliance: what runs out in the next 30 days" });
    expect(a.body).toBe(mondayReminder(db, "2026-11-16"));
    expect(a.body).toContain("- Tomás Breslin, general operative, on C722: Safe Pass, ran out on 15 Nov");
    expect(a.body).toContain("- Kevin Shortall, scaffolder, on C719: Scaffolding ticket, advanced, due 20 Nov");
    expect(a.body).toContain("- C719 S2 Birdcage scaffold, nave interior: Weekly inspection, overdue since 12 Nov");
    for (const area of ["Personnel:", "Fleet:", "Machinery:", "Company:", "Subcontractors:"]) expect(a.body).toContain(area);
    expect(a.body).not.toMatch(/[–—]/);
  });
});
