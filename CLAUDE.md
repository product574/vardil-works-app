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

## This repository: the master demo (from 20 Nov 2026)

This is **product574/vardil-works-master-demo**, Oisin's new project. On 20 Nov he asked to
leave the construction demo as it is (product574/vardil-construction-demo, deployed to his
Cloudflare Pages project vardil-works-construction) and carry on in a new one "from where we
were". It was copied with its full history from that repository's `main` at 97d8255 (decision
213 published), so every record below still holds. From 97d8255 on, this repository has its own
history; the old one is not changed from here.

The first round here restructured the demo to the **Oldstone visual template** agreed on a call
with Jimmy, Oldstone's managing director, on 20 Nov (his spreadsheet "Oldstone - Visual Template
1.1" and the call notes are in Oisin's uploads, not in the repository): Level 1 the Dashboard,
Level 2 the apps, Level 3 the sections. Decisions 214 to 229, and "The master demo, 20 Nov"
further down. The preview is a private Claude artifact, "Vardil Works master demo" (slug
4b5930f4-1ab3-4776-b06e-d39091e3dc72, https://claude.ai/artifact/AJeong6GJsrZs9kQaQrpJ5),
rebuilt with `npm run build:preview` and republished with `publish_files` after each change
(sign in with demo / demo; downloads do nothing inside the artifact's frame). Cloudflare comes
later (decision 229). The restructure was built on the branch `master-demo-structure` and moved
into `main` on 20 Nov at Oisin's word ("yes push to github"); work on a new branch from `main`
for each round, as before.

**Easier to put things in, 20 Nov (later):** decisions 230 to 238, built on the branch
`easier-inputs` from `main` at b2a98ca, pushed to GitHub, and the artifact "Vardil Works master
demo" republished from it the same evening so he can look. See "Easier to put things in, 20 Nov"
further down. Moved into `main` on 21 Nov at Oisin's word ("Merge now"). The checklist of changes was given in the
chat, with the open questions as "Decision for you" lines.

**More ways in, 21 Nov:** decisions 239 to 248, built on the branch `more-ways-in` from `main`
at 1c68ea5, pushed to GitHub, and the artifact "Vardil Works master demo" republished from it.
See "More ways in, 21 Nov" further down. Not merged into `main` until Oisin says. The checklist
was given in the chat, with the open questions as "Decision for you" lines.

**Sales and Admin, 21 Nov (later):** decisions 249 to 258, built on the branch `sales-and-admin`
from `more-ways-in` at 9d30814 (that round not yet in `main`, so this one carries it), pushed to
GitHub, and the artifact "Vardil Works master demo" republished from it. See "Sales and Admin,
21 Nov" further down. Not merged into `main` until Oisin says.

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
16 Nov). 199 automated tests and 647 browser checks pass there. On Oisin's copy
(`product574/vardil-construction-demo`) his two lines of work were merged on 19 Nov: the
branch `step-2-team-chat` (Email like Gmail, Team chat like Ping, the two phones, Admin,
Schedule, payroll and overtime, Fleet from Secure-All, Profitability) and the branch
`invoicing-section` (Invoicing, Reports, Customers, Compliance). The merged version is on
`invoicing-section` and on his `main`, and is what his artifact shows. See "The two copies
merged, 19 Nov" further down, and decisions 185 to 197.

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

**Round ten, 17 Nov:** decisions 108 to 116, and 117 after it.

**Merged, 19 Nov:** decisions 185 to 197, and "The two copies merged, 19 Nov" further down.
This copy's own decisions from 18 Nov were numbered 64 to 118 on `invoicing-section` and
clashed with the other branch's; they are now 130 to 184, in the same order.

**Each client's own demo, 20 Nov:** decisions 209 and 210, on the branch `client-workspaces`, published on 20 Nov at Oisin's word (`invoicing-section` and his `main` at 9f6d7d5, the artifact republished): Vardil HQ, Clients keeps each client's named emails, apps, name, logo, colour, region and invoice paper on the server, writes Cloudflare's sign-in list itself and signs out anyone taken off. Set-up steps in README, "Clients and Cloudflare". See "Each client's own demo, 20 Nov" further down.

**The phone app, 20 Nov:** decisions 211 and 212, built on the branch `phone-app` and published on 20 Nov at Oisin's word ("Publish"); decision 213 (Make a request as a tile) published the same day at his word, `main` and `invoicing-section` at 11cd191: the site phone is the phone app, with or without Projects, with sign-in by number, code and password, a home screen by role, the site manager's timesheet with Overtime, his approvals, and each site as a screen of its own. See "The phone app, 20 Nov" further down.

**The main offering, 19 Nov:** decisions 198 to 208: Vardil HQ (our own level, staff only), the main offering package, one phone for everyone, client apps saved on the server, and Vardil Works in every client's Admin. Built on the branch `main-offering`; published on 19 Nov at Oisin's word ("publish it"): `invoicing-section` and his `main` fast-forwarded to 76ee96f, Cloudflare's build passed, and the artifact "Construction demo (Oisin's copy)" republished.

**Round eleven, 18 Nov:** decisions 118 to 129. Fleet is now the Secure-All build's Fleet
(`product574/vardil-works-security`, Vardil's own code, brought across with ABC's data), as a
department of its own; the phones gained Report damage and Send a licence; Who is where reads
any day, per site.

