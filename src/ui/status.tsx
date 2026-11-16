import type { EnquiryStatus, Project, ProjectStatus, QuoteStatus } from "@/data/types";
import { Badge, cx, type Tone } from "./index";

const QUOTE: Record<QuoteStatus, Tone> = { Draft: "neutral", "Awaiting approval": "accent", Sent: "neutral", Opened: "accent", Queried: "warn", Accepted: "ok", Declined: "bad" };
const PROJECT: Record<ProjectStatus, Tone> = { "Not started": "neutral", Live: "ok", Complete: "accent", Invoiced: "neutral", Closed: "neutral" };
const ENQUIRY: Record<EnquiryStatus, Tone> = { Logged: "accent", Quoted: "neutral", Won: "ok", Lost: "bad", "No bid": "neutral" };

export const QuoteBadge = ({ status }: { status: QuoteStatus }) => <Badge tone={QUOTE[status]}>{status}</Badge>;
export const ProjectBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={PROJECT[status]}>{status}</Badge>;
export const EnquiryBadge = ({ status }: { status: EnquiryStatus }) => <Badge tone={ENQUIRY[status]}>{status}</Badge>;

/**
 * A hold on a live project holds nothing yet: its final account will be held when the work is
 * complete. So the badge says what is waiting there, and "Invoice held" only once it is true.
 */
export function HoldBadge({ p }: { p: Pick<Project, "status" | "invoiceHold" | "extrasFlag" | "snaggingFlag"> }) {
  if (!p.invoiceHold) return null;
  if (p.status === "Live" || p.status === "Not started") return <Badge tone="warn">{p.extrasFlag ? "Extras to agree" : "Snagging open"}</Badge>;
  return <Badge tone="warn">Invoice held</Badge>;
}

/** A thin bar for "how far along". The percentage is always written beside it as well. */
export function Progress({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-[0.93rem] text-muted">{pct}%</span>
    </span>
  );
}

/** Tabs within a record page. One subject on screen at a time. */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mb-3 mt-3 flex gap-1 overflow-x-auto">
      {tabs.map((t) => (
        <button key={t.value} role="tab" type="button" aria-selected={t.value === value} onClick={() => onChange(t.value)} className={cx("h-9 shrink-0 border-b-2 px-3 font-medium whitespace-nowrap", t.value === value ? "border-accent text-accent-ink" : "border-transparent text-muted hover:text-ink")}>
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1.5 font-normal opacity-80">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
