/**
 * Team chat rules (step 2, decision 64): which messages need someone, who each kind goes to and
 * why, how channels are named in Teams or Slack, and the conversation around a message.
 *
 * Pure functions: no React, no store. The screen is `src/modules/chat/TeamChat.tsx`.
 */
import type { ChatApp } from "@/config/brand";
import type { ChatChannel, ChatMessage, ChatTag, ID, Person, Project } from "@/data/types";

export const CHAT_TAGS: ChatTag[] = ["Plant request", "Supplies", "Labour", "Client query", "Complaint", "Safety", "Accounts", "Decision", "Question"];

export const CHAT_APP_NAME: Record<ChatApp, string> = { teams: "Microsoft Teams", slack: "Slack" };

/** The office people each kind of message goes to, when it is not the project's contracts manager. */
export const CHAT_DESK = { plant: "p-yard", safety: "p-hs", accounts: "p-acc", director: "p-md", office: "p-off", fallback: "p-cm1" } as const;

/** Kinds that belong to whoever runs the project as contracts manager. */
const PROJECT_TAGS = new Set<ChatTag>(["Supplies", "Labour", "Client query", "Complaint"]);

/** Who a message with this tag goes to. Project work goes to the contracts manager running that site. */
export function routeFor(tag: ChatTag, project?: Pick<Project, "contractsManagerId">): ID {
  if (PROJECT_TAGS.has(tag)) return project?.contractsManagerId ?? CHAT_DESK.fallback;
  if (tag === "Plant request") return CHAT_DESK.plant;
  if (tag === "Safety") return CHAT_DESK.safety;
  if (tag === "Accounts") return CHAT_DESK.accounts;
  if (tag === "Decision") return CHAT_DESK.director;
  return CHAT_DESK.office;
}

/** One sentence on why a message went to the person it did, for the open message. */
export function routeReason(tag: ChatTag, to: Pick<Person, "name" | "trade">, project?: Pick<Project, "code" | "contractsManagerId">, passedBy?: string): string {
  if (passedBy) return `${passedBy} passed it to ${to.name}.`;
  if (PROJECT_TAGS.has(tag) && project) return `${tagWords(tag)} on ${project.code} go to ${to.name}, who runs it as contracts manager.`;
  return `${tagWords(tag)} go to ${to.name}, ${to.trade.toLowerCase()}.`;
}

function tagWords(tag: ChatTag): string {
  const words: Record<ChatTag, string> = {
    "Plant request": "Plant requests",
    Supplies: "Supplies",
    Labour: "Requests for people",
    "Client query": "Client queries",
    Complaint: "Complaints",
    Safety: "Safety issues",
    Accounts: "Accounts questions",
    Decision: "Decisions only a director can make",
    Question: "General questions",
  };
  return words[tag];
}

/** How a channel shows: "C720 Ardmullen House" in Teams, "#c720-ardmullen-house" in Slack. */
export function channelLabel(ch: Pick<ChatChannel, "name">, app: ChatApp): string {
  if (app === "teams") return ch.name;
  const slug = ch.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `#${slug}`;
}

export type ChatView = "open" | "mine" | "done";

const newestFirst = (a: ChatMessage, b: ChatMessage) => b.at.localeCompare(a.at);

/** The list for a view: open ones, the open ones passed to one person, or those dealt with. Newest first. */
export function chatList(messages: ChatMessage[], view: ChatView, personId: ID | null, channelIds?: ReadonlySet<ID>): ChatMessage[] {
  return messages
    .filter((m) => m.action && (!channelIds || channelIds.has(m.channelId)))
    .filter((m) => (view === "done" ? m.action!.status === "Done" : m.action!.status === "Open" && (view === "open" || m.action!.toId === personId)))
    .sort(newestFirst);
}

/** Everything picked out in one channel: open ones first, then those dealt with, newest first in each. */
export function channelList(messages: ChatMessage[], channelId: ID): ChatMessage[] {
  const picked = messages.filter((m) => m.channelId === channelId && m.action);
  return [...picked.filter((m) => m.action!.status === "Open").sort(newestFirst), ...picked.filter((m) => m.action!.status === "Done").sort(newestFirst)];
}

export function chatCounts(messages: ChatMessage[], personId: ID | null, channelIds?: ReadonlySet<ID>) {
  return {
    open: chatList(messages, "open", personId, channelIds).length,
    mine: chatList(messages, "mine", personId, channelIds).length,
    done: chatList(messages, "done", personId, channelIds).length,
  };
}

/**
 * The conversation around a message, as it reads in the channel: up to `before` messages that
 * came before it, the message itself, and any reply posted to it from here.
 */
export function threadAround(messages: ChatMessage[], msg: ChatMessage, before = 2): { earlier: number; shown: ChatMessage[] } {
  const inChannel = messages.filter((m) => m.channelId === msg.channelId).sort((a, b) => a.at.localeCompare(b.at));
  const i = inChannel.findIndex((m) => m.id === msg.id);
  const prior = inChannel.slice(0, Math.max(0, i)).filter((m) => m.replyTo !== msg.id);
  const kept = prior.slice(-before);
  const replies = inChannel.filter((m) => m.replyTo === msg.id);
  return { earlier: prior.length - kept.length, shown: [...kept, msg, ...replies] };
}
