import { routeFor } from "@/lib/chat";
import type { ChatChannel, ChatMessage, ChatTag, Project } from "../types";
import { at, workdays } from "./util";

/**
 * Team chat (step 2): a channel per live site plus the office, plant and yard, and accounts.
 * Written relative to the demo's day, so this morning's messages are always this morning's.
 * Every name, item of plant and supplier here is one the rest of the sample data already has:
 * DH2 is in the yard, SW2 is at Dunmoy, Burren Lime supplies the lime, and the Kilcashel tender
 * is the one in Email.
 */
const CHANNELS: [id: string, name: string, code: string | null, purpose: string][] = [
  ["ch-C719", "C719 St Finian's Church", "C719", "Site team and office for St Finian's Church"],
  ["ch-C720", "C720 Ardmullen House", "C720", "Site team and office for Ardmullen House"],
  ["ch-C721", "C721 The Old Corn Mill", "C721", "Site team and office for The Old Corn Mill"],
  ["ch-C722", "C722 Dunmoy Courthouse", "C722", "Site team and office for Dunmoy Courthouse"],
  ["ch-C723", "C723 14 Fitzgarret Square", "C723", "Site team and office for 14 Fitzgarret Square"],
  ["ch-C724", "C724 Derrybawn Bridge", "C724", "Site team and office for Derrybawn Bridge"],
  ["ch-C725", "C725 Granary Quay Warehouses", "C725", "Site team and office for Granary Quay Warehouses"],
  ["ch-office", "Office", null, "Everyone in the office"],
  ["ch-plant", "Plant and yard", null, "Plant moves, servicing and the yard"],
  ["ch-accounts", "Accounts", null, "Invoices, cards and payments"],
];

type Row = {
  ch: string;
  who: string;
  day: "today" | "prev";
  time: string;
  text: string;
  tag?: ChatTag;
  draft?: string;
  /** Dealt with on the previous working day: a reply posted, or closed without one. */
  done?: { reply?: string; time: string };
};

