import { addDays } from "@/lib/dates";
import type { ServicePlan } from "@/lib/status";
import type { FleetDoc, HiredPlant, PlantItem, Renewal, Vehicle } from "../types";
import { type Rng, at, workdays } from "./util";

type PlantRow = [ref: string, name: string, kind: string, spec: string, site: string | null, basis: "hours" | "months", finance: string];

const PLANT: PlantRow[] = [
  ["MX1", "Belle 150 drum mixer", "Mortar mixer", "150 litre, petrol", "C719", "hours", "Owned outright"],
  ["MX2", "Belle 150 drum mixer", "Mortar mixer", "150 litre, petrol", "C720", "hours", "Owned outright"],
  ["MX3", "Forced action pan mixer", "Mortar mixer", "120 litre, 110 V, for lime mortars", "C722", "months", "Owned outright"],
  ["MX4", "Forced action pan mixer", "Mortar mixer", "120 litre, 110 V, for lime mortars", null, "months", "Owned outright"],
  ["HS1", "Scaffold hoist 200 kg", "Hoist", "200 kg, 25 m lift, 110 V", "C719", "months", "Owned outright"],
  ["HS2", "Scaffold hoist 200 kg", "Hoist", "200 kg, 25 m lift, 110 V", "C721", "months", "Owned outright"],
  ["HS3", "Slate and tile hoist", "Hoist", "150 kg, ladder hoist, petrol", "C721", "hours", "Lease, ends 2028"],
  ["ST1", "Aluminium scaffold tower", "Scaffold tower", "Double width, 8.2 m platform", "C720", "months", "Owned outright"],
  ["ST2", "Aluminium scaffold tower", "Scaffold tower", "Double width, 6.2 m platform", "C723", "months", "Owned outright"],
  ["ST3", "Aluminium scaffold tower", "Scaffold tower", "Single width, 4.2 m platform", null, "months", "Owned outright"],
  ["SW1", "Stone bench saw", "Stone saw", "600 mm blade, water fed, 110 V", null, "months", "Owned outright"],
  ["SW2", "Stone bridge saw", "Stone saw", "350 mm blade, site table", "C722", "months", "Owned outright"],
  ["SC1", "Superheated steam cleaning unit", "Steam cleaner", "150 °C, diesel fired, 30 m hose", "C722", "hours", "Hire purchase, 11 payments left"],
  ["DH1", "Building dryer dehumidifier", "Dehumidifier", "70 litres a day", "C720", "months", "Owned outright"],
  ["DH2", "Building dryer dehumidifier", "Dehumidifier", "70 litres a day", null, "months", "Owned outright"],
  ["DH3", "Building dryer dehumidifier", "Dehumidifier", "50 litres a day", null, "months", "Owned outright"],
  ["GN1", "Diesel generator 6 kVA", "Generator", "6 kVA, silenced, 110 V and 230 V", "C724", "hours", "Owned outright"],
  ["GN2", "Diesel generator 10 kVA", "Generator", "10 kVA, silenced", "C725", "hours", "Owned outright"],
  ["CP1", "Towable compressor", "Compressor", "130 cfm, with two breakers", null, "hours", "Owned outright"],
  ["MD1", "Kubota mini digger 1.8 t", "Mini digger", "1.8 tonne, with three buckets", "C724", "hours", "Hire purchase, 20 payments left"],
  ["TH1", "Telescopic handler 7 m", "Telehandler", "7 m reach, 2.6 tonne", "C721", "hours", "Lease, ends 2027"],
  ["LB1", "Lead burning set", "Leadwork kit", "Oxy-acetylene, with flashback arrestors", "C719", "months", "Owned outright"],
  ["WF1", "Towable welfare unit", "Welfare unit", "Six person, canteen, toilet, drying room", "C724", "months", "Owned outright"],
  ["WF2", "Towable welfare unit", "Welfare unit", "Six person, canteen, toilet, drying room", null, "months", "Owned outright"],
];

// Lifting equipment needs a thorough examination by a competent person. A tower is not lifting
// equipment: it gets a periodic inspection on top of the checks each time it is put up.
const LIFTING = new Set(["Hoist", "Telehandler", "Mini digger"]);

