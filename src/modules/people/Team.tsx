import { type FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { exceptionCount, levelOf, useAccess } from "@/data/access";
import { addEmployee, addHoliday, decideHoliday, invitePhone, nowStamp, setEmployeeActive, setPersonPhone, setSageNo, signOutEverywhere } from "@/data/actions";
import { onPhoneApp, PHONE_STATE_LABEL, type PhoneState, phoneState } from "@/lib/phone-auth";
import { blocksText, ticketBlocks } from "@/lib/compliance";
import { ROLES } from "@/data/roles";
import { useData, useDay, usePrefs } from "@/data/store";
import { type Db, type Language, LANGUAGE_NAME, type LevelKey, type Person } from "@/data/types";
import { addDays } from "@/lib/dates";
import { dFull, dShort, plural } from "@/lib/format";
import { money2 } from "@/lib/money";
import { dueLabel, dueState } from "@/lib/status";
import { Badge, Button, type DeclineAsk, DeclineDialog, DeclineNote, Dialog, Empty, Fact, Field, Mail, NumInput, PageBody, PageHead, Panel, Segmented, Switch, Tel, type Tone } from "@/ui";
import { ProofLink } from "@/ui/files";
import { toast } from "@/ui/toast";

const TONE: Record<"overdue" | "soon" | "ok", Tone> = { overdue: "bad", soon: "warn", ok: "neutral" };
/** The live sites someone is on: an operative's site lists, and the sites a site manager runs. */
const sitesOf = (db: Db, personId: string) =>
  [
    ...new Set([
      ...db.assignments.filter((a) => a.personId === personId).map((a) => db.projects.find((p) => p.id === a.projectId && p.status === "Live")?.code),
      ...db.projects.filter((p) => p.status === "Live" && p.siteManagerId === personId).map((p) => p.code),
    ]),
  ]
    .filter(Boolean)
    .sort()
    .join(", ");

function ticketSummary(p: Person, day: string) {
  const bad = p.certs.filter((c) => dueState(c.expires, day) === "overdue").length;
  const soon = p.certs.filter((c) => dueState(c.expires, day) === "soon").length;
  if (bad) return <Badge tone="bad">{plural(bad, "ticket")} expired</Badge>;
  if (soon) return <Badge tone="warn">{plural(soon, "ticket")} due soon</Badge>;
  return <span className="text-muted">{p.certs.length ? `${p.certs.length} in date` : "None recorded"}</span>;
}

export function EmployeeRegister() {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { may } = useAccess();
  const seeRates = may("seeRates");
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<"All" | "Operative" | "Management">("All");
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const open = db.people.find((p) => p.id === params.get("person"));
  const live = db.people.filter((p) => p.active);
  const rows = db.people
    .filter((p) => (archived ? !p.active : p.active))
    .filter((p) => kind === "All" || p.kind === kind)
    .filter((p) => !q.trim() || `${p.name} ${p.trade}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHead title="Employee register" note={`${live.length} people: ${live.filter((p) => p.kind === "Operative").length} operatives and ${live.filter((p) => p.kind === "Management").length} in management.`} actions={may("manageStaff") && <Button variant="primary" onClick={() => setAdding(true)}>Add employee</Button>}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Kind of employee" value={kind} onChange={setKind} options={[{ value: "All", label: "All" }, { value: "Operative", label: "Operatives" }, { value: "Management", label: "Management" }]} />
          <input type="search" aria-label="Search employees" placeholder="Search by name or trade" className="field max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="flex items-center gap-2 text-[0.93rem] text-muted">
            <Switch on={archived} onChange={() => setArchived((v) => !v)} label="Show archived employees" /> Show archived
          </label>
        </div>
      </PageHead>
      <PageBody>
        <Panel className="overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={archived ? "Nobody is archived" : "Nobody matches"}>{archived ? "People who have left appear here, with their history kept." : "Clear the search or choose All."}</Empty>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Sage no.</th>
                  <th>Trade or role</th>
                  <th>Category</th>
                  {seeRates && <th className="num">Hourly rate</th>}
                  <th>Phone</th>
                  <th>Phone app</th>
                  <th>Language</th>
                  <th>On site at</th>
                  <th>Training tickets</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="rowlink" onClick={() => setParams({ person: p.id })}>
                    <td className="font-medium">{p.name}</td>
                    <td className="tabular-nums">{p.sageNo ?? <Badge tone="warn">Not in Sage</Badge>}</td>
                    <td>{p.trade}</td>
                    <td>{p.category ?? <span className="text-muted">-</span>}</td>
                    {seeRates && <td className="num">{p.hourlyRate ? money2(p.hourlyRate, region) : "-"}</td>}
                    <td className="whitespace-nowrap">{p.phone}</td>
                    <td className="whitespace-nowrap">{p.active && onPhoneApp(p) ? <PhoneStateBadge state={phoneState(db.phoneAccounts.find((a) => a.personId === p.id), nowStamp())} /> : <span className="text-muted">-</span>}</td>
                    <td>{LANGUAGE_NAME[p.language]}</td>
                    <td>{sitesOf(db, p.id) || <span className="text-muted">-</span>}</td>
                    <td>{p.active ? ticketSummary(p, day) : <span className="text-muted">Left {dShort(p.archivedAt)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {open && <PersonDialog person={open} onClose={() => setParams({})} />}
      <AddEmployeeDialog open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function PersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const region = usePrefs((s) => s.brand.region);
  const { may, role } = useAccess();
  const level = levelOf(person);
  const exceptions = level ? exceptionCount(db.access.find((a) => a.id === level), db.personAccess.find((a) => a.id === person.id)) : 0;
  const holidays = db.holidays.filter((h) => h.personId === person.id).sort((a, b) => b.from.localeCompare(a.from));
  const blocks = person.active ? ticketBlocks(person, day) : [];
  return (
    <Dialog
      open
      onClose={onClose}
      title={person.name}
      wide
      footer={
        may("manageStaff") && (
          <Button
            variant={person.active ? "danger" : "outline"}
            onClick={() => {
              setEmployeeActive(person.id, !person.active);
              toast(person.active ? `${person.name} archived. Their history is kept` : `${person.name} restored`);
              onClose();
            }}
          >
            {person.active ? "Archive employee" : "Restore employee"}
          </Button>
        )
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <dl>
          <Fact label="Trade or role">{person.trade}</Fact>
          <Fact label="Sage employee no.">
            <SageNo person={person} canEdit={may("manageStaff")} />
          </Fact>
          <Fact label="Type">{person.kind}</Fact>
          <Fact label="Category">{person.category ?? "-"}</Fact>
          {may("seeRates") && <Fact label="Hourly rate">{person.hourlyRate ? `${money2(person.hourlyRate, region)} from ${dFull(person.rateAsOf)}` : "Salaried"}</Fact>}
          <Fact label="Phone">
            <PhoneNumber person={person} canEdit={may("manageStaff")} />
          </Fact>
          {person.active && onPhoneApp(person) && (
            <Fact label="Phone app">
              <PhoneAppFact person={person} canEdit={may("manageStaff")} />
            </Fact>
          )}
          <Fact label="Email">
            <Mail address={person.email} />
          </Fact>
          {level && (
            <Fact label="Access level">
              {ROLES.find((r) => r.key === level)?.title}
              {exceptions > 0 && `, with ${plural(exceptions, "exception")}`}
              {role === "md" && level !== "md" && (
                <Link to={`/admin/access?person=${person.id}`} className="ml-2 text-accent-ink underline-offset-2 hover:underline">
                  Change
                </Link>
              )}
            </Fact>
          )}
          <Fact label="Language">{LANGUAGE_NAME[person.language]}</Fact>
          <Fact label="On site at">{sitesOf(db, person.id) || "Not on a site"}</Fact>
        </dl>
        <div className="grid content-start gap-4">
          <div>
            <h3 className="mb-1 flex items-baseline gap-2 text-base">
              Training tickets
              <Link to={`/compliance/personnel?person=${person.id}`} className="text-[0.93rem] font-normal text-accent-ink underline-offset-2 hover:underline">
                Open in Compliance
              </Link>
            </h3>
            {blocks.length > 0 && <p className="mb-1.5 rounded-md bg-bad-soft px-2.5 py-1.5 text-[0.93rem] text-bad">Cannot be planned or marked on site: {blocksText(blocks)}.</p>}
            {person.certs.length === 0 ? (
              <p className="text-muted">None recorded.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {person.certs.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1">{c.name}</span>
                    {c.proof ? <ProofLink proof={c.proof} title={`${c.name}, ${person.name}`} className="text-[0.87rem]" /> : c.proofNeeded && <Badge tone="warn">Proof needed</Badge>}
                    <Badge tone={TONE[dueState(c.expires, day)]}>{dueLabel(c.expires, day)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1 text-base">Leave</h3>
            {holidays.length === 0 ? (
              <p className="text-muted">None recorded.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {holidays.map((h) => (
                  <li key={h.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="flex-1">
                      {dShort(h.from)} to {dShort(h.to)}
                      {h.status === "Declined" && <DeclineNote note={h.declineNote} />}
                    </span>
                    <Badge tone={h.status === "Approved" ? "ok" : h.status === "Declined" ? "bad" : "accent"}>{h.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** The employee number from Sage Payroll, which links this person's hours to their pay (Oldstone call, 16 Nov). */
const PHONE_TONE: Record<PhoneState, Tone> = { "not-invited": "neutral", invited: "warn", "set-up": "accent", "signed-in": "ok" };

function PhoneStateBadge({ state }: { state: PhoneState }) {
  return <Badge tone={PHONE_TONE[state]}>{PHONE_STATE_LABEL[state]}</Badge>;
}

/**
 * The phone app from the office's side (Oisin, 20 Nov): Send invite texts the app's link to the
 * number on the register; Sign out everywhere is for a lost or stolen phone.
 */
function PhoneAppFact({ person, canEdit }: { person: Person; canEdit: boolean }) {
  const db = useData((s) => s.db);
  const acc = db.phoneAccounts.find((a) => a.personId === person.id);
  const state = phoneState(acc, nowStamp());
  return (
    <span className="grid gap-1.5">
      <span className="flex flex-wrap items-center gap-2">
        <PhoneStateBadge state={state} />
        {acc?.lastSignIn && <span className="text-[0.87rem] text-muted">Last signed in {dShort(acc.lastSignIn.slice(0, 10))}</span>}
        {!acc?.lastSignIn && acc?.invitedAt && <span className="text-[0.87rem] text-muted">Invited {dShort(acc.invitedAt.slice(0, 10))} by {acc.invitedBy}</span>}
      </span>
      {canEdit && (
        <span className="flex flex-wrap gap-2">
          {state !== "signed-in" && state !== "set-up" && (
            <Button
              size="sm"
              variant={state === "not-invited" ? "primary" : "outline"}
              onClick={() => {
                invitePhone(person.id);
                toast(`Invite texted to ${person.phone}. ${person.name.split(" ")[0]} signs in with that number`);
              }}
            >
              {state === "not-invited" ? "Send invite" : "Send invite again"}
            </Button>
          )}
          {state === "signed-in" && (
            <Button
              size="sm"
              onClick={() => {
                signOutEverywhere(person.id);
                toast(`${person.name} is signed out of the phone app. They sign in again with their password`);
              }}
            >
              Sign out everywhere
            </Button>
          )}
        </span>
      )}
    </span>
  );
}

/** Only the office changes a number (Oisin, 20 Nov). Changing it signs the phone app out. */
function PhoneNumber({ person, canEdit }: { person: Person; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.phone);
  const [error, setError] = useState("");
  if (!editing)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <Tel number={person.phone} />
        {canEdit && person.active && (
          <Button size="sm" variant="ghost" onClick={() => { setValue(person.phone); setError(""); setEditing(true); }}>
            Change number
          </Button>
        )}
      </span>
    );
  return (
    <form
      className="grid gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = setPersonPhone(person.id, value);
        if (problem) return setError(problem);
        toast(`Number changed for ${person.name}. Their phone app is signed out until they sign in with the new number`);
        setEditing(false);
      }}
    >
      <input aria-label={`New mobile number for ${person.name}`} className="field h-9" inputMode="tel" value={value} onChange={(e) => setValue(e.target.value)} />
      {error && <span role="alert" className="text-[0.87rem] text-bad">{error}</span>}
      <span className="flex gap-2">
        <Button size="sm" onClick={() => setEditing(false)}>Cancel</Button>
        <Button size="sm" variant="primary" type="submit">Save number</Button>
      </span>
    </form>
  );
}

function SageNo({ person, canEdit }: { person: Person; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(person.sageNo ?? "");
  if (editing)
    return (
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSageNo(person.id, value);
          toast(value.trim() ? `Sage number ${value.trim()} saved for ${person.name}` : `Sage number cleared for ${person.name}`);
          setEditing(false);
        }}
      >
        <input aria-label="Sage employee number" className="field h-9 w-24" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        <Button size="sm" type="submit" variant="primary">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </form>
    );
  return (
    <span className="inline-flex items-center gap-2">
      {person.sageNo ? <span className="tabular-nums">{person.sageNo}</span> : <span className="text-warn">Not set up in Sage yet. Hours cannot be exported until it is added.</span>}
      {canEdit && (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {person.sageNo ? "Change" : "Add"}
        </Button>
      )}
    </span>
  );
}

const TRADES = ["Stonemason", "Lime plasterer", "Roofer and slater", "Leadworker", "Conservation joiner", "Carpenter", "Bricklayer", "Scaffolder", "Painter and decorator", "General operative", "Apprentice stonemason", "Apprentice joiner"];

function AddEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [kind, setKind] = useState<Person["kind"]>("Operative");
  const [trade, setTrade] = useState(TRADES[0]!);
  const [role, setRole] = useState("");
  const [category, setCategory] = useState<"A" | "B" | "Craftsperson">("Craftsperson");
  const [rate, setRate] = useState(25);
  const [language, setLanguage] = useState<Language>("en");
  const [level, setLevel] = useState<LevelKey>("site");
  const [sageNo, setSageNoField] = useState("");
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return setError("Name and phone number are needed.");
    if (kind === "Management" && !role.trim()) return setError("Add their job title.");
    addEmployee({ name, phone: phone.trim(), kind, trade: kind === "Operative" ? trade : role.trim(), category: kind === "Operative" ? category : null, hourlyRate: kind === "Operative" ? rate : 0, language, ...(kind === "Management" ? { level } : {}), ...(sageNo.trim() ? { sageNo: sageNo.trim() } : {}) });
    toast(`${name.trim()} added to the register`);
    setName("");
    setSageNoField("");
    setPhone("");
    setRole("");
    setError("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Add an employee">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
        <Field label="Name">{(id) => <input id={id} className="field" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} />}</Field>
        <Field label="Phone number">{(id) => <input id={id} className="field" type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setError(""); }} />}</Field>
        <Field label="Operative or management">
          {(id) => (
            <select id={id} className="field" value={kind} onChange={(e) => setKind(e.target.value as Person["kind"])}>
              <option>Operative</option>
              <option>Management</option>
            </select>
          )}
        </Field>
        {kind === "Operative" ? (
          <Field label="Trade">
            {(id) => (
              <select id={id} className="field" value={trade} onChange={(e) => setTrade(e.target.value)}>
                {TRADES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <Field label="Job title">{(id) => <input id={id} className="field" value={role} placeholder="Quantity surveyor" onChange={(e) => { setRole(e.target.value); setError(""); }} />}</Field>
        )}
        {kind === "Management" && (
          <Field label="Access level" hint="A starting point. Fine tune it for this person in Admin, Roles and access.">
            {(id) => (
              <select id={id} className="field" value={level} onChange={(e) => setLevel(e.target.value as LevelKey)}>
                {ROLES.filter((r) => !r.locked).map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {kind === "Operative" && (
          <>
            <Field label="Category">
              {(id) => (
                <select id={id} className="field" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
                  <option>Craftsperson</option>
                  <option>A</option>
                  <option>B</option>
                </select>
              )}
            </Field>
            <Field label="Hourly rate">{() => <NumInput label="Hourly rate" className="h-9 w-full" value={rate} onChange={setRate} />}</Field>
          </>
        )}
        <Field label="Sage employee no." hint="Set them up in Sage Payroll first (PPS number, address, bank details), then copy the number Sage gives them here. It can be added later.">
          {(id) => <input id={id} className="field" inputMode="numeric" placeholder="0031" value={sageNo} onChange={(e) => setSageNoField(e.target.value)} />}
        </Field>
        <Field label="Language for site instructions">
          {(id) => (
            <select id={id} className="field" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
              {(Object.keys(LANGUAGE_NAME) as Language[]).map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAME[l]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <p role="alert" className="self-end text-bad sm:col-span-2">
          {error}
        </p>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Add employee
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

// ── Holidays ──────────────────────────────────────────────────────────────────

export function Holidays() {
  const db = useData((s) => s.db);
  const canDecide = useAccess().may("approveLeave");
  const [show, setShow] = useState<"Requested" | "Approved" | "Declined">("Requested");
  const [adding, setAdding] = useState(false);
  const [no, setNo] = useState<DeclineAsk | null>(null);
  const count = (s: typeof show) => db.holidays.filter((h) => h.status === s).length;
  const rows = db.holidays.filter((h) => h.status === show).sort((a, b) => a.from.localeCompare(b.from));
  const person = (id: string) => db.people.find((p) => p.id === id);
  const planned = (personId: string, from: string, to: string) => db.plan.filter((p) => p.personId === personId && p.date >= from && p.date <= to).length;
  const told = (cleared: number) => (cleared > 0 ? `. ${plural(cleared, "planned day")} taken off the week ahead` : "");

  return (
    <>
      <PageHead title="Holidays" note="Approved leave blocks that person on the planner, so they cannot be put on a site for those days." actions={<><Segmented label="Leave status" value={show} onChange={setShow} options={[{ value: "Requested", label: "Requested", count: count("Requested") }, { value: "Approved", label: "Approved", count: count("Approved") }, { value: "Declined", label: "Declined", count: count("Declined") }]} />{canDecide && <Button onClick={() => setAdding(true)}>Record leave</Button>}</>} />
      <PageBody>
        <Panel className="max-w-5xl overflow-x-auto">
          {rows.length === 0 ? (
            <Empty title={show === "Requested" ? "No requests waiting" : `Nothing ${show.toLowerCase()}`} />
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Came in by</th>
                  <th>Note</th>
                  {show === "Requested" && <th>Clashes with plan</th>}
                  {show === "Declined" && <th>Why it was declined</th>}
                  {show === "Requested" && canDecide && <th />}
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => {
                  const p = person(h.personId);
                  const clash = planned(h.personId, h.from, h.to);
                  return (
                    <tr key={h.id}>
                      <td>
                        <span className="font-medium">{p?.name}</span>
                        <span className="block text-[0.87rem] text-muted">{p?.trade}</span>
                      </td>
                      <td className="whitespace-nowrap">{dFull(h.from)}</td>
                      <td className="whitespace-nowrap">{dFull(h.to)}</td>
                      <td>{h.via}</td>
                      <td className="text-muted">{h.note ?? "-"}</td>
                      {show === "Requested" && <td>{clash > 0 ? <Badge tone="warn">{plural(clash, "day")} already planned</Badge> : <span className="text-muted">None</span>}</td>}
                      {show === "Declined" && (
                        <td>
                          {h.declineNote ?? <span className="text-muted">No note left</span>}
                          {h.decidedBy && <span className="block text-[0.87rem] text-muted">{h.decidedBy}</span>}
                        </td>
                      )}
                      {show === "Requested" && canDecide && (
                        <td className="text-right whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Decline leave for ${p?.name}`}
                            onClick={() =>
                              setNo({
                                title: `Decline leave for ${p?.name}?`,
                                about: `${h.from === h.to ? dFull(h.from) : `${dFull(h.from)} to ${dFull(h.to)}`}.`,
                                hint: `Say why, if it helps. ${p?.name?.split(" ")[0]} sees it with the answer on the site phone.`,
                                confirm: "Decline leave",
                                run: (note) => {
                                  decideHoliday(h.id, false, note);
                                  toast(`Leave declined for ${p?.name}${note ? ", with your note" : ""}`);
                                },
                              })
                            }
                          >
                            Decline
                          </Button>{" "}
                          <Button
                            size="sm"
                            onClick={() => {
                              const cleared = decideHoliday(h.id, true);
                              toast(`Leave approved for ${p?.name}${told(cleared)}`);
                            }}
                          >
                            Approve
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </PageBody>
      {adding && <RecordLeaveDialog onClose={() => setAdding(false)} told={told} />}
      <DeclineDialog ask={no} onClose={() => setNo(null)} />
    </>
  );
}

