import os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# The master demo, 20 Nov 2026 (decisions 214 to 226): the Oldstone template agreed with Jimmy.
# Level 1 the Dashboard with a box per app; Level 2 the five apps in the bottom bar; Level 3 the
# sections as buttons across the top, with their screens as tabs. Email, Team chat, the Site
# phone and Admin are small buttons in the top bar. Then what is new inside the apps: tenders with
# their six sections, Confirmed and Pipeline, Payment claims, Jimmy's invoice approval chain set in
# Admin, Live projects, Not started, Resources today, and a project's Programme and Week ahead.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(300)
def sign_in_as(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role, exact=True).click(); page.wait_for_timeout(500)

APPS = ["Dashboard", "Sales", "Projects", "Resources", "Finance"]

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main h1"); page.wait_for_timeout(300)
    dlg = lambda: page.locator("dialog[open]").last
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(500)
    bar = page.get_by_role("navigation", name="Apps")
    sections = lambda: page.locator("nav[aria-label$=' sections']")
    tabs = lambda: page.locator("nav[aria-label$=' screens']")

    # ── 1. The frame
    names = [t.strip().split("\n")[-1] for t in bar.get_by_role("link").all_inner_texts()]
    check("Bar: the five apps in order", names == APPS, names)
    check("No left sidebar anywhere", page.locator("nav.w-52").count() == 0)
    util = page.get_by_role("navigation", name="Email, chat, phone and admin")
    labels = [l.get_attribute("aria-label") for l in util.get_by_role("link").all()]
    check("Top bar: Email, Team chat, Site phone and Admin as small buttons", [l.split(",")[0] for l in labels] == ["Email", "Team chat", "Site phone", "Admin"], labels)
    check("Top bar: Email shows its unread count", any(l.startswith("Email,") and "unread" in l for l in labels), labels)

    # ── 2. Dashboard: a box per app, then waiting and to do
    boxes = [h.inner_text() for h in page.locator("main section[aria-labelledby^='box-'] h2").all()]
    check("Dashboard: Sales, Projects, Resources and Finance boxes", boxes == ["Sales", "Projects", "Resources", "Finance"], boxes)
    fin = page.locator("section[aria-labelledby='box-finance']")
    issued = data(page, "(() => { const m = day.slice(0, 7); const jobs = db.projects.filter(p => p.status === 'Live' || p.status === 'Complete'); const done = jobs.filter(p => db.salesInvoices.some(i => i.projectId === p.id && (i.status === 'Invoiced' || i.status === 'Paid') && (i.issuedOn || '').slice(0, 7) === m)); return done.length + ' of ' + jobs.length; })()")
    check("Dashboard: Finance box counts this month's claims as the records do", issued in fin.inner_text(), (issued, fin.inner_text()[:200]))
    check("Dashboard: every box has a bar", page.locator("main section [role=img]").count() == 4)
    check("Dashboard: Waiting for your yes or no, and To do, under the boxes", page.get_by_role("heading", name="Waiting for your yes or no").count() == 1 and page.get_by_text("To do", exact=True).count() >= 1)
    page.screenshot(path=f"{OUT}/1000-dashboard.png", full_page=True)
    page.locator("section[aria-labelledby='box-finance'] a", has_text="payment claim").first.click(); page.wait_for_url("**/invoicing/claims"); page.wait_for_selector("table[aria-label^='Payment claims']"); page.wait_for_timeout(300)
    check("Dashboard: a line in a box opens where it is dealt with", page.url.endswith("/invoicing/claims"), page.url)

    # ── 3. Finance: Money in opens on Payment claims
    secs = [s.strip().split("\n")[0] for s in sections().get_by_role("link").all_inner_texts()]
    check("Finance: Money in, Money out, Profitability reports", secs == ["Money in", "Money out", "Profitability reports"], secs)
    check("Finance: Payment claims is the first tab of Money in", tabs().get_by_role("link").first.inner_text().startswith("Payment claims"))
    rows = page.locator("table[aria-label^='Payment claims'] > tbody > tr")
    reds = page.locator("table[aria-label^='Payment claims']").get_by_text("To be issued", exact=True).count()
    check("Claims: jobs still to claim are marked To be issued", reds >= 1, reds)
    first = rows.first
    code = first.locator("td").nth(1).locator("a").inner_text().split(" ")[0]
    first.get_by_role("button", name=f"Show the invoices for {code}").click(); page.wait_for_timeout(200)
    check("Claims: a job opens to its invoices", page.get_by_label(f"Invoices for {code}", exact=True).count() + page.get_by_text(f"Nothing invoiced on {code} yet.").count() == 1)
    first.get_by_role("button", name="Draft this month's claim").click(); page.wait_for_timeout(300)
    check("Claims: Draft this month's claim starts on that job", code in dlg().inner_text(), dlg().inner_text()[:200])
    dlg().get_by_role("button", name="Create draft invoice").click(); page.wait_for_url("**/invoicing/client/**"); page.wait_for_timeout(300)
    go(page, "/invoicing/claims")
    check("Claims: the job now shows its claim drafted, not sent", "Drafted, not sent" in page.locator("tr", has_text=code).first.inner_text())
    page.screenshot(path=f"{OUT}/1001-claims.png", full_page=True)

    # ── 4. Jimmy's chain: site manager, then managing director
    go(page, "/admin/approvals")
    check("Admin: Invoice approvals, with Jimmy's chain picked", page.get_by_role("radio", name="Site manager, then managing director").is_checked())
    go(page, "/invoicing/approve")
    waits = page.locator("main tbody tr", has_text="Atlantic Lead").first.inner_text()
    check("To approve: a supplier's invoice waits on its site manager first", "then the managing director" in waits, waits)
    sign_in_as(page, "Site manager"); go(page, "/projects/subcontractor-invoices")
    check("Site manager: the page is Invoices to approve, suppliers' included", page.get_by_role("heading", name="Invoices to approve").count() == 1)
    corrib = page.locator("tr", has_text="CS-INV-9921")
    if corrib.get_by_role("button", name="Approve CS-INV-9921").count():
        corrib.get_by_role("button", name="Approve CS-INV-9921").click(); page.wait_for_timeout(200)
        check("Site manager: the box says it goes to the managing director next", "goes to the managing director" in dlg().inner_text(), dlg().inner_text()[:300])
        dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(300)
        st = data(page, "(() => { const s = db.supplierInvoices.find(x => x.invoiceNo === 'CS-INV-9921'); return [s.readStatus, !!s.siteApprovedAt]; })()")
        check("Site manager: his yes is his step only; it is not in job costs yet", st == ["needs_review", True], st)
    else:
        check("Site manager: may approve Corrib's invoice on his site", False, corrib.inner_text())
    sign_in_as(page, "Managing director"); go(page, "/admin")
    check("Admin, Requests: the managing director sees the invoices the site has approved", page.get_by_text("Invoices approved by the site, for your yes").count() == 1)
    row = page.locator("tr", has_text="Corrib Scaffolding")
    row.get_by_role("button", name="Approve: Corrib Scaffolding CS-INV-9921").click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(300)
    check("Managing director: his yes puts it into job costs, to be paid", data(page, "db.supplierInvoices.find(x => x.invoiceNo === 'CS-INV-9921').readStatus") == "confirmed")
    go(page, "/admin/approvals")
    page.get_by_role("radio", name="Accounts up to a limit, managing director above").check(); page.wait_for_timeout(300)
    lim = (page.get_by_label("Limit before VAT", exact=True).count(), data(page, "db.approvalLimits[0].chain"))
    check("Admin: the old rule can be picked, with its limit", lim == (1, "accounts-limit"), lim)
    page.get_by_role("radio", name="Site manager, then managing director").check(); page.wait_for_timeout(200)

    # ── 5. Sales: four sections and a tender's six
    page.locator("nav[aria-label='Apps']").get_by_role("link", name="Sales").click(); page.wait_for_url("**/sales/enquiries"); page.wait_for_timeout(400)
    secs = [s.strip().split("\n")[0] for s in sections().get_by_role("link").all_inner_texts()]
    check("Sales: Enquiries, Tenders, Confirmed, Pipeline, Customers", secs == ["Enquiries", "Tenders", "Confirmed", "Pipeline", "Customers"], secs)
    go(page, "/sales/tenders")
    check("Tenders: the draft is listed with its return date", page.locator("tr", has_text="Q-2620").count() == 1 and "Due back" in page.locator("tr", has_text="Q-2620").inner_text())
    page.get_by_role("link", name="Q-2620 Kilcashel Courthouse").click(); page.wait_for_url("**/sales/quotes/Q-2620"); page.get_by_role("tablist", name="Tender sections").wait_for()
    t = [re.sub(r"\d+$", "", x.split("\n")[0].strip()) for x in page.get_by_role("tablist", name="Tender sections").get_by_role("tab").all_inner_texts()]
    check("Tender: Overview, Tender documents, Subcontractors, Photos, Workings and Buildsoft, Tender completed", t == ["Overview", "Tender documents", "Subcontractors", "Photos", "Workings and Buildsoft", "Tender completed"], t)
    check("Tender overview: location, client and return date", page.get_by_text("Kilcashel, Co. Mayo").count() >= 1 and page.get_by_role("heading", name="Return date").count() == 1)
    page.get_by_role("tab", name="Subcontractors").click(); page.wait_for_timeout(200)
    trades = page.get_by_label("Subcontractors' prices").locator("tbody[aria-label]").evaluate_all("(els) => els.map(e => e.getAttribute('aria-label'))")
    check("Tender subcontractors: grouped by trade, stone carving for a stone portico", "Stone carving" in trades and "Scaffolding" in trades, trades)
    midland = page.locator("tr", has_text="Midland Scaffold Hire")
    midland.get_by_role("button", name="Record price").click(); page.get_by_label("Price before VAT").fill("4380"); dlg().get_by_role("button", name="Save the price").click(); page.wait_for_timeout(200)
    page.locator("tr", has_text="Corrib Scaffolding").get_by_role("button", name="Use this price").click(); page.wait_for_timeout(200)
    for trade_row in ["Kinvara Stone Carvers"]:
        r = page.locator("tr", has_text=trade_row)
        if r.get_by_role("button", name="Use this price").count(): r.get_by_role("button", name="Use this price").click(); page.wait_for_timeout(200)
    sub = data(page, "(() => { const q = db.quotes.find(x => x.ref === 'Q-2620'); return [q.costing.subcontract, q.tender.subPrices.filter(p => p.picked).reduce((t, p) => t + p.price, 0)]; })()")
    check("Tender subcontractors: the prices picked become the tender's subcontract", abs(sub[0] - sub[1]) < 0.01 and sub[0] > 0, sub)
    page.get_by_role("tab", name="Photos").click(); page.wait_for_timeout(200)
    check("Tender photos: the site visit photos", page.get_by_label("Site photos").locator("li").count() == 3)
    page.get_by_role("tab", name="Workings and Buildsoft").click(); page.wait_for_timeout(200)
    check("Tender workings: the priced items, the cost build-up and the Buildsoft estimate", page.get_by_role("heading", name="Priced items").count() == 1 and page.get_by_role("heading", name="Buildsoft estimate").count() == 1)
    page.get_by_role("tab", name="Tender completed").click(); page.wait_for_timeout(200)
    submit = page.get_by_role("button", name="Submit tender")
    check("Tender completed: Submit waits for the checks", submit.is_disabled())
    for c in ["Subcontractors priced", "Workings checked", "Price approved"]:
        page.get_by_role("checkbox", name=c).check(); page.wait_for_timeout(150)
    check("Tender completed: with all four ticked it can go", submit.is_enabled())
    submit.click(); dlg().get_by_role("button", name="Confirm and submit").click(); page.wait_for_timeout(300)
    check("Tender completed: submitting sends it and it is in the Pipeline as tendered", data(page, "db.quotes.find(x => x.ref === 'Q-2620').status") == "Sent")
    page.screenshot(path=f"{OUT}/1002-tender.png", full_page=True)
    go(page, "/sales/pipeline")
    check("Pipeline: tendered works and confirmed orders, each with its list", page.get_by_label("Tendered works").get_by_text("Q-2620").count() == 1 and page.get_by_label("Confirmed orders").locator("li").count() >= 1)
    go(page, "/sales/confirmed")
    check("Confirmed: the won jobs not started yet", page.get_by_label("Confirmed orders").locator("tbody tr").count() == data(page, "db.projects.filter(p => p.status === 'Not started').length"))

    # ── 6. Projects
    page.locator("nav[aria-label='Apps']").get_by_role("link", name="Projects").click(); page.wait_for_url("**/projects"); page.wait_for_selector("main tbody tr"); page.wait_for_timeout(300)
    secs = [s.strip().split("\n")[0] for s in sections().get_by_role("link").all_inner_texts()]
    check("Projects: Live projects, Not started and Resources today first", secs[:3] == ["Live projects", "Not started", "Resources today"], secs)
    live = data(page, "db.projects.filter(p => p.status === 'Live').length")
    check("Live projects: only the live ones", page.locator("main tbody tr").count() == live, live)
    go(page, "/projects/resources")
    check("Resources today: people, our plant and hired plant for every live site", page.get_by_text("Hired plant (", exact=False).count() == live and page.get_by_text("Our plant (", exact=False).count() == live)
    go(page, "/projects/C721")
    t = [re.sub(r"\d+$", "", x.split("\n")[0].strip()) for x in page.get_by_role("tablist", name="Project sections").get_by_role("tab").all_inner_texts()]
    check("Project: the nine sections", t == ["Overview", "Files", "Programme", "Week ahead", "Variations", "Photos", "Plant", "Site requests", "Costs"], t)
    page.get_by_role("tab", name="Programme").click(); page.wait_for_timeout(200)
    check("Programme: a bar for every scope item", page.get_by_role("table", name="Programme for C721").locator("[role=row]").count() - 1 == data(page, "db.scopeTasks.filter(t => t.projectId === db.projects.find(p => p.code === 'C721').id).length"))
    page.get_by_role("tab", name="Week ahead").click(); page.wait_for_timeout(200)
    check("Week ahead: this week and next, day by day", page.get_by_role("table", name="This week on C721").count() == 1 and page.get_by_role("table", name="Next week on C721").count() == 1)
    go(page, "/projects/C721?tab=extras")
    check("An old link to Extras lands on Variations", page.get_by_role("tab", name="Variations").get_attribute("aria-selected") == "true")

    # ── 7. Resources: the five sections
    page.locator("nav[aria-label='Apps']").get_by_role("link", name="Resources").click(); page.wait_for_url("**/schedule"); page.wait_for_timeout(400)
    secs = [s.strip().split("\n")[0] for s in sections().get_by_role("link").all_inner_texts()]
    check("Resources: Scheduling, Timesheet, Plant, Fleet, Training", secs == ["Scheduling", "Timesheet", "Plant", "Fleet", "Training"], secs)
    sections().get_by_role("link", name="Training").click(); page.wait_for_url("**/compliance"); page.wait_for_timeout(400)
    tl = [x.strip().split("\n")[0] for x in tabs().get_by_role("link").all_inner_texts()]
    check("Training is Compliance, with the employee register", tl[0] == "Everything due" and "Employee register" in tl, tl)

    # ── 8. Phone width
    page.set_viewport_size({"width": 390, "height": 844}); go(page, "/dashboard")
    box = bar.bounding_box()
    check("Phone width: the five apps fit across the screen", box and box["x"] >= 0 and box["x"] + box["width"] <= 390, box)
    wide = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.clientWidth, [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > document.documentElement.clientWidth + 1).slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 60) + ':' + Math.round(e.getBoundingClientRect().right))]")
    check("Phone width: nothing scrolls sideways", wide[0] <= wide[1], wide)
    page.screenshot(path=f"{OUT}/1003-phone.png")
    page.set_viewport_size({"width": 1440, "height": 900})

import traceback
errs = []
try:
    errs = run(steps)
except Exception as e:
    print("STOPPED EARLY:", str(e).split("\n")[0]); traceback.print_exc()
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
