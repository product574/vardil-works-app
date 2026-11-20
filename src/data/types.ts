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
/**
 * A file kept with a record. `sample` (sample data only) means the file is not stored but drawn
 * when opened, from the record it belongs to ("invoice", "receipt", "licence", "damage/<name>"),
 * and `dataUrl` is then empty. See src/lib/sample-docs.ts.
 */
export type Proof = { name: string; dataUrl: string; addedBy: string; addedAt: string; sample?: string };
export type Cert = {
  id: ID;
  name: string;
  issued: Day;
  expires: Day;
  proof?: Proof;
  /** Set when a ticket is recorded or renewed with no card or certificate attached yet. */
  proofNeeded?: boolean;
  /** A photo of a new card sent from the site phone, waiting for the office to check it (18 Nov). */
  sentPhoto?: { name: string; dataUrl: string; sentAt: Stamp };
};

/** The office's yearly look at a driver's licence (Compliance). The licence itself, with its expiry and copy, is `Licence` under Fleet. */
export type LicenceCheck = { checkedOn: Day; checkedBy: string };

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
  /** On Fleet's driver list (18 Nov); `drivesUntil` is the day they were taken off it. */
  drives?: boolean;
  drivesUntil?: Day;
  licences?: { driving?: Licence; cpc?: Licence };
  /** The office's yearly look at a driver's licence (Compliance, kept beside Fleet's licence and CPC at Oisin's word, 19 Nov). */
  licenceCheck?: LicenceCheck;
};

export type Holiday = {
  id: ID;
  personId: ID;
  from: Day;
  to: Day;
  status: "Requested" | "Approved" | "Declined";
  via: "Email" | "Form" | "Phone";
  note?: string;
  /** Why it was declined, if whoever declined it said (17 Nov). */
  declineNote?: string;
  decidedBy?: string;
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
  /** Where invoices are addressed: street and town. The county is kept apart so each region writes it its own way. */
  address?: string;
  county?: string;
  /** Where invoices are emailed. Without one they go to the contact. */
  billingEmail?: string;
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
  /** The kind of work it prices, from its rate book: "Lime repointing", "Roof re-slating". For the tender reports. */
  kind?: string;
  /** The tender's own sections (20 Nov, the Oldstone template): return date, documents, subcontractors, photos, workings, checks. */
  tender?: Tender;
};

// ── Tenders (20 Nov) ──────────────────────────────────────────────────────────

