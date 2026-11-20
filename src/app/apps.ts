/**
 * The master demo's map (20 Nov, from the Oldstone visual template agreed with Jimmy, Oldstone's
 * managing director): Level 1 is the Dashboard, Level 2 the five apps in the bottom bar, Level 3
 * the sections inside each app, shown as buttons across the top of the page (no left sidebar).
 * A section with more than one screen shows them as tabs under its button.
 *
 * Apps are a layer over the departments in departments.ts: every screen still belongs to a
 * department, and who may open it is still decided by that department in Admin, Roles and
 * access. A section shows when its person may open at least one of its screens; an app shows
 * when it has at least one section to show.
 *
 * Email, Team chat, the Site phone and Admin are not apps: they are small buttons in the top bar.
 */
import { CurrencyEur, Gauge, Handshake, HardHat, type Icon, UsersThree } from "@phosphor-icons/react";
import { needsAccounts, partyOf, purchaseStage } from "@/lib/purchases";
import { openRequestCount, overtimeClaimCount } from "@/lib/requests";
import { lastWeekStart, payrollStage } from "@/lib/payroll";
import { toPay } from "@/lib/reimbursements";
import { driversOf } from "@/lib/fleet";
import { discLate, renewalRows } from "@/lib/renewals";
import { claimsToIssue } from "@/lib/claims";
import type { DepartmentKey } from "@/data/types";
import type { NavItem } from "./departments";

/** A screen inside a section. `dept`: the department whose access opens it. */
export type Tab = NavItem & { dept: DepartmentKey };
export type Section = {
  key: string;
  label: string;
  tabs: Tab[];
  /** Addresses of records opened from this section (a tender, a project, an invoice): the start of the path. */
  also?: string[];
};
export type AppKey = "dashboard" | "sales" | "projects" | "resources" | "finance";
export type App = { key: AppKey; label: string; icon: Icon; sections: Section[] };

const t = (dept: DepartmentKey, to: string, label: string, more: Partial<NavItem> = {}): Tab => ({ dept, to, label, ...more });

