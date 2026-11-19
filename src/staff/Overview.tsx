import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAccess, levelOf } from "@/data/access";
import { ROLES } from "@/data/roles";
import { useData, usePrefs } from "@/data/store";
import type { ID, RoleKey } from "@/data/types";
import { Avatar, Button, PageBody, PageHead, Panel } from "@/ui";

/** Vardil Works home: pick who to look at the demo as. Each pick drops the Vardil level, so what you see is what that person sees. */
export function Overview() {
  const access = useAccess();
  const navigate = useNavigate();
  const people = useData((s) => s.db.people);
  const signInAs = usePrefs((s) => s.signInAs);
  const setRole = usePrefs((s) => s.setRole);
  const [pick, setPick] = useState<Partial<Record<RoleKey, ID>>>({});
  if (!access.staffMode) return <Navigate to="/" replace />;
  return (
    <>
      <PageHead title="Sign in as" note="Open the demo as any level, the way a client will see it. The strip at the top then takes you back here. Nobody below you can see it, or that you are here." />
      <PageBody className="max-w-4xl">
        <Panel>
          <ul className="divide-y divide-line" aria-label="Levels you can sign in as">
            {ROLES.map((r) => {
              const here = people.filter((p) => p.active && p.kind === "Management" && levelOf(p) === r.key).sort((a, b) => a.name.localeCompare(b.name));
              const chosen = pick[r.key] ?? r.personId ?? "";
              const name = here.find((p) => p.id === chosen)?.name ?? people.find((p) => p.id === r.personId)?.name;
              return (
                <li key={r.key} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <Avatar name={name ?? r.title} size={38} />
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-medium">{r.title}</span>
                    <span className="block text-[0.93rem] text-muted">{r.does}</span>
                  </span>
                  {r.key !== "md" && here.length > 1 && (
                    <select aria-label={`Which ${r.title.toLowerCase()}`} className="field h-10 w-52" value={chosen} onChange={(e) => setPick((s) => ({ ...s, [r.key]: e.target.value }))}>
                      {here.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    variant={r.key === "md" ? "primary" : "outline"}
                    onClick={() => {
                      if (r.key !== "md" && here.length > 1 && pick[r.key]) signInAs(r.key, pick[r.key]!);
                      else setRole(r.key);
                      navigate(r.home);
                    }}
                  >
                    Open as {r.title.toLowerCase()}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
