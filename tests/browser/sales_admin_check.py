import os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT

# Sales and Admin, 21 Nov 2026 (decisions 249 to 258). Estimated margin on every tender, in
# Confirmed and the Pipeline; All tenders as Being priced, With the client, Won, live, Lost, last
# 90 days, and the Archive set apart; the Board's Declined column on by default and remembered
# once off; no Declined in Awaiting response; a customer's average margins over finished jobs;
# Admin an app in the bottom bar with two sections, Requests and Settings.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(300)
def sign_in_as(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role, exact=True).click(); page.wait_for_timeout(500)

# The same lists the screen draws, worked out from the records in the page (as lib/tenders.ts).
LISTS = """(() => {
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
  const out = {};
  for (const q of db.quotes) {
    let l;
    if (['Draft', 'Awaiting approval'].includes(q.status)) l = 'pricing';
    else if (q.status === 'Accepted') l = (db.projects.find(p => p.quoteId === q.id) || {}).status === 'Closed' ? 'archive' : 'won';
    else if (q.status === 'Declined') l = (!q.respondedAt || days(q.respondedAt.slice(0, 10), day) <= 90) ? 'lost' : 'archive';
    else l = 'out';
    (out[l] = out[l] || []).push(q.ref);
  }
  return out;
})()"""

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main h1"); page.wait_for_timeout(300)
    dlg = lambda: page.locator("dialog[open]").last
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(500)
    main = page.locator("main")
    bar = page.get_by_role("navigation", name="Apps")
    top = page.get_by_role("navigation", name="Email, chat and phone")
    sections = lambda: [re.sub(r"\s*\d+$", "", s.strip()) for s in page.locator("nav[aria-label$=' sections']").first.get_by_role("link").all_inner_texts()]
    tabs = lambda: [re.sub(r"\s*\d+$", "", s.strip().split("\n")[0]) for s in page.locator("nav[aria-label$=' screens']").get_by_role("link").all_inner_texts()]

    # ── 1. All tenders: the five lists
    lists = data(page, LISTS)
    go(page, "/sales/tenders")
    tl = page.get_by_role("tablist", name="Tenders shown")
    names = [re.sub(r"\s*\d+$", "", t.strip()) for t in tl.get_by_role("tab").all_inner_texts()]
    check("All tenders: Being priced, With the client, Won, live, Lost, last 90 days, then Archive", names == ["Being priced", "With the client", "Won, live", "Lost, last 90 days", "Archive"], names)
    counts = [int(re.search(r"(\d+)$", t.strip()).group(1)) for t in tl.get_by_role("tab").all_inner_texts()]
    want = [len(lists.get(k, [])) for k in ["pricing", "out", "won", "lost", "archive"]]
    check("All tenders: each list's count matches the records", counts == want and all(c > 0 for c in want), (counts, want))
    check("All tenders: the Archive is set apart from the four in its own box", tl.locator("> div").count() == 2 and tl.locator("> div").nth(1).get_by_role("tab").count() == 1)
    heads = main.locator("table thead th").all_inner_texts()
    check("Being priced: an Est. margin column", "Est. margin" in heads, heads)
    margins = [m.strip() for m in main.locator("table tbody tr td:nth-child(5)").all_inner_texts()]
    check("Being priced: every tender has an estimated margin", margins and all(re.match(r"^-?\d+\.\d%", m) for m in margins), margins)
    page.screenshot(path=f"{OUT}/1301-tenders-pricing.png", full_page=True)
    tl.get_by_role("tab", name=re.compile("^Won, live")).click(); page.wait_for_timeout(300)
    refs = [r.split(" ")[0] for r in main.locator("table tbody tr td:first-child a").all_inner_texts()]
    check("Won, live: exactly the won tenders whose job is not closed", sorted(refs) == sorted(lists["won"]), (refs, lists["won"]))
    jobs = main.locator("table tbody tr td:nth-child(6)").all_inner_texts()
    check("Won, live: each shows its job and where it stands, none Closed", jobs and all(re.match(r"^C\d+ (Not started|Live|Complete|Invoiced)$", j.strip()) for j in jobs), jobs)
    st = data(page, "[...new Set(db.projects.filter(p => p.quoteId && db.quotes.find(q => q.id === p.quoteId && q.status === 'Accepted') && p.status !== 'Closed').map(p => p.status))]")
    check("Won, live: live and not started jobs are both in it", "Live" in st and "Not started" in st, st)
    tl.get_by_role("tab", name=re.compile("^Lost")).click(); page.wait_for_timeout(300)
    refs = [r.split(" ")[0] for r in main.locator("table tbody tr td:first-child a").all_inner_texts()]
    check("Lost, last 90 days: exactly the tenders declined in the last 90 days", sorted(refs) == sorted(lists["lost"]), (refs, lists["lost"]))
    tl.get_by_role("tab", name=re.compile("^Archive")).click(); page.wait_for_timeout(300)
    txt = main.inner_text()
    won_arch = [q for q in lists["archive"] if data(page, f"db.quotes.find(q => q.ref === '{q}').status") == "Accepted"]
    lost_arch = [q for q in lists["archive"] if q not in won_arch]
    check("Archive: two lists, won with the job closed and lost over 90 days ago", f"Won, job closed ({len(won_arch)})" in txt and f"Lost, over 90 days ago ({len(lost_arch)})" in txt and len(won_arch) > 0 and len(lost_arch) > 0, txt[:300])
    tables = main.locator("table")
    a = sorted(r.split(" ")[0] for r in tables.nth(0).locator("tbody td:first-child a").all_inner_texts())
    b = sorted(r.split(" ")[0] for r in tables.nth(1).locator("tbody td:first-child a").all_inner_texts())
    check("Archive: the right tenders in each list", a == sorted(won_arch) and b == sorted(lost_arch), (a, b))
    page.screenshot(path=f"{OUT}/1302-tenders-archive.png", full_page=True)
    go(page, "/sales/tenders")
    check("All tenders: the list picked is remembered", page.get_by_role("tab", name=re.compile("^Archive")).get_attribute("aria-selected") == "true")
    page.get_by_role("tab", name=re.compile("^Being priced")).click()

    # ── 2. Awaiting response has no Declined
    go(page, "/sales/awaiting")
    hs = main.locator("h2").all_inner_texts()
    check("Awaiting response: Queried, Due a chase, Sent and waiting; no Declined", [re.sub(r"\s*\(\d+\)$", "", h) for h in hs] == ["Queried", "Due a chase", "Sent, waiting"], hs)

    # ── 3. Board: Declined on by default, last 90 days, remembered once off
    go(page, "/sales")
    cols = main.get_by_role("heading", level=2).all_inner_texts()
    check("Board: the Declined column is on by default", any(c.startswith("Declined") for c in cols), cols)
    sw = page.get_by_role("switch", name="Show declined quotes")
    check("Board: the switch is on", sw.get_attribute("aria-checked") == "true")
    col = main.locator("section", has=page.get_by_role("heading", name=re.compile("^Declined")))
    shown = data(page, "db.quotes.filter(q => q.status === 'Declined').length")
    check("Board: Declined shows the last 90 days only", len(lists["lost"]) < shown and str(len(lists["lost"])) in cols[[c.startswith("Declined") for c in cols].index(True)], (cols, len(lists["lost"]), shown))
    sw.click(); page.wait_for_timeout(300)
    check("Board: switched off, the column goes", not any(c.startswith("Declined") for c in main.get_by_role("heading", level=2).all_inner_texts()))
    go(page, "/dashboard"); go(page, "/sales")
    check("Board: off stays off on coming back", not any(c.startswith("Declined") for c in main.get_by_role("heading", level=2).all_inner_texts()) and page.get_by_role("switch", name="Show declined quotes").get_attribute("aria-checked") == "false")
    page.get_by_role("switch", name="Show declined quotes").click(); page.wait_for_timeout(200)
    check("Board: switched back on", any(c.startswith("Declined") for c in main.get_by_role("heading", level=2).all_inner_texts()))

    # ── 4. Confirmed: estimated margin, from the tender or typed for a job with no tender
    go(page, "/sales/confirmed")
    heads = main.locator("table thead th").all_inner_texts()
    check("Confirmed: an Est. margin column", "Est. margin" in heads, heads)
    first = main.locator("table tbody tr").first.inner_text()
    check("Confirmed: a tendered job's margin says it is from the tender", re.search(r"\d+\.\d%\s*From the tender", first), first)
    # A job with no tender, added with a margin, then one without, set later
    for name, m in [("Gate lodge chimney", "21.5"), ("Boundary wall repairs", None)]:
        go(page, "/projects/not-started")
        page.get_by_role("button", name="Add project").click(); page.wait_for_timeout(300)
        d = dlg()
        d.get_by_label("Client", exact=True).select_option(index=1)
        d.get_by_label("Project name").fill(name)
        d.get_by_label("Where the site is").fill("Athenry")
        d.get_by_label("County").fill("Galway")
        d.get_by_label("The work, in a sentence").fill("Rebuild in lime mortar")
        d.get_by_label("Value before VAT").fill("9000")
        if m:
            d.get_by_label("Estimated margin % (optional)").fill("140")
            d.get_by_role("button", name="Add project").click(); page.wait_for_timeout(200)
            check("Add project: a margin of 140% is refused", "between -100% and 100%" in d.inner_text())
            d.get_by_label("Estimated margin % (optional)").fill(m)
            page.screenshot(path=f"{OUT}/1303-add-project-margin.png")
        d.get_by_label("Site manager", exact=True).select_option(index=1)
        d.get_by_role("button", name="Add project").click(); page.wait_for_timeout(500)
    got = data(page, "db.projects.filter(p => ['Gate lodge chimney', 'Boundary wall repairs'].includes(p.name)).map(p => [p.name, p.estMargin ?? null])")
    check("Add project: the margin saved, or none", sorted(got) == [["Boundary wall repairs", None], ["Gate lodge chimney", 21.5]], got)
    go(page, "/sales/confirmed")
    row = lambda n: main.locator("table tbody tr", has_text=n)
    check("Confirmed: the typed margin shows, with Change", "21.5%" in row("Gate lodge chimney").inner_text() and row("Gate lodge chimney").get_by_role("button", name="Change").count() == 1)
    check("Confirmed: none given reads Not given, with Set margin", "Not given" in row("Boundary wall repairs").inner_text() and row("Boundary wall repairs").get_by_role("button", name="Set margin").count() == 1)
    check("Confirmed: a tendered job has no button to type over it", main.locator("table tbody tr", has_text="From the tender").get_by_role("button").count() == 0)
    row("Boundary wall repairs").get_by_role("button", name="Set margin").click(); page.wait_for_timeout(300)
    dlg().get_by_label("Estimated margin %").fill("17.5")
    page.screenshot(path=f"{OUT}/1304-set-margin.png")
    dlg().get_by_role("button", name="Save").click(); page.wait_for_timeout(400)
    check("Set margin: saved and shown", "17.5%" in row("Boundary wall repairs").inner_text() and data(page, "db.projects.find(p => p.name === 'Boundary wall repairs').estMargin") == 17.5)
    check("Set margin: in the Activity log and the job's history", data(page, "db.activity[0].what") == "Estimated margin set to 17.5%" and data(page, "db.projects.find(p => p.name === 'Boundary wall repairs').audit.at(-1).what") == "Estimated margin set to 17.5%")
    row("Boundary wall repairs").get_by_role("button", name="Change").click(); page.wait_for_timeout(300)
    dlg().get_by_label("Estimated margin %").fill("")
    dlg().get_by_role("button", name="Save").click(); page.wait_for_timeout(400)
    check("Set margin: emptied, it is taken away", "Not given" in row("Boundary wall repairs").inner_text())
    page.screenshot(path=f"{OUT}/1305-confirmed.png", full_page=True)

    # ── 5. Pipeline: estimated margin beside each value
    go(page, "/sales/pipeline")
    for lst in ["Tendered works", "Confirmed orders", "Tenders being priced"]:
        items = page.get_by_role("list", name=lst).get_by_role("listitem").all_inner_texts()
        check(f"Pipeline, {lst}: an estimated margin on each line, or No est.", items and all(re.search(r"(\d+\.\d% est\.|No est\.)", i) for i in items), items[:3])
    items = page.get_by_role("list", name="Confirmed orders").get_by_role("listitem").all_inner_texts()
    check("Pipeline: the typed margin on the job with no tender, No est. where none", any("Gate lodge chimney" in i and "21.5% est." in i for i in items) and any("Boundary wall repairs" in i and "No est." in i for i in items), items)
    page.screenshot(path=f"{OUT}/1306-pipeline.png", full_page=True)

    # ── 6. Customers: average margins over finished jobs only
    go(page, "/customers")
    heads = main.locator("table thead th").all_inner_texts()
    check("Customers: Est. margin and Actual margin columns", "Est. margin" in heads and "Actual margin" in heads, heads)
    ei, ai = heads.index("Est. margin") + 1, heads.index("Actual margin") + 1
    want = data(page, """(() => {
      const fin = ['Complete', 'Invoiced', 'Closed'];
      const out = {};
      for (const c of db.clients) out[c.name] = db.projects.filter(p => p.clientId === c.id && fin.includes(p.status) && (p.value || 0) > 0).length;
      return out;
    })()""")
    rows = main.locator("table tbody tr")
    ok, bad = 0, []
    for i in range(rows.count()):
        r = rows.nth(i)
        name = r.locator("td").first.inner_text().split("\n")[0]
        n = want.get(name, 0)
        e, a = r.locator(f"td:nth-child({ei})").inner_text(), r.locator(f"td:nth-child({ai})").inner_text()
        good = (("-" == e.strip() and "-" == a.strip()) if n == 0 else (re.match(r"^-?\d+\.\d%", e) and re.match(r"^-?\d+\.\d%", a) and f"{n} finished job" in a and f"{n} finished job" in e))
        ok += bool(good)
        if not good: bad.append((name, n, e, a))
    check("Customers: margins only where they have finished jobs, with how many", not bad and ok == rows.count(), bad[:3])
    live_only = data(page, "db.clients.filter(c => db.projects.some(p => p.clientId === c.id) && db.projects.filter(p => p.clientId === c.id).every(p => ['Live', 'Not started'].includes(p.status))).map(c => c.name)")
    check("Customers: a customer with only running or unstarted jobs shows no estimate", all(main.locator("table tbody tr", has_text=n).first.locator(f"td:nth-child({ei})").inner_text().strip() == "-" for n in live_only), live_only)
    page.screenshot(path=f"{OUT}/1307-customers.png", full_page=True)

    # ── 7. Admin: an app in the bottom bar, out of the top bar
    go(page, "/dashboard")
    apps = [a.strip() for a in bar.get_by_role("link").all_inner_texts()]
    check("Bottom bar: Admin is the sixth app", apps == ["Dashboard", "Sales", "Projects", "Resources", "Finance", "Admin"], apps)
    check("Top bar: no Admin button", top.get_by_role("link", name=re.compile("Admin")).count() == 0 and top.get_by_role("link").count() == 3, top.get_by_role("link").all_inner_texts())
    bar.get_by_role("link", name="Admin").click(); page.wait_for_timeout(400)
    check("Admin opens on Requests", page.url.endswith("/admin") and sections() == ["Requests", "Settings"], (page.url, sections()))
    check("Admin, Requests: Requests, Repairs, Invoice approvals", tabs() == ["Requests", "Repairs", "Invoice approvals"], tabs())
    check("Admin: the app is marked as the one open", bar.get_by_role("link", name="Admin").get_attribute("aria-current") == "page")
    page.screenshot(path=f"{OUT}/1308-admin-requests.png")
    page.locator("nav[aria-label$=' sections']").get_by_role("link", name="Settings").click(); page.wait_for_timeout(400)
    want_tabs = ["Roles and access", "Site access", "Billing", "Company holidays", "Activity log", "Automations", "Vardil Works", "Branding", "Region", "About this demo"]
    check("Admin, Settings: access, billing, holidays, the log, and the old Settings screens", tabs() == want_tabs, tabs())
    for path, h in [("/admin/sites", "Site access"), ("/admin/billing", "Billing"), ("/admin/activity", "Activity log"), ("/settings", "Branding"), ("/settings/region", "Region"), ("/settings/about", "About this demo")]:
        go(page, path)
        check(f"Admin, Settings, {h}: opens inside Admin", bar.get_by_role("link", name="Admin").get_attribute("aria-current") == "page" and page.locator("nav[aria-label$=' screens'] a[aria-current=page]").inner_text().startswith(h), (page.url, page.locator("main h1").inner_text()))
    page.screenshot(path=f"{OUT}/1309-admin-settings.png")
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name="Settings").click(); page.wait_for_timeout(400)
    check("The account menu's Settings still opens Branding, in Admin", page.url.endswith("/settings") and bar.get_by_role("link", name="Admin").get_attribute("aria-current") == "page")

    # Contracts manager: Admin only if given; mdOnly screens not shown
    sign_in_as(page, "Contracts manager"); go(page, "/dashboard")
    apps = [a.strip() for a in bar.get_by_role("link").all_inner_texts()]
    check("Contracts manager: no Admin app unless given it", "Admin" not in apps, apps)
    sign_in_as(page, "Managing director")
    go(page, "/admin/access")
    page.get_by_role("tab", name="By role").click(); page.wait_for_timeout(200)
    box = page.get_by_role("checkbox", name=re.compile(r"Contracts manager.*Admin|Admin.*Contracts manager"))
    if box.count():
        box.first.click(); page.wait_for_timeout(400)
        sign_in_as(page, "Contracts manager"); go(page, "/dashboard")
        apps = [a.strip() for a in bar.get_by_role("link").all_inner_texts()]
        check("Contracts manager given Admin: the app is in their bar", "Admin" in apps, apps)
        bar.get_by_role("link", name="Admin").click(); page.wait_for_timeout(400)
        page.locator("nav[aria-label$=' sections']").get_by_role("link", name="Settings").click(); page.wait_for_timeout(400)
        t = tabs()
        check("Contracts manager given Admin: no Roles and access, Site access or Billing", not any(x in t for x in ["Roles and access", "Site access", "Billing"]) and "Company holidays" in t, t)
        go(page, "/admin/billing")
        check("Contracts manager: Billing by address goes back to Admin", page.url.endswith("/admin"))
        sign_in_as(page, "Managing director")
    else:
        check("Roles and access: found the Admin tick for contracts managers", False, "no checkbox")

    # ── 8. Dark mode and phone width
    page.emulate_media(color_scheme="dark")
    page.set_viewport_size({"width": 390, "height": 844})
    for path, shot in [("/dashboard", "1310-phone-bar"), ("/sales/tenders", "1311-phone-tenders"), ("/admin", "1312-phone-admin"), ("/customers", "1313-phone-customers")]:
        go(page, path)
        wide = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        check(f"Phone width, {path}: no sideways scroll of the page", not wide)
        page.screenshot(path=f"{OUT}/{shot}.png")
    go(page, "/dashboard")
    fits = page.evaluate("(() => { const ul = document.querySelector('nav[aria-label=Apps] ul'); return ul.scrollWidth <= ul.clientWidth + 1 && ul.getBoundingClientRect().right <= window.innerWidth; })()")
    check("Phone width: all six apps fit in the bottom bar without scrolling", fits)
    labels = page.evaluate("[...document.querySelectorAll('nav[aria-label=Apps] a span')].every(s => s.scrollWidth <= s.parentElement.clientWidth + 1)")
    check("Phone width: every app's name fits its button", labels)
    page.set_viewport_size({"width": 1440, "height": 900})

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
