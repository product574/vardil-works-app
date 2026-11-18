# Construction operations demo

A sales demo of an operations system for construction firms, built by Vardil. It shows a
fictional conservation and restoration contractor ("ABC Construction Ltd") running its
whole back office in one place: sales, projects, labour, plant, files, invoicing, inbox, a
client portal and a phone view for site operatives.

It is a demo, not a live system. All data is invented sample data that lives in the browser.
The only server code is Ask AI's (milestone 7): two Cloudflare Pages Functions and one small
D1 database for the record of questions. It is hosted on Cloudflare Pages at demo.vardil.com,
behind Cloudflare Access (see "Hosting and sign-in" below).

**Read `DESIGN.md` before touching any interface.** It holds Aodhan's design rules and they
are not optional.

## Start here (handed over 16 Nov 2026)

Aodhan built this with Claude up to the end of step 1. From 16 Nov his co-founder develops
it on a copy of his own, and Aodhan keeps the live version. Everything below this section
is the full record: every decision and its reason, how it is built, the security notes and
what has been tested.

**Who does what.**

- **His co-founder** works on a copy: a zip of this repository, shared in a Google Drive
  folder, kept in a private repository in his own GitHub account. He runs it on his own
  computer (README, "Run it on your own computer") and never connects his copy to
  Cloudflare or demo.vardil.com. His instructions are in a doc Aodhan shares with the zip,
  "Construction demo: instructions for Oisin".
- **Aodhan** keeps this repository (vardil-mamagement/vardil-construction-demo), the
  Cloudflare account, the list of who can sign in, and publishing.
- **Ask AI** only works on the hosted copy: it needs the Cloudflare sign-in and the key,
  which stay with Aodhan. On a copy on someone's computer its panel says it is
  unavailable; `tests/browser/ask_check.py` tests the panel against a scripted stand-in.

**Where it stands.** Step 1 of six is built and live on demo.vardil.com (`main` at 01e7566,
16 Nov). 199 automated tests and 647 browser checks pass.

