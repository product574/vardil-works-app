/**
 * Asking a question: the page's side of Ask AI.
 *
 * Sends the conversation and a fresh summary of the records to /api/ask, shows the answer as
 * it arrives, and when the model asks for a draft, makes it (src/ai/execute.ts) and sends the
 * result back so the model can say what it did. The model's hidden thinking is kept and sent
 * back unchanged, as the model provider requires.
 */
import { logAskAi } from "@/data/actions";
import { getDb, getDay, usePrefs } from "@/data/store";
import { runTool } from "./execute";
import { buildSnapshot } from "./snapshot";
import { type AskMessage, type AskTurn, useAsk } from "./state";
import { createAccumulator, sseParser } from "./stream";
import { ASK_MAX_TOOL_ROUNDS } from "./tools";

export const HOSTED_ONLY = "Ask AI works on the hosted demo at demo.vardil.com. This copy has no connection to it.";

const newTurnId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function patch(id: string, p: Partial<AskTurn>) {
  useAsk.setState((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
}

/** The plain sentence shown when the server says no. */
async function refusal(res: Response): Promise<{ message: string; unavailable?: boolean; limit?: number }> {
  let body: { error?: string; limit?: number } = {};
  try {
    if ((res.headers.get("content-type") ?? "").includes("application/json")) body = (await res.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  if (res.status === 401) return { message: "Your sign-in has run out. Reload the page to sign in again, then ask again." };
  if (res.status === 429 && body.error === "limit") return { message: `You have asked all ${body.limit ? `${body.limit} ` : ""}questions allowed for one person today. Ask AI opens again tomorrow.`, limit: body.limit };
  if (res.status === 429) return { message: "Ask AI stopped after several drafts in one go. Ask again for anything that is left." };
  if (res.status === 503 && body.error === "not_configured") return { message: "Ask AI is not switched on for this copy of the demo yet.", unavailable: true };
  if (res.status === 503) return { message: "Ask AI is busy just now. Try again in a minute." };
  if (res.status === 413) return { message: "That question is too long. Try a shorter one." };
  if (res.status === 400) return { message: "Ask AI could not read that question. Try rewording it." };
  if (res.status === 404 || res.status === 405) return { message: HOSTED_ONLY, unavailable: true };
  return { message: "Ask AI could not answer just now. Try again in a minute." };
}

/** How many earlier questions are sent back with a new one. Older ones drop off, which keeps
 * each request small (cost, and the server function's time limit). */
export const HISTORY_QUESTIONS = 6;

/**
 * The conversation to keep once a question is answered: the model's hidden thinking is only
 * needed inside a round of drafts, so it is dropped from finished questions, and only the
 * last few questions are kept. It always starts at a question, never part way through one.
 */
export function keepHistory(messages: AskMessage[], questions = HISTORY_QUESTIONS): AskMessage[] {
  const isQuestion = (m: AskMessage) => m.role === "user" && m.content.some((b) => (b as { type?: string }).type === "text");
  const starts = messages.flatMap((m, i) => (isQuestion(m) ? [i] : []));
  const from = starts.length > questions ? (starts[starts.length - questions] ?? 0) : 0;
  return messages.slice(from).map((m) => {
    if (m.role !== "assistant") return m;
    const content = m.content.filter((b) => {
      const t = (b as { type?: string }).type;
      return t !== "thinking" && t !== "redacted_thinking";
    });
    return { ...m, content: content.length ? content : [{ type: "text", text: "(no answer)" }] };
  });
}

/** Takes out any long dashes the model lets slip, which the firm's writing never uses. */
export const undash = (s: string) =>
  s
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[–—]\s*/g, ", ");

export async function ask(question: string, screen: { path: string; title: string }) {
  const q = question.trim();
  const start = useAsk.getState();
  if (!q || start.busy) return;
  if (window.location.protocol === "file:") {
    useAsk.setState({ unavailable: HOSTED_ONLY });
    return;
  }

  const id = newTurnId();
  useAsk.setState({ busy: true, turns: [...start.turns, { id, question: q, screen: screen.path, text: "", cards: [], status: "waiting" }] });
  logAskAi(q);

  // One summary for the whole question, so the follow-up rounds after a draft reuse the cache.
  const snapshot = buildSnapshot(getDb(), getDay(), usePrefs.getState().brand);
  let messages: AskMessage[] = [...start.history, { role: "user", content: [{ type: "text", text: `[Screen: ${screen.path}${screen.title ? ` (${screen.title})` : ""}]\n${q}` }] }];
  let shown = "";
  const cards: AskTurn["cards"] = [];

  try {
    for (let round = 0; ; round++) {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnId: id, kind: round === 0 ? "question" : "continue", screen: screen.path, snapshot, messages }),
      });
      if (!res.ok) {
        const r = await refusal(res);
        patch(id, { status: "error", error: r.message, text: shown });
        if (r.unavailable) useAsk.setState({ unavailable: r.message });
        if (r.limit != null) useAsk.setState({ remaining: 0, limit: r.limit });
        return;
      }
      if (!(res.headers.get("content-type") ?? "").includes("text/event-stream") || !res.body) {
        // A copy of the demo with no server behind it answers with its own page instead.
        patch(id, { status: "error", error: HOSTED_ONLY });
        useAsk.setState({ unavailable: HOSTED_ONLY });
        return;
      }
      if (round === 0) {
        // "N questions left today" shows only when the server has a daily limit (by default none).
        const left = Number(res.headers.get("x-ask-remaining"));
        const limit = Number(res.headers.get("x-ask-limit"));
        useAsk.setState(res.headers.has("x-ask-limit") && Number.isFinite(left) && limit > 0 ? { remaining: left, limit } : { remaining: null, limit: null });
      }

      const acc = createAccumulator();
      let frame = 0;
      const show = () => {
        frame = 0;
        const now = acc.text();
        patch(id, { status: now || shown ? "answering" : "waiting", text: undash(shown && now ? `${shown}\n\n${now}` : shown || now) });
      };
      const parser = sseParser((_event, data) => {
        try {
          acc.onEvent(JSON.parse(data) as { type?: string });
        } catch {
          return;
        }
        if (!frame) frame = window.requestAnimationFrame(show);
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true }));
      }
      parser.end();
      if (frame) window.cancelAnimationFrame(frame);
      show();

      if (acc.error || !acc.done) {
        patch(id, { status: "error", error: "Ask AI could not finish that answer. Try asking again." });
        return;
      }
      const roundText = acc.text();
      shown = shown && roundText ? `${shown}\n\n${roundText}` : shown || roundText;
      messages = [...messages, { role: "assistant", content: acc.blocks() }];

      if (acc.stopReason === "tool_use") {
        if (round >= ASK_MAX_TOOL_ROUNDS) {
          // The conversation cannot end on an unanswered draft request, so this question is
          // left out of the history; the drafts already made stay in Approvals.
          patch(id, { status: "done", text: undash(shown), cards: [...cards], note: "Ask AI stopped after several drafts in one go. Ask again for anything that is left." });
          return;
        }
        const results = acc.toolUses().map((t) => ({ t, out: runTool(t.name, t.input) }));
        for (const r of results) if (r.out.card) cards.push(r.out.card);
        patch(id, { cards: [...cards] });
        messages = [...messages, { role: "user", content: results.map(({ t, out }) => ({ type: "tool_result", tool_use_id: t.id, content: out.text, ...(out.ok ? {} : { is_error: true }) })) }];
        continue;
      }

      patch(id, { status: "done", text: undash(shown), cards: [...cards], note: acc.stopReason === "max_tokens" ? "The answer was cut short. Ask for the rest if you need it." : undefined });
      useAsk.setState({ history: keepHistory(messages) });
      return;
    }
  } catch {
    patch(id, { status: "error", error: "Ask AI could not be reached. Check the connection and try again.", text: undash(shown) });
  } finally {
    useAsk.setState({ busy: false });
  }
}
