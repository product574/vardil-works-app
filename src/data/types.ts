/**
 * The whole data model of the demo.
 *
 * Every screen reads these shapes from the store (src/data/store.ts) and nothing else, so when
 * a real backend arrives, each `Db` key becomes a table and the screens do not change.
 * Dates are "YYYY-MM-DD" strings in the firm's local calendar; timestamps are ISO strings.
 */
import type { Costing, QuoteLine } from "@/lib/quotes";
import type { ServicePlan } from "@/lib/status";

export type ID = string;
export type Day = string;
export type Stamp = string;

// ── People ────────────────────────────────────────────────────────────────────

export type Language = "en" | "pl" | "ro" | "pt" | "lt";
export const LANGUAGE_NAME: Record<Language, string> = {
  en: "English",
  pl: "Polski",
  ro: "Română",
  pt: "Português",
  lt: "Lietuvių",
};

/** A photo or scan kept as evidence, for example of a renewed ticket. Held in the browser in the demo. */
export type Proof = { name: string; dataUrl: string; addedBy: string; addedAt: string };
export type Cert = {
  id: ID;
  name: string;
  issued: Day;
  expires: Day;
  proof?: Proof;
  /** Set when a ticket is recorded or renewed with no card or certificate attached yet. */
  proofNeeded?: boolean;
};

export type Person = {
  id: ID;
  name: string;
  phone: string;
  email: string;
  kind: "Management" | "Operative";
  /** Job title for management, trade for operatives. */
  trade: string;
  category: "A" | "B" | "Craftsperson" | null;
  hourlyRate: number;
  rateAsOf: Day;
  language: Language;
  isSiteManager: boolean;
  /** Office and management only: the access level this person starts from. See src/data/access.ts. */
  level?: LevelKey;
  active: boolean;
  archivedAt?: Day;
  certs: Cert[];
  /** The employee number Sage Payroll gave them (0001), so hours exported match the right person (Oldstone call, 16 Nov). */
  sageNo?: string;
};

export type Holiday = {
  id: ID;
  personId: ID;
  from: Day;
  to: Day;
  status: "Requested" | "Approved" | "Declined";
  via: "Email" | "Form" | "Phone";
  note?: string;
};

// ── Sales ─────────────────────────────────────────────────────────────────────

export type ClientType = "Local authority" | "Private owner" | "Church body" | "Heritage trust" | "Main contractor" | "Commercial";

export type Client = {
  id: ID;
  name: string;
  type: ClientType;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  accountRef: string;
  termsDays: number;
  portalEnabled: boolean;
};

export type EnquiryStatus = "Logged" | "Quoted" | "Won" | "Lost" | "No bid";
export type Enquiry = {
  id: ID;
  ref: string;
  receivedAt: Stamp;
  source: "Phone" | "Email" | "Tender" | "Site visit" | "Existing client" | "Architect referral";
  loggedBy: string;
  clientId: ID;
  contactName: string;
  location: string;
  county: string;
  description: string;
  status: EnquiryStatus;
  quoteId?: ID;
  notes: string;
};

export type QuoteStatus = "Draft" | "Awaiting approval" | "Sent" | "Opened" | "Queried" | "Accepted" | "Declined";
export type Quote = {
  id: ID;
  ref: string;
  enquiryId?: ID;
  clientId: ID;
  title: string;
  status: QuoteStatus;
  lines: QuoteLine[];
  costing: Costing;
  sentAt?: Stamp;
  openedAt?: Stamp;
  respondedAt?: Stamp;
  chasedAt?: Stamp;
  poNumber?: string;
  validDays: number;
  /** True when the first draft was prepared by the assistant from the enquiry. */
  drafted: boolean;
  query?: string;
};

// ── Projects ──────────────────────────────────────────────────────────────────

export type ProjectStatus = "Not started" | "Live" | "Complete" | "Invoiced" | "Closed";
export type AuditEntry = { at: Stamp; who: string; what: string };

export type Project = {
  id: ID;
  /** Site code, for example C720. */
  code: string;
  name: string;
  clientId: ID;
  quoteId?: ID;
  location: string;
  county: string;
  description: string;
  /** Heritage status of the building, shown on the project header. */
  heritage: string;
  status: ProjectStatus;
  contractsManagerId: ID;
  siteManagerId: ID;
  startDate: Day;
  endDate: Day;
  /** Agreed contract value excluding VAT. Null when the job is not priced yet. */
  value: number | null;
  pricedBy: "Quote" | "Schedule of rates" | "Unpriced";
  siteInstructions: string;
  extrasFlag: boolean;
  snaggingFlag: boolean;
  invoiceHold: boolean;
  completedAt?: Stamp;
  handoverSentAt?: Stamp;
  audit: AuditEntry[];
};

