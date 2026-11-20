/**
 * An email to Vardil when a prospect opens their demo (20 Nov, decision 210): once a person a day,
 * through Cloudflare's Email Service, which sends to an address verified in the account for free.
 *
 * Switched on by two settings on the Pages project: ALERT_TO (the verified address, such as
 * hello@vardil.com) and ALERT_FROM (an address on a domain set up for sending in Cloudflare).
 * It uses ALERT_API_TOKEN, or CF_API_TOKEN when that token may also send email, and
 * CF_ACCOUNT_ID. Without them nothing is sent and nothing fails. CF_API_BASE is for the test only.
 */
export type AlertEnv = { ALERT_TO?: string; ALERT_FROM?: string; ALERT_API_TOKEN?: string; CF_API_TOKEN?: string; CF_ACCOUNT_ID?: string; CF_API_BASE?: string };

export const alertsOn = (env: AlertEnv) => Boolean(env.ALERT_TO && env.ALERT_FROM && env.CF_ACCOUNT_ID && (env.ALERT_API_TOKEN || env.CF_API_TOKEN));

/** The email, in words: who, which client, and where to look. */
export function signInAlert(who: string, firm: string, site: string) {
  const subject = `${firm}: ${who} opened their demo`;
  const text = `${who} from ${firm} has opened their demo today.\n\nWhat they have looked at is on their page in Vardil HQ, Clients:\n${site}/vardil/clients\n\nYou get this once a person a day.`;
  return { subject, text };
}

export async function sendAlert(env: AlertEnv, subject: string, text: string): Promise<boolean> {
  if (!alertsOn(env)) return false;
  const base = (env.CF_API_BASE || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/accounts/${env.CF_ACCOUNT_ID}/email/sending/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.ALERT_API_TOKEN || env.CF_API_TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ to: env.ALERT_TO, from: env.ALERT_FROM, subject, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
