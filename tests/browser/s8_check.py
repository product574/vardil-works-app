import os, re, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, phone_of, show_phone, FIX, open_last_week, pick_phone, pick_phone_id, unlock

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

    # ── 1. Fleet: since 18 Nov a department of its own, from the Secure-All build (s11_check.py)

    # ── 2. Payroll: a manager's check, then the export by hand
    go(page, "/people/payroll", "table"); open_last_week(page)
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
    go(page, "/dashboard"); open_last_week(page)
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
    main.locator("section", has=page.get_by_role("heading", name=re.compile(r"^Reimbursements \("))).get_by_role("button", name=re.compile("^Approve: reimbursement for Cathal Minogue")).click(); page.wait_for_timeout(300)
    # Since 19 Nov an approved claim is marked paid in Admin itself, under Reimbursements to pay.
    check("Admin: approving a reimbursement puts it on the list to pay, and says so", "Mark it paid below" in toast(page) and main.get_by_role("heading", name=re.compile(r"^Ready to be paid")).count() == 1, toast(page))
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
    go(page, "/site"); unlock(page)
    show_phone(page, "manager")
    pick_phone(page, "Cathal Minogue"); page.wait_for_timeout(300)
    phone_of(page, "manager").get_by_role("button", name="Me", exact=True).click(); page.wait_for_timeout(250)
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

    # ── 5. Invoicing: which way each invoice goes (merged 19 Nov: this copy's Invoicing, whose groups are Money in and Money out)
    go(page, "/invoicing", "main h1")
    side = page.get_by_role("navigation", name="Invoicing screens")
    st = side.inner_text()
    check("Invoicing: the sidebar says which invoices bring money in and which take it out", st.index("Money in") < st.index("Client invoices") < st.index("Money out") < st.index("Supplier invoices") < st.index("Subcontractor invoices") < st.index("Sage export"), st)
    go(page, "/invoicing/supplier", "main h1")
    check("Invoicing: Supplier invoices is the firm's to pay", "Supplier invoices" in main.locator("h1").inner_text())

    # ── Roles: the new permission
    go(page, "/admin/access", "table")
    grid = page.get_by_role("table", name="What each level can see, do and open")
    state = lambda name: grid.get_by_role("checkbox", name=name, exact=True).get_attribute("aria-checked")
    check("Roles: checking the week's hours is a permission of its own, a manager's by default", grid.locator("tr[data-group=permission]").count() == 19 and state("Contracts manager: Check the week's hours for payroll") == "true" and state("Accounts: Check the week's hours for payroll") == "false" and state("Accounts: Export hours and reimbursements for payment") == "true" and state("Contracts manager: Export hours and reimbursements for payment") == "false")

    # ── Phone width and dark mode
    page.set_viewport_size({"width": 390, "height": 800})
    for path, sel in [("/people/payroll", "table"), ("/people/reimbursements", "main h1"), ("/people/timesheet", "table")]:
        go(page, path, sel)
        w = page.evaluate("document.documentElement.scrollWidth")
        check(f"Phone width: {path} does not scroll the page sideways", w <= 391, w)
    page.set_viewport_size({"width": 1440, "height": 900})
    page.get_by_role("button", name=re.compile("dark|Dark")).first.click(); page.wait_for_timeout(300)
    go(page, "/people/payroll", "table"); page.screenshot(path=f"{OUT}/806-payroll-dark.png")
    check("Dark mode: on", page.evaluate("document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'"))
    page.get_by_role("button", name=re.compile("light|Light")).first.click(); page.wait_for_timeout(200)

if __name__ == "__main__":
    errors = []
    try:
        errors = run(steps)
    except Exception as e:
        print("STOPPED EARLY:", str(e)[:600]); import traceback; traceback.print_exc()
    for name, ok, detail in results:
        print(("ok   " if ok else "FAIL ") + name + ("" if ok else "   " + detail[:500]))
    print("console problems:", errors)
    print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