export function RecordLeaveDialog({ onClose, told }: { onClose: () => void; told: (n: number) => string }) {
  const db = useData((s) => s.db);
  const day = useDay();
  const people = db.people.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name));
  const [personId, setPersonId] = useState(people[0]?.id ?? "");
  const [from, setFrom] = useState(addDays(day, 7));
  const [to, setTo] = useState(addDays(day, 11));
  const [note, setNote] = useState("");
  return (
    <Dialog
      open
      onClose={onClose}
      title="Record leave"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!personId || to < from}
            onClick={() => {
              const cleared = addHoliday(personId, from, to, note);
              toast(`Leave recorded for ${people.find((p) => p.id === personId)?.name}${told(cleared)}`);
              onClose();
            }}
          >
            Record leave
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Person" className="sm:col-span-2">
          {(id) => (
            <select id={id} className="field" value={personId} onChange={(e) => setPersonId(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}, {p.trade}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="First day off">{(id) => <input id={id} type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label="Last day off">{(id) => <input id={id} type="date" className="field" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        <Field label="Note" className="sm:col-span-2">{(id) => <input id={id} className="field" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {to < from && <p className="text-bad sm:col-span-2">The last day is before the first day.</p>}
        <p className="text-[0.93rem] text-muted sm:col-span-2">Leave recorded here is approved straight away. Any days already planned inside it are taken off the week ahead.</p>
      </div>
    </Dialog>
  );
}
