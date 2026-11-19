/**
 * Renewals in one list (from the Secure-All build, 18 Nov): each vehicle's motor tax, test (CVRT,
 * or MOT in the UK) and insurance, and each driver's driving licence and Driver CPC, with whether
 * the new disc is on the vehicle yet and whether the renewal is on the to-do list. Pure: no React,
 * no store.
 */
import type { Driver, Todo, Vehicle } from "@/data/types";
import { addDays } from "./dates";
import { REGION } from "./money";
import { testName } from "./fleet-spend";
import { daysBetween, dueState } from "./status";

/** Days after a renewal is recorded before a disc that is still not on is flagged. */
export const DISC_GRACE_DAYS = 7;

export type RenewalRow = {
  key: string;
  kind: "vehicle" | "driver";
  vehicle?: Vehicle;
  driver?: Driver;
  item: "tax" | "test" | "insurance" | "driving" | "cpc";
  label: string;
  expiry: string;
  state: "overdue" | "soon" | "ok";
  days: number;
  /** Renewed, waiting for the disc to go on: how many days since. */
  discWaiting?: number;
  todo?: Todo;
};

const LABEL = { insurance: "Insurance", driving: "Driving licence", cpc: "Driver CPC" } as const;

export function renewalRows(vehicles: Vehicle[], drivers: Driver[], todos: Todo[], today: string, region: "IE" | "UK" = "IE"): RenewalRow[] {
  const open = todos.filter((t) => !t.doneAt);
  const rows: RenewalRow[] = [];
  for (const v of vehicles.filter((x) => x.active)) {
    for (const item of ["tax", "test", "insurance"] as const) {
      const c = v.compliance[item];
      if (!c.expiryDate) continue;
      rows.push({
        key: `${v.id}-${item}`,
        kind: "vehicle",
        vehicle: v,
        item,
        label: item === "test" ? testName(v.kind, region) : item === "tax" ? REGION[region].roadTax : LABEL[item],
        expiry: c.expiryDate,
        state: dueState(c.expiryDate, today),
        days: daysBetween(today, c.expiryDate),
        ...(c.discPending ? { discWaiting: Math.max(0, daysBetween(c.paidDate, today)) } : {}),
        todo: open.find((t) => t.vehicleId === v.id && t.item === item),
      });
    }
  }
  for (const d of drivers.filter((x) => x.active)) {
    for (const item of ["driving", "cpc"] as const) {
      const l = d.licences?.[item];
      if (!l?.expiryDate) continue;
      rows.push({ key: `${d.id}-${item}`, kind: "driver", driver: d, item, label: LABEL[item], expiry: l.expiryDate, state: dueState(l.expiryDate, today), days: daysBetween(today, l.expiryDate) });
    }
  }
  return rows.sort((a, b) => a.expiry.localeCompare(b.expiry));
}

/** Renewed, but the disc has not been ticked on after the grace days. */
export const discLate = (r: Pick<RenewalRow, "discWaiting">) => r.discWaiting != null && r.discWaiting > DISC_GRACE_DAYS;

/** When a renewal put on the to-do list should be done by: a week before it runs out, or in three days if that has passed. */
export function todoDue(expiry: string, today: string): string {
  const d = addDays(expiry, -7);
  return d > today ? d : addDays(today, 3);
}

/** An open to-do is late once its due day has passed. */
export const todoLate = (t: Pick<Todo, "due" | "doneAt">, today: string) => !t.doneAt && t.due < today;
