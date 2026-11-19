import os, sys, re
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
from playwright.sync_api import sync_playwright
# The single-file preview, opened straight from disk: round eleven, 18 Nov (decisions 118 to 129).
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
    # To do on the Dashboard
    assert main.get_by_role("list", name="To do").locator("> li").count() >= 1
    # Who is where, per site, any day
    bar.get_by_role("link", name="Schedule").click(); side.get_by_role("link", name="Who is where").click()
    page.wait_for_selector("text=Per site")
    first_day = main.get_by_label("Day", exact=True).input_value()
    main.get_by_role("button", name="Previous day").click(); page.wait_for_timeout(300)
    assert main.get_by_label("Day", exact=True).input_value() != first_day
    assert main.locator("table").count() >= 3
    # Fleet: its own department
    bar.get_by_role("link", name=re.compile("Fleet")).click(); page.wait_for_selector("text=Repair spend")
    side.get_by_role("link", name="Vehicles", exact=True).click(); page.wait_for_selector("table")
    main.locator("tbody tr").first.locator("a").first.click(); page.wait_for_timeout(500)
    assert main.locator("[aria-label='Who has it today']").count() == 1, page.url
    # Back to where it was
    page.get_by_role("button", name=re.compile("^Back")).click(); page.wait_for_timeout(500)
    assert main.locator("tbody tr").count() >= 18
    side.get_by_role("link", name=re.compile("^Invoices")).click(); page.wait_for_selector("table")
    main.locator("tbody tr").first.locator("a").first.click(); page.wait_for_timeout(600)
    assert main.get_by_role("button", name=re.compile("Mark (as )?checked|Put back to check")).count() >= 1
    # The upload reads the file's name on the preview, with no AI
    side.get_by_role("link", name="Overview").click(); page.wait_for_timeout(400)
    main.get_by_role("button", name="Upload an invoice").click(); page.wait_for_selector("dialog[open]")
    assert "AI reading" in dlg().inner_text() or "file's name" in dlg().inner_text() or "hosted" in dlg().inner_text()
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    # The phones: Report damage, Send a licence, and what the office receives
    bar.get_by_role("link", name="Site phone").click(); page.wait_for_selector("text=What the office receives")
    phone = page.get_by_label("Phone screen")
    if phone.get_by_role("tab", name="English").count(): phone.get_by_role("tab", name="English").click(); page.wait_for_timeout(200)
    phone.get_by_role("button", name=re.compile("^Report damage")).click(); page.wait_for_selector("dialog[open]")
    d = dlg()
    if d.get_by_label("Which vehicle?").count(): d.get_by_label("Which vehicle?").select_option(index=1)
    d.get_by_label("Where are you?").fill("Yard at Oranmore"); d.get_by_label("What happened?").fill("Wing mirror clipped on the gate post")
    d.get_by_role("button", name=re.compile("sample picture")).click(); page.wait_for_timeout(300)
    d.get_by_role("button", name="Send to the office").click(); page.wait_for_timeout(500)
    assert "Wing mirror clipped" in main.inner_text()
    print("outside requests:", reqs)
    print("console problems:", errs)
    print("preview from disk: round eleven screens open and work")
    b.close()
