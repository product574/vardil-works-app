import { Eye, EyeSlash } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { DEMO_BUILT_BY, DEMO_BUILT_BY_URL } from "@/config/brand";
import { ROLES } from "@/data/roles";
import { useDb, usePrefs } from "@/data/store";
import { Avatar, Button, cx, Dialog, useOnce } from "@/ui";
import { staff } from "./staff";
import { useAllowedLevels, useWorkspace } from "./workspace";
import { authMode, isSignedIn, signedInEmail, signIn, signOut, usingDefaultLogin } from "./auth";

/** Asks the gate once whether this browser is already signed in. Null while it is checking. */
export function useGate() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void isSignedIn().then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

/** The two-panel frame shared by the sign-in page and the role page. */
function Frame({ children, plain }: { children: ReactNode; plain?: boolean }) {
  const own = usePrefs((s) => s.brand);
  // A closed demo is no longer the client's or ABC's: it says Vardil (decision 210).
  const brand = plain ? { ...own, logoUrl: "", brandName: DEMO_BUILT_BY, legalName: DEMO_BUILT_BY, tagline: "Operations for construction firms" } : own;
  return (
    <div className="grid min-h-dvh bg-surface md:grid-cols-[minmax(18rem,2fr)_3fr]">
      <aside className="blueprint flex flex-col justify-between gap-10 px-8 py-8 text-white md:px-10 md:py-10">
        <div>
          {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.legalName} className="h-12 w-auto" /> : <p className="font-display text-[2.4rem] leading-none font-semibold">{brand.brandName}</p>}
          <p className="mt-3 max-w-[26ch] text-[1.1rem] text-white/85">{brand.tagline}</p>
        </div>
        <p className="text-[0.93rem] text-white/75">
          A working demonstration with sample data. Built by{" "}
          <a href={DEMO_BUILT_BY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-white underline underline-offset-2 hover:no-underline">
            {DEMO_BUILT_BY}
          </a>
          .
        </p>
      </aside>
      <main className="flex items-center px-6 py-10 md:px-14">{children}</main>
    </div>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const gate = useGate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const [submit, busy] = useOnce(async () => {
    setError("");
    const res = await signIn(username, password);
    if (res.ok) navigate("/who", { replace: true });
    else setError(res.message);
  });

  if (gate === true) return <Navigate to="/who" replace />;
  // On the hosted demo Cloudflare does the sign-in before the app loads, so arriving here
  // means it could not confirm who this is: the sign-in ran out, or the address is wrong.
  if (authMode === "access") return gate === null ? null : <SignInAgain />;

  return (
    <Frame>
      <form
        className="w-full max-w-sm"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <h1 className="text-[1.9rem] leading-tight">Sign in to the demo</h1>
        <p className="mt-1 text-muted">Use the username and password you were sent.</p>

        <label htmlFor="username" className="mt-6 mb-1 block font-medium">
          Username
        </label>
        <input id="username" name="username" className={cx("field h-11", error && "border-bad")} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }} />

        <label htmlFor="password" className="mt-4 mb-1 block font-medium">
          Password
        </label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} className={cx("field h-11 pr-11", error && "border-bad")} autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="press absolute top-1 right-1 grid size-9 place-items-center rounded text-muted hover:text-ink">
            {show ? <EyeSlash size={18} /> : <Eye size={18} />}
          </button>
        </div>

        <p role="alert" aria-live="polite" className={cx("mt-3 min-h-6 text-bad", error && "fade-in")}>
          {error}
        </p>

        <Button type="submit" variant="primary" size="lg" className="mt-1 w-full" disabled={busy}>
          {busy ? "Checking" : "Sign in"}
        </Button>

        {usingDefaultLogin && <p className="mt-4 text-[0.93rem] text-muted">No password has been set for this copy yet. The default is username demo, password demo.</p>}
      </form>
    </Frame>
  );
}

/** Shown on the hosted demo when Cloudflare cannot confirm the sign-in. Reloading asks again. */
function SignInAgain() {
  return (
    <Frame>
      <div className="w-full max-w-sm">
        <h1 className="text-[1.9rem] leading-tight">Sign in to the demo</h1>
        <p className="mt-1 text-muted">We could not confirm your sign-in. It may have run out, or this may not be the address you were sent. Reload the page to sign in with your email again.</p>
        <Button variant="primary" size="lg" className="mt-6 w-full" onClick={() => window.location.reload()}>
          Reload the page
        </Button>
      </div>
    </Frame>
  );
}

