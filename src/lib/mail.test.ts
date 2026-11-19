import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { Mail } from "@/data/types";
import { actionItems, attachmentsOf, byDay, filedFolder, folderCounts, inFolder, isFocused, labelUnread, newestFirst, plainText, rowWhen, searchMail, sizeLabel, summary, whereKept, withLabel } from "./mail";

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

// Putting an email under a label takes it out of the Inbox, as in Gmail (Oisin, 17 Nov).
describe("filing under a label", () => {
  it("takes an inbox email out of the inbox, and leaves an archived or filed one where it is", () => {
    expect(filedFolder("Inbox")).toBe("Filed");
    expect(filedFolder("Archive")).toBe("Archive");
    expect(filedFolder("Filed")).toBe("Filed");
    expect(filedFolder("Sent")).toBe("Sent");
  });
  const ms = [mail("a"), mail("b", { folder: "Filed" }), mail("c", { folder: "Filed", read: true }), mail("d", { folder: "Archive" }), mail("e", { folder: "Sent" }), mail("f", { folder: "Filed", starred: true, intent: "Complaint", replyDraft: { subject: "RE", body: "x" } })];
  it("is no longer in the Inbox or the Archive, and is found under its label", () => {
    expect(inFolder(ms, "Inbox").map((m) => m.id)).toEqual(["a"]);
    expect(inFolder(ms, "Archive").map((m) => m.id)).toEqual(["d"]);
    expect(withLabel(ms, "Enquiry").map((m) => m.id)).toEqual(["a", "b", "c", "d"]);
    expect(withLabel(ms, "Complaint").map((m) => m.id)).toEqual(["f"]);
  });
  it("still shows under Starred and Drafts", () => {
    expect(inFolder(ms, "Starred").map((m) => m.id)).toEqual(["f"]);
    expect(inFolder(ms, "Drafts").map((m) => m.id)).toEqual(["f"]);
  });
  it("counts as unread under its label, but not in the Inbox count", () => {
    expect(labelUnread(ms, "Enquiry")).toBe(2);
    expect(labelUnread(ms, "Complaint")).toBe(1);
    expect(folderCounts(ms).Inbox).toBe(1);
  });
  it("says where an email is kept", () => {
    expect(whereKept({ folder: "Filed", intent: "Enquiry" })).toBe("Filed under Enquiry, out of the inbox");
    expect(whereKept({ folder: "Archive", intent: "Enquiry" })).toBe("Archived");
    expect(whereKept({ folder: "Inbox", intent: "Enquiry" })).toBe("Inbox");
  });
});

describe("attachments", () => {
  it("are the files attached here, or the one a sample email names", () => {
    expect(attachmentsOf({})).toEqual([]);
    expect(attachmentsOf({ attachment: "survey.pdf" })).toEqual([{ name: "survey.pdf" }]);
    const files = [{ name: "a.jpg", sizeKb: 240, dataUrl: "data:image/jpeg;base64,xx" }, { name: "b.pdf", sizeKb: 1100, dataUrl: "data:application/pdf;base64,xx" }];
    expect(attachmentsOf({ attachment: "a.jpg", attachments: files })).toBe(files);
  });
  it("are searched by name", () => {
    const found = searchMail([mail("a", { attachments: [{ name: "gable-photo.jpg", sizeKb: 200 }] }), mail("b")], "gable-photo");
    expect(found.map((m) => m.id)).toEqual(["a"]);
  });
  it("show their size", () => {
    expect([sizeLabel(240), sizeLabel(999.6), sizeLabel(1100), sizeLabel(0.2)]).toEqual(["240 KB", "1.0 MB", "1.1 MB", "1 KB"]);
  });
});
