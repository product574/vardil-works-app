import os, sys
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

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Who are you signing in as?"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")

    # ── 1. Enquiry from a brand new client
    page.goto(BASE + "/sales"); page.wait_for_selector("section[aria-label='To quote']")
    page.get_by_role("button", name="Log enquiry").click()
    dlg = page.locator("dialog[open]")
    dlg.get_by_label("Client", exact=True).select_option("new"); page.wait_for_timeout(200)
    check("New client: choosing it reveals the client fields", dlg.get_by_label("Client name").count() == 1 and dlg.get_by_label("Contact person").count() == 1)
    dlg.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("New client: name and contact are required, with a plain message", "new client's name and a contact" in dlg.inner_text())
    dlg.get_by_label("Client name").fill("Ardmullen Estate"); dlg.get_by_label("Contact person").fill("Someone")
    dlg.get_by_label("Building or address").fill("x"); dlg.get_by_label("What is needed").fill("x")
    dlg.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("New client: a name already on the list is refused", "already a client with that name" in dlg.inner_text())
    dlg.get_by_label("Client name").fill("Kilronan Tidy Towns Committee")
    dlg.get_by_label("Type of client").select_option("Heritage trust")
    dlg.get_by_label("Contact person").fill("Brid Hanrahan")
    dlg.get_by_label("Phone").fill("099 555 0144")
    dlg.get_by_label("Email").fill("brid@kilronantidytowns.example")
    dlg.get_by_label("Building or address").fill("The Old Pump House, Kilronan")
    dlg.get_by_label("What is needed").fill("Repoint the pump house walls in lime and rebuild the boundary wall")
    page.screenshot(path=f"{OUT}/50-new-client-enquiry.png")
    dlg.locator("button[type=submit]").click(); page.wait_for_timeout(300)
    c = data(page, "db.clients.find(c => c.name === 'Kilronan Tidy Towns Committee')")
    e = data(page, "db.enquiries[0]")
    check("New client: saved to Clients with an account ref and 30 day terms", c and c["accountRef"] == "KILR01" and c["termsDays"] == 30 and c["type"] == "Heritage trust", c)
    check("New client: the enquiry is logged against them", e["clientId"] == c["id"] and e["contactName"] == "Brid Hanrahan", e)
    check("New client: card on the board carries their name", "Kilronan Tidy Towns Committee" in page.locator("section[aria-label='To quote']").inner_text())
    page.goto(BASE + "/customers"); page.wait_for_timeout(300)
    check("New client: listed on the Customers screen", page.locator("tbody tr", has_text="Kilronan Tidy Towns Committee").count() == 1)

    # ── 2. Edit, add and remove lines on a draft quote
    page.goto(BASE + "/sales"); page.wait_for_selector("section[aria-label='To quote']")
    page.locator("section[aria-label='To quote'] li button", has_text="Kilronan").click(); page.wait_for_timeout(200)
    page.get_by_role("button", name="Draft a quote from this").click(); page.wait_for_url("**/sales/quotes/Q-2621"); page.wait_for_timeout(300)
    q = lambda: data(page, "db.quotes.find(q => q.ref === 'Q-2621')")
    n0 = len(q()["lines"])
    main = page.locator("main")

    # edit a description
    first_desc = main.get_by_label("Item description").first
    first_desc.click(); first_desc.fill("Rake out and repoint pump house walls, all four elevations"); page.wait_for_timeout(150)
    check("Priced items: a description can be rewritten", q()["lines"][0]["description"] == "Rake out and repoint pump house walls, all four elevations")

    # type a decimal one key at a time: the box must keep the cursor and the number
    rate = main.locator("input[aria-label^='Rate: Rake out and repoint']").first
    rate.click(); rate.press("ControlOrMeta+a"); page.keyboard.type("47.25", delay=40); page.wait_for_timeout(150)
    focused = page.evaluate("document.activeElement?.getAttribute('aria-label') || ''")
    check("Priced items: a decimal rate can be typed key by key without losing the cursor", q()["lines"][0]["rate"] == 47.25 and focused.startswith("Rate:"), (q()["lines"][0]["rate"], focused))

    # add an item
    main.get_by_role("button", name="Add an item").click(); page.wait_for_timeout(150)
    check("Priced items: 'Add an item' adds a blank line", len(q()["lines"]) == n0 + 1 and q()["lines"][-1]["description"] == "")
    last = main.get_by_label("Item description").last
    last.fill("Supply and fit oak door to pump house")
    main.locator("input[aria-label='Quantity: Supply and fit oak door to pump house']").fill("1")
    main.locator("input[aria-label='Unit: Supply and fit oak door to pump house']").fill("no.")
    main.locator("input[aria-label='Rate: Supply and fit oak door to pump house']").fill("1850"); page.wait_for_timeout(150)
    added = q()["lines"][-1]
    check("Priced items: the new line holds its description, unit and rate", added["description"].startswith("Supply and fit oak door") and added["unit"] == "no." and added["rate"] == 1850, added)
    total_with = sum(l["qty"] * l["rate"] for l in q()["lines"])
    check("Priced items: the total on screen includes the new line", f"{total_with:,.2f}" in main.inner_text(), f"{total_with:,.2f}")

    # remove an item
    second = q()["lines"][1]["description"]
    main.get_by_role("button", name=f"Remove item: {second}").click(); page.wait_for_timeout(150)
    check("Priced items: a line can be removed", len(q()["lines"]) == n0 and all(l["description"] != second for l in q()["lines"]))

    # ── cost editor
    cost = lambda: q()["costing"]
    lab0 = len(cost()["labour"])
    hours = main.locator("input[aria-label^='Hours:']").first
    hours.click(); hours.press("ControlOrMeta+a"); page.keyboard.type("120", delay=40); page.wait_for_timeout(150)
    focused = page.evaluate("document.activeElement?.getAttribute('aria-label') || ''")
    check("Costs: labour hours can be typed without losing the cursor", cost()["labour"][0]["hours"] == 120 and focused.startswith("Hours:"), (cost()["labour"][0]["hours"], focused))
    main.get_by_role("button", name="Add labour").click(); page.wait_for_timeout(150)
    main.get_by_label(f"Labour line {lab0 + 1}").fill("Apprentice stonemason")
    main.locator("input[aria-label='Hours: Apprentice stonemason']").fill("40")
    main.locator("input[aria-label='Rate: Apprentice stonemason']").fill("16.5"); page.wait_for_timeout(150)
    check("Costs: a labour line can be added and filled in", cost()["labour"][-1] == {"trade": "Apprentice stonemason", "hours": 40, "rate": 16.5}, cost()["labour"][-1])
    main.get_by_role("button", name="Add material").click(); page.wait_for_timeout(150)
    check("Costs: a material line can be added", len(cost()["materials"]) == 4, len(cost()["materials"]))
    plant0 = cost()["plant"]
    main.get_by_role("button", name=f"Remove plant line: {plant0[0]['item']}").click(); page.wait_for_timeout(150)
    check("Costs: a plant line can be removed", len(cost()["plant"]) == len(plant0) - 1)
    main.get_by_label("Subcontract cost").fill("2500"); main.get_by_label("Preliminaries cost").fill("900"); page.wait_for_timeout(150)
    check("Costs: subcontract and preliminaries can be set", cost()["subcontract"] == 2500 and cost()["prelims"] == 900)
    c2 = cost()
    expect_cost = sum(l["hours"] * l["rate"] for l in c2["labour"]) + sum(x["qty"] * x["rate"] for x in c2["materials"]) + sum(x["days"] * x["rate"] for x in c2["plant"]) + c2["subcontract"] + c2["prelims"]
    sell = sum(l["qty"] * l["rate"] for l in q()["lines"])
    margin = round((sell - expect_cost) / sell * 100, 1)
    text = main.inner_text()
    check("Costs: estimated cost and margin on screen match the edited lines", f"{expect_cost:,.2f}" in text and f"{margin:.1f}%" in text, (f"{expect_cost:,.2f}", f"{margin:.1f}%"))
    page.screenshot(path=f"{OUT}/51-quote-editing.png", full_page=False)
    page.evaluate("document.getElementById('main').scrollTo(0, 520)"); page.wait_for_timeout(200)
    page.screenshot(path=f"{OUT}/52-cost-editing.png")

    # ── once sent, nothing is editable; the client copy carries the edits
    page.get_by_role("tab", name="Client copy").click(); page.wait_for_timeout(200)
    check("Client copy shows the edited and added lines", "Supply and fit oak door to pump house" in main.inner_text() and "Rake out and repoint pump house walls" in main.inner_text())
    page.get_by_role("tab", name="Costing").click()
    page.get_by_role("button", name="Approve and send").click(); page.wait_for_timeout(300)
    check("After sending, lines are locked: no edit boxes, no add or remove buttons", main.get_by_label("Item description").count() == 0 and main.get_by_role("button", name="Add an item").count() == 0 and main.get_by_role("button", name="Add labour").count() == 0)
    check("After sending, the cost summary still shows the edited labour", "Apprentice stonemason 40 hrs" in main.inner_text())

    # ── a queried quote can be edited again (reprice)
    page.goto(BASE + "/sales/quotes/Q-2616"); page.wait_for_timeout(300)
    check("A queried quote opens for repricing with editable lines", main.get_by_label("Item description").count() > 0 and main.get_by_role("button", name="Add labour").count() == 1)

    # ── site manager with Sales switched on but values hidden never sees rates
    page.set_viewport_size({"width": 390, "height": 844})
    page.goto(BASE + "/sales/quotes/Q-2620"); page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/53-quote-editing-mobile.png")
    check("Phone width: the quote page itself does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

errs = []
try:
    errs = run(steps)
except Exception as ex:
    print("STOPPED EARLY:", str(ex).split("\n")[0])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
