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
const plant = () => import("@/modules/plant");
const files = () => import("@/modules/files/Files");
const invoicing = () => import("@/modules/invoicing");
const inbox = () => import("@/modules/inbox/Inbox");
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
          screen("people", people, (m) => m.EmployeeRegister),
          screen("people/certs", people, (m) => m.TrainingTickets),
          screen("people/holidays", people, (m) => m.Holidays),
          screen("schedule", schedule, (m) => m.WeekAhead),
          screen("schedule/month", schedule, (m) => m.MonthAhead),
          screen("schedule/today", schedule, (m) => m.WhoIsWhere),
          screen("plant", plant, (m) => m.PlantOverview),
          screen("plant/calendar", plant, (m) => m.PlantCalendar),
          screen("plant/register", plant, (m) => m.PlantRegister),
          screen("plant/hired", plant, (m) => m.HiredPlantList),
          screen("plant/vehicles", plant, (m) => m.Vehicles),
          screen("plant/documents", plant, (m) => m.VehicleDocuments),
          screen("plant/repairs", plant, (m) => m.RepairSpend),
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
          screen("invoicing/costs", invoicing, (m) => m.JobCosts),
          // The three folders are one screen. A separate component for each means the list filter
          // starts fresh when you change folder.
          screen("inbox", inbox, (m) => () => <m.Inbox folder="Inbox" />),
          screen("inbox/sent", inbox, (m) => () => <m.Inbox folder="Sent" />),
          screen("inbox/archive", inbox, (m) => () => <m.Inbox folder="Archive" />),
          screen("portal", portal, (m) => m.Portal),
          screen("site", site, (m) => m.SiteView),
          screen("settings", settings, (m) => m.Branding),
          screen("settings/region", settings, (m) => m.RegionAccounts),
          { path: "settings/roles", element: <Moved to={keep("/admin/access")} /> },
          screen("settings/about", settings, (m) => m.About),
          screen("admin", admin, (m) => m.Requests),
          screen("admin/access", admin, (m) => m.RolesAccess),
          screen("admin/billing", admin, (m) => m.Billing),
          screen("admin/connections", admin, (m) => m.Connections),
          screen("admin/automations", admin, (m) => m.Automations),
          screen("admin/activity", admin, (m) => m.ActivityLog),
          { path: "*", element: <NotFound /> },
        ],
      },
    ],
  },
]);