const ROWS: Row[] = [
  // Dealt with yesterday.
  { ch: "ch-C724", who: "p-sm1", day: "prev", time: "11:20", text: "Welfare unit at the bridge is out of water. Can the yard sort it today?", tag: "Plant request", done: { reply: "Eoin, I'll fill it from the van tank when I bring out the generator diesel at 2.", time: "11:34" } },
  { ch: "ch-C720", who: "p-sm2", day: "prev", time: "14:05", text: "Susan Kane asked on site if the estate can keep the walled garden gate open for visitors at the weekend. Is that OK with us?", tag: "Client query", done: { reply: "Cathal, yes, as long as the scaffold on the gate side is fenced off. I'll confirm it to Susan in writing.", time: "14:40" } },
  { ch: "ch-office", who: "p-off", day: "prev", time: "15:10", text: "Two Safe Pass cards are up for renewal in the new year. Will I book the course or leave it with you?", tag: "Safety", done: { time: "16:02" } },

  // This morning.
  { ch: "ch-plant", who: "p-yard", day: "today", time: "07:30", text: "Van leaves the yard at 8 with diesel for the Derrybawn generator." },
  { ch: "ch-C720", who: "p-sm2", day: "today", time: "07:31", text: "Morning all. Render going on the north elevation today, dry until about 4." },
  { ch: "ch-C720", who: "p-cm1", day: "today", time: "07:45", text: "Good. Photos at lunchtime please, Susan is asking for them." },
  { ch: "ch-C722", who: "p-sm4", day: "today", time: "07:40", text: "Cutting stone for the column bases this morning." },
  { ch: "ch-C719", who: "p-sm1", day: "today", time: "07:50", text: "Pointing on the south aisle wall finished yesterday. Starting the porch today." },
  { ch: "ch-C721", who: "p-sm3", day: "today", time: "07:55", text: "Stripping the north pitch today. Slates going on pallets as we go." },
  {
    ch: "ch-C720", who: "p-sm2", day: "today", time: "08:12", tag: "Plant request",
    text: "DH1 is not keeping up in the drawing room, the walls are still wet after the weekend. Can we get a second dehumidifier out?",
    draft: "Cathal, DH2 is in the yard. It goes out on the van first thing tomorrow and I'll bring the hose with it.",
  },
  {
    ch: "ch-accounts", who: "p-off", day: "today", time: "08:20", tag: "Accounts",
    text: "Cathal's fuel card was declined at the filling station this morning. Is there a problem with the account?",
    draft: "Niamh, the card reached its monthly limit. I've asked the fuel company to raise it and it should work again within the hour.",
  },
  {
    ch: "ch-C719", who: "p-sm1", day: "today", time: "08:30", tag: "Supplies",
    text: "The NHL 3.5 from Burren Lime didn't come yesterday. We'll be out of lime for mortar by the end of tomorrow.",
    draft: "Eoin, I've been on to Burren Lime. The pallet is on tomorrow morning's load. If it slips again I'll get two bags out from the yard to keep you going.",
  },
  {
    ch: "ch-C723", who: "p-sm5", day: "today", time: "08:40", tag: "Labour",
    text: "Need another bricklayer for the rest of the week to get the railing plinth done before the stone arrives.",
    draft: "Shane, I'll look at the week ahead for a bricklayer with free days and come back to you before 3.",
  },
  {
    ch: "ch-C725", who: "p-sm3", day: "today", time: "08:55", tag: "Safety",
    text: "Edge protection on the second floor loading bay was taken down for the timber delivery and nobody put it back.",
    draft: "Róisín, keep everyone off the loading bay until the rail is back up. I'll be there after 11 to check it and sign it off.",
  },
  {
    ch: "ch-C722", who: "p-sm4", day: "today", time: "09:00", tag: "Complaint",
    text: "Neighbour at the back came over about dust from the stone saw. She says it's on her washing and her car.",
    draft: "Darragh, wet cutting only from now on, and keep the saw behind the hoarding on the courthouse side. I'll ring her this afternoon.",
  },
  {
    ch: "ch-C721", who: "p-sm3", day: "today", time: "09:02", tag: "Client query",
    text: "The client's architect was on site and asked if the slates off the north pitch can go back on. He wants it in writing.",
    draft: "Róisín, tell him we'll put it in writing this week: sound slates are being sorted for reuse, and we'll send a count with photos before any new slate is ordered.",
  },
  {
    ch: "ch-office", who: "p-qs", day: "today", time: "09:05", tag: "Decision",
    text: "The council's tender for the Kilcashel Courthouse portico came in by email this morning. I've a reply drafted saying we'll price it and take the site visit. Are you happy for us to go for it?",
    draft: "Colm, yes, go for it. Book the site visit and start from the rates on the Dunmoy Courthouse job.",
  },
];

export function seedChat(today: string, projects: Project[], names: Map<string, string>): { chatChannels: ChatChannel[]; chatMessages: ChatMessage[] } {
  const prev = workdays(today, -1);
  const pid = (code: string) => `pr-${code}`;
  const chatChannels: ChatChannel[] = CHANNELS.map(([id, name, code, purpose]) => ({ id, name, purpose, ...(code ? { projectId: pid(code) } : {}) }));
  const projectOf = (chId: string) => projects.find((p) => p.id === chatChannels.find((c) => c.id === chId)?.projectId);
  const chatMessages: ChatMessage[] = [];
  ROWS.forEach((r, i) => {
    const day = r.day === "today" ? today : prev;
    const id = `cm-${String(i + 1).padStart(2, "0")}`;
    const msg: ChatMessage = { id, channelId: r.ch, authorId: r.who, at: at(day, r.time), text: r.text };
    if (r.tag) {
      const toId = routeFor(r.tag, projectOf(r.ch));
      msg.action = r.done
        ? { tag: r.tag, toId, status: "Done", outcome: r.done.reply ? "Replied" : "Done without reply", resolvedBy: names.get(toId), resolvedAt: at(day, r.done.time) }
        : { tag: r.tag, toId, status: "Open", draft: r.draft };
    }
    chatMessages.push(msg);
    if (r.done?.reply) chatMessages.push({ id: `${id}-r`, channelId: r.ch, authorId: msg.action!.toId, at: at(day, r.done.time), text: r.done.reply, replyTo: id });
  });
  chatMessages.sort((a, b) => a.at.localeCompare(b.at));
  return { chatChannels, chatMessages };
}
