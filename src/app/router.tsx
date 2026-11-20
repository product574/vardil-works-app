import type { ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject, useLocation } from "react-router-dom";
import { RolePage, SignInPage } from "./AuthPages";
import { LoadFailed, NotFound, Shell } from "./Shell";
import { type StaffModule, staffEntry } from "./staff";

/**
 * Every address in the app. Department screens sit under the Shell, which checks the shared
 * login and the chosen role before showing anything.
 *
 * Each department's code is loaded the first time one of its screens is opened, so the first
 * page arrives quickly and nobody downloads departments they never visit. While a department
 * loads, the screen you are on stays put; there is no loading spinner.
 */
const dashboard = () => import("@/modules/dashboard");
const sales = () => import("@/modules/sales");
const projects = () => import("@/modules/projects");
const people = () => import("@/modules/people");
const schedule = () => import("@/modules/schedule/Schedule");
const leave = () => import("@/modules/schedule/Leave");
const month = () => import("@/modules/schedule/Month");
const plant = () => import("@/modules/plant");
const compliance = () => import("@/modules/compliance");
const fleet = () => import("@/modules/fleet");
const files = () => import("@/modules/files/Files");
const invoicing = () => import("@/modules/invoicing");
const profit = () => import("@/modules/profit");
const inbox = () => import("@/modules/inbox/Inbox");
const chat = () => import("@/modules/chat/TeamChat");
const portal = () => import("@/modules/portal/Portal");
const reports = () => import("@/modules/reports/Reports");
const customers = () => import("@/modules/customers");
const subPortal = () => import("@/modules/portal/SubPortal");
const site = () => import("@/modules/site/SiteView");
const settings = () => import("@/modules/settings");
const admin = () => import("@/modules/admin");

/** One screen: where it lives, which department file holds it, and which export it is. */
function screen<M>(path: string, load: () => Promise<M>, pick: (m: M) => ComponentType): RouteObject {
  return { path, lazy: async () => ({ Component: pick(await load()) }) };
}

// Normal hosting uses real addresses (/dashboard). The single-file preview build sets
// VITE_ROUTER=memory, which keeps navigation inside the page because it has no server behind it.
const create = import.meta.env.VITE_ROUTER === "memory" ? createMemoryRouter : createBrowserRouter;
const Nothing = () => null;

/**
 * An address that moved on 16 Nov (Approvals into the overview, Automations, the Activity log
 * and Roles and access into Admin). Old links and bookmarks still land right.
 */
function Moved({ to }: { to: (search: URLSearchParams) => string }) {
  const { search } = useLocation();
  return <Navigate to={to(new URLSearchParams(search))} replace />;
}
const keep = (path: string) => (q: URLSearchParams) => (q.toString() ? `${path}?${q}` : path);
/** Sales, Clients and its pop-up became Customers (18 Nov): a link to one client opens their page. */
const ToCustomer = () => <Moved to={(q) => (q.get("client") ? `/customers/${q.get("client")}` : "/customers")} />;

/**
 * Vardil HQ screens (19 Nov). The files are built only where they are meant to be (see
 * src/app/staff.ts); anywhere else these addresses are plain not-found pages.
 */
function staffScreen(path: string, pick: (m: StaffModule) => ComponentType): RouteObject {
  return { path, lazy: async () => ({ Component: staffEntry ? pick(await staffEntry()) : NotFound }) };
}

