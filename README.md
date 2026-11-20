# Construction operations demo

A clickable sales demo of an operations system for construction firms, built by Vardil. It
shows a fictional conservation contractor (ABC Construction) running sales, projects,
labour, plant, files, invoicing, inbox, a client portal and a site phone view from one place.

All data is invented sample data, held in each visitor's own browser. Nothing is saved to a
server, and one visitor's clicks never show up for another. The one exception is Ask AI, the
managing director's assistant: its questions go to a live model through a small server
function, which keeps a record of them for Vardil (see "Ask AI" below).

| | |
|---|---|
| Live demo | https://demo.vardil.com (sign-in by emailed code) |
| Code | https://github.com/vardil-mamagement/vardil-construction-demo (private) |
| How it is built, and every decision so far | `CLAUDE.md` |
| Design rules every screen follows | `DESIGN.md` |

## How it is hosted

1. The code lives on GitHub. Every change to the `main` branch is published automatically.
2. Cloudflare Pages builds it with `npm run build:cloudflare` and serves it at
   demo.vardil.com. A build takes about two minutes.
3. Cloudflare Access stands in front of every address of the site. A visitor types their
   email; if it is on the approved list, Cloudflare emails them a six-digit code; nothing of
   the demo is sent until they type it in. They then stay signed in on that device for a week.
4. The only server code is Ask AI's: two Cloudflare Pages Functions in `functions/`
   (`/api/ask` and `/ask-log`), published with the site, and one small Cloudflare D1
   database for its record. The model is paid for by the question (see "Ask AI").

Everything is in the Cloudflare account "Hello@vardil.com's Account":

| What | Where it is set |
|---|---|
| Pages project `vardil-construction-demo` | Workers & Pages |
| The address demo.vardil.com | The project's Custom domains tab |
| The approved list: policy "Demo access" | Zero Trust > Access controls > Policies |
| Application "Construction demo" (demo.vardil.com, email code only, signed in for 1 week) | Zero Trust > Access controls > Applications |
| Application "vardil-construction-demo - Cloudflare Pages" (the pages.dev addresses, for people on the Cloudflare account only) | Zero Trust > Access controls > Applications |
| The sign-in page look (steel blue, Vardil logo and text) | Zero Trust > Reusable components > Custom pages |
| The sign-in address vardil.cloudflareaccess.com | Zero Trust > Settings > Team domain |
| Ask AI's model key, secret `ANTHROPIC_API_KEY` | The project's Settings tab > Variables and Secrets |
| Ask AI's record, D1 database `vardil-demo-ask`, bound as `DB` | Storage & databases > D1; the binding is under the project's Settings tab > Bindings |

## Letting someone in

1. Go to https://dash.cloudflare.com and sign in to the Vardil account.
2. In the menu on the left, click **Zero Trust**, then **Access controls**, then **Policies**.
3. Click **Demo access**, then the blue **Configure** button under the name.
4. Under **Include**, in the **Emails** box, click the empty line under the addresses already
   there, type the new address and press Enter.
5. Click **Save policy** at the bottom right. It works straight away.

To let in everyone at one company, at step 4 click **+ Add include (OR)** under the box
instead, choose **Emails ending in**, and type the end of their address with the @, for
example `@theirfirm.ie`.

Then send them https://demo.vardil.com. They type their email, click **Send login code**,
and type the six-digit code that arrives from noreply@notify.cloudflare.com. The code lasts
10 minutes. Tell them to look in junk if it does not arrive, because company mail filters
sometimes catch it.

If someone says no code came at all, check the list first: for an address that is not on
it, Cloudflare still says a code was sent but sends nothing.

The free plan allows 50 people. Each person who signs in uses one place until you remove
them (next section).

## Taking someone out

1. Take their address off **Demo access** (the same steps as above: click the x on their
   address, then **Save policy**). They can no longer get a new code.
2. They stay signed in on their device until their week runs out. To end that at once: in
   Zero Trust click **Team & Resources**, then **Users**, tick their box, click **Action**,
   then **Revoke**, then **Revoke sessions**.
3. To give their place back to the free plan: same list, tick their box, click **Action**,
   then **Remove users**, then **Remove**.

## Publishing a change

Changes are pushed to `main` on GitHub, and Cloudflare publishes them about two minutes later.

- On GitHub, a green tick next to the latest commit means it is live. A red cross means
  the build failed, and the previous version stays live.
- In Cloudflare: **Workers & Pages**, then **vardil-construction-demo**, then the
  **Deployments** tab, which lists every build.
- To go back to an earlier version: on the **Deployments** tab, click the three dots next to
  a deployment that worked, choose **Rollback to this deployment**, and confirm.
