/**
 * Compliance (18 Nov): every expiry in one place, after the HVAC compliance demo (layouts and
 * features only). Everything due is one list, soonest first, with the figures across the top as
 * filters (his pick). Then a screen per area: Personnel (a matrix or a list), Training courses,
 * Fleet, Machinery (with the scaffold registers), Company papers and Subcontractors.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addCert, addCourse, bookOnCourse, markCourseDone, recordSubWorker, unbookFromCourse } from "@/data/actions";
import type { Course, Person, SubPaperKind } from "@/data/types";
import { AREAS, type Area, blocksText, bookingFor, type ComplianceRow, courseStage, countRows, latestPaper, planBlocks, renewedTo, scaffoldDue, standing, stateOf, subFlags, ticketBlocks, ticketMatrix } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { dFull, dShort, dWeekday, plural } from "@/lib/format";
import { money0 } from "@/lib/money";
import { usePrefs } from "@/data/store";
import { nextWorkWeek } from "@/lib/week";
import { Badge, Button, cx, Dialog, Empty, Field, NumInput, PageBody, PageHead, Panel, Section, Segmented } from "@/ui";
import { ProofField, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";
import { actionLabel, Figures, InspectForm, LINK, permFor, ProofCell, RenewDialog, RowTable, StateBadge, stateLabel, useCompliance } from "./shared";

const needsAttention = (r: ComplianceRow) => r.state !== "ok" || r.proofNeeded || !!r.sent;

// ── Everything due ────────────────────────────────────────────────────────────

export function EverythingDue() {
  const { rows, day, access, firmWide } = useCompliance();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const [picking, setPicking] = useState(false);
  const [text, setText] = useState("");
  const area = (params.get("area") ?? "") as Area | "";
  const figure = params.get("show") ?? "";
  const all = params.get("all") === "1";
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const c = countRows(rows);
  const areas = AREAS.filter((a) => firmWide || a.key === "personnel" || a.key === "machinery" || a.key === "subcontractors");
  const byFigure = (r: ComplianceRow) => (figure === "expired" ? r.state === "expired" || r.state === "missing" : figure === "due" ? r.state === "due" : figure === "proof" ? r.proofNeeded || !!r.sent : figure === "blocks" ? r.blocks : figure === "ok" ? r.state === "ok" : true);
  const q = text.trim().toLowerCase();
  const shown = rows.filter((r) => (!area || r.area === area) && byFigure(r) && (figure || all || needsAttention(r)) && (!q || `${r.who} ${r.whoSub} ${r.item}`.toLowerCase().includes(q)));
  const editable = rows.filter((r) => access.may(permFor(r)));

  return (
    <>
      <PageHead
        title="Compliance"
        note={`Everything that runs out, soonest first: training tickets, ${firmWide ? "vans and licences, " : ""}machinery and scaffolds${firmWide ? ", the firm's own papers" : ""} and subcontractors. ${c.blocks > 0 ? `${plural(c.blocks, "thing")} out of date stop${c.blocks === 1 ? "s" : ""} work today.` : "Nothing out of date stops work today."}${firmWide ? "" : " You see the people, machinery and subcontractors on your own sites."}`}
        actions={
          editable.length > 0 && (
            <Button variant="primary" onClick={() => setPicking(true)}>
              Record a renewal
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-[88rem] gap-4">
        <Figures
          value={figure}
          onPick={(k) => set("show", k)}
          items={[
            { key: "expired", label: "Run out or missing", n: c.expired, note: "Past the date, or never sent", tone: "bad" },
            { key: "blocks", label: "Stopping work", n: c.blocks, note: "People, vans, machines, scaffolds", tone: "bad" },
            { key: "due", label: "Due in 30 days", n: c.due, note: "Book or renew now", tone: "warn" },
            { key: "proof", label: "Proof needed", n: c.proof, note: "Renewed, copy still to come" },
            { key: "ok", label: "In date", n: c.ok, note: "More than 30 days left" },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Area" value={area || "all"} onChange={(v) => set("area", v === "all" ? "" : v)} options={[{ value: "all", label: "All" }, ...areas.map((a) => ({ value: a.key, label: a.label }))]} />
          {!figure && <Segmented label="Rows shown" value={all ? "all" : "attention"} onChange={(v) => set("all", v === "all" ? "1" : "")} options={[{ value: "attention", label: "Needs attention", count: rows.filter((r) => (!area || r.area === area) && needsAttention(r)).length }, { value: "all", label: "Everything", count: rows.filter((r) => !area || r.area === area).length }]} />}
          <input type="search" aria-label="Search compliance" placeholder="Name, number, ticket or paper" className="field h-9 w-64 max-w-full" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Panel>
          <RowTable rows={shown} onRow={setOpen} label="Everything due" showArea={!area} empty={<Empty title={q ? `Nothing matches "${text.trim()}"` : "Nothing here"}>{figure ? "Press the figure again to see the rest." : "Everything in this area is in date for more than 30 days."}</Empty>} />
        </Panel>
        <p className="text-[0.93rem] text-muted">A ticket, paper or check is good through the day it runs out. Someone whose {`Safe Pass or trade ticket`} has run out cannot be planned or marked on site, and a machine whose examination, test, inspection or insurance has run out cannot go to a site.</p>
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
      {picking && (
        <PickRow
          rows={editable}
          onPick={(r) => {
            setPicking(false);
            setOpen(r);
          }}
          onClose={() => setPicking(false)}
          day={day}
        />
      )}
    </>
  );
}

/** "Record a renewal": choose what was renewed, then the usual form. */
function PickRow({ rows, onPick, onClose, day }: { rows: ComplianceRow[]; onPick: (r: ComplianceRow) => void; onClose: () => void; day: string }) {
  const [key, setKey] = useState("");
  const pick = rows.find((r) => r.key === key);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record a renewal"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!pick} onClick={() => pick && onPick(pick)}>
            Next
          </Button>
        </>
      }
    >
      <Field label="What was renewed" hint="Soonest first, by area.">
        {(id) => (
          <select id={id} className="field" value={key} onChange={(e) => setKey(e.target.value)}>
            <option value="">Choose one</option>
            {AREAS.map((a) => {
              const mine = rows.filter((r) => r.area === a.key);
              return mine.length ? (
                <optgroup key={a.key} label={a.label}>
                  {mine.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.who}: {r.item} ({stateLabel(r, day).toLowerCase()})
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        )}
      </Field>
    </Dialog>
  );
}

// ── Personnel ─────────────────────────────────────────────────────────────────

const CELL: Record<string, string> = { expired: "bg-bad-soft font-medium text-bad", missing: "bg-bad-soft font-medium text-bad", due: "bg-warn-soft font-medium text-warn", ok: "", none: "text-faint" };

export function Personnel() {
  const { db, day, rows, access, siteIds } = useCompliance();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const [booking, setBooking] = useState(false);
  const [recording, setRecording] = useState(false);
  const view = params.get("view") === "list" ? "list" : "matrix";
  const only = params.get("person");
  const canEdit = access.may("manageStaff");
  const mine = rows.filter((r) => r.area === "personnel");
  const peopleIds = new Set(mine.map((r) => (r.ref.kind === "cert" ? r.ref.personId : "")));
  const people = db.people.filter((p) => p.active && (siteIds === null || peopleIds.has(p.id)) && (!only || p.id === only));
  const matrix = ticketMatrix(people, day);
  const bad = (cells: { state: string }[]) => cells.some((c) => c.state === "expired" || c.state === "missing");
  const rank = (cells: { state: string }[]) => (bad(cells) ? 0 : cells.some((c) => c.state === "due") ? 1 : 2);
  const sorted = [...matrix.rows].sort((a, b) => rank(a.cells) - rank(b.cells) || Number(b.person.kind === "Operative" || b.person.isSiteManager) - Number(a.person.kind === "Operative" || a.person.isSiteManager) || a.person.name.localeCompare(b.person.name));
  const rowFor = (personId: string, name: string) => mine.find((r) => r.ref.kind === "cert" && r.ref.personId === personId && r.item === name);
  // Who is planned between today and the end of next week but may not work.
  const horizon = nextWorkWeek(day)[4]!;
  const blocked = [...planBlocks(db.people, db.plan.filter((e) => e.date >= day && e.date <= horizon && (siteIds === null || siteIds.has(e.projectId)))).entries()].map(([k, b]) => ({ personId: k.split("|")[0]!, date: k.split("|")[1]!, b }));
  const blockedPeople = [...new Set(blocked.map((x) => x.personId))].map((id) => {
    const days = blocked.filter((x) => x.personId === id).map((x) => x.date).sort();
    return { p: db.people.find((x) => x.id === id)!, from: days[0]!, b: blocked.find((x) => x.personId === id)!.b };
  });
  const sent = mine.filter((r) => r.sent);
  const listRows = mine.filter((r) => !only || (r.ref.kind === "cert" && r.ref.personId === only));
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const c = countRows(mine);

  return (
    <>
      <PageHead
        title="Personnel training"
        note={`${plural(mine.length, "ticket")} on file for ${plural(people.length, "person", "people")}. ${c.expired} run out or missing, ${c.due} due inside 30 days${c.proof > 0 ? `, ${c.proof} waiting on proof` : ""}. Nobody works on site with a Safe Pass or trade ticket out of date.`}
        actions={
          <>
            <Segmented label="Show as" value={view} onChange={(v) => set("view", v === "list" ? "list" : "")} options={[{ value: "matrix", label: "Matrix" }, { value: "list", label: "List" }]} />
            {canEdit && <Button onClick={() => setRecording(true)}>Record a new ticket</Button>}
            {canEdit && (
              <Button variant="primary" onClick={() => setBooking(true)}>
                Book on a course
              </Button>
            )}
          </>
        }
      />
      <PageBody className="grid max-w-[96rem] gap-4">
        {blockedPeople.length > 0 && (
          <div className="rounded-md bg-bad-soft px-3 py-2.5 text-bad" role="status">
            <p className="font-medium">{plural(blockedPeople.length, "person", "people")} planned who cannot work until a ticket is renewed</p>
            <ul className="mt-1">
              {blockedPeople.map(({ p, from, b }) => {
                const course = bookingFor(db.courses, p.id, b[0]!.ticket);
                return (
                  <li key={p.id}>
                    <button type="button" className="font-medium underline underline-offset-2" onClick={() => set("person", p.id)}>
                      {p.name}
                    </button>
                    : {blocksText(b, day)}. Planned from {from === day ? "today" : dWeekday(from)}. {course ? `Booked on the course on ${dWeekday(course.date)}.` : "Not booked on a course yet."}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {only && (
          <p className="flex items-center gap-2">
            Showing {db.people.find((p) => p.id === only)?.name}.{" "}
            <Button size="sm" variant="ghost" onClick={() => set("person", "")}>
              Show everyone
            </Button>
            <Link to={`/people?person=${only}`} className={LINK}>
              Their employee record
            </Link>
          </p>
        )}
        {sent.length > 0 && (
          <Section title="Cards sent from the site phone">
            <Panel>
              <RowTable rows={sent} onRow={setOpen} label="Cards sent from the site phone" empty={null} />
            </Panel>
          </Section>
        )}
        {view === "matrix" ? (
          <Panel className="overflow-x-auto">
            <table className="tbl" aria-label="Training matrix">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[13rem] bg-surface">Name</th>
                  {matrix.columns.map((n) => (
                    <th key={n} className="min-w-[7.5rem] align-bottom! whitespace-normal">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ person, cells }) => (
                  <tr key={person.id}>
                    <td className="sticky left-0 z-10 bg-surface">
                      <button type="button" className={cx("text-left font-medium", LINK)} onClick={() => set("person", person.id)}>
                        {person.name}
                      </button>
                      <span className="block text-[0.87rem] text-muted">{person.trade}</span>
                    </td>
                    {cells.map((cell) => {
                      const r = rowFor(person.id, cell.name);
                      const words = cell.state === "none" ? "-" : cell.state === "missing" ? "Needed" : cell.state === "ok" ? dShort(cell.cert!.expires).replace(/^\d+ /, "") + " " + cell.cert!.expires.slice(0, 4) : dShort(cell.cert!.expires);
                      const label = `${person.name}, ${cell.name}: ${cell.state === "none" ? "not held" : cell.state === "missing" ? "needed, not on file" : `${stateLabel({ due: cell.cert!.expires, state: cell.state, item: cell.name }, day).toLowerCase()}, ${dFull(cell.cert!.expires)}`}`;
                      return (
                        <td key={cell.name} className="align-middle!">
                          {r && canEdit && cell.state !== "none" ? (
                            <button type="button" aria-label={label} title={label} onClick={() => setOpen(r)} className={cx("press block h-8 w-full rounded-md px-2 text-left text-[0.93rem] whitespace-nowrap hover:ring-1 hover:ring-accent", CELL[cell.state], cell.cert?.proofNeeded && "underline decoration-dotted")}>
                              {words}
                            </button>
                          ) : (
                            <span aria-label={label} className={cx("block rounded-md px-2 py-1 text-[0.93rem] whitespace-nowrap", CELL[cell.state])}>
                              {words}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : (
          <Panel>
            <RowTable rows={listRows} onRow={setOpen} label="Training tickets" empty={<Empty title="No tickets here" />} />
          </Panel>
        )}
        <p className="text-[0.93rem] text-muted">
          Red: run out, or needed by their trade and not on file. Amber: runs out inside 30 days. A dotted underline: renewed, copy still to come. {canEdit ? "Click a ticket to renew it, or to book a course for it." : ""} Proof is a photo or PDF of the card, kept against the ticket for audits.
        </p>
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
      {booking && <BookDialog onClose={() => setBooking(false)} />}
      {recording && <NewTicketDialog personId={only ?? undefined} onClose={() => setRecording(false)} />}
    </>
  );
}

/** A ticket someone did not have before: a new trade ticket, first aid, and so on. */
function NewTicketDialog({ personId, onClose }: { personId?: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const people = db.people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const [pid, setPid] = useState(personId ?? people[0]?.id ?? "");
  const [name, setName] = useState(TICKET_NAMES[0]!);
  const [expires, setExpires] = useState(renewedTo(TICKET_NAMES[0]!, day));
  const { proof, error, pick } = useProofPick();
  const held = db.people.find((p) => p.id === pid)?.certs.some((c) => c.name === name);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record a new ticket"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!pid || expires <= day || held}
            onClick={() => {
              addCert(pid, name, expires, proof);
              toast(`${name} recorded for ${people.find((p) => p.id === pid)?.name}${proof ? ", proof attached" : ". Marked as waiting on proof"}`);
              onClose();
            }}
          >
            Record ticket
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Person">
          {(id) => (
            <select id={id} className="field" value={pid} onChange={(e) => setPid(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.trade}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Ticket">
          {(id) => (
            <select
              id={id}
              className="field"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setExpires(renewedTo(e.target.value, day));
              }}
            >
              {TICKET_NAMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </Field>
        {held && <p className="text-[0.93rem] text-warn">They already hold this ticket: renew it from the matrix instead.</p>}
        <Field label="Expiry date">{(id) => <input id={id} type="date" className="field" min={addDays(day, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
        <ProofField pick={pick} proof={proof} error={error} />
      </div>
    </Dialog>
  );
}

/** Book someone on a course: the course first, then a person, with whoever needs that ticket first. */
function BookDialog({ courseId, onClose }: { courseId?: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const courses = db.courses.filter((c) => !c.doneAt && c.date > day && c.bookedIds.length < c.places).sort((a, b) => a.date.localeCompare(b.date));
  const [cid, setCid] = useState(courseId ?? courses[0]?.id ?? "");
  const [pid, setPid] = useState("");
  const course = db.courses.find((c) => c.id === cid);
  const candidates = db.people
    .filter((p) => p.active && course && !course.bookedIds.includes(p.id))
    .map((p) => ({ p, cert: p.certs.find((c) => c.name === course!.ticket) }))
    .map((x) => ({ ...x, state: x.cert ? stateOf(x.cert.expires, day) : "none" }))
    .sort((a, b) => ["expired", "due", "ok", "none"].indexOf(a.state) - ["expired", "due", "ok", "none"].indexOf(b.state) || a.p.name.localeCompare(b.p.name));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Book on a course"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!course || !pid}
            onClick={() => {
              const p = db.people.find((x) => x.id === pid);
              if (course && bookOnCourse(course.id, pid)) toast(`${p?.name} booked on ${course.ticket}, ${dWeekday(course.date)}`);
              onClose();
            }}
          >
            Book the place
          </Button>
        </>
      }
    >
      {courses.length === 0 ? (
        <p className="text-muted">Every course still to come is full. Add a course under Training courses.</p>
      ) : (
        <div className="grid gap-3">
          <Field label="Course">
            {(id) => (
              <select id={id} className="field" value={cid} onChange={(e) => {
                setCid(e.target.value);
                setPid("");
              }}>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ticket}, {dWeekday(c.date)}, {c.venue} ({c.places - c.bookedIds.length} left)
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Person" hint="Those whose ticket has run out or is due come first.">
            {(id) => (
              <select id={id} className="field" value={pid} onChange={(e) => setPid(e.target.value)}>
                <option value="">Choose a person</option>
                {candidates.map(({ p, cert, state }) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.trade}: {cert ? (state === "expired" ? `ran out ${dShort(cert.expires)}` : state === "due" ? `due ${dShort(cert.expires)}` : `in date to ${dShort(cert.expires)}`) : "not held"}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      )}
    </Dialog>
  );
}

// ── Training courses ──────────────────────────────────────────────────────────

export function Courses() {
  const { db, day, access } = useCompliance();
  const region = usePrefs((s) => s.brand.region);
  const canEdit = access.may("manageStaff");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const toCome = db.courses.filter((c) => !c.doneAt).sort((a, b) => a.date.localeCompare(b.date));
  const done = db.courses.filter((c) => c.doneAt).sort((a, b) => b.date.localeCompare(a.date));
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  const toMark = toCome.filter((c) => courseStage(c, day) === "to mark").length;
  const table = (list: Course[], label: string) => (
    <div className="overflow-x-auto">
      <table className="tbl" aria-label={label}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Course</th>
            <th>Provider and venue</th>
            <th>Booked</th>
            <th className="num">Cost a head</th>
            <th>People</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {list.map((c) => {
            const stage = courseStage(c, day);
            return (
              <tr key={c.id}>
                <td className="whitespace-nowrap">{dWeekday(c.date)}</td>
                <td className="font-medium">{c.ticket}</td>
                <td>
                  {c.provider}
                  <span className="block text-[0.87rem] text-muted">{c.venue}</span>
                </td>
                <td className="whitespace-nowrap">
                  {c.bookedIds.length} of {c.places}
                </td>
                <td className="num">{c.cost ? money0(c.cost, region) : "In house"}</td>
                <td className="max-w-[18rem]">{c.bookedIds.length ? c.bookedIds.map(name).join(", ") : <span className="text-muted">Nobody yet</span>}</td>
                <td className="text-right whitespace-nowrap">
                  {stage === "done" ? (
                    <Badge tone="ok">Done</Badge>
                  ) : stage === "to mark" ? (
                    <Badge tone="warn">Mark it done</Badge>
                  ) : null}{" "}
                  <Button size="sm" onClick={() => setOpen(c.id)}>
                    Open
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <PageHead
        title="Training courses"
        note={`${plural(toCome.length, "course")} still to come or to mark done${toMark ? `, ${toMark} to mark done` : ""}. Marking a course done renews the ticket for everyone booked on it, from the course's day.`}
        actions={
          canEdit && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add a course
            </Button>
          )
        }
      />
      <PageBody className="grid max-w-[88rem] gap-5">
        <Panel>{toCome.length ? table(toCome, "Courses to come") : <Empty title="No courses booked">Add one, then book people on it from here or from a ticket.</Empty>}</Panel>
        {done.length > 0 && (
          <Section title="Done">
            <Panel>{table(done, "Courses done")}</Panel>
          </Section>
        )}
      </PageBody>
      {open && <CourseDialog id={open} onClose={() => setOpen(null)} />}
      {adding && <AddCourseDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function CourseDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, day, access } = useCompliance();
  const c = db.courses.find((x) => x.id === id)!;
  const canEdit = access.may("manageStaff");
  const [booking, setBooking] = useState(false);
  const stage = courseStage(c, day);
  const people = c.bookedIds.map((pid) => db.people.find((p) => p.id === pid)).filter((p): p is Person => !!p);
  const to = renewedTo(c.ticket, c.date);
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={`${c.ticket}, ${dWeekday(c.date)}`}
        wide
        footer={
          <>
            {canEdit && stage !== "done" && c.bookedIds.length < c.places && (
              <Button className="mr-auto" onClick={() => setBooking(true)}>
                Book someone
              </Button>
            )}
            <Button onClick={onClose}>Close</Button>
            {canEdit && stage === "to mark" && c.bookedIds.length > 0 && (
              <Button
                variant="primary"
                onClick={() => {
                  const n = markCourseDone(c.id);
                  toast(`${c.ticket} renewed to ${dFull(to)} for ${plural(n, "person", "people")}. Certificates still to come`);
                  onClose();
                }}
              >
                Mark done: renew {plural(c.bookedIds.length, "ticket")}
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4">
          <p className="text-muted">
            {c.provider}, {c.venue}. {c.bookedIds.length} of {c.places} places booked.{" "}
            {stage === "done" ? `Marked done by ${c.doneBy} on ${dFull(c.doneAt!.slice(0, 10))}.` : stage === "to mark" ? `The day has passed: marking it done renews ${c.ticket} to ${dFull(to)} for everyone on it.` : `On the day, everyone on it gets ${c.ticket} to ${dFull(to)}.`}
          </p>
          {people.length === 0 ? (
            <p className="text-muted">Nobody is booked yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-md border border-line">
              {people.map((p) => {
                const cert = p.certs.find((x) => x.name === c.ticket);
                const b = ticketBlocks(p, day);
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{p.name}</span>
                      <span className="block text-[0.87rem] text-muted">
                        {p.trade}. {cert ? `${c.ticket} ${cert.expires < day ? "ran out" : "runs out"} ${dFull(cert.expires)}` : `No ${c.ticket} yet`}
                        {b.length > 0 && stage !== "done" ? `. Cannot work until then: ${blocksText(b, day)}` : ""}
                      </span>
                    </span>
                    {canEdit && stage !== "done" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          unbookFromCourse(c.id, p.id);
                          toast(`${p.name} taken off the course`);
                        }}
                      >
                        Take off
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>
      {booking && <BookDialog courseId={c.id} onClose={() => setBooking(false)} />}
    </>
  );
}

const TICKET_NAMES = ["Safe Pass", "Manual handling", "Working at height", "Abrasive wheels", "First aid responder", "Mobile elevating work platform", "Telescopic handler", "Scaffolding ticket, advanced", "Hot works", "Confined spaces", "Site supervisor safety", "Scaffold inspection"];

function AddCourseDialog({ onClose }: { onClose: () => void }) {
  const { day } = useCompliance();
  const [ticket, setTicket] = useState(TICKET_NAMES[0]!);
  const [provider, setProvider] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState(nextWorkWeek(day)[1]!);
  const [places, setPlaces] = useState(4);
  const [cost, setCost] = useState(0);
  const ok = provider.trim() && venue.trim() && date > day && places > 0;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a course"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              addCourse({ ticket, provider, venue, date, places: Math.round(places), cost });
              toast(`${ticket} course added for ${dWeekday(date)}. Book people on it from here or from a ticket`);
              onClose();
            }}
          >
            Add course
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ticket it gives" className="sm:col-span-2">
          {(id) => (
            <select id={id} className="field" value={ticket} onChange={(e) => setTicket(e.target.value)}>
              {TICKET_NAMES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Provider">{(id) => <input id={id} className="field" placeholder="Midwest Safety Training" value={provider} onChange={(e) => setProvider(e.target.value)} />}</Field>
        <Field label="Venue">{(id) => <input id={id} className="field" placeholder="Limerick" value={venue} onChange={(e) => setVenue(e.target.value)} />}</Field>
        <Field label="Date">{(id) => <input id={id} type="date" className="field" min={addDays(day, 1)} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="flex gap-3">
          <label className="grid gap-1 text-[0.93rem] font-medium">
            Places
            <NumInput label="Places" className="w-20" value={places} onChange={setPlaces} />
          </label>
          <label className="grid gap-1 text-[0.93rem] font-medium">
            Cost a head
            <NumInput label="Cost a head" className="w-24" value={cost} onChange={setCost} />
          </label>
        </div>
      </div>
    </Dialog>
  );
}

// ── Fleet ─────────────────────────────────────────────────────────────────────

export function Fleet() {
  const { db, day, rows, words, access } = useCompliance();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const mine = rows.filter((r) => r.area === "fleet");
  const vehicles = db.vehicles.filter((v) => v.active);
  const cell = (key: string) => mine.find((r) => r.key === key);
  const canEdit = access.may("managePlant");
  const c = countRows(mine);
  const Cell = ({ r }: { r?: ComplianceRow }) =>
    r ? (
      <button type="button" disabled={!canEdit} onClick={() => setOpen(r)} aria-label={`${r.who}, ${r.item}: ${stateLabel(r, day).toLowerCase()}`} className={cx("press block w-full rounded-md px-2 py-1 text-left whitespace-nowrap disabled:cursor-default", r.state !== "ok" && CELL[r.state], canEdit && "hover:ring-1 hover:ring-accent")}>
        {r.approx ? "About " : ""}
        {dShort(r.due!)} {r.due!.slice(0, 4) !== day.slice(0, 4) ? r.due!.slice(0, 4) : ""}
        {r.state !== "ok" && <span className="block text-[0.87rem] font-normal">{stateLabel(r, day)}</span>}
      </button>
    ) : (
      <span className="text-muted">-</span>
    );
  const drivers = db.people.filter((p) => p.active && p.licence).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHead title="Fleet" note={`${plural(vehicles.length, "vehicle")} and ${plural(drivers.length, "driver")}. ${c.expired} run out, ${c.due} due inside 30 days. A van without ${words.roadTax.toLowerCase()}, ${words.vehicleTest} and insurance in date may not be driven, and its driver is told on the site phone.`} />
      <PageBody className="grid max-w-[88rem] gap-5">
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label="Vehicle papers">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>{words.roadTax}</th>
                <th>{words.vehicleTest}</th>
                <th>Insurance</th>
                <th>Service</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const driver = db.people.find((p) => p.id === v.driverId);
                const blocked = ["tax", "test", "insurance"].some((k) => cell(`veh:${v.id}:${k}`)?.blocks);
                return (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/plant/vehicles?vehicle=${v.id}`} className={cx("font-medium", LINK)}>
                        {v.reg}
                      </Link>{" "}
                      {v.model}
                      <span className="block text-[0.87rem] text-muted">
                        {v.kind}
                        {driver ? `, ${driver.name}` : ", no driver"}
                        {blocked && <span className="font-medium text-bad">. Do not drive</span>}
                      </span>
                    </td>
                    <td><Cell r={cell(`veh:${v.id}:tax`)} /></td>
                    <td><Cell r={cell(`veh:${v.id}:test`)} /></td>
                    <td><Cell r={cell(`veh:${v.id}:insurance`)} /></td>
                    <td><Cell r={cell(`vsvc:${v.id}`)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Section title="Driving licences" aside="Checked once a year: the licence itself, both sides.">
          <Panel className="overflow-x-auto">
            <table className="tbl" aria-label="Driving licences">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Categories</th>
                  <th>Licence runs out</th>
                  <th>Last checked</th>
                  <th>Status</th>
                  <th>Proof</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {drivers.map((p) => {
                  const r = mine.find((x) => x.ref.kind === "licence" && x.ref.personId === p.id)!;
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-[0.87rem] text-muted">{r.whoSub.split(",")[0]}</span>
                      </td>
                      <td>{p.licence!.categories}</td>
                      <td className="whitespace-nowrap">{dFull(p.licence!.expires)}</td>
                      <td className="whitespace-nowrap">
                        {dFull(p.licence!.checkedOn)}
                        <span className="block text-[0.87rem] text-muted">by {p.licence!.checkedBy}</span>
                      </td>
                      <td>
                        <StateBadge r={r} day={day} />
                        <span className="block text-[0.87rem] text-muted">{r.item === "Driving licence" ? "The licence itself runs out" : `Next check ${dShort(r.due!)}`}</span>
                      </td>
                      <td className="whitespace-nowrap"><ProofCell db={db} r={r} /></td>
                      <td className="text-right">
                        {canEdit && (
                          <Button size="sm" onClick={() => setOpen(r)}>
                            {actionLabel(r)}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </Section>
        <p className="text-[0.93rem] text-muted">Click a date to renew it. Services are counted from the mileage and typical weekly use, so their dates are a forecast. Repairs and receipts stay under Plant, Vehicle documents.</p>
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ── Machinery ─────────────────────────────────────────────────────────────────

const CHECK_COLUMNS = ["Thorough examination", "Tower inspection", "Electrical safety test", "Harness inspection", "Insurance"];

export function Machinery() {
  const { db, day, rows, access, siteIds } = useCompliance();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const [inspect, setInspect] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const mine = rows.filter((r) => r.area === "machinery");
  const canEdit = access.may("managePlant");
  const canInspect = access.may("recordInspections");
  const code = (id: string | null) => db.projects.find((p) => p.id === id)?.code ?? "";
  const items = db.plant.filter((x) => (siteIds === null || (x.projectId && siteIds.has(x.projectId))) && (!kind || x.kind === kind));
  const kinds = [...new Set(db.plant.map((x) => x.kind))].sort();
  const rank = (id: string) => {
    const mineRows = mine.filter((r) => (r.ref.kind === "plantCheck" || r.ref.kind === "plantService") && r.ref.plantId === id);
    return mineRows.some((r) => r.state === "expired") ? 0 : mineRows.some((r) => r.state === "due") ? 1 : 2;
  };
  const sorted = [...items].sort((a, b) => rank(a.id) - rank(b.id) || a.assetRef.localeCompare(b.assetRef, undefined, { numeric: true }));
  const scaffolds = db.scaffolds.filter((s) => standing(s) && (siteIds === null || siteIds.has(s.projectId))).sort((a, b) => scaffoldDue(a).localeCompare(scaffoldDue(b)));
  const c = countRows(mine);
  const Cell = ({ r }: { r?: ComplianceRow }) =>
    r ? (
      <button type="button" disabled={!canEdit} onClick={() => setOpen(r)} aria-label={`${r.who}, ${r.item}: ${stateLabel(r, day).toLowerCase()}`} className={cx("press block w-full rounded-md px-2 py-1 text-left whitespace-nowrap disabled:cursor-default", r.state !== "ok" && CELL[r.state], canEdit && "hover:ring-1 hover:ring-accent", r.proofNeeded && "underline decoration-dotted")}>
        {r.approx ? "About " : ""}
        {dShort(r.due!)}
        {r.state !== "ok" && <span className="block text-[0.87rem] font-normal">{stateLabel(r, day)}</span>}
      </button>
    ) : (
      <span className="text-faint">-</span>
    );
  return (
    <>
      <PageHead title="Machinery" note={`${plural(items.length, "item")} of plant and ${plural(scaffolds.length, "scaffold")} standing. ${c.expired} overdue or run out, ${c.due} due inside 30 days. A machine whose examination, test, inspection or insurance has run out cannot go to a site.`}>
        <select aria-label="Show one kind" className="field mt-3 h-9 w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Every kind</option>
          {kinds.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </PageHead>
      <PageBody className="grid max-w-[96rem] gap-5">
        <Section title="Scaffold registers" aside="Inspected on putting up, then every 7 days and after any change.">
          <Panel className="overflow-x-auto">
            {scaffolds.length === 0 ? (
              <Empty title="No scaffold standing on these sites" />
            ) : (
              <table className="tbl" aria-label="Scaffold registers">
                <thead>
                  <tr>
                    <th>Site</th>
                    <th>Scaffold</th>
                    <th>Last inspected</th>
                    <th>Next due</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {scaffolds.map((s) => {
                    const r = mine.find((x) => x.ref.kind === "scaffold" && x.ref.scaffoldId === s.id)!;
                    const last = s.inspections[0];
                    return (
                      <tr key={s.id}>
                        <td>
                          <Link to={`/projects/${code(s.projectId)}?tab=plant`} className={cx("font-medium", LINK)}>
                            {code(s.projectId)}
                          </Link>
                        </td>
                        <td>
                          <span className="font-medium">{s.ref}</span> {s.description}
                          <span className="block text-[0.87rem] text-muted">{r.whoSub}</span>
                        </td>
                        <td className="whitespace-nowrap">
                          {last ? dFull(last.date) : "Not yet"}
                          {last && <span className="block text-[0.87rem] text-muted">{last.by}</span>}
                        </td>
                        <td className="whitespace-nowrap">{dFull(scaffoldDue(s))}</td>
                        <td>
                          <StateBadge r={r} day={day} />
                          {r.blocks && <span className="mt-0.5 block text-[0.87rem] font-medium text-bad">Do not use</span>}
                        </td>
                        <td className="text-right">
                          {canInspect && (
                            <Button size="sm" onClick={() => setInspect(s.id)}>
                              Record inspection
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>
        </Section>
        <Section title="Checks and services">
          <Panel className="overflow-x-auto">
            <table className="tbl" aria-label="Machinery checks">
              <thead>
                <tr>
                  <th className="min-w-[14rem]">Item</th>
                  <th>Where</th>
                  {CHECK_COLUMNS.map((k) => (
                    <th key={k} className="whitespace-normal">
                      {k}
                    </th>
                  ))}
                  <th>Service</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((x) => {
                  const blocked = mine.some((r) => r.blocks && r.ref.kind === "plantCheck" && r.ref.plantId === x.id);
                  return (
                    <tr key={x.id}>
                      <td>
                        <Link to={`/plant?item=${x.id}`} className={cx("font-medium", LINK)}>
                          {x.assetRef}
                        </Link>{" "}
                        {x.name}
                        <span className="block text-[0.87rem] text-muted">
                          {x.kind}
                          {blocked && <span className="font-medium text-bad">. {x.projectId ? "May not be used" : "Cannot go to a site"}</span>}
                        </span>
                      </td>
                      <td className="whitespace-nowrap">{x.status === "Off for repair" ? "Off for repair" : x.projectId ? code(x.projectId) : "Yard"}</td>
                      {CHECK_COLUMNS.map((k) => {
                        const ren = x.renewals.find((y) => y.kind === k);
                        return <td key={k}>{ren ? <Cell r={mine.find((r) => r.key === `chk:${x.id}:${ren.id}`)} /> : <span className="text-faint">-</span>}</td>;
                      })}
                      <td><Cell r={mine.find((r) => r.key === `psvc:${x.id}`)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </Section>
        <p className="text-[0.93rem] text-muted">Click a date to renew a check or record a service. Hour-meter services are a forecast from typical weekly use. A dotted underline: renewed, certificate still to come.</p>
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
      {inspect && <InspectForm key={inspect} scaffoldId={inspect} title={`Inspect ${code(db.scaffolds.find((s) => s.id === inspect)!.projectId)} ${db.scaffolds.find((s) => s.id === inspect)!.ref}`} onClose={() => setInspect(null)} />}
    </>
  );
}

// ── Company papers ────────────────────────────────────────────────────────────

export function CompanyPapers() {
  const { db, day, rows, access } = useCompliance();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const mine = rows.filter((r) => r.area === "company");
  const canEdit = access.may("manageCompany");
  return (
    <>
      <PageHead title="Company papers" note={`The firm's own insurances, tax clearance and registrations. ${countRows(mine).due} due inside 30 days. Clients and main contractors ask for these before work starts.`} />
      <PageBody className="max-w-6xl">
        <Panel className="overflow-x-auto">
          <table className="tbl" aria-label="Company papers">
            <thead>
              <tr>
                <th>Item</th>
                <th>Provider</th>
                <th>Reference</th>
                <th>Cover</th>
                <th>Runs to</th>
                <th>Status</th>
                <th>Proof</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {db.companyPapers.map((c) => {
                const r = mine.find((x) => x.ref.kind === "company" && x.ref.paperId === c.id)!;
                return (
                  <tr key={c.id}>
                    <td className="font-medium">{c.name}</td>
                    <td>{c.provider}</td>
                    <td>{c.reference}</td>
                    <td>{c.cover ?? <span className="text-muted">-</span>}</td>
                    <td className="whitespace-nowrap">{dFull(c.expires)}</td>
                    <td><StateBadge r={r} day={day} /></td>
                    <td className="whitespace-nowrap"><ProofCell db={db} r={r} /></td>
                    <td className="text-right">
                      {canEdit && (
                        <Button size="sm" onClick={() => setOpen(r)}>
                          Renew
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        {!canEdit && <p className="mt-2 text-[0.93rem] text-muted">Renewing these needs the "Manage company and subcontractor papers" permission (the managing director and accounts by default).</p>}
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
    </>
  );
}

// ── Subcontractors ────────────────────────────────────────────────────────────

const PAPERS: SubPaperKind[] = ["Public liability", "Employers' liability", "Safety statement"];

export function Subcontractors() {
  const { db, day, rows, access, siteIds, words } = useCompliance();
  const [params] = useSearchParams();
  const [open, setOpen] = useState<ComplianceRow | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const mine = rows.filter((r) => r.area === "subcontractors");
  const canEdit = access.may("manageCompany");
  const live = db.projects.filter((p) => p.status === "Live" || p.status === "Not started");
  const subs = db.subcontractors.filter((s) => siteIds === null || s.projectIds.some((id) => siteIds.has(id)));
  const focus = params.get("sub");
  const code = (id: string) => db.projects.find((p) => p.id === id)?.code ?? "";
  return (
    <>
      <PageHead title="Subcontractors" note={`Each subcontractor's insurances, safety statement, a method statement for every site they are on, and their people's ${words.safetyCard}. They send these through their portal; anything that came by email is recorded here. An invoice from a subcontractor whose insurance has run out is flagged to whoever approves it.`} />
      <PageBody className="grid max-w-6xl gap-5">
        {subs.map((s) => {
          const flags = subFlags(s, live, day);
          const theirs = mine.filter((r) => (r.ref.kind === "subPaper" || r.ref.kind === "subWorker") && r.ref.subId === s.id);
          const paperRows = theirs.filter((r) => r.ref.kind === "subPaper");
          const workerRows = theirs.filter((r) => r.ref.kind === "subWorker");
          return (
            <section key={s.id} aria-label={s.name} className={cx("grid gap-2", focus === s.id && "rounded-lg p-2 ring-2 ring-accent")}>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h2 className="text-[1.15rem]">{s.name}</h2>
                <span className="text-muted">
                  {s.trade}, on {s.projectIds.filter((id) => live.some((p) => p.id === id)).map(code).join(", ")}. {s.contactName}, {s.phone}.
                </span>
                <Link to={`/portal/subcontractors?sub=${s.id}`} className={cx("text-[0.93rem]", LINK)}>
                  What they see in the portal
                </Link>
              </div>
              {flags.length > 0 && <p className="rounded-md bg-bad-soft px-2.5 py-1.5 text-[0.93rem] text-bad">Out of date or missing: {flags.join("; ")}.</p>}
              <Panel className="overflow-x-auto">
                <table className="tbl" aria-label={`${s.name}'s papers`}>
                  <thead>
                    <tr>
                      <th>Paper</th>
                      <th>Reference</th>
                      <th>Runs to</th>
                      <th>Status</th>
                      <th>Came by</th>
                      <th>Proof</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {paperRows.map((r) => {
                      const ref = r.ref.kind === "subPaper" ? r.ref : null;
                      const p = ref ? latestPaper(s, ref.paper, ref.projectId) : undefined;
                      return (
                        <tr key={r.key}>
                          <td className="font-medium">{r.item}</td>
                          <td>{p?.reference ?? <span className="text-muted">-</span>}</td>
                          <td className="whitespace-nowrap">{p?.expires ? dFull(p.expires) : p ? `Came in ${dShort(p.receivedOn)}` : "-"}</td>
                          <td><StateBadge r={r} day={day} /></td>
                          <td>{p?.via ?? <span className="text-muted">-</span>}</td>
                          <td className="whitespace-nowrap"><ProofCell db={db} r={r} /></td>
                          <td className="text-right">
                            {canEdit && (
                              <Button size="sm" onClick={() => setOpen(r)}>
                                {actionLabel(r)}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Panel>
              <Panel className="overflow-x-auto">
                <table className="tbl" aria-label={`${s.name}'s people`}>
                  <thead>
                    <tr>
                      <th>Their people on our sites</th>
                      <th>{words.safetyCard} runs out</th>
                      <th>Status</th>
                      <th>Proof</th>
                      <th className="text-right">
                        {canEdit && (
                          <Button size="sm" variant="ghost" onClick={() => setAdding(s.id)}>
                            Add a person
                          </Button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {workerRows.map((r) => (
                      <tr key={r.key}>
                        <td className="font-medium">{r.who}</td>
                        <td className="whitespace-nowrap">{dFull(r.due!)}</td>
                        <td><StateBadge r={r} day={day} /></td>
                        <td className="whitespace-nowrap"><ProofCell db={db} r={r} /></td>
                        <td className="text-right">
                          {canEdit && (
                            <Button size="sm" onClick={() => setOpen(r)}>
                              Renew
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            </section>
          );
        })}
        <p className="text-[0.93rem] text-muted">{PAPERS.join(", ")} and method statements. Their people work for them, not for us, so an expired {words.safetyCard} is flagged here and in the Monday list rather than stopping our own planning.</p>
      </PageBody>
      {open && <RenewDialog key={open.key} row={open} onClose={() => setOpen(null)} />}
      {adding && <AddWorkerDialog subId={adding} onClose={() => setAdding(null)} />}
    </>
  );
}

function AddWorkerDialog({ subId, onClose }: { subId: string; onClose: () => void }) {
  const { db, day, words } = useCompliance();
  const s = db.subcontractors.find((x) => x.id === subId)!;
  const [name, setName] = useState("");
  const [expires, setExpires] = useState(renewedTo(words.safetyCard, day));
  const { proof, error, pick } = useProofPick();
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add someone working for ${s.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!name.trim() || expires <= day}
            onClick={() => {
              recordSubWorker(subId, null, name, expires, proof);
              toast(`${name.trim()} added for ${s.name}${proof ? ", card attached" : ". Marked as waiting on proof"}`);
              onClose();
            }}
          >
            Add person
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label="Name">{(id) => <input id={id} className="field" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={`${words.safetyCard} runs out`}>{(id) => <input id={id} type="date" className="field" min={addDays(day, 1)} value={expires} onChange={(e) => setExpires(e.target.value)} />}</Field>
        <ProofField pick={pick} proof={proof} error={error} />
      </div>
    </Dialog>
  );
}
