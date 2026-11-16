import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
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
    bar=page.locator("nav[aria-label=Departments]")
    bar.get_by_role("link", name="Sales").click(); page.wait_for_selector("section[aria-label='Sent']")
    page.locator("section[aria-label='Queried'] a").first.click(); page.wait_for_selector("text=What it costs us")
    page.get_by_role("tab", name="Client copy").click(); page.wait_for_selector("text=Quotation Q-2616")
    bar.get_by_role("link", name="Projects").click(); page.wait_for_selector("table")
    page.locator("tbody tr", has_text="C721").click(); page.wait_for_selector("text=Key facts")
    page.get_by_role("tab", name="Costs").click(); page.wait_for_selector("text=Cost to date")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Settings").click(); page.wait_for_selector("text=Roles and access")
    print("preview file: sales board, quote, client copy, project tabs, costs, roles and access all open")
    print("outside requests:", reqs, "| errors:", errs)
    b.close()