/** What a file kept with a tender is: the client's documents, a site photo, or our own workings. */
export type TenderFileKind = "Specification" | "Bill of quantities" | "Drawings" | "Other document" | "Site photo" | "Buildsoft" | "Workings";
export type TenderFile = { id: ID; kind: TenderFileKind; name: string; sizeKb: number; addedAt: Stamp; addedBy: string; caption?: string; tone?: number; dataUrl?: string };
/** A subcontractor asked to price one trade on a tender, and what they came back with. The one picked is in the tender's price. */
export type SubPrice = { id: ID; trade: string; subcontractorId?: ID; name: string; askedAt: Day; price?: number; receivedAt?: Day; note?: string; picked?: boolean };
/** The checks before a tender goes: documents read, subcontractors priced, workings checked, price approved. */
export type TenderCheck = "docs" | "subs" | "workings" | "price";
export type Tender = {
  /** The day the tender must be back with the client. */
  returnBy: Day;
  files: TenderFile[];
  subPrices: SubPrice[];
  checks: Partial<Record<TenderCheck, { by: string; at: Stamp }>>;
  /** The total from the Buildsoft estimate, typed in to check against the priced items. */
  buildsoftTotal?: number;
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
  /** The planned finish while a job runs; the day it finished once it has. */
  endDate: Day;
  /** The finish agreed when the job was set up. A finished job later than this ran over (Reports, Jobs finished on time). */
  plannedEnd?: Day;
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
  /** Why it was declined, if whoever declined it said (17 Nov). */
  declineNote?: string;
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
/**
 * A worker's sign-in to the phone app (Oisin, 20 Nov). The number is the one on the employee
 * register; the office sends the invite; the first time, a one-time code by text, then they set
 * their own password. In the demo the code is shown on the phone instead of texted, and the
 * hash is made in the browser. REAL BUILD: the code, the hash and the session live on the server.
 */
export type PhoneAccount = {
  personId: ID;
  invitedAt?: Stamp;
  invitedBy?: string;
  /** SHA-256 of the person's id and password. "seed" in the sample data: set, but unknown. */
  passwordHash?: string;
  setUpAt?: Stamp;
  /** The one-time code last sent, what it is for, and whether it has been typed in right. */
  code?: { code: string; sentAt: Stamp; purpose: "setup" | "reset"; ok?: boolean };
  /** When codes were sent, for the limit of 3 an hour. */
  codesSent: Stamp[];
  /** Wrong passwords or codes in a row. */
  failed: number;
  lockedUntil?: Stamp;
  /** Signed in on their phone until this time (30 days from signing in). */
  signedInUntil?: Stamp;
  lastSignIn?: Stamp;
  /** Fingerprint or Face ID opens the app. */
  biometrics?: boolean;
};

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
  /** When an approved claim went to the office for payment, and who exported it (17 Nov). */
  exportedAt?: Stamp;
  exportedBy?: string;
  /** Marked paid in Admin, after a confirm box (19 Nov). The phone then shows Paid. */
  paidAt?: Stamp;
  paidBy?: string;
  /** Why it was declined, if whoever declined it said (17 Nov). */
  declineNote?: string;
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
  /** Why it was declined, if whoever declined it said (17 Nov). */
  declineNote?: string;
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
  /**
   * "full" or "half" for a normal working day. "restday" (Oisin, 17 Nov) is a weekend or bank
   * holiday time stamp: no normal day in it, every hour at an overtime rate.
   */
  status: "full" | "half" | "restday";
  /** Overtime hours at time and a half. */
  overtimeHours: number;
  /** Overtime hours at double time. A day can have both rates; left off when there are none (17 Nov). */
  doubleHours?: number;
  savedBy: string;
  savedAt: Stamp;
  /** False while a site manager has marked it but not yet sent the day's time stamps. */
  sent: boolean;
};

/**
 * Overtime an operative claims from the phone (Oisin, 17 Nov, round ten): extra hours on one
 * day, for the site manager to know about. It is optional and only for overtime. The site
 * manager approves it, at the hours and rates he settles on, or declines it; an approved claim
 * is added to that day on the timesheet.
 */