- Any branch other than `main` gets its own preview address ending in
  `.vardil-construction-demo.pages.dev`. Those ask for a code too, and only people on the
  Cloudflare account get in.

## Checking it is healthy

- Signed out, all of these must stop at the blue sign-in page: https://demo.vardil.com,
  https://vardil-construction-demo.pages.dev and any preview address.
- Signed in, the "Who are you signing in as?" page says "You are signed in to the demo as"
  followed by your email.
- If the demo ever shows "We could not confirm your sign-in", the sign-in has run out or the
  address is not behind Cloudflare Access. Reloading the page asks for a code again.

Last full check, 15 Nov 2026: signed out, all three addresses stopped at the sign-in page,
including the demo's own JavaScript file; signed in, all 46 screens in the navigation opened,
every security header in `public/_headers` arrived as written, and the browser reported no
blocked requests or errors.

## Ask AI

A button beside the search box, for the managing director only. It answers questions about
the firm from the demo's records, links each figure to its screen, and can draft chasers,
email replies, client progress updates and quotes, which wait in Approvals like every other
draft. Nothing it does is sent until someone approves it.

How it works, in short:

- The page sends the question and a summary of that visitor's sample records to `/api/ask`.
- `/api/ask` checks the Cloudflare sign-in, adds the model key, and sends it all to Claude
  Sonnet 5.5. The answer streams straight back. There is no daily limit on questions, so no
  prospect ever runs into one; the spend limit on the Anthropic workspace caps the cost.
- The key lives only in the Cloudflare secret `ANTHROPIC_API_KEY`. It is never in the code,
  in GitHub or in the page.
- Every question, who asked it (their sign-in email), the full answer and its cost are kept
  in the D1 database. Inside the demo, the question and who asked it also go in the
  managing director's Activity log.

To read the record, open https://demo.vardil.com/ask-log signed in as hello@vardil.com. Anyone
else gets "Not found". To let someone else read it, add a plain variable `ASK_ADMINS` to the
project (Settings > Variables and Secrets) with the emails separated by commas.

What it costs, measured live on 15 Nov: about 10 US cents for the first question of a
conversation, and again for the first question after the records change (a draft, an
approval); about 1 cent for each follow-up asked within 5 minutes of the last. It is paid
from the credit on the Anthropic account. The record shows the cost of each question.

Last live check, 15 Nov 2026, on demo.vardil.com: a real question was answered with every
figure matching the dashboard, the question and who asked it went into the Activity log, and
/ask-log listed it with the answer and its cost.

Settings that can be changed without touching the code, as plain variables on the project
(Settings > Variables and Secrets), followed by a new deployment:

| Variable | What it does | If not set |
|---|---|---|
| `ASK_DAILY_LIMIT` | A limit on questions per person per day, for a copy that needs one | No limit |
| `ASK_ADMINS` | Who may open /ask-log | hello@vardil.com |
| `ASK_EFFORT` | How hard the model thinks: low, medium or high | medium |

To switch Ask AI off: delete the `ANTHROPIC_API_KEY` secret and redeploy. The panel then says
it is not switched on, and nothing reaches the model.

## Setting it up again from nothing

Only needed if the Cloudflare project is ever deleted or moved to another account. Do the
steps in this order: Cloudflare cannot add a custom domain that is already behind Access.

1. **Pages project.** In Cloudflare, open **Workers & Pages** (under Compute in the menu on
   the left) and click **Create application**. Click the **Pages** tab, then **Connect to
   Git**. Choose GitHub; when GitHub asks, pick **Only select repositories**, choose
   `vardil-construction-demo` and click **Install & Authorize**. Back in Cloudflare, pick the
   repository and click **Begin setup**. Fill in:
   - Project name: `vardil-construction-demo`
   - Production branch: `main`
   - Framework preset: **None**
   - Build command: `npm run build:cloudflare`
   - Build output directory: `dist`
   - Leave Root directory and Environment variables empty.

   Click **Save and Deploy** and wait for Success.
2. **Lock the pages.dev addresses straight away.** In the project, open **Settings**, scroll
   to **General**, and click **Restrict previews** in the **Preview access** row. Click
   **Manage** in the same row, then **Edit** on the application that opens. Under
   **Destinations**, click **Add public hostname**, leave Subdomain empty and choose
   `vardil-construction-demo.pages.dev` as the Domain. Click **Save**. The application must
   list both `vardil-construction-demo.pages.dev` and `*.vardil-construction-demo.pages.dev`.
3. **The address.** In the project, open **Custom domains** and click **Set up a custom
   domain**. Type `demo.vardil.com`, click **Continue**, and confirm. Wait for **Active**.
