import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT

# Aodhan's three changes after seeing step 1 (16 Nov): keep the Files section (with To be sorted),
# Billing in Admin with the three months before this one, and Sales cards moved between columns.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(350)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(400)
def col(page, name):
    return page.locator(f"section[aria-label='{name}']")
def refs(page, name):
    return [t.strip() for t in col(page, name).locator("li span.font-medium.whitespace-nowrap").all_inner_texts()]
def drag(page, card, target):
    """Drag a card by mouse in small steps, as a person would, so the board sees the drag start."""
    a = card.bounding_box(); b = target.bounding_box()
    page.mouse.move(a["x"] + 40, a["y"] + 30); page.mouse.down()
    page.mouse.move(a["x"] + 80, a["y"] + 50, steps=6); page.wait_for_timeout(150)
    page.mouse.move(b["x"] + b["width"] / 2, b["y"] + 120, steps=10); page.wait_for_timeout(250)
def drop(page):
    page.mouse.up(); page.wait_for_timeout(400)
def dlg(page):
    return page.locator("dialog[open]")

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.wait_for_selector("text=AI overview"); page.wait_for_timeout(300)
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── 1. The Files section is kept, with To be sorted
    bar = [t.strip() for t in page.locator("nav[aria-label=Departments] a").all_inner_texts()]
    check("Files: out of the bar since 17 Nov (Oisin), Plant then Invoicing", "Files" not in bar and bar.index("Invoicing") == bar.index("Plant") + 1, bar)
    go(page, "/files/unsorted", "table")
    check("Files: To be sorted holds the six loose files again", page.locator("tbody tr").count() == 6 and "6" in page.locator("nav[aria-label$=screens]:visible").get_by_role("link", name="To be sorted").inner_text())
    go(page, "/files?project=C721&folder=Invoices", "table")
    check("Files: an address into the Files section stays there", "/files?project=C721&folder=Invoices" in page.url and "/ Invoices" in main.inner_text().replace("\n", " "), page.url)

    # ── 2. Billing in Admin
    go(page, "/admin")
    side = page.locator("nav[aria-label$=screens]:visible")
    check("Billing: in Admin's sidebar under Account", side.get_by_role("link", name="Billing").count() == 1 and "Account" in side.inner_text())
    side.get_by_role("link", name="Billing").click(); page.wait_for_selector("text=Past invoices"); page.wait_for_timeout(300)
    people = data(page, "db.people.filter(p => p.kind === 'Management' && p.active).length")
    inv = data(page, "db.subscriptionInvoices.map(i => [i.number, i.month, i.issuedOn <= day, i.amount, i.users, i.perUser])")
    check("Billing: three past invoices, for the three months before this one, newest first", [i[0] for i in inv] == ["VD-2610", "VD-2609", "VD-2608"] and [i[1] for i in inv] == ["2026-10-01", "2026-09-01", "2026-08-01"] and all(i[2] for i in inv), inv)
    check("Billing: each is the people with a sign-in times the price", all(i[3] == i[4] * i[5] and i[4] == people for i in inv), (people, inv))
    rows = main.locator("tbody tr")
    check("Billing: the table shows them with month, issue date, people, amount and status", rows.count() == 3 and "October 2026" in rows.nth(0).inner_text() and "2 Nov 2026" in rows.nth(0).inner_text() and "€767.00" in rows.nth(0).inner_text() and rows.filter(has_text="Paid").count() == 3, rows.nth(0).inner_text())
    check("Billing: the plan and the next invoice, worked out from today's people", f"{people} people with a sign-in, at €59.00 each a month" in main.inner_text() and "Next invoice on 1 Dec 2026, for November 2026: €767.00" in main.inner_text(), main.inner_text()[:400])
    page.screenshot(path=f"{OUT}/180-billing.png")
    main.get_by_role("button", name="Change plan").click(); page.wait_for_timeout(250)
    check("Billing: Change plan says how the plan follows the team", "counts as one person" in dlg(page).inner_text() and dlg(page).get_by_role("link", name="Roles and access").count() == 1)
    dlg(page).get_by_role("button", name="Close").first.click(); page.wait_for_timeout(200)
    # Archive one office person: the next invoice follows, the past ones do not.
    page.evaluate("""(() => { const s = JSON.parse(localStorage.getItem('cod.data')); s.state.db.people.find(p => p.id === 'p-off').active = false; localStorage.setItem('cod.data', JSON.stringify(s)); })()""")
    go(page, "/admin/billing", "text=Past invoices")
    check("Billing: one person fewer changes the next invoice, not the past ones", f"{people - 1} people with a sign-in" in main.inner_text() and f"€{(people - 1) * 59}.00 before VAT" in main.inner_text() and main.locator("tbody tr").first.locator("td").nth(3).inner_text() == str(people))
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # Admin switched on for the contracts managers: Billing and Roles and access stay the managing director's.
    go(page, "/admin/access")
    page.get_by_role("switch", name="Contracts manager: Admin").click(); page.wait_for_timeout(300)
    as_role(page, "Contracts manager")
    go(page, "/admin")
    side = page.locator("nav[aria-label$=screens]:visible")
    check("Admin given to a contracts manager: no Billing or Roles and access in it", side.get_by_role("link", name="Requests").count() == 1 and side.get_by_role("link", name="Billing").count() == 0 and side.get_by_role("link", name="Roles and access").count() == 0 and "Account" not in side.inner_text())
    go(page, "/admin/billing")
    at_billing = page.url
    go(page, "/admin/access")
    check("Admin given to a contracts manager: Billing and Roles and access send them back to Admin", at_billing.endswith("/admin") and page.url.endswith("/admin") and "Past invoices" not in main.inner_text(), (at_billing, page.url))
    page.set_viewport_size({"width": 390, "height": 844}); go(page, "/admin")
    check("Admin given to a contracts manager, on a phone: no Billing or Roles and access either", page.locator("nav[aria-label$=screens]:visible").get_by_role("link", name="Billing").count() == 0 and page.locator("nav[aria-label$=screens]:visible").get_by_role("link", name="Roles and access").count() == 0)
    page.set_viewport_size({"width": 1440, "height": 900})
    as_role(page, "Managing director")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── 3. Sales: cards move between columns
    go(page, "/sales")
    check("Board: every card has a handle to move it", main.get_by_role("button", name=re.compile("^Move ")).count() == main.locator("section li").count() and main.get_by_role("button", name="Move ENQ-1423").count() == 1)
    start = {n: refs(page, n) for n in ["To quote", "Drafting", "Sent", "Opened", "Queried"]}
    check("Board: the sample data starts where expected", start == {"To quote": ["ENQ-1423", "ENQ-1421", "ENQ-1419"], "Drafting": ["Q-2619", "Q-2620"], "Sent": ["Q-2613", "Q-2612", "Q-2611"], "Opened": ["Q-2615", "Q-2614"], "Queried": ["Q-2616"]}, start)
    pending = data(page, "db.approvals.filter(a => a.status === 'Pending').length")

    # While dragging: the columns say what a drop would do, and the ones that make no sense dim.
    drag(page, col(page, "To quote").locator("li").first, col(page, "Drafting"))
    hint = col(page, "Drafting").locator("header p").inner_text()
    dim = col(page, "Sent").get_attribute("class")
    page.screenshot(path=f"{OUT}/181-board-dragging.png")
    check("Drag: the column it can go to says what dropping does", hint == "Drop to draft a quote from it", hint)
    check("Drag: a column it cannot go to is dimmed", "opacity-55" in dim, dim)
    drop(page)
    check("Drop: asks first, saying what will happen", "Move ENQ-1423 to Drafting" in dlg(page).inner_text() and "priced from your rate books" in dlg(page).inner_text())
    dlg(page).get_by_role("button", name="Draft the quote").click(); page.wait_for_timeout(400)
    check("Drop: the enquiry becomes a drafted quote in Drafting, waiting in Approvals", refs(page, "To quote") == ["ENQ-1421", "ENQ-1419"] and "Q-2621" in refs(page, "Drafting") and data(page, "db.approvals.filter(a => a.status === 'Pending').length") == pending + 1, refs(page, "Drafting"))

    # The handle does the same without dragging (phones, keyboards): back to To quote.
    main.get_by_role("button", name="Move Q-2621").click(); page.wait_for_timeout(250)
    opts = dlg(page).locator("li button")
    check("Handle: lists every column with what moving there does, or why it cannot", opts.count() == 6 and dlg(page).get_by_role("button", name=re.compile("^Opened")).is_disabled() and "set by the client" in dlg(page).inner_text())
    dlg(page).get_by_role("button", name=re.compile("^To quote")).click(); page.wait_for_timeout(200)
    check("Handle: picking one explains it, with Back", "is thrown away" in dlg(page).inner_text() and dlg(page).get_by_role("button", name="Back").count() == 1)
    dlg(page).get_by_role("button", name="Discard the draft").click(); page.wait_for_timeout(400)
    check("Back to To quote: the draft and its approval go, the enquiry waits for a price again", refs(page, "To quote")[0] == "ENQ-1423" and "Q-2621" not in refs(page, "Drafting") and data(page, "db.approvals.filter(a => a.status === 'Pending').length") == pending and data(page, "db.enquiries.find(e => e.ref === 'ENQ-1423').quoteId") is None)

    # Drafting to Sent: approve and send.
    drag(page, col(page, "Drafting").locator("li").first, col(page, "Sent")); drop(page)
    check("Drafting to Sent: approving and sending, named for the client", dlg(page).get_by_role("button", name="Approve and send").count() == 1 and "Rathdoon Select Vestry" in dlg(page).inner_text())
    dlg(page).get_by_role("button", name="Approve and send").click(); page.wait_for_timeout(400)
    check("Drafting to Sent: the quote is sent and its approval closed", refs(page, "Sent")[0] == "Q-2619" and data(page, "db.approvals.find(a => a.quoteId === 'q-19').status") == "Approved", refs(page, "Sent"))

    # Sent to Queried: the client's question is needed.
    q2613 = col(page, "Sent").locator("li", has=page.get_by_role("button", name="Move Q-2613"))
    drag(page, q2613, col(page, "Queried")); drop(page)
    btn = dlg(page).get_by_role("button", name="Record the question")
    check("Sent to Queried: asks what the client asked, and will not go on without it", btn.is_disabled())
    dlg(page).get_by_label("Their question").fill("Could the mill race walls be done in two phases?")
    btn.click(); page.wait_for_timeout(400)
    check("Sent to Queried: the question is on the quote", "Q-2613" in refs(page, "Queried") and data(page, "db.quotes.find(q => q.ref === 'Q-2613').query") == "Could the mill race walls be done in two phases?")

    # Opened back to Sent makes no sense: the column dims and nothing happens on a drop.
    drag(page, col(page, "Opened").locator("li").first, col(page, "Sent"))
    check("Opened to Sent: refused, the column dims", "opacity-55" in col(page, "Sent").get_attribute("class"))
    drop(page)
    check("Opened to Sent: a drop there does nothing", dlg(page).count() == 0 and refs(page, "Opened") == ["Q-2615", "Q-2614"])

    # Queried to Won: a purchase order, then a project.
    projects = data(page, "db.projects.length")
    q2616 = col(page, "Queried").locator("li", has=page.get_by_role("button", name="Move Q-2616"))
    drag(page, q2616, col(page, "Won")); drop(page)
    dlg(page).get_by_label("Client's purchase order number").fill("PO-88120")
    dlg(page).get_by_role("button", name="Accept and create project").click(); page.wait_for_timeout(400)
    made = data(page, "(() => { const p = db.projects[0]; return [p.code, p.quoteId, db.quotes.find(q => q.ref === 'Q-2616').poNumber] })()")
    check("Queried to Won: a project is made from it with the purchase order", data(page, "db.projects.length") == projects + 1 and made[1] == data(page, "db.quotes.find(q => q.ref === 'Q-2616').id") and made[2] == "PO-88120" and refs(page, "Won")[0] == "Q-2616", made)

    # Opened to Declined, with the handle (Declined is hidden until then), then reopened.
    main.get_by_role("button", name="Move Q-2614").click(); page.wait_for_timeout(250)
    dlg(page).get_by_role("button", name=re.compile("^Declined")).click(); page.wait_for_timeout(200)
    dlg(page).get_by_role("button", name="Record as declined").click(); page.wait_for_timeout(400)
    check("Declined: recorded, and the Declined column shows so it can be seen", col(page, "Declined").count() == 1 and "Q-2614" in refs(page, "Declined") and page.get_by_role("switch", name="Show declined quotes").get_attribute("aria-checked") == "true")
    main.get_by_role("button", name="Move Q-2614").click(); page.wait_for_timeout(250)
    dlg(page).get_by_role("button", name=re.compile("^Drafting")).click(); page.wait_for_timeout(200)
    dlg(page).get_by_role("button", name="Reopen it").click(); page.wait_for_timeout(400)
    check("Declined to Drafting: reopened as a draft", "Q-2614" in refs(page, "Drafting") and data(page, "db.quotes.find(q => q.ref === 'Q-2614').status") == "Draft")

    # A won quote stays put.
    main.get_by_role("button", name="Move Q-2610").click(); page.wait_for_timeout(250)
    check("Won: every move is refused, with the reason", all(b.is_disabled() for b in dlg(page).locator("li button").all()) and "is a project now" in dlg(page).inner_text())
    dlg(page).get_by_role("button", name="Cancel").click()

    go(page, "/admin/activity")
    for what in ["Drafted a quote from an enquiry", "Discarded a draft quote", "Sent a quote", "A client asked about a quote", "Recorded an accepted quote", "Recorded a declined quote", "Reopened a declined quote"]:
        check(f"Activity log: {what}", main.get_by_text(what).count() >= 1)

    # ── A site manager files loose files only into the projects they run
    as_role(page, "Site manager")
    go(page, "/files/unsorted", "table")
    opts = page.get_by_label("Project for Revised window schedule rev C.pdf").locator("option").all_inner_texts()
    own = data(page, "db.projects.filter(p => p.siteManagerId === 'p-sm1' && (p.status === 'Live' || p.status === 'Not started')).map(p => p.code)")
    check("To be sorted, site manager: only the projects they run to choose from", sorted(o.split(" ")[0] for o in opts[1:]) == sorted(own) and "C720" not in own, (opts, own))
    check("To be sorted, site manager: a suggestion for someone else's project says so and is not filed", "C720, which is not one of your projects" in main.inner_text() and page.get_by_role("button", name=re.compile("^File the")).count() == 0)
    as_role(page, "Managing director")

    # ── People without the pricing permission see the board but cannot move it
    as_role(page, "Accounts")
    go(page, "/sales")
    check("Accounts: no handles, and the cards cannot be dragged", main.get_by_role("button", name=re.compile("^Move ")).count() == 0 and main.locator("section li[draggable=true]").count() == 0)
    as_role(page, "Managing director")

    # ── Phone width: the handle works where dragging does not
    page.set_viewport_size({"width": 390, "height": 844})
    go(page, "/sales")
    check("Phone: the board scrolls inside itself, not the page", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    main.get_by_role("button", name="Move ENQ-1421").click(); page.wait_for_timeout(250)
    check("Phone: the move list opens and fits the screen", dlg(page).count() == 1 and dlg(page).bounding_box()["width"] <= 390)
    page.screenshot(path=f"{OUT}/182-move-phone.png")
    dlg(page).get_by_role("button", name="Cancel").click()
    go(page, "/admin/billing", "text=Past invoices")
    check("Phone: Billing does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    page.set_viewport_size({"width": 1440, "height": 900})

    # ── Dark
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    go(page, "/sales"); page.screenshot(path=f"{OUT}/183-board-dark.png")
    go(page, "/admin/billing", "text=Past invoices"); page.screenshot(path=f"{OUT}/184-billing-dark.png")
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
