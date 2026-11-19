/**
 * Renewals (from the Secure-All build, 18 Nov): one list of every vehicle's motor tax, test and
 * insurance and every driver's driving and Driver CPC, overdue first. Record a renewal with the
 * payment receipt beside the form, tick the new disc on, or put it on the director's own to-do
 * list. ("Give to a manager" was taken out on 18 Nov.)
 */
import { CheckCircle, ListChecks } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useScreenState } from "@/app/screen-state";
import { addTodo, markDiscOn } from "@/data/actions";
import { useDay } from "@/data/store";
import { dFull, plural } from "@/lib/format";
import { discLate, DISC_GRACE_DAYS, type RenewalRow, renewalRows, todoDue, todoLate } from "@/lib/renewals";
import { dueLabel } from "@/lib/status";
import { Badge, Button, cx, Empty, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { toast } from "@/ui/toast";
import { LicenceDialog, RenewDialog } from "./DocForms";
import { useDrivers, useFleetCan, useNames, useRegionWords } from "./shared";

type Show = "look" | "all" | "vehicles" | "drivers";

export function Renewals() {
  const { db, base } = useNames();
  const can = useFleetCan();
  const drivers = useDrivers();
  const words = useRegionWords();
  const day = useDay();
  const [show, setShow] = useScreenState<Show>("renewals.show", "look");
  const [renew, setRenew] = useState<RenewalRow | null>(null);
  const all = renewalRows(db.vehicles, drivers, db.todos, day, words.region);
  const needsLook = (r: RenewalRow) => r.state !== "ok" || r.discWaiting != null || (r.todo && todoLate(r.todo, day));
  const rows = all.filter((r) => (show === "look" ? needsLook(r) : show === "vehicles" ? r.kind === "vehicle" : show === "drivers" ? r.kind === "driver" : true));
  const label = (r: RenewalRow) => (r.item === "tax" ? words.tax.toLowerCase() : r.item === "insurance" ? "insurance" : `the ${r.label}`);
  const toDo = (r: RenewalRow) => {
    addTodo({ title: `Renew ${label(r)} for ${r.vehicle!.reg}`, due: todoDue(r.expiry, day), vehicleId: r.vehicle!.id, item: r.item as "tax" });
    toast("Added to your to-do list on the Dashboard");
  };
  return (
    <>
      <PageHead title="Renewals" note={`${words.tax}, ${words.testWord} and insurance for each vehicle, and each driver's driving licence and Driver CPC, soonest first.`} />
      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { value: "look", label: `Needs a look (${all.filter(needsLook).length})` },
              { value: "all", label: "All" },
              { value: "vehicles", label: "Vehicles" },
              { value: "drivers", label: "Drivers" },
            ]}
          />
        </div>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={show === "look" ? "Nothing needs a look" : "No renewals yet"}>{show === "look" ? "Nothing is overdue or due inside 30 days, and every new disc is on." : "Add vehicles with their dates, and drivers' licences under Drivers."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>For</th>
                  <th>Renewal</th>
                  <th>Runs out</th>
                  <th>Status</th>
                  <th>To do</th>
                  <th className="text-right">Do</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      {r.vehicle ? (
                        <Link to={`/fleet/vehicles/${r.vehicle.id}`} className="font-medium text-accent-ink hover:underline">{r.vehicle.reg}</Link>
                      ) : (
                        <Link to={`/fleet/drivers?driver=${r.driver!.id}`} className="font-medium text-accent-ink hover:underline">{r.driver!.name}</Link>
                      )}
                      <span className="block text-[0.87rem] text-muted">{r.vehicle ? base(r.vehicle.baseId) : `Driver, ${base(r.driver!.baseId)}`}</span>
                    </td>
                    <td>{r.label}</td>
                    <td className="whitespace-nowrap">{dFull(r.expiry)}</td>
                    <td>
                      <Badge tone={r.state === "overdue" ? "bad" : r.state === "soon" ? "warn" : "ok"}>{dueLabel(r.expiry, day)}</Badge>
                      {r.driver?.licences?.[r.item as "cpc"]?.fromPhoneAt && <span className="mt-1 block text-[0.87rem] text-accent-ink">Sent from the phone, to check</span>}
                      {r.discWaiting != null && (
                        <span className={cx("mt-1 block text-[0.87rem]", discLate(r) ? "font-medium text-bad" : "text-warn")}>
                          Renewed. New disc not ticked on ({plural(r.discWaiting, "day")})
                        </span>
                      )}
                    </td>
                    <td>
                      {r.todo ? (
                        <>
                          <span className="block">On your to-do list</span>
                          <span className={cx("text-[0.87rem]", todoLate(r.todo, day) ? "font-medium text-bad" : "text-muted")}>
                            {todoLate(r.todo, day) ? "Was due" : "Due"} {dFull(r.todo.due)}
                          </span>
                        </>
                      ) : (
                        <span className="text-faint">Not on the list</span>
                      )}
                    </td>
                    <td>
                      <div className={cx("flex flex-wrap justify-end gap-1.5", !can.manage && "hidden")}>
                        {r.discWaiting != null && r.vehicle && (
                          <Button size="sm" onClick={() => { markDiscOn(r.vehicle!.id, r.item as "tax"); toast(`${r.vehicle!.reg}: new disc is on`); }}>
                            <CheckCircle size={16} /> Disc is on
                          </Button>
                        )}
                        <Button size="sm" onClick={() => setRenew(r)}>
                          Record renewal
                        </Button>
                        {!r.todo && r.kind === "vehicle" && (
                          <Button size="sm" onClick={() => toDo(r)}>
                            <ListChecks size={16} /> Add to my to-do
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <p className="mt-3 text-[0.93rem] text-muted">After a renewal is recorded, tick "Disc is on" once the new disc is on the windscreen. If it is not ticked within {DISC_GRACE_DAYS} days it shows in red here and on the Dashboard.</p>
      </PageBody>
      {renew?.vehicle && <RenewDialog v={renew.vehicle} item={renew.item as "tax"} onClose={() => setRenew(null)} />}
      {renew?.driver && <LicenceDialog d={renew.driver} which={renew.item as "cpc"} onClose={() => setRenew(null)} />}
    </>
  );
}
