/**
 * The phone app for the people on site (Oisin, 20 Nov), in the main offering: one app whose home
 * screen follows the person's role. Operatives get big tiles (his pick B); a site manager gets his
 * sites with the timesheet for each, what waits for his yes or no, and the same tiles without My
 * week and My hours. Sign-in is by the number on the employee register: the office sends the
 * invite, the first time a one-time code (shown on the phone in the demo), then their own password,
 * then fingerprint if they want it. English first; other languages per firm come later.
 */
import { ArrowLeft, CalendarBlank, CalendarDots, CalendarPlus, Camera, CaretRight, Certificate, Clock, Fingerprint, HandPalm, IdentificationCard, Invoice, Ladder, ListChecks, Megaphone, Package, Phone, PlusCircle, Receipt, SunHorizon, Tray, Truck, UserMinus, Wrench } from "@phosphor-icons/react";
import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/data/access";
import { actAs, decideExpense, nowStamp, enterPhoneCode, sendPhoneCode, setPhoneBiometrics, setPhonePassword, signOutPhone, tryPhonePassword } from "@/data/actions";
import { useData, useDay, usePrefs } from "@/data/store";
import type { Db, Expense, Person, Project } from "@/data/types";
import { bookingFor, stateOf, ticketBlocks, vehicleBlocks } from "@/lib/compliance";
import { money2, REGION } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { dShort, plural, when } from "@/lib/format";
import { CODE_MINUTES, codesLeft, hashPassword, isLocked, maskPhone, MIN_PASSWORD, onPhoneApp, passwordProblem, personByPhone, sessionOpen, SESSION_DAYS } from "@/lib/phone-auth";
import { crewRequests } from "@/lib/requests";
import { dayInstruction, dayRoster, managerJobs, siteOn, workingDays } from "@/lib/roster";
import { requestLeave } from "@/data/actions";
import { Badge, Button, cx, DeclineNote, Dialog, Field, PageBody, PageHead, Switch } from "@/ui";
import { toast } from "@/ui/toast";
import { CheckLine } from "./fleet-sheets";
import { OvertimeClaimsSheet, HoursSheet } from "./hours";
import { cannotWork, CannotWorkSheet, CrewRequestsSheet, InstructionsSheet, ScaffoldSheet, scaffoldsDue, SiteMonthSheet, SiteWeekSheet, SubInvoiceSheet, subsWaiting, TimeSheet, WeekendSheet } from "./ManagerPhone";
import { DeliveriesSheet, ordersComing, SnagsSheet, snagsOpen } from "./job-sheets";
import { MyCerts, RepairSheet } from "./one-sheets";
import { OfficeFeed } from "./OfficeFeed";
import { PhoneFrame } from "./PhoneFrame";
import { AskSheet, DrivingSheet, ExpenseSheet, ExtraSheet, longDate, ManagerCard, MyClaims, PhotoSheet, ProfileButton } from "./sheets";
import { LicenceSheet } from "./fleet-sheets";
import { WeekSheet } from "./SiteView";

