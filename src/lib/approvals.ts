/**
 * How the approvals on the overview are put in order (Aodhan, 16 Nov): anything that goes to or
 * comes from a client comes first, matched against the client contacts in the records; then
 * everything else. Newest first within each group.
 */
import type { Approval, Client, Db } from "@/data/types";

const same = (a: string | undefined, b: string | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The client an approval involves, if it sends to or answers someone on the client list. */
export function approvalClient(a: Approval, db: Db): Client | undefined {
  const byAddress = (address: string | undefined) => db.clients.find((c) => same(c.contactEmail, address));
  const byId = (id: string | undefined) => db.clients.find((c) => c.id === id);
  if (a.kind === "reply") {
    const m = db.mails.find((x) => x.id === a.mailId);
    return byAddress(m?.fromAddress);
  }
  if (a.email) return byAddress(a.email.toAddress);
  if (a.kind === "quote") return byId(db.quotes.find((q) => q.id === a.quoteId)?.clientId);
  // A handover email goes to the project's client contact.
  if (a.kind === "handover") return byId(db.projects.find((p) => p.id === a.projectId)?.clientId);
  return undefined;
}

export type RankedApprovals = { client: { a: Approval; c: Client }[]; internal: Approval[] };

export function rankApprovals(list: Approval[], db: Db): RankedApprovals {
  const newest = [...list].sort((x, y) => (y.status === "Pending" ? y.createdAt : (y.resolvedAt ?? "")).localeCompare(x.status === "Pending" ? x.createdAt : (x.resolvedAt ?? "")));
  const client: RankedApprovals["client"] = [];
  const internal: Approval[] = [];
  for (const a of newest) {
    const c = approvalClient(a, db);
    if (c) client.push({ a, c });
    else internal.push(a);
  }
  return { client, internal };
}