export type ScopeGroup = { id: ID; projectId: ID; label: string; isOriginal: boolean; date: Day };
export type ScopeTask = {
  id: ID;
  projectId: ID;
  groupId: ID;
  description: string;
  done: boolean;
  completedAt?: Stamp;
  completedBy?: string;
  notes?: string;
};

export type Variation = {
  id: ID;
  projectId: ID;
  raisedById: ID;
  raisedAt: Stamp;
  /** English text, either as written or as translated. */
  description: string;
  /** What the operative actually wrote on site, when it was not in English. */
  original?: string;
  originalLanguage?: Language;
  measured: string;
  estimatedValue: number;
  status: "Draft" | "Approved" | "Rejected";
  approvedBy?: string;
};

/** "other" is anything that is not people or plant (Oisin, 17 Nov). */
export type RequestKind = "personnel" | "own_plant" | "hired_plant" | "other";
export type SiteRequest = {
  id: ID;
  /** The site it is for. Null for a general request from a site manager, not tied to one site (Oisin, 17 Nov). */
  projectId: ID | null;
  kind: RequestKind;
  description: string;
  quantity: number;
  neededFrom: Day;
  neededTo: Day;
  notes: string;
  requestedBy: string;
  /** Who asked, for a general request, so it stays on their own list. */
  requestedById?: ID;
  createdAt: Stamp;
  status: "Open" | "Done";
  /** The managing director's yes or no (Admin > Requests). A yes stays open until the office has arranged it. */
  decision?: "Approved" | "Declined";
  decidedBy?: string;
  decidedAt?: Stamp;
  /**
   * Who it is with (Oisin, 17 Nov). A request made on an operative's phone waits with the site
   * manager first ("site"): he forwards it to management as his own, or marks it dealt with.
   * Missing means it is with the office, as every request from a site manager is.
   */
  heldBy?: "site";
  /** The operative who first asked, once the site manager has forwarded it as his own. */
  raisedBy?: string;
  forwardedAt?: Stamp;
  /** Who marked it dealt with. */
  dealtBy?: string;
  /** A named person asked for on one day, from the planner on the site manager's phone. */
  personId?: ID;
};

/**
 * A site the managing director has let a site manager open besides the ones they run (Admin,
 * Site access; Oisin, 17 Nov). One row per person and site.
 */
export type SiteAccess = { id: ID; personId: ID; projectId: ID; by: string; at: Stamp };

/** What the site manager wants the crew to know on one day. It shows on the operative's phone that day (Oisin, 17 Nov). */
export type DayInstruction = { id: ID; projectId: ID; date: Day; text: string; by: string; at: Stamp };

/**
 * An invoice for this system (Admin > Billing, 16 Nov): one a month for the month before, per
 * person with a sign-in. Past invoices are fixed records; the next one is worked out from today's
 * people and the plan on the newest invoice (src/lib/subscription.ts).
 */
export type SubscriptionInvoice = {
  id: ID;
  number: string;
  plan: string;
  /** Per person with a sign-in, per month, before VAT. */
  perUser: number;
  /** The first day of the month it is for. */
  month: Day;
  issuedOn: Day;
  /** Taken by direct debit on this day. */
  collectOn: Day;
  users: number;
  /** Before VAT. */
  amount: number;
};

/** Money someone wants to spend that needs the managing director's yes or no (Admin > Requests). */
/** Money someone paid out of their own pocket for the firm, claimed back from the site phone (Oisin, 17 Nov). */
export type ExpenseKind = "Fuel" | "Materials" | "Parking and tolls" | "Tools and PPE" | "Other";
export type Expense = {
  id: ID;
  personId: ID;
  createdAt: Stamp;
  /** The day it was paid. */
  date: Day;
  kind: ExpenseKind;
  what: string;
  /** Including VAT, as on the receipt. */
  amount: number;
  projectId: ID | null;
  receipt?: { dataUrl: string; sizeKb: number };
  status: "Waiting" | "Approved" | "Declined";
  decidedBy?: string;
  decidedAt?: Stamp;
};

export type SpendRequest = {
  id: ID;
  requestedById: ID;
  createdAt: Stamp;
  /** What is being bought, in a few words. */
  what: string;
  supplier: string;
  /** The project it is for, or null for the firm as a whole (the yard, training, tools). */
  projectId: ID | null;
  /** Before VAT. */
  amount: number;
  reason: string;
  status: "Waiting" | "Approved" | "Declined";
  decidedBy?: string;
  decidedAt?: Stamp;
};

