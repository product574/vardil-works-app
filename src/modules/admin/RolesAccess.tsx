import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { DEPARTMENTS } from "@/app/departments";
import { EDITABLE_ROLES, exceptionCount, levelOf, levelValue, resolveAccess, useAccess } from "@/data/access";
import { clearPersonAccess, setPersonAccess, setPersonLevel, setRoleDepartment, setRoleMoney, setRolePerm } from "@/data/actions";
import { PERMISSIONS } from "@/data/permissions";
import { roleDef, ROLES } from "@/data/roles";
import { useData, usePrefs } from "@/data/store";
import type { AccessKey, AccessRow, DepartmentKey, LevelKey, Person, PersonAccess } from "@/data/types";
import { plural } from "@/lib/format";
import { Badge, Button, cx, PageBody, PageHead, Panel, Section, Segmented, Switch } from "@/ui";
import { toast } from "@/ui/toast";

const MONEY: { key: "seeValues" | "seeMargins"; label: string; hint: string }[] = [
  { key: "seeValues", label: "Contract values", hint: "Quote totals, project values, the value of extras, invoice amounts" },
  { key: "seeMargins", label: "Costs and margins", hint: "What a job costs the firm, margin on quotes and projects, the Costs tab" },
];
const homeDept = (roleKey: string): DepartmentKey | undefined => {
  const home = ROLES.find((r) => r.key === roleKey)?.home.split("/")[1];
  return DEPARTMENTS.find((d) => d.home.split("/")[1] === home)?.key;
};
const depts = DEPARTMENTS.filter((d) => d.key !== "settings");

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
        note={view === "role" ? "Set what each level can open, see and do. Everyone at that level gets it, unless you have made an exception for them under By person." : "Start from a person's level, then switch individual things on or off just for them. Changes take effect straight away."}
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

function RoleHead({ withNames }: { withNames?: boolean }) {
  const people = useData((s) => s.db.people);
  return (
    <>
      {EDITABLE_ROLES.map((r) => (
        <th key={r.key} className="w-36">
          {r.title}
          {withNames && <span className="block font-normal">{plural(people.filter((p) => p.active && levelOf(p) === r.key).length, "person", "people")}</span>}
        </th>
      ))}
    </>
  );
}

function Label({ label, hint }: { label: string; hint?: string }) {
  return (
    <>
      <span className="font-medium">{label}</span>
      {hint && <span className="block text-[0.93rem] text-muted">{hint}</span>}
    </>
  );
}

function ByRole() {
  const access = useData((s) => s.db.access);
  const row = (role: string) => access.find((a) => a.id === role);
  return (
    <PageBody className="grid max-w-4xl gap-6">
      <Section title="Money">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>What they see</th>
                <RoleHead withNames />
              </tr>
            </thead>
            <tbody>
              {MONEY.map((m) => (
                <tr key={m.key}>
                  <td>
                    <Label {...m} />
                  </td>
                  {EDITABLE_ROLES.map((r) => (
                    <td key={r.key}>
                      <Switch on={row(r.key)?.[m.key] ?? false} label={`${r.title}: ${m.label.toLowerCase()}`} onChange={() => setRoleMoney(r.key, m.key, !row(r.key)?.[m.key])} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">Margins cannot be shown without values, so switching values off hides margins too.</p>
      </Section>

      <Section title="What they can do">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Permission</th>
                <RoleHead />
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((p) => (
                <tr key={p.key}>
                  <td>
                    <Label label={p.label} hint={p.hint} />
                  </td>
                  {EDITABLE_ROLES.map((r) => {
                    const on = row(r.key)?.perms.includes(p.key) ?? false;
                    return (
                      <td key={r.key}>
                        <Switch on={on} label={`${r.title}: ${p.label}`} onChange={() => setRolePerm(r.key, p.key, !on)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">A permission only matters if the person can open the department it belongs to.</p>
      </Section>

      <Section title="Departments">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Department</th>
                <RoleHead />
              </tr>
            </thead>
            <tbody>
              {depts.map((d) => (
                <tr key={d.key}>
                  <td className="font-medium">{d.title ?? d.label}</td>
                  {EDITABLE_ROLES.map((r) => {
                    const on = row(r.key)?.departments.includes(d.key) ?? false;
                    return <td key={r.key}>{homeDept(r.key) === d.key ? <span className="text-[0.93rem] text-muted">Always on</span> : <Switch on={on} label={`${r.title}: ${d.label}`} onChange={() => setRoleDepartment(r.key, d.key, !on)} />}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <p className="mt-2 text-[0.93rem] text-muted">The managing director always sees everything. Operatives only ever get the site phone view, and clients only their own portal. A level's home department is always on, so nobody can be locked out.</p>
      </Section>
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
  const navigate = useNavigate();
  const signInAs = usePrefs((s) => s.signInAs);
  const level = levelOf(person) as Exclude<LevelKey, "md">;
  const levelTitle = ROLES.find((r) => r.key === level)?.title ?? "";
  const now = resolveAccess(roleDef(level), row, over);
  const n = exceptionCount(row, over);
  const first = person.name.split(" ")[0];

  /** One setting: a switch showing what this person has now, and whether that differs from their level. */
  const line = (key: string, label: string, hint: string | undefined, on: boolean, same: boolean, change: () => void, fixed = false) => (
    <tr key={key} className={cx(!same && "bg-accent-soft/50")}>
      <td>
        <Label label={label} hint={hint} />
      </td>
      <td className="w-24">{fixed ? <span className="text-[0.93rem] text-muted">Always on</span> : <Switch on={on} label={`${person.name}: ${label}`} onChange={change} />}</td>
      <td className="w-44 text-[0.93rem]">{fixed ? "" : same ? <span className="text-muted">Same as {levelTitle.toLowerCase()}</span> : <Badge tone="accent">Exception: {on ? "on" : "off"} for {first} only</Badge>}</td>
    </tr>
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
            <tbody>{MONEY.map((m) => perm(m.key, m.label, m.hint))}</tbody>
          </table>
        </Panel>
      </Section>
      <Section title="What they can do">
        <Panel className="overflow-x-auto">
          <table className="tbl">
            <tbody>{PERMISSIONS.map((p) => perm(p.key, p.label, p.hint))}</tbody>
          </table>
        </Panel>
      </Section>
      <Section title="Departments">
        <Panel className="overflow-x-auto">
          <table className="tbl">
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
