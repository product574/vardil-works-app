/**
 * The map of the whole app: every department in the bottom bar, and the short sidebar each
 * one shows. Adding a screen means adding a line here and a route in router.tsx.
 */
import { Browsers, CalendarDots, ChartLineUp, ChatsCircle, DeviceMobile, EnvelopeSimple, FolderOpen, Gauge, GearSix, Handshake, HardHat, type Icon, Receipt, Truck, UserGear, UsersThree, Van } from "@phosphor-icons/react";
import type { Brand } from "@/config/brand";
import { totalUnread } from "@/lib/chat";
import { openRequestCount, waitingOnDirector, overtimeClaimCount } from "@/lib/requests";
import { lastWeekStart, payrollStage } from "@/lib/payroll";
import { toPay } from "@/lib/reimbursements";
import { driversOf } from "@/lib/fleet";
import { dueState } from "@/lib/status";
import { invoiceWarnings } from "@/lib/fleet-spend";
import { discLate, renewalRows } from "@/lib/renewals";
import type { Db, DepartmentKey, ID } from "@/data/types";

/** `mdOnly`: shown to the managing director only, even when the department is switched on for another level. */
/** `notMd`: left out of the managing director's sidebar, because he has the same screen in another department. */
/** `tabs`: other addresses inside the same page (its tabs), which Ask AI may link to but the sidebar does not list. */
export type NavItem = { to: string; label: string; count?: (db: Db, today: string, me: ID | null) => number; countTone?: "accent" | "warn" | "bad"; end?: boolean; mdOnly?: boolean; notMd?: boolean; tabs?: { to: string; label: string }[] };
/** `more`: items worked out from the records, such as one per Team chat channel. */
export type NavGroup = { label: string; items: NavItem[]; more?: (db: Db, brand: Brand) => NavItem[] };
export type Department = {
  key: DepartmentKey;
  /** Name in the bottom bar. */ label: string;
  /** Longer name for the sidebar heading, when it differs. */ title?: string;
  icon: Icon;
  home: string;
  groups: NavGroup[];
  inBar: boolean;
  /** Draws its own full-height side panel (Email and Team chat, laid out like the reference demos), so the shell shows no sidebar. */
  ownLayout?: boolean;
  /** A count on the department's button in the bottom bar: unread email, unread messages. */
  badge?: (db: Db, today: string, me: ID | null) => number;
};