/** Materials or work ordered for a site from a supplier or subcontractor, until it arrives. */
export type SupplyOrder = {
  id: ID;
  /** The supplier or subcontractor, as on their paperwork. */
  from: string;
  party: "supplier" | "subcontractor";
  projectId: ID;
  description: string;
  orderedOn: Day;
  dueOn: Day;
  status: "Ordered" | "Part delivered" | "Ready to collect" | "Delivered";
  /** What has come so far, for a part delivery: "1,200 of 3,000". */
  progress?: string;
  deliveredOn?: Day;
};

/** An update a subcontractor or supplier sent through the portal. Client updates come from the quotes themselves. */
export type PortalNote = {
  id: ID;
  at: Stamp;
  party: "subcontractor" | "supplier";
  from: string;
  projectId: ID | null;
  text: string;
};

// ── Labour ────────────────────────────────────────────────────────────────────

/** Someone on a project's roster. Being on the roster is what lets attendance be marked. */
export type Assignment = { id: ID; projectId: ID; personId: ID };

export type Attendance = {
  id: ID;
  projectId: ID;
  personId: ID;
  date: Day;
  status: "full" | "half";
  overtimeHours: number;
  savedBy: string;
  savedAt: Stamp;
  /** False while a site manager has marked it but not yet sent the day's time stamps. */
  sent: boolean;
};

export type AttendanceChange = {
  id: ID;
  attendanceId: ID;
  projectId: ID;
  personId: ID;
  date: Day;
  at: Stamp;
  by: string;
  from: string;
  to: string;
  reason: string;
};

/** One person planned on one project for one day. Shared by week ahead and month ahead. */
/** One person planned on one site for one day. A full day unless `part` says half; overtime is hours expected on top of a full day. */
export type PlanEntry = { id: ID; projectId: ID; personId: ID; date: Day; part?: "half"; overtimeHours?: number };

// ── Plant and fleet ───────────────────────────────────────────────────────────

export type Renewal = { id: ID; kind: string; expires: Day; doc?: string; proof?: Proof };
export type ServiceRecord = { id: ID; date: Day; meter?: number; note: string };

export type PlantItem = {
  id: ID;
  assetRef: string;
  name: string;
  kind: string;
  spec: string;
  status: "Available" | "On site" | "Off for repair";
  /** Where it is now. Null means the yard. */
  projectId: ID | null;
  finance: string;
  service: ServicePlan;
  serviceHistory: ServiceRecord[];
  renewals: Renewal[];
};

export type HiredPlant = {
  id: ID;
  projectId: ID;
  description: string;
  quantity: number;
  hireCompany: string;
  hirePhone: string;
  hireRef: string;
  onHireFrom: Day;
  rate: number;
  rateUnit: "day" | "week";
  status: "On hire" | "Return notified" | "Collected";
  returnNotifiedAt?: Stamp;
  collectedAt?: Stamp;
  notes: string;
};

export type ComplianceItem = { paidDate: Day; expiryDate: Day; amount: number };
export type Vehicle = {
  id: ID;
  reg: string;
  model: string;
  kind: "Van" | "Crew van" | "Pickup" | "Tipper";
  baseLocation: string;
  driverId: ID | null;
  purchasePrice: number;
  purchaseMonth: string;
  sellPrice: number | null;
  active: boolean;
  mileage: number;
  compliance: { tax: ComplianceItem; test: ComplianceItem; insurance: ComplianceItem };
  service: ServicePlan;
};

/** A driver's daily walkaround check from the site phone (src/lib/driving.ts). */
export type VehicleCheck = { id: ID; vehicleId: ID; personId: ID; at: Stamp; defects: { item: string; note: string }[] };

export type FleetDocCategory = "repairs" | "tax" | "test" | "insurance";
export type FleetDoc = {
  id: ID;
  vehicleId: ID;
  category: FleetDocCategory;
  date: Day;
  amount: number;
  workDone?: string;
  garage?: string;
  garageLocation?: string;
  expiryDate?: Day;
  fileName: string;
  proof?: Proof;
};

// ── Files ─────────────────────────────────────────────────────────────────────

export type FileKind = "pdf" | "image" | "video" | "doc" | "sheet" | "email" | "drawing";
export type FileCategory =
  | "Drawings"
  | "Method statements"
  | "Conservation reports"
  | "Health and safety"
  | "Correspondence"
  | "Photos and videos"
  | "Invoices"
  | "Handover"
  | "Unclassified";