export function seedAssets(r: Rng, today: string, driverIds: string[]) {
  const plant: PlantItem[] = PLANT.map(([assetRef, name, kind, spec, site, basis, finance], i) => {
    const lastServiced = addDays(today, -r.int(20, 170));
    let service: ServicePlan;
    if (basis === "hours") {
      const lastMeter = r.int(8, 60) * 50;
      service = { basis: "hours", intervalHours: 250, lastServiced, lastMeter, meterNow: lastMeter + r.int(40, 235), hoursPerWeek: r.int(12, 30) };
    } else {
      service = { basis: "months", intervalMonths: kind === "Scaffold tower" ? 6 : 12, lastServiced };
    }
    const renewals: Renewal[] = [];
    if (LIFTING.has(kind)) renewals.push({ id: `ren-${assetRef}-te`, kind: "Thorough examination", expires: addDays(today, r.int(40, 330)), doc: `${assetRef} thorough examination.pdf` });
    if (kind === "Scaffold tower") renewals.push({ id: `ren-${assetRef}-te`, kind: "Tower inspection", expires: addDays(today, r.int(40, 330)), doc: `${assetRef} inspection record.pdf` });
    if (spec.includes("110 V") || kind === "Dehumidifier") renewals.push({ id: `ren-${assetRef}-pat`, kind: "Electrical safety test", expires: addDays(today, r.int(35, 300)), doc: `${assetRef} electrical test.pdf` });
    if (["Telehandler", "Mini digger", "Compressor", "Welfare unit", "Steam cleaner"].includes(kind)) renewals.push({ id: `ren-${assetRef}-ins`, kind: "Insurance", expires: addDays(today, r.int(50, 340)), doc: `${assetRef} insurance schedule.pdf` });
    return {
      id: `pl-${assetRef}`,
      assetRef,
      name,
      kind,
      spec,
      status: site ? "On site" : "Available",
      projectId: site ? `pr-${site}` : null,
      finance,
      service,
      serviceHistory: [
        { id: `svc-${assetRef}-2`, date: lastServiced, meter: service.basis === "hours" ? service.lastMeter : undefined, note: i % 3 === 0 ? "Full service: oils, filters, belts checked." : "Routine service and safety check." },
        { id: `svc-${assetRef}-1`, date: addDays(lastServiced, -r.int(150, 330)), meter: service.basis === "hours" ? Math.max(0, service.lastMeter - 250) : undefined, note: "Routine service and safety check." },
      ],
      renewals,
    };
  });

  // A handful of deliberate problems, so the overview has an overdue list to work through.
  const set = (ref: string, kind: string, days: number, doc = true) => {
    const item = plant.find((p) => p.assetRef === ref);
    const ren = item?.renewals.find((x) => x.kind === kind);
    if (ren) {
      ren.expires = addDays(today, days);
      if (!doc) delete ren.doc;
    }
  };
  set("HS2", "Thorough examination", -23, false);
  set("ST3", "Tower inspection", -8);
  set("SC1", "Insurance", -4);
  set("MX3", "Electrical safety test", 6);
  set("TH1", "Thorough examination", 11);
  set("MD1", "Insurance", 19);
  set("DH2", "Electrical safety test", 26);
  const overdueService = plant.find((p) => p.assetRef === "GN1");
  if (overdueService?.service.basis === "hours") overdueService.service.meterNow = overdueService.service.lastMeter + 281;
  const repair = plant.find((p) => p.assetRef === "CP1");
  if (repair) repair.status = "Off for repair";

  const pid = (code: string) => `pr-${code}`;
  const hiredPlant: HiredPlant[] = [
    { id: "hp-1", projectId: pid("C719"), description: "Independent tied scaffold to tower, 28 m", quantity: 1, hireCompany: "Corrib Scaffolding", hirePhone: "091 555 0143", hireRef: "CS-88214", onHireFrom: workdays(today, -43), rate: 620, rateUnit: "week", status: "On hire", notes: "Adaptation at belfry level booked" },
    { id: "hp-2", projectId: pid("C721"), description: "Temporary roof over main mill, 14 x 9 m", quantity: 1, hireCompany: "Corrib Scaffolding", hirePhone: "091 555 0143", hireRef: "CS-88377", onHireFrom: workdays(today, -29), rate: 880, rateUnit: "week", status: "On hire", notes: "" },
    { id: "hp-3", projectId: pid("C722"), description: "Pavement gantry and façade scaffold with netting", quantity: 1, hireCompany: "Midland Access Hire", hirePhone: "090 555 0171", hireRef: "MAH-20531", onHireFrom: workdays(today, -25), rate: 740, rateUnit: "week", status: "On hire", notes: "" },
    { id: "hp-4", projectId: pid("C722"), description: "Heras fence panels", quantity: 24, hireCompany: "Midland Access Hire", hirePhone: "090 555 0171", hireRef: "MAH-20532", onHireFrom: workdays(today, -25), rate: 1.2, rateUnit: "day", status: "On hire", notes: "" },
    { id: "hp-5", projectId: pid("C723"), description: "6 cubic yard skip", quantity: 1, hireCompany: "Leinster Skip and Waste", hirePhone: "01 555 0129", hireRef: "LSW-7741", onHireFrom: workdays(today, -7), rate: 285, rateUnit: "week", status: "Return notified", returnNotifiedAt: at(workdays(today, -1), "15:10"), notes: "Full. Swap not needed, off hire." },
    { id: "hp-6", projectId: pid("C720"), description: "12 m scissor lift, electric", quantity: 1, hireCompany: "Shannonside Plant Hire", hirePhone: "061 555 0188", hireRef: "SPH-41902", onHireFrom: workdays(today, -16), rate: 195, rateUnit: "week", status: "Return notified", returnNotifiedAt: at(today, "08:40"), notes: "Finished in the stair hall" },
    { id: "hp-7", projectId: pid("C724"), description: "Two-way traffic lights with battery packs", quantity: 1, hireCompany: "Shannonside Plant Hire", hirePhone: "061 555 0188", hireRef: "SPH-42077", onHireFrom: workdays(today, -9), rate: 165, rateUnit: "week", status: "On hire", notes: "" },
    { id: "hp-8", projectId: pid("C725"), description: "Acrow props, size 2", quantity: 40, hireCompany: "Shannonside Plant Hire", hirePhone: "061 555 0188", hireRef: "SPH-42110", onHireFrom: workdays(today, -13), rate: 0.9, rateUnit: "day", status: "On hire", notes: "" },
    { id: "hp-9", projectId: pid("C717"), description: "Mortar silo, 12 tonne", quantity: 1, hireCompany: "Midland Access Hire", hirePhone: "090 555 0171", hireRef: "MAH-19866", onHireFrom: workdays(today, -60), rate: 140, rateUnit: "week", status: "Collected", returnNotifiedAt: at(workdays(today, -7), "09:00"), collectedAt: at(workdays(today, -5), "11:30"), notes: "" },
  ];

  type VRow = [reg: string, model: string, kind: Vehicle["kind"], base: string, price: number];
  const VEHICLES: VRow[] = [
    ["231-G-4471", "Ford Transit Custom", "Van", "Galway", 38500],
    ["222-G-10283", "Ford Transit Custom", "Van", "Galway", 36900],
    ["212-D-18834", "Renault Master", "Crew van", "Dublin", 34200],
    ["241-KE-2291", "Volkswagen Crafter", "Crew van", "Kildare", 46800],
    ["201-CE-905", "Toyota Hilux", "Pickup", "Clare", 39900],
    ["232-RN-1147", "Isuzu D-Max", "Pickup", "Roscommon", 41200],
    ["191-G-7730", "Ford Transit tipper", "Tipper", "Galway", 33400],
    ["221-WW-3316", "Iveco Daily tipper", "Tipper", "Wicklow", 44600],
    ["211-W-6052", "Ford Transit Custom", "Van", "Waterford", 31800],
    ["242-G-915", "Mercedes Sprinter", "Crew van", "Galway", 52300],
    ["182-D-40117", "Renault Trafic", "Van", "Dublin", 27500],
    ["202-MO-2284", "Toyota Hilux", "Pickup", "Mayo", 38700],
    ["171-G-3008", "Ford Transit", "Van", "Galway", 26400],
  ];
  const year = Number(today.slice(0, 4));
  const vehicles: Vehicle[] = VEHICLES.map(([reg, model, kind, baseLocation, purchasePrice], i) => {
    const item = (lo: number, hi: number, amount: number) => {
      const expiryDate = addDays(today, r.int(lo, hi));
      return { expiryDate, paidDate: addDays(expiryDate, -365), amount };
    };
    // Bought new: an Irish plate's first two digits give the year, the third the half year.
    const plate = reg.split("-")[0]!;
    const bought = 2000 + Number(plate.slice(0, 2));
    const month = plate[2] === "2" ? r.int(7, 12) : r.int(1, 6);
    const yearsOld = Math.max(1, year - bought);
    const lastMeter = yearsOld * r.int(19000, 26000);
    return {
      id: `v-${i + 1}`,
      reg,
      model,
      kind,
      baseLocation,
      driverId: driverIds[i] ?? null,
      purchasePrice,
      purchaseMonth: `${bought}-${String(month).padStart(2, "0")}`,
      sellPrice: null,
      active: true,
      mileage: lastMeter + r.int(2000, 17000),
      compliance: { tax: item(25, 350, kind === "Tipper" ? 420 : 333), test: item(25, 350, 125), insurance: item(25, 350, r.int(1150, 1900)) },
      service: { basis: "km", intervalKm: 20000, lastServiced: addDays(today, -r.int(20, 200)), lastMeter, meterNow: lastMeter + r.int(2000, 17000), kmPerWeek: r.int(350, 650) },
    };
  });
  // Problems to find. Each was paid for a year, so its paper is dated a year before it runs out.
  const v = (reg: string) => vehicles.find((x) => x.reg === reg)!;
  const due = (reg: string, what: "tax" | "test" | "insurance", days: number) => {
    const c = v(reg).compliance[what];
    c.expiryDate = addDays(today, days);
    c.paidDate = addDays(c.expiryDate, -365);
  };
  due("212-D-18834", "test", -12);
  due("191-G-7730", "tax", -3);
  due("201-CE-905", "insurance", 8);
  due("221-WW-3316", "test", 17);
  due("182-D-40117", "tax", 22);
  // One vehicle already sold, so "Removed" has an entry.
  const sold = v("171-G-3008");
  sold.active = false;
  sold.sellPrice = 4200;
  sold.driverId = null;

  const GARAGES: [string, string][] = [
    ["Oranmore Commercials", "Oranmore, Galway"],
    ["Liffey Valley Fleet Services", "Clondalkin, Dublin"],
    ["Banner Motor Works", "Ennis, Clare"],
    ["Naas Road Van Centre", "Naas, Kildare"],
    ["Suir Valley Motors", "Waterford"],
  ];
  const WORK: [string, number, number][] = [
    ["Full service, oil and filters", 240, 420],
    ["Front brake discs and pads", 310, 560],
    ["Rear brake pads", 140, 260],
    ["Two front tyres", 280, 460],
    ["Clutch replacement", 980, 1650],
    ["Timing belt and water pump", 620, 940],
    ["Tow bar electrics repaired", 120, 240],
    ["Tipper ram seals replaced", 540, 880],
    ["Side door runner and lock", 210, 390],
    ["Battery and alternator", 380, 690],
    ["Windscreen replaced", 260, 420],
    ["DPF cleaned and sensor replaced", 450, 820],
  ];
  const fleetDocs: FleetDoc[] = [];
  let n = 0;
  for (const veh of vehicles) {
    const age = year - Number(veh.purchaseMonth.slice(0, 4));
    const repairs = r.int(3, 5) + Math.floor(age / 2);
    for (let i = 0; i < repairs; i++) {
      const [workDone, lo, hi] = r.pick(WORK);
      if (workDone.startsWith("Tipper") && veh.kind !== "Tipper") continue;
      const [garage, garageLocation] = GARAGES.find((g) => g[1].endsWith(veh.baseLocation)) ?? r.pick(GARAGES);
      // Never before the van was bought.
      const owned = Math.round((Date.parse(today) - Date.parse(`${veh.purchaseMonth}-28`)) / 864e5);
      const date = addDays(today, -r.int(4, Math.max(5, Math.min(veh.active ? 720 : 900, owned))));
      fleetDocs.push({ id: `fd-${++n}`, vehicleId: veh.id, category: "repairs", date, amount: r.int(lo, hi) + r.int(0, 99) / 100, workDone, garage, garageLocation, fileName: `${veh.reg} ${garage} ${date}.pdf` });
    }
    for (const [category, c] of [["tax", veh.compliance.tax], ["test", veh.compliance.test], ["insurance", veh.compliance.insurance]] as const) {
      fleetDocs.push({ id: `fd-${++n}`, vehicleId: veh.id, category, date: c.paidDate, amount: c.amount, expiryDate: c.expiryDate, fileName: `${veh.reg} ${category} ${c.paidDate}.pdf` });
    }
  }
  fleetDocs.sort((a, b) => b.date.localeCompare(a.date));

  return { plant, hiredPlant, vehicles, fleetDocs };
}
