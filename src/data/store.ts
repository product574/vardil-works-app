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
import type { Announcement, AppRequest } from "@/lib/apps";
import { DEFAULT_EMAIL, defaultDesign, type EmailTemplate, type InvoiceDesign } from "@/lib/invoices";
import { REGION } from "@/lib/money";
import { toast } from "@/ui/toast";
import { buildSeed, demoDay } from "./seed";
import type { Db, DepartmentKey, ID, MdOverride, RoleKey } from "./types";

/** Bump when the shape of Db or the sample data changes. Old saved sample data is thrown away, preferences are kept. */
const DATA_VERSION = 25;

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
  /** Only what has been changed on Invoicing, Invoice design. The rest follows the region's starting values. */
  invoiceDesignEdits: Partial<InvoiceDesign>;
  /** The wording of the email that carries an invoice. Null means the standard wording. */
  invoiceEmail: EmailTemplate | null;
  /** Vardil staff only: signed in as Vardil Works, a level above the managing director. Counts only for people the staff check passes (src/app/staff.ts). */
  staffMode: boolean;
  /** Vardil staff only: departments switched off for the whole demo, every level included. */
  companyOff: DepartmentKey[];
  /** Vardil staff only: changes to the managing director's own access, which Roles and access cannot reach. */
  mdOverride: MdOverride;
  /** Vardil staff only: Ask AI switched off for the managing director. */
  askAiOff: boolean;
  /** Vardil staff only: Automations left out of Admin for this demo (a package can switch it). */
  automationsOff: boolean;
  /** On a copy with no server: announcements written in Vardil HQ and "Ask about this app" requests, kept in this browser. */
  localAnnouncements: Announcement[];
  localAppRequests: AppRequest[];
  /**
   * A client's look as Vardil HQ saved it (20 Nov), set from the server on each load and never
   * kept in the browser. While it is set it wins over Settings, Branding and Invoice design,
   * which the client cannot change.
   */
  clientBrand: Partial<Brand> | null;
  clientDesign: Partial<InvoiceDesign> | null;
  /** Vardil staff only: the client whose demo they opened from Vardil HQ, Clients. */
  viewClient: string | null;
  setClientLook: (brand: Partial<Brand> | null, design: Partial<InvoiceDesign> | null) => void;
  setViewClient: (id: string | null) => void;
  setAutomationsOff: (off: boolean) => void;
  /** Apply a package: everything it does not include is switched off for the whole demo. */
  setPackage: (off: DepartmentKey[], automations: boolean) => void;
  addLocalAnnouncement: (a: Announcement) => void;
  removeLocalAnnouncement: (id: string) => void;
  addLocalAppRequest: (r: AppRequest) => void;
  handleLocalAppRequest: (id: string, by: string) => void;
  setStaffMode: (on: boolean) => void;
  setCompanyOff: (dept: DepartmentKey, off: boolean) => void;
  setMdOverride: (o: Partial<MdOverride>) => void;
  setAskAiOff: (off: boolean) => void;
  clearStaffChanges: () => void;
  setInvoiceDesign: (d: Partial<InvoiceDesign>) => void;
  resetInvoiceDesign: () => void;
  setInvoiceEmail: (t: EmailTemplate | null) => void;
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
      invoiceDesignEdits: {},
      invoiceEmail: null,
      staffMode: false,
      companyOff: [],
      automationsOff: false,
      localAnnouncements: [],
      localAppRequests: [],
      clientBrand: null,
      clientDesign: null,
      viewClient: null,
      setClientLook: (clientBrand, clientDesign) => set((s) => ({ clientBrand, clientDesign, brand: { ...DEFAULT_BRAND, ...s.brandEdits, ...(clientBrand ?? {}) } })),
      setViewClient: (viewClient) => set({ viewClient }),
      setAutomationsOff: (automationsOff) => set({ automationsOff }),
      setPackage: (companyOff, automations) => set({ companyOff, automationsOff: !automations }),
      addLocalAnnouncement: (a) => set((s) => ({ localAnnouncements: [a, ...s.localAnnouncements] })),
      removeLocalAnnouncement: (id) => set((s) => ({ localAnnouncements: s.localAnnouncements.filter((a) => a.id !== id) })),
      addLocalAppRequest: (r) => set((s) => (s.localAppRequests.some((x) => x.app === r.app && x.email === r.email && !x.handledAt) ? s : { localAppRequests: [r, ...s.localAppRequests] })),
      handleLocalAppRequest: (id, by) => set((s) => ({ localAppRequests: s.localAppRequests.map((r) => (r.id === id ? { ...r, handledAt: new Date().toISOString(), handledBy: by } : r)) })),
      mdOverride: { departments: {}, perms: {} },
      askAiOff: false,
      setStaffMode: (staffMode) => set({ staffMode }),
      setCompanyOff: (dept, off) => set((s) => ({ companyOff: off ? [...new Set([...s.companyOff, dept])] : s.companyOff.filter((d) => d !== dept) })),
      setMdOverride: (o) => set((s) => ({ mdOverride: { ...s.mdOverride, ...o } })),
      setAskAiOff: (askAiOff) => set({ askAiOff }),
      clearStaffChanges: () => set({ companyOff: [], automationsOff: false, mdOverride: { departments: {}, perms: {} }, askAiOff: false }),
      setInvoiceDesign: (d) => set((s) => ({ invoiceDesignEdits: { ...s.invoiceDesignEdits, ...d } })),
      resetInvoiceDesign: () => set({ invoiceDesignEdits: {} }),
      setInvoiceEmail: (invoiceEmail) => set({ invoiceEmail }),
      setTheme: (theme) => set({ theme }),
      setBrand: (b) => set((s) => ({ brandEdits: { ...s.brandEdits, ...b }, brand: { ...DEFAULT_BRAND, ...s.brandEdits, ...b, ...(s.clientBrand ?? {}) } })),
      resetBrand: () => set((s) => ({ brandEdits: {}, brand: { ...DEFAULT_BRAND, ...(s.clientBrand ?? {}) } })),
      // Signing in as any level, or out, ends Vardil Works mode: staff come back to it from the strip at the top.
      setRole: (role) => set({ role, asPersonId: null, staffMode: false }),
      signInAs: (role, asPersonId) => set({ role, asPersonId, staffMode: false }),
      setOperative: (operativeId) => set({ operativeId }),
      setPortalClient: (portalClientId) => set({ portalClientId }),
    }),
    {
      name: "cod.prefs",
      version: 2,
      storage: safeStorage,
      // Only live edits are saved, so changing src/config/brand.ts reaches every browser,
      // including ones that have opened an earlier version of the demo.
      partialize: (s) => ({ theme: s.theme, brandEdits: s.brandEdits, role: s.role, asPersonId: s.asPersonId, staffMode: s.staffMode, companyOff: s.companyOff, automationsOff: s.automationsOff, localAnnouncements: s.localAnnouncements, localAppRequests: s.localAppRequests, mdOverride: s.mdOverride, askAiOff: s.askAiOff, viewClient: s.viewClient, operativeId: s.operativeId, portalClientId: s.portalClientId, invoiceDesignEdits: s.invoiceDesignEdits, invoiceEmail: s.invoiceEmail }),
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
  /** The region, trading name and email domain the sample data was written for (`lookKey`). */
  look: string;
  db: Db;
  mutate: (fn: (db: Db) => void) => void;
  reset: () => void;
};

