/**
 * The interface kit. Every screen is built from these pieces so the whole app stays consistent.
 * Rules for using them are in DESIGN.md.
 */
import clsx from "clsx";
import { type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";

export const cx = clsx;

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

/** One `primary` per view. `outline` is the default for everything else. */
export function Button({ variant = "outline", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-2.5 text-[0.87rem]",
        size === "md" && "h-9 px-3.5 text-[0.93rem]",
        size === "lg" && "h-11 px-5 text-base",
        variant === "primary" && "bg-accent-strong text-white hover:brightness-110",
        variant === "outline" && "border border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-ink",
        variant === "ghost" && "text-muted hover:bg-accent-soft hover:text-accent-ink",
        variant === "danger" && "border border-line-strong bg-surface text-bad hover:border-bad hover:bg-bad-soft",
        className,
      )}
      {...rest}
    />
  );
}

/** Wraps a handler so a second press is ignored while the first is still running. */
export function useOnce<A extends unknown[]>(fn: (...args: A) => void | Promise<void>) {
  const busy = useRef(false);
  const [running, setRunning] = useState(false);
  const run = useCallback(
    async (...args: A) => {
      if (busy.current) return;
      busy.current = true;
      setRunning(true);
      try {
        await fn(...args);
      } finally {
        busy.current = false;
        setRunning(false);
      }
    },
    [fn],
  );
  return [run, running] as const;
}

// ── Badge ─────────────────────────────────────────────────────────────────────

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";
const TONE: Record<Tone, string> = {
  neutral: "bg-side text-muted",
  accent: "bg-accent-soft text-accent-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

/** A status that changes. Never used as decoration. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded px-1.5 py-0.5 text-[0.87rem] leading-tight font-medium whitespace-nowrap", TONE[tone], className)}>{children}</span>;
}

/** A small count beside a navigation item. */
export function Count({ n, tone = "accent" }: { n: number; tone?: Tone }) {
  if (n <= 0) return null;
  return <span className={cx("ml-auto inline-flex min-w-5 justify-center rounded px-1 text-[0.87rem] leading-5 font-medium", TONE[tone])}>{n}</span>;
}

// ── Page furniture ────────────────────────────────────────────────────────────

/** The top of every screen: what it is, an optional line of context, and its actions. */
export function PageHead({ title, note, actions, children }: { title: string; note?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-surface px-5 pt-4 pb-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[1.45rem] leading-tight">{title}</h1>
        {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {note && <p className="mt-1 max-w-[75ch] text-muted">{note}</p>}
      {children}
    </header>
  );
}

export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-5 py-4", className)}>{children}</div>;
}

/** A titled block within a page. Grouped by spacing; the panel variant adds a surface for tables and lists. */
export function Section({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {(title || aside) && (
        <div className="mb-2 flex items-baseline gap-3">
          {title && <h2 className="text-[1.08rem]">{title}</h2>}
          {aside && <div className="ml-auto text-[0.93rem] text-muted">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("overflow-hidden rounded-lg border border-line bg-surface", className)}>{children}</div>;
}

/** What to show when a list has nothing in it: what that means and what to do next. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-[52ch] text-muted">{children}</p>}
    </div>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx("press h-8 rounded px-3 text-[0.93rem] font-medium", o.value === value ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink")}
        >
          {o.label}
          {o.count != null && <span className="ml-1.5 font-normal opacity-80">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[0.93rem] font-medium">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[0.87rem] text-muted">{hint}</p>}
    </div>
  );
}

// ── Dialog ────────────────────────────────────────────────────────────────────

/** A modal built on the browser's own <dialog>, so Escape, focus trapping and the backdrop come free. */
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  // A dialog taken off the page while still open as a modal can leave Chrome refusing to start a
  // drag anywhere (found 17 Nov on the week ahead), so close it on the way out. That close is ours,
  // not the person's, so it must not be reported as one: in development React runs every effect
  // twice, and reporting it shut each dialog the moment it opened (`npm run dev` only, 17 Nov).
  const ours = useRef(false);
  useEffect(() => {
    const el = ref.current;
    return () => {
      if (el?.open) {
        ours.current = true;
        el.close();
      }
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (ours.current) ours.current = false;
        else onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx("rise-in m-auto w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/40", wide ? "max-w-3xl" : "max-w-lg")}
    >
      {open && (
        <>
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <h2 className="text-[1.15rem]">{title}</h2>
            <button type="button" aria-label="Close" onClick={onClose} className="press ml-auto grid size-8 place-items-center rounded-md text-muted hover:bg-accent-soft hover:text-accent-ink">
              <X size={18} />
            </button>
          </div>
          <div className="max-h-[70dvh] overflow-y-auto px-4 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────

/** A small popover that opens from its trigger and closes on outside click or Escape. */
export function Menu({ trigger, children, align = "right", label }: { trigger: ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className="press flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent-soft">
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          style={{ ["--pop-origin" as string]: align === "right" ? "top right" : "top left" }}
          className={cx("pop-in absolute top-full z-40 mt-1.5 min-w-60 rounded-lg border border-line bg-surface p-1.5 shadow-pop", align === "right" ? "right-0" : "left-0")}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: "bad" }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cx("flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-accent-soft", tone === "bad" ? "text-bad" : "hover:text-accent-ink")}>
      {children}
    </button>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────────────

/** A person's initials in a circle. Used for people only, never for decoration. */
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w) && !/^(Rev\.|Fr\.|Mr|Mrs|and)$/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(13, size * 0.4) }} className="inline-grid shrink-0 place-items-center rounded-full bg-accent-soft font-medium text-accent-ink">
      {letters}
    </span>
  );
}

/** Label and value on one line, for record headers and detail lists. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(6.5rem,9.5rem)_minmax(0,1fr)] gap-3 border-b border-line py-1.5 last:border-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

const LINK = "text-accent-ink underline-offset-2 hover:underline";

/** A phone number that rings when clicked. */
export function Tel({ number, className }: { number: string; className?: string }) {
  return (
    <a href={`tel:${number.replace(/\s/g, "")}`} className={cx(LINK, "whitespace-nowrap", className)}>
      {number}
    </a>
  );
}

/** An email address that opens a new message. In a narrow column it breaks after the @, never mid-word. */
export function Mail({ address, className }: { address: string; className?: string }) {
  const [local, domain] = address.split("@");
  return (
    <a href={`mailto:${address}`} className={cx(LINK, className)}>
      {local}@<wbr />
      {domain}
    </a>
  );
}

/** An on/off control for settings that take effect straight away. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className={cx("press relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-accent-strong" : "bg-line-strong")}>
      <span className={cx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white transition-transform duration-150 ease-out", on && "translate-x-4")} />
    </button>
  );
}

/**
 * A number box that lets someone type freely ("12.", "0.5") and reports the number as they go.
 * A plain controlled input would rewrite "12." to "12" mid-keystroke and make decimals untypeable.
 */
export function NumInput({ value, onChange, label, className }: { value: number; onChange: (n: number) => void; label: string; className?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    // Follow outside changes (a reset, an edit elsewhere) without fighting the person's typing.
    setText((t) => (Number(t) === value ? t : String(value)));
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={cx("field h-8 text-right", className)}
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(/[^\d.]/g, "");
        setText(next);
        onChange(Number(next) || 0);
      }}
      onBlur={() => setText(String(value))}
    />
  );
}
