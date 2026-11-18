/**
 * What every Compliance screen shares: the records in scope for the person looking, the status
 * badge, the list of rows, the figures across the top, and one renew box that knows every kind
 * of record (tickets, licences, vehicle papers, services, machine checks, scaffolds, company and
 * subcontractor papers).
 */
import { type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { useAccess } from "@/data/access";
import { addCert, addCertProof, bookOnCourse, checkLicence, checkTicketPhoto, inspectScaffold, recordPlantService, recordSubPaper, recordSubWorker, recordVehicleService, renewCert, renewCompanyPaper, renewPlantCert, renewVehicle } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Db, PermKey, Proof } from "@/data/types";
import { type Area, bookingFor, type ComplianceRow, complianceRows, type CState, isCheck, openCourse, renewedTo, rowsInScope, scaffoldUnsafe, type Words } from "@/lib/compliance";
import { addDays } from "@/lib/dates";
import { dFull, dShort } from "@/lib/format";
import { REGION } from "@/lib/money";
import { daysBetween } from "@/lib/status";
import { Badge, Button, cx, Dialog, Empty, Field, Panel, type Tone } from "@/ui";
import { ProofField, ProofLink, useProofPick } from "@/ui/files";
import { toast } from "@/ui/toast";

export const LINK = "text-accent-ink underline-offset-2 hover:underline";

/** The records this person may see, and what they may change. Site managers see only their own sites. */
export function useCompliance() {
  const db = useData((s) => s.db);
  const day = useDay();
  const access = useAccess();
  const region = usePrefs((s) => s.brand.region);
  const r = REGION[region];
  const words: Words = { safetyCard: r.safetyCard, vehicleTest: r.vehicleTest, roadTax: r.roadTax };
  const siteIds = access.may("allProjects") ? null : new Set(access.scope(db.projects).map((p) => p.id));
  const rows = rowsInScope(complianceRows(db, day, words), siteIds);
  return { db, day, access, words, siteIds, rows, firmWide: siteIds === null };
}

/** Who may renew what: tickets with "Manage employees and tickets", machinery and vans with "Manage plant and fleet", and so on. */
export const AREA_PERM: Record<Area, PermKey> = { personnel: "manageStaff", fleet: "managePlant", machinery: "managePlant", company: "manageCompany", subcontractors: "manageCompany" };
export const permFor = (r: ComplianceRow): PermKey => (r.ref.kind === "scaffold" ? "recordInspections" : AREA_PERM[r.area]);

const TONE: Record<CState, Tone> = { expired: "bad", missing: "bad", due: "warn", ok: "neutral" };

/** "Ran out 3 days ago", "Overdue by 2 days", "Due in 9 days", "In date", "Missing". */
export function stateLabel(r: Pick<ComplianceRow, "due" | "state" | "item" | "approx">, day: string) {
  if (r.state === "missing") return "Missing";
  if (r.item.includes("not safe")) return "Not safe to use";
  if (!r.due) return "Received";
  const d = daysBetween(day, r.due);
  if (d < 0) return isCheck(r.item) ? `Overdue by ${-d} day${d === -1 ? "" : "s"}` : `Ran out ${-d} day${d === -1 ? "" : "s"} ago`;
  if (d === 0) return "Due today";
  if (d <= 30) return `Due in ${d} day${d === 1 ? "" : "s"}`;
  return "In date";
}
export const StateBadge = ({ r, day }: { r: Pick<ComplianceRow, "due" | "state" | "item" | "approx">; day: string }) => <Badge tone={TONE[r.state]}>{stateLabel(r, day)}</Badge>;

/** What a row that stops work stops: said in a few words under its status. */
export function blockWords(r: ComplianceRow) {
  if (!r.blocks) return "";
  switch (r.ref.kind) {
    case "cert":
      return "Cannot be planned or marked on site";
    case "licence":
      return "May not drive";
    case "vehicle":
      return "Do not drive";
    case "plantCheck":
      return r.siteIds.length ? "May not be used on site" : "Cannot go to a site";
    case "scaffold":
      return "Do not use";
    default:
      return "";
  }
}

