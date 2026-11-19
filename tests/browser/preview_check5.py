import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import re
errs=[]; reqs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page=b.new_page(viewport={"width":1440,"height":900})
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type=="error" else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url) if not r.url.startswith(("file:","data:","blob:")) else None)
    page.goto("file://" + REPO + "/dist-preview/index.html"); page.wait_for_selector("#username")
    page.fill("#username","demo"); page.fill("#password","demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    bar=page.locator("nav[aria-label=Departments]"); side=page.locator("nav[aria-label$=screens]:visible"); main=page.locator("main")
    bar.get_by_role("link", name="Plant").click(); page.wait_for_selector("text=In the yard")
    page.locator("tbody tr", has_text="HS2").click(); page.wait_for_selector("dialog[open]")
    page.locator("dialog[open]").get_by_role("button", name="Record service").click(); page.wait_for_timeout(200)
    page.locator("dialog[open]").get_by_role("button", name="Close").click()
    for name, expect in [("Calendar","twelve weeks"),("Own plant","Finance"),("Hired plant","a week"),("Fleet","on the road")]:
        side.get_by_role("link", name=name).click(); page.wait_for_selector(f"text={expect}")
    # Fleet is one page with three tabs since 17 Nov.
    for name, expect in [("Vehicle documents","on file across"),("Repair spend","Whole fleet")]:
        page.get_by_role("navigation", name="Fleet sections").get_by_role("link", name=name).click(); page.wait_for_selector(f"text={expect}")
    bar.get_by_role("link", name="Files").click(); page.wait_for_selector("text=Last changed")
    side.get_by_role("link", name="To be sorted").click(); page.wait_for_selector("text=Needs a project")
    page.get_by_role("button", name="File the 2 with a project").click(); page.wait_for_timeout(300)
    side.get_by_role("link", name="Photos and videos").click(); page.wait_for_selector("main ul li")
    bar.get_by_role("link", name="Invoicing").click(); page.wait_for_selector("text=ready to go")
    page.locator("tbody tr").first.get_by_role("button", name="Issue invoice").click(); page.wait_for_timeout(300)
    side.get_by_role("link", name="Accounts export").click(); page.wait_for_selector("pre")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download file for Sage 50").click()
    name = dl.value.suggested_filename
    side.get_by_role("link", name="Supplier invoices").click(); page.wait_for_selector("text=Read from the invoice")
    main.locator("select[aria-label^='Project for']").first.select_option(index=1); page.wait_for_timeout(200)
    main.get_by_role("button", name="Approve to job costs").click(); page.wait_for_selector("text=Confirmed by Aidan King")
    side.get_by_role("link", name="Job costs").click(); page.wait_for_selector("text=All jobs shown")
    side.get_by_role("link", name="Invoiced").click(); page.wait_for_selector("text=Aged debt")
    side.get_by_role("link", name="Held").click(); page.wait_for_selector("text=The reason is under each invoice")
    print("preview file: plant, calendar, register, hire, vehicles, documents, repair spend, files, filing, photos, issue, export download (" + name + "), supplier approval, job costs, aged debt, held all work")
    print("outside requests:", reqs, "| errors:", errs)
    b.close()
