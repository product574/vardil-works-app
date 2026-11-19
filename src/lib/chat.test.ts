import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { ChatChannel, ChatMessage } from "@/data/types";
import { byDay, channelLabel, channelTitle, dmOther, insertMention, mentionQuery, myChannels, splitMentions, totalUnread, unreadCount } from "./chat";

const ch = (id: string, kind: "channel" | "dm", memberIds: string[], lastRead: Record<string, string> = {}): ChatChannel => ({ id, kind, name: kind === "dm" ? "" : "C720 Ardmullen House", purpose: "", memberIds, lastRead });
const msg = (id: string, channelId: string, authorId: string, at: string): ChatMessage => ({ id, channelId, authorId, at, text: id });

describe("names", () => {
  it("keeps the Teams name as it is", () => expect(channelLabel({ name: "C719 St Finian's Church" }, "teams")).toBe("C719 St Finian's Church"));
  it("writes a Slack channel name", () => {
    expect(channelLabel({ name: "C719 St Finian's Church" }, "slack")).toBe("c719-st-finians-church");
    expect(channelLabel({ name: "Plant and yard" }, "slack")).toBe("plant-and-yard");
    expect(channelLabel({ name: "Café, Róisín's" }, "slack")).toBe("cafe-roisins");
  });
  it("a direct message is called after the other person", () => {
    const d = ch("dm-1", "dm", ["p-md", "p-cm1"]);
    const nameOf = (id: string) => ({ "p-md": "Aidan King", "p-cm1": "Tadhg Morrissey" })[id] ?? "";
    expect(dmOther(d, "p-md")).toBe("p-cm1");
    expect(channelTitle(d, "p-md", nameOf, "slack")).toBe("Tadhg Morrissey");
    expect(channelTitle(d, "p-cm1", nameOf, "teams")).toBe("Aidan King");
  });
});

describe("who sees what", () => {
  const all = [ch("a", "channel", ["p-1", "p-2"]), ch("b", "channel", ["p-2"]), ch("d", "dm", ["p-1", "p-3"])];
  it("only what you are a member of, channels apart from direct messages", () => {
    const mine = myChannels(all, "p-1");
    expect(mine.channels.map((c) => c.id)).toEqual(["a"]);
    expect(mine.dms.map((c) => c.id)).toEqual(["d"]);
  });
  it("nothing for nobody", () => expect(myChannels(all, null)).toEqual({ channels: [], dms: [] }));
});

describe("unread", () => {
  const a = ch("a", "channel", ["p-1", "p-2"], { "p-1": "2026-11-16T08:00:00" });
  const ms = [msg("1", "a", "p-2", "2026-11-16T07:00:00"), msg("2", "a", "p-2", "2026-11-16T08:30:00"), msg("3", "a", "p-1", "2026-11-16T08:40:00"), msg("4", "a", "p-2", "2026-11-16T09:00:00")];
  it("counts what others posted since you last looked", () => expect(unreadCount(ms, a, "p-1")).toBe(2));
  it("never your own", () => expect(unreadCount([msg("x", "a", "p-1", "2026-11-16T10:00:00")], a, "p-1")).toBe(0));
  it("everything when you have never looked", () => expect(unreadCount(ms, a, "p-2")).toBe(1));
  it("adds up across everything you are in", () => expect(totalUnread(ms, [a, ch("b", "channel", ["p-2"])], "p-1")).toBe(2));
});

describe("byDay", () => {
  it("groups oldest first under Today, Yesterday and the date", () => {
    const ms = [msg("3", "a", "p", "2026-11-16T08:00:00"), msg("1", "a", "p", "2026-11-12T09:00:00"), msg("2", "a", "p", "2026-11-15T09:00:00"), msg("4", "b", "p", "2026-11-16T09:00:00")];
    const g = byDay(ms, "a", "2026-11-16");
    expect(g.map((x) => x.label)).toEqual(["12 Nov", "Yesterday", "Today"]);
    expect(g.map((x) => x.messages.map((m) => m.id))).toEqual([["1"], ["2"], ["3"]]);
  });
});

describe("mentions", () => {
  it("finds the name being typed after @", () => {
    expect(mentionQuery("thanks @Ca")).toBe("Ca");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("email me@home")).toBeNull();
    expect(mentionQuery("no mention")).toBeNull();
  });
  it("puts the chosen name in", () => expect(insertMention("thanks @Ca", "Cathal Minogue")).toBe("thanks @Cathal Minogue "));
  it("marks known names, longest first", () => {
    expect(splitMentions("@Cathal Minogue DH2 is out", ["Cathal Minogue", "Cathal"])).toEqual([{ text: "@Cathal Minogue", mention: true }, { text: " DH2 is out", mention: false }]);
    expect(splitMentions("no one", ["Cathal Minogue"])).toEqual([{ text: "no one", mention: false }]);
  });
});

describe("sample data", () => {
  const { db } = buildSeed("2026-11-16");
  const person = (id: string) => db.people.find((p) => p.id === id);
  it("has a channel for every live site, each a real project", () => {
    const live = db.projects.filter((p) => p.status === "Live").map((p) => p.id).sort();
    expect(db.chatChannels.filter((c) => c.projectId).map((c) => c.projectId).sort()).toEqual(live);
  });
  it("each site channel holds the people who run it", () => {
    for (const c of db.chatChannels.filter((x) => x.projectId)) {
      const p = db.projects.find((x) => x.id === c.projectId)!;
      expect(c.memberIds).toEqual(expect.arrayContaining(["p-md", p.siteManagerId, p.contractsManagerId]));
    }
  });
  it("every message is by a member of a real channel, and every member is a real person", () => {
    for (const m of db.chatMessages) {
      const c = db.chatChannels.find((x) => x.id === m.channelId);
      expect(c, m.id).toBeTruthy();
      expect(c!.memberIds, m.id).toContain(m.authorId);
    }
    for (const c of db.chatChannels) for (const id of c.memberIds) expect(person(id), `${c.id} ${id}`).toBeTruthy();
  });
  it("every @mention is someone in that channel", () => {
    const names = db.people.map((p) => p.name);
    for (const m of db.chatMessages) {
      const members = db.chatChannels.find((c) => c.id === m.channelId)!.memberIds.map((id) => person(id)!.name);
      for (const part of splitMentions(m.text, names).filter((x) => x.mention)) expect(members, m.id).toContain(part.text.slice(1));
    }
  });
  it("the managing director has news waiting, and nothing is stamped after this morning or on a weekend", () => {
    expect(totalUnread(db.chatMessages, db.chatChannels, "p-md")).toBeGreaterThanOrEqual(5);
    for (const m of db.chatMessages) {
      expect(m.at <= "2026-11-16T09:30:00", m.id).toBe(true);
      expect([0, 6]).not.toContain(new Date(m.at.slice(0, 10) + "T12:00:00Z").getUTCDay());
    }
  });
  it("a site manager sees their own sites' channels and not the others", () => {
    const eoin = myChannels(db.chatChannels, "p-sm1").channels.map((c) => c.id);
    expect(eoin).toEqual(expect.arrayContaining(["ch-C719", "ch-C724", "ch-plant"]));
    expect(eoin).not.toContain("ch-C720");
    expect(eoin).not.toContain("ch-accounts");
  });
});
