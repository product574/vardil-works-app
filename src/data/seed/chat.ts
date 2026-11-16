import type { ChatChannel, ChatMessage, Project } from "../types";
import { at, workdays } from "./util";

/**
 * Team chat: a channel per live site plus Office, Plant and yard, and Accounts, and a few direct
 * messages. Written relative to the demo's day, so this morning's messages are always this
 * morning's. Every name, item of plant and supplier is one the rest of the sample data already
 * has: DH2 is in the yard, SW2 is at Dunmoy, Burren Lime supplies the lime, the Kilcashel tender
 * is the one in Email.
 */
const OFFICE = ["p-md", "p-cm1", "p-cm2", "p-qs", "p-acc", "p-off", "p-hs", "p-yard"];
const SITE_MANAGERS = ["p-sm1", "p-sm2", "p-sm3", "p-sm4", "p-sm5"];

type Row = [channel: string, who: string, day: "prev" | "today", time: string, text: string, attachment?: string];

const ROWS: Row[] = [
  // Yesterday (the working day before).
  ["ch-C724", "p-sm1", "prev", "11:20", "Welfare unit at the bridge is out of water. Can the yard sort it today?"],
  ["ch-C724", "p-yard", "prev", "11:34", "@Eoin Brosnan I'll fill it from the van tank when I bring out the generator diesel at 2."],
  ["ch-C720", "p-sm2", "prev", "14:05", "Susan Kane asked on site if the estate can keep the walled garden gate open for visitors at the weekend. OK with us?"],
  ["ch-C720", "p-cm1", "prev", "14:40", "@Cathal Minogue yes, as long as the scaffold on the gate side is fenced off. I'll confirm it to Susan in writing."],
  ["ch-office", "p-off", "prev", "15:10", "Two Safe Pass cards are up for renewal in the new year. Will I book the course or leave it with you, Declan?"],
  ["ch-office", "p-hs", "prev", "16:02", "Book it please Niamh, the January date in Athlone suits."],
  ["ch-plant", "p-yard", "prev", "16:30", "MX4 back from service, in the yard if anyone needs a pan mixer."],
  ["dm-md-cm1", "p-cm1", "prev", "17:05", "Ardmullen is going well. Render on the north side starts tomorrow if the weather holds."],
  ["dm-md-cm1", "p-md", "prev", "17:12", "Good. Send me a few photos when it's on."],

  // This morning.
  ["ch-plant", "p-yard", "today", "07:30", "Van leaves the yard at 8 with diesel for the Derrybawn generator."],
  ["ch-C720", "p-sm2", "today", "07:31", "Morning all. Render going on the north elevation today, dry until about 4."],
  ["ch-C720", "p-cm1", "today", "07:45", "Good. Photos at lunchtime please, Susan is asking for them."],
  ["ch-C722", "p-sm4", "today", "07:40", "Cutting stone for the column bases this morning."],
  ["ch-C719", "p-sm1", "today", "07:50", "Pointing on the south aisle wall finished yesterday. Starting the porch today."],
  ["ch-C721", "p-sm3", "today", "07:55", "Stripping the north pitch today. Slates going on pallets as we go."],
  ["ch-C720", "p-sm2", "today", "08:12", "DH1 is not keeping up in the drawing room, the walls are still wet after the weekend. Can we get a second dehumidifier out?"],
  ["ch-C720", "p-yard", "today", "08:19", "@Cathal Minogue DH2 is in the yard. It'll go out on the van first thing tomorrow with a hose."],
  ["ch-accounts", "p-off", "today", "08:20", "Cathal's fuel card was declined at the filling station this morning. Is there a problem with the account?"],
  ["ch-accounts", "p-acc", "today", "08:34", "It hit the monthly limit. I've asked them to raise it, should work again within the hour."],
  ["ch-C719", "p-sm1", "today", "08:30", "The NHL 3.5 from Burren Lime didn't come yesterday. We'll be out of lime for mortar by the end of tomorrow."],
  ["ch-C719", "p-cm1", "today", "08:41", "On to them now @Eoin Brosnan. If it slips again I'll get two bags out from the yard."],
  ["ch-C723", "p-sm5", "today", "08:40", "Need another bricklayer for the rest of the week to get the railing plinth done before the stone arrives."],
  ["ch-C725", "p-sm3", "today", "08:55", "Edge protection on the second floor loading bay was taken down for the timber delivery and nobody put it back.", "loading-bay.jpg"],
  ["ch-C725", "p-hs", "today", "09:01", "@Róisín Garvey keep everyone off the bay until the rail is back up. I'll be there after 11 to check it."],
  ["ch-C722", "p-sm4", "today", "09:00", "Neighbour at the back came over about dust from the stone saw. She says it's on her washing and her car."],
  ["ch-C721", "p-sm3", "today", "09:02", "The client's architect was on site and asked if the slates off the north pitch can go back on. He wants it in writing."],
  ["ch-office", "p-qs", "today", "09:05", "The council's tender for the Kilcashel Courthouse portico came in by email this morning. I've a reply drafted saying we'll price it and take the site visit. Happy for us to go for it?"],
  ["dm-md-off", "p-off", "today", "08:47", "Sinéad's leave request is in your email, the week after next. The rota works if you're happy."],
  ["dm-md-yard", "p-yard", "today", "08:58", "Telehandler at the Corn Mill is due its exam in the new year. Will I book it in with the same crowd as last time?"],
  ["dm-cm1-sm2", "p-sm2", "today", "08:15", "Can you ring me when you get a minute? About the gate lodge scaffold."],
];

