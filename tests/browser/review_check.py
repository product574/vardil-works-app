import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import re
from datetime import date, timedelta
from shots import run, BASE, OUT

# The full review (step 6, November 2026): how holds, final accounts, invoice numbers and the
# written-out sample data behave after the fixes. Runs against the local build like the others.
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(300)
def plus_days(d, n):
    return (date.fromisoformat(d) + timedelta(days=n)).isoformat()

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last

    # ── Holds: a live project's final account is not held yet
    go(page, "/projects/extras")
    t = main.inner_text()
    check("Extras and snagging: counts the final accounts actually held", "2 final accounts held" in t and "Invoices held (2)" in t, t[:200])
    check("Extras and snagging: live projects with extras are named as holds to come", "Still on site, so nothing is held yet" in t and all(c in t for c in ["C719", "C720", "C722"]))
    go(page, "/projects/C719?tab=extras")
    head = page.locator("header").nth(1).inner_text()
    check("Live project: the badge says extras to agree, not invoice held", "Extras to agree" in head and "Invoice held" not in head, head[:200])
    check("Live project: the banner says the final account will be held when the work is complete", "will be held when the work is complete" in main.inner_text() and "Stage payments are not held" in main.inner_text())
    go(page, "/projects/C715?tab=extras")
    check("Finished project: the badge says invoice held, and the banner that the final account is held", "Invoice held" in page.locator("header").nth(1).inner_text() and "The final account is held: extras are waiting to be agreed" in main.inner_text())

    # ── Approvals say what approving does to the money
    go(page, "/dashboard?open=ap-1")
    check("Approvals: a live project's variation goes on the final account later", "billed with the final account when the work is complete" in main.inner_text())
    go(page, "/dashboard?open=ap-11")
    check("Approvals: a finished project's variation releases its held final account", "The final account is held until this is agreed. Approving adds it to the final account and releases it to invoicing." in main.inner_text())

    # ── Discarding the last extra releases the hold
    main.get_by_role("button", name="Discard").click(); page.wait_for_timeout(400)
    day = data(page, "day")
    st = data(page, "(() => { const p = db.projects.find(p=>p.code==='C715'); const f = db.salesInvoices.find(i=>i.projectId===p.id && i.description==='Final account'); return { extras: p.extrasFlag, hold: p.invoiceHold, status: f.status, net: f.net, value: p.value } })()")
    check("Discarding the only extra on C715 releases its final account to invoicing at the contract value", not st["extras"] and not st["hold"] and st["status"] == "To invoice" and st["net"] == st["value"], st)
    go(page, "/projects/C715?tab=history")
    check("C715's history records that no extras are left to agree", "No extras left to agree: final account released" in main.inner_text())

    # ── An extra agreed after the final account went out is billed on its own
    go(page, "/projects/C714?tab=extras")
    main.get_by_role("button", name="Raise an extra").click()
    d = dlg()
    d.get_by_label("What was found").fill("Two flue liners cracked once the cap was off")
    d.get_by_label("Measured extra").fill("2 no. clay flue liners replaced")
    d.get_by_label("Estimated value, ex VAT").fill("1240")
    d.get_by_role("button", name="Raise extra").click(); page.wait_for_timeout(400)
    st = data(page, "(() => { const p = db.projects.find(p=>p.code==='C714'); const f = db.salesInvoices.find(i=>i.projectId===p.id && i.description==='Final account'); return { hold: p.invoiceHold, status: f.status, reason: f.holdReason } })()")
    check("Raising an extra on a finished project holds its final account", st["hold"] and st["status"] == "Held" and st["reason"] == "Extras to be agreed", st)
    main.get_by_role("button", name="Clear the hold").click(); page.wait_for_timeout(300)
    go(page, "/invoicing", "table")
    row = page.locator("tbody tr", has_text="C714")
    row.get_by_role("button", name="Send", exact=True).click(); page.wait_for_timeout(300)
    page.locator("dialog[open]").last.get_by_role("button", name="Send invoice").click(); page.wait_for_timeout(400)
    inv = data(page, "(() => { const f = db.salesInvoices.find(i=>i.projectId==='pr-C714' && i.description==='Final account'); return { no: f.accountsNo, due: f.dueOn, issued: f.issuedOn, status: f.status } })()")
    check("Issuing: the due date follows the client's terms (Ballyfinn Heritage Trust, 45 days)", inv["status"] == "Invoiced" and inv["due"] == plus_days(day, 45), inv)
    check("Issuing: the message names the invoice number and its due date", inv["no"] in page.locator("body").inner_text() and "portal. Due " in page.locator("body").inner_text())
    go(page, "/projects/C714?tab=files&folder=Invoices", "table")
    check("Issuing: the invoice is filed in the project's Invoices folder under its number", page.locator("tbody tr", has_text=f"{inv['no']} Final account.pdf").count() == 1)
    go(page, "/projects/C714?tab=history")
    check("Issuing: the project history says what was invoiced, by its number", f"Invoiced {inv['no']}, final account" in main.inner_text())
    ap = data(page, "db.approvals.find(a=>a.status==='Pending' && a.projectId==='pr-C714' && a.kind==='variation').id")
    go(page, f"/dashboard?open={ap}")
    check("Approvals: after the final account has gone out, approving puts the extra on an invoice of its own", "puts this extra on an invoice of its own" in main.inner_text())
    main.get_by_role("button", name="Approve variation").click(); page.wait_for_timeout(400)
    extra = data(page, "db.salesInvoices.filter(i=>i.projectId==='pr-C714' && i.description.startsWith('Agreed extra')).map(i=>({ net: i.net, status: i.status }))")
    check("Approving it raises a separate invoice for the agreed extra, ready to issue", extra == [{"net": 1240, "status": "To invoice"}], extra)

    # ── Paying a final account closes the job
    go(page, "/invoicing/invoiced", "table")
    no = data(page, "db.salesInvoices.find(i=>i.projectId==='pr-C711' && i.description==='Final account').accountsNo")
    page.locator("tbody tr", has_text=no).get_by_role("button", name="Mark paid").click(); page.wait_for_timeout(400)
    check("Marking the last unpaid invoice on C711 paid closes the project", data(page, "db.projects.find(p=>p.code==='C711').status") == "Closed")
    go(page, "/projects/C711?tab=history")
    check("and its history says so", f"{no} paid: paid in full, project closed" in main.inner_text())
    go(page, "/projects/completed", "table")
    check("Completed list: the paid lychgate job reads Closed", "Closed" in page.locator("tr", has_text="C712").inner_text())

    # ── The invoice reader runs now when asked
    go(page, "/admin/automations", "table")
    page.locator("tr", has_text="Supplier invoice read and costed").get_by_role("button", name="Run now").click(); page.wait_for_timeout(400)
    check("Run now on the reader reads the two invoices waiting, and says so", "2 supplier invoices read, ready to check" in page.locator("body").inner_text() and data(page, "db.supplierInvoices.filter(s=>s.readStatus==='not_read').length") == 0)

    # ── One number per invoice: the accounts number once issued
    go(page, "/invoicing/invoiced", "table")
    firsts = [r.inner_text().split("\n")[0].strip() for r in page.locator("table").last.locator("tbody tr").all()]
    check("Invoiced: every issued invoice goes by its SI number", len(firsts) > 0 and all(f.startswith("SI-") for f in firsts), firsts)

    # ── Schedule
    go(page, "/schedule")
    t = main.inner_text()
    check("Week ahead: counts sites with people on them and names the one with nobody planned", re.search(r"planned across 7 sites\. Nobody is planned yet on C726 Tullyvin Gate Lodge\.", t) is not None, t[:240])
    go(page, "/schedule/month", "table")
    names = [r.inner_text().split("\t")[0] for r in page.locator("tbody tr").all()]
    check("Month ahead: jobs that finished this month still show their days", any("C716" in n for n in names) and any("C717" in n for n in names), names)
    cols = page.locator("thead th")
    idx = [i for i in range(cols.count()) if "bg-accent-soft" in (cols.nth(i).get_attribute("class") or "")]
    today_cell = page.locator("tbody tr", has_text="C722").locator("td").nth(idx[0]).inner_text() if idx else ""
    check("Month ahead: today counts who is planned where nothing is marked yet", today_cell.strip() not in ("", "0"), today_cell)

    # ── People and sales
    go(page, "/people", "table")
    check("Employee register: a site manager is shown on the sites he runs", "C719, C724" in page.locator("tr", has_text="Eoin Brosnan").inner_text())
    go(page, "/sales/enquiries", "table")
    refs = [int(r.inner_text().split("\t")[0].strip().replace("ENQ-", "")) for r in page.locator("tbody tr").all()]
    check("Enquiries: numbered in the order they came in", refs == sorted(refs, reverse=True), refs)
    go(page, "/sales")
    won = page.locator("li", has_text="Q-2610").first.inner_text()
    check("Pipeline: a won quote shows the day it was accepted, not its age", "days" not in won.split("\n")[1], won[:80])

    # ── Plant, fleet, files, portal, about
    go(page, "/plant", "table")
    check("Plant overview: the note counts what is off for repair", "1 off for repair" in main.inner_text())
    go(page, "/plant/register", "table")
    check("A scaffold tower gets a tower inspection, not a lifting examination", "Tower inspection: overdue" in page.locator("tr", has_text="ST3").inner_text())
    go(page, "/plant/documents", "table")
    tax = page.locator("tr", has_text="182-D-40117").filter(has_text="Motor tax").first.inner_text()
    dates = re.findall(r"\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec) \d{4}", tax)
    check("Vehicle papers: a tax disc is dated a year before it runs out", len(dates) == 2 and dates[0].split(" ")[:2] == dates[1].split(" ")[:2] and int(dates[1].split(" ")[2]) == int(dates[0].split(" ")[2]) + 1, tax)
    go(page, "/projects/C712?tab=files")
    check("Files: a closed job keeps its folders, on its own page", "C712 Rathdoon Lychgate" in main.inner_text() and main.locator("ul li button").count() == 8 and main.locator("ul li button", has_text="Invoices").count() == 1)
    go(page, "/portal")
    t = main.inner_text()
    check("Portal: a handover pack waiting for approval is not shown to the client", "C717 Handover pack.pdf" not in t and "C710 Handover pack.pdf" in t)
    check("Portal: the client's question keeps its own full stop", "winter.\"." not in t and "winter.\" We will" in t)
    go(page, "/settings/about")
    check("About: the local copy says nothing leaves the browser", "Nothing you do here is sent anywhere" in main.inner_text())
    go(page, "/nowhere-at-all")
    check("An address with no screen says so plainly", "There is no screen here" in main.inner_text())
    page.screenshot(path=f"{OUT}/140-not-found.png")

    # ── The search box on a computer: a box in the bar, no magnifier button
    go(page, "/dashboard")
    head = page.locator("header").first
    check("Computer: the search box shows in the bar and there is no magnifier button", head.locator("input[type=search]").is_visible() and not head.get_by_role("button", name="Search", exact=True).is_visible())
    head.locator("input[type=search]").fill("C719"); page.wait_for_timeout(150)
    opts = page.locator("#search-results [role=option]")
    check("Computer: the managing director's results end with an Ask AI line holding the words typed", opts.count() >= 2 and opts.first.inner_text().startswith("C719") and opts.last.inner_text().startswith("Ask AI") and '"C719"' in opts.last.inner_text(), [o.inner_text() for o in opts.all()])
    head.locator("input[type=search]").fill("zzqx"); page.wait_for_timeout(150)
    check("Computer: with nothing matching, the managing director is told no record matches and offered Ask AI", 'No record matches "zzqx".' in page.locator("#search-results").inner_text() and opts.count() == 1)
    head.locator("input[type=search]").press("Escape")

    # ── The search box on a phone: a magnifier that opens the search across the bar (Aodhan's choice A, 16 Nov)
    oops = []
    for role in ["Managing director", "Site manager"]:
        c = ctx.browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        ph = c.new_page()
        ph.on("pageerror", lambda e: oops.append(f"pageerror: {e}"))
        ph.goto(BASE + "/"); ph.wait_for_url("**/sign-in")
        ph.fill("#username", "demo"); ph.fill("#password", "demo"); ph.click("button[type=submit]")
        ph.wait_for_url("**/who"); ph.get_by_role("button", name=role).click(); ph.wait_for_selector("main"); ph.wait_for_timeout(300)
        bar = ph.locator("header").first
        mag = bar.get_by_role("button", name="Search", exact=True)
        box = bar.locator("input[type=search]")
        logo = bar.get_by_role("link", name=re.compile(", home$"))
        ask = bar.get_by_role("button", name="Ask AI", exact=True)
        md = role == "Managing director"
        tag = "Phone, managing director" if md else "Phone, site manager"
        check(f"{tag}: the bar shows a magnifier, not a squashed search box", mag.is_visible() and not box.is_visible() and logo.is_visible())
        if md:
            check(f"{tag}: Ask AI keeps its own button beside the magnifier", ask.is_visible())
            ph.screenshot(path=f"{OUT}/141-phone-bar.png")
        mag.click(); ph.wait_for_timeout(200)
        bb = box.bounding_box() or {"width": 0}
        check(f"{tag}: tapping the magnifier opens the search across the bar, ready to type", box.is_visible() and bb["width"] > 250 and ph.evaluate("document.activeElement && document.activeElement.type") == "search", bb)
        check(f"{tag}: while searching, the logo, Ask AI and the account button step aside and Cancel shows", not logo.is_visible() and not ask.is_visible() and not bar.get_by_role("button", name="Account menu").is_visible() and bar.get_by_role("button", name="Cancel").is_visible())
        box.fill("C719"); ph.wait_for_timeout(200)
        opts = ph.locator("#search-results [role=option]")
        texts = [o.inner_text() for o in opts.all()]
        if md:
            check(f"{tag}: the result shows, with the Ask AI line last", len(texts) >= 2 and texts[0].startswith("C719") and texts[-1].startswith("Ask AI"), texts)
            ph.screenshot(path=f"{OUT}/142-phone-search.png")
        else:
            check(f"{tag}: the result shows, and there is no Ask AI line", len(texts) >= 1 and texts[0].startswith("C719") and not any(t.startswith("Ask AI") for t in texts), texts)
            box.fill("zzqx"); ph.wait_for_timeout(150)
            check(f"{tag}: with nothing matching, it suggests what to search for", "Try a site code, a name or a quote number." in ph.locator("#search-results").inner_text())
            box.fill("C719"); ph.wait_for_timeout(150)
        check(f"{tag}: no sideways scroll while searching", ph.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        opts.first.click(); ph.wait_for_url("**/projects/C719**"); ph.wait_for_timeout(200)
        check(f"{tag}: picking a result opens it and puts the bar back as it was", mag.is_visible() and not box.is_visible() and logo.is_visible())
        mag.click(); bar.get_by_role("button", name="Cancel").click(); ph.wait_for_timeout(150)
        check(f"{tag}: Cancel puts the bar back as it was", mag.is_visible() and not box.is_visible() and logo.is_visible() and (ask.is_visible() if md else ask.count() == 0))
        c.close()
    check("Phone: no page errors", oops == [], oops)

errs = []
try:
    errs = run(steps)
except Exception as ex:
    print("STOPPED EARLY:", str(ex).split("\n")[0][:400])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail[:300]}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
