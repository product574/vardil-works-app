import os, re, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, FIX

# Round eight, 17 Nov (decisions 95 to 99): the Fleet page made easy, after Oisin's own Oldstone
# fleet tool; and what came out of the call with Oldstone's managing director the same day: a
# manager's check before payroll is exported by hand, approved reimbursements made ready for the
# office to pay, the overtime rates at the top of the Timesheet with a filter in the history,
# and Invoicing saying which invoices go out and which come in.
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
SCROLLS = "[...document.querySelectorAll('main *')].filter(e => e.tagName !== 'NAV' && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').length"
num = lambda t: 0.0 if t.strip() in ("-", "", "None") else float(re.sub(r"[^\d.]", "", t.split("\n")[0]) or 0)
TMP = tempfile.mkdtemp()
def named(fixture, name):
    path = os.path.join(TMP, name); shutil.copy(FIX + fixture, path); return path

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    reset(page)
    day = data(page, "day")

    # ── 1. Fleet: one page, three tabs, the same three buttons
    go(page, "/plant/fleet", "table")
    side = page.get_by_role("navigation", name="Plant screens")
    overdue = data(page, "db.vehicles.filter(v => v.active && ['tax','test','insurance'].some(i => v.compliance[i].expiryDate < day)).length")
    check("Fleet: one entry in Plant's sidebar, with how many vehicles have a paper out of date", side.get_by_role("link", name=re.compile("^Fleet")).count() == 1 and side.get_by_role("link", name="Vehicle documents").count() == 0 and side.get_by_role("link", name=re.compile("^Fleet")).inner_text().strip().endswith(str(overdue)) and overdue >= 1, side.inner_text())
    tabs = page.get_by_role("navigation", name="Fleet sections").get_by_role("link")
    check("Fleet: three tabs across the top", tabs.all_inner_texts() == ["Vehicle stats", "Vehicle documents", "Repair spend"] and tabs.nth(0).get_attribute("aria-current") == "page")
    def buttons():
        bs = [main.get_by_role("button", name=n, exact=True) for n in ["Upload document", "Add vehicle", "Edit vehicle"]]
        boxes = [b.bounding_box() for b in bs]
        return all(b.count() == 1 for b in bs) and all(x and x["y"] < 130 and x["x"] > 900 for x in boxes) and boxes[0]["x"] < boxes[1]["x"] < boxes[2]["x"]
    ok = [buttons()]
    for i in (1, 2):
        tabs.nth(i).click(); page.wait_for_timeout(300); ok.append(buttons())
    check("Fleet: Upload document, Add vehicle and Edit vehicle at the top right of every tab", ok == [True, True, True], ok)
    check("Fleet: the tabs are addresses of their own", page.url.endswith("/plant/fleet/repairs"))
    for old, new in [("/plant/vehicles", "/plant/fleet"), ("/plant/documents", "/plant/fleet/documents"), ("/plant/repairs", "/plant/fleet/repairs")]:
        page.goto(BASE + old); page.wait_for_timeout(500)
        check(f"Fleet: the old address {old} still lands right", page.url.rstrip("/").endswith(new), page.url)

    # Vehicle stats
    go(page, "/plant/fleet", "table")
    rows = main.get_by_role("table", name="Vehicles on the road").locator("tbody tr")
    check("Vehicle stats: every vehicle on the road, with its papers, service, driver's check and repairs", rows.count() == 12 and main.locator("thead th").all_inner_texts() == ["Vehicle", "Driver", "Mileage, km", "Motor tax", "CVRT", "Insurance", "Next service", "Driver's check", "Repairs, 12 months"], main.locator("thead th").all_inner_texts())
    search = main.get_by_label("Search registration or model")
    search.fill("231 g 44"); page.wait_for_timeout(200)
    check("Vehicle stats: search by registration, however it is typed", rows.count() == 1 and "231-G-4471" in rows.first.inner_text())
    search.fill("hilux"); page.wait_for_timeout(200)
    check("Vehicle stats: search by model", rows.count() == 2 and all("Toyota Hilux" in t for t in rows.all_inner_texts()))
    search.fill("volvo xc"); page.wait_for_timeout(200)
    check("Vehicle stats: nothing found says so", rows.count() == 0 and "No matching vehicles" in main.inner_text())
    search.fill(""); page.wait_for_timeout(200)
    defects = data(page, "db.vehicles.filter(v => v.active).filter(v => { const c = db.vehicleChecks.filter(c => c.vehicleId === v.id).sort((a,b) => b.at.localeCompare(a.at))[0]; return c && c.defects.length > 0 }).map(v => v.reg)")
    drow = rows.filter(has_text=defects[0])
    check("Vehicle stats: a defect from a driver's check on the phone shows against the vehicle", len(defects) == 2 and "1 defect" in drow.inner_text() and f"{len(defects)} vehicles with a defect reported by its driver" in main.inner_text(), (defects, drow.inner_text()))
    spend = data(page, "(() => { const v = db.vehicles.find(v => v.reg === '211-W-6052'); const since = (Number(day.slice(0,4)) - 1) + day.slice(4); const r = db.fleetDocs.filter(d => d.vehicleId === v.id && d.category === 'repairs' && d.date > since); return [r.length, Math.round(r.reduce((s,d) => s + d.amount, 0))] })()")
    cell = rows.filter(has_text="211-W-6052").locator("td").last.inner_text()
    check("Vehicle stats: repairs in the last 12 months match the documents", f"{spend[0]} repair" in cell and f"{spend[1]:,}" in cell, (spend, cell))
    check("Vehicle stats: fits the page", page.evaluate(SCROLLS) == 0)
    page.screenshot(path=f"{OUT}/800-fleet-stats.png")
    rows.filter(has_text=defects[0]).click(); page.wait_for_timeout(300)
    d = dlg()
    check("Vehicle: opens with its papers, repairs and driver's checks, and the two ways on", d.get_by_role("list", name=re.compile("^Driver's checks on")).locator("> li").count() >= 1 and "defect" in d.inner_text() and d.get_by_role("button", name="Edit vehicle").count() == 1 and d.get_by_role("button", name=re.compile("^Upload a document for")).count() == 1 and d.get_by_role("button", name="Remove from fleet").count() == 0)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # Upload document: matched by the registration
    main.get_by_role("button", name="Upload document", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    check("Upload: one dialog, the file, the vehicle, what it is and what it cost", d.locator("h2").inner_text() == "Upload a document" and d.get_by_role("tablist", name="Kind of document").get_by_role("tab").all_inner_texts() == ["Repair invoice", "Motor tax", "CVRT", "Insurance"] and d.get_by_role("listbox", name="Vehicles").get_by_role("option").count() == 12)
    d.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Upload: a vehicle is needed", "Pick the vehicle this is for" in d.inner_text())
    d.get_by_label("Choose a proof from this device").set_input_files(named("cert.pdf", "Invoice 231 G 4471 front brake pads.pdf")); page.wait_for_timeout(600)
    picked = d.get_by_role("option", selected=True)
    check("Upload: the registration in the file's name picks the vehicle, and says so", picked.count() == 1 and "231-G-4471" in picked.inner_text() and "The registration 231-G-4471 is in the file's name. Matched to 231-G-4471 Ford Transit Custom." in d.get_by_role("status").inner_text() and d.get_by_role("option").first.get_attribute("aria-selected") == "true", d.get_by_role("status").inner_text())
    check("Upload: the kind of document is read from the name too", d.get_by_role("tab", name="Repair invoice").get_attribute("aria-selected") == "true")
    page.screenshot(path=f"{OUT}/801-fleet-upload.png")
    d.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Upload: an amount is needed", "Enter the amount on the receipt" in d.inner_text())
    d.get_by_label("Amount").fill("286.40"); d.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Upload: a repair says what was done and where", "Say what was done and which garage did it" in d.inner_text())
    d.get_by_label("Work done").fill("Front discs and pads, nearside caliper freed"); d.get_by_label("Garage").fill("Oranmore Commercials"); d.get_by_label("Town and county").fill("Oranmore, Galway")
    before = data(page, "db.fleetDocs.length")
    d.locator("button[type=submit]").click(); page.wait_for_timeout(400)
    doc = data(page, "db.fleetDocs[0]")
    check("Upload: the repair is filed against that vehicle with its file", data(page, "db.fleetDocs.length") == before + 1 and doc["category"] == "repairs" and doc["amount"] == 286.4 and doc["vehicleId"] == data(page, "db.vehicles.find(v => v.reg === '231-G-4471').id") and doc["proof"]["name"] == "Invoice 231 G 4471 front brake pads.pdf" and "Repair filed for 231-G-4471. It is in the repair spend" in toast(page), (doc.get("category"), toast(page)))
    main.get_by_role("button", name="Upload document", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    d.get_by_label("Choose a proof from this device").set_input_files(named("card.png", "insurance cert 201-CE-905 to 2027.png")); page.wait_for_timeout(700)
    check("Upload: an insurance certificate is told from its name", d.get_by_role("tab", name="Insurance").get_attribute("aria-selected") == "true" and "201-CE-905" in d.get_by_role("option", selected=True).inner_text() and d.get_by_label("Expires").count() == 1)
    d.get_by_label("Amount").fill("1,540"); d.get_by_label("Expires").fill("2027-11-20")
    d.locator("button[type=submit]").click(); page.wait_for_timeout(400)
    ins = data(page, "db.vehicles.find(v => v.reg === '201-CE-905').compliance.insurance")
    check("Upload: a certificate moves the vehicle's date, so its paper is no longer due", ins["expiryDate"] == "2027-11-20" and ins["amount"] == 1540 and "Insurance filed for 201-CE-905" in toast(page) and "Due in" not in rows.filter(has_text="201-CE-905").locator("td").nth(5).inner_text(), (ins, rows.filter(has_text="201-CE-905").locator("td").nth(5).inner_text()))
    main.get_by_role("button", name="Upload document", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    d.get_by_label("Choose a proof from this device").set_input_files(named("site-photo.jpg", "IMG_2041.jpg")); page.wait_for_timeout(700)
    check("Upload: with no registration in the name, it asks for the vehicle", "No registration from the fleet is in the file's name, so pick the vehicle." in d.get_by_role("status").inner_text() and d.get_by_role("option", selected=True).count() == 0)
    d.get_by_label("Find the vehicle by registration or model").fill("sprinter"); page.wait_for_timeout(200)
    check("Upload: the vehicle is found by typing its make", d.get_by_role("option").count() == 1 and "Mercedes Sprinter" in d.get_by_role("option").first.inner_text())
    d.get_by_label("Find the vehicle by registration or model").fill("zzz"); page.wait_for_timeout(200)
    check("Upload: a vehicle not on the fleet says to add it first", "No vehicle on the fleet matches. Add it first with Add vehicle." in d.inner_text())
    d.get_by_role("button", name="Cancel").click(); page.wait_for_timeout(200)

    # Vehicle documents
    tabs.nth(1).click(); page.wait_for_selector("table[aria-label='Vehicle documents']"); page.wait_for_timeout(200)
    docs = main.get_by_role("table", name="Vehicle documents").locator("tbody tr")
    up = docs.filter(has_text="Front discs and pads, nearside caliper freed")
    check("Documents: the uploads are at the top, each with its file to open", up.count() == 1 and up.get_by_role("button", name="View proof").count() == 1 and "Front discs and pads, nearside caliper freed" in " ".join(docs.all_inner_texts()[:2]) and "231-G-4471" in up.inner_text(), docs.all_inner_texts()[:2])
    cat = main.get_by_label("Category")
    check("Documents: a category box, as on the Oldstone tool", cat.locator("option").all_inner_texts() == ["All categories", "Repairs", "Motor tax", "CVRT", "Insurance"])
    cat.select_option("insurance"); page.wait_for_timeout(200)
    n_ins = data(page, "db.fleetDocs.filter(d => d.category === 'insurance').length")
    check("Documents: filter by category", docs.count() == min(n_ins, 80) and all(t == "Insurance" for t in main.locator("tbody tr td:nth-child(3)").all_inner_texts()) and f"{n_ins} documents" in main.inner_text(), (docs.count(), n_ins))
    main.get_by_label("Search registration or model").fill("201-ce"); page.wait_for_timeout(200)
    n_one = data(page, "db.fleetDocs.filter(d => d.category === 'insurance' && d.vehicleId === db.vehicles.find(v => v.reg === '201-CE-905').id).length")
    check("Documents: search by registration narrows it to that vehicle", docs.count() == n_one and all("201-CE-905" in t for t in docs.all_inner_texts()) and "2027" in docs.first.inner_text(), (docs.count(), n_one))
    main.get_by_label("Search registration or model").fill("volvo xc"); page.wait_for_timeout(200)
    check("Documents: nothing found says so", "No matching vehicles" in main.inner_text())

    # Repair spend
    tabs.nth(2).click(); page.wait_for_selector("table[aria-label^='Repair spend by vehicle']"); page.wait_for_timeout(200)
    period = main.get_by_role("tablist", name="Period")
    check("Repair spend: the six periods, a year to start", period.get_by_role("tab").all_inner_texts() == ["1 month", "3 months", "6 months", "1 year", "2 years", "5 years"] and period.get_by_role("tab", name="1 year").get_attribute("aria-selected") == "true")
    def spend_since(months):
        return data(page, f"(() => {{ const d = new Date(day + 'T12:00:00Z'); const y = d.getUTCFullYear(), m = d.getUTCMonth() - {months}; const first = new Date(Date.UTC(y, m, 1)); const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate(); const since = first.toISOString().slice(0, 8) + String(Math.min(d.getUTCDate(), last)).padStart(2, '0'); const r = db.fleetDocs.filter(x => x.category === 'repairs' && x.date > since); return [r.length, Math.round(r.reduce((s, x) => s + x.amount, 0))] }})()")
    foot = lambda: main.get_by_role("table", name=re.compile("^Repair spend by vehicle")).locator("tfoot td").all_inner_texts()
    y = spend_since(12)
    check("Repair spend: the year's total and count match the documents, the upload included", foot()[1] == str(y[0]) and num(foot()[2]) == y[1] and f"{y[0]} repairs in the last 12 months" in main.inner_text(), (foot(), y))
    period.get_by_role("tab", name="1 month").click(); page.wait_for_timeout(250)
    m = spend_since(1)
    top = main.get_by_role("table", name=re.compile("^Repair spend by vehicle")).locator("tbody tr").first.inner_text()
    check("Repair spend: one month counts only that month, dearest first", foot()[1] == str(m[0]) and num(foot()[2]) == m[1] and m[0] < y[0] and "in the last month" in main.inner_text() and "231-G-4471" in main.get_by_role("table", name=re.compile("^Repair spend by vehicle")).locator("tbody tr").nth(1).inner_text() + top, (foot(), m, top[:60], main.inner_text()[:300]))
    period.get_by_role("tab", name="5 years").click(); page.wait_for_timeout(250)
    f5 = spend_since(60)
    garages = main.get_by_role("table", name=re.compile("^Repair spend by garage")).locator("tbody tr")
    gsum = sum(num(t.split("\t")[2]) for t in garages.all_inner_texts())
    check("Repair spend: five years takes in more, and the garages add up to it", num(foot()[2]) == f5[1] and f5[1] > y[1] and abs(gsum - f5[1]) <= garages.count(), (foot(), f5, gsum))
    check("Repair spend: fits the page", page.evaluate(SCROLLS) == 0)
    page.screenshot(path=f"{OUT}/802-fleet-repair-spend.png")

    # Edit vehicle
    go(page, "/plant/fleet", "table")
    main.get_by_role("button", name="Edit vehicle", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    check("Edit: asks which vehicle first", "Which vehicle?" in d.inner_text() and d.get_by_role("option").count() == 12)
    d.get_by_label("Find the vehicle by registration or model").fill("242"); page.wait_for_timeout(200)
    d.get_by_role("option").first.click(); page.wait_for_timeout(250)
    check("Edit: opens the vehicle with everything that can be put right", d.locator("h2").inner_text() == "Edit 242-G-915" and all(d.get_by_label(l, exact=True).count() == 1 for l in ["Registration", "Make and model", "Kind", "Based in", "Driver", "Mileage, km"]))
    d.get_by_label("Registration", exact=True).fill("231 g 4471"); d.get_by_role("button", name="Save changes").click(); page.wait_for_timeout(200)
    check("Edit: a registration another vehicle has is refused", "already on the fleet" in d.inner_text() and data(page, "db.vehicles.filter(v => v.reg === '231-G-4471').length") == 1)
    d.get_by_label("Registration", exact=True).fill("242 g 916"); d.get_by_label("Driver", exact=True).select_option(label="Fergal Noone"); d.get_by_label("Mileage, km").fill("61,250")
    d.get_by_role("button", name="Save changes").click(); page.wait_for_timeout(400)
    v = data(page, "db.vehicles.find(v => v.reg === '242-G-916')")
    check("Edit: the registration is tidied and the driver and mileage saved", v and v["mileage"] == 61250 and v["driverId"] == data(page, "db.people.find(p => p.name === 'Fergal Noone').id") and "242-G-916 saved" in toast(page) and "Fergal Noone" in rows.filter(has_text="242-G-916").inner_text() and "61,250" in rows.filter(has_text="242-G-916").inner_text(), toast(page))
    check("Edit: it is in the activity log with what changed", data(page, "[db.activity[0].what, db.activity[0].target]") == ["Changed a vehicle's details", "242-G-915 Mercedes Sprinter: registration, driver, mileage"])
    rows.filter(has_text="212-D-18834").click(); page.wait_for_timeout(300)
    dlg().get_by_role("button", name="Edit vehicle").click(); page.wait_for_timeout(300)
    d = dlg()
    check("Edit: from an open vehicle it goes straight to that one", d.locator("h2").inner_text() == "Edit 212-D-18834")
    d.get_by_role("button", name="Remove from fleet").click(); page.wait_for_timeout(200)
    d.get_by_label("Sold for").fill("lots"); d.get_by_role("button", name="Remove vehicle").click(); page.wait_for_timeout(200)
    check("Edit: taking a vehicle off the fleet needs what it sold for, or NA", "or NA if it was not sold" in d.inner_text() and data(page, "db.vehicles.find(v => v.reg === '212-D-18834').active") is True)
    d.get_by_label("Sold for").fill("4,200"); d.get_by_role("button", name="Remove vehicle").click(); page.wait_for_timeout(400)
    check("Edit: removed, it leaves the road and keeps its documents", rows.count() == 11 and data(page, "(() => { const v = db.vehicles.find(v => v.reg === '212-D-18834'); return [v.active, v.sellPrice, db.fleetDocs.some(d => d.vehicleId === v.id)] })()") == [False, 4200, True])

    # Add vehicle with its driver and mileage
    main.get_by_role("button", name="Add vehicle", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    d.get_by_label("Registration").fill("262 g 77"); d.get_by_label("Make and model").fill("Ford Ranger"); d.get_by_label("Kind").select_option("Pickup")
    d.get_by_label("Driver", exact=True).select_option(label="Kevin Shortall"); d.get_by_label("Mileage, km").fill("350")
    d.locator("button[type=submit]").click(); page.wait_for_timeout(400)
    new = rows.filter(has_text="262-G-77")
    check("Add: a new vehicle goes on with its driver and mileage", new.count() == 1 and "Ford Ranger" in new.inner_text() and "Kevin Shortall" in new.inner_text() and "350" in new.inner_text() and rows.count() == 12, new.all_inner_texts())

    # The empty fleet, and someone who cannot change it
    page.evaluate("(() => { const k = 'cod.data'; const s = JSON.parse(localStorage.getItem(k)); s.state.db.vehicles.forEach(v => v.active = false); localStorage.setItem(k, JSON.stringify(s)); })()")
    go(page, "/plant/fleet/repairs", "main h1")
    check("Fleet with no vehicles: says how to start, on every tab", "Start by adding your vehicles" in main.inner_text() and main.get_by_role("button", name="Add your first vehicle").count() == 1 and main.get_by_role("button", name="Edit vehicle", exact=True).is_disabled() and main.get_by_role("tablist", name="Period").count() == 0)
    main.get_by_role("button", name="Add your first vehicle").click(); page.wait_for_timeout(300)
    check("Fleet with no vehicles: the button opens Add a vehicle", dlg().locator("h2").inner_text() == "Add a vehicle")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    reset(page)
    as_role(page, "Site manager")
    go(page, "/plant/fleet", "table")
    check("Fleet: without Manage plant and fleet there are no buttons, only the lists", main.get_by_role("button", name="Upload document", exact=True).count() == 0 and main.get_by_role("button", name="Edit vehicle", exact=True).count() == 0 and rows.count() == 12)
    as_role(page, "Managing director")

    # ── 2. Payroll: a manager's check, then the export by hand
    go(page, "/people/payroll", "table")
    side = page.get_by_role("navigation", name="People screens")
    check("People: Payroll export and Reimbursements each show what is waiting", side.get_by_role("link", name=re.compile("^Payroll export")).inner_text().strip().endswith("1") and side.get_by_role("link", name=re.compile("^Reimbursements")).inner_text().strip().endswith("1"), side.inner_text())
    exp = main.get_by_role("button", name="Export hours to Sage Payroll")
    check("Payroll: last week starts unchecked, and cannot be exported yet", "Not checked yet" in main.inner_text() and exp.is_disabled() and main.get_by_role("button", name="Mark the week as checked").count() == 1)
    steps_txt = main.get_by_role("list", name="How a week gets to payroll").inner_text()
    check("Payroll: the three steps are spelled out, and nothing is sent on its own", "Site managers send each day's time stamps" in steps_txt and "A manager checks the week here" in steps_txt and "by hand. Nothing is sent on its own" in steps_txt, steps_txt)
    cols = main.get_by_role("table", name=re.compile("^Hours for the week")).locator("thead th").all_inner_texts()
    check("Payroll: hours at each overtime rate, and what to check", cols[-5:] == ["Basic hours", "Overtime x1.5", "Overtime x2", "Total", "To check"], cols)
    page.screenshot(path=f"{OUT}/803-payroll-check.png")
    main.get_by_role("button", name="Mark the week as checked").click(); page.wait_for_timeout(300)
    chk = data(page, "db.payrollChecks[0]")
    check("Payroll: marking it checked records who, and opens the export", chk["by"] == "Aidan King" and "by Aidan King" in main.inner_text() and "Not checked yet" not in main.inner_text() and exp.is_enabled() and main.get_by_role("button", name="Mark the week as checked").count() == 0 and "marked as checked" in toast(page), toast(page))
    first = main.get_by_role("table", name=re.compile("^Hours for the week")).locator("tbody tr").first
    who = first.locator("td").nth(1).inner_text()
    ask = first.get_by_role("button", name=re.compile("^Ask "))
    mgr = ask.first.inner_text().replace("Ask ", "")
    ask.first.click(); page.wait_for_timeout(500)
    check("Payroll: Ask opens a message to that person's site manager in Team chat", "/chat/" in page.url and main.get_by_role("heading", name=mgr).count() == 1, (who, mgr, page.url))
    # A correction after the check means it is looked at again.
    go(page, "/people/timesheet?site=pr-C719", "table")
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name=re.compile("^Fergal Noone, ")).first.click(); page.wait_for_timeout(250)
    d = dlg(); d.get_by_label("Should be").select_option("half"); d.get_by_label("Reason for the correction").fill("Went home at lunch")
    d.get_by_role("button", name="Save correction").click(); page.wait_for_timeout(300)
    go(page, "/people/payroll", "table")
    check("Payroll: a day corrected after the check means the week is checked again before it can go", "Changed since Aidan King checked it" in main.inner_text() and main.get_by_role("button", name="Mark as checked again").count() == 1 and exp.is_disabled())
    main.get_by_role("button", name="Mark as checked again").click(); page.wait_for_timeout(300)
    # Whoever exports cannot check, and the other way about.
    as_role(page, "Accounts")
    go(page, "/people/payroll", "table")
    check("Payroll: the office exports a checked week but has no check button", exp.is_enabled() and main.get_by_role("button", name=re.compile("^Mark")).count() == 0)
    with page.expect_download() as dl:
        exp.click()
    page.wait_for_timeout(300)
    text = open(dl.value.path(), encoding="utf-8").read()
    check("Payroll: the export is a file made by a person pressing the button", text.startswith("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours x1.5,Overtime hours x2") and data(page, "db.payrollExports[0].by") == "Maeve Quirke" and not side.get_by_role("link", name=re.compile("^Payroll export")).inner_text().strip().endswith("1"))
    page.get_by_label("Week", exact=True).select_option(index=1); page.wait_for_timeout(300)
    check("Payroll: earlier weeks show who checked them before they went", "by Tadhg Morrissey" in main.inner_text() and "by Maeve Quirke" in main.inner_text())
    as_role(page, "Contracts manager")
    go(page, "/people/payroll", "table")
    check("Payroll: a contracts manager checks but does not export", main.get_by_role("button", name="Export hours to Sage Payroll").count() == 0 and main.get_by_role("button", name="Export again").count() == 0)
    as_role(page, "Managing director")

    # The to-do on the overview
    reset(page)
    go(page, "/dashboard")
    ai = main.locator("section", has_text="AI overview").first
    check("Overview: last week's hours are a to-do for whoever checks them, with the reimbursement to pay", "Last week's hours are in from every site and ready for you to check before they go to payroll. One approved reimbursement is waiting to be paid too." in ai.inner_text() and ai.get_by_role("link", name="ready for you to check").get_attribute("href").endswith("/people/payroll") and ai.get_by_role("link", name="waiting to be paid").get_attribute("href").endswith("/people/reimbursements"), ai.inner_text()[-400:])
    as_role(page, "Accounts")
    go(page, "/dashboard")
    check("Overview: the office is told it is waiting on a manager's check", "Last week's hours are waiting for a manager's check before you can export them to payroll." in main.locator("section", has_text="AI overview").first.inner_text())
    as_role(page, "Managing director")

    # ── 3. Reimbursements: approved, then ready for the office to pay
    go(page, "/people/reimbursements")
    pay = main.get_by_role("table", name="Reimbursements to pay").locator("tbody tr")
    check("Reimbursements: an approved claim waits here to be paid, with the employee number payroll knows", pay.count() == 1 and "Darius Kazlauskas" in pay.first.inner_text() and "Sage no." in pay.first.inner_text() and "€31.40" in pay.first.inner_text() and "Aidan King" in pay.first.inner_text(), pay.first.inner_text())
    steps_txt = main.get_by_role("list", name="How a reimbursement gets paid").inner_text()
    check("Reimbursements: the three steps are spelled out", "claims on the site phone" in steps_txt and "The director says yes or no" in steps_txt and "The office exports the approved ones here and pays them" in steps_txt)
    pre = main.locator("pre").inner_text()
    check("Reimbursements: the file for the office is shown before it goes", pre.startswith("Employee No,Surname,Forename,Paid on,For,Detail,Site,Amount,Approved by,Approved on") and ",C721,31.40,Aidan King," in pre, pre[:200])
    go(page, "/admin")
    main.locator("section", has_text="Reimbursements").get_by_role("button", name=re.compile("^Approve: reimbursement for Cathal Minogue")).click(); page.wait_for_timeout(300)
    check("Admin: approving a reimbursement puts it on the office's list, and says so", "It is on the office's list to pay" in toast(page) and main.locator("section", has_text="Reimbursements").get_by_role("link", name="Reimbursements to pay").count() == 1, toast(page))
    go(page, "/people/reimbursements")
    check("Reimbursements: the approved claim has joined the list, oldest first", pay.count() == 2 and "Cathal Minogue" in pay.nth(1).inner_text() and "€123.55" in main.locator("tfoot").inner_text() and "2 approved claims to pay back, €123.55 to 2 people. 1 more is still with the director" in main.inner_text(), main.locator("header p").first.inner_text())
    page.screenshot(path=f"{OUT}/804-reimbursements.png", full_page=True)
    as_role(page, "Contracts manager")
    go(page, "/people/reimbursements")
    check("Reimbursements: someone who cannot export sees the list but no button", pay.count() == 2 and main.get_by_role("button", name="Export for payment").count() == 0 and "accounts office by default" in main.inner_text())
    as_role(page, "Accounts")
    go(page, "/people/reimbursements")
    with page.expect_download() as dl:
        main.get_by_role("button", name="Export for payment").click()
    page.wait_for_timeout(300)
    lines = open(dl.value.path(), encoding="utf-8").read().strip().splitlines()
    sent = main.get_by_role("table", name="Reimbursements sent for payment").locator("tbody tr")
    check("Reimbursements: the office exports the file, one row a claim", dl.value.suggested_filename == f"reimbursements-to-pay-{day}.csv" and len(lines) == 3 and lines[2].endswith(f",C720,92.15,Aidan King,{day[8:10]}/{day[5:7]}/{day[:4]}"), (dl.value.suggested_filename, lines))
    check("Reimbursements: exported claims move to Sent for payment and cannot go twice", main.get_by_role("table", name="Reimbursements to pay").count() == 0 and "Nothing to pay" in main.inner_text() and sent.count() == 3 and "Maeve Quirke" in sent.first.inner_text() and main.get_by_role("button", name="Export for payment").is_disabled() and "2 reimbursements exported for payment, €123.55" in toast(page), toast(page))
    check("Reimbursements: the export is in the activity log", data(page, "[db.activity[0].what, db.activity[0].target, db.activity[0].who]") == ["Exported reimbursements for payment", "2 claims, 123.55", "Maeve Quirke"])
    as_role(page, "Managing director")
    go(page, "/site")
    page.get_by_role("tab", name="Site manager").click(); page.wait_for_timeout(250)
    page.get_by_label("Site manager to view the phone as").select_option(label="Cathal Minogue"); page.wait_for_timeout(300)
    page.get_by_role("button", name="My profile").click(); page.wait_for_timeout(250)
    claims = dlg().get_by_role("list", name="My reimbursements").inner_text()
    check("Phone: whoever claimed sees it has gone for payment", "Sent for payment" in claims and "With the office for payment since" in claims, claims)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ── 4. Overtime: the rates at the top of the tab, and a filter in the history
    go(page, "/people/timesheet", "table")
    rules = page.get_by_role("region", name="Overtime rates")
    rb, tb = rules.bounding_box(), main.locator("table").first.bounding_box()
    rt = rules.inner_text()
    check("Timesheet: the overtime rates are at the top of the tab, above the grid", rb["y"] + rb["height"] <= tb["y"] and rb["height"] < 170 and "Monday to Friday, after a normal day's hours, up to midnight. Saturday, 8am to 12 noon." in rt and "After midnight, when the work carries on from the day before. Saturday after 12 noon. Sunday. Bank holidays." in rt, (rb, rt))
    go(page, "/people/history", "table"); page.get_by_role("tablist", name="Attendance layout").get_by_role("tab", name="Everyone").click(); page.wait_for_timeout(300)  # opens per site since round ten
    f = main.get_by_label("Overtime")
    check("History: a filter for overtime at each rate", f.locator("option").all_inner_texts() == ["All days", "Days with overtime", "Days with time and a half", "Days with double time", "Weekend and bank holiday work"])
    counts = data(page, "(() => { const m = day.slice(0,7); const r = db.attendance.filter(a => a.date.startsWith(m) && a.date <= day && a.overtimeHours + (a.doubleHours ?? 0) > 0); const dbl = r.filter(a => (a.doubleHours ?? 0) > 0); const half = r.filter(a => a.overtimeHours > 0); const h15 = (x) => x.reduce((s,a) => s + a.overtimeHours, 0); const h2 = (x) => x.reduce((s,a) => s + (a.doubleHours ?? 0), 0); return { any: r.length, dbl: dbl.length, dblHours: h2(dbl), dblHalf: h15(dbl), halfHours: h15(half), halfDbl: h2(half), dblPeople: new Set(dbl.map(a => a.personId)).size } })()")
    f.select_option("double"); page.wait_for_timeout(300)
    foot = main.locator("tfoot tr").inner_text().split("\t")
    check("History: Days with double time counts just the days that have some", f"{counts['dbl']} attendance entries for {counts['dblPeople']} people, days with hours at double time only" in main.inner_text() and num(foot[-2]) == counts["dblHours"] and num(foot[-3]) == counts["dblHalf"] and main.locator("tbody tr").count() == counts["dblPeople"], (foot, counts))
    f.select_option("half"); page.wait_for_timeout(300)
    foot = main.locator("tfoot tr").inner_text().split("\t")
    check("History: Days with time and a half counts just the days that have some", num(foot[-3]) == counts["halfHours"] and num(foot[-2]) == counts["halfDbl"] and "days with hours at time and a half only" in main.inner_text(), (foot, counts))
    f.select_option("any"); page.wait_for_timeout(300)
    check("History: Days with overtime takes both", f"{counts['any']} attendance entries" in main.inner_text() and "days with overtime only" in main.inner_text())
    page.get_by_role("tablist", name="History view").get_by_role("tab", name="Day by day").click(); page.wait_for_timeout(300)
    marks = main.locator("table").first.locator("tbody tr").all_inner_texts()
    check("History: the filter holds for the day by day view too", len(marks) == min(counts["any"], len(marks)) and all(re.search(r"\dh x", t) for t in marks[:40]), marks[:2])
    check("History: fits the page with the extra box", page.evaluate(SCROLLS) == 0)

    # ── 5. Invoicing: which way each invoice goes
    go(page, "/invoicing", "main h1")
    side = page.get_by_role("navigation", name="Invoicing screens")
    st = side.inner_text()
    check("Invoicing: the sidebar says which invoices go out and which come in", st.index("Going out, to clients") < st.index("To invoice") < st.index("Invoiced") < st.index("Coming in, from suppliers") < st.index("Supplier invoices") < st.index("Accounts export") and "Job costs" not in st, st)
    check("Invoicing: To invoice says these go out to clients", "Invoices going out to clients, for the accounts office to issue." in main.inner_text())
    go(page, "/invoicing/supplier", "main h1")
    check("Invoicing: Supplier invoices says these come in to be paid", "Invoices coming in from suppliers, for the firm to pay." in main.inner_text())
    go(page, "/invoicing/invoiced", "main h1")
    check("Invoicing: Invoiced says these have gone to clients", "Invoices already sent to clients, and what is still owed on them." in main.inner_text())

    # ── Roles: the new permission
    go(page, "/admin/access", "table")
    grid = page.get_by_role("table", name="What each level can see, do and open")
    state = lambda name: grid.get_by_role("checkbox", name=name, exact=True).get_attribute("aria-checked")
    check("Roles: checking the week's hours is a permission of its own, a manager's by default", grid.locator("tr[data-group=permission]").count() == 15 and state("Contracts manager: Check the week's hours for payroll") == "true" and state("Accounts: Check the week's hours for payroll") == "false" and state("Accounts: Export hours and reimbursements for payment") == "true" and state("Contracts manager: Export hours and reimbursements for payment") == "false")

    # ── Phone width and dark mode
    page.set_viewport_size({"width": 390, "height": 800})
    for path, sel in [("/plant/fleet", "table"), ("/plant/fleet/documents", "table"), ("/plant/fleet/repairs", "table"), ("/people/payroll", "table"), ("/people/reimbursements", "main h1"), ("/people/timesheet", "table")]:
        go(page, path, sel)
        w = page.evaluate("document.documentElement.scrollWidth")
        check(f"Phone width: {path} does not scroll the page sideways", w <= 391, w)
    go(page, "/plant/fleet", "table")
    boxes = [main.get_by_role("button", name=n, exact=True).bounding_box() for n in ["Upload document", "Add vehicle", "Edit vehicle"]]
    check("Phone width: the three Fleet buttons are on screen", all(b and b["x"] >= 0 and b["x"] + b["width"] <= 390 and b["y"] < 320 for b in boxes), boxes)
    main.get_by_role("button", name="Upload document", exact=True).click(); page.wait_for_timeout(300)
    w = page.evaluate("document.documentElement.scrollWidth")
    check("Phone width: the upload dialog fits", w <= 391 and dlg().get_by_role("option").count() == 12, w)
    page.screenshot(path=f"{OUT}/805-fleet-upload-phone.png")
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": 1440, "height": 900})
    page.get_by_role("button", name=re.compile("dark|Dark")).first.click(); page.wait_for_timeout(300)
    go(page, "/plant/fleet", "table"); page.screenshot(path=f"{OUT}/806-fleet-dark.png")
    check("Dark mode: on", page.evaluate("document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'"))
    page.get_by_role("button", name=re.compile("light|Light")).first.click(); page.wait_for_timeout(200)

if __name__ == "__main__":
    errors = []
    try:
        errors = run(steps)
    except Exception as e:
        print("STOPPED EARLY:", str(e)[:600])
    for name, ok, detail in results:
        print(("ok   " if ok else "FAIL ") + name + ("" if ok else "   " + detail[:500]))
    print("console problems:", errors)
    print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