/** The Site phone screen for the main offering: the office picks whose phone to look at; someone on site sees their own. */
export function PhoneAppView() {
  const db = useData((s) => s.db);
  const day = useDay();
  const role = usePrefs((s) => s.role);
  const access = useAccess();
  const operativeId = usePrefs((s) => s.operativeId);
  const setOperative = usePrefs((s) => s.setOperative);
  const everyone = db.people.filter(onPhoneApp).sort((a, b) => a.name.localeCompare(b.name));
  const own = role === "operative" ? operativeId : role === "site" ? access.personId : null;
  const [pick, setPick] = useState(operativeId);
  const me = everyone.find((p) => p.id === (own ?? pick)) ?? everyone[0];
  const office = !own;
  if (!me) return null;
  return (
    <>
      <PageHead title="Site phone view" note={office ? "The phone app for the people on site. Its home screen follows their role: operatives get big buttons, site managers get their sites and approvals. Pick anyone to see their phone." : "What you see on your own phone."} />
      <PageBody className={cx("grid items-start gap-6", office && "min-[90rem]:grid-cols-[auto_minmax(0,1fr)]")}>
        <div className="grid w-full justify-items-center gap-2 sm:w-auto">
          {office && (
            <label className="flex min-h-11 items-center gap-2 text-[0.93rem]">
              <span className="text-muted">Phone of</span>
              <select aria-label="Whose phone to look at" className="field w-auto max-w-[17rem]" value={me.id} onChange={(e) => { setPick(e.target.value); if (everyone.find((p) => p.id === e.target.value)?.kind === "Operative") setOperative(e.target.value); }}>
                {everyone.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}, {p.kind === "Operative" ? p.trade : "Site manager"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <PhoneFrame label="Phone app">
            <PhoneApp key={me.id} owner={me} day={day} />
          </PhoneFrame>
        </div>
        {office && <OfficeFeed day={day} />}
      </PageBody>
    </>
  );
}

/**
 * The app on its own, with nothing of the office around it (21 Nov): what the packaged iPhone and
 * Android app shows, built with `npm run build:phone`. It opens on the sign-in by mobile number,
 * for whoever last used this phone. It fills the screen and keeps clear of the notch and the
 * home bar. Still sample data kept on the phone: the real server comes before the public stores.
 */
export function StandalonePhone() {
  const db = useData((s) => s.db);
  const day = useDay();
  const operativeId = usePrefs((s) => s.operativeId);
  const everyone = db.people.filter(onPhoneApp).sort((a, b) => a.name.localeCompare(b.name));
  const owner = everyone.find((p) => p.id === operativeId) ?? everyone[0];
  if (!owner) return null;
  return (
    <div className="site-app mx-auto grid min-h-dvh w-full max-w-[32rem] bg-canvas" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }} data-app="phone">
      <PhoneApp key={owner.id} owner={owner} day={day} />
    </div>
  );
}

const nowStampLocal = nowStamp;

/** One phone: signed in or not, then the home screen for whoever is signed in. */
function PhoneApp({ owner, day }: { owner: Person; day: string }) {
  const db = useData((s) => s.db);
  const [who, setWho] = useState(owner.id);
  const me = db.people.find((p) => p.id === who) ?? owner;
  const acc = db.phoneAccounts.find((a) => a.personId === me.id);
  const now = nowStampLocal();
  // Fingerprint opens the app each time it is opened, while the 30 days last.
  const [unlocked, setUnlocked] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  // Once signing in has started it runs to its end (the fingerprint question comes after the session opens).
  const [inFlow, setInFlow] = useState(false);
  const start = useCallback(() => setInFlow(true), []);
  if (inFlow || !me.active || !sessionOpen(acc, now)) return <SignIn owner={owner} onStart={start} onIn={(id) => { setWho(id); setUnlocked(true); setUsePassword(false); setInFlow(false); }} />;
  if (acc?.biometrics && !unlocked && !usePassword) return <Unlock me={me} onUnlock={() => setUnlocked(true)} onPassword={() => { signOutPhone(me.id); setUsePassword(true); }} />;
  const manager = me.kind === "Management" || me.level === "site";
  return manager ? <ManagerHome me={me} day={day} /> : <OperativeHome me={me} day={day} />;
}

// ── Signing in ────────────────────────────────────────────────────────────────

type Step = { s: "number" } | { s: "password"; id: string } | { s: "code"; id: string; purpose: "setup" | "reset"; shown: string } | { s: "new"; id: string } | { s: "finger"; id: string };

const SCREEN = "grid min-h-full content-start gap-4 bg-canvas px-5 py-8";

function SignIn({ owner, onStart, onIn }: { owner: Person; onStart: () => void; onIn: (personId: string) => void }) {
  const db = useData((s) => s.db);
  const brand = usePrefs((s) => s.brand);
  const [step, setStep] = useState<Step>({ s: "number" });
  const [number, setNumber] = useState(owner.phone);
  const [secret, setSecret] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => onStart(), [onStart]);
  const person = (id: string) => db.people.find((p) => p.id === id)!;
  const reset = (next: Step) => {
    setSecret("");
    setAgain("");
    setError("");
    setStep(next);
  };
  const code = (id: string, purpose: "setup" | "reset") => {
    const c = sendPhoneCode(id, purpose);
    if (!c) {
      setError("Three codes have gone to this phone in the last hour. Wait a while, or ask the office.");
      return;
    }
    reset({ s: "code", id, purpose, shown: c });
  };
  const head = (title: string, line?: string) => (
    <div>
      <p className="text-body text-muted">{brand.brandName}</p>
      <h2 className="text-page font-semibold">{title}</h2>
      {line && <p className="mt-1 text-muted">{line}</p>}
    </div>
  );
  const err = error && (
    <p role="alert" className="rounded-card bg-bad-soft px-3 py-2 text-bad">
      {error}
    </p>
  );

  if (step.s === "number")
    return (
      <form
        className={SCREEN}
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          const p = personByPhone(db.people, number);
          if (!p || !onPhoneApp(p)) return setError(`This number is not on ${brand.brandName}'s employee list. Ask the office to check the number they have for you.`);
          const acc = db.phoneAccounts.find((a) => a.personId === p.id);
          if (!acc?.invitedAt) return setError("The office has not sent you an invite yet. Ask them to press Send invite.");
          if (acc.passwordHash) return reset({ s: "password", id: p.id });
          code(p.id, "setup");
        }}
      >
        {head("Sign in", "With the mobile number your employer has for you.")}
        <Field label="Mobile number">{(id) => <input id={id} className="field h-12 text-title" inputMode="tel" autoComplete="tel" value={number} onChange={(e) => setNumber(e.target.value)} />}</Field>
        {err}
        <Button size="lg" variant="primary" type="submit" disabled={number.replace(/\D/g, "").length < 7}>
          Next
        </Button>
        <p className="text-detail text-muted">Only the office can change the number they have for you.</p>
      </form>
    );

  if (step.s === "code") {
    const p = person(step.id);
    const acc = db.phoneAccounts.find((a) => a.personId === p.id);
    const left = codesLeft(acc, nowStampLocal());
    return (
      <form
        className={SCREEN}
        onSubmit={(e) => {
          e.preventDefault();
          const r = enterPhoneCode(p.id, secret);
          if (r === "ok") return reset({ s: "new", id: p.id });
          setSecret("");
          setError(r === "expired" ? "That code has run out. Send a new one." : r === "locked" ? "Too many wrong tries. Wait 15 minutes, then try again." : "That code is not right. Check the text and try again.");
        }}
      >
        {head(step.purpose === "setup" ? `Welcome, ${p.name.split(" ")[0]}` : "Reset your password", `We have texted a 6 digit code to ${maskPhone(p.phone)}. It lasts ${CODE_MINUTES} minutes.`)}
        <p className="rounded-card border border-dashed border-line-strong bg-surface px-3 py-2 text-body" aria-label="Demo: the text message">
          <span className="text-muted">Demo, in place of the text: </span>
          <span className="font-medium tabular-nums">{step.shown}</span>
        </p>
        <Field label="Code">{(id) => <input id={id} className="field h-12 text-title tracking-[0.3em] tabular-nums" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={secret} onChange={(e) => setSecret(e.target.value)} />}</Field>
        {err}
        <Button size="lg" variant="primary" type="submit" disabled={secret.replace(/\D/g, "").length !== 6}>
          Check code
        </Button>
        <Button size="lg" disabled={left === 0} onClick={() => code(p.id, step.purpose)}>
          {left === 0 ? "No more codes this hour" : `Send a new code (${left} left this hour)`}
        </Button>
        <Button variant="ghost" onClick={() => reset({ s: "number" })}>
          Back
        </Button>
      </form>
    );
  }

  if (step.s === "new") {
    const p = person(step.id);
    const problem = passwordProblem(secret, p.name);
    return (
      <form
        className={SCREEN}
        onSubmit={async (e) => {
          e.preventDefault();
          if (problem) return setError(problem);
          if (secret !== again) return setError("The two passwords are not the same.");
          setBusy(true);
          const ok = setPhonePassword(p.id, await hashPassword(p.id, secret));
          setBusy(false);
          if (!ok) return reset({ s: "number" });
          reset({ s: "finger", id: p.id });
        }}
      >
        {head("Set your password", "You will use it to sign in on a new phone, or if fingerprint does not work.")}
        <Field label="New password" hint={`At least ${MIN_PASSWORD} characters. Three words you will remember work well.`}>
          {(id) => <input id={id} type="password" className="field h-12" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} />}
        </Field>
        <Field label="Type it again">{(id) => <input id={id} type="password" className="field h-12" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />}</Field>
        {secret && problem && <p className="text-body text-warn">{problem}</p>}
        {err}
        <Button size="lg" variant="primary" type="submit" disabled={busy || !secret || !again}>
          Save password
        </Button>
      </form>
    );
  }

  if (step.s === "finger") {
    const p = person(step.id);
    return (
      <div className={SCREEN}>
        {head("Use fingerprint or Face ID?", "Then the app opens with a touch or a look. Your password still works if it does not.")}
        <Fingerprint size={64} className="justify-self-center text-muted" aria-hidden="true" />
        <Button size="lg" variant="primary" onClick={() => { setPhoneBiometrics(p.id, true); onIn(p.id); }}>
          Turn on fingerprint
        </Button>
        <Button size="lg" onClick={() => { setPhoneBiometrics(p.id, false); onIn(p.id); }}>
          Not now
        </Button>
      </div>
    );
  }

  // Password
  const p = person(step.id);
  const acc = db.phoneAccounts.find((a) => a.personId === p.id);
  const locked = isLocked(acc, nowStampLocal());
  return (
    <form
      className={SCREEN}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = tryPhonePassword(p.id, await hashPassword(p.id, secret));
        setBusy(false);
        setSecret("");
        if (r.ok) return onIn(p.id);
        setError(r.locked ? `Too many wrong tries. Try again after ${r.until?.slice(11, 16)}, or reset your password with a code.` : `That password is not right. ${plural(r.left, "try", "tries")} left before it locks for 15 minutes.`);
      }}
    >
      {head(`Hello, ${p.name.split(" ")[0]}`, maskPhone(p.phone))}
      <Field label="Password">{(id) => <input id={id} type="password" className="field h-12" autoComplete="current-password" value={secret} disabled={locked} onChange={(e) => setSecret(e.target.value)} />}</Field>
      {err}
      <Button size="lg" variant="primary" type="submit" disabled={busy || locked || !secret}>
        Sign in
      </Button>
      <Button size="lg" onClick={() => code(p.id, "reset")}>
        Forgot password? Get a code
      </Button>
      <Button variant="ghost" onClick={() => reset({ s: "number" })}>
        Not you? Use another number
      </Button>
    </form>
  );
}

