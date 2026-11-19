import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT, phone_of, show_phone

# Compliance, 18 Nov 2026, after the HVAC compliance demo: every expiry in one place (people,
# vans and licences, machinery and scaffolds, company papers, subcontractors), training courses,
# what stops work (someone with a Safe Pass or trade ticket out of date cannot be planned or
# marked; a machine past its checks cannot go to a site), the scaffold register on each project,
# tickets on the site phone, subcontractors' papers in their portal, and their invoices flagged.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def as_role(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role).click()
    page.wait_for_timeout(350)
def go(page, path, sel="main"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(250)
def pick(sel, pattern):
    """Choose the first option whose text matches."""
    for o in sel.locator("option").all():
        if re.search(pattern, o.inner_text()):
            v = o.get_attribute("value")
            sel.select_option(value=v if v is not None else o.inner_text())
            return True
    raise AssertionError(f"no option matching {pattern}")
def no_sideways(page):
    return not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main"); page.wait_for_timeout(300)
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    bar = page.get_by_role("navigation", name="Departments")
    side = lambda: page.locator("nav[aria-label$=screens]:visible")

    # ── Where it lives
    names = [t.strip() for t in bar.get_by_role("link").all_inner_texts()]
    # Merged 19 Nov: Plant, then Fleet (a department of its own), then Compliance.
    names = [n.split("\n")[-1] for n in names]
    check("Bar: Compliance sits after Plant and Fleet", names.index("Fleet") == names.index("Plant") + 1 and names.index("Compliance") == names.index("Fleet") + 1, names)
    text = main.inner_text()
    ran = data(page, "(() => { const c = db.people.find(p => p.id === 'p-124').certs.find(c => c.name === 'Safe Pass'); const d = new Date(c.expires + 'T12:00:00Z'); return d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) })()")
    check("Overview: someone planned who cannot work is a decision, with their ticket and course", f"Tomás Breslin is planned on C722 today, but their Safe Pass ran out on {ran}" in text and "booked on the course on" in text, (ran, text[:400]))
    go(page, "/people")
    check("People: Training tickets has moved out of the sidebar", side().get_by_role("link", name="Training tickets").count() == 0)
    go(page, "/people/certs", "table")
    check("Old address: Training tickets lands on Compliance, Personnel, as a list", page.url.endswith("/compliance/personnel?view=list"), page.url)

    # ── Everything due (merged 19 Nov: eleven, since Kevin Shortall's Driver CPC from Fleet has run out too)
    go(page, "/compliance", "table")
    figs = [t.strip() for t in page.locator("dl[aria-label='Compliance figures'] dt").all_inner_texts()]
    check("Everything due: five figures across the top", figs == ["Run out or missing", "Stopping work", "Due in 30 days", "Proof needed", "In date"], figs)
    blocks_fig = int(page.locator("dl[aria-label='Compliance figures'] button", has_text="Stopping work").locator("dd").first.inner_text())
    check("Everything due: eleven things stop work today", blocks_fig == 11, blocks_fig)
    page.screenshot(path=f"{OUT}/400-compliance.png", full_page=True)
    rows = page.get_by_role("table", name="Everything due").locator("tbody tr")
    first_two = [r.inner_text() for r in rows.all()[:2]]
    check("Everything due: a missing paper comes first, then soonest first", all("Missing" in t for t in first_two), first_two)
    page.locator("dl[aria-label='Compliance figures'] button", has_text="Stopping work").click(); page.wait_for_timeout(200)
    stop = [r.inner_text() for r in rows.all()]
    check("Everything due: the Stopping work figure is a filter, each row saying what it stops", len(stop) == 11 and all(any(w in t for w in ["Cannot be planned or marked on site", "Do not drive", "May not be used on site", "Cannot go to a site", "Do not use", "May not drive"]) for t in stop), stop[:3])
    page.locator("dl[aria-label='Compliance figures'] button", has_text="Stopping work").click(); page.wait_for_timeout(150)
    page.get_by_role("tab", name="Fleet").click(); page.wait_for_timeout(150)
    ftxt = page.get_by_role("table", name="Everything due").inner_text()
    check("Everything due: the area switch narrows the list", "CVRT" in ftxt and "Thorough examination" not in ftxt and "Safe Pass" not in ftxt, ftxt[:200])
    page.get_by_role("tab", name="All").click(); page.wait_for_timeout(150)
    page.get_by_label("Search compliance").fill("kinvara"); page.wait_for_timeout(200)
    check("Everything due: the search finds a subcontractor", rows.count() >= 1 and all("Kinvara" in r.inner_text() for r in rows.all()))
    page.get_by_label("Search compliance").fill("")
    main.get_by_role("button", name="Record a renewal").click(); page.wait_for_timeout(200)
    pick(dlg().get_by_label("What was renewed"), r"^Contractors all risk insurance")
    dlg().get_by_role("button", name="Next").click(); page.wait_for_timeout(200)
    check("Record a renewal: choosing what was renewed opens its own form", "Renew contractors all risk insurance" in dlg().inner_text())
    dlg().get_by_label("Choose a proof from this device").set_input_files(FIX + "cert.pdf"); page.wait_for_timeout(400)
    dlg().get_by_label("Reference").fill("CAR-51001")
    dlg().get_by_role("button", name="Save renewal").click(); page.wait_for_timeout(300)
    car = data(page, "(() => { const c = db.companyPapers.find(x => x.id === 'co-3'); return [c.reference, c.expires > day, !!c.proof, !!c.proofNeeded] })()")
    check("Record a renewal: saved with its new date, reference and copy", car == ["CAR-51001", True, True, False], car)

    # ── Personnel
    go(page, "/compliance/personnel", "table")
    heads = [t.strip() for t in page.get_by_role("table", name="Training matrix").locator("thead th").all_inner_texts()]
    check("Personnel: a training matrix, people down and tickets across, Safe Pass first", heads[0] == "Name" and heads[1] == "Safe Pass" and "Scaffolding ticket, advanced" in heads, heads[:6])
    banner = main.locator("[role=status]").inner_text()
    check("Personnel: names the three people planned who cannot work, with when and their course", all(w in banner for w in ["Kevin Shortall", "Mindaugas Petrauskas", "Tomás Breslin", "Booked on the course"]) and "Scaffolding ticket, advanced runs out on 20 Nov" in banner, banner)
    tom = page.get_by_role("button", name=re.compile(r"^Tomás Breslin, Safe Pass: ran out"))
    check("Personnel: Tomás's Safe Pass is red in the matrix", tom.count() == 1 and "bad" in (tom.get_attribute("class") or ""))
    page.screenshot(path=f"{OUT}/401-personnel.png", full_page=True)
    page.get_by_role("tab", name="List").click(); page.wait_for_timeout(700)
    check("Personnel: the same tickets as a list, soonest first", page.get_by_role("table", name="Training tickets").locator("tbody tr").count() == data(page, "db.people.filter(p => p.active).flatMap(p => p.certs).length"))
    page.get_by_role("tab", name="Matrix").click(); page.wait_for_timeout(200)
    main.get_by_role("button", name="Book on a course").click(); page.wait_for_timeout(200)
    pick(dlg().get_by_label("Course"), r"^Abrasive wheels")
    opt = dlg().get_by_label("Person").locator("option").nth(1).inner_text()
    check("Book on a course: those whose ticket is running out come first", opt.startswith("Marek Wiśniewski"), opt)
    pick(dlg().get_by_label("Person"), r"^Marek Wiśniewski")
    dlg().get_by_role("button", name="Book the place").click(); page.wait_for_timeout(250)
    abr = data(page, "(() => { const c = db.courses.find(x => x.ticket === 'Abrasive wheels'); return [c.bookedIds.includes('p-103'), c.bookedIds.length, c.places] })()")
    check("Book on a course: Marek takes the last place", abr == [True, 6, 6], abr)
    main.get_by_role("button", name="Record a new ticket").click(); page.wait_for_timeout(200)
    pick(dlg().get_by_label("Person"), r"^Paudie Lyne")
    dlg().get_by_label("Ticket").select_option("First aid responder")
    dlg().get_by_role("button", name="Record ticket").click(); page.wait_for_timeout(250)
    fa = data(page, "(() => { const c = db.people.find(p => p.id === 'p-123').certs.find(c => c.name === 'First aid responder'); return c ? [!!c.proofNeeded, c.expires > day] : null })()")
    check("Record a new ticket: added, waiting on its certificate", fa == [True, True], fa)

    # ── Courses
    go(page, "/compliance/courses", "table")
    check("Courses: the sidebar counts the course to mark done", side().get_by_role("link", name=re.compile(r"^Training courses\s*1")).count() == 1, side().inner_text())
    hot = page.get_by_role("table", name="Courses to come").locator("tbody tr", has_text="Hot works")
    check("Courses: yesterday's course says to mark it done", "Mark it done" in hot.inner_text())
    page.screenshot(path=f"{OUT}/402-courses.png", full_page=True)
    hot.get_by_role("button", name="Open").click(); page.wait_for_timeout(200)
    check("Course: says what marking it done does", "marking it done renews Hot works" in dlg().inner_text() and "Micheál Geraghty" in dlg().inner_text())
    dlg().get_by_role("button", name=re.compile(r"^Mark done")).click(); page.wait_for_timeout(250)
    hw = data(page, "(() => { const c = db.people.find(p => p.id === 'p-112').certs.find(c => c.name === 'Hot works'); const k = db.courses.find(x => x.id === 'crs-8'); return [c.issued === k.date, c.expires > '2029-01-01', !!c.proofNeeded, !!k.doneAt] })()")
    check("Course: marking it done renews the ticket from the course's day, waiting on the certificate", hw == [True, True, True, True], hw)
    check("Course: it moves to Done", page.get_by_role("table", name="Courses done").locator("tbody tr", has_text="Hot works").count() == 1)
    main.get_by_role("button", name="Add a course").click(); page.wait_for_timeout(200)
    check("Add a course: needs a provider and a venue", dlg().get_by_role("button", name="Add course").is_disabled())
    dlg().get_by_label("Ticket it gives").select_option("Working at height")
    dlg().get_by_label("Provider").fill("Midwest Safety Training"); dlg().get_by_label("Venue").fill("Ennis")
    dlg().get_by_role("button", name="Add course").click(); page.wait_for_timeout(250)
    check("Add a course: it is listed to come", page.get_by_role("table", name="Courses to come").locator("tbody tr", has_text="Working at height").count() == 1)

    # ── Fleet (merged 19 Nov): the vans, licences and Driver CPC are Fleet's own records, shown here too
    go(page, "/compliance/fleet", "table")
    vt = page.get_by_role("table", name="Vehicle papers")
    nveh = data(page, "db.vehicles.filter(v => v.active).length")
    check("Fleet: every vehicle on the road, from Fleet's records, with tax, CVRT, insurance and service", vt.locator("tbody tr").count() == nveh and nveh >= 18 and "CVRT" in vt.locator("thead").inner_text(), (vt.locator("tbody tr").count(), nveh))
    check("Fleet: a van out of date says not to drive it", "Do not drive" in vt.locator("tr", has_text="212-D-18834").inner_text())
    check("Fleet: a vehicle opens on its page in Fleet", vt.get_by_role("link", name="212-D-18834").get_attribute("href").startswith("/fleet/vehicles/"))
    lic = page.get_by_role("table", name="Driving licences")
    ndrivers = data(page, "db.people.filter(p => p.drives && p.active).length")
    liam = lic.locator("tr", has_text="Liam Costigan")
    check("Fleet: each driver with their licence and Driver CPC, and Liam's yearly check overdue", lic.locator("tbody tr").count() == ndrivers and [t.strip() for t in lic.locator("thead th").all_inner_texts()] == ["Driver", "Driving licence", "Driver CPC", "Yearly check"] and "Overdue by" in liam.locator("td").nth(3).inner_text(), (lic.locator("tbody tr").count(), ndrivers, liam.inner_text()))
    cpc = lic.locator("tr", has_text="Kevin Shortall").locator("td").nth(2)
    check("Fleet: Kevin's Driver CPC has run out and is red", "Ran out" in cpc.inner_text(), cpc.inner_text())
    liam.locator("td").nth(3).get_by_role("button").click(); page.wait_for_timeout(250)
    check("Fleet: the yearly check says what to look at and links to Fleet", "Check Liam Costigan's driving licence" in dlg().inner_text() and dlg().get_by_role("link", name="Open in Fleet").count() == 1)
    dlg().get_by_role("button", name="Checked today").click(); page.wait_for_timeout(250)
    check("Fleet: checking the licence today puts it back in date", "Overdue" not in lic.locator("tr", has_text="Liam Costigan").locator("td").nth(3).inner_text() and "Last " in lic.locator("tr", has_text="Liam Costigan").locator("td").nth(3).inner_text() and data(page, "db.people.find(p => p.id === 'p-114').licenceCheck.checkedOn === day"))
    # The tax renewal opens Fleet's own form, so both places change the same record.
    vt.locator("tr", has_text="191-G-7730").locator("td").nth(1).get_by_role("button").click(); page.wait_for_timeout(250)
    check("Fleet: a tax renewal opens Fleet's own renewal form", dlg().count() == 1 and "191-G-7730" in dlg().inner_text(), dlg().inner_text()[:200])
    dlg().get_by_role("button", name="Cancel").last.click(); page.wait_for_timeout(200)
    page.screenshot(path=f"{OUT}/403-fleet.png", full_page=True)

    # ── Machinery and scaffolds
    go(page, "/compliance/machinery", "table")
    reg = page.get_by_role("table", name="Scaffold registers")
    check("Machinery: every scaffold standing, the two past their inspection marked Do not use", reg.locator("tbody tr").count() == 6 and reg.locator("tr", has_text="Do not use").count() == 2)
    reg.locator("tr", has_text="Birdcage scaffold").get_by_role("button", name="Record inspection").click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Record: safe to use").click(); page.wait_for_timeout(250)
    s2 = data(page, "(() => { const s = db.scaffolds.find(x => x.id === 'scf-C719-S2'); return [s.inspections[0].date === day, s.inspections[0].by] })()")
    check("Machinery: an inspection is recorded today, by whoever did it", s2 == [True, "Aidan King"], s2)
    reg.locator("tr", has_text="Pavement gantry").get_by_role("button", name="Record inspection").click(); page.wait_for_timeout(200)
    dlg().get_by_label("Not safe to use").check()
    check("Machinery: not safe needs a note saying what is wrong", dlg().get_by_role("button", name="Record: not safe to use").is_disabled())
    dlg().get_by_label("What was seen").fill("Netting torn at the second lift"); dlg().get_by_role("button", name="Record: not safe to use").click(); page.wait_for_timeout(250)
    check("Machinery: a red tag says Not safe to use and Do not use", "Not safe to use" in reg.locator("tr", has_text="Pavement gantry").inner_text() and "Do not use" in reg.locator("tr", has_text="Pavement gantry").inner_text())
    checks = page.get_by_role("table", name="Machinery checks")
    check("Machinery: a harness on site past its inspection may not be used", "May not be used" in checks.locator("tr", has_text="HAR4").inner_text())
    page.get_by_role("button", name=re.compile(r"^TR3 Site transformer 3.3 kVA, Electrical safety test")).click(); page.wait_for_timeout(200)
    check("Machinery: the renewal says it cannot go to a site until renewed", "cannot go to a site until this is renewed" in dlg().inner_text())
    dlg().get_by_role("button", name="Save renewal").click(); page.wait_for_timeout(250)
    check("Machinery: renewed with no certificate, it is flagged as waiting on proof", data(page, "db.plant.find(x => x.assetRef === 'TR3').renewals[0].proofNeeded") is True)
    page.screenshot(path=f"{OUT}/404-machinery.png", full_page=True)
    go(page, "/plant?item=pl-HAR4", "dialog[open]")
    check("Plant: a harness past its inspection cannot be sent to another site", dlg().get_by_label("Where HAR4 is").locator("option[value='pr-C719']").is_disabled())
    dlg().get_by_role("button", name="Close").click()
    go(page, "/plant?item=pl-TR3", "dialog[open]")
    dlg().get_by_label("Where TR3 is").select_option("pr-C722"); page.wait_for_timeout(250)
    check("Plant: once renewed it can go to a site", data(page, "db.plant.find(x => x.assetRef === 'TR3').projectId") == "pr-C722")
    dlg().get_by_role("button", name="Close").click()

    # ── Company papers
    go(page, "/compliance/company", "table")
    co = page.get_by_role("table", name="Company papers")
    check("Company papers: insurances, tax clearance and registrations, each with its date and status", co.locator("tbody tr").count() == 7 and "Public liability insurance" in co.inner_text() and "Tax clearance certificate" in co.inner_text())
    check("Company papers: professional indemnity renewed, schedule still to come", "Proof needed" in co.locator("tr", has_text="Professional indemnity").inner_text())

    # ── Subcontractors
    go(page, "/compliance/subcontractors", "table")
    kin = page.get_by_role("region", name="Kinvara Stone Carvers")
    # The day it ran out moves with the demo's day, so read it from the records.
    el = data(page, "(() => { const s = db.subcontractors.find(x => x.id === 'sub-2'); const p = s.papers.filter(p => p.kind === 'Employers liability insurance' || /mployers/.test(p.kind)).sort((a, b) => b.expires.localeCompare(a.expires))[0]; const d = new Date(p.expires + 'T12:00:00Z'); return d.getUTCDate() + ' ' + d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) })()")
    check("Subcontractors: one section each, with what is out of date said at the top", page.locator("main section[aria-label]").count() == 5 and f"employers' liability ran out on {el}" in kin.inner_text(), (el, kin.inner_text()[:300]))
    cor = page.get_by_role("region", name="Corrib Scaffolding")
    cor.get_by_role("table", name="Corrib Scaffolding's papers").locator("tr", has_text="Method statement, C721").get_by_role("button", name="Record it").click(); page.wait_for_timeout(200)
    dlg().get_by_label("Choose a proof from this device").set_input_files(FIX + "cert.pdf"); page.wait_for_timeout(400)
    dlg().get_by_role("button", name="Save").click(); page.wait_for_timeout(250)
    check("Subcontractors: a method statement that came by email is recorded for its site", "Received" in cor.get_by_role("table", name="Corrib Scaffolding's papers").locator("tr", has_text="Method statement, C721").inner_text())
    cor.get_by_role("button", name="Add a person").click(); page.wait_for_timeout(200)
    dlg().get_by_label("Name").fill("Tadhg Rabbitte"); dlg().get_by_role("button", name="Add person").click(); page.wait_for_timeout(250)
    check("Subcontractors: a new person of theirs is added, waiting on their card", data(page, "(() => { const w = db.subcontractors.find(s => s.id === 'sub-1').workers.find(w => w.name === 'Tadhg Rabbitte'); return !!w && !!w.proofNeeded })()") is True)
    page.screenshot(path=f"{OUT}/405-subcontractors.png", full_page=True)

    # ── Their invoices are flagged, then the subcontractor sends the new paper through their portal
    as_role(page, "Site manager")
    go(page, "/projects/subcontractor-invoices")
    page.get_by_role("tab", name=re.compile("^Everything on these sites")).click(); page.wait_for_timeout(250)
    kin_head = page.locator("th", has_text="Kinvara Stone Carvers").first.inner_text()
    check("Site manager's subcontractor invoices: lapsed insurance is flagged under their name, not held", f"Employers' liability insurance ran out on {el}" in kin_head, (el, kin_head))
    as_role(page, "Managing director")
    go(page, "/portal/subcontractors?sub=sub-2&site=pr-C719")
    papers = page.get_by_role("region", name="Your papers")
    check("Portal: Kinvara see their papers and what is out of date", f"employers' liability ran out on {el}" in papers.inner_text() and "Your invoices are flagged" in papers.inner_text())
    papers.locator("tr", has_text="Employers' liability").get_by_role("button", name="Send a new one").click(); page.wait_for_timeout(200)
    check("Portal: a new paper cannot be sent without a copy", dlg().get_by_role("button", name="Send").is_disabled())
    dlg().get_by_label("Choose a copy from this device").set_input_files(FIX + "cert.pdf"); page.wait_for_timeout(400)
    dlg().get_by_role("button", name="Send").click(); page.wait_for_timeout(300)
    check("Portal: once sent, the flag goes and the office sees it came through the portal", "Out of date or missing" not in papers.inner_text() and data(page, "db.activity[0].what") == "A subcontractor sent a paper through the portal" and data(page, "db.activity[0].who") == "Fiachra Naughton")

    # ── Site phone: Tomás sends a photo of his new card; the office accepts it
    go(page, "/site")
    pick(page.get_by_label("Operative to view the phone as"), r"^Tomás Breslin")
    page.wait_for_timeout(250)
    phone = phone_of(page, "operative")
    check("Site phone: Tomás is told his Safe Pass ran out and he cannot work, and when his course is", "Safe Pass ran out" in phone.inner_text() and "cannot work on site" in phone.inner_text() and "Booked on the course" in phone.inner_text(), phone.inner_text()[:300])
    # Merged 19 Nov: his tickets are in his profile, with the red card on the front page.
    phone.get_by_role("button", name="My profile").click(); page.wait_for_timeout(250)
    tickets = dlg().get_by_role("list", name="My tickets")
    check("Site phone: My tickets, in his profile, lists his tickets with their dates", "Safe Pass" in tickets.inner_text() and "Manual handling" in tickets.inner_text())
    tickets.locator("li", has_text="Safe Pass").get_by_role("button", name="Send a photo of the new card").click(); page.wait_for_timeout(250)
    dlg().get_by_label("Choose a card from this device").set_input_files(FIX + "card.png"); page.wait_for_timeout(600)
    dlg().get_by_role("button", name="Send").click(); page.wait_for_timeout(300)
    check("Site phone: the card is sent to the office, in his name", data(page, "!!db.people.find(p => p.id === 'p-124').certs.find(c => c.name === 'Safe Pass').sentPhoto") is True and data(page, "db.activity[0].who") == "Tomás Breslin")
    page.screenshot(path=f"{OUT}/406-phone.png", full_page=True)
    dlg().get_by_role("button", name="Close").first.click(); page.wait_for_timeout(200)
    pick(page.get_by_label("Operative to view the phone as"), r"^Seán Dunphy")
    page.wait_for_timeout(250)
    check("Site phone: Seán is told his tipper's CVRT is due", "221-WW-3316" in phone_of(page, "operative").inner_text() and "CVRT due" in phone_of(page, "operative").inner_text())
    go(page, "/compliance/personnel", "table")
    sent = page.get_by_role("table", name="Cards sent from the site phone")
    check("Personnel: the card from the phone waits to be checked", sent.locator("tbody tr", has_text="Tomás Breslin").count() == 1)
    sent.get_by_role("button", name="Check card").click(); page.wait_for_timeout(200)
    check("Check card: the photo is shown with the date to read off it", dlg().locator("img").count() == 1)
    dlg().get_by_role("button", name="Accept the card").click(); page.wait_for_timeout(300)
    tp = data(page, "(() => { const c = db.people.find(p => p.id === 'p-124').certs.find(c => c.name === 'Safe Pass'); return [c.expires > day, !!c.proof, !!c.sentPhoto] })()")
    check("Check card: accepted, the Safe Pass is renewed with the card attached", tp == [True, True, False], tp)
    check("Personnel: Tomás is no longer named as unable to work", "Tomás Breslin" not in (main.locator("[role=status]").inner_text() if main.locator("[role=status]").count() else ""))

    # ── Planning and the timesheet
    go(page, "/people/timesheet?site=pr-C722", "table")
    check("Timesheet: with his Safe Pass renewed, Tomás can be marked today", page.get_by_label("Today for Tomás Breslin").count() == 1)
    go(page, "/schedule", "table")
    check("Week ahead: still held back by the two whose tickets run out first", "2 people planned who cannot work" in main.inner_text() and page.get_by_role("button", name="Send week to operatives").is_disabled())
    # Merged 19 Nov: the week ahead is one grid (sites down, days across), so the checks read it.
    grid = page.get_by_role("table", name="Week ahead by site and day")
    kev = grid.locator("button", has_text="Kevin Shortall").filter(has_text="Cannot work")
    check("Week ahead: Kevin is in red, marked Cannot work, on the days his ticket has run out", kev.count() >= 1 and "bad" in (kev.first.get_attribute("class") or ""), kev.count())
    kev.first.click(); page.wait_for_timeout(250)
    check("Person box: his week says he cannot work", "cannot work" in dlg().inner_text(), dlg().inner_text()[:300])
    dlg().get_by_role("button", name=re.compile("^Take off C7")).first.click(); page.wait_for_timeout(300)
    while page.locator("dialog[open]").count():
        page.locator("dialog[open]").last.get_by_role("button", name="Close").first.click(); page.wait_for_timeout(150)
    mon = data(page, "(() => { const d = new Date(day + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1) } while (d.getUTCDay() !== 1); return d.toISOString().slice(0, 10) })()")
    grid.locator(f"td[data-cell='C725 {mon}']").get_by_role("button", name=re.compile("^Add someone to C725")).click(); page.wait_for_timeout(250)
    box = dlg().inner_text()
    check("Week ahead: Add leaves out someone who cannot work that day and says why", "Not offered, a ticket has run out: " in box and "Kevin Shortall (Scaffolding ticket, advanced" in box and dlg().get_by_role("button", name=re.compile("Kevin Shortall")).count() == 0, box[:400])
    dlg().get_by_role("button", name="Close").first.click(); page.wait_for_timeout(200)

    # ── The scaffold register on the project page
    go(page, "/projects/C719?tab=plant", "table")
    reg = page.get_by_role("table", name="Scaffold register")
    check("Project: the Plant tab opens with the site's scaffold register", reg.locator("tbody tr").count() == 2)
    page.get_by_role("button", name="Add a scaffold").click(); page.wait_for_timeout(200)
    dlg().get_by_label("What and where").fill("Chimney stack scaffold, north side")
    dlg().get_by_role("button", name="Add to register").click(); page.wait_for_timeout(250)
    row = reg.locator("tr", has_text="Chimney stack scaffold")
    check("Project: a new scaffold goes on as S3, due an inspection before first use", "S3" in row.inner_text() and "Not yet" in row.inner_text() and "Due" in row.inner_text())
    row.get_by_role("button", name="Record inspection").click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Record: safe to use").click(); page.wait_for_timeout(250)
    reg.locator("tr", has_text="Chimney stack scaffold").get_by_role("button", name=re.compile("Aidan King")).click(); page.wait_for_timeout(200)
    check("Project: its inspections open as a history", "Safe to use" in dlg().inner_text())
    dlg().get_by_role("button", name="Close").click()
    reg.locator("tr", has_text="Chimney stack scaffold").get_by_role("button", name="Taken down").click(); page.wait_for_timeout(250)
    check("Project: taken down, it leaves the register and is listed below it", reg.locator("tr", has_text="Chimney stack scaffold").count() == 0 and "Taken down: S3" in main.inner_text())
    go(page, "/admin/activity")
    check("Activity log: courses, inspections, papers and the phone card are recorded", all(w in main.inner_text() for w in ["Marked a course done", "Inspected a scaffold", "Renewed a company paper", "Accepted a new ticket sent from the phone", "Checked a driving licence"]))

    # ── Who sees what
    as_role(page, "Site manager")
    go(page, "/compliance", "table")
    links = [t.strip() for t in side().get_by_role("link").all_inner_texts()]
    check("Site manager: Compliance without Fleet or Company papers", "Fleet" not in " ".join(links) and "Company papers" not in " ".join(links) and any(l.startswith("Personnel") for l in links), links)
    txt = page.get_by_role("table", name="Everything due").inner_text()
    check("Site manager: only their own sites, so no vans and nothing from another site", "212-D-18834" not in txt and "C722" not in txt and "C719" in txt, txt[:300])
    # They can still put it on their own to-do list (merged 19 Nov), just not renew it.
    krow = page.get_by_role("table", name="Everything due").locator("tr", has_text="Kevin Shortall")
    check("Site manager: cannot renew tickets", krow.get_by_role("button", name=re.compile("^(Renew|Record|Add proof)")).count() == 0 and krow.get_by_role("button").count() == krow.get_by_role("button", name=re.compile("^Add to my to-do")).count())
    go(page, "/compliance/machinery", "table")
    check("Site manager: can record inspections on their own sites", page.get_by_role("table", name="Scaffold registers").get_by_role("button", name="Record inspection").count() >= 1 and "C723" not in page.get_by_role("table", name="Scaffold registers").inner_text())
    as_role(page, "Contracts manager")
    go(page, "/compliance/company", "table")
    check("Contracts manager: sees the company papers but cannot renew them", page.get_by_role("table", name="Company papers").get_by_role("button", name="Renew").count() == 0 and "Manage company and subcontractor papers" in main.inner_text())
    as_role(page, "Accounts")
    go(page, "/compliance/company", "table")
    check("Accounts: can renew the company papers", page.get_by_role("table", name="Company papers").get_by_role("button", name="Renew").count() == 7)
    as_role(page, "Managing director")

    # ── Dark and phone width
    go(page, "/compliance")
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    page.screenshot(path=f"{OUT}/410-compliance-dark.png", full_page=True)
    go(page, "/compliance/personnel"); page.screenshot(path=f"{OUT}/411-personnel-dark.png", full_page=True)
    page.get_by_role("button", name="Switch to light mode").click()
    page.set_viewport_size({"width": 390, "height": 844})
    for path in ["/compliance", "/compliance/personnel", "/compliance/personnel?view=list", "/compliance/courses", "/compliance/fleet", "/compliance/machinery", "/compliance/company", "/compliance/subcontractors", "/projects/C719?tab=plant"]:
        go(page, path)
        check(f"Phone width: page itself does not scroll sideways on {path}", no_sideways(page))
    go(page, "/compliance"); page.screenshot(path=f"{OUT}/420-compliance-phone.png", full_page=True)

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
