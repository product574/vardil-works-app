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
import { addDays, isWeekend } from "@/lib/dates";
import { normaliseReg } from "@/lib/fleet";
import { type OvertimeRate, storedRate } from "@/lib/overtime";
import { basicHours } from "@/lib/payroll";
import { needsSignOff } from "@/lib/purchases";
import { personWeek } from "@/lib/availability";
import { dropOutcome } from "@/lib/roster";
import { quoteTotal } from "@/lib/quotes";
import { attendanceShort } from "@/lib/week";
import { levelOf, levelValue, signedInPersonId } from "./access";
import { PERMISSIONS } from "./permissions";
import { ROLES } from "./roles";
import { costingFor, linesFor, type WorkKind } from "./seed/commercial";
import { rng } from "./seed/util";
import { getDay, useData, usePrefs } from "./store";
import type { AccessKey, AccessRow, Allocation, Attendance, Cert, Client, Db, Expense, DepartmentKey, Enquiry, ID, LevelKey, PermKey, Person, PhotoStage, Language, Mail, MailAttachment, MailIntent, Proof, RequestKind, RoleKey, FileCategory, FileKind, FleetDocCategory, Project, Variation, Vehicle } from "./types";

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
        body: `To: ${a.email.toName} <${a.email.toAddress}>\n\n${a.body ?? ""}`,
        receivedAt: nowStamp(),
        read: true,
        intent: "General",
        routedToId: signedInPersonId(role, asPersonId, operativeId, db.people) ?? "p-md",
        clientId: project?.clientId ?? db.quotes.find((q) => q.id === a.quoteId)?.clientId ?? db.salesInvoices.find((i) => i.id === a.salesInvoiceId)?.clientId,
      });
      if (a.kind === "chaser" && a.quoteId) {
        const q = db.quotes.find((x) => x.id === a.quoteId);
        if (q) q.chasedAt = nowStamp();
      }
      if (a.kind === "chaser" && a.salesInvoiceId) {
        const inv = db.salesInvoices.find((x) => x.id === a.salesInvoiceId);
        if (inv) audit(db, inv.projectId, `Payment chased: ${invoiceNo(inv)}`);
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
    db.quotes.unshift({ id, ref, enquiryId: e.id, clientId: e.clientId, title: `${e.location}: ${e.description.split(".")[0]}`, status: "Awaiting approval", lines, costing: costingFor(kind, quoteTotal(lines), r.int(19, 29)), validDays: 60, drafted: true });
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
    db.salesInvoices.unshift({ id: newId("inv"), ref: `INV-${n}`, projectId: p.id, clientId: p.clientId, description: "Final account", net, vatPct: db.salesInvoices[0]?.vatPct ?? 13.5, status: held ? "Held" : "To invoice", holdReason: held ? holdReason(p) : undefined });
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
    if (approve && siteId && r.personId && r.neededFrom === r.neededTo && r.neededFrom > getDay() && !isWeekend(r.neededFrom)) {
      const live = new Set(db.projects.filter((x) => x.status === "Live" || x.status === "Not started").map((x) => x.id));
      const st = personWeek(db.plan, db.holidays, live, r.personId, [r.neededFrom])[0]!;
      const drop = dropOutcome(st, siteId);
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

/** A day's mark on the timesheet. Overtime is at time and a half unless `overtimeRate` is 2, double time (17 Nov). */
type Mark = { status: "full" | "half"; overtimeHours: number; overtimeRate?: OvertimeRate } | null;
const markText = (m: Mark) => (m ? attendanceShort(m.status, m.overtimeHours, m.overtimeRate) : "Not in");
/** Write a mark on an entry. The rate is kept only where there is double time overtime, so an old one never lingers. */
function applyMark(a: Attendance, m: NonNullable<Mark>) {
  a.status = m.status;
  a.overtimeHours = m.status === "full" ? m.overtimeHours : 0;
  if (a.overtimeHours > 0 && m.overtimeRate === 2) a.overtimeRate = 2;
  else delete a.overtimeRate;
}
const markFields = (m: NonNullable<Mark>) => ({ status: m.status, overtimeHours: m.status === "full" ? m.overtimeHours : 0, ...storedRate(m.status === "full" ? m.overtimeHours : 0, m.overtimeRate) });

/** Mark today for one person. Stays editable until the day's time stamps are sent. */
export function markAttendance(projectId: ID, personId: ID, date: string, mark: Mark) {
  mutate((db) => {
    const i = db.attendance.findIndex((a) => a.projectId === projectId && a.personId === personId && a.date === date);
    const existing = db.attendance[i];
    if (existing?.sent) return; // sent entries change only through a correction, with a reason
    if (!mark) {
      if (i >= 0) db.attendance.splice(i, 1);
      return;
    }
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
    const from = markText(existing ? { status: existing.status, overtimeHours: existing.overtimeHours, overtimeRate: existing.overtimeRate } : null);
    const to = markText(mark);
    if (from === to) return;
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

const onLeave = (db: Db, personId: ID, date: string) => db.holidays.some((h) => h.personId === personId && h.status === "Approved" && date >= h.from && date <= h.to);

export type PlanMark = { part: "full" | "half"; overtimeHours: number } | null;

/**
 * Set what someone is doing on one site on one day: a full day, a half day, a full day with
 * overtime, or nothing (null takes them off that day). Weekends and approved leave are refused.
 */
export function setPlanDay(projectId: ID, personId: ID, date: string, mark: PlanMark) {
  mutate((db) => {
    const i = db.plan.findIndex((p) => p.projectId === projectId && p.personId === personId && p.date === date);
    if (!mark) {
      if (i >= 0) db.plan.splice(i, 1);
      return;
    }
    if (isWeekend(date) || onLeave(db, personId, date)) return;
    const entry = i >= 0 ? db.plan[i]! : { id: newId("pl"), projectId, personId, date };
    if (mark.part === "half") entry.part = "half";
    else delete entry.part;
    if (mark.part === "full" && mark.overtimeHours > 0) entry.overtimeHours = mark.overtimeHours;
    else delete entry.overtimeHours;
    if (i < 0) db.plan.push(entry);
    if (!db.assignments.some((a) => a.projectId === projectId && a.personId === personId)) db.assignments.push({ id: newId("as"), projectId, personId });
  });
}

/** Plan someone on a site for every day given that they are free to work. */
export function planPerson(projectId: ID, personId: ID, dates: string[]) {
  mutate((db) => {
    for (const date of dates) {
      if (isWeekend(date) || onLeave(db, personId, date)) continue;
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
 * Weekends and approved leave are never planned.
 */
export function planDays(projectId: ID, personId: ID, steps: { date: string; half?: boolean; moveFrom?: ID }[]) {
  let done = 0;
  mutate((db) => {
    for (const st of steps) {
      if (isWeekend(st.date) || onLeave(db, personId, st.date)) continue;
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

/** Send a piece of the firm's own plant to a site, or bring it back to the yard (null). */
export function movePlant(id: ID, projectId: ID | null) {
  mutate((db) => {
    const x = db.plant.find((p) => p.id === id);
    if (!x || x.projectId === projectId) return;
    const from = siteName(db, x.projectId);
    x.projectId = projectId;
    if (x.status !== "Off for repair") x.status = projectId ? "On site" : "Available";
    log(db, "Moved plant", `${x.assetRef} ${x.name}: ${from} to ${siteName(db, projectId)}`, "plant");
  });
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
    r.expires = expires;
    if (proof) {
      r.proof = { ...proof, addedBy: actorName(db), addedAt: nowStamp() };
      r.doc = proof.name;
    } else {
      delete r.proof;
      delete r.doc;
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

// ── Fleet ─────────────────────────────────────────────────────────────────────

const docName = (reg: string, what: string) => `${reg} ${what} ${getDay()}.pdf`;

export function renewVehicle(id: ID, item: "tax" | "test" | "insurance", expiryDate: string, amount: number, proof: NewProof) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    v.compliance[item] = { paidDate: getDay(), expiryDate, amount };
    db.fleetDocs.unshift({ id: newId("fd"), vehicleId: id, category: item, date: getDay(), amount, expiryDate, fileName: proof?.name ?? docName(v.reg, item), ...(proof ? { proof: { ...proof, addedBy: actorName(db), addedAt: nowStamp() } } : {}) });
    log(db, "Renewed a vehicle document", `${v.reg} ${item}`, "plant");
  });
}

export function addFleetDoc(d: { vehicleId: ID; category: FleetDocCategory; date: string; amount: number; workDone?: string; garage?: string; garageLocation?: string; expiryDate?: string }, proof: NewProof) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === d.vehicleId);
    if (!v) return;
    db.fleetDocs.unshift({ ...d, id: newId("fd"), fileName: proof?.name ?? `${v.reg} ${d.garage ?? d.category} ${d.date}.pdf`, ...(proof ? { proof: { ...proof, addedBy: actorName(db), addedAt: nowStamp() } } : {}) });
    if (d.category !== "repairs" && d.expiryDate) v.compliance[d.category] = { paidDate: d.date, expiryDate: d.expiryDate, amount: d.amount };
    // A full service resets the service clock.
    if (d.category === "repairs" && /service/i.test(d.workDone ?? "") && v.service.basis === "km") {
      v.service.lastServiced = d.date;
      v.service.lastMeter = v.service.meterNow;
    }
    log(db, "Filed a vehicle document", `${v.reg}: ${d.category === "repairs" ? (d.workDone ?? "repair") : d.category}`, "plant");
  });
}

export function setVehicleDriver(id: ID, driverId: ID | null) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    v.driverId = driverId;
    log(db, "Changed a vehicle's driver", `${v.reg}: ${db.people.find((p) => p.id === driverId)?.name ?? "nobody"}`, "plant");
  });
}

export function addVehicle(v: Pick<Vehicle, "reg" | "model" | "kind" | "baseLocation" | "purchasePrice">) {
  mutate((db) => {
    const day = getDay();
    const year = addDays(day, 365);
    db.vehicles.unshift({
      ...v,
      reg: normaliseReg(v.reg),
      id: newId("v"),
      driverId: null,
      purchaseMonth: day.slice(0, 7),
      sellPrice: null,
      active: true,
      mileage: 0,
      compliance: { tax: { paidDate: day, expiryDate: year, amount: 0 }, test: { paidDate: day, expiryDate: year, amount: 0 }, insurance: { paidDate: day, expiryDate: year, amount: 0 } },
      service: { basis: "km", intervalKm: 20000, lastServiced: day, lastMeter: 0, meterNow: 0, kmPerWeek: 500 },
    });
    log(db, "Added a vehicle", `${normaliseReg(v.reg)} ${v.model}`, "plant");
  });
}

/** Take a vehicle off the fleet. Its documents and repair history are kept. */
export function removeVehicle(id: ID, sellPrice: number | null) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === id);
    if (!v) return;
    v.active = false;
    v.sellPrice = sellPrice;
    v.driverId = null;
    log(db, "Removed a vehicle from the fleet", `${v.reg}${sellPrice != null ? `, sold for ${sellPrice}` : ", not sold"}`, "plant");
  });
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

/** Confirm what was read and post each line to a project's job costs. */
export function confirmSupplierInvoice(id: ID, allocations: Omit<Allocation, "id">[]) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s) return;
    s.allocations = allocations.map((a) => ({ ...a, id: newId("al") }));
    s.readStatus = "confirmed";
    s.confirmedBy = actorName(db);
    s.confirmedAt = nowStamp();
    // Over the limit: it waits for the director before it can go to the accounts package.
    if (needsSignOff(s) && !s.signOff) s.signOffAsked = s.confirmedAt;
    // The paper is filed with each project it was charged to.
    for (const projectId of new Set(s.allocations.map((a) => a.projectId))) fileInvoice(db, projectId, s.fileName, s.receivedAt.slice(0, 10), s.supplier, "Email");
    log(db, "Confirmed a supplier invoice to job costs", `${s.supplier} ${s.invoiceNo}`, "invoicing");
  });
}