function Unlock({ me, onUnlock, onPassword }: { me: Person; onUnlock: () => void; onPassword: () => void }) {
  const brand = usePrefs((s) => s.brand);
  return (
    <div className={cx(SCREEN, "justify-items-center text-center")}>
      <p className="text-body text-muted">{brand.brandName}</p>
      <h2 className="text-page font-semibold">{me.name}</h2>
      <button type="button" className="press grid justify-items-center gap-2 rounded-card border border-line bg-surface px-8 py-6" onClick={onUnlock}>
        <Fingerprint size={64} aria-hidden="true" />
        <span className="font-medium">Unlock with fingerprint</span>
      </button>
      <Button variant="ghost" onClick={onPassword}>
        Use password instead
      </Button>
    </div>
  );
}

// ── Home screens ──────────────────────────────────────────────────────────────

type Sheet = "week" | "hours" | "holidays" | "receipt" | "repair" | "tickets" | "ask" | "driving" | "licence" | "photo" | "extra" | "me" | "manager" | null;

const TILE = "press grid min-h-24 content-center justify-items-center gap-1.5 rounded-card border border-line bg-surface px-2 py-3 text-center text-title font-medium";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

function Header({ me, day, onMe }: { me: Person; day: string; onMe: () => void }) {
  const brand = usePrefs((s) => s.brand);
  return (
    <div className="border-b border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-2">
        <ProfileButton name={me.name} label="Me" onClick={onMe} />
        <p className="text-body text-muted">{longDate(day)}</p>
      </div>
      <h1 className="text-page font-semibold">
        {greeting()}, {me.name.split(" ")[0]}
      </h1>
      <p className="text-body">
        {me.kind === "Operative" ? me.trade : "Site manager"}, {brand.brandName}
      </p>
    </div>
  );
}