export type OvertimeClaim = {
  id: ID;
  personId: ID;
  /** The site they worked the hours on. */
  projectId: ID;
  /** The day worked: today or one of the seven days before the claim was made. */
  date: Day;
  /** The extra hours claimed, in all. Whoever approves splits them between the rates. */
  hours: number;
  note: string;
  createdAt: Stamp;
  status: "Waiting" | "Approved" | "Declined";
  decidedBy?: string;
  decidedAt?: Stamp;
  /** What was approved, at each rate. It can differ from what was claimed. */
  overtimeHours?: number;
  doubleHours?: number;
  /** Why it was declined, if whoever declined it said. */
  declineNote?: string;
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

export type Renewal = { id: ID; kind: string; expires: Day; doc?: string; proof?: Proof; /** Renewed with no certificate attached yet (18 Nov). */ proofNeeded?: boolean };
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

// ── Fleet (18 Nov, brought across from the Secure-All build at Oisin's word) ───────

/** A yard or office that vehicles are kept at. */
export type BaseKind = "Yard" | "Office";
export type Base = { id: ID; name: string; county: string; region: string; kind: BaseKind };

export type Garage = { id: ID; name: string; town: string; county: string; phone: string; email: string; contact?: string; notes?: string };

/**
 * One renewal (tax, the CVRT or MOT, insurance). Recording a renewal sets `discPending` until
 * someone ticks that the new disc is on the vehicle (`discOnAt`), a few days later; after 7 days
 * without the tick it is flagged. `proofNeeded`: renewed with no receipt or certificate attached
 * yet (Compliance, 18 Nov).
 */
export type ComplianceItem = { paidDate: Day; expiryDate: Day; amount: number; discPending?: boolean; discOnAt?: Day; proofNeeded?: boolean };

export type VehicleKind = "Van" | "Crew van" | "Pickup" | "Tipper" | "Car";
export type Fuel = "Diesel" | "Petrol" | "Hybrid" | "Electric";
export type Vehicle = {
  id: ID;
  reg: string;
  make: string;
  model: string;
  kind: VehicleKind;
  fuel: Fuel;
  /** What the vehicle is used for, such as Site crew van or Muck away. */
  division: string;
  ownership: "Owned" | "Leased";
  baseId: ID | null;
  /** The person who drives it; null for a pool vehicle at the yard. */
  driverId: ID | null;
  purchasePrice: number | null;
  /** "YYYY-MM". */
  purchaseMonth: string | null;
  mileage: number;
  /** When the mileage was last known to be right, and where it came from. */
  mileageAt?: Day;
  mileageFrom?: "typed" | "invoice";
  active: boolean;
  /** Set when the vehicle is removed from the fleet. */
  removedAt?: Day;
  /** What it was sold for; null means not sold (scrapped, returned to the lessor). */
  sellPrice: number | null;
  compliance: { tax: ComplianceItem; test: ComplianceItem; insurance: ComplianceItem };
  /** When the next service is due (kept from ABC's own Fleet, Oisin's pick). */
  service: ServicePlan;
};

/** A driver's daily walkaround check from the site phone (src/lib/driving.ts). */
export type VehicleCheck = { id: ID; vehicleId: ID; personId: ID; at: Stamp; defects: { item: string; note: string }[] };

export type RepairCategory = "Service" | "Tyres" | "Brakes" | "Bodywork" | "Breakdown and recovery" | "Test preparation" | "Glass" | "Electrical" | "Other";

/**
 * One vehicle's part of a garage invoice. A garage statement that covers several vehicles is
 * split into a line per vehicle. The base, the driver and the site that driver was on are kept
 * as they were on the day of the work, so a vehicle that moves later does not take its costs with it.
 */
export type RepairLine = {
  id: ID;
  vehicleId: ID;
  baseId: ID | null;
  driverId: ID | null;
  /** The site the driver was on that day, from the timesheet (or the plan); null when none. */
  siteId: ID | null;
  category: RepairCategory;
  description: string;
  mileage: number | null;
  /** This vehicle's share, as charged (VAT included, as on the invoice). */
  amount: number;
};

export type InvoiceStatus = "To check" | "Checked";

export type RepairInvoice = {
  id: ID;
  invoiceNo: string;
  garageId: ID;
  /** The date on the invoice. */
  date: Day;
  lines: RepairLine[];
  /** The invoice total, VAT included: the sum of the lines. */
  total: number;
  /** The VAT on it, when the invoice shows it. */
  vat: number | null;
  status: InvoiceStatus;
  checkedBy?: string;
  checkedAt?: Stamp;
  file?: Proof;
  /** More pages of the same invoice, when it was added as several files. */
  extraFiles?: Proof[];
  /** Each time a checked invoice was put back to check, with the note saying why. */
  backNotes?: { at: Stamp; by: string; text: string }[];
  poNumber?: string;
  notes?: string;
  enteredBy: string;
  enteredAt: Stamp;
  editedBy?: string;
  editedAt?: Stamp;
};

export type FleetDocCategory = "tax" | "test" | "insurance" | "other";
export type FleetDoc = {
  id: ID;
  vehicleId: ID;
  category: FleetDocCategory;
  date: Day;
  amount: number;
  expiryDate?: Day;
  note?: string;
  fileName: string;
  proof?: Proof;
  extraProofs?: Proof[];
};

/** Damage to a vehicle, reported on the site phone: where, what happened, photos. Fleet, Damage reported. */
export type DamageReport = {
  id: ID;
  vehicleId: ID;
  /** The person who reported it. */
  driverId: ID | null;
  at: Stamp;
  where: string;
  note: string;
  photos: Proof[];
  status: "New" | "Dealt with";
  dealtBy?: string;
  dealtAt?: Stamp;
  dealtNote?: string;
};

/** A private, dated note on a garage. Deleted with a confirm, never edited. */
export type GarageNote = { id: ID; garageId: ID; at: Stamp; by: string; text: string };

/** A licence on file for a driver: when it runs out, and a copy. */
export type Licence = {
  expiryDate: Day;
  proof?: Proof;
  /** More pages of the same licence, such as the back of the card. */
  extraProofs?: Proof[];
  /** Set when the driver sent it from the site phone: it shows at once, flagged until the office has checked it. */
  fromPhoneAt?: Stamp;
  /** Recorded with no copy attached yet (Compliance, decision 117): shows "Proof needed" until one is. */
  proofNeeded?: boolean;
};
export type LicenceKey = "driving" | "cpc";

/**
 * A driver, as Fleet sees them: a person from People who is on the driver list (`Person.drives`),
 * with their licences. Worked out from the person (`driversOf` in src/lib/fleet.ts), never stored.
 * "Left" means taken off the driver list, or gone from the firm.
 */
export type Driver = { id: ID; name: string; phone: string; email: string; trade: string; baseId: ID | null; active: boolean; leftAt?: Day; licences?: { driving?: Licence; cpc?: Licence } };

/** A to-do on the Dashboard: what and when. A renewal put on the list carries the vehicle and which renewal it is. */
/** `complianceKey` and `to`: a Compliance row put on the list (merged 19 Nov), ticked off once it is renewed, and where it opens. */
export type Todo = { id: ID; title: string; due: Day; vehicleId?: ID; item?: "tax" | "test" | "insurance"; complianceKey?: string; to?: string; createdAt: Stamp; createdBy: string; doneAt?: Stamp; doneBy?: string };

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
  | "Programme"
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
  /** "Portal" is something a client sent in through their portal: a purchase order, a payment certificate. */
  source: "Upload" | "Email" | "Site app" | "Portal";
  /** 0-5, picks the placeholder tone for sample photos, which have no real image behind them. */
  tone: number;
  /** A real picture added from a camera or a file during the demo, shrunk and kept in the browser. */
  dataUrl?: string;
};

