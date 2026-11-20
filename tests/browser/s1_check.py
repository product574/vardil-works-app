import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT, phone_of, show_phone, pick_phone, pick_phone_id, unlock

# Step 1 of Aodhan's changes (16 Nov): the new overview (AI overview, top five sites, approvals
# opened and closed in place with client emails first, the Portal panel), the Admin section,
# Email beside Dashboard, the site phone in English, and (asked for on 16 Nov, after step 1)
# the Files section kept, Billing in Admin and Sales cards moved between columns.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(350)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(400)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    bar = page.locator("nav[aria-label=Departments]")
    page.wait_for_selector("text=AI overview"); page.wait_for_timeout(300)
    # Start from fresh sample data, which also saves it in the browser for data() to read.
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── The bar: Email beside Dashboard, Files kept, Admin at the end
    labels = [t.strip().split("\n")[-1] for t in bar.locator("a").all_inner_texts()]  # an unread count may sit above the name
    check("Bar: Email sits right after Dashboard", labels[:2] == ["Dashboard", "Email"], labels)
    check("Bar: Admin is there for the managing director; Inbox and Files are not (Files out of the bar 17 Nov)", "Admin" in labels and "Files" not in labels and "Inbox" not in labels, labels)

    # ── The AI overview (option B, worked out from the records)
    ai = main.locator("section", has=page.get_by_role("heading", name="AI overview"))
    check("AI overview: where Waiting on you was, saying it is worked out from the records", ai.count() == 1 and "Worked out from today's records" in ai.inner_text() and main.get_by_text("Waiting on you").count() == 0)
    decisions = ai.locator("ul").first.locator("li")
    facts = ai.locator("ul").nth(1).locator("li")
    check("AI overview: up to three decisions, each with one button, then up to four facts", decisions.count() == 3 and all(d.get_by_role("button").count() == 1 for d in decisions.all()) and facts.count() == 4, (decisions.count(), facts.count()))
    overdue = data(page, "db.salesInvoices.filter(i => i.status==='Invoiced' && i.dueOn < day).reduce((s, i) => s + i.net * (1 + i.vatPct/100), 0)")
    euro = "€" + f"{round(overdue):,}"
    check("AI overview: the overdue figure matches the invoices", euro in ai.inner_text(), (euro, ai.inner_text()[:300]))
    held = data(page, "(() => { const f = db.salesInvoices.find(i => i.status==='Held' && i.description==='Final account' && db.approvals.some(a => a.kind==='variation' && a.status==='Pending' && a.projectId===i.projectId)); return f ? db.projects.find(p => p.id===f.projectId).name : '' })()")
    check("AI overview: the first decision is the final account held on an extra", held != "" and held in decisions.first.inner_text() and decisions.first.inner_text().startswith("Agree the"), decisions.first.inner_text()[:160])
    onsite = main.locator("section", has=page.get_by_role("heading", name="On site today"))
    h = [round(ai.locator(".flex-1").first.bounding_box()["height"]), round(onsite.locator(".flex-1").first.bounding_box()["height"])]
    check("AI overview and On site today are the same height", abs(h[0] - h[1]) <= 1, h)
    live = data(page, "db.projects.filter(p => p.status==='Live').length")
    check("On site today: the top five sites, then a link to the rest", onsite.locator("tbody tr").count() == 5 and onsite.get_by_role("link", name=f"All {live} sites ({live - 5} more)").count() == 1, (onsite.locator("tbody tr").count(), live))
    page.screenshot(path=f"{OUT}/170-overview.png")

    # A decision's button opens the draft in place.
    decisions.first.get_by_role("button").click(); page.wait_for_timeout(600)
    opened = main.locator("button[aria-expanded=true]")
    check("Open the extra: the variation opens on the same page, in view", "/dashboard?open=" in page.url and opened.count() == 1 and "Variation" in opened.inner_text() and opened.bounding_box()["y"] < 900, page.url)
    check("The extra says approving releases the held final account", "releases it to invoicing" in main.inner_text())
    main.get_by_role("button", name="Approve variation").click(); page.wait_for_timeout(500)
    first = ai.locator("ul").first.locator("li").first.inner_text()
    check("AI overview: once the extra is agreed, the next decision moves up", first.startswith("Chase"), first[:120])

    # ── Approvals: in place, client emails first, any number closed
    go(page, "/dashboard")
    appr = main.locator("section", has=page.get_by_role("heading", name="Approvals"))
    check("Approvals: none open on arrival", appr.locator("button[aria-expanded=true]").count() == 0)
    groups = [t for t in appr.locator("ul > li[aria-hidden=true]").all_inner_texts()]
    check("Approvals: anything with a client comes first, then internal", len(groups) == 2 and groups[0].startswith("With a client") and groups[1].startswith("Internal"), groups)
    first_client = appr.locator("ul > li").nth(1).inner_text()
    check("Approvals: the client rows name the client", "Rathdoon Select Vestry" in first_client or "Ardmullen Estate" in first_client, first_client[:120])
    row = appr.get_by_role("button", name=re.compile("^Handover"))
    row.click(); page.wait_for_timeout(300)
    check("Approvals: a row opens in place and says where the email goes", row.get_attribute("aria-expanded") == "true" and "To Susan Kane" in appr.inner_text() and "from info@" in appr.inner_text())
    appr.get_by_role("button", name=re.compile("^Quote")).click(); page.wait_for_timeout(300)
    check("Approvals: opening another closes the first", appr.locator("button[aria-expanded=true]").count() == 1 and row.get_attribute("aria-expanded") == "false")
    appr.get_by_role("button", name=re.compile("^Quote")).click(); page.wait_for_timeout(300)
    check("Approvals: clicking an open row closes it, and nothing re-opens", appr.locator("button[aria-expanded=true]").count() == 0 and "open=" not in page.url, page.url)
    check("Approvals: the other tables stay on the page", main.locator("section", has=page.get_by_role("heading", name="Portal")).count() == 1 and main.get_by_text("The firm at a glance").count() == 1)

    # The Monday ticket reminder is a real draft now.
    appr.get_by_role("button", name=re.compile("^Ticket reminder")).click(); page.wait_for_timeout(300)
    body = appr.get_by_label("Email").input_value()
    check("Ticket reminder: an email to the site managers, written from everything in Compliance (18 Nov)", "To The site managers <sitemanagers@" in appr.inner_text() and all(a in body for a in ["Personnel:", "Fleet:", "Machinery:", "Company:", "Subcontractors:"]), body[:200])
    appr.get_by_role("button", name="Approve ticket reminder").click(); page.wait_for_timeout(400)
    sent = data(page, "db.mails.filter(m => m.folder==='Sent')[0]")
    check("Ticket reminder: approving files it under Sent, from info@", sent["subject"] == "Compliance: what runs out in the next 30 days" and sent["fromAddress"].startswith("info@"), sent["subject"])

    # Discard, then bring back: only a discarded draft can go back to waiting.
    appr.get_by_role("button", name=re.compile("^Variation.*cracked quoins")).click(); page.wait_for_timeout(300)
    appr.get_by_role("button", name="Discard").click(); page.wait_for_timeout(200)
    page.locator("dialog[open]").get_by_role("button", name="Discard").click(); page.wait_for_timeout(300)
    appr.get_by_role("tab", name=re.compile("^Done")).click(); page.wait_for_timeout(300)
    appr.get_by_role("button", name=re.compile("^Variation.*cracked quoins")).click(); page.wait_for_timeout(300)
    check("Done: a discarded draft can be moved back to waiting", appr.get_by_role("button", name="Move back to waiting").count() == 1)
    appr.get_by_role("button", name="Move back to waiting").click(); page.wait_for_timeout(300)
    back = data(page, "(() => { const a = db.approvals.find(a => a.id==='ap-1'); const v = db.variations.find(v => v.id===a.variationId); return [a.status, v.status] })()")
    check("Done: moving it back opens the variation again", back == ["Pending", "Draft"], back)
    appr.get_by_role("tab", name=re.compile("^Done")).click(); page.wait_for_timeout(300)
    appr.get_by_role("button", name=re.compile("^Ticket reminder")).click(); page.wait_for_timeout(300)
    check("Done: an approved email cannot be taken back", appr.get_by_role("button", name="Move back to waiting").count() == 0 and "cannot be taken back" in appr.inner_text())
    appr.get_by_role("tab", name=re.compile("^Waiting")).click(); page.wait_for_timeout(200)

    # ── The Portal panel
    portal = main.locator("section", has=page.get_by_role("heading", name="Portal"))
    t = portal.inner_text()
    check("Portal: the latest from clients and subcontractors", "Latest from clients and subcontractors" in t and "Kinvara Stone Carvers" in t and "subcontractor" in t and "client" in t)
    check("Portal: what is outstanding, invoices and supplies", "Outstanding" in t and "SI-10404" in t and "supplies" in t and ("late" in t or "Due" in t))
    portal.get_by_role("link", name=re.compile("Kinvara Stone Carvers")).first.click(); page.wait_for_timeout(500)
    check("Portal: an update links to its project", "/projects/C719" in page.url, page.url)

    # ── Admin: requests waiting for a yes or no
    go(page, "/admin")
    t = main.inner_text()
    check("Admin: Requests gathers leave, site requests and spending", "Leave (3)" in t and "From the sites (4)" in t and "Spending (3)" in t, t[:200])
    side = page.locator("nav[aria-label='Admin screens']:visible")
    # Since 19 Nov the phone's own wait here too: overtime claims, repairs reported, certificates to check, reimbursements to pay.
    extra = data(page, "db.overtimeClaims.filter(c => c.status === 'Waiting').length + db.repairs.filter(r => r.status === 'Reported').length + db.certSubmissions.filter(c => c.status === 'Waiting').length + db.expenses.filter(x => x.status === 'Approved' && !x.paidAt).length")
    check("Admin: the sidebar holds Requests, Repairs, Roles and access, Company holidays, Connections, Automations, the Activity log and Vardil Works", all(side.get_by_role("link", name=n).count() == 1 for n in [f"Requests {14 + extra}", "Roles and access", "Company holidays", "Connections", "Automations", "Activity log", "Vardil Works"]), side.inner_text())
    page.screenshot(path=f"{OUT}/171-admin-requests.png", full_page=True)
    main.get_by_role("button", name="Approve: A third 150 litre drum mixer").click(); page.wait_for_timeout(300)
    sp = data(page, "(() => { const x = db.spendRequests.find(s => s.id==='sp-1'); return [x.status, x.decidedBy] })()")
    check("Admin: approving spending records who said yes", sp == ["Approved", "Aidan King"], sp)
    check("Admin: the answer shows under Answered in the last two weeks", "A third 150 litre drum mixer" in main.locator("section", has_text="Answered in the last two weeks").inner_text())
    main.get_by_role("button", name=re.compile("^Decline: 20 m articulated boom lift")).click(); page.wait_for_timeout(200)
    page.locator("dialog[open]").get_by_role("button", name="Decline").click(); page.wait_for_timeout(300)
    rq = data(page, "(() => { const r = db.requests.find(r => r.description.startsWith('20 m articulated boom lift')); return [r.status, r.decision] })()")
    check("Admin: declining a site request closes it as declined", rq == ["Done", "Declined"], rq)
    main.get_by_role("button", name="Approve: General operatives to help adapt the scaffold at belfry level").click(); page.wait_for_timeout(300)
    go(page, "/projects/requests")
    r = main.locator("tr", has_text="General operatives to help adapt the scaffold")
    check("Site requests: an agreed one stays open for the office, marked Approved", r.count() == 1 and "Approved" in r.inner_text() and r.get_by_role("button", name="Mark dealt with").count() == 1)
    go(page, "/admin")
    main.get_by_role("button", name="Approve: leave for Paudie Lyne").click(); page.wait_for_timeout(300)
    check("Admin: approving leave works as on Holidays", data(page, "db.holidays.find(h => h.personId==='p-121' || h.note==='Hospital appointment').status") == "Approved")
    check("Admin: the count in the sidebar goes down", side.get_by_role("link", name=f"Requests {10 + extra}").count() == 1, side.inner_text())
    go(page, "/admin/activity")
    check("Activity log: in Admin, recording the answers", "Agreed to spend" in main.inner_text() and "Turned down a site request" in main.inner_text())
    go(page, "/admin/connections")
    check("Connections: what a real build connects to, and that the demo does not", main.locator("tbody tr").count() == 6 and "Microsoft 365" in main.inner_text() and "nothing is connected" in main.inner_text())
    go(page, "/admin/access")
    check("Roles and access: now in Admin, with the new yes or no permission", "What they can do" in main.inner_text() and "Answer requests for a yes or no" in main.inner_text())

    # ── Old addresses still land in the right place
    for old, new in [("/dashboard/approvals?open=ap-7", "/dashboard?open=ap-7"), ("/dashboard/automations", "/admin/automations"), ("/dashboard/activity", "/admin/activity"), ("/settings/roles?person=p-hs", "/admin/access?person=p-hs")]:
        page.goto(BASE + old); page.wait_for_timeout(500)
        check(f"Moved: {old} goes to {new}", page.url.endswith(new), page.url)

    # ── Site phone opens in English
    go(page, "/site"); unlock(page)
    check("Site phone: opens in English (the phone app is English first, 20 Nov)", phone_of(page, "operative").get_by_role("button", name=re.compile("^Send a photo")).count() == 1 and page.get_by_role("tab", name="English").count() == 0)

    # ── Other roles
    as_role(page, "Contracts manager")
    go(page, "/dashboard")
    ai = main.locator("section", has=page.get_by_role("heading", name="AI overview"))
    check("Contracts manager: the overview's chaser button opens the invoices instead of Ask AI", ai.get_by_role("button", name="Open the invoices").count() == 1 and ai.get_by_role("button", name="Draft chasers").count() == 0)
    check("Contracts manager: no Admin by default", page.locator("nav[aria-label=Departments]").get_by_role("link", name="Admin").count() == 0)
    page.goto(BASE + "/admin"); page.wait_for_timeout(400)
    check("Contracts manager: typing /admin is sent home", "/admin" not in page.url, page.url)
    as_role(page, "Managing director")

    # ── Phone width: the overview stacks and nothing scrolls sideways
    page.set_viewport_size({"width": 390, "height": 844})
    go(page, "/dashboard")
    ai_y = main.get_by_role("heading", name="AI overview").bounding_box()["y"]; site_y = main.get_by_role("heading", name="On site today").bounding_box()["y"]
    check("Phone: the AI overview comes first, On site today under it", ai_y < site_y, (ai_y, site_y))
    check("Phone: no sideways scrolling on the overview", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.screenshot(path=f"{OUT}/172-overview-phone.png", full_page=True)
    go(page, "/admin")
    check("Phone: no sideways scrolling on Admin, Requests", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.set_viewport_size({"width": 1440, "height": 900})

    # ── Dark
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    go(page, "/dashboard"); page.screenshot(path=f"{OUT}/173-overview-dark.png")
    page.get_by_role("button", name="Switch to light mode").click()

errs = []
try:
    errs = run(steps)
except Exception as e:
    print("STOPPED EARLY:", str(e).split("\n")[0])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
