import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { DEPARTMENTS } from "@/app/departments";
import { EDITABLE_ROLES, exceptionCount, levelOf, levelValue, resolveAccess, useAccess } from "@/data/access";
import { clearPersonAccess, setPersonAccess, setPersonLevel, setRoleDepartment, setRoleMoney, setRolePerm } from "@/data/actions";
import { PERMISSIONS } from "@/data/permissions";
import { roleDef, ROLES } from "@/data/roles";
import { useData, usePrefs } from "@/data/store";
import type { AccessKey, AccessRow, DepartmentKey, LevelKey, Person, PersonAccess } from "@/data/types";
import { plural } from "@/lib/format";
import { Badge, Button, cx, PageBody, PageHead, Panel, Section, Segmented, Tick } from "@/ui";
import { toast } from "@/ui/toast";
import { PORTAL } from "@/lib/apps";

const MONEY: { key: "seeValues" | "seeMargins"; label: string; hint: string }[] = [
  { key: "seeValues", label: "Contract values", hint: "Quote totals, project values, the value of extras, invoice amounts" },
  { key: "seeMargins", label: "Costs and margins", hint: "What a job costs the firm, margin on quotes and projects, the Costs tab" },
];
const homeDept = (roleKey: string): DepartmentKey | undefined => {
  const home = ROLES.find((r) => r.key === roleKey)?.home.split("/")[1];
  return DEPARTMENTS.find((d) => d.home.split("/")[1] === home)?.key;
};
// Settings and Profitability are the managing director's alone, so neither is offered to another level.
const allDepts = DEPARTMENTS.filter((d) => d.key !== "settings" && d.key !== "profit" && d.key !== "vardil");
/**
 * Only the apps the firm has (19 Nov, Oisin's pick: "hide them"); the rest are on Admin, Vardil
 * Works. Permissions for an app they do not have go too.
 */
const PERM_APPS: Partial<Record<string, DepartmentKey[]>> = { Sales: ["sales"], Plant: ["plant", "fleet"], Invoicing: ["invoicing"] };
function useOwned() {
  const { apps } = useAccess();
  return {
    depts: allDepts.filter((d) => apps.on(d.key)),
    perms: PERMISSIONS.filter((p) => !PERM_APPS[p.group] || PERM_APPS[p.group]!.some((a) => apps.on(a))),
  };
}

/**
 * Who may open, see and do what. Two layers: a level (by role), then exceptions for one
 * person. Only the managing director can open this screen.
 */
export function RolesAccess() {
  const [params, setParams] = useSearchParams();
  const md = useAccess().role === "md";
  const view = params.get("person") != null ? "person" : "role";
  // The managing director's alone, even when Admin is switched on for another level, so nobody
  // else can change what they themselves may do.
  if (!md) return <Navigate to="/admin" replace />;
  return (
    <>
      <PageHead
        title="Roles and access"
        note={view === "role" ? "What each level can open, see and do. Everyone at that level gets it, unless you have made an exception for them under By person." : "Start from a person's level, then tick or untick individual things just for them. Changes take effect straight away."}
        actions={
          <Segmented
            label="Access view"
            value={view}
            onChange={(v) => setParams(v === "person" ? { person: "" } : {}, { replace: true })}
            options={[
              { value: "role", label: "By role" },
              { value: "person", label: "By person" },
            ]}
          />
        }
      />
      {view === "role" ? <ByRole /> : <ByPerson selected={params.get("person") ?? ""} onSelect={(id) => setParams({ person: id }, { replace: true })} />}
    </>
  );
}

/** The levels across the grid: the three that can be changed, then the managing director, who always has everything. */
const MD = ROLES.find((r) => r.key === "md")!;
const LEVELS = [...EDITABLE_ROLES, MD];

function Label({ label, hint }: { label: string; hint?: string }) {
  return (
    <>
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-[0.93rem] text-muted">{hint}</span>}
    </>
  );
}

/**
 * By role, laid out like the Roles page of an earlier app of Oisin's (17 Nov): a card per level
 * saying how many people are at it and who, then one grid of everything a level can see, do and
 * open, with a tick where it has it and a dash where it does not. Unlike that page, a tick here
 * can be changed: each one in a light box is a checkbox. The managing director's column is fixed.
 */
