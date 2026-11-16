import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { Mail } from "@/data/types";
import { actionItems, byDay, folderCounts, inFolder, isFocused, newestFirst, plainText, rowWhen, searchMail, summary, withLabel } from "./mail";

const mail = (id: string, extra: Partial<Mail> = {}): Mail => ({ id, mailbox: "info@x", folder: "Inbox", fromName: "Ann Lee", fromAddress: "ann@x", subject: `Subject ${id}`, body: "Hi Tadhg,\n\nThe wall is wet. Can you look?\n\nThanks,\nAnn", receivedAt: "2026-11-16T09:00:00", read: false, intent: "Enquiry", routedToId: "p-cm1", ...extra });

describe("folders", () => {
  const ms = [mail("a", { starred: true }), mail("b", { read: true, replyDraft: { subject: "RE", body: "x" } }), mail("c", { folder: "Archive", starred: true }), mail("d", { folder: "Sent", replyDraft: { subject: "x", body: "y" } })];
  it("Inbox, Sent and Archive are where each email is filed", () => {
    expect(inFolder(ms, "Inbox").map((m) => m.id)).toEqual(["a", "b"]);
    expect(inFolder(ms, "Sent").map((m) => m.id)).toEqual(["d"]);
    expect(inFolder(ms, "Archive").map((m) => m.id)).toEqual(["c"]);
  });
  it("Starred gathers from every folder", () => expect(inFolder(ms, "Starred").map((m) => m.id)).toEqual(["a", "c"]));
  it("Drafts are replies written and not sent", () => expect(inFolder(ms, "Drafts").map((m) => m.id)).toEqual(["b"]));
  it("counts unread in Inbox and drafts waiting", () => expect(folderCounts(ms)).toEqual({ Inbox: 1, Drafts: 1 }));
  it("a label shows its emails wherever they are filed, not the sent copies", () => {
    const l = [mail("a"), mail("b", { folder: "Archive" }), mail("c", { folder: "Sent" }), mail("d", { intent: "Complaint" })];
    expect(withLabel(l, "Enquiry").map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("Focused and Other", () => {
  it("supplier paperwork and general mail are Other", () => {
    expect(isFocused(mail("a", { intent: "Supplier statement" }))).toBe(false);
    expect(isFocused(mail("a", { intent: "General" }))).toBe(false);
    expect(isFocused(mail("a", { intent: "Complaint" }))).toBe(true);
  });
});

describe("rows", () => {
  it("group newest first under Today, Yesterday, Earlier this week and Older", () => {
    const ms = [mail("1", { receivedAt: "2026-11-02T09:00:00" }), mail("2", { receivedAt: "2026-11-16T07:00:00" }), mail("3", { receivedAt: "2026-11-15T09:00:00" }), mail("4", { receivedAt: "2026-11-12T09:00:00" })].sort(newestFirst);
    const g = byDay(ms, "2026-11-16");
    expect(g.map((x) => [x.label, x.mails.map((m) => m.id)])).toEqual([["Today", ["2"]], ["Yesterday", ["3"]], ["Earlier this week", ["4"]], ["Older", ["1"]]]);
  });
  it("show the time today and the date before", () => {
    expect(rowWhen("2026-11-16T08:50:00", "2026-11-16")).toBe("08:50");
    expect(rowWhen("2026-11-13T08:50:00", "2026-11-16")).toBe("13 Nov");
  });
  it("search needs every word somewhere", () => {
    const ms = [mail("a", { subject: "Damp in the gable" }), mail("b", { fromName: "Bernard", subject: "Tender" })];
    expect(searchMail(ms, "damp gable").map((m) => m.id)).toEqual(["a"]);
    expect(searchMail(ms, "bernard").map((m) => m.id)).toEqual(["b"]);
    expect(searchMail(ms, "  ").length).toBe(2);
    expect(searchMail(ms, "damp tender")).toEqual([]);
  });
});

describe("the side panel", () => {
  it("drops the greeting and the sign-off", () => expect(plainText("Hi Tadhg,\n\nThe wall is wet. Can you look?\n\nThanks,\nAnn")).toBe("The wall is wet. Can you look?"));
  it("keeps a one-line email whole", () => expect(plainText("Permits need 48 hours' notice.")).toBe("Permits need 48 hours' notice."));
  it("summarises in two sentences after who and what", () => expect(summary(mail("a"))).toBe('Ann Lee wrote about "Subject a". The wall is wet. Can you look?'));
  it("has something to do for every kind of email", () => {
    for (const k of ["Enquiry", "Tender invitation", "Quote query", "Certificate", "Holiday request", "Completion request", "Complaint", "Supplier statement", "Conservation officer", "General"] as const) expect(actionItems(k).length).toBeGreaterThan(0);
  });
});

describe("sample data", () => {
  const { db } = buildSeed("2026-11-16");
  it("no folder opens empty", () => {
    for (const f of ["Inbox", "Starred", "Sent", "Drafts", "Archive"] as const) expect(inFolder(db.mails, f).length, f).toBeGreaterThan(0);
  });
  it("both Focused and Other have mail in the inbox", () => {
    const inbox = inFolder(db.mails, "Inbox");
    expect(inbox.filter(isFocused).length).toBeGreaterThan(0);
    expect(inbox.filter((m) => !isFocused(m)).length).toBeGreaterThan(0);
  });
  it("every sent email says who it went to", () => {
    for (const m of inFolder(db.mails, "Sent")) expect(m.to, m.id).toBeTruthy();
  });
  it("every summary reads as words, not an empty quote", () => {
    for (const m of db.mails) expect(summary(m).length, m.id).toBeGreaterThan(m.fromName.length + m.subject.length + 20);
  });
});