/** The proof behind a row, if one is attached. */
export function proofOf(db: Db, r: ComplianceRow): Proof | undefined {
  const ref = r.ref;
  switch (ref.kind) {
    case "cert":
      return db.people.find((p) => p.id === ref.personId)?.certs.find((c) => c.id === ref.certId)?.proof;
    case "licence":
      return db.people.find((p) => p.id === ref.personId)?.licence?.proof;
    case "plantCheck":
      return db.plant.find((p) => p.id === ref.plantId)?.renewals.find((x) => x.id === ref.renewalId)?.proof;
    case "vehicle":
      return db.fleetDocs.find((d) => d.vehicleId === ref.vehicleId && d.category === ref.item && d.proof)?.proof;
    case "company":
      return db.companyPapers.find((c) => c.id === ref.paperId)?.proof;
    case "subPaper": {
      const s = db.subcontractors.find((x) => x.id === ref.subId);
      return s?.papers.filter((p) => p.kind === ref.paper && (ref.projectId === undefined || p.projectId === ref.projectId) && p.proof).sort((a, b) => b.receivedOn.localeCompare(a.receivedOn))[0]?.proof;
    }
    case "subWorker":
      return db.subcontractors.find((x) => x.id === ref.subId)?.workers.find((w) => w.id === ref.workerId)?.proof;
    default:
      return undefined;
  }
}

export function ProofCell({ db, r }: { db: Db; r: ComplianceRow }) {
  if (r.sent) return <Badge tone="accent">Card sent from phone</Badge>;
  if (r.proofNeeded) return <Badge tone="warn">Proof needed</Badge>;
  if (r.ref.kind === "plantService" || r.ref.kind === "vehicleService" || r.ref.kind === "scaffold" || r.state === "missing") return <span className="text-muted">-</span>;
  const p = proofOf(db, r);
  // Papers from before the system came in are kept in the office until someone attaches a copy.
  return p ? <ProofLink proof={p} title={`${r.item}, ${r.who}`} /> : <span className="text-muted">On paper file</span>;
}

/** A ticket in date with no copy attached: the button attaches one rather than renewing. */
export const wantsProof = (db: Db, r: ComplianceRow) => r.ref.kind === "cert" && r.ref.certId !== "" && r.state === "ok" && !r.sent && !proofOf(db, r);

/** The button on a row: what it does, in a word or two. */
export function actionLabel(r: ComplianceRow, db?: Db) {
  if (r.sent) return "Check card";
  if (db && wantsProof(db, r)) return "Add proof";
  switch (r.ref.kind) {
    case "cert":
      return r.state === "missing" ? "Record ticket" : "Renew";
    case "licence":
      return "Check licence";
    case "vehicleService":
    case "plantService":
      return "Record service";
    case "scaffold":
      return "Record inspection";
    case "subPaper":
      return r.ref.paper === "Method statement" ? (r.state === "missing" ? "Record it" : "New one") : "Record renewal";
    default:
      return "Renew";
  }
}

