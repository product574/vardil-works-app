/**
 * Keeps Cloudflare Access's list of who may sign in in step with Vardil HQ (20 Nov, decision 209).
 *
 * One Access group, made once by hand ("Demo clients, kept by Vardil HQ") and included in the demo's
 * Access policy, holds every client email. After any change in Vardil HQ the whole group is written
 * again from the database, so the two can never drift: a missed update is put right by the next one,
 * or by "Update Cloudflare now". Emails that left the list altogether are signed out at once
 * (Cloudflare's "revoke all Access tokens for a user").
 *
 * Needs three settings on the Pages project: the secret CF_API_TOKEN (permission "Access:
 * Organizations, Identity Providers, and Groups: Edit" on this account only), CF_ACCOUNT_ID and
 * CF_ACCESS_GROUP_ID. Without them Vardil HQ still saves everything and says the list must be
 * kept by hand. CF_API_BASE exists only for the local test.
 */
export type CloudflareEnv = {
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_ACCESS_GROUP_ID?: string;
  CF_API_BASE?: string;
};

/** Cloudflare refuses a group with nothing in it, so an empty list holds one address that can never sign in. */
export const NOBODY = "nobody@clients.invalid";

export const cloudflareLinked = (env: CloudflareEnv) => Boolean(env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_ACCESS_GROUP_ID);

/** The include rules for the group: one per email, in a steady order. */
export function groupRules(emails: string[]) {
  const list = [...new Set(emails.map((e) => e.toLowerCase()))].sort();
  return (list.length ? list : [NOBODY]).map((email) => ({ email: { email } }));
}

type CfReply = { success?: boolean; errors?: { message?: string }[]; result?: unknown };

async function call(env: CloudflareEnv, method: string, path: string, body?: unknown): Promise<{ ok: true; result: unknown } | { ok: false; message: string }> {
  const base = (env.CF_API_BASE || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/accounts/${env.CF_ACCOUNT_ID}${path}`, {
      method,
      headers: { authorization: `Bearer ${env.CF_API_TOKEN}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const reply = (await res.json().catch(() => ({}))) as CfReply;
    if (res.ok && reply.success !== false) return { ok: true, result: reply.result };
    const why = reply.errors?.map((e) => e.message).filter(Boolean).join("; ");
    if (res.status === 401 || res.status === 403) return { ok: false, message: `Cloudflare refused the key (${res.status}). Check the token's permissions.` };
    return { ok: false, message: `Cloudflare answered ${res.status}${why ? `: ${why}` : ""}.` };
  } catch {
    return { ok: false, message: "Cloudflare could not be reached." };
  }
}

/** Write the whole group again from this list of emails. */
export async function syncAccessGroup(env: CloudflareEnv, emails: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!cloudflareLinked(env)) return { ok: false, message: "Cloudflare is not linked." };
  const path = `/access/groups/${env.CF_ACCESS_GROUP_ID}`;
  const now = await call(env, "GET", path);
  if (!now.ok) return now;
  // Keep the group's own name; only the list of emails is ours to change.
  const name = (now.result as { name?: string } | null)?.name || "Demo clients, kept by Vardil HQ";
  const put = await call(env, "PUT", path, { name, include: groupRules(emails) });
  return put.ok ? { ok: true } : put;
}

/** Sign these people out of everything behind Access, now. Returns the ones that could not be. */
export async function revokeSignIns(env: CloudflareEnv, emails: string[]): Promise<string[]> {
  if (!cloudflareLinked(env)) return emails;
  const failed: string[] = [];
  for (const email of emails) {
    const r = await call(env, "POST", "/access/organizations/revoke_user", { email });
    if (!r.ok) failed.push(email);
  }
  return failed;
}