export const router = create([
  { path: "/sign-in", element: <SignInPage /> },
  { path: "/who", element: <RolePage /> },
  {
    path: "/",
    element: <Shell />,
    errorElement: <LoadFailed standalone />,
    HydrateFallback: Nothing,
    children: [
      {
        // A screen that fails to open (sign-in run out, newer version published) shows a plain
        // message inside the shell instead of the router's raw error page.
        errorElement: <LoadFailed />,
        children: [
          screen("dashboard", dashboard, (m) => m.Overview),
          { path: "dashboard/approvals", element: <Moved to={keep("/dashboard")} /> },
          { path: "dashboard/automations", element: <Moved to={() => "/admin/automations"} /> },
          { path: "dashboard/activity", element: <Moved to={() => "/admin/activity"} /> },
          screen("sales", sales, (m) => m.PipelineBoard),
          screen("sales/enquiries", sales, (m) => m.Enquiries),
          screen("sales/quotes/:ref", sales, (m) => m.QuotePage),
          screen("sales/awaiting", sales, (m) => m.Awaiting),
          // Clients moved to a section of its own (18 Nov): its old address, with or without a client, lands there.
          { path: "sales/clients", element: <ToCustomer /> },
          screen("customers", customers, (m) => m.Customers),
          screen("customers/:id", customers, (m) => m.CustomerPage),
          screen("reports", reports, (m) => m.ReportsOverview),
          screen("reports/customers", reports, (m) => m.SalesByCustomerReport),
          screen("reports/margin", reports, (m) => m.GrossMarginReport),
          screen("reports/tenders", reports, (m) => m.TenderConversionReport),
          screen("projects", projects, (m) => m.AllProjects),
          screen("projects/today", projects, (m) => m.OnSiteToday),
          screen("projects/extras", projects, (m) => m.ExtrasAndSnagging),
          screen("projects/completed", projects, (m) => m.Completed),
          screen("projects/requests", projects, (m) => m.SiteRequests),
          screen("projects/subcontractor-invoices", projects, (m) => m.SubcontractorInvoicesForSites),
          screen("projects/:code", projects, (m) => m.ProjectPage),
          screen("people/timesheet", people, (m) => m.Timesheet),
          screen("people/history", people, (m) => m.AttendanceHistory),
          screen("people/payroll", people, (m) => m.PayrollExport),
          screen("people/reimbursements", people, (m) => m.Reimbursements),
          screen("people", people, (m) => m.EmployeeRegister),
          // Training tickets moved to Compliance, Personnel on 18 Nov.
          { path: "people/certs", element: <Navigate to="/compliance/personnel?view=list" replace /> },
          screen("people/holidays", people, (m) => m.Holidays),
          screen("schedule", schedule, (m) => m.WeekAhead),
          screen("schedule/month", month, (m) => m.MonthAhead),
          screen("schedule/today", schedule, (m) => m.WhoIsWhere),
          screen("schedule/holidays", leave, (m) => m.ScheduleHolidays),
          screen("schedule/holiday-requests", leave, (m) => m.HolidayRequests),
          screen("plant", plant, (m) => m.PlantOverview),
          screen("plant/calendar", plant, (m) => m.PlantCalendar),
          screen("plant/register", plant, (m) => m.PlantRegister),
          screen("plant/hired", plant, (m) => m.HiredPlantList),
          screen("compliance", compliance, (m) => m.EverythingDue),
          screen("compliance/personnel", compliance, (m) => m.Personnel),
          screen("compliance/courses", compliance, (m) => m.Courses),
          screen("compliance/fleet", compliance, (m) => m.Fleet),
          screen("compliance/machinery", compliance, (m) => m.Machinery),
          screen("compliance/company", compliance, (m) => m.CompanyPapers),
          screen("compliance/subcontractors", compliance, (m) => m.Subcontractors),
          // Fleet has a department of its own since 18 Nov (from the Secure-All build); the old addresses land on its screens.
          screen("fleet", fleet, (m) => m.FleetOverview),
          screen("fleet/invoices", fleet, (m) => m.Invoices),
          screen("fleet/invoices/:invoiceId", fleet, (m) => m.InvoicePage),
          screen("fleet/vehicles", fleet, (m) => m.Vehicles),
          screen("fleet/vehicles/:vehicleId", fleet, (m) => m.VehiclePage),
          screen("fleet/damage", fleet, (m) => m.DamageReported),
          screen("fleet/renewals", fleet, (m) => m.Renewals),
          screen("fleet/documents", fleet, (m) => m.VehicleDocuments),
          screen("fleet/garages", fleet, (m) => m.Garages),
          screen("fleet/garages/:garageId", fleet, (m) => m.GaragePage),
          screen("fleet/drivers", fleet, (m) => m.Drivers),
          screen("fleet/bases", fleet, (m) => m.Bases),
          { path: "plant/fleet", element: <Moved to={() => "/fleet/vehicles"} /> },
          { path: "plant/fleet/documents", element: <Moved to={() => "/fleet/documents"} /> },
          { path: "plant/fleet/repairs", element: <Moved to={() => "/fleet"} /> },
          { path: "plant/vehicles", element: <Moved to={() => "/fleet/vehicles"} /> },
          { path: "plant/documents", element: <Moved to={() => "/fleet/documents"} /> },
          { path: "plant/repairs", element: <Moved to={() => "/fleet"} /> },
          screen("files", files, (m) => m.ProjectFiles),
          screen("files/photos", files, (m) => m.AllPhotos),
          screen("files/unsorted", files, (m) => m.ToBeSorted),
          // One list of client invoices at three addresses: all of them, the unpaid, the held.
          screen("invoicing", invoicing, (m) => m.ClientInvoices),
          screen("invoicing/held", invoicing, (m) => m.ClientInvoices),
          screen("invoicing/invoiced", invoicing, (m) => m.ClientInvoices),
          screen("invoicing/client/:ref", invoicing, (m) => m.InvoicePage),
          screen("invoicing/queries", invoicing, (m) => m.ClientQueries),
          screen("invoicing/export", invoicing, (m) => m.AccountsExport),
          screen("invoicing/design", invoicing, (m) => m.InvoiceDesignPage),
          screen("invoicing/email", invoicing, (m) => m.EmailTemplatePage),
          screen("invoicing/supplier", invoicing, (m) => m.SupplierInvoices),
          screen("invoicing/subcontractor", invoicing, (m) => m.SubcontractorInvoices),
          screen("invoicing/approve", invoicing, (m) => m.ToApprove),
          screen("invoicing/to-pay", invoicing, (m) => m.ToPay),
          screen("invoicing/costs", invoicing, (m) => m.JobCosts),
          // The three folders are one screen. A separate component for each means the list filter
          // starts fresh when you change folder.
          screen("inbox", inbox, (m) => () => <m.Inbox folder="Inbox" />),
          screen("inbox/starred", inbox, (m) => () => <m.Inbox folder="Starred" />),
          screen("inbox/sent", inbox, (m) => () => <m.Inbox folder="Sent" />),
          screen("inbox/drafts", inbox, (m) => () => <m.Inbox folder="Drafts" />),
          screen("inbox/archive", inbox, (m) => () => <m.Inbox folder="Archive" />),
          screen("inbox/label/:label", inbox, (m) => m.InboxLabel),
          screen("chat", chat, (m) => m.TeamChat),
          screen("chat/:channelId", chat, (m) => m.TeamChat),
          screen("portal", portal, (m) => m.Portal),
          screen("portal/subcontractors", subPortal, (m) => m.SubPortal),
          screen("site", site, (m) => m.SiteView),
          screen("settings", settings, (m) => m.Branding),
          screen("settings/region", settings, (m) => m.RegionAccounts),
          { path: "settings/roles", element: <Moved to={keep("/admin/access")} /> },
          screen("settings/about", settings, (m) => m.About),
          screen("profit", profit, (m) => m.Profitability),
          // Job costs stays in Invoicing for everyone (19 Nov, when the two chats were merged).
          { path: "profit/costs", element: <Moved to={() => "/invoicing/costs"} /> },
          screen("admin", admin, (m) => m.Requests),
          screen("admin/access", admin, (m) => m.RolesAccess),
          screen("admin/sites", admin, (m) => m.SiteAccess),
          screen("admin/billing", admin, (m) => m.Billing),
          screen("admin/bank-holidays", admin, (m) => m.BankHolidays),
          screen("admin/connections", admin, (m) => m.Connections),
          screen("admin/automations", admin, (m) => m.Automations),
          screen("admin/activity", admin, (m) => m.ActivityLog),
          screen("admin/repairs", admin, (m) => m.Repairs),
          screen("admin/vardil", admin, (m) => m.VardilWorks),
          staffScreen("vardil", (m) => m.Overview),
          staffScreen("vardil/features", (m) => m.Features),
          staffScreen("vardil/demo", (m) => m.DemoTools),
          staffScreen("vardil/clients", (m) => m.ClientApps),
          staffScreen("vardil/clients/:id", (m) => m.ClientPage),
          staffScreen("vardil/announcements", (m) => m.Announcements),
          staffScreen("vardil/requests", (m) => m.AppRequests),
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
