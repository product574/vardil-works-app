import { QuickAddButtons } from "./QuickAdd";
import { ArrowCounterClockwise, ArrowLeft, GearSix, MagnifyingGlass, Moon, SignOut, Sun, UserSwitch } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useNavigationType, useRouteError } from "react-router-dom";
import { useAccess } from "@/data/access";
import { ROLES, roleDef } from "@/data/roles";
import { useData, useDay, useDb, usePrefs } from "@/data/store";
import { dWeekday } from "@/lib/format";
import { Avatar, Button, Count, cx, Dialog, Menu, MenuItem } from "@/ui";
import { Toaster } from "@/ui/toast";
import { AiSparkle } from "@/ui/AiSparkle";
import { AskButton, AskPanel, askFromSearch } from "@/ai/AskPanel";
import { useAsk } from "@/ai/state";
import { useGate } from "./AuthPages";
import { signOut } from "./auth";
import { DEPARTMENTS, departmentFor, type NavItem } from "./departments";
import { APPS, type App, placeOf, type Section, tabOf } from "./apps";
import type { DepartmentKey } from "@/data/types";
import { staff } from "./staff";
import { noteApp, useAllowedLevels } from "./workspace";
import { clearScreenState } from "./screen-state";
import { clearTrail, previous, saveScroll, scrollFor, stepBack, useTrail, visit } from "./trail";

/** Whose trail it is: the role signed in as, and the person when signed in as someone else. */
const useTrailUser = () => usePrefs((s) => `${s.role ?? "none"}-${s.asPersonId ?? ""}-${s.operativeId ?? ""}`);

/**
 * Keeps the Back button's trail (src/app/trail.ts) in step with where the person goes, and puts
 * the page back at the height it was left at when they come back to it. A new screen starts at
 * the top. From the Secure-All build, 18 Nov.
 */
function useTrailTracker(active: boolean) {
  const location = useLocation();
  const type = useNavigationType();
  const user = useTrailUser();
  const here = location.pathname + location.search;
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!active || location.pathname === "/") return;
    const viaBack = (location.state as { viaBack?: boolean } | null)?.viaBack === true;
    // A step that replaces the last one (an old address sent on to its screen) only replaces a step taken in this visit.
    const list = useTrail.getState().byUser[user] ?? [];
    const how = type === "POP" ? "pop" : type === "REPLACE" && last.current && list.at(-1) === last.current ? "replace" : "push";
    if (!viaBack) visit(user, here, how);
    const samePage = !!last.current && last.current.split("?")[0] === location.pathname;
    last.current = here;
    // A step on the same screen (a filter, a tab, a row opened in place) keeps the screen where it is.
    if (samePage && !viaBack && type !== "POP") return;
    const top = viaBack || type === "POP" ? scrollFor(here) : 0;
    // The screen's own code may still be loading, so the height is set again once it has drawn.
    const timers = [0, 80, 250].map((ms) => window.setTimeout(() => document.getElementById("main")?.scrollTo({ top }), ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [here, active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const main = document.getElementById("main");
    if (!active || !main) return;
    let timer = 0;
    const on = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => saveScroll(here, main.scrollTop), 150);
    };
    main.addEventListener("scroll", on, { passive: true });
    return () => {
      window.clearTimeout(timer);
      main.removeEventListener("scroll", on);
    };
  }, [here, active]);
}

