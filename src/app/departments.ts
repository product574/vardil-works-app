/**
 * The map of the whole app: every department in the bottom bar, and the short sidebar each
 * one shows. Adding a screen means adding a line here and a route in router.tsx.
 */
import { AddressBook, Browsers, CalendarDots, ChartBar, DeviceMobile, EnvelopeSimple, FolderOpen, Gauge, GearSix, Handshake, HardHat, type Icon, Receipt, ShieldCheck, Truck, UserGear, UsersThree } from "@phosphor-icons/react";
import { needsAccounts, partyOf, purchaseStage } from "@/lib/purchases";
import { waitingOnDirector } from "@/lib/requests";
import type { Db, DepartmentKey, PermKey } from "@/data/types";

/**
 * `mdOnly`: shown to the managing director only, even when the department is switched on for another level.
 * `staffOnly`: not shown to a client signed in to their portal.
 * `perm`: shown only to people with that permission (Compliance's firm-wide screens need "See every project").
 */
export type NavItem = { to: string; label: string; count?: (db: Db, today: string) => number; countTone?: "accent" | "warn" | "bad"; end?: boolean; mdOnly?: boolean; staffOnly?: boolean; perm?: PermKey };
export type NavGroup = { label: string; items: NavItem[] };
export type Department = { key: DepartmentKey; /** Name in the bottom bar. */ label: string; /** Longer name for the sidebar heading, when it differs. */ title?: string; icon: Icon; home: string; groups: NavGroup[]; inBar: boolean };

