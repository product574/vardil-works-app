import type { ComponentType } from "react";
import { createBrowserRouter, createMemoryRouter, Navigate, type RouteObject, useLocation } from "react-router-dom";
import { RolePage, SignInPage } from "./AuthPages";
import { LoadFailed, NotFound, Shell } from "./Shell";

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
const fleet = () => import("@/modules/fleet");
const files = () => import("@/modules/files/Files");
const invoicing = () => import("@/modules/invoicing/Invoicing");
const profit = () => import("@/modules/profit");
const inbox = () => import("@/modules/inbox/Inbox");
const chat = () => import("@/modules/chat/TeamChat");
const portal = () => import("@/modules/portal/Portal");
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
          screen("sales/clients", sales, (m) => m.Clients),
          screen("projects", projects, (m) => m.AllProjects),
          screen("projects/today", projects, (m) => m.OnSiteToday),
          screen("projects/extras", projects, (m) => m.ExtrasAndSnagging),
          screen("projects/completed", projects, (m) => m.Completed),
          screen("projects/requests", projects, (m) => m.SiteRequests),
          screen("projects/:code", projects, (m) => m.ProjectPage),
          screen("people/timesheet", people, (m) => m.Timesheet),
          screen("people/history", people, (m) => m.AttendanceHistory),
          screen("people/payroll", people, (m) => m.PayrollExport),
          screen("people/reimbursements", people, (m) => m.Reimbursements),
          screen("people", people, (m) => m.EmployeeRegister),
          screen("people/certs", people, (m) => m.TrainingTickets),
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
          screen("invoicing", invoicing, (m) => m.ToInvoice),
          screen("invoicing/held", invoicing, (m) => m.HeldInvoices),
          screen("invoicing/invoiced", invoicing, (m) => m.Invoiced),
          screen("invoicing/export", invoicing, (m) => m.AccountsExport),
          screen("invoicing/supplier", invoicing, (m) => m.SupplierInvoices),
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
          screen("site", site, (m) => m.SiteView),
          screen("settings", settings, (m) => m.Branding),
          screen("settings/region", settings, (m) => m.RegionAccounts),
          { path: "settings/roles", element: <Moved to={keep("/admin/access")} /> },
          screen("settings/about", settings, (m) => m.About),
          screen("profit", profit, (m) => m.Profitability),
          // Job costs, for the managing director: the same screen the accounts office has in Invoicing.
          screen("profit/costs", invoicing, (m) => m.JobCosts),
          screen("admin", admin, (m) => m.Requests),
          screen("admin/access", admin, (m) => m.RolesAccess),
          screen("admin/sites", admin, (m) => m.SiteAccess),
          screen("admin/billing", admin, (m) => m.Billing),
          screen("admin/bank-holidays", admin, (m) => m.BankHolidays),
          screen("admin/connections", admin, (m) => m.Connections),
          screen("admin/automations", admin, (m) => m.Automations),
          screen("admin/activity", admin, (m) => m.ActivityLog),
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