/** The list of rows: who or what, the item, when it is due, where it stands, proof, and the button. */
export function RowTable({ rows, onRow, label, showArea = false, empty }: { rows: ComplianceRow[]; onRow: (r: ComplianceRow) => void; label: string; showArea?: boolean; empty: ReactNode }) {
  const { db, day, access } = useCompliance();
  if (rows.length === 0) return <>{empty}</>;
  return (
    <div className="overflow-x-auto">
      <table className="tbl" aria-label={label}>
        <thead>
          <tr>
            <th>Who or what</th>
            {showArea && <th>Area</th>}
            <th>Item</th>
            <th>Due</th>
            <th>Status</th>
            <th>Proof</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {r.to ? (
                  <Link to={r.to} className={cx("font-medium", LINK)}>
                    {r.who}
                  </Link>
                ) : (
                  <span className="font-medium">{r.who}</span>
                )}
                <span className="block text-[0.87rem] text-muted">{r.whoSub}</span>
              </td>
              {showArea && <td className="text-muted capitalize">{r.area}</td>}
              <td>{r.item}</td>
              <td className="whitespace-nowrap">{r.due ? `${r.approx ? "About " : ""}${dFull(r.due)}` : <span className="text-muted">-</span>}</td>
              <td>
                <StateBadge r={r} day={day} />
                {r.blocks && <span className="mt-0.5 block text-[0.87rem] font-medium text-bad">{blockWords(r)}</span>}
              </td>
              <td className="whitespace-nowrap">
                <ProofCell db={db} r={r} />
              </td>
              <td className="text-right whitespace-nowrap">
                {access.may(permFor(r)) && (
                  <Button size="sm" onClick={() => onRow(r)}>
                    {actionLabel(r, db)}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The figures across the top. Each one is a filter on the list below; pressed again it lets go. */
export function Figures({ items, value, onPick }: { items: { key: string; label: string; n: number; note: string; tone?: Tone }[]; value: string; onPick: (k: string) => void }) {
  return (
    <Panel className="overflow-hidden">
      <dl aria-label="Compliance figures" className="grid grid-cols-2 gap-px bg-line md:grid-cols-[repeat(var(--n),minmax(0,1fr))]" style={{ ["--n" as string]: items.length }}>
        {items.map((t) => (
          <div key={t.key} className="bg-surface max-md:odd:last:col-span-2">
            <button type="button" aria-pressed={value === t.key} onClick={() => onPick(value === t.key ? "" : t.key)} className={cx("press block w-full px-4 py-3 text-left hover:bg-accent-soft/60", value === t.key && "bg-accent-soft")}>
              <dt className="text-[0.87rem] text-muted">{t.label}</dt>
              <dd className={cx("text-[1.35rem] font-medium tabular-nums", t.tone === "bad" && t.n > 0 && "text-bad", t.tone === "warn" && t.n > 0 && "text-warn")}>{t.n}</dd>
              <dd className="text-[0.87rem] text-muted">{t.note}</dd>
            </button>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export const NothingHere = ({ title, children }: { title: string; children?: ReactNode }) => <Empty title={title}>{children}</Empty>;

// ── The renew box ─────────────────────────────────────────────────────────────

/** Opens the right form for a row. Each form is its own component, so typing never loses the cursor. */
export function RenewDialog({ row, onClose }: { row: ComplianceRow; onClose: () => void }) {
  const db = useData((s) => s.db);
  const ref = row.ref;
  if (ref.kind === "cert" && row.sent) return <CardCheck row={row} personId={ref.personId} certId={ref.certId} onClose={onClose} />;
  if (ref.kind === "cert" && wantsProof(db, row)) return <AttachProof row={row} personId={ref.personId} certId={ref.certId} onClose={onClose} />;
  switch (ref.kind) {
    case "cert":
      return <TicketForm row={row} personId={ref.personId} certId={ref.certId} onClose={onClose} />;
    case "licence":
      return <LicenceForm row={row} personId={ref.personId} onClose={onClose} />;
    case "vehicle":
      return <VehicleForm row={row} vehicleId={ref.vehicleId} item={ref.item} onClose={onClose} />;
    case "vehicleService":
    case "plantService":
      return <ServiceForm row={row} id={ref.kind === "vehicleService" ? ref.vehicleId : ref.plantId} vehicle={ref.kind === "vehicleService"} onClose={onClose} />;
    case "plantCheck":
      return <CheckForm row={row} plantId={ref.plantId} renewalId={ref.renewalId} onClose={onClose} />;
    case "scaffold":
      return <InspectForm scaffoldId={ref.scaffoldId} title={`Inspect ${row.who}`} onClose={onClose} />;
    case "company":
      return <CompanyForm row={row} paperId={ref.paperId} onClose={onClose} />;
    case "subPaper":
      return <SubPaperForm row={row} subId={ref.subId} paper={ref.paper} projectId={ref.projectId} onClose={onClose} />;
    case "subWorker":
      return <WorkerForm row={row} subId={ref.subId} workerId={ref.workerId} onClose={onClose} />;
  }
}

function Box({ title, onClose, save, saveLabel, disabled, extra, children }: { title: string; onClose: () => void; save: () => void; saveLabel: string; disabled?: boolean; extra?: ReactNode; children: ReactNode }) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          {extra}
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={disabled}
            onClick={() => {
              save();
              onClose();
            }}
          >
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">{children}</div>
    </Dialog>
  );
}

const DateField = ({ label, value, onChange, min, hint }: { label: string; value: string; onChange: (v: string) => void; min?: string; hint?: string }) => (
  <Field label={label} hint={hint}>
    {(id) => <input id={id} type="date" className="field" min={min} value={value} onChange={(e) => onChange(e.target.value)} />}
  </Field>
);
const NoProof = ({ proof }: { proof: unknown }) => (proof ? null : <p className="rounded-md bg-warn-soft px-2.5 py-2 text-[0.93rem] text-warn">No copy attached yet. You can still save: it will show as "Proof needed" until a copy is added.</p>);
const said = (proof: unknown) => (proof ? ", copy attached" : ". Marked as waiting on proof");

function TicketForm({ row, personId, certId, onClose }: { row: ComplianceRow; personId: string; certId: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const person = db.people.find((p) => p.id === personId)!;
  const cert = person.certs.find((c) => c.id === certId);
  const [expires, setExpires] = useState(renewedTo(row.item, day));
  const { proof, error, pick } = useProofPick();
  const booked = bookingFor(db.courses, personId, row.item);
  const course = booked ? undefined : openCourse(db.courses, row.item, day);
  return (
    <Box
      title={cert ? `Renew ${row.item} for ${person.name}` : `Record ${row.item} for ${person.name}`}
      onClose={onClose}
      disabled={expires <= day}
      saveLabel={cert ? "Save renewal" : "Record ticket"}
      save={() => {
        if (cert) renewCert(personId, certId, expires, proof);
        else addCert(personId, row.item, expires, proof);
        toast(`${row.item} for ${person.name} to ${dFull(expires)}${said(proof)}`);
      }}
      extra={
        course && (
          <Button
            variant="ghost"
            className="mr-auto"
            onClick={() => {
              if (bookOnCourse(course.id, personId)) toast(`${person.name} booked on the ${course.ticket} course, ${dShort(course.date)}`);
              onClose();
            }}
          >
            Book on the course, {dShort(course.date)}
          </Button>
        )
      }
    >
      {row.blocks && <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">{person.name} cannot be planned or marked on site until this is renewed.</p>}
      {booked && (
        <p className="rounded-md bg-accent-soft px-2.5 py-2 text-[0.93rem] text-accent-ink">
          Booked on the {booked.ticket} course on {dFull(booked.date)} at {booked.venue}. Marking the course done renews it.{" "}
          <Link to="/compliance/courses" className="font-medium underline">
            Open courses
          </Link>
        </p>
      )}
      <DateField label="New expiry date" hint="Taken from the new card or certificate." value={expires} min={addDays(day, 1)} onChange={setExpires} />
      <ProofField pick={pick} proof={proof} error={error} />
      <NoProof proof={proof} />
    </Box>
  );
}

/** Attach the card or certificate to a ticket that is in date. */
function AttachProof({ row, personId, certId, onClose }: { row: ComplianceRow; personId: string; certId: string; onClose: () => void }) {
  const { db } = useCompliance();
  const person = db.people.find((p) => p.id === personId)!;
  const { proof, error, pick } = useProofPick();
  return (
    <Box
      title={`Proof of ${row.item} for ${person.name}`}
      onClose={onClose}
      disabled={!proof}
      saveLabel="Attach proof"
      save={() => {
        if (proof) addCertProof(personId, certId, proof);
        toast(`Proof attached to ${person.name}'s ${row.item}`);
      }}
    >
      <p className="text-[0.93rem] text-muted">In date to {row.due ? dFull(row.due) : "-"}. A photo of the card or a PDF of the certificate, kept against the ticket for audits.</p>
      <ProofField pick={pick} proof={proof} error={error} />
    </Box>
  );
}

/** A card photo sent from the site phone: the office reads the new expiry off it and accepts it, or turns it down. */
function CardCheck({ row, personId, certId, onClose }: { row: ComplianceRow; personId: string; certId: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const person = db.people.find((p) => p.id === personId)!;
  const cert = person.certs.find((c) => c.id === certId)!;
  const [expires, setExpires] = useState(renewedTo(row.item, day));
  return (
    <Box
      title={`${person.name} sent a new ${row.item}`}
      onClose={onClose}
      disabled={expires <= day}
      saveLabel="Accept the card"
      save={() => {
        checkTicketPhoto(personId, certId, { expires });
        toast(`${row.item} for ${person.name} renewed to ${dFull(expires)}, card attached`);
      }}
      extra={
        <Button
          variant="ghost"
          className="mr-auto"
          onClick={() => {
            checkTicketPhoto(personId, certId, null);
            toast(`Card turned down. ${person.name} is asked to send it again`);
            onClose();
          }}
        >
          Turn it down
        </Button>
      }
    >
      {cert.sentPhoto && <img src={cert.sentPhoto.dataUrl} alt={`New ${row.item} sent by ${person.name}`} className="mx-auto max-h-[40dvh] rounded-md border border-line" />}
      <p className="text-[0.93rem] text-muted">Sent from the site phone {cert.sentPhoto ? dFull(cert.sentPhoto.sentAt.slice(0, 10)) : ""}. Check the name and the dates on the card before accepting it.</p>
      <DateField label="Expiry date on the card" value={expires} min={addDays(day, 1)} onChange={setExpires} />
    </Box>
  );
}

function LicenceForm({ row, personId, onClose }: { row: ComplianceRow; personId: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const person = db.people.find((p) => p.id === personId)!;
  const [categories, setCategories] = useState(person.licence?.categories ?? "B");
  const [expires, setExpires] = useState(person.licence && person.licence.expires > day ? person.licence.expires : addDays(day, 365 * 10));
  const { proof, error, pick } = useProofPick();
  return (
    <Box
      title={`Check ${person.name}'s driving licence`}
      onClose={onClose}
      disabled={!categories.trim() || expires <= day}
      saveLabel="Save the check"
      save={() => {
        checkLicence(personId, { categories, expires }, proof);
        toast(`${person.name}'s licence checked today${said(proof)}`);
      }}
    >
      <p className="text-[0.93rem] text-muted">{row.whoSub}. Checked once a year: look at the licence itself and take a copy of both sides.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Categories">{(id) => <input id={id} className="field" value={categories} onChange={(e) => setCategories(e.target.value)} />}</Field>
        <DateField label="Licence runs out" value={expires} min={addDays(day, 1)} onChange={setExpires} />
      </div>
      <ProofField pick={pick} proof={proof} error={error} hint="A photo of both sides of the licence." />
      <NoProof proof={proof} />
    </Box>
  );
}

function VehicleForm({ row, vehicleId, item, onClose }: { row: ComplianceRow; vehicleId: string; item: "tax" | "test" | "insurance"; onClose: () => void }) {
  const { db, day } = useCompliance();
  const v = db.vehicles.find((x) => x.id === vehicleId)!;
  const [expires, setExpires] = useState(addDays(day, 365));
  const [amount, setAmount] = useState(String(v.compliance[item].amount || ""));
  const { proof, error, pick } = useProofPick();
  const paid = Number(amount.replace(/[€£,\s]/g, ""));
  const bad = !Number.isFinite(paid) || paid < 0;
  return (
    <Box
      title={`Renew ${row.item.toLowerCase()}, ${v.reg}`}
      onClose={onClose}
      disabled={expires <= day || bad}
      saveLabel="Save renewal"
      save={() => {
        renewVehicle(vehicleId, item, expires, paid, proof);
        toast(`${row.item} for ${v.reg} renewed to ${dFull(expires)}${said(proof)}`);
      }}
    >
      {row.blocks && <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">{v.reg} may not be driven until this is renewed.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="New expiry date" value={expires} min={addDays(day, 1)} onChange={setExpires} />
        <Field label="Amount paid">{(id) => <input id={id} className="field" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />}</Field>
      </div>
      {bad && <p className="text-[0.93rem] text-bad">The amount paid should be a number, such as 1250.</p>}
      <ProofField pick={pick} proof={proof} error={error} hint="A photo or PDF of the disc, certificate or insurance schedule." />
      <NoProof proof={proof} />
    </Box>
  );
}

function ServiceForm({ row, id, vehicle, onClose }: { row: ComplianceRow; id: string; vehicle: boolean; onClose: () => void }) {
  const [note, setNote] = useState("");
  return (
    <Box
      title={`Record a service, ${row.who}`}
      onClose={onClose}
      saveLabel="Record service"
      save={() => {
        if (vehicle) recordVehicleService(id, note);
        else recordPlantService(id, note);
        toast(`Service recorded for ${row.who.split(" ")[0]}. The next one is counted from today`);
      }}
    >
      <p className="text-[0.93rem] text-muted">
        {row.item}. {row.approx ? "Counted from the meter: the next date is worked out from typical weekly use." : "Counted from the date."}
      </p>
      <Field label="What was done" hint="Optional.">
        {(fid) => <input id={fid} className="field" placeholder="Oil, filters, belts checked" value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Box>
  );
}

const CHECK_MONTHS: Record<string, number> = { "Harness inspection": 6, "Electrical safety test": 6, "Thorough examination": 12, "Tower inspection": 12, Insurance: 12 };

function CheckForm({ row, plantId, renewalId, onClose }: { row: ComplianceRow; plantId: string; renewalId: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const x = db.plant.find((p) => p.id === plantId)!;
  const r = x.renewals.find((y) => y.id === renewalId)!;
  const [expires, setExpires] = useState(addDays(day, Math.round((CHECK_MONTHS[r.kind] ?? 12) * 30.4)));
  const { proof, error, pick } = useProofPick();
  return (
    <Box
      title={`Renew ${r.kind.toLowerCase()}, ${x.assetRef}`}
      onClose={onClose}
      disabled={expires <= day}
      saveLabel="Save renewal"
      save={() => {
        renewPlantCert(plantId, renewalId, expires, proof);
        toast(`${r.kind} for ${x.assetRef} renewed to ${dFull(expires)}${said(proof)}`);
      }}
    >
      {row.blocks && <p className="rounded-md bg-bad-soft px-2.5 py-2 text-[0.93rem] text-bad">{x.assetRef} {row.siteIds.length ? "may not be used on site" : "cannot go to a site"} until this is renewed.</p>}
      <DateField label="New expiry date" value={expires} min={addDays(day, 1)} onChange={setExpires} hint="From the certificate or the inspection report." />
      <ProofField pick={pick} proof={proof} error={error} hint="A photo or PDF of the certificate or report." />
      <NoProof proof={proof} />
    </Box>
  );
}

/** The weekly inspection of a scaffold or tower. Also used on the project's scaffold register. */
export function InspectForm({ scaffoldId, title, onClose }: { scaffoldId: string; title: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const s = db.scaffolds.find((x) => x.id === scaffoldId)!;
  const [safe, setSafe] = useState(true);
  const [note, setNote] = useState("");
  return (
    <Box
      title={title}
      onClose={onClose}
      disabled={!safe && !note.trim()}
      saveLabel={safe ? "Record: safe to use" : "Record: not safe to use"}
      save={() => {
        inspectScaffold(scaffoldId, safe ? "Safe to use" : "Not safe to use", note);
        toast(safe ? `${s.ref} inspected and safe to use. Next due in 7 days` : `${s.ref} tagged not safe to use`);
      }}
    >
      <p className="text-[0.93rem] text-muted">
        {s.description}. Put up by {s.erectedBy === "Own team" ? "our own team" : s.erectedBy} on {dFull(s.erectedOn)}.{" "}
        {s.inspections[0] ? `Last inspected ${dFull(s.inspections[0].date)} by ${s.inspections[0].by}.` : "Not inspected yet."}
        {scaffoldUnsafe(s) && " It is tagged not safe to use."}
      </p>
      <fieldset>
        <legend className="mb-1 text-[0.93rem] font-medium">Result</legend>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2">
            <input type="radio" name="result" checked={safe} onChange={() => setSafe(true)} /> Safe to use
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="result" checked={!safe} onChange={() => setSafe(false)} /> Not safe to use
          </label>
        </div>
      </fieldset>
      <Field label="What was seen" hint={safe ? "Optional." : "Say what is wrong, so the erector can put it right."}>
        {(id) => <input id={id} className="field" placeholder={safe ? "Ties, boards, guard rails and toe boards checked" : "Two ties missing at the third lift"} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Box>
  );
}

function CompanyForm({ row, paperId, onClose }: { row: ComplianceRow; paperId: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const c = db.companyPapers.find((x) => x.id === paperId)!;
  const [expires, setExpires] = useState(addDays(c.expires > day ? c.expires : day, 365));
  const [reference, setReference] = useState(c.reference);
  const [cover, setCover] = useState(c.cover ?? "");
  const { proof, error, pick } = useProofPick();
  return (
    <Box
      title={`Renew ${c.name.charAt(0).toLowerCase()}${c.name.slice(1)}`}
      onClose={onClose}
      disabled={expires <= day}
      saveLabel="Save renewal"
      save={() => {
        renewCompanyPaper(paperId, { expires, reference, cover }, proof);
        toast(`${c.name} renewed to ${dFull(expires)}${said(proof)}`);
      }}
    >
      <p className="text-[0.93rem] text-muted">{row.whoSub}.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Runs to" value={expires} min={addDays(day, 1)} onChange={setExpires} />
        <Field label="Reference">{(id) => <input id={id} className="field" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        {c.cover !== undefined && <Field label="Cover">{(id) => <input id={id} className="field" value={cover} onChange={(e) => setCover(e.target.value)} />}</Field>}
      </div>
      <ProofField pick={pick} proof={proof} error={error} hint="A PDF of the schedule or certificate." />
      <NoProof proof={proof} />
    </Box>
  );
}

function SubPaperForm({ row, subId, paper, projectId, onClose }: { row: ComplianceRow; subId: string; paper: "Public liability" | "Employers' liability" | "Safety statement" | "Method statement"; projectId?: string; onClose: () => void }) {
  const { db, day } = useCompliance();
  const s = db.subcontractors.find((x) => x.id === subId)!;
  const rams = paper === "Method statement";
  const [expires, setExpires] = useState(addDays(day, 365));
  const [reference, setReference] = useState("");
  const [cover, setCover] = useState(paper === "Employers' liability" ? "€13m" : paper === "Public liability" ? "€6.5m" : "");
  const { proof, error, pick } = useProofPick();
  const code = db.projects.find((p) => p.id === projectId)?.code;
  return (
    <Box
      title={rams ? `${s.name}: method statement for ${code}` : `${s.name}: ${paper.toLowerCase()}${paper === "Safety statement" ? "" : " insurance"}`}
      onClose={onClose}
      disabled={!rams && expires <= day}
      saveLabel="Save"
      save={() => {
        recordSubPaper(subId, { kind: paper, projectId, expires: rams ? undefined : expires, reference: reference || (rams ? `RAMS for ${code}` : ""), cover }, "Email", proof);
        toast(`${row.item} recorded for ${s.name}${said(proof)}`);
      }}
    >
      <p className="text-[0.93rem] text-muted">For a paper that came by email. {s.contactName} can also send it through their portal.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {!rams && <DateField label={paper === "Safety statement" ? "Next review due" : "Runs to"} value={expires} min={addDays(day, 1)} onChange={setExpires} />}
        <Field label="Reference">{(id) => <input id={id} className="field" placeholder={rams ? `RAMS for ${code}` : "Policy number"} value={reference} onChange={(e) => setReference(e.target.value)} />}</Field>
        {(paper === "Public liability" || paper === "Employers' liability") && <Field label="Cover">{(id) => <input id={id} className="field" value={cover} onChange={(e) => setCover(e.target.value)} />}</Field>}
      </div>
      <ProofField pick={pick} proof={proof} error={error} hint="A PDF of the schedule, statement or method statement." />
      <NoProof proof={proof} />
    </Box>
  );
}

function WorkerForm({ row, subId, workerId, onClose }: { row: ComplianceRow; subId: string; workerId: string; onClose: () => void }) {
  const { db, day, words } = useCompliance();
  const s = db.subcontractors.find((x) => x.id === subId)!;
  const w = s.workers.find((x) => x.id === workerId)!;
  const [expires, setExpires] = useState(renewedTo(words.safetyCard, day));
  const { proof, error, pick } = useProofPick();
  return (
    <Box
      title={`${w.name}, ${s.name}: renewed ${words.safetyCard}`}
      onClose={onClose}
      disabled={expires <= day}
      saveLabel="Save renewal"
      save={() => {
        recordSubWorker(subId, workerId, w.name, expires, proof);
        toast(`${words.safetyCard} for ${w.name} to ${dFull(expires)}${said(proof)}`);
      }}
    >
      <p className="text-[0.93rem] text-muted">{row.whoSub}. Their {words.safetyCard} runs out {dFull(w.safePassExpires)}.</p>
      <DateField label="New expiry date" value={expires} min={addDays(day, 1)} onChange={setExpires} />
      <ProofField pick={pick} proof={proof} error={error} />
      <NoProof proof={proof} />
    </Box>
  );
}