export const APPS: App[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: Gauge,
    sections: [{ key: "dashboard", label: "Dashboard", tabs: [t("dashboard", "/dashboard", "Dashboard", { end: true })] }],
  },
  {
    key: "sales",
    label: "Sales",
    icon: Handshake,
    sections: [
      { key: "enquiries", label: "Enquiries", tabs: [t("sales", "/sales/enquiries", "Enquiries", { count: (db) => db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId).length })] },
      {
        key: "tenders",
        label: "Tenders",
        // The tender list first; the drag-and-drop board and the ones waiting on a client stay a tab away.
        tabs: [
          t("sales", "/sales/tenders", "All tenders", { count: (db) => db.quotes.filter((q) => ["Draft", "Awaiting approval", "Sent", "Opened", "Queried"].includes(q.status)).length }),
          t("sales", "/sales", "Board", { end: true }),
          t("sales", "/sales/awaiting", "Awaiting response", { count: (db) => db.quotes.filter((q) => q.status === "Queried").length, countTone: "warn" }),
        ],
        also: ["/sales/quotes/"],
      },
      { key: "confirmed", label: "Confirmed", tabs: [t("sales", "/sales/confirmed", "Confirmed", { count: (db) => db.projects.filter((p) => p.status === "Not started").length })] },
      { key: "pipeline", label: "Pipeline", tabs: [t("sales", "/sales/pipeline", "Pipeline")] },
      { key: "customers", label: "Customers", tabs: [t("customers", "/customers", "All customers")], also: ["/customers/"] },
    ],
  },
  {
    key: "projects",
    label: "Projects",
    icon: HardHat,
    sections: [
      { key: "live", label: "Live projects", tabs: [t("projects", "/projects", "Live projects", { end: true })], also: ["/projects/"] },
      { key: "not-started", label: "Not started", tabs: [t("projects", "/projects/not-started", "Not started")] },
      { key: "resources-today", label: "Resources today", tabs: [t("projects", "/projects/resources", "Resources today")] },
      { key: "completed", label: "Completed", tabs: [t("projects", "/projects/completed", "Completed")] },
      {
        key: "site",
        label: "Requests and variations",
        tabs: [
          t("projects", "/projects/requests", "Site requests", { count: (db, _today, me) => openRequestCount(db, me) }),
          t("projects", "/projects/extras", "Variations and snagging", { count: (db) => db.projects.filter((p) => p.invoiceHold).length, countTone: "warn" }),
          t("projects", "/projects/subcontractor-invoices", "Invoices to approve"),
        ],
      },
      {
        key: "files",
        label: "Files",
        tabs: [t("files", "/files", "Project files", { end: true }), t("files", "/files/photos", "Photos and videos"), t("files", "/files/unsorted", "To be sorted", { count: (db) => db.files.filter((f) => f.projectId === null).length })],
      },
      { key: "portal", label: "Portal", tabs: [t("portal", "/portal", "What a client sees", { end: true }), t("portal", "/portal/subcontractors", "What a subcontractor sees", { staffOnly: true })] },
    ],
  },
  {
    key: "resources",
    label: "Resources",
    icon: UsersThree,
    sections: [
      {
        key: "scheduling",
        label: "Scheduling",
        tabs: [
          t("schedule", "/schedule", "Week ahead", { end: true }),
          t("schedule", "/schedule/month", "Month ahead"),
          t("schedule", "/schedule/today", "Who is where"),
          t("schedule", "/schedule/holidays", "Holidays"),
          t("schedule", "/schedule/holiday-requests", "Holiday requests", { count: (db) => db.holidays.filter((h) => h.status === "Requested").length }),
        ],
      },
      {
        key: "timesheet",
        label: "Timesheet",
        tabs: [
          t("people", "/people/timesheet", "Timesheet", { count: (db, _today, me) => overtimeClaimCount(db, me) }),
          t("people", "/people/history", "Attendance history"),
          t("people", "/people/payroll", "Payroll export", { count: (db, today) => (["to-check", "to-export"].includes(payrollStage(lastWeekStart(today), db.attendance, db.payrollChecks, db.attendanceChanges, db.payrollExports)) ? 1 : 0) }),
          t("people", "/people/reimbursements", "Reimbursements", { count: (db) => toPay(db.expenses).length }),
        ],
        also: ["/people/holidays"],
      },
      {
        key: "plant",
        label: "Plant",
        tabs: [
          t("plant", "/plant", "Overview", { end: true }),
          t("plant", "/plant/calendar", "Calendar"),
          t("plant", "/plant/register", "Own plant"),
          t("plant", "/plant/hired", "Hired plant", { count: (db) => db.hiredPlant.filter((h) => h.status === "Return notified").length, countTone: "warn" }),
        ],
      },
      {
        key: "fleet",
        label: "Fleet",
        tabs: [
          t("fleet", "/fleet", "Repair spend", { end: true }),
          t("fleet", "/fleet/invoices", "Garage invoices", { count: (db) => db.garageInvoices.filter((i) => i.status === "To check").length, countTone: "warn" }),
          t("fleet", "/fleet/vehicles", "Vehicles"),
          t("fleet", "/fleet/renewals", "Renewals", { count: (db, today) => renewalRows(db.vehicles, driversOf(db.people, db.vehicles), db.todos, today).filter((x) => x.state !== "ok" || discLate(x)).length, countTone: "bad" }),
          t("fleet", "/fleet/damage", "Damage reported", { count: (db) => db.damageReports.filter((d) => d.status === "New").length, countTone: "bad" }),
          t("fleet", "/fleet/documents", "Vehicle documents"),
          t("fleet", "/fleet/drivers", "Drivers"),
          t("fleet", "/fleet/garages", "Garages"),
          t("fleet", "/fleet/bases", "Bases"),
        ],
        also: ["/fleet/"],
      },
      {
        // Training is Compliance (Oisin, 20 Nov: "training, which will be compliance"), with the
        // people it is about: the employee register sits here too.
        key: "training",
        label: "Training",
        tabs: [
          t("compliance", "/compliance", "Everything due", { end: true }),
          t("compliance", "/compliance/personnel", "Personnel"),
          t("compliance", "/compliance/courses", "Courses", { count: (db, today) => db.courses.filter((c) => !c.doneAt && c.date <= today).length, countTone: "warn" }),
          t("compliance", "/compliance/machinery", "Machinery"),
          t("compliance", "/compliance/fleet", "Vehicles and drivers", { perm: "allProjects" }),
          t("compliance", "/compliance/company", "Company papers", { perm: "allProjects" }),
          t("compliance", "/compliance/subcontractors", "Subcontractors"),
          t("people", "/people", "Employee register", { end: true }),
        ],
      },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: CurrencyEur,
    sections: [
      {
        key: "money-in",
        label: "Money in",
        tabs: [
          t("invoicing", "/invoicing/claims", "Payment claims", { count: (db, today) => claimsToIssue(db, today), countTone: "bad" }),
          t("invoicing", "/invoicing", "All client invoices", { end: true, count: (db) => db.salesInvoices.filter((i) => i.status === "To invoice").length }),
          t("invoicing", "/invoicing/invoiced", "Unpaid", { count: (db, today) => db.salesInvoices.filter((i) => i.status === "Invoiced" && !!i.dueOn && i.dueOn < today).length, countTone: "bad" }),
          t("invoicing", "/invoicing/held", "Held", { count: (db) => db.salesInvoices.filter((i) => i.status === "Held").length, countTone: "warn" }),
          t("invoicing", "/invoicing/queries", "Client queries", { count: (db) => db.invoiceQueries.filter((q) => q.status === "Open").length, countTone: "warn" }),
          t("invoicing", "/invoicing/export", "Sage export"),
          t("invoicing", "/invoicing/design", "Invoice design"),
          t("invoicing", "/invoicing/email", "Email template"),
        ],
        also: ["/invoicing/client/"],
      },
      {
        key: "money-out",
        label: "Money out",
        tabs: [
          t("invoicing", "/invoicing/subcontractor", "Subcontractors", { count: (db) => db.supplierInvoices.filter((i) => partyOf(i) === "subcontractor" && needsAccounts(i)).length }),
          t("invoicing", "/invoicing/supplier", "Suppliers", { count: (db) => db.supplierInvoices.filter((i) => partyOf(i) === "supplier" && needsAccounts(i)).length }),
          t("invoicing", "/invoicing/approve", "To approve", { count: (db) => db.supplierInvoices.filter((i) => purchaseStage(i) === "approve").length, countTone: "warn" }),
          t("invoicing", "/invoicing/to-pay", "To be paid", { count: (db) => db.supplierInvoices.filter((i) => purchaseStage(i) === "pay").length }),
        ],
      },
      {
        key: "profit",
        label: "Profitability reports",
        tabs: [
          t("profit", "/profit", "Profit by job", { end: true }),
          t("reports", "/reports/margin", "Gross margin"),
          t("reports", "/reports/customers", "Sales by customer"),
          t("reports", "/reports/tenders", "Tender conversion"),
          t("reports", "/reports", "Last 12 months", { end: true }),
          t("invoicing", "/invoicing/costs", "Job costs"),
        ],
      },
    ],
  },
];

/** Does a screen's address match this path? An `end` screen only matches itself. */
const matches = (it: Pick<NavItem, "to" | "end">, path: string) => path === it.to || (!it.end && path.startsWith(it.to + "/"));

/**
 * Which app and section a path belongs to. A screen listed in a section wins; then the longest
 * matching `also` (a tender's page belongs to Tenders). Null for anything outside the five apps
 * (Email, Team chat, the Site phone, Admin, Settings, Vardil HQ).
 */
export function placeOf(path: string): { app: App; section: Section } | null {
  for (const app of APPS) for (const section of app.sections) if (section.tabs.some((x) => path === x.to)) return { app, section };
  let best: { app: App; section: Section; len: number } | null = null;
  for (const app of APPS)
    for (const section of app.sections)
      for (const pre of [...(section.also ?? []), ...section.tabs.filter((x) => !x.end).map((x) => x.to + "/")])
        if (path.startsWith(pre) && (!best || pre.length > best.len)) best = { app, section, len: pre.length };
  return best;
}

/** The tab of a section that a path is on, if any. */
export const tabOf = (section: Section, path: string) => section.tabs.find((x) => matches(x, path));
