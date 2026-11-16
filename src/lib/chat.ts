/**
 * Team chat rules: who sees which channels, what a channel or direct message is called in Teams
 * or Slack, what is unread, how messages group by day, and @mentions in the message box.
 *
 * Pure functions: no React, no store. The screen is `src/modules/chat/TeamChat.tsx`.
 */
import type { ChatApp } from "@/config/brand";
import type { ChatChannel, ChatMessage, ID } from "@/data/types";
import { dShort } from "./format";

export const CHAT_APP_NAME: Record<ChatApp, string> = { teams: "Microsoft Teams", slack: "Slack" };

/** How a channel shows: "C720 Ardmullen House" in Teams, "c720-ardmullen-house" in Slack (the # is drawn beside it). */
export function channelLabel(ch: Pick<ChatChannel, "name">, app: ChatApp): string {
  if (app === "teams") return ch.name;
  return ch.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The other person in a direct message. */
export function dmOther(ch: Pick<ChatChannel, "memberIds">, me: ID | null): ID | undefined {
  return ch.memberIds.find((id) => id !== me) ?? ch.memberIds[0];
}

/** What a channel is called for this person: its label, or the other person's name for a direct message. */
export function channelTitle(ch: ChatChannel, me: ID | null, nameOf: (id: ID) => string, app: ChatApp): string {
  return ch.kind === "dm" ? nameOf(dmOther(ch, me) ?? "") : channelLabel(ch, app);
}

/** The channels and direct messages one person belongs to, channels first in their own order. */
export function myChannels(channels: ChatChannel[], me: ID | null): { channels: ChatChannel[]; dms: ChatChannel[] } {
  const mine = channels.filter((c) => me !== null && c.memberIds.includes(me));
  return { channels: mine.filter((c) => c.kind === "channel"), dms: mine.filter((c) => c.kind === "dm") };
}

/** Messages in a channel newer than this person last read it, not counting their own. */
export function unreadCount(messages: ChatMessage[], ch: ChatChannel, me: ID | null): number {
  if (me === null) return 0;
  const since = ch.lastRead[me] ?? "";
  return messages.filter((m) => m.channelId === ch.id && m.authorId !== me && m.at > since).length;
}

/** Unread across everything one person belongs to. */
export function totalUnread(messages: ChatMessage[], channels: ChatChannel[], me: ID | null): number {
  const { channels: cs, dms } = myChannels(channels, me);
  return [...cs, ...dms].reduce((n, c) => n + unreadCount(messages, c, me), 0);
}

/** A channel's messages, oldest first, under a line for each day: Today, Yesterday, or the date. */
export function byDay(messages: ChatMessage[], channelId: ID, today: string): { label: string; messages: ChatMessage[] }[] {
  const out: { label: string; messages: ChatMessage[] }[] = [];
  const inChannel = messages.filter((m) => m.channelId === channelId).sort((a, b) => a.at.localeCompare(b.at));
  for (const m of inChannel) {
    const day = m.at.slice(0, 10);
    const diff = Math.round((Date.parse(today) - Date.parse(day)) / 86_400_000);
    const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : dShort(day);
    const last = out[out.length - 1];
    if (last && last.label === label) last.messages.push(m);
    else out.push({ label, messages: [m] });
  }
  return out;
}

/** The name being typed after an @ at the end of the box, or null when there is none. */
export function mentionQuery(text: string): string | null {
  const m = text.match(/(?:^|\s)@([\p{L}'’-]*)$/u);
  return m ? m[1]! : null;
}

/** Put the chosen name in place of the @ being typed. */
export function insertMention(text: string, name: string): string {
  return text.replace(/(^|\s)@([\p{L}'’-]*)$/u, `$1@${name} `);
}

/** Split a message so @mentions of known names can be shown in bold. */
export function splitMentions(text: string, names: string[]): { text: string; mention: boolean }[] {
  const sorted = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!sorted.length) return [{ text, mention: false }];
  const re = new RegExp(`@(?:${sorted.join("|")})`, "gu");
  const out: { text: string; mention: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ text: text.slice(at, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    at = m.index! + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at), mention: false });
  return out;
}
