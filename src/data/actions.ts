/**
 * Every change to the sample data goes through a function in this file.
 *
 * Each one says what happened in the firm's own words ("approve a variation"), updates the
 * records it touches, and writes a line to the activity log. Swapping the sample data for a real
 * backend means rewriting these bodies as API calls; no screen needs to change.
 */
import { ASK_ACTIVITY } from "@/ai/tools";
import { filedFolder, MAX_ATTACHMENTS } from "@/lib/mail";
import { finalAccountNet, holdReason, invoiceNo, invoicedLine, paidLine, salesInvoiceFile } from "@/lib/billing";
import { plantBlocks, renewedTo, ticketBlocks } from "@/lib/compliance";
import { bankHolidayOn, closureDays, isBankHoliday, isRestDay } from "@/lib/bank-holidays";
import { addDays, dayOfWeek, isWeekend } from "@/lib/dates";
import { billingEmail, grossOf, linesNet, nextAccountsNo, routeWords } from "@/lib/invoices";
import { nextFileNo, partyOf, purchaseStage, receiptEmail, remittanceEmail } from "@/lib/purchases";
import { REGION } from "@/lib/money";
import { normaliseReg } from "@/lib/fleet";
import { overtimeText, overtimeTotal, restDayKind, restDayProblem, storedDouble } from "@/lib/overtime";
import { approvalEffect, claimHours, claimProblem } from "@/lib/overtime-claims";
import { basicHours, weekEnd } from "@/lib/payroll";
import { personWeek } from "@/lib/availability";
import { driverSiteOn, dropOutcome } from "@/lib/roster";
import { money2, r2 } from "@/lib/money";
import { quoteTotal } from "@/lib/quotes";
import { attendanceShort, type DayMark, restDayMark } from "@/lib/week";
import { levelOf, levelValue, signedInPersonId } from "./access";
import { PERMISSIONS } from "./permissions";
import { ROLES } from "./roles";
import { costingFor, linesFor, WORK, type WorkKind } from "./seed/commercial";
import { rng } from "./seed/util";
import { getDay, useData, usePrefs } from "./store";
import type { AccessKey, AccessRow, Allocation, Attendance, Cert, Client, Course, Db, Expense, DepartmentKey, Enquiry, ID, LevelKey, PermKey, Person, PhotoStage, Language, Mail, MailAttachment, MailIntent, Proof, RequestKind, RoleKey, FileCategory, FileKind, FleetDocCategory, InvoiceLine, InvoiceQuery, Project, SalesInvoice, Scaffold, SendRoute, SubPaper, Variation, Vehicle, Base, BaseKind, ComplianceItem, Day, Garage, InvoiceStatus, LicenceKey, RepairCategory, RepairInvoice, RepairLine, Todo, RepairReport, RepairStatus, CertSubmission, RosterSend } from "./types";

const mutate = (fn: (db: Db) => void) => useData.getState().mutate(fn);

