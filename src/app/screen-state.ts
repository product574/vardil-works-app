/**
 * What a screen was showing (its tab, filters and search words), kept so that coming back to it
 * finds it exactly as it was left (Oisin, 18 Nov, from the Secure-All build: Back "brings you to exactly where you were").
 * Kept in this browser, so it also survives a reload and signing in again. Only small values go
 * here, never records.
 */
import { useCallback, useState } from "react";

const KEY = "cod.screens";

function load(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
let mem: Record<string, unknown> | null = null;
const all = () => (mem ??= typeof window === "undefined" ? {} : load());
function keep() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* no room, or no storage: it still works for this visit */
  }
}

/** Like useState, but the value is remembered under `key` for the next time the screen opens. */
export function useScreenState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => (key in all() ? (all()[key] as T) : initial));
  const set = useCallback(
    (v: T) => {
      setValue(v);
      all()[key] = v;
      keep();
    },
    [key],
  );
  return [value, set];
}

/** Forget every screen's state: after "Reset demo data" and on signing out. */
export function clearScreenState() {
  mem = {};
  keep();
}
