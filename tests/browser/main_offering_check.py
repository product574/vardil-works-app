# The main offering (19 Nov): Vardil HQ packages, the one phone, Admin and the Dashboard.
# Needs a copy built with Vardil HQ and served on port 4180:
#   VITE_STAFF=1 ALLOW_DEFAULT_LOGIN=1 npx vite build
#   npx vite preview --port 4180
import re
from playwright.sync_api import sync_playwright, expect
B="http://localhost:4180"
res=[]
def ok(n,c): res.append((n,bool(c))); print(("PASS " if c else "FAIL ")+n)
import os
S=os.path.join(os.path.dirname(os.path.abspath(__file__)), "shots", "mo-"); os.makedirs(os.path.dirname(S), exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":1440,"height":950})
    errs=[]; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    pg.goto(B+"/sign-in"); pg.fill("#username","demo"); pg.fill("#password","demo"); pg.click("button[type=submit]"); pg.wait_for_url("**/who")
    # Wait for the role page to be drawn: looking straight away failed now and then.
    try: pg.get_by_text("Vardil HQ", exact=True).wait_for(timeout=5000); seen=True
    except Exception: seen=False
    ok("role page shows Vardil HQ", seen)
    pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
    pg.goto(B+"/vardil/features"); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Use main offering").click(); pg.wait_for_timeout(300)
    ok("main offering in use", pg.get_by_text("Now: Main offering").is_visible())
    pg.screenshot(path=S+"1-packages.png")
    nav=pg.get_by_role("navigation", name="Departments")
    ok("HQ still sees every app", nav.get_by_text("Invoicing").count()>0)
    # announcement
    pg.goto(B+"/vardil/announcements"); pg.wait_for_timeout(300)
    pg.get_by_label("Heading").fill("Roster by WhatsApp is here")
    pg.get_by_label("What to say").fill("Send each person their week from Schedule. Connect WhatsApp in Admin, Connections.")
    pg.get_by_role("button", name="Publish").click(); pg.wait_for_timeout(300)
    ok("announcement published", pg.get_by_text("Roster by WhatsApp is here").count()>0)
    # open as MD
    pg.goto(B+"/vardil"); pg.get_by_role("button", name="Open as managing director").click(); pg.wait_for_timeout(700)
    labels=[t.strip() for t in nav.locator("a").all_inner_texts()]
    labels=[l.split("\n")[-1].strip() for l in labels]
    ok("bar is the main offering: "+", ".join(labels), set(labels)=={"Dashboard","Schedule","People","Compliance","Site phone","Admin"})
    ok("Ask AI there for MD", pg.get_by_role("button", name="Ask AI").count()>0)
    ok("dashboard: waiting section", pg.get_by_role("heading", name="Waiting for your yes or no").is_visible())
    ok("dashboard: compliance panel", pg.get_by_text("Stopping work").first.is_visible())
    ok("dashboard: no approvals drafts panel", pg.get_by_role("heading", name="Approvals").count()==0)
    ok("dashboard: no firm at a glance", pg.get_by_text("The firm at a glance").count()==0)
    ok("dashboard: holiday approvals shown", pg.get_by_text("Leave (3)").first.is_visible())
    ok("dashboard: repairs shown", pg.get_by_text("Repairs reported (1)").first.is_visible())
    pg.screenshot(path=S+"2-dashboard.png", full_page=True)
    # Admin sidebar
    pg.goto(B+"/admin"); pg.wait_for_timeout(500)
    side=pg.get_by_role("navigation").first
    txt=pg.get_by_role("navigation", name="Admin screens").inner_text()
    ok("admin: Company holidays, Vardil Works, Repairs; no Automations", all(x in txt for x in ["Company holidays","Vardil Works","Repairs"]) and "Automations" not in txt)
    pg.goto(B+"/admin/automations"); pg.wait_for_timeout(300); ok("automations address goes back to Admin", pg.url.endswith("/admin"))
    # mark paid
    pg.goto(B+"/admin"); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Mark paid").first.click()
    pg.wait_for_timeout(300)
    ok("confirm pop-up for paid", pg.get_by_text("Only mark it paid once the money has gone to them").is_visible())
    pg.get_by_role("button", name="Confirm paid").click(); pg.wait_for_timeout(300)
    ok("one left to pay", pg.get_by_text("Ready to be paid (1)").is_visible())
    pg.screenshot(path=S+"3-requests.png", full_page=True)
    # cert check
    pg.get_by_role("button", name="Check", exact=True).first.click(); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Accept").click(); pg.wait_for_timeout(200)
    ok("certificate accepted, none left", pg.get_by_role("heading", name=re.compile("^Certificates to check")).count()==0)
    # overtime approve
    pg.get_by_role("button", name="Approve: overtime").first.click()
    pg.get_by_role("button", name="Confirm approval").click(); pg.wait_for_timeout(300)
    ok("one overtime claim left", pg.get_by_text("Overtime claims (1)").is_visible())
    # roles grid hides invoicing
    pg.goto(B+"/admin/access"); pg.wait_for_timeout(400)
    grid=pg.get_by_role("table", name="What each level can see, do and open").inner_text()
    ok("roles grid: no Invoicing or Sales rows", "Invoicing" not in grid and "Price and send quotes" not in grid and "Schedule" in grid)
    # Vardil Works page
    pg.goto(B+"/admin/vardil"); pg.wait_for_timeout(400)
    ok("vardil works: announcement", pg.get_by_text("Roster by WhatsApp is here").is_visible())
    ok("vardil works: 6 apps on", pg.get_by_label("Your apps").locator("li").count()==6)
    could=pg.get_by_label("Apps you could add").locator("li")
    ok("vardil works: others to add", could.count()>=10)
    could.filter(has_text="Invoicing").get_by_role("button", name="Ask about this app").click(); pg.wait_for_timeout(300)
    ok("ask about app: thanks badge", pg.get_by_text("Asked. We will be in touch").is_visible())
    pg.screenshot(path=S+"4-vardil-works.png", full_page=True)
    # company holidays
    pg.goto(B+"/admin/bank-holidays"); pg.wait_for_timeout(300)
    ok("company holidays title", pg.get_by_role("heading", name="Company holidays").is_visible())
    ok("only this year and next", pg.get_by_role("radio", name="2025").count()==0 and pg.get_by_text("2025", exact=True).count()==0)
    pg.get_by_label("First day").fill("2026-12-21"); pg.get_by_label("Last day").fill("2027-01-04"); pg.get_by_label("Name", exact=True).first.fill("Christmas closedown")
    pg.get_by_role("button", name="Add closure").click(); pg.wait_for_timeout(300)
    ok("closure listed", pg.get_by_text("Christmas closedown").first.is_visible())
    pg.screenshot(path=S+"5-company-holidays.png", full_page=True)
    # connections + send the week
    pg.goto(B+"/admin/connections"); pg.wait_for_timeout(300)
    pg.get_by_role("button", name="Connect", exact=True).first.click(); pg.get_by_role("button", name="Sign in with Microsoft").click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Connect", exact=True).first.click(); pg.get_by_role("dialog").get_by_role("button", name="Connect", exact=True).click(); pg.wait_for_timeout(200)
    ok("both connected", pg.get_by_text("Connected", exact=True).count()==2)
    pg.goto(B+"/schedule"); pg.wait_for_timeout(500)
    btn=pg.get_by_role("button", name="Send the week")
    ok("send the week button", btn.count()==1)
    for _ in range(3):
        if btn.is_enabled(): break
        pg.get_by_role("button", name="Later week").click(); pg.wait_for_timeout(300)
    if btn.is_enabled():
        btn.click(); pg.wait_for_timeout(300)
        ok("an empty week says so", pg.get_by_text("Nobody is planned this week yet").is_visible())
        pg.get_by_role("button", name="Cancel").last.click(); pg.wait_for_timeout(200)
    else:
        print("  (send disabled: clashes or blocks this week)")
    # phone
    pg.goto(B+"/site"); pg.wait_for_timeout(600)
    # The phone app (20 Nov): one app, home screen by role. tests/browser/phone_app_check.py goes through it in full.
    phone=pg.get_by_label("Phone app")
    ok("one phone", phone.count()==1 and pg.get_by_label("Site manager's phone").count()==0)
    if phone.get_by_role("button", name="Unlock with fingerprint").count(): phone.get_by_role("button", name="Unlock with fingerprint").click(); pg.wait_for_timeout(200)
    for name in ["Report a repair","Receipt","Holidays","My week","My hours","My tickets","Make a request"]:
        ok(f"phone has {name}", phone.get_by_role("button", name=re.compile("^"+name)).count()>0)
    ok("no driving check", phone.get_by_text("Driving check").count()==0)
    pg.screenshot(path=S+"7-phone.png")
    phone.get_by_role("button", name=re.compile("^Report a repair")).click(); pg.wait_for_timeout(300)
    dlg=pg.get_by_role("dialog", name="Report a repair")
    dlg.get_by_role("tab", name="Plant").click()
    dlg.get_by_label("Which plant?").select_option(index=3)
    dlg.get_by_label("Where is it?").fill("C720 yard")
    dlg.get_by_label("What is wrong?").fill("Will not start after the rain")
    pg.screenshot(path=S+"8-repair.png")
    dlg.get_by_role("button", name="Send to the office").click(); pg.wait_for_timeout(300)
    phone.get_by_role("button", name=re.compile("^Holidays")).click(); pg.wait_for_timeout(300)
    hol=pg.get_by_role("dialog", name="Holidays")
    ok("holidays: ask for days", hol.get_by_role("button", name="Ask for these days").count()>0)
    pg.screenshot(path=S+"9-holidays.png")
    hol.get_by_role("button", name="Close").last.click(); pg.wait_for_timeout(200)
    pg.goto(B+"/admin/repairs"); pg.wait_for_timeout(300)
    ok("repair arrived in Admin", pg.get_by_text("Will not start after the rain").is_visible())
    pg.get_by_role("button", name="Take in hand").first.click(); pg.get_by_role("dialog").get_by_role("button", name="Take in hand").click(); pg.wait_for_timeout(200)
    pg.screenshot(path=S+"10-repairs.png")
    # back to HQ, requests listed
    pg.get_by_role("button", name="Back to Vardil HQ").click(); pg.wait_for_url("**/vardil")
    pg.goto(B+"/vardil/requests"); pg.wait_for_timeout(300)
    ok("HQ sees the app request", pg.get_by_text("Invoicing").first.is_visible())
    pg.goto(B+"/vardil/features"); pg.get_by_role("button", name="Use everything").click(); pg.wait_for_timeout(200)
    pg.goto(B+"/vardil"); pg.get_by_role("button", name="Open as managing director").click(); pg.wait_for_timeout(500)
    ok("everything package: Invoicing back", nav.get_by_text("Invoicing").count()>0)
    pg.goto(B+"/site"); pg.wait_for_timeout(500)
    ok("everything: still the one phone app", pg.get_by_label("Phone app", exact=True).count()==1 and pg.get_by_label("Site manager's phone").count()==0)
    ok("no page errors", not errs); print(errs[:5])
    b.close()
print(sum(c for _,c in res),"/",len(res))
