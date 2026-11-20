import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, phone_of, show_phone, pick_phone, pick_phone_id, unlock

# 18 Nov (decisions 118 onwards): Who is where per site with a Day box and arrows; Fleet brought
# across from the Secure-All build as a department of its own (overview by base, garage, driver
# and site; garage invoices; vehicles with their own pages; renewals; damage reported; documents;
# garages; drivers from People; bases); the site phones' Report damage and Send a licence; What
# the office receives beside the phone; the Dashboard's To do; the Back button; who may do what.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(500)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(500)
def toast(page):
    return page.locator("[aria-live=polite]").last.inner_text()
def reset(page):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
def money(text):
    m = re.search(r"€([\d,]+(?:\.\d+)?)", text)
    return float(m.group(1).replace(",", "")) if m else -1
SCROLLS = "[...document.querySelectorAll('main *')].filter(e => e.tagName !== 'NAV' && !e.className.includes?.('truncate') && !e.className.includes?.('sr-only') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').length"

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    reset(page)
    day = data(page, "day")

    # ── 1. Who is where, per site, any day
    go(page, "/schedule/today")
    layout = page.get_by_role("tablist", name="Who is where layout")
    check("Who is where: Everyone or Per site at the top right, Per site first", layout.get_by_role("tab", name="Per site").get_attribute("aria-selected") == "true" and layout.bounding_box()["x"] > 1000)
    daybox = page.get_by_label("Day", exact=True)
    check("Who is where: the Day box opens on today, with arrows either side", daybox.input_value() == day and page.get_by_role("button", name="Previous day").count() == 1 and page.get_by_role("button", name="Next day").count() == 1)
    running = data(page, "db.projects.filter(p => p.status === 'Live').map(p => p.code + ' ' + p.name)")
    check("Who is where: a heading and a table per running site", all(main.get_by_role("table", name=re.compile("^" + re.escape(r) + ", ")).count() == 1 for r in running), running)
    check("Who is where: a Site box and a Status box beside the Day box", page.get_by_label("Site", exact=True).count() == 1 and page.get_by_label("Status", exact=True).count() == 1)
    page.get_by_role("button", name="Previous day").click(); page.wait_for_timeout(300)
    prev = daybox.input_value()
    check("Previous day steps back a working day, weekends skipped", prev < day and data(page, f"new Date('{prev}T12:00:00Z').getUTCDay()") not in (0, 6), prev)
    marked = data(page, f"new Set(db.attendance.filter(a => a.date === '{prev}' && db.people.find(p => p.id === a.personId && p.active && p.kind === 'Operative')).map(a => a.personId)).size")
    check("A day gone is read from the timesheet: the count marked on site matches it", f"{marked} marked on site" in page.locator("main header, main").first.inner_text() and "A day gone" in main.inner_text(), marked)
    check("A day gone calls anyone planned but not marked 'Not marked in'", "Not marked in" in page.get_by_label("Status", exact=True).inner_text())
    page.get_by_role("button", name="Next day").click(); page.get_by_role("button", name="Next day").click(); page.wait_for_timeout(300)
    nxt = daybox.input_value()
    planned = data(page, f"new Set(db.plan.filter(x => x.date === '{nxt}').map(x => x.personId)).size")
    check("A day to come is read from the plan", nxt > day and "A day to come" in main.inner_text() and "Planned (" in page.get_by_label("Status", exact=True).inner_text(), (nxt, planned))
    page.get_by_role("button", name="Today", exact=True).click(); page.wait_for_timeout(300)
    check("Today goes back to today", daybox.input_value() == day)
    layout.get_by_role("tab", name="Everyone").click(); page.wait_for_timeout(300)
    check("Everyone shows one table for the day", main.get_by_role("table", name=re.compile("^Everyone, ")).count() == 1)
    c719 = data(page, "db.projects.find(p => p.code === 'C719').id")
    page.get_by_label("Site", exact=True).select_option(c719); page.wait_for_timeout(300)
    rows = main.get_by_role("table", name=re.compile("^Everyone, ")).locator("tbody tr")
    check("The Site box keeps to one site", rows.count() > 0 and all("C719" in t for t in rows.all_inner_texts()))
    layout.get_by_role("tab", name="Per site").click(); page.wait_for_timeout(300)
    check("Per site with one site picked shows just that site", main.locator("table[aria-label]").count() == 1 and main.get_by_role("table", name=re.compile("^C719 ")).count() == 1)
    page.get_by_label("Site", exact=True).select_option("all")
    page.get_by_role("button", name="Previous day").click(); page.wait_for_timeout(200)
    chosen = daybox.input_value()

    # ── 2. Back, and the Fleet button in the bar
    bar = page.get_by_role("navigation", name="Departments")
    names = [t.strip().split("\n")[-1] for t in bar.locator("a").all_inner_texts()]
    check("Fleet has its own button in the bar, after Plant", "Fleet" in names and names.index("Fleet") == names.index("Plant") + 1, names)
    bar.get_by_role("link", name=re.compile("Fleet")).click(); page.wait_for_url("**/fleet"); page.wait_for_timeout(400)
    page.get_by_role("button", name="Back", exact=True).click(); page.wait_for_url("**/schedule/today"); page.wait_for_timeout(400)
    check("Back goes to exactly where you were: the day picked is kept", page.get_by_label("Day", exact=True).input_value() == chosen)
    go(page, "/plant")
    check("Plant's sidebar has plant only now", page.get_by_role("navigation", name="Plant screens").get_by_role("link", name=re.compile("Fleet|Vehicles")).count() == 0)
    page.goto(BASE + "/plant/fleet"); page.wait_for_url("**/fleet/vehicles")
    check("The old Fleet address goes to Fleet, Vehicles", page.url.endswith("/fleet/vehicles"))

    # ── 3. The overview: by base, garage, driver and site
    go(page, "/fleet")
    check("Overview: the periods 1 month to 5 years", page.get_by_role("tablist", name="Period").get_by_role("tab").count() == 6)
    for h in ("By base", "By garage", "By driver", "By site"):
        check(f"Overview: {h}", main.get_by_role("heading", name=h, exact=True).count() == 1)
    total = money(main.get_by_text("Total repair spend").locator("..").inner_text())
    year = data(page, "(() => { const d = new Date(day + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 12); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })()")
    expect = data(page, f"Math.round(db.garageInvoices.filter(i => i.date >= '{year}' && i.date <= day).reduce((t, i) => t + i.total, 0))")
    check("Overview: the total is the garage invoices of the last year", abs(total - expect) <= 1, (total, expect))
    site_id = data(page, f"db.garageInvoices.flatMap(i => i.lines.map(l => ({{...l, date: i.date}}))).filter(l => l.siteId && l.date >= '{year}')[0].siteId")
    page.get_by_label("Site", exact=True).select_option(site_id); page.wait_for_timeout(300)
    by_site = data(page, f"Math.round(db.garageInvoices.filter(i => i.date >= '{year}' && i.date <= day).flatMap(i => i.lines).filter(l => l.siteId === '{site_id}').reduce((t, l) => t + l.amount, 0))")
    check("Overview: the Site filter shows the repairs filed under that site", abs(money(main.get_by_text("Total repair spend").locator("..").inner_text()) - by_site) <= 1, by_site)

    # ── 4. Upload an invoice: the file's name gives the registration where the AI cannot read
    go(page, "/fleet/invoices")
    page.get_by_role("button", name="Upload an invoice").click(); d = dlg()
    check("Upload: on a copy with no server it says the AI reading works on the hosted demo", d.get_by_text("AI reading works on the hosted demo").count() >= 1 and d.bounding_box()["width"] > 1000)
    d.locator("input[type=file]").set_input_files({"name": "Invoice 222-CE-1180 brakes.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4 test invoice"})
    page.wait_for_timeout(600)
    check("Upload: the registration is read from the file's name, and it says so", d.get_by_label("Registration", exact=True).input_value() == "222-CE-1180" and d.get_by_text(re.compile("From the file's name: 222-CE-1180, a garage invoice")).count() == 1)
    d.get_by_label("Garage / mechanic").select_option(label="Banner Motor Works, Ennis")
    d.get_by_label("Invoice number").fill("TEST-901")
    d.get_by_label("Amount", exact=True).fill("210")
    d.get_by_label("Work done").fill("Rear brake pads")
    check("Upload: the line shows the van's base and driver", d.get_by_text(re.compile("Ford Transit tipper, Ennis depot, Paudie Lyne")).count() == 1)
    d.get_by_role("button", name="Confirm and save").click(); page.wait_for_timeout(400)
    inv = data(page, "db.garageInvoices.find(i => i.invoiceNo === 'TEST-901')")
    want_site = data(page, "db.attendance.find(a => a.personId === 'p-123' && a.date === day)?.projectId ?? db.plan.find(x => x.personId === 'p-123' && x.date === day)?.projectId ?? null")
    check("Saved to check, filed under the base, the driver, and the site the driver is on today", inv and inv["status"] == "To check" and inv["lines"][0]["baseId"] == "b-cla" and inv["lines"][0]["driverId"] == "p-123" and inv["lines"][0]["siteId"] == want_site, (inv and inv["lines"][0], want_site))
    go(page, "/fleet/invoices")
    page.locator("tr", has_text="TEST-901").first.click(); page.wait_for_url("**/fleet/invoices/**"); page.wait_for_timeout(400)
    check("The invoice opens on its own page, with the driver and the site that day", page.get_by_role("heading", name="Invoice TEST-901").count() == 1 and "Driver: Paudie Lyne" in main.inner_text() and (want_site is None or "On site that day" in main.inner_text()))
    page.get_by_role("button", name="Mark checked").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Put back to check").click(); b = dlg()
    b.get_by_role("button", name="Put back to check").click()
    check("Putting it back to check needs a note", b.get_by_role("alert").get_by_text("Say why it is going back to check.").count() == 1)
    b.get_by_label("Why is it going back?").fill("Amount does not match the statement"); b.get_by_role("button", name="Put back to check").click(); page.wait_for_timeout(300)
    check("With the note it goes back to check", "Why: Amount does not match the statement" in main.inner_text())
    check("The fleet's invoice log lines are under Fleet", data(page, "db.activity.slice(0, 3).every(a => a.department === 'fleet')"))

    # ── 5. Vehicles and a vehicle's page
    go(page, "/fleet/vehicles")
    check("Vehicles: a Driver column in place of Route", main.get_by_role("columnheader", name="Driver").count() == 1 and main.get_by_role("columnheader", name="Route").count() == 0)
    check("Vehicles: 20 on the fleet", main.locator("tbody tr").count() == 20)
    check("Vehicles: a van shows its driver from People", "Cathal Minogue" in main.locator("tr", has_text="231-G-4471").inner_text())
    go(page, "/fleet/vehicles/v-1")
    sm_site = data(page, "db.projects.filter(p => p.siteManagerId === 'p-sm2' && p.status === 'Live').map(p => p.code).sort()[0]")
    box = main.get_by_label("Who has it today")
    check("A vehicle's page: where its driver is today, and the last driving check", (sm_site in box.inner_text()) and "driving check" in box.inner_text(), box.inner_text())
    check("A vehicle's page: the next service, kept from ABC's Fleet", "Next service" in main.inner_text())
    check("A vehicle's page: tax, the CVRT and insurance", main.get_by_role("heading", name="Motor tax, CVRT and insurance").count() == 1)
    go(page, "/fleet/vehicles/v-19")
    page.get_by_role("button", name="Edit vehicle").click(); e = dlg()
    e.get_by_label("Driver", exact=True).select_option("p-124"); e.get_by_role("button", name="Save changes").click(); page.wait_for_timeout(300)
    check("Edit vehicle: a pool van is given a driver from People", data(page, "db.vehicles.find(v => v.id === 'v-19').driverId") == "p-124" and "driven by Tomás Breslin" in main.inner_text())

    # ── 6. Renewals and the Dashboard's To do
    go(page, "/fleet/renewals")
    check("Renewals: drivers' Driver CPC with the vehicles' tax, test and insurance", main.locator("tr", has_text="Kevin Shortall").filter(has_text="Driver CPC").count() == 1)
    row = main.locator("tr", has_text="182-D-40117")
    row.get_by_role("button", name="Add to my to-do").click(); page.wait_for_timeout(300)
    go(page, "/dashboard")
    todo = main.get_by_role("list", name="To do")
    check("Dashboard: the renewal is on To do, with the managing director's own", todo.locator("li", has_text="182-D-40117").count() == 1 and todo.locator("li", has_text="Renew motor tax, 191-G-7730").count() == 1)
    main.get_by_role("button", name="Add", exact=True).click(); t = dlg()
    t.get_by_label("What").fill("Ring the broker about the fleet policy"); t.get_by_role("button", name="Add", exact=True).click(); page.wait_for_timeout(300)
    todo.get_by_label("Done: Ring the broker about the fleet policy").click(); page.wait_for_timeout(300)
    check("To do: added and ticked off", data(page, "!!db.todos.find(t => t.title === 'Ring the broker about the fleet policy').doneAt"))

    # ── 7. Drivers, from People
    go(page, "/fleet/drivers")
    sd = main.locator("tr", has_text="Seán Dunphy")
    check("Drivers: the licence sent from the phone is flagged to check", "From the phone, to check" in sd.inner_text())
    sd.click(); k = dlg()
    k.get_by_role("button", name="Checked", exact=True).click(); page.wait_for_timeout(300)
    check("Drivers: Checked takes the flag off", data(page, "db.people.find(p => p.id === 'p-128').licences.driving.fromPhoneAt") is None)
    k.get_by_role("button", name="Done").click()
    main.get_by_role("button", name="Add a driver").click(); a = dlg()
    a.get_by_label("Person").select_option(label="Ruairí Mannion, Carpenter"); a.get_by_role("button", name="Add driver").click(); page.wait_for_timeout(300)
    check("Drivers: someone from People goes on the list", main.locator("tr", has_text="Ruairí Mannion").count() == 1)

    # ── 8. Garages and damage
    go(page, "/fleet/garages")
    main.locator("tr", has_text="Oranmore Commercials").first.click(); page.wait_for_url("**/fleet/garages/g-01"); page.wait_for_timeout(300)
    page.get_by_role("tab", name=re.compile("Private notes")).click(); page.wait_for_timeout(200)
    main.get_by_label("Add a note").fill("Closed on Stephen's Day"); main.get_by_role("button", name="Add note").click(); page.wait_for_timeout(300)
    check("Garages: a private note is added and dated", "Closed on Stephen's Day" in main.inner_text())
    go(page, "/fleet/damage")
    check("Damage reported: three new reports from the phones", main.locator("tbody tr").count() == 3)

    # ── 9. The phones: Report damage, Send a licence, and what the office receives
    go(page, "/site"); unlock(page)
    pick_phone_id(page, "p-128"); page.wait_for_timeout(300)
    if page.get_by_role("tablist", name="Language shown").count(): page.get_by_role("tablist", name="Language shown").get_by_role("tab", name="English").click()
    phone = phone_of(page, "operative")
    checked = data(page, "!!db.vehicleChecks.find(c => c.vehicleId === 'v-8' && c.at.slice(0, 10) === day)")
    check("Phone: the Driving check button says whether today's check is done", ("221-WW-3316: done at" if checked else "221-WW-3316: not done yet today") in phone.get_by_role("button", name=re.compile("^Driving check")).inner_text())
    # The phone app (20 Nov): Report damage became Report a repair, a vehicle or plant from a list.
    phone.get_by_role("button", name=re.compile("^Report a repair")).click(); r = dlg()
    check("Report a repair: their own van picked, with the camera or a file", r.get_by_role("tab", name="Vehicle").get_attribute("aria-selected") == "true" and "221-WW-3316" in r.get_by_label("Which vehicle?").evaluate("s => s.options[s.selectedIndex].text") and r.locator("input[capture]").count() == 1)
    r.get_by_label("Where is it?").fill("Builders' merchants, Naas"); r.get_by_label("What is wrong?").fill("Tail lift scraped on a bollard.")
    r.get_by_role("button", name="Send to the office").click(); page.wait_for_timeout(400)
    rep = data(page, "db.repairs[0]")
    check("Report a repair: it reaches the office, from the operative", rep["personId"] == "p-128" and rep["item"]["refId"] == "v-8" and rep["status"] == "Reported")
    feed = page.get_by_role("region", name="What the office receives")
    check("What the office receives: the repair is there at once, and under Needs a look", feed.get_by_role("group", name="Needs a look").get_by_text("Tail lift scraped on a bollard.", exact=False).count() == 1)
    phone.get_by_role("button", name=re.compile("^Send a licence")).click(); l = dlg()
    l.get_by_role("button", name="Driver CPC").click(); l.get_by_role("button", name="Use a sample licence (demo)").click()
    check("Send a licence: the sample fills the date it runs to", l.get_by_label("Runs to").input_value() > day)
    l.get_by_role("button", name="Send to the office").click(); page.wait_for_timeout(400)
    check("Send a licence: on the record at once, flagged to check", data(page, "!!db.people.find(p => p.id === 'p-128').licences.cpc.fromPhoneAt"))
    check("What the office receives: the new CPC is listed", feed.get_by_text("New Driver CPC sent, Seán Dunphy").count() == 1)
    show_phone(page, "manager")
    check("The site manager's phone has Report a repair and Send a licence too", phone_of(page, "manager").get_by_role("button", name=re.compile("^Report a repair")).count() == 1 and phone_of(page, "manager").get_by_role("button", name=re.compile("^Send a licence")).count() == 1)

    # ── 10. Search
    page.get_by_placeholder(re.compile("Search")).first.fill("222 ce"); page.wait_for_timeout(300)
    check("Search: a registration typed any way finds the vehicle", page.get_by_role("option", name=re.compile("222-CE-1180")).count() >= 1 or page.get_by_text("222-CE-1180").count() >= 1)
    page.keyboard.press("Escape")

    # ── 11. Who may do what
    as_role(page, "Accounts")
    go(page, "/fleet/invoices")
    check("Accounts: Fleet is open, but no upload", page.get_by_role("button", name="Upload an invoice").count() == 0)
    page.locator("tr", has_text="TEST-901").first.click(); page.wait_for_url("**/fleet/invoices/**"); page.wait_for_timeout(300)
    check("Accounts: can check a garage invoice, not edit or delete it", page.get_by_role("button", name="Mark checked").count() == 1 and page.get_by_role("button", name="Edit").count() == 0 and page.get_by_role("button", name="Delete").count() == 0)
    as_role(page, "Site manager")
    page.goto(BASE + "/fleet"); page.wait_for_timeout(600)
    check("Site manager: no Fleet by default (their phone has the checks and damage)", "/fleet" not in page.url and page.get_by_role("navigation", name="Departments").get_by_role("link", name=re.compile("Fleet")).count() == 0)
    as_role(page, "Managing director")

    # ── 12. Phone width
    page.set_viewport_size({"width": 390, "height": 844})
    # Fleet's wide tables scroll inside their panel on a phone, as on Secure-All; the page itself never does.
    for path in ("/fleet", "/fleet/vehicles", "/fleet/vehicles/v-1", "/fleet/drivers", "/fleet/renewals", "/site", "/dashboard"):
        go(page, path)
        check(f"Phone width: {path} does not scroll sideways", page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"))
    for layout in ("Per site", "Everyone"):
        go(page, "/schedule/today")
        page.get_by_role("tablist", name="Who is where layout").get_by_role("tab", name=layout).click(); page.wait_for_timeout(300)
        check(f"Phone width: Who is where, {layout}, fits with nothing scrolling sideways", page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1") and page.evaluate(SCROLLS) == 0, page.evaluate(SCROLLS))
    page.set_viewport_size({"width": 1440, "height": 900})
    reset(page)

if __name__ == "__main__":
    errors = []
    try:
        errors = run(steps)
    except Exception as e:
        print("STOPPED EARLY:", str(e)[:700])
    for n, ok, detail in results:
        print(("ok   " if ok else "FAIL ") + n + ("" if ok else "   " + detail[:500]))
    print("console problems:", errors)
    print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