// ── Money ─────────────────────────────────────────────────────────────────────

export type CostCategoryKey = "plant" | "equipment" | "material" | "labour" | "transport" | "other";
export type Allocation = { id: ID; projectId: ID; category: CostCategoryKey; amount: number; description: string };

/**
 * A firm that works on our sites under its own name: scaffolders, carvers, electricians. In
 * the portal each one sees its own sites and its own invoices, and nothing of anyone else's.
 */
export type Subcontractor = {
  id: ID;
  name: string;
  trade: string;
  contactName: string;
  email: string;
  phone: string;
  /** Their account in the accounts package. */
  accountRef: string;
  termsDays: number;
  /** The sites they are working on. */
  projectIds: ID[];
  /** Their insurances, safety statement and method statements (Compliance, 18 Nov). */
  papers: SubPaper[];
  /** Their people who work on our sites, each with a Safe Pass. */
  workers: SubWorker[];
};

/**
 * A subcontractor's paper. Insurances and the safety statement run out on a date; a method
 * statement (RAMS) is one per site they work on and has no expiry, only whether it came in.
 */
export type SubPaperKind = "Public liability" | "Employers' liability" | "Safety statement" | "Method statement";
export type SubPaper = { id: ID; kind: SubPaperKind; projectId?: ID; reference?: string; cover?: string; expires?: Day; receivedOn: Day; via: "Portal" | "Email"; proof?: Proof; proofNeeded?: boolean };
export type SubWorker = { id: ID; name: string; safePassExpires: Day; proof?: Proof; proofNeeded?: boolean };

/** One of the firm's own papers: insurances, tax clearance, registrations (Compliance, Company). */
export type CompanyPaper = { id: ID; name: string; provider: string; reference: string; cover?: string; expires: Day; proof?: Proof; proofNeeded?: boolean };

/** A training course people are booked on. Marking it done renews the ticket for everyone booked. */
export type Course = {
  id: ID;
  /** The training ticket it gives or renews. */
  ticket: string;
  provider: string;
  venue: string;
  date: Day;
  places: number;
  /** Cost a head, before VAT. */
  cost: number;
  bookedIds: ID[];
  doneAt?: Stamp;
  doneBy?: string;
};

