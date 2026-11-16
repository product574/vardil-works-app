/**
 * Ask AI's conversation, kept for the browser tab (sessionStorage): a reload keeps it, closing
 * the tab or "New conversation" clears it. Separate from the sample data and the preferences,
 * so a data reset never touches it and it never touches them.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { DraftCard } from "./execute";

export type AskTurn = {
  id: string;
  question: string;
  /** The address the question was asked from. */
  screen: string;
  /** The answer as shown so far. */
  text: string;
  cards: DraftCard[];
  status: "waiting" | "answering" | "done" | "error";
  /** A plain sentence when it could not answer. */
  error?: string;
  /** A short note under the answer, for example when it was cut short. */
  note?: string;
};

export type AskMessage = { role: "user" | "assistant"; content: unknown[] };

type AskState = {
  open: boolean;
  turns: AskTurn[];
  /** The conversation exactly as the model saw it, sent back with each new question. */
  history: AskMessage[];
  remaining: number | null;
  limit: number | null;
  busy: boolean;
  /** Set when this copy of the demo has no Ask AI behind it (local or preview builds). */
  unavailable: string | null;
  /** Words sent from the search box while an answer was still arriving: they wait in the question box. */
  prefill: string | null;
  setOpen: (open: boolean) => void;
  clear: () => void;
};

const tabStorage = createJSONStorage(() => {
  try {
    const probe = "cod.probe";
    window.sessionStorage.setItem(probe, "1");
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  }
});

export const useAsk = create<AskState>()(
  persist(
    (set, get) => ({
      open: false,
      turns: [],
      history: [],
      remaining: null,
      limit: null,
      busy: false,
      unavailable: null,
      prefill: null,
      setOpen: (open) => set({ open }),
      clear: () => {
        if (!get().busy) set({ turns: [], history: [] });
      },
    }),
    {
      name: "cod.ask",
      storage: tabStorage,
      partialize: (s) => ({ open: s.open, turns: s.turns, history: s.history, remaining: s.remaining, limit: s.limit }),
      // An answer that was still arriving when the page reloaded will never finish.
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<AskState>;
        const turns = (s.turns ?? []).map((t) => (t.status === "waiting" || t.status === "answering" ? { ...t, status: "error" as const, error: "The page was reloaded before this answer finished. Ask again if you need it." } : t));
        return { ...current, ...s, turns, busy: false };
      },
    },
  ),
);
