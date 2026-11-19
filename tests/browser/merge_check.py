import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT, phone_of

# The two copies merged, 19 Nov 2026: the other copy (step-2-team-chat: Email, Team chat, the
# phones, Admin, Fleet from Secure-All, Profitability) brought together with this one
# (invoicing-section: Invoicing, Reports, Customers, Compliance). What this suite checks is where
# the two meet: the bar of 17, Back at the far left, Plant and Fleet apart, Invoicing and
# Profitability as they were here, both phones side by side in phone-sized frames with their
# sheets opening on the phone, the three new sheets on the site manager's phone, tickets in the
# operative's profile, Do not drive, Compliance reading Fleet's records, and to-dos from
# Compliance ticked off when the thing is renewed.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(250)
def pick(sel, pattern):
    """Choose the first option whose text matches."""
    for o in sel.locator("option").all():
        if re.search(pattern, o.inner_text()):
            sel.select_option(o.get_attribute("value")); return True
    return False
def inside(a, b):
    """Is box a inside box b (a pixel either way)?"""
    return a and b and a["x"] >= b["x"] - 1 and a["y"] >= b["y"] - 1 and a["x"] + a["width"] <= b["x"] + b["width"] + 1 and a["y"] + a["height"] <= b["y"] + b["height"] + 1