/** A scaffold or tower on a site, inspected every 7 days and after any change (the project's scaffold register). */
export type Scaffold = {
  id: ID;
  projectId: ID;
  ref: string;
  kind: "Scaffold" | "Tower";
  description: string;
  /** Who put it up: a subcontractor's name, or the firm itself. */
  erectedBy: string;
  erectedOn: Day;
  struckOn?: Day;
  /** A tower from the firm's own plant. */
  plantId?: ID;
  /** Newest first. */
  inspections: ScaffoldInspection[];
};
export type ScaffoldInspection = { id: ID; date: Day; by: string; result: "Safe to use" | "Not safe to use"; note: string };

/**
 * An invoice the firm has to pay: from a supplier of goods or hire, or from a subcontractor.
 * It is checked (each line given a project and a cost heading), approved into job costs, paid
 * by accounts and marked paid. `readStatus` "confirmed" means approved: the rest of where it
 * stands is worked out from the fields below (src/lib/purchases.ts).
 */
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
  /** Who approved it into job costs, and when. */
  confirmedBy?: string;
  confirmedAt?: Stamp;
  /** Missing means a supplier. */
  party?: "supplier" | "subcontractor";
  subcontractorId?: ID;
  /** How it reached the office. Missing means by email. */
  via?: "email" | "portal" | "post";
  /** The firm's own file number, counting up: written on the paper and sent to the accounts package as the extra reference. */
  fileNo?: string;
  dueOn?: Day;
  /** Checked and waiting for someone who may approve it. */
  askedBy?: string;
  askedAt?: Stamp;
  /** The approver sent it back, with the reason. Cleared when it is asked for or approved again. */
  sentBack?: { by: string; at: Stamp; reason: string };
  paidOn?: Day;
  paidBy?: string;
  /** The bank reference of the payment, if accounts noted one. */
  paidRef?: string;
  /** Stamped when it went to the accounts package, so it is never sent twice. */
  exportedAt?: Stamp;
  /** The copy a subcontractor attached in the portal, or the office attached when logging it. */
  copy?: { name: string; dataUrl: string };
  /**
   * The site manager's step (20 Nov, Jimmy's chain): set when it was asked for, so the site
   * manager of the job approves it before the managing director does. Stamped once he has.
   */
  siteStep?: boolean;
  siteApprovedBy?: string;
  siteApprovedAt?: Stamp;
};

/**
 * Who approves an invoice the firm pays (20 Nov, set in Admin, Invoice approvals, from each
 * firm's answers to the onboarding form):
 * "site-md": the site manager of the job, then the managing director, then the office pays (Jimmy's own);
 * "site": the site manager of the job alone, then the office pays;
 * "accounts-limit": accounts up to the limit before VAT, the managing director above, and a
 * subcontractor's invoice by whoever runs the site (the rule from 18 Nov).
 */
export type PayChain = "site-md" | "site" | "accounts-limit";

/** A money limit somebody may approve up to. "supplier": what accounts may approve on a supplier invoice, before VAT; above it the managing director approves. */
export type ApprovalLimit = { id: "supplier"; amount: number; chain?: PayChain };


/** A week of timesheet hours sent to Sage Payroll: hours only, pay is worked out in Sage. */
export type PayrollExport = { id: ID; weekStart: Day; at: Stamp; by: string; people: number; hours: number };
/** A bank holiday: every hour worked on it is at double time, and nobody is marked a normal day. */
/** A day the firm is closed. `closure` groups the days of one company closure added as a range (19 Nov). */
export type BankHoliday = { date: Day; name: string; closure?: ID };
/** A manager's check of a week's hours, before the office exports them to Sage Payroll by hand (17 Nov). */
export type PayrollCheck = { id: ID; weekStart: Day; at: Stamp; by: string };

/**
 * "To invoice" is a draft that has not gone to the client, "Invoiced" one that has. On screen
 * they read Draft, Sent and, once past the due date, Overdue (src/lib/invoices.ts).
 */
