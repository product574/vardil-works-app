import { beforeEach, describe, expect, it } from "vitest";
import { composeMail, discardDraft, fileMail, moveMail, saveDraft } from "./actions";
import { buildSeed } from "./seed";
import { useData, usePrefs } from "./store";
import { folderCounts, inFolder, isNewDraft, withLabel, worthKeeping } from "@/lib/mail";

const DAY = "2026-11-17";
const db = () => useData.getState().db;
const mail = (id: string) => db().mails.find((m) => m.id === id);

// Drafts of new emails, as in Gmail (Oisin, 17 Nov: "save drafts for emails").
describe("email drafts", () => {
  beforeEach(() => {
    useData.setState(buildSeed(DAY));
    usePrefs.setState({ role: "md", asPersonId: null });
  });

  it("keeps a new email in Drafts, beside the replies written and not sent", () => {
    const before = folderCounts(db().mails).Drafts;
    const id = saveDraft({ to: " stephen@aylward.example ", subject: " Scaffold dates ", body: "Stephen,\n\nThe scaffold" });
    expect(mail(id)).toMatchObject({ folder: "Drafts", to: "stephen@aylward.example", subject: "Scaffold dates", body: "Stephen,\n\nThe scaffold", fromName: "Aidan King", read: true });
    expect(isNewDraft(mail(id)!)).toBe(true);
    expect(inFolder(db().mails, "Drafts").map((m) => m.id)).toContain(id);
    expect(folderCounts(db().mails).Drafts).toBe(before + 1);
    expect(db().activity[0]).toMatchObject({ what: "Saved an email as a draft", target: "Scaffold dates: to stephen@aylward.example" });
    // It is not in the Inbox, in Sent, or under a label.
    expect(inFolder(db().mails, "Inbox").some((m) => m.id === id)).toBe(false);
    expect(inFolder(db().mails, "Sent").some((m) => m.id === id)).toBe(false);
    expect(withLabel(db().mails, "General").some((m) => m.id === id)).toBe(false);
  });

  it("saves over the same draft, with its copies and files, and logs it once", () => {
    const id = saveDraft({ to: "", subject: "Scaffold dates", body: "" });
    const logged = db().activity.length;
    const again = saveDraft({ to: "stephen@aylward.example", cc: "tadhg@abc.example", subject: "Scaffold dates, revised", body: "Now with the dates", attachments: [{ name: "programme.pdf", sizeKb: 240 }] }, id);
    expect(again).toBe(id);
    expect(db().mails.filter((m) => m.folder === "Drafts")).toHaveLength(1);
    expect(mail(id)).toMatchObject({ to: "stephen@aylward.example", cc: "tadhg@abc.example", subject: "Scaffold dates, revised", attachment: "programme.pdf" });
    expect(db().activity.length).toBe(logged);
    // Taking the copy and the file back off leaves no trace of them.
    saveDraft({ to: "stephen@aylward.example", subject: "Scaffold dates, revised", body: "Now with the dates" }, id);
    expect(mail(id)!.cc).toBeUndefined();
    expect(mail(id)!.attachments).toBeUndefined();
  });

  it("is used up when it is sent, so it cannot go twice", () => {
    const id = saveDraft({ to: "stephen@aylward.example", subject: "Scaffold dates", body: "Text" });
    const sent = composeMail({ to: "stephen@aylward.example", subject: "Scaffold dates", body: "Text" }, id);
    expect(mail(id)).toBeUndefined();
    expect(mail(sent)).toMatchObject({ folder: "Sent", to: "stephen@aylward.example", subject: "Scaffold dates" });
    expect(db().mails.some((m) => m.folder === "Drafts")).toBe(false);
  });

  it("can be thrown away", () => {
    const id = saveDraft({ to: "", subject: "Half an idea", body: "" });
    discardDraft(id);
    expect(mail(id)).toBeUndefined();
    expect(db().activity[0]).toMatchObject({ what: "Discarded a draft email", target: "Half an idea" });
  });

  it("is never archived, moved or filed under a label: it is sent or discarded", () => {
    const id = saveDraft({ to: "a@b.example", subject: "Draft", body: "" });
    moveMail(id, "Archive");
    moveMail(id, "Inbox");
    fileMail(id, "General");
    expect(mail(id)!.folder).toBe("Drafts");
  });

  it("is only worth keeping when something has been typed or attached", () => {
    expect(worthKeeping({ to: "", subject: "", body: "" })).toBe(false);
    expect(worthKeeping({ to: "  ", cc: " ", subject: " ", body: "\n" })).toBe(false);
    expect(worthKeeping({ to: "a@b.example", subject: "", body: "" })).toBe(true);
    expect(worthKeeping({ to: "", subject: "", body: "One line" })).toBe(true);
    expect(worthKeeping({ to: "", subject: "", body: "", attachments: [{ name: "plan.pdf" }] })).toBe(true);
  });
});