BAR = ["Dashboard", "Email", "Team chat", "Sales", "Customers", "Projects", "Schedule", "People", "Plant", "Fleet", "Compliance", "Invoicing", "Profitability", "Reports", "Portal", "Site phone", "Admin"]

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main"); page.wait_for_timeout(300)
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    side = lambda: page.locator("nav[aria-label$='screens']:visible")
    bar = page.get_by_role("navigation", name="Departments")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── 1. The bar: 17 tiles, Files out of it
    names = [t.strip().split("\n")[-1] for t in bar.get_by_role("link").all_inner_texts()]
    check("Bar: the 17 tiles in order, Plant, Fleet and Compliance together, Invoicing, Profitability and Reports together", names == BAR, names)
    check("Bar: Files is not in the bar", "Files" not in names)
    go(page, "/files")
    check("Files: the section still opens at its own address", "/files" in page.url and main.locator("h1").inner_text().strip() != "", page.url)

    # ── 2. Back, at the far left, back to exactly where you were
    header = page.locator("header").first
    back = header.get_by_role("button", name="Back")
    home = header.get_by_role("link", name=re.compile(", home$"))
    check("Back: in the top bar, before the firm's name", back.count() == 1 and back.bounding_box()["x"] < home.bounding_box()["x"], (back.count(), home.count()))
    go(page, "/invoicing/invoiced?age=1")
    bar.get_by_role("link", name=re.compile("Fleet$")).click(); page.wait_for_url("**/fleet"); page.wait_for_timeout(300)
    back.click(); page.wait_for_timeout(400)
    check("Back: from Fleet, back to Client invoices with the square that was pressed", page.url.endswith("/invoicing/invoiced?age=1"), page.url)
    bar.get_by_role("link", name=re.compile("Fleet$")).click(); page.wait_for_url("**/fleet"); page.wait_for_timeout(300)
    page.reload(); page.wait_for_selector("main h1"); page.wait_for_timeout(300)
    back.click(); page.wait_for_timeout(400)
    check("Back: still knows the way after a reload", page.url.endswith("/invoicing/invoiced?age=1"), page.url)

    # ── 3. Plant and Fleet apart
    go(page, "/plant")
    plant_links = [t.strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Plant: plant only, nothing of Fleet in its sidebar", not any(re.search(r"Fleet|Vehicles|Garages|Drivers", t) for t in plant_links), plant_links)
    go(page, "/fleet")
    fleet_links = [t.split("\n")[0].strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Fleet: a department of its own, with repair spend, vehicles and lists", all(n in fleet_links for n in ["Overview", "Invoices", "Vehicles", "Renewals", "Damage reported", "Vehicle documents", "Garages", "Drivers", "Bases"]), fleet_links)
    go(page, "/plant/fleet")
    check("Fleet: the old Plant address lands on Fleet's vehicles", page.url.endswith("/fleet/vehicles"), page.url)

    # ── 4. Invoicing and Profitability as they were on this copy
    go(page, "/invoicing")
    inv_links = [t.split("\n")[0].strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Invoicing: this copy's sidebar, with job costs in it for everyone", all(n in inv_links for n in ["Client invoices", "Client queries", "Supplier invoices", "To approve", "To be paid", "Sage export", "Job costs", "Invoice design"]), inv_links)
    go(page, "/profit")
    prof_links = [t.split("\n")[0].strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Profitability: By site only", prof_links == ["By site"], prof_links)
    go(page, "/profit/costs")
    check("Profitability: its old Job costs address lands in Invoicing", page.url.endswith("/invoicing/costs"), page.url)
    go(page, "/admin")
    admin_links = [t.split("\n")[0].strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Admin: the other copy's screens are all there", all(n in admin_links for n in ["Requests", "Roles and access", "Site access", "Company holidays", "Billing", "Connections", "Automations", "Activity log"]), admin_links)

    # ── 5. The site phone: both phones side by side, each phone-sized, scrolling inside itself
    go(page, "/site")
    op, mp = phone_of(page, "operative"), phone_of(page, "manager")
    ob, mb = op.bounding_box(), mp.bounding_box()
    check("Site phone: two phones side by side, an operative's then a site manager's", ob and mb and ob["x"] < mb["x"] and abs(ob["y"] - mb["y"]) < 5, (ob, mb))
    check("Site phone: each is phone-sized", 360 <= ob["width"] <= 440 and 500 <= ob["height"] <= 860 and 360 <= mb["width"] <= 440, (ob, mb))
    scroller = op.locator(":scope > div").nth(1)
    check("Site phone: the operative's phone scrolls inside itself", page.evaluate("(el) => el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY === 'auto'", scroller.element_handle()))
    feed = page.get_by_role("region", name="What the office receives")
    check("Site phone: what the office receives sits beside the phones", feed.count() == 1 and feed.bounding_box()["x"] > mb["x"] + mb["width"] - 1, feed.bounding_box() if feed.count() else None)
    check("Site phone: no Phone of switch when both fit", page.get_by_role("tablist", name="Phone of").is_hidden())

    # Operative: the red card on top, tickets in the profile, sheets on the phone
    pick(page.get_by_label("Operative to view the phone as"), r"^Tomás Breslin"); page.wait_for_timeout(300)
    first = op.locator("[role=status]").first
    check("Operative: someone who cannot work sees the red card at the top of the front page", "Safe Pass" in first.inner_text() and "cannot work on site" in first.inner_text(), first.inner_text()[:200])
    check("Operative: no My tickets button on the front page; it is in the profile", op.get_by_role("button", name="My tickets").count() == 0)
    op.get_by_role("button", name="My profile").click(); page.wait_for_timeout(300)
    sheet = op.locator("dialog[open]")
    ob = op.bounding_box()
    check("Operative: the profile opens as a sheet on the phone, not over the page", sheet.count() == 1 and inside(sheet.bounding_box(), ob), (sheet.count(), sheet.bounding_box() if sheet.count() else None, ob))
    check("Operative: My tickets is in the profile, with the Safe Pass that ran out", "Safe Pass" in sheet.get_by_role("list", name="My tickets").inner_text() and sheet.get_by_role("button", name="Send a photo of the new card").count() >= 1)
    page.screenshot(path=f"{OUT}/950-phones-profile.png")
    check("Operative: the sheet holds only its own phone; the page and the other phone stay usable", page.evaluate("!document.querySelector('dialog:modal')") and mp.locator("dialog[open]").count() == 0)
    page.keyboard.press("Escape"); page.wait_for_timeout(250)
    check("Operative: Escape closes the sheet", op.locator("dialog[open]").count() == 0)

    # Site manager: who cannot work, scaffold inspections, subcontractor invoices, Do not drive
    pick(page.get_by_label("Site manager to view the phone as"), r"^Darragh Lenihan"); page.wait_for_timeout(300)
    mp.get_by_role("list", name="My jobs").get_by_role("button", name=re.compile("^C722")).click(); page.wait_for_timeout(300)
    mp.get_by_role("button", name=re.compile("^Who cannot work")).click(); page.wait_for_timeout(300)
    who = mp.get_by_role("list", name="Who cannot work on C722")
    check("Site manager: Who cannot work names Tomás Breslin, today, with his course", who.count() == 1 and "Tomás Breslin" in who.inner_text() and "Cannot work today" in who.inner_text() and "Booked on the" in who.inner_text(), who.inner_text() if who.count() else "")
    page.keyboard.press("Escape"); page.wait_for_timeout(250)

    pick(page.get_by_label("Site manager to view the phone as"), r"^Eoin Brosnan"); page.wait_for_timeout(300)
    mp.get_by_role("list", name="My jobs").get_by_role("button", name=re.compile("^C719")).click(); page.wait_for_timeout(300)
    mp.get_by_role("button", name=re.compile("^Scaffold inspections")).click(); page.wait_for_timeout(300)
    scf = mp.get_by_role("list", name="Scaffolds on C719")
    s2 = scf.locator("li", has_text="S2")
    check("Site manager: the scaffold register is on the phone, S2 overdue", "Inspection overdue" in s2.inner_text(), s2.inner_text()[:200])
    s2.get_by_role("button", name="Record an inspection").click(); page.wait_for_timeout(200)
    s2.get_by_role("button", name="Save inspection").click(); page.wait_for_timeout(300)
    got = data(page, "(() => { const s = db.scaffolds.find(x => x.id === 'scf-C719-S2'); return [s.inspections[0].date === day, s.inspections[0].by, s.inspections[0].result] })()")
    check("Site manager: an inspection saved on the phone is in his name, today", got == [True, "Eoin Brosnan", "Safe to use"], got)
    page.keyboard.press("Escape"); page.wait_for_timeout(250)
    check("Site manager: Escape closes the sheet even after the button pressed has gone", mp.locator("dialog[open]").count() == 0)
    mp.get_by_role("button", name="All my jobs").click(); page.wait_for_timeout(250)

    waiting = data(page, "(() => { const s = db.supplierInvoices.find(s => s.party === 'subcontractor' && s.askedBy && s.readStatus !== 'confirmed' && !s.sentBack); const p = db.projects.find(p => p.id === s.allocations[0].projectId); return { id: s.id, no: s.invoiceNo, sub: s.supplier, code: p.code, mgr: db.people.find(x => x.id === p.siteManagerId).name } })()")
    pick(page.get_by_label("Site manager to view the phone as"), "^" + re.escape(waiting["mgr"])); page.wait_for_timeout(300)
    mp.get_by_role("list", name="My jobs").get_by_role("button", name=re.compile("^" + waiting["code"])).click(); page.wait_for_timeout(300)
    mp.get_by_role("button", name=re.compile("^Subcontractor invoices")).click(); page.wait_for_timeout(300)
    subs = mp.get_by_role("list", name=f"Subcontractor invoices for {waiting['code']}")
    row = subs.locator("li", has_text=waiting["no"])
    check("Site manager: subcontractor invoices for his job are on the phone, to approve or send back", row.count() == 1 and row.get_by_role("button", name="Approve").count() == 1 and row.get_by_role("button", name="Send back").count() == 1, waiting)
    row.get_by_role("button", name="Approve").click(); page.wait_for_timeout(300)
    check("Site manager: approving asks first, as in Invoicing", "Confirm approval" in dlg().inner_text())
    dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(400)
    after = data(page, f"(() => {{ const s = db.supplierInvoices.find(x => x.id === '{waiting['id']}'); return [s.readStatus, s.confirmedBy] }})()")
    check("Site manager: approved in his name and into job costs", after == ["confirmed", waiting["mgr"]], after)
    page.keyboard.press("Escape"); page.wait_for_timeout(250)

    pick(page.get_by_label("Site manager to view the phone as"), r"^Shane Culloty"); page.wait_for_timeout(300)
    mp.get_by_role("button", name=re.compile("^Driving check")).click(); page.wait_for_timeout(300)
    # His own van is chosen for him; anyone without one picks it.
    if mp.locator("dialog[open]").get_by_label("Vehicle").count():
        pick(mp.locator("dialog[open]").get_by_label("Vehicle"), r"^212-D-18834"); page.wait_for_timeout(200)
    check("Driving check: a van with a paper out of date says Do not drive", "Do not drive 212-D-18834" in mp.locator("dialog[open]").inner_text(), mp.locator("dialog[open]").inner_text()[:300])
    page.screenshot(path=f"{OUT}/951-phones-do-not-drive.png")
    page.keyboard.press("Escape"); page.wait_for_timeout(250)

    # ── 6. Compliance reads Fleet's records; to-dos are ticked off when the thing is renewed
    go(page, "/compliance?area=fleet&all=1", "table")
    everything = page.get_by_role("table", name="Everything due")
    cvrt = everything.locator("tr", has_text="212-D-18834").filter(has_text="CVRT")
    check("Compliance: the van's CVRT, from Fleet's records, already on Fleet's to-do list", cvrt.count() == 1 and "On a to-do list" in cvrt.inner_text(), cvrt.inner_text() if cvrt.count() else "")
    check("Compliance: drivers' licences and Driver CPC come from Fleet too", everything.locator("tr", has_text="Driver CPC").count() >= 1 and everything.locator("tr", has_text="Yearly licence check").count() >= 1)
    go(page, "/compliance/fleet", "table")
    page.get_by_role("table", name="Vehicle papers").locator("tr", has_text="212-D-18834").locator("td").nth(2).get_by_role("button").click(); page.wait_for_timeout(300)
    check("Compliance: renewing the CVRT opens Fleet's own form", "Record CVRT renewal, 212-D-18834" in dlg().inner_text(), dlg().inner_text()[:120])
    dlg().get_by_role("button", name="Record renewal").click(); page.wait_for_timeout(400)
    v = data(page, "(() => { const v = db.vehicles.find(x => x.reg === '212-D-18834'); return [v.compliance.test.expiryDate > day, !!v.compliance.test.proofNeeded, db.todos.filter(t => t.vehicleId === v.id && t.item === 'test' && !t.doneAt).length] })()")
    check("Compliance: the renewal is on Fleet's record, waiting on proof, and Fleet's to-do is ticked off", v == [True, True, 0], v)
    go(page, "/fleet/vehicles", "table")
    check("Fleet: the same vehicle shows the CVRT in date", "Do not drive" not in main.locator("tr", has_text="212-D-18834").inner_text())

    go(page, "/compliance?area=machinery", "table")
    tr3 = page.get_by_role("table", name="Everything due").locator("tr", has_text="TR3").filter(has_text="Electrical safety test")
    tr3.get_by_role("button", name=re.compile("^Add to my to-do")).click(); page.wait_for_timeout(300)
    check("Compliance: Add to my to-do puts the row on the list", "On a to-do list" in tr3.inner_text())
    go(page, "/dashboard", "main h1")
    todo = page.get_by_role("list", name="To do").locator("li", has_text="TR3")
    check("Dashboard: the to-do is there, with a link to open it", todo.count() == 1 and todo.get_by_role("link", name="Open it").count() == 1, todo.inner_text() if todo.count() else "")
    go(page, "/compliance/machinery", "table")
    page.get_by_role("button", name=re.compile(r"^TR3 Site transformer 3.3 kVA, Electrical safety test")).click(); page.wait_for_timeout(250)
    dlg().get_by_role("button", name="Save renewal").click(); page.wait_for_timeout(300)
    done = data(page, "db.todos.filter(t => (t.complianceKey || '').startsWith('chk:') && t.title.includes('TR3')).map(t => !!t.doneAt)")
    check("Compliance: renewing it ticks the to-do off", done == [True], done)
    go(page, "/dashboard", "main h1")
    check("Dashboard: the to-do has left the list", page.get_by_role("list", name="To do").locator("li", has_text="TR3").count() == 0)

    # ── 7. Phone width: no frame, one phone at a time with the switch
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(300)
    go(page, "/site")
    check("Phone width: no frame; the phone fills the screen", page.locator("main .border-bezel").count() == 0 and phone_of(page, "operative").bounding_box()["width"] >= 340)
    check("Phone width: one phone at a time, with the Phone of switch", page.get_by_role("tablist", name="Phone of").is_visible() and phone_of(page, "manager").is_hidden())
    check("Phone width: nothing scrolls sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    phone_of(page, "operative").get_by_role("button", name="My profile").click(); page.wait_for_timeout(300)
    check("Phone width: a sheet is an ordinary dialog over the screen", page.locator("dialog[open]").count() == 1 and page.locator("dialog[open]").evaluate("(d) => d.matches(':modal')"))
    page.screenshot(path=f"{OUT}/952-phone-width.png")
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": 1440, "height": 900}); page.wait_for_timeout(300)

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