export const DEPARTMENTS: Department[] = [
  {
    key: "dashboard", label: "Dashboard", icon: Gauge, home: "/dashboard", inBar: true,
    // Approvals open and close in place on the overview (16 Nov): there is no separate page.
    groups: [{ label: "Today", items: [{ to: "/dashboard", label: "Overview", end: true, count: (db) => db.approvals.filter((a) => a.status === "Pending").length }] }],
  },
  {
    key: "inbox", label: "Email", icon: EnvelopeSimple, home: "/inbox", inBar: true, ownLayout: true,
    badge: (db) => db.mails.filter((m) => m.folder === "Inbox" && !m.read).length,
    groups: [
      { label: "Folders", items: [
        { to: "/inbox", label: "Inbox", end: true, count: (db) => db.mails.filter((m) => m.folder === "Inbox" && !m.read).length },
        { to: "/inbox/starred", label: "Starred" },
        { to: "/inbox/sent", label: "Sent" },
        { to: "/inbox/drafts", label: "Drafts" },
        { to: "/inbox/archive", label: "Archive" },
      ] },
    ],
  },
  {
    // Laid out like Ping in the reference demos (16 Nov, Oisin): channels and direct messages.
    key: "chat", label: "Team chat", icon: ChatsCircle, home: "/chat", inBar: true, ownLayout: true,
    badge: (db, _t, me) => totalUnread(db.chatMessages, db.chatChannels, me),
    // Not shown (the screen draws its own channel list); listed so Ask AI can link to it.
    groups: [{ label: "Team chat", items: [{ to: "/chat", label: "Group chats" }] }],
  },
  {
    key: "sales", label: "Sales", icon: Handshake, home: "/sales", inBar: true,
    groups: [
      { label: "Pipeline", items: [
        { to: "/sales", label: "Board", end: true },
        { to: "/sales/enquiries", label: "Enquiries", count: (db) => db.enquiries.filter((e) => e.status === "Logged" && !e.quoteId).length },
        { to: "/sales/awaiting", label: "Awaiting response", count: (db) => db.quotes.filter((q) => q.status === "Queried").length, countTone: "warn" },
      ] },
      { label: "Accounts", items: [{ to: "/sales/clients", label: "Clients" }] },
    ],
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
      { label: "Site", items: [{ to: "/projects/requests", label: "Requests", count: (db, _today, me) => openRequestCount(db, me) }] },
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
      { label: "Leave", items: [
        { to: "/schedule/holidays", label: "Holidays" },
        { to: "/schedule/holiday-requests", label: "Holiday requests", count: (db) => db.holidays.filter((h) => h.status === "Requested").length },
      ] },
    ],
  },
  {
    key: "people", label: "People", icon: UsersThree, home: "/people/timesheet", inBar: true,
    groups: [
      { label: "Labour", items: [
        { to: "/people/timesheet", label: "Timesheet", count: (db, _today, me) => overtimeClaimCount(db, me) },
        { to: "/people/history", label: "Attendance history" },
        // The numbers are what is waiting: last week's hours on their way to payroll, and approved claims to pay.
        { to: "/people/payroll", label: "Payroll export", count: (db, today) => (["to-check", "to-export"].includes(payrollStage(lastWeekStart(today), db.attendance, db.payrollChecks, db.attendanceChanges, db.payrollExports)) ? 1 : 0) },
        { to: "/people/reimbursements", label: "Reimbursements", count: (db) => toPay(db.expenses).length },
      ] },
      { label: "Team", items: [
        { to: "/people", label: "Employee register", end: true },
        { to: "/people/certs", label: "Training tickets", count: (db, today) => db.people.filter((p) => p.active).flatMap((p) => p.certs).filter((c) => dueState(c.expires, today) !== "ok" || c.proofNeeded).length, countTone: "bad" },
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
    ],
  },
  {
    // Fleet (18 Nov): the Secure-All build's Fleet, at Oisin's word, as a button of its own after Plant.
    key: "fleet", label: "Fleet", icon: Van, home: "/fleet", inBar: true,
    groups: [
      { label: "Repair spend", items: [
        { to: "/fleet", label: "Overview", end: true },
        { to: "/fleet/invoices", label: "Invoices", count: (db) => db.garageInvoices.filter((i) => i.status === "To check").length, countTone: "warn" },
      ] },
      { label: "Vehicles", items: [
        { to: "/fleet/vehicles", label: "Vehicles" },
        { to: "/fleet/renewals", label: "Renewals", count: (db, today) => renewalRows(db.vehicles, driversOf(db.people, db.vehicles), db.todos, today).filter((x) => x.state !== "ok" || discLate(x)).length, countTone: "bad" },
        { to: "/fleet/damage", label: "Damage reported", count: (db) => db.damageReports.filter((d) => d.status === "New").length, countTone: "bad" },
        { to: "/fleet/documents", label: "Vehicle documents" },
      ] },
      { label: "Lists", items: [
        { to: "/fleet/garages", label: "Garages" },
        { to: "/fleet/drivers", label: "Drivers", count: (db) => db.people.filter((p) => p.licences?.driving?.fromPhoneAt || p.licences?.cpc?.fromPhoneAt).length, countTone: "warn" },
        { to: "/fleet/bases", label: "Bases" },
      ] },
    ],
    badge: (db, today) => invoiceWarnings(db.garageInvoices, today).length,
  },
  {
    // Kept on 16 Nov after all ("we still need this files section"), for the loose files
    // waiting in To be sorted. Each project's own folders are also on its Files tab.
    key: "files", label: "Files", icon: FolderOpen, home: "/files", inBar: false,
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
      // Which way each invoice travels is said in the group names (the call of 17 Nov: "are these
      // invoices coming in or invoices going out?").
      { label: "Going out, to clients", items: [
        { to: "/invoicing", label: "To invoice", end: true, count: (db) => db.salesInvoices.filter((i) => i.status === "To invoice").length },
        { to: "/invoicing/held", label: "Held", count: (db) => db.salesInvoices.filter((i) => i.status === "Held").length, countTone: "warn" },
        { to: "/invoicing/invoiced", label: "Invoiced" },
      ] },
      { label: "Coming in, from suppliers", items: [
        { to: "/invoicing/supplier", label: "Supplier invoices", count: (db) => db.supplierInvoices.filter((i) => i.readStatus !== "confirmed").length },
      ] },
      { label: "Accounts", items: [
        { to: "/invoicing/export", label: "Accounts export" },
        // The managing director has Job costs in Profitability (17 Nov); the accounts office keeps it here.
        { to: "/invoicing/costs", label: "Job costs", notMd: true },
      ] },
    ],
  },
  {
    // What the firm's own people cost each site (Oisin, 17 Nov). The managing director's alone:
    // it is not offered in Roles and access, so it cannot be switched on for anyone else.
    key: "profit", label: "Profitability", icon: ChartLineUp, home: "/profit", inBar: true,
    groups: [
      { label: "Money per site", items: [
        { to: "/profit", label: "By site", end: true },
        { to: "/profit/costs", label: "Job costs" },
      ] },
    ],
  },
  {
    key: "portal", label: "Portal", title: "Client portal", icon: Browsers, home: "/portal", inBar: true,
    groups: [
      { label: "Client view", items: [
        { to: "/portal", label: "What the client sees", end: true },
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
      { label: "Access", items: [{ to: "/admin/access", label: "Roles and access", mdOnly: true }, { to: "/admin/sites", label: "Site access", mdOnly: true }] },
      { label: "Account", items: [{ to: "/admin/billing", label: "Billing", mdOnly: true }] },
      { label: "System", items: [
        { to: "/admin/bank-holidays", label: "Bank holidays" },
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
        { to: "/settings/region", label: "Region and accounts" },
        { to: "/settings/about", label: "About this demo" },
      ] },
    ],
  },
];

export function departmentFor(pathname: string): Department {
  const first = pathname.split("/")[1] ?? "";
  return DEPARTMENTS.find((d) => d.home.split("/")[1] === first) ?? DEPARTMENTS[0]!;
}
