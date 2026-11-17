import { useState } from "react";
import { addBankHoliday, removeBankHoliday } from "@/data/actions";
import { useData, useDay } from "@/data/store";
import { dWeekday, plural } from "@/lib/format";
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
  const years = [...new Set(db.bankHolidays.map((h) => h.date.slice(0, 4)))].sort();
  const [year, setYear] = useState(day.slice(0, 4));
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const list = db.bankHolidays.filter((h) => h.date.startsWith(year));
  const next = db.bankHolidays.find((h) => h.date >= day);
  const worked = (d: string) => db.attendance.filter((a) => a.date === d && a.status === "restday").length;
  return (
    <>
      <PageHead
        title="Bank holidays"
        note={`${plural(list.length, "bank holiday")} in ${year}${next ? `. The next is ${next.name}, ${dWeekday(next.date)}` : ""}. Every hour worked on a bank holiday is at double time, and nobody is marked a normal day on one.`}
      >
        {years.length > 1 && (
          <div className="mt-3">
            <Segmented label="Year" value={year} onChange={setYear} options={years.map((y) => ({ value: y, label: y }))} />
          </div>
        )}
      </PageHead>
      <PageBody className="grid max-w-4xl gap-5">
        <Panel className="overflow-x-auto">
          {list.length === 0 ? (
            <Empty title={`No bank holidays in ${year}`}>Add one below.</Empty>
          ) : (
            <table className="tbl" aria-label={`Bank holidays in ${year}`}>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Bank holiday</th>
                  <th>Worked</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((h) => (
                  <tr key={h.date}>
                    <td className={h.date < day ? "whitespace-nowrap text-muted" : "whitespace-nowrap"}>
                      {dWeekday(h.date)} {h.date.slice(0, 4)}
                    </td>
                    <td className="font-medium">
                      {h.name} {h.date === next?.date && <Badge tone="accent">Next</Badge>}
                    </td>
                    <td className="text-muted">{h.date > day ? "" : worked(h.date) > 0 ? `${plural(worked(h.date), "time stamp")} at double time` : "Nobody"}</td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        aria-label={`Take ${h.name}, ${dWeekday(h.date)}, off the list`}
                        onClick={() => {
                          removeBankHoliday(h.date);
                          toast(`${h.name} is no longer a bank holiday here. Time already recorded is kept`);
                        }}
                      >
                        Take off
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Section title="Add a bank holiday">
          <Panel>
            <form
              className="grid gap-3 p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const problem = addBankHoliday(date, name);
                if (problem) return setError(problem);
                toast(`${name.trim()} added as a bank holiday, ${dWeekday(date)}`);
                setYear(date.slice(0, 4));
                setDate("");
                setName("");
                setError("");
              }}
            >
              <Field label="Date">{(id) => <input id={id} type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
              <Field label="Name">{(id) => <input id={id} className="field" value={name} placeholder="Firm closed for the county final" onChange={(e) => setName(e.target.value)} />}</Field>
              <Button type="submit" variant="primary">
                Add bank holiday
              </Button>
              {error && (
                <p role="alert" className="text-[0.93rem] text-bad sm:col-span-3">
                  {error}
                </p>
              )}
            </form>
          </Panel>
          <p className="mt-2 max-w-[75ch] text-[0.93rem] text-muted">
            The public holidays are worked out for you. Add a day the firm treats as one, or take one off if the firm works it as a normal day. On the Timesheet a bank holiday shows in its column, and anyone who works it goes in with Weekend time stamp, at double
            time. Payroll does not count a bank holiday against a week's 39 hours.
          </p>
        </Section>
      </PageBody>
    </>
  );
}