export type SalesInvoiceStatus = "To invoice" | "Held" | "Invoiced" | "Paid";
export type InvoiceLine = { id: ID; description: string; qty: number; unit: string; rate: number };
export type SendRoute = "email" | "portal" | "post";
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
  /** Priced lines, on an invoice drafted by hand. Without them it is one line: the description and the net. */
  lines?: InvoiceLine[];
  /** Drafted by a person in Invoicing, rather than raised from a stage reached or a job completed. */
  manual?: boolean;
  /** The client's purchase order number, printed on the invoice. */
  poNumber?: string;
  /** Printed under the lines. */
  notes?: string;
  /** When and how it went to the client. */
  sentAt?: Stamp;
  sentTo?: string;
  sentVia?: SendRoute[];
  /** The client said in the portal that they have paid. Accounts still confirm it against the bank. */
  clientPaidOn?: Day;
  /** Who did what to this invoice, oldest first. */
  history?: AuditEntry[];
};

/** A note on an invoice for the office only. Emails to and from the client are in `mails`. */
export type InvoiceComment = { id: ID; salesInvoiceId: ID; at: Stamp; who: string; text: string };

/**
 * A client questioning or disputing an invoice, by the portal, email or phone. While one is
 * open the invoice is not chased. Settling it records what was agreed.
 */
export type InvoiceQuery = {
  id: ID;
  salesInvoiceId: ID;
  raisedAt: Stamp;
  via: "Portal" | "Email" | "Phone";
  raisedBy: string;
  text: string;
  status: "Open" | "Settled";
  /** What the office told the client, oldest first. */
  replies: { at: Stamp; who: string; text: string }[];
  outcome?: string;
  settledBy?: string;
  settledAt?: Stamp;
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

/** A file on an email. Ones attached in the demo carry the file itself; sample emails only name theirs. */
export type MailAttachment = { name: string; sizeKb?: number; dataUrl?: string };

export type Mail = {
  id: ID;
  mailbox: string;
  /**
   * Where it is kept. "Filed" (Oisin, 17 Nov) is an email someone has put under its label: it has
   * left the Inbox and is found under that label, as in Gmail.
   */
  folder: "Inbox" | "Sent" | "Drafts" | "Archive" | "Filed";
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
  /** The client invoice this email is about, so it shows on the invoice's own page. */
  salesInvoiceId?: ID;
  /** The supplier or subcontractor invoice this email is about: a remittance advice. */
  purchaseInvoiceId?: ID;
  /** Files attached when the email was written here (17 Nov). */
  attachments?: MailAttachment[];
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
  /** Why the draft was discarded, if whoever discarded it said (17 Nov). */
  discardNote?: string;
};

export type DepartmentKey =
  | "dashboard"
  | "inbox"
  | "chat"
  | "sales"
  | "customers"
  | "projects"
  | "schedule"
  | "people"
  | "plant"
  | "compliance"
  /** Fleet (18 Nov): brought across from the Secure-All build, a button of its own after Plant. */
  | "fleet"
  | "files"
  | "invoicing"
  /** Profitability (17 Nov): the managing director's alone. */
  | "profit"
  | "reports"
  | "portal"
  | "site"
  | "admin"
  | "settings"
  /** Vardil Works (19 Nov): Vardil staff only. Never part of any level's access; see src/app/staff.ts. */
  | "vardil";

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
export type PermKey = "allProjects" | "manageProjects" | "priceQuotes" | "approveDrafts" | "answerRequests" | "planWeek" | "markTime" | "correctTime" | "manageStaff" | "approveLeave" | "seeRates" | "managePlant" | "manageInvoices" | "approveInvoices" | "approveSubInvoices" | "manageCompany" | "recordInspections" | "checkPayroll" | "exportPayroll";
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
  payrollChecks: PayrollCheck[];
  /** The days the firm treats as bank holidays: the public holidays, as changed in Admin (17 Nov). */
  bankHolidays: BankHoliday[];
  /** Overtime claimed from the site phone, newest first (round ten). */
  overtimeClaims: OvertimeClaim[];
  /** Drivers' walkaround checks, newest first. */
  vehicleChecks: VehicleCheck[];
  /** Reimbursements claimed from the site phone, newest first. */
  expenses: Expense[];
  /** Sign-ins to the phone app, one per person invited (20 Nov). */
  phoneAccounts: PhoneAccount[];
  /** Site instructions for one day, put up by the site manager. One per project and day. */
  dayInstructions: DayInstruction[];
  assignments: Assignment[];
  attendance: Attendance[];
  attendanceChanges: AttendanceChange[];
  plan: PlanEntry[];
  plant: PlantItem[];
  hiredPlant: HiredPlant[];
  vehicles: Vehicle[];
  bases: Base[];
  garages: Garage[];
  /** Newest first. */
  garageInvoices: RepairInvoice[];
  fleetDocs: FleetDoc[];
  /** Newest first. */
  damageReports: DamageReport[];
  garageNotes: GarageNote[];
  todos: Todo[];
  files: FileItem[];
  supplierInvoices: SupplierInvoice[];
  subcontractors: Subcontractor[];
  approvalLimits: ApprovalLimit[];
  companyPapers: CompanyPaper[];
  courses: Course[];
  scaffolds: Scaffold[];
  salesInvoices: SalesInvoice[];
  invoiceComments: InvoiceComment[];
  invoiceQueries: InvoiceQuery[];
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
  /** Repairs reported from the phone, for any plant or vehicle (19 Nov). */
  repairs: RepairReport[];
  /** New certificates and licences sent from the phone, waiting for the office to check (19 Nov). */
  certSubmissions: CertSubmission[];
  /** Each time a week's roster went out by email and WhatsApp (19 Nov). */
  rosterSends: RosterSend[];
  /** The firm's own email and WhatsApp, connected in Admin, Connections (19 Nov). */
  connections: Connections;
};

