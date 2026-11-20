/**
 * Which apps this firm has and how it looks (19 Nov; looks and named emails since 20 Nov). On the
 * hosted demo, Vardil HQ saves each client on the server (functions/api/workspace.ts): the named
 * emails that sign in to it, its apps, and its name, logo, colour, region and invoice paper. A
 * client sees the same on any computer. Where nothing is saved for them, or on a copy with no
 * server, it is this browser's own: ABC Construction with every app, unless Vardil staff picked a
 * package in this browser for a pitch.
 *
 * While Vardil staff are in Vardil HQ they see every app. With a client's demo open (Clients,
 * "Open their demo") they see exactly that client's apps and look; otherwise, viewing as anyone
 * else, this browser's package, which is what they are about to show a client.
 */
import { create } from "zustand";
import { matchDataToBrand, usePrefs } from "@/data/store";
import type { DepartmentKey } from "@/data/types";
import { type Announcement, type AppRequest, appsOff, brandOfLook, type ClientConfig, type CloudflareResult, type CloudflareState, type OwnConfig, STARTER_ANNOUNCEMENTS, type WorkspaceAction } from "@/lib/apps";
import { authMode } from "./auth";
import { staff } from "./staff";

type ServerState = {
  /** The server answered: this is the hosted demo with its database. */
  online: boolean;
  /** The firm Vardil saved for this client, or null for none saved. */
  config: OwnConfig | null;
  announcements: Announcement[];
  /** Vardil staff only. */
  clients: ClientConfig[];
  requests: AppRequest[];
  cloudflare: CloudflareState | null;
};

export const useWorkspace = create<ServerState>()(() => ({ online: false, config: null, announcements: [], clients: [], requests: [], cloudflare: null }));

const URL_ = "/api/workspace";

/**
 * Ask the server, before the app is drawn and again after each change. A copy with no server keeps
 * the browser's own settings. The look is put on afterwards (`applyLook`), once it is known whether
 * this person is staff: main.tsx does that after both checks, so the sample data is rebuilt at most once.
 */
export async function initWorkspace() {
  if (authMode !== "access") return;
  try {
    const res = await fetch(URL_, { credentials: "same-origin", headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
    const body = (await res.json()) as Partial<ServerState>;
    useWorkspace.setState({ online: true, config: body.config ?? null, announcements: body.announcements ?? [], clients: body.clients ?? [], requests: body.requests ?? [], cloudflare: body.cloudflare ?? null });
  } catch {
    /* no server: this browser's own settings */
  }
}

/** The client whose demo is showing: a staff member's opened one, or the signed-in client's own. */
function activeClient(): Pick<ClientConfig, "look" | "logoUrl"> | null {
  const { config, clients } = useWorkspace.getState();
  if (!staff.is) return config;
  const id = usePrefs.getState().viewClient;
  return id ? (clients.find((c) => c.id === id) ?? null) : null;
}

/** Put the active client's look on the demo, or take it off, with fresh sample data if their region or name differs. */
export function applyLook() {
  const c = activeClient();
  usePrefs.getState().setClientLook(c ? brandOfLook(c.look, c.logoUrl) : null, c ? c.look.design : null);
  matchDataToBrand();
}

/** Staff: open a client's demo as they see it, or close it (null). */
export function openClientDemo(id: string | null) {
  usePrefs.getState().setViewClient(id);
  applyLook();
}

export type SendResult = { error: string | null; id?: string; cloudflare?: CloudflareResult };

/** Send one change to the server and read everything back. `error` is a plain reason when it failed. */
export async function sendWorkspace(act: WorkspaceAction): Promise<SendResult> {
  try {
    const res = await fetch(URL_, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(act) });
    if (res.status === 403) return { error: "Only Vardil staff can change that." };
    if (res.status === 401) return { error: "Your sign-in has run out. Reload the page." };
    if (res.status === 413) return { error: "That is too big to save. Use a smaller logo." };
    const body = (await res.json().catch(() => ({}))) as { message?: string; id?: string; cloudflare?: CloudflareResult };
    if (res.status === 409) return { error: body.message ?? "It could not be saved." };
    if (!res.ok) return { error: "It could not be saved. Try again in a moment." };
    await initWorkspace();
    applyLook();
    return { error: null, id: body.id, cloudflare: body.cloudflare };
  } catch {
    return { error: "It could not be saved. Check the connection and try again." };
  }
}

/** Signed in as Vardil HQ: a staff member, looking as the level above the managing director. */
export const useInHq = () => usePrefs((s) => s.staffMode && s.role === "md") && staff.is;

/** The apps this firm has, and whether Automations is part of them. */
export function useApps() {
  const prefsOff = usePrefs((s) => s.companyOff);
  const automationsOff = usePrefs((s) => s.automationsOff);
  const config = useWorkspace((s) => s.config);
  const clients = useWorkspace((s) => s.clients);
  const viewClient = usePrefs((s) => s.viewClient);
  const inHq = useInHq();
  // A client sees what Vardil saved for them, if anything. Staff see the client whose demo they
  // opened, else the browser's own package.
  const saved = staff.is ? (viewClient ? (clients.find((c) => c.id === viewClient) ?? null) : null) : config;
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

/** The client whose look is on the demo now, and whether it was set by Vardil (so Settings may not change it). */
export function useClientLook() {
  const brand = usePrefs((s) => s.clientBrand);
  return { set: brand !== null, staff: staff.is };
}
