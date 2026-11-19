import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { DEPARTMENTS } from "@/app/departments";
import { EDITABLE_ROLES, useAccess } from "@/data/access";
import { setRoleDepartment, setRoleMoney, setRolePerm } from "@/data/actions";
import { PERMISSIONS } from "@/data/permissions";
import { ROLES } from "@/data/roles";
import { useData, usePrefs } from "@/data/store";
import type { DepartmentKey, PermKey } from "@/data/types";
import { Badge, Button, PageBody, PageHead, Panel, Tick } from "@/ui";
import { toast } from "@/ui/toast";

const MD = ROLES.find((r) => r.key === "md")!;
const MONEY: { key: "seeValues" | "seeMargins"; label: string; hint: string }[] = [
  { key: "seeValues", label: "Contract values", hint: "Quote totals, project values, invoice amounts" },
  { key: "seeMargins", label: "Costs and margins", hint: "What a job costs the firm, margin on quotes and projects" },
];
const homeOf = (key: string) => {
  const first = ROLES.find((r) => r.key === key)?.home.split("/")[1];
  return DEPARTMENTS.find((d) => d.home.split("/")[1] === first)?.key;
};
// What no other level can be given (decisions 46 and 105): the managing director's alone.
const MD_ONLY_DEPTS: DepartmentKey[] = ["settings", "profit"];

/**
 * Features and access, one level above Roles and access. The same grid, but with the managing
 * director's column editable too, a column for switching a department off for the whole demo
 * (every level, the managing director included), and Ask AI. The three editable levels use the
 * same records as Admin, Roles and access, so a change here shows up there; the managing
 * director's and the whole-demo switches are Vardil's alone and kept in this browser.
 */
