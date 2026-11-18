import { ALL_PERMS } from "./permissions";
import type { DepartmentKey, ID, PermKey, RoleKey } from "./types";

/**
 * The six people a prospect can sign in as on the mock sign-in page.
 * `personId` ties the role to a named member of the sample staff, so approvals, notes and the
 * activity log carry a real-looking name.
 */
export type RoleDef = {
  key: RoleKey;
  title: string;
  personId: ID | null;
  /** One line on the sign-in card saying what this person does all day. */
  does: string;
  home: string;
  /** Starting set of departments. The live set is in the database (`db.access`) and can be changed in Admin, Roles and access. */
  departments: DepartmentKey[];
  /** Starting money visibility: [contract values, costs and margins]. */
  money: [values: boolean, margins: boolean];
  /** Starting set of things this role may do. The live set is in the database, like departments. */
  perms: PermKey[];
  /** Roles whose access is fixed and cannot be edited in Admin, Roles and access. */
  locked?: boolean;
};

export const ROLES: RoleDef[] = [
  {
    key: "md",
    title: "Managing director",
    personId: "p-md",
    does: "Sees the whole firm: sales, sites, money and compliance.",
    home: "/dashboard",
    departments: ["dashboard", "inbox", "sales", "projects", "schedule", "people", "plant", "files", "invoicing", "portal", "site", "admin", "settings"],
    money: [true, true],
    perms: ALL_PERMS,
    locked: true,
  },
  {
    key: "contracts",
    title: "Contracts manager",
    personId: "p-cm1",
    does: "Prices work, runs the projects and plans who goes where.",
    home: "/projects",
    departments: ["dashboard", "inbox", "sales", "projects", "schedule", "people", "plant", "files", "portal", "site"],
    money: [true, true],
    // Everything except answering requests, which waits for the managing director (16 Nov),
    // and approving invoices: the managing director, or a site manager for a subcontractor (18 Nov).
    perms: ALL_PERMS.filter((k) => k !== "answerRequests" && k !== "approveInvoices" && k !== "approveSubInvoices"),
  },
  {
    key: "site",
    title: "Site manager",
    personId: "p-sm1",
    does: "Marks attendance, ticks off scope, requests people and plant.",
    home: "/people/timesheet",
    departments: ["projects", "schedule", "people", "plant", "files", "site"],
    money: [true, false],
    perms: ["markTime", "correctTime", "approveSubInvoices"],
  },
  {
    key: "accounts",
    title: "Accounts",
    personId: "p-acc",
    does: "Checks supplier invoices, sends client invoices, pays what is approved, exports to Sage.",
    home: "/invoicing",
    departments: ["dashboard", "inbox", "invoicing", "sales", "people", "plant", "files"],
    money: [true, true],
    perms: ["allProjects", "approveDrafts", "correctTime", "seeRates", "manageInvoices"],
  },
  {
    key: "operative",
    title: "Operative",
    personId: null,
    does: "Phone view: today's site, instructions in their own language, photos and extras.",
    home: "/site",
    departments: ["site"],
    money: [false, false],
    perms: [],
    locked: true,
  },
  {
    key: "client",
    title: "Client",
    personId: null,
    does: "Client portal: their quotes, project progress, photos and handover packs.",
    home: "/portal",
    departments: ["portal"],
    money: [true, false],
    perms: [],
    locked: true,
  },
];

export const roleDef = (key: RoleKey | null) => ROLES.find((r) => r.key === key) ?? null;