/** A van out of date (Compliance and Fleet): the driver is told not to drive it. */
function VanNotice({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const region = usePrefs((s) => s.brand.region);
  if (!useAccess().apps.on("fleet")) return null;
  const van = db.vehicles.find((v) => v.active && v.driverId === me.id);
  if (!van) return null;
  const gone = vehicleBlocks(van, day);
  const due = (["tax", "test", "insurance"] as const).filter((k) => stateOf(van.compliance[k].expiryDate, day) === "due");
  if (gone.length === 0 && due.length === 0) return null;
  const R = REGION[region];
  const label = (k: "tax" | "test" | "insurance") => (k === "tax" ? R.roadTax : k === "test" ? R.vehicleTest : "Insurance");
  return (
    <div className={cx("rounded-card px-3 py-3", gone.length ? "bg-bad-soft text-bad" : "bg-warn-soft text-warn")} role="status">
      <p className="font-medium">
        Your van, <span className="font-mono">{van.reg}</span>: {gone.length ? `${gone.map(label).join(", ")} ran out` : due.map((k) => `${label(k)} due by ${dShort(van.compliance[k].expiryDate)}`).join(", ")}
      </p>
      {gone.length > 0 && <p className="mt-0.5">Do not drive it. Ring the office.</p>}
    </div>
  );
}

function CannotWork({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const blocks = ticketBlocks(me, day);
  if (blocks.length === 0) return null;
  const booked = bookingFor(db.courses, me.id, blocks[0]!.ticket);
  return (
    <div className="rounded-card bg-bad-soft px-3 py-3 text-bad" role="status">
      <p className="font-medium">{blocks.map((b) => (b.expires ? `${b.ticket} ran out ${dShort(b.expires)}` : `${b.ticket} missing`)).join(", ")}</p>
      <p className="mt-0.5">You cannot work on site until it is renewed. Send a photo of the new card from My tickets.</p>
      {booked && <p className="mt-0.5">Booked on the course on {dShort(booked.date)}</p>}
    </div>
  );
}

/** The tiles both homes share. Operatives also get My week and My hours (Oisin, 20 Nov). */
function Tiles({ me, operative, open, onSite }: { me: Person; operative: boolean; open: (s: Sheet) => void; /** With Projects on, an operative on a site today also sends photos and extra work from it. */ onSite?: boolean }) {
  const db = useData((s) => s.db);
  const apps = useAccess().apps;
  const fleetOn = apps.on("fleet");
  const projectsOn = apps.on("projects");
  const day = useDay();
  const waiting = (n: number) => n > 0 && <Badge tone="accent">{n}</Badge>;
  const leave = db.holidays.filter((h) => h.personId === me.id && h.status === "Requested").length;
  const receipts = db.expenses.filter((x) => x.personId === me.id && x.status !== "Declined" && !x.paidAt).length;
  const repairs = db.repairs.filter((r) => r.personId === me.id && r.status !== "Fixed").length;
  const claims = db.overtimeClaims.filter((c) => c.personId === me.id && c.status === "Waiting").length;
  const general = db.requests.filter((r) => r.projectId === null && r.requestedById === me.id && r.status === "Open").length;
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {operative && (
          <button type="button" className={TILE} onClick={() => open("week")}>
            <CalendarBlank size={28} className="text-muted" aria-hidden="true" /> My week
          </button>
        )}
        {operative && (
          <button type="button" className={TILE} onClick={() => open("hours")}>
            <Clock size={28} className="text-muted" aria-hidden="true" />
            <span>My hours {waiting(claims)}</span>
          </button>
        )}
        <button type="button" className={TILE} onClick={() => open("holidays")}>
          <SunHorizon size={28} className="text-muted" aria-hidden="true" />
          <span>Holidays {waiting(leave)}</span>
        </button>
        <button type="button" className={TILE} onClick={() => open("receipt")}>
          <Receipt size={28} className="text-muted" aria-hidden="true" />
          <span>Receipt {waiting(receipts)}</span>
        </button>
        <button type="button" className={TILE} onClick={() => open("repair")}>
          <Wrench size={28} className="text-muted" aria-hidden="true" />
          <span>Report a repair {waiting(repairs)}</span>
        </button>
        <button type="button" className={TILE} onClick={() => open("tickets")}>
          <Certificate size={28} className="text-muted" aria-hidden="true" /> My tickets
        </button>
        {operative && projectsOn && onSite && (
          <button type="button" className={TILE} onClick={() => open("photo")}>
            <Camera size={28} className="text-muted" aria-hidden="true" /> Send a photo
          </button>
        )}
        {operative && projectsOn && onSite && (
          <button type="button" className={TILE} onClick={() => open("extra")}>
            <PlusCircle size={28} className="text-muted" aria-hidden="true" /> Report extra work
          </button>
        )}
        {fleetOn && (
          <button type="button" className={TILE} onClick={() => open("licence")}>
            <IdentificationCard size={28} className="text-muted" aria-hidden="true" /> Send a licence
          </button>
        )}
        <button type="button" className={TILE} onClick={() => open("ask")}>
          <HandPalm size={28} className="text-muted" aria-hidden="true" />
          <span>Make a request {waiting(general)}</span>
        </button>
      </div>
      {fleetOn && (
        <button type="button" className={cx(TILE, "grid-flow-col justify-start gap-3 text-left")} onClick={() => open("driving")}>
          <Truck size={28} className="text-muted" aria-hidden="true" />
          <span>
            Driving check
            <CheckLine me={me} day={day} />
          </span>
        </button>
      )}
    </>
  );
}

function OperativeHome({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const live = new Set(db.projects.filter((p) => p.status === "Live").map((p) => p.id));
  const mine = db.assignments.filter((a) => a.personId === me.id && live.has(a.projectId)).map((a) => db.projects.find((p) => p.id === a.projectId)!);
  const site = db.projects.find((p) => p.id === siteOn(me.id, day, db.attendance, db.plan, live)) ?? mine[0] ?? null;
  const manager = db.people.find((p) => p.id === site?.siteManagerId);
  const note = dayInstruction(db.dayInstructions, site?.id, day);
  return (
    <div className="min-h-full w-full bg-canvas">
      <Header me={me} day={day} onMe={() => setSheet("me")} />
      <div className="grid gap-3 px-4 py-4">
        <CannotWork me={me} day={day} />
        <VanNotice me={me} day={day} />
        <section className="grid gap-2" aria-label="Today">
          {site ? (
            <>
              <div className="rounded-card border border-line bg-surface px-3 py-3">
                <p className="text-body text-muted">Today you are at</p>
                <p className="font-medium">
                  <span className="font-mono">{site.code}</span> {site.name}
                </p>
                {manager && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button type="button" aria-label={`Site manager: ${manager.name}`} className="text-link min-w-0 flex-1 text-left" onClick={() => setSheet("manager")}>
                      {manager.name}, site manager
                    </button>
                    <a href={`tel:${manager.phone.replace(/\s/g, "")}`} className="press inline-flex min-h-10 items-center gap-1.5 rounded-card border border-line-strong bg-surface px-3 font-medium">
                      <Phone size={16} aria-hidden="true" /> Call
                    </a>
                  </div>
                )}
              </div>
              {note && (
                <div className="rounded-card border border-line bg-surface px-3 py-3" aria-label="Today's instructions">
                  <p className="font-medium">Today's instructions</p>
                  <p className="mt-1 leading-relaxed">{note.text}</p>
                  <p className="mt-1.5 text-detail text-muted">
                    {note.by}, {note.at.slice(11, 16)}
                  </p>
                </div>
              )}
              {site.siteInstructions && (
                <div className="rounded-card border border-line bg-surface px-3 py-3">
                  <p className="font-medium">Site instructions</p>
                  <p className="mt-1 leading-relaxed">{site.siteInstructions}</p>
                </div>
              )}
            </>
          ) : (
            <p className="rounded-card border border-line bg-surface px-3 py-3 text-muted">You are not down for a site today. Your site manager will tell you where to go.</p>
          )}
        </section>
        <Tiles me={me} operative open={setSheet} onSite={!!site} />
      </div>
      <Sheets me={me} day={day} site={site} sites={mine} sheet={sheet} close={close} toManager />
      {sheet === "manager" && site && manager && <ManagerCard manager={manager} site={site} lang="en" onClose={close} />}
    </div>
  );
}

type ManagerSheet = "overtime" | "receipts" | "crew" | null;

function ManagerHome({ me, day }: { me: Person; day: string }) {
  const db = useData((s) => s.db);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [approve, setApprove] = useState<ManagerSheet>(null);
  const [siteOpen, setSiteOpen] = useState<Project | null>(null);
  const sites = managerJobs(db.projects, me.id, db.siteAccess).filter((p) => p.status === "Live");
  const ids = new Set(sites.map((s) => s.id));
  const w = waitingFor(db, me, ids);
  // A site opens as a screen of its own on the phone, as an app does (with Projects on it carries the whole job).
  if (siteOpen) return <JobScreen site={siteOpen} me={me} day={day} onBack={() => setSiteOpen(null)} />;
  return (
    <div className="min-h-full w-full bg-canvas">
      <Header me={me} day={day} onMe={() => setSheet("me")} />
      <div className="grid gap-3 px-4 py-4">
        <CannotWork me={me} day={day} />
        <section aria-label="My sites today">
          <h3 className="mb-1.5 text-title font-semibold">My sites today</h3>
          {sites.length === 0 ? (
            <p className="text-muted">You are not running a site at the moment. The office sets your sites in Admin, Site access.</p>
          ) : (
            <ul className="grid gap-2">
              {sites.map((s) => {
                const st = siteToday(db, s.id, day);
                return (
                  <li key={s.id}>
                    <button type="button" className="press flex min-h-14 w-full items-center gap-2 rounded-card border border-line-strong bg-surface px-3 py-2 text-left" onClick={() => setSiteOpen(s)}>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium"><span className="font-mono">{s.code}</span> {s.name}</span>
                        <span className="block text-detail text-muted">
                          {peopleLine(st)}
                          {s.siteManagerId !== me.id && `. Run by ${db.people.find((x) => x.id === s.siteManagerId)?.name}, given to you by the office`}
                        </span>
                        <SiteBadges db={db} me={me} siteId={s.id} day={day} />
                      </span>
                      <Badge tone={st.state === "sent" ? "ok" : st.state === "todo" ? "warn" : "neutral"}>{st.state === "sent" ? "Sent" : st.state === "todo" ? "Timesheet to do" : "Nothing to mark"}</Badge>
                      <CaretRight size={16} className="text-muted" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section aria-label="Waiting for you">
          <h3 className="mb-1.5 text-title font-semibold">Waiting for you</h3>
          <div className="grid gap-2">
            {(
              [
                ["overtime", "Overtime claims", w.overtime],
                ["receipts", "Reimbursements", w.receipts],
                ["crew", "Crew requests", w.crew],
              ] as const
            ).map(([k, label, n]) => (
              <button key={k} type="button" className="press flex min-h-12 items-center gap-2 rounded-card border border-line-strong bg-surface px-3 text-left" onClick={() => setApprove(k)}>
                <span className="min-w-0 flex-1">{label}</span>
                {n > 0 ? <Badge tone="accent">{n}</Badge> : <span className="text-detail text-muted">None</span>}
              </button>
            ))}
          </div>
        </section>
        <h3 className="-mb-1.5 text-title font-semibold">For you</h3>
        <Tiles me={me} operative={false} open={setSheet} />
      </div>
      <Sheets me={me} day={day} site={null} sites={sites} sheet={sheet} close={() => setSheet(null)} />
      {approve === "overtime" && <OvertimeClaimsSheet site={sites} me={me} day={day} onClose={() => setApprove(null)} />}
      {approve === "crew" && <CrewRequestsSheet site={sites} me={me} day={day} onClose={() => setApprove(null)} />}
      {approve === "receipts" && <ReceiptsToApprove sites={sites} me={me} day={day} onClose={() => setApprove(null)} />}
    </div>
  );
}

/** On a site's card: who cannot work, and what waits for him there. */
function SiteBadges({ db, me, siteId, day }: { db: Db; me: Person; siteId: string; day: string }) {
  const w = waitingFor(db, me, new Set([siteId]));
  const blocked = cannotWork(db, siteId, day).length;
  if (!blocked && !w.overtime && !w.receipts && !w.crew) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1.5">
      {blocked > 0 && <Badge tone="bad">{plural(blocked, "person", "people")} cannot work</Badge>}
      {w.crew > 0 && <Badge tone="warn">{plural(w.crew, "request")} from the crew</Badge>}
      {w.overtime > 0 && <Badge tone="accent">{plural(w.overtime, "overtime claim")}</Badge>}
      {w.receipts > 0 && <Badge tone="accent">{plural(w.receipts, "receipt")}</Badge>}
    </span>
  );
}

/** What waits for a site manager's yes or no, on the sites he runs. */
export function waitingFor(db: Db, me: Person, ids: Set<string>) {
  return {
    overtime: db.overtimeClaims.filter((c) => c.status === "Waiting" && ids.has(c.projectId)).length,
    receipts: receiptsFor(db, me, ids).length,
    crew: crewRequests(db.requests, ids).length,
  };
}

/** Reimbursements claimed for his sites by someone else, waiting for a yes or no. His own go to the office. */
function receiptsFor(db: Db, me: Person, ids: Set<string>): Expense[] {
  return db.expenses.filter((x) => x.status === "Waiting" && x.personId !== me.id && x.projectId !== null && ids.has(x.projectId));
}

/** A site's day: who is on it (the timesheet once anyone is marked, else the plan, as everywhere), and whether today's time is sent. */
export function siteToday(db: Db, siteId: string, day: string) {
  const r = dayRoster(db.attendance, db.plan, siteId, day, day);
  const marks = db.attendance.filter((a) => a.projectId === siteId && a.date === day && a.status !== "restday");
  const state: "sent" | "todo" | "none" = r.rows.length === 0 ? "none" : marks.length > 0 && marks.every((a) => a.sent) ? "sent" : "todo";
  return { planned: r.rows.length, onSite: r.from === "timesheet", state };
}

/** "6 people on site today" once marked, else "6 people down for today". */
const peopleLine = (st: { planned: number; onSite: boolean }) => (st.planned === 0 ? "Nobody planned today" : `${plural(st.planned, "person", "people")} ${st.onSite ? "on site today" : "down for today"}`);

type JobSheet = "time" | "overtime" | "receipts" | "crew" | "weekend" | "week" | "month" | "notes" | "cannot" | "scaffolds" | "subs" | "photo" | "extra" | "ask" | "snags" | "orders" | null;

/**
 * One site on a site manager's phone. Always: the timesheet and what waits for him on it. With
 * the Projects app on (Oisin, 20 Nov: the two phones become this app too), the whole job as his
 * phone had it: overtime time stamps, week and month ahead, instructions, who cannot work,
 * scaffold inspections, subcontractor invoices, photos, extra work and requests.
 */
function JobScreen({ site, me, day, onBack }: { site: Project; me: Person; day: string; onBack: () => void }) {
  const db = useData((s) => s.db);
  const projects = useAccess().apps.on("projects");
  const [sheet, setSheet] = useState<JobSheet>(null);
  const close = () => setSheet(null);
  const w = waitingFor(db, me, new Set([site.id]));
  const st = siteToday(db, site.id, day);
  const note = dayInstruction(db.dayInstructions, site.id, day);
  const blocked = cannotWork(db, site.id, day).length;
  const coming = ordersComing(db, site.id);
  const row = (k: JobSheet, label: string, Icon: typeof Clock, extra?: React.ReactNode, sub?: string) => (
    <button key={k} type="button" className="press flex min-h-14 items-center gap-3 rounded-card border border-line-strong bg-surface px-3 py-2 text-left" onClick={() => setSheet(k)}>
      <Icon size={22} className="shrink-0 text-muted" aria-hidden="true" />
      <span className="min-w-0 flex-1 font-medium">
        {label}
        {sub && <span className="block text-detail font-normal text-muted">{sub}</span>}
      </span>
      {extra}
    </button>
  );
  const count = (n: number, tone: "accent" | "warn" | "bad" = "accent") => (n > 0 ? <Badge tone={tone}>{n}</Badge> : null);
  return (
    <div className="min-h-full w-full bg-canvas">
      <div className="border-b border-line bg-surface px-4 py-3">
        <button type="button" onClick={onBack} className="press -ml-1 mb-1 inline-flex min-h-9 items-center gap-1 rounded-card px-1 text-body">
          <ArrowLeft size={16} aria-hidden="true" /> All my sites
        </button>
        <h1 className="text-page font-semibold">
          <span className="font-mono">{site.code}</span> {site.name}
        </h1>
        <p className="text-body text-muted">
          {site.location}. {peopleLine(st)}
        </p>
      </div>
      <div className="grid gap-2 px-4 py-4">
        <button type="button" className="press flex min-h-14 items-center gap-3 rounded-card bg-accent-strong px-3 text-left font-medium text-white" onClick={() => setSheet("time")}>
          <Clock size={22} aria-hidden="true" />
          <span className="flex-1">Timesheet</span>
          <span className="text-detail font-normal">{st.state === "sent" ? "Sent today" : st.state === "todo" ? "To do today" : ""}</span>
        </button>
        {projects && row("weekend", "Overtime time stamp", CalendarPlus, undefined, "Saturday, Sunday or a bank holiday")}
        <h2 className="mt-2 text-title font-semibold">Waiting for you</h2>
        {row("overtime", "Overtime claims", Clock, count(w.overtime))}
        {row("receipts", "Reimbursements", Receipt, count(w.receipts))}
        {row("crew", "Crew requests", Tray, count(w.crew, "warn"))}
        {projects && row("subs", "Invoices to approve", Invoice, count(subsWaiting(db, site.id).length))}
        {projects && (
          <>
            <h2 className="mt-2 text-title font-semibold">The job</h2>
            {row("week", "Week ahead", CalendarBlank)}
            {row("month", "Month ahead", CalendarDots)}
            {row("notes", "Site instructions", Megaphone, undefined, note ? "Up for today" : "Nothing up for today")}
            {row("cannot", "Who cannot work", UserMinus, count(blocked, "bad"))}
            {row("scaffolds", "Scaffold inspections", Ladder, count(scaffoldsDue(db, site.id, day), "warn"))}
            {row("snags", "Snags", ListChecks, count(snagsOpen(db, site.id), "warn"), "Add one, or mark one fixed")}
            {row("orders", "Orders and deliveries", Package, coming.some((o) => o.dueOn < day) ? count(coming.length, "bad") : count(coming.length), "Mark a delivery as arrived")}
            {row("photo", "Send a photo", Camera)}
            {row("extra", "Report extra work", PlusCircle)}
            {row("ask", "Make a request", HandPalm, undefined, "For this site. It goes to the office")}
          </>
        )}
      </div>
      {sheet === "time" && <TimeSheet site={site} me={me} day={day} app onClose={close} />}
      {sheet === "overtime" && <OvertimeClaimsSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "receipts" && <ReceiptsToApprove sites={[site]} me={me} day={day} onClose={close} />}
      {sheet === "crew" && <CrewRequestsSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "weekend" && <WeekendSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "week" && <SiteWeekSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "month" && <SiteMonthSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "notes" && <InstructionsSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "cannot" && <CannotWorkSheet site={site} day={day} onClose={close} />}
      {sheet === "scaffolds" && <ScaffoldSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "subs" && <SubInvoiceSheet site={site} me={me} day={day} onClose={close} />}
      {sheet === "photo" && <PhotoSheet site={site} me={me} lang="en" onClose={close} />}
      {sheet === "extra" && <ExtraSheet site={site} me={me} lang="en" onClose={close} />}
      {sheet === "ask" && <AskSheet site={site} me={me} lang="en" day={day} onClose={close} />}
      {sheet === "snags" && <SnagsSheet site={site} me={me} onClose={close} />}
      {sheet === "orders" && <DeliveriesSheet site={site} me={me} day={day} onClose={close} />}
    </div>
  );
}

/**
 * A site manager's yes or no to reimbursements claimed on his sites (Oisin, 20 Nov). A yes puts
 * it on the office's Ready to be paid list (Admin, Requests); the office marks it paid once the
 * money has gone, and the worker sees Waiting, Approved, Paid.
 */
function ReceiptsToApprove({ sites, me, day, onClose }: { sites: Project[]; me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const ids = new Set(sites.map((s) => s.id));
  const list = receiptsFor(db, me, ids);
  const answered = db.expenses.filter((x) => x.status !== "Waiting" && x.decidedBy === me.name && (x.decidedAt ?? "") >= addDays(day, -14));
  const [yes, setYes] = useState<Expense | null>(null);
  const [no, setNo] = useState<Expense | null>(null);
  const [note, setNote] = useState("");
  const name = (id: string) => db.people.find((p) => p.id === id)?.name ?? "";
  const code = (id: string | null) => db.projects.find((p) => p.id === id)?.code ?? "";
  return (
    <>
      <Dialog open onClose={onClose} title="Reimbursements to approve">
        <div className="grid gap-4">
          {list.length === 0 ? (
            <p className="text-muted">Nothing is waiting. When someone on your sites sends a receipt, it comes here for your yes or no.</p>
          ) : (
            <ul className="grid gap-3" aria-label="Reimbursements waiting">
              {list.map((x) => (
                <li key={x.id} className="grid gap-2 rounded-card border border-line-strong bg-surface p-3">
                  <p className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 font-medium">{name(x.personId)}</span>
                    <span className="font-mono font-medium">{money2(x.amount)}</span>
                  </p>
                  <p className="text-body text-muted">
                    {x.kind}: {x.what}. {code(x.projectId)}, paid {dShort(x.date)}. Sent {when(x.createdAt, day)}.
                  </p>
                  {x.receipt ? <img src={x.receipt.dataUrl} alt={`Receipt from ${name(x.personId)}`} className="max-h-40 justify-self-start rounded-card border border-line" /> : <p className="text-detail text-muted">No photo of the receipt.</p>}
                  <div className="flex justify-end gap-2">
                    <Button size="lg" onClick={() => { setNote(""); setNo(x); }}>
                      Decline
                    </Button>
                    <Button size="lg" variant="primary" onClick={() => setYes(x)}>
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {answered.length > 0 && (
            <section>
              <h3 className="mb-1 text-title">You answered</h3>
              <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-label="Reimbursements you answered">
                {answered.map((x) => (
                  <li key={x.id} className="flex items-center gap-2 px-3 py-2 text-body">
                    <span className="min-w-0 flex-1">
                      {name(x.personId)}, {money2(x.amount)}
                      {x.status === "Declined" && <DeclineNote note={x.declineNote} />}
                    </span>
                    <Badge tone={x.paidAt ? "ok" : x.status === "Approved" ? "accent" : "neutral"}>{x.paidAt ? "Paid" : x.status === "Approved" ? "Ready to be paid" : "Declined"}</Badge>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </Dialog>
      {yes && (
        <Dialog
          open
          onClose={() => setYes(null)}
          title="Approve this reimbursement?"
          footer={
            <>
              <Button size="lg" onClick={() => setYes(null)}>
                Cancel
              </Button>
              <Button
                size="lg"
                variant="primary"
                onClick={() => {
                  actAs(me.id, () => decideExpense(yes.id, true));
                  toast(`Approved. ${money2(yes.amount)} for ${name(yes.personId)} is on the office's Ready to be paid list`);
                  setYes(null);
                }}
              >
                Confirm approval
              </Button>
            </>
          }
        >
          <p>
            {name(yes.personId)}, {money2(yes.amount)} for {yes.what.toLowerCase()}. It goes on the office's Ready to be paid list, and they mark it paid once the money has gone.
          </p>
        </Dialog>
      )}
      {no && (
        <Dialog
          open
          onClose={() => setNo(null)}
          title="Decline this reimbursement?"
          footer={
            <>
              <Button size="lg" onClick={() => setNo(null)}>
                Back
              </Button>
              <Button
                size="lg"
                variant="primary"
                onClick={() => {
                  actAs(me.id, () => decideExpense(no.id, false, note));
                  toast(`Declined. ${name(no.personId)} sees it on their phone`);
                  setNo(null);
                }}
              >
                Decline
              </Button>
            </>
          }
        >
          <Field label="Note (optional)" hint="Say why, if it helps. They see it on their phone.">
            {(id) => <input id={id} className="field h-11" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />}
          </Field>
        </Dialog>
      )}
    </>
  );
}

// ── The sheets behind the tiles ───────────────────────────────────────────────

function Sheets({ me, day, site, sites, sheet, close, toManager }: { me: Person; day: string; site: Project | null; sites: Project[]; sheet: Sheet; close: () => void; toManager?: boolean }) {
  return (
    <>
      {sheet === "week" && <WeekSheet me={me} lang="en" day={day} onClose={close} />}
      {sheet === "hours" && <HoursSheet me={me} day={day} onClose={close} />}
      {sheet === "holidays" && <HolidaySheet me={me} day={day} onClose={close} />}
      {sheet === "receipt" && <ExpenseSheet me={me} day={day} siteId={site?.id ?? sites[0]?.id ?? null} sites={sites} onClose={close} toSiteManager={toManager} />}
      {sheet === "repair" && <RepairSheet me={me} onClose={close} />}
      {sheet === "tickets" && (
        <Dialog open onClose={close} title="My tickets">
          <MyCerts me={me} day={day} />
        </Dialog>
      )}
      {sheet === "ask" && <AskSheet site={toManager ? site : null} me={me} lang="en" day={day} toManager={toManager && !!site} onClose={close} />}
      {sheet === "driving" && <DrivingSheet me={me} day={day} onClose={close} />}
      {sheet === "licence" && <LicenceSheet me={me} day={day} onClose={close} />}
      {sheet === "photo" && site && <PhotoSheet site={site} me={me} lang="en" onClose={close} />}
      {sheet === "extra" && site && <ExtraSheet site={site} me={me} lang="en" onClose={close} />}
      {sheet === "me" && <MeSheet me={me} onClose={close} />}
    </>
  );
}

function HolidaySheet({ me, day, onClose }: { me: Person; day: string; onClose: () => void }) {
  const db = useData((s) => s.db);
  const [from, setFrom] = useState(addDays(day, 14));
  const [to, setTo] = useState(addDays(day, 18));
  const [note, setNote] = useState("");
  const leave = db.holidays.filter((h) => h.personId === me.id && h.to >= addDays(day, -30)).sort((a, b) => a.from.localeCompare(b.from));
  return (
    <Dialog
      open
      onClose={onClose}
      title="Holidays"
      footer={
        <>
          <Button size="lg" onClick={onClose}>
            Close
          </Button>
          <Button
            size="lg"
            variant="primary"
            disabled={to < from}
            onClick={() => {
              actAs(me.id, () => requestLeave(me.id, from, to, note));
              toast(`Holiday request sent: ${plural(workingDays(from, to), "working day")}`);
              setNote("");
            }}
          >
            Ask for these days
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="First day off">{(id) => <input id={id} type="date" className="field h-11" min={addDays(day, 1)} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Last day off">{(id) => <input id={id} type="date" className="field h-11" min={from} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <Field label="Reason (optional)">{(id) => <input id={id} className="field h-11" value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {to < from ? <p className="text-bad">The last day is before the first day.</p> : <p className="text-body text-muted">{plural(workingDays(from, to), "working day")}. You see the answer here.</p>}
        <section>
          <h3 className="mb-1 text-title">My holidays</h3>
          {leave.length === 0 ? (
            <p className="text-muted">None booked.</p>
          ) : (
            <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-label="My holidays">
              {leave.map((h) => (
                <li key={h.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="flex-1">
                    {dShort(h.from)}
                    {h.to !== h.from && ` to ${dShort(h.to)}`}
                    {h.status === "Declined" && <DeclineNote note={h.declineNote} />}
                  </span>
                  <Badge tone={h.status === "Approved" ? "ok" : h.status === "Declined" ? "bad" : "accent"}>{h.status === "Requested" ? "Waiting" : h.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Dialog>
  );
}

function MeSheet({ me, onClose }: { me: Person; onClose: () => void }) {
  const db = useData((s) => s.db);
  const acc = db.phoneAccounts.find((a) => a.personId === me.id);
  return (
    <Dialog open onClose={onClose} title="Me">
      <div className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
          <dt className="text-muted">Name</dt>
          <dd>{me.name}</dd>
          <dt className="text-muted">Mobile</dt>
          <dd>
            {me.phone}
            <span className="block text-detail text-muted">Only the office can change it.</span>
          </dd>
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{me.email}</dd>
          {me.sageNo && (
            <>
              <dt className="text-muted">Employee no.</dt>
              <dd className="font-mono">{me.sageNo}</dd>
            </>
          )}
        </dl>
        <div className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5">
          <Fingerprint size={22} className="text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            Fingerprint or Face ID
            <span className="block text-detail text-muted">Opens the app without your password.</span>
          </span>
          <Switch on={!!acc?.biometrics} label="Fingerprint or Face ID" onChange={() => setPhoneBiometrics(me.id, !acc?.biometrics)} />
        </div>
        {acc?.signedInUntil && <p className="text-body text-muted">Signed in on this phone until {dShort(acc.signedInUntil.slice(0, 10))}. You stay signed in for {SESSION_DAYS} days.</p>}
        <MyClaims me={me} />
        <Button
          size="lg"
          variant="danger"
          className="w-full"
          onClick={() => {
            signOutPhone(me.id);
            onClose();
          }}
        >
          Sign out of the app
        </Button>
      </div>
    </Dialog>
  );
}
