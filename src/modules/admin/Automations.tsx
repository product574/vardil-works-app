import { DEPARTMENTS } from "@/app/departments";
import { runAutomation, toggleAutomation } from "@/data/actions";
import { useDay, useDb } from "@/data/store";
import { when } from "@/lib/format";
import { Button, PageBody, PageHead, Panel, Switch } from "@/ui";
import { toast } from "@/ui/toast";
import { Navigate } from "react-router-dom";
import { useAccess } from "@/data/access";

export function Automations() {
  const apps = useAccess().apps;
  const automations = useDb((db) => db.automations).filter((a) => apps.on(a.department));
  const day = useDay();
  const on = automations.filter((a) => a.enabled).length;
  const groups = DEPARTMENTS.map((d) => ({ d, items: automations.filter((a) => a.department === d.key) })).filter((g) => g.items.length > 0);

  // Left out of a package without Automations (Vardil HQ, 19 Nov).
  if (!apps.automations) return <Navigate to="/admin" replace />;
  return (
    <>
      <PageHead title="Automations" note={`${on} of ${automations.length} switched on. Each one prepares work for a person to approve. None of them sends, prices or files anything on its own.`} />
      <PageBody>
        <Panel className="max-w-6xl overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Automation</th>
                <th>When it runs</th>
                <th>Last run</th>
                <th className="num">Times run</th>
                <th>On</th>
                <th />
              </tr>
            </thead>
            {groups.map(({ d, items }) => (
              <tbody key={d.key}>
                <tr>
                  <td colSpan={6} className="bg-side py-1.5! font-medium">
                    {d.title ?? d.label}
                  </td>
                </tr>
                {items.map((a) => (
                  <tr key={a.id} className={a.enabled ? "" : "text-muted"}>
                    <td className="max-w-[34rem]">
                      <span className="font-medium">{a.name}</span>
                      <span className="block text-[0.93rem] text-muted">
                        {a.trigger} {a.effect}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">{a.when}</td>
                    <td className="whitespace-nowrap">{a.lastRun ? when(a.lastRun, day) : "Never"}</td>
                    <td className="num">{a.runs.toLocaleString("en-IE")}</td>
                    <td>
                      <Switch on={a.enabled} label={`${a.name}: ${a.enabled ? "on" : "off"}`} onChange={() => toggleAutomation(a.id)} />
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        disabled={!a.enabled}
                        onClick={() => {
                          const note = runAutomation(a.id);
                          toast(note ? `Ran "${a.name}": ${note}` : `Ran "${a.name}"`);
                        }}
                      >
                        Run now
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </Panel>
      </PageBody>
    </>
  );
}
