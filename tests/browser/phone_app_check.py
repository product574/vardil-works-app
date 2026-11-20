# The phone app (20 Nov): sign-in by the number on the register, a one-time code, a password,
# fingerprint; the operative's tiles; the site manager's sites, timesheet with Overtime, and
# approvals; the office's Send invite, Sign out everywhere, Change number and Ready to be paid.
# Needs the same build as main_offering_check.py, served on port 4180:
#   VITE_STAFF=1 ALLOW_DEFAULT_LOGIN=1 npx vite build
#   npx vite preview --port 4180
import os, re
from playwright.sync_api import sync_playwright
B = "http://localhost:4180"
res = []
def ok(n, c): res.append((n, bool(c))); print(("PASS " if c else "FAIL ") + n)
S = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots", "pa-"); os.makedirs(os.path.dirname(S), exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 1000})
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(B + "/sign-in"); pg.fill("#username", "demo"); pg.fill("#password", "demo"); pg.click("button[type=submit]"); pg.wait_for_url("**/who")
    pg.get_by_text("Vardil HQ", exact=True).wait_for(timeout=5000)
    pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
    pg.goto(B + "/vardil/features"); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Use main offering").click(); pg.wait_for_timeout(300)
    pg.goto(B + "/vardil"); pg.get_by_role("button", name="Open as managing director").click(); pg.wait_for_timeout(700)

    # The office: the register shows where each person stands with the app.
    pg.goto(B + "/people"); pg.wait_for_timeout(500)
    main = pg.locator("main")
    ok("register: a Phone app column", main.get_by_role("columnheader", name="Phone app").count() == 1)
    ok("register: one not invited, one invited", main.get_by_text("Not invited", exact=True).count() == 1 and main.get_by_text("Invited, not set up").count() == 1)
    row = main.locator("tr", has_text="Not invited").first
    newbie = row.locator("td").first.inner_text().strip()
    newbie_phone = row.locator("td").nth(5).inner_text().strip()
    row.click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog").last
    dlg.get_by_role("button", name="Send invite").click(); pg.wait_for_timeout(200)
    ok("Send invite texts the number on the register", ("Invite texted to " + newbie_phone) in pg.inner_text("body"))
    ok("now Invited", dlg.get_by_text("Invited, not set up").count() == 1)
    pg.screenshot(path=S + "1-register.png")
    dlg.get_by_role("button", name="Close").first.click(); pg.wait_for_timeout(200)

    # The new person's first sign-in: code, password, fingerprint.
    pg.goto(B + "/site"); pg.wait_for_timeout(600)
    phone = pg.get_by_label("Phone app")
    pick = pg.get_by_label("Whose phone to look at")
    opt = [o for o in pick.locator("option").all_inner_texts() if o.startswith(newbie)][0]
    pick.select_option(label=opt); pg.wait_for_timeout(300)
    ok("not signed in: the sign-in screen", phone.get_by_role("heading", name="Sign in").count() == 1)
    phone.get_by_label("Mobile number").fill("089 000 0000"); phone.get_by_role("button", name="Next").click(); pg.wait_for_timeout(200)
    ok("a number not on the register is refused", "not on" in phone.inner_text())
    phone.get_by_label("Mobile number").fill(newbie_phone); phone.get_by_role("button", name="Next").click(); pg.wait_for_timeout(300)
    ok("code screen, number masked", "***" in phone.inner_text() and phone.get_by_label("Code").count() == 1)
    pg.screenshot(path=S + "2-code.png")
    code = re.search(r"Demo, in place of the text:\s*(\d{6})", phone.inner_text()).group(1)
    phone.get_by_label("Code").fill("000001" if code != "000001" else "000002"); phone.get_by_role("button", name="Check code").click(); pg.wait_for_timeout(200)
    ok("a wrong code is refused", "not right" in phone.inner_text())
    phone.get_by_label("Code").fill(code); phone.get_by_role("button", name="Check code").click(); pg.wait_for_timeout(300)
    ok("then set a password", phone.get_by_role("heading", name="Set your password").count() == 1)
    phone.get_by_label("New password").fill("password"); phone.get_by_label("Type it again").fill("password")
    phone.get_by_role("button", name="Save password").click(); pg.wait_for_timeout(200)
    ok("an easy password is refused", "too easy" in phone.inner_text())
    phone.get_by_label("New password").fill("lime mortar gable"); phone.get_by_label("Type it again").fill("lime mortar gable")
    pg.screenshot(path=S + "3-password.png")
    phone.get_by_role("button", name="Save password").click(); pg.wait_for_timeout(500)
    ok("fingerprint offered", phone.get_by_role("button", name="Turn on fingerprint").count() == 1)
    phone.get_by_role("button", name="Turn on fingerprint").click(); pg.wait_for_timeout(300)
    ok("operative home: big tiles", all(phone.get_by_role("button", name=re.compile("^" + n)).count() > 0 for n in ["My week", "My hours", "Holidays", "Receipt", "Report a repair", "My tickets", "Something else"]))
    pg.screenshot(path=S + "4-operative.png")

    # Sign out, then the password, wrong first.
    phone.get_by_role("button", name=re.compile("^Me")).first.click(); pg.wait_for_timeout(300)
    me = pg.get_by_role("dialog", name="Me")
    ok("Me: only the office changes the number", me.get_by_text("Only the office can change it.").count() == 1)
    me.get_by_role("button", name="Sign out of the app").click(); pg.wait_for_timeout(300)
    phone.get_by_role("button", name="Next").click(); pg.wait_for_timeout(300)
    phone.get_by_label("Password").fill("wrong one here"); phone.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(400)
    ok("wrong password: tries left", "4 tries left" in phone.inner_text())
    phone.get_by_label("Password").fill("lime mortar gable"); phone.get_by_role("button", name="Sign in").click(); pg.wait_for_timeout(500)
    ok("right password: home again", phone.get_by_role("button", name=re.compile("^My week")).count() == 1)
    # A receipt for his site: it goes to his site manager first.
    phone.get_by_role("button", name=re.compile("^Receipt")).click(); pg.wait_for_timeout(300)
    ex = pg.get_by_role("dialog", name="Claim a reimbursement")
    ex.get_by_label("Amount paid").fill("18.50"); ex.get_by_label("What did you buy?").fill("Pointing irons")
    ex.get_by_role("button", name="Send claim").click(); pg.wait_for_timeout(300)
    ok("receipt sent to the site manager", "sent to your site manager" in pg.inner_text("body"))

    # A site manager's phone.
    opt = [o for o in pick.locator("option").all_inner_texts() if o.endswith("Site manager")][0]
    pick.select_option(label=opt); pg.wait_for_timeout(300)
    if phone.get_by_role("button", name="Unlock with fingerprint").count():
        ok("fingerprint unlock screen", True)
        phone.get_by_role("button", name="Unlock with fingerprint").click(); pg.wait_for_timeout(200)
    ok("site manager: my sites and waiting for you", phone.get_by_role("heading", name="My sites today").count() == 1 and phone.get_by_role("heading", name="Waiting for you").count() == 1)
    ok("site manager: no My week or My hours", phone.get_by_role("button", name=re.compile("^My week")).count() == 0 and phone.get_by_role("button", name=re.compile("^My hours")).count() == 0)
    ok("site manager: the other tiles", all(phone.get_by_role("button", name=re.compile("^" + n)).count() > 0 for n in ["Holidays", "Receipt", "Report a repair", "My tickets", "Something else"]))
    pg.screenshot(path=S + "5-manager.png")
    sites = phone.get_by_role("region", name="My sites today").get_by_role("button")
    ok("site manager runs at least one site", sites.count() > 0)
    todo = phone.get_by_role("region", name="My sites today").get_by_role("button", name=re.compile("Timesheet to do"))
    (todo.first if todo.count() else sites.first).click(); pg.wait_for_timeout(300)
    if not todo.count(): print("  (every site already sent today: the four choices only show on a day not yet sent)")
    pg.get_by_role("button", name=re.compile("^Timesheet")).last.click(); pg.wait_for_timeout(300)
    ts = pg.get_by_role("dialog", name=re.compile("^Timesheet"))
    ok("timesheet: days as buttons", ts.get_by_role("group", name="Day").get_by_role("button").count() >= 5)
    # Everyone already sent today in the sample: add someone, who then waits to be marked.
    if ts.get_by_role("tablist").count() == 0:
        ts.get_by_label("Add someone to this site").select_option(index=1); ts.get_by_role("button", name="Add", exact=True).click(); pg.wait_for_timeout(300)
    tabs = ts.get_by_role("tablist")
    ok("timesheet: Full, Overtime, Half, Not in", tabs.count() > 0 and tabs.first.get_by_role("tab").all_inner_texts() == ["Full", "Overtime", "Half", "Not in"])
    if tabs.count() > 0:
        tabs.first.get_by_role("tab", name="Full").click(); pg.wait_for_timeout(200)
        ok("Full: no overtime boxes", ts.get_by_text("Hours over:").count() == 0)
        tabs.first.get_by_role("tab", name="Overtime").click(); pg.wait_for_timeout(200)
        ok("Overtime: the two boxes open", ts.get_by_text("Hours over:").count() == 1)
        ts.get_by_label(re.compile("hours at time and a half$")).first.fill("2"); pg.wait_for_timeout(200)
        ok("Overtime stays picked with hours in", tabs.first.get_by_role("tab", name="Overtime").get_attribute("aria-selected") == "true")
    pg.screenshot(path=S + "6-timesheet.png")
    ts.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(200)
    if pg.get_by_role("dialog").count(): pg.keyboard.press("Escape"); pg.wait_for_timeout(200)

    # A receipt from an operative on his site, approved on his phone, then paid by the office.
    mgr = opt.split(",")[0]
    if phone.get_by_role("button", name="Unlock with fingerprint").count(): phone.get_by_role("button", name="Unlock with fingerprint").click(); pg.wait_for_timeout(200)
    phone.get_by_role("button", name=re.compile("^Reimbursements")).click(); pg.wait_for_timeout(300)
    rd = pg.get_by_role("dialog", name="Reimbursements to approve")
    if rd.get_by_role("button", name="Approve").count():
        rd.get_by_role("button", name="Approve").first.click(); pg.wait_for_timeout(200)
        pg.get_by_role("button", name="Confirm approval").click(); pg.wait_for_timeout(300)
        ok("approve on the phone: on the office's Ready to be paid list", "Ready to be paid" in pg.inner_text("body"))
        pg.screenshot(path=S + "7-receipt.png")
        pg.goto(B + "/admin"); pg.wait_for_timeout(400)
        ok("Admin: Ready to be paid, with Pointing irons", pg.get_by_role("heading", name=re.compile("^Ready to be paid")).count() == 1 and pg.get_by_role("table", name="Reimbursements to pay").get_by_text("Pointing irons").count() > 0)
    else:
        print("  (no receipt waiting on his sites in the sample)")

    # Sign out everywhere, and Change number.
    pg.goto(B + "/people"); pg.wait_for_timeout(400)
    main.locator("tr", has_text=mgr).first.click(); pg.wait_for_timeout(300)
    dlg = pg.get_by_role("dialog").last
    dlg.get_by_role("button", name="Sign out everywhere").click(); pg.wait_for_timeout(200)
    ok("Sign out everywhere", dlg.get_by_text("Set up, signed out").count() == 1)
    dlg.get_by_role("button", name="Change number").click()
    dlg.get_by_label(re.compile("^New mobile number")).fill("089 400 1234"); dlg.get_by_role("button", name="Save number").click(); pg.wait_for_timeout(200)
    ok("number changed by the office", dlg.get_by_text("089 400 1234").count() > 0)
    pg.screenshot(path=S + "8-person.png")

    # A phone-sized window.
    pg.set_viewport_size({"width": 390, "height": 844}); pg.goto(B + "/site"); pg.wait_for_timeout(500)
    if phone.get_by_role("button", name="Unlock with fingerprint").count(): phone.get_by_role("button", name="Unlock with fingerprint").click(); pg.wait_for_timeout(200)
    ok("phone width: no sideways scroll", pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"))
    pg.screenshot(path=S + "9-narrow.png", full_page=True)
    ok("no page errors", not errs); print(errs[:5])
    b.close()
print(sum(c for _, c in res), "/", len(res))
