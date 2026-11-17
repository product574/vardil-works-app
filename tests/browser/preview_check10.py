import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
from playwright.sync_api import sync_playwright
import re
# The single-file preview, opened straight from disk: round nine, 17 Nov (decisions 100 to 105).
errs = []; reqs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
    page.goto("file://" + REPO + "/dist-preview/index.html"); page.wait_for_selector("#username")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    bar = page.locator("nav[aria-label=Departments]"); side = page.locator("nav[aria-label$=screens]:visible"); main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    # Timesheet: both rates on one day, the rule, and a weekend time stamp
    bar.get_by_role("link", name="People").click(); page.wait_for_selector("section[aria-label='Overtime rates']")
    assert "An early start, at 6am or 7am, is not overtime." in main.inner_text()
    first = main.locator("tbody tr").first; who = first.locator("td").first.inner_text().split("\n")[0]
    main.get_by_label(f"Today for {who}").select_option("overtime"); page.wait_for_timeout(200)
    main.get_by_label(f"Hours at time and a half for {who}").fill("3"); main.get_by_label(f"Hours at double time for {who}").fill("1"); page.wait_for_timeout(200)
    main.get_by_role("button", name="Weekend time stamp").click(); page.wait_for_selector("dialog[open]")
    d = dlg(); d.get_by_role("list", name="People to stamp").locator("> li").first.get_by_role("checkbox").check()
    assert d.get_by_label("Hours at time and a half").is_disabled()
    d.get_by_label("Hours at double time").fill("4"); d.get_by_role("button", name="Save time stamp").click()
    page.wait_for_selector("text=1 time stamp saved for Sun")
    assert main.get_by_role("table", name="Weekend and bank holiday time stamps").locator("tbody tr").filter(has_text="4h x2").count() >= 1
    # Payroll: Monday to Sunday with the weekend's hours
    side.get_by_role("link", name=re.compile("^Payroll export")).click(); page.wait_for_selector("text=Monday to Sunday")
    assert "Sat, Sun" in main.locator("thead").first.inner_text() and "Double time, no time and a half" in main.inner_text()
    # Week ahead and month ahead
    bar.get_by_role("link", name="Schedule").click(); page.wait_for_selector("table[aria-label='Weekend work by day and site']")
    assert "C724" in main.get_by_role("table", name="Weekend work by day and site").inner_text()
    side.get_by_role("link", name="Month ahead").click(); page.wait_for_selector("table[aria-label^='Month ahead']")
    assert main.locator("thead th[data-day]", has_text="weekend").count() >= 3
    # Bank holidays
    bar.get_by_role("link", name="Admin").click(); side.get_by_role("link", name="Bank holidays").click(); page.wait_for_selector("table[aria-label^='Bank holidays in']")
    assert main.locator("tbody tr").count() == 10
    # Profitability
    bar.get_by_role("link", name="Profitability").click(); page.wait_for_selector("table[aria-label='Employee outgoings by site']")
    t = main.get_by_role("table", name="Employee outgoings by site")
    assert t.locator("tbody tr").count() >= 6 and "% used" in t.inner_text()
    t.get_by_role("button", name=re.compile("^C724 ")).click(); page.wait_for_selector("dialog[open] table")
    assert "Orla Prunty" in dlg().inner_text()
    dlg().get_by_role("button", name="Close").last.click(); page.wait_for_timeout(200)
    side.get_by_role("link", name="Job costs").click(); page.wait_for_selector("text=Download profitability report")
    # Email drafts
    bar.get_by_role("link", name=re.compile("Email")).click(); page.wait_for_selector("ul[aria-label^='Inbox emails']")
    page.get_by_role("button", name="Compose").first.click(); page.wait_for_selector("dialog[open]")
    dlg().get_by_label("Subject").fill("Kept for later"); dlg().get_by_role("button", name="Close").click()
    page.wait_for_selector("text=Saved to Drafts")
    page.get_by_role("link", name=re.compile("^Drafts")).first.click(); page.wait_for_timeout(400)
    rows = main.locator("ul[aria-label^='Drafts emails'] > li").filter(has_text="Kept for later")
    assert rows.count() == 1, rows.count()
    rows.get_by_role("button").last.click(); page.wait_for_selector("dialog[open]")
    assert dlg().locator("h2").inner_text() == "Draft email"
    dlg().get_by_role("button", name="Discard").click(); page.wait_for_selector("text=Draft discarded")
    print("outside requests:", reqs)
    print("console problems:", errs)
    print("preview from disk: round nine screens open and work")
    b.close()
