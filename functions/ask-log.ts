/**
 * GET /ask-log: Aodhan's record of every Ask AI question (decision 49).
 *
 * Shows who asked (their Cloudflare sign-in email), the question, the full answer, any drafts
 * it made, and what it cost. Only emails in ASK_ADMINS may open it (hello@vardil.com unless
 * set otherwise); everyone else gets "not found". A plain page with no script.
 */
import { ACCESS_DEFAULTS, accessToken, verifyAccessToken } from "../server/access";
import { type AskRow, dublinDay, ensureSchema, recentRows } from "../server/askdb";
import type { Env as AskEnv } from "./api/ask";

interface Env extends AskEnv {
  ASK_ADMINS?: string;
}

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const usd = (n: number) => `$${n.toFixed(n < 0.1 ? 3 : 2)}`;

// The email_off markers stop Cloudflare's Email Address Obfuscation (on for the vardil.com
// zone, so on demo.vardil.com but not on pages.dev) from swapping every address on this page
// for "[email protected]" and adding a decoding script, which this page's policy blocks.
function page(body: string) {
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ask AI record</title>
<style>
:root{--ink:#1b2733;--muted:#5b6875;--line:#dce2e8;--accent:#2c5a80;--bg:#f4f6f8;--card:#fff;--bad:#b23a2b}
@media (prefers-color-scheme: dark){:root{--ink:#e6ecf1;--muted:#a3afba;--line:#2a343e;--accent:#a9cbe6;--bg:#11171d;--card:#19212a;--bad:#e57f70}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:1.45rem;margin:0 0 4px}
p.note{color:var(--muted);margin:0 0 16px}
.sum{display:flex;flex-wrap:wrap;gap:8px 24px;margin:0 0 16px}
.sum b{font-size:1.1rem}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{text-align:left;vertical-align:top;padding:8px 12px;border-top:1px solid var(--line)}
th{font-weight:600;color:var(--muted);border-top:0}
td.num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.when{white-space:nowrap;color:var(--muted)}
.q{font-weight:600}
.screen,.tools{color:var(--muted);font-size:13px}
.err{color:var(--bad)}
details summary{cursor:pointer;color:var(--accent)}
pre{white-space:pre-wrap;font:inherit;margin:6px 0 0}
@media (max-width:760px){td.hide,th.hide{display:none}}
</style></head><body><main><!--email_off-->${body}<!--/email_off--></main></body></html>`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const teamDomain = env.ACCESS_TEAM_DOMAIN || ACCESS_DEFAULTS.teamDomain;
  const audiences = env.ACCESS_AUD ? env.ACCESS_AUD.split(",").map((s) => s.trim()).filter(Boolean) : ACCESS_DEFAULTS.audiences;
  const user = await verifyAccessToken(accessToken(request), { teamDomain, audiences, certsUrl: env.ACCESS_CERTS_URL }).catch(() => null);
  const admins = (env.ASK_ADMINS || "hello@vardil.com").split(",").map((s) => s.trim().toLowerCase());
  if (!user || !admins.includes(user.email)) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain", "cache-control": "no-store" } });
  if (!env.DB) return new Response(page("<h1>Ask AI record</h1><p class=note>The database is not connected yet (binding DB).</p>"), { headers: HEADERS });

  await ensureSchema(env.DB);
  const rows = await recentRows(env.DB, 800);
  // One line per question: the question row plus any rounds after a draft was made.
  const turns = new Map<string, AskRow[]>();
  for (const r of [...rows].reverse()) turns.set(r.turn_id, [...(turns.get(r.turn_id) ?? []), r]);
  const list = [...turns.values()].filter((t) => t.some((r) => r.kind === "question")).reverse();

  const today = dublinDay();
  const month = today.slice(0, 7);
  const qs = rows.filter((r) => r.kind === "question");
  const people = new Map<string, number>();
  for (const r of qs.filter((x) => x.day.startsWith(month))) people.set(r.email, (people.get(r.email) ?? 0) + 1);
  const cost = (f: (r: AskRow) => boolean) => rows.filter(f).reduce((s, r) => s + (r.cost_usd || 0), 0);

  const body = [
    "<h1>Ask AI record</h1>",
    `<p class=note>Every question asked on the demo, newest first, with who asked it and the full answer. Times are Irish time. Showing the latest ${list.length} questions.</p>`,
    `<div class=sum><span>Today <b>${qs.filter((r) => r.day === today).length}</b> questions, ${usd(cost((r) => r.day === today))}</span><span>This month <b>${qs.filter((r) => r.day.startsWith(month)).length}</b> questions, ${usd(cost((r) => r.day.startsWith(month)))}</span><span>Asked this month by: ${[...people].map(([e, n]) => `${esc(e)} (${n})`).join(", ") || "nobody yet"}</span></div>`,
    "<table><thead><tr><th>When</th><th>Who</th><th>Question and answer</th><th class=hide>Tokens</th><th class=num>Cost</th></tr></thead><tbody>",
    ...list.map((t) => {
      const q = t.find((r) => r.kind === "question")!;
      // Shown as plain words: links lose their addresses, bold loses its stars.
      const answer = t
        .map((r) => r.answer ?? "")
        .filter(Boolean)
        .join("\n\n")
        .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
        .replace(/\*\*/g, "");
      const drafts = t.flatMap((r) => (r.tools ? (JSON.parse(r.tools) as { name: string; input: Record<string, unknown> }[]) : []));
      const failed = t.some((r) => r.status === "error");
      const tokens = t.reduce((s, r) => s + r.input_tokens + r.cache_write_tokens + r.cache_read_tokens, 0);
      const out = t.reduce((s, r) => s + r.output_tokens, 0);
      const total = t.reduce((s, r) => s + (r.cost_usd || 0), 0);
      const short = answer.length > 360 ? `${esc(answer.slice(0, 360))}...` : esc(answer);
      return `<tr><td class=when>${esc(when(q.at))}</td><td>${esc(q.email)}</td><td><div class=q>${esc(q.question)}</div><div class=screen>On ${esc(q.screen)}</div>${
        answer.length > 360 ? `<details><summary>${short}</summary><pre>${esc(answer)}</pre></details>` : `<pre>${short}</pre>`
      }${drafts.length ? `<div class=tools>Drafted: ${drafts.map((d) => esc(`${d.name.replace(/_/g, " ")} ${String(d.input.ref ?? d.input.project_code ?? d.input.mail_id ?? d.input.enquiry_ref ?? "")}`)).join(", ")}</div>` : ""}${failed ? "<div class=err>The model did not answer this one.</div>" : ""}</td><td class="num hide">${tokens.toLocaleString("en-IE")} in, ${out.toLocaleString("en-IE")} out</td><td class=num>${usd(total)}</td></tr>`;
    }),
    "</tbody></table>",
  ].join("\n");
  return new Response(page(body), { headers: HEADERS });
};
