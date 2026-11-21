/**
 * This screen's link to the shared firm (21 Nov 2026): the app's store handed to the link in
 * src/data/link.ts. Run once before the app is drawn (main.tsx).
 *
 * Only the hosted build tries it. Where the server has no database (local copies, the browser
 * tests, the single-file preview, a Pages project without Supabase set), the demo stays as it has
 * always been: its own sample firm in this browser.
 */
import { create } from "zustand";
import { authMode } from "@/app/auth";
import { dublinToday } from "@/lib/dates";
import { toast } from "@/ui/toast";
import { type Link, type LinkState, makeLink } from "./link";
import { linked } from "./linked";
import { demoDay } from "./seed";
import { freshSeed, useData, usePrefs } from "./store";

/** Whether this screen is linked, for anything that wants to say so. */
export const useLinkState = create<{ state: LinkState }>()(() => ({ state: "off" }));

const POLL_MS = 4000;
let link: Link | null = null;

export async function initShared(): Promise<void> {
  if (authMode !== "access" || link) return;
  const l = makeLink({
    fetch: (input, init) => fetch(input, init),
    getDb: () => useData.getState().db,
    setDb: (db) => useData.setState({ db }),
    subscribe: (fn) => useData.subscribe((s, prev) => fn(s.db, prev.db)),
    fresh: () => freshSeed().db,
    firmName: () => usePrefs.getState().brand.legalName,
    notify: (m) => toast(m),
  });
  const started = await l.start();
  if (started === "off") return;
  link = l;
  linked.on = true;
  linked.reset = () => void l.reset();
  // The firm is kept until Vardil resets it, so "today" is simply today.
  useData.setState({ day: demoDay(dublinToday()) });
  l.onState((state) => useLinkState.setState({ state }));
  useLinkState.setState({ state: l.state });

  const tick = () => {
    if (document.visibilityState === "visible") void l.poll();
  };
  setInterval(tick, POLL_MS);
  document.addEventListener("visibilitychange", tick);
  // Whatever is still waiting goes before the tab closes, as far as the browser allows.
  window.addEventListener("pagehide", () => void l.flush());
}
