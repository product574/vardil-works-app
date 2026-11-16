/**
 * The daily limit on Ask AI questions (decision 51).
 *
 * By default there is none (Aodhan, 15 Nov: the demo goes to many prospects and none of them
 * should ever hit a limit; the spend limit on the Anthropic workspace caps the cost). A client
 * build can set one with the ASK_DAILY_LIMIT variable on the Cloudflare project.
 */
import { ASK_DAILY_LIMIT } from "../src/ai/tools";

/** The limit in force: the project's ASK_DAILY_LIMIT if it is a whole number above 0, else none (0). */
export function dailyLimit(setting: string | undefined): number {
  const n = Math.floor(Number(setting));
  return Number.isFinite(n) && n > 0 ? n : ASK_DAILY_LIMIT;
}

/** The two headers that let the panel show "N questions left today", sent only when there is a limit. */
export function limitHeaders(limit: number, asked: number, kind: "question" | "continue"): Record<string, string> {
  if (limit <= 0) return {};
  return { "x-ask-remaining": String(Math.max(0, limit - asked - (kind === "question" ? 1 : 0))), "x-ask-limit": String(limit) };
}
