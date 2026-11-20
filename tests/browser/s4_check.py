import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, phone_of, show_phone, pick_phone, pick_phone_id, unlock

# Oisin's phone round of 17 Nov (decisions 77 to 79): an operative's request goes to the site
# manager, who forwards it to management or marks it dealt with (phone and desktop); the planner
# on the site manager's phone only shows the plan and asks for people; site instructions for the
# day; the day's site manager with Call now; driving check and profile for the site manager.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(400)
def as_role(page, name):
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name=name).click(); page.wait_for_timeout(500)
def toast(page):
    return page.locator("[aria-live=polite]").last.inner_text()

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)
    dlg = lambda: page.locator("dialog[open]").last
    admin_waiting = lambda: data(page, "db.requests.filter(r => r.status==='Open' && !r.decision && r.heldBy!=='site').length")

    # ── Operative phone: the day's site manager, instructions, Make a request
    go(page, "/site"); show_phone(page, "operative")
    phone = phone_of(page, "operative")
    check("Operative: today's instructions from the site manager sit above the standing ones", "Today's instructions" in phone.inner_text() and "scaffold inspector" in phone.inner_text() and "Eoin Brosnan, 07:35" in phone.inner_text() and phone.inner_text().index("Today's instructions") < phone.inner_text().index("Site instructions"))
    phone.get_by_role("button", name="Site manager: Eoin Brosnan").click(); page.wait_for_timeout(250)
    card = dlg()
    check("Operative: tapping the site manager shows his details and Call now", "Site manager, C719 St Finian's Church" in card.inner_text() and card.locator("a[href^='tel:']", has_text="Call now").count() == 1 and "@" in card.inner_text(), card.inner_text())
    page.screenshot(path=f"{OUT}/400-manager-card.png")
    card.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)
    before = admin_waiting()
    phone.get_by_role("button", name="Make a request").click(); page.wait_for_timeout(250)
    d = dlg()
    check("Operative: the Make a request tile opens Make a request", d.locator("h2").inner_text() == "Make a request")
    d.get_by_label("Describe it").fill("A second wheelbarrow"); d.get_by_role("button", name="Send").click(); page.wait_for_timeout(300)
    rq = data(page, "db.requests[0]")
    check("Operative: the request goes to the site manager, not the office", rq["heldBy"] == "site" and rq["requestedBy"] == "Marek Wiśniewski" and "site manager" in toast(page) and admin_waiting() == before, (rq, toast(page)))
    phone.get_by_role("button", name=re.compile("^My week")).click(); page.wait_for_timeout(250)
    d = dlg()
    btns = d.get_by_role("button", name=re.compile("^Site manager: Eoin Brosnan, C719"))
    check("My week: the site manager is beside the site on each day", d.locator("li").count() == 5 and btns.count() == 5, d.inner_text())
    btns.nth(2).click(); page.wait_for_timeout(250)
    check("My week: tapping him opens his details with Call now", dlg().locator("a[href^='tel:']", has_text="Call now").count() == 1)
    dlg().get_by_role("button", name="Close").click(); page.wait_for_timeout(150)
    dlg().get_by_role("button", name="Close").click(); page.wait_for_timeout(150)
    # The phone app is in English first (Oisin, 20 Nov); other languages per firm come later.
    check("Operative: the app is in English", phone.get_by_role("tab", name="Polski").count() == 0 and page.get_by_role("tab", name="Polski").count() == 0)

    # ── Site manager phone: front page
    show_phone(page, "manager")
    pick_phone(page, "Eoin Brosnan"); page.wait_for_timeout(300)
    phone = phone_of(page, "manager")
    jobs = phone.get_by_role("region", name="My sites today").get_by_role("button")
    check("Site manager: Waiting for you shows the requests from the crew", "2" in phone.get_by_role("button", name=re.compile("^Crew requests")).inner_text(), phone.get_by_role("button", name=re.compile("^Crew requests")).inner_text())
    check("Site manager: driving check and receipt are on the front page, apart from the sites", phone.get_by_role("button", name=re.compile("^Driving check")).count() == 1 and phone.get_by_role("button", name=re.compile("^Receipt")).count() == 1)
    phone.get_by_role("button", name=re.compile("^Driving check")).click(); page.wait_for_timeout(250)
    check("Site manager: the driving check knows his vehicle", "Assigned vehicle" in dlg().inner_text() and dlg().get_by_role("button", name="OK").count() == 10)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    phone.get_by_role("button", name="Me", exact=True).click(); page.wait_for_timeout(250)
    d = dlg()
    check("Site manager: Me at the top left with his details and Sign out", "Eoin Brosnan" in d.inner_text() and d.get_by_role("button", name="Sign out of the app").count() == 1)
    d.get_by_role("button", name="Close").last.click(); page.wait_for_timeout(200)
    phone.get_by_role("button", name=re.compile("^Holidays")).click(); page.wait_for_timeout(250)
    d = dlg()
    d.get_by_label("Reason (optional)").fill("Family wedding")
    d.get_by_role("button", name="Ask for these days").click(); page.wait_for_timeout(300)
    h = data(page, "db.holidays[0]")
    check("Site manager: he can ask for holidays from the Holidays tile", h["personId"] == "p-sm1" and h["status"] == "Requested" and h["note"] == "Family wedding", h)
    d.get_by_role("button", name="Close").last.click(); page.wait_for_timeout(200)

    # ── Inside a job: crew requests
    jobs.first.click(); page.wait_for_timeout(250)
    check("Site manager: inside a job there is no driving check or receipt", phone.get_by_role("button", name=re.compile("^Driving check")).count() == 0 and phone.get_by_role("button", name=re.compile("^Receipt")).count() == 0)
    phone.get_by_role("button", name=re.compile("^Crew requests")).click(); page.wait_for_timeout(250)
    d = dlg()
    lst = d.get_by_role("list", name="Requests from the crew").locator("> li")
    check("Crew requests: both of Marek's requests are in the job", lst.count() == 2 and "Marek Wiśniewski" in lst.first.inner_text())
    page.screenshot(path=f"{OUT}/401-crew-requests.png")
    d.get_by_role("button", name="Forward to management: Two more mortar tubs and a second hawk for the west elevation").click(); page.wait_for_timeout(300)
    r7 = data(page, "db.requests.find(r => r.id==='rq-7')")
    check("Crew requests: forwarding makes it his own request to management, with the operative kept", r7["requestedBy"] == "Eoin Brosnan" and r7["raisedBy"] == "Marek Wiśniewski" and "heldBy" not in r7 and admin_waiting() == before + 1, r7)
    d.get_by_role("button", name="Mark dealt with: A second wheelbarrow").click(); page.wait_for_timeout(300)
    r = data(page, "db.requests.find(r => r.description==='A second wheelbarrow')")
    check("Crew requests: Mark dealt with closes it on site, by him", r["status"] == "Done" and r["dealtBy"] == "Eoin Brosnan" and r["heldBy"] == "site" and admin_waiting() == before + 1, r)
    check("Crew requests: nothing is left waiting, and both show as dealt with", lst.count() == 0 and "With management" in d.inner_text() and "Dealt with on site" in d.inner_text(), d.inner_text())
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)

    # ── Site instructions for the day
    phone.get_by_role("button", name="Site instructions").click(); page.wait_for_timeout(250)
    d = dlg()
    box = d.get_by_label("What the crew needs to know that day")
    check("Instructions: today's are there to change, with who put them up", "scaffold inspector" in box.input_value() and "Put up by Eoin Brosnan" in d.inner_text() and d.get_by_role("button", name="Put up").is_disabled())
    box.fill("Crane on the north side until 15:00. Nobody under the load.")
    d.get_by_role("button", name="Put up").click(); page.wait_for_timeout(300)
    check("Instructions: putting up replaces today's", data(page, "db.dayInstructions.filter(x => x.projectId==='pr-C719' && x.date===day).map(x => x.text)") == ["Crane on the north side until 15:00. Nobody under the load."] and "Up for today" in phone.inner_text())
    phone.get_by_role("button", name="Site instructions").click(); page.wait_for_timeout(250)
    d = dlg()
    d.get_by_role("tab").nth(1).click(); page.wait_for_timeout(200)
    check("Instructions: the next working day starts empty", d.get_by_label("What the crew needs to know that day").input_value() == "")
    d.get_by_label("What the crew needs to know that day").fill("Hard hats in the nave from 08:00.")
    d.get_by_role("button", name="Put up").click(); page.wait_for_timeout(300)
    check("Instructions: one for tomorrow is kept beside today's", data(page, "db.dayInstructions.filter(x => x.projectId==='pr-C719').length") == 2)

    # ── Month ahead: tap a day, see who, ask for someone; nothing edits the plan
    phone.get_by_role("button", name="Month ahead").click(); page.wait_for_timeout(250)
    d = dlg()
    days = data(page, "(() => { const out=[]; let d=new Date(day+'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate()+1) } while (d.getUTCDay()!==1); for (let i=0;i<5;i++){ out.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+1) } return out })()")
    month_now = data(page, "day.slice(0,7)")
    if days[0][:7] != month_now: d.get_by_role("button", name="Later").click(); page.wait_for_timeout(200)
    label = data(page, f"new Date('{days[0]}T12:00:00Z').toLocaleDateString('en-IE', {{ weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }})")
    d.get_by_role("button", name=re.compile("^" + re.escape(label))).click(); page.wait_for_timeout(250)
    planned = d.get_by_role("list", name=re.compile("^Planned ")).locator("> li")
    plan_n = data(page, f"db.plan.filter(p => p.projectId==='pr-C719' && p.date==='{days[0]}').length")
    check("Month ahead: tapping a day lists who is down for it", planned.count() == plan_n and plan_n >= 4 and "Kevin Shortall" in d.inner_text(), (planned.count(), plan_n))
    check("Month ahead: nothing on the phone changes the plan", d.locator("button[aria-label^='Take ']").count() == 0 and d.locator("select").count() == 0 and d.get_by_role("button", name=re.compile("^Request someone for")).count() == 1)
    d.get_by_role("button", name=re.compile("^Request someone for")).click(); page.wait_for_timeout(200)
    who = d.get_by_label("Who do you need?")
    opts = who.locator("option").all_inner_texts()
    check("Request: the list says where each person is that day, free people first", any(o.startswith("Rafael Mendonça") and o.endswith(": free") for o in opts) and any(": on C7" in o for o in opts) and not any(o.startswith("Kevin Shortall") for o in opts), opts[:6])
    rafael = data(page, "db.people.find(p=>p.name==='Rafael Mendonça').id")
    who.select_option(rafael); d.get_by_label("Why (optional)").fill("Lime wash to the vestry")
    plan_before = data(page, "db.plan.length")
    d.get_by_role("button", name="Send request").click(); page.wait_for_timeout(300)
    rq = data(page, "db.requests[0]")
    check("Request: asking for a named person goes to management and leaves the plan alone", rq["personId"] == rafael and rq["neededFrom"] == days[0] and rq["requestedBy"] == "Eoin Brosnan" and "heldBy" not in rq and data(page, "db.plan.length") == plan_before and "Asked for: Rafael Mendonça. Waiting for the office" in d.inner_text(), rq)
    page.screenshot(path=f"{OUT}/402-month-day-request.png")
    d.get_by_role("button", name="Back to the month").click(); page.wait_for_timeout(200)
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)
    phone.get_by_role("button", name="Week ahead").click(); page.wait_for_timeout(250)
    d = dlg()
    check("Week ahead on the phone: the same, to look at and to ask", d.locator("button[aria-label^='Take ']").count() == 0 and d.locator("select").count() == 0 and d.get_by_role("button", name=re.compile("^Request someone for")).count() == 5 and "Asked for: Rafael Mendonça" in d.inner_text())
    d.get_by_role("button", name="Close").click(); page.wait_for_timeout(200)

    # ── The office: Admin answers the person request, and a yes plans a free person
    go(page, "/admin")
    row = main.locator("tr", has_text="Rafael Mendonça on site")
    check("Admin: the request for a named person waits for a yes or no", row.count() == 1 and "Eoin Brosnan" in row.inner_text())
    fwd = main.locator("tr", has_text="Two more mortar tubs")
    check("Admin: the forwarded crew request is there, with who first asked", fwd.count() == 1 and "First asked by Marek Wiśniewski" in fwd.inner_text(), fwd.inner_text() if fwd.count() else "")
    main.get_by_role("button", name="Approve: Rafael Mendonça on site").click(); page.wait_for_timeout(300)
    on = data(page, f"db.plan.filter(p => p.personId==='{rafael}' && p.date==='{days[0]}').map(p => p.projectId)")
    check("Admin: a yes puts a free person on the plan for that day and closes the request", on == ["pr-C719"] and "on the plan" in toast(page) and data(page, "db.requests.find(r => r.description==='Rafael Mendonça on site').status") == "Done", (on, toast(page)))
    go(page, "/schedule", "table")
    cell = page.get_by_role("table", name="Week ahead by site and day").locator(f"td[data-cell='C719 {days[0]}']")
    check("Week ahead: he shows on C719 that day", cell.get_by_role("button", name="Rafael Mendonça: contact details and options").count() == 1)
    go(page, "/projects/requests")
    crew = main.get_by_role("list", name="Requests from the crew").locator("> li")
    check("Requests (office): what is still with a site manager is listed apart, with whose it is and no buttons", crew.count() == 1 and "With Cathal Minogue" in crew.first.inner_text() and crew.get_by_role("button").count() == 0, crew.all_inner_texts())
    side = page.locator("nav[aria-label$='screens']:visible")
    n_open = data(page, "db.requests.filter(r => r.status==='Open').length")
    check("Requests (office): the sidebar number is everything open", side.get_by_role("link", name=f"Requests {n_open}").count() == 1, side.inner_text())

    # ── The operative sees the new instructions; the site manager's own desktop
    go(page, "/site"); show_phone(page, "operative")
    check("Operative: the phone shows the instructions just put up", "Crane on the north side until 15:00" in phone_of(page, "operative").inner_text())
    # A fresh request from his crew, to deal with on the desktop
    phone_of(page, "operative").get_by_role("button", name="Make a request").click(); page.wait_for_timeout(250)
    dlg().get_by_label("Describe it").fill("Spare hi-vis vests"); dlg().get_by_role("button", name="Send").click(); page.wait_for_timeout(300)
    as_role(page, "Site manager")
    go(page, "/site"); unlock(page)
    phone = phone_of(page, "manager")
    check("Site manager signed in: his own phone, with Me", page.get_by_label("Whose phone to look at").count() == 0 and phone.get_by_role("button", name="Me", exact=True).count() == 1)
    go(page, "/projects/requests")
    sec = main.locator("section", has_text="From your crew")
    check("Requests (site manager): From your crew, with Forward and Mark dealt with", sec.count() == 1 and sec.get_by_role("button", name="Forward to management: Spare hi-vis vests").count() == 1 and sec.get_by_role("button", name="Mark dealt with: Spare hi-vis vests").count() == 1)
    mine_open = data(page, "db.requests.filter(r => r.status==='Open' && ['pr-C719','pr-C724'].includes(r.projectId)).length")
    check("Requests (site manager): the sidebar number is his own sites only", page.locator("nav[aria-label$='screens']:visible").get_by_role("link", name=f"Requests {mine_open}").count() == 1, page.locator("nav[aria-label$='screens']:visible").inner_text())
    page.screenshot(path=f"{OUT}/403-requests-site-manager.png", full_page=True)
    sec.get_by_role("button", name="Forward to management: Spare hi-vis vests").click(); page.wait_for_timeout(300)
    r = data(page, "db.requests.find(r => r.description==='Spare hi-vis vests')")
    check("Requests (site manager): forwarding from the desktop does the same", r["requestedBy"] == "Eoin Brosnan" and r["raisedBy"] == "Marek Wiśniewski" and "heldBy" not in r and main.locator("section", has_text="From your crew").count() == 0, r)
    go(page, "/projects/C719?tab=requests")
    check("Project page: the forwarded request reads With the office, first asked by the operative", "First asked by Marek Wiśniewski" in main.inner_text() and "With the office" in main.inner_text())

    # ── Phone width
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(300)
    go(page, "/site"); unlock(page)
    check("Phone width: the site manager's phone does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    phone_of(page, "manager").get_by_role("region", name="My sites today").get_by_role("button").first.click(); page.wait_for_timeout(200)
    phone_of(page, "manager").get_by_role("button", name="Month ahead").click(); page.wait_for_timeout(250)
    box = dlg().bounding_box()
    check("Phone width: the month fits the screen", box["width"] <= 390 and not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"), box)
    go(page, "/projects/requests")
    check("Phone width: Requests does not scroll sideways", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))

errs = []
try:
    errs = run(steps)
except Exception as ex:
    import traceback; traceback.print_exc()
    print("STOPPED EARLY:", str(ex).split("\n")[0][:300])
ok = 0
for name, passed, detail in results:
    if passed: ok += 1
    else: print("FAIL", name, " ", detail[:400])
print("console problems:", errs)
print(f"{ok}/{len(results)} passed")