/**
 * A repair reported on the phone (19 Nov, the main offering): anything broken, picked from the
 * firm's plant and vehicles or typed. It waits in Admin for a manager, who moves it from Reported
 * to In hand to Fixed; each step shows on the phone of whoever reported it.
 */
export type RepairStatus = "Reported" | "In hand" | "Fixed";
export type RepairReport = {
  id: ID;
  personId: ID;
  /** What is broken: one of the firm's own (with its id), or typed. */
  item: { kind: "plant" | "vehicle" | "other"; refId?: ID; name: string };
  where: string;
  what: string;
  photos: Proof[];
  at: Stamp;
  status: RepairStatus;
  /** Every step after it was reported, oldest first. */
  steps: { status: RepairStatus; at: Stamp; by: string; note?: string }[];
};

/**
 * A certificate or licence sent from the phone's My profile (19 Nov). It counts for nothing until
 * the office accepts it (with the date it runs to, which they can correct), or turns it down.
 */
export type CertSubmission = {
  id: ID;
  personId: ID;
  /** A training ticket (a renewal of one on file, `certId`, or a new one), or a driving licence or Driver CPC. */
  kind: "ticket" | "licence";
  certId?: ID;
  licence?: LicenceKey;
  name: string;
  expires: Day;
  photo: { name: string; dataUrl: string };
  sentAt: Stamp;
  status: "Waiting" | "Accepted" | "Turned down";
  decidedBy?: string;
  decidedAt?: Stamp;
  note?: string;
};

/** One week's roster as it went to each person (19 Nov). Shown in the demo; nothing leaves the browser. */
export type RosterSend = {
  id: ID;
  weekStart: Day;
  at: Stamp;
  by: string;
  messages: { personId: ID; name: string; to: string; via: "email" | "whatsapp"; text: string }[];
};

export type Connections = {
  email?: { provider: "Gmail" | "Outlook"; account: string; at: Stamp; by: string };
  whatsapp?: { number: string; at: Stamp; by: string };
};

// ── Demo roles (the mock sign-in) ─────────────────────────────────────────────

export type RoleKey = "md" | "contracts" | "site" | "accounts" | "operative" | "client";
/** The access levels an office or management person can hold. */
export type LevelKey = "md" | "contracts" | "site" | "accounts";

/** What Vardil staff have changed about the managing director's own access (the level Roles and access cannot edit). Missing means unchanged. */
export type MdOverride = {
  departments: Partial<Record<DepartmentKey, boolean>>;
  perms: Partial<Record<PermKey, boolean>>;
  seeValues?: boolean;
  seeMargins?: boolean;
};
