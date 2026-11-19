import { Crown } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import { useAccess } from "@/data/access";
import { roleDef } from "@/data/roles";
import { usePrefs, useData } from "@/data/store";
import { Button } from "@/ui";

/**
 * The strip along the top that only Vardil staff ever get, while they are looking at the demo as
 * someone else. It says whose eyes they are looking through, and takes them back.
 */
export function StaffBar() {
  const access = useAccess();
  const role = usePrefs((s) => s.role);
  const setRole = usePrefs((s) => s.setRole);
  const setStaffMode = usePrefs((s) => s.setStaffMode);
  const people = useData((s) => s.db.people);
  const navigate = useNavigate();
  const def = roleDef(role);
  if (access.staffMode || !def) return null;
  const who = people.find((p) => p.id === access.personId)?.name;
  return (
    <div role="region" aria-label="Vardil Works" className="flex min-h-10 items-center gap-3 border-b border-line bg-accent-soft px-4 py-1 text-[0.93rem]">
      <Crown size={18} className="shrink-0 text-accent-ink" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">Viewing as {def.title}</span>
        {who && <span>, {who}</span>}
        <span className="hidden text-muted sm:inline">. This is what a client sees, with your changes applied. Only you can see this strip.</span>
      </p>
      <Button
        size="sm"
        onClick={() => {
          setRole("md");
          setStaffMode(true);
          navigate("/vardil");
        }}
      >
        Back to Vardil Works
      </Button>
    </div>
  );
}

/** The extra line at the top of the "Who are you signing in as?" page. */
export function StaffRoleEntry({ onPick }: { onPick: () => void }) {
  const setRole = usePrefs((s) => s.setRole);
  const setStaffMode = usePrefs((s) => s.setStaffMode);
  return (
    <button
      type="button"
      onClick={() => {
        setRole("md");
        setStaffMode(true);
        onPick();
      }}
      className="press flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-accent-soft"
    >
      <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-accent text-white">
        <Crown size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Vardil Works</span>
        <span className="block text-[0.93rem] text-muted">Our own level, above the managing director: sign in as anyone and change what any level has.</span>
      </span>
      <span className="text-[0.93rem] font-medium text-accent-ink">Sign in</span>
    </button>
  );
}
