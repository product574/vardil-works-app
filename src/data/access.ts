/**
 * What the signed-in person may open, see and do.
 *
 * Access is worked out in two layers:
 * 1. Their access level (managing director, contracts manager, site manager, accounts). Each
 *    level's departments, money visibility and permissions are rows in `db.access`.
 * 2. Exceptions for that one person, in `db.personAccess`. Only differences are stored.
 *
 * Both are edited by the managing director in Admin > Roles and access. Screens ask
 * `useAccess()`; they never check a role name themselves.
 */
import { DEPARTMENTS } from "@/app/departments";
import { opensSite } from "@/lib/site-access";
import { ALL_PERMS } from "./permissions";
import { ROLES, type RoleDef, roleDef } from "./roles";
import { useDb, usePrefs } from "./store";
import type { AccessKey, AccessRow, DepartmentKey, ID, LevelKey, PermKey, Person, PersonAccess, Project, RoleKey } from "./types";

/** The rule itself, kept free of React so it can be tested. */
export function resolveAccess(def: RoleDef | null, row: AccessRow | undefined, person?: PersonAccess) {
  // Roles marked locked (managing director, operative, client) always use their built-in access.
  const locked = def ? def.locked === true : true;
  const over = locked ? undefined : person;
  const base: DepartmentKey[] = (locked ? def?.departments : row?.departments) ?? [];
  const homeDept = DEPARTMENTS.find((d) => d.home.split("/")[1] === def?.home.split("/")[1]);
  // A level's home department can never be switched off, for the level or for one person.
  const departments = over ? DEPARTMENTS.map((d) => d.key).filter((k) => k === homeDept?.key || (over.departments[k] ?? base.includes(k))) : base;
  // If the usual landing department has been switched off, land on the first one left.
  const home = def && homeDept && departments.includes(homeDept.key) ? def.home : (DEPARTMENTS.find((d) => departments.includes(d.key))?.home ?? "/who");
  const seeValues = locked ? (def?.money[0] ?? false) : (over?.perms.seeValues ?? row?.seeValues ?? false);
  // Margins are worked out from values, so they are never shown without them.
  const seeMargins = seeValues && (locked ? (def?.money[1] ?? false) : (over?.perms.seeMargins ?? row?.seeMargins ?? false));
  const basePerms: PermKey[] = (locked ? def?.perms : row?.perms) ?? [];
  const perms = ALL_PERMS.filter((k) => over?.perms[k] ?? basePerms.includes(k));
  return { departments, home, seeValues, seeMargins, perms };
}

/** The value one setting has at a level, before any exception for a person. */
export function levelValue(row: AccessRow | undefined, key: AccessKey) {
  if (key === "seeValues") return row?.seeValues ?? false;
  if (key === "seeMargins") return row?.seeMargins ?? false;
  return row?.perms.includes(key) ?? false;
}

/** How many of a person's settings actually differ from their level right now. */
export function exceptionCount(row: AccessRow | undefined, person: PersonAccess | undefined) {
  if (!person) return 0;
  const depts = Object.entries(person.departments).filter(([k, on]) => on !== (row?.departments.includes(k as DepartmentKey) ?? false)).length;
  const perms = Object.entries(person.perms).filter(([k, on]) => on !== levelValue(row, k as AccessKey)).length;
  return depts + perms;
}

/** The access level an office person holds. Operatives have none: they only get the site phone view. */
export function levelOf(p: Person | undefined): LevelKey | null {
  if (!p || p.kind !== "Management") return null;
  return p.level ?? "site";
}

/** Who is signed in: the person chosen on "By person", or the usual person for the role. */
export function signedInPersonId(role: RoleKey | null, asPersonId: ID | null, operativeId: ID, people: Person[]): ID | null {
  if (role === "operative") return operativeId;
  if (role === "client" || !role) return null;
  const chosen = asPersonId ? people.find((p) => p.id === asPersonId) : undefined;
  if (chosen && chosen.active && levelOf(chosen) === role) return chosen.id;
  return roleDef(role)?.personId ?? null;
}

export function useAccess() {
  const role = usePrefs((s) => s.role);
  const operativeId = usePrefs((s) => s.operativeId);
  const asPersonId = usePrefs((s) => s.asPersonId);
  const people = useDb((db) => db.people);
  const row = useDb((db) => db.access.find((a) => a.id === role));
  const def = roleDef(role);
  const personId = signedInPersonId(role, asPersonId, operativeId, people);
  const person = useDb((db) => db.personAccess.find((a) => a.id === personId));
  const resolved = resolveAccess(def, row, person);
  const allProjects = resolved.perms.includes("allProjects");
  const siteAccess = useDb((db) => db.siteAccess);
  return {
    role,
    def,
    ...resolved,
    personId,
    /** May they open this department? */
    can: (d: DepartmentKey) => resolved.departments.includes(d),
    /** May they do this? See src/data/permissions.ts for the list. */
    may: (p: PermKey) => resolved.perms.includes(p),
    allProjects,
    /**
     * People without "See every project" work only on the sites they open: the ones they run, and
     * any the managing director has given them (Admin, Site access).
     */
    scope: (projects: Project[]) => (allProjects || !personId || role === "operative" ? projects : projects.filter((p) => opensSite(p, personId, siteAccess))),
    /** The sites given to people who do not run them, for rules that ask about one site. */
    siteAccess,
  };
}

export const EDITABLE_ROLES = ROLES.filter((r) => !r.locked);
