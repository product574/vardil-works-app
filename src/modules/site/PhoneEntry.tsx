/**
 * The site app at its own address (21 Nov): /app lists whose phone to open, /app/<person> is that
 * person's phone, full screen, with no office around it. Same Cloudflare sign-in as the office, so a
 * Vardil email gets in; there is no role page. In the real build each person signs in with their own
 * number and password instead of picking from a list (decision 211).
 */
import { CaretRight } from "@phosphor-icons/react";
import { useEffect } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useGate } from "@/app/AuthPages";
import { useData, usePrefs } from "@/data/store";
import { onPhoneApp } from "@/lib/phone-auth";
import { Toaster } from "@/ui/toast";
import { StandalonePhone } from "./PhoneApp";

function useOnPhone() {
  return useData((s) => s.db.people).filter(onPhoneApp).sort((a, b) => a.name.localeCompare(b.name));
}

export function PhonePicker() {
  const gate = useGate();
  const brand = usePrefs((s) => s.brand);
  const people = useOnPhone();
  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  const managers = people.filter((p) => p.kind === "Management" || p.level === "site" || p.isSiteManager);
  const crew = people.filter((p) => !managers.includes(p));
  const list = (title: string, rows: typeof people) => (
    <section aria-label={title} className="grid gap-2">
      <h2 className="text-title font-semibold">{title}</h2>
      <ul className="grid gap-1.5">
        {rows.map((p) => (
          <li key={p.id}>
            <Link to={`/app/${p.id}`} className="flex items-center gap-3 rounded-card border border-line bg-surface px-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{p.name}</span>
                <span className="block text-detail text-muted">{p.trade}</span>
              </span>
              <CaretRight className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
  return (
    <main className="site-app mx-auto grid min-h-dvh w-full max-w-[32rem] content-start gap-5 bg-canvas px-5 py-8" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
      <div>
        <p className="text-body text-muted">{brand.brandName} site app</p>
        <h1 className="text-page font-semibold">Whose phone?</h1>
        <p className="mt-1 text-muted">Pick a person to see the app as they would. On a real phone each person signs in with their own number.</p>
      </div>
      {list("Site managers", managers)}
      {list("Operatives", crew)}
    </main>
  );
}

export function PhoneOf() {
  const gate = useGate();
  const { personId } = useParams();
  const people = useOnPhone();
  const setOperative = usePrefs((s) => s.setOperative);
  const found = people.some((p) => p.id === personId);
  useEffect(() => {
    if (found && personId) setOperative(personId);
  }, [found, personId, setOperative]);
  if (gate === null) return null;
  if (gate === false) return <Navigate to="/sign-in" replace />;
  if (!found) return <Navigate to="/app" replace />;
  return (
    <>
      <StandalonePhone key={personId} personId={personId} />
      <Toaster />
    </>
  );
}
