/**
 * Email rules, for the Gmail-style Email screen (16 Nov, Oisin, after the reference demos):
 * folders and their counts, Focused and Other, day groups, search, the short preview line,
 * and the summary and action items in the side panel.
 *
 * Pure functions: no React, no store. The screen is `src/modules/inbox/Inbox.tsx`.
 */
import type { Mail, MailAttachment, MailIntent } from "@/data/types";
import { dShort } from "./format";

export type MailFolder = "Inbox" | "Starred" | "Sent" | "Drafts" | "Archive";

/** Emails in a folder. Starred and Drafts gather from the others, as in Gmail: Drafts are replies written but not sent. */
export function inFolder(mails: Mail[], folder: MailFolder): Mail[] {
  if (folder === "Starred") return mails.filter((m) => m.starred);
  if (folder === "Drafts") return mails.filter((m) => m.folder !== "Sent" && !!m.replyDraft);
  return mails.filter((m) => m.folder === folder);
}

/** Emails with a label, wherever they are filed (not the copies in Sent). */
export function withLabel(mails: Mail[], label: MailIntent): Mail[] {
  return mails.filter((m) => m.folder !== "Sent" && m.intent === label);
}

/**
 * Putting an email under a label takes it out of the Inbox, as in Gmail (Oisin, 17 Nov): it is
 * then "Filed", and found under that label. One already archived stays archived, and one already
 * filed stays filed; either way it takes the label. Sent copies are never filed.
 */
export function filedFolder(folder: Mail["folder"]): Mail["folder"] {
  return folder === "Inbox" ? "Filed" : folder;
}

/** Unread emails under a label, in the Inbox or filed under it. Archived ones were read on the way. */
export function labelUnread(mails: Mail[], label: MailIntent): number {
  return mails.filter((m) => (m.folder === "Inbox" || m.folder === "Filed") && m.intent === label && !m.read).length;
}

/** Where an email is, in words, for the open email. */
export function whereKept(m: Pick<Mail, "folder" | "intent">): string {
  if (m.folder === "Filed") return `Filed under ${m.intent}, out of the inbox`;
  if (m.folder === "Archive") return "Archived";
  return m.folder;
}

/** The files on an email: the ones attached here, or the one a sample email names. */
export function attachmentsOf(m: Pick<Mail, "attachment" | "attachments">): MailAttachment[] {
  if (m.attachments?.length) return m.attachments;
  return m.attachment ? [{ name: m.attachment }] : [];
}

/** At most this many files on one email written in the demo: they are kept in the browser. */
export const MAX_ATTACHMENTS = 5;

/** "240 KB" or "1.2 MB". */
export function sizeLabel(kb: number): string {
  const whole = Math.max(1, Math.round(kb));
  return whole >= 1000 ? `${(whole / 1000).toFixed(1)} MB` : `${whole} KB`;
}

/** Supplier paperwork and general mail go under Other; anything someone has to act on is Focused. */
const OTHER = new Set<MailIntent>(["Supplier statement", "General"]);
export const isFocused = (m: Mail) => !OTHER.has(m.intent);

export function newestFirst(a: Mail, b: Mail) {
  return b.receivedAt.localeCompare(a.receivedAt);
}

/** Search across who it is from or to, the subject and the text. Every word must match somewhere. */
export function searchMail(mails: Mail[], q: string): Mail[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return mails;
  return mails.filter((m) => {
    const hay = `${m.fromName} ${m.fromAddress} ${m.to ?? ""} ${m.subject} ${m.body} ${attachmentsOf(m).map((a) => a.name).join(" ")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Rows under Today, Yesterday, Earlier this week and Older, in the order given. */
export function byDay(mails: Mail[], today: string): { label: string; mails: Mail[] }[] {
  const out: { label: string; mails: Mail[] }[] = [];
  for (const m of mails) {
    const diff = Math.round((Date.parse(today) - Date.parse(m.receivedAt.slice(0, 10))) / 86_400_000);
    const label = diff <= 0 ? "Today" : diff === 1 ? "Yesterday" : diff < 7 ? "Earlier this week" : "Older";
    const last = out[out.length - 1];
    if (last && last.label === label) last.mails.push(m);
    else out.push({ label, mails: [m] });
  }
  return out;
}

/** The time for today, otherwise the date, as Gmail shows it on the right of a row. */
export function rowWhen(stamp: string, today: string): string {
  return stamp.slice(0, 10) === today ? stamp.slice(11, 16) : dShort(stamp.slice(0, 10));
}

const GREETING = /^(dear|hi|hello|good (morning|afternoon|evening)|to whom it may concern|morning)\b[^\n]*$/i;
const SIGN_OFF = /^(kind regards|regards|thanks|thank you|many thanks|yours sincerely|best|cheers)[,.!]?$/i;

/** The words of an email without its greeting and sign-off, as one line. */
export function plainText(body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const start = lines.length > 1 && GREETING.test(lines[0]!) ? 1 : 0;
  let end = lines.length;
  const off = lines.findIndex((l, i) => i >= start && SIGN_OFF.test(l));
  if (off > start) end = off;
  return lines.slice(start, end).join(" ");
}

/** The grey preview line after the subject. */
export function snippet(body: string): string {
  return plainText(body);
}

/** Two sentences of what the email says, after who wrote it and about what. */
export function summary(m: Pick<Mail, "fromName" | "subject" | "body">): string {
  const sentences = plainText(m.body).match(/[^.!?]+[.!?]+/g) ?? [plainText(m.body)];
  return `${m.fromName} wrote about "${m.subject}". ${sentences.slice(0, 2).map((x) => x.trim()).join(" ")}`;
}

/** What someone has to do about each kind of email, for the side panel. */
const ACTIONS: Record<MailIntent, string[]> = {
  Enquiry: ["Log it as an enquiry", "Arrange a site visit", "Reply to the sender"],
  "Tender invitation": ["Decide whether to tender", "Book the site visit", "Note the return date"],
  "Quote query": ["Revise the quote", "Reply to the client"],
  Certificate: ["Record the new expiry date", "File the card on their record"],
  "Holiday request": ["Approve or decline the leave", "Check the week ahead for cover"],
  "Completion request": ["Check the snagging list", "Send the handover pack"],
  Complaint: ["Call the person back today", "Tell the site manager", "Reply in writing"],
  "Supplier statement": ["Check it against supplier invoices", "No reply needed unless something is wrong"],
  "Conservation officer": ["File the approval with the project", "Add any conditions to the site instructions"],
  General: ["Read and file, or reply if needed"],
};
export const actionItems = (intent: MailIntent): string[] => ACTIONS[intent];

/** Counts for the side panel: unread in Inbox, and drafts waiting. Starred, Sent and Archive show no count, as in Gmail. */
export function folderCounts(mails: Mail[]) {
  return { Inbox: mails.filter((m) => m.folder === "Inbox" && !m.read).length, Drafts: inFolder(mails, "Drafts").length };
}
