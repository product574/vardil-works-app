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
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")

def as_role(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role).click()
    page.wait_for_timeout(350)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.wait_for_selector("text=Who are you signing in as?"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")

    # ── Timesheet: week grid
    page.goto(BASE + "/people/timesheet?site=pr-C722"); page.wait_for_selector("table")
    check("Timesheet: five weekday columns, today marked", page.locator("thead th").count() == 7 and "(today)" in page.locator("thead").inner_text(), page.locator("thead").inner_text())
    check("Timesheet: C722 has 5 people and nobody marked today", page.locator("tbody tr").count() == 5 and "0 of 5 marked for today" in main.inner_text())
    check("Timesheet: nothing to send yet, so the send button is off", page.get_by_role("button", name="Send today's time stamps").is_disabled())
    page.get_by_label("Today for Adrian Stoica").select_option("full")
    page.get_by_label("Today for Cormac Hession").select_option("half")
    page.get_by_label("Today for Krzysztof Nowicki").select_option("overtime"); page.wait_for_timeout(150)
    ot = page.get_by_label("Overtime hours for Krzysztof Nowicki"); ot.click(); ot.press("ControlOrMeta+a"); page.keyboard.type("2.5", delay=40); page.wait_for_timeout(200)
    t = data(page, "db.attendance.filter(a => a.projectId==='pr-C722' && a.date===day).map(a => [db.people.find(p=>p.id===a.personId).name, a.status, a.overtimeHours, a.sent])")
    check("Timesheet: full, half and overtime are saved as marked, unsent", sorted(t) == sorted([["Adrian Stoica", "full", 0, False], ["Cormac Hession", "half", 0, False], ["Krzysztof Nowicki", "full", 2.5, False]]), t)
    check("Timesheet: the header counts 3 of 5, 3 not sent", "3 of 5 marked for today, 3 not sent yet" in main.inner_text())
    page.screenshot(path=f"{OUT}/60-timesheet.png")
    box = page.get_by_label("Today for Krzysztof Nowicki").bounding_box()
    check("Timesheet: the overtime choice is not cut off beside its hours box", box and box["width"] >= 120, box)
    page.get_by_role("button", name="Send today's time stamps").click(); page.wait_for_timeout(250)
    check("Timesheet: sending marks them sent and locks today's cells", data(page, "db.attendance.filter(a => a.projectId==='pr-C722' && a.date===day && a.sent).length") == 3 and page.get_by_label("Today for Adrian Stoica").count() == 0)
    check("Timesheet: unmarked people can still be marked after sending", page.get_by_label("Today for Ionuț Marin").count() == 1)
    check("Timesheet: someone whose Safe Pass ran out cannot be marked, and it says why", page.get_by_label("Today for Tomás Breslin").count() == 0 and "Cannot work: Safe Pass ran out" in page.locator("tr", has_text="Tomás Breslin").inner_text())

    # correction of a sent day needs a reason and is logged
    page.get_by_role("button", name="Adrian Stoica, " ).first.click(); page.wait_for_timeout(200)
    dlg = page.locator("dialog[open]")
    check("Correction: save is off until something changes and a reason is given", dlg.get_by_role("button", name="Save correction").is_disabled())
    dlg.get_by_label("Should be").select_option("half")
    check("Correction: still off without a reason", dlg.get_by_role("button", name="Save correction").is_disabled())
    dlg.get_by_label("Reason for the correction").fill("Left at lunch, van breakdown")
    dlg.get_by_role("button", name="Save correction").click(); page.wait_for_timeout(250)
    ch = data(page, "db.attendanceChanges[0]")
    check("Correction: old value, new value, who and why are recorded", ch and ch["to"] == "Half" and ch["reason"] == "Left at lunch, van breakdown" and ch["by"] == "Aidan King", ch)

    # roster add and remove
    page.get_by_label("Add someone to this site").select_option(label="Orla Prunty, Apprentice stonemason")
    page.get_by_role("button", name="Add to site").click(); page.wait_for_timeout(200)
    check("Roster: adding someone puts them on the grid", page.locator("tbody tr", has_text="Orla Prunty").count() == 1)
    page.get_by_role("button", name="Take Orla Prunty off this site").click(); page.wait_for_timeout(200)
    check("Roster: taking someone off removes the row", page.locator("tbody tr", has_text="Orla Prunty").count() == 0)
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(200)
    check("Timesheet: earlier week shows history and no today column", "(today)" not in page.locator("thead").inner_text() and page.get_by_role("button", name="Back to this week").count() == 1)
    page.goto(BASE + "/people/timesheet?site=pr-C725"); page.wait_for_selector("table")
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(200)
    check("Timesheet: approved leave shows in the grid for the days it covered", "Leave" in page.locator("tbody tr", has_text="Liam Costigan").inner_text(), page.locator("tbody tr", has_text="Liam Costigan").inner_text())

    # ── History
    page.goto(BASE + "/people/history"); page.wait_for_selector("table")
    page.screenshot(path=f"{OUT}/61-history-totals.png")
    tot = data(page, "(() => { const m = day.slice(0,7); const rows = db.attendance.filter(a => a.date.startsWith(m) && a.personId==='p-101'); return rows.reduce((s,a) => s + (a.status==='full'?8:4) + a.overtimeHours*1.5, 0) })()")
    row = page.locator("tbody tr", has_text="Fergal Noone").inner_text()
    check("History: paid hours for Fergal Noone match his entries", f"{tot:g}" in row.replace(",", ""), (tot, row))
    page.get_by_role("tab", name="Corrections").click(); page.wait_for_timeout(200)
    check("History: the correction is listed with its reason", "Left at lunch, van breakdown" in main.inner_text())
    page.get_by_role("tab", name="Day by day").click(); page.wait_for_timeout(200)
    check("History: day by day lists entries", page.locator("tbody tr").count() > 50, page.locator("tbody tr").count())

    # ── Employee register
    page.goto(BASE + "/people"); page.wait_for_selector("table")
    check("Register: 42 active people listed", page.locator("tbody tr").count() == 42, page.locator("tbody tr").count())
    page.screenshot(path=f"{OUT}/62-register.png")
    page.get_by_role("button", name="Add employee").click()
    dlg = page.locator("dialog[open]")
    dlg.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Register: name and phone are required", "Name and phone number are needed" in dlg.inner_text())
    dlg.get_by_label("Name").fill("Niall Cafferkey"); dlg.get_by_label("Phone number").fill("087 555 0199")
    dlg.get_by_label("Trade").select_option("Leadworker")
    dlg.locator("button[type=submit]").click(); page.wait_for_timeout(250)
    check("Register: new employee appears with trade and email", page.locator("tbody tr", has_text="Niall Cafferkey").count() == 1 and data(page, "db.people.find(p=>p.name==='Niall Cafferkey').email").startswith("niall.cafferkey@"))
    page.locator("tbody tr", has_text="Fergal Noone").click(); page.wait_for_timeout(200)
    check("Register: a person's page shows tickets and rate", "Training tickets" in page.locator("dialog[open]").inner_text() and "Hourly rate" in page.locator("dialog[open]").inner_text())
    page.locator("dialog[open]").get_by_role("button", name="Archive employee").click(); page.wait_for_timeout(250)
    check("Register: archiving removes them from the list and from site rosters", page.locator("tbody tr", has_text="Fergal Noone").count() == 0 and data(page, "db.assignments.filter(a => a.personId==='p-101').length") == 0)
    page.get_by_role("switch", name="Show archived employees").click(); page.wait_for_timeout(200)
    check("Register: archived list holds them with history kept", page.locator("tbody tr", has_text="Fergal Noone").count() == 1 and data(page, "db.attendance.filter(a => a.personId==='p-101').length") > 10)

    # ── Training tickets
    # Moved to Compliance, Personnel on 18 Nov; the old address lands there.
    page.goto(BASE + "/people/certs"); page.wait_for_url("**/compliance/personnel?view=list"); page.wait_for_selector("table")
    page.goto(BASE + "/compliance?area=personnel"); page.wait_for_selector("table")
    n_att = page.locator("tbody tr").count()
    check("Tickets: the ones that need attention are listed in Compliance, soonest first", n_att >= 9 and page.locator("tbody tr", has_text="Kevin Shortall").count() == 1, (n_att, main.inner_text()[:160]))
    page.screenshot(path=f"{OUT}/63-tickets.png")
    page.locator("tbody tr", has_text="Kevin Shortall").get_by_role("button", name="Renew").click()
    dlg = page.locator("dialog[open]")
    check("Tickets: the renewal asks for proof and warns when there is none", "No copy attached yet" in dlg.inner_text() and dlg.get_by_role("button", name="Take a photo", exact=True).count() == 1 and dlg.get_by_role("button", name="Choose a file", exact=True).count() == 1)
    dlg.get_by_label("Choose a proof from this device").set_input_files(FIX + "card.png"); page.wait_for_timeout(500)
    check("Tickets: the chosen file is named and the warning goes", "card.png" in dlg.inner_text() and "No copy attached yet" not in dlg.inner_text())
    dlg.get_by_role("button", name="Save renewal").click(); page.wait_for_timeout(300)
    check("Tickets: a renewal with proof clears it from the attention list", page.locator("tbody tr").count() == n_att - 1 and page.locator("tbody tr", has_text="Kevin Shortall").count() == 0)
    kev = data(page, "(() => { const c = db.people.find(p=>p.name==='Kevin Shortall').certs.find(c=>c.name.startsWith('Scaffolding')); return [c.proof.name, c.proof.addedBy, c.proof.dataUrl.slice(0,15), !!c.proofNeeded] })()")
    check("Tickets: the proof is kept against the ticket with who attached it", kev == ["card.png", "Aidan King", "data:image/jpeg", False], kev)

    # ── Holidays: approving leave clears planned days
    page.goto(BASE + "/people/holidays"); page.wait_for_selector("table")
    planned_before = data(page, "(() => { const h = db.holidays.find(h => h.id==='hol-1'); return db.plan.filter(p => p.personId===h.personId && p.date>=h.from && p.date<=h.to).length })()")
    check("Holidays: request shows it clashes with planned days", planned_before > 0 and "already planned" in page.locator("tbody tr", has_text="Sinéad Colgan").inner_text(), planned_before)
    page.screenshot(path=f"{OUT}/64-holidays.png")
    page.locator("tbody tr", has_text="Sinéad Colgan").get_by_role("button", name="Approve").click(); page.wait_for_timeout(250)
    planned_after = data(page, "(() => { const h = db.holidays.find(h => h.id==='hol-1'); return [h.status, db.plan.filter(p => p.personId===h.personId && p.date>=h.from && p.date<=h.to).length] })()")
    check("Holidays: approving takes those days off the plan", planned_after == ["Approved", 0], planned_after)

    # ── Week ahead, by site
    page.goto(BASE + "/schedule"); page.wait_for_selector("table")
    page.screenshot(path=f"{OUT}/65-week-ahead.png")
    check("Week ahead: one block per running site", page.locator("section table").count() >= 7, page.locator("section table").count())
    check("Week ahead: the double booking is called out and blocks sending", "1 double booking" in main.inner_text() and "Ionuț Marin is on" in main.inner_text() and page.get_by_role("button", name="Send week to operatives").is_disabled())
    check("Week ahead: approved leave shows as Leave on the grid and cannot be planned over", page.locator("tr", has_text="Cormac Hession").locator("text=Leave").count() == 5 and page.locator("tr", has_text="Cormac Hession").locator("button[aria-pressed]").count() == 0, page.locator("tr", has_text="Cormac Hession").first.inner_text())
    clash_btn = page.locator("button", has_text="Clash: ").first
    fits = clash_btn.evaluate("b => b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().height <= 34")
    check("Week ahead: the clash cell fits on one line inside its button", fits and clash_btn.inner_text().startswith("Clash: C7"), clash_btn.inner_text())
    clash_btn.click(); page.wait_for_timeout(250)
    check("Week ahead: clicking a planned day opens the day planner with the site fixed", "Ionuț Marin" in page.locator("dialog[open]").last.inner_text() and page.locator("dialog[open]").last.locator("select").count() == 0)
    page.locator("dialog[open]").last.get_by_role("button", name="Take off this day").click(); page.wait_for_timeout(250)
    check("Week ahead: taking him off one site clears the clash", "double booking" not in main.inner_text())
    # People whose Safe Pass or trade ticket has run out by a day they are planned (Compliance, 18 Nov).
    check("Week ahead: people planned who cannot work are named, and still hold the week back", "planned who cannot work" in main.inner_text() and "Tomás Breslin: Safe Pass ran out" in main.inner_text() and page.get_by_role("button", name="Send week to operatives").is_disabled())
    while page.locator("button", has_text="Cannot work").count() > 0:
        page.locator("button", has_text="Cannot work").first.click(); page.wait_for_timeout(120)
        page.locator("dialog[open]").last.get_by_role("button", name="Take off this day").click(); page.wait_for_timeout(120)
    check("Week ahead: with them taken off, the week can be sent", "planned who cannot work" not in main.inner_text() and page.get_by_role("button", name="Send week to operatives").is_enabled())
    block = page.locator("section", has=page.get_by_role("link", name="C725 Granary Quay Warehouses"))
    before = data(page, "db.plan.filter(p => p.projectId==='pr-C725').length")
    block.get_by_label("Trade to add to C725").select_option("General operative"); page.wait_for_timeout(150)
    sean = data(page, "db.people.find(p=>p.name==='Seán Dunphy').id")
    opt = block.get_by_label("Person to add to C725").locator(f"option[value='{sean}']").inner_text()
    check("Week ahead: the person picker says where he already is", opt.startswith("Seán Dunphy: on C") and "all week" in opt, opt)
    block.get_by_label("Person to add to C725").select_option(sean); page.wait_for_timeout(150)
    check("Week ahead: picking someone with no free day warns about double booking", "double books" in block.inner_text() and block.get_by_role("button", name="Plan for the week").count() == 0, block.inner_text()[-200:])
    block.get_by_role("button", name="Plan anyway").click(); page.wait_for_timeout(250)
    after = data(page, "db.plan.filter(p => p.projectId==='pr-C725').length")
    check("Week ahead: planning someone for the week adds five days", after - before == 5, (before, after))
    check("Week ahead: that creates a new clash with his other site", "double booking" in main.inner_text())
    for b in block.locator("tr", has_text="Seán Dunphy").locator("button[aria-pressed]").all():
        b.click(); page.wait_for_timeout(120)
        page.locator("dialog[open]").last.get_by_role("button", name="Take off this day").click(); page.wait_for_timeout(120)
    check("Week ahead: unticking his days clears it again", "double booking" not in main.inner_text())
    page.get_by_role("button", name="Send week to operatives").click(); page.wait_for_timeout(250)
    check("Week ahead: sending is confirmed and logged", "sent to" in page.locator("[aria-live=polite]").last.inner_text() and data(page, "db.activity[0].what") == "Sent the week ahead to operatives")
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(250)
    check("Week ahead: the current week shows actual attendance for days gone", "Full" in main.inner_text())
    page.screenshot(path=f"{OUT}/66-week-ahead-current.png")

    # ── Month ahead and who is where
    page.goto(BASE + "/schedule/month"); page.wait_for_selector("table"); page.screenshot(path=f"{OUT}/67-month-ahead.png")
    check("Month ahead: a column per working day, a row per site, three total rows", page.locator("thead th").count() >= 20 and page.locator("tfoot tr").count() == 3, page.locator("thead th").count())
    page.goto(BASE + "/schedule/today"); page.wait_for_selector("table"); page.screenshot(path=f"{OUT}/68-who-is-where.png")
    check("Who is where: every active operative is listed once", page.locator("tbody tr").count() == data(page, "db.people.filter(p => p.active && p.kind==='Operative').length"), page.locator("tbody tr").count())
    check("Who is where: the archived employee is not listed", page.locator("tbody tr", has_text="Fergal Noone").count() == 0)

    # ── Roles
    as_role(page, "Site manager")
    check("Site manager: lands on the timesheet", "/people/timesheet" in page.url, page.url)
    opts = [o.inner_text() for o in page.get_by_label("Site", exact=True).locator("option").all()]
    check("Site manager: timesheet offers only his own live sites", all(o.startswith(("C719", "C724")) for o in opts) and len(opts) == 2, opts)
    page.goto(BASE + "/schedule"); page.wait_for_selector("table")
    check("Site manager: week ahead is read only, with no send button", page.get_by_role("button", name="Send week to operatives").count() == 0 and page.locator("button[aria-pressed]:not([disabled])").count() == 0)
    page.goto(BASE + "/people"); page.wait_for_selector("table")
    check("Site manager: hourly rates are hidden on the register", "Hourly rate" not in page.locator("thead").inner_text())

    # ── Dark and phone
    as_role(page, "Managing director")
    page.goto(BASE + "/people/timesheet?site=pr-C719"); page.wait_for_selector("table")
    head = page.locator("main").inner_text()
    marked, listed = data(page, "(() => { const ids = new Set(db.assignments.filter(a=>a.projectId==='pr-C719').map(a=>a.personId).filter(id=>db.people.find(p=>p.id===id).active)); return [db.attendance.filter(a=>a.projectId==='pr-C719' && a.date===day && ids.has(a.personId)).length, ids.size]; })()")
    check("Timesheet: after someone is archived the count covers only people still on the list", f"{marked} of {listed} marked for today" in head and listed == 4 and f"{marked + 1} of {listed}" not in head, head[:200])
    page.get_by_role("button", name="Switch to dark mode").click()
    page.goto(BASE + "/schedule"); page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/69-week-ahead-dark.png")
    page.goto(BASE + "/people/timesheet"); page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/70-timesheet-dark.png")
    page.get_by_role("button", name="Switch to light mode").click()
    page.set_viewport_size({"width": 390, "height": 844})
    for path, shot in [("/people/timesheet", "71-timesheet-mobile"), ("/schedule", "72-week-ahead-mobile"), ("/compliance/personnel", "73-tickets-mobile")]:
        page.goto(BASE + path); page.wait_for_timeout(400); page.screenshot(path=f"{OUT}/{shot}.png")
        check(f"Phone width: page itself does not scroll sideways on {path}", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

errs = []
try:
    errs = run(steps)
except Exception as ex:
    print("STOPPED EARLY:", str(ex).split("\n")[0][:300])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail[:260]}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
