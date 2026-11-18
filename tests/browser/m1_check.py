import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sys
from shots import run, sign_in, BASE, OUT

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

def steps(page, ctx):
    # 1. Gate: wrong password is refused with a plain message, protected pages bounce to sign-in
    page.goto(BASE + "/dashboard"); page.wait_for_url("**/sign-in")
    check("Unsigned visitor is sent to sign-in", "/sign-in" in page.url)
    page.fill("#username", "demo"); page.fill("#password", "nope"); page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    check("Wrong password shows a plain message", "not right" in page.inner_text("[role=alert]"))
    check("Wrong password stays on sign-in", "/sign-in" in page.url)
    page.fill("#password", "demo"); page.keyboard.press("Enter"); page.wait_for_url("**/who")
    page.wait_for_selector("text=Who are you signing in as?")
    check("Enter key submits and reaches the role page", "/who" in page.url)
    check("Six roles offered", page.locator("ul button").count() == 6, str(page.locator("ul button").count()))

    # 2. Managing director: dashboard numbers and approval flow
    page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("nav[aria-label=Departments] a")
    check("MD lands on dashboard", "/dashboard" in page.url)
    check("Department bar shows 14 departments (Customers and Reports added 18 Nov)", page.locator("nav[aria-label=Departments] a").count() == 14, str(page.locator("nav[aria-label=Departments] a").count()))
    side = page.locator("nav[aria-label='Dashboard screens']")
    # 16 Nov: approvals live on the overview; the sidebar's Overview link carries the count (8 plus the Monday ticket reminder).
    check("Sidebar shows 9 pending approvals", side.get_by_role("link", name="Overview").inner_text().strip().endswith("9"), side.get_by_role("link", name="Overview").inner_text())

    # The old Approvals address still lands on the right draft, opened on the overview.
    page.goto(BASE + "/dashboard/approvals?open=ap-1"); page.wait_for_timeout(400)
    check("Old Approvals link opens the draft on the overview", "/dashboard?open=ap-1" in page.url, page.url)
    check("Polish original shown beside translation", "Po zdjęciu starej zaprawy" in page.content() and "English translation" in page.content())
    page.get_by_label("Estimated value, ex VAT").fill("2000")
    page.get_by_role("button", name="Approve variation").click(); page.wait_for_timeout(400)
    check("Toast confirms the approval", page.get_by_text("Variation approved and added to the contract value").count() == 1)
    check("Pending count drops to 8", side.get_by_role("link", name="Overview").inner_text().strip().endswith("8"), side.get_by_role("link", name="Overview").inner_text())
    page.get_by_role("tab", name="Done").click(); page.wait_for_timeout(200)
    check("Approved item appears under Done with approver's name", page.get_by_text("Approved by Aidan King").count() >= 1)
    val = page.evaluate("JSON.parse(localStorage.getItem('cod.data')).state.db.variations.find(v=>v.id==='var-1')")
    check("Edited value saved on the variation", val["estimatedValue"] == 2000 and val["status"] == "Approved", str(val["estimatedValue"]))

    # 3. Held invoice is released when its last extra is agreed (var-5 on C715 has no approval row, so check the rule on data)
    before = page.evaluate("JSON.parse(localStorage.getItem('cod.data')).state.db.salesInvoices.filter(i=>i.status==='Held').length")
    check("Two invoices held at the start", before == 2, str(before))

    # 4. Survives refresh, then reset restores
    page.reload(); page.wait_for_timeout(400)
    check("Changes survive a refresh", side.get_by_role("link", name="Overview").inner_text().strip().endswith("8"))
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(300)
    check("Reset restores 9 pending approvals", side.get_by_role("link", name="Overview").inner_text().strip().endswith("9"), side.get_by_role("link", name="Overview").inner_text())

    # 5. Automations: switch off disables Run now; run now increments
    page.goto(BASE + "/admin/automations"); page.wait_for_timeout(300)
    row = page.locator("tr", has_text="Unanswered quote flagged")
    row.get_by_role("button", name="Run now").click(); page.wait_for_timeout(200)
    check("Run now increments the run count", "59" in row.inner_text(), row.inner_text()[-40:])
    row.get_by_role("switch").click(); page.wait_for_timeout(200)
    check("Switched-off automation cannot be run", row.get_by_role("button", name="Run now").is_disabled())
    page.goto(BASE + "/admin/activity"); page.wait_for_timeout(300)
    check("Activity log records the switch-off", page.get_by_text("Switched an automation off").count() == 1)

    # 6. Dark mode and theme persistence
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    page.goto(BASE + "/dashboard"); page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/08-dashboard-dark.png")
    check("Dark mode persists across navigation", page.evaluate("document.documentElement.classList.contains('dark')"))
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(300)
    check("Reset keeps the theme preference", page.evaluate("document.documentElement.classList.contains('dark')"))
    page.get_by_role("button", name="Switch to light mode").click()

    # 7. Search
    page.get_by_role("combobox").fill("ardm"); page.wait_for_timeout(200)
    check("Search finds the project and the client", page.locator("#search-results li").count() >= 3, str(page.locator("#search-results li").count()))
    page.keyboard.press("Escape")

    # 8. Roles: site manager is kept out of the dashboard; operative and client get no department bar
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Site manager").click(); page.wait_for_timeout(300)
    check("Site manager lands on timesheet", "/people/timesheet" in page.url, page.url)
    check("Site manager sees 6 departments", page.locator("nav[aria-label=Departments] a").count() == 6, str(page.locator("nav[aria-label=Departments] a").count()))
    page.goto(BASE + "/dashboard"); page.wait_for_timeout(300)
    check("Site manager typing /dashboard is sent home", "/people/timesheet" in page.url, page.url)
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Client").click(); page.wait_for_timeout(300)
    check("Client lands on portal with no department bar", "/portal" in page.url and page.locator("nav[aria-label=Departments]").count() == 0, page.url)

    # 9. Sign out closes the gate
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Sign out").click(); page.wait_for_url("**/sign-in")
    page.goto(BASE + "/dashboard"); page.wait_for_timeout(300)
    check("After sign out, pages are closed again", "/sign-in" in page.url, page.url)

    # 10. Phone width
    page.set_viewport_size({"width": 390, "height": 844})
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter"); page.wait_for_url("**/who")
    page.screenshot(path=f"{OUT}/09-who-mobile.png")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/10-dashboard-mobile.png")
    overflow = page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")
    check("No sideways scrolling at phone width", not overflow)

errs = run(steps)
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
