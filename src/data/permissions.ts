import type { PermKey } from "./types";

/**
 * Everything a person can be allowed or not allowed to do, in the words shown on
 * Admin > Roles and access. To add one: add the key to PermKey in types.ts, a row here,
 * the default in roles.ts, and ask `useAccess().may("theKey")` on the screen it controls.
 */
export const PERMISSIONS: { key: PermKey; group: "Projects" | "Sales" | "People" | "Schedule" | "Approvals" | "Plant" | "Compliance" | "Invoicing"; label: string; hint: string }[] = [
  { key: "allProjects", group: "Projects", label: "See every project", hint: "Without it they see only the sites they run, and any they are given in Site access" },
  { key: "manageProjects", group: "Projects", label: "Clear invoice holds, set up jobs and deal with site requests", hint: "The office side of a project: releasing a final account that is on hold, adding a project that had no tender, placing orders and closing requests from site" },
  { key: "priceQuotes", group: "Sales", label: "Price and send quotes", hint: "Log enquiries, draft and edit quotes, send, chase, record acceptance or decline" },
  { key: "approveDrafts", group: "Approvals", label: "Approve drafts", hint: "Approve or discard what the system has prepared: variations, client emails, handover packs" },
  { key: "answerRequests", group: "Approvals", label: "Answer requests for a yes or no", hint: "People and plant the sites ask for, and money people want to spend (Admin, Requests). Leave has its own tick" },
  { key: "planWeek", group: "Schedule", label: "Plan the week ahead", hint: "Put people on sites, take them off, and send the week to operatives" },
  { key: "markTime", group: "People", label: "Mark the timesheet", hint: "Mark today's attendance, send the time stamps, add people to a site list" },
  { key: "correctTime", group: "People", label: "Correct earlier days", hint: "Change attendance already sent, with a reason that is kept" },
  { key: "manageStaff", group: "People", label: "Manage employees and tickets", hint: "Add, archive and restore employees; record training tickets and renewals" },
  { key: "approveLeave", group: "People", label: "Approve leave", hint: "Approve or decline holiday requests and record leave" },
  { key: "seeRates", group: "People", label: "See hourly rates", hint: "Pay rates on the employee register" },
  { key: "managePlant", group: "Plant", label: "Manage plant and fleet", hint: "Move plant, record services and renewals, collect hired plant, add and remove vehicles and their documents" },
  { key: "checkPayroll", group: "People", label: "Check the week's hours for payroll", hint: "Look over what the site managers sent in and mark the week checked. Nothing can be exported before that" },
  { key: "exportPayroll", group: "People", label: "Export hours and reimbursements for payment", hint: "Send a checked week's hours to Sage Payroll, and approved reimbursements to be paid. Pay, tax and deductions stay in Sage" },
  { key: "manageCompany", group: "Compliance", label: "Manage company and subcontractor papers", hint: "Renew the firm's insurances, tax clearance and registrations; record subcontractors' insurances, safety statements, method statements and people" },
  { key: "recordInspections", group: "Compliance", label: "Record scaffold inspections", hint: "The weekly inspection of scaffolds and towers, putting one on the register and taking it off, on the sites they can see" },
  { key: "manageInvoices", group: "Invoicing", label: "Handle invoices", hint: "Check supplier invoices and approve the small ones, send client invoices, mark invoices paid, export to Sage" },
  { key: "approveInvoices", group: "Invoicing", label: "Approve invoices of any size", hint: "Supplier invoices over the limit accounts may approve, and any subcontractor's invoice. Also sets that limit" },
  { key: "approveSubInvoices", group: "Invoicing", label: "Approve invoices for their own sites", hint: "The site manager's yes on an invoice for a site they run, before it goes on (Projects, Invoices to approve). Which invoices depends on Admin, Invoice approvals" },
];

export const ALL_PERMS: PermKey[] = PERMISSIONS.map((p) => p.key);