4. **Zero Trust, first time only.** Click **Zero Trust** in the menu on the left. Choose a
   team name (`vardil`) and the **Free** plan. Cloudflare asks for card details but does not
   charge.
5. **The email code.** In Zero Trust click **Integrations**, then **Identity providers**,
   then **Add new identity provider**, and choose **One-time PIN**.
6. **The approved list.** Click **Access controls**, then **Policies**, then **Add a
   policy**. Policy name `Demo access`, Action **Allow**, and under Include choose
   **Emails** and type each address. Click **Save policy**.
7. **The application.** Click **Access controls**, then **Applications**, then **Create new
   application**, then **Continue with Self-hosted and private**. Then:
   - Public hostname: Subdomain `demo`, Domain `vardil.com`, Path empty.
   - Access policies: add the existing `Demo access`.
   - Authentication: turn off **Accept all available identity providers**, choose only
     **One-time PIN**, and turn on **Apply instant authentication**.
   - Details: Name `Construction demo`, Session Duration **1 week**.

   Click **Create**.
8. **The sign-in page look.** Click **Reusable components**, then **Custom pages**, then
   **Manage** next to Access login page. Fill in:
   - Organisation name: `Vardil`
   - Logo URL: the Vardil logo's address on vardil.com
   - Header text: `ABC Construction demo, built by Vardil`
   - Message: `Use the email address you gave Vardil. No access yet? Email hello@vardil.com`
   - Custom background colour: on, `#35678f`

   Click **Save**. This look applies to everything behind Access in the account.
9. **HTTPS.** Open the vardil.com site in Cloudflare, then **SSL/TLS**, then **Edge
   Certificates**, and make sure **Always Use HTTPS** is on.
10. **Ask AI's record.** Open **Storage & databases** (under Build in the menu on the left),
    then **D1 SQL database**, then **Create database**. Name it `vardil-demo-ask` and click
    **Create**. Then in the Pages project open **Settings**, then **Bindings**, click
    **Add**, choose **D1 database**, type `DB` as the variable name, pick `vardil-demo-ask`
    and click **Save**. The table inside it is made on the first question.
11. **Ask AI's key.** At https://platform.claude.com (signed in with the Vardil account),
    create a workspace for the demo with a monthly spend limit, then an API key in that
    workspace. In the Pages project open **Settings**, then **Variables and Secrets**,
    click **Add**, choose **Secret**, name it `ANTHROPIC_API_KEY`, paste the key and click
    **Save**.
12. **Publish again** (Deployments tab, three dots on the latest, **Retry deployment**), so
    the new settings take effect.
13. **Check** everything in "Checking it is healthy" above, and ask Ask AI a question.

## Run it on your own computer

You need Node.js version 20 or newer (the hosted build uses version 22). Open a terminal in
the project folder.

Install the parts it depends on (once):

```
npm install
```

Start it:

```
npm run dev
```

Then open http://localhost:5173 in a browser. Sign in with username `demo` and password
`demo`. That simple password only exists on your own computer; the hosted copy has none.
Ask AI does not work on your own computer: it needs the server function and the key, so its
panel says to use the hosted demo.

Run the tests:

```
npm test
```

To look at a production build on your own computer, build it with the local login:

```
npm run build:local
```

Then serve it:

```
npm run preview
```

and open http://localhost:4173.

## Make a copy for a prospect

Open `src/config/brand.ts` and change the name, tagline, accent colour and (optionally) the
logo. Push the change and Cloudflare publishes it. The same fields can also be changed live
in the demo under Settings, without a rebuild, but only in that visitor's browser.

## The build commands

| Command | What it makes |
|---|---|
| `npm run build:cloudflare` | The hosted build, behind Cloudflare Access. Cloudflare runs this one. |
| `npm run build` | Stops with a message unless the build has a login of its own, so a copy that lets anyone in with demo / demo cannot go out by accident. |
| `npm run build:local` | The same build with the demo / demo login allowed, for testing on your own computer. |
| `npm run build:preview` | One self-contained file, `dist-preview/index.html`, that opens straight from disk. |
| `npm run build:access-test` | The hosted build into `dist-access/`, for the browser suite that stands in for Cloudflare Access. |

## Tests

`npm test` runs the rule and data tests (199 of them).

The click-through suites drive a real Chrome browser through every department. They need
Python 3 with Playwright, and Chrome. Build both copies of the site first:

```
npm run build:local
```

```
npm run build:access-test
```

Then serve the local copy, in its own terminal:

```
npm run preview -- --port 4173 --strictPort
```

and run every suite from another terminal:

