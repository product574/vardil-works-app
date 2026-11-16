import { Eye, EyeSlash } from "@phosphor-icons/react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { DEMO_BUILT_BY, DEMO_BUILT_BY_URL } from "@/config/brand";
import { ROLES } from "@/data/roles";
import { useDb, usePrefs } from "@/data/store";
import { Avatar, Button, cx, useOnce } from "@/ui";
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
function Frame({ children }: { children: ReactNode }) {
  const brand = usePrefs((s) => s.brand);
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

export function RolePage() {
  const navigate = useNavigate();
  const gate = useGate();
  const setRole = usePrefs((s) => s.setRole);
  const brand = usePrefs((s) => s.brand);
  const people = useDb((db) => db.people);

  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  const email = signedInEmail();

  return (
    <Frame>
      <div className="w-full max-w-xl">
        <h1 className="text-[1.9rem] leading-tight">Who are you signing in as?</h1>
        <p className="mt-1 text-muted">Each person at {brand.brandName} sees the parts of the system their job needs. You can switch at any time.</p>
        {email && <p className="mt-1 text-muted">You are signed in to the demo as {email}.</p>}

        <ul className="mt-5 divide-y divide-line border-y border-line">
          {ROLES.map((r) => {
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
      </div>
    </Frame>
  );
}
