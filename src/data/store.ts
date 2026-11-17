/**
 * The demo's two stores.
 *
 * 1. `useData` holds the sample database. It is saved in the browser so a prospect's clicks
 *    survive a refresh, and rebuilt from the seed when the day changes, when "Reset demo" is
 *    pressed, or when DATA_VERSION is bumped.
 * 2. `usePrefs` holds preferences (theme, branding, chosen role). It lives under a different
 *    key and is never touched by a data reset or a data version bump, so shipping an update
 *    does not wipe anyone's settings.
 *
 * Screens never write to `useData` directly. They call the functions in src/data/actions.ts.
 * When a real backend replaces the sample data, those functions are the only code that changes.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { DEFAULT_BRAND, type Brand } from "@/config/brand";
import { dublinToday } from "@/lib/dates";
import { REGION } from "@/lib/money";
import { toast } from "@/ui/toast";
import { buildSeed, demoDay } from "./seed";
import type { Db, ID, RoleKey } from "./types";

/** Bump when the shape of Db or the sample data changes. Old saved sample data is thrown away, preferences are kept. */
const DATA_VERSION = 16;

let storageFull = false;

const safeStorage = createJSONStorage(() => {
  try {
    const probe = "cod.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    // Photos and proof files added during a demo are kept in the browser, which has a ceiling
    // (about 5 MB). When it is reached the change still shows on screen, it just is not saved.
    return {
      getItem: (k: string) => window.localStorage.getItem(k),
      removeItem: (k: string) => window.localStorage.removeItem(k),
      setItem: (k: string, v: string) => {
        try {
          window.localStorage.setItem(k, v);
          storageFull = false;
        } catch {
          if (!storageFull) toast("This browser has no room left to save the demo. Your changes stay on screen until the tab closes. Reset demo data to free the space");
          storageFull = true;
        }
      },
    };
  } catch {
    // Private windows and locked-down browsers: fall back to memory, the demo still works.
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
  }
});

// ── Preferences ───────────────────────────────────────────────────────────────

type PrefsState = {
  theme: "light" | "dark";
  /** The brand in force: the defaults from src/config/brand.ts with any live edits on top. */
  brand: Brand;
  /** Only what has been changed in Settings. Saved; everything else follows the config file. */
  brandEdits: Partial<Brand>;
  role: RoleKey | null;
  /**
   * A named office person to be signed in as, set from Admin > Roles and access > By person.
   * Null means the usual person for the role (see roles.ts).
   */
  asPersonId: ID | null;
  /** Who the site phone view is signed in as. */
  operativeId: ID;
  /** Which client the portal is showing. */
  portalClientId: ID;
  setTheme: (t: "light" | "dark") => void;
  setBrand: (b: Partial<Brand>) => void;
  resetBrand: () => void;
  setRole: (r: RoleKey | null) => void;
  signInAs: (r: RoleKey, personId: ID) => void;
  setOperative: (id: ID) => void;
  setPortalClient: (id: ID) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "light",
      brand: DEFAULT_BRAND,
      brandEdits: {},
      role: null,
      asPersonId: null,
      operativeId: "p-103",
      portalClientId: "c-02",
      setTheme: (theme) => set({ theme }),
      setBrand: (b) => set((s) => ({ brandEdits: { ...s.brandEdits, ...b }, brand: { ...DEFAULT_BRAND, ...s.brandEdits, ...b } })),
      resetBrand: () => set({ brandEdits: {}, brand: DEFAULT_BRAND }),
      setRole: (role) => set({ role, asPersonId: null }),
      signInAs: (role, asPersonId) => set({ role, asPersonId }),
      setOperative: (operativeId) => set({ operativeId }),
      setPortalClient: (portalClientId) => set({ portalClientId }),
    }),
    {
      name: "cod.prefs",
      version: 2,
      storage: safeStorage,
      // Only live edits are saved, so changing src/config/brand.ts reaches every browser,
      // including ones that have opened an earlier version of the demo.
      partialize: (s) => ({ theme: s.theme, brandEdits: s.brandEdits, role: s.role, asPersonId: s.asPersonId, operativeId: s.operativeId, portalClientId: s.portalClientId }),
      // Version 1 saved the whole brand, which froze the old defaults in place. Drop it, keep the rest.
      migrate: (saved, version) => {
        const s = (saved ?? {}) as Record<string, unknown>;
        if (version < 2) {
          delete s.brand;
          s.brandEdits = {};
        }
        return s as never;
      },
      merge: (saved, current) => {
        const s = (saved ?? {}) as Partial<PrefsState>;
        const brandEdits = s.brandEdits ?? {};
        return { ...current, ...s, brandEdits, brand: { ...DEFAULT_BRAND, ...brandEdits } };
      },
    },
  ),
);

// ── Sample database ───────────────────────────────────────────────────────────

type DataState = {
  /** The demo's "today" (the latest working day). Every screen uses this, never the clock. */
  day: string;
  db: Db;
  mutate: (fn: (db: Db) => void) => void;
  reset: () => void;
};

function freshSeed() {
  const brand = usePrefs.getState().brand;
  return buildSeed(dublinToday(), { emailDomain: brand.emailDomain, vatPct: REGION[brand.region].vatPct, region: brand.region });
}

export const useData = create<DataState>()(
  persist(
    immer((set) => ({
      ...freshSeed(),
      mutate: (fn) =>
        set((s) => {
          fn(s.db);
        }),
      reset: () => set(() => freshSeed()),
    })),
    {
      name: "cod.data",
      version: DATA_VERSION,
      storage: safeStorage,
      partialize: (s) => ({ day: s.day, db: s.db }),
      // Sample data is disposable: a version bump simply reseeds.
      migrate: () => freshSeed(),
      // Saved data from an earlier day is stale ("on site today" would be wrong), so reseed.
      merge: (saved, current) => {
        const s = saved as Partial<DataState> | undefined;
        return s?.db && s.day === demoDay(dublinToday()) ? { ...current, day: s.day, db: s.db } : current;
      },
    },
  ),
);

/** Read from the sample database: `const projects = useDb((db) => db.projects)`. */
export function useDb<T>(select: (db: Db) => T): T {
  return useData((s) => select(s.db));
}
export const useDay = () => useData((s) => s.day);
export const getDb = () => useData.getState().db;
export const getDay = () => useData.getState().day;
