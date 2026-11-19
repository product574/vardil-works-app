import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import re
# The single-file preview, opened straight from disk: round seven, 17 Nov (decisions 89 to 94).
FIX = os.path.join(HERE, "fixtures") + os.sep
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
    # Overtime at time and a half or double time
    bar.get_by_role("link", name="People").click(); page.wait_for_selector("section[aria-label='Overtime rates']")
    assert "After midnight, when the work carries on from the day before" in page.locator("section[aria-label='Overtime rates']").inner_text()
    side.get_by_role("link", name="Attendance history").click(); page.wait_for_selector("text=Overtime x2")
    side.get_by_role("link", name="Payroll export").click(); page.wait_for_selector("text=Overtime hours x1.5,Overtime hours x2")
    # A note with a no
    bar.get_by_role("link", name="Schedule").click(); side.get_by_role("link", name=re.compile("^Holiday requests")).click(); page.wait_for_selector("ul[aria-label='Holiday requests']")
    page.get_by_role("button", name="Decline leave for Paudie Lyne").click(); page.wait_for_selector("dialog[open]")
    dlg().get_by_label("Note (optional)").fill("Scaffold strike that day"); dlg().get_by_role("button", name="Decline leave").click()
    page.wait_for_selector("text=Note: Scaffold strike that day")
    # Email: under a label and out of the Inbox; files on a new email
    bar.get_by_role("link", name="Email").click(); page.wait_for_selector("ul[aria-label^='Inbox emails']")
    rows = main.locator("ul[aria-label^='Inbox emails'] > li")
    rows.filter(has_text="Bernard Mulqueen").get_by_role("checkbox").check()
    main.get_by_role("button", name="Move the selected emails to a label").click(); page.get_by_role("menuitem", name="General").click()
    page.wait_for_selector("text=1 moved to General, out of the inbox")
    assert rows.filter(has_text="Bernard Mulqueen").count() == 0
    page.get_by_role("button", name="Compose").first.click(); page.wait_for_selector("dialog[open]")
    d = dlg(); d.get_by_label("Choose files").set_input_files([FIX + "site-photo.jpg", FIX + "cert.pdf"]); page.wait_for_selector("text=2 of 5 attached.")
    d.get_by_label("To", exact=True).fill("Stephen Aylward"); d.get_by_label("Subject").fill("Photos"); d.get_by_role("button", name="Send").click()
    page.wait_for_selector("text=and 1 more")
    # Roles and access as ticks; who runs a site
    bar.get_by_role("link", name="Admin").click(); side.get_by_role("link", name="Roles and access").click(); page.wait_for_selector("table[aria-label='What each level can see, do and open']")
    assert main.get_by_role("switch").count() == 0 and page.get_by_role("list", name="Access levels").locator("> li").count() == 4
    main.get_by_role("checkbox", name="Site manager: Sales", exact=True).click(); page.wait_for_selector("text=Site manager level now has: Sales")
    side.get_by_role("link", name="Site access").click(); page.wait_for_selector("table[aria-label='Sites each site manager can open']")
    main.get_by_label("Site manager for C720 Ardmullen House").select_option(label="Eoin Brosnan"); page.wait_for_selector("text=Eoin Brosnan now runs C720 Ardmullen House")
    assert "Runs C719, C720 and C724" in page.get_by_role("list", name="Site managers and their sites").inner_text()
    b.close()
print("console errors:", errs)
print("outside requests:", reqs)
print("preview from disk: ok")
