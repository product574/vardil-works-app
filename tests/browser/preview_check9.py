import os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import re
# The single-file preview, opened straight from disk: round eight, 17 Nov (decisions 95 to 99).
FIX = os.path.join(HERE, "fixtures") + os.sep
TMP = tempfile.mkdtemp()
def named(fixture, name):
    path = os.path.join(TMP, name); shutil.copy(FIX + fixture, path); return path
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
    # The to-do on the overview
    page.wait_for_selector("text=ready for you to check")
    assert "One approved reimbursement is waiting to be paid too." in main.inner_text()
    # Fleet: one page, three tabs, three buttons
    bar.get_by_role("link", name="Plant").click(); side.get_by_role("link", name=re.compile("^Fleet")).click(); page.wait_for_selector("table[aria-label='Vehicles on the road']")
    tabs = page.get_by_role("navigation", name="Fleet sections").get_by_role("link")
    assert tabs.all_inner_texts() == ["Vehicle stats", "Vehicle documents", "Repair spend"]
    rows = main.get_by_role("table", name="Vehicles on the road").locator("tbody tr")
    main.get_by_label("Search registration or model").fill("hilux"); page.wait_for_timeout(200)
    assert rows.count() == 2
    main.get_by_label("Search registration or model").fill("")
    main.get_by_role("button", name="Upload document", exact=True).click(); page.wait_for_selector("dialog[open]")
    d = dlg(); d.get_by_label("Choose a proof from this device").set_input_files(named("cert.pdf", "Invoice 231 G 4471 clutch.pdf"))
    page.wait_for_selector("text=The registration 231-G-4471 is in the file's name")
    d.get_by_label("Amount").fill("640"); d.get_by_label("Work done").fill("Clutch and flywheel"); d.get_by_label("Garage").fill("Oranmore Commercials"); d.get_by_label("Town and county").fill("Oranmore, Galway")
    d.locator("button[type=submit]").click(); page.wait_for_selector("text=Repair filed for 231-G-4471")
    main.get_by_role("button", name="Edit vehicle", exact=True).click(); page.wait_for_selector("dialog[open]")
    d = dlg(); d.get_by_label("Find the vehicle by registration or model").fill("242"); d.get_by_role("option").first.click()
    d.get_by_label("Mileage, km").fill("61,250"); d.get_by_role("button", name="Save changes").click(); page.wait_for_selector("text=242-G-915 saved")
    tabs.nth(1).click(); page.wait_for_selector("table[aria-label='Vehicle documents']")
    assert "Clutch and flywheel" in main.inner_text()
    main.get_by_label("Category").select_option("insurance"); page.wait_for_timeout(200)
    assert "Clutch and flywheel" not in main.inner_text()
    tabs.nth(2).click(); page.wait_for_selector("table[aria-label^='Repair spend by vehicle']")
    main.get_by_role("tablist", name="Period").get_by_role("tab", name="1 month").click(); page.wait_for_selector("text=in the last month")
    for name in ["Upload document", "Add vehicle", "Edit vehicle"]:
        assert main.get_by_role("button", name=name, exact=True).count() == 1
    # Payroll: a manager's check before the export; reimbursements ready to pay
    bar.get_by_role("link", name="People").click(); page.wait_for_selector("section[aria-label='Overtime rates']")
    rb = page.locator("section[aria-label='Overtime rates']").bounding_box(); tb = main.locator("table").first.bounding_box()
    assert rb["y"] + rb["height"] <= tb["y"]
    side.get_by_role("link", name=re.compile("^Payroll export")).click(); page.wait_for_selector("text=Not checked yet")
    assert main.get_by_role("button", name="Export hours to Sage Payroll").is_disabled()
    main.get_by_role("button", name="Mark the week as checked").click(); page.wait_for_selector("text=by Aidan King")
    assert main.get_by_role("button", name="Export hours to Sage Payroll").is_enabled()
    side.get_by_role("link", name=re.compile("^Reimbursements")).click(); page.wait_for_selector("table[aria-label='Reimbursements to pay']")
    assert "Darius Kazlauskas" in main.inner_text() and main.locator("pre").inner_text().startswith("Employee No,Surname,Forename,Paid on")
    side.get_by_role("link", name="Attendance history").click(); page.wait_for_selector("table")
    main.get_by_label("Overtime").select_option("double"); page.wait_for_selector("text=at double time only")
    # Invoicing: going out and coming in
    bar.get_by_role("link", name="Invoicing").click(); page.wait_for_selector("text=Invoices going out to clients")
    st = side.inner_text()
    assert "Going out, to clients" in st and "Coming in, from suppliers" in st
    b.close()
print("console errors:", errs)
print("outside requests:", reqs)
print("preview from disk: ok")