export type PhotoStage = "Before" | "During" | "After";

export type FileItem = {
  id: ID;
  /** Null means the general "to be sorted" area, in the Files section. */
  projectId: ID | null;
  folder: string;
  name: string;
  kind: FileKind;
  category: FileCategory;
  stage?: PhotoStage;
  caption?: string;
  sizeKb: number;
  modified: Day;
  addedBy: string;
  source: "Upload" | "Email" | "Site app";
  /** 0-5, picks the placeholder tone for sample photos, which have no real image behind them. */
  tone: number;
  /** A real picture added from a camera or a file during the demo, shrunk and kept in the browser. */
  dataUrl?: string;
};

// ── Money ─────────────────────────────────────────────────────────────────────

export type CostCategoryKey = "plant" | "equipment" | "material" | "labour" | "transport" | "other";
export type Allocation = { id: ID; projectId: ID; category: CostCategoryKey; amount: number; description: string };

export type SupplierInvoice = {
  id: ID;
  supplier: string;
  invoiceNo: string;
  invoiceDate: Day;
  docType: "invoice" | "credit_note";
  subtotal: number;
  vat: number;
  total: number;
  /** Job reference the reader found on the paper, if any. */
  jobRef: string | null;
  fileName: string;
  receivedAt: Stamp;
  readStatus: "not_read" | "needs_review" | "confirmed";
  lines: { description: string; amount: number }[];
  allocations: Allocation[];
  confirmedBy?: string;
  confirmedAt?: Stamp;
  /** Number on the paper copy in the office files, Sage's extra reference (Oldstone call, 16 Nov). */
  fileNo?: number;
  /** Over the sign-off limit: asked of the director, and his yes. See src/lib/purchases.ts. */
  signOffAsked?: Stamp;
  signOff?: { by: string; at: Stamp };
  /** Sent to the accounts package as a purchase invoice. */
  exportedAt?: Stamp;
};

/** A week of timesheet hours sent to Sage Payroll: hours only, pay is worked out in Sage. */
export type PayrollExport = { id: ID; weekStart: Day; at: Stamp; by: string; people: number; hours: number };

export type SalesInvoiceStatus = "To invoice" | "Held" | "Invoiced" | "Paid";
export type SalesInvoice = {
  id: ID;
  ref: string;
  projectId: ID;
  clientId: ID;
  description: string;
  net: number;
  vatPct: number;
  status: SalesInvoiceStatus;
  holdReason?: string;
  issuedOn?: Day;
  dueOn?: Day;
  paidOn?: Day;
  accountsNo?: string;
  exportedAt?: Stamp;
};

// ── Inbox ─────────────────────────────────────────────────────────────────────

export type MailIntent =
  | "Enquiry"
  | "Tender invitation"
  | "Quote query"
  | "Certificate"
  | "Holiday request"
  | "Completion request"
  | "Complaint"
  | "Supplier statement"
  | "Conservation officer"
  | "General";

export type Mail = {
  id: ID;
  mailbox: string;
  folder: "Inbox" | "Sent" | "Drafts" | "Archive";
  fromName: string;
  fromAddress: string;
  subject: string;
  body: string;
  receivedAt: Stamp;
  read: boolean;
  intent: MailIntent;
  routedToId: ID;
  clientId?: ID;
  replyDraft?: { subject: string; body: string };
  attachment?: string;
  starred?: boolean;
  /** Who a sent email went to, and who was copied. */
  to?: string;
  cc?: string;
  bcc?: string;
};

// ── Team chat ─────────────────────────────────────────────────────────────────

/**
 * Team chat, laid out like Ping in the reference demos (16 Nov, Oisin): channels and direct
 * messages, as in the firm's Teams or Slack. A channel per live site, plus office channels.
 */
export type ChatChannel = {
  id: ID;
  kind: "channel" | "dm";
  /** Channel name. A direct message has none: it shows the other person's name. */
  name: string;
  projectId?: ID;
  purpose: string;
  memberIds: ID[];
  /** When each member last opened it. Anything newer, from someone else, is unread. */
  lastRead: Record<ID, Stamp>;
};

export type ChatMessage = {
  id: ID;
  channelId: ID;
  authorId: ID;
  at: Stamp;
  text: string;
  /** The name of a file sent with the message. */
  attachment?: string;
};

// ── Management layer ──────────────────────────────────────────────────────────

/**
 * "chaser" and "client_update" are emails drafted by Ask AI (milestone 7). "cert_reminder" is
 * the Monday email to the site managers listing training tickets that run out inside 30 days.
 */
