import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import re
# The single-file preview, opened straight from disk: the changes of 17 Nov, later (decisions 83 to 87).
errs = []; reqs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url) if not r.url.startswith(("file:", "data:", "blob:")) else None)
    page.goto("file://" + REPO + "/dist-preview/index.html"); page.wait_for_selector("#username")
    # The preview is shared with other people (17 Nov), so the sign-in page must not print the login,
    # and a wrong password is refused with a plain message.
    assert "default is username" not in page.locator("body").inner_text() and "No password has been set" not in page.locator("body").inner_text()
    page.fill("#username", "demo"); page.fill("#password", "Demo"); page.keyboard.press("Enter")
    page.wait_for_selector("text=That username or password is not right")
    assert page.locator("#username").count() == 1
    page.fill("#username", "someone"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.wait_for_selector("text=That username or password is not right")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    bar = page.locator("nav[aria-label=Departments]"); side = page.locator("nav[aria-label$=screens]:visible"); main = page.locator("main")
    bar.get_by_role("link", name="People").click(); side.get_by_role("link", name="Attendance history").click(); page.wait_for_selector("text=Totals for payroll")
    page.get_by_role("tablist", name="Attendance layout").get_by_role("tab", name="Per site").click(); page.wait_for_selector("text=Total on C7")
    page.get_by_role("tablist", name="History view").get_by_role("tab", name="Day by day").click(); page.wait_for_selector("table[aria-label*='day by day']")
    bar.get_by_role("link", name="Invoicing").click(); side.get_by_role("link", name=re.compile("^Held")).click(); page.wait_for_selector("text=The reason is under each invoice")
    assert main.locator("tbody tr[data-invoice]").count() == 2
    bar.get_by_role("link", name="Admin").click(); side.get_by_role("link", name="Site access").click(); page.wait_for_selector("table[aria-label='Sites each site manager can open']")
    main.get_by_role("switch", name="Eoin Brosnan: C720 Ardmullen House").click(); page.wait_for_selector("text=Eoin Brosnan can now open C720 Ardmullen House")
    bar.get_by_role("link", name="Site phone").click(); page.get_by_role("tab", name="Site manager").click(); page.wait_for_timeout(300)
    page.get_by_label("Site manager to view the phone as").select_option(label="Eoin Brosnan"); page.wait_for_selector("text=Run by Cathal Minogue")
    phone = page.get_by_label("Phone screen")
    phone.get_by_role("button", name=re.compile("^Make a request")).click(); page.wait_for_selector("dialog[open]")
    d = page.locator("dialog[open]")
    d.get_by_label("Describe it").fill("A second set of moisture meters to share between my sites"); d.get_by_role("button", name="Send").click(); page.wait_for_selector("text=1 waiting")
    page.get_by_role("tab", name="Operative").click(); page.wait_for_timeout(300)
    page.get_by_label("Phone screen").get_by_role("button", name="My week").click(); page.wait_for_selector("dialog[open] li")
    page.locator("dialog[open]").get_by_role("tab", name="Next week").click(); page.wait_for_timeout(200)
    assert page.locator("dialog[open] li").count() == 5
    page.locator("dialog[open]").get_by_role("button", name="Close").click()
    bar.get_by_role("link", name="Schedule").click(); page.wait_for_selector("table[aria-label='Week ahead by site and day']")
    side.get_by_role("link", name="Month ahead").click(); page.wait_for_selector("table[aria-label^='Month ahead']")
    bar.get_by_role("link", name="Admin").click(); page.wait_for_selector("text=A second set of moisture meters")
    b.close()
print("console errors:", errs)
print("outside requests:", reqs)
print("preview from disk: ok")
