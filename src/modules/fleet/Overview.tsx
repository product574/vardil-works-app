/**
 * Fleet overview, picture A (17 Nov): the period as on the Lovable prototype, filters for base,
 * garage, driver and category, four figures, spend by month, then spend by base, garage and
 * driver, and spend per vehicle. Every figure comes from src/lib/fleet-spend.ts.
 */
import { CheckCircle, Plus, UploadSimple } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDay } from "@/data/store";
import type { RepairCategory } from "@/data/types";
import { MONTHS } from "@/lib/dates";
import { byMonth, chartMonths, filterLines, groupSpend, invoiceCount, invoiceWarnings, type Period, PERIODS, periodStart, spendLines, totalOf } from "@/lib/fleet-spend";
import { dFull, plural } from "@/lib/format";
import { Button, cx, Empty, PageBody, PageHead, Panel, Segmented } from "@/ui";
import { CATEGORIES, UploadInvoiceDialog } from "./Invoices";
import { UploadDocumentButton } from "./DocForms";
import { FilterSelect, useFleetCan, useMoney, useNames } from "./shared";
import { VehicleForm } from "./VehicleForm";

/**
 * What the overview shows until the first invoice is in (Oisin, 17 Nov): three plain steps, with
 * the buttons to do them, instead of a page of zeros. A firm's own records start empty, and
 * this is the first screen its login opens on.
 */
