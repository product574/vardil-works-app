import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# Oisin's changes of 17 Nov: the site phone (two kinds, driving check, profile, reimbursements),
# Schedule holidays, attendance per site and last week, the Oldstone call (Sage numbers, payroll
# export, supplier invoice fields and sign-off, purchase export, profitability), Files out of the
# bar, and the Ask AI mark. The week ahead grid is in m3_check and m3b_check.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(400)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(500)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── Bar and Ask AI
    bar = [t.strip().split("\n")[-1] for t in page.locator("nav[aria-label='Departments'] a").all_inner_texts()]
    check("Bar: Files is out of the bar", "Files" not in bar and "Plant" in bar, bar)
    go(page, "/projects/C720?tab=files")
    check("Files: a project's own Files tab still works", page.get_by_role("tab", name="Files").count() + page.get_by_role("link", name="Files").count() >= 1)
    ask = page.get_by_role("button", name="Ask AI")
    check("Ask AI: the button carries the sparkle mark", ask.locator("svg").count() == 1 and ask.inner_text().strip() == "Ask AI")
    ask.click(); page.wait_for_timeout(300)
    check("Ask AI: the question box says AI Assistant in faded text", page.get_by_label("Your question").get_attribute("placeholder") == "AI Assistant")
    page.get_by_role("button", name="Close Ask AI").click()

    # ── Team chat
    go(page, "/chat")
    nb = page.get_by_role("button", name="New message")
    check("Team chat: the New message button has words and a plus in a circle", nb.count() == 1 and nb.inner_text().strip() == "New message" and nb.locator("svg").count() == 1)

    # ── Schedule: holidays
    side = page.locator("nav[aria-label$='screens']:visible")
    go(page, "/schedule/holidays")
    check("Schedule: Holidays and Holiday requests are in the sidebar", page.get_by_role("link", name="Holidays").count() >= 1 and page.get_by_role("link", name=re.compile("^Holiday requests")).count() >= 1)
    t = main.inner_text()
    check("Holidays: who is off today, coming up and back recently", "Off today" in t and "Coming up" in t and page.locator("tbody tr").count() >= 2, t[:300])
    go(page, "/schedule/holiday-requests")
    reqs = page.get_by_role("list", name="Holiday requests", exact=True).locator("> li")
    n0 = reqs.count()
    check("Holiday requests: every request waiting, with days, clashes and who else is off", n0 == 3 and "working day" in main.inner_text() and "already planned on" in main.inner_text() and "Also off then" in main.inner_text(), main.inner_text()[:400])
    page.screenshot(path=f"{OUT}/300-holiday-requests.png", full_page=True)
    first = reqs.first.locator("h2").inner_text()
    reqs.first.get_by_role("button", name="Approve").click(); page.wait_for_timeout(300)
    check("Holiday requests: approving takes it off the list and approves the leave", reqs.count() == n0 - 1 and data(page, f"db.holidays.find(h => db.people.find(p => p.id===h.personId).name==={first!r}).status") == "Approved")
    # 17 Nov: Decline asks for an optional note first (s7_check.py covers the note itself).
    reqs.first.get_by_role("button", name="Decline").click(); page.wait_for_timeout(200)
    page.locator("dialog[open]").get_by_role("button", name="Decline leave").click(); page.wait_for_timeout(300)
    check("Holiday requests: declining too", reqs.count() == n0 - 2)

    # ── Attendance history: period and Per site
    go(page, "/people/history", "table")
    opts = page.get_by_label("Period").locator("option").all_inner_texts()
    check("History: a period box in place of the month buttons, starting with Last week", opts[0].startswith("Last week, ") and "This week so far" in opts and page.get_by_role("button", name="Earlier month").count() == 0, opts)
    page.get_by_label("Period").select_option("last-week"); page.wait_for_timeout(300)
    check("History: last week says so", main.inner_text().startswith("Attendance history") and "Last week (" in main.inner_text())
    check("History: payroll totals show basic, overtime and total hours, no paid hours", "Basic hours" in page.locator("thead").inner_text() and "Paid hours" not in page.locator("thead").inner_text())
    page.get_by_role("tab", name="Per site").click(); page.wait_for_timeout(300)
    tables = page.locator("table[aria-label*=', last week']")
    heads = main.locator("section h2").all_inner_texts()
    check("Per site: a heading per site with code and name, then the people, like the plant overview", tables.count() >= 6 and all(re.match(r"C7\d\d ", h) for h in heads), heads)
    total = data(page, "(() => { const d = new Date(day+'T12:00:00Z'); const dow = d.getUTCDay() || 7; const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow - 6); const days = []; for (let i=0;i<5;i++){ const x = new Date(mon); x.setUTCDate(mon.getUTCDate()+i); days.push(x.toISOString().slice(0,10)) } return db.attendance.filter(a => days.includes(a.date)).reduce((n,a) => n + (a.status==='full'?1:0.5), 0) })()")
    num = lambda t: 0.0 if t.strip() == "-" else float(t.replace(",", ""))
    # Each row: name and trade, full days, half days, basic hours, overtime hours, total hours (17 Nov, later).
    shown = sum(num(t.split("\t")[1]) + num(t.split("\t")[2]) / 2 for t in main.locator("table[aria-label*=', last week'] tbody tr").all_inner_texts())
    check("Per site: the days add up to last week's attendance", abs(shown - total) < 0.01, (shown, total))
    page.screenshot(path=f"{OUT}/301-history-per-site.png", full_page=True)

    # ── Sage numbers and payroll export
    go(page, "/people", "table")
    check("Register: a Sage no. column, with Aoife Kinsella not in Sage yet", "Sage no." in page.locator("thead").inner_text() and "Not in Sage" in page.locator("tr", has_text="Aoife Kinsella").inner_text())
    go(page, "/people/payroll", "table")
    check("Payroll: last week by default, not exported yet, Aoife left out until she has a Sage number", "Not exported yet" in main.inner_text() and "Aoife Kinsella: no Sage number" in main.inner_text(), main.inner_text()[:400])
    pre = page.locator("pre").inner_text()
    check("Payroll: the file has hours only, matched on Sage numbers", pre.startswith("Employee No,Surname,Forename,Period end,Basic hours,Overtime hours") and "Kinsella" not in pre and re.search(r"\n00\d\d,", pre))
    # Since 17 Nov a manager checks the week before it can be exported (s8_check.py covers that).
    page.get_by_role("button", name="Mark the week as checked").click(); page.wait_for_timeout(300)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Export hours to Sage Payroll").click()
    page.wait_for_timeout(300)
    check("Payroll: export downloads the file and records the week", re.match(r"sage-payroll-hours-week-ending-\d{4}-\d\d-\d\d\.csv", dl.value.suggested_filename) and "Exported" in main.inner_text() and page.get_by_role("button", name="Export again").count() == 1, dl.value.suggested_filename)
    go(page, "/people?person=p-129")
    dlg = page.locator("dialog[open]")
    dlg.get_by_role("button", name="Add").first.click(); dlg.get_by_label("Sage employee number").fill("0031"); dlg.get_by_role("button", name="Save").click(); page.wait_for_timeout(300)
    check("Register: a Sage number can be added in the person's box", data(page, "db.people.find(p=>p.id==='p-129').sageNo") == "0031")
    go(page, "/people/payroll", "table")
    check("Payroll: with her number added nobody is left out", "left out" not in main.inner_text() and "0031,Kinsella,Aoife" in page.locator("pre").inner_text())
    as_role(page, "Contracts manager")
    go(page, "/people/payroll", "table")
    check("Payroll: a contracts manager sees the week but cannot export", page.get_by_role("button", name=re.compile("Export")).count() == 0)
    as_role(page, "Managing director")

    # ── Supplier invoices: Sage fields, sign-off, purchase export
    go(page, "/admin")
    sec = main.locator("section", has_text="Supplier invoices over")
    check("Admin: supplier invoices over the limit wait for the director", sec.locator("tbody tr").count() == 2)
    check("Admin: two reimbursements wait too", main.locator("section", has_text="Reimbursements").locator("tbody tr").count() == 2)
    sec.locator("tbody a").first.click(); page.wait_for_timeout(500)
    fa = main.locator("section", has_text="For Sage 50")
    check("Supplier invoice: the Sage fields are filled in (account, nominal, department, tax code, file number)", fa.count() == 1 and re.search(r"File no\. 11\d\d\d", fa.inner_text()) and re.search(r"\b5\d00\b", fa.inner_text()) and "T1" in fa.inner_text(), fa.inner_text()[:300])
    fa.get_by_role("button", name="Sign off").click(); page.wait_for_timeout(300)
    check("Supplier invoice: the director signs it off there", "Signed off by Aidan King" in fa.inner_text())
    go(page, "/invoicing/export")
    check("Accounts export: one invoice still waits for sign-off", main.locator("section", has_text="Waiting for sign-off (1)").count() == 1)
    pf = page.get_by_label("Purchase file").inner_text()
    check("Accounts export: purchase lines in the Sage 50 layout, the project number as department", pf.startswith("PI,") and re.search(r"^PI,[A-Z]{1,8},5\d00,7\d\d,\d\d/\d\d/\d{4},", pf, re.M), pf[:200])
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download purchase file for Sage 50").click()
    page.wait_for_timeout(300)
    check("Accounts export: the purchase file downloads and nothing ready is left", dl.value.suggested_filename.startswith("purchase-invoices-sage50-") and main.locator("section", has_text="Ready to go (0)").count() == 1)
    go(page, "/invoicing/costs", "table")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download profitability report").click()
    body = open(dl.value.path(), encoding="utf-8").read()
    check("Job costs: the profitability report downloads with valuation, wages, costs, profit and margin", body.startswith("Project,Name,Contract value,Valuation (work done),Wages,Materials") and "Margin %" in body.split("\n")[0] and body.count("\n") >= 6, body[:160])

    # ── Site phone: two kinds of phone
    go(page, "/site")
    check("Site phone: two sign-in options, Operative and Site manager", [t.strip() for t in page.get_by_role("tablist", name="Phone of").get_by_role("tab").all_inner_texts()] == ["Operative", "Site manager"])
    phone = page.get_by_label("Phone screen")
    check("Operative phone: keeps My week, has Make a request, Driving check and a reimbursement", all(phone.get_by_role("button", name=n).count() == 1 for n in ["Send a photo", "Report extra work", "Make a request", "Claim a reimbursement", "Driving check", "My week"]) and phone.get_by_role("button", name="Ask for something").count() == 0)
    # Driving check
    phone.get_by_role("button", name="Driving check").click(); page.wait_for_timeout(250)
    dlg = page.locator("dialog[open]")
    check("Driving check: three sections, ten items, Submit off until done", dlg.locator("legend").count() == 3 and dlg.get_by_role("button", name="OK").count() == 10 and dlg.get_by_role("button", name="Submit check").is_disabled())
    dlg.get_by_label("Vehicle").select_option(index=1)
    for b in dlg.get_by_role("button", name="OK", exact=True).all(): b.click()
    dlg.get_by_role("group", name="Tyres, wheels, wheel nuts, steering and brakes").get_by_role("button", name="Defect").click()
    check("Driving check: a defect needs a note before it can be sent", dlg.get_by_role("button", name="Submit check").is_disabled() and "10/10 checked" in dlg.inner_text())
    dlg.get_by_label("What is wrong?").fill("Nearside front tyre cut")
    dlg.get_by_role("button", name="Submit check").click(); page.wait_for_timeout(300)
    vc = data(page, "db.vehicleChecks[0]")
    check("Driving check: sent with the defect, and logged", vc and vc["defects"] == [{"item": "Tyres, wheels, wheel nuts, steering and brakes", "note": "Nearside front tyre cut"}] and data(page, "db.activity[0].what") == "Reported vehicle defects", vc)
    # Reimbursement
    phone.get_by_role("button", name="Claim a reimbursement").click(); page.wait_for_timeout(250)
    dlg = page.locator("dialog[open]")
    dlg.get_by_role("button", name="Parking and tolls").click()
    amt = dlg.get_by_label("Amount paid"); amt.click(); amt.press("ControlOrMeta+a"); page.keyboard.type("12.5", delay=30)
    dlg.get_by_label("What did you buy?").fill("Parking at the builders' providers")
    dlg.get_by_role("button", name="Send claim").click(); page.wait_for_timeout(300)
    ex = data(page, "db.expenses[0]")
    check("Reimbursement: claimed with kind, amount and site, waiting", ex["kind"] == "Parking and tolls" and ex["amount"] == 12.5 and ex["status"] == "Waiting" and ex["projectId"], ex)
    # Profile
    page.get_by_role("button", name="My profile").click(); page.wait_for_timeout(250)
    dlg = page.locator("dialog[open]")
    check("Profile: top left of the phone, with details, tickets and the claim", "Phone" in dlg.inner_text() and "Tickets" in dlg.inner_text() and dlg.get_by_role("list", name="My reimbursements").count() == 1)
    dlg.get_by_role("button", name="Request holidays").click()
    dlg.get_by_label("Reason (optional)").fill("Wedding at home")
    dlg.get_by_role("button", name="Send request").click(); page.wait_for_timeout(300)
    h = data(page, "db.holidays[0]")
    check("Profile: a holiday request goes to the office as Requested", h["status"] == "Requested" and h["note"] == "Wedding at home" and "Waiting" in dlg.get_by_role("list", name="My holidays").inner_text(), h)
    page.screenshot(path=f"{OUT}/302-phone-profile.png")
    dlg.get_by_role("button", name="Sign out").click(); page.wait_for_timeout(400)
    check("Profile: Sign out goes back to the sign-in choice", "/who" in page.url, page.url)
    page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    go(page, "/schedule/holiday-requests")
    check("Holiday requests: the one from the phone is waiting", "Wedding at home" in main.inner_text())
    go(page, "/admin")
    r = main.locator("section", has_text="Reimbursements")
    check("Admin: the phone claim is there", "Parking at the builders' providers" in r.inner_text())
    r.get_by_role("button", name=re.compile("^Approve: reimbursement")).first.click(); page.wait_for_timeout(300)
    check("Admin: approving a reimbursement records who said yes", data(page, "db.expenses.filter(x => x.status==='Approved' && x.decidedBy==='Aidan King').length") == 3)

    # Site manager phone
    go(page, "/site")
    page.get_by_role("tab", name="Site manager").click(); page.wait_for_timeout(300)
    jobs = page.get_by_role("list", name="My jobs").get_by_role("button")
    check("Site manager phone: opens on the jobs he runs", jobs.count() >= 1 and "on site today" in jobs.first.inner_text())
    jobs.first.click(); page.wait_for_timeout(250)
    phone = page.get_by_label("Phone screen")
    names = ["Timesheet", "Week ahead", "Month ahead", "Site instructions", "Requests from the crew", "Send a photo", "Report extra work", "Make a request"]
    check("Site manager phone: a job has timesheet, week, month, instructions, crew requests, photo, extra, Make a request, and no My week", all(phone.get_by_role("button", name=n).count() == 1 for n in names) and phone.get_by_role("button", name="My week").count() == 0 and phone.get_by_role("button", name="Ask for something").count() == 0)
    phone.get_by_role("button", name="Make a request").click(); page.wait_for_timeout(200)
    check("Site manager phone: the request sheet is called Make a request", page.locator("dialog[open] h2").inner_text() == "Make a request")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    phone.get_by_role("button", name="Month ahead").click(); page.wait_for_timeout(200)
    check("Site manager phone: month ahead shows a count per working day", page.locator("dialog[open] ul[aria-label^='Week of']").count() >= 4)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    phone.get_by_role("button", name="All my jobs").click(); page.wait_for_timeout(200)

    # As the site manager himself: his own phone, timesheet and planning
    as_role(page, "Site manager")
    go(page, "/site")
    check("Site manager signed in: his own phone, with no one else to pick", page.get_by_label("Site manager to view the phone as").count() == 0 and page.get_by_role("tab", name="Site manager").get_attribute("aria-selected") == "true")
    jobs = page.get_by_role("list", name="My jobs").get_by_role("button")
    check("Site manager signed in: Eoin's two jobs", [t.split("\n")[0] for t in jobs.all_inner_texts()] == ["C719 St Finian's Church", "C724 Derrybawn Bridge"], jobs.all_inner_texts())
    jobs.first.click(); page.wait_for_timeout(250)
    page.get_by_label("Phone screen").get_by_role("button", name="Timesheet").click(); page.wait_for_timeout(250)
    dlg = page.locator("dialog[open]")
    people = dlg.get_by_role("list", name="People on site today").locator("> li")
    first = people.first.locator("p span").first.inner_text()
    if people.first.get_by_role("tab", name="Half").count():
        people.first.get_by_role("tab", name="Half").click(); page.wait_for_timeout(200)
        a = data(page, f"db.attendance.find(a => a.projectId==='pr-C719' && a.date===day && db.people.find(p=>p.id===a.personId).name==={first!r})")
        check("Phone timesheet: marking a half day saves it, by him", a and a["status"] == "half" and a["savedBy"] == "Eoin Brosnan", a)
        dlg.get_by_role("button", name="Send today's time stamps").click(); page.wait_for_timeout(300)
        check("Phone timesheet: sending locks the day", data(page, "db.attendance.filter(a => a.projectId==='pr-C719' && a.date===day && !a.sent).length") == 0)
    else:
        check("Phone timesheet: today was already sent for C719, shown read only", "sent" in dlg.inner_text())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    page.get_by_label("Phone screen").get_by_role("button", name="Week ahead").click(); page.wait_for_timeout(250)
    dlg = page.locator("dialog[open]")
    # Later the same day (Oisin): the phone only shows the plan and asks for people; s4_check covers asking.
    check("Phone week ahead: shows the plan with nothing to edit, and a request button per day", dlg.locator("select[aria-label^='Add someone']").count() == 0 and dlg.locator("button[aria-label^='Take ']").count() == 0 and dlg.get_by_role("button", name=re.compile("^Request someone for")).count() == 5)
    page.keyboard.press("Escape")

    # Phone width
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(300)
    for path in ["/site", "/schedule", "/schedule/holiday-requests"]:
        go(page, path)
        check(f"Phone width: {path} does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    as_role(page, "Managing director")
    page.set_viewport_size({"width": 390, "height": 844})
    for path in ["/people/payroll", "/invoicing/export"]:
        go(page, path)
        check(f"Phone width: {path} does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

errs = []
try:
    errs = run(steps)
except Exception as ex:
    import traceback; traceback.print_exc()
    print("STOPPED EARLY:", str(ex).split("\n")[0][:300])
ok = 0
for name, passed, detail in results:
    if passed: ok += 1
    else: print("FAIL", name, " ", detail[:300])
print("console problems:", errs)
print(f"{ok}/{len(results)} passed")
