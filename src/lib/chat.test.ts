import { describe, expect, it } from "vitest";
import { buildSeed } from "@/data/seed";
import type { ChatMessage } from "@/data/types";
import { CHAT_DESK, CHAT_TAGS, channelLabel, channelList, chatCounts, chatList, routeFor, routeReason, threadAround } from "./chat";

const msg = (id: string, at: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, channelId: "ch-a", authorId: "p-sm1", at, text: id, ...extra });
const open = (toId: string) => ({ tag: "Supplies" as const, toId, status: "Open" as const, draft: "x" });

describe("routeFor", () => {
  it("sends project work to the contracts manager running the site", () => {
    for (const tag of ["Supplies", "Labour", "Client query", "Complaint"] as const) expect(routeFor(tag, { contractsManagerId: "p-cm2" })).toBe("p-cm2");
  });
  it("sends the rest to the person whose desk it is", () => {
    expect(routeFor("Plant request")).toBe(CHAT_DESK.plant);
    expect(routeFor("Safety")).toBe(CHAT_DESK.safety);
    expect(routeFor("Accounts")).toBe(CHAT_DESK.accounts);
    expect(routeFor("Decision")).toBe(CHAT_DESK.director);
    expect(routeFor("Question")).toBe(CHAT_DESK.office);
  });
  it("falls back to a contracts manager when project work has no project", () => {
    expect(routeFor("Complaint")).toBe(CHAT_DESK.fallback);
  });
  it("gives every tag somewhere to go", () => {
    for (const tag of CHAT_TAGS) expect(routeFor(tag, { contractsManagerId: "p-cm1" })).toMatch(/^p-/);
  });
});

describe("routeReason", () => {
  const pat = { name: "Pat Scully", trade: "Yard and plant manager" };
  it("names the desk", () => expect(routeReason("Plant request", pat)).toBe("Plant requests go to Pat Scully, yard and plant manager."));
  it("names the project for project work", () => expect(routeReason("Complaint", { name: "Aisling Rafter", trade: "Contracts manager" }, { code: "C722", contractsManagerId: "p-cm2" })).toBe("Complaints on C722 go to Aisling Rafter, who runs it as contracts manager."));
  it("says who passed it on by hand", () => expect(routeReason("Supplies", pat, undefined, "Aidan King")).toBe("Aidan King passed it to Pat Scully."));
});

describe("channelLabel", () => {
  it("keeps the Teams name as it is", () => expect(channelLabel({ name: "C719 St Finian's Church" }, "teams")).toBe("C719 St Finian's Church"));
  it("writes a Slack channel name", () => {
    expect(channelLabel({ name: "C719 St Finian's Church" }, "slack")).toBe("#c719-st-finians-church");
    expect(channelLabel({ name: "Plant and yard" }, "slack")).toBe("#plant-and-yard");
    expect(channelLabel({ name: "Café, Róisín's" }, "slack")).toBe("#cafe-roisins");
  });
});

describe("lists", () => {
  const ms: ChatMessage[] = [
    msg("a", "2026-11-16T08:00:00", { action: open("p-1") }),
    msg("b", "2026-11-16T09:00:00", { action: open("p-2") }),
    msg("c", "2026-11-13T09:00:00", { action: { tag: "Safety", toId: "p-1", status: "Done", outcome: "Done without reply" } }),
    msg("d", "2026-11-16T09:30:00"),
    msg("e", "2026-11-16T10:00:00", { channelId: "ch-b", action: open("p-1") }),
  ];
  it("needs action holds every open one, newest first", () => expect(chatList(ms, "open", "p-1").map((m) => m.id)).toEqual(["e", "b", "a"]));
  it("passed to me holds only mine", () => expect(chatList(ms, "mine", "p-1").map((m) => m.id)).toEqual(["e", "a"]));
  it("done holds the closed ones", () => expect(chatList(ms, "done", "p-1").map((m) => m.id)).toEqual(["c"]));
  it("can be kept to some channels", () => expect(chatList(ms, "open", "p-1", new Set(["ch-a"])).map((m) => m.id)).toEqual(["b", "a"]));
  it("counts match the lists", () => expect(chatCounts(ms, "p-1")).toEqual({ open: 3, mine: 2, done: 1 }));
  it("a channel lists open ones first, then done", () => expect(channelList(ms, "ch-a").map((m) => m.id)).toEqual(["b", "a", "c"]));
  it("nobody signed in has nothing passed to them", () => expect(chatList(ms, "mine", null)).toEqual([]));
});

describe("threadAround", () => {
  const ms: ChatMessage[] = [
    msg("1", "2026-11-16T07:00:00"),
    msg("2", "2026-11-16T07:10:00"),
    msg("3", "2026-11-16T07:20:00"),
    msg("x", "2026-11-16T07:30:00", { channelId: "ch-b" }),
    msg("4", "2026-11-16T08:00:00", { action: open("p-1") }),
    msg("5", "2026-11-16T08:30:00"),
    msg("4r", "2026-11-16T09:00:00", { replyTo: "4" }),
  ];
  it("shows the two before it from the same channel, then the message and its reply", () => {
    const t = threadAround(ms, ms[4]!);
    expect(t.shown.map((m) => m.id)).toEqual(["2", "3", "4", "4r"]);
    expect(t.earlier).toBe(1);
  });
  it("starts the channel without anything earlier", () => expect(threadAround(ms, ms[0]!)).toEqual({ earlier: 0, shown: [ms[0]] }));
});

describe("sample data", () => {
  const { db } = buildSeed("2026-11-16");
  const person = (id: string) => db.people.find((p) => p.id === id);
  it("has a channel for every live site and each one is a real project", () => {
    const live = db.projects.filter((p) => p.status === "Live").map((p) => p.id).sort();
    expect(db.chatChannels.filter((c) => c.projectId).map((c) => c.projectId).sort()).toEqual(live);
  });
  it("every message is by a real person in a real channel", () => {
    for (const m of db.chatMessages) {
      expect(person(m.authorId), m.id).toBeTruthy();
      expect(db.chatChannels.some((c) => c.id === m.channelId), m.id).toBe(true);
    }
  });
  it("each picked-out message went where the rule says", () => {
    for (const m of db.chatMessages.filter((x) => x.action)) {
      const project = db.projects.find((p) => p.id === db.chatChannels.find((c) => c.id === m.channelId)?.projectId);
      expect(m.action!.toId, m.id).toBe(routeFor(m.action!.tag, project));
    }
  });
  it("open ones have a draft, done ones do not, and a reply is posted by the person it went to", () => {
    for (const m of db.chatMessages.filter((x) => x.action)) {
      if (m.action!.status === "Open") expect(m.action!.draft, m.id).toBeTruthy();
      else expect(m.action!.draft, m.id).toBeUndefined();
      for (const r of db.chatMessages.filter((x) => x.replyTo === m.id)) {
        expect(r.authorId).toBe(m.action!.toId);
        expect(r.at >= m.at).toBe(true);
      }
    }
  });
  it("has work in each view, and something passed to the managing director", () => {
    const c = chatCounts(db.chatMessages, "p-md");
    expect(c.open).toBeGreaterThanOrEqual(6);
    expect(c.mine).toBeGreaterThanOrEqual(1);
    expect(c.done).toBeGreaterThanOrEqual(2);
  });
  it("nothing is stamped after this morning, and nothing on a weekend", () => {
    for (const m of db.chatMessages) {
      expect(m.at <= "2026-11-16T09:30:00", m.id).toBe(true);
      expect([0, 6]).not.toContain(new Date(m.at.slice(0, 10) + "T12:00:00Z").getUTCDay());
    }
  });
});