function StartHere({ vehicles, onAddVehicle, onUpload }: { vehicles: number; onAddVehicle: () => void; onUpload: () => void }) {
  const has = vehicles > 0;
  const steps = [
    {
      title: "Add your vehicles",
      done: has,
      note: has ? `${plural(vehicles, "vehicle")} on the fleet so far. Add the rest any time, here or under Vehicles.` : "The registration, the make and model, the base each one works from and its driver. A new base can be typed into the same form.",
      action: (
        <Button variant={has ? "outline" : "primary"} onClick={onAddVehicle}>
          <Plus size={18} /> Add vehicle
        </Button>
      ),
    },
    {
      title: "Upload a garage invoice",
      done: false,
      note: "Pick the file, type the registration and the amount, and confirm. One invoice can cover several vehicles, and a registration that is not on the fleet yet can be added from there.",
      action: (
        <Button variant={has ? "primary" : "outline"} onClick={onUpload}>
          <UploadSimple size={18} /> Upload an invoice
        </Button>
      ),
    },
    {
      title: "See where the money goes",
      done: false,
      note: "This page then shows repair spend by base, by garage, by driver and by vehicle, and flags an invoice entered twice or a repair repeated within 30 days.",
      action: null,
    },
  ];
  return (
    <Panel className="px-5 py-5">
      <h2 className="text-[1.25rem]">Start here</h2>
      <p className="mt-1 max-w-[65ch] text-muted">Nothing is in yet. These are your own records: what you add here is kept, and only your sign-in can see it.</p>
      <ol className="mt-4 grid gap-0 divide-y divide-line">
        {steps.map((st, i) => (
          <li key={st.title} className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4">
            <span className={cx("grid size-8 shrink-0 place-items-center rounded-full text-[0.93rem] font-semibold", st.done ? "bg-ok-soft text-ok" : "bg-accent-soft text-accent-ink")} aria-hidden="true">
              {st.done ? <CheckCircle size={20} weight="fill" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 basis-64">
              <h3 className="text-[1.05rem] font-semibold">
                {st.title}
                {st.done && <span className="sr-only"> (done)</span>}
              </h3>
              <p className="mt-0.5 max-w-[65ch] text-muted">{st.note}</p>
            </div>
            {st.action}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function FleetOverview() {
  const { db, base, garage, driver, site } = useNames();
  const can = useFleetCan();
  const { m0 } = useMoney();
  const day = useDay();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("1y");
  const [baseId, setBaseId] = useState("");
  const [garageId, setGarageId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [category, setCategory] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [showCount, setShowCount] = useState(false);
  const [tab, setTab] = useState<"live" | "removed">("live");

  const all = useMemo(() => spendLines(db.garageInvoices), [db.garageInvoices]);
  const from = periodStart(period, day);
  const f = { baseId: baseId || null, garageId: garageId || null, driverId: driverId || null, siteId: siteId || null, category: (category || null) as RepairCategory | null };
  const lines = useMemo(() => filterLines(all, { ...f, from, to: day }), [all, from, day, baseId, garageId, driverId, siteId, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartLines = useMemo(() => filterLines(all, f), [all, baseId, garageId, driverId, siteId, category]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = totalOf(lines);
  const live = db.vehicles.filter((v) => v.active);
  const removed = db.vehicles.filter((v) => !v.active);
  const perVehicle = groupSpend(lines, (l) => l.vehicleId);
  const top = perVehicle[0];
  const toCheck = db.garageInvoices.filter((i) => i.status === "To check").length;
  const warnings = invoiceWarnings(db.garageInvoices, day);
  const months = byMonth(chartLines, day, chartMonths(period));
  const filtered = !!(baseId || garageId || driverId || siteId || category);
  // Only the drivers and sites that have repairs on record are offered as filters.
  const driverIds = [...new Set(all.map((l) => l.driverId).filter((x): x is string => !!x))];
  const siteIds = [...new Set(all.map((l) => l.siteId).filter((x): x is string => !!x))];
  // Until the first invoice is in there is nothing to chart or filter: the page is "Start here".
  const empty = db.garageInvoices.length === 0;
  const activeVehicles = new Set(lines.map((l) => l.vehicleId)).size;
  const avgBase = live.length || 1;

  const rows = (tab === "live" ? live : removed)
    .map((v) => {
      const ls = lines.filter((l) => l.vehicleId === v.id);
      const last = all.filter((l) => l.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date))[0];
      return { v, spend: totalOf(ls), invoices: invoiceCount(ls), last };
    })
    .filter((r) => !filtered || r.invoices > 0)
    .sort((a, b) => b.spend - a.spend || a.v.reg.localeCompare(b.v.reg));

  return (
    <>
      <PageHead
        title="Repair spend"
        note={empty ? "Garage invoices by vehicle, base, garage, driver and site." : `Garage invoices for ${plural(live.length, "vehicle")} at ${plural(db.bases.length, "base")}, ${dFull(from)} to today.`}
        actions={
          <>
            {!empty && <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.value, label: p.label }))} />}
            {can.manage && <UploadDocumentButton />}
            {can.manage && (
              <Button onClick={() => setUploading(true)}>
                <UploadSimple size={18} /> Upload an invoice
              </Button>
            )}
          </>
        }
      >
        <div className={cx("mt-3 flex-wrap items-center gap-2", empty ? "hidden" : "flex")}>
          <FilterSelect label="Base" all="All bases" value={baseId} onChange={setBaseId} options={db.bases.map((b) => ({ value: b.id, label: b.name }))} />
          <FilterSelect label="Garage" all="All garages" value={garageId} onChange={setGarageId} options={db.garages.map((g) => ({ value: g.id, label: g.name }))} />
          <FilterSelect label="Driver" all="All drivers" value={driverId} onChange={setDriverId} options={driverIds.map((id) => ({ value: id, label: driver(id) })).sort((a, b) => a.label.localeCompare(b.label))} />
          <FilterSelect label="Site" all="All sites" value={siteId} onChange={setSiteId} options={siteIds.map((id) => ({ value: id, label: site(id) })).sort((a, b) => a.label.localeCompare(b.label))} />
          <FilterSelect label="Category" all="All" value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          {filtered && (
            <Button variant="ghost" onClick={() => { setBaseId(""); setGarageId(""); setDriverId(""); setSiteId(""); setCategory(""); }}>
              Clear filters
            </Button>
          )}
        </div>
      </PageHead>
      <PageBody>
        {empty ? (
          <StartHere vehicles={live.length} onAddVehicle={() => can.manage && setAddingVehicle(true)} onUpload={() => can.manage && setUploading(true)} />
        ) : (
          <div className="grid gap-4">
            <Panel className="grid sm:grid-cols-2 xl:grid-cols-4">
              <Figure label="Total repair spend" value={m0(total)} note={plural(invoiceCount(lines), "invoice")} big />
              <Figure label="Average per vehicle" value={m0(total / avgBase)} note={`${plural(live.length, "live vehicle")}${removed.length ? `, ${removed.length} removed` : ""}`} />
              <Figure label="Highest spend vehicle" value={top ? (db.vehicles.find((v) => v.id === top.key)?.reg ?? "") : "None"} note={top ? m0(top.total) : "No repairs in this period"} to={top ? `/fleet/vehicles?vehicle=${top.key}` : undefined} />
              <Figure label="Needs a look" value={plural(toCheck, "to check", "to check")} note={warnings.length ? `${plural(warnings.length, "warning")}: ${warnings.filter((w) => w.kind === "duplicate").length} duplicate, ${warnings.filter((w) => w.kind === "repeat").length} repeat repair` : "No warnings"} to="/fleet/invoices" tone={toCheck || warnings.length ? "warn" : undefined} />
            </Panel>

            <Panel className="px-4 pt-3 pb-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-[1.15rem]">Spend over time</h2>
                  <p className="text-[0.93rem] text-muted">Monthly repair spend{filtered ? " for the filters above" : " across the whole fleet"}, last {months.length} months</p>
                </div>
                <label className="flex items-center gap-2 text-[0.93rem]">
                  <input type="checkbox" checked={showCount} onChange={(e) => setShowCount(e.target.checked)} className="size-4 accent-[var(--accent)]" /> Show number of vehicles
                </label>
              </div>
              <MonthChart months={months} showCount={showCount} money={m0} activeVehicles={activeVehicles} />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <BarList title="By base" note="Where the vehicle was based on the day of the repair" rows={groupSpend(lines, (l) => l.baseId).map((r) => ({ id: r.key ?? "", label: base(r.key), total: r.total, sub: plural(r.vehicles, "vehicle") }))} total={total} money={m0} onPick={(id) => setBaseId(id)} />
              <BarList title="By garage" note="Who is doing the work and what they charge" rows={groupSpend(lines, (l) => l.garageId).map((r) => ({ id: r.key ?? "", label: garage(r.key), total: r.total, sub: `${plural(r.invoices, "invoice")}, average ${m0(r.total / Math.max(1, r.invoices))}` }))} total={total} money={m0} onPick={(id) => setGarageId(id)} />
              <BarList title="By driver" note="Who drives the vehicle" rows={groupSpend(lines, (l) => l.driverId).map((r) => ({ id: r.key ?? "", label: r.key ? driver(r.key) : "Pool vehicles, no driver", total: r.total, sub: plural(r.vehicles, "vehicle") }))} total={total} money={m0} onPick={(id) => id && setDriverId(id)} />
              <BarList title="By site" note="The site the driver was on that day, from the timesheet" rows={groupSpend(lines, (l) => l.siteId).map((r) => ({ id: r.key ?? "", label: r.key ? site(r.key) : "Not on a site that day", total: r.total, sub: plural(r.vehicles, "vehicle") }))} total={total} money={m0} onPick={(id) => id && setSiteId(id)} />
            </div>

            <Panel>
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-2">
                <div>
                  <h2 className="text-[1.15rem]">Spend per vehicle</h2>
                  <p className="text-[0.93rem] text-muted">Select a vehicle to see its full repair history</p>
                </div>
                <Segmented label="Vehicles" value={tab} onChange={setTab} options={[{ value: "live", label: `Live vehicles (${live.length})` }, { value: "removed", label: `Removed (${removed.length})` }]} />
              </div>
              {rows.length === 0 ? (
                <Empty title={tab === "live" ? "No repairs match" : "No vehicles removed"}>{tab === "live" ? "No vehicle had a repair in this period with these filters." : "Vehicles taken off the fleet are listed here with their history."}</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Reg</th>
                        <th>Make and model</th>
                        <th>Base</th>
                        <th>Driver</th>
                        <th>Bought</th>
                        <th className="num">Invoices</th>
                        <th>Last repair</th>
                        <th className="num">Repair spend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ v, spend, invoices, last }) => (
                        <tr key={v.id} className="rowlink cursor-pointer" onClick={() => navigate(`/fleet/vehicles/${v.id}`)}>
                          <td className="font-medium whitespace-nowrap">
                            <Link to={`/fleet/vehicles/${v.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                              {v.reg}
                            </Link>
                          </td>
                          <td>{v.make} {v.model}</td>
                          <td>{base(v.baseId)}</td>
                          <td className="text-muted">{v.driverId ? driver(v.driverId) : "Pool vehicle"}</td>
                          <td className="whitespace-nowrap text-muted">{v.purchaseMonth ? `${MONTHS[Number(v.purchaseMonth.slice(5, 7)) - 1]?.slice(0, 3)} ${v.purchaseMonth.slice(0, 4)}` : "-"}</td>
                          <td className="num">{invoices}</td>
                          <td className="whitespace-nowrap text-muted">{last ? dFull(last.date) : "-"}</td>
                          <td className="num font-medium">{m0(spend)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        )}
      </PageBody>
      {uploading && <UploadInvoiceDialog onClose={() => setUploading(false)} />}
      {addingVehicle && <VehicleForm onClose={() => setAddingVehicle(false)} />}
    </>
  );
}

function Figure({ label, value, note, big, to, tone }: { label: string; value: string; note?: string; big?: boolean; to?: string; tone?: "warn" }) {
  const body = (
    <>
      <p className="text-[0.93rem] text-muted">{label}</p>
      <p className={cx("font-display leading-tight font-semibold", big ? "text-[2rem]" : "text-[1.5rem]", tone === "warn" && "text-warn")}>{value}</p>
      {note && <p className="text-[0.87rem] text-muted">{note}</p>}
    </>
  );
  const cls = "block border-line px-4 py-3 max-sm:border-b sm:[&:not(:last-child)]:border-r";
  return to ? (
    <Link to={to} className={cx(cls, "hover:bg-accent-soft/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** One bar per month, a single series in the accent colour, with the figure on hover or focus. */
function MonthChart({ months, showCount, money, activeVehicles }: { months: { month: string; total: number; vehicles: number }[]; showCount: boolean; money: (n: number) => string; activeVehicles: number }) {
  const max = niceMax(Math.max(...months.map((m) => m.total), 1));
  const [hover, setHover] = useState<number | null>(null);
  const label = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]?.slice(0, 3)} ${key.slice(2, 4)}`;
  if (months.every((m) => m.total === 0)) return <p className="py-10 text-center text-muted">No repairs in these months{activeVehicles ? "" : " for these filters"}.</p>;
  return (
    <div className="mt-3" role="img" aria-label={`Monthly repair spend: ${months.map((m) => `${label(m.month)} ${money(m.total)}`).join(", ")}`}>
      <div className="relative ml-12 flex h-44 items-end gap-1 border-b border-line">
        {[1, 0.5].map((f) => (
          <span key={f} aria-hidden className="pointer-events-none absolute right-0 -left-12 border-t border-dashed border-line" style={{ bottom: `${f * 100}%` }}>
            <span className="absolute -top-2.5 left-0 text-[0.8125rem] text-muted">{money(max * f)}</span>
          </span>
        ))}
        <span aria-hidden className="pointer-events-none absolute -bottom-2 -left-12 text-[0.8125rem] text-muted">{money(0)}</span>
        {months.map((m, i) => (
          <button
            key={m.month}
            type="button"
            aria-label={`${label(m.month)}: ${money(m.total)}, ${plural(m.vehicles, "vehicle")}`}
            className="group relative flex h-full flex-1 items-end justify-center outline-none"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className={cx("w-[62%] max-w-10 rounded-t-[4px] bg-accent transition-opacity", hover !== null && hover !== i && "opacity-55")} style={{ height: `${Math.max(m.total > 0 ? 2 : 0, (m.total / max) * 100)}%` }} />
            {hover === i && (
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md border border-line bg-surface px-2 py-1 text-left text-[0.87rem] whitespace-nowrap shadow-pop">
                <span className="block font-medium">{label(m.month)}</span>
                <span className="block">{money(m.total)}</span>
                <span className="block text-muted">{plural(m.vehicles, "vehicle")}</span>
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 ml-12 flex gap-1">
        {months.map((m) => (
          <span key={m.month} className="flex-1 text-center text-[0.8125rem] text-muted">
            {label(m.month)}
            {showCount && <span className="block font-medium text-ink">{m.vehicles}</span>}
          </span>
        ))}
      </div>
      {showCount && <p className="mt-1 text-[0.87rem] text-muted">The figure under each month is how many vehicles had a repair that month.</p>}
    </div>
  );
}

/** A round figure at or above the tallest bar, for the top of the scale: 13,738 becomes 15,000. */
function niceMax(n: number) {
  const pow = 10 ** Math.floor(Math.log10(n));
  const lead = n / pow;
  return (lead <= 1 ? 1 : lead <= 2 ? 2 : lead <= 2.5 ? 2.5 : lead <= 5 ? 5 : lead <= 7.5 ? 7.5 : 10) * pow;
}

function BarList({ title, note, rows, total, money, onPick }: { title: string; note: string; rows: { id: string; label: string; total: number; sub: string }[]; total: number; money: (n: number) => string; onPick: (id: string) => void }) {
  const top = rows[0]?.total || 1;
  return (
    <Panel className="pb-2">
      <div className="px-4 pt-3 pb-1">
        <h2 className="text-[1.15rem]">{title}</h2>
        <p className="text-[0.93rem] text-muted">{note}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-muted">Nothing in this period.</p>
      ) : (
        <ul>
          {rows.slice(0, 8).map((r) => (
            <li key={r.id || "none"}>
              <button type="button" onClick={() => onPick(r.id)} className="block w-full px-4 py-1.5 text-left hover:bg-accent-soft/40" title={`Filter by ${r.label}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="shrink-0 font-medium">
                    {money(r.total)} <span className="font-normal text-muted">({Math.round((r.total / (total || 1)) * 100)}%)</span>
                  </span>
                </span>
                <span className="mt-1 block h-2.5 overflow-hidden rounded-full bg-side">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.total / top) * 100}%` }} />
                </span>
                <span className="mt-0.5 block text-[0.8125rem] text-muted">{r.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