export function reopenSupplierInvoice(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || s.readStatus !== "confirmed") return;
    db.files = db.files.filter((f) => !(f.category === "Invoices" && f.name === s.fileName));
    s.readStatus = "needs_review";
    delete s.confirmedBy;
    delete s.confirmedAt;
    delete s.signOffAsked;
    delete s.signOff;
    log(db, "Reopened a supplier invoice", `${s.supplier} ${s.invoiceNo}`, "invoicing");
  });
}

/** Raise a sales invoice: it gets a date, a due date on the client's payment terms, and the next accounts number. */
export function issueInvoice(id: ID) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "To invoice") return;
    i.status = "Invoiced";
    i.issuedOn = getDay();
    i.dueOn = addDays(getDay(), db.clients.find((c) => c.id === i.clientId)?.termsDays ?? 30);
    i.accountsNo = `SI-${nextNumber(db.salesInvoices.map((x) => x.accountsNo ?? ""), "SI-")}`;
    const p = db.projects.find((x) => x.id === i.projectId);
    if (p && p.status === "Complete" && i.description === "Final account") p.status = "Invoiced";
    audit(db, i.projectId, invoicedLine(invoiceNo(i), i.description));
    fileInvoice(db, i.projectId, salesInvoiceFile(invoiceNo(i), i.description), getDay(), actorName(db), "Upload");
    log(db, "Issued a sales invoice", `${invoiceNo(i)} ${p?.code ?? ""}, ${i.description}`, "invoicing");
  });
}