export function Features() {
  const access = useAccess();
  const rows = useData((s) => s.db.access);
  const o = usePrefs((s) => s.mdOverride);
  const setO = usePrefs((s) => s.setMdOverride);
  const off = usePrefs((s) => s.companyOff);
  const setOff = usePrefs((s) => s.setCompanyOff);
  const askAiOff = usePrefs((s) => s.askAiOff);
  const setAskAiOff = usePrefs((s) => s.setAskAiOff);
  const clear = usePrefs((s) => s.clearStaffChanges);
  if (!access.staffMode) return <Navigate to="/" replace />;

  const row = (k: string) => rows.find((a) => a.id === k);
  const mdDept = (k: DepartmentKey) => o.departments[k] ?? MD.departments.includes(k);
  const mdPerm = (k: PermKey) => o.perms[k] ?? MD.perms.includes(k);
  const mdValues = o.seeValues ?? MD.money[0];
  const mdMargins = mdValues && (o.seeMargins ?? MD.money[1]);
  const said = (who: string, on: boolean, what: string) => toast(`${who}: ${on ? "now has" : "no longer has"} ${what}`);
  const changes = Object.keys(o.departments).length + Object.keys(o.perms).length + (o.seeValues === undefined ? 0 : 1) + (o.seeMargins === undefined ? 0 : 1) + off.length + (askAiOff ? 1 : 0);

  const head = (title: string, whole = false): ReactNode => (
    <tr key={title} className="bg-side">
      <th scope="colgroup" className="text-left text-[0.93rem] font-semibold text-ink">{title}</th>
      {EDITABLE_ROLES.map((r) => <th key={r.key} scope="col" className="w-28 text-[0.87rem] font-medium whitespace-normal text-muted max-sm:w-20">{r.title}</th>)}
      <th scope="col" className="w-28 text-[0.87rem] font-medium whitespace-normal text-muted max-sm:w-20">{MD.title}</th>
      {whole && <th scope="col" className="w-28 text-[0.87rem] font-medium whitespace-normal text-muted max-sm:w-20">Whole demo</th>}
    </tr>
  );
  const label = (text: string, hint?: string) => (
    <th scope="row" className="text-left font-normal whitespace-normal">
      <span className="font-medium">{text}</span>
      {hint && <span className="block text-[0.93rem] text-muted">{hint}</span>}
    </th>
  );

  return (
    <>
      <PageHead
        title="Features and access"
        note="Change what any level can open, see and do, the managing director's included, and switch whole departments off for the demo. Only Vardil can see this page."
        actions={changes > 0 && <Button onClick={() => { clear(); toast("Your changes to the managing director and the whole demo are cleared"); }}>Clear {changes} of our own changes</Button>}
      />
      <PageBody className="grid max-w-6xl grid-cols-[minmax(0,1fr)] gap-5">
        <div>
          <p className="mb-2 max-w-[95ch] text-[0.93rem] text-muted">
            The first three columns are the same records as Admin, Roles and access, so a change here shows there. The managing director and Whole demo columns are Vardil's: the managing director cannot change them, and cannot tell they are set. They apply in this browser.
          </p>
          <Panel className="overflow-x-auto">
            <table className="tbl" aria-label="Features and access for every level">
              <tbody>
                {head("Money they see")}
                {MONEY.map((m) => (
                  <tr key={m.key}>
                    {label(m.label, m.hint)}
                    {EDITABLE_ROLES.map((r) => {
                      const on = row(r.key)?.[m.key] ?? false;
                      return <td key={r.key} className="align-middle"><Tick on={on} label={`${r.title}: ${m.label}`} onChange={() => { setRoleMoney(r.key, m.key, !on); said(r.title, !on, m.label.toLowerCase()); }} /></td>;
                    })}
                    <td className="align-middle">
                      <Tick on={m.key === "seeValues" ? mdValues : mdMargins} label={`${MD.title}: ${m.label}`} locked={m.key === "seeMargins" && !mdValues} onChange={() => { const on = m.key === "seeValues" ? mdValues : mdMargins; setO(m.key === "seeValues" ? { seeValues: !on, ...(on ? { seeMargins: false } : {}) } : { seeMargins: !on }); said(MD.title, !on, m.label.toLowerCase()); }} />
                    </td>
                  </tr>
                ))}
                {head("What they can do")}
                {PERMISSIONS.map((p) => (
                  <tr key={p.key}>
                    {label(p.label, p.hint)}
                    {EDITABLE_ROLES.map((r) => {
                      const on = row(r.key)?.perms.includes(p.key) ?? false;
                      return <td key={r.key} className="align-middle"><Tick on={on} label={`${r.title}: ${p.label}`} onChange={() => { setRolePerm(r.key, p.key, !on); said(r.title, !on, p.label); }} /></td>;
                    })}
                    <td className="align-middle"><Tick on={mdPerm(p.key)} label={`${MD.title}: ${p.label}`} onChange={() => { setO({ perms: { ...o.perms, [p.key]: !mdPerm(p.key) } }); said(MD.title, !mdPerm(p.key), p.label); }} /></td>
                  </tr>
                ))}
                {head("Departments they can open", true)}
                {DEPARTMENTS.filter((d) => d.key !== "vardil").map((d) => {
                  const name = d.title ?? d.label;
                  return (
                    <tr key={d.key}>
                      {label(name)}
                      {EDITABLE_ROLES.map((r) => {
                        const on = row(r.key)?.departments.includes(d.key) ?? false;
                        // A level's home is always on, and the managing director's two private departments cannot be given to a level.
                        if (homeOf(r.key) === d.key) return <td key={r.key} className="align-middle"><Tick on label={`${r.title}: ${name}`} locked /></td>;
                        if (MD_ONLY_DEPTS.includes(d.key)) return <td key={r.key} className="align-middle"><Tick on={false} label={`${r.title}: ${name}`} locked /></td>;
                        return <td key={r.key} className="align-middle"><Tick on={on} label={`${r.title}: ${name}`} onChange={() => { setRoleDepartment(r.key, d.key, !on); said(r.title, !on, name); }} /></td>;
                      })}
                      <td className="align-middle"><Tick on={mdDept(d.key)} label={`${MD.title}: ${name}`} onChange={() => { setO({ departments: { ...o.departments, [d.key]: !mdDept(d.key) } }); said(MD.title, !mdDept(d.key), name); }} /></td>
                      <td className="align-middle"><Tick on={!off.includes(d.key)} label={`Whole demo: ${name}`} onChange={() => { const on = !off.includes(d.key); setOff(d.key, on); toast(`${name} is ${on ? "off" : "on"} for the whole demo`); }} /></td>
                    </tr>
                  );
                })}
                <tr>
                  {label("Ask AI", "The managing director's panel beside the search box")}
                  {EDITABLE_ROLES.map((r) => <td key={r.key} className="align-middle"><Tick on={false} label={`${r.title}: Ask AI`} locked /></td>)}
                  <td className="align-middle"><Tick on={!askAiOff} label={`${MD.title}: Ask AI`} onChange={() => { setAskAiOff(!askAiOff); said(MD.title, askAiOff, "Ask AI"); }} /></td>
                  <td className="align-middle"><Badge tone="neutral">MD only</Badge></td>
                </tr>
              </tbody>
            </table>
          </Panel>
          <ul className="mt-2 grid max-w-[85ch] gap-1 text-[0.93rem] text-muted">
            <li>A department switched off in Whole demo is closed to every level. Anyone whose usual starting department is off lands on the first one they still have.</li>
            <li>A tick with no box cannot be changed: a level's starting department stays on, and Settings and Profitability belong to the managing director.</li>
            <li>You always see everything while you are in Vardil Works. Open the demo as a level from Sign in as to check what they see.</li>
          </ul>
        </div>
      </PageBody>
    </>
  );
}