/** What in the brand the sample data is written with: a change to any of these needs fresh sample data. */
export const lookKey = (b: Pick<Brand, "region" | "legalName" | "emailDomain">) => `${b.region}|${b.legalName}|${b.emailDomain}`;

function freshSeed() {
  const brand = usePrefs.getState().brand;
  return { ...buildSeed(dublinToday(), { emailDomain: brand.emailDomain, vatPct: REGION[brand.region].vatPct, region: brand.region, legalName: brand.legalName }), look: lookKey(brand) };
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
      partialize: (s) => ({ day: s.day, look: s.look, db: s.db }),
      // Sample data is disposable: a version bump simply reseeds.
      migrate: () => freshSeed(),
      // Saved data from an earlier day is stale ("on site today" would be wrong), so reseed.
      merge: (saved, current) => {
        const s = saved as Partial<DataState> | undefined;
        // Data saved before 20 Nov carries no look: it was written for this browser's own brand.
        return s?.db && s.day === demoDay(dublinToday()) ? { ...current, day: s.day, look: s.look ?? lookKey(usePrefs.getState().brand), db: s.db } : current;
      },
    },
  ),
);

/** After a client's look is applied: fresh sample data if it was written for another region or name. */
export function matchDataToBrand() {
  if (useData.getState().look !== lookKey(usePrefs.getState().brand)) useData.getState().reset();
}

/** Read from the sample database: `const projects = useDb((db) => db.projects)`. */
export function useDb<T>(select: (db: Db) => T): T {
  return useData((s) => select(s.db));
}
export const useDay = () => useData((s) => s.day);

/** How the firm's invoices look: the region's starting values with any edits on top. */
export function useInvoiceDesign(): InvoiceDesign {
  const region = usePrefs((s) => s.brand.region);
  const domain = usePrefs((s) => s.brand.emailDomain);
  const edits = usePrefs((s) => s.invoiceDesignEdits);
  const client = usePrefs((s) => s.clientDesign);
  return { ...defaultDesign(region, domain), ...(client ?? edits) };
}
/** The wording of the email that carries an invoice. */
export const useInvoiceEmail = (): EmailTemplate => usePrefs((s) => s.invoiceEmail) ?? DEFAULT_EMAIL;
export const getDb = () => useData.getState().db;
export const getDay = () => useData.getState().day;