```
sh tests/browser/run_all.sh
```

That last command needs a Unix shell (Mac, Linux, or Git Bash on Windows).
`tests/browser/run_all.sh` lists the suites and what each one needs. Its `ask_check` suite
tests Ask AI's panel against a scripted stand-in for the model.

The Ask AI server function itself is tested in Cloudflare's own local runtime, with a local
database and stand-ins for the model and for Cloudflare Access. It needs the hosted build
(`npm run build:access-test`) and downloads Wrangler, Cloudflare's tool, the first time:

```
python3 tests/functions/fn_check.py
```

## Security in short

- No passwords, keys or tokens are kept in the code or in GitHub.
- Nothing of the demo is sent to anyone who has not entered an emailed code, on every
  address it has (demo.vardil.com, the pages.dev address and preview addresses).
- `public/_headers` sets the security headers (what the page may load, no framing, no
  search engines). They were checked on the live site on 15 Nov 2026.
- Never add a Cloudflare "Bypass" rule for demo.vardil.com without a clear reason: it opens
  that part of the site to anyone.
- Ask AI: the model key is a Cloudflare secret only. `/api/ask` checks Cloudflare's signed
  sign-in token on every request (not just an email header) and uses its own fixed
  instructions and tools whatever the page sends. The model can only prepare drafts, and
  only for the managing director. There is no daily limit on questions; keep a monthly
  spend limit on the Anthropic workspace, which is what caps the cost.
- `/api/ask` only answers the site's own pages, and only JSON (so a page on another
  address, even another vardil.com site sharing the sign-in, cannot use it).
- The full security review is in `CLAUDE.md`, under "Security", with a checklist for
  turning the demo into a build for a real firm ("Before a real client build").


## Vardil HQ (Vardil staff only, 19 Nov 2026)

Our own level, above the managing director (called Vardil Works until the evening of 19 Nov):
packages, client apps, announcements, app requests, and signing in as any level. A demo
client never sees it: its code is in its own folder, `/staff/`, and Cloudflare Access only
hands that folder to Vardil email addresses. Vardil Works is now the page every client has in
Admin: our announcements, and their apps with the ones they could add.

### On Cloudflare (once per Pages project)

1. The Pages project's build command must be `npm run build:cloudflare` (it includes the staff files).
2. The site's own Access application (the one covering the whole address) must let in Vardil staff:
   add an Include rule "Emails ending in" `vardil.com` to its policy, next to the clients' group
   (see "Clients and Cloudflare" below).
3. Add a second application: Zero Trust > Access controls > Applications > Add an application >
   Self-hosted. Name "Vardil HQ files". Add the same hostname with the path `staff/*`
   (and again for the pages.dev address if staff use it). Policy: a new reusable policy
   "Vardil staff", action Allow, Include "Emails ending in" `vardil.com`. Login method: One-time PIN.
   Under the application's settings, turn on the path cookie attribute ("Enable path cookie
   attribute"), so its sign-in cookie does not replace the main site's. HttpOnly on, SameSite Lax.
   Cloudflare uses the most specific application for an address, so `/staff/*` follows this one.
4. A D1 database bound as `DB` (Settings > Bindings > Add > D1 database), for Production and
   Preview. Client apps, announcements and app requests are kept there; the tables are made the
   first time they are used. Ask AI uses the same binding, so if it is set up already there is
   nothing to do.
5. Optional plain variables, then redeploy: `STAFF_DOMAINS` (the server's list of staff email
   domains, comma separated, default vardil.com) and `VITE_STAFF_DOMAINS` (the page's own list,
   used only to decide whether to fetch the staff files). Keep the two the same.

### Checking it

- Signed in with a Vardil email: "Who are you signing in as?" starts with Vardil HQ.
- In a private window with a client's email: no Vardil HQ line; opening
  `/staff/ready.html` directly stops at Cloudflare's "you do not have access" page.
- Vardil HQ, Clients: add a client with one named email and the Main offering. Signed in as that
  person in a private window, the demo carries their name, logo and colour, the bar shows only
  their apps, and Admin, Vardil Works shows the rest blurred.
- The first time a staff browser opens the demo after this is set up, it may pass once through
  `/staff/ready.html` and land back on the role page. That is Cloudflare signing it in to the
  staff folder.

### Clients and Cloudflare (20 Nov 2026)

Every client signs in at the same address. Cloudflare only decides who may get in; which demo
they see (their apps, name, logo, colour, region and invoice paper) is decided by the app, from
the client's record in Vardil HQ, Clients. A client is a list of named emails: never a whole
domain. Someone signed in who is on no client's list sees the standard demo, ABC Construction.

