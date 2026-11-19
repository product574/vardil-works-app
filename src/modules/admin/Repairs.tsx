import { useState } from "react";
import { useAccess } from "@/data/access";
import { moveRepair } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import type { RepairReport, RepairStatus } from "@/data/types";
import { dFull, plural, when } from "@/lib/format";
import { Badge, Button, Dialog, Empty, Field, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { toast } from "@/ui/toast";

const TONE = { Reported: "accent", "In hand": "warn", Fixed: "ok" } as const;

/**
 * Repairs reported from the phone (19 Nov, the main offering): any plant or vehicle, or anything
 * else typed. A manager takes each one in hand, then marks it fixed, with a note if they want;
 * the person who reported it sees every step on their phone.
 */
export function Repairs() {
  const db = useData((s) => s.db);
  const day = useDay();
  const may = useAccess().may("answerRequests");
  const [show, setShow] = useState<"open" | "fixed">("open");
  const [step, setStep] = useState<{ r: RepairReport; to: RepairStatus } | null>(null);
  const open = db.repairs.filter((r) => r.status !== "Fixed");
  const list = show === "open" ? open : db.repairs.filter((r) => r.status === "Fixed");
  const who = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  return (
    <>
      <PageHead
        title="Repairs"
        note={`Reported from the phone by anyone in the firm. ${open.length ? `${plural(open.length, "repair")} not fixed yet.` : "Nothing waiting."} Each step shows on the phone of whoever reported it.`}
        actions={<Segmented label="Repairs shown" value={show} onChange={setShow} options={[{ value: "open", label: "Not fixed", count: open.length }, { value: "fixed", label: "Fixed" }]} />}
      />
      <PageBody className="max-w-6xl">
        <Panel className="overflow-x-auto">
          {list.length === 0 ? (
            <Empty title={show === "open" ? "Nothing to repair" : "Nothing fixed yet"}>Repairs reported on the phone arrive here.</Empty>
          ) : (
            <table className="tbl" aria-label="Repairs">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Where</th>
                  <th>Reported</th>
                  <th>Where it stands</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const last = r.steps[r.steps.length - 1];
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="font-medium">{r.item.name}</span>
                        <span className="block text-[0.87rem] text-muted">{r.what}</span>
                        {r.photos.length > 0 && (
                          <span className="mt-1 flex gap-1.5">
                            {r.photos.map((p, i) => (p.dataUrl ? <a key={i} href={p.dataUrl} download={p.name} className="text-[0.87rem] font-medium text-accent-ink underline-offset-2 hover:underline">Photo {i + 1}</a> : null))}
                          </span>
                        )}
                      </td>
                      <td>{r.where}</td>
                      <td>
                        {who(r.personId)}
                        <span className="block text-[0.87rem] text-muted">{when(r.at, day)}</span>
                      </td>
                      <td>
                        <Badge tone={TONE[r.status]}>{r.status}</Badge>
                        {last && (
                          <span className="block text-[0.87rem] text-muted">
                            {last.by}, {dFull(last.at.slice(0, 10))}
                            {last.note ? `: ${last.note}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {may && r.status === "Reported" && (
                          <Button size="sm" onClick={() => setStep({ r, to: "In hand" })}>
                            Take in hand
                          </Button>
                        )}
                        {may && r.status !== "Fixed" && (
                          <>
                            {" "}
                            <Button size="sm" variant={r.status === "In hand" ? "primary" : "outline"} onClick={() => setStep({ r, to: "Fixed" })}>
                              Mark fixed
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {step && <StepDialog r={step.r} to={step.to} onClose={() => setStep(null)} />}
    </>
  );
}

function StepDialog({ r, to, onClose }: { r: RepairReport; to: RepairStatus; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title={to === "Fixed" ? "Mark this repair fixed?" : "Take this repair in hand?"}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              moveRepair(r.id, to, note);
              toast(`${r.item.name}: ${to.toLowerCase()}`);
              onClose();
            }}
          >
            {to === "Fixed" ? "Mark fixed" : "Take in hand"}
          </Button>
        </>
      }
    >
      <p className="font-medium">{r.item.name}</p>
      <p className="text-muted">{r.what}</p>
      <Field label="Note for whoever reported it (optional)" className="mt-3">
        {(id) => <input id={id} className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={to === "Fixed" ? "Fitted a new cord at the yard" : "Ordered the part, back on Thursday"} />}
      </Field>
    </Dialog>
  );
}
