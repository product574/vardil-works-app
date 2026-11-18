import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# Oisin's Schedule round of 17 Nov (decisions 80 to 82): the Month ahead as a grid of names that
# shares its plan with the Week ahead (days gone from the timesheet), with a day box to add
# people, repeat each weekday until a date, and take people off; and Who is where per site.
# The "Here for the rest of the week?" question on the Week ahead is in m3b_check.
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

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
    day = data(page, "day")
    nxt = data(page, "(() => { const out=[]; let d=new Date(day+'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate()+1) } while (d.getUTCDay()!==1); for (let i=0;i<5;i++){ out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1) } return out })()")
    prev = data(page, "(() => { let d=new Date(day+'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate()-1) } while (d.getUTCDay()===0 || d.getUTCDay()===6); return d.toISOString().slice(0,10) })()")
    on = lambda pid, code, date: data(page, f"db.plan.some(p => p.personId==='{pid}' && p.projectId==='pr-{code}' && p.date==='{date}')")

    # ── The grid
    go(page, "/schedule/month", "table")
    grid = page.get_by_role("table", name=re.compile("^Month ahead"))
    region = page.get_by_role("region", name=re.compile("^Month ahead grid"))
    cell = lambda code, date: grid.locator(f"td[data-cell='{code} {date}']")
    heads = grid.locator("thead th")
    n_days = data(page, "new Date(Date.UTC(+day.slice(0,4), +day.slice(5,7), 0)).getUTCDate()")
    # 17 Nov, round nine: a weekend opens out only where someone worked or is down for it. Round
    # ten: the month is shown in whole weeks, Monday of its first week to Sunday of its last.
    span = data(page, "(() => { const y = +day.slice(0,4), m = +day.slice(5,7); const f = new Date(Date.UTC(y, m - 1, 1)); f.setUTCDate(f.getUTCDate() - ((f.getUTCDay() + 6) % 7)); const l = new Date(Date.UTC(y, m, 0)); l.setUTCDate(l.getUTCDate() + (7 - l.getUTCDay()) % 7); return Math.round((l - f) / 864e5) + 1 })()")
    strips = grid.locator("thead th[aria-hidden]").count(); opened = grid.locator("thead th[data-day]", has_text="weekend").count()
    check("Month: a column for every day of the month's whole weeks, weekends greyed and narrow unless worked, and three total rows", heads.count() == span + 1 and span % 7 == 0 and strips + opened == span // 7 * 2 and strips >= 2 and grid.locator("tfoot tr").count() == 3, (heads.count(), span, strips, opened))
    row0 = grid.locator("tbody tr").first.locator("th").inner_text()
    check("Month: each row starts with the site code, name, site manager and dates", re.match(r"C7\d\d\n", row0) is not None and " to " in row0, row0)
    today_th = grid.locator(f"thead th[data-day='{day}']")
    box, reg = today_th.bounding_box(), region.bounding_box()
    check("Month: opens on today's column, right beside the site names", "today" in today_th.inner_text() and 150 < box["x"] - reg["x"] < 240, (box["x"], reg["x"]))
    check("Month: the grid scrolls sideways for the whole month", region.evaluate("e => e.scrollWidth > e.clientWidth + 500"))
    sticky = grid.locator("tbody tr").nth(2).locator("th").bounding_box()["x"]
    page.get_by_role("button", name="Scroll on a week").click(); page.wait_for_timeout(700)
    check("Month: the Week buttons scroll it, and the site names stay put", region.evaluate("e => e.scrollLeft") > 600 and abs(grid.locator("tbody tr").nth(2).locator("th").bounding_box()["x"] - sticky) < 2)
    page.get_by_role("button", name="Scroll back a week").click(); page.wait_for_timeout(700)

    # Days gone come from the timesheet; days to come from the plan
    att = data(page, f"db.attendance.filter(a => a.projectId==='pr-C720' && a.date==='{prev}').map(a => db.people.find(p => p.id===a.personId).name).sort()")
    gone_cell = cell("C720", prev)
    check("Month: a day gone shows who was on site, from the timesheet", len(att) >= 4 and all(n in gone_cell.inner_text() for n in att) and "from the timesheet" in gone_cell.get_by_role("button").get_attribute("aria-label"), (att, gone_cell.inner_text()))
    plan = data(page, f"db.plan.filter(p => p.projectId==='pr-C720' && p.date==='{nxt[0]}').map(p => db.people.find(x => x.id===p.personId).name).sort()")
    check("Month: a day to come shows the plan, the same names as the week ahead", len(plan) >= 4 and sorted(t.strip() for t in cell("C720", nxt[0]).locator("button > span").all_inner_texts()) == plan, (plan, cell("C720", nxt[0]).inner_text()))
    clash = cell("C722", nxt[2]).locator("span.bg-bad-soft")
    check("Month: someone on two sites the same day is shown in red", clash.count() == 1 and "Ionuț Marin" in clash.inner_text() and cell("C724", nxt[2]).locator("span.bg-bad-soft").count() == 1)
    page.screenshot(path=f"{OUT}/500-month-grid.png")

    # ── The day box
    gone_cell.get_by_role("button").click(); page.wait_for_timeout(300)
    d = page.locator("dialog[open]")
    check("Day box: a day gone is the timesheet, with nothing to change", "from the timesheet" in d.inner_text() and d.get_by_placeholder("Search employee").count() == 0 and d.locator("button[aria-label^='Take ']").count() == 0 and d.get_by_role("list", name="On site that day").locator("li").count() == len(att))
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)
    cell("C721", nxt[2]).get_by_role("button").click(); page.wait_for_timeout(300)
    d = page.locator("dialog[open]")
    title = d.locator("h2").inner_text()
    check("Day box: the site code and the full date, then the site name and who is planned", title.startswith("C721, Wednesday ") and "The Old Corn Mill" in d.inner_text() and d.get_by_role("list", name="Planned that day").locator("li").count() == data(page, f"db.plan.filter(p => p.projectId==='pr-C721' && p.date==='{nxt[2]}').length"), title)
    check("Day box: Add person with a search, Repeat each weekday until, and Add to the site", d.get_by_placeholder("Search employee").count() == 1 and d.get_by_label("Repeat each weekday until").input_value() == nxt[2] and d.get_by_role("button", name="Add to C721").is_disabled())
    d.get_by_placeholder("Search employee").fill("mendon"); page.wait_for_timeout(200)
    opts = d.get_by_role("option")
    check("Day box: the search finds people by name without accents, with where they are that day", opts.count() == 1 and "Rafael Mendonça" in opts.first.inner_text() and "free" in opts.first.inner_text(), opts.all_inner_texts())
    d.get_by_placeholder("Search employee").fill("Cormac"); page.wait_for_timeout(200)
    cormac_leave = data(page, f"db.holidays.some(h => h.status==='Approved' && db.people.find(p => p.id===h.personId).name==='Cormac Hession' && h.from<='{nxt[2]}' && h.to>='{nxt[2]}')")
    check("Day box: someone on holiday cannot be picked", cormac_leave and opts.count() == 1 and opts.first.get_by_role("button").is_disabled() and "on leave" in opts.first.inner_text(), (cormac_leave, opts.all_inner_texts()))
    d.get_by_placeholder("Search employee").fill("rafael"); page.wait_for_timeout(200)
    opts.first.get_by_role("button").click()
    d.get_by_label("Repeat each weekday until").fill(nxt[4]); page.wait_for_timeout(250)
    check("Day box: it says what will be added before you add it", "Adds 3 days for Rafael" in d.inner_text(), d.inner_text()[-300:])
    page.screenshot(path=f"{OUT}/501-month-day-box.png")
    rafael = data(page, "db.people.find(p=>p.name==='Rafael Mendonça').id")
    d.get_by_role("button", name="Add to C721").click(); page.wait_for_timeout(300)
    got = [on(rafael, "C721", x) for x in nxt]
    check("Day box: Add with Repeat until plans each weekday to that date, and nothing before", got == [False, False, True, True, True] and "3 days" in toast(page), (got, toast(page)))
    check("Day box: it stays open with him in the list, ready for the next person", d.get_by_role("list", name="Planned that day").locator("li", has_text="Rafael Mendonça").count() == 1 and d.get_by_placeholder("Search employee").input_value() == "")
    # Someone busy elsewhere: added anyway, and highlighted
    d.get_by_placeholder("Search employee").fill("Florin"); page.wait_for_timeout(200)
    check("Day box: someone on another site says so", "on C723" in opts.first.inner_text())
    opts.first.get_by_role("button").click(); page.wait_for_timeout(200)
    check("Day box: adding them warns that it double books", "double book" in d.inner_text())
    d.get_by_role("button", name="Add to C721").click(); page.wait_for_timeout(300)
    row = d.get_by_role("list", name="Planned that day").locator("li", has_text="Florin Dobre")
    check("Day box: the double booking is highlighted in the box", "Also planned on C723" in row.inner_text())
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)
    check("Month: and in red on both sites in the grid", cell("C721", nxt[2]).locator("span.bg-bad-soft", has_text="Florin Dobre").count() == 1 and cell("C723", nxt[2]).locator("span.bg-bad-soft", has_text="Florin Dobre").count() == 1)

    # ── In step with the week ahead, both ways
    go(page, "/schedule", "table")
    wk = page.get_by_role("table", name="Week ahead by site and day")
    wcell = lambda code, date: wk.locator(f"td[data-cell='{code} {date}']")
    check("Week ahead: what was added on the month shows here, with the double booking", wcell("C721", nxt[3]).get_by_role("button", name="Rafael Mendonça: contact details and options").count() == 1 and "Florin Dobre is on" in main.inner_text())
    wcell("C721", nxt[2]).get_by_role("button", name="Florin Dobre: contact details and options").click(); page.wait_for_timeout(250)
    page.locator("dialog[open]").get_by_role("button", name="Take off C721").click(); page.wait_for_timeout(300)
    wcell("C719", nxt[1]).get_by_role("button", name=re.compile("^Add someone")).click(); page.wait_for_timeout(250)
    page.locator("dialog[open]").get_by_role("button", name=re.compile("^Adrian Stoica")).click(); page.wait_for_timeout(300)
    adrian = data(page, "db.people.find(p=>p.name==='Adrian Stoica').id")
    go(page, "/schedule/month", "table")
    if nxt[0][:7] != day[:7]: page.get_by_role("button", name="Later month").click(); page.wait_for_timeout(300)
    check("Month: a change on the week ahead shows here", on(adrian, "C719", nxt[1]) and "Adrian Stoica" in cell("C719", nxt[1]).inner_text() and "Florin Dobre" not in cell("C721", nxt[2]).inner_text())
    cell("C719", nxt[1]).get_by_role("button").click(); page.wait_for_timeout(300)
    d = page.locator("dialog[open]")
    d.get_by_role("button", name="Take Adrian Stoica off C719 that day").click(); page.wait_for_timeout(300)
    check("Day box: taking someone off changes the plan", not on(adrian, "C719", nxt[1]) and d.get_by_role("list", name="Planned that day").locator("li", has_text="Adrian Stoica").count() == 0)
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)
    page.get_by_role("button", name="Later month").click(); page.wait_for_timeout(300)
    check("Month: later months open at the start, and Back to this month returns", page.get_by_role("button", name="Back to this month").count() == 1 and region.evaluate("e => e.scrollLeft") == 0)
    page.get_by_role("button", name="Back to this month").click(); page.wait_for_timeout(300)

    # ── Who is where, per site (since 18 Nov: Per site first, with Everyone beside it at the top right)
    go(page, "/schedule/today", "table")
    tabs = page.get_by_role("tablist", name="Who is where layout").get_by_role("tab").all_inner_texts()
    check("Who is where: Everyone or Per site, Per site first", tabs == ["Everyone", "Per site"] and page.get_by_role("tab", name="Per site").get_attribute("aria-selected") == "true", tabs)
    heads2 = main.locator("section h2").all_inner_texts()
    live = data(page, "db.projects.filter(p => p.status==='Live').map(p => p.code + ' ' + p.name).sort()")
    check("Per site: a heading per live site with code and name, like the plant overview", [h for h in heads2 if re.match(r"C7\d\d ", h)] == live, heads2)
    t = main.locator("table[aria-label^='C719 St Finian\\'s Church, ']")
    marked = data(page, "db.attendance.filter(a => a.projectId==='pr-C719' && a.date===day).length")
    check("Per site: under each, who is there today with status and phone", t.locator("tbody tr").count() == marked and marked >= 3 and t.locator("a[href^='tel:']").count() >= marked and "On site" in t.inner_text(), (t.locator("tbody tr").count(), marked))
    tables = main.locator("table[aria-label]")
    total = sum(tables.nth(i).locator("tbody tr").count() for i in range(tables.count()))
    ops = data(page, "db.people.filter(p => p.active && p.kind==='Operative').length")
    check("Per site: everyone is somewhere on the page", total >= ops, (total, ops))
    page.screenshot(path=f"{OUT}/502-who-is-where-per-site.png", full_page=True)

    # ── A site manager: his own sites only; phone width
    as_role(page, "Site manager")
    go(page, "/schedule/month", "table")
    rows = [t.split("\n")[0] for t in page.get_by_role("table", name=re.compile("^Month ahead")).locator("tbody th").all_inner_texts()]
    check("Site manager: the month shows only the sites he runs", rows == ["C719", "C724"], rows)
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(300)
    for path in ["/schedule/month", "/schedule/today", "/schedule"]:
        go(page, path)
        check(f"Phone width: {path} does not scroll the page sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

errs = []
try:
    errs = run(steps)
except Exception as ex:
    import traceback; traceback.print_exc()
    print("STOPPED EARLY:", str(ex).split("\n")[0][:300])
ok = 0
for name, passed, detail in results:
    if passed: ok += 1
    else: print("FAIL", name, " ", detail[:400])
print("console problems:", errs)
print(f"{ok}/{len(results)} passed")