function ByRole() {
  const { depts, perms: PERMISSIONS } = useOwned();
  const access = useData((s) => s.db.access);
  const people = useData((s) => s.db.people);
  const row = (role: string) => access.find((a) => a.id === role);
  const at = (role: string) => people.filter((p) => p.active && p.kind === "Management" && levelOf(p) === role).sort((a, b) => a.name.localeCompare(b.name));
  const said = (title: string, on: boolean, what: string) => toast(`${title} level ${on ? "now has" : "no longer has"}: ${what}`);
  /** One row of the grid: the thing, then each level's tick or dash. */
  const line = (group: "money" | "permission" | "department", key: string, label: string, hint: string | undefined, cell: (r: (typeof EDITABLE_ROLES)[number]) => { on: boolean; change?: () => void }) => (
    <tr key={key} data-group={group}>
      <th scope="row" className="text-left font-normal whitespace-normal">
        <Label label={label} hint={hint} />
      </th>
      {EDITABLE_ROLES.map((r) => {
        const c = cell(r);
        return (
          <td key={r.key} className="align-middle">
            <Tick on={c.on} label={`${r.title}: ${label}`} locked={!c.change} {...(c.change ? { onChange: c.change } : {})} />
          </td>
        );
      })}
      <td className="align-middle">
        <Tick on label={`${MD.title}: ${label}`} locked />
      </td>
    </tr>
  );
  /** A heading row for each part of the grid, with the level names again so they are never far above. */
  const part = (title: string) => (
    <tr key={title} className="bg-side">
      <th scope="colgroup" className="text-left text-[0.93rem] font-semibold text-ink">
        {title}
      </th>
      {LEVELS.map((r) => (
        <th key={r.key} scope="col" className="w-32 text-[0.87rem] font-medium whitespace-normal text-muted max-sm:w-20">
          {r.title}
        </th>
      ))}
    </tr>
  );
  return (
    // One column that can shrink, so on a phone the cards keep to the screen and the grid scrolls inside its own panel.
    <PageBody className="grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Access levels">
        {LEVELS.map((r) => {
          const who = at(r.key);
          return (
            <li key={r.key} className="rounded-lg border border-line bg-surface px-4 py-3">
              <h2 className="font-sans text-[0.93rem] font-semibold">{r.title}</h2>
              <p className="mt-1 font-display text-[1.9rem] leading-none font-semibold tabular-nums">{who.length}</p>
              <p className="text-[0.87rem] text-muted">{who.length === 1 ? "person" : "people"}</p>
              <p className="mt-2 text-[0.93rem] text-muted">{r.does}</p>
              <p className="mt-1.5 text-[0.93rem]">
                {who.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    {r.locked ? (
                      p.name
                    ) : (
                      <Link to={`/admin/access?person=${p.id}`} className="underline-offset-2 hover:text-accent-ink hover:underline" title={`Open ${p.name}'s own access`}>
                        {p.name}
                      </Link>
                    )}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="mb-2 max-w-[95ch] text-[0.93rem] text-muted">
          A tick means the level has it, a dash means it does not. Click a tick or a dash in a box to change it; it takes effect straight away for everyone at that level. The managing director always has everything.
        </p>
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label="What each level can see, do and open">
            <tbody>
              {part("Money they see")}
              {MONEY.map((m) =>
                line("money", m.key, m.label, m.hint, (r) => {
                  const on = row(r.key)?.[m.key] ?? false;
                  return { on, change: () => { setRoleMoney(r.key, m.key, !on); said(r.title, !on, m.label.toLowerCase()); } };
                }),
              )}
              {part("What they can do")}
              {PERMISSIONS.map((p) =>
                line("permission", p.key, p.label, p.hint, (r) => {
                  const on = row(r.key)?.perms.includes(p.key) ?? false;
                  return { on, change: () => { setRolePerm(r.key, p.key, !on); said(r.title, !on, p.label); } };
                }),
              )}
              {part("Departments they can open")}
              {depts.map((d) =>
                line("department", d.key, d.title ?? d.label, undefined, (r) => {
                  const on = row(r.key)?.departments.includes(d.key) ?? false;
                  // A level's home department is always on, so nobody can be locked out.
                  if (homeDept(r.key) === d.key) return { on: true };
                  return { on, change: () => { setRoleDepartment(r.key, d.key, !on); said(r.title, !on, d.title ?? d.label); } };
                }),
              )}
            </tbody>
          </table>
        </Panel>
        <ul className="mt-2 grid max-w-[80ch] gap-1 text-[0.93rem] text-muted">
          <li>Margins cannot be shown without values, so unticking values unticks margins too.</li>
          <li>A permission only matters if the person can open the department it belongs to.</li>
          <li>A tick with no box cannot be changed: a level's home department is always on, so nobody can be locked out. Operatives only ever get the site phone{PORTAL ? ", and clients only their own portal" : ""}.</li>
          <li>
            Which sites a site manager opens is on{" "}
            <Link to="/admin/sites" className="font-medium text-accent-ink underline-offset-2 hover:underline">
              Site access
            </Link>
            .
          </li>
        </ul>
      </div>
    </PageBody>
  );
}

function ByPerson({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const db = useData((s) => s.db);
  const office = db.people.filter((p) => p.active && p.kind === "Management" && levelOf(p) !== "md").sort((a, b) => a.name.localeCompare(b.name));
  const person = office.find((p) => p.id === selected) ?? office[0];
  const row = (p: Person) => db.access.find((a) => a.id === levelOf(p));
  const over = (p: Person) => db.personAccess.find((a) => a.id === p.id);
  return (
    <PageBody className="grid max-w-6xl items-start gap-5 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <Panel>
        <ul className="max-h-64 divide-y divide-line overflow-y-auto lg:max-h-none" aria-label="Office and management staff">
          {office.map((p) => {
            const n = exceptionCount(row(p), over(p));
            return (
              <li key={p.id}>
                <button type="button" aria-current={p.id === person?.id} onClick={() => onSelect(p.id)} className={cx("press flex w-full items-center gap-2 px-3 py-2 text-left", p.id === person?.id ? "bg-accent-soft" : "hover:bg-accent-soft/60")}>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-[0.87rem] text-muted">{p.trade}</span>
                  </span>
                  {n > 0 && <Badge tone="accent">{plural(n, "exception")}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-line px-3 py-2 text-[0.87rem] text-muted">The managing director always has everything. Operatives are not listed: they only get the site phone view.</p>
      </Panel>
      {person && <PersonAccessPanel key={person.id} person={person} row={row(person)} over={over(person)} />}
    </PageBody>
  );
}

function PersonAccessPanel({ person, row, over }: { person: Person; row: AccessRow | undefined; over: PersonAccess | undefined }) {
  const { depts, perms: PERMISSIONS } = useOwned();
  const navigate = useNavigate();
  const signInAs = usePrefs((s) => s.signInAs);
  const level = levelOf(person) as Exclude<LevelKey, "md">;
  const levelTitle = ROLES.find((r) => r.key === level)?.title ?? "";
  const now = resolveAccess(roleDef(level), row, over);
  const n = exceptionCount(row, over);
  const first = person.name.split(" ")[0];

  /**
   * One setting: what the level has (a plain tick or dash), then what this person has (a tick
   * that can be changed), and whether that differs from their level.
   */
  const line = (key: string, label: string, hint: string | undefined, on: boolean, same: boolean, change: () => void, fixed = false) => (
    <tr key={key} className={cx(!same && "bg-accent-soft/50")}>
      <th scope="row" className="text-left font-normal whitespace-normal">
        <Label label={label} hint={hint} />
      </th>
      <td className="w-28 align-middle">
        <Tick on={fixed ? true : same ? on : !on} label={`${levelTitle} level: ${label}`} locked />
      </td>
      <td className="w-24 align-middle">
        <Tick on={on} label={`${person.name}: ${label}`} locked={fixed} {...(fixed ? {} : { onChange: change })} />
      </td>
      <td className="w-48 align-middle text-[0.93rem]">{fixed ? <span className="text-muted">Always on</span> : same ? <span className="text-muted">Same as {levelTitle.toLowerCase()}</span> : <Badge tone="accent">Exception: {on ? "on" : "off"} for {first} only</Badge>}</td>
    </tr>
  );
  /** The heading over each part: the thing, the level, the person. */
  const head = (what: string) => (
    <thead>
      <tr>
        <th>{what}</th>
        <th className="whitespace-normal">{levelTitle} level</th>
        <th>{first}</th>
        <th />
      </tr>
    </thead>
  );
  const perm = (key: AccessKey, label: string, hint?: string) => {
    const on = key === "seeValues" ? now.seeValues : key === "seeMargins" ? now.seeMargins : now.perms.includes(key);
    return line(key, label, hint, on, on === levelValue(row, key), () => setPersonAccess(person.id, "perm", key, !on));
  };

  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto">
          <h2 className="text-[1.15rem]">{person.name}</h2>
          <p className="text-muted">
            {person.trade}. {n > 0 ? `${plural(n, "exception")} to the ${levelTitle.toLowerCase()} level.` : `Exactly the ${levelTitle.toLowerCase()} level.`}
          </p>
        </div>
        <label className="grid gap-1 text-[0.93rem] font-medium">
          Access level
          <select
            className="field h-9 w-48 font-normal"
            value={level}
            onChange={(e) => {
              setPersonLevel(person.id, e.target.value as LevelKey);
              toast(`${person.name} moved to ${ROLES.find((r) => r.key === e.target.value)?.title} level`);
            }}
          >
            {EDITABLE_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        {n > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              clearPersonAccess(person.id);
              toast(`${person.name} put back to the ${levelTitle.toLowerCase()} level`);
            }}
          >
            Clear exceptions
          </Button>
        )}
        <Button
          onClick={() => {
            signInAs(level, person.id);
            toast(`Signed in as ${person.name}. Switch back from the menu in the top right corner`);
            navigate(now.home);
          }}
        >
          Sign in as {first} to check
        </Button>
      </div>

      <Section title="Money">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            {head("What they see")}
            <tbody>{MONEY.map((m) => perm(m.key, m.label, m.hint))}</tbody>
          </table>
        </Panel>
      </Section>
      <Section title="What they can do">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            {head("Permission")}
            <tbody>{PERMISSIONS.map((p) => perm(p.key, p.label, p.hint))}</tbody>
          </table>
        </Panel>
      </Section>
      <Section title="Departments">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            {head("Department")}
            <tbody>
              {depts.map((d) => {
                const on = now.departments.includes(d.key);
                return line(d.key, d.title ?? d.label, undefined, on, on === (row?.departments.includes(d.key) ?? false), () => setPersonAccess(person.id, "department", d.key, !on), homeDept(level) === d.key);
              })}
            </tbody>
          </table>
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">Changing someone's access level clears their exceptions, because they were differences from the old level.</p>
      </Section>
    </div>
  );
}