export type ApprovalKind = "variation" | "quote" | "weekly_summary" | "handover" | "reply" | "cert_reminder" | "chaser" | "client_update";
export type Approval = {
  id: ID;
  kind: ApprovalKind;
  title: string;
  /** One sentence on where this draft came from. */
  rationale: string;
  createdAt: Stamp;
  status: "Pending" | "Approved" | "Discarded";
  /** Free text the approver can edit before approving (email body, summary). */
  body?: string;
  /** For a drafted email: who it goes to and its subject. The text is in `body`. */
  email?: { toName: string; toAddress: string; subject: string };
  variationId?: ID;
  quoteId?: ID;
  projectId?: ID;
  mailId?: ID;
  salesInvoiceId?: ID;
  resolvedBy?: string;
  resolvedAt?: Stamp;
};

export type DepartmentKey =
  | "dashboard"
  | "inbox"
  | "chat"
  | "sales"
  | "projects"
  | "schedule"
  | "people"
  | "plant"
  | "files"
  | "invoicing"
  | "portal"
  | "site"
  | "admin"
  | "settings";

export type Automation = {
  id: ID;
  department: DepartmentKey;
  name: string;
  when: string;
  trigger: string;
  effect: string;
  enabled: boolean;
  lastRun?: Stamp;
  runs: number;
};

export type Activity = { id: ID; at: Stamp; who: string; what: string; target: string; department: DepartmentKey };

/** What one role may open and see. Edited by the managing director in Admin > Roles and access. */
export type AccessRow = {
  id: RoleKey;
  departments: DepartmentKey[];
  /** Contract values, quote totals, invoice amounts. */
  seeValues: boolean;
  /** Costs and margins. */
  seeMargins: boolean;
  /** What this role may do, beyond which departments it can open. */
  perms: PermKey[];
};

/** Things a person may do. The list with its wording is in src/data/permissions.ts. */
export type PermKey = "allProjects" | "manageProjects" | "priceQuotes" | "approveDrafts" | "answerRequests" | "planWeek" | "markTime" | "correctTime" | "manageStaff" | "approveLeave" | "seeRates" | "managePlant" | "manageInvoices" | "exportPayroll";
export type AccessKey = PermKey | "seeValues" | "seeMargins";

/**
 * One person's exceptions to their access level. Only the differences are stored: a key that
 * is missing means "same as their level".
 */
export type PersonAccess = {
  id: ID;
  departments: Partial<Record<DepartmentKey, boolean>>;
  perms: Partial<Record<AccessKey, boolean>>;
};

// ── The database ──────────────────────────────────────────────────────────────

export type Db = {
  people: Person[];
  holidays: Holiday[];
  clients: Client[];
  enquiries: Enquiry[];
  quotes: Quote[];
  projects: Project[];
  scopeGroups: ScopeGroup[];
  scopeTasks: ScopeTask[];
  variations: Variation[];
  requests: SiteRequest[];
  spendRequests: SpendRequest[];
  supplies: SupplyOrder[];
  portalNotes: PortalNote[];
  /** Newest first. */
  subscriptionInvoices: SubscriptionInvoice[];
  /** Weeks of hours sent to Sage Payroll, newest first. */
  payrollExports: PayrollExport[];
  /** Drivers' walkaround checks, newest first. */
  vehicleChecks: VehicleCheck[];
  /** Reimbursements claimed from the site phone, newest first. */
  expenses: Expense[];
  /** Site instructions for one day, put up by the site manager. One per project and day. */
  dayInstructions: DayInstruction[];
  assignments: Assignment[];
  attendance: Attendance[];
  attendanceChanges: AttendanceChange[];
  plan: PlanEntry[];
  plant: PlantItem[];
  hiredPlant: HiredPlant[];
  vehicles: Vehicle[];
  fleetDocs: FleetDoc[];
  files: FileItem[];
  supplierInvoices: SupplierInvoice[];
  salesInvoices: SalesInvoice[];
  mails: Mail[];
  chatChannels: ChatChannel[];
  /** Oldest first. */
  chatMessages: ChatMessage[];
  approvals: Approval[];
  automations: Automation[];
  activity: Activity[];
  access: AccessRow[];
  personAccess: PersonAccess[];
  /** Sites given to site managers who do not run them. */
  siteAccess: SiteAccess[];
};

// ── Demo roles (the mock sign-in) ─────────────────────────────────────────────

export type RoleKey = "md" | "contracts" | "site" | "accounts" | "operative" | "client";
/** The access levels an office or management person can hold. */
export type LevelKey = "md" | "contracts" | "site" | "accounts";