/** A timestamp on the demo's "today" at the real time of day. */
export function nowStamp() {
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const ss = String(t.getSeconds()).padStart(2, "0");
  return `${getDay()}T${hh}:${mm}:${ss}`;
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}-n${Date.now().toString(36)}${(++seq).toString(36)}`;

let actingAs: ID | null = null;
/**
 * Run an action in someone else's name. Used by the site phone view when office staff are
 * looking at it as a particular operative, so what is sent carries the operative's name.
 */
export function actAs<T>(personId: ID, fn: () => T): T {
  actingAs = personId;
  try {
    return fn();
  } finally {
    actingAs = null;
  }
}

/** The name of whoever the prospect is signed in as. */
export function actorName(db: Db = useData.getState().db) {
  if (actingAs) return db.people.find((p) => p.id === actingAs)?.name ?? "Demo user";
  const { role, operativeId, asPersonId } = usePrefs.getState();
  if (role === "client") return "Client";
  const personId = signedInPersonId(role, asPersonId, operativeId, db.people);
  return db.people.find((p) => p.id === personId)?.name ?? "Demo user";
}

/** Who the prospect is signed in as, as a person. Null for a client. */
function actorId(db: Db): ID | null {
  if (actingAs) return actingAs;
  const { role, operativeId, asPersonId } = usePrefs.getState();
  if (role === "client") return null;
  return signedInPersonId(role, asPersonId, operativeId, db.people);
}

/**
 * A no can carry a note saying why (Oisin, 17 Nov). It is optional everywhere: blank means no
 * note is kept. `withNote` adds it to the line that goes in a log.
 */
const cleanNote = (note?: string) => note?.trim().replace(/\s+/g, " ") || undefined;
const withNote = (text: string, note?: string) => (cleanNote(note) ? `${text}. Note: ${cleanNote(note)}` : text);

function log(db: Db, what: string, target: string, department: DepartmentKey, who = actorName(db)) {
  db.activity.unshift({ id: newId("act"), at: nowStamp(), who, what, target, department });
}

function audit(db: Db, projectId: ID | undefined, what: string) {
  const p = db.projects.find((x) => x.id === projectId);
  if (p) p.audit.push({ at: nowStamp(), who: actorName(db), what });
}

// ── Approvals ─────────────────────────────────────────────────────────────────

export function saveApprovalBody(id: ID, body: string) {
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id);
    if (a) a.body = body;
  });
}

/** Edit a drafted email reply before it is approved. What is approved is what goes out. */
export function saveReplyDraft(mailId: ID, draft: { subject?: string; body?: string }) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === mailId);
    if (m?.replyDraft) Object.assign(m.replyDraft, draft);
  });
}

export function saveVariationFields(id: ID, fields: Pick<Variation, "description" | "measured" | "estimatedValue">) {
  mutate((db) => {
    const v = db.variations.find((x) => x.id === id);
    if (v) Object.assign(v, fields);
  });
}

/** Approving a draft is the moment it becomes real: the linked record changes state with it. */
export function approveApproval(id: ID) {
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id);
    if (!a || a.status !== "Pending") return;
    const who = actorName(db);
    a.status = "Approved";
    a.resolvedBy = who;
    a.resolvedAt = nowStamp();

    if (a.kind === "variation" && a.variationId) {
      const v = db.variations.find((x) => x.id === a.variationId);
      if (v) {
        v.status = "Approved";
        v.approvedBy = who;
        const p = db.projects.find((x) => x.id === v.projectId);
        if (p && p.value != null) p.value = Math.round((p.value + v.estimatedValue) * 100) / 100;
        audit(db, v.projectId, `Variation approved: ${v.measured} (${v.estimatedValue.toFixed(2)})`);
        if (p) {
          const f = refreshFinalAccount(db, p);
          // The final account has gone out already, so the agreed extra is billed on an invoice of its own.
          if (f && (f.status === "Invoiced" || f.status === "Paid")) {
            db.salesInvoices.unshift({ id: newId("inv"), ref: `INV-${nextNumber(db.salesInvoices.map((i) => i.ref), "INV-")}`, projectId: p.id, clientId: p.clientId, description: `Agreed extra: ${v.measured}`, net: v.estimatedValue, vatPct: f.vatPct, status: "To invoice" });
            if (p.status === "Closed") p.status = "Invoiced";
            audit(db, p.id, "Final account already issued: the extra goes to invoicing on its own");
          }
          settleExtras(db, p);
        }
      }
    }
    if (a.kind === "quote" && a.quoteId) {
      const q = db.quotes.find((x) => x.id === a.quoteId);
      if (q) {
        q.status = "Sent";
        q.sentAt = nowStamp();
        const e = db.enquiries.find((x) => x.id === q.enquiryId);
        if (e) e.status = "Quoted";
      }
    }
    if (a.kind === "handover" && a.projectId) {
      const p = db.projects.find((x) => x.id === a.projectId);
      if (p) {
        p.handoverSentAt = nowStamp();
        audit(db, p.id, "Handover pack sent to the client");
      }
    }
    if (a.kind === "reply" && a.mailId) {
      const m = db.mails.find((x) => x.id === a.mailId);
      if (m?.replyDraft) fileReply(db, m, who);
    }
    if (a.email) {
      // The email goes out as written in Approvals, and is filed under Sent.
      const domain = usePrefs.getState().brand.emailDomain;
      const mailbox = a.kind === "chaser" ? `accounts@${domain}` : `info@${domain}`;
      const { role, operativeId, asPersonId } = usePrefs.getState();
      const project = db.projects.find((p) => p.id === a.projectId);
      db.mails.unshift({
        id: newId("mail"),
        mailbox,
        folder: "Sent",
        fromName: who,
        fromAddress: mailbox,
        subject: a.email.subject,
        to: `${a.email.toName} <${a.email.toAddress}>`, body: `${a.body ?? ""}`,
        receivedAt: nowStamp(),
        read: true,
        intent: "General",
        routedToId: signedInPersonId(role, asPersonId, operativeId, db.people) ?? "p-md",
        clientId: project?.clientId ?? db.quotes.find((q) => q.id === a.quoteId)?.clientId ?? db.salesInvoices.find((i) => i.id === a.salesInvoiceId)?.clientId,
        salesInvoiceId: a.salesInvoiceId,
      });
      if (a.kind === "chaser" && a.quoteId) {
        const q = db.quotes.find((x) => x.id === a.quoteId);
        if (q) q.chasedAt = nowStamp();
      }
      if (a.kind === "chaser" && a.salesInvoiceId) {
        const inv = db.salesInvoices.find((x) => x.id === a.salesInvoiceId);
        if (inv) {
          audit(db, inv.projectId, `Payment chased: ${invoiceNo(inv)}`);
          (inv.history ??= []).push({ at: nowStamp(), who, what: "Payment chased by email" });
        }
      }
      if (a.kind === "client_update" && project) audit(db, project.id, "Progress update sent to the client");
    }
    log(db, "Approved a draft", a.title, "dashboard", who);
  });
}

/** Discard a draft waiting in Approvals, with an optional note saying why (17 Nov). */
export function discardApproval(id: ID, note?: string) {
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id);
    if (!a || a.status !== "Pending") return;
    a.status = "Discarded";
    a.resolvedBy = actorName(db);
    a.resolvedAt = nowStamp();
    if (cleanNote(note)) a.discardNote = cleanNote(note);
    else delete a.discardNote;
    if (a.kind === "variation" && a.variationId) {
      const v = db.variations.find((x) => x.id === a.variationId);
      if (v) {
        v.status = "Rejected";
        audit(db, v.projectId, `Variation rejected: ${v.measured}`);
        const p = db.projects.find((x) => x.id === v.projectId);
        if (p) settleExtras(db, p);
      }
    }
    log(db, "Discarded a draft", withNote(a.title, note), "dashboard");
  });
}

// ── Ask AI (milestone 7) ──────────────────────────────────────────────────────

/** A question to Ask AI goes in the activity log with who asked it, never the answer (decision 49). */
export function logAskAi(question: string) {
  const q = question.replace(/\s+/g, " ").trim();
  mutate((db) => log(db, ASK_ACTIVITY, q.length > 200 ? `${q.slice(0, 200)}...` : q, "dashboard"));
}

/** Edit the subject of an email drafted by Ask AI before it is approved. */
export function saveApprovalSubject(id: ID, subject: string) {
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id);
    if (a?.email && a.status === "Pending") a.email.subject = subject;
  });
}

/** An email drafted by Ask AI (a chaser or a client progress update). It waits in Approvals. */
export function draftEmailApproval(d: {
  kind: "chaser" | "client_update";
  title: string;
  rationale: string;
  to: { name: string; address: string };
  subject: string;
  body: string;
  projectId?: ID;
  quoteId?: ID;
  salesInvoiceId?: ID;
}): ID {
  const id = newId("ap");
  mutate((db) => {
    db.approvals.unshift({ id, kind: d.kind, title: d.title, rationale: d.rationale, createdAt: nowStamp(), status: "Pending", body: d.body, email: { toName: d.to.name, toAddress: d.to.address, subject: d.subject }, projectId: d.projectId, quoteId: d.quoteId, salesInvoiceId: d.salesInvoiceId });
    log(db, d.kind === "chaser" ? "Drafted a chaser" : "Drafted a client update", d.title, "dashboard", "Ask AI");
  });
  return id;
}

/** A reply drafted by Ask AI for an email in the Inbox. Replaces any reply already drafted, and waits in Approvals. */
export function draftReplyForMail(mailId: ID, subject: string, body: string, rationale: string): ID | null {
  let id: ID | null = null;
  mutate((db) => {
    const m = db.mails.find((x) => x.id === mailId);
    if (!m) return;
    m.replyDraft = { subject, body };
    const waiting = db.approvals.find((a) => a.kind === "reply" && a.mailId === mailId && a.status === "Pending");
    if (waiting) {
      waiting.rationale = rationale;
      waiting.createdAt = nowStamp();
      id = waiting.id;
    } else {
      id = newId("ap");
      db.approvals.unshift({ id, kind: "reply", title: `Reply to ${m.fromName}: ${m.subject}`, rationale, createdAt: nowStamp(), status: "Pending", mailId });
    }
    log(db, "Drafted a reply", m.subject, "inbox", "Ask AI");
  });
  return id;
}

/** Put a resolved draft back in the queue. Reverses nothing else: it is a demo convenience. */
/**
 * Bring a discarded draft back to waiting (16 Nov: only a discarded one; an approved draft has
 * already been sent or added to the money, so it cannot be taken back here). A variation that
 * was rejected with it is open again, and holds its project's final account again.
 */
export function reopenApproval(id: ID) {
  mutate((db) => {
    const a = db.approvals.find((x) => x.id === id);
    if (!a || a.status !== "Discarded") return;
    a.status = "Pending";
    delete a.resolvedBy;
    delete a.resolvedAt;
    delete a.discardNote;
    const v = a.kind === "variation" ? db.variations.find((x) => x.id === a.variationId) : undefined;
    if (v && v.status === "Rejected") {
      v.status = "Draft";
      const p = db.projects.find((x) => x.id === v.projectId);
      if (p) {
        p.extrasFlag = true;
        p.invoiceHold = true;
        syncHold(db, p.id);
        audit(db, p.id, `Variation reopened: ${v.measured}`);
      }
    }
    log(db, "Moved a draft back to waiting", a.title, "dashboard");
  });
}

// ── Automations ───────────────────────────────────────────────────────────────

export function toggleAutomation(id: ID) {
  mutate((db) => {
    const a = db.automations.find((x) => x.id === id);
    if (!a) return;
    a.enabled = !a.enabled;
    log(db, a.enabled ? "Switched an automation on" : "Switched an automation off", a.name, "admin");
  });
}

/** "Run now" in the demo records the run. Nothing is ever sent outside the firm. */
/** Run an automation now. The supplier invoice reader really reads what is waiting; the rest record the run. Returns what it did, for the message on screen. */
export function runAutomation(id: ID) {
  let note = "";
  mutate((db) => {
    const a = db.automations.find((x) => x.id === id);
    if (!a || !a.enabled) return;
    a.lastRun = nowStamp();
    a.runs += 1;
    if (a.id === "au-9") {
      const read = db.supplierInvoices.filter((s) => readOne(db, s)).length;
      note = read ? `${read} supplier invoice${read === 1 ? "" : "s"} read, ready to check` : "nothing new to read";
    }
    log(db, "Ran an automation by hand", a.name, a.department);
  });
  return note;
}

// ── Roles and access ──────────────────────────────────────────────────────────


export function setRoleDepartment(role: RoleKey, dept: DepartmentKey, on: boolean) {
  mutate((db) => {
    const row = db.access.find((a) => a.id === role);
    if (!row) return;
    row.departments = on ? [...new Set([...row.departments, dept])] : row.departments.filter((d) => d !== dept);
    log(db, on ? "Gave a role access to a department" : "Removed a role's access to a department", `${ROLES.find((r) => r.key === role)?.title}: ${dept}`, "settings");
  });
}

export function setRoleMoney(role: RoleKey, field: keyof Pick<AccessRow, "seeValues" | "seeMargins">, on: boolean) {
  mutate((db) => {
    const row = db.access.find((a) => a.id === role);
    if (!row) return;
    row[field] = on;
    // Margins are worked out from values, so they cannot be shown without them.
    if (field === "seeValues" && !on) row.seeMargins = false;
    if (field === "seeMargins" && on) row.seeValues = true;
    log(db, "Changed what a role can see", `${ROLES.find((r) => r.key === role)?.title}: ${field === "seeValues" ? "contract values" : "costs and margins"} ${on ? "shown" : "hidden"}`, "settings");
  });
}

export function setRolePerm(role: RoleKey, perm: PermKey, on: boolean) {
  mutate((db) => {
    const row = db.access.find((a) => a.id === role);
    if (!row) return;
    row.perms = on ? [...new Set([...row.perms, perm])] : row.perms.filter((p) => p !== perm);
    log(db, on ? "Allowed a role to do something" : "Stopped a role doing something", `${ROLES.find((r) => r.key === role)?.title}: ${PERMISSIONS.find((p) => p.key === perm)?.label}`, "settings");
  });
}

/**
 * Set one thing for one person. If the new value is the same as their level's, the exception
 * is dropped instead of stored, so "exceptions" only ever lists real differences.
 */
export function setPersonAccess(personId: ID, kind: "department" | "perm", key: string, on: boolean) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    const row = db.access.find((a) => a.id === levelOf(p));
    if (!p || !row) return;
    let pa = db.personAccess.find((a) => a.id === personId);
    if (!pa) {
      pa = { id: personId, departments: {}, perms: {} };
      db.personAccess.push(pa);
    }
    const put = (k: AccessKey, v: boolean) => {
      if (v === levelValue(row, k)) delete pa.perms[k];
      else pa.perms[k] = v;
    };
    if (kind === "department") {
      const k = key as DepartmentKey;
      if (on === row.departments.includes(k)) delete pa.departments[k];
      else pa.departments[k] = on;
    } else {
      const k = key as AccessKey;
      put(k, on);
      // Margins are worked out from values, so they cannot be shown without them.
      if (k === "seeValues" && !on) put("seeMargins", false);
      if (k === "seeMargins" && on) put("seeValues", true);
    }
    const what = kind === "department" ? `${key} department` : key === "seeValues" ? "contract values" : key === "seeMargins" ? "costs and margins" : (PERMISSIONS.find((x) => x.key === key)?.label ?? key);
    log(db, "Changed one person's access", `${p.name}: ${what} ${on ? "on" : "off"}`, "settings");
  });
}

export function clearPersonAccess(personId: ID) {
  mutate((db) => {
    db.personAccess = db.personAccess.filter((a) => a.id !== personId);
    log(db, "Put one person back to their level's access", db.people.find((p) => p.id === personId)?.name ?? "", "settings");
  });
}

/** Move an office person to another access level. Their exceptions are cleared: they were differences from the old level. */
export function setPersonLevel(personId: ID, level: LevelKey) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p || p.kind !== "Management" || p.level === "md") return;
    p.level = level;
    db.personAccess = db.personAccess.filter((a) => a.id !== personId);
    // Sites are given one by one at site manager level only.
    if (level !== "site") dropSiteAccess(db, personId);
    log(db, "Changed someone's access level", `${p.name}: ${ROLES.find((r) => r.key === level)?.title}`, "settings");
  });
}

/** Take away every site someone was given, and their place in those sites' group chats. */
function dropSiteAccess(db: Db, personId: ID) {
  for (const g of db.siteAccess.filter((x) => x.personId === personId)) leaveSiteChat(db, g.projectId, personId);
  db.siteAccess = db.siteAccess.filter((x) => x.personId !== personId);
}
function leaveSiteChat(db: Db, projectId: ID, personId: ID) {
  const ch = db.chatChannels.find((c) => c.kind === "channel" && c.projectId === projectId);
  if (!ch) return;
  ch.memberIds = ch.memberIds.filter((id) => id !== personId);
  delete ch.lastRead[personId];
}

/**
 * Admin, Site access (Oisin, 17 Nov): let a site manager open a site they do not run, or take
 * that away. With the site comes its group chat. Whoever runs a site always opens it.
 */
export function setSiteAccess(personId: ID, projectId: ID, on: boolean) {
  mutate((db) => {
    const site = db.projects.find((x) => x.id === projectId);
    const who = db.people.find((x) => x.id === personId);
    if (!site || !who || site.siteManagerId === personId) return;
    const has = db.siteAccess.some((x) => x.personId === personId && x.projectId === projectId);
    if (on === has) return;
    const ch = db.chatChannels.find((c) => c.kind === "channel" && c.projectId === projectId);
    if (on) {
      db.siteAccess.push({ id: newId("sa"), personId, projectId, by: actorName(db), at: nowStamp() });
      if (ch && !ch.memberIds.includes(personId)) {
        ch.memberIds.push(personId);
        // They join from now: nothing said before counts as unread.
        ch.lastRead[personId] = db.chatMessages.filter((m) => m.channelId === ch.id).reduce((last, m) => (m.at > last ? m.at : last), "");
      }
    } else {
      db.siteAccess = db.siteAccess.filter((x) => !(x.personId === personId && x.projectId === projectId));
      leaveSiteChat(db, projectId, personId);
    }
    log(db, on ? "Gave a site manager access to a site" : "Took away access to a site", `${who.name}, ${site.code} ${site.name}`, "admin");
  });
}

/**
 * Admin, Site access (Oisin, 17 Nov: "make it easier to assign which site manager should be at
 * which site"): say who runs a site. Everything that follows the site manager follows the new
 * one from then on: the project page, the timesheet and plan, requests from its crew, the job on
 * their phone, and the name the crew see. The one before no longer opens it unless they are
 * given it again; they leave its group chat and the new one joins.
 */
export function setSiteManager(projectId: ID, personId: ID) {
  mutate((db) => {
    const site = db.projects.find((x) => x.id === projectId);
    const who = db.people.find((x) => x.id === personId);
    if (!site || !who || !who.active || who.kind !== "Management" || (who.level ?? "site") !== "site") return;
    if (site.siteManagerId === personId || (site.status !== "Live" && site.status !== "Not started")) return;
    const before = db.people.find((x) => x.id === site.siteManagerId);
    // Running it covers what being given it did.
    db.siteAccess = db.siteAccess.filter((x) => !(x.personId === personId && x.projectId === projectId));
    site.siteManagerId = personId;
    const ch = db.chatChannels.find((c) => c.kind === "channel" && c.projectId === projectId);
    if (ch && !ch.memberIds.includes(personId)) {
      ch.memberIds.push(personId);
      ch.lastRead[personId] = db.chatMessages.filter((m) => m.channelId === ch.id).reduce((last, m) => (m.at > last ? m.at : last), "");
    }
    // A site manager was in the chat because they ran the site. Office people are in every site's chat anyway.
    if (before && (before.level ?? "site") === "site" && before.id !== site.contractsManagerId) leaveSiteChat(db, projectId, before.id);
    audit(db, projectId, `Site manager changed to ${who.name}${before ? `, was ${before.name}` : ""}`);
    log(db, "Changed who runs a site", `${site.code} ${site.name}: ${who.name}${before ? `, was ${before.name}` : ""}`, "admin");
  });
}

// ── Sales ─────────────────────────────────────────────────────────────────────


const nextNumber = (refs: string[], prefix: string) => Math.max(0, ...refs.map((r) => Number(r.replace(prefix, "")) || 0)) + 1;

export function addClient(c: Pick<Client, "name" | "type" | "contactName" | "contactPhone" | "contactEmail">) {
  let id = "";
  mutate((db) => {
    id = newId("c");
    const stem = c.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X");
    const taken = db.clients.filter((x) => x.accountRef.startsWith(stem)).length;
    db.clients.push({ ...c, id, accountRef: `${stem}${String(taken + 1).padStart(2, "0")}`, termsDays: 30, portalEnabled: false });
    log(db, "Added a client", c.name, "sales");
  });
  return id;
}

/** The details on a customer's page that can be changed there (18 Nov). The account reference is made once and kept, as Sage keys on it. */
export type CustomerDetails = Pick<Client, "name" | "type" | "contactName" | "contactPhone" | "contactEmail" | "address" | "county" | "billingEmail" | "termsDays" | "portalEnabled">;

/** A new customer added from the Customers section: everything on their page, with an account reference made from the name. */
export function addCustomer(c: CustomerDetails) {
  let id = "";
  mutate((db) => {
    id = newId("c");
    const stem = c.name.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X");
    const taken = db.clients.filter((x) => x.accountRef.startsWith(stem)).length;
    db.clients.push({ ...tidy(c), id, accountRef: `${stem}${String(taken + 1).padStart(2, "0")}` });
    log(db, "Added a customer", c.name.trim(), "customers");
  });
  return id;
}

/** Change a customer's details. Their projects, tenders and invoices go with them, as they are linked by the customer, not the name. */
export function updateCustomer(id: ID, c: CustomerDetails) {
  mutate((db) => {
    const x = db.clients.find((k) => k.id === id);
    if (!x) return;
    const before = x.name;
    Object.assign(x, tidy(c));
    if (!c.billingEmail?.trim()) delete x.billingEmail;
    log(db, "Changed a customer's details", before === x.name ? x.name : `${before}, now ${x.name}`, "customers");
  });
}

function tidy(c: CustomerDetails): CustomerDetails {
  return { ...c, name: c.name.trim(), contactName: c.contactName.trim(), contactPhone: c.contactPhone.trim(), contactEmail: c.contactEmail.trim(), address: c.address?.trim() || undefined, county: c.county?.trim() || undefined, billingEmail: c.billingEmail?.trim() || undefined, termsDays: Math.max(0, Math.round(c.termsDays)) };
}

export function logEnquiry(e: Pick<Enquiry, "clientId" | "contactName" | "location" | "county" | "description" | "source" | "notes">) {
  let id = "";
  mutate((db) => {
    id = newId("e");
    db.enquiries.unshift({ ...e, id, ref: `ENQ-${nextNumber(db.enquiries.map((x) => x.ref), "ENQ-")}`, receivedAt: nowStamp(), loggedBy: actorName(db), status: "Logged" });
    log(db, "Logged an enquiry", `${e.location}, ${e.county}`, "sales");
  });
  return id;
}

/** Which rate book fits an enquiry, judged from its wording. The estimator can change it afterwards. */
export function workKindFor(text: string): WorkKind {
  const t = text.toLowerCase();
  if (/slate|roof|rafter|lead/.test(t)) return "slate";
  if (/sash|window|door|joinery/.test(t)) return "sash";
  if (/render|plaster|limewash|damp/.test(t)) return "render";
  if (/clean|cornice|ashlar|portico|column|fa[cç]ade/.test(t)) return "facade";
  if (/brick|railing/.test(t)) return "brick";
  if (/joist|floorboard|beam/.test(t)) return "timber";
  if (/wall|bridge|parapet|slipway|boundary/.test(t)) return "wall";
  return "repoint";
}

/** Stands in for the assistant: prices an enquiry from the firm's rates and leaves the draft for approval. */
export function draftQuoteFromEnquiry(enquiryId: ID) {
  let ref = "";
  mutate((db) => {
    const e = db.enquiries.find((x) => x.id === enquiryId);
    if (!e || e.quoteId) return;
    const n = nextNumber(db.quotes.map((q) => q.ref), "Q-");
    const kind = workKindFor(e.description);
    const r = rng(n * 7919);
    const id = newId("q");
    const lines = linesFor(r, kind, r.int(18, 95) * 1000, id);
    ref = `Q-${n}`;
    db.quotes.unshift({ id, ref, enquiryId: e.id, clientId: e.clientId, title: `${e.location}: ${e.description.split(".")[0]}`, status: "Awaiting approval", lines, costing: costingFor(kind, quoteTotal(lines), r.int(19, 29)), validDays: 60, drafted: true, kind: WORK[kind].title });
    e.quoteId = id;
    db.approvals.unshift({ id: newId("ap"), kind: "quote", title: `Quote ${ref}: ${e.location}`, rationale: "Drafted from the enquiry and priced from your rates for this kind of work.", createdAt: nowStamp(), status: "Pending", quoteId: id });
    log(db, "Drafted a quote from an enquiry", `${ref} ${e.location}`, "sales", "Assistant");
  });
  return ref;
}

// Editing a quote while it is being drafted. Each function changes one thing, so the history of
// a quote can be followed line by line once a real backend records these calls.

const draftQuote = (db: Db, quoteId: ID) => db.quotes.find((q) => q.id === quoteId);

export function setQuoteLineField(quoteId: ID, lineId: ID, field: "description" | "unit" | "qty" | "rate", value: string | number) {
  mutate((db) => {
    const l = draftQuote(db, quoteId)?.lines.find((x) => x.id === lineId);
    if (!l) return;
    if (field === "qty" || field === "rate") l[field] = Number(value) || 0;
    else l[field] = String(value);
  });
}

export function addQuoteLine(quoteId: ID) {
  mutate((db) => {
    draftQuote(db, quoteId)?.lines.push({ id: newId("ql"), description: "", qty: 1, unit: "item", rate: 0 });
  });
}

export function removeQuoteLine(quoteId: ID, lineId: ID) {
  mutate((db) => {
    const q = draftQuote(db, quoteId);
    if (q) q.lines = q.lines.filter((l) => l.id !== lineId);
  });
}

export type CostGroup = "labour" | "materials" | "plant";

export function setCostField(quoteId: ID, group: CostGroup, index: number, field: string, value: string | number) {
  mutate((db) => {
    const row = draftQuote(db, quoteId)?.costing[group][index] as Record<string, string | number> | undefined;
    if (!row || !(field in row)) return;
    row[field] = typeof row[field] === "number" ? Number(value) || 0 : String(value);
  });
}

export function addCostRow(quoteId: ID, group: CostGroup) {
  mutate((db) => {
    const c = draftQuote(db, quoteId)?.costing;
    if (!c) return;
    if (group === "labour") c.labour.push({ trade: "", hours: 8, rate: 0 });
    if (group === "materials") c.materials.push({ item: "", qty: 1, unit: "no.", rate: 0 });
    if (group === "plant") c.plant.push({ item: "", days: 1, rate: 0 });
  });
}

export function removeCostRow(quoteId: ID, group: CostGroup, index: number) {
  mutate((db) => {
    draftQuote(db, quoteId)?.costing[group].splice(index, 1);
  });
}

export function setCostLump(quoteId: ID, field: "subcontract" | "prelims", value: number) {
  mutate((db) => {
    const c = draftQuote(db, quoteId)?.costing;
    if (c) c[field] = value || 0;
  });
}

export function sendQuote(quoteId: ID) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q) return;
    q.status = "Sent";
    q.sentAt = nowStamp();
    delete q.openedAt;
    delete q.respondedAt;
    delete q.query;
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    if (e) e.status = "Quoted";
    for (const a of db.approvals) if (a.quoteId === q.id && a.status === "Pending") { a.status = "Approved"; a.resolvedBy = actorName(db); a.resolvedAt = nowStamp(); }
    log(db, "Sent a quote", `${q.ref} ${q.title}`, "sales");
  });
}

/** The client asks about a quote from the portal. It goes back to whoever priced it for a reply or a revision. */
export function queryQuote(quoteId: ID, question: string) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q || !question.trim()) return;
    q.status = "Queried";
    q.query = question.trim();
    log(db, "A client asked about a quote", `${q.ref} ${q.title}`, "sales", db.clients.find((c) => c.id === q.clientId)?.contactName ?? "Client");
  });
}

export function chaseQuote(quoteId: ID) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q) return;
    q.chasedAt = nowStamp();
    log(db, "Chased a quote", `${q.ref} ${q.title}`, "sales");
  });
}

export function declineQuote(quoteId: ID) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q) return;
    q.status = "Declined";
    q.respondedAt = nowStamp();
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    if (e) e.status = "Lost";
    log(db, "Recorded a declined quote", `${q.ref} ${q.title}`, "sales");
  });
}

/**
 * A draft moved back to "To quote" on the sales board: the draft is thrown away, with the approval
 * waiting for it, and its enquiry is waiting for a price again.
 */
export function discardQuoteDraft(quoteId: ID) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q || (q.status !== "Draft" && q.status !== "Awaiting approval")) return;
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    if (!e) return;
    db.quotes = db.quotes.filter((x) => x.id !== q.id);
    db.approvals = db.approvals.filter((a) => a.quoteId !== q.id);
    delete e.quoteId;
    e.status = "Logged";
    log(db, "Discarded a draft quote", `${q.ref}, ${e.ref} is back to quote`, "sales");
  });
}

/**
 * A quote moved back to Drafting on the sales board: pulled back from the client to change it, or
 * a declined one reopened. It is sent again from its page, or by moving it to Sent.
 */
export function quoteBackToDraft(quoteId: ID) {
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q || q.status === "Accepted" || q.status === "Draft" || q.status === "Awaiting approval") return;
    const was = q.status;
    q.status = "Draft";
    delete q.sentAt;
    delete q.openedAt;
    delete q.respondedAt;
    delete q.chasedAt;
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    if (e) e.status = "Logged";
    log(db, was === "Declined" ? "Reopened a declined quote" : "Pulled a quote back to change it", `${q.ref} ${q.title}`, "sales");
  });
}

/** A client's acceptance turns the quote into a project with the next site code. */
export function acceptQuote(quoteId: ID, poNumber: string) {
  let code = "";
  mutate((db) => {
    const q = db.quotes.find((x) => x.id === quoteId);
    if (!q || q.status === "Accepted") return;
    const who = actorName(db);
    q.status = "Accepted";
    q.respondedAt = nowStamp();
    q.poNumber = poNumber.trim() || "Verbal, PO to follow";
    const e = db.enquiries.find((x) => x.id === q.enquiryId);
    if (e) e.status = "Won";
    code = `C${nextNumber(db.projects.map((p) => p.code), "C")}`;
    const id = `pr-${code}`;
    const [name, ...rest] = q.title.split(": ");
    const cm = db.people.find((p) => p.name === who && p.trade === "Contracts manager") ?? db.people.find((p) => p.id === "p-cm1")!;
    const sm = db.people.find((p) => p.isSiteManager)!;
    const day = getDay();
    db.projects.unshift({
      id, code, name: name ?? q.title, clientId: q.clientId, quoteId: q.id, location: e?.location ?? name ?? "", county: e?.county ?? "", description: rest.join(": ") || (e?.description ?? q.title),
      heritage: "To be confirmed with the conservation officer", status: "Not started", contractsManagerId: cm.id, siteManagerId: sm.id, startDate: addDays(day, 21), endDate: addDays(day, 77),
      value: quoteTotal(q.lines), pricedBy: "Quote", siteInstructions: "", extrasFlag: false, snaggingFlag: false, invoiceHold: false,
      audit: [{ at: nowStamp(), who, what: `Project created from ${q.ref}, accepted against ${q.poNumber}` }],
    });
    const groupId = newId("sg");
    db.scopeGroups.push({ id: groupId, projectId: id, label: "Original project overview", isOriginal: true, date: day });
    for (const l of q.lines) db.scopeTasks.push({ id: newId("st"), projectId: id, groupId, description: l.description, done: false });
    log(db, "Recorded an accepted quote", `${q.ref} became project ${code}`, "sales", who);
    log(db, "Created a project from an accepted quote", `${code} ${name}`, "projects", "Assistant");
  });
  return code;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export function toggleScopeTask(taskId: ID) {
  mutate((db) => {
    const t = db.scopeTasks.find((x) => x.id === taskId);
    if (!t) return;
    t.done = !t.done;
    if (t.done) { t.completedAt = nowStamp(); t.completedBy = actorName(db); } else { delete t.completedAt; delete t.completedBy; }
  });
}

export function addScopeTask(projectId: ID, description: string) {
  mutate((db) => {
    let g = db.scopeGroups.find((x) => x.projectId === projectId && !x.isOriginal);
    if (!g) {
      g = { id: newId("sg"), projectId, label: "Added during the works", isOriginal: false, date: getDay() };
      db.scopeGroups.push(g);
    }
    db.scopeTasks.push({ id: newId("st"), projectId, groupId: g.id, description: description.trim(), done: false });
    audit(db, projectId, `Scope item added: ${description.trim()}`);
  });
}

/** Finishing a project raises its final account and, when nothing is outstanding, drafts the handover. */
export function completeProject(projectId: ID) {
  mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p || p.status !== "Live") return;
    p.status = "Complete";
    p.completedAt = nowStamp();
    p.endDate = getDay();
    audit(db, p.id, "Works complete, scope ticked off");
    const held = p.extrasFlag || p.snaggingFlag;
    p.invoiceHold = held;
    // Stage payments already raised, issued or not, come off the final account.
    const net = finalAccountNet(p.value ?? 0, db.salesInvoices.filter((i) => i.projectId === p.id).map((i) => i.net));
    const n = nextNumber(db.salesInvoices.map((i) => i.ref), "INV-");
    db.salesInvoices.unshift({ id: newId("inv"), ref: `INV-${n}`, projectId: p.id, clientId: p.clientId, description: "Final account", net, vatPct: REGION[usePrefs.getState().brand.region].vatPct, status: held ? "Held" : "To invoice", holdReason: held ? holdReason(p) : undefined, history: [{ at: nowStamp(), who: "System", what: "Raised when the job was marked complete" }] });
    if (!held) addHandoverDraft(db, p.id);
    log(db, "Marked a project complete", `${p.code} ${p.name}`, "projects");
  });
}

function addHandoverDraft(db: Db, projectId: ID) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p || db.approvals.some((a) => a.kind === "handover" && a.projectId === p.id && a.status === "Pending")) return;
  const client = db.clients.find((c) => c.id === p.clientId);
  const cm = db.people.find((x) => x.id === p.contractsManagerId);
  const first = client?.contactName.replace(/^(Rev\.|Fr\.)\s+/, "").split(" ")[0] ?? "";
  db.approvals.unshift({
    id: newId("ap"), kind: "handover", title: `Handover email: ${p.name}`, rationale: "Scope is fully ticked off with no extras or snagging flagged.", createdAt: nowStamp(), status: "Pending", projectId: p.id,
    body: `Dear ${first},\n\nThe works at ${p.name} are complete: ${p.description.charAt(0).toLowerCase()}${p.description.slice(1)}\n\nYour handover pack is attached. It holds the dated photo record (before, during and after), the materials and specification as applied, and care notes for the first winter.\n\nIf anything needs attention, tell us within ten working days and we will come back to it before the final account is issued.\n\nKind regards,\n${cm?.name ?? ""}`,
  });
  log(db, "Drafted a handover email", p.name, "projects", "Assistant");
}

export function draftHandover(projectId: ID) {
  mutate((db) => addHandoverDraft(db, projectId));
}

/**
 * Ask for people, plant or something else. From a site manager or the office it goes to
 * management; with `heldBy: "site"` (an operative's phone) it waits with the site manager first.
 * With no project it is a general request, not tied to one site (Oisin, 17 Nov).
 */
export function addRequest(r: { projectId: ID | null; kind: RequestKind; description: string; quantity: number; neededFrom: string; neededTo: string; notes: string; heldBy?: "site"; personId?: ID }) {
  mutate((db) => {
    const by = actorId(db);
    db.requests.unshift({ ...r, id: newId("rq"), requestedBy: actorName(db), ...(r.projectId === null && by ? { requestedById: by } : {}), createdAt: nowStamp(), status: "Open" });
    const what = r.heldBy === "site" ? "Made a request to the site manager" : r.projectId === null ? "Made a general request" : r.kind === "personnel" ? "Requested personnel" : r.kind === "other" ? "Made a request" : "Requested plant";
    log(db, what, r.projectId === null ? `${r.description}, not for one site` : `${r.description}, ${db.projects.find((p) => p.id === r.projectId)?.name}`, "projects");
  });
}

/** The site manager passes a request from his crew to management as his own. The operative who asked is kept. */
export function forwardCrewRequest(id: ID) {
  mutate((db) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r || r.status !== "Open" || r.heldBy !== "site") return;
    r.raisedBy = r.requestedBy;
    r.requestedBy = actorName(db);
    r.forwardedAt = nowStamp();
    delete r.heldBy;
    audit(db, r.projectId ?? undefined, `Request passed to management: ${r.description} (first asked by ${r.raisedBy})`);
    log(db, "Forwarded a crew request to management", `${r.description}, ${db.projects.find((p) => p.id === r.projectId)?.name}`, "projects");
  });
}

/** Ask management for one named person on one day (the planner on the site manager's phone, which cannot change the plan itself). */
export function requestPerson(projectId: ID, personId: ID, date: string, note: string) {
  const name = useData.getState().db.people.find((p) => p.id === personId)?.name ?? "";
  addRequest({ projectId, kind: "personnel", description: `${name} on site`, quantity: 1, neededFrom: date, neededTo: date, notes: note.trim() || "Asked for from the phone planner", personId });
}

/** Site instructions for one day, shown on the phone of everyone on that site that day. Empty text takes them down. */
export function setDayInstruction(projectId: ID, date: string, text: string) {
  mutate((db) => {
    const i = db.dayInstructions.findIndex((x) => x.projectId === projectId && x.date === date);
    const p = db.projects.find((x) => x.id === projectId);
    const t = text.trim();
    if (!t) {
      if (i < 0) return;
      db.dayInstructions.splice(i, 1);
      log(db, "Took down the day's site instructions", `${p?.code} ${p?.name}, ${date}`, "projects");
      return;
    }
    const row = { id: i >= 0 ? db.dayInstructions[i]!.id : newId("di"), projectId, date, text: t, by: actorName(db), at: nowStamp() };
    if (i >= 0) db.dayInstructions[i] = row;
    else db.dayInstructions.unshift(row);
    log(db, "Put up site instructions for the day", `${p?.code} ${p?.name}, ${date}`, "projects");
  });
}

/** The managing director's yes or no to a site's request (Admin > Requests). A yes stays open until the office has arranged it. */
export function decideSiteRequest(id: ID, approve: boolean, note?: string): "planned" | "open" | "declined" | null {
  let outcome: "planned" | "open" | "declined" | null = null;
  mutate((db) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r || r.status !== "Open" || r.decision || r.heldBy === "site") return;
    r.decision = approve ? "Approved" : "Declined";
    r.decidedBy = actorName(db);
    r.decidedAt = nowStamp();
    if (!approve && cleanNote(note)) r.declineNote = cleanNote(note);
    outcome = approve ? "open" : "declined";
    if (!approve) r.status = "Done";
    // A named person for one day (asked for on the phone planner): a yes puts them on the plan if
    // they are free that day, and the request is done. Otherwise it stays open for the office.
    const siteId = r.projectId;
    if (approve && siteId && r.personId && r.neededFrom === r.neededTo && r.neededFrom > getDay()) {
      const live = new Set(db.projects.filter((x) => x.status === "Live" || x.status === "Not started").map((x) => x.id));
      const st = personWeek(db.plan, db.holidays, live, r.personId, [r.neededFrom])[0]!;
      // Nobody whose Safe Pass or trade ticket has run out goes on the plan (Compliance): the request stays open.
      const drop = mayNotWork(db, r.personId, r.neededFrom) ? "blocked" : dropOutcome(st, siteId);
      if (drop === "free") {
        db.plan.push({ id: newId("pl"), projectId: siteId, personId: r.personId, date: r.neededFrom, ...(st.load === 0.5 ? { part: "half" as const } : {}) });
        if (!db.assignments.some((a) => a.projectId === siteId && a.personId === r.personId)) db.assignments.push({ id: newId("as"), projectId: siteId, personId: r.personId });
      }
      if (drop === "free" || drop === "already") {
        r.status = "Done";
        r.dealtBy = actorName(db);
        outcome = "planned";
      }
    }
    const p = db.projects.find((x) => x.id === siteId);
    const why = approve ? undefined : note;
    audit(db, siteId ?? undefined, withNote(`${approve ? "Request agreed" : "Request turned down"}: ${r.description}`, why));
    log(db, approve ? "Agreed a site request" : "Turned down a site request", withNote(siteId ? `${r.description}, ${p?.code ?? ""} ${p?.name ?? ""}`.trim() : `${r.description}, not for one site`, why), "admin");
  });
  return outcome;
}

/** The managing director's yes or no to spending money (Admin > Requests). */
export function decideSpend(id: ID, approve: boolean, note?: string) {
  mutate((db) => {
    const x = db.spendRequests.find((s) => s.id === id);
    if (!x || x.status !== "Waiting") return;
    x.status = approve ? "Approved" : "Declined";
    x.decidedBy = actorName(db);
    x.decidedAt = nowStamp();
    if (!approve && cleanNote(note)) x.declineNote = cleanNote(note);
    log(db, approve ? "Agreed to spend" : "Turned down spending", withNote(`${x.what}, ${x.amount.toFixed(2)}`, approve ? undefined : note), "admin");
  });
}

export function closeRequest(id: ID) {
  mutate((db) => {
    const r = db.requests.find((x) => x.id === id);
    if (!r) return;
    r.status = "Done";
    r.dealtBy = actorName(db);
    log(db, "Dealt with a site request", r.description, "projects");
  });
}

/** Extra work found on site: drafts a variation for approval and holds the invoice until it is agreed. */
export function raiseExtra(projectId: ID, v: { description: string; measured: string; estimatedValue: number; original?: string; originalLanguage?: Language }) {
  mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return;
    const who = db.people.find((x) => x.name === actorName(db));
    const id = newId("var");
    db.variations.unshift({ id, projectId, raisedById: who?.id ?? p.siteManagerId, raisedAt: nowStamp(), ...v, status: "Draft" });
    p.extrasFlag = true;
    p.invoiceHold = true;
    syncHold(db, p.id);
    const live = p.status === "Live";
    db.approvals.unshift({ id: newId("ap"), kind: "variation", title: `Variation: ${v.measured || v.description.slice(0, 50)}`, rationale: `Raised by ${actorName(db)} on the project page. ${live ? "The final account will be held until it is agreed." : "The final account is held until it is agreed."}`, createdAt: nowStamp(), status: "Pending", variationId: id, projectId });
    audit(db, projectId, `Extras raised: ${v.measured || v.description}`);
    log(db, live ? "Drafted a variation for approval" : "Drafted a variation and held the final account", `${p.code} ${p.name}`, "projects", "Assistant");
  });
}

export function setSnagging(projectId: ID, open: boolean) {
  mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return;
    p.snaggingFlag = open;
    p.invoiceHold = open || p.extrasFlag;
    audit(db, p.id, open ? (p.status === "Live" ? "Snagging opened" : "Snagging opened: final account held") : "Snagging closed");
    syncHold(db, p.id);
  });
}

/** A manager's decision to release a held final account, written to the project's history. */
export function clearHold(projectId: ID) {
  mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return;
    p.extrasFlag = false;
    p.snaggingFlag = false;
    p.invoiceHold = false;
    audit(db, p.id, "Invoice hold cleared by a manager");
    syncHold(db, p.id);
    log(db, "Cleared an invoice hold", `${p.code} ${p.name}`, "projects");
  });
}

/** Put a project's final account in step with its hold: held while the hold is on, ready to invoice once it is off. */
function syncHold(db: Db, projectId: ID) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) return;
  const reason = holdReason(p);
  for (const inv of db.salesInvoices) {
    if (inv.projectId !== p.id) continue;
    if (p.invoiceHold && inv.status === "To invoice" && inv.description === "Final account") { inv.status = "Held"; inv.holdReason = reason; }
    // A seeded reason can carry detail after the colon; it is kept while it still applies.
    else if (p.invoiceHold && inv.status === "Held" && !inv.holdReason?.startsWith(reason)) inv.holdReason = reason;
    if (!p.invoiceHold && inv.status === "Held") { inv.status = "To invoice"; delete inv.holdReason; }
  }
}

/** Keep a final account that is still to be issued in step with the contract value. */
function refreshFinalAccount(db: Db, p: Project) {
  const f = db.salesInvoices.find((i) => i.projectId === p.id && i.description === "Final account");
  if (f && (f.status === "Held" || f.status === "To invoice")) f.net = finalAccountNet(p.value ?? 0, db.salesInvoices.filter((i) => i.projectId === p.id && i.id !== f.id).map((i) => i.net));
  return f;
}

/** Once no variation on a project is left to agree, the extras hold lifts. Open snagging still holds it. */
function settleExtras(db: Db, p: Project) {
  if (!p.extrasFlag || db.variations.some((x) => x.projectId === p.id && x.status === "Draft")) return;
  p.extrasFlag = false;
  p.invoiceHold = p.snaggingFlag;
  audit(db, p.id, p.invoiceHold ? "No extras left to agree: still held for snagging" : p.status === "Live" ? "No extras left to agree" : "No extras left to agree: final account released");
  syncHold(db, p.id);
}

export function notifyHireReturn(id: ID) {
  mutate((db) => {
    const h = db.hiredPlant.find((x) => x.id === id);
    if (!h || h.status !== "On hire") return;
    h.status = "Return notified";
    h.returnNotifiedAt = nowStamp();
    log(db, "Notified a hired plant return", `${h.description}, ${db.projects.find((p) => p.id === h.projectId)?.name}`, "plant");
  });
}

/** Add a real picture, taken with the camera or chosen from a file. It arrives already shrunk (see src/lib/image.ts). */
export function addPhoto(projectId: ID, caption: string, stage: PhotoStage, picture: { dataUrl: string; sizeKb: number }) {
  mutate((db) => {
    const n = db.files.length;
    db.files.unshift({ id: newId("f"), projectId, folder: "Photos and videos", name: `${caption.trim()}.jpg`, kind: "image", category: "Photos and videos", stage, caption: caption.trim(), sizeKb: picture.sizeKb, modified: getDay(), addedBy: actorName(db), source: "Upload", tone: n % 6, dataUrl: picture.dataUrl });
    log(db, "Added a photo", `${caption.trim()}, ${db.projects.find((p) => p.id === projectId)?.name}`, "files");
  });
}

// ── Labour: timesheet ─────────────────────────────────────────────────────────

/** A day's mark on the timesheet: a full or half day with any overtime at each rate, or a rest day's hours (17 Nov). */
type Mark = DayMark | null;
const markText = (m: Mark) => (m ? attendanceShort(m) : "Not in");
/** Overtime belongs to a full day or a rest day. A half day has none. */
const markFields = (m: DayMark) => ({ status: m.status, overtimeHours: m.status === "half" ? 0 : m.overtimeHours, ...storedDouble(m.status === "half" ? 0 : m.doubleHours) });
/** Write a mark on an entry. Double time hours are kept only where there are some, so old ones never linger. */
function applyMark(a: Attendance, m: DayMark) {
  const f = markFields(m);
  a.status = f.status;
  a.overtimeHours = f.overtimeHours;
  if (f.doubleHours) a.doubleHours = f.doubleHours;
  else delete a.doubleHours;
}

/** Mark today for one person. Stays editable until the day's time stamps are sent. */
export function markAttendance(projectId: ID, personId: ID, date: string, mark: Mark) {
  mutate((db) => {
    const i = db.attendance.findIndex((a) => a.projectId === projectId && a.personId === personId && a.date === date);
    const existing = db.attendance[i];
    if (existing?.sent) return; // sent entries change only through a correction, with a reason
    // Nobody is marked a normal day on a bank holiday (round ten): work on one is overtime.
    if (mark && mark.status !== "restday" && isBankHoliday(db.bankHolidays, date)) return;
    if (!mark) {
      if (i >= 0) db.attendance.splice(i, 1);
      return;
    }
    if (mayNotWork(db, personId, date)) return; // a Safe Pass or trade ticket had run out (Compliance)
    if (existing) {
      applyMark(existing, mark);
      existing.savedBy = actorName(db);
      existing.savedAt = nowStamp();
    } else db.attendance.push({ id: newId("att"), projectId, personId, date, ...markFields(mark), savedBy: actorName(db), savedAt: nowStamp(), sent: false });
  });
}

export function sendTimeStamps(projectId: ID, date: string) {
  let n = 0;
  mutate((db) => {
    for (const a of db.attendance) if (a.projectId === projectId && a.date === date && !a.sent) { a.sent = true; n++; }
    if (n > 0) log(db, "Sent the day's time stamps", `${db.projects.find((p) => p.id === projectId)?.name}, ${n} ${n === 1 ? "person" : "people"}`, "people");
  });
  return n;
}

/** Change a day that has already been sent. The old value, new value, who and why are kept. */
export function correctAttendance(projectId: ID, personId: ID, date: string, mark: Mark, reason: string) {
  mutate((db) => {
    const i = db.attendance.findIndex((a) => a.projectId === projectId && a.personId === personId && a.date === date);
    const existing = db.attendance[i];
    const from = markText(existing ?? null);
    const to = markText(mark);
    if (from === to) return;
    if (mark && mayNotWork(db, personId, date)) return;
    // A bank holiday holds an overtime time stamp or nothing, never a normal day (round ten).
    if (mark && mark.status !== "restday" && isBankHoliday(db.bankHolidays, date)) return;
    const who = actorName(db);
    let attendanceId = existing?.id ?? "";
    if (!mark && i >= 0) db.attendance.splice(i, 1);
    else if (mark && existing) {
      applyMark(existing, mark);
      existing.savedBy = who;
      existing.savedAt = nowStamp();
    } else if (mark) {
      attendanceId = newId("att");
      db.attendance.push({ id: attendanceId, projectId, personId, date, ...markFields(mark), savedBy: who, savedAt: nowStamp(), sent: true });
    }
    db.attendanceChanges.unshift({ id: newId("chg"), attendanceId, projectId, personId, date, at: nowStamp(), by: who, from, to, reason: reason.trim() });
    log(db, "Corrected attendance", `${db.people.find((p) => p.id === personId)?.name}, ${date}: ${from} to ${to}`, "people", who);
  });
}

/**
 * An overtime time stamp (Oisin, 17 Nov; called a weekend time stamp until round ten, when he
 * had every "weekend" name changed to "overtime"): the hours one person worked on one site
 * on a Saturday, a Sunday or a bank holiday, typed at each rate. There is no normal day in it:
 * every hour is overtime. Anyone in the firm can be stamped, not only that site's crew. It is
 * saved as sent, so it goes to the office with its week; changing or removing it afterwards is
 * a correction, with a reason. Returns what is wrong in plain words, or nothing when it is saved.
 */
export function stampRestDay(projectId: ID, personId: ID, date: string, timeAndHalf: number, double: number): string | null {
  const db0 = useData.getState().db;
  if (date > getDay()) return "That day has not come yet";
  const holiday = isBankHoliday(db0.bankHolidays, date);
  const kind = restDayKind(dayOfWeek(date), holiday);
  if (!kind) return "An overtime time stamp is for a Saturday, a Sunday or a bank holiday. Overtime after a normal day is marked in the grid";
  const problem = restDayProblem(kind, timeAndHalf, double);
  if (problem) return problem;
  const who0 = db0.people.find((x) => x.id === personId);
  const stops = who0 ? ticketBlocks(who0, date) : [];
  if (stops.length) return `${who0!.name} could not work that day: ${stops.map((b) => b.ticket).join(", ")} had run out`;
  const existing = db0.attendance.find((a) => a.projectId === projectId && a.personId === personId && a.date === date);
  if (existing && existing.status !== "restday") return "They are already marked for a normal day on that date. Correct that day instead";
  if (existing) return "They already have a time stamp on this site for that day. Open it in the list to change it";
  mutate((db) => {
    const who = actorName(db);
    const mark = restDayMark(timeAndHalf, double);
    db.attendance.push({ id: newId("att"), projectId, personId, date, ...markFields(mark), savedBy: who, savedAt: nowStamp(), sent: true });
    const p = db.projects.find((x) => x.id === projectId);
    log(db, "Added an overtime time stamp", `${db.people.find((x) => x.id === personId)?.name}, ${p?.code} ${p?.name}, ${date}: ${markText(mark)}`, "people", who);
  });
  return null;
}

// ── Overtime claims from the phone (round ten) ────────────────────────────────

/**
 * An operative tells their site manager about extra hours on a day (Oisin, 17 Nov): "extra 2
 * hours that day or a previous day to make site manager aware". Optional, and only for overtime.
 * Returns what is wrong in plain words, or nothing when the claim is with the site manager.
 */
export function claimOvertime(personId: ID, projectId: ID, date: string, hours: number, note: string): string | null {
  const db0 = useData.getState().db;
  const problem = claimProblem(getDay(), { personId, projectId, date, hours }, db0.overtimeClaims);
  if (problem) return problem;
  mutate((db) => {
    const who = db.people.find((x) => x.id === personId)?.name ?? "";
    db.overtimeClaims.unshift({ id: newId("oc"), personId, projectId, date, hours, note: note.trim().replace(/\s+/g, " "), createdAt: nowStamp(), status: "Waiting" });
    const p = db.projects.find((x) => x.id === projectId);
    log(db, "Claimed overtime", `${who}, ${p?.code} ${p?.name}, ${date}: ${claimHours(hours)}`, "people", who);
  });
  return null;
}

/**
 * The site manager's yes or no to an overtime claim, from his phone or from the Timesheet. A
 * yes takes the hours at each rate, which he may have changed from what was claimed, and adds
 * them to that day on the timesheet: onto the day's mark, as a correction if the day has
 * already been sent, or as an overtime time stamp on a Saturday, a Sunday or a bank holiday.
 * A no can carry a note. Returns what is wrong, or nothing when it is done.
 */
export function decideOvertimeClaim(id: ID, approve: boolean, opts: { timeAndHalf?: number; double?: number; note?: string } = {}): string | null {
  const db0 = useData.getState().db;
  const c = db0.overtimeClaims.find((x) => x.id === id);
  if (!c || c.status !== "Waiting") return "That claim has already been answered";
  const t = Math.max(0, opts.timeAndHalf ?? 0);
  const d = Math.max(0, opts.double ?? 0);
  if (approve) {
    const existing = db0.attendance.find((a) => a.projectId === c.projectId && a.personId === c.personId && a.date === c.date);
    const kind = restDayKind(dayOfWeek(c.date), isBankHoliday(db0.bankHolidays, c.date));
    const effect = approvalEffect(existing, kind, c.date === getDay(), t, d);
    if (effect.kind === "refuse") return effect.message;
    if (effect.kind === "stamp") {
      const problem = stampRestDay(c.projectId, c.personId, c.date, effect.timeAndHalf, effect.double);
      if (problem) return problem;
    } else if (effect.kind === "mark") markAttendance(c.projectId, c.personId, c.date, effect.mark);
    else correctAttendance(c.projectId, c.personId, c.date, effect.mark, `Overtime claim approved: ${c.note || claimHours(c.hours)}`);
  }
  mutate((db) => {
    const x = db.overtimeClaims.find((y) => y.id === id);
    if (!x) return;
    x.status = approve ? "Approved" : "Declined";
    x.decidedBy = actorName(db);
    x.decidedAt = nowStamp();
    if (approve) {
      x.overtimeHours = t;
      x.doubleHours = d;
    } else if (cleanNote(opts.note)) x.declineNote = cleanNote(opts.note);
    const p = db.projects.find((y) => y.id === x.projectId);
    const text = `${db.people.find((y) => y.id === x.personId)?.name}, ${p?.code} ${p?.name}, ${x.date}: ${approve ? overtimeText({ overtimeHours: t, doubleHours: d }) : claimHours(x.hours)}`;
    log(db, approve ? "Approved an overtime claim" : "Declined an overtime claim", withNote(text, approve ? undefined : opts.note), "people");
  });
  return null;
}

// ── Bank holidays (Admin) ─────────────────────────────────────────────────────

/**
 * Add a day the firm treats as a bank holiday. Anyone already down for a normal day on it, if it
 * is still to come, is taken off the plan. Returns what is wrong, or nothing when it is added.
 */
export function addBankHoliday(date: string, name: string): string | null {
  const db0 = useData.getState().db;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Pick the date";
  if (!name.trim()) return "Give the day a name";
  if (isBankHoliday(db0.bankHolidays, date)) return `${bankHolidayOn(db0.bankHolidays, date)?.name} is already on that date`;
  mutate((db) => {
    db.bankHolidays.push({ date, name: name.trim() });
    db.bankHolidays.sort((a, b) => a.date.localeCompare(b.date));
    // Nobody is planned a normal day on a bank holiday (round ten), so a day still to come loses
    // whoever was down for it. Work that day is planned again as overtime, one person at a time.
    const off = date > getDay() && !isWeekend(date) ? db.plan.filter((p) => p.date === date).length : 0;
    if (off > 0) db.plan = db.plan.filter((p) => p.date !== date);
    log(db, "Added a bank holiday", `${name.trim()}, ${date}${off > 0 ? `. ${off} taken off the plan for that day` : ""}`, "admin");
  });
  return null;
}

/** How many people are down for a normal day on a date still to come: who adding a bank holiday there takes off the plan. */
export const plannedOn = (date: string) => (date > getDay() && !isWeekend(date) ? useData.getState().db.plan.filter((p) => p.date === date).length : 0);

/** Take a day off the list of bank holidays. Time already recorded on it is kept as it is. */
export function removeBankHoliday(date: string) {
  mutate((db) => {
    const h = db.bankHolidays.find((x) => x.date === date);
    if (!h) return;
    db.bankHolidays = db.bankHolidays.filter((x) => x.date !== date);
    log(db, "Removed a bank holiday", `${h.name}, ${date}`, "admin");
  });
}

export function addToRoster(projectId: ID, personId: ID) {
  mutate((db) => {
    if (db.assignments.some((a) => a.projectId === projectId && a.personId === personId)) return;
    db.assignments.push({ id: newId("as"), projectId, personId });
    log(db, "Added someone to a site roster", `${db.people.find((p) => p.id === personId)?.name}, ${db.projects.find((p) => p.id === projectId)?.name}`, "people");
  });
}

/** Take someone off a site. Their past attendance is kept; days planned ahead on that site are dropped. */
export function removeFromRoster(projectId: ID, personId: ID) {
  mutate((db) => {
    const day = getDay();
    db.assignments = db.assignments.filter((a) => !(a.projectId === projectId && a.personId === personId));
    db.plan = db.plan.filter((p) => !(p.projectId === projectId && p.personId === personId && p.date > day));
    log(db, "Removed someone from a site roster", `${db.people.find((p) => p.id === personId)?.name}, ${db.projects.find((p) => p.id === projectId)?.name}`, "people");
  });
}

// ── Labour: people ────────────────────────────────────────────────────────────

export function addEmployee(e: Pick<Person, "name" | "phone" | "kind" | "trade" | "category" | "hourlyRate" | "language" | "level" | "sageNo">) {
  mutate((db) => {
    const domain = db.people[0]?.email.split("@")[1] ?? "example";
    const parts = e.name.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/);
    db.people.push({ ...e, name: e.name.trim(), id: newId("p"), email: `${parts[0]}.${parts[parts.length - 1]}@${domain}`, rateAsOf: getDay(), isSiteManager: false, active: true, certs: [] });
    log(db, "Added an employee", e.name.trim(), "people");
  });
}

export function setEmployeeActive(personId: ID, active: boolean) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p) return;
    p.active = active;
    if (active) delete p.archivedAt;
    else {
      const day = getDay();
      p.archivedAt = day;
      db.assignments = db.assignments.filter((a) => a.personId !== personId);
      db.plan = db.plan.filter((x) => !(x.personId === personId && x.date > day));
      dropSiteAccess(db, personId);
    }
    log(db, active ? "Restored an employee" : "Archived an employee", p.name, "people");
  });
}

type NewProof = Pick<Proof, "name" | "dataUrl"> | null;
const stampProof = (db: Db, proof: NewProof): Pick<Cert, "proof" | "proofNeeded"> => (proof ? { proof: { ...proof, addedBy: actorName(db), addedAt: nowStamp() }, proofNeeded: false } : { proof: undefined, proofNeeded: true });

/** A renewal replaces the old card, so the old proof goes with it. With no proof attached the ticket is flagged until one is. */
export function renewCert(personId: ID, certId: ID, expires: string, proof: NewProof) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    const c = p?.certs.find((x) => x.id === certId);
    if (!p || !c) return;
    closeTodos(db, `cert:${certId}`);
    c.issued = getDay();
    c.expires = expires;
    Object.assign(c, stampProof(db, proof));
    log(db, "Recorded a renewed training ticket", `${p.name}, ${c.name}${proof ? ", proof attached" : ", proof still needed"}`, "people");
  });
}

export function addCert(personId: ID, name: string, expires: string, proof: NewProof) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p) return;
    closeTodos(db, `need:${personId}:${name}`);
    p.certs.push({ id: newId("cert"), name: name.trim(), issued: getDay(), expires, ...stampProof(db, proof) });
    log(db, "Recorded a training ticket", `${p.name}, ${name.trim()}${proof ? ", proof attached" : ", proof still needed"}`, "people");
  });
}

/** Attach the card or certificate to a ticket that is already on file. */
export function addCertProof(personId: ID, certId: ID, proof: Pick<Proof, "name" | "dataUrl">) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    const c = p?.certs.find((x) => x.id === certId);
    if (!p || !c) return;
    Object.assign(c, stampProof(db, proof));
    log(db, "Attached proof to a training ticket", `${p.name}, ${c.name}`, "people");
  });
}

/** Approved leave blocks the planner, so any days already planned inside it are taken off. */
function clearPlanForLeave(db: Db, personId: ID, from: string, to: string) {
  const before = db.plan.length;
  db.plan = db.plan.filter((p) => !(p.personId === personId && p.date >= from && p.date <= to));
  return before - db.plan.length;
}

export function addHoliday(personId: ID, from: string, to: string, note: string) {
  let cleared = 0;
  mutate((db) => {
    db.holidays.unshift({ id: newId("hol"), personId, from, to, status: "Approved", via: "Form", note: note.trim() || undefined });
    cleared = clearPlanForLeave(db, personId, from, to);
    log(db, "Recorded leave", `${db.people.find((p) => p.id === personId)?.name}, ${from} to ${to}`, "people");
  });
  return cleared;
}

/** Yes or no to a leave request. A no can say why (17 Nov); the person sees it on their phone. */
export function decideHoliday(id: ID, approve: boolean, note?: string) {
  let cleared = 0;
  mutate((db) => {
    const h = db.holidays.find((x) => x.id === id);
    if (!h) return;
    h.status = approve ? "Approved" : "Declined";
    h.decidedBy = actorName(db);
    if (!approve && cleanNote(note)) h.declineNote = cleanNote(note);
    else delete h.declineNote;
    if (approve) cleared = clearPlanForLeave(db, h.personId, h.from, h.to);
    log(db, approve ? "Approved leave" : "Declined leave", withNote(`${db.people.find((p) => p.id === h.personId)?.name}, ${h.from} to ${h.to}`, approve ? undefined : note), "people");
  });
  return cleared;
}

// ── Schedule ──────────────────────────────────────────────────────────────────

/** Someone whose Safe Pass or trade ticket has run out by that day may not be planned or marked on site (Compliance, 18 Nov). */
function mayNotWork(db: Db, personId: ID, date: string) {
  const p = db.people.find((x) => x.id === personId);
  return !!p && ticketBlocks(p, date).length > 0;
}

const onLeave = (db: Db, personId: ID, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);

export type PlanMark = { part: "full" | "half"; overtimeHours: number } | null;

/**
 * Set what someone is doing on one site on one day: a full day, a half day, a full day with
 * overtime, or nothing (null takes them off that day). Weekends, bank holidays and approved leave
 * are refused: work on a rest day is planned with Plan overtime work (round ten).
 */
export function setPlanDay(projectId: ID, personId: ID, date: string, mark: PlanMark) {
  mutate((db) => {
    const i = db.plan.findIndex((p) => p.projectId === projectId && p.personId === personId && p.date === date);
    if (!mark) {
      if (i >= 0) db.plan.splice(i, 1);
      return;
    }
    if (isRestDay(db.bankHolidays, date) || onLeave(db, personId, date) || mayNotWork(db, personId, date)) return;
    const entry = i >= 0 ? db.plan[i]! : { id: newId("pl"), projectId, personId, date };
    if (mark.part === "half") entry.part = "half";
    else delete entry.part;
    if (mark.part === "full" && mark.overtimeHours > 0) entry.overtimeHours = mark.overtimeHours;
    else delete entry.overtimeHours;
    if (i < 0) db.plan.push(entry);
    if (!db.assignments.some((a) => a.projectId === projectId && a.personId === personId)) db.assignments.push({ id: newId("as"), projectId, personId });
  });
}

/**
 * Plan someone on a site for a Saturday, a Sunday or a bank holiday (Oisin, 17 Nov). Weekend
 * work is the exception, so it is planned one person and one day at a time and never by the
 * moves that fill a working week. Returns what is wrong, or nothing when it is planned.
 */
export function planRestDay(projectId: ID, personId: ID, date: string): string | null {
  const db0 = useData.getState().db;
  if (!isRestDay(db0.bankHolidays, date)) return "That is a normal working day. Plan it in the grid";
  if (date < getDay()) return "That day has gone. Record it with an overtime time stamp on the Timesheet";
  if (onLeave(db0, personId, date)) return "They are on approved leave that day";
  if (mayNotWork(db0, personId, date)) return "They cannot work that day: a ticket they need will have run out. Renew it in Compliance first";
  if (db0.plan.some((p) => p.projectId === projectId && p.personId === personId && p.date === date)) return "They are already down for that site that day";
  mutate((db) => {
    db.plan.push({ id: newId("pl"), projectId, personId, date });
    const p = db.projects.find((x) => x.id === projectId);
    log(db, "Planned overtime work", `${db.people.find((x) => x.id === personId)?.name}, ${p?.code} ${p?.name}, ${date}`, "schedule");
  });
  return null;
}

/** Plan someone on a site for every day given that they are free to work. */
export function planPerson(projectId: ID, personId: ID, dates: string[]) {
  mutate((db) => {
    for (const date of dates) {
      if (isRestDay(db.bankHolidays, date) || onLeave(db, personId, date) || mayNotWork(db, personId, date)) continue;
      if (db.plan.some((p) => p.projectId === projectId && p.personId === personId && p.date === date)) continue;
      db.plan.push({ id: newId("pl"), projectId, personId, date });
    }
    if (!db.assignments.some((a) => a.projectId === projectId && a.personId === personId)) db.assignments.push({ id: newId("as"), projectId, personId });
    log(db, "Planned someone on a site", `${db.people.find((p) => p.id === personId)?.name}, ${db.projects.find((p) => p.id === projectId)?.name}`, "schedule");
  });
}

/**
 * Put someone on a site for several days in one go (the rest of the week, or "repeat each weekday
 * until" on the month ahead). A step with `moveFrom` takes them off that site for the day first.
 * Weekends, bank holidays and approved leave are never planned.
 */
export function planDays(projectId: ID, personId: ID, steps: { date: string; half?: boolean; moveFrom?: ID }[]) {
  let done = 0;
  mutate((db) => {
    for (const st of steps) {
      if (isRestDay(db.bankHolidays, st.date) || onLeave(db, personId, st.date) || mayNotWork(db, personId, st.date)) continue;
      if (st.moveFrom) db.plan = db.plan.filter((p) => !(p.projectId === st.moveFrom && p.personId === personId && p.date === st.date));
      if (db.plan.some((p) => p.projectId === projectId && p.personId === personId && p.date === st.date)) continue;
      db.plan.push({ id: newId("pl"), projectId, personId, date: st.date, ...(st.half ? { part: "half" as const } : {}) });
      done++;
    }
    if (done === 0) return;
    if (!db.assignments.some((a) => a.projectId === projectId && a.personId === personId)) db.assignments.push({ id: newId("as"), projectId, personId });
    const p = db.projects.find((x) => x.id === projectId);
    log(db, "Planned someone on a site", `${db.people.find((x) => x.id === personId)?.name}, ${p?.code} ${p?.name}, ${done} ${done === 1 ? "day" : "days"}`, "schedule");
  });
  return done;
}

/** Stands in for the Friday message: records that the week was sent to everyone planned in it. */
export function sendWeekAhead(dates: string[]) {
  let n = 0;
  mutate((db) => {
    n = new Set(db.plan.filter((p) => dates.includes(p.date)).map((p) => p.personId)).size;
    const a = db.automations.find((x) => x.name === "Week ahead sent to operatives");
    if (a) { a.lastRun = nowStamp(); a.runs += 1; }
    log(db, "Sent the week ahead to operatives", `${n} people, week of ${dates[0]}`, "schedule");
  });
  return n;
}

// ── Plant ─────────────────────────────────────────────────────────────────────

const siteName = (db: Db, projectId: ID | null) => (projectId ? `${db.projects.find((p) => p.id === projectId)?.code}` : "the yard");

/**
 * Send a piece of the firm's own plant to a site, or bring it back to the yard (null). A machine
 * whose examination, test, inspection or insurance has run out cannot go to a site (Compliance):
 * returns false and changes nothing.
 */
export function movePlant(id: ID, projectId: ID | null) {
  let moved = true;
  mutate((db) => {
    const x = db.plant.find((p) => p.id === id);
    if (!x || x.projectId === projectId) return;
    if (projectId && plantBlocks(x, getDay()).length > 0) {
      moved = false;
      return;
    }
    const from = siteName(db, x.projectId);
    x.projectId = projectId;
    if (x.status !== "Off for repair") x.status = projectId ? "On site" : "Available";
    log(db, "Moved plant", `${x.assetRef} ${x.name}: ${from} to ${siteName(db, projectId)}`, "plant");
  });
  return moved;
}

export function addPlant(x: { assetRef: string; name: string; kind: string; spec: string; finance: string; basis: "hours" | "months" }) {
  mutate((db) => {
    const day = getDay();
    db.plant.push({
      id: newId("pl"),
      assetRef: x.assetRef.trim().toUpperCase(),
      name: x.name.trim(),
      kind: x.kind.trim(),
      spec: x.spec.trim(),
      finance: x.finance.trim() || "Owned outright",
      status: "Available",
      projectId: null,
      service: x.basis === "hours" ? { basis: "hours", intervalHours: 250, lastServiced: day, lastMeter: 0, meterNow: 0, hoursPerWeek: 20 } : { basis: "months", intervalMonths: 12, lastServiced: day },
      serviceHistory: [],
      renewals: [],
    });
    log(db, "Added an item of plant", `${x.assetRef.trim().toUpperCase()} ${x.name.trim()}`, "plant");
  });
}

export function setPlantRepair(id: ID, off: boolean) {
  mutate((db) => {
    const x = db.plant.find((p) => p.id === id);
    if (!x) return;
    x.status = off ? "Off for repair" : x.projectId ? "On site" : "Available";
    log(db, off ? "Sent plant for repair" : "Plant back from repair", `${x.assetRef} ${x.name}`, "plant");
  });
}

/** A service resets the clock: the date for month-based plans, the meter for hour-based ones. */
export function recordPlantService(id: ID, note: string) {
  mutate((db) => {
    const x = db.plant.find((p) => p.id === id);
    if (!x) return;
    closeTodos(db, `psvc:${id}`);
    x.service.lastServiced = getDay();
    if (x.service.basis === "hours") x.service.lastMeter = x.service.meterNow;
    x.serviceHistory.unshift({ id: newId("svc"), date: getDay(), meter: x.service.basis === "hours" ? x.service.meterNow : undefined, note: note.trim() || "Routine service and safety check." });
    log(db, "Recorded a plant service", `${x.assetRef} ${x.name}`, "plant");
  });
}

export function renewPlantCert(id: ID, renewalId: ID, expires: string, proof: NewProof) {
  mutate((db) => {
    const x = db.plant.find((p) => p.id === id);
    const r = x?.renewals.find((y) => y.id === renewalId);
    if (!x || !r) return;
    closeTodos(db, `chk:${id}:${renewalId}`);
    r.expires = expires;
    if (proof) {
      r.proof = { ...proof, addedBy: actorName(db), addedAt: nowStamp() };
      r.doc = proof.name;
      delete r.proofNeeded;
    } else {
      delete r.proof;
      delete r.doc;
      r.proofNeeded = true;
    }
    log(db, "Renewed a plant certificate", `${x.assetRef} ${r.kind}${proof ? ", certificate attached" : ", certificate still needed"}`, "plant");
  });
}

export function collectHire(id: ID) {
  mutate((db) => {
    const h = db.hiredPlant.find((x) => x.id === id);
    if (!h || h.status === "Collected") return;
    if (!h.returnNotifiedAt) h.returnNotifiedAt = nowStamp();
    h.status = "Collected";
    h.collectedAt = nowStamp();
    log(db, "Hired plant collected, hire stopped", `${h.description}, ${h.hireCompany}`, "plant");
  });
}

// ── Fleet (18 Nov, brought across from the Secure-All build) ───────────────────

const clean = (s: string | undefined | null) => (s ?? "").trim().replace(/\s+/g, " ");
const regOf = (db: Db, id: ID) => db.vehicles.find((v) => v.id === id)?.reg ?? "a vehicle";
const cash = (n: number) => money2(n, usePrefs.getState().brand.region);
const personName = (db: Db, id: ID | null | undefined) => db.people.find((p) => p.id === id)?.name;

/** A file to keep with a fleet record: what was picked, before it is stamped with who and when. */
export type FleetFile = Pick<Proof, "name" | "dataUrl" | "sample"> | null;
/**
 * The files kept with a record, in order: ones already kept (they carry who added them) stay as
 * they are, and ones just picked are stamped. A record's first file is its main one; the rest
 * are further pages (the back of a licence, page two of an invoice).
 */
export type FileIn = Proof | NonNullable<FleetFile>;
const isKept = (f: FileIn): f is Proof => "addedBy" in f && !!(f as Proof).addedBy;
const stampAll = (db: Db, files: FileIn[] | FleetFile | undefined): Proof[] => (Array.isArray(files) ? files : files ? [files] : []).map((f) => (isKept(f) ? f : { ...f, addedBy: actorName(db), addedAt: nowStamp() }));
/** `{ file, extraFiles }` or `{ proof, extraProofs }` for a record, left out when there are none. */
const filed = <A extends string, B extends string>(files: Proof[], first: A, rest: B) => ({ ...(files[0] ? { [first]: files[0] } : {}), ...(files.length > 1 ? { [rest]: files.slice(1) } : {}) }) as { [K in A]?: Proof } & { [K in B]?: Proof[] };

export function addBase(b: Pick<Base, "name" | "county" | "region"> & { kind?: BaseKind }): ID {
  const id = newId("b");
  mutate((db) => {
    db.bases.push({ id, name: clean(b.name), county: clean(b.county), region: clean(b.region), kind: b.kind ?? "Yard" });
    log(db, "Added a base", `${clean(b.name)}${b.kind === "Office" ? ", an office" : ""}`, "fleet");
  });
  return id;
}

export function updateBase(id: ID, b: Partial<Pick<Base, "name" | "county" | "region" | "kind">>) {
  mutate((db) => {
    const x = db.bases.find((y) => y.id === id);
    if (!x) return;
    Object.assign(x, Object.fromEntries(Object.entries(b).map(([k, v]) => [k, typeof v === "string" && k !== "kind" ? clean(v) : v])));
    log(db, "Changed a base's details", x.name, "fleet");
  });
}

export function addGarage(g: Pick<Garage, "name" | "town" | "county"> & Partial<Pick<Garage, "phone" | "email" | "contact" | "notes">>): ID {
  const id = newId("g");
  mutate((db) => {
    db.garages.push({ id, name: clean(g.name), town: clean(g.town), county: clean(g.county), phone: clean(g.phone), email: clean(g.email), ...(g.contact ? { contact: clean(g.contact) } : {}), ...(g.notes ? { notes: clean(g.notes) } : {}) });
    log(db, "Added a garage", `${clean(g.name)}, ${clean(g.town)}`, "fleet");
  });
  return id;
}

export function updateGarage(id: ID, g: Partial<Omit<Garage, "id">>) {
  mutate((db) => {
    const x = db.garages.find((y) => y.id === id);
    if (!x) return;
    Object.assign(x, Object.fromEntries(Object.entries(g).map(([k, v]) => [k, typeof v === "string" ? clean(v) : v])));
    log(db, "Changed a garage's details", x.name, "fleet");
  });
}

/** Put someone from People on Fleet's driver list (their name, phone and email stay People's). */
export function addDriver(personId: ID) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p || p.drives) return;
    p.drives = true;
    p.drivesUntil = undefined;
    log(db, "Added a driver", p.name, "fleet");
  });
}

/**
 * Record a driving licence or Driver CPC: when it runs out, and the copy or copies of it. With no
 * new file the copy already kept stays. `fromPhone`: the driver sent it from the site phone, so it
 * shows at once and is flagged until the office has checked it. `anyway` is the warning the person
 * saved past (a name that did not match), kept in the log.
 */
export function setDriverLicence(id: ID, which: LicenceKey, expiryDate: Day, files: FileIn[] | FleetFile, opts: { fromPhone?: boolean; anyway?: string } = {}) {
  mutate((db) => {
    const x = db.people.find((y) => y.id === id);
    if (!x) return;
    const now = stampAll(db, files);
    const was = x.licences?.[which];
    // The copy already on file is kept when no new one comes with it; a new date with no new copy is "Proof needed" (Compliance, decision 117).
    const keep = now.length ? now : [...(was?.proof ? [was.proof] : []), ...(was?.extraProofs ?? [])];
    x.licences = { ...x.licences, [which]: { expiryDate, ...filed(keep, "proof", "extraProofs"), ...(opts.fromPhone ? { fromPhoneAt: nowStamp() } : {}), ...(now.length || (was && was.expiryDate === expiryDate && !was.proofNeeded && keep.length) ? {} : { proofNeeded: true }) } };
    closeTodos(db, `dl:${id}:${which}`);
    if (!x.drives && !x.drivesUntil) x.drives = true;
    const what = which === "cpc" ? "Driver CPC" : "driving licence";
    log(db, opts.fromPhone ? `Sent a ${what} from the phone` : `Recorded a ${what}`, `${x.name}, runs to ${expiryDate}${opts.anyway ? `. Saved although ${opts.anyway}` : ""}`, opts.fromPhone ? "site" : "fleet");
  });
}

/** The office has looked at a licence a driver sent from the phone: the flag comes off. */
export function confirmLicence(id: ID, which: LicenceKey) {
  mutate((db) => {
    const x = db.people.find((y) => y.id === id);
    const l = x?.licences?.[which];
    if (!x || !l?.fromPhoneAt) return;
    const { fromPhoneAt: _f, ...rest } = l;
    x.licences = { ...x.licences, [which]: rest };
    log(db, "Checked a licence sent from the phone", `${x.name}, ${which === "cpc" ? "Driver CPC" : "driving licence"}`, "fleet");
  });
}

/** Take a driver off the driver list (after a confirm): they move to "Left", with their history kept. */
export function setDriverActive(id: ID, active: boolean) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === id);
    if (!p || !!p.drives === active) return;
    p.drives = active;
    p.drivesUntil = active ? undefined : getDay();
    log(db, active ? "Brought a driver back" : "Took a driver off the list", p.name, "fleet");
  });
}

export type VehicleFields = Pick<Vehicle, "reg" | "make" | "model" | "kind" | "fuel" | "division" | "ownership" | "baseId" | "driverId" | "purchasePrice" | "purchaseMonth" | "mileage">;
/** What can change once a vehicle is added: everything but the registration, make and model. */
export type VehicleChanges = Partial<Omit<VehicleFields, "reg" | "make" | "model" | "mileage">>;

/** True if another vehicle already has this registration. */
export function regTaken(db: Db, reg: string, exceptId?: ID) {
  const r = normaliseReg(reg);
  return db.vehicles.some((v) => v.id !== exceptId && normaliseReg(v.reg) === r);
}

/** Add a vehicle, with a service every 12 months from today. Returns its id, or null when the registration is already on the list. */
export function addVehicle(f: VehicleFields, compliance?: Partial<Vehicle["compliance"]>): ID | null {
  let id: ID | null = null;
  mutate((db) => {
    if (regTaken(db, f.reg)) return;
    id = newId("v");
    const blank: ComplianceItem = { paidDate: "", expiryDate: "", amount: 0 };
    db.vehicles.push({ id, ...f, reg: normaliseReg(f.reg), make: clean(f.make), model: clean(f.model), division: clean(f.division), mileageAt: getDay(), mileageFrom: "typed", active: true, sellPrice: null, compliance: { tax: compliance?.tax ?? blank, test: compliance?.test ?? blank, insurance: compliance?.insurance ?? blank }, service: { basis: "months", intervalMonths: 12, lastServiced: getDay() } });
    log(db, "Added a vehicle", `${normaliseReg(f.reg)}, ${clean(f.make)} ${clean(f.model)}`, "fleet");
  });
  return id;
}

/**
 * Change a vehicle's details. The registration, make and model cannot change: a vehicle typed in
 * wrongly is deleted and added again while it has no records (`deleteVehicle`). Past invoices
 * keep the base, driver and site they had on the day.
 */
export function updateVehicle(id: ID, f: VehicleChanges): boolean {
  let ok = false;
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    const { reg: _r, make: _m, model: _o, mileage: _k, ...safe } = f as Partial<VehicleFields>;
    const changed: string[] = [];
    if (safe.baseId !== undefined && safe.baseId !== v.baseId) changed.push(`base to ${db.bases.find((b) => b.id === safe.baseId)?.name ?? "none"}`);
    if (safe.driverId !== undefined && safe.driverId !== v.driverId) changed.push(`driver to ${personName(db, safe.driverId) ?? "nobody (pool)"}`);
    Object.assign(v, safe);
    log(db, "Changed a vehicle's details", `${v.reg}${changed.length ? `: ${changed.join(", ")}` : ""}`, "fleet");
    ok = true;
  });
  return ok;
}

/** What is filed against a vehicle. A vehicle with none of these can be deleted outright. */
export function vehicleRecords(db: Db, id: ID) {
  return {
    invoices: db.garageInvoices.filter((i) => i.lines.some((l) => l.vehicleId === id)).length,
    documents: db.fleetDocs.filter((d) => d.vehicleId === id).length,
    checks: db.vehicleChecks.filter((c) => c.vehicleId === id).length,
    damage: db.damageReports.filter((a) => a.vehicleId === id).length,
  };
}

/** Delete a vehicle typed in by mistake. Refused (false) once anything is filed against it. */
export function deleteVehicle(id: ID): boolean {
  let ok = false;
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    const r = vehicleRecords(db, id);
    if (r.invoices + r.documents + r.checks + r.damage > 0) return;
    db.vehicles = db.vehicles.filter((x) => x.id !== id);
    db.todos = db.todos.filter((t) => t.vehicleId !== id);
    log(db, "Deleted a vehicle added by mistake", `${v.reg}, ${v.make} ${v.model}`, "fleet");
    ok = true;
  });
  return ok;
}

/** Someone types the mileage in; it is right as of today. */
export function updateMileage(id: ID, km: number) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    const before = v.mileage;
    v.mileage = Math.round(km);
    v.mileageAt = getDay();
    v.mileageFrom = "typed";
    log(db, "Updated the mileage", `${v.reg}: ${before.toLocaleString("en-IE")} to ${v.mileage.toLocaleString("en-IE")} km`, "fleet");
  });
}

/** Take a vehicle off the fleet: sold (with the amount) or not sold (null). Its history is kept. */
export function removeVehicle(id: ID, sellPrice: number | null) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v || !v.active) return;
    v.active = false;
    v.removedAt = getDay();
    v.sellPrice = sellPrice;
    v.driverId = null;
    log(db, "Removed a vehicle from the fleet", `${v.reg}${sellPrice != null ? `, sold for ${cash(sellPrice)}` : ", not sold"}`, "fleet");
  });
}

export function restoreVehicle(id: ID) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v || v.active) return;
    v.active = true;
    v.removedAt = undefined;
    v.sellPrice = null;
    log(db, "Put a vehicle back on the fleet", v.reg, "fleet");
  });
}

const DOC_WORD: Record<"tax" | "test" | "insurance", string> = { tax: "motor tax", test: "test", insurance: "insurance" };

/**
 * Record a renewal of motor tax, the test or insurance, with the payment receipt if there is one
 * (filed with the vehicle's documents, apart from repair invoices). The new disc is then waiting
 * to go on the vehicle until someone ticks it, and any to-do for this renewal is done. `anyway` is
 * the warning the person saved past (a registration that did not match), kept in the log.
 */
export function renewVehicle(id: ID, item: "tax" | "test" | "insurance", expiryDate: string, amount: number, files: FileIn[] | FleetFile, opts: { anyway?: string } = {}) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    const kept = stampAll(db, files);
    // Saved without a receipt: "Proof needed" until one is attached (Compliance, decision 117).
    v.compliance[item] = { paidDate: getDay(), expiryDate, amount: r2(amount), discPending: true, ...(kept.length ? {} : { proofNeeded: true }) };
    closeTodos(db, `veh:${id}:${item}`);
    db.fleetDocs.unshift({ id: newId("fd"), vehicleId: id, category: item, date: getDay(), amount: r2(amount), expiryDate, fileName: kept[0]?.name ?? `${v.reg} ${DOC_WORD[item]} receipt ${getDay()}`, ...filed(kept, "proof", "extraProofs") });
    for (const t of db.todos) if (!t.doneAt && t.vehicleId === id && t.item === item) Object.assign(t, { doneAt: nowStamp(), doneBy: actorName(db) });
    log(db, `Renewed ${DOC_WORD[item]}`, `${v.reg}, to ${expiryDate}${opts.anyway ? `. Saved although ${opts.anyway}` : ""}`, "fleet");
  });
}

/** Tick that the new disc is on the vehicle's windscreen. */
export function markDiscOn(id: ID, item: "tax" | "test" | "insurance") {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    v.compliance[item] = { ...v.compliance[item], discPending: false, discOnAt: getDay() };
    log(db, "Ticked the new disc on", `${v.reg}, ${DOC_WORD[item]}`, "fleet");
  });
}

export function addFleetDoc(d: { vehicleId: ID; category: FleetDocCategory; date: string; amount: number; expiryDate?: string; note?: string }, files: FileIn[] | FleetFile, opts: { anyway?: string } = {}) {
  mutate((db) => {
    const kept = stampAll(db, files);
    db.fleetDocs.unshift({ id: newId("fd"), ...d, amount: r2(d.amount), fileName: kept[0]?.name ?? `${regOf(db, d.vehicleId)} ${d.category} ${d.date}`, ...filed(kept, "proof", "extraProofs") });
    log(db, "Added a vehicle document", `${regOf(db, d.vehicleId)}: ${kept[0]?.name ?? d.category}${opts.anyway ? `. Saved although ${opts.anyway}` : ""}`, "fleet");
  });
}

// ── To do (the Dashboard's own list) ───────────────────────────────────────────

export function addTodo(t: Pick<Todo, "title" | "due"> & Partial<Pick<Todo, "vehicleId" | "item" | "complianceKey" | "to">>): ID {
  const id = newId("td");
  mutate((db) => {
    db.todos.unshift({ id, title: clean(t.title), due: t.due, ...(t.vehicleId ? { vehicleId: t.vehicleId } : {}), ...(t.item ? { item: t.item } : {}), ...(t.complianceKey ? { complianceKey: t.complianceKey } : {}), ...(t.to ? { to: t.to } : {}), createdAt: nowStamp(), createdBy: actorName(db) });
    log(db, "Added a to-do", `${clean(t.title)}, due ${t.due}`, "dashboard");
  });
  return id;
}

/**
 * A Compliance row that was put on someone's to-do list is ticked off there once it is renewed,
 * checked or recorded (merged 19 Nov, like Fleet's renewals). `key` is the row's key in
 * src/lib/compliance.ts.
 */
function closeTodos(db: Db, key: string) {
  for (const t of db.todos) if (!t.doneAt && t.complianceKey === key) Object.assign(t, { doneAt: nowStamp(), doneBy: actorName(db) });
}

export function setTodoDone(id: ID, done: boolean) {
  mutate((db) => {
    const t = db.todos.find((x) => x.id === id);
    if (!t || !!t.doneAt === done) return;
    if (done) Object.assign(t, { doneAt: nowStamp(), doneBy: actorName(db) });
    else Object.assign(t, { doneAt: undefined, doneBy: undefined });
    log(db, done ? "Ticked off a to-do" : "Opened a to-do again", t.title, "dashboard");
  });
}

export function deleteTodo(id: ID) {
  mutate((db) => {
    const t = db.todos.find((x) => x.id === id);
    if (!t) return;
    db.todos = db.todos.filter((x) => x.id !== id);
    log(db, "Deleted a to-do", t.title, "dashboard");
  });
}

// ── Garage notes ──────────────────────────────────────────────────────────────

/** A private, dated note on a garage. Notes are never edited: a wrong one is deleted and written again. */
export function addGarageNote(garageId: ID, text: string) {
  mutate((db) => {
    const g = db.garages.find((x) => x.id === garageId);
    if (!g || !text.trim()) return;
    db.garageNotes.unshift({ id: newId("gn"), garageId, at: nowStamp(), by: actorName(db), text: text.trim().slice(0, 1000) });
    log(db, "Added a note on a garage", g.name, "fleet");
  });
}

export function deleteGarageNote(id: ID) {
  mutate((db) => {
    const n = db.garageNotes.find((x) => x.id === id);
    if (!n) return;
    db.garageNotes = db.garageNotes.filter((x) => x.id !== id);
    log(db, "Deleted a note on a garage", db.garages.find((g) => g.id === n.garageId)?.name ?? "a garage", "fleet");
  });
}

// ── Damage reported ───────────────────────────────────────────────────────────

/** Damage reported on the site phone: where, what happened and photos. The office sees it in Fleet. */
export function reportDamage(r: { vehicleId: ID; driverId: ID | null; where: string; note: string }, photos: FileIn[]): ID {
  const id = newId("dmg");
  mutate((db) => {
    db.damageReports.unshift({ id, vehicleId: r.vehicleId, driverId: r.driverId, at: nowStamp(), where: clean(r.where), note: r.note.trim().slice(0, 1000), photos: stampAll(db, photos), status: "New" });
    log(db, "Reported damage to a vehicle", `${regOf(db, r.vehicleId)} by ${personName(db, r.driverId) ?? "a driver"}: ${r.note.trim().slice(0, 120)}`, "site");
  });
  return id;
}

/** Mark a damage report dealt with (with a note of what was done, if any), or put it back to new. */
export function setDamageDealt(id: ID, dealt: boolean, note = "") {
  mutate((db) => {
    const d = db.damageReports.find((x) => x.id === id);
    if (!d || (d.status === "Dealt with") === dealt) return;
    d.status = dealt ? "Dealt with" : "New";
    d.dealtBy = dealt ? actorName(db) : undefined;
    d.dealtAt = dealt ? nowStamp() : undefined;
    d.dealtNote = dealt && note.trim() ? note.trim().slice(0, 500) : undefined;
    log(db, dealt ? "Marked damage as dealt with" : "Put a damage report back to new", `${regOf(db, d.vehicleId)}${dealt && note.trim() ? `: ${note.trim().slice(0, 120)}` : ""}`, "fleet");
  });
}

// ── Garage invoices ───────────────────────────────────────────────────────────

/** `id` is set for a line that is already on a saved invoice, when that invoice is being corrected. */
export type LineDraft = { id?: ID; vehicleId: ID; category: RepairCategory; description: string; mileage: number | null; amount: number };
export type InvoiceDraft = { invoiceNo: string; garageId: ID; date: string; lines: LineDraft[]; vat: number | null; poNumber?: string; notes?: string };

/** Where a vehicle's cost is filed on a day: its base, its driver, and the site that driver was on (timesheet, else plan, else the site they run). */
function filedUnder(db: Db, v: Vehicle | undefined, date: string): Pick<RepairLine, "baseId" | "driverId" | "siteId"> {
  const driverId = v?.driverId ?? null;
  return { baseId: v?.baseId ?? null, driverId, siteId: driverId ? (driverSiteOn(driverId, date, db.attendance, db.plan, db.projects) ?? null) : null };
}

function raiseMileage(v: Vehicle | undefined, mileage: number | null, date: string) {
  if (v && mileage && mileage > v.mileage) {
    v.mileage = mileage;
    v.mileageAt = date;
    v.mileageFrom = "invoice";
  }
}

const byInvoiceDate = (a: RepairInvoice, b: RepairInvoice) => (a.date === b.date ? b.enteredAt.localeCompare(a.enteredAt) : b.date.localeCompare(a.date));

/**
 * Save an uploaded invoice, "to check". Each line takes its vehicle's base and driver as they
 * are today, and the site that driver was on that day, so moving the vehicle later does not move
 * this cost. A vehicle's mileage moves up to the reading on the invoice when that is higher.
 */
export function saveInvoice(d: InvoiceDraft, files: FileIn[] | FleetFile): ID {
  const id = newId("inv");
  mutate((db) => {
    const lines: RepairLine[] = d.lines.map((l) => {
      const v = db.vehicles.find((x) => x.id === l.vehicleId);
      raiseMileage(v, l.mileage, d.date);
      return { id: newId("l"), vehicleId: l.vehicleId, ...filedUnder(db, v, d.date), category: l.category, description: clean(l.description), mileage: l.mileage, amount: r2(l.amount) };
    });
    const total = r2(lines.reduce((t, l) => t + l.amount, 0));
    const inv: RepairInvoice = { id, invoiceNo: clean(d.invoiceNo), garageId: d.garageId, date: d.date, lines, total, vat: d.vat, status: "To check", enteredBy: actorName(db), enteredAt: nowStamp(), ...filed(stampAll(db, files), "file", "extraFiles"), ...(d.poNumber?.trim() ? { poNumber: clean(d.poNumber) } : {}), ...(d.notes?.trim() ? { notes: d.notes.trim() } : {}) };
    db.garageInvoices.unshift(inv);
    db.garageInvoices.sort(byInvoiceDate);
    const garage = db.garages.find((g) => g.id === d.garageId)?.name ?? "a garage";
    log(db, "Uploaded a garage invoice", `${inv.invoiceNo || "No number"} from ${garage}, ${cash(total)}, ${lines.map((l) => regOf(db, l.vehicleId)).join(", ")}`, "fleet");
  });
  return id;
}

/**
 * Correct a saved invoice: anything on it can change. A line that keeps its vehicle keeps the
 * base, driver and site it was first filed under; a line moved to another vehicle, and a new line,
 * take that vehicle's. A checked invoice goes back to "To check". `files`: the whole list of files
 * to keep from now on; leaving it out keeps what is there. The activity log says what changed.
 * Returns "unchecked" when it had been checked, "saved" otherwise, null when there is no such invoice.
 */
export function updateInvoice(id: ID, d: InvoiceDraft, files?: FileIn[]): "saved" | "unchecked" | null {
  let result: "saved" | "unchecked" | null = null;
  mutate((db) => {
    const inv = db.garageInvoices.find((x) => x.id === id);
    if (!inv) return;
    const garageName = (gid: ID) => db.garages.find((g) => g.id === gid)?.name ?? "a garage";
    const workOf = (ls: { category: string; description: string; mileage: number | null; amount: number }[]) => ls.map((l) => `${l.category}|${l.description}|${l.mileage ?? ""}|${l.amount}`).join(";");
    const before = { no: inv.invoiceNo, garageId: inv.garageId, date: inv.date, total: inv.total, regs: inv.lines.map((l) => regOf(db, l.vehicleId)).join(", "), work: workOf(inv.lines), vat: inv.vat, notes: inv.notes ?? "" };
    const lines: RepairLine[] = d.lines.map((l) => {
      const was = l.id ? inv.lines.find((x) => x.id === l.id) : undefined;
      const v = db.vehicles.find((x) => x.id === l.vehicleId);
      raiseMileage(v, l.mileage, d.date);
      const same = was && was.vehicleId === l.vehicleId;
      return { id: was?.id ?? newId("l"), vehicleId: l.vehicleId, ...(same ? { baseId: was.baseId, driverId: was.driverId, siteId: was.siteId } : filedUnder(db, v, d.date)), category: l.category, description: clean(l.description), mileage: l.mileage, amount: r2(l.amount) };
    });
    inv.invoiceNo = clean(d.invoiceNo);
    inv.garageId = d.garageId;
    inv.date = d.date;
    inv.lines = lines;
    inv.total = r2(lines.reduce((t, l) => t + l.amount, 0));
    inv.vat = d.vat;
    inv.notes = d.notes?.trim() ? d.notes.trim() : undefined;
    const hadFiles = [inv.file, ...(inv.extraFiles ?? [])].filter(Boolean).length;
    if (files !== undefined) {
      const kept = stampAll(db, files);
      inv.file = kept[0];
      inv.extraFiles = kept.length > 1 ? kept.slice(1) : undefined;
    }
    inv.editedBy = actorName(db);
    inv.editedAt = nowStamp();
    result = inv.status === "Checked" ? "unchecked" : "saved";
    if (inv.status === "Checked") {
      inv.status = "To check";
      inv.checkedBy = undefined;
      inv.checkedAt = undefined;
    }
    db.garageInvoices.sort(byInvoiceDate);
    const changed: string[] = [];
    const regs = lines.map((l) => regOf(db, l.vehicleId)).join(", ");
    if (before.no !== inv.invoiceNo) changed.push(`number ${before.no || "none"} to ${inv.invoiceNo || "none"}`);
    if (before.garageId !== inv.garageId) changed.push(`garage ${garageName(before.garageId)} to ${garageName(inv.garageId)}`);
    if (before.date !== inv.date) changed.push(`date ${before.date} to ${inv.date}`);
    if (before.total !== inv.total) changed.push(`total ${cash(before.total)} to ${cash(inv.total)}`);
    if (before.regs !== regs) changed.push(`vehicles ${before.regs} to ${regs}`);
    else if (before.work !== workOf(lines) && before.total === inv.total) changed.push("the work done, category or mileage");
    if (before.vat !== inv.vat) changed.push("the VAT");
    if (before.notes !== (inv.notes ?? "")) changed.push("the notes");
    if (files !== undefined && (files.some((f) => !isKept(f)) || files.length !== hadFiles)) changed.push(files.length === 0 ? "the file taken off" : files.some((f) => !isKept(f)) ? "a file added or replaced" : "a file taken off");
    log(db, "Corrected an invoice", `${inv.invoiceNo || "No number"} from ${garageName(inv.garageId)}: ${changed.length ? changed.join("; ") : "saved with no change"}${result === "unchecked" ? ". Back to check" : ""}`, "fleet");
  });
  return result;
}

/**
 * Mark a garage invoice checked, or put a checked one back to check. Putting it back needs a note
 * saying why: it is kept on the invoice and in the log. Returns false when the note is missing.
 */
export function setInvoiceStatus(id: ID, status: InvoiceStatus, note = ""): boolean {
  let ok = false;
  mutate((db) => {
    const inv = db.garageInvoices.find((x) => x.id === id);
    if (!inv || inv.status === status) return;
    if (status === "To check" && !note.trim()) return;
    inv.status = status;
    if (status === "Checked") {
      inv.checkedBy = actorName(db);
      inv.checkedAt = nowStamp();
    } else {
      inv.checkedBy = undefined;
      inv.checkedAt = undefined;
      inv.backNotes = [...(inv.backNotes ?? []), { at: nowStamp(), by: actorName(db), text: note.trim().slice(0, 500) }];
    }
    log(db, status === "Checked" ? "Marked a garage invoice checked" : "Put a garage invoice back to check", status === "Checked" ? inv.invoiceNo : `${inv.invoiceNo}: ${note.trim().slice(0, 200)}`, "fleet");
    ok = true;
  });
  return ok;
}

/** Delete a garage invoice entered by mistake, such as a duplicate. */
export function deleteInvoice(id: ID) {
  mutate((db) => {
    const i = db.garageInvoices.findIndex((x) => x.id === id);
    if (i < 0) return;
    const inv = db.garageInvoices[i]!;
    db.garageInvoices.splice(i, 1);
    log(db, "Deleted a garage invoice", `${inv.invoiceNo}, ${cash(inv.total)}`, "fleet");
  });
}

/** A document read by the AI model to fill in a form: what was read, never the figures. */
export function logAiRead(what: string, fileName: string) {
  mutate((db) => log(db, "Read a document with AI", `${what}: ${fileName}`.slice(0, 300), "fleet"));
}

// ── Files ─────────────────────────────────────────────────────────────────────

/** An invoice's PDF goes in the project's Invoices folder, once. */
function fileInvoice(db: Db, projectId: ID, name: string, date: string, addedBy: string, source: "Upload" | "Email") {
  if (db.files.some((f) => f.projectId === projectId && f.category === "Invoices" && f.name === name)) return;
  db.files.unshift({ id: newId("f"), projectId, folder: "Invoices", category: "Invoices", name, kind: "pdf", sizeKb: 90 + (name.length * 7) % 160, modified: date, addedBy, source, tone: name.length % 6 });
}

export function addFile(projectId: ID, category: FileCategory, f: { name: string; kind: FileKind; sizeKb: number; dataUrl?: string }) {
  mutate((db) => {
    const n = db.files.length;
    db.files.unshift({ id: newId("f"), projectId, folder: category, category, name: f.name, kind: f.kind, sizeKb: f.sizeKb, modified: getDay(), addedBy: actorName(db), source: "Upload", tone: n % 6, ...(f.dataUrl ? { dataUrl: f.dataUrl } : {}), ...(category === "Photos and videos" ? { stage: "During" as const, caption: f.name.replace(/\.[a-z0-9]+$/i, "") } : {}) });
    log(db, "Added a file", `${f.name}, ${db.projects.find((p) => p.id === projectId)?.code} ${category}`, "files");
  });
}

/** A client sends a document through the portal: a purchase order, a payment certificate. It lands in the project's Correspondence folder. */
export function clientSendsDocument(projectId: ID, who: string, what: string, f: { name: string; dataUrl: string }) {
  mutate((db) => {
    const p = db.projects.find((x) => x.id === projectId);
    if (!p) return;
    const pdf = f.dataUrl.startsWith("data:application/pdf");
    db.files.unshift({ id: newId("f"), projectId, folder: "Correspondence", category: "Correspondence", name: `${what}, ${f.name}`, kind: pdf ? "pdf" : "image", sizeKb: Math.max(1, Math.round((f.dataUrl.length * 3) / 4 / 1024)), modified: getDay(), addedBy: who, source: "Portal", tone: db.files.length % 6, dataUrl: f.dataUrl });
    log(db, "Sent a document through the portal", `${what}, ${p.code} ${p.name}`, "portal", who);
  });
}

/** Files a document from "To be sorted" into a project's folder. */
export function fileIt(fileId: ID, projectId: ID, category: FileCategory) {
  mutate((db) => {
    const f = db.files.find((x) => x.id === fileId);
    if (!f) return;
    f.projectId = projectId;
    f.category = category;
    f.folder = category;
    if (category === "Photos and videos" && !f.stage) {
      f.stage = "During";
      f.caption = f.name.replace(/\.[a-z0-9]+$/i, "");
    }
    log(db, "Filed a document", `${f.name}: ${db.projects.find((p) => p.id === projectId)?.code} ${category}`, "files");
  });
}

// ── Invoicing ─────────────────────────────────────────────────────────────────

/** Stands in for the reader: fills in the lines of an invoice that has arrived but not been read yet. */
export function readSupplierInvoice(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (s) readOne(db, s);
  });
}

/** The reader's work on one invoice: the lines it finds, waiting for a person to check them. */
function readOne(db: Db, s: Db["supplierInvoices"][number]) {
  if (s.readStatus !== "not_read") return false;
  const hire = db.hiredPlant.find((h) => h.hireCompany === s.supplier && db.projects.find((p) => p.id === h.projectId)?.code === s.jobRef);
  s.lines = [{ description: hire ? `${hire.description}, hire to ${getDay()}` : `Goods and services, ${s.invoiceNo}`, amount: s.subtotal }];
  s.readStatus = "needs_review";
  log(db, "Read a supplier invoice", `${s.supplier} ${s.invoiceNo}`, "invoicing", "System");
  return true;
}

const purchaseName = (s: Db["supplierInvoices"][number]) => `${s.supplier} ${s.invoiceNo}`;
const whose = (s: Db["supplierInvoices"][number]) => (partyOf(s) === "subcontractor" ? "subcontractor" : "supplier");

/**
 * Approve an invoice into job costs: each line is posted to its project, and the invoice
 * goes on to accounts to be paid. `allocations` are the lines as just checked on screen; left
 * out, the ones already on the invoice stand (it was checked before it was sent for approval).
 * Who may approve which invoice is decided by `mayApprove` in src/lib/purchases.ts.
 */
export function approvePurchase(id: ID, allocations?: Omit<Allocation, "id">[]) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || s.readStatus !== "needs_review") return;
    if (allocations) s.allocations = allocations.map((a) => ({ ...a, id: newId("al") }));
    if (s.allocations.length === 0) return;
    s.readStatus = "confirmed";
    s.confirmedBy = actorName(db);
    s.confirmedAt = nowStamp();
    delete s.sentBack;
    // The paper is filed with each project it was charged to.
    for (const projectId of new Set(s.allocations.map((a) => a.projectId))) fileInvoice(db, projectId, s.fileName, s.receivedAt.slice(0, 10), s.supplier, "Email");
    log(db, `Approved a ${whose(s)} invoice into job costs`, purchaseName(s), "invoicing");
  });
}

/** The name this had before approval and payment were separate steps (18 Nov). */
export const confirmSupplierInvoice = approvePurchase;

/** Accounts have checked an invoice they may not approve themselves: it waits for someone who may. */
export function sendForApproval(id: ID, allocations: Omit<Allocation, "id">[]) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || s.readStatus !== "needs_review" || allocations.length === 0) return;
    s.allocations = allocations.map((a) => ({ ...a, id: newId("al") }));
    s.askedBy = actorName(db);
    s.askedAt = nowStamp();
    delete s.sentBack;
    log(db, `Sent a ${whose(s)} invoice for approval`, purchaseName(s), "invoicing");
  });
}

/** Whoever was asked to approve it says no for now, and why. A subcontractor reads the reason in their portal. */
export function sendBackPurchase(id: ID, reason: string) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || purchaseStage(s) !== "approve" || !reason.trim()) return;
    s.sentBack = { by: actorName(db), at: nowStamp(), reason: reason.trim() };
    delete s.askedBy;
    delete s.askedAt;
    log(db, `Sent a ${whose(s)} invoice back`, `${purchaseName(s)}: ${reason.trim()}`, "invoicing");
  });
}

/** Accounts take back an invoice they sent for approval, to change it. */
export function takeBackPurchase(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || purchaseStage(s) !== "approve") return;
    delete s.askedBy;
    delete s.askedAt;
    log(db, `Took a ${whose(s)} invoice back from approval`, purchaseName(s), "invoicing");
  });
}

/** Undo an approval: the invoice comes out of job costs until it is approved again. Not once it has been paid. */
export function reopenSupplierInvoice(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || s.readStatus !== "confirmed" || s.paidOn) return;
    db.files = db.files.filter((f) => !(f.category === "Invoices" && f.name === s.fileName));
    s.readStatus = "needs_review";
    delete s.confirmedBy;
    delete s.confirmedAt;
    delete s.askedBy;
    delete s.askedAt;
    log(db, `Reopened a ${whose(s)} invoice`, purchaseName(s), "invoicing");
  });
}

/**
 * Accounts have paid an approved invoice through the bank and say so here. A subcontractor
 * sees it as paid in their portal straight away; with `email` they are also sent a remittance
 * advice, filed under Email, Sent. In the demo nothing leaves the browser.
 */
export function markPurchasePaid(id: ID, opts: { paidOn?: string; ref?: string; email?: boolean } = {}) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || purchaseStage(s) !== "pay") return;
    s.paidOn = opts.paidOn && opts.paidOn <= getDay() ? opts.paidOn : getDay();
    s.paidBy = actorName(db);
    if (opts.ref?.trim()) s.paidRef = opts.ref.trim();
    const sub = db.subcontractors.find((x) => x.id === s.subcontractorId);
    if (sub && opts.email) {
      const { brand, role, operativeId, asPersonId } = usePrefs.getState();
      const site = db.projects.find((p) => p.id === s.allocations[0]?.projectId);
      const email = remittanceEmail({ invoiceNo: s.invoiceNo, total: s.total, paidOn: s.paidOn, paidRef: s.paidRef, contactName: sub.contactName, project: site ? `${site.code} ${site.name}` : "", sender: actorName(db), company: brand.legalName, region: brand.region });
      const mailbox = `accounts@${brand.emailDomain}`;
      db.mails.unshift({ id: newId("mail"), mailbox, folder: "Sent", fromName: actorName(db), fromAddress: mailbox, subject: email.subject, to: `${sub.contactName} <${sub.email}>`, body: `${email.body}`, receivedAt: nowStamp(), read: true, intent: "General", routedToId: signedInPersonId(role, asPersonId, operativeId, db.people) ?? "p-md", purchaseInvoiceId: s.id });
    }
    log(db, `Marked a ${whose(s)} invoice paid`, `${purchaseName(s)}${sub ? (opts.email ? ", told in the portal and by email" : ", told in the portal") : ""}`, "invoicing");
  });
}

/** Take back a "paid" marked by mistake: the invoice is waiting to be paid again, and the portal no longer says it is paid. */
export function unmarkPurchasePaid(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || !s.paidOn) return;
    delete s.paidOn;
    delete s.paidBy;
    delete s.paidRef;
    log(db, "Took back a payment marked by mistake", purchaseName(s), "invoicing");
  });
}

/** Record that these supplier and subcontractor invoices went to Sage. The file is built by src/lib/accounts-export.ts. */
export function markPurchasesExported(ids: ID[], packageName: string) {
  mutate((db) => {
    const at = nowStamp();
    for (const s of db.supplierInvoices) if (ids.includes(s.id)) s.exportedAt = at;
    log(db, "Exported purchase invoices to accounts", `${ids.length} to ${packageName}`, "invoicing");
  });
}

/**
 * A subcontractor sends an invoice in through the portal, for one of their sites. It is theirs
 * to describe, so nothing needs reading: it is charged to that site under labour and
 * subcontractors and goes straight to whoever may approve it (the site's manager or the
 * managing director). `who` is the subcontractor's contact, for the record.
 */
export function subcontractorSendsInvoice(subcontractorId: ID, f: { projectId: ID; invoiceNo: string; invoiceDate: string; description: string; net: number; vatPct: number; copy?: { name: string; dataUrl: string } }): ID | null {
  let id: ID | null = null;
  mutate((db) => {
    const sub = db.subcontractors.find((x) => x.id === subcontractorId);
    const p = db.projects.find((x) => x.id === f.projectId);
    if (!sub || !p || !f.invoiceNo.trim() || !(f.net > 0)) return;
    const subtotal = r2(f.net);
    const vat = r2((subtotal * f.vatPct) / 100);
    const description = f.description.trim() || `Work at ${p.name}`;
    id = newId("si");
    db.supplierInvoices.unshift({
      id,
      supplier: sub.name,
      invoiceNo: f.invoiceNo.trim(),
      invoiceDate: f.invoiceDate,
      docType: "invoice",
      subtotal,
      vat,
      total: r2(subtotal + vat),
      jobRef: p.code,
      fileName: f.copy?.name ?? `${sub.name} ${f.invoiceNo.trim()}.pdf`,
      receivedAt: nowStamp(),
      readStatus: "needs_review",
      lines: [{ description, amount: subtotal }],
      allocations: [{ id: newId("al"), projectId: p.id, category: "labour", amount: subtotal, description }],
      party: "subcontractor",
      subcontractorId: sub.id,
      via: "portal",
      fileNo: nextFileNo(db.supplierInvoices),
      dueOn: addDays(f.invoiceDate, sub.termsDays),
      askedBy: sub.contactName,
      askedAt: nowStamp(),
      ...(f.copy ? { copy: f.copy } : {}),
    });
    log(db, "Sent an invoice through the portal", `${sub.name} ${f.invoiceNo.trim()}, ${p.code} ${p.name}`, "portal", sub.contactName);
  });
  return id;
}

/** Change what accounts may approve on a supplier's invoice, before VAT. Above it the managing director approves. */
export function setApprovalLimit(amount: number) {
  mutate((db) => {
    const row = db.approvalLimits.find((x) => x.id === "supplier");
    const to = Math.max(0, Math.round(amount));
    if (!row || row.amount === to) return;
    row.amount = to;
    log(db, "Changed what accounts may approve", `Supplier invoices up to ${to} before VAT`, "invoicing");
  });
}

// ── Client invoices ───────────────────────────────────────────────────────────

/** A line in an invoice's own history: who did what, when. */
function note(db: Db, i: SalesInvoice, what: string, who = actorName(db)) {
  (i.history ??= []).push({ at: nowStamp(), who, what });
}

/** What going out does to an invoice: a date, a due date on the client's payment terms, and the next accounts number. */
function issue(db: Db, i: SalesInvoice) {
  i.status = "Invoiced";
  i.issuedOn = getDay();
  i.dueOn = addDays(getDay(), db.clients.find((c) => c.id === i.clientId)?.termsDays ?? 30);
  i.accountsNo = nextAccountsNo(db.salesInvoices);
  const p = db.projects.find((x) => x.id === i.projectId);
  if (p && p.status === "Complete" && i.description === "Final account") p.status = "Invoiced";
  audit(db, i.projectId, invoicedLine(invoiceNo(i), i.description));
  fileInvoice(db, i.projectId, salesInvoiceFile(invoiceNo(i), i.description), getDay(), actorName(db), "Upload");
  return p;
}

/** A copy of an email about an invoice, filed under Sent from the accounts mailbox, where the invoice's own page shows it. */
function fileInvoiceMail(db: Db, i: SalesInvoice, m: { toName: string; to: string; subject: string; body: string; attachment?: string }) {
  const mailbox = `accounts@${usePrefs.getState().brand.emailDomain}`;
  const { role, operativeId, asPersonId } = usePrefs.getState();
  db.mails.unshift({ id: newId("mail"), mailbox, folder: "Sent", fromName: actorName(db), fromAddress: mailbox, subject: m.subject, to: `${m.toName} <${m.to}>`, body: `${m.body}`, receivedAt: nowStamp(), read: true, intent: "General", routedToId: signedInPersonId(role, asPersonId, operativeId, db.people) ?? "p-md", clientId: i.clientId, attachment: m.attachment, salesInvoiceId: i.id });
}

/** Mark a draft as sent without emailing it from here: it went by post or by hand. */
export function issueInvoice(id: ID) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "To invoice") return;
    const p = issue(db, i);
    i.sentAt = nowStamp();
    i.sentVia = ["post"];
    note(db, i, "Marked as sent, by post or by hand");
    log(db, "Issued a sales invoice", `${invoiceNo(i)} ${p?.code ?? ""}, ${i.description}`, "invoicing");
  });
}

/**
 * Send an invoice to the client: by email with the PDF attached, in their portal, or both. A
 * draft is issued on the way; one already out is sent again. In the demo nothing leaves the
 * browser: the email is filed under Sent, and a real build sends it here.
 */
export function sendInvoice(id: ID, how: { email: boolean; portal: boolean; to: string; subject: string; body: string; attachment: string }) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || (i.status !== "To invoice" && i.status !== "Invoiced") || (!how.email && !how.portal)) return;
    const again = i.status === "Invoiced";
    const p = again ? db.projects.find((x) => x.id === i.projectId) : issue(db, i);
    const c = db.clients.find((x) => x.id === i.clientId);
    const via: SendRoute[] = [...(how.email ? (["email"] as const) : []), ...(how.portal ? (["portal"] as const) : [])];
    i.sentAt = nowStamp();
    if (how.email) i.sentTo = how.to;
    i.sentVia = [...new Set([...(again ? (i.sentVia ?? []) : []), ...via])];
    if (how.email) fileInvoiceMail(db, i, { toName: c?.contactName ?? "", to: how.to, subject: how.subject, body: how.body, attachment: how.attachment });
    note(db, i, `${again ? "Sent again" : "Sent"} to ${c?.name ?? "the client"} ${routeWords(via)}`);
    log(db, again ? "Sent an invoice again" : "Sent an invoice to the client", `${invoiceNo(i)} ${p?.code ?? ""}, ${i.description}`, "invoicing");
  });
}

/** Draft an invoice by hand against a project. Nothing goes to the client until someone sends it. */
export function draftInvoice(d: { projectId: ID; description: string; lines: Omit<InvoiceLine, "id">[]; vatPct: number; poNumber?: string; notes?: string }): string {
  let ref = "";
  mutate((db) => {
    const p = db.projects.find((x) => x.id === d.projectId);
    if (!p) return;
    ref = `INV-${nextNumber(db.salesInvoices.map((i) => i.ref), "INV-")}`;
    const lines = d.lines.map((l) => ({ ...l, id: newId("il") }));
    db.salesInvoices.unshift({ id: newId("inv"), ref, projectId: p.id, clientId: p.clientId, description: d.description, net: linesNet(lines), vatPct: d.vatPct, status: "To invoice", lines, manual: true, poNumber: d.poNumber || undefined, notes: d.notes || undefined, history: [{ at: nowStamp(), who: actorName(db), what: "Drafted by hand" }] });
    // A final account still to go out bills whatever is left, so it comes down by this much.
    refreshFinalAccount(db, p);
    log(db, "Drafted an invoice", `${ref} ${p.code}, ${d.description}`, "invoicing");
  });
  return ref;
}

/**
 * Change a draft before it goes. One drafted by hand can have its lines changed. One raised from
 * a stage or a finished job follows the contract, so only what is printed around the figure
 * (the order number, the notes) can change.
 */
export function saveDraftInvoice(id: ID, d: { description?: string; lines?: Omit<InvoiceLine, "id">[]; vatPct?: number; poNumber?: string; notes?: string }) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || (i.status !== "To invoice" && i.status !== "Held")) return;
    if (d.poNumber !== undefined) i.poNumber = d.poNumber || undefined;
    if (d.notes !== undefined) i.notes = d.notes || undefined;
    if (i.manual) {
      if (d.description) i.description = d.description;
      if (d.vatPct != null) i.vatPct = d.vatPct;
      if (d.lines) {
        i.lines = d.lines.map((l) => ({ ...l, id: newId("il") }));
        i.net = linesNet(i.lines);
      }
      const p = db.projects.find((x) => x.id === i.projectId);
      if (p) refreshFinalAccount(db, p);
    }
    note(db, i, "Draft changed");
    log(db, "Changed a draft invoice", invoiceNo(i), "invoicing");
  });
}

/** Throw away a draft that was made by hand. One raised from the job itself cannot be deleted, only held. */
export function deleteDraftInvoice(id: ID) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || !i.manual || i.status !== "To invoice") return;
    db.salesInvoices = db.salesInvoices.filter((x) => x.id !== id);
    const p = db.projects.find((x) => x.id === i.projectId);
    if (p) refreshFinalAccount(db, p);
    log(db, "Deleted a draft invoice", `${i.ref} ${p?.code ?? ""}`, "invoicing");
  });
}

export function markInvoicePaid(id: ID, opts: { paidOn?: string; email?: boolean } = {}) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "Invoiced") return;
    i.status = "Paid";
    i.paidOn = opts.paidOn && opts.paidOn <= getDay() ? opts.paidOn : getDay();
    // Once the final account and everything else billed on the job is paid, the job is closed.
    const p = db.projects.find((x) => x.id === i.projectId);
    const all = db.salesInvoices.filter((x) => x.projectId === i.projectId);
    const closing = !!p && p.status === "Invoiced" && all.some((x) => x.description === "Final account") && all.every((x) => x.status === "Paid");
    if (p && closing) p.status = "Closed";
    audit(db, i.projectId, paidLine(invoiceNo(i), closing));
    // The client's portal shows it as paid from now on. With `email` they also get a receipt.
    const c = db.clients.find((x) => x.id === i.clientId);
    const to = billingEmail(c);
    if (opts.email && c && to) {
      const { brand } = usePrefs.getState();
      const email = receiptEmail({ number: invoiceNo(i), gross: grossOf(i), paidOn: i.paidOn, contactName: c.contactName, project: p ? `${p.code} ${p.name}` : "", sender: actorName(db), company: brand.legalName, region: brand.region });
      fileInvoiceMail(db, i, { toName: c.contactName, to, subject: email.subject, body: email.body });
      note(db, i, `Marked paid. Receipt emailed to ${to}`);
    } else note(db, i, "Marked paid");
    log(db, "Marked a sales invoice paid", invoiceNo(i), "invoicing");
  });
}

/** Take back a "paid" marked by mistake: the invoice is owed again, and a job that this payment closed is open again. */
export function unmarkInvoicePaid(id: ID) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "Paid") return;
    i.status = "Invoiced";
    delete i.paidOn;
    const p = db.projects.find((x) => x.id === i.projectId);
    if (p && p.status === "Closed") p.status = "Invoiced";
    audit(db, i.projectId, `${invoiceNo(i)} is unpaid again: it was marked paid by mistake`);
    note(db, i, "Paid taken back: it was marked by mistake");
    log(db, "Took back a payment marked by mistake", invoiceNo(i), "invoicing");
  });
}

/** Record that these invoices went to the accounts package. The file itself is built by src/lib/accounts-export.ts. */
export function markExported(ids: ID[], packageName: string) {
  mutate((db) => {
    for (const i of db.salesInvoices) {
      if (!ids.includes(i.id)) continue;
      i.exportedAt = nowStamp();
      note(db, i, `Exported to ${packageName}`);
    }
    log(db, "Exported sales invoices to accounts", `${ids.length} to ${packageName}`, "invoicing");
  });
}

/** A note on an invoice for the office only. The client never sees it. */
export function addInvoiceComment(id: ID, text: string) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || !text.trim()) return;
    db.invoiceComments.push({ id: newId("ic"), salesInvoiceId: id, at: nowStamp(), who: actorName(db), text: text.trim() });
    log(db, "Commented on an invoice", invoiceNo(i), "invoicing");
  });
}

/** Write to the client about an invoice, from the invoice's own page. Filed under Sent like any other email. */
export function emailAboutInvoice(id: ID, m: { to: string; subject: string; body: string }) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || !m.body.trim()) return;
    fileInvoiceMail(db, i, { toName: db.clients.find((c) => c.id === i.clientId)?.contactName ?? "", ...m });
    note(db, i, `Emailed the client: ${m.subject}`);
    log(db, "Emailed a client about an invoice", `${invoiceNo(i)}: ${m.subject}`, "invoicing");
  });
}

/** A client questions an invoice, in the portal, or the office logs a call or an email. Chasing waits until it is settled. */
export function raiseInvoiceQuery(id: ID, q: { via: InvoiceQuery["via"]; raisedBy: string; text: string }) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || !q.text.trim() || db.invoiceQueries.some((x) => x.salesInvoiceId === id && x.status === "Open")) return;
    db.invoiceQueries.unshift({ id: newId("iq"), salesInvoiceId: id, raisedAt: nowStamp(), via: q.via, raisedBy: q.raisedBy, text: q.text.trim(), status: "Open", replies: [] });
    note(db, i, q.via === "Portal" ? "Query raised in the portal" : `Query raised by ${q.via.toLowerCase()}`, q.raisedBy);
    log(db, "Raised a query on an invoice", invoiceNo(i), q.via === "Portal" ? "portal" : "invoicing", q.via === "Portal" ? q.raisedBy : actorName(db));
  });
}

/** Answer a client's query. They see the reply in their portal. */
export function replyToInvoiceQuery(queryId: ID, text: string) {
  mutate((db) => {
    const q = db.invoiceQueries.find((x) => x.id === queryId);
    const i = db.salesInvoices.find((x) => x.id === q?.salesInvoiceId);
    if (!q || !i || q.status !== "Open" || !text.trim()) return;
    q.replies.push({ at: nowStamp(), who: actorName(db), text: text.trim() });
    note(db, i, "Replied to the client's query");
    log(db, "Replied to an invoice query", invoiceNo(i), "invoicing");
  });
}

/** Close a query with what was agreed. The invoice can be chased again. */
export function settleInvoiceQuery(queryId: ID, outcome: string) {
  mutate((db) => {
    const q = db.invoiceQueries.find((x) => x.id === queryId);
    const i = db.salesInvoices.find((x) => x.id === q?.salesInvoiceId);
    if (!q || !i || q.status !== "Open" || !outcome.trim()) return;
    q.status = "Settled";
    q.outcome = outcome.trim();
    q.settledBy = actorName(db);
    q.settledAt = nowStamp();
    note(db, i, `Query settled: ${q.outcome.charAt(0).toLowerCase()}${q.outcome.slice(1)}`);
    log(db, "Settled an invoice query", invoiceNo(i), "invoicing");
  });
}

/** The client says in the portal that they have paid. It stays unpaid until accounts match it against the bank. */
export function clientSaysPaid(id: ID, who: string) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "Invoiced" || i.clientPaidOn) return;
    i.clientPaidOn = getDay();
    note(db, i, "Client says in the portal that it is paid", who);
    log(db, "Said an invoice has been paid", invoiceNo(i), "portal", who);
  });
}

// ── Site phone: driving check and leave ──────────────────────────────────────

/** A driver's walkaround check. Defects are logged for the yard; the office sees it in the activity log. */
export function submitVehicleCheck(vehicleId: ID, defects: { item: string; note: string }[]) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === vehicleId);
    const by = myId(db) ?? "";
    db.vehicleChecks.unshift({ id: newId("vc"), vehicleId, personId: by, at: nowStamp(), defects });
    log(db, defects.length ? "Reported vehicle defects" : "Completed a vehicle check", `${v?.reg}${defects.length ? `: ${defects.map((d) => `${d.item} (${d.note})`).join("; ")}` : ", all OK"}`, "fleet");
  });
}

/** Leave asked for from the site phone: it waits under Schedule, Holiday requests and Admin, Requests. */
export function requestLeave(personId: ID, from: string, to: string, note: string) {
  mutate((db) => {
    db.holidays.unshift({ id: newId("hol"), personId, from, to, status: "Requested", via: "Form", note: note.trim() || "Asked from the site phone" });
    log(db, "Asked for leave", `${db.people.find((p) => p.id === personId)?.name}, ${from} to ${to}`, "people");
  });
}

/** A reimbursement claimed from the site phone. It waits for the director in Admin, Requests. */
export function claimExpense(x: Omit<Expense, "id" | "createdAt" | "status" | "personId"> & { personId: ID }) {
  mutate((db) => {
    db.expenses.unshift({ ...x, id: newId("ex"), createdAt: nowStamp(), status: "Waiting" });
    log(db, "Claimed a reimbursement", `${db.people.find((p) => p.id === x.personId)?.name}, ${x.kind}, ${x.amount.toFixed(2)}`, "people");
  });
}

export function decideExpense(id: ID, approve: boolean, note?: string) {
  mutate((db) => {
    const x = db.expenses.find((e) => e.id === id);
    if (!x || x.status !== "Waiting") return;
    x.status = approve ? "Approved" : "Declined";
    x.decidedBy = actorName(db);
    x.decidedAt = nowStamp();
    if (!approve && cleanNote(note)) x.declineNote = cleanNote(note);
    log(db, approve ? "Approved a reimbursement" : "Declined a reimbursement", withNote(`${db.people.find((p) => p.id === x.personId)?.name}, ${x.amount.toFixed(2)}`, approve ? undefined : note), "admin");
  });
}

// ── Payroll ───────────────────────────────────────────────────────────────────

/** Record the employee number Sage Payroll gave someone, so their hours match up. Blank clears it. */
export function setSageNo(personId: ID, sageNo: string) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p) return;
    const v = sageNo.trim();
    if (v) p.sageNo = v;
    else delete p.sageNo;
    log(db, "Set a Sage employee number", `${p.name}, ${v || "cleared"}`, "people");
  });
}

/** A week of hours sent to Sage Payroll. Hours only: rates, tax and deductions are Sage's. */
export function recordPayrollExport(weekStart: string, personIds: ID[]) {
  mutate((db) => {
    const end = weekEnd(weekStart);
    const rows = db.attendance.filter((a) => personIds.includes(a.personId) && a.date >= weekStart && a.date <= end);
    const hours = rows.reduce((n, a) => n + basicHours(a.date, a.status) + overtimeTotal(a), 0);
    db.payrollExports.unshift({ id: newId("pay"), weekStart, at: nowStamp(), by: actorName(db), people: personIds.length, hours });
    log(db, "Exported hours to Sage Payroll", `Week ending ${end}, ${personIds.length} people, ${hours} hours`, "people");
  });
}

/**
 * A manager's check of a week's hours (the call of 17 Nov): site managers send the days, a
 * manager looks them over and marks the week checked, and only then can the office export
 * the file to Sage Payroll. A correction made after the check means it is checked again.
 */
export function checkPayrollWeek(weekStart: string) {
  mutate((db) => {
    db.payrollChecks.unshift({ id: newId("chk"), weekStart, at: nowStamp(), by: actorName(db) });
    log(db, "Checked a week's hours for payroll", `Week ending ${weekEnd(weekStart)}`, "people");
  });
}

/**
 * Approved reimbursements exported for the office to pay (the call of 17 Nov). Each is stamped,
 * so it is never sent twice, and the person who claimed sees it has gone for payment.
 */
export function exportExpenses(ids: ID[]) {
  mutate((db) => {
    const at = nowStamp();
    const rows = db.expenses.filter((x) => ids.includes(x.id) && x.status === "Approved" && !x.exportedAt);
    if (!rows.length) return;
    for (const x of rows) {
      x.exportedAt = at;
      x.exportedBy = actorName(db);
    }
    log(db, "Exported reimbursements for payment", `${rows.length} ${rows.length === 1 ? "claim" : "claims"}, ${rows.reduce((n, x) => n + x.amount, 0).toFixed(2)}`, "people");
  });
}

// ── Inbox ─────────────────────────────────────────────────────────────────────

export function setMailRead(id: ID, read: boolean) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (m) m.read = read;
  });
}

/** Change the tag the reader gave an email. */
export function tagMail(id: ID, intent: MailIntent) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (!m || m.intent === intent) return;
    m.intent = intent;
    log(db, "Changed an email's tag", `${m.subject}: ${intent}`, "inbox");
  });
}

/** Pass an email to someone else. */
export function routeMail(id: ID, personId: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (!m || m.routedToId === personId) return;
    m.routedToId = personId;
    log(db, "Passed an email on", `${m.subject}: to ${db.people.find((p) => p.id === personId)?.name}`, "inbox");
  });
}

/**
 * Put an email under a label: it takes the label and leaves the Inbox, as in Gmail (Oisin,
 * 17 Nov). It keeps whether it has been read. To change a label and leave the email where it is,
 * use `tagMail`.
 */
export function fileMail(id: ID, label: MailIntent) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (!m || m.folder === "Sent" || m.folder === "Drafts") return;
    const to = filedFolder(m.folder);
    if (m.intent === label && m.folder === to) return;
    m.intent = label;
    m.folder = to;
    log(db, "Filed an email under a label", `${m.subject}: ${label}`, "inbox");
  });
}

export function moveMail(id: ID, folder: "Inbox" | "Archive") {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    // A draft of a new email is neither archived nor moved: it is sent or discarded.
    if (!m || m.folder === folder || m.folder === "Drafts") return;
    m.folder = folder;
    m.read = true;
    log(db, folder === "Archive" ? "Archived an email" : "Moved an email back to the inbox", m.subject, "inbox");
  });
}

/**
 * Sending a drafted reply, whether from Approvals or from the Inbox (one way, 16 Nov): a copy
 * goes in Sent from the shared mailbox, the draft is used up so it cannot go twice, and the
 * email is archived. In the demo nothing leaves the browser; a real build sends it here.
 */
function fileReply(db: Db, m: Mail, who: string) {
  if (!m.replyDraft) return;
  db.mails.unshift({ ...m, id: newId("mail"), folder: "Sent", subject: m.replyDraft.subject, body: m.replyDraft.body, fromName: who, fromAddress: m.mailbox, to: m.fromName, receivedAt: nowStamp(), read: true, starred: false, replyDraft: undefined, attachment: undefined });
  m.replyDraft = undefined;
  m.folder = "Archive";
  m.read = true;
}

/** Send the drafted reply as it now reads. The original is archived and any approval waiting on it is closed. */
export function sendReply(mailId: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === mailId);
    if (!m?.replyDraft) return;
    const who = actorName(db);
    fileReply(db, m, who);
    for (const a of db.approvals) {
      if (a.kind === "reply" && a.mailId === mailId && a.status === "Pending") {
        a.status = "Approved";
        a.resolvedBy = who;
        a.resolvedAt = nowStamp();
      }
    }
    log(db, "Sent a reply", m.subject, "inbox", who);
  });
}

export function discardReplyDraft(mailId: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === mailId);
    if (!m?.replyDraft) return;
    m.replyDraft = undefined;
    for (const a of db.approvals) {
      if (a.kind === "reply" && a.mailId === mailId && a.status === "Pending") {
        a.status = "Discarded";
        a.resolvedBy = actorName(db);
        a.resolvedAt = nowStamp();
      }
    }
    log(db, "Discarded a drafted reply", m.subject, "inbox");
  });
}


// ── Compliance (18 Nov) ───────────────────────────────────────────────────────

/** A photo of a new card, sent by an operative from the site phone. The office checks it in Compliance. */
export function sendTicketPhoto(personId: ID, certId: ID, photo: { name: string; dataUrl: string }) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    const c = p?.certs.find((x) => x.id === certId);
    if (!p || !c) return;
    c.sentPhoto = { ...photo, sentAt: nowStamp() };
    log(db, "Sent a photo of a new ticket from the site phone", `${p.name}, ${c.name}`, "compliance", p.name);
  });
}

/** The office's answer to a card sent from the phone: take it as the renewal (with its new expiry) or turn it down. */
export function checkTicketPhoto(personId: ID, certId: ID, accept: { expires: string } | null) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    const c = p?.certs.find((x) => x.id === certId);
    if (!p || !c?.sentPhoto) return;
    if (accept) {
      closeTodos(db, `cert:${certId}`);
      c.issued = getDay();
      c.expires = accept.expires;
      Object.assign(c, stampProof(db, { name: c.sentPhoto.name, dataUrl: c.sentPhoto.dataUrl }));
      log(db, "Accepted a new ticket sent from the phone", `${p.name}, ${c.name}, to ${accept.expires}`, "compliance");
    } else log(db, "Turned down a ticket photo sent from the phone", `${p.name}, ${c.name}`, "compliance");
    delete c.sentPhoto;
  });
}

/**
 * The office's yearly look at a driver's licence (Compliance). The licence and the Driver CPC
 * themselves, with their dates and copies, are recorded in Fleet (`setDriverLicence`).
 */
export function checkLicence(personId: ID, note = "") {
  mutate((db) => {
    const p = db.people.find((x) => x.id === personId);
    if (!p) return;
    p.licenceCheck = { checkedOn: getDay(), checkedBy: actorName(db) };
    closeTodos(db, `lic:${p.id}`);
    log(db, "Checked a driving licence", `${p.name}${note.trim() ? `: ${note.trim()}` : ""}`, "compliance");
  });
}

/** A vehicle's service: resets the clock by date and by the mileage now. */
export function recordVehicleService(id: ID, note: string) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    closeTodos(db, `vsvc:${id}`);
    v.service.lastServiced = getDay();
    if (v.service.basis !== "months") v.service.lastMeter = v.service.meterNow;
    log(db, "Recorded a vehicle service", `${v.reg}${note.trim() ? `: ${note.trim()}` : ""}`, "compliance");
  });
}

export function addCourse(c: Omit<Course, "id" | "bookedIds" | "doneAt" | "doneBy">) {
  let id = "";
  mutate((db) => {
    id = newId("crs");
    db.courses.push({ ...c, id, provider: c.provider.trim(), venue: c.venue.trim(), bookedIds: [] });
    log(db, "Added a training course", `${c.ticket}, ${c.date}`, "compliance");
  });
  return id;
}

/** Book someone on a course, if it has a place and they are not on it already. */
export function bookOnCourse(courseId: ID, personId: ID) {
  let ok = false;
  mutate((db) => {
    const c = db.courses.find((x) => x.id === courseId);
    const p = db.people.find((x) => x.id === personId);
    if (!c || !p || c.doneAt || c.bookedIds.includes(personId) || c.bookedIds.length >= c.places) return;
    c.bookedIds.push(personId);
    ok = true;
    log(db, "Booked someone on a course", `${p.name}, ${c.ticket} on ${c.date}`, "compliance");
  });
  return ok;
}

export function unbookFromCourse(courseId: ID, personId: ID) {
  mutate((db) => {
    const c = db.courses.find((x) => x.id === courseId);
    if (!c || c.doneAt || !c.bookedIds.includes(personId)) return;
    c.bookedIds = c.bookedIds.filter((x) => x !== personId);
    log(db, "Took someone off a course", `${db.people.find((p) => p.id === personId)?.name}, ${c.ticket}`, "compliance");
  });
}

/**
 * The course has happened: everyone booked gets the ticket from the course's day (renewed, or
 * new), marked "Proof needed" until their certificate comes in.
 */
export function markCourseDone(courseId: ID) {
  let n = 0;
  mutate((db) => {
    const c = db.courses.find((x) => x.id === courseId);
    if (!c || c.doneAt) return;
    const expires = renewedTo(c.ticket, c.date);
    for (const id of c.bookedIds) {
      const p = db.people.find((x) => x.id === id);
      if (!p) continue;
      closeTodos(db, `need:${p.id}:${c.ticket}`);
      const had = p.certs.find((x) => x.name === c.ticket);
      if (had) closeTodos(db, `cert:${had.id}`);
      const cert = p.certs.find((x) => x.name === c.ticket);
      if (cert) Object.assign(cert, { issued: c.date, expires, proof: undefined, proofNeeded: true });
      else p.certs.push({ id: newId("cert"), name: c.ticket, issued: c.date, expires, proofNeeded: true });
      n++;
    }
    c.doneAt = nowStamp();
    c.doneBy = actorName(db);
    log(db, "Marked a course done", `${c.ticket}, ${n} ${n === 1 ? "person" : "people"} renewed to ${expires}`, "compliance");
  });
  return n;
}

export function renewCompanyPaper(id: ID, x: { expires: string; reference: string; cover?: string }, proof: NewProof) {
  mutate((db) => {
    const c = db.companyPapers.find((y) => y.id === id);
    if (!c) return;
    closeTodos(db, `co:${id}`);
    Object.assign(c, { expires: x.expires, reference: x.reference.trim() || c.reference, ...(x.cover?.trim() ? { cover: x.cover.trim() } : {}) }, stampProof(db, proof));
    log(db, "Renewed a company paper", `${c.name}, to ${x.expires}`, "compliance");
  });
}

/**
 * A subcontractor's paper: a new insurance schedule, a reviewed safety statement or a method
 * statement for a site. The old one is kept; the newest counts. Sent through their portal, or
 * recorded by the office from an email.
 */
export function recordSubPaper(subId: ID, x: Pick<SubPaper, "kind" | "projectId" | "expires" | "reference" | "cover">, via: SubPaper["via"], proof: NewProof) {
  mutate((db) => {
    const s = db.subcontractors.find((y) => y.id === subId);
    if (!s) return;
    closeTodos(db, x.kind === "Method statement" ? `rams:${subId}:${x.projectId}` : `sp:${subId}:${x.kind}`);
    s.papers.push({ id: newId("spp"), kind: x.kind, ...(x.projectId ? { projectId: x.projectId } : {}), ...(x.expires ? { expires: x.expires } : {}), ...(x.reference?.trim() ? { reference: x.reference.trim() } : {}), ...(x.cover?.trim() ? { cover: x.cover.trim() } : {}), receivedOn: getDay(), via, ...stampProof(db, proof) });
    const site = x.projectId ? ` for ${db.projects.find((p) => p.id === x.projectId)?.code}` : "";
    log(db, via === "Portal" ? "A subcontractor sent a paper through the portal" : "Recorded a subcontractor's paper", `${s.name}: ${x.kind}${site}`, "compliance", via === "Portal" ? s.contactName : actorName(db));
  });
}

/** One of a subcontractor's people: a renewed Safe Pass, or someone new on our sites. */
export function recordSubWorker(subId: ID, workerId: ID | null, name: string, expires: string, proof: NewProof, via: SubPaper["via"] = "Email") {
  mutate((db) => {
    const s = db.subcontractors.find((y) => y.id === subId);
    if (!s) return;
    const w = workerId ? s.workers.find((y) => y.id === workerId) : undefined;
    if (w) closeTodos(db, `sw:${subId}:${w.id}`);
    if (w) Object.assign(w, { safePassExpires: expires }, stampProof(db, proof));
    else s.workers.push({ id: newId("sw"), name: name.trim(), safePassExpires: expires, ...stampProof(db, proof) });
    log(db, w ? "Recorded a subcontractor's renewed Safe Pass" : "Added a subcontractor's worker", `${s.name}: ${w?.name ?? name.trim()}`, "compliance", via === "Portal" ? s.contactName : actorName(db));
  });
}

export function addScaffold(projectId: ID, x: Pick<Scaffold, "kind" | "description" | "erectedBy" | "erectedOn" | "plantId">) {
  let id = "";
  mutate((db) => {
    const p = db.projects.find((y) => y.id === projectId);
    if (!p) return;
    const prefix = x.kind === "Tower" ? "T" : "S";
    const n = db.scaffolds.filter((y) => y.projectId === projectId && y.ref.startsWith(prefix)).length + 1;
    id = newId("scf");
    db.scaffolds.push({ id, projectId, ref: `${prefix}${n}`, kind: x.kind, description: x.description.trim(), erectedBy: x.erectedBy.trim(), erectedOn: x.erectedOn, ...(x.plantId ? { plantId: x.plantId } : {}), inspections: [] });
    audit(db, projectId, `${x.kind} put up: ${x.description.trim()}`);
    log(db, "Added a scaffold to the register", `${p.code} ${prefix}${n}, ${x.description.trim()}`, "compliance");
  });
  return id;
}

/** Star or unstar an email. Not logged: it is the reader's own marker. */
export function toggleStar(id: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (m) m.starred = !m.starred;
  });
}

/** Star an email, for dropping it on Starred. */
export function setStar(id: ID, on: boolean) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (m) m.starred = on;
  });
}

/** Start a reply to an email that has no drafted one, or after the draft was discarded. */
export function startReply(id: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    if (!m || m.replyDraft || m.folder === "Sent") return;
    m.replyDraft = { subject: /^re:/i.test(m.subject) ? m.subject : `RE: ${m.subject}`, body: `Dear ${m.fromName.split(" ")[0]},\n\n\n\nKind regards,\n${actorName(db)}` };
  });
}

/** Send a new email from the shared address. In the demo it is filed under Sent; a real build sends it here. */
type NewMail = { to: string; cc?: string; bcc?: string; subject: string; body: string; attachments?: MailAttachment[] };

/**
 * Keep a new email as a draft (Oisin, 17 Nov: "save drafts for emails", as Gmail does): it goes
 * in the Drafts folder and opens back into Compose. Saving it again replaces what was kept.
 * Returns the draft's id.
 */
export function saveDraft(draft: NewMail, id?: ID): ID {
  let out = id ?? "";
  mutate((db) => {
    const who = actorName(db);
    const domain = db.mails[0]?.mailbox.split("@")[1] ?? "abcconstruction.example";
    const files = (draft.attachments ?? []).slice(0, MAX_ATTACHMENTS);
    const fields = { to: draft.to.trim(), subject: draft.subject.trim(), body: draft.body, receivedAt: nowStamp() };
    const existing = db.mails.find((m) => m.id === id && m.folder === "Drafts");
    const m: Mail = existing ?? { id: newId("mail"), mailbox: `info@${domain}`, folder: "Drafts", fromName: who, fromAddress: `info@${domain}`, ...fields, read: true, intent: "General", routedToId: myId(db) ?? "p-md" };
    Object.assign(m, fields);
    if (draft.cc?.trim()) m.cc = draft.cc.trim();
    else delete m.cc;
    if (draft.bcc?.trim()) m.bcc = draft.bcc.trim();
    else delete m.bcc;
    if (files.length) {
      m.attachments = files;
      m.attachment = files[0]!.name;
    } else {
      delete m.attachments;
      delete m.attachment;
    }
    if (!existing) {
      db.mails.unshift(m);
      log(db, "Saved an email as a draft", `${m.subject || "(no subject)"}${m.to ? `: to ${m.to}` : ""}`, "inbox", who);
    }
    out = m.id;
  });
  return out;
}

/** Throw away a draft of a new email. */
export function discardDraft(id: ID) {
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id && x.folder === "Drafts");
    if (!m) return;
    db.mails = db.mails.filter((x) => x.id !== id);
    log(db, "Discarded a draft email", m.subject || "(no subject)", "inbox");
  });
}

/** Send a new email. If it was being kept as a draft, the draft is used up so it cannot go twice. */
export function composeMail(draft: NewMail, draftId?: ID) {
  let id = "";
  mutate((db) => {
    if (draftId) db.mails = db.mails.filter((x) => !(x.id === draftId && x.folder === "Drafts"));
    const who = actorName(db);
    const domain = db.mails[0]?.mailbox.split("@")[1] ?? "abcconstruction.example";
    const files = (draft.attachments ?? []).slice(0, MAX_ATTACHMENTS);
    id = newId("mail");
    db.mails.unshift({ id, mailbox: `info@${domain}`, folder: "Sent", fromName: who, fromAddress: `info@${domain}`, to: draft.to.trim(), ...(draft.cc?.trim() ? { cc: draft.cc.trim() } : {}), ...(draft.bcc?.trim() ? { bcc: draft.bcc.trim() } : {}), subject: draft.subject.trim() || "(no subject)", body: draft.body, receivedAt: nowStamp(), read: true, intent: "General", routedToId: myId(db) ?? "p-md", ...(files.length ? { attachments: files, attachment: files[0]!.name } : {}) });
    log(db, "Sent an email", `${draft.subject.trim() || "(no subject)"}: to ${draft.to.trim()}${files.length ? `, with ${files.length === 1 ? files[0]!.name : `${files.length} files`}` : ""}`, "inbox", who);
  });
  return id;
}

/** The weekly inspection (or one after a change): who, today, safe or not, and what was seen. */
export function inspectScaffold(id: ID, result: "Safe to use" | "Not safe to use", note: string) {
  mutate((db) => {
    const s = db.scaffolds.find((y) => y.id === id);
    if (!s) return;
    closeTodos(db, `scf:${id}`);
    s.inspections.unshift({ id: newId("si"), date: getDay(), by: actorName(db), result, note: note.trim() || (result === "Safe to use" ? "Inspected. Tag updated." : "Not safe to use. Tagged red.") });
    const p = db.projects.find((y) => y.id === s.projectId);
    audit(db, s.projectId, `${s.ref} inspected: ${result.toLowerCase()}`);
    log(db, "Inspected a scaffold", `${p?.code} ${s.ref}: ${result.toLowerCase()}`, "compliance");
  });
}

/** Taken down: off the register's live list, its inspections kept. */
export function strikeScaffold(id: ID) {
  mutate((db) => {
    const s = db.scaffolds.find((y) => y.id === id);
    if (!s || s.struckOn) return;
    s.struckOn = getDay();
    audit(db, s.projectId, `${s.ref} taken down: ${s.description}`);
    log(db, "Took a scaffold off the register", `${db.projects.find((p) => p.id === s.projectId)?.code} ${s.ref}`, "compliance");
  });
}
/**
 * "Discuss in Team chat": posts a line about the email in the channel it belongs to (the site's
 * channel when the client has a live project with one, otherwise Office) and returns that channel.
 */
export function shareMailToChat(id: ID): ID | null {
  let out: ID | null = null;
  mutate((db) => {
    const m = db.mails.find((x) => x.id === id);
    const me = myId(db);
    if (!m || !me) return;
    const project = db.projects.find((p) => p.clientId === m.clientId && p.status === "Live" && db.chatChannels.some((c) => c.projectId === p.id));
    const ch = db.chatChannels.find((c) => c.projectId === project?.id) ?? db.chatChannels.find((c) => c.id === "ch-office");
    if (!ch) return;
    const stamp = chatStamp(db, ch.id);
    db.chatMessages.push({ id: newId("cm"), channelId: ch.id, authorId: me, at: stamp, text: `Email from ${m.fromName}: "${m.subject}". Can we talk about this one?` });
    ch.lastRead[me] = stamp;
    if (!ch.memberIds.includes(me)) ch.memberIds.push(me);
    log(db, "Shared an email in Team chat", `${m.subject}: in ${ch.name}`, "inbox");
    out = ch.id;
  });
  return out;
}

// ── Team chat ─────────────────────────────────────────────────────────────────

/**
 * The time for a new chat message: now, but never before the last message in that
 * conversation. The demo's day is fixed while the clock runs on, so late at night "now" can fall
 * before this morning's sample messages, and a message just sent must still come last.
 */
function chatStamp(db: Db, channelId: ID): string {
  const now = nowStamp();
  const last = db.chatMessages.filter((m) => m.channelId === channelId).map((m) => m.at).sort().pop();
  if (!last || now > last) return now;
  const t = new Date(`${last}Z`);
  t.setUTCSeconds(t.getUTCSeconds() + 60);
  return t.toISOString().slice(0, 19);
}

/** The signed-in person's id, for things they post themselves. */
function myId(db: Db): ID | null {
  if (actingAs) return actingAs;
  const { role, operativeId, asPersonId } = usePrefs.getState();
  return signedInPersonId(role, asPersonId, operativeId, db.people);
}

/**
 * Post a message in a channel or direct message, as the signed-in person. In the demo nothing
 * leaves the browser; a real build posts it to Teams or Slack here.
 */
export function sendChatMessage(channelId: ID, text: string, attachment?: string) {
  mutate((db) => {
    const ch = db.chatChannels.find((c) => c.id === channelId);
    const me = myId(db);
    const body = text.trim();
    if (!ch || !me || (!body && !attachment)) return;
    const stamp = chatStamp(db, channelId);
    db.chatMessages.push({ id: newId("cm"), channelId, authorId: me, at: stamp, text: body, ...(attachment ? { attachment } : {}) });
    ch.lastRead[me] = stamp;
    if (!ch.memberIds.includes(me)) ch.memberIds.push(me);
    const where = ch.kind === "dm" ? `to ${db.people.find((p) => p.id === ch.memberIds.find((x) => x !== me))?.name ?? "someone"}` : `in ${ch.name}`;
    log(db, "Posted in Team chat", where, "chat");
  });
}

/** Opening a channel marks everything in it as read for the signed-in person. Not logged: it is reading, not a change. */
export function markChannelRead(channelId: ID) {
  mutate((db) => {
    const ch = db.chatChannels.find((c) => c.id === channelId);
    const me = myId(db);
    if (!ch || !me) return;
    const last = db.chatMessages.filter((m) => m.channelId === channelId).map((m) => m.at).sort().pop();
    if (last && (ch.lastRead[me] ?? "") < last) ch.lastRead[me] = last;
  });
}

/** Open a direct message with someone, starting one if the two of them have none yet. */
export function startDirectMessage(personId: ID): ID | null {
  let out: ID | null = null;
  mutate((db) => {
    const me = myId(db);
    if (!me || me === personId) return;
    const found = db.chatChannels.find((c) => c.kind === "dm" && c.memberIds.length === 2 && c.memberIds.includes(me) && c.memberIds.includes(personId));
    if (found) { out = found.id; return; }
    const id = newId("dm");
    db.chatChannels.push({ id, kind: "dm", name: "", purpose: "Direct message", memberIds: [me, personId], lastRead: { [me]: nowStamp() } });
    log(db, "Started a direct message", `with ${db.people.find((p) => p.id === personId)?.name ?? "someone"}`, "chat");
    out = id;
  });
  return out;
}

// ── The main offering (19 Nov) ────────────────────────────────────────────────

/** A repair reported from the phone: anything broken, one of the firm's own or typed. It waits in Admin, Repairs. */
export function reportRepair(r: { personId: ID; item: RepairReport["item"]; where: string; what: string }, photos: FileIn[]): ID {
  const id = newId("rep");
  mutate((db) => {
    const who = db.people.find((p) => p.id === r.personId)?.name ?? actorName(db);
    db.repairs.unshift({ id, personId: r.personId, item: { ...r.item, name: r.item.name.trim().slice(0, 120) }, where: r.where.trim().slice(0, 200), what: r.what.trim().slice(0, 1000), photos: stampAll(db, photos), at: nowStamp(), status: "Reported", steps: [] });
    log(db, "Reported a repair from the phone", `${who}: ${r.item.name}`, "admin", who);
  });
  return id;
}

/** A manager moves a repair on: In hand, then Fixed, each with a note if they want. The person who reported it sees each step. */
export function moveRepair(id: ID, status: RepairStatus, note?: string) {
  mutate((db) => {
    const r = db.repairs.find((x) => x.id === id);
    if (!r || r.status === status) return;
    r.status = status;
    r.steps.push({ status, at: nowStamp(), by: actorName(db), ...(cleanNote(note) ? { note: cleanNote(note) } : {}) });
    // A machine of the firm's own goes off for repair while it is in hand, and comes back when fixed.
    const plant = r.item.kind === "plant" ? db.plant.find((p) => p.id === r.item.refId) : undefined;
    if (plant && status === "In hand" && plant.status !== "Off for repair") plant.status = "Off for repair";
    if (plant && status === "Fixed" && plant.status === "Off for repair") plant.status = plant.projectId ? "On site" : "Available";
    log(db, status === "Fixed" ? "Marked a repair fixed" : "Took a repair in hand", withNote(r.item.name, note), "admin");
  });
}

/** A certificate or licence sent from the phone. It counts for nothing until the office accepts it. */
export function submitCert(s: Omit<CertSubmission, "id" | "sentAt" | "status">) {
  mutate((db) => {
    const p = db.people.find((x) => x.id === s.personId);
    if (!p) return;
    // A second one for the same ticket or licence replaces the first while it is still waiting.
    db.certSubmissions = db.certSubmissions.filter((x) => !(x.status === "Waiting" && x.personId === s.personId && ((s.certId && x.certId === s.certId) || (s.licence && x.licence === s.licence))));
    db.certSubmissions.unshift({ ...s, id: newId("cs"), sentAt: nowStamp(), status: "Waiting" });
    log(db, "Sent a certificate from the phone", `${p.name}, ${s.name}`, "compliance", p.name);
  });
}

/**
 * The office's answer to a certificate from the phone. Accepted, it goes on the record with the
 * date it runs to (corrected if need be) and the photo as its copy; turned down, it is not used,
 * and the person sees why.
 */
export function decideCert(id: ID, accept: { expires: string } | null, note?: string) {
  const db0 = useData.getState().db;
  const s = db0.certSubmissions.find((x) => x.id === id);
  if (!s || s.status !== "Waiting") return;
  const copy = s.photo.dataUrl ? [{ name: s.photo.name, dataUrl: s.photo.dataUrl }] : [];
  if (accept && s.kind === "licence" && s.licence) setDriverLicence(s.personId, s.licence, accept.expires, copy);
  mutate((db) => {
    const x = db.certSubmissions.find((y) => y.id === id);
    const p = db.people.find((y) => y.id === x?.personId);
    if (!x || !p) return;
    x.status = accept ? "Accepted" : "Turned down";
    x.decidedBy = actorName(db);
    x.decidedAt = nowStamp();
    if (cleanNote(note)) x.note = cleanNote(note);
    if (accept && x.kind === "ticket") {
      const proof = copy[0] ? { proof: { ...copy[0], addedBy: actorName(db), addedAt: nowStamp() } } : {};
      const c = p.certs.find((y) => y.id === x.certId) ?? p.certs.find((y) => y.name.toLowerCase() === x.name.toLowerCase());
      if (c) {
        c.issued = getDay();
        c.expires = accept.expires;
        Object.assign(c, proof);
        if (copy[0]) delete c.proofNeeded;
        delete c.sentPhoto;
        closeTodos(db, `cert:${c.id}`);
      } else p.certs.push({ id: newId("cert"), name: x.name, issued: getDay(), expires: accept.expires, ...proof, ...(copy[0] ? {} : { proofNeeded: true }) });
    }
    log(db, accept ? "Accepted a certificate sent from the phone" : "Turned down a certificate sent from the phone", withNote(`${p.name}, ${x.name}${accept ? `, to ${accept.expires}` : ""}`, note), "compliance");
  });
}

/** An approved reimbursement marked paid in Admin, after the confirm box. The phone then shows Paid. */
export function markExpensePaid(id: ID) {
  mutate((db) => {
    const x = db.expenses.find((e) => e.id === id);
    if (!x || x.status !== "Approved" || x.paidAt) return;
    x.paidAt = nowStamp();
    x.paidBy = actorName(db);
    log(db, "Marked a reimbursement paid", `${db.people.find((p) => p.id === x.personId)?.name}, ${x.amount.toFixed(2)}`, "admin");
  });
}

/** Undo Mark paid, for a slip. */
export function undoExpensePaid(id: ID) {
  mutate((db) => {
    const x = db.expenses.find((e) => e.id === id);
    if (!x?.paidAt) return;
    delete x.paidAt;
    delete x.paidBy;
    log(db, "Took back a reimbursement marked paid", `${db.people.find((p) => p.id === x.personId)?.name}, ${x.amount.toFixed(2)}`, "admin");
  });
}

/**
 * A company closure from one day to another (Christmas closedown, say): every working day in it
 * becomes a day the firm is shut, so nobody is planned or marked a normal day on it. Anyone
 * planned on one of those days still to come is taken off. Returns what is wrong, or how many
 * days were added and taken off the plan.
 */
export function addClosure(from: string, to: string, name: string): { error: string } | { days: number; off: number } {
  const db0 = useData.getState().db;
  if (!name.trim()) return { error: "Give the closure a name" };
  if (!from || !to) return { error: "Pick the first and last day" };
  if (to < from) return { error: "The last day is before the first" };
  const days = closureDays(db0.bankHolidays, from, to);
  if (days.length === 0) return { error: "Every working day in that range is already a company holiday" };
  let off = 0;
  mutate((db) => {
    const closure = newId("clo");
    for (const d of days) db.bankHolidays.push({ date: d, name: name.trim(), closure });
    db.bankHolidays.sort((a, b) => a.date.localeCompare(b.date));
    const ahead = new Set(days.filter((d) => d > getDay()));
    off = db.plan.filter((p) => ahead.has(p.date)).length;
    db.plan = db.plan.filter((p) => !ahead.has(p.date));
    log(db, "Added a company closure", `${name.trim()}, ${from} to ${to}, ${days.length} working days${off ? `. ${off} planned days taken off` : ""}`, "admin");
  });
  return { days: days.length, off };
}

export function removeClosure(closure: ID) {
  mutate((db) => {
    const days = db.bankHolidays.filter((h) => h.closure === closure);
    if (!days.length) return;
    db.bankHolidays = db.bankHolidays.filter((h) => h.closure !== closure);
    log(db, "Removed a company closure", `${days[0]!.name}, ${days[0]!.date} to ${days[days.length - 1]!.date}`, "admin");
  });
}

/** Connect the firm's email or WhatsApp (Admin, Connections). In the demo a pretend sign-in: nothing leaves the browser. */
export function connectEmail(provider: "Gmail" | "Outlook", account: string) {
  mutate((db) => {
    db.connections.email = { provider, account: account.trim(), at: nowStamp(), by: actorName(db) };
    log(db, "Connected email", `${provider}, ${account.trim()}`, "admin");
  });
}
export function connectWhatsApp(number: string) {
  mutate((db) => {
    db.connections.whatsapp = { number: number.trim(), at: nowStamp(), by: actorName(db) };
    log(db, "Connected WhatsApp Business", number.trim(), "admin");
  });
}
export function disconnect(which: "email" | "whatsapp") {
  mutate((db) => {
    delete db.connections[which];
    log(db, which === "email" ? "Disconnected email" : "Disconnected WhatsApp", "", "admin");
  });
}

/** The week's roster sent to each person by email and WhatsApp (shown in the demo, filed as sent). */
export function sendRoster(weekStart: string, messages: RosterSend["messages"]) {
  mutate((db) => {
    db.rosterSends.unshift({ id: newId("ros"), weekStart, at: nowStamp(), by: actorName(db), messages });
    const people = new Set(messages.map((m) => m.personId)).size;
    log(db, "Sent the week's roster by email and WhatsApp", `Week of ${weekStart}, ${people} people, ${messages.length} messages`, "schedule");
  });
}