export const DEPARTMENTS: Department[] = [
  {
    key: "dashboard", label: "Dashboard", icon: Gauge, home: "/dashboard", inBar: true,
    // Approvals open and close in place on the overview (16 Nov): there is no separate page.
    groups: [{ label: "Today", items: [{ to: "/dashboard", label: "Overview", end: true, count: (db) => db.approvals.filter((a) => a.status === "Pending").length }] }],
  },
  {
    key: "inbox", label: "Email", icon: EnvelopeSimple, home: "/inbox", inBar: true,
    groups: [
      { label: "Folders", items: [
        { to: "/inbox", label: "Inbox", end: true, count: (db) => db.mails.filter((m) => m.folder === "Inbox" && !m.read).length },
        { to: "/inbox/sent", label: "Sent" },
        { to: "/inbox/archive", label: "Archive" },
      ] },
    ],
  },
  {
    key: "sales", label: "Sales", icon: Handshake, home: "/sales", inBar: true,
    groups: [
      { label: "Pipeline", items: [
        { to: "/sales", label: "Board", end: true },
        { to: "/sales/enquiries", label: "Enquiries", count: (db) => db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId).length },
        { to: "/sales/awaiting", label: "Awaiting response", count: (db) => db.quotes.filter((q) => q.status === "Queried").length, countTone: "warn" },
      ] },
    ],
  },
  {
    // Every customer and everything to do with them, on one page each (18 Nov). Sales, Clients
    // was its pop-up before: its address still lands here.
    key: "customers", label: "Customers", icon: AddressBook, home: "/customers", inBar: true,
    groups: [{ label: "Directory", items: [{ to: "/customers", label: "All customers" }] }],
  },
  {
    key: "projects", label: "Projects", icon: HardHat, home: "/projects", inBar: true,
    groups: [
      { label: "Work", items: [
        { to: "/projects", label: "All projects", end: true },
        { to: "/projects/today", label: "On site today" },
        { to: "/projects/extras", label: "Extras and snagging", count: (db) => db.projects.filter((p) => p.invoiceHold).length, countTone: "warn" },
        { to: "/projects/completed", label: "Completed" },
      ] },
      { label: "Site", items: [
        { to: "/projects/requests", label: "Requests", count: (db) => db.requests.filter((r) => r.status === "Open").length },
        // Where a site manager approves what the subcontractors on their sites have invoiced (18 Nov).
        { to: "/projects/subcontractor-invoices", label: "Subcontractor invoices" },
      ] },
    ],
  },
  {
    key: "schedule", label: "Schedule", icon: CalendarDots, home: "/schedule", inBar: true,
    groups: [
      { label: "Plan", items: [
        { to: "/schedule", label: "Week ahead", end: true },
        { to: "/schedule/month", label: "Month ahead" },
        { to: "/schedule/today", label: "Who is where" },
      ] },
    ],
  },
  {
    key: "people", label: "People", icon: UsersThree, home: "/people/timesheet", inBar: true,
    groups: [
      { label: "Labour", items: [
        { to: "/people/timesheet", label: "Timesheet" },
        { to: "/people/history", label: "Attendance history" },
      ] },
      { label: "Team", items: [
        { to: "/people", label: "Employee register", end: true },
        // Training tickets moved to Compliance, Personnel on 18 Nov (one home for every expiry).
        { to: "/people/holidays", label: "Holidays", count: (db) => db.holidays.filter((h) => h.status === "Requested").length },
      ] },
    ],
  },
  {
    key: "plant", label: "Plant", icon: Truck, home: "/plant", inBar: true,
    groups: [
      { label: "Plant", items: [
        { to: "/plant", label: "Overview", end: true },
        { to: "/plant/calendar", label: "Calendar" },
        { to: "/plant/register", label: "Own plant" },
        { to: "/plant/hired", label: "Hired plant", count: (db) => db.hiredPlant.filter((h) => h.status === "Return notified").length, countTone: "warn" },
      ] },
      { label: "Fleet", items: [
        { to: "/plant/vehicles", label: "Vehicles" },
        { to: "/plant/documents", label: "Vehicle documents" },
        { to: "/plant/repairs", label: "Repair spend" },
      ] },
    ],
  },
  {
    // Every expiry in one place (18 Nov, after the HVAC compliance demo). Site managers see the
    // people, machinery and subcontractors on their own sites; Fleet and Company are firm-wide.
    key: "compliance", label: "Compliance", icon: ShieldCheck, home: "/compliance", inBar: true,
    groups: [
      { label: "Compliance", items: [
        { to: "/compliance", label: "Everything due", end: true },
      ] },
      { label: "Areas", items: [
        { to: "/compliance/personnel", label: "Personnel" },
        { to: "/compliance/courses", label: "Training courses", count: (db, today) => db.courses.filter((c) => !c.doneAt && c.date <= today).length, countTone: "warn" },
        { to: "/compliance/fleet", label: "Fleet", perm: "allProjects" },
        { to: "/compliance/machinery", label: "Machinery" },
        { to: "/compliance/company", label: "Company papers", perm: "allProjects" },
        { to: "/compliance/subcontractors", label: "Subcontractors" },
      ] },
    ],
  },
  {
    // Kept on 16 Nov after all ("we still need this files section"), for the loose files
    // waiting in To be sorted. Each project's own folders are also on its Files tab.
    key: "files", label: "Files", icon: FolderOpen, home: "/files", inBar: true,
    groups: [
      { label: "Files", items: [
        { to: "/files", label: "Project files", end: true },
        { to: "/files/photos", label: "Photos and videos" },
        { to: "/files/unsorted", label: "To be sorted", count: (db) => db.files.filter((f) => f.projectId === null).length },
      ] },
    ],
  },
  {
    key: "invoicing", label: "Invoicing", icon: Receipt, home: "/invoicing", inBar: true,
    groups: [
      // One list of client invoices, opened on all of them, on the unpaid, or on the held (18 Nov).
      { label: "Money in", items: [
        { to: "/invoicing", label: "Client invoices", end: true, count: (db) => db.salesInvoices.filter((i) => i.status === "To invoice").length },
        { to: "/invoicing/invoiced", label: "Unpaid", count: (db, today) => db.salesInvoices.filter((i) => i.status === "Invoiced" && !!i.dueOn && i.dueOn < today).length, countTone: "bad" },
        { to: "/invoicing/held", label: "Held", count: (db) => db.salesInvoices.filter((i) => i.status === "Held").length, countTone: "warn" },
        { to: "/invoicing/queries", label: "Client queries", count: (db) => db.invoiceQueries.filter((q) => q.status === "Open").length, countTone: "warn" },
      ] },
      // Supplier and subcontractor invoices are checked, approved, then paid (18 Nov). The counts
      // are what is waiting at each step.
      { label: "Money out", items: [
        { to: "/invoicing/supplier", label: "Supplier invoices", count: (db) => db.supplierInvoices.filter((i) => partyOf(i) === "supplier" && needsAccounts(i)).length },
        { to: "/invoicing/subcontractor", label: "Subcontractor invoices", count: (db) => db.supplierInvoices.filter((i) => partyOf(i) === "subcontractor" && needsAccounts(i)).length },
        { to: "/invoicing/approve", label: "To approve", count: (db) => db.supplierInvoices.filter((i) => purchaseStage(i) === "approve").length, countTone: "warn" },
        { to: "/invoicing/to-pay", label: "To be paid", count: (db) => db.supplierInvoices.filter((i) => purchaseStage(i) === "pay").length },
        { to: "/invoicing/costs", label: "Job costs" },
      ] },
      { label: "Sage", items: [
        { to: "/invoicing/export", label: "Sage export", count: (db) => db.salesInvoices.filter((i) => i.issuedOn && !i.exportedAt).length + db.supplierInvoices.filter((i) => i.readStatus === "confirmed" && !i.exportedAt).length },
      ] },
      { label: "Set-up", items: [
        { to: "/invoicing/design", label: "Invoice design" },
        { to: "/invoicing/email", label: "Email template" },
      ] },
    ],
  },
  {
    // The firm's figures over the last 12 months (18 Nov, from the HVAC reports Oisin likes).
    // The managing director's to start with, switchable in Admin, Roles and access.
    key: "reports", label: "Reports", icon: ChartBar, home: "/reports", inBar: true,
    groups: [
      { label: "Last 12 months", items: [
        { to: "/reports", label: "Overview", end: true },
        { to: "/reports/customers", label: "Sales by customer" },
        { to: "/reports/margin", label: "Gross margin" },
        { to: "/reports/tenders", label: "Tender conversion" },
      ] },
    ],
  },
  {
    // Two portals (18 Nov): a client's, and a subcontractor's. Each sees only their own.
    key: "portal", label: "Portal", title: "Portal", icon: Browsers, home: "/portal", inBar: true,
    groups: [
      { label: "Clients", items: [
        { to: "/portal", label: "What a client sees", end: true },
      ] },
      { label: "Subcontractors", items: [
        { to: "/portal/subcontractors", label: "What a subcontractor sees", staffOnly: true, count: (db) => db.supplierInvoices.filter((i) => i.via === "portal" && purchaseStage(i) === "approve").length },
      ] },
    ],
  },
  {
    key: "site", label: "Site phone", title: "Site phone view", icon: DeviceMobile, home: "/site", inBar: true,
    groups: [{ label: "Crew", items: [{ to: "/site", label: "Site phone view", end: true }] }],
  },
  {
    key: "admin", label: "Admin", icon: UserGear, home: "/admin", inBar: true,
    groups: [
      { label: "For your yes or no", items: [{ to: "/admin", label: "Requests", end: true, count: (db) => waitingOnDirector(db).length }] },
      // Who can do what, and what the firm pays: the managing director's alone, even if Admin is given to another level.
      { label: "Access", items: [{ to: "/admin/access", label: "Roles and access", mdOnly: true }] },
      { label: "Account", items: [{ to: "/admin/billing", label: "Billing", mdOnly: true }] },
      { label: "System", items: [
        { to: "/admin/connections", label: "Connections" },
        { to: "/admin/automations", label: "Automations" },
        { to: "/admin/activity", label: "Activity log" },
      ] },
    ],
  },
  {
    key: "settings", label: "Settings", icon: GearSix, home: "/settings", inBar: false,
    groups: [
      { label: "This demo", items: [
        { to: "/settings", label: "Branding", end: true },
        { to: "/settings/region", label: "Region" },
        { to: "/settings/about", label: "About this demo" },
      ] },
    ],
  },
];

export function departmentFor(pathname: string): Department {
  const first = pathname.split("/")[1] ?? "";
  return DEPARTMENTS.find((d) => d.home.split("/")[1] === first) ?? DEPARTMENTS[0]!;
}
