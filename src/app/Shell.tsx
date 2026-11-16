import { ArrowCounterClockwise, GearSix, MagnifyingGlass, Moon, SignOut, Sparkle, Sun, UserSwitch } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useRouteError } from "react-router-dom";
import { useAccess } from "@/data/access";
import { ROLES, roleDef } from "@/data/roles";
import { useData, useDay, useDb, usePrefs } from "@/data/store";
import { dWeekday } from "@/lib/format";
import { Avatar, Button, Count, cx, Dialog, Menu, MenuItem } from "@/ui";
import { Toaster } from "@/ui/toast";
import { AskButton, AskPanel, askFromSearch } from "@/ai/AskPanel";
import { useAsk } from "@/ai/state";
import { useGate } from "./AuthPages";
import { signOut } from "./auth";
import { DEPARTMENTS, departmentFor } from "./departments";

export function Shell() {
  const gate = useGate();
  const access = useAccess();
  const location = useLocation();
  const dept = departmentFor(location.pathname);
  const askOpen = useAsk((s) => s.open);

  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  if (!access.def) return <Navigate to="/who" replace />;
  if (location.pathname === "/") return <Navigate to={access.home} replace />;
  // A role only reaches the departments it has been given in Admin > Roles and access.
  if (!access.can(dept.key)) return <Navigate to={access.home} replace />;

  const allowed = DEPARTMENTS.filter((d) => d.inBar && access.can(d.key));
  const showBar = allowed.length > 1;
  // Ask AI is for the managing director only (decision 46), never for anyone they sign in as.
  const showAsk = access.role === "md" && askOpen;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {dept.key !== "site" && <Sidebar />}
        <main id="main" className={cx("min-w-0 flex-1 overflow-y-auto", showBar && "pb-24")}>
          <SideNavCompact />
          <Outlet />
        </main>
        {showAsk && <AskPanel />}
      </div>
      {showBar && <DepartmentBar keys={allowed.map((d) => d.key)} besideAsk={showAsk} />}
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
  const portalClientId = usePrefs((s) => s.portalClientId);
  const day = useDay();
  const reset = useData((s) => s.reset);
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
    <header className="z-20 flex h-13 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
      <NavLink to={access.home} className={cx("flex items-center gap-2", away)} aria-label={`${brand.brandName}, home`}>
        {brand.logoUrl ? <img src={brand.logoUrl} alt="" className="h-7 w-auto" /> : <span className="font-display text-[1.3rem] leading-none font-semibold text-accent-ink">{brand.brandName}</span>}
      </NavLink>

      {access.departments.length > 1 ? (
        <div className={cx("mx-auto flex w-full min-w-0 flex-1 items-center justify-end gap-2 sm:justify-start", access.role === "md" ? "max-w-[33rem]" : "max-w-md", searching && "max-sm:max-w-none")}>
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
          {access.role === "md" && (
            <span className={cx("shrink-0", away)}>
              <AskButton />
            </span>
          )}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <span className="hidden text-[0.93rem] text-muted sm:inline">{dWeekday(day)}</span>
      <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} className={cx("press grid size-9 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink", away)}>
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
            {ROLES.map((r) => (
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

// ── Search ────────────────────────────────────────────────────────────────────

type Hit = { key: string; label: string; sub: string; to: string };

/**
 * Search across projects, quotes, clients and people. For the managing director the last line
 * offers the same words to Ask AI, so a question typed here is one tap from an answer
 * (Aodhan's choice, 16 Nov: search and Ask AI stay separate, joined by this line).
 */
function Search({ autoFocus = false, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const canAsk = useAccess().role === "md";
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

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const has = (...parts: string[]) => parts.some((p) => p.toLowerCase().includes(s));
    return [
      ...projects.filter((p) => has(p.code, p.name, p.location, p.county)).map((p) => ({ key: p.id, label: `${p.code} ${p.name}`, sub: `Project, ${p.status.toLowerCase()}, ${p.county}`, to: `/projects/${p.code}` })),
      ...quotes.filter((x) => has(x.ref, x.title)).map((x) => ({ key: x.id, label: `${x.ref} ${x.title}`, sub: `Quote, ${x.status.toLowerCase()}`, to: `/sales/quotes/${x.ref}` })),
      ...clients.filter((c) => has(c.name, c.contactName)).map((c) => ({ key: c.id, label: c.name, sub: `Client, ${c.contactName}`, to: `/sales/clients?client=${c.id}` })),
      ...people.filter((p) => has(p.name, p.trade)).map((p) => ({ key: p.id, label: p.name, sub: p.trade, to: `/people?person=${p.id}` })),
    ].slice(0, 8);
  }, [q, projects, people, clients, quotes]);

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
        aria-label="Search projects, quotes, clients and people"
        placeholder="Search projects, quotes, clients, people"
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
                <Sparkle size={18} className="shrink-0" />
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

/** A department's sidebar groups, without the managing director's own screens for anyone else. */
function useGroups(pathname: string) {
  const md = useAccess().role === "md";
  const db = useData((s) => s.db);
  const brand = usePrefs((s) => s.brand);
  return departmentFor(pathname)
    .groups.map((g) => ({ ...g, items: [...g.items, ...(g.more?.(db, brand) ?? [])].filter((it) => md || !it.mdOnly) }))
    .filter((g) => g.items.length > 0);
}

function Sidebar() {
  const location = useLocation();
  const dept = departmentFor(location.pathname);
  const groups = useGroups(location.pathname);
  const n = useNavCounts();
  return (
    <nav aria-label={`${dept.label} screens`} className="hidden w-52 shrink-0 overflow-y-auto border-r border-line bg-side px-2.5 py-3 md:block">
      <p className="px-2 pb-1 font-display text-[1.15rem] font-semibold">{dept.title ?? dept.label}</p>
      {groups.map((g) => (
        <div key={g.label} className="mt-3">
          <p className="px-2 pb-1 text-[0.87rem] text-muted">{g.label}</p>
          <ul>
            {g.items.map((it) => (
              <li key={it.to}>
                <NavLink to={it.to} end={it.end} title={it.label} className={({ isActive }) => cx("flex h-9 items-center gap-2 rounded-md px-2", isActive ? "bg-surface font-medium text-accent-ink shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-surface/70")}>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  <Count n={n(it.count)} tone={it.countTone ?? "accent"} />
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** On narrow screens the sidebar becomes a row of links above the page. */
function SideNavCompact() {
  const location = useLocation();
  const dept = departmentFor(location.pathname);
  const items = useGroups(location.pathname).flatMap((g) => g.items);
  if (items.length < 2) return null;
  return (
    <nav aria-label={`${dept.label} screens`} className="flex gap-1 overflow-x-auto border-b border-line bg-side px-3 py-2 md:hidden">
      {items.map((it) => (
        <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => cx("h-9 shrink-0 rounded-md px-3 leading-9 whitespace-nowrap", isActive ? "bg-surface font-medium text-accent-ink" : "text-muted")}>
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}

// ── Department bar ────────────────────────────────────────────────────────────

function DepartmentBar({ keys, besideAsk }: { keys: string[]; besideAsk: boolean }) {
  const location = useLocation();
  const current = departmentFor(location.pathname);
  return (
    <nav aria-label="Departments" className={cx("pointer-events-none fixed inset-x-0 bottom-3 z-30 flex justify-center px-2", besideAsk && "md:right-[27rem]")}>
      <ul className="pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-[14px] border border-line bg-surface p-1.5 shadow-dock">
        {DEPARTMENTS.filter((d) => keys.includes(d.key)).map((d) => {
          const active = d.key === current.key;
          const Icon = d.icon;
          return (
            <li key={d.key}>
              <NavLink
                to={d.home}
                aria-current={active ? "page" : undefined}
                className={cx("press flex h-14 w-[4.9rem] flex-col items-center justify-center gap-0.5 rounded-lg text-[0.87rem] leading-tight", active ? "bg-accent-strong font-medium text-white" : "text-muted hover:bg-accent-soft hover:text-accent-ink")}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                <span className="whitespace-nowrap">{d.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
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
        Nothing in the demo lives at this address. It may be an old or mistyped link. The screens of {dept.label} are in the list on the left, and every department is in the bar along the bottom.
      </p>
    </div>
  );
}