**How each step is built (on the co-founder's copy).** Work on a branch. Before any code,
bring Aodhan 2 or 3 options as pictures and get his pick. Then build, add tests, run
`npm test` and `sh tests/browser/run_all.sh`, and keep this file up to date (each decision,
what was built, what was and was not tested). Hand a finished version back as a link to the
private repository or a zip without `node_modules` and `dist`, with a short note of what
changed and what was tested.

**How a version comes back (Aodhan, with his Claude).** Bring it into this repository on a
new branch, never straight onto `main`: anything on `main` is live on demo.vardil.com about
two minutes later, where prospects see it. Run the tests, push the branch and try its
preview address (`<branch>.vardil-construction-demo.pages.dev`, Cloudflare account members
only). Merge into `main` only when Aodhan says publish, check it live, and update this file.
Each round starts from the latest version: if `main` changed while the co-founder worked,
send him a fresh zip first, or bring his changes across with care, so the two do not clash.

**What is left, in order:**

1. Step 2, a Slack/Teams tab to the right of Email: team chat by channel, where the AI
   tags messages, passes them to the right person and drafts replies that wait in
   Approvals. Reference: "Ping" in the Centra, Costello Doors and Large Haulage templates.
2. Step 3, the rest of Sales: one page with a board or list switch (decision 59), and "Log
   enquiry" taking camera photos, drawings, a pasted email and a voice note. Moving cards
   between columns is already done (decision 63).
3. Step 4, Customers and Compliance as sections of their own. Compliance puts every expiry
   in one place: training tickets, plant examinations, vehicle papers, insurance and
   subcontractor papers.
4. Step 5, Hire, Fleet and Yard in place of Plant, from the Athboy template. Ask Aodhan
   first what "Hire" means here: plant hired in, or also the firm's own plant hired out.
5. Step 6, Invoicing in the Athboy layout, plus "Invoice design", where the look of every
   ABC invoice is edited with a live preview. Leave the Portal as it is.

**On the co-founder's copy (product574/vardil-construction-demo), 18 Nov 2026.** Oisin
directs the steps on his copy himself and took Invoicing first, ahead of steps 2 to 5. The
first part is built on the branch `invoicing-section` (not merged into his `main`): client
invoices end to end. See "Invoicing, rebuilt 18 Nov" further down for what was decided, what
was built, what was tested and what comes next (supplier invoices with the Sage fields,
subcontractor invoices with the portal and the timesheet, all invoices by site). It replaces
step 6 as first written; "Invoice design" is built, and the Portal has been added to (not
left as it is) at his word. 252 automated tests and 723 browser checks pass on that branch;
one check in `review_check.py` (Week ahead) fails on a Wednesday on `main` too, so it is
not from this work.

**Loose ends, any time:** Aodhan's own round of testing on a real phone; the Ask AI key
moved from his personal Claude account to a Vardil one (step 5 under "Where we stopped");
a fixed address on vardil.com for the logo on the Cloudflare sign-in page; a native
speaker to read the Polish, Lithuanian, Romanian and Portuguese on the site phone;
whether Add vehicle and Add plant are what he meant by "add vehicles to the list".

**Accounts, all Aodhan's.** This repository is in the Vardil GitHub account
(`vardil-mamagement`); his Claude pushes to it through the `vardyek` collaborator (his
Vardkey account, see "GitHub" below). The hosting, the Ask AI secret and database, and the
list of who may open the demo are in the Vardil Cloudflare account (see "Hosting and
sign-in").

**Reference templates.** The ten demos he shared (decision 61) are Silkrun and Dubsof
demos, kept out of this repository on purpose; Aodhan decides whether to share the
archives. Use their layouts and features only, never their code, wording or data.

**Standing preferences** (further down) are Aodhan's, written about him. The house rules
stay for everyone working on it (UK English, no em or en dashes, options as pictures before
building, tested in practice with what was not tested said plainly). The rest describe how
he likes to work; check with whoever is working which still apply.

## Where this came from

Two sources were merged (November 2026):

1. **Oldstone** (Aodhan's own Lovable build for a real conservation contractor): site labour,
   attendance, planning, requests, plant, hired plant, fleet, files, invoice reading, job costs.
   Its tested rule modules were carried over unchanged into `src/lib/` (`dates`, `attendance`,
   `conflicts`, `controls`, `job-costs`, parts of `fleet`), with their tests.
2. **A reference demo of a roads contractor** on another platform, used for ideas only:
   the enquiry-to-invoice chain, dashboard, approvals queue, automations, training tickets,
   plant servicing calendar, client portal, shared inbox, operative phone view.
   No code, wording or data was copied from it. Keep it that way.

## Decisions Aodhan has made

| # | Question | Decision |
|---|---|---|
| 1 | What is it | Sales demo only |
| 2 | Data | Sample data only, in the browser |
| 3 | Navigation | Department switcher: pick a department, each has its own short sidebar |
| 4 | Features | Everything Oldstone had, plus commercial chain, management layer, field and compliance, customer-facing |
| 5 | Switcher position | Floating bar along the bottom |
| 6 | Company shown | A fictional firm, re-brandable from one file. Everything is for the construction industry |
| 7 | Interactivity | Fully clickable. Changes persist in the browser until "Reset demo data" |
| 8 | Sector of sample data | Conservation and restoration contractor |
| 9 | Look | Vardil steel blue (#4682B4) as the default accent |
| 10 | Wording | "Projects" with site codes (C720), not "jobs" |
| 11 | Where AI shows | Reads paperwork, drafts for approval, sorts the inbox, translates site notes. These are simulated (scripted results); nothing sends without a person approving. The exception is "Ask AI", see 22 to 24 |
| 12-14 | Getting in | Hosted demo: Cloudflare Access in front of every address. A visitor types their email and, if it is on the approved list, Cloudflare emails a one-time code; no file is sent before that. Then the mock sign-in page where the prospect picks a role. (Decided 13 Nov, option A of three; replaces the first plan of one shared username and password checked by Supabase. Supabase is no longer used.) |
| 15 | Roles | Six: managing director, contracts manager, site manager, accounts, operative (phone), client (portal) |
| 16 | Accounts export | Switchable between Sage 50, Xero and a plain spreadsheet |
| 17 | Design | Follow `DESIGN.md` (from his design tips document) |
| 18 | Company name | "ABC Construction", tagline "Conservation contractors" (Aodhan's choice; set in `src/config/brand.ts`). The "Built by Vardil" credit on the sign-in pages links to https://vardil.com in a new tab |
| 19 | Region | A setting that switches between Ireland (euro, Safe Pass, CVRT, 13.5% VAT) and UK (pounds, CSCS, MOT, 20% VAT). Money and labels already read `REGION` in `src/lib/money.ts`; the switch itself and UK place names for the sample data are part of milestone 5 |
| 20 | Department bar | Single accent colour, no per-department colours |
| 21 | Pace | Stop for feedback after every milestone |
| 25 | Project page | Tabs across the top: Overview, Scope, Photos, Files (added 16 Nov, decision 60), Plant, Requests, Extras, Costs, History |
| 26 | Who sees money | By default site managers see contract values but not costs or margins. The managing director can change, per role, which departments open and whether values and margins show (Admin > Roles and access; under Settings until 16 Nov) |
| 27 | Sales pipeline | A board with a column per stage, not a table |
| 28 | Quote page | Internal costing view plus a "Client copy" on headed paper |
| 29 | Timesheet | A week grid per site: one row per person, Monday to Friday across. Today's column is marked in the grid; earlier days are corrected with a reason |
| 30 | Week ahead | Laid out by site: a block per live project with its people down the side and the five days across |
| 31 | Access per person | Sensible defaults per level, and the managing director can change a long list of permissions per level and per individual person. "We will not know what each client wants", so it is all switches, not code |
| 32 | Photos | Added from the camera or from a file, real images, can be opened and downloaded |
| 33 | Ticket proof | Renewing or recording a ticket asks for a photo or PDF of the card. It can be saved without, but is then flagged "Proof needed" until a copy is attached |
| 34 | Week ahead: not placed | A list beside the sites of every operative with a free day that week |
| 35 | Week ahead: adding | Choose the trade first, then the person, with where each person already is that week |
| 36 | Week ahead: person box | Click a name for phone, email, their week, and "Take off this site" |
| 37 | Plant home | A list grouped by where each item is (by site, then the yard). The timeline stays one click away |
| 38 | Supplier invoice check | The invoice document on the left, what was read from it on the right |
| 39 | Files | Folders per project, like a shared drive, with a search box across everything on top. Kept; since 16 Nov each project also has a Files tab (decision 60) |
| 42 | Inbox | Three panes: folders, the list, and the open email with its drafted reply. Called Email since 16 Nov |
| 43 | Client portal | One page that scrolls: quotes first, then each project |
| 44 | Site phone view | One Today screen with large buttons, in the operative's language |
| 40 | Planning a day | Click a day (in a site's grid or in a person's box) to open the day planner: site, then full day, half day, or full day with overtime hours. No bulk "plan free days" in the person box |
| 41 | Managing director's name | Aidan King |
| 22 | Ask AI engine | A live AI model, because clients and prospects need it to be really good. Built at the very end (milestone 7), not before |
| 23 | Ask AI placement | A separate, clearly labelled "Ask AI" button beside the search box in the top bar. Search stays as it is |
| 24 | Ask AI reach | Answers in plain words, links to the screen behind each figure, and can prepare drafts that land in Approvals |
| 45 | Ask AI layout | A panel on the right. The screen stays open beside it, narrower, and a link in an answer opens that screen behind the panel while the conversation stays (15 Nov, option A of three, picked from pictures drawn on the real demo) |
| 46 | Ask AI users | The managing director only, with no switch to give it to anyone else. In Aodhan's words, managing what each level may ask would be "a whole other job", and an employee must never be able to ask what a site manager gets paid (15 Nov) |
| 47 | Ask AI drafts | All four: payment chasers (overdue invoices, quotes with no answer), Inbox replies, client progress updates, and quotes from enquiries through the existing "Draft a quote" (priced from the rate books, not by the model). All land in Approvals (15 Nov) |
| 48 | Ask AI model | Claude Sonnet 5.5 (`claude-sonnet-5-5`), picked over Opus 5.5 (slower, about twice the cost) and Haiku 5.5 (15 Nov) |
| 49 | Ask AI record | For Aodhan, as the developer: every question with the asker's email and the full answer, on a private page only he can open. In the demo: each question goes in the managing director's Activity log with who asked it, not the answer (15 Nov) |
| 50 | Ask AI scope | Ask AI only in this step. Translating site notes and reading supplier invoices stay scripted for now (15 Nov) |
| 51 | Ask AI limit | No daily limit (changed 15 Nov: "we will be sending this demo out to lots of people, we don't want a potential client to hit this limit"). Aodhan set a spend limit on the Anthropic workspace, which caps the cost. A limit can still be set per project with the `ASK_DAILY_LIMIT` variable (`server/limit.ts`). It was 30 a day, Claude's default, from 15 Nov until he changed it. No limit per minute either (16 Nov, asked: "No limit at all") |
| 52 | Top bar on a phone | Option A of three, picked from pictures (16 Nov): the search box becomes a magnifier button; tapped, the search opens across the whole bar with a Cancel button, and the logo, Ask AI, theme and account buttons step aside until it closes. Ask AI keeps its own button |
| 53 | Search and Ask AI | Kept separate (16 Nov). Aodhan asked whether to merge them; Claude advised against it for people who are not confident with technology and small screens (one box that sometimes searches and sometimes asks is hard to predict), and he agreed. Joined by one line instead: for the managing director only, the search results end with "Ask AI" and the words typed, which opens the panel and asks them about the screen behind |
| 54 | Access cookies | Applied by Claude on 16 Nov with his OK ("do whatever is best for security, but also ensuring we don't accidentally make it awkward for a client get access to it"): HttpOnly on and SameSite Lax on both Access applications. The binding cookie stays off, because it can lock out people who open the link inside an email or social app's own browser |
| 55 | Overview page | 16 Nov, his list of changes (step 1 of six). Top: an "AI overview" where "Waiting on you" was, the same height as "On site today", which shows the top five sites (busiest first) and a link to the rest. Below: Approvals on the left, the Portal on the right (latest from clients and subcontractors, and what is outstanding: overdue invoices and supplies to sites). The firm at a glance stays at the bottom |
| 56 | AI overview | Option B of three, picked from pictures (16 Nov): "Needs your decision" (up to three, each with one button) then "Worth knowing" (up to four one-line facts). Asked twice: first he picked "live AI for the MD", then, after sharing nine more templates, "worked out from the records" (instant, free, always matches the screens). So it is rules in `src/lib/overview.ts`, not a model call; "Draft chasers" still asks Ask AI for the managing director |
| 57 | Approvals | No separate page: they open and close in place on the overview, none open until someone opens one, and any number can be closed. Anything to or from a client (matched against the client contacts) comes first, under "With a client"; the rest under "Internal" (16 Nov). `/dashboard/approvals` redirects |
| 58 | Admin section | New department, the managing director's by default. "Requests/approvals from MD" means staff requests waiting on him (asked twice, 16 Nov): leave, people and plant from the sites, and spending, each Approve or Decline. Also, as in the templates he shared ("staff requests, access management etc."): Roles and access (moved from Settings), Connections, and Automations and Activity log (moved from Dashboard) |
| 59 | Sales switch | One Sales page with a switch at the top, board or list, instead of separate Board and Enquiries pages (16 Nov; his message was cut off at "a switch on the", and he confirmed this reading twice). Step 3 |
| 60 | Smaller changes, 16 Nov | Inbox renamed Email and moved beside Dashboard. Each project's folders are also on a Files tab on its page. The site phone opens in English, with the operative's own language one tap away. The Files section was first taken out, then kept the same day after he saw step 1 ("on the to be sorted loose files, we still need this files section so keep it actually"): the department is back as it was, To be sorted included, and the project tab stays too |
| 61 | Reference templates | Ten demos he shared on 16 Nov (Athboy plant hire, HVAC, haulage, large haulage, packaging, Just Packaging, Costello Doors, Centra, Bryan Lynch, and the tarmac one again). All are Silkrun or Dubsof demos, so the rule stays: layouts and features as the reference, our own code, wording and data. Archives are kept outside the repository |
| 62 | Billing | In Admin (16 Nov, after step 1: "add billing to the admin section. Have it to show three months prior as past invoices"), as in the templates: the plan, the next invoice, and the invoices for the three months before this one. Per person with a sign-in (office and site management, 13 in the sample data); operatives on the site phone and clients in the portal are free. Invoices from Vardil numbered VD-yymm, issued on the first working day of the month after, taken by direct debit three working days later. The price is €59 a person a month before VAT, set by Aodhan on 16 Nov (it was a €55 placeholder until he picked it), in `PLAN` in `src/lib/subscription.ts` (changing it means bumping DATA_VERSION and the figures in `subscription.test.ts`, `snapshot.test.ts` and `s1b_check.py`). Only the managing director sees it: Billing, like Roles and access, stays his even when Admin is switched on for another level (`mdOnly` on the sidebar item in `departments.ts`, and the screen sends anyone else back to Admin) |
| 63 | Moving sales cards | Cards move between the board's columns (16 Nov, after step 1: "have it so that jobs can be moved between sections"), by dragging or with the handle on each card's corner (a list of columns, for phones and keyboards). Every move does what that stage means, after a dialog saying what will happen: To quote to Drafting drafts the quote; Drafting back to To quote discards the draft; Drafting to Sent sends it; a quote that is out can go to Queried (with the client's question), Won (purchase order, then a project), Declined, or back to Drafting to be changed; Queried to Sent sends the revision; Declined to Drafting reopens it. Refused: anything into Opened (the client does that), anything out of Won (a project now), skipping a stage. While dragging, the columns it can go to say what a drop does and the rest dim. Only people with "Price and send quotes" can move cards. Rules in `src/lib/pipeline.ts`. The board or list switch and the richer Log enquiry are still to come in step 3 |

Decisions made by Oisin on his copy, 18 Nov 2026 (asked with question buttons; he picked the
recommended answer each time):

| # | Question | Decision |
|---|---|---|
| 64 | Invoicing section | Built from a call with Majella Walsh of Oldstone (16 Nov: how she ran Sage payroll and Sage 50 Accounts by hand) and five of his reference apps (HVAC, Costello Doors, Bryan Lynch, distributor, dairy; layouts and features only, as decision 61). Sections for client, supplier and subcontractor invoices, and all invoices by site. Subcontractors and clients use the portal for each job. Sage stays: the demo exports to it and never does VAT returns, payroll or bank payments ("if our product touches the tax man" a CFO will not trust it). No RCT, retention or payment applications for now |
| 65 | Opening a client invoice | A full page, not a pop-up or a side panel: the invoice as paper on the left; the client, the project, emails, comments and history on the right; the buttons along the top |
| 66 | Changing where an invoice stands | On each row (Send, Mark paid, Undo paid, and a menu for the rest), with tabs over the list: All, Drafts, Held, Sent, Overdue, Paid. Marking paid can always be undone |
| 67 | Send to client | Email with the PDF and the client's portal together in one press; either can be unticked each time |
| 68 | "Client problems" | Invoice queries: a client questions or disputes an invoice by portal, email or phone; it is not chased until accounts answer and settle it. (In place of "Returns" in the Bryan Lynch app) |
| 69 | Subcontractors in the portal | A preview inside Portal first ("What a subcontractor sees", with a viewing-as switch). No seventh sign-in role yet. Not built yet |
| 70 | Subcontractor hours | Their own section on the site timesheet, marked by the site manager; each subcontractor invoice is matched against it and differences flagged (Majella: "your subcontractor could tell you anything"). Not built yet |
| 71 | Clients and invoices in the portal | Open and download the PDF, ask about an invoice, say payment has been sent, and send a document (a purchase order or payment certificate). Built |
| 72 | Supplier invoice approval | Accounts approve up to 500 before VAT; above that the managing director approves; changeable in the app. Not built yet |

Standing preferences (these come from Aodhan and are not optional):

- UK English. No em dashes or en dashes anywhere: code comments, interface text, notes, chat.
- Ask for his opinion often. Where there is a choice, bring 2 or 3 thought-out options and
  get his agreement before writing code. Do not go on a long building run without stopping.
- Layout choices are shown as pictures (mock-ups with a button to pick), not described in
  words only.
- Test in practice, in a real browser, and tell him what was and was not tested.
- When telling him where to click, say exactly where it is on the screen.
- Terminal commands: each one in its own code block, spelled out in full, in order.
- No markdown file attachments: put content in the chat.
- Anything sent or published on his behalf is shown to him first.
- Keep this file up to date at the end of every session: he opens fresh chats and this
  file is the only memory.
- He prefers code to be pushed for him rather than pushing from the command line himself.

## Stack

Vite, React 19, TypeScript (strict), React Router 7, Tailwind CSS 4, Zustand with Immer,
Phosphor icons, Vitest. Fonts (Barlow, Barlow Semi Condensed) are bundled, so the app makes no
outside requests. On the hosted copy it asks Cloudflare Access, on its own address, who is
signed in (`/cdn-cgi/access/get-identity`).

It builds to static files. Its home is Cloudflare Pages at demo.vardil.com behind Cloudflare
Access (`public/_redirects` handles deep links there, `public/_headers` the security headers).
Ask AI adds Pages Functions in `functions/` (TypeScript, checked with their own
`functions/tsconfig.json` against `@cloudflare/workers-types`), published with the site.
The build scripts set their settings with `cross-env`, so they work on Windows as well as on
Mac and Linux (Aodhan is on Windows; Cloudflare builds on Linux).

## Commands

```
npm install          # once
npm run dev          # local development at http://localhost:5173
npm run build        # type-check, then build to dist/. Refuses to build without a login of its own
npm run build:cloudflare   # the hosted build (VITE_LOGIN=access): Cloudflare Access does the sign-in
npm run build:local  # the same build with the default demo / demo login allowed, for testing
npm run build:access-test   # the hosted build into dist-access/, for tests/browser/access_check.py
npm run preview      # serve dist/ at http://localhost:4173
npm test             # run all tests
npm run typecheck    # types only (the app, then the server functions)
npm run hash-password -- "a password"   # for local-mode login, see .env.example
npm run build:preview   # one self-contained HTML file in dist-preview/, for a quick look without a server
sh tests/browser/run_all.sh   # every browser suite (needs the site built and served, see the file)
python3 tests/functions/fn_check.py   # Ask AI's server function in Cloudflare's local runtime (needs dist-access and Wrangler)
```

## How the code is laid out

```
src/
  main.tsx              entry: applies brand and theme, mounts the router
  styles.css            design tokens (light and dark), table and field styles, motion
  config/brand.ts       THE re-branding file: name, colour, logo, region, accounts package
  app/
    router.tsx          every address in the app
    departments.ts      the map: departments in the bottom bar and each one's sidebar
    Shell.tsx           top bar, search, sidebar, department bar, role and login checks
    AuthPages.tsx       local-mode sign-in page, the "could not confirm your sign-in" page,
                        and the mock "who are you" page
    auth.ts             who may open the demo: Cloudflare Access mode or local mode
    brand.ts            turns the accent colour into the full set of accent tokens
  data/
    types.ts            the whole data model. Each key of `Db` is a future table
    seed/               builds the sample database for a given day (deterministic)
    store.ts            two stores: sample data (`useData`) and preferences (`usePrefs`)
    actions.ts          EVERY change to data goes through a function here
    roles.ts            the six demo roles and which departments each may open
    kpis.ts             dashboard numbers, derived from the records
  ai/                   Ask AI (milestone 7), see "Ask AI: how it is built"
  lib/                  pure rules with tests (no React, no store). Since 18 Nov also
                        invoices.ts (where a client invoice stands, aged debt, what is left
                        to bill, the email, and the one document the screen and the PDF both
                        draw) and pdf.ts (writes the PDF, no library). Since 16 Nov also:
                        overview.ts (the AI overview, worked out from the records),
                        approvals.ts (client first), portal.ts (the overview's Portal panel),
                        requests.ts (what waits for the managing director's yes or no),
                        subscription.ts (Admin, Billing), pipeline.ts (moving sales cards)
  ui/                   the interface kit: Button, Badge, PageHead, Panel, Dialog, Menu, toast
  modules/<department>/ one folder per department, one file per screen. dashboard/ is the
                        overview plus ApprovalsPanel.tsx; admin/ (16 Nov) holds Requests,
                        Roles and access, Billing, Connections, Automations and the
                        Activity log; a project's own Files tab is projects/ProjectFiles.tsx,
                        beside the Files section in files/Files.tsx. invoicing/ (18 Nov) is
                        ClientInvoices.tsx (the list and Draft an invoice), InvoicePage.tsx,
                        Queries.tsx, SageExport.tsx, Templates.tsx (invoice design, email
                        template), shared.tsx (the paper, the PDF download, the send dialog)
                        and Invoicing.tsx (supplier invoices and job costs, as before)
functions/              Cloudflare Pages Functions: api/ask.ts (Ask AI) and ask-log.ts (the record)
server/                 their helpers: the Access token check, the D1 record, request checks
```

### The three rules that keep it changeable

1. **Screens read with `useDb(...)` and write only through `src/data/actions.ts`.** When a real
   backend arrives, the bodies of those action functions become API calls and no screen changes.
2. **Rules live in `src/lib/` as pure functions with tests.** A screen never contains business
   arithmetic. If you are writing `if` statements about money, dates or status inside a
   component, move them to `lib/`.
3. **"Today" is `useDay()`, never `new Date()`.** The demo's day is the latest working day, and
   the whole sample database is generated relative to it, so the demo always looks current and
   is never empty at a weekend.

### Who may see and do what

`src/data/access.ts` is the only place that decides it. Screens call `useAccess()` and use:

- `can(department)`: may they open this department?
- `may(permission)`: may they do this? The permissions, with the wording shown on
  screen, are in `src/data/permissions.ts`. `answerRequests` (16 Nov) is the yes or no on
  site requests and spending in Admin; the managing director's only by default.
- `seeValues`, `seeMargins`: money.
- `scope(projects)`: without the "See every project" permission, only the projects they run.

Screens never check a role name, with three exceptions that are the managing director's
alone whatever is switched on: Ask AI (decision 46), and in Admin, Roles and access and
Billing (16 Nov). Admin itself can be switched on for another level, so those two are marked
`mdOnly` in `departments.ts` (left out of everyone else's sidebar) and their screens send
anyone else back to `/admin`. Without that, a level given Admin could open Roles and access
and change its own access (possible from step 1, when it moved there from Settings, which
cannot be switched on for anyone else, until this was added the same day). Access is worked out in two layers:

1. **Level.** Every office person has a level (`Person.level`: managing director, contracts
   manager, site manager, accounts). Each level's departments, money and permissions are a
   row in `db.access`. Starting values are in `src/data/roles.ts`.
2. **Exceptions for one person.** `db.personAccess` holds, per person, only the settings
   that differ from their level. A missing key means "same as their level".

Both are edited by the managing director in Admin > Roles and access (moved from Settings on 16 Nov; "By role" and "By
person"). The managing director, operatives and clients are locked: fixed access, no
exceptions. A level's home department can never be switched off, so nobody is locked out.
The rule is `resolveAccess(def, row, personExceptions)`, a pure function with its own tests.

The mock sign-in picks a role, which signs in as that role's usual person (`roles.ts`). "Sign
in as X to check" on the By person screen signs in as a named person instead
(`usePrefs.asPersonId`); `signedInPersonId()` is the one place that works out who is signed in.

To add a permission: add the key to `PermKey` in `types.ts`, a row in `permissions.ts`, the
default in `roles.ts`, then ask `may("theKey")` on the screen it controls. Bump DATA_VERSION.

### Photos and proof files

Photos added to a project and proof attached to a training ticket are real files, taken
with the camera or chosen from the device (`PickFile` in `src/ui/files.tsx`). The demo has
no server, so they are kept in the browser with the rest of the sample data: photos are
shrunk to 1280 pixels and saved as JPEG (`src/lib/image.ts`), PDFs are accepted up to
1.2 MB. A browser allows about 5 MB in all, which is roughly 10 to 20 photos. When it is
full the change still shows on screen and a message says it could not be saved
(`safeStorage` in `store.ts`). With a real backend these become ordinary uploads and the
limits go away. Sample photos in the seed have no image behind them and show as tiles.

### Typing numbers

Use `NumInput` from `src/ui` for any number a person types. A plain controlled input rewrites
"12." to "12" mid-keystroke, which makes decimals impossible to type. And never define a
component inside another component if it contains inputs: it is rebuilt on every keystroke
and the cursor jumps out of the box (see `renderCostEditor` in `QuotePage.tsx`).

### Adding a screen

1. Add the nav line in `src/app/departments.ts`.
2. Add the route in `src/app/router.tsx`.
3. Create `src/modules/<department>/<Screen>.tsx` using `PageHead`, `PageBody`, `Panel`, `.tbl`.
4. Any change to data: add a function to `src/data/actions.ts` (it must log to the activity log).
5. Any rule: add it to `src/lib/` with a test.

### Changing the data model

Edit `src/data/types.ts`, update the seed in `src/data/seed/`, and bump `DATA_VERSION` in
`src/data/store.ts`. Saved sample data in browsers is then rebuilt; preferences are kept.
`src/data/seed/seed.test.ts` checks the seed stays consistent (ids unique, links valid, no
weekend work, no dashes in text). Keep it passing.

### The sample data

`src/data/seed/` builds the whole database for the demo's day, all of it relative to that
day, so it looks the same on any weekday (rebuilt in the review, 16 Nov):

- Each project has a crew of stints (who, from, to), and timesheets are generated day by
  day over its life. Its value comes from the labour its crew was expected to cost
  (labour / 0.56 / (1 - margin)); won quotes are priced from the same crews, with
  quantities scaled exactly to the price; supplier invoices are generated to land each
  job on the margin its story needs (from about 9% to 31%).
- Business events fall on working days; client terms apply; stage payments follow scope
  milestones; a month's invoices go to the accounts package on the first Tuesday of the
  next month.
- The weekly summary, the activity log, and approval and automation dates are written
  last, from the records (`fillManagementDates`, `seedActivity` in `office.ts`).
- Next week has one deliberate double booking (Wednesday), leave in whole weeks, five
  operatives with free days (`NEXT_WEEK_FREE`), and C726 starting on Thursday with nobody
  planned yet.
- `seed.test.ts` checks it hangs together (dates, links, holds, terms, margins).

### Re-branding for a prospect

Change `src/config/brand.ts` (name, legal name, tagline, accent, logo, region, accounts
package, email domain) and rebuild. The same fields can be changed live in Settings.

### Who can open the demo

`src/app/auth.ts`, two modes chosen at build time by `VITE_LOGIN` (see `.env.example`):

- **access** (the hosted demo, `npm run build:cloudflare`). Cloudflare Access protects every
  address of the site and only lets in emails on the approved list, after a one-time code
  sent by Cloudflare. The app has no password page. It calls `/cdn-cgi/access/get-identity`
  once per page load to show "You are signed in to the demo as ..." on the role page, and as
  a tripwire: if Cloudflare cannot confirm the sign-in (run out, or a copy not behind Access)
  the demo stays shut and `/sign-in` shows a plain "Reload the page" message instead
  (`SignInAgain` in `AuthPages.tsx`). Sign out and "Leave the demo" go to
  `/cdn-cgi/access/logout`.
- **local** (your own machine, the browser tests, the single-file preview): username `demo`,
  password `demo`, or a hash set with `npm run hash-password`. Development only, because anyone
  reading the page code can get past it. `npm run build` refuses to make a local-mode build
  without a password of its own.

A screen whose file cannot be fetched (the Access sign-in ran out while the tab was open, or a
newer version was published) shows "This screen could not be opened" with a reload button,
inside the normal frame (`LoadFailed` in `Shell.tsx`, wired in `router.tsx`).

Roles chosen on the mock sign-in page carry no security weight; they only change what is shown.

## Where we stopped, and what is next

**First session ended on Friday 13 Nov 2026**, at the end of a long first day. Milestones
1 to 5 are built and tested. Milestone 6 is part done (see the checklist under Build
status). A second session started the same afternoon (13 Nov) from the zip of that folder.

State of the work at the start of the second session (re-checked from the zip):

- 107 automated tests pass (`npm test`). `npm audit`: no known vulnerabilities.
- 379 browser checks pass in eight suites (`tests/browser/run_all.sh`), no console errors.
  The security header check (`csp_check.py`, not part of `run_all.sh`) also passes.
- The single-file preview was rebuilt and checked from disk, and published to Aodhan's
  private Claude artifact (title "Construction operations demo").
- The managing director is Aidan King. The client the demo signs in as is Susan Kane of
  Ardmullen Estate.

**16 Nov, later: Aodhan's list of changes, in six steps** (each built on a branch, tried on
its preview address, and published only when he says). He listed them after the review;
the plan he was shown:

1. The new overview (decisions 55 to 58, 60): AI overview, top five sites, approvals in
   place with client emails first, the Portal panel; the Admin section; Email beside
   Dashboard; Files section removed (then kept, see below); the site phone in English;
   three approval problems fixed (see below). **Built on branch `step1-overview`.**
   After seeing it he asked for three more things on the same branch (16 Nov): keep the
   Files section (decision 60), Billing in Admin (decision 62), and cards moved between
   the Sales columns (decision 63, brought forward from step 3), then "do another run
   through to ensure all makes sense and then push/commit". **Done on `step1-overview`,
   and published to demo.vardil.com on 16 Nov (`main` at 01e7566), with Billing at €59.**
2. A Slack/Teams tab to the right of Email: team chat by channel, with the AI tagging,
   passing on and drafting replies that join Approvals. Reference: "Ping" in the Centra,
   Costello and Large Haulage templates. **Left for now at his word ("you can leave the
   slack/teams tab for now").**
3. Sales: drag cards between columns (done early, decision 63), one page with a board or
   list switch (decision 59), and "Log enquiry" taking camera photos, drawings, a pasted
   email and a voice note.
4. Customers and Compliance as sections of their own (Compliance: every expiry in one
   place, tickets, plant examinations, vehicle papers, insurance, subcontractor papers).
5. Hire, Fleet and Yard in place of Plant, from the Athboy template. Ask him first what
   "Hire" means for a contractor (plant hired in, or also its own plant hired out).
6. Invoicing in the Athboy layout, plus "Invoice design", where the look of every ABC
   invoice is edited with a live preview. Leave the Portal as it is.

His approvals questions, answered in chat on 16 Nov: every approval points at a record in
the sample data (written into the seed, or made as someone clicks: site phone extras,
"Draft a quote", completing a project, Ask AI), and Approve never sends anything (there is
no mailbox; a reply is filed under Email, Sent). Three problems found and fixed in step 1:
a row could never stay closed (the newest re-opened); a reply approved in Approvals left
its draft on the email, so it could be sent again from the Inbox (now one way of sending,
`fileReply` in actions.ts); and two approval kinds nothing ever made (the Monday ticket
reminder is now real, `ticketReminder` in seed/office.ts; the supplier invoice kind was
removed). Also: "Move back to waiting" is only offered on a discarded draft (an approved
one has been sent or added to the money), and reopening a discarded variation holds its
final account again.

State after step 1 (16 Nov, branch `step1-overview`, pushed for its preview address; not
on demo.vardil.com until Aodhan says):

- 179 automated tests pass (`npm test`, 23 files; 15 new in `src/lib/overview.test.ts`,
  and the filing tests went with `filing.ts`); both type-checks pass.
- 592 browser checks pass in twelve suites (`run_all.sh`, with the new `s1_check.py`, 50;
  `ask_check.py` is now 85); `csp_check.py` passes (23 screens, no violations);
  `fn_check.py` 45 of 45.
- Not tested: a real phone (his own round of testing).

Found and fixed in the run-through after his three changes (16 Nov, every screen read as
each office level, 142 screens, against the records):

- The overview's "Enquiries to quote" counted enquiries with a quote being drafted (5) while
  the Sales board's To quote column and its sidebar showed 3. It now counts the same as the
  column (`kpis.ts`), so a card moved on the board moves the overview too.
- The AI overview's first fact repeated the line under the date ("Seven sites live, 17
  people on site"); it now says only what is still to come in, today's time stamps.
- To be sorted let a site manager file into projects they cannot see; now the project list
  is theirs, and a suggestion for someone else's project says so and needs a project.
- The Sales board told people who cannot move cards to drag them; now only those who can
  are told.
- Invoicing's sidebar group "Billing" is now "Client invoices", so Billing means one thing.
- Settings, About this demo, now lists email and the admin area (requests, access, billing).

State after his three changes (16 Nov, branch `step1-overview`, pushed for its preview
address; not on demo.vardil.com until Aodhan says):

- 199 automated tests pass (`npm test`, 27 files: new are `subscription.test.ts`,
  `pipeline.test.ts` and `pipeline-actions.test.ts`, and `filing.test.ts` is back); both
  type-checks pass.
- 644 browser checks pass in thirteen suites (`run_all.sh`, with the new
  `s1b_check.py`, 42; `m4_check.py` 91 with the Files section back; `s1_check.py` 48);
  `csp_check.py` passes (26 screens, no violations); `fn_check.py` 45 of 45.
- His answer (16 Nov): "publish these changes", with Billing at €59 a person a month,
  "just viewable for the MD". Before publishing, the price went in (DATA_VERSION 11) and
  Billing and Roles and access were locked to the managing director (see "Who may see and
  do what"), with three more checks in `s1b_check.py` (45). The last run before publishing: 199
  automated tests, 647 browser checks (one Ask AI check raced its screen loading and was made
  to wait, then passed), `csp_check.py` clean. Then merged into `main` for demo.vardil.com.
- Published 16 Nov (`main` at 01e7566) and checked live in his Chrome (his Vardil profile,
  which he picked from the Connect request), as managing director: the tab first showed the
  old version (it loaded while Cloudflare was switching over); after a reload the site served
  the new files and his saved sample data was rebuilt at DATA_VERSION 11 (anything he had
  changed in the demo went back to the start, as with every version bump). Seen live: the AI
  overview with its three decisions and four facts ("Only Ardmullen House has sent today's
  time stamps. Six other sites have not yet."), "Enquiries to quote" 3, the bar with Files
  and Admin, Billing at €59.00 a person (13 people, €767.00 a month, VD-2610 to VD-2608
  paid), To be sorted with six files, the Sales board with a handle on all 15 cards and all
  draggable; no console errors. Not checked live: dragging on the live site (read only, so
  his demo data was left as it is), a real phone.

State after the review (16 Nov, branch `review`, then merged into `main` for
demo.vardil.com once Aodhan said "Publish after the changes"):

- 171 automated tests pass (`npm test`); both type-checks pass.
- 542 browser checks pass in eleven suites (`run_all.sh`, with the new `review_check.py`,
  55, and `ask_check.py`, 83, now covering the phone search and the Ask AI line in search);
  `fn_check.py` 45 of 45 (two new: a page on another address and a body that is not JSON
  are turned away); `csp_check.py` passes; `npm audit` finds nothing.
- Published 16 Nov (`main` at acc37f9) and checked live in his Chrome as managing director:
  the new build serves the sample data from the review; typing "which invoices are
  overdue" in the search showed "No record matches" and the Ask AI line, which asked the
  real model; its answer matched the dashboard (two overdue, €160,773: SI-10404, 21 days
  late, and SI-10405, 16 days late; SI-10406 due in 9 days), and the question is on
  `/ask-log`. Not checked live: the phone bar on a real phone, and a fresh sign-in with the
  new cookie settings (his browser still held a cookie issued before the change, which
  needs his email code to replace). Both left for his own round of testing.

State after the Ask AI build (15 Nov):

- 151 automated tests pass (`npm test`); both type-checks pass (`npm run typecheck`).
- 477 browser checks pass in ten suites (`run_all.sh`: the eight milestone suites, 379, the
  hosted-build suite, 25, and Ask AI, 73), no console errors; `csp_check.py` passes.
- `tests/functions/fn_check.py`: 43 of 43, the real server function in Cloudflare's local
  runtime.
- Published to demo.vardil.com and checked live with the real model (15 Nov).

### GitHub (set up 13 Nov, second session)

- The code lives in the private repository **vardil-mamagement/vardil-construction-demo**.
  The Vardil GitHub account is the personal account `vardil-mamagement` (spelt with "mam";
  no account spelt "vardil-management" exists).
- Claude's GitHub link is the account `vardyek`, which is the **Vardkey** account. It has
  been added to this one repository as a collaborator, and the Claude GitHub App is
  installed on vardil-mamagement for this repository only. Never put Vardil work under
  vardyek, and never link the two in anything public.
- The Supabase connected to Claude is also the Vardkey one ("vardyek's Org"). Do not use it
  for this demo.
- Claude pushes for Aodhan (his preference), so he never needs the command line for git.

### Hosting and sign-in (set up 13 Nov, second session)

All in the Cloudflare account "Hello@vardil.com's Account" (the Vardil account; the
vardil.com and vardkey.com zones are both in it). Claude in Chrome is connected to his Chrome
profile named "Vardil" and was used, with his go-ahead, to do the Zero Trust set-up.

- **Pages project** `vardil-construction-demo`, connected to the GitHub repository above.
  Production branch `main`, build command `npm run build:cloudflare`, output `dist`, Node 22
  from `.nvmrc`. Every push to `main` deploys to production; other branches get preview
  addresses. Build status shows on each commit in GitHub ("Cloudflare Pages" check).
- **Address** demo.vardil.com (DNS: CNAME `demo` to `vardil-construction-demo.pages.dev`,
  proxied). "Always Use HTTPS" was turned on for vardil.com; it only affects proxied records,
  and vardil.com, www and the Lovable demo subdomains (oldstone, integrasecuritygroup) are
  DNS only, so they are untouched. Settings of the vardil.com zone act on demo.vardil.com
  but not on the pages.dev addresses, so a check on a preview does not prove them. Email
  Address Obfuscation is on (Cloudflare's default) and rewrites email addresses in HTML
  pages; it caught /ask-log (see step 5).
- **Zero Trust**, Free plan (50 seats; a seat is used by each person who signs in). Team domain
  `vardil` (vardil.cloudflareaccess.com; it was the random round-shadow-751d until Aodhan
  asked for it to be tidied). Automatic removal of inactive users is off: he manages seats.
  - Login method: One-time PIN only (Cloudflare emails a 6-digit code, valid 10 minutes).
  - Reusable policy **Demo access**: Allow, Include Emails. This is the approved list: add a
    prospect's email (or an "Emails ending in" rule for a company) before sending the link.
  - Application **Construction demo**: demo.vardil.com, policy Demo access, One-time PIN only
    with instant authentication, session 1 week.
  - Application **vardil-construction-demo - Cloudflare Pages**: the main
    `vardil-construction-demo.pages.dev` address and `*.vardil-construction-demo.pages.dev`
    (previews). Made by Pages > Settings > Preview access > "Restrict previews", main address
    added by hand. Legacy policy "Allow Members - Cloudflare Pages" (people on the Cloudflare
    account only), One-time PIN, 24 hours. Prospects never use these addresses.
  - **Login page look** (Reusable components > Custom pages > Access login page), picked by
    Aodhan from real previews: steel blue background #35678F, organisation name Vardil,
    header "ABC Construction demo, built by Vardil", message "Use the email address you gave
    Vardil. No access yet? Email hello@vardil.com". Logo address
    https://vardil.com/assets/vardil-logo-DvRyE1FI.png, which is a Lovable build file: if
    vardil.com is republished the name can change and the logo breaks, so re-point it then.
    This look applies to everything behind Access in this account, vardkey.com included.
  - Sign out keeps Cloudflare's own signed-out page (his choice, now tidied).
  - Logo: loaded from vardil.com (option 1). On 15 Nov Aodhan said the login "works and is
    fine", so the unused copy in `public/brand/` was removed. When he is next in Lovable, the
    logo should get a fixed address on vardil.com (such as vardil.com/vardil-logo.png) and the
    login page be pointed at it.
  - The unused reusable policy **Public brand files** (Bypass, Everyone), made for a logo
    bypass that Claude's safety check blocked, was deleted on 15 Nov with Aodhan's OK after
    checking it was used by no application. Only **Demo access** is left. Any Bypass rule
    must be Aodhan's own decision and click.
  - Audience (AUD) tags, needed by the Ask AI function to check the sign-in token (they are
    identifiers, not secrets): Construction demo
    `1bc0fc6ce9e100d394e2a5ad9a8a841c8f5170b213cb81843862b5a11fcd092f`; the pages.dev
    application `1ef3816b26ed70fd31c25afc44318d8cd784856083bda382fd1fdabb6664b8bd`. Shown
    under Access controls > Applications > the app > Additional settings > AUD tag.
- **Checked live on 13 Nov:** signed-out visitors to demo.vardil.com, the main pages.dev
  address and a preview address all stop at the Cloudflare login; so do the JavaScript bundle
  and robots.txt; http goes to https. Aodhan signed in with the email code successfully. After
  the tidy-up the login page shows at vardil.cloudflareaccess.com in the new look.
- **Checked live on 15 Nov (signed in as hello@vardil.com, in his Chrome):** the role page
  names the signed-in email; all 46 screens in the navigation opened (no "could not be
  opened", no router error, each with its heading), and a project page; every header in
  `public/_headers` arrived exactly as written (CSP, X-Frame-Options, nosniff, referrer and
  permissions policies, HSTS one year with subdomains, COOP, X-Robots-Tag); assets cached
  for a year; a deep link (/plant) answered 200; no policy violations or console errors on a
  full load and a walk through the departments. The `/index.html` cache rule never applied
  (Pages redirects that address to /) and Pages already sends max-age=0, must-revalidate for
  pages, so the rule was removed.

Next, in this order (agreed with Aodhan on 13 Nov; step 0 added in the second session):

0. **Private GitHub repository and first push.** Done (see above).
1. **Decide how the login is enforced.** Done 13 Nov: he picked **A, Cloudflare Access with
   an emailed one-time code** (pictures of A, B and C were shown; B, the demo password plus an
   emailed link, was the recommendation). See decision 12-14 and "Who can open the demo".
2. **Host on Cloudflare Pages at demo.vardil.com behind Access.** Done. Live checks passed
   on 15 Nov (see "Hosting and sign-in"). One leftover: his OK to delete the unused "Public
   brand files" policy.
3. **README hosting steps.** Done 15 Nov: how it is hosted, letting someone in and taking
   them out (clicks checked in his dashboard), publishing and rolling back, health checks,
   setting it all up again from nothing, local commands, tests, security in short.
4. **Repository as a zip.** Done 15 Nov (sent in chat and copied to his Demo folder when the
   link to his computer was up).
5. **Milestone 7: Ask AI with a live model.** Done 15 Nov (see "Ask AI: how it is
   built"). Three pictures (where it opens, how it behaves, who gets it) and eight
   questions were put to Aodhan first; his answers are decisions 45 to 51. Built on the
   branch `ask-ai`, tried live on its preview address, then merged into `main` and
   published to demo.vardil.com on 15 Nov with his OK. Set-up, 15 Nov: the D1 database
   `vardil-demo-ask` (id b8d5ce57-57e4-4717-8844-9274f93f2f5b) was created and bound as
   `DB` for Production and Preview (by Claude in his Chrome, with his OK); Aodhan created
   the Anthropic key himself and added it as the secret `ANTHROPIC_API_KEY` for Production
   and Preview. The preview and the live demo share the one database, so the record covers
   both (and so would a daily limit, if one were ever set; there is none, decision 51).
   Key, his choice (15 Nov): for now the key comes from his own Claude account, which uses
   a different email from hello@vardil.com, paid from the credits on that account. Any
   Anthropic API key works; the email does not matter to the demo. Monthly API credits
   that come with a Max, Ultra or Team plan must first be claimed on claude.ai (Settings >
   Billing > API credits, linking a Console organisation); they expire monthly. When Vardil
   has its own Console account: create a new key there, replace the secret, redeploy, and
   delete the old key.
   **Live try on the preview, 15 Nov (in his Chrome, signed in as hello@vardil.com, real
   model):** the key and database were in place for Production and Preview. Nine real
   questions (twelve with the three drafts below; all are on /ask-log): overdue invoices
   (all figures right, linked), "draft a chaser for the Dunmoy one" (drafted, in
   Approvals with a good email, the model confirmed with links), who is free next week
   (right people and days; the first time it said "Four" and listed five, fixed by
   counting them in the summary, right the second time), the margin on St
   Finian's (52.8%, with the unchecked supplier invoice named, and the quoted 23.3%), a
   poem (politely refused in one line), and two questions on the C725 page that it
   understood as "this project" (scope, next steps, the client's permits email, linked,
   with no internal ids after the tuning). First words after about 1 to 3 seconds, whole
   answers in 2 to 5. Costs from the record: about $0.10 for a first question, $0.01 for a
   follow-up within 5 minutes. /ask-log showed every question with hello@vardil.com, the
   answers and the costs. Tuned after the first round (commit dc2ab85): lists instead of
   wide tables, money always with its sign, counts that match lists, no internal ids.
   Then the other three drafts, live: a progress update to Stephen Aylward on C725 (done
   items with dates, next steps, his permits point, the finish date, no costs), a reply to
   the Glebe House email (no promised dates or prices, asks for photos), and a quote for
   ENQ-1421 (Q-2621, priced by the rate books at about €41,927 with an 18.8% margin, which
   the model flagged as lower than usual). All four sat in Approvals.
   **Live on demo.vardil.com, 15 Nov (after the merge, in his Chrome):** "What needs my
   attention today?" was answered with every figure matching the dashboard (three overdue
   invoices, €193,336; three ready to invoice, €152,660, two held; six sites without time
   stamps; four requests; seven approvals; three expired tickets; four plant and two
   vehicle items overdue), so the production Access audience tag passes. The question and
   who asked it, without the answer, were in the Activity log, and /ask-log on
   demo.vardil.com listed it ($0.11, a first question). One bug found there and fixed:
   Cloudflare's Email Address Obfuscation (a setting of the vardil.com zone, so it acts on
   demo.vardil.com but not on the pages.dev addresses) swapped every email on /ask-log for
   "[email protected]" and added a decoding script that the page's own policy blocks. The
   page body is now wrapped in `<!--email_off-->` markers (commit b421ec6); checked live
   after the deploy: the emails show and no script is added.
   A second round there: "Which quotes are waiting for an answer from the client?" (five
   quotes, €229,635 in all; the sum and every day count right) streamed in, first words
   after about 2 seconds and the whole answer at 4.5 (45 pieces over 2.7 seconds, not
   compressed or held back by Cloudflare); a follow-up within 5 minutes cost $0.010. That
   follow-up showed a second bug: the model put a link inside bold
   (`**[Q-2614](/sales/quotes/Q-2614): Fitzgarret**`) and the panel showed the markdown as
   written. `parseInline` now keeps such a link as a link, in bold (a unit test and a
   browser check; commit fca573a); checked live after the deploy on the same answer.
   Fifteen questions in all on 15 Nov, $0.86.
   Not tried live: a real phone (left for Aodhan's own testing).
6. **A full review**, then Aodhan does his own round of testing. Started 16 Nov on the
   branch `review` (preview addresses only until he says to publish). He asked for two
   halves: the operating side ("whether stuff makes sense, numbers link up etc.", in depth,
   "take your time") and security, built out so this demo can be the template for real
   client builds in other sectors, plus a look at the Cloudflare logins. On 16 Nov he also
   had the daily Ask AI limit taken off (decision 51); that is live.
   **Operating half, done 16 Nov.** Every screen read as the managing director and as each
   other level, against the records behind it, on five demo days (Monday to Friday), with a
   script that checks the sample data for impossible dates, weekends, order of events,
   terms, values and margins (the review scripts were not committed). What changed:
   - Sample data rebuilt so every figure follows from the records (commit a561d9d; see
     "The sample data" under "Changing the data model").
   - Holds and final accounts. A live project's hold now reads "Extras to agree": nothing
     is held yet, its final account will be (stage payments never are). "Invoice held" is
     only on finished jobs. Approvals says what approving a variation does to the money.
     Discarding the last extra now releases the hold (it did not). A final account is the
     contract value less every other invoice on the job (it used to ignore stage payments
     not yet issued, so could bill twice) and follows every approved extra (it added only
     the last one). An extra agreed after the final account went out gets an invoice of
     its own. Once everything billed on an invoiced job is paid, the job is Closed (C712
     was paid but still "Invoiced"). Rules in `src/lib/billing.ts`, with tests.
   - Invoices: due on the client's terms (it was always 30 days); one number per invoice,
     the SI number once issued, on every screen, file, history line, chaser and in Ask AI
     (the screens showed SI and Ask AI said INV for the same invoice); every issued sales
     invoice and checked supplier invoice is filed in its project's Invoices folder (they
     were all empty); issuing and payment are written to the project history.
   - Schedule: the week ahead counts sites with people planned and names any with nobody
     (C726 starts next Thursday with nobody planned, on purpose); the month ahead shows
     jobs that finished during the month (its "On a site" totals did not add up without
     them) and counts today from the plan where nothing is marked yet.
   - Emails: every sample email reads right on any weekday (a "yesterday" fell on a
     Sunday on some days); replies promise only what the records show (the MEWP renewal
     and the cornice approval are not yet recorded); Sinéad's leave email carries her
     dates; Corrib's statement covers the invoice it names; Eleanor's reply is signed by
     Tadhg, who it was passed to.
   - Sample data: closed jobs keep their files; a live site's newest photo is from the
     last day or two (some were three weeks old); scaffold towers get a tower inspection,
     not a lifting examination; overdue vehicle papers are dated a year before they run
     out; plant in a quote is priced for the days the job needs it (a mixer was priced for
     252 days on an 80-day job); enquiries are numbered in the order they came in; the
     declined Granary Quay quote is no longer priced at a loss; a Corrib invoice no longer
     bills a belfry adaptation that is still to come; two requests and file senders fixed.
   - Wording and small things: automations column "When it runs"; the weekly summary is
     as of Friday 07:00 (on a Monday it counted Friday afternoon's extras); won and
     declined quote cards show the day of the answer; site managers show the sites they
     run; cost headings in sentence case; About tells a visitor that Ask AI questions
     leave the browser (hosted copy only); the old "later build step" page is now a plain
     not-found page; the client portal hides a handover pack until it has been sent; a
     doubled full stop after the client's question; supplier invoices list says where the
     confirmed ones start.
   - The supplier invoice reader runs every hour (two invoices that came in after this
     morning's run wait for the next), and Run now on Automations really reads them.
   - New browser suite `tests/browser/review_check.py` (35 checks) for all of the above.
   - The top bar on a phone (decisions 52 and 53, built 16 Nov after he picked from
     pictures): a magnifier opens the search across the bar, with Cancel; for the managing
     director the search results end with an "Ask AI" line holding the words typed
     (`askFromSearch` in `src/ai/AskPanel.tsx`; if an answer is still arriving, the words
     wait in the question box instead of being lost). 20 more checks in `review_check.py`
     (phone and computer, managing director and site manager) and 10 in `ask_check.py`
     (asking from search on a computer and a phone, Enter and the arrow keys, while busy).
   **Security half, done 16 Nov** (see "Security" below): `/api/ask` answers only the
   site's own pages and only JSON, and refuses an oversized body unread; Access keys are
   fetched again at most once a minute; the two places a real build must move to the
   server are marked "REAL BUILD" in the code; a checklist, "Before a real client build";
   the Access set-up read through (no changes made) with two recommended cookie settings
   waiting for his OK. Checked live on the preview with the real model afterwards.
   His answers (16 Nov): cookies, "do whatever is best for security" without making access
   awkward, so HttpOnly on and SameSite Lax on both Access apps, binding cookie off
   (decision 54, applied by Claude in his Chrome and read back); no limit per minute ("No
   limit at all"); and "Publish after the changes", so `review` was merged into `main`.

Pictures for choices: the inline drawing tool in chat did not show up for Aodhan on 13 Nov.
Send mock-ups as a PNG image instead (draw them as HTML, screenshot with Playwright at
device scale 2), and use the question buttons for the pick.

Small things waiting on a decision or a person:

- The Claude artifact preview is retired (15 Nov): demo.vardil.com replaces it, so the
  preview copy is no longer updated, and downloads inside it (which its frame blocks) will
  not be fixed. `npm run build:preview` still works for a look from disk.
- The unused "Public brand files" policy: deleted on 15 Nov with Aodhan's OK.
- The Polish, Lithuanian, Romanian and Portuguese wording in `src/modules/site/words.ts`
  has not been read by a native speaker.
- "Add vehicles to the list" (Aodhan, 13 Nov): Vehicles already had an Add vehicle button
  and Own plant now has Add plant. He has not yet confirmed that this is what he meant.

## Invoicing, rebuilt 18 Nov (on the co-founder's copy)

Branch `invoicing-section`. Decisions 64 to 72. What Oisin asked for: a pop-up that drafts an
invoice from the records and makes a PDF that can be emailed; filters like Costello Doors;
the invoice with everything linked like Bryan Lynch; "In Sage" on every invoice like the
distributor; the Sage export laid out like the dairy app; an undo for Mark paid; an email
template and an invoice design; emailing and commenting from inside the invoice.

**Built (part one: client invoices, end to end).**

- **Sidebar.** Money in: Client invoices, Unpaid, Held, Client queries. Money out: Supplier
  invoices, Job costs (both as before). Accounts package: Accounts export. Set-up: Invoice
  design, Email template. `/invoicing`, `/invoicing/invoiced` and `/invoicing/held` are the
  same list opened on different tabs, so old links and Ask AI's links still land.
- **Client invoices** (`ClientInvoices.tsx`): aged debt strip, tabs with counts, a search
  (number, client, project, order number), each row with its client (to Sales, Clients) and
  project, how it was sent, when it is due, whether it is in the accounts package, the next
  step as a button and a menu for the rest. "To invoice" reads Draft and "Invoiced" reads
  Sent or Overdue on screen (`stageOf` in `lib/invoices.ts`); the stored statuses are
  unchanged, so the overview, the portal and Ask AI needed no change.
- **Draft an invoice.** Type a site code, project or client; choosing the project fills in
  who is billed, the address, where it is emailed, their terms, their order number (from the
  accepted quote) and VAT. It starts from the next stage payment, valued from the work
  ticked off and not yet invoiced (`doneNotBilled`), or an agreed extra, dayworks or blank.
  Lines are edited freely. It cannot bill more than is left on the contract
  (`leftToBill`); a final account still to go out comes down by whatever is drafted, so a
  job is never billed twice. Nothing goes to the client until it is sent.
- **The invoice page** (`/invoicing/client/SI-10404`, `InvoicePage.tsx`): the paper, a strip
  (total, sent, paid, in the accounts package), linked client, project, order number and
  other invoices on the job, every email and comment about it with a box to email the client
  or leave a note for the office, and its history (who did what, when: `history` on the
  invoice). A link made while it was a draft (INV-) lands on the number it went out under.
- **Send to client** (`SendInvoiceDialog`): the email written from the template with the
  number and due date it will carry, free to change, the PDF named, and ticks for email and
  the portal. Sending issues the invoice (as "Issue invoice" did), files the email under
  Email, Sent against the invoice, and files the PDF with the project. As everywhere in the
  demo, nothing leaves the browser.
- **The PDF** is real: `lib/pdf.ts` writes it with no library (A4, Helvetica, the logo as a
  JPEG, more pages when the lines need them) from the same `InvoiceDoc` the screen draws.
- **Paid and undo.** Mark paid offers Undo in its message and "Undo paid" afterwards; undoing
  reopens a job that the payment had closed.
- **Client queries** (`Queries.tsx`, `invoiceQueries`): raised by the client in the portal
  or logged by the office from a call or email; reply (the client sees it in the portal);
  settle with what was agreed. An open query marks the invoice and says not to chase.
- **Accounts export** (`SageExport.tsx`): the rows exactly as the package imports them, as a
  table (Type, Account, Nominal, Dept, Date, Ref, Details, Net, Tax, VAT for Sage 50), then
  Download CSV. Dept is the project number (C720 is 720), nominal 4000 contract works or
  4010 agreed extras, tax code by rate (T3 for 13.5%, T1 standard, T0 none; decision 16's
  Xero and spreadsheet layouts are kept). "Export log" lists every file that went and gives
  it again. One invoice can also be exported from its own page.
- **Invoice design** (`/invoicing/design`): address, phone, email, VAT and company numbers,
  bank details, terms, last line, and switches for the logo, bank details, site and the
  coloured rule, with the paper redrawn live. Kept with the branding in preferences, so a
  reset of the demo data does not wipe it. **Email template** (`/invoicing/email`): subject
  and message with {words} that fill themselves in, previewed on a real invoice.
- **Client portal** (`portal/PortalInvoices.tsx`): open and download the invoice, ask about
  it, say it has been paid (accounts still confirm), and send a document, which lands in
  the project's Correspondence folder marked Portal.
- **Sample data** (`seed/invoicing.ts`, written last from the records): every sent invoice
  has how it went, its email under Sent and its history; clients have addresses and, for
  some, a separate address for invoices; one open query (C713), one settled (C710), one
  comment (C711) and one invoice the client says is paid (C721). DATA_VERSION 12.
- Ask AI can link to one invoice (`/invoicing/client/SI-10404` in `safeHref` and
  `RECORD_LINKS`). Its instructions and tools are unchanged.

**Tested.** 252 automated tests (53 new: `invoices.test.ts`, `pdf.test.ts`,
`invoice-actions.test.ts`, and more in `accounts-export.test.ts`). The PDF was also opened in
a real PDF reader (qpdf finds no errors; rendered with pdftoppm and read by eye). Browser:
the new `inv_check.py` (75 checks: the list, tabs and search, drafting, the page, sending,
the PDF's contents, paid and undo, emails and comments, queries, export from the page,
invoice design reaching the paper and the PDF, the logo in the PDF, the email template, the
client's four portal actions, accounts' access, dark mode, phone width); `m4_check.py`,
`m5_check.py`, `review_check.py` and `ask_check.py` changed for the new screens; all
fourteen suites run (723 checks pass); `csp_check.py` passes with the new screens (31
screens, no violations). Not tested: a real phone; Safari and Firefox; `fn_check.py` (Ask
AI's server function, not touched); the hosted build behind Cloudflare, which is Aodhan's.
`preview_check5.py` (the retired single-file preview) still names the old screens.

**Next, in this order (decisions 69, 70, 72 are waiting on this):**

1. Supplier invoices as Majella keys them into Sage: nominal code and department (project)
   per line, the firm's own file number (counting up), due date, paid or outstanding, the
   500 approval limit, a purchase day book export (PI lines) beside the sales one, and the
   reports she ran (by supplier, project, nominal code, month).
2. Subcontractor invoices as their own stream: subcontractors on the site timesheet in
   their own section, each invoice matched against the hours the site manager recorded,
   and "What a subcontractor sees" in Portal for logging an invoice per job.
3. All invoices by site: money in and out per project, and the monthly profitability
   report she built by hand in Excel (valuation, wages from hours at a loaded rate,
   materials and subcontractors, profit).
4. Not decided yet: credit notes (a settled query can only record what was agreed);
   whether Ask AI should refuse to chase an invoice with an open query (it does not know
   about queries yet); a subcontractor sign-in role.

## Build status

Work is in milestones, with a stop for Aodhan's feedback after each.

- [x] **1. Foundation.** Project set-up, design tokens (light and dark), shared login, mock
      sign-in with six roles, shell with department bar and sidebars, global search, full data
      model, complete sample data, Dashboard department (overview, approvals, automations,
      activity log), reset demo.
- [x] **2. Sales and Projects.** Pipeline board (to quote, drafting, sent, opened, queried,
      won, optional declined), enquiry log with "Log enquiry" and "Draft a quote from this",
      quote page (editable priced items, cost build-up, margin flags, client copy, send,
      chase, record acceptance or decline), awaiting response, clients. Accepting a quote
      creates a project with the next site code and copies the priced items in as scope.
      An enquiry can be logged for a brand new client, who is added to Clients on the spot.
      While a quote is a draft, awaiting approval or queried, every priced item and every
      cost line (labour, materials, plant, subcontract, preliminaries) can be edited, added
      or removed; once sent it is locked.
      Projects: list by status, project page with eight tabs, on site today, extras and
      snagging with invoice holds, completed with handover status, site requests.
      Settings > Roles and access: the managing director's grid of departments and money
      visibility per role.
- [x] **3. People and Schedule.** People: timesheet as a week grid per site (full, half,
      full plus overtime hours; "Send today's time stamps" locks the day; earlier days are
      corrected with a reason, and the old value, who and why are kept), attendance history
      (totals for payroll, day by day, corrections; month and site filters), employee
      register (add, open, archive, restore), training tickets (expired and due inside 30
      days, record a renewal or a new ticket), holidays (approve, decline, record leave).
      Schedule: week ahead by site, month ahead as a headcount grid, who is where today.
      Rules worth knowing:
      - Planning needs the "Plan the week ahead" permission (by default the managing
        director and contracts managers). Marking time, correcting earlier days, managing
        staff and tickets, and approving leave are each their own permission.
      - A week cannot be sent to operatives while anyone is double booked. The banner names
        the person, the two sites and the day.
      - Approving leave takes that person off the plan for those days; approved leave shows
        on the timesheet and the week ahead and cannot be planned over.
      - Archiving an employee takes them off every site list and future plan. Attendance
        already recorded is kept, and still counts in history and payroll totals.
      - Counts on the timesheet ("5 of 5 marked") cover the people on the site list now.
      Added after Aodhan's review of milestone 3:
      - Week ahead has a "Not placed" list (operatives with a free day, by trade), a
        trade-then-person picker that shows where each person already is, and a person box
        (phone, email, their week, "Take off this site"). Adding someone plans only their
        free days; if they have none the button reads "Plan anyway" and warns that it
        double books. Double bookings are listed one line per person, not one per day.
      - Five people are left with free days next week in the sample data (`NEXT_WEEK_FREE`
        in `seed/projects.ts`) so the list has something in it.
      - A planned day can be a full day, a half day, or a full day with overtime
        (`PlanEntry.part`, `overtimeHours`; `setPlanDay` in actions). Two half days on two
        sites is a split day, not a clash: `planClashes` in `src/lib/availability.ts` only
        flags more than one day's work. Clicking any day ahead opens the day planner
        (`PlanDayDialog`). One half day is in the sample data (Krzysztof Nowicki, Tuesday).
      - Training tickets carry proof (photo or PDF). Tickets in the sample data read "On
        paper file" until a copy is attached.
      - Project photos are real images from the camera or a file.
      - Settings > Roles and access has "By role" (money, ten permissions, departments)
        and "By person" (exceptions for one person, change of level, sign in as them).
- [x] **4. Plant, Files, Invoicing.**
      Plant (`src/modules/plant/Plant.tsx`): overview as a list by site, then the yard, then
      repairs; twelve-week calendar; own plant register; hired plant (notify return, mark
      collected). An item opens to move it, record a service, renew a certificate with the
      certificate attached, or send it for repair.
      Fleet (`Fleet.tsx`): vehicles with tax, test (CVRT in Ireland, MOT in the UK) and
      insurance; renew with amount and receipt; add and remove vehicles (sale amount or
      NA); vehicle documents; repair spend by vehicle, garage and quarter, as figures only.
      Files (`src/modules/files/Files.tsx`): folders per project with a search across all
      of them; add a picture or PDF; all photos; "To be sorted", where each arrival has a
      suggested project and folder with the reason (`src/lib/filing.ts`, tested).
      Taken out and put back the same day, 16 Nov (decision 60); each project also has
      the folders on its own Files tab (`src/modules/projects/ProjectFiles.tsx`).
      Invoicing (`src/modules/invoicing/Invoicing.tsx`): to invoice, held, invoiced with
      aged debt, accounts export (Sage 50, Xero, spreadsheet: `src/lib/accounts-export.ts`,
      tested), supplier invoices with the paper beside the reading, job costs.
      Rules worth knowing:
      - A supplier invoice cannot be approved until every line has a project and the
        lines add up to the subtotal. Approving posts it to job costs; reopening takes it
        back out.
      - Issuing a sales invoice gives it the next SI number and a due date on the client's
        payment terms (Clients, Terms), and puts it on the export list. Exporting stamps it
        so it is never sent twice. From then on the invoice goes by that SI number
        everywhere (screens, project history, the PDF in the project's Invoices folder,
        chasers, Ask AI); the INV number is only ours, for an invoice not issued yet
        (`invoiceNo` in `src/lib/billing.ts`).
      - Holds are cleared with the "Clear invoice holds" permission, not the invoicing one.
      - Two new permissions: "Manage plant and fleet" and "Handle invoices". The yard
        manager (Pat Scully) has the first as a personal exception.
      - Added after review: a drafted email reply in Approvals has an editable subject and
        body (`saveReplyDraft`), and Own plant has "Add plant" (`addPlant`).
      - The plant calendar is worked out, not stored: own plant stays on its site until
        the project's end date, hire until collected, requests as dashed bars. There is no
        booking table yet.
- [x] **5. Inbox, Portal, Site phone, Settings.**
      Inbox (`src/modules/inbox/Inbox.tsx`): three panes. Each email is tagged and passed
      to a person; both can be changed. The drafted reply is editable and is sent from
      here (which also closes any approval waiting on it), or discarded.
      Client portal (`src/modules/portal/Portal.tsx`): one scrolling page. A client can
      ask a question on a quote or accept it with a purchase order; each project shows
      progress, the work, photos, documents and invoices. Nothing internal is shown.
      Site phone (`src/modules/site/`): one Today screen in the operative's language
      (`words.ts` holds the interface in five languages and the translated site
      instructions). Send a photo, report extra work (the office gets English, the
      original is kept), ask for something, my week. `actAs()` in actions makes what is
      sent carry the operative's name when office staff are looking at the phone as them.
      Settings (`src/modules/settings/Settings.tsx`): Branding (name, colour, logo),
      Region and accounts, About.
      Rules worth knowing:
      - Switching region rebuilds the sample data (`toUK` in `seed/index.ts` swaps
        counties, phone numbers and number plates; VAT and currency follow `REGION`).
        Branding is kept. Firm, town and people names are invented and do not change.
      - Translations are fixed text, written for the sites each language's speakers are
        on. Anything not translated falls back to English. A live model replaces this in
        milestone 7, including free-text notes, which today are kept in the original.
      - `co(county)` in `src/data/place.ts` writes "Co. Galway" or plain "Cumbria".
- [ ] **6. Finish.** Part done on 13 Nov 2026:
      - [x] Build split by department (`src/app/router.tsx` loads each department the
            first time one of its screens is opened). First load is about 165 kB
            compressed; each department is 3 to 11 kB more.
      - [x] Full click-through after the split: all eight browser suites.
      - [x] Security review of the code and of the hosting set-up. See "Security" below.
      - [x] Browser suites copied into the repository (`tests/browser/`).
      - [x] Login enforced at the host (Cloudflare Access) and hosted on Cloudflare Pages
            at demo.vardil.com (13 Nov); live checks passed (13 and 15 Nov).
      - [x] README hosting steps, written against the real deployment (15 Nov).
      - [x] The Claude artifact preview: retired on 15 Nov now that the demo is hosted
            (no longer updated; its blocked downloads will not be fixed).
      - [x] First git commit, pushed to the private GitHub repository (13 Nov).
      - [x] Repository handed over as a zip (15 Nov).
- [x] **7. Ask AI (live model).** Built and published 15 Nov, see "Ask AI: how it is
      built". Tested: 44 new unit tests, a 73-check browser suite against a scripted
      stand-in model, a 43-check run of the real server function in Cloudflare's local
      runtime, and live tries with the real model on the preview and on demo.vardil.com
      (see step 5 under "Where we stopped").

### Ask AI: how it is built (milestone 7, built 15 Nov)

What Aodhan asked for: a separate "Ask AI" button in the top bar, on every screen, backed by
a live model. It answers questions about the firm in plain words, links to the screen behind
each figure, and can prepare drafts that go to Approvals for a person to approve. Decisions
45 to 51 settle the rest: a panel on the right, the managing director only, four kinds of
draft, Claude Sonnet 5.5, a record of every question for Aodhan, no daily limit.

Because only the managing director can use it, it is given everything the managing director
can see (pay rates, costs and margins included). It never appears for any other level,
including when the managing director uses "Sign in as X to check" (`Shell.tsx` shows it only
when `access.role === "md"`).

The pieces:

- **Panel** `src/ai/AskPanel.tsx`: the button beside the search box and the panel on the
  right (a flex sibling of `main`, so the screen narrows; the department bar moves left; on
  a phone it fills the screen and following a link closes it). `askFromSearch` is the
  search box's "Ask AI" line (decision 53; the search itself is in `src/app/Shell.tsx`,
  where on a phone it is a magnifier that opens across the bar, decision 52). Suggestions per screen
  (`suggestionsFor`), answers drawn from a small safe markdown reader (`src/ai/markdown.ts`:
  paragraphs, lists, tables, bold, links; links only to the demo's own screens, checked by
  `safeHref`; no HTML), draft cards with "Drafted for you" and "Open in Approvals". While
  waiting it says "Reading the records"; no spinner. Long dashes from the model are taken out
  (`undash`).
- **Conversation** `src/ai/state.ts` (zustand in sessionStorage: a reload keeps it, closing
  the tab clears it) and `src/ai/run.ts` (the loop: send, stream, make drafts, send results,
  up to `ASK_MAX_TOOL_ROUNDS`). The model's thinking blocks are passed back unchanged, as
  the API requires during tool use. Once a question is answered, `keepHistory` drops its
  thinking and keeps only the last 6 questions, so requests stay small (cost, and the 10 ms
  CPU limit of a Pages Function on Cloudflare's free plan). Each question goes in the
  Activity log as "Asked Ask AI" with who asked it, never the answer (`logAskAi`).
- **What the model is told** `src/ai/snapshot.ts`: a compact plain-text copy of the records
  (about 80,000 characters; about 40,000 tokens with the instructions, measured live), every
  figure worked out with the same rules as the
  screens (`dashboardNumbers`, `projectCosts` in `src/data/figures.ts`, which the Job costs
  screen now uses too, `dueState`, `hireEstimate`), day counts already done, and the list of
  screens it may link to. It is byte-for-byte the same until the records change, so the
  provider's cache makes follow-up questions cheap; Ask AI's own activity lines are left out
  of it for that reason. One summary is used for all the rounds of one question.
- **Instructions and tools** `src/ai/tools.ts`, shared with the server, which uses only its
  own copy: `SYSTEM_PROMPT`, the four tools (`draft_chaser`, `draft_reply`,
  `draft_client_update`, `draft_quote_from_enquiry`), the model id and limits.
- **Drafts** `src/ai/execute.ts` checks each request against the records (a paid invoice
  cannot be chased, a quote must be sent or opened, the enquiry must have no quote yet) and
  calls one action: `draftEmailApproval` (new approval kinds "chaser" and "client_update",
  with `email: { toName, toAddress, subject }` and the text in `body`), `draftReplyForMail`,
  or the existing `draftQuoteFromEnquiry` (priced from the rate books, never by the model).
  Approving a chaser or update files it under Email > Sent; a quote chaser also sets
  `chasedAt`. Approvals shows them with an editable subject and text (`EmailDetail`).
- **Server** `functions/api/ask.ts`: checks the Cloudflare Access token
  (`server/access.ts`: RS256 against the team's published keys, issuer
  vardil.cloudflareaccess.com, audience one of our two applications, cached keys, refetch on
  an unknown key id), checks the request (`server/validate.ts`: only user/assistant turns,
  only text, thinking, tool_use and tool_result blocks, size limits), a daily limit only if
  the project sets one (`server/limit.ts`; none by default) and the follow-up rounds
  (`server/askdb.ts`, D1), then calls the model with
  `output_config.effort` medium, `max_tokens` 8000, the summary marked for caching, and
  streams the answer straight through while recording it. A question id cannot be reused,
  and a follow-up must belong to one of the same person's questions.
- **Record** `functions/ask-log.ts`: /ask-log, a plain server-made page (strict CSP of its
  own, no script) listing questions newest first with who asked, the screen, the full
  answer, drafts made, tokens and cost, plus totals for today and the month. Only emails in
  `ASK_ADMINS` (default hello@vardil.com) see it; everyone else gets "Not found". Its body
  is wrapped in `<!--email_off-->` markers: Cloudflare's Email Address Obfuscation is on for
  the vardil.com zone and would otherwise hide every address on it (on demo.vardil.com only;
  pages.dev addresses are not in the zone).
- **Settings on the Pages project:** secret `ANTHROPIC_API_KEY`; D1 binding `DB`; optional
  plain variables `ASK_DAILY_LIMIT`, `ASK_ADMINS`, `ASK_EFFORT`, `ASK_MODEL`,
  `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (the defaults in the code are right for this account).
  `ANTHROPIC_BASE_URL` and `ACCESS_CERTS_URL` exist only for the local function test.
- **Without the server** (local builds, the single-file preview, or no key set): the panel
  says so in a sentence and the box is switched off.

Prices used for the cost in the record (Sonnet 5.5, checked 15 Nov 2026, per million tokens):
input $2, cache write $2.50, cache read $0.10, output $10. Measured on the live preview on
15 Nov: about $0.10 for a first question (the cache is written), $0.01 for a follow-up within
5 minutes, first words after 1 to 3 seconds, a whole answer in 2 to 5 seconds. Sonnet 5.5
always thinks (it cannot be turned off); thinking is billed as output and its text is not
shown.

An address with no screen (an old or mistyped link) shows a plain "There is no screen here"
page inside the normal frame (`NotFound` in `Shell.tsx`, the router's catch-all).

## Security

Reviewed on 13 Nov 2026 (the code and the files to be deployed). The hosting was then
checked on the live site on 13 and 15 Nov 2026.

### What was checked and found

1. **The login did not protect the demo's code. Decided 13 Nov: Cloudflare Access.** The
   whole app is JavaScript that the browser downloads, so a check inside the page only
   decides what it shows. The check now happens at the host: Cloudflare Access stands in
   front of every address and sends nothing until an approved email has entered its
   one-time code. Aodhan chose this (option A) over a password plus emailed link of our own
   (B) and personal Supabase accounts (C). The app's built-in password is gone from the
   hosted build. Watch-out: Access only covers the hostnames it is given. The project's
   `pages.dev` addresses are covered by their own application (Pages > Settings > Preview
   access > Restrict previews, plus the main address added by hand; see README). Checked
   live on 13 Nov: all three kinds of address stop at the sign-in page.
2. **Default login. Fixed.** A production build with no login of its own used to accept
   demo / demo. `npm run build` now refuses unless `VITE_LOGIN=access` (Cloudflare Access,
   what `npm run build:cloudflare` sets) or `VITE_DEMO_PASSWORD_SHA256` is set, and refuses a
   misspelt `VITE_LOGIN` (`loginCheck` in `vite.config.ts`). `npm run build:local` allows the
   default for testing.
3. **Built-in password mode is weak by design. Documented.** The hash of the shared
   password is compiled into the page (plain SHA-256, no salt), so it can be guessed
   offline. Use it on your own machine only.
4. **No way to inject script. Checked.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`
   or `new Function` anywhere. Everything typed in (captions, notes, replies, names) is
   shown as text by React. The brand colour is checked against a strict pattern before it
   reaches a style. Pictures are redrawn through a canvas before they are stored, which
   strips metadata and anything hidden in the file. PDFs are stored and offered as a
   download only, never opened inside the page.
5. **Links out. Checked.** Every link that opens a new tab has `rel="noopener noreferrer"`.
6. **Secrets. Checked.** No keys or tokens in the repository. `.env` and `.env.local` are
   ignored by git. `.env.preview` is committed on purpose and holds one harmless setting.
   The Supabase keys from the old Oldstone project were never copied in, and the Supabase
   library has since been removed. No secret may ever go in a `VITE_` variable, because
   every `VITE_` value ends up in the page.
7. **Dependencies. Checked.** `npm audit` reports no known vulnerabilities. An unused chart
   library (recharts) was removed. `package-lock.json` pins every version.
8. **Security headers. Added.** `public/_headers` sets a Content-Security-Policy (scripts
   and fonts from this site only, no inline script, connections only to this site (Supabase
   removed 13 Nov), no framing), plus HSTS, nosniff, a referrer policy, a permissions policy
   (camera for this site only) and noindex. Tested by serving the built site with exactly
   those headers (`tests/browser/csp_server.py` and `csp_check.py`): 20 screens opened
   with no violation, photo preview, brand colours and fonts still work, and an outside
   request, an injected inline script and framing the page were all blocked. Checked on the
   live site on 15 Nov: every header arrives as written.
9. **Search engines. Checked.** `robots.txt` disallows everything, the page carries a
   noindex tag, and the header in 8 says the same.
10. **What is kept in the browser. Checked.** Sample data and preferences. On the hosted
    copy Cloudflare keeps its own sign-in cookie for the site.
11. **Source maps. Checked.** Not produced by the production build.

### Ongoing on the live services

- Done and checked: `_headers` and `_redirects` are picked up; "Always Use HTTPS" is on for
  vardil.com; one-time PIN is the only login method on the demo; every address (custom
  domain, pages.dev, previews) asks for a code.
- Approved emails: add a prospect's email (or their company's domain) to the policy before
  sending the link. When a prospect goes cold, take them off and, if needed, revoke their
  session (Zero Trust > Team and resources > Users). Changes to the policy apply at once.
- Ask AI (built 15 Nov): the model key lives only in the Cloudflare secret
  `ANTHROPIC_API_KEY`; `/api/ask` checks the Access token's signature, issuer, audience and
  expiry on every request (`server/access.ts`), never the plain email header; no daily
  limit (decision 51), so the Anthropic workspace's spend limit is what caps the cost; the
  instructions, tools and model are the server's own, whatever the
  page sends; the model can only prepare drafts that wait in Approvals, and only the
  managing director has the button. `/api/ask` is on the site's own address, so the
  Content-Security-Policy is unchanged (connect-src 'self'). `/ask-log` sends its own strict
  headers, because `_headers` does not apply to Functions. Set a monthly spend limit on the
  Anthropic workspace as the last line of defence.
- Since the review (16 Nov), `/api/ask` also turns away any request that is not from the
  site's own pages (the Origin header must be the site itself, so a sister site on
  vardil.com that shares the sign-in cookie cannot spend the key), anything but JSON, and a
  body over the limit before reading it (`requestGate` in `server/validate.ts`); it fetches
  Cloudflare's keys for an unknown key id at most once a minute.
- **Access set-up, read on 16 Nov (no changes made):** two applications only, Construction
  demo (demo.vardil.com, the whole site, so /api/ask and /ask-log too; policy Demo access;
  one-time PIN only; instant authentication; session 1 week) and the pages.dev one
  (vardil-construction-demo.pages.dev and every preview under it; legacy policy "Allow
  Members - Cloudflare Pages"; one-time PIN; 24 hours). Demo access is used by the demo app
  only (nothing of Vardkey's), and lists four emails by name, no "everyone" and no domain
  rule. Identity providers: one-time PIN, and Cloudflare's own (for members). CORS is off
  on both. Two users have signed in (2 of 50 seats). Cookie settings as found: HttpOnly
  off on the Construction demo app (on for the pages.dev one), binding cookie off, SameSite
  not set on either. **Changed 16 Nov with his OK (decision 54):** HttpOnly on and SameSite
  Lax on both apps; binding cookie and path attribute left off; eager redirect cookie left
  on. Safe because the page never reads the cookie (it asks `/cdn-cgi/access/get-identity`)
  and the server reads it from the request. Cookies issued before the change keep their
  old settings until they run out (a week at most).
- Checked live on the review preview (16 Nov, his Chrome, real model): with the new checks
  in place the real page still asks and gets answers ("Which invoices are overdue?" gave
  SI-10404 and SI-10405 with the right amounts and days late), and a drafted chaser quotes
  SI-10404, the number the client has.

### Before a real client build

The demo is safe because everything in it is sample data in the visitor's own browser and
Cloudflare Access decides who may load it at all. A build for a real firm holds real
records, so these must change first:

1. **Data and permissions on a server.** The bodies of `src/data/actions.ts` become API
   calls, and the server enforces the same access rule (`resolveAccess` in
   `src/data/access.ts`) on every call; the page only hides what the server would refuse
   anyway. Move that rule and the list of departments (without the icons) into a module
   with no React, so the server can import it.
2. **Real sign-in.** Cloudflare Access (one-time PIN for named people, or the client's own
   identity provider) stays in front of every address; the mock "who are you" page goes,
   and a person's level comes from their record, never from the page.
3. **Ask AI on the server.** Check there that the person may use it (decision 46: the
   managing director only); build the summary of the records on the server from what they
   may see, rather than taking the page's (both marked "REAL BUILD" in
   `functions/api/ask.ts` and `server/validate.ts`); keep the model key a secret. Emails,
   notes and file names come from outside the firm, so the model must stay able only to
   draft into Approvals, as now.
4. **Settings per client** (left at Vardil's they refuse everyone, which is the safe way to
   fail): `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ASK_ADMINS` (who may open /ask-log), the
   client's own `ANTHROPIC_API_KEY` with a spend limit on that workspace, the `DB` binding.
5. **The Access applications:** every hostname covered (custom domain, pages.dev, previews);
   HttpOnly on and SameSite Lax; think about the binding cookie; a session length that
   suits; never a Bypass rule; the policy lists named emails or the client's domain.
6. **Privacy:** say what is recorded (About and the Ask AI panel do now); decide how long
   the Ask AI record is kept and delete older rows; it holds emails and questions.
7. **Files:** real uploads go to storage (R2) with type and size checks; never show an
   uploaded HTML or SVG file inside the page.
8. **Limits:** a spend limit on the model workspace; consider a per-person limit per
   minute (`ASK_DAILY_LIMIT` exists, off by default; there is no per-minute one yet).
9. **Before handing it over:** `npm test`, `run_all.sh`, `fn_check.py`, `csp_check.py`, and
   a live check behind Access on the client's own address.

## Tested so far

Automated (`npm test`): 151 tests across the rule modules, the sample data, the stores, the
access rule (levels and per-person exceptions), week availability, filing suggestions,
the accounts export layouts, and Ask AI (44, added 15 Nov: the summary of the records, the
stream reader, the answer reader and its link check, the history kept between questions,
the request check, the daily limit setting (off unless set), and the Access
token check with real signed tokens: wrong team, wrong application, expired, tampered,
unsigned, key rotation).

Clicked through in a real browser (Chrome), 379 checks in eight scripted runs, all passing:

- Milestone 1 (28 checks): sign-in refuses a wrong password with a plain message and accepts
  the right one by Enter key; unsigned visitors are bounced to sign-in; six roles; each role
  lands on its own home and is kept out of departments it should not see; approving a
  variation updates the count, the record and the contract value; changes survive a refresh;
  reset restores the data and keeps the theme; automations run and switch off; activity log;
  search; dark mode; no sideways scroll at phone width.
- Milestone 2 (40 checks): board column counts; log an enquiry (empty form refused); draft a
  quote from it (the wording picks the right rate book, an approval is created); edit a
  quantity and see the total move; client copy shows VAT and terms but no costs; approve and
  send; record acceptance with a purchase order, which creates the next project with scope
  copied from the quote; all eight project tabs; ticking scope records who and when; raising
  an extra drafts a variation, creates an approval and holds the invoice; approving it adds
  the value to the contract and releases the hold; completing a project raises the final
  account and drafts the handover; clearing a hold; dealing with a request; chasing a quote;
  client detail; site manager sees only his own projects, no Costs tab and no Sales; the
  access grid hides values and opens departments per role; only the managing director can
  open it; phone width.

- Milestone 2 additions (24 checks): enquiry from a new client (name and contact required,
  a duplicate name refused, client saved with an account ref); on a draft quote, rewrite a
  description, type a decimal rate key by key without losing the cursor, add and remove
  items; in the cost build-up, edit hours, add labour and material lines, remove a plant
  line, set subcontract and preliminaries, with cost and margin on screen matching the
  edits; client copy carries the edits; after sending nothing is editable; a queried quote
  reopens for repricing.

- Milestone 3 (48 checks): timesheet grid has five weekday columns with today marked; full,
  half and overtime (a decimal typed key by key) save unsent; sending locks the day;
  correcting an earlier day needs a reason and keeps the old value; adding and taking
  people off a site; approved leave shows in the grid; attendance history totals, day by
  day and corrections; adding an employee (name and phone required), archiving and
  restoring; ticket renewal and a new ticket; approving leave clears the planned days;
  week ahead by site with the double booking banner blocking send until it is sorted;
  planning a person for the week; month ahead totals; who is where; a site manager gets
  only his own sites, a read-only week and no hourly rates; dark mode; phone width.

- Milestone 3 review changes (63 checks, and 5 more added to the milestone 3 run): the
  person box keeps a long email inside its column at desktop and phone width, with phone
  and email as links; adding a photo offers camera and file, refuses a file that is not a
  picture, saves a real image shrunk to 1280 pixels, opens it, downloads it and keeps it
  after a refresh; a renewal without proof is flagged "Proof needed", proof can be added
  later as a photo or PDF and opened with who attached it; the Not placed list matches the
  people with free days; the picker goes trade then person and says where each person is;
  planning someone with no free day warns first, shows the clashes, and "Take off" from
  the person box removes the row and the clashes; planning from the Not placed list; by
  role and by person access, including exceptions stored only as differences, signing in
  as a named person, each permission hiding its buttons, moving a person to another
  level, clearing exceptions; reset puts all of it back. The day planner: a half day on
  one day only, a second half day on another site with no clash, a full day with 2.5
  hours overtime, a full plus a half flagged as a double booking, taking one day off, and
  the clash cell fitting on one line. Also checked by hand-written
  script: when the browser has no room left, the photo still shows and a message says so.

- Milestone 4 (85 checks): plant overview by site with aligned columns; needs attention
  filter; renewing a certificate with a PDF; moving plant; repair on and off; an
  hours-based service reset; hire collected and return notified; twelve-week calendar
  with no overflow; register filters; vehicle test renewal with a bad amount refused;
  removal needing a sale amount or NA; duplicate registration refused; a repair receipt
  filed with its photo; repair spend tables; files by folder, add a PDF (other types
  refused), open and download, search across projects; photos by project; filing
  suggestions with reasons, file all suggested, file one by hand; issue an invoice;
  clear a hold; aged debt; mark paid; export in three layouts, the downloaded file's
  name and contents, nothing sent twice; supplier invoice with no job reference blocked
  until a project is chosen, lines that do not add up blocked, approval posting to the
  right project's materials, pre-filled lines from a job reference, reading an unread
  invoice, reopening; job costs; accounts, site manager and yard manager access; dark
  mode; phone width on seven screens.

- Milestone 5 (59 checks): inbox counts, three panes, opening marks read, retag and
  pass on, edit and send a reply (posted, archived, approval closed), discard, archive
  and move back, unread and "passed to me" filters, no inbox for a site manager; portal
  as staff and as the client, ask a question, accept with a purchase order, switch
  client, nothing internal shown; site phone in Polish, Lithuanian, Romanian, Portuguese
  and English, original one tap away, photo, extra (English to the office, original
  kept, approval and hold created), request, my week, operative sign-in; branding name,
  colour, bad colour code, logo, survives a reset, on documents, back to default; region
  switch to the UK and back (counties, pounds, VAT, MOT, plates); about; dark; phone
  width on seven screens. One bug caught: the inbox filter carried over between folders.

- Step 1 of his list of 16 Nov (`s1_check.py`, 50 checks): the bar's order (Dashboard,
  Email, then the rest, Admin before Settings); the AI overview's decisions and facts
  against the records, at the same height as On site today, which shows the five busiest
  sites and a link to the rest; "Open the extra" opens its row in place and approving it
  moves the next decision up; approvals grouped client first, opened and closed with none
  left open; the Monday ticket reminder; discard and "Move back to waiting", and no way
  back for an approved email; the Portal panel; Admin requests (approve spending, decline
  and approve site requests, approve leave, the counts); the Activity log, Connections
  and Roles and access in Admin; six old addresses redirecting; the site phone in
  English; a contracts manager ("Open the invoices", no Admin); phone width; dark mode.
  The other suites were changed for the new addresses (the Files tab, Admin, Email).
- His three changes after step 1 (`s1b_check.py`, 45 checks): Files back in the bar between
  Plant and Invoicing, To be sorted with its six files, an address into Files staying there;
  Billing under Admin, Account, with the three months before this one (numbers, months,
  issue days, people times price, paid), the plan and next invoice from today's people,
  Change plan, and one person fewer changing the next invoice but not the past ones;
  Admin switched on for the contracts managers still keeping Billing and Roles and access
  out of their sidebar (computer and phone) and sending them back to Admin; the
  Sales board: a handle on every card, a drag showing what a drop does and dimming the
  rest, then each move in turn (draft from an enquiry, discard it back to To quote, approve
  and send, record a question, refuse Opened to Sent, Won with a purchase order making a
  project, Declined showing its column, reopen), a won quote refusing every move, each in
  the Activity log; a site manager filing loose files only into the projects they run;
  Accounts with no handles and nothing draggable; phone width (the move
  list fits, Billing does not scroll sideways); dark mode. `m4_check.py` has the Files
  section's checks back (search, photos, To be sorted) beside the project tab's.

One real bug was caught by these runs and fixed: the access rule treated every role as
locked, so changes on the Roles and access screen had no effect. It now has a unit test.
A second, smaller one: after someone was archived mid-day the timesheet could read "6 of 5
marked". Counts now cover only people still on the site list, with a browser check.

The single-file preview build (`npm run build:preview`) is opened straight from disk and
clicked through after each milestone: it makes no outside requests and its fonts load from
inside the file.

The browser suites are in `tests/browser/` (Python with Playwright; `run_all.sh` runs them
all). They were re-run in full after the build was split by department, and again on 13 Nov
after the switch to Cloudflare Access (all 379 still pass).

- Hosted build behind Access (`access_check.py`, 25 checks, 13 Nov): run against the
  `VITE_LOGIN=access` build served with the real `_headers`, with Cloudflare's two addresses
  answered by the script. Opening the site goes straight to the role page with no password
  box and names the signed-in email; departments open by direct address; a screen whose file
  is refused shows the plain "could not be opened" message inside the frame and reloads
  cleanly; Sign out and Leave the demo go to Cloudflare's sign-out address; when Cloudflare
  answers "not found", or an unprotected copy answers with a web page, the demo stays shut
  with a plain message and no form; no policy violations; phone width. It does not test
  Cloudflare itself: that is the live check.

- Live site behind real Cloudflare Access (15 Nov, in Aodhan's Chrome on Windows, signed in
  with his email code): see "Checked live on 15 Nov" under "Hosting and sign-in".
- On 15 Nov the build scripts moved to `cross-env` and the full run was repeated using the
  README's own commands: see the result recorded under "Where we stopped".

- Ask AI (15 Nov). `ask_check.py`, 73 checks, against the local build with a scripted
  stand-in for the model (`ask_server.py`): button for the managing director only (not for
  the other three office levels, nor when signed in as someone else), beside the search box;
  the panel opens beside the screen without covering it and moves the department bar; the
  answer streams in and links open their screens with the conversation kept; the question
  and who asked are in the Activity log, the answer is not; a chaser drafted, opened in
  Approvals, edited, approved and found under Sent with the edit; the other three drafts;
  a draft that makes no sense refused; links out of the demo and to non-screens shown as
  plain words; long dashes taken out; a link inside bold kept as a link; tables; no count
  of questions left unless the project sets a limit; plain messages for a limit (when one
  is set), a busy model and a run-out sign-in; reload keeps the conversation, Escape
  closes and returns focus, New conversation clears; no policy violations; phone width
  (fills the screen, a link closes it); a copy with no server says so and switches the box
  off. It also checks what the page
  sends: the screen, the summary, the same summary in every round (cache), the thinking
  passed back unchanged. Added 16 Nov (now 83 checks): asking from the search box's Ask AI
  line on a computer and a phone (one question sent, about the screen behind; the search
  box emptied; records first and the Ask AI line last; the arrow keys and Enter; while an
  answer is arriving the words wait in the question box and nothing more is sent).
- Ask AI's server function (15 Nov). `tests/functions/fn_check.py`, 43 checks, runs the real
  `functions/` in Cloudflare's local runtime (Wrangler 4.156.0, workerd, local D1) against
  `stub_upstream.py` for the model and the Access keys, with tokens signed by a throwaway
  key (`make_keys.mjs`): refusals (no token, wrong application, expired, forged, GET, a
  message posing as instructions), what reaches the model (key, model, effort, cached
  summary, the four tools only, extra settings from the page ignored), the draft round and
  its follow-up, follow-ups only for one's own questions, a reused question id refused, a
  busy model not counted against the limit, a daily limit per person when one is set
  (the run sets 3; by default there is none), /ask-log only for
  the admin, with questions, answers, drafts and costs, its own strict headers and its
  email_off markers; then the page and the real function together in Chrome.
- Ask AI live (15 Nov), with the real model and real Cloudflare Access: twelve questions on
  the preview address, including all four kinds of draft, and three on demo.vardil.com,
  plus the record on both. See step 5 under "Where we stopped".
- After the Ask AI changes the eight milestone suites, the hosted-build suite and the header
  check were run again and all pass (see "State after the Ask AI build" under "Where we
  stopped").

Not tested yet: Ask AI on a real phone (only phone-sized windows); Safari and Firefox;
screen readers; text scaling at 200%; the published preview inside Claude's own frame (only
the identical file opened from disk); dragging Sales cards on a touch screen (the handle on
each card is the way on a phone, and is tested at phone width).

## Known gaps to pick up later

- Supplier invoice VAT in the sample data is fixed at 23%.
- New records are stamped with the real time of day on the demo's "today", so something
  added at night can sort below seeded items stamped later that morning.
- Photos and proof files live in the browser (about 5 MB in all). A real backend removes
  the limit. The camera button was tested only for what it asks the device for
  (`capture="environment"`), not on a real phone.
- Download links (photos, proof, files, the accounts export) do nothing inside the Claude
  artifact preview, because its frame blocks file saves. They work in the real build.
- The "reading" of supplier invoices and the filing suggestions are rules, not a model:
  cost headings come from keywords in `src/lib/job-costs.ts`, filing from
  `src/lib/filing.ts`. A real reader would plug in there.
- Files accept pictures and PDFs only, because they are kept in the browser.
- Ask AI's answers come from a live model, so they cannot be checked word for word by the
  suites; they test everything around the model with a scripted stand-in.
- Per-person access covers office staff. Operatives have no settings: they only get the
  site phone view. If a client wants operative-level differences, add a level.
- The client copy of a quote is always white paper with dark ink, in dark mode too. That is
  deliberate (it is a document), and is the one place colours are not taken from tokens.
