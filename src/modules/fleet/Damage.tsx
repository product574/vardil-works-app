/**
 * Damage reported (from the Secure-All build, 18 Nov): what drivers have sent from the site phone about damage to a
 * vehicle. Each report opens with its photos to flick through, the driver's note, and the
 * driver's phone number to ring. The office marks it dealt with, with a note of what was done.
 */
import { CheckCircle, Phone } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { setDamageDealt } from "@/data/actions";
import type { DamageReport } from "@/data/types";
import { dFull, dNear, plural, tOf } from "@/lib/format";
import { Badge, Button, Dialog, Empty, Field, PageBody, PageHead, Panel, Segmented, Tel } from "@/ui";
import { DocViewer } from "@/ui/DocViewer";
import { toast } from "@/ui/toast";
import { damageDocs } from "./docs";
import { useFleetCan, useNames } from "./shared";
import { getDay } from "@/data/store";

export function DamageReported() {
  const { db, reg, driver, base, vehicle } = useNames();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useScreenState<"New" | "Dealt with" | "all">("damage.tab", "New");
  const open = db.damageReports.find((d) => d.id === params.get("report"));
  const isNew = db.damageReports.filter((d) => d.status === "New").length;
  const rows = db.damageReports.filter((d) => tab === "all" || d.status === tab);
  const phone = (id: string | null) => db.people.find((d) => d.id === id)?.phone ?? "";
  const show = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set("report", id);
        else p.delete("report");
        return p;
      },
      { replace: !id },
    );
  return (
    <>
      <PageHead title="Damage reported" note="Sent by drivers from the site phone, with photos. Open one to see the photos and ring the driver, then mark it dealt with.">
        <div className="mt-3">
          <Segmented label="Reports" value={tab} onChange={setTab} options={[{ value: "New", label: `New (${isNew})` }, { value: "Dealt with", label: "Dealt with" }, { value: "all", label: "All" }]} />
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={db.damageReports.length ? (tab === "New" ? "Nothing new" : "No reports here") : "No damage reported yet"}>{db.damageReports.length ? "Every report has been dealt with. Pick All to see them." : "When a driver reports damage on the site phone, it shows here with the photos."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Reported</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th>Where and what</th>
                  <th>Photos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const v = vehicle(d.vehicleId);
                  return (
                    <tr key={d.id} className="rowlink cursor-pointer" onClick={() => show(d.id)}>
                      <td className="whitespace-nowrap">
                        {dNear(d.at.slice(0, 10), getDay())}
                        <span className="block text-[0.87rem] text-muted">{tOf(d.at)}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        <Link to={`/fleet/vehicles/${d.vehicleId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-accent-ink hover:underline">
                          {reg(d.vehicleId)}
                        </Link>
                        <span className="block text-[0.87rem] text-muted">{v ? base(v.baseId) : ""}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        {driver(d.driverId)}
                        {phone(d.driverId) && (
                          <span className="block text-[0.93rem]" onClick={(e) => e.stopPropagation()}>
                            <Tel number={phone(d.driverId)} />
                          </span>
                        )}
                      </td>
                      <td className="max-w-[28rem]">
                        <span className="font-medium">{d.where}</span>
                        <span className="block truncate text-muted">{d.note}</span>
                      </td>
                      <td className="whitespace-nowrap">{plural(d.photos.length, "photo")}</td>
                      <td>
                        <Badge tone={d.status === "New" ? "bad" : "ok"}>{d.status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {open && <ReportDialog key={open.id} report={open} onClose={() => show(null)} />}
    </>
  );
}

function ReportDialog({ report, onClose }: { report: DamageReport; onClose: () => void }) {
  const { db, reg, base, vehicle } = useNames();
  const can = useFleetCan();
  const [dealing, setDealing] = useState(false);
  const [note, setNote] = useState("");
  const v = vehicle(report.vehicleId);
  const d = db.people.find((x) => x.id === report.driverId);
  const docs = damageDocs(report);
  return (
    <Dialog
      open
      size="xl"
      split
      onClose={onClose}
      title={`Damage reported, ${reg(report.vehicleId)}`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {!can.manage ? null : report.status === "New" ? (
            <Button variant="primary" onClick={() => setDealing(true)}>
              <CheckCircle size={18} /> Mark as dealt with
            </Button>
          ) : (
            <Button onClick={() => { setDamageDealt(report.id, false); toast("Back to new"); }}>Put back to new</Button>
          )}
        </>
      }
    >
      <div className="grid h-full lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="min-h-0 border-line p-3 max-lg:border-b lg:border-r">
          <DocViewer docs={docs} className="h-full min-h-[20rem] max-lg:h-[22rem]" empty="No photos were sent with this report." />
        </div>
        <div className="grid content-start gap-4 p-4 lg:overflow-y-auto">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={report.status === "New" ? "bad" : "ok"}>{report.status}</Badge>
            <span className="text-muted">
              Reported {dFull(report.at.slice(0, 10))} at {tOf(report.at)}
            </span>
          </p>
          <section aria-label="What happened">
            <h3 className="text-[1.05rem]">{report.where}</h3>
            <p className="mt-1 whitespace-pre-wrap">{report.note}</p>
          </section>
          <dl className="grid gap-2 rounded-lg border border-line px-3 py-2.5">
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted">Vehicle</dt>
              <dd className="font-medium">
                <Link to={`/fleet/vehicles/${report.vehicleId}`} className="text-accent-ink hover:underline">
                  {reg(report.vehicleId)}
                </Link>
                {v && <span className="font-normal text-muted">, {v.make} {v.model}, {base(v.baseId)}</span>}
              </dd>
            </div>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted">Driver</dt>
              <dd className="font-medium">{d?.name ?? "Not known"}</dd>
            </div>
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3">
              <dt className="text-muted">Photos</dt>
              <dd>{docs.length ? `${plural(docs.length, "photo")}. Use the arrows above the picture to flick through them.` : "None"}</dd>
            </div>
          </dl>
          {d?.phone && (
            <a href={`tel:${d.phone.replace(/\s/g, "")}`} className="press inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong font-medium text-accent-ink hover:border-accent">
              <Phone size={18} /> Call {d.name.split(" ")[0]} on {d.phone}
            </a>
          )}
          {report.status === "Dealt with" && (
            <p className="rounded-md bg-ok-soft px-3 py-2 text-ok">
              Dealt with by {report.dealtBy ?? "someone"} on {report.dealtAt ? dNear(report.dealtAt.slice(0, 10), getDay()) : ""}.{report.dealtNote ? ` ${report.dealtNote}` : ""}
            </p>
          )}
          <p className="text-[0.93rem] text-muted">The repair's garage invoice goes under Invoices as usual. This report stays here as the record of what the driver saw.</p>
        </div>
      </div>
      <Dialog
        open={dealing}
        onClose={() => setDealing(false)}
        title="Mark as dealt with?"
        footer={
          <>
            <Button onClick={() => setDealing(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { setDamageDealt(report.id, true, note); setDealing(false); toast(`${reg(report.vehicleId)} damage marked as dealt with`); }}>
              Mark as dealt with
            </Button>
          </>
        }
      >
        <Field label="What was done (optional)" hint="Kept with the report, such as the garage it was booked into.">
          {(id) => <textarea id={id} rows={3} maxLength={500} className="field" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Dialog>
    </Dialog>
  );
}