export function markInvoicePaid(id: ID) {
  mutate((db) => {
    const i = db.salesInvoices.find((x) => x.id === id);
    if (!i || i.status !== "Invoiced") return;
    i.status = "Paid";
    i.paidOn = getDay();
    // Once the final account and everything else billed on the job is paid, the job is closed.
    const p = db.projects.find((x) => x.id === i.projectId);
    const all = db.salesInvoices.filter((x) => x.projectId === i.projectId);
    const closing = !!p && p.status === "Invoiced" && all.some((x) => x.description === "Final account") && all.every((x) => x.status === "Paid");
    if (p && closing) p.status = "Closed";
    audit(db, i.projectId, paidLine(invoiceNo(i), closing));
    log(db, "Marked a sales invoice paid", invoiceNo(i), "invoicing");
  });
}

/** Record that these invoices went to the accounts package. The file itself is built by src/lib/accounts-export.ts. */
export function markExported(ids: ID[], packageName: string) {
  mutate((db) => {
    for (const i of db.salesInvoices) if (ids.includes(i.id)) i.exportedAt = nowStamp();
    log(db, "Exported sales invoices to accounts", `${ids.length} to ${packageName}`, "invoicing");
  });
}

/** The director's yes on a supplier invoice over the sign-off limit (src/lib/purchases.ts). */
export function signOffSupplierInvoice(id: ID) {
  mutate((db) => {
    const s = db.supplierInvoices.find((x) => x.id === id);
    if (!s || s.signOff) return;
    s.signOff = { by: actorName(db), at: nowStamp() };
    delete s.signOffAsked;
    log(db, "Signed off a supplier invoice", `${s.supplier} ${s.invoiceNo}`, "invoicing");
  });
}

