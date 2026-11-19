/**
 * Which apps this firm has (19 Nov). On the hosted demo, Vardil HQ saves each client's apps on
 * the server (functions/api/workspace.ts), keyed by their sign-in email or their firm's domain,
 * so a client sees the same on any computer. Where nothing is saved for them, or on a copy with
 * no server, the apps are this browser's own: everything, unless Vardil staff picked a package
 * in this browser for a pitch.
 *
 * While Vardil staff are in Vardil HQ they see every app. Viewing as anyone else, they see this
 * browser's package, which is what they are about to show a client.
 */
import { create } from "zustand";
import { usePrefs } from "@/data/store";
import type { DepartmentKey } from "@/data/types";
import { type Announcement, type AppKey, type AppRequest, appsOff, type ClientConfig, STARTER_ANNOUNCEMENTS, type WorkspaceAction } from "@/lib/apps";
import { authMode } from "./auth";
import { staff } from "./staff";

type ServerState = {
  /** The server answered: this is the hosted demo with its database. */
  online: boolean;
  /** The apps Vardil saved for this client, or null for none saved. */
  config: { name: string; apps: AppKey[]; automations: boolean } | null;
  announcements: Announcement[];
  /** Vardil staff only. */
  clients: ClientConfig[];
  requests: AppRequest[];
};

export const useWorkspace = create<ServerState>()(() => ({ online: false, config: null, announcements: [], clients: [], requests: [] }));

const URL_ = "/api/workspace";

/** Ask the server once, before the app is drawn. A copy with no server keeps the browser's own settings. */
export async function initWorkspace() {
  if (authMode !== "access") return;
  try {
    const res = await fetch(URL_, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
    const body = (await res.json()) as Partial<ServerState>;
    useWorkspace.setState({ online: true, config: body.config ?? null, announcements: body.announcements ?? [], clients: body.clients ?? [], requests: body.requests ?? [] });
  } catch {
    /* no server: this browser's own settings */
  }
}

/** Send one change to the server and read everything back. Returns a plain reason when it failed. */
export async function sendWorkspace(act: WorkspaceAction): Promise<string | null> {
  try {
    const res = await fetch(URL_, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(act) });
    if (res.status === 403) return "Only Vardil staff can change that.";
    if (res.status === 401) return "Your sign-in has run out. Reload the page.";
    if (!res.ok) return "It could not be saved. Try again in a moment.";
    await initWorkspace();
    return null;
  } catch {
    return "It could not be saved. Check the connection and try again.";
  }
}

/** Signed in as Vardil HQ: a staff member, looking as the level above the managing director. */
export const useInHq = () => usePrefs((s) => s.staffMode && s.role === "md") && staff.is;

/** The apps this firm has, and whether Automations is part of them. */
export function useApps() {
  const prefsOff = usePrefs((s) => s.companyOff);
  const automationsOff = usePrefs((s) => s.automationsOff);
  const config = useWorkspace((s) => s.config);
  const inHq = useInHq();
  // Staff see the browser's own package; a client sees what Vardil saved for them, if anything.
  const saved = config && !staff.is ? config : null;
  const off: DepartmentKey[] = inHq ? [] : saved ? appsOff(saved.apps) : prefsOff;
  const automations = inHq ? true : saved ? saved.automations : !automationsOff;
  return { off, automations, on: (k: DepartmentKey) => !off.includes(k), firm: saved?.name ?? null };
}

/** The announcements: from the server on the hosted demo, else the ones written in this browser, then Vardil's welcome. */
export function useAnnouncements(): Announcement[] {
  const online = useWorkspace((s) => s.online);
  const server = useWorkspace((s) => s.announcements);
  const local = usePrefs((s) => s.localAnnouncements);
  const list = online ? server : local;
  return [...list, ...STARTER_ANNOUNCEMENTS].sort((a, b) => b.at.localeCompare(a.at));
}
