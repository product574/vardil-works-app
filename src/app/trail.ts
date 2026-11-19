/**
 * The Back button's memory (18 Nov, from the Secure-All build at Oisin's word): the addresses the
 * signed-in role has been through, newest last, kept in this browser for each role. Back steps to
 * the one before, on any screen, and still works after a reload or signing in again. The
 * browser's own back button goes on working as it always did; this follows it.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const MAX = 60;
type TrailState = { byUser: Record<string, string[]>; scroll: Record<string, number> };

const storage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  }
});

export const useTrail = create<TrailState>()(persist(() => ({ byUser: {} as Record<string, string[]>, scroll: {} as Record<string, number> }), { name: "cod.trail", version: 1, storage }));

const listOf = (user: string) => useTrail.getState().byUser[user] ?? [];
const setList = (user: string, list: string[]) => useTrail.setState((s) => ({ byUser: { ...s.byUser, [user]: list.slice(-MAX) } }));

/** Record arriving at an address. `how`: a new step, a step that replaces the last one, or the browser's own back or forward. */
export function visit(user: string, path: string, how: "push" | "replace" | "pop") {
  const list = listOf(user);
  if (list.at(-1) === path) return;
  if (how === "pop" && list.at(-2) === path) return setList(user, list.slice(0, -1));
  if (how === "replace" && list.length) return setList(user, [...list.slice(0, -1), path]);
  setList(user, [...list, path]);
}

/** Where Back would go from here, or null at the start of the trail. */
export const previous = (user: string, here: string): string | null => {
  const list = listOf(user);
  const i = list.at(-1) === here ? list.length - 2 : list.length - 1;
  return i >= 0 ? (list[i] ?? null) : null;
};

/** Step back: the trail loses its newest step (the screen being left) and the address to go to is returned. */
export function stepBack(user: string, here: string): string | null {
  const to = previous(user, here);
  if (to == null) return null;
  const list = listOf(user);
  setList(user, list.slice(0, list.lastIndexOf(to) + 1));
  return to;
}

export const saveScroll = (path: string, top: number) => useTrail.setState((s) => ({ scroll: { ...Object.fromEntries(Object.entries(s.scroll).slice(-80)), [path]: Math.round(top) } }));
export const scrollFor = (path: string) => useTrail.getState().scroll[path] ?? 0;

/** Forget a role's trail: after "Reset demo data", when the records it points at have gone. */
export function clearTrail(user: string) {
  useTrail.setState((s) => ({ byUser: { ...s.byUser, [user]: [] }, scroll: {} }));
}