/** Confirmed supplier invoices sent to the accounts package as purchase invoices. */
export function markPurchasesExported(ids: ID[], packageName: string) {
  mutate((db) => {
    for (const s of db.supplierInvoices) if (ids.includes(s.id)) s.exportedAt = nowStamp();
    log(db, "Exported supplier invoices to accounts", `${ids.length} to ${packageName}`, "invoicing");
  });
}

// ── Site phone: driving check and leave ──────────────────────────────────────

/** A driver's walkaround check. Defects are logged for the yard; the office sees it in the activity log. */
export function submitVehicleCheck(vehicleId: ID, defects: { item: string; note: string }[]) {
  mutate((db) => {
    const v = db.vehicles.find((x) => x.id === vehicleId);
    const by = myId(db) ?? "";
    db.vehicleChecks.unshift({ id: newId("vc"), vehicleId, personId: by, at: nowStamp(), defects });
    log(db, defects.length ? "Reported vehicle defects" : "Completed a vehicle check", `${v?.reg}${defects.length ? `: ${defects.map((d) => `${d.item} (${d.note})`).join("; ")}` : ", all OK"}`, "plant");
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
    const end = addDays(weekStart, 4);
    const rows = db.attendance.filter((a) => personIds.includes(a.personId) && a.date >= weekStart && a.date <= end);
    const hours = rows.reduce((n, a) => n + basicHours(a.date, a.status) + a.overtimeHours, 0);
    db.payrollExports.unshift({ id: newId("pay"), weekStart, at: nowStamp(), by: actorName(db), people: personIds.length, hours });
    log(db, "Exported hours to Sage Payroll", `Week ending ${end}, ${personIds.length} people, ${hours} hours`, "people");
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
    if (!m || m.folder === "Sent") return;
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
    if (!m || m.folder === folder) return;
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
export function composeMail(draft: { to: string; cc?: string; bcc?: string; subject: string; body: string; attachments?: MailAttachment[] }) {
  let id = "";
  mutate((db) => {
    const who = actorName(db);
    const domain = db.mails[0]?.mailbox.split("@")[1] ?? "abcconstruction.example";
    const files = (draft.attachments ?? []).slice(0, MAX_ATTACHMENTS);
    id = newId("mail");
    db.mails.unshift({ id, mailbox: `info@${domain}`, folder: "Sent", fromName: who, fromAddress: `info@${domain}`, to: draft.to.trim(), ...(draft.cc?.trim() ? { cc: draft.cc.trim() } : {}), ...(draft.bcc?.trim() ? { bcc: draft.bcc.trim() } : {}), subject: draft.subject.trim() || "(no subject)", body: draft.body, receivedAt: nowStamp(), read: true, intent: "General", routedToId: myId(db) ?? "p-md", ...(files.length ? { attachments: files, attachment: files[0]!.name } : {}) });
    log(db, "Sent an email", `${draft.subject.trim() || "(no subject)"}: to ${draft.to.trim()}${files.length ? `, with ${files.length === 1 ? files[0]!.name : `${files.length} files`}` : ""}`, "inbox", who);
  });
  return id;
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
