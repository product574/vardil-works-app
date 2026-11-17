/**
 * The driver's daily walkaround check for a lorry, tractor unit or trailer, done on the site
 * phone before driving (Oisin, 17 Nov). Each item is OK or a defect; a defect needs a note, and
 * the vehicle should not be driven until the yard has seen it.
 *
 * Pure: no React, no store.
 */
export const DRIVING_CHECK: { title: string; items: string[] }[] = [
  {
    title: "Cab and driver safety",
    items: ["Mirrors, windscreen, wipers and washers", "Seat, seatbelt, controls, horn and visibility", "Dashboard gauges, warning lights, tachograph and speed limiter", "Air pressure and audible air leaks"],
  },
  {
    title: "Vehicle walkaround",
    items: ["All lights, indicators, reflectors and number plates", "Tyres, wheels, wheel nuts, steering and brakes", "Engine oil, coolant, fuel, exhaust and fluid leaks", "Bodywork, guards, steps, safety decals and extinguisher"],
  },
  {
    title: "Trailer and load safety",
    items: ["Air and electrical connections, fifth wheel, coupling, locking pins and landing legs", "Trailer brakes, suspension, load security, weight distribution and restraints"],
  },
];

export const CHECK_ITEMS = DRIVING_CHECK.flatMap((s) => s.items);

export type CheckAnswer = { ok: boolean; note?: string };

/** Every item answered, and every defect described. */
export function checkReady(answers: Record<string, CheckAnswer>) {
  return CHECK_ITEMS.every((i) => answers[i] && (answers[i]!.ok || !!answers[i]!.note?.trim()));
}

export const checkedCount = (answers: Record<string, CheckAnswer>) => CHECK_ITEMS.filter((i) => answers[i]).length;
