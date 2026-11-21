/**
 * Records that had no way in until 21 Nov (decisions 239 to 241 and 244): plant going on hire, a
 * new subcontractor firm, a project that did not come from a tender, and a new company paper.
 * Each form's checks live here, so the box and the action refuse the same things.
 */
import type { CompanyPaper, HiredPlant, Project, SiteRequest, Subcontractor } from "@/data/types";
import { withOffice } from "./requests";

// ── Hired plant ───────────────────────────────────────────────────────────────

export type NewHire = Pick<HiredPlant, "projectId" | "description" | "quantity" | "hireCompany" | "hirePhone" | "hireRef" | "onHireFrom" | "rate" | "rateUnit" | "notes">;

export function hireProblem(f: NewHire): string {
  if (!f.projectId) return "Choose the site it is going to.";
  if (!f.description.trim()) return "Say what is being hired.";
  if (!f.hireCompany.trim()) return "Say who it is hired from.";
  if (!f.onHireFrom) return "Give the day the hire starts.";
  if (!(f.rate > 0)) return "Give the hire rate, so the cost so far can be worked out.";
  return "";
}

/** Plant-to-hire requests with a yes that nobody has hired yet: the office's list, soonest needed first. */
export const hiresToArrange = (requests: SiteRequest[]) => requests.filter((r) => r.kind === "hired_plant" && r.decision === "Approved" && withOffice(r) && r.projectId !== null).sort((a, b) => a.neededFrom.localeCompare(b.neededFrom));

/** Hire companies used before, with their phone, for the box to offer. */
export function hireCompanies(hired: Pick<HiredPlant, "hireCompany" | "hirePhone">[]): { name: string; phone: string }[] {
  const seen = new Map<string, string>();
  for (const h of hired) if (!seen.has(h.hireCompany)) seen.set(h.hireCompany, h.hirePhone);
  return [...seen].map(([name, phone]) => ({ name, phone })).sort((a, b) => a.name.localeCompare(b.name));
}

// ── Subcontractors ────────────────────────────────────────────────────────────

export type NewSub = Pick<Subcontractor, "name" | "trade" | "contactName" | "email" | "phone" | "termsDays" | "projectIds">;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function subProblem(f: NewSub, existing: Pick<Subcontractor, "name">[]): string {
  if (!f.name.trim()) return "Give the firm's name, as on their invoices.";
  if (existing.some((s) => same(s.name, f.name))) return `${f.name.trim()} is already on file.`;
  if (!f.trade.trim()) return "Say what trade they do.";
  if (!f.contactName.trim()) return "Give a contact name.";
  if (!f.email.trim() && !f.phone.trim()) return "Give an email or a phone number, so the office can reach them.";
  if (f.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return "That email address does not look right.";
  if (!(f.termsDays > 0)) return "Give their payment terms in days.";
  return "";
}

// ── A project without a tender ────────────────────────────────────────────────

export type NewProject = {
  clientId: string;
  name: string;
  location: string;
  county: string;
  description: string;
  pricedBy: Exclude<Project["pricedBy"], "Quote">;
  /** Before VAT. Null when the job is not priced. */
  value: number | null;
  orderRef: string;
  /** Optional (21 Nov): the margin % the firm expects, since there is no tender to take it from. */
  estMargin?: number | null;
  startDate: string;
  endDate: string;
  siteManagerId: string;
  contractsManagerId: string;
  /** One item a line. */
  scope: string;
};

/** The scope box, one item a line, blank lines and list marks dropped. */
export const scopeLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

export function projectProblem(f: NewProject): string {
  if (!f.clientId) return "Choose the client.";
  if (!f.name.trim()) return "Give the project a name.";
  if (!f.location.trim()) return "Say where the site is.";
  if (!f.county.trim()) return "Give the county the site is in.";
  if (!f.description.trim()) return "Describe the work in a sentence.";
  if (f.pricedBy === "Agreed price" && !((f.value ?? 0) > 0)) return "Give the agreed price before VAT, or choose another way it is priced.";
  if (f.estMargin != null && (f.estMargin < -100 || f.estMargin >= 100)) return "An estimated margin is between -100% and 100%, or left empty.";
  if (!f.startDate || !f.endDate) return "Give the start and finish dates.";
  if (f.endDate < f.startDate) return "The finish date is before the start date.";
  if (!f.siteManagerId) return "Choose the site manager.";
  return "";
}

// ── Company papers ────────────────────────────────────────────────────────────

export type NewPaper = Pick<CompanyPaper, "name" | "provider" | "reference" | "expires"> & { cover: string };

export function paperProblem(f: NewPaper, existing: Pick<CompanyPaper, "name">[]): string {
  if (!f.name.trim()) return "Say what the paper is.";
  if (existing.some((c) => same(c.name, f.name))) return `${f.name.trim()} is already on the list. Renew it there.`;
  if (!f.provider.trim()) return "Say who it is from.";
  if (!f.expires) return "Give the day it runs to.";
  return "";
}

/** Papers a contractor is usually asked for, offered in the box when not yet on the list. */
export const USUAL_PAPERS = ["Public liability insurance", "Employers' liability insurance", "Contractors all risk insurance", "Professional indemnity insurance", "Tax clearance certificate", "Safety statement", "CIRI registration", "Waste collection permit", "Motor fleet insurance"];
