import { useState } from "react";
import { addBankHoliday, addClosure, removeBankHoliday, removeClosure, plannedOn } from "@/data/actions";
import { companyYears, holidayRows } from "@/lib/bank-holidays";
import { useData, useDay } from "@/data/store";
import { dFull, dShort, dWeekday, plural } from "@/lib/format";
import { Badge, Button, Empty, Field, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { toast } from "@/ui/toast";

/**
 * The days the firm treats as bank holidays (Oisin, 17 Nov: built in, and editable in Admin).
 * Every hour worked on one is at double time, nobody is marked a normal day on one, and a week
 * with one in it is not short for it. The public holidays are worked out for last year, this
 * year and next; a day can be added (the firm closing for a local day, say) or taken off.
 */
export function BankHolidays() {
  const db = useData((s) => s.db);
  const day = useDay();
  // This year and next only (Oisin, 19 Nov: "remove past year").
  const years = companyYears(day);
  const [year, setYear] = useState(day.slice(0, 4));
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const list = db.bankHolidays.filter((h) => h.date.startsWith(year));
  const rows = holidayRows(db.bankHolidays, year);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cname, setCname] = useState("");
  const [cerror, setCerror] = useState("");
  const next = db.bankHolidays.find((h) => h.date >= day);
  const worked = (d: string) => db.attendance.filter((a) => a.date === d && a.status === "restday").length;
  return (
    <>
      <PageHead
        title="Company holidays"
        note={`${plural(list.length, "day")} the firm is shut in ${year}${next ? `. The next is ${next.name}, ${dWeekday(next.date)}` : ""}. Nobody is planned or marked a normal day on one, every hour worked on one is at double time, and everyone sees them on their phone.`}
      >
        {years.length > 1 && (
          <div className="mt-3">
            <Segmented label="Year" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
          </div>
        )}
      </PageHead>
      <PageBody className="grid max-w-4xl gap-5">
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={`No company holidays in ${year}`}>Add one below.</Empty>
          ) : (
            <table className="tbl" aria-label={`Company holidays in ${year}`}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Holiday</th>
                  <th>Worked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  r.kind === "day" ? (
                    <tr key={r.date}>
                      <td className={r.date < day ? "whitespace-nowrap text-muted" : "whitespace-nowrap"}>
                        {dWeekday(r.date)} {r.date.slice(0, 4)}
                      </td>
                      <td className="font-medium">
                        {r.name} {r.date === next?.date && <Badge tone="accent">Next</Badge>}
                      </td>
                      <td className="text-muted">{r.date > day ? "" : worked(r.date) > 0 ? `${plural(worked(r.date), "time stamp")} at double time` : "Nobody"}</td>
                      <td className="text-right">
                        <Button
                          size="sm"
                          aria-label={`Take ${r.name}, ${dWeekday(r.date)}, off the list`}
                          onClick={() => {
                            removeBankHoliday(r.date);
                            toast(`${r.name} is no longer a company holiday. Time already recorded is kept`);
                          }}
                        >
                          Take off
                        </Button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.closure + r.from}>
                      <td className="whitespace-nowrap">
                        {dShort(r.from)} to {dFull(r.to)}
                      </td>
                      <td className="font-medium">
                        {r.name} <Badge tone="neutral">Closure, {plural(r.days, "working day")}</Badge>
                      </td>
                      <td className="text-muted" />
                      <td className="text-right">
                        <Button
                          size="sm"
                          aria-label={`Take the closure ${r.name} off the list`}
                          onClick={() => {
                            removeClosure(r.closure);
                            toast(`${r.name} taken off. Those days are working days again`);
                          }}
                        >
                          Take off
                        </Button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </Panel>
        <Section title="Add a company closure">
          <Panel>
            <form
              className="grid gap-3 p-3 sm:grid-cols-[10rem_10rem_minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const out = addClosure(from, to, cname);
                if ("error" in out) return setCerror(out.error);
                toast(`${cname.trim()} added: ${plural(out.days, "working day")} shut${out.off ? `. ${plural(out.off, "planned day")} taken off the plan` : ""}`);
                setYear(from.slice(0, 4));
                setFrom("");
                setTo("");
                setCname("");
                setCerror("");
              }}
            >
              <Field label="First day">{(id) => <input id={id} type="date" className="field" value={from} min={day} onChange={(e) => { setFrom(e.target.value); if (!to || to < e.target.value) setTo(e.target.value); }} />}</Field>
              <Field label="Last day">{(id) => <input id={id} type="date" className="field" value={to} min={from || day} onChange={(e) => setTo(e.target.value)} />}</Field>
              <Field label="Name">{(id) => <input id={id} className="field" value={cname} placeholder="Christmas closedown" onChange={(e) => setCname(e.target.value)} />}</Field>
              <Button type="submit" variant="primary">
                Add closure
              </Button>
              {cerror && (
                <p role="alert" className="text-[0.93rem] text-bad sm:col-span-4">
                  {cerror}
                </p>
              )}
            </form>
          </Panel>
          <p className="mt-2 max-w-[75ch] text-[0.93rem] text-muted">Every working day from the first to the last is a day the firm is shut, for everyone. Anyone planned on one of those days is taken off the plan.</p>
        </Section>
        <Section title="Add a single day">
          <Panel>
            <form
              className="grid gap-3 p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                // Counted before it is added: who is down for a normal day there comes off the plan.
                const off = plannedOn(date);
                const problem = addBankHoliday(date, name);
                if (problem) return setError(problem);
                toast(`${name.trim()} added as a company holiday, ${dWeekday(date)}${off > 0 ? `. ${plural(off, "person was", "people were")} down for a normal day and ${off === 1 ? "has" : "have"} been taken off the plan` : ""}`);
                setYear(date.slice(0, 4));
                setDate("");
                setName("");
                setError("");
              }}
            >
              <Field label="Date">{(id) => <input id={id} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
              <Field label="Name">{(id) => <input id={id} className="field" value={name} placeholder="Firm closed for the county final" onChange={(e) => setName(e.target.value)} />}</Field>
              <Button type="submit">
                Add day
              </Button>
              {error && (
                <p role="alert" className="text-[0.93rem] text-bad sm:col-span-3">
                  {error}
                </p>
              )}
            </form>
          </Panel>
          <p className="mt-2 max-w-[75ch] text-[0.93rem] text-muted">
            The public holidays are worked out for you. Add a day the firm is shut, or take one off if the firm works it as a normal day. Adding one for a day still to come takes whoever was down for it off the plan; work that day is planned with Plan overtime work. Anyone who works it goes in with Overtime time stamp, at double time, and payroll does not count it against a week's 39 hours.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
