import { beforeEach, describe, expect, it } from "vitest";
import { composeMail, fileMail, moveMail, tagMail } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { attachmentsOf, folderCounts, inFolder, labelUnread, MAX_ATTACHMENTS, withLabel } from "@/lib/mail";

// Email, 17 Nov (Oisin): an email put under a label leaves the Inbox, as in Gmail; and a new
// email can carry files.
const DAY = "2026-11-17";
const db = () => useData.getState().db;
const mail = (id: string) => db().mails.find((m) => m.id === id)!;

beforeEach(() => {
  useData.setState(buildSeed(DAY));
  usePrefs.setState({ role: "md", asPersonId: null });
});

describe("putting an email under a label", () => {
  it("takes it out of the Inbox and keeps it under the label, unread as it was", () => {
    const m = inFolder(db().mails, "Inbox").find((x) => !x.read && x.intent !== "Complaint")!;
    const before = { inbox: inFolder(db().mails, "Inbox").length, unread: folderCounts(db().mails).Inbox, label: withLabel(db().mails, "Complaint").length, labelUnread: labelUnread(db().mails, "Complaint") };
    fileMail(m.id, "Complaint");
    expect(mail(m.id)).toMatchObject({ folder: "Filed", intent: "Complaint", read: false });
    expect(inFolder(db().mails, "Inbox")).toHaveLength(before.inbox - 1);
    expect(folderCounts(db().mails).Inbox).toBe(before.unread - 1);
    expect(withLabel(db().mails, "Complaint")).toHaveLength(before.label + 1);
    expect(labelUnread(db().mails, "Complaint")).toBe(before.labelUnread + 1);
    expect(inFolder(db().mails, "Archive").some((x) => x.id === m.id)).toBe(false);
    expect(db().activity[0]).toMatchObject({ what: "Filed an email under a label" });
  });

  it("works under the label it already has: it still leaves the Inbox", () => {
    const m = inFolder(db().mails, "Inbox")[0]!;
    fileMail(m.id, m.intent);
    expect(mail(m.id)).toMatchObject({ folder: "Filed", intent: m.intent });
  });

  it("comes back with Move to inbox, keeping its label", () => {
    const m = inFolder(db().mails, "Inbox")[0]!;
    fileMail(m.id, "General");
    moveMail(m.id, "Inbox");
    expect(mail(m.id)).toMatchObject({ folder: "Inbox", intent: "General" });
  });

  it("leaves an archived email archived, with the new label, and never touches a sent copy", () => {
    const a = inFolder(db().mails, "Archive")[0]!;
    fileMail(a.id, "Complaint");
    expect(mail(a.id)).toMatchObject({ folder: "Archive", intent: "Complaint" });
    const s = inFolder(db().mails, "Sent")[0]!;
    fileMail(s.id, "Complaint");
    expect(mail(s.id)).toMatchObject({ folder: "Sent", intent: s.intent });
  });

  it("changing the label on an open email leaves it where it is", () => {
    const m = inFolder(db().mails, "Inbox").find((x) => x.intent !== "General")!;
    tagMail(m.id, "General");
    expect(mail(m.id)).toMatchObject({ folder: "Inbox", intent: "General" });
  });
});

describe("a new email with files", () => {
  const file = (name: string) => ({ name, sizeKb: 120, dataUrl: "data:image/jpeg;base64,AAAA" });
  it("carries its files into Sent", () => {
    const id = composeMail({ to: "stephen@example.ie", subject: "Photos of the gable", body: "As promised.", attachments: [file("gable-1.jpg"), file("gable-2.jpg")] });
    expect(mail(id)).toMatchObject({ folder: "Sent", to: "stephen@example.ie", attachment: "gable-1.jpg" });
    expect(attachmentsOf(mail(id)).map((f) => f.name)).toEqual(["gable-1.jpg", "gable-2.jpg"]);
    expect(db().activity[0]!.target).toContain("with 2 files");
  });
  it("sends without any as before", () => {
    const id = composeMail({ to: "stephen@example.ie", subject: "Hello", body: "Hi" });
    expect(mail(id).attachments).toBeUndefined();
    expect(attachmentsOf(mail(id))).toEqual([]);
  });
  it("keeps to the limit", () => {
    const id = composeMail({ to: "a@b.ie", subject: "Many", body: "", attachments: Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) => file(`f${i}.jpg`)) });
    expect(attachmentsOf(mail(id))).toHaveLength(MAX_ATTACHMENTS);
  });
});