**On Oisin's copy, from 16 Nov evening:** Oisin directs the work himself ("forget about
Aodhan's steps for now, I will take control of the steps from now"). The list below is
Aodhan's plan, kept for reference; on this copy, follow Oisin's own requests and ask him,
not Aodhan, for picks. He looks at it as a private Claude artifact, "Construction demo
(Oisin's copy)", rebuilt with `npm run build:preview` and republished after each change
(sign in with demo / demo; downloads do nothing inside the artifact's frame). From 17 Nov he
shares that artifact with other people himself (decision 88): its sign-in page no longer
prints the login, and `npm run build:preview` takes the login from `.env.preview`.
Oisin's standing rule (17 Nov): after finishing a task, always give him a checklist of every
change, so he can check each one, ask for changes, and tick it off when happy. Since 17 Nov
the checklist is a Sheets artifact, "Construction demo: changes to check"; for the merge on
19 Nov he asked for it in the chat instead.
His second standing rule (17 Nov, decision 107): when building, ask as many questions as
possible first, to get as much of his input as possible; if he is away, build the default
and put each open question in the checklist as a "Decision for you" row.

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
left as it is) at his word. A second part followed the same day (decisions 139 to 147, and
"Invoicing, part two" further down): the aged-debt squares as filters, a Back button on
every screen, the export for Sage only with sales and purchases, supplier invoices approved
and then paid, subcontractors in their own section of the portal, and a confirm box on every
approval and payment. A third part followed the same day (decisions 148 to 160, and "Reports
and Customers" further down): a Reports section after the HVAC reporting demo (the overview
with five figures, sales by customer, the ten most profitable jobs paid in full, where the
money goes, gross margin on every job finished in the last 12 months, tender conversion by
kind of work), a year of past work in the sample data so the reports have something to
show, and Customers as a section of its own in place of Sales, Clients (so the Customers
half of step 4 is built on his copy). A fourth part followed the same day (decisions 161 to
184, and "Compliance, 18 Nov" further down), after the HVAC compliance demo: Compliance as a
section of its own after Plant, so step 4 is now built on his copy. Every expiry in one list
(people's tickets, vans and driving licences, machinery checks and scaffold inspections,
company papers, subcontractors' papers), a screen per area, training courses, and what stops
work: someone with a Safe Pass or trade ticket out of date cannot be planned or marked on
site, and a machine past its checks cannot go to a site. Training tickets moved there from
People. 355 automated tests and 992 browser checks pass on that branch; one check in
`review_check.py` (Week ahead) fails on a Wednesday on `main` too, so it is not from this
work.

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
| 64 | Team chat layout | Like Ping in the reference demos (Oisin, 16 Nov: "team chat is going to be our equivalent of their ping, and I want it the exact same as theirs"). A side panel with the app, Channels (a # before each) and Direct messages, each with an unread count; the open conversation with a header (name, link to the project for a site channel, members), messages under day lines with initials, name and time, @mentions in bold, and a message box along the bottom ("Type a message... Use @ to mention", a paperclip, a round send button; Enter sends, Shift and Enter for a new line, @ offers the channel's members). No AI in it: Oisin first picked a triage view (option C of three pictures: messages picked out, tagged, passed on, replies drafted) and it was built, then he chose to drop the AI part when moving to Ping. That build is in git history (commit 7d8fc46) |
| 65 | Team chat app | Switchable, like the accounts package (Oisin, 16 Nov, the recommended option of three: switchable, Teams only, Slack only): Admin > Connections has Microsoft Teams or Slack, Teams by default. It is a preference (`Brand.chatApp`), so it survives Reset demo data. Teams shows channels by name ("C720 Ardmullen House"), Slack as c720-ardmullen-house (`channelLabel` in `src/lib/chat.ts`) |
| 66 | Email layout | Like Gmail, as in the reference demos (Oisin, 16 Nov: "keep the Gmail the exact same as they have it"; Centra and Bryan Lynch are the fullest). A side panel with the account, Compose, Inbox, Starred, Sent, Drafts, Archive, and the labels (our tags) with unread counts; the list with Focused and Other tabs, Search mail, select-all and Newest or Oldest, rows grouped by day (Today, Yesterday, Earlier this week, Older), each with a checkbox, a star, initials, sender, subject, a preview line, any attachment, the time and the label; picking rows offers Archive, Mark as read and Mark as unread. An open email replaces the list, with a toolbar (Back, n of N, newer and older, Archive, Star, Mark as unread, Label, Move), the email, Linked chips, the reply drafted for it (Send reply, Discard, Forward), and a Summary panel (summary, action items, Passed to, Discuss in Team chat). Compose files a new email under Sent. "Passed to me" and the Unread filter went; Passed to stays in the Summary panel |
| 67 | Gmail and Ping, round two | Oisin, 17 Nov. Email: emails are dragged onto a label (to label them) or onto Inbox, Archive or Starred, as in Gmail; picked emails go together; the same is in a Label menu for picked emails, for phones and keyboards (`dropOn`, `DRAG_TYPE` in `Inbox.tsx`). Compose has small "Add Cc" and "Add Bcc" buttons under To, which open those boxes (`cc`, `bcc` on `Mail`). Team chat: group chats go by name alone, with no #, under "Group chats" ("replace the channels with the hashtags with just the name of the gc"); a New button (pencil, top of the side panel) opens "New message or email": find a person by name or job, then Message (opens or starts a direct message, `startDirectMessage`) or Email (opens Compose in Email addressed to them); "New email to anyone" too. A message sent late at night is stamped one minute after the conversation's last, so it never lands above this morning's (`chatStamp`) |
| 68 | Team chat New message | Oisin, 17 Nov: the button at the top of Team chat's side panel reads "New message" with a plus in a circle (was a pencil with no words). It still opens "New message or email" |
| 69 | Site phone: two phones | Oisin, 17 Nov. The Site phone screen has two sign-in options, Operative and Site manager (`Phone of` tabs; a signed-in site manager gets his own, an operative only theirs). The operative's phone is as it was, plus 73. The site manager's opens on the jobs he runs (`managerJobs` in `src/lib/roster.ts`, live first, then not started), scrolls, and a job opens Timesheet (today's crew: Full, Half, Not in, overtime, Send today's time stamps), Week ahead (next week day by day: take off, add someone free), Month ahead (a count per working day), Send a photo, Report extra work, Make a request (was "Ask for something"), and Claim a reimbursement. No My week for him. To make planning work there, "Plan the week ahead" is now on by default for the site manager level, which still only reaches the sites they run (roles.ts) |
| 70 | Schedule: leave | Oisin, 17 Nov: a Leave group in Schedule's sidebar with Holidays (approved leave: off today, coming up, back in the last 30 days, with working days and usual sites; Record leave) and Holiday requests (each request as a card with working days, days already planned, who else is off then, Approve or Decline for anyone with "Approve leave"). The same requests are still in People, Holidays and Admin, Requests (`src/modules/schedule/Leave.tsx`, `leaveGroups`, `overlapping`) |
| 71 | Week ahead grid | Oisin, 17 Nov: one table, sites (code, name, site manager) down the left, the five days with dates across the top, and in each cell everyone down for that site that day, one line each, so the cell grows. Not placed stays on the right. Names are dragged from Not placed onto a cell (plans them; half a day if they have a half day elsewhere), or from one cell to another site on the same day (moves them). Dropping someone with a full day elsewhere asks: Move, Put on both (double books), Cancel (`dropOutcome` in `src/lib/roster.ts`). Each cell has an Add button (everyone free that day, one tap) for phones and keyboards; clicking a name opens the person box as before. While dragging, cells say what a drop does. Days gone show who attended. The per-site tables and the trade-then-person picker went |
| 72 | Attendance history | Oisin, 17 Nov: a Period box where the month buttons were (Last week, This week so far, then this month and five before), beside All sites; and a fourth view, Per site, laid out like the plant overview: a heading per site (code and name, site manager, people and days), then each person's full days, half days, overtime and days in all; sites running in the period with nothing recorded are listed after (`periodDays`, `periodOptions`, `perSite` in `src/lib/roster.ts`) |
| 73 | Operative phone additions; Files out of the bar | Oisin, 17 Nov. A profile button top left of the phone: details, employee number, tickets, holidays with a Request holidays form (goes in as Requested, `requestLeave`), reimbursements, and Sign out (back to the sign-in choice). A Driving check: the vehicle, then three sections (cab and driver safety, vehicle walkaround, trailer and load safety), each item OK or Defect, a defect needs a note, Submit once all are answered (`src/lib/driving.ts`, `submitVehicleCheck`, `db.vehicleChecks`; the layout from his reference picture of a plant hire app). Claim a reimbursement: what for, amount with VAT, day, site, receipt photo; it waits for the director in Admin, Requests (`claimExpense`, `decideExpense`, `db.expenses`). The check and the claim are in English only; only the button names are translated. Files is out of the bottom bar (his pick from three); the section still opens at /files and each project keeps its Files tab |
| 74 | Payroll, from the Oldstone call | The call with Oldstone's finance and admin on 16 Nov (notes in his upload, not in the repository). Agreed there: the dashboard records and checks hours and sends them to Sage Payroll as a file; rates, tax, USC, pension, union fees and the bank payment stay in Sage. So: every employee has a Sage employee number (`Person.sageNo`, on the register and the add form; Aoife Kinsella has none in the sample data, to show the flag); People, Payroll export shows a week (last week by default) with each day's mark, basic hours on a 39 hour week (8 Monday to Thursday, 7 Friday, half for a half day, `src/lib/payroll.ts`), overtime and total, flags (no Sage number and days not sent block that person; under 39 hours and two sites are notes), and "Export hours to Sage Payroll" (new permission `exportPayroll`, managing director and accounts) which downloads the CSV and records the week (`db.payrollExports`); since 17 Nov only after a manager has checked the week (decision 97). Attendance history's payroll totals show basic, overtime and total hours, no longer "paid hours" at time and a half. The CSV columns are a placeholder until the sample payroll file from Oldstone's accounts arrives |
| 75 | Invoicing, from the Oldstone call | Supplier invoices carry what is keyed into Sage by hand today: file number (`fileNo`, 11400 up), nominal code per cost heading (5000 materials, 5100 carriage, 5200 plant hire, 5201 tools, 5300 subcontractors, 5900 other), the project number as the department (686 for C686; sales lines now use the number too), tax code (T1 23%; T13 for 13.5% is a guess to check), supplier account (eight capitals). Anything over 500 euro gross waits for the director's sign-off (`SIGN_OFF_OVER`, Admin, Requests and on the invoice) before it can go. Accounts export has a Supplier invoices part: waiting for sign-off, ready to go, and the purchase file in each package's layout (`src/lib/purchases.ts`). Job costs has "Download profitability report" (valuation of work done, wages, materials, plant, subcontract and other, profit, margin), the report built by hand in Excel today. VAT returns, bank reconciliation and payroll stay in the accounts package (said on the page). Not built: subcontractor invoices checked against their timesheet days |
| 76 | Ask AI mark | Oisin, 17 Nov: two amber sparkles (`src/ui/AiSparkle.tsx`, from his picture) on the Ask AI button, the panel heading and the Ask AI line in search; the only colour besides the accent, on purpose. The question box reads "AI Assistant" in faded text until something is typed |
| 77 | Requests from the crew | Oisin, 17 Nov (phone round). The operative's "Ask for something" is "Make a request" in all five languages and goes to the site manager first, not the office (`heldBy: "site"` on `SiteRequest`). The site manager sees it on his phone inside that job ("Requests from the crew", with a count on the job card) and on his desktop (Projects, Requests: "From your crew"; the project's Requests tab), and either forwards it to management as his own request (`forwardCrewRequest`: he becomes `requestedBy`, the operative is kept in `raisedBy`, and it joins Admin, Requests) or marks it dealt with (`closeRequest`, shown as "Dealt with on site"). Only the project's own site manager gets the two buttons; the office sees who each one is with. The office's counts (overview, Admin, plant "asked for", Ask AI) leave out requests still with a site manager (`withOffice` in `src/lib/requests.ts`); the number beside Requests in the Projects sidebar is every open request on the projects that person's screen covers (`openRequestCount`, which also fixed a site manager seeing the whole firm's count) |
| 78 | Site manager phone, second pass | Oisin, 17 Nov. The phone never changes the plan ("not editing ability on the mobile app, just a request button"): Week ahead and Month ahead show who is down; in Month ahead a day is tapped to see who; each day to come has "Request someone for this day" (a named person, listed with where they are that day; `requestPerson`, a `SiteRequest` with `personId`). In Admin a yes puts a free person on the plan for that day and closes the request; if they are busy elsewhere it stays open for the office (`decideSiteRequest` returns "planned" or "open"). "Plan the week ahead" is still on for site managers on the desktop (on the Oldstone call the site managers do the planning); Oisin has not ruled on that yet. Also: Site instructions for the day (`DayInstruction`, `setDayInstruction`; today or the next working day; one per site and day); the front page has the profile button (details, tickets, Request holidays, reimbursements, Sign out) and, apart from the jobs, Driving check and Claim a reimbursement ("stuff should be separate"), so the job no longer has the reimbursement. Files: `src/modules/site/ManagerPhone.tsx`, with the sheets both phones share in `sheets.tsx` |
| 79 | Operative phone, second pass | Oisin, 17 Nov. The site and site manager shown are the ones for that day (`siteOn`: where they were marked in, else where they are planned, else their site list). The manager's name opens his details with Call now (`ManagerCard`); the Call button beside it is still one tap. "Today's instructions" (the site manager's for the day, in English as he wrote them) sit above the standing site instructions. My week shows the site manager beside each site, tapped for his details and Call now, and any instructions already up for that day |
| 80 | Rest of the week | Oisin, 17 Nov: on the Week ahead, the first time someone goes on a site in the week (dragged from Not placed, moved from another site, or the Add button), a bar above the grid asks "Here for the rest of the week?" with Yes and No. Yes plans the days after it where they are free (a half day where half is taken); after a move it moves the days they were wholly on the old site; days on a third site are left, and the bar says so (`planSteps`, `firstOnSite` in `src/lib/roster.ts`, `planDays` in actions). It is a bar, not a dialog, so it does not get in the way of the next drag |
| 81 | Month ahead grid | Oisin, 17 Nov, in the layout of his own Oldstone planning tool (two screenshots): a row per site (code, name, site manager, dates), a column per day with weekends greyed and narrow, and the names in each square. Days gone show who was on site from the timesheet; days to come show the plan, the same `db.plan` as the Week ahead, so each updates the other (`dayRoster`). It scrolls sideways inside its own panel with the site names and day headings fixed, opens on today, and has Week buttons to scroll. Clicking a square opens the day: who is planned (take off), Add person (search by name or trade, where each is that day, people on leave cannot be picked), "Repeat each weekday until", a line saying what will be added, and "Add to C7xx". Someone with a full day elsewhere is added anyway and shown in red on both sites, as in his tool. The three total rows stay. `src/modules/schedule/Month.tsx` |
| 82 | Who is where, per site | Oisin, 17 Nov: a "Per site" view beside "On site", laid out like the plant overview: a heading per live site (code, name, site manager, county, how many on site), then who is there today with status and phone; then "Not on a site today" |
| 83 | Attendance history layout | Oisin, 17 Nov (later): "have the layout per site like the plant format as well as the other features, put this option in the top right corner" (with a picture of the plant overview's Everything or Needs attention switch). So Per site is no longer a fourth view: it is a layout switch at the top right, Everyone or Per site, and it applies to all three views (Totals for payroll, Day by day, Corrections), which now sit beside the Period and Site boxes. Per site totals carry the payroll columns (full days, half days, basic, overtime and total hours) with a total per site (`perSite` in `src/lib/roster.ts` now adds basic hours) |
| 84 | Held fits the page | Oisin, 17 Nov (later): "remove the drag at the bottom and just make it fit the page without having to scroll across". The reason an invoice is held was one long unbroken badge in its own column, which pushed the table wider than its panel. It is now on a line of its own under each invoice (`under` on `SalesTable` in `Invoicing.tsx`); text columns wrap; below 1024 pixels each invoice is a stacked block instead of a row (seven columns do not fit beside the sidebar there). The same table serves To invoice, Invoiced and Accounts export |
| 85 | General request | Oisin, 17 Nov (later): the site manager's phone has "Make a request" on its front page, under General, for a request that is not for one site. `SiteRequest.projectId` can be null (with `requestedById`, so it stays on the asker's own list), and there is a fourth kind, "other" (shown as "Something else"), offered to site managers on the phone and on a project's Requests tab; the operative's form keeps to people and plant. A general request goes straight to management (Admin, Requests, marked "General, not for one site"), is on the office's Requests list and the asker's own (`requestsFor` in `src/lib/requests.ts`), and the phone lists his own with the office's answer. Not seeded: there is none until someone makes one |
| 86 | One plan, shown one way | Oisin, 17 Nov (later): "make sure the week and month ahead all syncs up together through the different apps and updates accordingly". They already shared `db.plan`; what differed was how a day was read. Now one rule everywhere a site's day is shown, `dayRoster` (the timesheet for a day gone and for today once the site has marked anyone, otherwise the plan): the office's week grid (which used to show today empty until someone was marked), the month grid, the site manager's phone (job card, Week ahead, Month ahead, the day list, site instructions) and, read from the person's side, `personDay` for the operative's My week, which now shows days gone from the timesheet and has a This week or Next week switch so the week being planned can be seen. `src/data/plan-sync.test.ts` checks every way the plan changes against every way it is shown |
| 87 | Site access | Oisin, 17 Nov (later): "In admin add the ability to decide which sites each site manager has access to". Admin, Site access (under Roles and access; the managing director's alone, `mdOnly`): a row per site that is live or about to start, a column per site manager, a switch in each square; "Runs it" where they run the site, which cannot be switched off. `db.siteAccess` holds one row per person and site given (`setSiteAccess`); `opensSite` in `src/lib/site-access.ts` is the rule, used by `scope` in `access.ts`, the phone's jobs (`managerJobs`), the Requests count, and who may handle a crew's requests. A given site is theirs in every way their level allows: project page, timesheet, plan, requests from its crew, its group chat (they join and leave it with the switch), the job on their phone (marked "Run by ..."). The crew still see whoever runs the site as their site manager. People with "See every project" are listed under the grid, since there is nothing to pick. Sample data: Shane Culloty can open C725, which Róisín Garvey runs. Changing who runs a site came the same day (decision 94) |
| 88 | Sharing the preview | Oisin, 17 Nov (later): "make this up to date link be able to be opened by other people also with the right username and password". Claude's tools cannot change who can open an artifact; Oisin does it himself with Share on the artifact's page (people invited by email, his organisation, or anyone with the link). What Claude changed: the preview's sign-in page used to print "The default is username demo, password demo", which hands the login to everyone the link reaches. `.env.preview` now sets `VITE_DEMO_USERNAME` and `VITE_DEMO_PASSWORD_SHA256` (the hash of "demo" for now), which switches that line off; the login is still demo / demo until he picks his own (`npm run hash-password`, paste the hash there, rebuild). The login is checked inside the page, so it is a courtesy gate, not protection: anyone who can open the artifact has the whole app, and the Share setting is what decides who that is. Prospects belong on demo.vardil.com behind Cloudflare Access (Aodhan's). Each viewer has their own sample data in their own browser. Once the artifact is shared, republishing it needs `shared_live` set to its read mode (and its title when public) |
| 89 | Overtime rates (one rate a day and the early starts changed by decision 100) | Oisin, 17 Nov (round seven), confirmed on the call with Oldstone's managing director the same day: overtime is at time and a half or double time. Time and a half: Monday to Friday after normal hours up to midnight, and Saturday 8am to 12 noon. Double time: midnight to the normal 8am start, Saturday after 12 noon, all Sunday, bank holidays. `Attendance.overtimeRate` (2 for double time, absent for time and a half; one rate for a day's overtime), picked when marking: "Full + time and a half" or "Full + double time" on the timesheet and in the Correct dialog, and a rate switch on the site manager's phone. The rates are written out on the Timesheet (`OvertimeRules`, `OVERTIME_RULES` in `src/lib/overtime.ts`), so whoever marks time can tell which applies. Carried into: timesheet cells and corrections ("Full +2h x2"), the week and month grids, Attendance history (Overtime x1.5 and Overtime x2 columns, for everyone and per site), Payroll export (two columns; the Sage file has `Overtime hours x1.5` and `Overtime hours x2`), labour cost (double time counts twice), the operative's My week, and Ask AI's summary. Sample data: Derrybawn Bridge (C724) overtime is double time (6am starts on Tuesdays and Thursdays, to set out traffic lights). Not built: the timesheet is Monday to Friday, so Saturday, Sunday and bank holiday hours cannot be recorded yet; the rate is picked by a person, not worked out from clock times |
| 90 | A note with every no | Oisin, 17 Nov: "if you decline somebody's request for holidays add an optional note to say why" and "if an approval needs to decline for anything add an optional note". Every Decline or Discard opens a small dialog with a "Note (optional)" box (`DeclineDialog` in `src/ui`); the button works with the box empty. Kept as `declineNote` on `Holiday`, `SiteRequest`, `SpendRequest` and `Expense`, and `discardNote` on `Approval` (a holiday also keeps `decidedBy`). Asked in: Schedule, Holiday requests; People, Holidays; Admin, Requests (leave, site requests, spending, reimbursements); Approvals on the overview (Discard). Shown to whoever asked: the phone profile (holidays, reimbursements), the site manager's phone (requests), Projects, Requests and a project's Requests tab. Also: a Declined list under Schedule, Holiday requests; "Why it was declined" in People, Holidays; Answered in Admin (reimbursements joined that list); the Done tab in Approvals; the activity log and project history. Moving a discarded draft back to waiting drops its note. Not given a note: recording that a client declined a quote, and discarding a drafted reply in Email |
| 91 | Email: under a label, out of the Inbox | Oisin, 17 Nov: "remove email from inbox when inserted into category like how gmail operate". `Mail.folder` gains "Filed": an email dragged onto a label, or moved with "Move to" (picked emails) or Move (an open email), takes the label and leaves the Inbox (`fileMail`; `filedFolder` in `src/lib/mail.ts`). It is found under its label, and under Starred and Drafts as before; not in Archive. It keeps whether it was read, so a label's unread count includes it (`labelUnread`). Under a label, emails still in the Inbox carry an "Inbox" chip, as in Gmail. "Move to inbox" brings one back with its label. The open email's Label menu only changes the label and leaves the email where it is, so a wrong tag can be put right without filing it; the picked-emails menu was "Label" and is now "Move to" |
| 92 | Email attachments | Oisin, 17 Nov: "add attachments for composing email". Compose has "Attach files": pictures (shrunk to JPEG) and PDFs up to 1.2 MB, five at most (`readAttachment` in `src/lib/image.ts`, `MAX_ATTACHMENTS`), kept in the browser like photos. Each shows as a chip with its size and a Remove button. Sent emails list them (`Mail.attachments`, `attachmentsOf`); one opens to look at with a download (a PDF is only ever a download). Forward carries the email's files. Other file types are refused with a plain reason |
| 93 | Roles and access as ticks | Oisin, 17 Nov, with a picture of the Roles page of an earlier app of his: "make our roles and access more similar to this previous app i made; where it ticks what they have access to or not". By role: a card per level (how many people, what the level does, who; a name opens By person), then one grid (money, permissions, departments) with a tick or a dash per level (`Tick` in `src/ui`). Unlike his page, the ticks can be changed: each one in a light box is a checkbox, a click or the space bar changes it at once, with a message. The managing director's column and a level's home department are plain ticks that cannot be changed. By person shows the level's tick beside the person's. The layout is from his reference; the code and wording are ours. DESIGN.md prefers lists to rows of cards; kept here because each card holds real content and he asked for it |
| 94 | Who runs each site | Oisin, 17 Nov: "make it easier to assign which site manager should be at which site?". Admin, Site access: each site has a Site manager box (`setSiteManager`): pick a name and they run it from then on (project page, timesheet, plan, requests from its crew, the job on their phone, the name the crew see, the site's group chat); the one before no longer opens it unless their name is ticked. The choices are everyone at site manager level (`siteManagerChoices` in `src/lib/site-access.ts`). Who else can open a site is a tick under their name (it was a switch). Above the grid, a card per site manager: how many sites, which they run, which they also open. This is the "changing who runs a site" that decision 87 left unbuilt |
| 95 | Fleet, made easy | Oisin, 17 Nov, with three pictures of his own Oldstone fleet tool: "for the fleet section within the Plant tab make very easy to use with features like this". Plant's sidebar has one Fleet entry (with how many vehicles have a paper out of date), and Fleet is one page with three tabs, each an address of its own: Vehicle stats (`/plant/fleet`), Vehicle documents (`/plant/fleet/documents`), Repair spend (`/plant/fleet/repairs`); the old addresses redirect. The same three buttons are at the top right of every tab: Upload document (the main one), Add vehicle, Edit vehicle. Vehicle stats: "Search registration or model" (however the registration is typed) and, per vehicle, driver, mileage, tax, test, insurance, next service, the driver's last check from the phone (decision 73; a defect shows in red with what was reported) and repairs in the last 12 months. Upload document is one dialog: choose the file, and a registration in its name picks the vehicle and says so; the kind (repair invoice, motor tax, test, insurance) is read from the name too (`readFleetFile` in `src/lib/fleet.ts`: rules, not a model); a repair joins the repair spend, a certificate moves the vehicle's date. Edit vehicle asks which vehicle, then registration, make and model, kind, base, driver and mileage (`updateVehicle`; a registration another vehicle has is refused); Remove from fleet moved there. Add vehicle takes a driver and mileage. Vehicle documents: the search and an "All categories" box. Repair spend: 1 month, 3 months, 6 months, 1 year (to start), 2 years, 5 years, by vehicle and by garage (`repairSpend`, `SPEND_PERIODS`); the by-quarter table went. With no vehicles every tab says how to start. Sample data: a driver's check for every driven vehicle, two with a defect (`seedVehicleChecks`). The layout is from his tool; the code and wording are ours |
| 96 | Reimbursements ready to pay | From the call with Oldstone's managing director on 17 Nov (notes in Oisin's upload, not in the repository): once the director approves a reimbursement, it should be ready for the office staff to export and pay. People, Reimbursements (`src/modules/people/Reimbursements.tsx`, rules in `src/lib/reimbursements.ts`): approved claims waiting to be paid, with the Sage employee number, what for, site, amount and who approved; "Export for payment" downloads a CSV, one row a claim, and stamps each claim (`exportExpenses`, `Expense.exportedAt`, `exportedBy`) so none goes twice; then they are listed under Sent for payment. The page shows the file before it goes. It uses the `exportPayroll` permission, now worded "Export hours and reimbursements for payment" (managing director and accounts). Admin, Requests says an approved claim is on the office's list and links there; the phone profile shows "On the office's list to pay", then "Sent for payment". The People sidebar shows how many wait. Sample data: one approved and waiting, one already sent. The bank payment itself stays outside the demo |
| 97 | Payroll: a manager's check, then the export by hand | From the same call: an overall manager looks over the week's hours before they go to Sage, and the export stays a person's click ("we won't automate that"). People, Payroll export: "Mark the week as checked" (new permission `checkPayroll`, "Check the week's hours for payroll": managing director and contracts managers by default; the accounts office exports but does not check, so it takes two people unless the managing director does both). Export is off until the week is checked, and a day corrected after the check means it is checked again (`weekCheck`, `payrollStage` in `src/lib/payroll.ts`; `db.payrollChecks`, `checkPayrollWeek`). A new note on a person's week, "A lot of overtime" (10 hours or more, `OVERTIME_TO_QUERY`), and on every row "Ask" with the name of whoever runs that person's site, which opens a Team chat direct message to them. The three steps are written on the page. It is a to-do on the overview (`src/lib/overview.ts`): for whoever checks, "Last week's hours are in from every site and ready for you to check"; for whoever exports, that they wait on a manager's check or are ready to export, with any reimbursements to pay; and the People sidebar shows a 1 beside Payroll export while last week waits. The overview still shows four facts at most, so while payroll waits the managing director's "invoices ready to go out" fact drops off |
| 98 | Overtime rates at the top; a filter in the history | From the same call, where the rates in decision 89 were confirmed and asked for at the top of the tab: the Timesheet's overtime rates are two lines in the page's heading, above the grid (they were under it). Attendance history has an Overtime box (All days, Days with overtime, Time and a half only, Double time only), which works on all three views and both layouts; the note says which days are counted |
| 99 | Invoices: going out or coming in | From the same call ("are these invoices coming in or invoices going out?"): Invoicing's sidebar groups are "Going out, to clients" (To invoice, Held, Invoiced), "Coming in, from suppliers" (Supplier invoices) and "Accounts" (Accounts export, Job costs), and each screen's first line says which way its invoices go |
| 100 | Overtime at both rates in one day; an early start is not overtime | Oisin, 17 Nov (round nine): "technically the employee could have a full time with overtime time and a half and double pay", and "if a site starts at 6am or 7am this not qualify for overtime it is just if they keep working from the day before". A day's overtime is two boxes of hours, one at each rate, with no clock times (his pick): `Attendance.overtimeHours` is the hours at time and a half and `doubleHours` the hours at double time (`overtimeRate` is gone). Marking is "Full + overtime", then the two boxes: on the Timesheet, in the Correct dialog and on the site manager's phone. Overtime begins once a normal day's hours are done (8, or 7 on a Friday), whenever the day began; double time after midnight is only for work that carries on from the day before (`OVERTIME_RULES`, `EARLY_START_NOTE` in `src/lib/overtime.ts`, written at the top of the Timesheet). This corrects decision 89, where Derrybawn Bridge's 6am starts were double time: the sample data no longer has them. Double time with no time and a half on a normal day is saved, with a warning beside it, and flagged for the manager's weekly check (his pick; `doubleWithoutHalf`, payroll flag "Double time, no time and a half"). Sample data: one night on C724 that ran past midnight (7.5 hours at time and a half, 1.5 at double time), and one deliberate slip on C722 (2 hours at double time and nothing else) |
| 101 | Weekend time stamp | Oisin, 17 Nov: "someone can be inserted for weekends but not normal so add a weekend timestamp button", and "for the weekends / bank holidays they could have whatever hrs all at overtime rate". A "Weekend time stamp" button at the top of the Timesheet, beside Send today's time stamps: the day (a Saturday, a Sunday or a bank holiday that has been, newest first), who worked (the site's crew to tick, several at once, and a box to add anyone from another site), and the hours at each rate. The rules are enforced (`restDayProblem`): Saturday, at most 4 hours at time and a half (8am to 12 noon) and the rest at double time; Sunday and bank holidays, every hour at double time. It is an `Attendance` row with `status: "restday"`: no basic hours, saved as sent in the name of whoever stamped it (`stampRestDay`); changing or removing one is a correction with a reason (`correctAttendance`). The grid stays Monday to Friday and the stamps are a list under it, "Weekend and bank holidays" (his pick of three). The Timesheet offers days back to the week before the one shown; the phone the last 14 days. "Anyone in the firm" (his answer) is built as any active operative; office staff cannot be stamped |
| 102 | Bank holidays | Built in and editable (his pick): `db.bankHolidays`, filled from rules in `src/lib/bank-holidays.ts` for last year, this year and next (Ireland's ten, St Brigid's Day rule included; the UK's eight with days in lieu when the region is switched). Admin, Bank holidays (`src/modules/admin/BankHolidays.tsx`): a year switch, the list, Take off, and Date plus Name plus "Add bank holiday" for a day the firm treats as one. A bank holiday on a weekday is named in the Timesheet's column, the week grid, the month grid and Payroll; nobody is marked a normal day on it in the sample data, and work on it is a weekend time stamp at double time. The demo's day skips built-in bank holidays as it skips weekends (`demoDay`). A week with a bank holiday expects 8 hours fewer before "Under n hours" is flagged (`expectedHours`) |
| 103 | Pay week Monday to Sunday | His pick: the weekend's hours belong to the week they end. Payroll export's week ends on the Sunday (the file's name and period end too), has a "Sat, Sun" column when anyone worked the weekend, and its check goes stale when any time stamp for the week is saved after it, not only a correction (the badge reads "Changed since X checked it"; `weekCheck` takes the attendance rows). Attendance history counts weekend stamps in a "Weekend days" column apart from full and half days, and its Overtime box is All days, Days with overtime, Days with time and a half, Days with double time, Weekend and bank holiday work |
| 104 | Weekend work on the plan and the phones | His pick: all four places. Week ahead: a "Weekend" section under the grid (by day and site; "Plan weekend work" with day, site and people; take off; a weekend gone shows who was stamped in and their hours; `planRestDay`). Month ahead: a weekend column opens out to show names only where someone worked or is down for it; the rest stay narrow grey strips. Site manager's phone: "Weekend time stamp" inside a job, and Saturday or Sunday in its Week ahead when anyone is down. Operative's My week: the weekend day when worked or planned. Sample data: two people down for C724 this Saturday and next; weekend work last Saturday (C724), last Sunday (C720), the Saturday before (C719) and the last bank holiday (C721) |
| 105 | Profitability | Oisin, 17 Nov: "there should be a profitability app that can be built now and will calculate the outgoings for employees and then will eventually link up the invoices when we sort them out". A department of its own in the bottom bar, after Invoicing (his pick), the managing director's alone and fixed, like Ask AI: not offered to other levels in Roles and access, and its address sends anyone else home. By site only (his pick): wages (basic, time and a half, double time), approved reimbursements for the site, outgoings for employees, and two measures (his pick: both), the labour allowed in the quote ("% used" beside the work done, or "over") and the contract value ("wages are x% of it", "Left after employees"). Live sites first, with a switch for Finished. A site opens to who its wages went to: rate an hour, days, weekend days, hours at each rate, wages, reimbursed. Wages are costed on the 39 hour week (8 hours Monday to Thursday, 7 on Friday, overtime at its rate), the same as Job costs, so a site's wages here equal its labour there by construction (`wagesOf`, `siteProfit`, `labourState` in `src/lib/profitability.ts`; `paidHours` in `project-costs.ts` now takes the date). Job costs is under Profitability for the managing director and stays in Invoicing for accounts (his pick; `notMd` on the sidebar item). Supplier invoices per job are to be linked later, at his word |
| 106 | Email drafts | Like Gmail (his pick): closing Compose (the X or Escape) keeps what was typed as a draft and says "Saved to Drafts"; Compose has Discard, Save draft and Send; a draft is under Drafts with the replies not sent, reads "Draft, to ..." with "Not sent", opens back into Compose ("Draft email"), and is used up when sent (`saveDraft`, `discardDraft`, `composeMail(d, id)`; `Mail.folder` "Drafts"). An email with nothing in it is not kept. Found while testing: the shared `Dialog` reported its own close as the person's, so onClose ran twice and two drafts were kept; a close the screen asked for is no longer reported |
| 107 | Ask many questions | Oisin, 17 Nov: "ask as many questions as possible when building these web apps to get as much user input as possible". Sixteen were asked before round nine was built (four rounds of buttons). When he is away, build the default and list each open question in the checklist as a "Decision for you" row |
| 108 | Overtime claims from the phone | Oisin, 17 Nov (round ten): "in the operative phone app make it possible to claim overtime and this will be sent to site manager phone where he approve or not and it will go into the timesheets"; it is optional and only for overtime ("they can say extra 2 hours that day or a previous day to make site manager aware ... they do not have to do this for normal hrs"). On the operative's phone, My hours and overtime has "Claim overtime" and a Claim button beside each day: the day (today and the 7 before it, his pick), the site (the one they were on that day), the extra hours in all, and an optional note (`claimOvertime`; `OvertimeClaim` in `db.overtimeClaims`; rules in `src/lib/overtime-claims.ts`). It goes to that site's manager: on his phone, a job's "Overtime claims" (a count on the job card), each claim starting split by the day's rule (`suggestedSplit`: time and a half on a normal day, 4 then double on a Saturday, all double on a Sunday or bank holiday), which he can change before Approve (his pick), or Decline with an optional note. Also on the desktop Timesheet, in the Overtime list, for anyone who may mark that site (his pick), with a count beside Timesheet in the People sidebar (`overtimeClaimCount`). A yes adds the hours to that day (`approvalEffect`, `decideOvertimeClaim`): onto today's mark if not yet sent, as a correction with "Overtime claim approved: ..." as its reason once sent, as a full day with the overtime where nobody marked them in, or as an overtime time stamp on a rest day; a half day is refused until put right. The operative sees each claim's state on the phone. Sample data: two waiting for Eoin Brosnan (C724, C719), the C724 night past midnight approved, one on C722 declined with a note (`seedOvertimeClaims`) |
| 109 | The Overtime list | "Weekend and bank holidays" under the Timesheet grid is now "Overtime" and lists all overtime on the site in the week shown (his pick: the week in the grid): weekday hours marked in the grid, overtime time stamps and approved claims, with how each came in and a total, then claims waiting and declined. Change opens the right correction for each |
| 110 | "Weekend" becomes "Overtime" | His pick, everywhere: Overtime time stamp (Timesheet and the site manager's phone), the Week ahead's Overtime section and Plan overtime work, which now also takes a weekday bank holiday. Log lines "Added an overtime time stamp", "Planned overtime work" |
| 111 | Bank holidays blocked as normal days | His yes to the open question, everywhere (his pick): no Add or drop on a bank holiday in the Week ahead grid (it says to use Plan overtime work), none in the Month ahead's day dialog, no normal day marked or corrected on one (`markAttendance`, `correctAttendance`, the plan actions use `isRestDay`). Adding a bank holiday in Admin for a day to come takes whoever was down for a normal day off the plan and says how many (`plannedOn`) |
| 112 | Site manager's phone timesheet | "add/edit timesheets even if it is already sent in ... filled out on the phone". A Day box from today back to the Monday of last week (his pick), Add someone to this site, today marked as before, and a Change button on a sent or earlier day, which opens the same correction as the office, with a short reason (his pick; `CorrectDialog` is shared from `Timesheet.tsx`). Once a week has gone to payroll only the office changes it (his pick): whoever has "Check the week's hours" or "Export hours", on the phone and the desktop (`weekExported` in `payroll.ts`) |
| 113 | My hours on the operative's phone | "let them see what hours they have been down for the one week back where they can check it is correct". A button of its own (his pick), "My hours and overtime" (translated as a button name; the sheet is in English): this week so far and last week, day by day as the timesheet holds it, with totals in basic, x1.5 and x2 hours. Hours only, no pay (his pick; `hoursWeek`, `hoursText`) |
| 114 | Attendance history per site first | It opens on the Per site layout; Everyone is the switch beside it |
| 115 | Month ahead in whole weeks | "for monday the 30th of November ... in November month planning and same for the other way for December". The grid runs from the Monday of the month's first week to the Sunday of its last (`monthWeeks` in `week.ts`), days from the months either side greyed and named (Mon 30 Nov in December, Fri 4 Dec in November). The site manager's phone month shows those days too |
| 116 | Profitability, round ten | "Labour allowed in the quote" removed everywhere (the column, the warning, the site dialog line, `allowed`, `usedPct`, `labourState`). Finished jobs (only, his pick) show Contract value, Wages, Reimbursements, Subcontractor invoices, Supplier invoices, Net profit and Net profit %: net profit is the contract value, agreed extras included, less all of those (his pick, `netProfit`, `netPct`). The invoices are the checked ones posted to the job, subcontractors (the labour heading) apart from everything else (`jobInvoices` in `figures.ts`), so the two add up to Job costs less the firm's own labour. A line above the table names any job at a loss or under 10% (`profitState`, `THIN_PROFIT_PCT`; his pick). Live sites keep wages, reimbursements, contract value and what is left after employees |
| 117 | Profitability: costs by heading | Oisin, 17 Nov (after round ten): "in the profitability in the by site include plant and hire, materials, and subcontractor for costs". Seven questions first; his picks: both tabs; a fourth column, Other, for carriage and anything else, so the columns add up; plant and hire from checked invoices only (plant still on hire and the firm's own plant count once invoiced); equipment (scaffold, generators, small tools) under Plant and hire, as on Job costs. `jobInvoices` in `figures.ts` now gives `plantHire` (plant and equipment), `materials`, `subcontractors` (the labour heading) and `other` (transport and other); "Supplier invoices" went. Live sites: Site, Wages, Reimbursements, Plant and hire, Materials, Subcontractors, Other, Total costs so far (replaces "Outgoings for employees"), Contract value, Left after all costs so far (replaces "Left after employees"; the same `netProfit` as a finished job's). Finished jobs: the same four in place of the two invoice columns, then Net profit and Net profit %. A site's box shows the costs line by line on both tabs. Headings and the wage lines wrap so both tables fit at 1280 pixels and wider; narrower, the table scrolls inside its panel |
| 118 | Who is where, any day | Oisin, 18 Nov: "have a per site view as in the attendance history ... for the Who is where in the schedule tab so it is easy to flick through and see who is at what site for that day". Laid out like Attendance history: Everyone or Per site at the top right (Per site first), then a Day box with Previous day and Next day arrows either side (weekends skipped; his pick), a Today button, a Site box and a Status box (his pick). Any working day from 13 weeks back to 6 weeks ahead (his pick: days gone and to come): a day gone is read from the timesheet, a day to come from the plan, today as before (marked, else planned, else on a site's list), the same rule as the week and month ahead (`whereOn`, `plannedLabel`, `whereDays`, `sitesRunning` in `src/lib/roster.ts`). "Planned" is called Not marked in on a day gone, Not marked yet today, Planned ahead. Each site's table has Name (with trade), Status, Day (full, half, overtime) and Phone; on a phone the Day and Phone fold under the status and the name. The day, layout and boxes are remembered (`useScreenState`, decision 127) |
| 119 | Fleet from Secure-All | Oisin, 18 Nov: "can we import in the fleet tab from the secure all with all the features". The Secure-All build's Fleet screens and rules (`src/modules/fleet/`, `fleet-spend.ts`, `renewals.ts`, `match.ts`, `sample-docs.ts`, `sample-pictures.ts`, `pdf.ts`, `ui/DocViewer.tsx`) replace ABC's Fleet page (decision 95). A department of its own in the bar after Plant (his pick), with its own sidebar: Repair spend (Overview, Invoices), Vehicles (Vehicles, Renewals, Damage reported, Vehicle documents), Lists (Garages, Drivers, Bases). Plant keeps plant only; the old `/plant/fleet` addresses go to the new screens. Garage invoices (`db.garageInvoices`) with a line per vehicle, To check or Checked, a note to put one back, warnings for a number entered twice and a repair again inside 30 days; a vehicle, an invoice and a garage each on a page of its own; renewals with the disc to tick on; damage reports with photos; garages with private notes; bases. ABC has no routes |
| 120 | Repair spend by base, driver and site | His pick: each repair is filed under the van's base, its driver, and the site that driver was on that day (`InvoiceLine.siteId`): the timesheet, else the plan, else for a site manager the site he runs (`driverSiteOn` in `roster.ts`). The overview's filters and bars are base, garage, driver and site, with the periods 1 month to 5 years (kept from ABC's Fleet, his pick). Repairs are not charged to a job's Profitability (he did not pick that) |
| 121 | Drivers are people | Drivers are people from People on the driver list (`Person.drives`, `drivesUntil`), worked out by `driversOf` in `src/lib/fleet.ts`; name, phone and email stay People's. Each has a driving licence and a Driver CPC (his pick; the CPC for the 7 tonne tippers), with an expiry and a copy, flagged in Renewals. Add a driver picks someone from People; Take off the list moves them to Left, history kept. A van's driver is picked from People in Add or Edit vehicle |
| 122 | Who may do what in Fleet | Contracts managers and accounts have Fleet; site managers do not by default (their phone has the checks and damage; switch it on in Roles and access). Adding and changing anything needs "Manage plant and fleet"; checking a garage invoice also "Handle invoices" (his pick: fleet managers and accounts) (`useFleetCan` in `modules/fleet/shared.tsx`) |
| 123 | Garage invoices stay in Fleet | His pick: not in Invoicing's Coming in list or the accounts export |
| 124 | AI reading | His pick: built. On the hosted copy an uploaded garage invoice, tax, test, insurance or licence paper is read by the model and fills the form for checking (`src/ai/read.ts`, `src/ai/reading.ts`, `functions/api/read.ts`, behind Cloudflare Access like Ask AI). For anyone with "Manage plant and fleet" (his pick), checked on the page; the server checks the Access sign-in (a real build checks the person there too, marked REAL BUILD). On his preview and any copy with no server it says so, and the file's name is read instead for a registration and a kind (`readFleetFile`, `readingFromName` in `upload.tsx`; kept at his word). `public/_headers` allows frames from `blob:` so a kept PDF shows in the browser's own viewer |
| 125 | Kept from ABC's Fleet | His picks, all four: the next service per vehicle (shown on its page and flagged in Coming up), the trailer section of the driving check, the periods 1 month to 5 years, and reading the file's name |
| 126 | The phones | Both phones (his pick) have Report damage (where, what happened, up to 4 photos from the camera or the phone, or a drawn sample) and Send a licence (driving licence or Driver CPC, front and back, the date it runs to, or a sample sheet), on the operative's front page and under the site manager's Vehicle and expenses (`src/modules/site/fleet-sheets.tsx`). Damage goes to Fleet, Damage reported; a licence goes on the record at once, flagged until the office ticks Checked. The Driving check button says whether today's check on their van is done. The sheets are in English; the two button names are in all five languages. Not taken across, at his word: the wellness check and scan a checkpoint |
| 127 | What the office receives | His pick: beside the phone, for the office (`src/modules/site/OfficeFeed.tsx`, rules in `src/lib/ops.ts`): everything the phones have sent since yesterday evening, newest first (checks, defects, damage, licences, requests, extras, photos, overtime and reimbursement claims), each opening its screen; on top, Needs a look: damage and defects, then vehicles with a driver and no driving check yet today once it is past 09:00. Sample data: every driven van checked this morning but two |
| 128 | Back button and To do | His picks. Back in the top bar, left of the search box, for the whole app: to exactly where you were, screen, filters, tab and height, also after a reload (`src/app/trail.ts`, `src/app/screen-state.ts`, per role). To do on the Dashboard under the AI overview, across the page: the signed-in person's own list, what and when, ticked off when done; a renewal goes on it with "Add to my to-do" and is ticked off once recorded |
| 129 | Sample fleet | About 20 vehicles (his pick): the twelve vans ABC had, with the same drivers, and eight more (the managing director's car, two more tippers, crew vans, a leadwork van, two pool vans), two removed; six bases (Oranmore yard, Head office, Clondalkin, Naas, Ennis, Waterford), eight garages, 18 months of garage invoices (at most ten repairs a vehicle; one duplicate; one repeat repair), a paper per renewal, five damage reports (three new), licences for 20 drivers (a CPC out of date, one due, a licence from the phone to check), garage notes and three to-dos. Drawn from its own random numbers, so nothing else in the sample data moved (`src/data/seed/fleet.ts`) |

Decisions made by Oisin on his copy, 18 Nov 2026 (asked with question buttons; he picked the
recommended answer each time):

| # | Question | Decision |
|---|---|---|
| 130 | Invoicing section | Built from a call with Majella Walsh of Oldstone (16 Nov: how she ran Sage payroll and Sage 50 Accounts by hand) and five of his reference apps (HVAC, Costello Doors, Bryan Lynch, distributor, dairy; layouts and features only, as decision 61). Sections for client, supplier and subcontractor invoices, and all invoices by site. Subcontractors and clients use the portal for each job. Sage stays: the demo exports to it and never does VAT returns, payroll or bank payments ("if our product touches the tax man" a CFO will not trust it). No RCT, retention or payment applications for now |
| 131 | Opening a client invoice | A full page, not a pop-up or a side panel: the invoice as paper on the left; the client, the project, emails, comments and history on the right; the buttons along the top |
| 132 | Changing where an invoice stands | On each row (Send, Mark paid, Undo paid, and a menu for the rest), with tabs over the list: All, Drafts, Held, Sent, Overdue, Paid. Marking paid can always be undone |
| 133 | Send to client | Email with the PDF and the client's portal together in one press; either can be unticked each time |
| 134 | "Client problems" | Invoice queries: a client questions or disputes an invoice by portal, email or phone; it is not chased until accounts answer and settle it. (In place of "Returns" in the Bryan Lynch app) |
| 135 | Subcontractors in the portal | A preview inside Portal first ("What a subcontractor sees", with a viewing-as switch). No seventh sign-in role yet. Not built yet |
| 136 | Subcontractor hours | Their own section on the site timesheet, marked by the site manager; each subcontractor invoice is matched against it and differences flagged (Majella: "your subcontractor could tell you anything"). Not built yet |
| 137 | Clients and invoices in the portal | Open and download the PDF, ask about an invoice, say payment has been sent, and send a document (a purchase order or payment certificate). Built |
| 138 | Supplier invoice approval | Accounts approve up to 500 before VAT; above that the managing director approves; changeable in the app. Built in part two (decision 142) |

Decisions made by Oisin on his copy, later on 18 Nov 2026, after looking at part one (asked
with question buttons, the layout ones with sketches of each option):

| # | Question | Decision |
|---|---|---|
| 139 | The squares over Client invoices | Each one is a filter: Owed to us, Not yet due, 1 to 30, 31 to 60, Over 60 days late. Pressed again, it lets go |
| 140 | Back button | In the top bar at the far left, before the firm's name, on every screen of the app and on a phone (option A of three: top bar, above each page title, top of the sidebar). It goes to the screen that was open before, across departments, and is greyed out when there is none |
| 141 | Accounts package | Sage only, and called Sage, not Sage 50. The choice of Sage 50, Xero or a spreadsheet is gone from the export page and from Settings (this undoes decision 16 on this copy). The export page is laid out like his HVAC app: a line saying what the day book is and its nominal codes, Download CSV on the right, then the rows. He picked "screenshot plus Dept" for the columns (Majella splits jobs in Sage by department) and "one list, sent ones marked" over two tabs. It carries sales and purchases |
| 142 | Supplier invoices | Checked by accounts, then approved: by accounts up to 500 before VAT, by the managing director above (asked again, since his message said "approved by Managing Director": he kept the limit). Approved invoices go to a page of their own, To be paid, where accounts pay and then mark each one paid |
| 143 | Subcontractor invoices | Approved by the manager of the site they are for, or the managing director, whichever comes first, any amount. Accounts never approve them ("only the site knows the work was done"). The site manager approves on a new page in Projects, since they cannot open Invoicing |
| 144 | The portal | Two sections, Clients and Subcontractors. Several subcontractors share a site, so office staff pick whose portal they are looking at from a list on the left: every site with its subcontractors one under the other (option A of two; the other was a drop-down). Each subcontractor sees only their own. Still no subcontractor sign-in (decision 135) |
| 145 | Confirm | Every Approve and every Mark paid opens a box that says what will happen, with Cancel and "Confirm approval" or "Confirm paid". Client invoices too. Mark paid can still be undone |
| 146 | Telling them it is paid | The client's or subcontractor's portal says so every time, at the top and on the invoice. The confirm box also has a tick to email them (a receipt for a client, a remittance advice for a subcontractor), filed under Email, Sent. His words: "Portal notice and when marked email; an option to also send email to them". It starts ticked |
| 147 | Subcontractor hours | Decision 70 (subcontractors on the timesheet, invoices matched against the hours) waits for the next round |

Decisions made by Oisin on his copy, later still on 18 Nov 2026, from the HVAC reporting demo
(`reporting-hvac.wacz`; layouts and features only, as decision 61), first in his own words and
then with question buttons (he picked the recommended answer unless it says otherwise):

| # | Question | Decision |
|---|---|---|
| 148 | Where Reports lives | Its own tile in the bar, between Invoicing and Portal. Sidebar: Overview, Sales by customer, Gross margin, Tender conversion |
| 149 | Who sees Reports | The managing director by default, switchable per level in Admin, Roles and access. What it shows follows that level's money settings (no values: no sales or overdue; no margins: no margin figures, top 10 or gross margin page) |
| 150 | Left out of the HVAC reports | Sales by category, sales by rep, sales by brand, project pipeline, supplier performance, stock value, slow movers and debtors ageing ("not useful"; the aged-debt squares on Client invoices do that job). Categories only as the jobs on the gross margin page. The HVAC tiles on deliveries and quality are not a contractor's figures |
| 151 | Figures across the top | Five: Tender win rate (in place of Quote win rate), then his four picks from the options: Average margin on paid jobs, Sales in the last 12 months, Overdue from clients, Jobs finished on time |
| 152 | Tender win rate | By number, over the last 12 months: tenders won of tenders decided (answered in that time), with the value won beside it. Tender conversion is split by the kind of work, the rate book the tender was priced from (`Quote.kind`) |
| 153 | Most profitable jobs | Only jobs paid in full: closed, and every invoice on the job paid, the last payment in the last 12 months (his pick over "closed or invoiced"). The top 10 by margin %, with Job, Price, Cost, Margin and Margin %. Cost is the actual cost from Job costs, headed Cost, not an estimate |
| 154 | Where the money goes | Every job cost in the last 12 months, as in the HVAC example: labour (the timesheets at each person's loaded rate), materials, subcontractors, plant and hire, transport and other site costs (approved supplier and subcontractor invoices by the date on the invoice; credit notes come off). Biggest first |
| 155 | Gross margin page | Every job finished in the last 12 months, paid or not: revenue, cost to do them, gross margin, losing money; best and weakest job; a table that sorts by margin %, margin, revenue or newest first; Export CSV |
| 156 | Sales by customer | Kept from HVAC. Client invoices sent in the last 12 months, paid or not, before VAT: the sales Sage has. Each customer opens their customer page |
| 157 | Customers | A tile of its own after Sales, in place of Sales, Clients, which is gone. Every client link (Client invoices, queries, the invoice page, search, the old `/sales/clients` addresses) lands on the customer's page. Contracts managers and accounts have it by default as well as the managing director |
| 158 | A customer's page | Tabs across the top: Overview (figures, details, the latest with them), Projects, Tenders, Invoices, Emails, Files, each linking to the record in its own section |
| 159 | Changing customers | Add customer and Edit details, for whoever may price quotes or handle invoices. The Sage account is made from the name when the customer is added and never changes after, so Sage keeps matching their invoices |
| 160 | Past work | About a year of it in the sample data, so the 12-month reports are full |

Decisions made by Oisin on his copy, later still on 18 Nov 2026, from the HVAC compliance demo
(`compliance-hvac.wacz`; layouts and features only, as decision 61). His words: "the
compliance section link up with the training and personal records ... sections for fleet,
like personnel training, and then fleet will be like insurance services. Then there'll be
machinery that needs servicing every so often as well". Then six rounds of question buttons
(he picked the recommended answer unless it says otherwise):

| # | Question | Decision |
|---|---|---|
| 161 | Compliance home | One list of everything, soonest first, with five figures across the top that filter it (run out or missing, stopping work, due in 30 days, proof needed, in date), a switch by area, a search, and Record a renewal |
| 162 | "A different file" | A screen per area: Personnel, Training courses, Fleet, Machinery, Company papers, Subcontractors |
| 163 | Training tickets and van papers | Move to Compliance (People, Training tickets is gone; Plant and Vehicles keep a "Renew in Compliance" link; an employee's box links to their tickets). `/people/certs` lands on Personnel as a list |
| 164 | Areas beyond his three | Company papers, Subcontractor papers and Training courses as well as Personnel, Fleet and Machinery |
| 165 | Personnel | A training matrix (people down, tickets across) and a list, with a switch |
| 166 | Machinery | Services by hours or months, thorough examinations, a weekly inspection for each scaffold and tower, electrical tests (transformers) and harness inspections |
| 167 | Fleet | Tax, test (CVRT or MOT), insurance and service, plus a yearly driving licence check for each driver |
| 168 | Someone whose ticket has run out | Blocked: cannot be planned or marked on site until it is renewed (his pick, over "warn only") |
| 169 | What blocks | The Safe Pass (CSCS card in the UK) and the trade ticket each trade needs (scaffolder: advanced scaffolding; roofer and slater: MEWP; leadworker: hot works; stonemason: abrasive wheels; site manager: site supervisor safety). Other tickets show but do not block |
| 170 | Already planned | Stays on the plan, marked "Cannot work", and the week cannot be sent to operatives until they are taken off or the ticket renewed |
| 171 | Due soon | 30 days, for everything |
| 172 | Who sees it | Every office level, switchable in Admin, Roles and access. Site managers see only the people, machinery and subcontractors on their own sites, and not Fleet or Company papers |
| 173 | Reminders | One weekly list of what runs out in the next 30 days, every area, waiting in Approvals on Monday (in place of the ticket reminder) |
| 174 | Subcontractor papers out of date | Their invoices are flagged wherever they are approved, and can still be approved |
| 175 | Courses | A list of courses with places; people are booked from their ticket; marking a course done renews the ticket of everyone booked, waiting on the certificate |
| 176 | Site phone | Operatives see their tickets, are told plainly when they cannot work, and can send a photo of a new card for the office to check |
| 177 | Scaffold register | Kept by the site manager on the project's Plant tab: add a scaffold, record each inspection (safe or not, with what was seen), take it down |
| 178 | Small kit | Harnesses and site transformers as items in Own plant, with their checks |
| 179 | Machine past a check | Cannot go to a site until renewed (thorough examination, tower inspection, electrical test, harness inspection, insurance; a service overdue does not block). A van out of date: its driver is told on the phone not to drive it |
| 180 | Where the tile goes | After Plant |
| 181 | Subcontractor papers tracked | Public and employers' liability insurance, their people's Safe Pass, the safety statement, and a method statement (RAMS) for each site. No tax clearance |
| 182 | Company papers | Kept by the managing director and accounts (a new permission, "Manage company and subcontractor papers") |
| 183 | Proof | A renewal can be saved without a copy; it then shows "Proof needed" until one is attached |
| 184 | The overview | Only what stops work: someone planned who cannot work, and a machine on site that may not be used |

The two copies merged, 19 Nov 2026. Oisin uploaded a build of `step-2-team-chat` (681c6db) and
asked for it to be merged with `invoicing-section`: "keep the plant and the fleet separate in
separate tabs like it is on the HTML", "keep the invoicing like it is currently within this
chat", "the profitability and reports keep the way it is", the site phone "like a phone size,
and you can scroll down on the phone, but have all the same features ... operative or site
manager", "keep as much of the admin features from this HTML as you possibly can", and "take
the fleet format that I have in this HTML". Then four rounds of question buttons (he picked
the recommended answer unless it says otherwise):

| # | Question | Decision |
|---|---|---|
| 185 | What comes from where | From `step-2-team-chat`: Email, Team chat, Schedule, People (timesheet, history, payroll, reimbursements, overtime), both phones, Admin (requests, holidays, roles as ticks, site access, bank holidays, billing), Fleet as a department of its own, Profitability, the Back button's memory, To do on the Dashboard. From `invoicing-section`: Invoicing, Reports, Customers, Compliance, the subcontractor portal, the year of past work. Where both changed the same thing, the decisions below |
| 186 | The site phone | Option C of three pictures: both phones side by side, each in a phone-sized frame that scrolls inside itself (`src/modules/site/PhoneFrame.tsx`). Every sheet opens on its own phone, not over the page (`PhoneSheetHost` in `src/ui`: a sheet inside a frame is a non-modal dialog on a layer over that phone's screen, closed by its Close button or Escape). From 1440 wide, what the office receives sits beside them. Narrower than 1280, one phone at a time with the Phone of switch. Narrower than 640, and on a real phone, no frame: the phone fills the screen and its sheets are ordinary dialogs (his pick: drop the frame) |
| 187 | Back | At the far left of the top bar, before the firm's name (decision 140's place), with the other copy's memory (decision 128): back to exactly where you were, filters, tab and height, also after a reload, kept per role. It opens the screen again rather than using the browser's history, so the browser's forward button is not part of it. `src/app/back.ts` and `src/lib/trail.ts` went |
| 188 | The bar | 17 tiles: Dashboard, Email, Team chat, Sales, Customers, Projects, Schedule, People, Plant, Fleet, Compliance, Invoicing, Profitability, Reports, Portal, Site phone, Admin. Files stays out of the bar (decision 73) and opens at /files |
| 189 | Fleet papers | One set of records, shown in both: a van's tax, test and insurance are Fleet's (`db.vehicles`), and Compliance reads them (rows `veh:` and `vsvc:`). Renewing one in Compliance opens Fleet's own form, so both places always agree |
| 190 | Licences | Fleet's driving licence and Driver CPC for each driver (decision 121), plus Compliance's yearly look at the licence (decision 167), kept as `Person.licenceCheck`. Compliance, Fleet has a column for each |
| 191 | What stops work | Both rules kept: a person whose Safe Pass or trade ticket has run out (decisions 168 to 170), and a machine past its checks or a van with tax, test or insurance out of date (decision 179). The driving check on both phones says "Do not drive" for such a van. A driving licence or Driver CPC out of date is a row that stops work too ("May not drive") |
| 192 | Tickets | In Compliance only (decision 163). People has no Training tickets |
| 193 | Supplier invoice approval | This copy's rule (decision 142), shown in both places: Invoicing, To approve, and Admin, Requests, which lists supplier invoices over the limit with Approve and Send back and the same confirm boxes. The other copy's sign-off over 500 euro gross (decision 75's `SIGN_OFF_OVER`) went with its supplier invoice screens |
| 194 | Invoicing | His answer: none of the other copy's changes to Invoicing. So Job costs stays in Invoicing for everyone, Profitability's sidebar is By site only, and /profit/costs goes to /invoicing/costs (this undoes decision 105's move of Job costs). Decision 84 ("fit the page") is kept, on this copy's client invoice list: below 1280 wide each invoice is a block of its own, and on a phone the aged-debt squares go two by two and the tabs wrap |
| 195 | Join-ups | All four he was offered: "To-do" on a Compliance row puts it on the person's list on the Dashboard and it is ticked off when the thing is renewed (`Todo.complianceKey`, `closeTodos` in actions); and inside a job on the site manager's phone, Who cannot work, Scaffold inspections (record one on the spot) and Subcontractor invoices (Approve or Send back, with the confirm boxes) |
| 196 | Tickets on the operative's phone | In the profile (My tickets, with "Send a photo of the new card"), and the red "you cannot work" card at the top of the front page |
| 197 | Delivery | Pushed to `invoicing-section`, his `main` made the same commit, the artifact "Construction demo (Oisin's copy)" republished, and the checklist given in the chat |
| 198 | Vardil Works, a level above the managing director | Oisin, 19 Nov: "if we log on as Vardil Works we can edit the Managing Directors features and the whole company's features ... Managing director or anyone else down the chain will not be able to see we have this access". Four question buttons, his picks: who is staff is the Cloudflare email check (an address ending in vardil.com, `VITE_STAFF_DOMAINS`); powers are all four (sign in as any level, edit the managing director's and the whole company's features, switch apps off, reset and re-brand); its own tile in the bar, after Admin; a strip along the top that only staff see while viewing as someone else, with Back to Vardil Works. Built: `src/app/staff.ts` (the check, run before the app is drawn), `src/staff/` (the department, Sign in as, Features and access, Demo tools, the strip and the role page line). The staff files are built into `/staff/` (vite `chunkFileNames`), only in the hosted build or with `VITE_STAFF=1`; every other build, the single-file preview included, leaves them out. A second Cloudflare Access application on `/staff/*` lets in only Vardil emails, so a client's browser is refused the code (README, "Vardil Works"). The managing director's switches (`mdOverride`), the whole-demo switches (`companyOff`) and Ask AI off (`askAiOff`) are preferences kept in the browser of whoever set them, applied by `applyStaffChanges` in `access.ts`; the other three levels' ticks are the same records as Admin, Roles and access. Signing in as any level ends Vardil mode (`setRole`). The Activity log still records changes to the three levels, as it does from Roles and access |
| 199 | The main offering | Oisin, 19 Nov: "for us we are pitching to clients and these are our main offering". Five rounds of question buttons; his picks follow. A package button in Vardil HQ, Packages and access (`PACKAGES` in `src/lib/apps.ts`): Main offering is Dashboard, Schedule, People, Compliance, Site phone and Admin (Settings stays the managing director's), with Automations off; Everything is the full demo. A package sets the Whole demo column; single apps can still be changed after |
| 200 | Where a client's apps are kept | On the server, per client: Vardil HQ, Client apps saves a client's apps by their sign-in email or `@` and their firm's domain (`functions/api/workspace.ts`, `server/workspace.ts`, D1 tables `clients`, `announcements`, `app_requests`, made on first use). A client then sees the same on any computer. Only Vardil staff may change them: the server checks the signed Access token's email against `STAFF_DOMAINS` (default vardil.com), never the page. A client with nothing saved sees every app. On a copy with no server, the browser's own package applies, announcements and app requests are kept in the browser, and Client apps says it needs the hosted demo (`src/app/workspace.ts`) |
| 201 | One phone for everyone | His words: "one app with the same features for all employees". With Projects off (the main offering) the Site phone is one phone, the same for every employee whatever their level (`OnePhone` in `SiteView.tsx`): Report a repair, Claim a reimbursement, Make a request, My week, My hours and overtime, My profile. The office picks anyone to look at. With Projects on the two phones are as before. The driving check is Fleet's offering: it shows only with Fleet, on every phone, as do Report damage and Send a licence |
| 202 | Report a repair | For any plant or vehicle (his words), picked from the firm's own list or typed ("Something else"), with where, what is wrong and up to 4 photos (`RepairSheet` in `site/one-sheets.tsx`, `reportRepair`, `db.repairs`). It goes to Admin, Repairs for whoever has "Answer requests", who moves it Reported, In hand, Fixed, each with an optional note (`moveRepair`; a machine of the firm's own is Off for repair while in hand). Each step shows on the reporter's phone |
| 203 | Everything from the phone to Admin | Overtime claims and Make a request go to Admin, Requests for managers (his pick) when there is no Projects app (`directorQueue(db, { crewToOffice })`); an overtime claim is approved there with its split between the rates (`ClaimDialog`). Reimbursements: Approve, then Mark paid with a confirm box (`PayDialog`, `markExpensePaid`, Undo in the message); the phone shows Waiting, Approved, Paid |
| 204 | My certificates | In My profile on the one phone: every ticket and licence with when it runs out, Send a new one, and Add a certificate. What is sent counts for nothing until the office checks it (his pick): Admin, Requests, Certificates to check, Accept (with the date, which can be corrected) or Turn down with a note (`CertSubmission`, `submitCert`, `decideCert`) |
| 205 | Company holidays | Admin, Bank holidays is Company holidays: this year and next only, single days as before, and a company closure added as a range (Christmas closedown), each working day in it shut for everyone and anyone planned on one taken off (`addClosure`, `removeClosure`, `closureDays`, `holidayRows`). Shown on the phone, in My profile |
| 206 | Send the week | Schedule, Week ahead, Send the week: each person their own week (his pick), by email and WhatsApp, through what is connected in Admin, Connections (Gmail or Outlook, WhatsApp Business; a pretend sign-in in the demo, `connectEmail`, `connectWhatsApp`). Every message is shown before it goes, and filed as sent (`rosterMessages` in `src/lib/roster-send.ts`, `sendRoster`, `db.rosterSends`). Nothing leaves the browser in the demo |
| 207 | Dashboard and Admin follow the apps | The dashboard shows Waiting for your yes or no (the same sections as Admin, Requests: leave, requests, overtime claims, repairs, certificates, reimbursements) when there are no drafts to approve, Compliance monitoring (four figures and what to see to first), the AI overview limited to the firm's apps (`apps` in `recordsOverview`), Ask AI for the managing director (his pick: both), and the firm at a glance only with more than one of its apps. Roles and access lists only the apps the firm has, and leaves out permissions for apps it does not have (his pick: hide them). Automations is a switch in Vardil HQ, off in the main offering (`NavItem.automations`). A sidebar item can belong to another app (`NavItem.app`) |
| 208 | Vardil Works and Vardil HQ | Our staff tile is renamed Vardil HQ (his pick). Vardil Works is now the page every client has in Admin, System: announcements from Vardil (written in Vardil HQ, Announcements), then their apps, on, and the others, blurred with the switch off and "Ask about this app", which lands in Vardil HQ, App requests with their firm and email (his pick). Read-only: only Vardil switches apps (his pick) |
| 209 | Each client's own demo | Oisin, 20 Nov: "group, like, say, Old Stone emails, Vardil emails, and other clients' emails ... so that when they sign on, they go on to their specific demo tailored to them ... in our Vardil HQ ... what apps are turned on for what people, and then also like their company logo, the format, the coloring". One address and one Cloudflare policy for everyone; Cloudflare only decides who gets in, the app decides which demo. Two rounds of question buttons; his picks: Vardil HQ keeps Cloudflare's list itself (one Access group, written whole from the database after every change, `server/cloudflare.ts`; the policy includes that group and "Emails ending in vardil.com"); named emails only, never a whole domain (`cleanEmail`); per client: name, logo, colour and region, and their invoice paper (not light or dark); the sample data stays ABC's records under their name; only Vardil sets the look (Settings, Branding and Region, and Invoicing, Invoice design, are read-only for them); someone taken off is off Cloudflare and signed out at once (Cloudflare's revoke_user); staff get "Open their demo"; the logo is uploaded (shrunk to a JPEG in the page, kept in D1, served by `functions/api/logo/[id].ts` to the firm's own people and staff only). Built: `firms` and `firm_emails` tables (one email belongs to one client; a Vardil address is refused), `ClientLook` and the rules in `src/lib/apps.ts`, Vardil HQ, Clients (a list with Cloudflare's state and "Update Cloudflare now", and a page per client at `/vardil/clients/<id>` with Who signs in, Apps, How it looks, Their invoices and a preview), `applyLook` in `src/app/workspace.ts` (run in main.tsx once staff status is known; fresh sample data only when the region, trading name or invented email domain differ: `lookKey`, `matchDataToBrand`), the staff strip naming the client. The sample staff's email domain comes from the client's name (`sampleDomain`: oldstone.example), never a real one. The first version's `clients` table (keyed by email or domain) is no longer read: anything saved there must be added again. Set-up in README, "Clients and Cloudflare" |
| 210 | Levels, end dates and tracking per demo | Oisin, 20 Nov: "give the login for different levels for their company specific demo ... easily keep track of who has access and who does not and be able to track when a client logs on as we then know they are interested as we should remove old potential clients if they are full time wi us or not intersted". Two rounds of question buttons; his picks: each person gets set levels (ticked per email, `ClientPerson.levels`; one level goes straight in, more choose from those; the role page, the account menu and the Shell keep to them, `useAllowedLevels`); sign-ins and apps opened are recorded (`demo_days`: first and last time, visits with a 30 minute gap, apps and levels per day; `noteVisit`, `noteApp`; staff never recorded; kept 365 days); a demo is marked Became a client or Not interested and its access ends (everyone off Cloudflare and signed out, history kept under Closed demos, can be reopened; `set_stage`); an end date per client (30 days to start, Extend 30 days, flagged a week before; `set_end`, `demoState`, `sweepEnded` when the server is next asked, since Pages has no clock); who has access shown per client only (his pick, over one page for everyone); an email to Vardil on each person's first visit of the day (his pick; Cloudflare Email Service to a verified address, `server/alerts.ts`, off until `ALERT_TO` and `ALERT_FROM` are set); prospects told "No if it is legal": recording them silently is not (GDPR Article 13), so the least visible lawful way, a small "How Vardil uses your sign-in" link on the role page (`DemoPrivacy`). A closed demo shows only "This demo has ended", in Vardil's name (`DemoEnded`). Who came onto or left Cloudflare's list is now worked out by the server before and after each change (`allClientEmails` counts only demos open today) |
| 211 | The phone app for the people on site | Oisin, 20 Nov, over two chats of questions and pictures; his picks: one app whose home screen follows the role (operatives and site managers for now, office staff later); sign-in by the mobile number on the employee register, the office presses Send invite, the first time a one-time code then their own password, then fingerprint or Face ID if they want it; password rules he agreed (at least 8 characters, easy ones and their own name refused, 5 wrong tries then a 15 minute lock, codes last 10 minutes and at most 3 an hour, signed in 30 days per phone, signed out at once when archived, the office's Sign out everywhere); only the office changes a number (Change number, which signs the app out); English first, other languages asked on the onboarding form; the site manager marks people in (no clocking in); operative home: big tiles (his pick B of two pictures: My week, My hours, Holidays, Receipt, Report a repair, My tickets, Something else, and the driving check with Fleet); site manager home: his sites with today's timesheet state, Waiting for you (overtime claims, reimbursements, crew requests) and the same tiles without My week and My hours; the timesheet in his pick A (Full, Half, Not in for each person) with Overtime as a fourth choice that opens the two boxes, and the days as buttons back to the Monday of last week; Report a repair asks Vehicle or Plant first, then the item; a site manager approves reimbursements on his sites on the phone (confirm box), which go to the office's Ready to be paid list (Admin, Requests; was Reimbursements to pay), where the office marks them paid. Built on the branch `phone-app` for the main offering (Projects off, where the one phone was); with Projects on the two phones are as before. `PhoneAccount` and `db.phoneAccounts`, rules in `src/lib/phone-auth.ts`, actions `invitePhone`, `sendPhoneCode`, `enterPhoneCode`, `setPhonePassword`, `tryPhonePassword`, `setPhoneBiometrics`, `signOutPhone`, `signOutEverywhere`, `setPersonPhone`; screens `src/modules/site/PhoneApp.tsx`, and in the employee register a Phone app column and box. In the demo the code is shown on the phone in place of the text, and the hash is made in the browser (REAL BUILD: texted and hashed on the server). Sample data: everyone on the app set up three weeks ago with a password nobody knows (reset it with a code), most with fingerprint, the last operative alphabetically not invited and the one before invited but not set up. DATA_VERSION 26 |
| 212 | The phone app everywhere, and the chain from the onboarding form | Oisin, 20 Nov, after seeing 211: "Yes" to the two phones of the full demo becoming the same app, and "Publish". The Site phone is now the phone app whatever apps are on (`SiteView` renders `PhoneAppView`; the two phones, `TwoPhones`, `Phone_` and `ManagerPhone`'s front page, are gone, and `ManagerPhone.tsx` keeps only the sheets the app uses). A site manager's site opens as a screen of its own on the phone (`JobScreen`): the timesheet and what waits for him on it (overtime claims, reimbursements, crew requests) always, and with Projects on the whole job as his phone had it (overtime time stamp, subcontractor invoices, week and month ahead, site instructions, who cannot work, scaffold inspections, send a photo, report extra work, make a request), with All my sites to go back. Each site's card says who is on it today ("on site today" once marked, else "down for today", from `dayRoster`), "Run by" for a site given by the office, and badges for who cannot work and what waits. An operative on a site with Projects on also has Send a photo and Report extra work; with Fleet, everyone has Send a licence and the driving check, and a van out of date shows Do not drive. Today on the operative's home: the site, the site manager (his details and Call), today's instructions with who put them up, and the standing site instructions. Something else shows how many of their own general requests wait (renamed Make a request later the same day, decision 213). Tickets go through My tickets (`MyCerts`: a new card waits in Admin, Requests, Certificates to check), also with Compliance on. Report damage is gone at his word (Report a repair, vehicle or plant; it reaches Admin, Repairs and What the office receives, not Fleet, Damage reported). His answer on the approval chain: it depends on each client's answers to the onboarding form, so it is not built into the demo yet |
| 213 | Make a request on the phone | Oisin, 20 Nov: "replace the name of Something else with make a request and make it a square box button above the driving check beside Send a licence". The wide button under the driving check is now a tile like the others, "Make a request", in the grid after Send a licence (so the two sit side by side above the driving check when Fleet is on), with the count of their general requests still waiting as a badge. The request kind "Something else" inside the form is unchanged |

Decisions made by Oisin on the master demo, 20 Nov 2026, after the call with Jimmy, Oldstone's
managing director (asked with question buttons, the layout ones with sketches; he picked the
recommended answer each time):

| # | Question | Decision |
|---|---|---|
| 214 | A new project | The construction demo is left as it is; a new private repository, product574/vardil-works-master-demo, copied with its whole history (Oisin: "leave that as it is and start like a new project from where we were") |
| 215 | The structure | Jimmy's template: Level 1 the Dashboard, a box each for Sales, Projects, Resources and Finance with their updates; Level 2 the apps; Level 3 the sections inside each app. Sales: Enquiries, Tenders, Confirmed, Pipeline (value and list of tendered works, value and list of confirmed orders); a tender: overview (location, client, return date), tender documents, subcontractors, photos, workings and Buildsoft, tender completed. Projects: live projects, not started, resources today; a project: overview (location, client, site team, on site today), files, programme, week ahead, variations, photos, plant, site requests, costs. Resources: scheduling, timesheet, plant, fleet, training ("training, which will be compliance"; "they're all separate apps in my current code, so just make them within the one app"). Finance: money in (invoices to clients), money out (invoices from subcontractors and suppliers), profitability reports (money in less money out, with labour from the timesheets) |
| 216 | Getting about | The bottom bar has only the five apps; each app's sections are buttons across the top of the page, and a section's screens are tabs under them. No left sidebar (Jimmy: "strip back the left-hand side ... buttons for payments in and payments out"). Option A of three sketches; the others were the bar with a left sidebar, and no bar at all with the dashboard boxes as the way in |
| 217 | The apps not in the template | Folded in: Customers is a section of Sales, Reports of Finance (decision 228), Files and the Portal sections of Projects. Email, Team chat, the Site phone and Admin are small buttons in the top bar, with their unread counts (and Vardil HQ for our staff) |
| 218 | Health and Safety | In Jimmy's sheet as a Level 1 box, "details tbc", and he is working on it. Left out until he sends it, so prospects see no empty box |
| 219 | Opening a project | A full page with the nine tabs (option A of three sketches; the others were a panel sliding out over the list and a pop-up). Old links still land: Scope is in Programme, Extras is Variations, History is at the foot of the Overview |
| 220 | Dashboard boxes | Two or three figures, one small bar and up to three lines that need attention, each a link to where it is dealt with; the heading opens the app (option A of three sketches). Rules in `src/lib/boxes.ts` |
| 221 | The rest of the dashboard | Under the boxes: Waiting for your yes or no (the approvals, with a line for what waits in Admin) and To do. The AI overview, On site today, the Portal panel, Compliance monitoring and the firm at a glance went; the boxes cover them |
| 222 | Money in | Opens on Payment claims, Jimmy's simple list: every job to claim this month (live jobs, and finished ones whose final account has not gone) with a column red To be issued, amber Drafted or Held, green Issued; due out by the last working day of the month. A job opens to its invoices; "Draft this month's claim" opens Draft an invoice on that job. The full client invoice list is the next tab (option A of three sketches). Rules in `src/lib/claims.ts` |
| 223 | Money out | Jimmy's chain as the default, set in Admin, Invoice approvals: the site manager of the job, then the managing director, then the office pays. Also "site manager only", and the rule from 18 Nov (accounts up to the limit, the managing director above). Each firm's from its onboarding form (Jimmy: "in other organisations it might be sufficed to be signed by the site manager, or it might have to go to the finance manager") |
| 224 | Sales | Four sections as in the sheet, plus Customers. Tenders opens on the list (being priced, with the client, won, lost), the drag-and-drop board and Awaiting response are tabs beside it |
| 225 | A tender's sections | Workings and Buildsoft: our priced items and cost build-up, the Buildsoft total checked against them, and the Buildsoft and workings files. Subcontractors: ask one per trade, record each price, the lowest marked, pick one per trade, and the picked prices become the tender's subcontract. Tender completed: four checks (documents read, subcontractors priced, workings checked, price approved by the managing director), then Submit tender, which sends it and puts it in the Pipeline as tendered |
| 226 | Programme | Each scope item as a bar across the weeks, worked out from the job's start and finish, today as a red line, late items in red (option A of three sketches), and the client's programme file attached beside it (it also goes in the project's new Programme folder). The scope is ticked off under the chart |
| 227 | The People screens | Inside the five sections of Resources: Timesheet has Attendance history, Payroll export and Reimbursements as tabs; Scheduling has Holidays and Holiday requests; the Employee register is a tab of Training |
| 228 | Reports | One section of Finance, Profitability reports, opening on Profit by job, with Gross margin, Sales by customer, Tender conversion, the 12 months overview and Job costs as tabs. The managing director's by default, as before |
| 229 | Where it is looked at | A private Claude artifact for now; a Cloudflare Pages project of its own when it goes to prospects (Jimmy is aiming for CSL and Michael Murray on Friday 27 Nov or the Monday after) |

Decisions made by Oisin on the master demo, later on 20 Nov 2026 ("make the sites more easy to use
and think about every step ... who is going to input the info and how"). Eight question buttons in
two rounds, the layout one with sketches; he picked the recommended answer each time:

| # | Question | Decision |
|---|---|---|
| 230 | How things get in | Every list a person can add to has a button with a plus, named for what it adds, on the screen where the list is. Each box says under its form what happens next and who it waits for. One box per thing, wherever it is opened (the section's screen or a project's own tab) |
| 231 | The Portal | "Remove the Portal from Projects for now": hidden everywhere, not only in Projects. `PAUSED_APPS` in `src/lib/apps.ts` holds "portal"; `PORTAL` is the one constant screens and wording ask. Gone while paused: the Projects section, the Client (portal) sign-in level, the portal tick when sending an invoice, the lines about it in the paid boxes, Customers, Compliance, Billing and Settings, and it is in no package and not offered on Vardil Works or in Vardil HQ. The code and the section on the map stay: take "portal" out of `PAUSED_APPS` to bring it back |
| 232 | Admin, Connections | Removed. Email and WhatsApp count as set up by Vardil when a firm joins (a question for the onboarding form), so Send the week works from the first day and says which mailbox and number it goes from. Team chat is shown as Teams; the Teams or Slack switch went with the screen (the preference `Brand.chatApp` stays) |
| 233 | "Opened" on tenders | Removed everywhere, not only the board's column: with no portal nothing can tell the firm a client has opened a tender. A tender is Sent until the client asks something, accepts or declines. Awaiting response is Queried, Due a chase (sent 7 days or more ago, not chased in the last 7: `dueAChase`, `CHASE_AFTER_DAYS` in `lib/pipeline.ts`), Sent and waiting, Declined |
| 234 | Snagging | A real list in place of the on or off switch: each snag has what, where, whose list it is from (the client's or our own walk-round), who is to fix it, an optional photo, and Open or Fixed. A job's final account is on hold while any of its snags is open and lets go when the last is marked fixed. Mark fixed has an Undo; a fixed one can be opened again |
| 235 | The plus buttons | One per tab (his pick of two sketches): New request on Site requests; New variation and Add snag on Variations and snagging. For anyone who can open the section, for the sites their level covers (a site manager only his own). The same boxes are on a project's Site requests and Variations tabs with the site already known |
| 236 | Wording | "Final accounts on hold" in place of "Invoices held", each with its reason and what lets it go ("On hold because 3 snags are open. It lets go by marking each one fixed."). "Variations" in place of "extras" on office screens (the tab, headings, buttons, hold reasons, history lines); the phone keeps "Report extra work", and invoice lines keep "Agreed extra". Clear hold asks first and says what stays open |
| 237 | Invoices from suppliers and subcontractors | The office adds each one (his only pick of four ways in): Add invoice in Finance, Money out. Choose the PDF or photograph the paper, check the boxes, pick the job. Whoever adds it is the one who checks it, so it goes straight to the job's site manager, then the managing director (the firm's chain, decision 223), then To be paid. Nothing arrives unread by itself any more: the sample data's two unread invoices are now saved to check |
| 238 | Who enters what | Written down record by record (project doc `inputs/who-enters-what.md`), with the gaps still open listed there and under "Easier to put things in" below |

Decisions made by Oisin on the master demo, 21 Nov 2026 ("Yes help with this process", on the list
of records that still had no way in). Twelve question buttons in three rounds, one with sketches;
he picked the recommended answer each time:

| # | Question | Decision |
|---|---|---|
| 239 | Hired plant going on hire | From an agreed request, or direct. An approved "Plant to hire" request shows under "Agreed, waiting to be hired" on Resources, Plant, Hired plant, and has a Put on hire button there, on Site requests and on the project's Site requests tab; the box (hire company, their phone and reference, the day it starts, the rate a day or a week, how many) starts with what the site asked for, and saving it marks the request dealt with. "Put plant on hire" on the Hired plant list is for a hire nobody had to ask for. For anyone with "Manage plant and fleet" |
| 240 | A new subcontractor firm | Both places: Add subcontractor on Resources, Training, Subcontractors, and inside Add invoice, where a name not on file is offered "A subcontractor? Add them" (the name and the job come across, and the invoice then goes in as theirs). Name, trade, contact, email, phone, payment terms, the sites they are on. It starts with no papers, so Compliance flags its insurances, safety statement and a method statement for each site until the office records them. For anyone with "Manage company and subcontractor papers" |
| 241 | A project without a tender | Add project on Projects, Not started (and All projects), for the managing director and contracts managers (the permission `manageProjects`, now worded "Clear invoice holds, set up jobs and deal with site requests"). Client, name, where, county, the work in a sentence, how it is priced (an agreed price, a schedule of rates, not priced yet), the value, the client's order number, start and finish, site manager, contracts manager, and the scope typed one item a line (his pick), which becomes the scope to tick off and the Programme's bars. It gets the next site code and counts in Sales, Confirmed and the Pipeline, marked "No tender" (his pick) |
| 242 | Buying for a site | The full loop (his pick of two sketches): "Something to buy" is a kind in New request (what, the supplier if known, the amount before VAT, why), for a site or for the firm; the managing director's yes or no in Admin, Requests, under Spending; the office presses Order placed (who from, the day it is due) on the new tab Projects, Requests and variations, Orders and deliveries; whoever runs the site presses Mark delivered there, on the project's Site requests tab or on his phone, with an Undo; the invoice then comes in through Add invoice. The sample data's spending requests and supply orders, shown nowhere since the old dashboard went, are what the screen opens with |
| 243 | Who does what in buying | Every purchase needs the managing director's yes, for now (his pick; whether small buys skip him is a question for the onboarding form). Orders are placed by whoever has `manageProjects`. A delivery is marked by anyone who opens that site (its site manager, and anyone given it in Admin, Site access) or the office; an order for the firm, not a site, is the office's |
| 244 | A new company paper | Add paper on Resources, Training, Company papers, for whoever keeps them (`manageCompany`): what it is (the usual ones not yet held are offered), who from, reference, cover, the day it runs to, a copy (saved without one it reads Proof needed). One already on the list is refused and pointed at its Renew button |
| 245 | Who says a job has started | Found while building 241: nothing in the demo ever turned a Not started job live. Built as the default, for him to confirm: Start on site on a Not started project's Overview, for its site manager (anyone who opens the site) or the office. The job joins Live projects from that day and leaves Sales, Confirmed. The other way would be by itself, the first day anyone is marked in on its timesheet |
| 246 | "Held" in Finance | "On hold", as in Projects (his pick): the Money in tab, the badge, Payment claims and the invoice page, each with the reason and what lets it go in the same words as Projects ("Because 3 snags are open. It lets go by marking each one fixed."). Finance no longer clears a hold itself: the row and the invoice page link to the project's Variations tab ("See what is open"), where Clear hold asks first (decision 236) |
| 247 | The site manager's phone | Snags only for him, not operatives (his pick): inside a site, Snags (the list, Add a snag with a photo from the camera, Mark fixed with Undo) and Orders and deliveries (what is on order for the site, Mark delivered, what is asked for and not ordered yet). Make a request on his phone has "Something to buy" with the amount and the reason. Everything is saved in his name. Invoices stay with the office |
| 248 | Questions go on the onboarding form | Oisin, 21 Nov: "For all these questions that you need my input for record them for the onboarding form". Every question put to him while building is recorded as a question for the client onboarding form (Claude's project memory, and `inputs/who-enters-what.md`), with his pick for the demo beside it |


Decisions made by Oisin on the master demo, later on 21 Nov 2026 (his list: an estimated margin in
Confirmed and the Pipeline, the Board's Declined column on by default, the tender lists with an
archive, no Declined in Awaiting response, an average margin on Customers, and Admin grouped and
made an app). Ten question buttons in three rounds, the Admin one with sketches:

| # | Question | Decision |
|---|---|---|
| 249 | Estimated margin in Sales | A column, Est. margin, on every tender list (All tenders, every tab), in Confirmed and beside each line of the Pipeline. Always shown to whoever may see margins; "optional" means the figure (his pick): a job won from a tender takes its tender's margin from the cost build-up, fixed (his pick); a job with no tender has an optional box in Add project and a Set margin or Change button on its row in Confirmed (his pick), or reads "Not given". `estMargin`, `projectEstMargin`, `averagePct` in `lib/tenders.ts`; `Project.estMargin`; action `setEstMargin`, refused on a tendered job, in the history and the log |
| 250 | All tenders | Being priced, With the client, Won, live, Lost, last 90 days, then Archive in a box of its own, set apart (`tenderList`, `LOST_DAYS` in `lib/tenders.ts`). The tab picked is remembered |
| 251 | Won, live | A won tender whose job is Not started, Live, Complete or Invoiced: it stays until the job is Closed, finished and every invoice paid (his pick). Each row shows its job and where it stands |
| 252 | Lost and the archive | A declined tender is under "Lost, last 90 days" for 90 days from the client's answer, then goes to the Archive with everything that was on it. A won tender goes to the Archive when its job is Closed. The Archive is two lists on the page, "Won, job closed" and "Lost, over 90 days ago" (his pick) |
| 253 | The Board's Declined column | On by default, the last 90 days only (his pick, matching Lost), with the switch to turn it off, remembered once off (his pick; `boardHideDeclined` in preferences, so it survives Reset demo data) |
| 254 | Awaiting response | Declined removed: Queried, Due a chase, Sent and waiting |
| 255 | A customer's margin | Two columns on Customers, Est. margin and Actual margin (his pick), each with how many jobs it covers. Both over finished jobs only (Complete, Invoiced or Closed), never estimates from unfinished jobs (his words, mid-build): the actual margin of each from Job costs, and what each was estimated at. A plain average, each job once (`customerMargins` in `lib/reports.ts`). The jobs priced before the tender records start (C709 to C717) were given an estimated margin in the sample data, a point or two either side of what each was meant to make, so every finished job has one. DATA_VERSION 30 |
| 256 | Admin as an app | The sixth app in the bottom bar, and off the top bar (his pick). Two sections (his pick of two sketches): Requests (Requests, Repairs, Invoice approvals) and Settings (Roles and access, Site access, Billing, Company holidays, Activity log, Automations, Vardil Works, Branding, Region, About this demo) |
| 257 | The old Settings | Branding, Region and About this demo are tabs of Admin, Settings (his pick). Their addresses (/settings...) are unchanged, and the account menu's Settings still opens Branding, now inside Admin. Who may open them is unchanged (the settings department) |
| 258 | Questions for the onboarding form | How long a lost tender stays before the archive (90 days in the demo), and whether a job's estimated margin may be typed over once it came from a tender |

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
    back.ts             the Back button's memory of the screens opened (rule in lib/trail.ts)
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
                        draw), pdf.ts (writes the PDF, no library), purchases.ts (where a
                        supplier's or subcontractor's invoice stands, who may approve it,
                        what is to be paid, the rows Sage gets, the paid emails) and trail.ts
                        (the screens behind the Back button), and reports.ts (the last 12
                        months: win rate, sales, jobs paid in full, where the money goes, a
                        customer's figures and latest, the CSV), and compliance.ts (every
                        expiry as one list of rows, what stops work for a person, a machine,
                        a van or a scaffold, the training matrix, courses, subcontractors'
                        papers, the Monday reminder). Since 16 Nov also:
                        overview.ts (the AI overview, worked out from the records),
                        approvals.ts (client first), portal.ts (the overview's Portal panel),
                        requests.ts (what waits for the managing director's yes or no),
                        subscription.ts (Admin, Billing), pipeline.ts (moving sales cards),
                        chat.ts (Team chat), mail.ts (Email), roster.ts (17 Nov: the week
                        and month ahead, the phones, attendance per site), payroll.ts,
                        purchases.ts, driving.ts, overtime.ts, site-access.ts (which sites a site
                        manager opens), fleet.ts (Fleet's drivers from People, reading an
                        uploaded file's name), fleet-spend.ts, renewals.ts, match.ts, ops.ts
                        (18 Nov, from Secure-All: repair spend, warnings, renewals, names and
                        registrations on documents, what the office receives), sample-docs.ts
                        and sample-pictures.ts (drawn sample papers and damage), reimbursements.ts (approved
                        claims for the office to pay), bank-holidays.ts (the built-in lists and
                        which days are rest days), profitability.ts (wages, invoices and net
                        profit by site), overtime-claims.ts (claims from the phone, My hours)
  ui/                   the interface kit: Button, Badge, PageHead, Panel, Dialog, Menu, toast
  modules/<department>/ one folder per department, one file per screen. dashboard/ is the
                        overview plus ApprovalsPanel.tsx; admin/ (16 Nov) holds Requests,
                        Roles and access, Site access (17 Nov), Billing, Connections,
                        Automations, Bank holidays (17 Nov) and the Activity log; profit/ (17 Nov) is
                        Profitability; fleet/ (18 Nov, from the Secure-All build) is Fleet;
                        a project's own Files tab is projects/ProjectFiles.tsx,
                        beside the Files section in files/Files.tsx. invoicing/ (18 Nov) is
                        ClientInvoices.tsx (the list and Draft an invoice), InvoicePage.tsx,
                        Queries.tsx, SageExport.tsx, Templates.tsx (invoice design, email
                        template), shared.tsx (the paper, the PDF download, the send and
                        paid dialogs), Purchases.tsx (supplier and subcontractor invoices,
                        To approve, To be paid), purchase-shared.tsx (who may approve, and
                        the approve, send back and paid boxes) and Invoicing.tsx (job costs).
                        projects/SubInvoices.tsx is where a site manager approves a
                        subcontractor; portal/SubPortal.tsx is what a subcontractor sees.
                        reports/Reports.tsx (18 Nov) is the four report screens;
                        customers/ is Customers.tsx (the list and the add or change form)
                        and CustomerPage.tsx (one customer, with its tabs). compliance/
                        (18 Nov) is Compliance.tsx (the seven screens) and shared.tsx (the
                        figures, the table of rows, and one renewal box per kind of thing);
                        the scaffold register is ScaffoldRegister in projects/ProjectPage.tsx.
                        site/ (merged 19 Nov) is SiteView.tsx (both phones and the
                        operative's), ManagerPhone.tsx, PhoneFrame.tsx (the phone-sized frame
                        and the layer its sheets open on), sheets.tsx, fleet-sheets.tsx,
                        hours.tsx and OfficeFeed.tsx
functions/              Cloudflare Pages Functions: api/ask.ts (Ask AI), api/read.ts (AI reading,
                        18 Nov) and ask-log.ts (the record)
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
- `scope(projects)`: without the "See every project" permission, only the sites they open:
  the ones they run, and any the managing director has given them in Admin, Site access
  (`opensSite` in `src/lib/site-access.ts`, decision 87).

Screens never check a role name, with five exceptions that are the managing director's
alone whatever is switched on: Ask AI (decision 46), Profitability (decision 105), and in
Admin, Roles and access, Site access (17 Nov) and Billing (16 Nov). Admin itself can be switched on for another level, so those are marked
`mdOnly` in `departments.ts` (left out of everyone else's sidebar) and their screens send
anyone else back to `/admin`. Without that, a level given Admin could open Roles and access
and change its own access (possible from step 1, when it moved there from Settings, which
cannot be switched on for anyone else, until this was added the same day). Two more since
18 Nov, both about a client signed in to their portal: the subcontractors' section is left
out of their sidebar (`staffOnly` in `departments.ts`) and its screen sends them back to
their own.

Who may approve an invoice the firm pays is `mayApprove` in `src/lib/purchases.ts`, from
three permissions: "Handle invoices" (accounts: a supplier's invoice up to the limit in
`db.approvalLimits`), "Approve invoices of any size" (the managing director's by default,
who also sets the limit) and "Approve subcontractor invoices for their own sites" (site
managers by default: a subcontractor's invoice for a site they are site manager or contracts
manager of).

Compliance (18 Nov) adds two permissions, so there are 17: "Manage company and subcontractor
papers" (`manageCompany`: the managing director and accounts) and "Record scaffold
inspections" (`recordInspections`: the managing director, contracts managers and site
managers). Who may renew what is `AREA_PERM` in `src/modules/compliance/shared.tsx`: tickets
need "Manage staff and training tickets", vans and machinery "Manage plant and fleet",
company and subcontractor papers `manageCompany`, scaffolds `recordInspections`. Fleet and
Company papers are firm-wide, so their sidebar items carry `perm: "allProjects"`
(`NavItem.perm`, filtered in `Shell.tsx`): without "See every project" they are not shown,
and the other screens keep to the rows on that person's own sites (`rowsInScope`).

Access is worked out in two layers:

1. **Level.** Every office person has a level (`Person.level`: managing director, contracts
   manager, site manager, accounts). Each level's departments, money and permissions are a
   row in `db.access`. Starting values are in `src/data/roles.ts`.
2. **Exceptions for one person.** `db.personAccess` holds, per person, only the settings
   that differ from their level. A missing key means "same as their level".

Both are edited by the managing director in Admin > Roles and access (moved from Settings on 16 Nov; "By role" and "By
person"; ticks and dashes since 17 Nov, decision 93). The managing director, operatives and clients are locked: fixed access, no
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
- A year of past work (18 Nov, for Reports): twelve finished jobs, C697 to C708, all closed
  and paid (`PAST_PROJECTS` in `seed/projects.ts`), with their crews and timesheets (1,177
  days), stage payments and final accounts (14 invoices), supplier invoices and files; and
  36 past tenders (`PAST` in `seed/commercial.ts`: the 12 won ones and 24 lost) with their
  enquiries. Two new customers came with them, Rosmore Abbey Trust and Kilbrack Hotels.
  The past is drawn from its own random numbers (`rng(20251118)`, `rPast`) and numbered
  below today's records (Q-2565 to Q-2600, ENQ-1365 to ENQ-1400, SI-10387 to SI-10400,
  ids `q-1xx`, `e-1xx`, `inv-p`, `att-p`, `f-p`), so every record from before stayed exactly
  as it was (checked by comparing the whole seed before and after).
- A job can finish late: `Project.plannedEnd` is the planned finish, and `endDate` the day
  it finished. Seven of the 21 jobs finished in the last 12 months were late (C715 by six
  working days, C716 by three, and five past ones), so "on time" means something.
- Compliance (18 Nov, `seed/compliance.ts`, no random numbers, so nothing else moved).
  Three people planned who cannot work, on purpose: Tomás Breslin (p-124), whose Safe Pass
  ran out yesterday and who is planned on C722 today (booked on next Tuesday's Safe Pass
  course); Kevin Shortall (p-119), whose advanced scaffolding ticket runs out on the Friday
  before next week; and Mindaugas Petrauskas (p-110), whose MEWP ticket runs out late next
  week (booked on a MEWP course before then). Attendance is never recorded on a day a
  needed ticket had run out (filtered in `seed/index.ts`). Small kit: six harnesses
  (HAR1 to HAR6) and three site transformers (TR1 to TR3) in Own plant; HAR4 on C721 and
  TR3 in the yard are past their checks. Every driver's yearly licence check (`Person.licenceCheck`,
  since the merge: the licences themselves are Fleet's), Liam Costigan's overdue. Eight courses, one of them yesterday's Hot works not yet marked
  done, one done three weeks ago that renewed three people's tickets. Seven company
  papers (contractors all risk due in 19 days, professional indemnity waiting on its
  schedule). Each subcontractor's papers and people, with one lapsed insurance (Kinvara),
  a missing method statement (Corrib on C721, Curragh on C722), a lapsed Safe Pass
  (Corrib's Łukasz Zieliński) and an overdue safety statement review (Portumna). Six
  scaffolds and towers standing with weekly inspections by each site's manager, two of
  them overdue (C719 S2, C723 T1), and one "Not safe to use" last week put right the next
  day (C722 S1). Ten things stop work today, eleven since the merge (Kevin Shortall's Driver
  CPC, from Fleet's sample, has run out too). The Monday reminder in Approvals is
  `mondayReminder` in `lib/compliance.ts`. DATA_VERSION 15, and 24 since the merge.

### Re-branding for a prospect

Change `src/config/brand.ts` (name, legal name, tagline, accent, logo, region, email domain)
and rebuild. The same fields can be changed live in Settings. The accounts package is no
longer one of them: on this copy it is always Sage (decision 141).

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

**Oisin's copy, 16 Nov (branch `step-2-team-chat`): Email like Gmail, Team chat like Ping.**
After building a triage-style Team chat (decision 64, first version), Oisin shared ten of the
reference demos as web archives (Founders shared drive, Demo_Database, Top 10: .wacz files,
replayed offline with Playwright answering every request from the recording) and asked for
Email to match their Gmail layout and Team chat their Ping, dropping the AI in Team chat
(decisions 64 to 66). Layouts and features copied, not their code, wording or data. Built:

- Shell: a department with `ownLayout` (Email, Team chat) draws its own full-height side
  panel and the shell shows no sidebar; a department's `badge` puts an unread count on its
  button in the bottom bar (unread email, unread messages).
- Team chat: `ChatChannel` (kind channel or dm, members, `lastRead` per person) and
  `ChatMessage` (text, optional attachment name) in `types.ts`; sample data in
  `src/data/seed/chat.ts` (a channel per live site with the people who run it, Office, Plant
  and yard, Accounts, four direct messages, the working day before and this morning, every
  name, item of plant and supplier already in the records); rules in `src/lib/chat.ts`
  (names in Teams or Slack, who sees which channels, unread, day lines, @mentions);
  `sendChatMessage` and `markChannelRead` in actions; screen `src/modules/chat/TeamChat.tsx`.
  Everyone with a sign-in sees only the channels they are a member of, so site managers now
  have Team chat with their own sites' channels. On a phone the list and a conversation are
  one screen each.
- Email: `starred` and `to` on `Mail`; three more sample emails so no folder opens empty (an
  order to Burren Lime and a Safe Pass booking in Sent, a delivery note in Archive); rules in
  `src/lib/mail.ts` (folders, Focused and Other, day groups, search, preview line, summary,
  action items); `toggleStar`, `startReply`, `composeMail`, `shareMailToChat` in actions
  (sent replies now record who they went to); screen `src/modules/inbox/Inbox.tsx`, routes
  for Starred, Drafts and each label. Ask AI's list of screens includes the new folders.
- DATA_VERSION 13.
- 17 Nov, round two (decision 67): drag to label, Cc and Bcc, group chats without #, New
  message or email. 705 browser checks (`m5_check.py` 77, `s2_check.py` 41).
- 17 Nov, round three (decisions 68 to 76): see the decisions. DATA_VERSION 16. 275 automated
  tests (new: `roster.test.ts` 18, `payroll.test.ts` 8, `purchases.test.ts` 12, `driving.test.ts` 3;
  `access.test.ts` and `overview.test.ts` updated for the new defaults); 763 browser checks in
  fifteen suites (new `s3_check.py`, 56; `m3_check.py` and `m3b_check.py` rewritten for the week
  grid and site managers planning; others for Files out of the bar and the bigger Admin queue);
  `csp_check.py` 32 screens, no violations. Found while testing: a dialog taken off the page while
  open is now closed first (`Dialog` in `src/ui`). In the test browser the first drag after a
  dialog closes does not start and a second does; the suites retry once. Not tested: dragging with
  a real mouse or finger, a real phone, Safari and Firefox, the Polish, Romanian, Portuguese and
  Lithuanian button names.
- 17 Nov, rounds four and five (decisions 77 to 82): the phones and requests, then the Schedule
  (rest of the week, month grid, who is where per site). DATA_VERSION 17. 300 automated tests
  (new `requests.test.ts` 5 and `crew-requests.test.ts` 7; `roster.test.ts` now 36). 842 browser
  checks in seventeen suites (new `s4_check.py` 41 for the phones and requests, `s5_check.py` 32
  for the month and who is where; `m3b_check.py` 85 with the rest-of-the-week question;
  `m5_check.py` and `s3_check.py` updated). `csp_check.py` 34 screens, no violations. The phone
  screen is now three files: `SiteView.tsx` (the switch and the operative), `ManagerPhone.tsx`,
  `sheets.tsx`. Worth knowing: a sticky table heading's `offsetLeft` is not relative to its table,
  so the month grid measures on-screen positions to open on today. Not tested: dragging with a real
  mouse or finger, a real phone, Safari and Firefox, the new Polish, Romanian, Portuguese and
  Lithuanian wording (Make a request, Call now, Today's instructions).
- 17 Nov, round six (decisions 83 to 87): Attendance history per site from the top right, Held
  fitting the page, the site manager's general request, one plan shown one way across the
  office and both phones, and Admin, Site access. DATA_VERSION 18. 335 automated tests (new
  `site-access.test.ts` in `src/lib` 9 and in `src/data` 8, `plan-sync.test.ts` 11;
  `roster.test.ts` now 42; a seed check for the site access example). 917 browser checks in
  eighteen suites (new `s6_check.py` 74; `m4_check.py` 92 and `s3_check.py` updated for the
  Held and Attendance history layouts). `csp_check.py` 37 screens, no violations.
  `preview_check7.py` opens the single-file preview from disk on the new screens. Found and
  fixed: with `npm run dev` every dialog shut the moment it opened. The "close on the way
  out" added to `Dialog` on 17 Nov was reported as the person closing it, and in development
  React runs each effect twice. Built copies were never affected, which is why the suites
  (which use built copies) did not catch it; `Dialog` now tells its own close from the
  person's. Worth knowing: a `Panel` hides what overflows it, so a table too wide for one is
  cut off, not scrolled; `s6_check.py` checks for both. Not tested: a real phone, Safari and
  Firefox, dragging with a real mouse, the new Polish, Romanian, Portuguese and Lithuanian
  wording (This week, Next week, Not marked in), and `npm run dev` beyond opening the new
  dialogs by script.
- 17 Nov, later still (decision 88): the preview's sign-in page no longer prints the login, so
  the artifact can be shared. `preview_check7.py` now also checks that the page does not show
  the login and that a wrong username or password is refused. No change to the other builds
  (`.env.preview` is read only by `npm run build:preview`). Not tested: opening the shared
  artifact as another person, which needs Oisin to share it first.
- 17 Nov, round seven (decisions 89 to 94): overtime at time and a half or double time, a
  note with every no, email under a label leaving the Inbox, files on a new email, Roles and
  access as ticks, and picking who runs each site. DATA_VERSION 19. 374 automated tests in 41
  files (new `overtime.test.ts` 9, `decline-notes.test.ts` 7, `mail-filing.test.ts` 8;
  `mail.test.ts`, `site-access.test.ts`, `roster.test.ts`, `payroll.test.ts`, `week.test.ts`
  and `project-costs.test.ts` extended). 1,019 browser checks in nineteen suites (new
  `s7_check.py`, 102; the access steps of `m2`, `m3b`, `m4`, `s1b` and `s6` now use ticks,
  and every decline or discard in `m5`, `review`, `s1` and `s3` goes through the note
  dialog). `csp_check.py` 37 screens, no violations. `preview_check8.py` opens the
  single-file preview from disk on the new features. Worth knowing: at this app's 15 pixel
  base, Tailwind's `size-9` is 33.75 pixels, so the tick is `size-10`; a grid whose only
  column holds a wide table needs `grid-cols-[minmax(0,1fr)]`, or everything beside the
  table is stretched to its width and cut off on a phone; Playwright's `get_by_label("To")`
  also matches any label containing "to" (a file called site-photo.jpg), so the suites ask
  for it exactly. Not tested: a real phone, Safari and Firefox, dragging an email with a
  real mouse, the attachment download inside the artifact's frame (downloads do nothing
  there), and `npm run dev`.
- 17 Nov, round eight (decisions 95 to 99): the Fleet page made easy, after Oisin's own
  Oldstone fleet tool, and what came out of the call with Oldstone's managing director that
  morning: reimbursements ready for the office to pay, a manager's check before payroll is
  exported by hand, the overtime rates at the top of the Timesheet with a filter in the
  history, and Invoicing saying which invoices go out and which come in. DATA_VERSION 20.
  412 automated tests in 45 files (new `fleet-page.test.ts` 12, `payroll-check.test.ts` 11,
  `reimbursements.test.ts` 6, `fleet-actions.test.ts` 9; `overview.test.ts` updated).
  1,112 browser checks in twenty suites (new `s8_check.py`, 93; the Fleet steps of
  `m4_check.py` rewritten for the one page; `m3b`, `m4` and `s7` count fifteen permissions;
  `s3_check.py` marks the week checked before exporting). `csp_check.py` 40 screens, no
  violations. `preview_check9.py` opens the single-file preview from disk on the new
  screens. Also on the call and already built in round seven: email leaving the Inbox under
  a label, attachments, a note with a decline, simpler roles, who runs each site. Talked
  about on the call but not built, because there was no clear ask (Oisin to direct): a
  simpler first dashboard for new users, a clearer Sales section, plant tracking beyond the
  fleet, more on Projects and Invoicing. Letting someone else open the preview is Oisin's
  own Share click (decision 88); on the call it showed "page not found" because it is
  private. Worth knowing: Playwright's `get_by_label("Week")` matches every label
  containing "week" (the Ask buttons), so the suite asks for it exactly; a download read in
  Python's text mode has its line ends turned into plain new lines. Not tested: a real
  phone, Safari and Firefox, the downloads inside the artifact's frame, `npm run dev`.
  Not built: Saturday, Sunday and bank holiday days on the timesheet; a day's overtime
  split between two rates; reading the registration off the document itself (the file's
  name is read).
- 17 Nov, round nine (decisions 100 to 107): overtime at both rates in one day and the early
  start rule, the Weekend time stamp for Saturdays, Sundays and bank holidays, bank holidays
  in Admin, the pay week Monday to Sunday, weekend work on the week and month ahead and both
  phones, Profitability for the managing director, and email drafts. Sixteen questions were
  put to Oisin first (four rounds of buttons); he then had to leave, so the round was finished
  without him and the open questions are "Decision for you" rows in the checklist's fifth tab.
  DATA_VERSION 21. 471 automated tests in 49 files (new `bank-holidays.test.ts`,
  `profitability.test.ts`, `src/data/rest-days.test.ts`, `src/data/mail-drafts.test.ts`;
  `overtime.test.ts` rewritten; `week`, `roster`, `payroll`, `project-costs` and `seed`
  tests updated). 1,212 browser checks in twenty-one suites (new `s9_check.py`, 100; the
  overtime steps of `s7_check.py` rewritten for hours at both rates; `m1`, `m3`, `s5`, `s6`
  and `s8` updated for the thirteenth department, the two boxes, weekends that open out, the
  Weekend days column and the Sunday week end). `csp_check.py` 43 screens, no violations.
  `preview_check10.py` opens the single-file preview from disk on the new screens. Found
  and fixed: `Dialog` reported a close the screen had asked for as the person's, so onClose
  ran twice (harmless until closing Compose meant "keep a draft", which kept two). Left
  alone at his word: Fleet (he will give a template). Worth knowing: Playwright's
  `get_by_label("Site")` also matches "Add someone from another site", so the suite asks for
  it exactly; a dialog inside the phone frame has two Close buttons (the sheet's and the
  dialog's), so the suites take the last. Not tested: a real phone, Safari and Firefox,
  `npm run dev`, the downloads inside the artifact's frame. Not built: a normal (basic
  hours) day on a Saturday or Sunday, which he ruled out; the split between rates worked
  out from clock times (hours are typed); supplier invoices in Profitability (to be linked
  later); weekend time stamps for office staff and site managers (operatives only);
  blocking a weekday bank holiday in the week grid, which can still be planned as a normal
  day; a UK set of timesheets (switching region swaps the bank holiday list, but the
  sample timesheets were written around the Irish days).
- 17 Nov, round ten (decisions 108 to 116): overtime claims from the operative's phone answered
  by the site manager, the Overtime list, "weekend" renamed "overtime", bank holidays blocked as
  normal days, the site manager's phone timesheet back to last Monday week with the payroll lock,
  My hours, Attendance history per site first, the month in whole weeks, and Profitability with
  invoices and net profit. Sixteen questions were put to Oisin first (four rounds of buttons).
  The screenshot he mentioned for "Add someone to this site" did not arrive, so it was built from
  his words. DATA_VERSION 22. 509 automated tests in 51 files (new `src/lib/overtime-claims.test.ts`
  and `src/data/overtime-claims.test.ts`; `profitability.test.ts` rewritten for net profit;
  `rest-days.test.ts` for the new log lines). 1,262 browser checks in twenty-two suites, all passing
  (new `s10_check.py`, 50; `s9_check.py` updated for the new names and the Overtime list; `m3`,
  `s3`, `s6`, `s7`, `s8` and `s9` pick Everyone in Attendance history; `m3` reads the grid as the
  first table now that the Overtime list is a second; `s5` counts the month's whole weeks).
  `csp_check.py` clean. `preview_check10.py` now also claims and approves overtime and opens the
  whole-week month, from the single-file preview on disk. Not tested: a real phone, Safari and Firefox, `npm run dev`, the
  new Polish, Romanian, Portuguese and Lithuanian button name ("My hours and overtime"). Not built:
  the overtime claim sheet in the operative's own language (English, like the driving check);
  supplier invoices on live sites in Profitability (finished jobs only, his pick).
- 17 Nov, after round ten (decision 117): Profitability's costs by heading on both tabs.
  509 automated tests (`profitability.test.ts` checks every live and finished site against
  Job costs heading by heading; `overtime-claims.test.ts` the four-way split of one job's
  invoices). 1,264 browser checks in twenty-two suites, all passing: `s10_check.py` 52 (the four columns on both tabs, against the checked
  invoices, adding up, fitting the page), `s9_check.py` and `preview_check10.py` for the new
  live columns. Not tested: below 1280 pixels the table scrolls inside its panel (checked by
  eye at 1100); a real phone.
- 18 Nov, round eleven (decisions 118 to 129): Who is where per site and any day; Fleet from
  the Secure-All build as a department of its own; Report damage, Send a licence and what the
  office receives on the phones; the Back button; To do on the Dashboard. Sixteen questions
  were put to Oisin first (four rounds of buttons). DATA_VERSION 23. 551 automated tests in 56
  files (new `src/data/fleet-actions.test.ts` 19 and, from Secure-All, `fleet-spend`, `renewals`,
  `match`, `ops`, `reading` tests; `fleet-page.test.ts` rewritten; `roster.test.ts` for
  `whereOn`, `whereDays`, `sitesRunning`, `driverSiteOn`). 1,274 browser checks in
  twenty-three suites (new `s11_check.py`, 67; `m4_check.py`'s Fleet part rewritten; `s8_check.py`
  lost its old Fleet page part; `m1`, `m4b`, `m5`, `s1b`, `s5` and `review` updated for the new
  bar and addresses). `csp_check.py` 51 screens, no violations (a kept PDF shows in the browser's
  own viewer from a `blob:` frame). `preview_check11.py` opens the single-file preview from disk
  on the new screens. Found and fixed: a new address on the same screen (a row opened in place,
  a filter) scrolled the page to the top, so an approval opened from the AI overview landed out
  of sight (`useTrailTracker` in `Shell.tsx` now leaves the height alone). Also fixed in the
  suites, not the app: `s3`, `s8` and `s9` checked and exported last week, which the sample data
  does by itself from its Tuesday on, so they failed from Wednesday to Friday; they now take
  last week back to "not checked yet" first (`open_last_week` in `shots.py`). The night past
  midnight on C724 now falls to Orla Prunty and Seán Dunphy when they were in that day. Worth
  knowing: Chrome's own PDF viewer loads `chrome-extension://` files, which the preview check
  lists as requests; they are the browser's, not the internet. Not tested: the AI reading with
  the real model (the hosted copy is Aodhan's) and `/api/read` in `fn_check.py`; a real phone;
  Safari and Firefox; the new Polish, Romanian, Portuguese and Lithuanian button names.
- Tests: 235 automated tests (new `mail.test.ts`, 17; `chat.test.ts` rewritten, 20); 690
  browser checks in fourteen suites (`s2_check.py` rewritten for Team chat, 34; the Email
  part of `m5_check.py` rewritten, 69 in all; `m1_check.py` counts seven departments for a
  site manager; `s1_check.py` and `ask_check.py` allow for the unread counts and the row
  checkboxes). Not tested: a real phone, Safari and Firefox.

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

Branch `invoicing-section`. Decisions 130 to 138. What Oisin asked for: a pop-up that drafts an
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

**What came next is in "Invoicing, part two" below**, with what is still to do.

## Invoicing, part two, 18 Nov (on the co-founder's copy)

Same branch, `invoicing-section`. Decisions 139 to 147. What Oisin asked for after looking at
part one: the squares at the top clickable; a back button through the whole app; the export
to Sage like his HVAC screenshot and for Sage only; supplier invoices approved by the
managing director, then on a separate page to be paid, where accounts pay and mark paid; the
portal in a client section and a subcontractor section, with several subcontractors on a site
kept apart, their invoices going to Invoicing to be approved by the managing director or the
site manager and paid by accounts; a confirm button whenever an invoice is marked approved or
paid; and the portal telling the client or subcontractor by itself that it has been paid.

**Built.**

- **Squares** (`AgeTile` in `ClientInvoices.tsx`, `inAgeBucket` in `lib/invoices.ts`): links
  to `/invoicing/invoiced?age=0` to `3`; "Owed to us" is the Sent tab with no band.
- **Back** (`app/back.ts`, `lib/trail.ts`, the button in `Shell.tsx`): the app keeps its own
  count of the screens opened since signing in, because the browser will not say whether the
  entry before this one is a screen of the app or the sign-in page. It survives a reload
  (kept for the tab in `cod.trail`), follows the browser's own back and forward, and starts
  again on signing in or changing role, so it never leads into the role before. On a phone it
  is an arrow only; the firm's name now shortens with three dots when the bar is too narrow.
- **Sage export** (`SageExport.tsx`, `lib/accounts-export.ts`): `PACKAGE` is "Sage"
  everywhere a screen names it. The Xero and spreadsheet layouts, `accountsPackage` in
  `brand.ts` and the two switches are deleted, not hidden. One list per day book, laid out
  as the file: Type, Account, Nominal, Dept, Date, Ref, Details, Net, Tax, VAT, and on screen
  only "In Sage" (a date, or Not yet). Download CSV takes only the rows Sage does not have and
  stamps them; "Earlier files" under the table gives any file again. Sales is one SI row per
  client invoice. Purchases is one PI row (PC for a credit note) per line of each approved
  invoice, since each line has its own nominal and department, with the VAT shared between
  the lines to the cent, plus "Ex ref" for the firm's own file number. Purchase nominals are
  in `PURCHASE_NOMINALS`: 5000 materials (the code Majella named), 5010 hired plant, 5020
  equipment, 5100 transport, 5002 other, 6002 subcontractors. Accounts are the subcontractor's
  own, or made from the supplier's name (`accountRefOf`: BURLIM). Dates stay dd/mm/yyyy, as
  Sage imports them; his screenshot shows them the other way round.
- **Supplier invoices** (`Purchases.tsx`): `readStatus` "confirmed" still means approved and
  in job costs, so nothing that reads costs changed. Where one stands is worked out
  (`purchaseStage`): not read, to check, sent back, waiting for approval, to be paid, paid,
  or credit taken. Accounts check the reading as before; then "Approve to job costs" if they
  may, or "Send for approval" if not, with the reason beside the button. The approver can
  send it back with a reason. The limit is in `db.approvalLimits` and is changed by the
  managing director on To approve (0 means every supplier invoice goes to them).
- **To approve** (`/invoicing/approve`): everything waiting, who each waits for, and Approve
  and Send back on the rows the person looking may decide.
- **To be paid** (`/invoicing/to-pay`): approved invoices, soonest first, late ones in red;
  Mark paid asks for the day and an optional bank reference; a Paid tab with Undo paid.
  Paying itself stays at the bank and in Sage (decision 130).
- **Every invoice has the firm's own file number** (`fileNo`, F-1001 up, in arrival order)
  and a date to be paid by (30 days from its own date).
- **Subcontractors** are records now (`db.subcontractors`: five firms, with the sites each is
  on). Their invoices are `SupplierInvoice`s with `party: "subcontractor"`, in their own list
  (`/invoicing/subcontractor`, grouped by site). One sent in through the portal needs no
  reading: it is charged to its site under labour and subcontractors and goes straight to
  whoever approves it.
- **Projects, Subcontractor invoices** (`projects/SubInvoices.tsx`): a site manager sees the
  sites they run, each subcontractor under their own name, with Approve and Send back.
- **Portal** (`portal/SubPortal.tsx`, sidebar in two sections): the list by site on the left;
  on the right what that subcontractor sees: news (paid in the last month, sent back with the
  reason), three figures, then each of their sites with their invoices and where each stands.
  "Send an invoice": site, their number (one already used is refused), date, what for,
  amount, VAT rate, and a copy as a PDF or photo (optional, kept in the browser).
- **Confirm** (`ApproveDialog`, `SendBackDialog`, `PaidDialog` in `purchase-shared.tsx`;
  `ClientPaidDialog` in `shared.tsx`).
- **Paid notices**: both portals show them from the records (`recently`, 30 days), so Undo
  paid takes the notice away again. The email is `receiptEmail` or `remittanceEmail` in
  `lib/purchases.ts`. Suppliers have no portal and no address on file, so they get neither.
- **Sample data** (`seed/purchases.ts`, DATA_VERSION 13): seven new invoices, none approved,
  so no job's costs or margin moved: two from suppliers waiting for the managing director,
  four from subcontractors through the portal waiting for their site managers, one sent back
  to a subcontractor. Every approved invoice got who approved it (by the rule above), the
  Friday payment run that paid it, and the first Tuesday of the next month it went to Sage.
  The two that fell due most recently are left unpaid, so something is late.
- The overview's "Money" block counts invoices waiting for approval and approved to be
  paid. Ask AI's summary lists where each purchase invoice stands (not tried with a model).

**Tested.** 306 automated tests (54 new: `purchases.test.ts`, `purchase-actions.test.ts`,
`trail.test.ts`, more in `accounts-export.test.ts`, `invoices.test.ts` and `seed.test.ts`).
Browser: the new `pay_check.py` (98 checks: Back across departments, over a reload, with the
browser's forward button and after a change of role; each square; Sage sales and purchases
and the two files; accounts sending for approval and approving within the limit; Cancel and
Confirm on approval; the managing director approving, sending back and changing the limit;
To be paid, Mark paid, Undo; the subcontractor list by site and that one subcontractor never
sees another's invoices; sending an invoice with a PDF copy, a refused file and a refused
duplicate number; a site manager seeing and approving only his own sites; the remittance
advice with and without the tick; the notice in both portals; a client kept out of the
subcontractors' section; dark mode; phone width on eleven screens and the top bar).
`m3b_check.py`, `m4_check.py`, `m5_check.py`, `review_check.py` and `inv_check.py` changed for
the confirm boxes, the Sage page and the two new permissions. All fifteen suites run: 822
pass, and the one Week ahead check fails as before. `csp_check.py` passes (37 screens, no
violations). Not tested: a real phone; Safari and Firefox; `fn_check.py`; the hosted build
behind Cloudflare; Ask AI with the changed summary. `preview_check5.py` and
`preview_check6.py` (the retired preview) still name old screens.

**Known gaps in this part.**

- Subcontractor invoices carry ordinary VAT (13.5% by default). In Ireland a principal
  contractor accounts for the VAT on construction work itself and deducts RCT; none of that
  is here, at his word (decision 130). A CFO will notice.
- The Sage tax code T3 for 13.5% and the purchase nominal codes other than 5000 are Sage's
  usual ones, not Oldstone's own. Confirm with Majella.
- The office cannot log a subcontractor's invoice that came on paper: it either arrives by
  email and is read like a supplier's, or comes through the portal.
- A subcontractor whose invoice is sent back sends a new one; the old one stays as it is.
- The overview's AI overview and Portal panel say nothing of invoices to approve yet (the
  Portal panel shows four items, and five portal invoices would push every client off it).
- Reopen is not offered once an invoice has gone to Sage; a correction is made there.

**Next, in this order:**

1. Subcontractors on the site timesheet in their own section, and each invoice matched
   against the hours the site manager recorded (decisions 136 and 147).
2. The rest of the supplier side as Majella worked it: nominal code chosen per line (today it
   follows the cost heading), new suppliers with Sage's mandatory fields, and the reports she
   ran (by supplier, project, nominal code, month).
3. All invoices by site: money in and out per project, and the monthly profitability
   report she built by hand in Excel (valuation, wages from hours at a loaded rate,
   materials and subcontractors, profit).
4. Not decided yet: credit notes on client invoices; whether Ask AI should refuse to chase
   an invoice with an open query; a subcontractor sign-in role; whether suppliers get a
   remittance email.

## Reports and Customers, 18 Nov (on the co-founder's copy)

Same branch, `invoicing-section`. Decisions 148 to 160. What Oisin asked for: the reporting in
his HVAC demo, made right for a contractor: Tender win rate in place of Quote win rate; sales
by customer kept, with a customer page holding all their details and linked to the other
sections; the most profitable closed jobs, top 10 by margin %, with price, cost, margin and
margin %; where the money goes over the last 12 months, every cost; gross margin on all the
jobs of the last 12 months; and none of sales by category, by rep, supplier performance,
stock value, slow movers or debtors ageing.

**Built.**

- **Rules** (`src/lib/reports.ts`, pure, with tests): "the last 12 months" is the demo's day
  and the 364 days before it (`yearStart`, `inYear`). `tenderWinRate`, `conversionByKind`,
  `salesInYear`, `salesByCustomer`, `overdueFromClients`, `jobRow` (revenue is the contract
  value with agreed extras, cost is `projectCosts`, the Job costs screen's own figure),
  `finishedInYear`, `paidInYear`, `topByMargin`, `totals`, `onTime`, `sortJobs`,
  `whereMoneyGoes`, `customerFigures`, `customerTimeline`, `csvOf`.
- **Reports overview** (`/reports`): the five figures, each a link to where it comes from
  (Tender conversion; Gross margin; Sales by customer; Client invoices, Overdue; Gross margin
  newest first); Sales by customer, top 6; Most profitable jobs paid in full, top 10; Where
  the money goes; Tender win rate by kind of work.
- **Sales by customer** (`/reports/customers`), **Gross margin** (`/reports/margin`, the sort
  is in the address, `?sort=margin`, `revenue` or `finished`) and **Tender conversion**
  (`/reports/tenders`), each with Export CSV (the file is made in the browser).
- **Customers** (`/customers`): every customer with live jobs, tenders out, sales in the last
  12 months and what they owe; a search by name, contact, type, county or Sage account; Add
  customer. **A customer's page** (`/customers/c-02`, a tab is `?tab=projects`, `tenders`,
  `invoices`, `emails` or `files`): their figures, details (the portal line opens what they
  see), the latest with them, and a tab each for their projects (past ones too), tenders,
  invoices, emails and files; Edit details. `addCustomer` and `updateCustomer` in
  `actions.ts`, both in the Activity log.
- **Sales, Clients is gone** (`src/modules/sales/Clients.tsx` deleted). `/sales/clients` and
  `/sales/clients?client=c-02` redirect to Customers. Log enquiry for a new client adds them
  to Customers. The top bar's search finds a customer as "Customer" and opens their page,
  and says customers in its box.
- **The Sales board**: Won and Declined show the latest four, with Show all (a year of past
  tenders would otherwise fill them). Enquiries are listed newest first.
- **Access**: `customers` and `reports` are new `DepartmentKey`s. Reports is the managing
  director's by default; Customers also contracts managers' and accounts'. Both can be
  switched per level in Admin, Roles and access like any department.
- **Ask AI**: its summary has a "Reports, last 12 months" block and can link to a customer's
  page with a tab and to the reports (`safeHref`, `RECORD_LINKS`). Not tried with the model.
- DATA_VERSION 14.

**Tested.** 324 automated tests (18 new: `reports.test.ts` and link checks in
`markdown.test.ts`; the seed and Ask AI summary tests pass unchanged with the past year in). Browser: the new
`rep_check.py` (85 checks: the bar; the past year in the data; each of the five figures
against the records and against the screen it opens; the top 10 all paid in full, ordered,
and adding up; where the money goes adding up to the whole; sales by customer adding up to
the figure; tender conversion by kind adding up to the whole; gross margin's rows, on time
marks, late jobs, the three sorts, the totals, the best job and the CSV; the Customers list,
its order and search; a customer's page, figures against the records, every tab and its
address, the portal link; the old addresses; links from Invoicing and search; changing and
adding a customer, refusals included; the Activity log; contracts manager, site manager and
accounts access; Reports switched on for site managers without margins; dark mode; phone
width on seven screens). `m1_check.py`, `m2_check.py`, `m2b_check.py` and `inv_check.py`
changed for the two new tiles, the past year and Customers. All sixteen suites: 907 pass,
and the one Week ahead check fails as before. `csp_check.py` passes (44 screens, no
violations). Not tested: a real phone; Safari and Firefox; Ask AI with the bigger summary
and the new links; `fn_check.py`; the hosted build behind Cloudflare.

**Known gaps in this part.**

- The past year has no emails, approvals or activity of its own; a past customer's Emails
  tab is empty, and the Activity log starts where it did.
- Sales by customer counts invoices by the day they were sent, so a job's money can fall
  either side of the 12 months; the gross margin page counts a job by the day it finished.
- "Where the money goes" puts subcontractor invoices and the labour heading of supplier
  invoices together under Subcontractors.
- Margin on a live job (the customer's Projects tab, "so far") is from the costs posted so
  far, so it reads high early in a job.

## Compliance, 18 Nov (on the co-founder's copy)

Same branch, `invoicing-section`. Decisions 161 to 184. What Oisin asked for: a Compliance
section linked to the training and personnel records, from his HVAC compliance demo, with a
screen per area: personnel training, fleet (insurance and services) and machinery that needs
servicing every so often. Step 4's Compliance half, as first written, is covered by it.

**Built.**

- **Rules** (`src/lib/compliance.ts`, pure, with tests). A ticket or paper is good through
  its expiry day; "due" is inside 30 days (`DUE_WINDOW`). `neededTickets` is the safety card
  ("Safe Pass" in Ireland, "CSCS card" in the UK) for operatives and site managers, plus the
  trade ticket in `TRADE_TICKETS`; `ticketBlocks(person, date)` says what stops them working
  that day, missing tickets included, and `planBlocks` finds everyone planned on a day they
  cannot work. `plantBlocks` is a machine past one of `BLOCKING_CHECKS` (thorough
  examination, tower inspection, electrical safety test, harness inspection, insurance);
  `vehicleBlocks` a van with tax, test or insurance out of date; a scaffold is due every 7
  days and a "Not safe to use" stands until a safe inspection. `complianceRows` turns every
  one of them into one list of rows (who, what, due, state, proof, what it stops, which
  sites), missing ones first then soonest first; `rowsInScope` keeps a site manager to their
  own sites. Also the training matrix, courses (`courseStage`), licences (`licenceDue`: a
  yearly check, or the licence running out), subcontractors (`subFlags`,
  `subInsuranceFlags`) and the Monday reminder (`mondayReminder`).
- **What stops work** is enforced in the actions, not only shown: `markAttendance`,
  `correctAttendance`, `setPlanDay` and `planPerson` refuse a day the person cannot work
  (`mayNotWork` in `actions.ts`; `planPerson` skips those days), and `movePlant` refuses to
  send a blocked machine to a site (it now returns whether it moved).
- **Everything due** (`/compliance`): the five figures as filters (`?show=expired`,
  `blocks`, `due`, `proof`, `ok`), area (`?area=`), Needs attention or Everything
  (`?all=1`), search, and Record a renewal (pick the thing, then its own form).
- **Personnel** (`/compliance/personnel`): a banner naming everyone planned who cannot
  work, with when and their course; the matrix (`?view=list` for the list, `?person=` for
  one person), each cell a button that opens the renewal; cards sent from the site phone to
  check; Record a new ticket; Book on a course (those whose ticket is running out first).
- **Training courses** (`/compliance/courses`): to come and done; a course opens to book
  someone, take them off, or mark it done, which renews the ticket of everyone booked from
  the course's day, waiting on the certificate. The sidebar counts courses to mark done.
- **Fleet** (`/compliance/fleet`): tax, test, insurance and service for every vehicle on
  the road, each a button; driving licences with the yearly check.
- **Machinery** (`/compliance/machinery`): every scaffold and tower standing with its last
  inspection, then a column per check for every machine and piece of small kit.
- **Company papers** (`/compliance/company`) and **Subcontractors**
  (`/compliance/subcontractors`, `?sub=`): a section each, their papers (insurances, safety
  statement, a method statement per site) and their people's Safe Pass, Add a person.
- **Renewals** (`RenewDialog` in `compliance/shared.tsx`): one form per kind of thing, all
  saving without a copy as "Proof needed" (decision 183). Renewing a ticket offers the
  course it is booked on.
- **Where it shows elsewhere.** The timesheet shows "Cannot work" and refuses the mark. The
  week ahead marks those days, says how many people are planned who cannot work, and keeps
  Send switched off until they are taken off or renewed; the day planner and the picker say
  why. Plant and Vehicles lost their Renew buttons ("Renew in Compliance"); a blocked
  machine's Where list leaves out the other sites. The project's Plant tab opens with its
  scaffold register. The overview's decisions include someone planned who cannot work and a
  machine on site that may not be used. Subcontractor invoices are flagged under the
  subcontractor's name in Invoicing, in the approve box, and on a site manager's
  Subcontractor invoices; approval still goes ahead. The subcontractor's portal has "Your
  papers" with Send a new one (a copy is required there). The site phone shows a red card
  when the operative cannot work, a notice about their van, and My tickets, with "Send a
  photo of the new card"; the office checks it on Personnel and either accepts it (with the
  new date) or turns it down. The employee box links to their tickets.
- **Ask AI**: a Compliance block in the summary (the rules, the figures, who cannot work,
  what has run out or is due, courses, company papers), and links to a person's tickets and
  a subcontractor. Not tried with the model.
- **Sample data**: see "The sample data" above. DATA_VERSION 15 (24 since the merge).

**Tested.** 355 automated tests (31 new: `compliance.test.ts`, 21, and
`compliance-actions.test.ts`, 10; `overview.test.ts` and `snapshot.test.ts` changed). Browser:
the new `comp_check.py` (80 checks: the bar; the overview decision; the old address; the five
figures and their counts, the filters, the area switch, search and Record a renewal; the
matrix, the banner, the list, booking the last place on a course, a new ticket waiting on
proof; marking yesterday's course done renewing the ticket from the course's day; adding a
course; fleet papers and a licence check; recording a safe and a not safe scaffold
inspection; a harness that may not go to another site, and a transformer that can once
renewed; company papers; a subcontractor's method statement and a new person; their invoice
flagged for the site manager; the portal refusing a paper without a copy, then taking one
and the flag going; Tomás seeing his red card on the phone, sending a photo of his card, and
the office accepting it, after which he can be marked; the week ahead held back and the day
planner refusing; the scaffold register on a project (add, inspect, history, taken down);
the Activity log; a site manager's scope and what they may do, a contracts manager kept out
of company papers, accounts renewing them; dark mode; phone width on nine screens).
`m1_check.py`, `m3_check.py`, `m3b_check.py`, `m4_check.py`, `m4b_check.py`, `s1_check.py`,
`s1b_check.py` and `pay_check.py` changed for the moved tickets, the new tile and the
blocked people. All seventeen suites: 992 pass, and the one Week ahead check fails as
before. `csp_check.py` passes (53 screens, no violations). Not tested: a real phone; Safari
and Firefox; Ask AI with the bigger summary; `fn_check.py`; the hosted build behind
Cloudflare.

**Known gaps in this part.**

- The site phone's new words in Polish, Lithuanian, Romanian and Portuguese were written by
  Claude and have not been read by a native speaker.
- An overdue service does not stop a machine; only the checks in `BLOCKING_CHECKS` do.
- A subcontractor's person with a lapsed Safe Pass is flagged but not stopped: subcontractors
  are not on the timesheet yet (decisions 136 and 147).
- The UK copy uses the CSCS card as the safety card; the trade tickets are Irish names.
- Ticket lengths on renewal are fixed (`renewedTo`: four years for the safety card, three
  for the rest); a renewal can change the date.
- The Ask AI summary is about 146,000 characters, near the test's 150,000 bound (148,225 after
  the merge, trimmed: see "The two copies merged, 19 Nov").
- The first page's main file is 538 kB (166 kB compressed), over Vite's 500 kB warning,
  because the sample data builder is in it.

**Next, if he wants it:** subcontractors on the timesheet with their people's cards checked
there; overdue services stopping a machine; tax clearance and RCT for subcontractors;
a native speaker for the phone's words.

## The two copies merged, 19 Nov (on the co-founder's copy)

Decisions 185 to 197. Oisin's two lines of work were brought together on `invoicing-section`
(a merge of `step-2-team-chat` at 681c6db, which was byte for byte the HTML file he uploaded,
into `invoicing-section`), and his `main` was moved to the same commit. Both branches came
from 5449d24. Before the merge `invoicing-section` was at 059efbb and `step-2-team-chat` at
681c6db; both stay in the history as the merge commit's two parents, and `step-2-team-chat`
stays on GitHub as it was.

**What was done where they met.**

- **Decision numbers.** The other branch's 64 to 129 are kept; this copy's 64 to 118 are now 130
  to 184, in the same order (tables, sections and cross-references renumbered).
- **The data model** (`src/data/types.ts`) holds both: Fleet's `Licence` (driving licence and
  Driver CPC, with `proofNeeded`) and Compliance's yearly check as `LicenceCheck` on
  `Person.licenceCheck`; Fleet's garage invoice line renamed `RepairLine`, since this copy's
  `InvoiceLine` is a client invoice's; `Todo` gains `complianceKey` and `to`; Mail carries both
  sets of fields (invoice links, attachments, star, To, Cc, Bcc); 19 permissions; 17
  departments. DATA_VERSION 24.
- **Actions.** What stops work (`mayNotWork`) is checked in the other copy's planning actions too
  (`planDays`, `stampRestDay`, `planRestDay`, `decideSiteRequest`: a yes to a person who cannot
  work leaves the request open). Every renewal closes the to-dos made for it (`closeTodos`).
  Fleet's renewals without a copy are "Proof needed". Sent emails keep the address in `to`, not
  as a "To:" line in the body.
- **Compliance on Fleet's records** (`lib/compliance.ts`): vehicle rows from `db.vehicles`, driver
  rows from `driversOf` (driving licence, Driver CPC, yearly check; row keys `dl:` and `lic:`),
  the test named by region and vehicle (`testName`). Compliance, Fleet uses Fleet's renewal and
  licence forms; the yearly check is its own small box (`LicenceCheckForm`).
- **Admin, Requests** lists supplier invoices over the limit (`waitingForDirector` in
  `lib/requests.ts`) with the Invoicing confirm boxes, which can act for someone (`actor`).
- **Schedule.** The week grid and month grid mark someone who cannot work in red, refuse a drop
  or an Add for them, and say why; the Week ahead is held back while anyone planned cannot work.
- **The phones** (`src/modules/site/`): `PhoneFrame.tsx`; `Dialog` in `src/ui` hands a sheet
  inside a frame to `PhoneSheet` (portalled onto the frame's layer, non-modal, Escape closes the
  top one even after focus has dropped out of it). New on the site manager's phone, inside a
  job: `CannotWorkSheet`, `ScaffoldSheet`, `SubInvoiceSheet`. On the operative's: `MyTickets` and
  `CardPhotoSheet` in the profile, the red card on the front page, Do not drive on the driving
  check (both phones).
- **Invoicing** is this copy's, with decision 84 applied to the client invoice list
  (`STACK_ROW`, `LABELLED` in `ClientInvoices.tsx`). The other copy's `lib/pdf.ts` (drawn
  sample papers) is now `lib/sample-pdf.ts`; this copy's `lib/pdf.ts` writes the invoices.
- **Ask AI's summary** went to 187,000 characters with both copies' records and was trimmed to
  148,225 (see "Ask AI: how it is built").
- **Sample data.** Everything from both copies. One change of meaning: Kevin Shortall's Driver
  CPC (Fleet's sample) has run out, so eleven things stop work today, not ten. The year of past
  work skips bank holidays.

**Tested.** 686 automated tests in 63 files (`npm test`), both type checks. 1,665 browser checks
in 28 suites, all passing (`run_all.sh`, with the new `merge_check.py`, 45: the bar of 17, Files
at its own address, Back before the firm's name going back to the square that was pressed and
still after a reload, Plant and Fleet apart and the old address, this copy's Invoicing and
Profitability By site only, the other copy's Admin screens, both phones side by side and
phone-sized with the phone scrolling inside itself and the office feed beside them, the red card
and tickets in the profile, a sheet on the phone not over the page and Escape closing it, Who
cannot work, a scaffold inspection saved in the site manager's name, a subcontractor invoice
approved on the phone in his name, Do not drive, Compliance reading Fleet's records and opening
Fleet's form, Fleet's to-do ticked off by the renewal, a Compliance to-do on the Dashboard ticked
off by the renewal, and at phone width no frame, one phone and ordinary dialogs). `csp_check.py`:
76 screens, no violations. Every suite from both branches was changed where the merged app
differs: both phones are named "Operative's phone" and "Site manager's phone" (`phone_of` and
`show_phone` in `shots.py`), the bar order, 19 permissions, the grid week ahead's cannot-work
checks, the client invoice list's blocks, Compliance's fleet part, the operative's tickets in the
profile, and the payroll and history checks that expected Orla Prunty's overtime from one
particular day (now worked out from the records, as the sample data draws an ordinary late
finish on some days). Not tested: a real phone, Safari and Firefox, the AI reading and Ask AI
with the real model (the hosted copy is Aodhan's), `fn_check.py`.

**Known gaps from the merge.**

- The other copy's Job costs report download ("Download profitability report", decision 75) and
  its purchase file in three layouts went with its Invoicing screens, at Oisin's word (none of
  its Invoicing changes).
- The browser's own forward button does not follow the Back button's steps.
- The phone's frame and sheets were checked in Chrome only.

## The main offering, 19 Nov (on the co-founder's copy)

Branch `main-offering`, from `invoicing-section` with Vardil HQ (decision 198) on it. Decisions 199 to 208.

**Tested.** 715 automated tests in 68 files (new: `src/lib/apps.test.ts`, `src/lib/roster-send.test.ts`,
`src/data/main-offering.test.ts`, `server/workspace.test.ts`; `overview.test.ts` counts the new kinds
waiting in Admin, and `seed.test.ts` skips `connections`, which is settings, not a table). Both type
checks. Browser: the new `main_offering_check.py` (45 checks, on a copy built with `VITE_STAFF=1` on port
4180: Vardil HQ on the role page, the Main offering package, an announcement, the bar of six for the
managing director, Ask AI, the dashboard's waiting section and compliance panel without Approvals or
the firm at a glance, the Admin sidebar without Automations, Mark paid with its confirm box, a
certificate accepted, an overtime claim approved, Roles and access without Invoicing or Sales, Vardil
Works with six apps on and the rest to ask about, Company holidays for this year and next with a
Christmas closure, email and WhatsApp connected, Send the week on an empty week, the one phone with
its six buttons and no driving check, a repair reported and taken in hand, My profile with
certificates and the closure, the app request in Vardil HQ, and Everything bringing the two phones
back). The suites from before: all 28 run; `m3`, `m3b`, `s1`, `s3`, `s7`, `s8`, `s9`, `s10`,
`comp`, `merge` and `preview_check3` changed for the renamed send button (Send the week, which now
connects email first), Company holidays, the new Admin items and counts, and Reimbursements to pay;
all pass. `pay_check.py` has two Back checks that fail now and then, on the code from before this
work too (checked three times on `invoicing-section`). `csp_check.py`: 78 screens, no violations.
Not tested: `/api/workspace` in Cloudflare's runtime and on the hosted demo (it needs the D1 binding
and the second Access application, both Oisin's or Aodhan's to set up); a real phone; Safari and
Firefox; the new Polish, Lithuanian, Romanian and Portuguese button names (Report a repair, My
certificates), written by Claude.

**Known gaps.**

- The phone sheets are in English, as before; only button names are translated.
- A client with nothing saved on the server sees every app. Per-client switches for the managing
  director's own access and Ask AI stay in the browser of whoever set them.
- Real email and WhatsApp sending is a later build per client; the demo shows the messages.
- The Admin sidebar count for Requests does not move a crew request still with a site manager into
  the office's count when Projects is off (the Requests page and the dashboard do).
- With one phone, a request made on a day the person is on no site goes in as a general request.

## Each client's own demo, 20 Nov (on the co-founder's copy)

Branch `client-workspaces`, from `invoicing-section` at 68c0942. Decision 209.

**How it fits together.** Everyone signs in at one address behind one Cloudflare Access
application. Its policy lets in two things: the group "Demo clients, kept by Vardil HQ" and
"Emails ending in vardil.com". After sign-in, `/api/workspace` reads the email from the signed
Access token and finds the firm whose list holds it (`ownClient`); the page puts that firm's apps
and look on the demo before anything is drawn. Vardil staff see every client in Vardil HQ,
Clients, and can open any client's demo as that client sees it (`usePrefs.viewClient`; the staff
strip says whose demo it is, and Back to Vardil HQ closes it).

**Cloudflare.** `server/cloudflare.ts` writes the whole group from `firm_emails` after any change
to who signs in (GET the group for its name, PUT the full include list; an empty list holds
`nobody@clients.invalid`, since Cloudflare refuses an empty group), then signs out each email that
left every client's list. Needs `CF_API_TOKEN` (secret; permission "Access: Organizations,
Identity Providers, and Groups: Edit"), `CF_ACCOUNT_ID` and `CF_ACCESS_GROUP_ID`. Without them the
save still stands and Vardil HQ says the list is kept by hand. A failed update is remembered
(`vardil_settings`: `cf_error`, `cf_synced_at`) and "Update Cloudflare now" writes it again.

**Tested.** 727 automated tests in 69 files (new: `server/cloudflare.test.ts`; `src/lib/apps.test.ts`
rewritten for named emails, looks, logos and the new actions). Both type checks. New
`tests/functions/clients_check.py`, 68 checks: the real functions in Cloudflare's local runtime
(Wrangler 4.156.0, local D1) against `stub_cloudflare.py` for Cloudflare's API and Access keys,
then the hosted build in Chrome. On the server: no firm for someone on no list; staff only; a
domain or a Vardil address refused; one email on one client only; Cloudflare's group written with
the token and its own name kept; the client gets their apps, look and invoice paper and nobody
else's emails; the logo saved, refused as SVG or too big, served as a PNG with nosniff to the
firm's people and staff and to nobody else; a failed Cloudflare update kept and put right by
"Update Cloudflare now"; someone taken off signed out; a change that leaves the list alone not
touching Cloudflare. In Chrome: the Clients list and Cloudflare's state; a new client through the
screen (names following the client name, a bad email pointed out, emails in lower case, Main
offering, Slate green, the UK, a logo upload shown in the preview, an IBAN), saved with only the
changed invoice field kept; Open their demo (their name in the strip, their colour, logo, apps
and pounds; Settings, Branding read-only; still there after a reload); Back to Vardil HQ in
Vardil's colour; taking someone off signs them out; the client signing in (logo on the sign-in
page, no Vardil HQ, their colour and apps, Settings read-only with their full name, Vardil HQ's
address refused); someone on no list gets ABC in steel blue; the client page fits a phone;
removing a client signs out their people; no errors in the page. Found while testing: on a full
page load the look was put on before the staff files had loaded, so a staff member's open client
demo fell back to ABC on reload (now `applyLook` runs in main.tsx after both checks). Not tested:
the real Cloudflare API (the group's PUT and revoke_user were written from Cloudflare's API
reference and checked against a stand-in), the dashboard wording in the README's steps, a real
phone, Safari and Firefox.

The browser suites, run in full on Friday 20 Nov: all 28 run, 1,668 checks. Five checks fail, and
fail the same way on 68c0942 from before this work, so they come from the demo's day, not this
change: `m5_check` and `s7_check` (on a Friday a remittance advice is the newest email in Sent, so
the suites' "reply first" step clicks the wrong row), `review_check` (Month ahead: today counted
from the plan), `s9_check` (My week shows the Saturday) and `pay_check`'s Back step (flaky before).
`main_offering_check.py`: 45 of 45, three runs; its first check now waits for the role page, as
looking straight away failed now and then on the old code too. `csp_check.py`: 78 screens, no
violations.

**Decision 210, the same day: levels, end dates and tracking.** `clients_check.py` grew to
104 checks (all pass): levels per person (a made-up one dropped, none meaning every level);
Majella's visit recorded, one email to Vardil on her first visit of the day and none on the
second; apps and levels per day; staff and people on no list never recorded; an end date in the
past signing them out and the server answering "ended" with nothing else; extending it letting
them back in; Became a client signing them out with the history kept; a client unable to close a
demo; an end date passing on its own (moved in the local database) closed the next time someone
asks, and only once. In Chrome: Pat with one level going straight in and kept off the managing
director's screens; Majella choosing from six, the notice link, Compliance and the Dashboard
recorded from her clicks; the client page's status, end date, levels, last sign-in and what was
looked at; giving Pat a second level; Not interested asking first, then moving to Closed demos;
Majella then seeing only "This demo has ended". New unit tests: `server/alerts.test.ts`,
`activityOf` in `server/workspace.test.ts`, levels and demo state in `src/lib/apps.test.ts`.
Found while testing: the page's fire-and-forget POST left its answer unread, which keeps the
request open in the browser (`note` now reads it). 737 automated tests. Not tested: the real
Email Service and the real Cloudflare API.

**Set up on Oisin's Pages project (vardil-works-construction), 20 Nov:** the D1 database `vardil-works-demo` bound as `DB` (Production and Preview); `ACCESS_AUD` set to the AUD tag of the site's own Access application (`7f1ec796...`; the first try held the Vardil HQ files tag, `2e622f19...`, and every sign-in was refused, which is why `/api/workspace` now answers a refused GET with `why`: `no_token`, `other_team`, `other_application` with the token's `aud`, `expired` or `signature`); a second Access application, Vardil HQ files, on `vardil-works-construction.pages.dev/staff/*` and `*.vardil-works-construction.pages.dev/staff/*` with the policy Vardil staff (Emails ending in @vardil.com), One-time PIN, path cookie, HttpOnly, SameSite Lax. The site's own application uses the policy Construction Demo. Linked the same day: the rule group "Demo clients, kept by Vardil HQ" (Cloudflare's newer dashboard calls Access groups rule groups, under Access controls, Policies; id 66145f8c-b06a-4efc-af27-f6ce79411459), added to Construction Demo with "Emails ending in @vardil.com" (its three named emails kept); `CF_ACCOUNT_ID`, `CF_ACCESS_GROUP_ID` and the secret `CF_API_TOKEN` (Oisin's token "Vardil HQ clients": Account, Access: Organizations, Identity Providers, and Groups, Edit and Revoke, one year) for Production and Preview. Checked live: Vardil HQ, Clients says Cloudflare's list is up to date, Update Cloudflare now wrote the group (last updated 04:12, its name kept, Test Firm's email in it). Not set up: the sign-in email (Email Sending needs the Workers Paid plan, a decision for Aodhan). Checked on the preview in Oisin's Chrome: Vardil HQ, Clients reads the server; a test client, Test Firm (Main offering, amber, a logo), opens as itself, stays after a reload, and its Branding is read-only. Test Firm is in the shared database, so it shows on the live site too until removed.

**Known gaps.**

- Five browser checks fail on a Friday (above); the suites, not the app, need a fix.
- Levels are kept to on the page only (as all roles in the demo are); a prospect who knows how
  could reach another level in their own browser. It is sample data.
- The ended page is shown by the page; Cloudflare's list and sign-outs do the rest.
- With the UK region the sample data still names Irish tickets (Safe Pass) in places. This was so
  before (Settings, Region) and shows more now that a client can be set to the UK.
- The logo is kept as a JPEG, so a logo with a clear background gets a white one.
- Packages and access (this browser's package for a pitch) is separate from the clients: it
  changes only the browser it is set in.

## The phone app, 20 Nov (on the co-founder's copy)

Branch `phone-app`, from his `main` at a42ac08. Decision 211. Designed with Oisin in chat first
(questions, then pictures of the home screens and the timesheet; his picks are in the decision).

**Tested.** 756 automated tests in 72 files (new `src/lib/phone-auth.test.ts`, numbers,
passwords, codes, tries, sessions; `src/data/phone-app.test.ts`, invite to code to password to
signed in, the lock and the code limit, signing out on a new number or archiving, a site
manager's yes landing on the list to pay; `seed.test.ts` keys phone accounts by person). Both
type checks. New `tests/browser/phone_app_check.py`, 32 checks, on the build with Vardil HQ
(port 4180, as `main_offering_check.py`): the register's Phone app column and its two people to
deal with, Send invite, a number not on the register refused, the code (masked number, wrong code
refused), an easy password refused, fingerprint offered, the operative's tiles, Me saying only the
office changes the number, sign out then a wrong password (tries left) and the right one, a
receipt sent to the site manager, the fingerprint unlock, the site manager's home without My week
and My hours, the timesheet's day buttons and the four choices (Full shows no boxes, Overtime
opens them and stays picked with hours in), approving the receipt on the phone and finding it in
Admin, Ready to be paid, Sign out everywhere, Change number, a phone-sized window with no
sideways scroll, no page errors. `main_offering_check.py` changed for the app's tiles and the
repair's Vehicle or Plant (44 of 44); `s8_check.py` for the heading Ready to be paid. Not tested:
a real phone, Safari and Firefox, real texts and real fingerprint (both stand-ins in the demo).

**Decision 212, the same day: the app everywhere.** The browser suites that drove the two phones
were changed for the app (`phone_of`, `show_phone`, `pick_phone`, `pick_phone_id` and `unlock` in
`shots.py`; the old phone pickers, Make a request on the front page, My profile, Requests from the
crew, the language tabs, Report damage and the Day box became the app's tiles, Me, Crew requests,
English only, Report a repair and the day buttons): `s1`, `s3`, `s4`, `s6`, `s7`, `s8`, `s9`, `s10`,
`s11`, `m5`, `merge` and `comp`; checks for things that went (the language switch, the two frames
side by side) were taken out, checks for what replaced them put in. `phone_app_check.py` gained the
full demo (38 checks): one app, the site opening the whole job, the week ahead on the phone, back
to All my sites, an operative's photo and extra work, Send a licence with Fleet.

**Known gaps.**

- Holidays, Something else and a site manager's own receipts still go to the office. The chain
  (who approves whom, and who covers) depends on each client's answers to the onboarding form, at
  Oisin's word, so it waits for a real client's answers.
- The app is in English only (his pick: English first). The translated words in `words.ts` are no
  longer shown; they stay for when a firm asks for its languages.
- Report a repair for a vehicle goes to Admin, Repairs, not to Fleet, Damage reported.
- Tickets sent from the app go to Admin, Certificates to check, not to Compliance, Personnel's
  "Cards sent from the site phone", which nothing sends to now.
- The greeting follows the real time of day, not the demo's.

## The master demo, 20 Nov (decisions 214 to 229)

Built on the branch `master-demo-structure`, from 97d8255; in `main` since 20 Nov at Oisin's word.
DATA_VERSION 27.

**Built.**

- **Apps** (`src/app/apps.ts`): the five apps, each a list of sections, each section a list of
  screens (`Tab`: a sidebar item with the department whose access opens it). An app is a layer
  over the departments in `departments.ts`, which still decide access, addresses and Ask AI's
  links, so Admin, Roles and access works as before. `placeOf(path)` finds the app and section of
  any address (a screen listed, else the longest `also`: a tender's page belongs to Tenders).
- **The frame** (`Shell.tsx`): `AppBar` (the five apps, each opening on its first screen the
  person may open), `SectionNav` (section buttons and the open section's tabs; outside the five
  apps the department's own screens are the buttons), `UtilityButtons` (Email, Team chat, Site
  phone, Admin and Vardil HQ in the top bar). A section button counts only what needs attention
  (warn or bad counts); plain counts stay on the tabs. On a phone the light and dark switch is in
  the account menu. `Sidebar`, `SideNavCompact` and `DepartmentBar` went.
- **Dashboard** (`dashboard/Overview.tsx`, rules in `lib/boxes.ts`): the four boxes, then the
  approvals as Waiting for your yes or no (`ApprovalsPanel` takes a title) with a line for what
  waits in Admin, and To do. A box shows when the person may open its app.
- **Sales** (`sales/Sections.tsx`: `Tenders`, `Confirmed`, `Pipeline`; `sales/TenderSections.tsx`):
  the tender page (`QuotePage.tsx`) has six tabs at `?tab=documents`, `subcontractors`, `photos`,
  `workings`, `completed`. Send moved from the page's head to Tender completed. `Quote.tender`
  (`Tender`: return date, files, subcontractors' prices, checks, Buildsoft total); actions
  `setTenderReturn`, `addTenderFile`, `removeTenderFile`, `askSubPrice`, `recordSubPrice`,
  `pickSubPrice` (the subcontract line becomes the total picked), `setTenderCheck`,
  `setBuildsoftTotal`; rules in `lib/tenders.ts`. A quote drafted from an enquiry starts with an
  empty tender. Sample data `seed/tenders.ts` (no random numbers): every tender of the last few
  months has its documents, three site photos, the Buildsoft file, subcontractors' prices for
  scaffolding and the specialist trade its kind of work needs (two or three asked, ours lowest and
  picked), and its four checks; the draft Q-2620 has one price not back and nothing picked, the
  one awaiting approval three checks done. The year of past tenders keeps only a return date.
- **Finance**: `invoicing/Claims.tsx` (`PaymentClaims`), `DraftInvoiceDialog` takes a
  `projectId` to start on. Jimmy's chain: `PayChain` on `ApprovalLimit.chain`;
  `SupplierInvoice.siteStep`, `siteApprovedBy`, `siteApprovedAt`; `chainOf`, `approveStep`,
  `approvalBy` ("finish" or "site"), `approverWords` and `approveLabel` in `lib/purchases.ts`;
  actions `siteApprovePurchase`, `setPayChain`; `sendForApproval` and a subcontractor's portal
  invoice set the site step. The site manager's page (Projects, Requests and variations,
  Invoices to approve) lists suppliers' invoices too under Jimmy's chain; so does his phone.
  Admin, Requests lists what the site has approved for the managing director
  (`waitingForDirector`). Admin, Invoice approvals (`admin/InvoiceApprovals.tsx`). The
  permission "Approve subcontractor invoices for their own sites" is now "Approve invoices for
  their own sites". Sample data: all seven waiting invoices start on the site step; Slieve
  Bloom's and Portumna's are site-approved, waiting for the managing director.
- **Projects**: `LiveProjects` and `NotStarted` (the old list with its status fixed; `/projects`
  is Live projects, the old list with every status at `/projects/all`), `ResourcesToday`
  (`/projects/resources`; `/projects/today` goes there), the project page's nine tabs,
  `projects/ProjectPlan.tsx` (`ProgrammeChart`, `SiteWeekAhead`; rules in `lib/programme.ts`).
  `FileCategory` gains "Programme", with a folder in Files and on the project.

**Tested.** 787 automated tests in 76 files (new: `lib/claims.test.ts` 11, `lib/boxes.test.ts`
5, `lib/pay-chain.test.ts` 10, `lib/programme.test.ts` 5), both type checks. New browser suite
`tests/browser/master_check.py`, 47 checks, all passing, no console errors: the bar of five, no
sidebar, the four top bar buttons; the dashboard's boxes and a line in a box opening its screen;
Finance's sections and Payment claims (marks, a job opening to its invoices, drafting a claim);
Jimmy's chain end to end (waiting on the site manager, the site manager's yes as his step only,
the managing director's yes into job costs, the old rule picked in Admin with its limit); Sales'
sections, a tender's six tabs, a price recorded and picked into the subcontract, Submit held until
all four checks are ticked, then sent and in the Pipeline; Confirmed; Projects' sections, Live
projects, Resources today, the nine tabs, the programme's bars, the week ahead, an old link to
Extras; Resources' five sections and Training with the employee register; the phone width.
Checked by eye in screenshots: the dashboard, Money out, Tenders, a tender's subcontractors and
completed tabs, Payment claims, the programme, Resources today, Admin, Invoice approvals, the
dashboard at phone width.

**Not tested, and known gaps.**

- The 28 browser suites from before (`run_all.sh`) were written for the department bar and the
  left sidebar, and stop at their first step now (checked: `m1_check.py`, `comp_check.py`). They
  need their navigation steps moved to the apps and sections; what they test underneath has not
  changed. `master_check.py` is in `run_all.sh`.
- Ask AI has not been tried with the new screens (its links come from `departments.ts`, which
  lists the new addresses; its summary does not yet know about tenders' sections or the chain).
- Health and Safety waits for Jimmy (decision 218).
- The programme is worked out from the scope and the job's dates, not from a real programme; the
  attached file is not read.
- Nothing is sent to subcontractors asked to price; the request is recorded.
- A real phone, Safari and Firefox, the hosted build behind Cloudflare.

## Easier to put things in, 20 Nov (decisions 230 to 238)

Branch `easier-inputs`, from `main` at b2a98ca. DATA_VERSION 28. Oisin's ask: make the demo easier
to use and think about every step of where everything comes into it, who puts it in and how; and
five changes by name (Connections out of Admin, the Portal out of Projects for now, adding to
"Extras and snagging", the Opened column off the tenders board, a plus for requests and
variations), plus a question: how does an invoice get in that waits for the site manager and the
managing director.

**Built.**

- **The Portal paused** (`PAUSED_APPS`, `PORTAL`, `OFFERED_LEVELS` in `src/lib/apps.ts`): `useApps`
  counts a paused app as off for every firm, Vardil HQ included, so `can("portal")` is false and
  its section, routes and links go; `useAllowedLevels` never offers the client level; packages,
  `SOLD_APPS` and `packageOf` leave it out. Wording that named the portal asks `PORTAL` (the send
  and paid boxes for client and purchase invoices, Queries, the invoice page, Customers, a
  customer's page, Compliance, Billing, Settings, Roles and access, the board's move messages, the
  receipt and remittance emails, the invoice email template, Ask AI's summary). The sample data
  follows it: subcontractors' waiting invoices came by email and were added by accounts, client
  invoices went by email only, the open query and the "says it is paid" came by email, and the
  portal automation is left out.
- **Connections removed** (`admin/Connections.tsx` deleted; `/admin/connections` goes to Admin):
  the seed sets `db.connections.email` (office@ the firm's sample domain, Outlook) and `.whatsapp`,
  both "by Vardil". `connectEmail`, `connectWhatsApp` and `disconnect` are gone. `rosterBlocker`
  still refuses when neither is set, with words that say to ask Vardil.
- **Opened removed** (`QuoteStatus`, `Quote.openedAt`, the `opened` stage in `lib/pipeline.ts`, the
  board column, the tender page's line, the dashboard fact, Ask AI's summary and chaser rule).
  `kpis.sales.openedNotAnswered` is now `dueAChase`.
- **Snags** (`Snag`, `db.snags`; rules in `src/lib/snags.ts`: `openSnags`, `snagCount`,
  `holdLines`, and `takesSnags`, `takesVariations`, `takesRequests` for which jobs take what;
  actions `addSnag`, `fixSnag`, `reopenSnag`, which keep `Project.snaggingFlag` and the hold in
  step; `setSnagging` is gone). `clearHold` still releases a final account at a manager's word and
  now leaves open snags on the list and says how many in the history. Sample data
  `seed/snags.ts`, no random numbers: Glebe House (C716) has the client's list, three open and
  one fixed; St Colman's wall (C715) two of the firm's own, both fixed.
- **The add boxes** (`projects/AddDialogs.tsx`: `NewRequestDialog`, `NewVariationDialog`,
  `AddSnagDialog`; `projects/Snags.tsx`: `SnagList`). Used on Site requests, on Variations and
  snagging (`VariationsAndSnagging` in `projects/Lists.tsx`; `ExtrasAndSnagging` is kept as an
  alias, and the address is still `/projects/extras`), and on a project's Site requests and
  Variations tabs, where the old inline request form and the snagging switch went. A request
  made in the office can be general ("General, not for one site"). `ClearHoldDialog` asks first.
- **Add invoice** (`invoicing/AddInvoice.tsx`; rules `knownPayees`, `readInvoiceName`,
  `addPurchaseProblem`, `ARRIVED` in `lib/purchases.ts`; action `addPurchaseInvoice`): on the
  Suppliers and Subcontractors tabs of Money out, for anyone with "Handle invoices". The copy is
  kept with the invoice. A name that is a subcontractor on file makes it theirs (labour heading,
  their terms). "Add and send for approval" sets the site manager's step under Jimmy's chain;
  "Save to check later" leaves it with accounts, for an invoice that covers more than one job,
  whose lines are split on the invoice as before. The same supplier and number twice is refused.
  `SupplierInvoice.via` gains "hand". In this demo the file's name is read for who it is from,
  the number and the job (marked REAL BUILD: the invoice itself is read). The first step of each
  chain in `CHAIN_WORDS` now reads "The office adds the invoice, checks it against the paper and
  picks the job". Automation au-9 is "Supplier invoice read as it is added".
- **Wording**: `holdReason` and `holdWhy` in `lib/billing.ts` say "variations"; the badge on a
  finished job reads "Final account on hold"; history lines read "Variation raised", "No
  variations left to agree", "Snag added", "Snag fixed".

**Who enters what** is in the project doc `inputs/who-enters-what.md` (decision 238). Records
that still have no way in on screen, found while writing it and not built: hired plant going on
hire (a request is approved and nothing puts the machine on the Hired plant list); a new
subcontractor firm (Add invoice treats an unknown name as a supplier); a project that did not
come from a won tender; spending requests and supplies to site (sample data only); a new company
paper (they can only be renewed). Oisin to say which come next.

**Tested.** 811 automated tests in 80 files (new: `lib/snags.test.ts`, `data/snag-actions.test.ts`,
`data/add-invoice.test.ts`, `data/easier-inputs.test.ts`; `pipeline`, `pipeline-actions`,
`billing`, `overview`, `apps`, `purchase-actions`, `roster-send` and `seed` tests changed), both
type checks. New browser suite `tests/browser/easier_check.py`, 70 checks, all passing, no console
errors: no client level on the role page; Admin without Connections and the old address;
Projects without the Portal, its address refused, and no portal words on Customers, a customer's
page, the send box, subcontractor invoices or Compliance; the board without Opened and Awaiting
response's four groups adding up; Variations and snagging's three lists and reasons; New
variation refused without a site, then drafted and in Approvals; Add snag with a photo; three of
four fixed still on hold, the fourth releasing the final account, Undo holding it again; Clear
hold asking first, Cancel and Confirm; New request for a site, in Admin for the yes or no; a
project's tabs using the same boxes; Add invoice refusing an empty box, reading a file's name,
working out VAT, naming who it waits for, saving with its copy, refusing the same one twice, a
subcontractor's handed in and saved to check; the site manager's yes as his step, the managing
director's into job costs, then To be paid; the site manager offered only his own sites;
accounts adding invoices; dark mode; phone width on seven screens and the Add invoice box.
`master_check.py` 47 of 47 (its tender step now waits for the tender page, which it raced before).
The single-file preview was built and clicked through from disk (no outside requests, no errors).
Screenshots read by eye: the board, Variations and snagging in light and dark, a project's
Variations tab, Add a snag, New variation, New request, Add an invoice at desktop and phone
width, and the invoice once added.

**Not tested, and known gaps.**

- The 28 older browser suites and `csp_check.py` still stop at their first step, as before this
  round (they were written for the department bar and the old dashboard). Several of them name
  things that changed here (Connections, the Portal, Opened, the snagging switch, unread
  invoices) and will need those steps rewritten when their navigation is.
- Send the week could not be pressed in the browser run: the sample week has people planned who
  cannot work, which keeps the button off, as before. Its rule and the seeded connections are
  unit tested.
- Snags and Add invoice are on the office screens only; the site manager's phone has neither yet.
- A person given only the client level in Vardil HQ before the pause has no level to sign in as.
- Finance still calls a held final account "Held" (the invoice's own status); only Projects was
  reworded.
- Ask AI was not tried with the model: its summary lists snags and no longer says "opened".
- A real phone, Safari and Firefox, the hosted build behind Cloudflare.

## More ways in, 21 Nov (decisions 239 to 248)

Branch `more-ways-in`, from `main` at 1c68ea5 (the easier-inputs round, moved into `main` that
morning at his word). DATA_VERSION 29. Oisin's ask: help with the "Decision for you" list from the
round before, which was the records that still had no way in on screen. He picked all four groups
to build, snags on the site manager's phone, "On hold" in Finance, and to merge the round before.

**Built.**

- **Rules** (pure, with tests): `src/lib/ways-in.ts` (`hireProblem`, `hiresToArrange`,
  `hireCompanies`, `subProblem`, `projectProblem`, `scopeLines`, `paperProblem`, `USUAL_PAPERS`)
  and `src/lib/buying.ts` (`spendProblem`, `spendStage`, `toOrder`, `onOrder`, `deliveredLately`,
  `daysLate`, `orderProblem`, `mayMarkDelivered`, `buyingFor`). `holdWords` in `lib/snags.ts`.
- **Actions**: `putOnHire(form, requestId?)`, `addSubcontractor`, `addProject`, `startProject`,
  `askToSpend`, `placeOrder`, `markDelivered`, `undoDelivered`, `addCompanyPaper`. Each refuses
  what its form refuses and writes to the Activity log (and the project's history where it has one).
- **Records**: `HiredPlant.requestId`, `putOnBy`; `SpendRequest.orderId`; `SupplyOrder.projectId`
  can be null (for the firm), plus `spendId`, `amount`, `orderedBy`, `deliveredBy`;
  `Project.orderRef`, and `pricedBy` gains "Agreed price".
- **Screens**: `plant/PutOnHire.tsx`; `compliance/AddSubcontractor.tsx` (also opened from
  `invoicing/AddInvoice.tsx`, one box over the other); `projects/AddProject.tsx`;
  `projects/Orders.tsx` (`OrdersAndDeliveries` at `/projects/orders`, `BuyingLists` shared with
  the project's Site requests tab, `PlaceOrderDialog`); `AddPaperDialog` in
  `compliance/Compliance.tsx`; `site/job-sheets.tsx` (`SnagsSheet`, `DeliveriesSheet`).
  `NewRequestDialog` takes `buy` to open on Something to buy. `NextStep` in `src/ui` is the grey
  "what happens next" line every new box ends with.
- **Sample data**: rq-9, a tracked scissor lift for C722 agreed yesterday and not yet hired; sp-5,
  stainless steel cramps for C722 agreed yesterday and not yet ordered. So Hired plant opens with
  one hire to arrange and Orders and deliveries with two to order (the office printer is the other).

**Who enters what** is updated in the project doc `inputs/who-enters-what.md`, with the questions
for the onboarding form. Not records of their own, by design for now: a supplier (only a name
on its invoices and orders) and a hire company (typed on the hire, offered again once used).

**Tested.** 835 automated tests in 83 files (new: `lib/buying.test.ts`, `lib/ways-in.test.ts`,
`data/ways-in.test.ts`, the hold sentence in `lib/snags.test.ts`; `overview`, `requests` and
`site-access` tests changed for the two new sample records), both type checks. New browser suite
`tests/browser/ways_in_check.py`, 67 checks, all passing, no console errors: a hire from the
agreed request (what comes across, refused without a hire company, a known company bringing its
phone, the request dealt with) and a direct one, shown on the site's Plant tab; a subcontractor
added on its own screen (refusals, the Sage account, papers flagged missing) and from inside Add
invoice (the name and job coming across, the invoice going in as theirs); a project without a
tender (refusals, the scope count, saved, on its page, on the Programme, in Sales, Confirmed and
the Pipeline marked No tender, Start on site making it live and taking it off Confirmed); buying
end to end (the tab, the four lists and their counts, a late delivery, Something to buy refused
without an amount, the managing director's yes in Admin, Order placed refused without a supplier,
on order and linked to the ask, on the project's tab); a site manager seeing only his own sites'
orders, unable to place orders or add a project, marking one delivered and Undo; on his phone,
Orders and deliveries and Mark delivered in his name, a snag added with a photo and marked fixed
in his name with the job's flag following, Something to buy held until the amount and reason are
in; Add paper (a duplicate refused, saved with Proof needed, its row and Renew); a contracts
manager unable to add company papers but able to add a project; Finance reading On hold with the
reason and what lets it go, and no "Held" on the list or on Payment claims; the Activity log;
dark mode; phone width on nine screens and three of the boxes. `easier_check.py` 70 of 70 (its
tab list gained Orders and deliveries) and `master_check.py` 47 of 47. Screenshots read by eye:
Orders and deliveries in light and dark, Something to buy, Add a project at desktop and phone
width, the new project's page, the site's Plant tab with the new hire, Subcontractors, the phone's
site screen and snag sheet, and Finance, On hold. Found by eye and fixed: a job added with no
county read "Co. ." in its heading, so the county is now required; Finance's Clear hold cleared a
hold without asking, so it now points at the project.

**Not tested, and known gaps.**

- The 28 older browser suites and `csp_check.py` still stop at their first step, as before (they
  were written for the department bar and the old dashboard).
- Ask AI was not tried with the model. Its summary says whether an approved purchase is ordered;
  it does not yet list hires to arrange or jobs with no tender apart from "Priced by".
- Nothing is sent to a supplier or a hire company: the order and the hire are records of what the
  office arranged by phone or email.
- An order has one delivery: a part delivery cannot be recorded from the screen (the sample data
  has one), only the whole order marked delivered.
- A hire's cost is still an estimate from the rate until the hire company's invoice is added.
- A project added without a tender has no site group chat until someone makes one, and its
  heritage line reads "To be confirmed with the conservation officer".
- A real phone, Safari and Firefox, the hosted build behind Cloudflare.

## Sales and Admin, 21 Nov (decisions 249 to 258)

Branch `sales-and-admin`, from `more-ways-in` at 9d30814. DATA_VERSION 30.

**Built.**

- **Rules** (`src/lib/tenders.ts`, with tests in `tender-lists.test.ts`): `estMargin` (a tender's
  margin from its cost build-up; `quoteMargin` in `sales/Pipeline.tsx` is now this),
  `projectEstMargin`, `averagePct`, `LOST_DAYS` (90), `tenderList`, `lostLately`.
  `customerMargins` in `src/lib/reports.ts`.
- **Screens**: `Tenders` in `sales/Sections.tsx` (the five tabs, the archive's two lists, a
  `TenderTable` with Answered and Job columns on the decided lists); `Confirmed` (Est. margin,
  `SetMarginDialog`); `Pipeline` (`MarginSpan`, "22.1% est."); the Board (`PipelineBoard`) reads
  `boardHideDeclined`; `Awaiting.tsx` without Declined; `customers/Customers.tsx` with the two
  columns; `projects/AddProject.tsx` with the optional box. `MarginCell` in `src/ui/margin.tsx`
  (thin in amber, a loss in red); `OptionalNumInput` in `src/ui` for a number that may be empty.
- **Admin**: an app in `APPS` (`src/app/apps.ts`, `AppKey` gains "admin"), out of `UTILITIES` in
  `Shell.tsx` (the top bar's nav is now "Email, chat and phone"). The bottom bar's buttons are
  plain Links with their own aria-current, since a NavLink marked Admin as not open on the
  /settings screens; on a phone each is 3.75rem wide with 0.75rem names, so six fit at 375
  pixels. `departments.ts` still holds the admin and settings departments (access, addresses,
  Ask AI's links).

**Tested.** 847 automated tests in 85 files (new `src/lib/tender-lists.test.ts` 9,
`src/data/est-margin.test.ts` 3), the type check. New browser suite
`tests/browser/sales_admin_check.py`, 59 checks, all passing, no console errors: the five tender
tabs and their counts against the records, the archive apart, Est. margin on every tender, Won,
live and Lost against the records, the archive's two lists, the tab remembered; Awaiting response
without Declined; the Board's Declined on by default, the last 90 days only, off and remembered,
on again; Confirmed's margins (from the tender, typed in Add project with 140% refused, Set margin,
Change, emptied), in the log and the history; the Pipeline's three lists; Customers' two columns
against the finished jobs, blank for a customer with only running work; Admin sixth in the bar
and off the top bar, its two sections and tabs, the old Settings screens inside it, the account
menu's Settings; a contracts manager without Admin, then given it without Roles and access, Site
access or Billing; dark mode and phone width (six apps fit, every name fits its button).
`master_check.py` 47 of 47 and `easier_check.py` changed for the sixth app and Awaiting response;
`ways_in_check.py` 67 of 67. Screenshots read by eye: the archive, Confirmed, the Pipeline,
Customers, Admin's Settings, the phone's bar.

**Not tested, and known gaps.**

- The 28 older browser suites and `csp_check.py`, as before.
- Ask AI was not tried with the model; its summary does not yet give estimated margins or the
  tender lists by name.
- A customer's margins are a plain average of their jobs, so a small job counts as much as a big
  one. Reports, Gross margin weights by revenue.
- A real phone, Safari and Firefox, the hosted build behind Cloudflare.

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
      One page with three tabs since 17 Nov (decision 95): `/plant/fleet`.
      Since 18 Nov Fleet is a department of its own, from the Secure-All build (decision 119).
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
  (about 80,000 characters when built; about 138,000 since the past year went into the
  sample data on 18 Nov, which makes a first question cost more, roughly double; older paid
  supplier invoices are summed up per supplier and emails kept to the last four months to
  hold it there; about 146,000 since Compliance went in later that day, which leaves only
  4,000 before `snapshot.test.ts` fails at half the server's 300,000 limit, so trim before
  adding more; 187,000 when the two copies were merged on 19 Nov, trimmed to 148,225 by
  keeping garage invoices line by line for 91 days and summed per vehicle before that, paid
  supplier invoices for 60 days, enquiries for 120 days or while open, tenders answered more
  than 120 days ago in a short table, and emails for 70 days with bodies cut at 450 characters; about 40,000 tokens with the instructions, measured live, before), every
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
   offline. Use it on your own machine only. The one exception is Oisin's preview artifact
   (decision 88), where the artifact's own Share setting decides who can open it and the
   built-in login is only a courtesy gate on top; it holds sample data and no keys.
4. **No way to inject script. Checked.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`
   or `new Function` anywhere. Everything typed in (captions, notes, replies, names) is
   shown as text by React. The brand colour is checked against a strict pattern before it
   reaches a style. Pictures are redrawn through a canvas before they are stored, which
   strips metadata and anything hidden in the file. PDFs are stored and offered as a
   download only, never opened inside the page.
5. **Links out. Checked.** Every link that opens a new tab has `rel="noopener noreferrer"`.
6. **Secrets. Checked.** No keys or tokens in the repository. `.env` and `.env.local` are
   ignored by git. `.env.preview` is committed on purpose and holds the preview's settings: the
   router mode and, since 17 Nov, the preview's username and the SHA-256 of its password
   (decision 88). That hash is not a secret in the way a key is, since the same value is in
   the published page, but a short password can be guessed from it, so a real one should be long.
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

- An overtime claim is in English on the operative's phone; only its button name is translated
  (decision 113).
- Overtime hours are typed by whoever marks time (decision 100): nothing checks them against
  clock times, so the split between time and a half and double time is theirs to get right.
  The Saturday and Sunday limits on a weekend time stamp are the only ones enforced.
- Profitability counts plant only once its invoice is checked: hire still running and the
  firm's own plant cost nothing there until then (decision 117, his pick).
- Fleet (18 Nov): the AI reading needs the hosted copy (Aodhan's) and has not been tried there
  with the real model; `tests/functions/fn_check.py` does not cover `/api/read` yet. A garage
  repair is not charged to a job. A driver's base is their van's. The phone's licence sheet does
  not use the AI (the date is typed, or comes with the sample). A vehicle's mileage is typed.
- Other sample events (emails, invoices, deliveries) are dated on working days by weekday
  only, so one can fall on a bank holiday on some demo days; timesheets and the plan cannot.

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