export function Shell() {
  const gate = useGate();
  const access = useAccess();
  const location = useLocation();
  const dept = departmentFor(location.pathname);
  const askOpen = useAsk((s) => s.open);
  const allowedLevels = useAllowedLevels();
  useTrailTracker(gate === true && !!access.def && access.can(dept.key));
  // Which apps a prospect opens, and at which level (decision 210). Nothing is sent for staff or local copies.
  const opened = gate === true && access.def && access.can(dept.key) ? dept.key : null;
  useEffect(() => {
    if (opened) noteApp(opened, access.role);
  }, [opened, access.role]);

  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  if (!access.def) return <Navigate to="/who" replace />;
  // A level this person was not given (decision 210), say from an earlier visit: back to choose.
  if (allowedLevels && access.role && !allowedLevels.includes(access.role)) return <Navigate to="/who" replace />;
  if (location.pathname === "/") return <Navigate to={access.home} replace />;
  // A role only reaches the departments it has been given in Admin > Roles and access.
  if (!access.can(dept.key)) return <Navigate to={access.home} replace />;

  // The bottom bar holds the apps (20 Nov, the Oldstone template; Admin joined them on 21 Nov);
  // Email, Team chat and the Site phone are small buttons in the top bar.
  const apps = APPS.filter((a) => a.sections.some((sec) => sec.tabs.some((t) => access.can(t.dept))));
  const showBar = apps.length > 1;
  // Ask AI is for the managing director only (decision 46), never for anyone they sign in as.
  const showAsk = access.askAi && askOpen;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      {staff.ui && <staff.ui.Bar />}
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {dept.ownLayout ? (
          // Email and Team chat draw their own side panel and scroll their own parts.
          <main id="main" className="flex min-w-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        ) : (
          <main id="main" className={cx("min-w-0 flex-1 overflow-y-auto", showBar && "pb-24")}>
            {dept.key !== "site" && <SectionNav />}
            <Outlet />
          </main>
        )}
        {showAsk && <AskPanel />}
      </div>
      {showBar && <AppBar apps={apps} besideAsk={showAsk} />}
      <Toaster />
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar() {
  const navigate = useNavigate();
  const brand = usePrefs((s) => s.brand);
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  const role = usePrefs((s) => s.role);
  const setRole = usePrefs((s) => s.setRole);
  const allowedLevels = useAllowedLevels();
  const portalClientId = usePrefs((s) => s.portalClientId);
  const day = useDay();
  const reset = useData((s) => s.reset);
  const trailUser = useTrailUser();
  const def = roleDef(role)!;
  const access = useAccess();
  const people = useDb((db) => db.people);
  const clients = useDb((db) => db.clients);
  const [confirmReset, setConfirmReset] = useState(false);
  // On a phone the search box is a magnifier button; tapped, the search takes the whole bar.
  const [searching, setSearching] = useState(false);
  const away = searching ? "max-sm:hidden" : "";

  const who = role === "client" ? (clients.find((c) => c.id === portalClientId)?.contactName ?? "Client") : (people.find((p) => p.id === access.personId)?.name ?? def.title);

  return (
    <header className="z-20 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3 sm:px-4">
      {/* Back, at the far left on every screen (decision 74), with the Secure-All build's memory of where you were (decision 128). */}
      <BackButton className={cx("-ml-1 max-sm:-ml-0.5 max-sm:w-9 max-sm:justify-center max-sm:px-0", away)} />
      <NavLink to={access.home} className={cx("flex min-w-0 items-center gap-2", away)} aria-label={`${brand.brandName}, home`}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-7 w-auto max-w-full" /> : <span className="truncate py-1 font-display text-[1.15rem] leading-none font-semibold text-accent-ink sm:text-[1.3rem]">{brand.brandName}</span>}
      </NavLink>

      {access.departments.length > 1 ? (
        <div className={cx("mx-auto flex w-full flex-1 items-center justify-end gap-2 sm:min-w-0 sm:justify-start", access.askAi ? "max-w-[33rem]" : "max-w-md", searching ? "min-w-0 max-sm:max-w-none" : "max-sm:w-auto max-sm:shrink-0")}>
          <div className={cx("min-w-0 flex-1 items-center gap-2", searching ? "flex" : "hidden sm:flex")}>
            <Search autoFocus={searching} onDone={() => setSearching(false)} />
            {searching && (
              <button type="button" onClick={() => setSearching(false)} className="press shrink-0 px-1 font-medium text-accent-ink sm:hidden">
                Cancel
              </button>
            )}
          </div>
          {!searching && (
            <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="press grid size-9 shrink-0 place-items-center rounded-md border border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-ink sm:hidden">
              <MagnifyingGlass size={18} />
            </button>
          )}
          {access.askAi && (
            <span className={cx("shrink-0", away)}>
              <AskButton />
            </span>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* A to-do or a file to be sorted, added from whatever screen you are on (21 Nov). Office screens only: the phone and the portal have their own. */}
      {access.departments.length > 1 && role !== "operative" && role !== "client" && <QuickAddButtons className={away} />}
      <UtilityButtons className={away} />
      <span className="hidden text-[0.93rem] text-muted 2xl:inline">{dWeekday(day)}</span>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className={cx("press grid size-9 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink max-sm:hidden", away)}>
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className={away}>
      <Menu
        label="Account menu"
        trigger={
          <>
            <Avatar name={who} />
            <span className="hidden text-left leading-tight sm:block">
              <span className="block text-[0.93rem] font-medium">{who}</span>
              <span className="block text-[0.87rem] text-muted">{role === "operative" || role === "client" ? def.title : (people.find((p) => p.id === access.personId)?.trade ?? def.title)}</span>
            </span>
          </>
        }
      >
        {(close) => (
          <>
            <p className="px-2.5 pt-1 pb-1.5 text-[0.87rem] text-muted">Sign in as</p>
            {ROLES.filter((r) => !allowedLevels || allowedLevels.includes(r.key)).map((r) => (
              <MenuItem
                key={r.key}
                onClick={() => {
                  close();
                  setRole(r.key);
                  navigate(r.home);
                }}
              >
                <UserSwitch size={18} className={r.key === role ? "text-accent" : "text-faint"} />
                <span className={cx(r.key === role && "font-medium")}>{r.title}</span>
              </MenuItem>
            ))}
            <div className="my-1.5 border-t border-line" />
            {/* On a phone the light and dark switch lives here, to leave the top bar room (20 Nov). */}
            <MenuItem className="sm:hidden" onClick={() => { close(); setTheme(theme === "dark" ? "light" : "dark"); }}>
              {theme === "dark" ? <Sun size={18} className="text-faint" /> : <Moon size={18} className="text-faint" />} {theme === "dark" ? "Light mode" : "Dark mode"}
            </MenuItem>
            {access.can("settings") && (
              <MenuItem onClick={() => { close(); navigate("/settings"); }}>
                <GearSix size={18} className="text-faint" /> Settings
              </MenuItem>
            )}
            <MenuItem onClick={() => { close(); setConfirmReset(true); }}>
              <ArrowCounterClockwise size={18} className="text-faint" /> Reset demo data
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                setRole(null);
                void signOut().then((done) => {
                  if (done === "signed-out") navigate("/sign-in", { replace: true });
                });
              }}
            >
              <SignOut size={18} className="text-faint" /> Sign out
            </MenuItem>
          </>
        )}
      </Menu>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button
              variant="primary"
              onClick={() => {
                reset();
                // The sample records are new again, so the trail and each screen's filters start again too.
                clearTrail(trailUser);
                clearScreenState();
                setConfirmReset(false);
              }}
            >
              Reset demo data
            </Button>
          </>
        }
      >
        <p>Every approval, edit and new record made in this browser is cleared, and the sample data goes back to how it started. Branding and theme stay as they are.</p>
      </Dialog>
    </header>
  );
}

// ── Back ──────────────────────────────────────────────────────────────────────

/** What a place on the trail is called, for the Back button's tooltip. */
function placeName(path: string): string {
  const p = path.split("?")[0]!;
  for (const d of DEPARTMENTS) for (const g of d.groups) for (const i of g.items) if (i.to === p) return d.groups.length === 1 && g.items.length === 1 ? d.label : `${d.label}, ${i.label}`;
  if (p.startsWith("/fleet/invoices/")) return "the garage invoice";
  if (p.startsWith("/fleet/vehicles/")) return "the vehicle";
  if (p.startsWith("/fleet/garages/")) return "the garage";
  if (p.startsWith("/projects/")) return `project ${p.split("/")[2]}`;
  if (p.startsWith("/sales/quotes/")) return `quote ${p.split("/")[3]}`;
  if (p.startsWith("/inbox")) return "Email";
  if (p.startsWith("/chat")) return "Team chat";
  return "where you were";
}

/**
 * Back (18 Nov, from the Secure-All build): one button, in the same place on every screen, that
 * goes to exactly where the person was: the same screen, with the same tab, filters and open
 * record, at the same height. It remembers across a reload and signing in again.
 */
function BackButton({ className }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useTrailUser();
  const here = location.pathname + location.search;
  // Read through the store so the button follows the trail as it changes.
  useTrail((s) => s.byUser[user]);
  const to = previous(user, here);
  return (
    <button
      type="button"
      disabled={!to}
      title={to ? `Back to ${placeName(to)}` : "You have not been anywhere else yet"}
      onClick={() => {
        const target = stepBack(user, here);
        if (target) navigate(target, { state: { viaBack: true } });
      }}
      aria-label="Back"
      className={cx("press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 text-[0.93rem] font-medium text-ink hover:border-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:text-faint disabled:hover:border-line-strong disabled:hover:text-faint", className)}
    >
      <ArrowLeft size={18} />
      <span className="max-sm:hidden">Back</span>
    </button>
  );
}

// ── Search ────────────────────────────────────────────────────────────────────

type Hit = { key: string; label: string; sub: string; to: string };

/**
 * Search across projects, quotes, customers and people. For the managing director the last line
 * offers the same words to Ask AI, so a question typed here is one tap from an answer
 * (Aodhan's choice, 16 Nov: search and Ask AI stay separate, joined by this line).
 */
function Search({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const canAsk = useAccess().askAi;
  const db = useData((s) => s.db);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const projects = useDb((db) => db.projects);
  const people = useDb((db) => db.people);
  const clients = useDb((db) => db.clients);
  const quotes = useDb((db) => db.quotes);
  const vehicles = useDb((db) => db.vehicles);
  const garages = useDb((db) => db.garages);
  const fleetOk = useAccess().can("fleet");

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const has = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(s));
    return [
      ...projects.filter((p) => has(p.code, p.name, p.location, p.county)).map((p) => ({ key: p.id, label: `${p.code} ${p.name}`, sub: `Project, ${p.status.toLowerCase()}, ${p.county}`, to: `/projects/${p.code}` })),
      ...quotes.filter((x) => has(x.ref, x.title)).map((x) => ({ key: x.id, label: `${x.ref} ${x.title}`, sub: `Quote, ${x.status.toLowerCase()}`, to: `/sales/quotes/${x.ref}` })),
      ...clients.filter((c) => has(c.name, c.contactName)).map((c) => ({ key: c.id, label: c.name, sub: `Customer, ${c.contactName}`, to: `/customers/${c.id}` })),
      ...people.filter((p) => has(p.name, p.trade)).map((p) => ({ key: p.id, label: p.name, sub: p.trade, to: `/people?person=${p.id}` })),
      // Fleet (18 Nov): a registration typed any way ("231 g 44") finds the vehicle, and garages by name.
      ...(fleetOk ? vehicles.filter((v) => has(v.make, v.model) || (s.replace(/[^a-z0-9]/g, "").length >= 2 && v.reg.toLowerCase().replace(/[^a-z0-9]/g, "").includes(s.replace(/[^a-z0-9]/g, "")))).map((v) => ({ key: v.id, label: v.reg, sub: `Vehicle, ${v.make} ${v.model}${v.active ? "" : ", removed"}`, to: `/fleet/vehicles/${v.id}` })) : []),
      ...(fleetOk ? garages.filter((g) => has(g.name, g.town)).map((g) => ({ key: g.id, label: g.name, sub: `Garage, ${g.town}`, to: `/fleet/garages/${g.id}` })) : []),
    ].slice(0, 8);
  }, [q, projects, people, clients, quotes, vehicles, garages, fleetOk]);

  useEffect(() => {
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const typed = q.trim();
  const offerAsk = canAsk && typed.length >= 2;
  // The Ask AI line comes after the records, so the arrow keys reach it last.
  const last = offerAsk ? hits.length : hits.length - 1;
  const go = (h: Hit | undefined) => {
    if (!h) return;
    setOpen(false);
    setQ("");
    onDone?.();
    navigate(h.to);
  };
  const askIt = () => {
    setOpen(false);
    setQ("");
    onDone?.();
    askFromSearch(typed, location.pathname, location.search, db);
  };

  return (
    <div ref={box} className="relative w-full min-w-0 flex-1">
      <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
      <input
        ref={input}
        type="search"
        role="combobox"
        aria-expanded={open && (hits.length > 0 || offerAsk)}
        aria-controls="search-results"
        aria-label="Search projects, quotes, customers and people"
        placeholder="Search projects, quotes, customers, people"
        className="field pl-8"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, last)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
          if (e.key === "Enter") {
            if (offerAsk && cursor === hits.length) askIt();
            else go(hits[cursor]);
          }
          if (e.key === "Escape") {
            setOpen(false);
            onDone?.();
          }
        }}
      />
      {open && q.trim().length >= 2 && (
        <ul id="search-results" role="listbox" className="pop-in absolute top-full right-0 left-0 z-40 mt-1.5 rounded-lg border border-line bg-surface p-1.5 shadow-pop" style={{ ["--pop-origin" as string]: "top center" }}>
          {hits.length === 0 && <li className="px-2.5 py-2 text-muted">{offerAsk ? `No record matches "${typed}".` : `Nothing matches "${typed}". Try a site code, a name or a quote number.`}</li>}
          {hits.map((h, i) => (
            <li key={h.key} role="option" aria-selected={i === cursor}>
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => go(h)} className={cx("flex w-full flex-col rounded-md px-2.5 py-1.5 text-left", i === cursor && "bg-accent-soft")}>
                <span className="truncate font-medium">{h.label}</span>
                <span className="text-[0.87rem] text-muted">{h.sub}</span>
              </button>
            </li>
          ))}
          {offerAsk && (
            <li role="option" aria-selected={cursor === hits.length} className="mt-1 border-t border-line pt-1">
              <button type="button" onMouseEnter={() => setCursor(hits.length)} onClick={askIt} className={cx("flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-accent-ink", cursor === hits.length && "bg-accent-soft")}>
                <AiSparkle size={18} className="shrink-0" />
                <span className="min-w-0">
                  <span className="block font-medium">Ask AI</span>
                  <span className="block truncate text-[0.87rem] text-muted">"{typed}"</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function useNavCounts() {
  const db = useData((s) => s.db);
  const day = useDay();
  const me = useAccess().personId;
  return (count: ((d: typeof db, today: string, me: string | null) => number) | undefined) => (count ? count(db, day, me) : 0);
}

/** Is a screen in the list for this person? The managing director's own screens, a client's, a firm's apps and permissions. */
function useShows() {
  const { role, may, apps, can } = useAccess();
  const md = role === "md";
  return (it: NavItem & { dept?: DepartmentKey }) => (!it.dept || can(it.dept)) && (!it.app || apps.on(it.app)) && (!it.automations || apps.automations) && (md ? !it.notMd : !it.mdOnly) && !(it.staffOnly && role === "client") && (!it.perm || may(it.perm));
}

/** An app's sections this person may open, each with only the screens they may open. */
function useSections(app: App): Section[] {
  const shows = useShows();
  return app.sections.map((sec) => ({ ...sec, tabs: sec.tabs.filter(shows) })).filter((sec) => sec.tabs.length > 0);
}

/** Where an app opens for this person: the first screen of its first section they may open. */
function useAppHome() {
  const shows = useShows();
  return (app: App) => app.sections.flatMap((sec) => sec.tabs).find(shows)?.to ?? "/dashboard";
}

const sectionBtn = (active: boolean) => cx("press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 font-medium whitespace-nowrap", active ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-ink");

/**
 * Level 3 (20 Nov): an app's sections as buttons across the top of the page, and the screens of
 * the open section as tabs under them. Outside the apps (Vardil HQ) the
 * department's own screens are the buttons. No left sidebar (Jimmy: "strip it back").
 */
function SectionNav() {
  const location = useLocation();
  const n = useNavCounts();
  const shows = useShows();
  const here = placeOf(location.pathname);
  const dept = departmentFor(location.pathname);
  const db = useData((s) => s.db);
  const brand = usePrefs((s) => s.brand);
  const sections = useSections(here?.app ?? APPS[0]!);
  if (!here) {
    const items = dept.groups.flatMap((g) => [...g.items, ...(g.more?.(db, brand) ?? [])]).filter(shows);
    if (items.length < 2) return null;
    return (
      <nav aria-label={`${dept.title ?? dept.label} sections`} className="flex gap-2 overflow-x-auto border-b border-line bg-side px-5 py-2.5 max-sm:px-3">
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => sectionBtn(isActive)}>
            {it.label}
            <Count n={n(it.count)} tone={it.countTone ?? "accent"} />
          </NavLink>
        ))}
      </nav>
    );
  }
  const open = sections.find((sec) => sec.key === here.section.key);
  const tabs = open?.tabs ?? [];
  const onTab = open ? tabOf(open, location.pathname) : undefined;
  if (sections.length < 2 && tabs.length < 2) return null;
  // A section's button counts only what needs attention (warn or bad); plain counts stay on the tabs.
  const urgent = (it: NavItem) => it.countTone === "warn" || it.countTone === "bad";
  const sectionCount = (sec: Section) => sec.tabs.filter(urgent).reduce((t, it) => t + n(it.count), 0);
  return (
    <div className="border-b border-line bg-side">
      {sections.length > 1 && (
        <nav aria-label={`${here.app.label} sections`} className="flex gap-2 overflow-x-auto px-5 pt-2.5 pb-2.5 max-sm:px-3">
          {sections.map((sec) => {
            const active = sec.key === here.section.key;
            const count = sectionCount(sec);
            return (
              <NavLink key={sec.key} to={sec.tabs[0]!.to} aria-current={active ? "page" : undefined} className={sectionBtn(active)}>
                {sec.label}
                {count > 0 && <Count n={count} tone={sec.tabs.some((it) => it.countTone === "bad" && n(it.count) > 0) ? "bad" : "warn"} />}
              </NavLink>
            );
          })}
        </nav>
      )}
      {tabs.length > 1 && (
        <nav aria-label={`${here.section.label} screens`} className={cx("flex gap-1 overflow-x-auto px-4 max-sm:px-2", sections.length < 2 && "pt-1.5")}>
          {tabs.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} aria-current={onTab?.to === it.to ? "page" : undefined} className={cx("inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-2.5 font-medium whitespace-nowrap", onTab?.to === it.to ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink")}>
              {it.label}
              <Count n={n(it.count)} tone={it.countTone ?? "accent"} />
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

// ── The bottom bar: the five apps ─────────────────────────────────────────────

function AppBar({ apps, besideAsk }: { apps: App[]; besideAsk: boolean }) {
  const location = useLocation();
  const current = placeOf(location.pathname)?.app.key;
  const homeOf = useAppHome();
  return (
    <nav aria-label="Apps" className={cx("pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-2", besideAsk && "md:right-[27rem]")}>
      <ul className="pointer-events-auto flex max-w-full gap-0.5 overflow-x-auto rounded-[14px] border border-line bg-surface p-1 shadow-dock sm:gap-1 sm:p-1.5">
        {apps.map((a) => {
          const active = a.key === current;
          const Icon = a.icon;
          return (
            <li key={a.key}>
              <Link
                to={homeOf(a)}
                aria-current={active ? "page" : undefined}
                className={cx("press flex h-14 w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-lg text-[0.75rem] leading-tight sm:w-[5.6rem] sm:text-[0.93rem]", active ? "bg-accent-strong font-medium text-white" : "text-muted hover:bg-accent-soft hover:text-accent-ink")}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                <span className="whitespace-nowrap">{a.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Email, Team chat and the Site phone (and Vardil HQ for our staff): small buttons in the top bar. Admin is an app in the bottom bar since 21 Nov. */
const UTILITIES: DepartmentKey[] = ["inbox", "chat", "site", "vardil"];

function UtilityButtons({ className }: { className?: string }) {
  const access = useAccess();
  const location = useLocation();
  const current = departmentFor(location.pathname).key;
  const n = useNavCounts();
  const list = UTILITIES.map((k) => DEPARTMENTS.find((d) => d.key === k)).filter((d): d is (typeof DEPARTMENTS)[number] => !!d && access.can(d.key));
  // Someone with only one of these (an operative's phone, say) has nothing to switch to.
  if (list.length === 0 || access.departments.length < 2) return null;
  return (
    <nav aria-label="Email, chat and phone" className={cx("flex shrink-0 items-center gap-0.5", className)}>
      {list.map((d) => {
        const Icon = d.icon;
        const active = d.key === current;
        const badge = n(d.badge);
        return (
          <NavLink
            key={d.key}
            to={d.home}
            title={d.label}
            aria-label={badge > 0 ? `${d.label}, ${badge} unread` : d.label}
            aria-current={active ? "page" : undefined}
            className={cx("press relative inline-flex h-9 items-center gap-1.5 rounded-md px-1.5 text-[0.93rem] font-medium sm:px-2", active ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-accent-soft hover:text-accent-ink")}
          >
            <Icon size={20} weight={active ? "fill" : "regular"} />
            <span className="hidden 2xl:inline">{d.label}</span>
            {badge > 0 && <span aria-hidden className="absolute -top-0.5 right-0 min-w-4.5 rounded-full bg-accent-strong px-1 text-center text-[0.8125rem] leading-4.5 text-white">{badge}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

/**
 * Shown in place of a screen that could not be opened. On the hosted demo this is most often a
 * sign-in that has run out (Cloudflare then refuses the screen's file) or a newer version of
 * the demo published while the tab was open. Reloading fixes both. `standalone` is for errors
 * outside the shell, where there is no top bar around it.
 */
export function LoadFailed({ standalone = false }: { standalone?: boolean }) {
  const error = useRouteError();
  useEffect(() => {
    console.warn("A screen could not be opened:", error);
  }, [error]);
  return (
    <div className={cx("px-5 py-10", standalone && "grid min-h-dvh place-items-center bg-canvas")}>
      <div className="max-w-[60ch]">
        <h1 className="text-[1.45rem]">This screen could not be opened</h1>
        <p className="mt-1 text-muted">Your sign-in may have run out, or a newer version of the demo may have been published since this page was opened. Reload the page to carry on.</p>
        <Button variant="primary" className="mt-4" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    </div>
  );
}

/** Any address the demo has no screen for, such as an old or mistyped link. */
export function NotFound() {
  const location = useLocation();
  const dept = departmentFor(location.pathname);
  return (
    <div className="px-5 py-10">
      <h1 className="text-[1.45rem]">There is no screen here</h1>
      <p className="mt-1 max-w-[60ch] text-muted">
        Nothing in the demo lives at this address. It may be an old or mistyped link. The sections of {dept.label} are the buttons across the top, and the apps are in the bar along the bottom.
      </p>
    </div>
  );
}