export function seedChat(today: string, projects: Project[]): { chatChannels: ChatChannel[]; chatMessages: ChatMessage[] } {
  const prev = workdays(today, -1);
  const live = projects.filter((p) => p.status === "Live").sort((a, b) => a.code.localeCompare(b.code));
  const site = live.map((p): ChatChannel => ({
    id: `ch-${p.code}`,
    kind: "channel",
    name: `${p.code} ${p.name}`,
    projectId: p.id,
    purpose: `Site team and office for ${p.name}`,
    memberIds: [...new Set(["p-md", p.contractsManagerId, p.siteManagerId, "p-qs", "p-hs", "p-yard"])],
    lastRead: {},
  }));
  const ch = (id: string, name: string, purpose: string, memberIds: string[]): ChatChannel => ({ id, kind: "channel", name, purpose, memberIds, lastRead: {} });
  const dm = (a: string, b: string): ChatChannel => ({ id: `dm-${a.slice(2)}-${b.slice(2)}`, kind: "dm", name: "", purpose: "Direct message", memberIds: [a, b], lastRead: {} });
  const chatChannels: ChatChannel[] = [
    ...site,
    ch("ch-office", "Office", "Everyone in the office", OFFICE),
    ch("ch-plant", "Plant and yard", "Plant moves, servicing and the yard", ["p-md", "p-yard", "p-cm1", "p-cm2", "p-hs", ...SITE_MANAGERS]),
    ch("ch-accounts", "Accounts", "Invoices, cards and payments", ["p-md", "p-acc", "p-off", "p-qs"]),
    dm("p-md", "p-cm1"),
    dm("p-md", "p-off"),
    dm("p-md", "p-yard"),
    dm("p-cm1", "p-sm2"),
  ];
  const chatMessages: ChatMessage[] = ROWS.map(([channelId, authorId, d, time, text, attachment], i) => ({
    id: `cm-${String(i + 1).padStart(2, "0")}`,
    channelId,
    authorId,
    at: at(d === "today" ? today : prev, time),
    text,
    ...(attachment ? { attachment } : {}),
  })).sort((a, b) => a.at.localeCompare(b.at));
  // Everyone has read the working day before; this morning's messages are new to anyone who has not posted since.
  const endPrev = at(prev, "23:59");
  for (const c of chatChannels) for (const id of c.memberIds) {
    const lastOwn = chatMessages.filter((m) => m.channelId === c.id && m.authorId === id).map((m) => m.at).sort().pop();
    c.lastRead[id] = lastOwn && lastOwn > endPrev ? lastOwn : endPrev;
  }
  return { chatChannels, chatMessages };
}
