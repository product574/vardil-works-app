import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, phone_of, show_phone

# Round ten, 17 Nov (decisions 108 to 116): overtime claimed from the operative's phone and
# answered by the site manager, the Overtime list under the timesheet, the site manager's phone
# timesheet for any day back to last Monday week, My hours on the operative's phone, the month
# in whole weeks, Attendance history per site first, bank holidays blocked as normal days, and
# Profitability with invoices and net profit for finished jobs.
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
SCROLLS = "[...document.querySelectorAll('main *')].filter(e => e.tagName !== 'NAV' && !e.className.includes?.('truncate') && !e.className.includes?.('sr-only') && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible').length"

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    reset(page)
    pid = lambda code: data(page, f"db.projects.find(p => p.code === '{code}').id")
    name = lambda id: data(page, f"db.people.find(p => p.id === '{id}').name")

    # ── 1. Timesheet: Add someone at the top, and the Overtime list
    go(page, f"/people/timesheet?site={pid('C724')}", "table")
    add = main.get_by_label("Add someone to this site")
    grid = main.get_by_role("table").first
    check("Timesheet: Add someone to this site sits at the top of the week's table", add.count() == 1 and add.bounding_box()["y"] < grid.bounding_box()["y"] and add.bounding_box()["y"] > main.get_by_role("region", name="Overtime rates").bounding_box()["y"])
    check("Timesheet: the sidebar counts the overtime claims waiting", page.get_by_role("navigation", name="People screens").get_by_role("link", name=re.compile("^Timesheet")).inner_text().strip().endswith("2"))
    sec = main.locator("section", has=page.get_by_role("heading", name="Overtime", exact=True))
    check("Timesheet: the list under the grid is called Overtime, and the old name is gone", sec.count() == 1 and page.get_by_role("heading", name="Weekend and bank holidays").count() == 0)
    waiting = sec.get_by_role("list", name="Overtime claims to answer").locator("> li")
    claim = data(page, "db.overtimeClaims.find(c => c.id === 'oc-4')")
    who = name(claim["personId"])
    check("Timesheet: a claim from the phone waits in the Overtime list with its hours and note", waiting.count() == 1 and who in waiting.first.inner_text() and "2 extra hours" in waiting.first.inner_text() and "traffic lights" in waiting.first.inner_text(), waiting.all_inner_texts())
    add.select_option(label="Kevin Shortall, Scaffolder"); main.get_by_role("button", name="Add to site").click(); page.wait_for_timeout(300)
    check("Timesheet: adding from the top puts them on the grid", grid.locator("tbody tr").filter(has_text="Kevin Shortall").count() == 1 and "Kevin Shortall added to C724" in toast(page))
    waiting.first.get_by_role("button", name=re.compile("^Approve")).click(); page.wait_for_timeout(300)
    d = dlg()
    check("Approve: starts from the hours claimed, at time and a half on a normal day", d.get_by_label("Hours at time and a half").input_value() == "2" and d.get_by_label("Hours at double time").input_value() == "0" and "On the timesheet that day: Full" in d.inner_text())
    d.get_by_label("Hours at time and a half").fill("1.5"); d.get_by_role("button", name="Approve and add to the timesheet").click(); page.wait_for_timeout(400)
    row = data(page, f"db.attendance.find(a => a.projectId === '{claim['projectId']}' && a.personId === '{claim['personId']}' && a.date === '{claim['date']}')")
    check("Approve: the hours approved go on that day, as a correction", row["overtimeHours"] == 1.5 and data(page, "db.overtimeClaims.find(c => c.id === 'oc-4').status") == "Approved" and data(page, "db.attendanceChanges[0].reason").startswith("Overtime claim approved"), row)
    ot = sec.get_by_role("table", name="Overtime in this week").locator("tbody tr")
    check("Overtime list: the approved claim is listed, saying where it came from", ot.filter(has_text=who).filter(has_text="Claimed from the phone, approved by Aidan King").filter(has_text="1.5h x1.5").count() == 1, ot.all_inner_texts())
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(400)
    kinds = " ".join(ot.all_inner_texts())
    check("Overtime list: all overtime in the week, weekday hours from the grid and weekend time stamps alike", "Marked on the timesheet" in kinds and "Overtime time stamp" in kinds and "7.5h x1.5 + 1.5h x2" in kinds and sec.locator("tfoot").count() == 1, kinds[:300])
    page.screenshot(path=f"{OUT}/1000-timesheet-overtime-list.png", full_page=True)

    # ── 2. The operative's phone: My hours, and claiming
    go(page, "/site")
    page.get_by_label("Operative to view the phone as").select_option(claim["personId"]); page.wait_for_timeout(300)
    phone = phone_of(page, "operative")
    if page.get_by_role("tab", name="English").count(): page.get_by_role("tab", name="English").click(); page.wait_for_timeout(200)
    phone.get_by_role("button", name=re.compile("My hours and overtime")).click(); page.wait_for_timeout(400)
    d = dlg()
    last = d.get_by_role("region", name="Last week") if d.get_by_role("region", name="Last week").count() else d.locator("section[aria-label='Last week']")
    check("My hours: this week so far and last week, day by day, with totals", d.locator("section[aria-label='This week so far']").count() == 1 and last.count() == 1 and "in all:" in last.inner_text() and "basic" in last.inner_text())
    check("My hours: the approved claim shows, with the hours added to that day", "Approved by Aidan King: 1.5h x1.5" in d.inner_text() and "plus 1.5h at time and a half" in d.inner_text(), d.inner_text()[:500])
    check("My hours: hours only, no money", "€" not in d.inner_text())
    d.get_by_role("button", name="Claim overtime", exact=True).click(); page.wait_for_timeout(300)
    c = dlg()
    days = c.get_by_label("Day").locator("option").all_inner_texts()
    check("Claim: today and the seven days before it", len(days) == 8 and days[0].startswith("Today"), days)
    c.get_by_label("Extra hours").fill("0"); c.get_by_role("button", name="Send claim").click(); page.wait_for_timeout(200)
    check("Claim: hours are needed", "Enter the extra hours" in c.get_by_role("alert").inner_text())
    c.get_by_label("Day").select_option(claim["date"]); c.get_by_label("Site").select_option(pid("C724")); c.get_by_label("Extra hours").fill("2.5"); c.get_by_label("What was it for (optional)").fill("Unloaded the stone lorry")
    c.get_by_role("button", name="Send claim").click(); page.wait_for_timeout(400)
    new = data(page, "db.overtimeClaims[0]")
    check("Claim: sent to the site manager in the operative's name", new["hours"] == 2.5 and new["status"] == "Waiting" and new["projectId"] == pid("C724") and "Overtime claim sent to Eoin Brosnan" in toast(page) and data(page, "db.activity[0].who") == who, new)
    page.screenshot(path=f"{OUT}/1001-my-hours.png", full_page=True)
    check("My hours: the new claim says it is waiting", "Waiting for your site manager" in dlg().inner_text())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ── 3. The site manager's phone: claims, and the timesheet for earlier days
    show_phone(page, "manager")
    page.get_by_label("Site manager to view the phone as").select_option(label="Eoin Brosnan"); page.wait_for_timeout(300)
    phone = phone_of(page, "manager")
    card = phone.get_by_role("button", name=re.compile("^C724"))
    check("Manager's phone: the job card says how many overtime claims wait", "1 overtime claim" in card.inner_text(), card.inner_text())
    card.click(); page.wait_for_timeout(300)
    phone.get_by_role("button", name=re.compile("^Overtime claims")).click(); page.wait_for_timeout(300)
    d = dlg()
    cards = d.get_by_role("list", name="Overtime claims to answer").locator("> li")
    check("Manager's phone: the claim with its note, the day's mark and the hours split by the rule", cards.count() == 1 and "Unloaded the stone lorry" in cards.first.inner_text() and "On the timesheet that day" in cards.first.inner_text())
    nm = name(new["personId"])
    cards.first.get_by_label(f"{nm} hours at time and a half").fill("2"); cards.first.get_by_label(f"{nm} hours at double time").fill("0.5")
    cards.first.get_by_role("button", name=re.compile("^Approve")).click(); page.wait_for_timeout(400)
    r = data(page, f"db.attendance.find(a => a.projectId === '{new['projectId']}' && a.personId === '{new['personId']}' && a.date === '{new['date']}')")
    check("Manager's phone: approving with changed hours adds them to that day (1.5 already approved), in his name", r["overtimeHours"] == 3.5 and r.get("doubleHours") == 0.5 and data(page, "db.overtimeClaims[0].decidedBy") == "Eoin Brosnan", r)
    check("Manager's phone: it moves to Answered", "approved, 2h x1.5 + 0.5h x2" in d.get_by_role("list", name="Overtime claims answered").inner_text())
    page.screenshot(path=f"{OUT}/1002-manager-claims.png")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    phone.get_by_role("button", name="Timesheet", exact=True).click(); page.wait_for_timeout(300)
    d = dlg()
    opts = d.get_by_label("Day", exact=True).locator("option").all_inner_texts()
    check("Manager's timesheet: today and back to the Monday of last week", opts[0].startswith("Today") and len(opts) == data(page, "(() => { const d = new Date(day + 'T12:00:00Z'); return ((d.getUTCDay() + 6) % 7) + 1 + 5 })()"), opts)
    d.get_by_label("Day", exact=True).select_option(index=1); page.wait_for_timeout(300)
    lst = d.get_by_role("list", name=re.compile("^People on site"))
    target = lst.locator("> li").filter(has_text="Seán Dunphy")
    check("Manager's timesheet: a sent day shows a Change button", target.get_by_role("button", name=re.compile("^Change Seán Dunphy")).count() == 1 and ", sent" in target.inner_text())
    target.get_by_role("button", name=re.compile("^Change Seán Dunphy")).click(); page.wait_for_timeout(300)
    cd = dlg()
    cd.get_by_label("Should be").select_option("half")
    check("Manager's timesheet: a change needs a reason", cd.get_by_role("button", name="Save correction").is_disabled())
    cd.get_by_label("Reason for the correction").fill("Went to the dentist at lunch"); cd.get_by_role("button", name="Save correction").click(); page.wait_for_timeout(400)
    ch = data(page, "db.attendanceChanges[0]")
    check("Manager's timesheet: the sent day is changed, with who and why kept", ch["to"] == "Half" and ch["by"] == "Eoin Brosnan" and ch["reason"] == "Went to the dentist at lunch", ch)
    check("Manager's timesheet: Add someone to this site is on the phone too", d.get_by_label("Add someone to this site").count() == 1)
    page.screenshot(path=f"{OUT}/1003-manager-timesheet.png")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ── 4. A week gone to payroll is the office's
    lastmon = data(page, "(() => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7); return d.toISOString().slice(0, 10) })()")
    page.evaluate(f"(() => {{ const k = 'cod.data'; const s = JSON.parse(localStorage.getItem(k)); s.state.db.payrollExports.unshift({{ id: 'pay-test', weekStart: '{lastmon}', at: s.state.day + 'T09:00:00', by: 'Maeve Quirke', people: 20, hours: 700 }}); localStorage.setItem(k, JSON.stringify(s)); }})()")
    # Signed in as the site manager himself (Eoin Brosnan), whose access is his own.
    as_role(page, "Site manager")
    go(page, "/site")
    phone = phone_of(page, "manager")
    phone.get_by_role("button", name=re.compile("^C724")).click(); page.wait_for_timeout(300)
    phone.get_by_role("button", name="Timesheet", exact=True).click(); page.wait_for_timeout(300)
    d = dlg(); d.get_by_label("Day", exact=True).select_option(lastmon); page.wait_for_timeout(300)
    check("Payroll lock: once a week is exported, the site manager's phone cannot change it", "gone to payroll" in d.inner_text() and d.get_by_role("button", name=re.compile("^Change ")).count() == 0, d.inner_text()[:300])
    d.get_by_label("Day", exact=True).select_option(index=0); page.wait_for_timeout(300)
    check("Payroll lock: this week is still his to fill in", "gone to payroll" not in d.inner_text())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    go(page, f"/people/timesheet?site={pid('C719')}", "table")
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(300)
    check("Payroll lock: on the desktop a site manager can only read that week", main.get_by_role("table").first.get_by_role("button", name=re.compile("Correct this day")).count() == 0 and "gone to payroll" in main.inner_text())
    as_role(page, "Managing director")
    go(page, f"/people/timesheet?site={pid('C724')}", "table")
    page.get_by_role("button", name="Earlier week").click(); page.wait_for_timeout(300)
    check("Payroll lock: the office (who checks or exports payroll) can still correct it", main.get_by_role("table").first.get_by_role("button", name=re.compile("Correct this day")).count() > 0)

    # ── 5. Declining from the desktop
    go(page, f"/people/timesheet?site={pid('C719')}", "table")
    sec = main.locator("section", has=page.get_by_role("heading", name="Overtime", exact=True))
    w = sec.get_by_role("list", name="Overtime claims to answer").locator("> li")
    check("Desktop: the other sample claim waits on C719", w.count() == 1)
    w.first.get_by_role("button", name=re.compile("^Decline")).click(); page.wait_for_timeout(300)
    d = dlg(); d.get_by_label("Note (optional)").fill("Rain stopped work at four"); d.get_by_role("button", name="Decline claim").click(); page.wait_for_timeout(400)
    check("Desktop: declined with a note, listed under the table, nothing added", data(page, "db.overtimeClaims.find(c => c.id === 'oc-3')")["declineNote"] == "Rain stopped work at four" and "Note: Rain stopped work at four" in sec.inner_text())

    # ── 6. Attendance history opens per site
    go(page, "/people/history", "table")
    check("History: opens laid out per site", page.get_by_role("tablist", name="Attendance layout").get_by_role("tab", name="Per site").get_attribute("aria-selected") == "true" and main.locator("section h2").count() >= 5)

    # ── 7. The month in whole weeks
    go(page, "/schedule/month", "table")
    g = main.get_by_role("table", name=re.compile("^Month ahead"))
    first = data(page, "(() => { const d = new Date(day.slice(0, 7) + '-01T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10) })()")
    heads = g.locator("thead th[data-outside]").all_inner_texts()
    check("Month: whole weeks, with days from the months either side named", g.locator(f"thead th[data-day='{first}']").count() == 1 and any("Oct" in t for t in heads) and any("Dec" in t for t in heads) and "in whole weeks" in main.locator("header").inner_text(), heads[:4])
    page.get_by_role("button", name="Later month").click(); page.wait_for_timeout(500)
    check("Month: Monday 30 November's week is whole in December too", g.locator("thead th[data-day='2026-11-30']").count() == 1 and "Nov" in g.locator("thead th[data-day='2026-11-30']").inner_text())
    check("Month: a bank holiday is overtime only", "Bank holiday: overtime only" in g.locator("thead th[data-day='2026-12-25']").inner_text())

    # ── 8. A bank holiday is never planned as a normal day
    go(page, "/admin/bank-holidays", "table")
    nextmon = data(page, "(() => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7); return d.toISOString().slice(0, 10) })()")
    down = data(page, f"db.plan.filter(p => p.date === '{nextmon}').length")
    main.get_by_label("Date", exact=True).fill(nextmon); main.get_by_label("Name", exact=True).last.fill("Firm closed for the funeral"); main.get_by_role("button", name="Add day").click(); page.wait_for_timeout(400)
    check("Bank holiday: adding one for a day to come takes whoever was down off the plan, and says so", down > 0 and data(page, f"db.plan.filter(p => p.date === '{nextmon}').length") == 0 and f"{down} people were down for a normal day" in toast(page), toast(page))
    go(page, "/schedule", "table")
    cell = main.locator(f"[data-cell='C720 {nextmon}']")
    check("Week ahead: the bank holiday column has no Add and points to Plan overtime work", cell.get_by_role("button", name=re.compile("^Add someone")).count() == 0 and "Plan overtime work" in cell.inner_text(), cell.inner_text())
    sec = main.locator("section", has=page.get_by_role("heading", name="Overtime", exact=True))
    sec.get_by_role("button", name="Plan overtime work").click(); page.wait_for_timeout(300)
    d = dlg()
    check("Plan overtime work: offers the bank holiday beside the weekend", any("Firm closed for the funeral" in o for o in d.get_by_label("Day", exact=True).locator("option").all_inner_texts()) and d.locator("h2").inner_text() == "Plan overtime work")
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    go(page, "/schedule/month", "table")
    page.locator(f"[data-cell='C720 {nextmon}'] button").click(); page.wait_for_timeout(300)
    check("Month ahead: a bank holiday cannot be planned as a normal day", "is a bank holiday, so nobody is planned a normal day on it" in dlg().inner_text() and dlg().get_by_role("button", name=re.compile("^Add to C720")).count() == 0)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ── 9. Profitability: finished jobs with invoices and net profit; no labour allowed
    go(page, "/profit", "table")
    check("Profitability: no labour allowed in the quote anywhere", "allowed in the quote" not in main.inner_text() and "Labour allowed" not in main.inner_text())
    lt = main.get_by_role("table", name="Costs by live site")
    lr = lt.locator("tbody tr").filter(has_text="C719").locator("td").all_inner_texts()
    lnum = lambda t: int(re.sub(r"[^\d-]", "", t.split("\n")[0]) or 0)
    check("Live sites: plant and hire, materials, subcontractors and other as costs so far, adding up to the total", [x.replace("\n", " ") for x in lt.locator("thead th").all_inner_texts()][3:7] == ["Plant and hire", "Materials", "Subcontractors", "Other"] and abs(lnum(lr[1]) + (lnum(lr[2]) if lr[2] != "-" else 0) + sum(lnum(x) for x in lr[3:7]) - lnum(lr[7])) <= 4 and abs(lnum(lr[8]) - lnum(lr[7]) - lnum(lr[9])) <= 2, lr)
    check("Live sites: fits the page", page.evaluate(SCROLLS) == 0)
    main.get_by_role("tablist", name="Which sites").get_by_role("tab", name="Finished").click(); page.wait_for_timeout(400)
    t = main.get_by_role("table", name="Net profit by finished job")
    heads = [x.replace("\n", " ") for x in t.locator("thead th").all_inner_texts()]
    check("Finished: plant and hire, materials, subcontractors and other, then net profit and net profit %", heads == ["Job", "Contract value", "Wages", "Reimbursements", "Plant and hire", "Materials", "Subcontractors", "Other", "Net profit", "Net profit %"], heads)
    r = t.locator("tbody tr").filter(has_text="C711").locator("td").all_inner_texts()
    want = data(page, "(() => { const p = db.projects.find(x => x.code === 'C711'); const o = { plant: 0, material: 0, labour: 0, other: 0 }; for (const s of db.supplierInvoices.filter(s => s.readStatus === 'confirmed')) for (const a of s.allocations.filter(a => a.projectId === p.id)) { const v = (s.docType === 'credit_note' ? -1 : 1) * a.amount; const k = a.category === 'equipment' ? 'plant' : a.category === 'transport' ? 'other' : a.category; o[k] += v; } return [o.plant, o.material, o.labour, o.other].map(Math.round) })()")
    num = lambda t: int(re.sub(r"[^\d-]", "", t.split("\n")[0]) or 0)
    check("Finished: the four invoice columns match the checked invoices posted to the job", [num(x) for x in r[4:8]] == want, (r, want))
    check("Finished: net profit is the value less wages, reimbursements and all four kinds of invoice", abs(num(r[1]) - num(r[2]) - (num(r[3]) if r[3] != "-" else 0) - sum(num(x) for x in r[4:8]) - num(r[8])) <= 4, r)
    check("Finished: a thin profit is pointed out above the table", "net profit under 10% of the contract value" in main.get_by_role("note", name="Jobs to look at").inner_text())
    check("Finished: fits the page", page.evaluate(SCROLLS) == 0)
    page.screenshot(path=f"{OUT}/1004-profit-finished.png", full_page=True)
    t.get_by_role("button", name=re.compile("^C711 ")).click(); page.wait_for_timeout(300)
    check("Finished: a job opens to what it cost, with the net profit", "Net profit:" in dlg().get_by_role("list", name="What the job cost").inner_text())
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # ── Phone width
    page.set_viewport_size({"width": 390, "height": 800})
    for path in [f"/people/timesheet?site={pid('C724')}", "/profit", "/schedule/month"]:
        go(page, path, "table")
        check(f"Phone width: {path.split('?')[0]} does not scroll the page sideways", page.evaluate("document.documentElement.scrollWidth") <= 391)
    go(page, "/site")
    page.get_by_label("Operative to view the phone as").select_option(claim["personId"]); page.wait_for_timeout(300)
    if page.get_by_role("tab", name="English").count(): page.get_by_role("tab", name="English").click(); page.wait_for_timeout(200)
    phone_of(page, "operative").get_by_role("button", name=re.compile("My hours")).click(); page.wait_for_timeout(300)
    check("Phone width: My hours fits", page.evaluate("document.documentElement.scrollWidth") <= 391)
    page.screenshot(path=f"{OUT}/1005-my-hours-phone.png")
    page.set_viewport_size({"width": 1440, "height": 900})

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
