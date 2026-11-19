import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { clearScreenState } from "@/app/screen-state";
import { clearTrail } from "@/app/trail";
import { useAccess } from "@/data/access";
import { useData, usePrefs } from "@/data/store";
import { Button, Dialog, PageBody, PageHead, Panel } from "@/ui";
import { toast } from "@/ui/toast";

/** The things done before a call: put the sample data back, put the prospect's name on it. */
export function DemoTools() {
  const access = useAccess();
  const reset = useData((s) => s.reset);
  const brand = usePrefs((s) => s.brand);
  const user = usePrefs((s) => `${s.role ?? "none"}-${s.asPersonId ?? ""}-${s.operativeId ?? ""}`);
  const [confirm, setConfirm] = useState(false);
  if (!access.staffMode) return <Navigate to="/" replace />;
  return (
    <>
      <PageHead title="Demo tools" note="Get this browser ready before a call with a prospect." />
      <PageBody className="grid max-w-4xl gap-4">
        <Panel>
          <ul className="divide-y divide-line">
            <li className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 basis-64">
                <span className="block font-medium">Branding</span>
                <span className="block text-[0.93rem] text-muted">Showing as {brand.brandName}. Change the name, colour and logo to the prospect's own.</span>
              </span>
              <Link to="/settings" className="press inline-flex h-9 items-center rounded-md border border-line-strong px-3 font-medium hover:border-accent hover:text-accent-ink">Open branding</Link>
            </li>
            <li className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 basis-64">
                <span className="block font-medium">Reset demo data</span>
                <span className="block text-[0.93rem] text-muted">Clears every approval, edit and record made in this browser. Branding, theme and the switches under Features and access stay.</span>
              </span>
              <Button onClick={() => setConfirm(true)}>Reset demo data</Button>
            </li>
            <li className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1 basis-64">
                <span className="block font-medium">Features and access</span>
                <span className="block text-[0.93rem] text-muted">Switch departments off, and change what any level, the managing director included, can do.</span>
              </span>
              <Link to="/vardil/features" className="press inline-flex h-9 items-center rounded-md border border-line-strong px-3 font-medium hover:border-accent hover:text-accent-ink">Open features</Link>
            </li>
          </ul>
        </Panel>
      </PageBody>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button onClick={() => setConfirm(false)}>Keep my changes</Button>
            <Button
              variant="primary"
              onClick={() => {
                reset();
                clearTrail(user);
                clearScreenState();
                setConfirm(false);
                toast("Demo data reset");
              }}
            >
              Reset demo data
            </Button>
          </>
        }
      >
        <p>The sample records go back to how they started. Branding, theme and your switches stay as they are.</p>
      </Dialog>
    </>
  );
}