/**
 * Shown instead of the demo when a prospect's demo is over (decision 210): they became a client,
 * said no, or it passed its end date. Nothing else of the demo is drawn.
 */
export function DemoEnded() {
  return (
    <Frame plain>
      <div className="w-full max-w-sm">
        <h1 className="text-[1.9rem] leading-tight">This demo has ended</h1>
        <p className="mt-2 text-muted">Thank you for taking a look. If you would like to see it again, or to talk about using it for real, email hello@vardil.com and we will open it for you.</p>
        <Button className="mt-6" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Frame>
  );
}

/** Why a prospect's sign-ins are recorded, in a few lines (GDPR, Article 13), behind a small link on the role page. */
function DemoPrivacy() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="mt-3 block text-[0.87rem] text-muted underline underline-offset-2 hover:text-ink" onClick={() => setOpen(true)}>
        How Vardil uses your sign-in
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="How Vardil uses your sign-in">
        <div className="grid gap-2">
          <p>Vardil Ltd keeps a record of when you open this demo and which parts of it you look at, against the email you signed in with.</p>
          <p>We use it to follow up with you about the demo, which is in our legitimate interest as the company offering it. It is not shared with anyone else.</p>
          <p>It is kept for up to a year, and deleted sooner when your demo is closed and you ask us to. Everything you type or change in the demo stays in your own browser and is not sent to us.</p>
          <p>To see what we hold, have it deleted, or object to it, email hello@vardil.com. You can also complain to the Data Protection Commission (Ireland) or the ICO (UK).</p>
        </div>
      </Dialog>
    </>
  );
}

export function RolePage() {
  const navigate = useNavigate();
  const gate = useGate();
  const setRole = usePrefs((s) => s.setRole);
  const brand = usePrefs((s) => s.brand);
  const people = useDb((db) => db.people);
  const allowed = useAllowedLevels();
  const isClient = useWorkspace((s) => s.config !== null) && !staff.is;
  const roles = allowed ? ROLES.filter((r) => allowed.includes(r.key)) : ROLES;
  const only = roles.length === 1 ? roles[0]! : null;

  // Someone given one level goes straight in as it (decision 210).
  useEffect(() => {
    if (gate === true && only) {
      setRole(only.key);
      navigate(only.home, { replace: true });
    }
  }, [gate, only, setRole, navigate]);

  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  if (only) return null;
  const email = signedInEmail();

  return (
    <Frame>
      <div className="w-full max-w-xl">
        <h1 className="text-[1.9rem] leading-tight">Who are you signing in as?</h1>
        <p className="mt-1 text-muted">Each person at {brand.brandName} sees the parts of the system their job needs. You can switch at any time.</p>
        {email && <p className="mt-1 text-muted">You are signed in to the demo as {email}.</p>}

        <ul className="mt-5 divide-y divide-line border-y border-line">
          {staff.ui && (
            <li>
              <staff.ui.RoleEntry onPick={() => navigate("/vardil", { replace: true })} />
            </li>
          )}
          {roles.map((r) => {
            const person = people.find((p) => p.id === r.personId);
            return (
              <li key={r.key}>
                <button
                  type="button"
                  onClick={() => {
                    setRole(r.key);
                    navigate(r.home, { replace: true });
                  }}
                  className="press flex w-full items-center gap-3 px-2 py-3 text-left hover:bg-accent-soft"
                >
                  <Avatar name={person?.name ?? r.title} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {r.title}
                      {person && <span className="font-normal text-muted">, {person.name}</span>}
                    </span>
                    <span className="block text-[0.93rem] text-muted">{r.does}</span>
                  </span>
                  <span className="text-[0.93rem] font-medium text-accent-ink">Sign in</span>
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="mt-5 text-[0.93rem] text-muted underline underline-offset-2 hover:text-ink"
          onClick={() => {
            setRole(null);
            void signOut().then((done) => {
              if (done === "signed-out") navigate("/sign-in", { replace: true });
            });
          }}
        >
          Leave the demo
        </button>
        {isClient && <DemoPrivacy />}
      </div>
    </Frame>
  );
}
