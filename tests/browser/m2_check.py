import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sys
from shots import run, BASE, OUT

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))

def data(page, expr):
    return page.evaluate("(() => { const db = JSON.parse(localStorage.getItem('cod.data')).state.db; return " + expr + "; })()")

def as_role(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role).click()
    page.wait_for_timeout(350)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")

    # ── Sales board
    page.goto(BASE + "/sales"); page.wait_for_selector("section[aria-label='To quote']")
    count = lambda label: page.locator(f"section[aria-label='{label}'] li").count()
    check("Board: 3 enquiries to quote", count("To quote") == 3, count("To quote"))
    check("Board: 2 drafting, 3 sent, 2 opened, 1 queried", (count("Drafting"), count("Sent"), count("Opened"), count("Queried")) == (2, 3, 2, 1), (count("Drafting"), count("Sent"), count("Opened"), count("Queried")))
    check("Board: Won shows the latest 4 of 22 (a year of past work) with a 'Show all 22' button", count("Won") == 4 and page.get_by_role("button", name="Show all 22").count() == 1, count("Won"))
    page.screenshot(path=f"{OUT}/20-sales-board.png")
    page.get_by_role("switch", name="Show declined quotes").click(); page.wait_for_timeout(200)
    check("Board: declined column appears when switched on, the latest 4 of 26", count("Declined") == 4 and page.get_by_role("button", name="Show all 26").count() == 1, count("Declined"))
    page.get_by_role("switch", name="Show declined quotes").click()

    # ── Log an enquiry, draft a quote from it
    page.get_by_role("button", name="Log enquiry").click()
    page.get_by_role("button", name="Log enquiry").last.click(); page.wait_for_timeout(200)
    check("Log enquiry: empty form is refused with a message", "Add where the work is" in page.locator("dialog[open]").inner_text())
    page.get_by_label("Building or address").fill("The Old Forge, Main Street")
    page.get_by_label("What is needed").fill("Re-slate the forge roof and repair lead valleys")
    page.locator("dialog[open] button[type=submit]").click(); page.wait_for_timeout(300)
    check("Log enquiry: new card in To quote", count("To quote") == 4, count("To quote"))
    page.locator("section[aria-label='To quote'] li button").first.click(); page.wait_for_timeout(200)
    pending0 = data(page, "db.approvals.filter(a => a.status==='Pending').length")
    page.get_by_role("button", name="Draft a quote from this").click(); page.wait_for_url("**/sales/quotes/Q-2621"); page.wait_for_timeout(300)
    check("Draft quote: opens Q-2621 awaiting approval", "Awaiting approval" in page.locator("header").nth(1).inner_text())
    check("Draft quote: roofing wording picked the slating rate book", any("Re-slate in natural blue-black slate" in i.input_value() for i in page.get_by_label("Item description").all()))
    check("Draft quote: an approval was created", data(page, "db.approvals.filter(a => a.status==='Pending').length") == pending0 + 1)

    # ── Edit a quantity, margin and total respond
    total_before = data(page, "db.quotes.find(q=>q.ref==='Q-2621').lines.reduce((s,l)=>s+l.qty*l.rate,0)")
    first_qty = page.locator("input[aria-label^='Quantity']").first
    first_qty.fill("10"); page.wait_for_timeout(200)
    total_after = data(page, "db.quotes.find(q=>q.ref==='Q-2621').lines.reduce((s,l)=>s+l.qty*l.rate,0)")
    check("Quote: editing a quantity changes the total", total_after != total_before, (total_before, total_after))
    page.screenshot(path=f"{OUT}/21-quote-costing.png")
    page.get_by_role("tab", name="Client copy").click(); page.wait_for_timeout(200)
    check("Quote: client copy shows VAT and terms but no cost or margin", "VAT at 13.5%" in page.content() and "What it costs us" not in page.locator("main").inner_text())
    page.screenshot(path=f"{OUT}/22-quote-client-copy.png")
    page.get_by_role("tab", name="Costing").click()

    # ── Send, accept, project created
    page.get_by_role("button", name="Approve and send").click(); page.wait_for_timeout(300)
    check("Quote: approve and send marks it Sent and clears its approval", data(page, "db.quotes.find(q=>q.ref==='Q-2621').status") == "Sent" and data(page, "db.approvals.filter(a => a.status==='Pending').length") == pending0)
    page.get_by_role("button", name="Record acceptance").first.click()
    page.get_by_label("Client's purchase order number").fill("PO-77120")
    page.get_by_role("button", name="Accept and create project").click(); page.wait_for_url("**/projects/C729"); page.wait_for_timeout(300)
    check("Accept: project C729 created and opened", "C729" in page.locator("h1").inner_text(), page.locator("h1").inner_text())
    proj = data(page, "(() => { const p = db.projects.find(p=>p.code==='C729'); return { status: p.status, value: p.value, tasks: db.scopeTasks.filter(t=>t.projectId===p.id).length, lines: db.quotes.find(q=>q.id===p.quoteId).lines.length, po: db.quotes.find(q=>q.id===p.quoteId).poNumber } })()")
    check("Accept: scope copied from the quote lines, value and PO carried over", proj["tasks"] == proj["lines"] and proj["value"] == total_after and proj["po"] == "PO-77120" and proj["status"] == "Not started", proj)

    # ── Project page tabs
    page.goto(BASE + "/projects"); page.wait_for_selector("table")
    check("Projects: Live filter shows 7", page.locator("tbody tr").count() == 7, page.locator("tbody tr").count())
    page.screenshot(path=f"{OUT}/23-projects.png")
    page.locator("tbody tr", has_text="C720").click(); page.wait_for_url("**/projects/C720"); page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/24-project-overview.png")
    tabs = [t.inner_text().split("\n")[0].strip() for t in page.locator("[role=tablist][aria-label='Project sections'] [role=tab]").all()]
    check("Project: MD sees 9 tabs including Costs and Files", len(tabs) == 9 and any(t.startswith("Costs") for t in tabs) and any(t.startswith("Files") for t in tabs), tabs)
    for name, shot in [("Scope", "25-project-scope"), ("Photos", "26-project-photos"), ("Plant", "27-project-plant"), ("Requests", "28-project-requests"), ("Extras", "29-project-extras"), ("Costs", "30-project-costs"), ("History", "31-project-history")]:
        page.locator("[role=tablist][aria-label='Project sections']").get_by_role("tab", name=name).click(); page.wait_for_timeout(250)
        page.screenshot(path=f"{OUT}/{shot}.png")
    check("Project: tab is kept in the address", "tab=history" in page.url, page.url)

    # ── Scope tick, raise extra, hold, approve releases
    page.goto(BASE + "/projects/C720?tab=scope"); page.wait_for_timeout(300)
    done_before = data(page, "db.scopeTasks.filter(t=>t.projectId==='pr-C720' && t.done).length")
    page.locator("input[type=checkbox]:not(:checked)").first.click(); page.wait_for_timeout(200)
    check("Scope: ticking an item records who and when", data(page, "db.scopeTasks.filter(t=>t.projectId==='pr-C720' && t.done).length") == done_before + 1 and data(page, "db.scopeTasks.filter(t=>t.projectId==='pr-C720' && t.done).slice(-1)[0].completedBy") == "Aidan King")
    page.goto(BASE + "/projects/C723?tab=extras"); page.wait_for_timeout(300)
    page.get_by_role("button", name="Raise an extra").click()
    page.get_by_label("What was found").fill("Two cast iron railing panels are cracked and must be recast")
    page.get_by_label("Measured extra").fill("2 no. railing panels recast")
    page.get_by_label("Estimated value, ex VAT").fill("1450")
    page.get_by_role("button", name="Raise extra").click(); page.wait_for_timeout(300)
    st = data(page, "(() => { const p = db.projects.find(p=>p.code==='C723'); return { hold: p.invoiceHold, extras: p.extrasFlag, pend: db.approvals.filter(a => a.status==='Pending' && a.projectId===p.id).length, value: p.value } })()")
    check("Extra on a live project: variation drafted, approval created, final account to be held", st["hold"] and st["extras"] and st["pend"] == 1 and "Extras to agree" in page.locator("header").nth(1).inner_text() and "will be held when the work is complete" in page.locator("main").inner_text(), st)
    ap = data(page, "db.approvals.find(a => a.status==='Pending' && a.projectId==='pr-C723').id")
    page.goto(BASE + "/dashboard/approvals?open=" + ap); page.wait_for_timeout(300)
    page.get_by_role("button", name="Approve variation").click(); page.wait_for_timeout(300)
    st2 = data(page, "(() => { const p = db.projects.find(p=>p.code==='C723'); return { hold: p.invoiceHold, value: p.value } })()")
    check("Extra: approving adds 1,450 to the contract value and releases the hold", (not st2["hold"]) and round(st2["value"] - st["value"], 2) == 1450, st2)

    # ── Complete a project
    page.goto(BASE + "/projects/C724?tab=scope"); page.wait_for_timeout(300)
    while page.locator("input[type=checkbox]:not(:checked)").count() > 0:
        page.locator("input[type=checkbox]:not(:checked)").first.click(); page.wait_for_timeout(80)
    check("Complete: banner offers completion once everything is ticked", page.get_by_role("button", name="Mark project complete").count() == 1)
    page.get_by_role("button", name="Mark project complete").click(); page.wait_for_timeout(300)
    c = data(page, "(() => { const p = db.projects.find(p=>p.code==='C724'); return { status: p.status, inv: db.salesInvoices.filter(i=>i.projectId===p.id).map(i=>i.status+':'+i.description), hand: db.approvals.filter(a=>a.kind==='handover' && a.projectId===p.id && a.status==='Pending').length } })()")
    check("Complete: status Complete, final account ready to invoice, handover drafted", c["status"] == "Complete" and "To invoice:Final account" in c["inv"] and c["hand"] == 1, c)
    page.goto(BASE + "/projects/completed"); page.wait_for_timeout(300)
    check("Completed list: C724 shows its handover draft waiting", "Draft in approvals" in page.locator("tr", has_text="C724").inner_text())
    page.goto(BASE + "/projects/extras"); page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/32-extras-snagging.png")
    held_before = page.get_by_role("button", name="Clear hold").count()
    page.locator("li", has_text="C716").get_by_role("button", name="Clear hold").click(); page.wait_for_timeout(300)
    check("Extras and snagging: clearing a finished job's hold removes it and releases its final account", page.get_by_role("button", name="Clear hold").count() == held_before - 1 and data(page, "db.salesInvoices.filter(i=>i.status==='Held').length") == 1, held_before)

    # ── Requests
    page.goto(BASE + "/projects/requests"); page.wait_for_timeout(300)
    open_before = page.locator("tbody tr").count()
    page.get_by_role("button", name="Mark dealt with").first.click(); page.wait_for_timeout(200)
    check("Requests: marking one dealt with moves it out of Open", page.locator("tbody tr").count() == open_before - 1, open_before)

    # ── Other sales screens
    page.goto(BASE + "/sales/awaiting"); page.wait_for_timeout(300); page.screenshot(path=f"{OUT}/33-awaiting.png")
    page.get_by_role("button", name="Chase").first.click(); page.wait_for_timeout(200)
    check("Awaiting: chasing records the time", "Last chased today" in page.locator("main").inner_text())
    page.goto(BASE + "/customers"); page.wait_for_timeout(300)
    page.locator("tbody tr", has_text="Ardmullen Estate").get_by_role("link", name="Ardmullen Estate").click(); page.wait_for_url("**/customers/c-02"); page.wait_for_timeout(300)
    page.get_by_role("tab", name=re.compile("^Projects")).click(); page.wait_for_timeout(200)
    has_project = "C720 Ardmullen House" in page.locator("main").inner_text()
    page.get_by_role("tab", name=re.compile("^Tenders")).click(); page.wait_for_timeout(200)
    check("Customers: opening one lists its projects and tenders", has_project and "Q-2616" in page.locator("main").inner_text())
    page.screenshot(path=f"{OUT}/34-client.png")
    page.goto(BASE + "/sales/enquiries"); page.wait_for_timeout(300); page.screenshot(path=f"{OUT}/35-enquiries.png")

    # ── Roles and money
    as_role(page, "Site manager")
    page.goto(BASE + "/projects"); page.wait_for_selector("table")
    page.get_by_role("tab", name="All").click(); page.wait_for_timeout(200)
    codes = sorted(r.inner_text().split("\t")[0].strip() for r in page.locator("tbody tr").all())
    check("Site manager: sees only the projects he runs, past ones included (C729 was assigned to him when it was created)", codes == ["C697", "C698", "C712", "C719", "C724", "C729"], codes)
    check("Site manager: sees the Value column by default", "Value" in page.locator("thead").inner_text())
    page.goto(BASE + "/projects/C719"); page.wait_for_timeout(300)
    tabs = [t.inner_text().split("\n")[0].strip() for t in page.locator("[role=tablist][aria-label='Project sections'] [role=tab]").all()]
    check("Site manager: no Costs tab", not any(t.startswith("Costs") for t in tabs), tabs)
    page.goto(BASE + "/projects/C719?tab=costs"); page.wait_for_timeout(300)
    check("Site manager: typing the Costs address shows no costs", "Cost to date" not in page.locator("main").inner_text())
    page.goto(BASE + "/projects/C720"); page.wait_for_timeout(300)
    check("Site manager: another manager's project is closed to him", "run by another site manager" in page.locator("main").inner_text())
    page.goto(BASE + "/sales"); page.wait_for_timeout(300)
    check("Site manager: Sales is closed to him", "/sales" not in page.url, page.url)

    as_role(page, "Managing director")
    page.goto(BASE + "/settings/roles"); page.wait_for_timeout(300)
    page.screenshot(path=f"{OUT}/36-roles-access.png")
    page.get_by_role("checkbox", name="Site manager: contract values").click(); page.wait_for_timeout(200)
    page.get_by_role("checkbox", name="Site manager: Sales").click(); page.wait_for_timeout(200)
    as_role(page, "Site manager")
    page.goto(BASE + "/projects"); page.wait_for_selector("table")
    check("Access grid: switching values off hides the Value column for site managers", "Value" not in page.locator("thead").inner_text())
    check("Access grid: switching Sales on adds it to his department bar", page.locator("nav[aria-label=Departments] a", has_text="Sales").count() == 1)
    page.goto(BASE + "/sales"); page.wait_for_selector("section[aria-label='Sent']")
    check("Access grid: with values off, the board shows no money", "€" not in page.locator("main").inner_text())
    as_role(page, "Contracts manager")
    page.goto(BASE + "/settings/roles"); page.wait_for_timeout(300)
    check("Only the managing director can open Roles and access", "/settings" not in page.url, page.url)

    # ── Dark and phone
    as_role(page, "Managing director")
    page.get_by_role("button", name="Switch to dark mode").click()
    page.goto(BASE + "/sales"); page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/37-board-dark.png")
    page.goto(BASE + "/projects/C721?tab=plant"); page.wait_for_timeout(300); page.screenshot(path=f"{OUT}/38-plant-dark.png")
    page.get_by_role("button", name="Switch to light mode").click()
    page.set_viewport_size({"width": 390, "height": 844})
    for path, shot in [("/sales", "39-board-mobile"), ("/projects/C720", "40-project-mobile"), ("/projects", "41-projects-mobile")]:
        page.goto(BASE + path); page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/{shot}.png")
        over = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
        check(f"Phone width: page itself does not scroll sideways on {path}", not over)

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