Vardil HQ keeps Cloudflare's list itself. Every save in Clients writes the whole list again, and
anyone taken off is signed out at once. Set it up once:

1. **The group.** Zero Trust > Access controls > Reusable components > Groups (called "Access
   groups" in some versions) > Add a group. Name it `Demo clients, kept by Vardil HQ`. Add one
   Include rule, Emails, with any address (it is replaced on the first save). Save, then copy the
   group's ID from its address bar or its details.
2. **The policy.** Open the reusable policy the demo uses (Demo access). Its Include rules should
   be: Access groups `Demo clients, kept by Vardil HQ`, and Emails ending in `vardil.com` (staff).
   Take the old one-by-one client emails out of it once they are in Vardil HQ.
3. **A key for Vardil HQ.** My Profile > API Tokens > Create Token > Create Custom Token. Name
   `Vardil HQ clients`. Permissions: Account, `Access: Organizations, Identity Providers, and
   Groups`, Edit. Account resources: Include, the Vardil account only. Create, and copy the token
   (it is shown once).
4. **The settings.** Workers & Pages > the project > Settings > Variables and Secrets, for
   Production and Preview: `CF_API_TOKEN` as a Secret (the token), `CF_ACCOUNT_ID` (the account
   ID, on the account's home page) and `CF_ACCESS_GROUP_ID` (from step 1) as plain text. Then
   redeploy (Deployments > the latest > Retry deployment).
5. **Check it.** Vardil HQ, Clients says "Cloudflare's list is up to date". Add a client with your
   own spare email, save, and the group in Cloudflare lists it. Take it off, save, and that email
   is signed out.

Until the three settings are there, Vardil HQ still saves clients and their look, says
"Cloudflare is not linked yet", and their emails are added to the policy by hand. If an update
fails (Cloudflare down, a wrong key), the save still stands, the Clients page says so, and
"Update Cloudflare now" writes the list again.

What Vardil HQ sets for each client, and they cannot change: the people who sign in; their apps;
their short and full names, the line under the name, their colour and logo (PNG, JPEG or SVG,
kept on the server as a picture); Ireland or the UK; and what their invoices carry. Their sample
projects and people stay ABC's invented ones. Each person's clicks stay in their own browser.
"Open their demo" on a client shows staff exactly what that client sees, with the staff strip on
top to come back.

### Levels, demo end dates and who has signed in (20 Nov 2026)

Each client's page in Vardil HQ, Clients has:

- **Demo status.** Demo, Became a client, or Not interested. A new demo runs for 30 days;
  change the last day or press "Extend 30 days". Marking a demo Became a client or Not
  interested, or its last day passing, takes everyone on it off Cloudflare and signs them out.
  The client, its look and its history stay, under "Closed demos", and can be reopened.
  Someone whose demo has closed sees only "This demo has ended" with our email address.
- **Levels for each person.** Tick which of the six levels each email may use. With one
  ticked they go straight in as it; with more, they choose from those.
- **What they have looked at.** When each person last signed in, on how many days, how many
  visits, the levels they used and the apps they opened. Kept for a year. Staff are never
  recorded. A small link on the sign-in page, "How Vardil uses your sign-in", tells prospects
  this (GDPR asks for it; have the wording checked).

There is no clock on Pages, so a demo whose last day has passed is closed the first time
anyone asks the server after it: that person, or anyone in Vardil HQ.

### An email when a prospect signs in (optional)

Vardil gets an email the first time each person opens their demo each day. It goes through
Cloudflare's Email Service, which sends to an address verified in the account for free.

1. Zero Trust is not involved. In the main Cloudflare dashboard, open Email Service. Add
   `hello@vardil.com` as a verified destination address and press the link in the email
   Cloudflare sends. Set up sending for vardil.com (Email Sending, onboard the domain), which
   adds records to vardil.com's DNS. **Before confirming anything, check it does not change
   vardil.com's MX records**: those decide where Vardil's own email goes. If it wants to,
   stop and ask.
2. Give the API token from "Clients and Cloudflare" the permission to send email as well, or
   make a second token with only that and save it as `ALERT_API_TOKEN` (Secret).
3. On the Pages project, for Production and Preview: `ALERT_TO` = `hello@vardil.com` and
   `ALERT_FROM` = an address on vardil.com, such as `demo@vardil.com`. Redeploy.

Without these nothing is sent and nothing fails. Not tried against the real Email Service
yet; the test uses a stand-in.

On your own computer, put `VITE_STAFF=1` in `.env.local` to see it with `npm run dev`. Never set it
for `npm run build:preview`: that file can be opened by anyone it is shared with.
