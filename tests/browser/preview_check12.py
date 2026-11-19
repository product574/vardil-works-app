import os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
from playwright.sync_api import sync_playwright
# The single-file preview, opened straight from disk: the two copies merged, 19 Nov (decisions 185 to 197).
errs = []; reqs = []
BAR = ["Dashboard", "Email", "Team chat", "Sales", "Customers", "Projects", "Schedule", "People", "Plant", "Fleet", "Compliance", "Invoicing", "Profitability", "Reports", "Portal", "Site phone", "Admin"]
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
    page.goto("file://" + REPO + "/dist-preview/index.html"); page.wait_for_selector("#username")
    assert "demo / demo" not in page.inner_text("body") and "username demo" not in page.inner_text("body"), "the sign-in page prints the login"
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    bar = page.locator("nav[aria-label=Departments]"); side = page.locator("nav[aria-label$=screens]:visible"); main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    names = [t.strip().split("\n")[-1] for t in bar.get_by_role("link").all_inner_texts()]
    assert names == BAR, names
    # Invoicing as it was on invoicing-section
    bar.get_by_role("link", name="Invoicing").click(); page.wait_for_selector("text=Draft an invoice")
    assert side.get_by_role("link", name=re.compile("^Sage export")).count() == 1 and side.get_by_role("link", name="Job costs").count() == 1
    # Profitability by site only; Reports and Customers
    bar.get_by_role("link", name="Profitability").click(); page.wait_for_selector("main table")
    assert [t.split("\n")[0] for t in side.get_by_role("link").all_inner_texts()] == ["By site"]
    bar.get_by_role("link", name="Reports").click(); page.wait_for_selector("dl[aria-label='Key figures']")
    # Compliance reads Fleet
    bar.get_by_role("link", name="Compliance").click(); page.wait_for_selector("table")
    side.get_by_role("link", name=re.compile("^Fleet")).click(); page.wait_for_selector("table[aria-label='Driving licences']")
    assert "Driver CPC" in main.locator("table[aria-label='Driving licences'] thead").inner_text()
    # Admin: supplier invoices over the limit beside the other copy's requests
    bar.get_by_role("link", name="Admin").click(); page.wait_for_selector("text=Supplier invoices over")
    # Both phones, a sheet on the phone
    bar.get_by_role("link", name="Site phone").click(); page.wait_for_selector("text=What the office receives")
    op = page.get_by_label("Operative's phone", exact=True); mp = page.get_by_label("Site manager's phone", exact=True)
    ob, mb = op.bounding_box(), mp.bounding_box()
    assert ob["x"] < mb["x"] and abs(ob["y"] - mb["y"]) < 5 and ob["width"] < 440, (ob, mb)
    op.get_by_role("button", name="My profile").click(); page.wait_for_timeout(300)
    assert op.locator("dialog[open]").count() == 1 and op.locator("dialog[open]").get_by_role("list", name="My tickets").count() == 1
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    assert op.locator("dialog[open]").count() == 0
    mp.get_by_role("list", name="My jobs").get_by_role("button").first.click(); page.wait_for_timeout(300)
    assert mp.get_by_role("button", name=re.compile("^Who cannot work")).count() == 1 and mp.get_by_role("button", name=re.compile("^Subcontractor invoices")).count() == 1
    page.screenshot(path=os.path.join(HERE, "shots", "990-preview-phones.png"))
    print("outside requests:", reqs)
    print("console problems:", errs)
    print("preview from disk: the merged screens open and work")
    b.close()
