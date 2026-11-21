import os, sys, re, shutil, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, FIX

# Easier to put things in, 20 Nov 2026 (decisions 230 to 238). What went: Admin, Connections; the
# Portal, for now, everywhere; the Opened stage of a tender. What came: New request, New variation
# and Add snag in Projects, Requests and variations (and on each project's own tabs); snagging as
# a list that holds the final account until the last snag is fixed; "Final accounts on hold" with
# the reason and what lets each go; and Add invoice in Finance, Money out, which sends an invoice
# to the job's site manager and then the managing director.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(300)
def sign_in_as(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role, exact=True).click(); page.wait_for_timeout(500)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who")
    roles = [" ".join(b.inner_text().split()) for b in page.get_by_role("button").all()]
    check("Sign-in: no Client (portal) level is offered", not any("Client" in r for r in roles) and any("Managing director" in r for r in roles), roles)
    page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main h1"); page.wait_for_timeout(300)
    dlg = lambda: page.locator("dialog[open]").last
    page.get_by_role("button", name="Account menu").click()
    menu = page.get_by_role("menu").inner_text()
    check("Account menu: no Client (portal) to switch to", "Client" not in menu, menu)
    page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(500)
    sections = lambda: [s.strip().split("\n")[0] for s in page.locator("nav[aria-label$=' sections']").get_by_role("link").all_inner_texts()]
    tabs = lambda: [re.sub(r"\s*\d+$", "", s.strip().split("\n")[0]) for s in page.locator("nav[aria-label$=' screens']").get_by_role("link").all_inner_texts()]

    # ── 1. Admin: Connections is gone, and Send the week needs nothing connected
    go(page, "/admin")
    admin = sections()
    check("Admin: no Connections", "Connections" not in admin and "Requests" in admin and "Company holidays" in admin, admin)
    page.goto(BASE + "/admin/connections"); page.wait_for_timeout(500)
    check("Admin: the old Connections address lands on Admin", page.url.endswith("/admin"), page.url)
    conn = data(page, "[db.connections.email && db.connections.email.by, db.connections.whatsapp && db.connections.whatsapp.by]")
    check("Email and WhatsApp are set up by Vardil from the start", conn == ["Vardil", "Vardil"], conn)
    go(page, "/admin/vardil")
    check("Vardil Works: the Portal is not offered as an app to ask about", "Client portal" not in page.locator("main").inner_text())

    # ── 2. The Portal is hidden everywhere
    go(page, "/projects")
    secs = sections()
    check("Projects: Live projects, Not started, Resources today, Completed, Requests and variations, Files; no Portal", secs == ["Live projects", "Not started", "Resources today", "Completed", "Requests and variations", "Files"], secs)
    page.goto(BASE + "/portal"); page.wait_for_timeout(500)
    check("The Portal's address does not open", "/portal" not in page.url, page.url)
    go(page, "/customers")
    check("Customers: no Portal column", "Portal" not in page.locator("main thead").inner_text(), page.locator("main thead").inner_text())
    go(page, "/customers/c-02")
    check("A customer's page: no Client portal line", "Client portal" not in page.locator("main").inner_text())
    go(page, "/invoicing")
    main = page.locator("main")
    row = main.locator("tr", has=page.get_by_role("button", name=re.compile("^Send"))).first
    if row.count():
        row.get_by_role("button", name=re.compile("^Send")).first.click(); page.wait_for_timeout(300)
        check("Send an invoice: no portal tick, email only", "portal" not in dlg().inner_text().lower() and "Email it with the PDF attached" in dlg().inner_text(), dlg().inner_text()[:300])
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
    else:
        check("Send an invoice: a draft to send was found", False)
    go(page, "/invoicing/subcontractor")
    note = page.locator("main").inner_text()
    check("Subcontractor invoices: nothing is said to come through a portal", "portal" not in note.lower(), [l for l in note.split("\n") if "portal" in l.lower()][:3])
    go(page, "/compliance/subcontractors")
    check("Compliance, Subcontractors: no link to a portal", "portal" not in page.locator("main").inner_text().lower())

    # ── 3. Tenders: no Opened stage
    go(page, "/sales")
    cols = [h.inner_text().split("\n")[0].strip() for h in page.locator("main h2").all()]
    cols = [re.sub(r"\s*\d+.*$", "", c) for c in cols]
    check("Board: To quote, Drafting, Sent, Queried, Won; no Opened", cols[:5] == ["To quote", "Drafting", "Sent", "Queried", "Won"], cols)
    check("Board: no tender is Opened in the records", data(page, "db.quotes.filter(q => q.status === 'Opened' || q.openedAt).length") == 0)
    sent = data(page, "db.quotes.filter(q => q.status === 'Sent').length")
    go(page, "/sales/awaiting")
    heads = [re.sub(r"\s*\(\d+\)$", "", h.inner_text().strip()) for h in page.locator("main h2").all()]
    check("Awaiting response: Queried, Due a chase, Sent and waiting, Declined", heads == ["Queried", "Due a chase", "Sent, waiting", "Declined"], heads)
    counts = [int(re.search(r"\((\d+)\)", h.inner_text()).group(1)) for h in page.locator("main h2").all()]
    check("Awaiting response: every sent tender is in one of the two sent groups", counts[1] + counts[2] == sent and counts[1] >= 1, (counts, sent))
    go(page, "/sales/quotes/Q-2613")
    check("A tender's page says nothing of being opened", "Opened by client" not in page.locator("main").inner_text())
    page.screenshot(path=f"{OUT}/1100-board.png")

    # ── 4. Variations and snagging: clearer words, the plus buttons, the snag list
    go(page, "/projects/extras")
    check("The screen is Variations and snagging", page.get_by_role("heading", name="Variations and snagging", level=1).count() == 1 and tabs() == ["Site requests", "Orders and deliveries", "Variations and snagging", "Invoices to approve"], tabs())
    heads = [re.sub(r"\s*\(\d+\)$", "", h.inner_text().strip()) for h in page.locator("main h2").all()]
    check("Three lists: Final accounts on hold, Variations waiting for approval, Open snags", heads == ["Final accounts on hold", "Variations waiting for approval", "Open snags"], heads)
    txt = page.locator("main").inner_text()
    check("C716 says why it is on hold and what lets it go", "On hold because 3 snags are open. It lets go by marking each one fixed." in txt)
    check("C715 says why it is on hold and what lets it go", "On hold because 1 variation is waiting for approval. It lets go by approving or discarding it." in txt)
    check("Nothing on the screen says 'Invoices held' or 'extras'", "Invoices held" not in txt and "extras" not in txt.lower(), [l for l in txt.split("\n") if "extra" in l.lower()][:3])
    check("Both plus buttons are there", page.get_by_role("button", name="New variation").count() == 1 and page.get_by_role("button", name="Add snag").count() == 1)
    page.screenshot(path=f"{OUT}/1101-variations-and-snagging.png", full_page=True)

    # New variation, with the site picked in the box
    before = data(page, "db.variations.filter(v => v.status === 'Draft').length")
    page.get_by_role("button", name="New variation").click(); page.wait_for_timeout(300)
    dlg().get_by_role("button", name="Draft variation").click(); page.wait_for_timeout(200)
    check("New variation: nothing is saved until a site is chosen, and it says so", "Choose the site it is for." in dlg().inner_text() and data(page, "db.variations.filter(v => v.status === 'Draft').length") == before)
    sites = [o.inner_text() for o in dlg().get_by_label("Site", exact=True).locator("option").all()]
    check("New variation: live and finished jobs are offered, not closed ones", any(s.startswith("C720") for s in sites) and any(s.startswith("C716") for s in sites) and not any(s.startswith("C712") for s in sites), sites)
    dlg().get_by_label("Site", exact=True).select_option(label=[s for s in sites if s.startswith("C721")][0])
    dlg().get_by_label("What was found").fill("Wall plate rotten at the north-east corner")
    dlg().get_by_label("Measured extra work").fill("2.4 m oak wall plate, 100 x 75 mm")
    dlg().get_by_label("Estimated value, before VAT").fill("680")
    page.screenshot(path=f"{OUT}/1102-new-variation.png")
    dlg().get_by_role("button", name="Draft variation").click(); page.wait_for_timeout(400)
    v = data(page, "(() => { const v = db.variations[0]; const p = db.projects.find(x => x.id === v.projectId); return [v.status, v.measured, v.estimatedValue, p.code, p.extrasFlag, db.approvals[0].kind, db.approvals[0].status]; })()")
    check("New variation: drafted on the site, waiting in Approvals", v == ["Draft", "2.4 m oak wall plate, 100 x 75 mm", 680, "C721", True, "variation", "Pending"], v)
    check("New variation: it is on the list at once", "2.4 m oak wall plate" in page.locator("main").inner_text() and data(page, "db.variations.filter(v => v.status === 'Draft').length") == before + 1)

    # Add a snag, with a photo
    page.get_by_role("button", name="Add snag").click(); page.wait_for_timeout(300)
    sites = [o.inner_text() for o in dlg().get_by_label("Site", exact=True).locator("option").all()]
    dlg().get_by_label("Site", exact=True).select_option(label=[s for s in sites if s.startswith("C716")][0]); page.wait_for_timeout(200)
    fixers = dlg().get_by_label("Who is to fix it (optional)").locator("option").all_inner_texts()
    check("Add snag: the people who worked on that job are offered to fix it", len(fixers) >= 3 and fixers[0] == "Not decided yet", fixers)
    dlg().get_by_label("What is wrong").fill("Shutter catch missing")
    dlg().get_by_label("Where on the job (optional)").fill("Study")
    dlg().get_by_label("Who is to fix it (optional)").select_option(index=1)
    dlg().get_by_label("Choose a photo of the snag from this device").set_input_files(FIX + "site-photo.jpg"); page.wait_for_timeout(700)
    page.screenshot(path=f"{OUT}/1103-add-snag.png")
    dlg().get_by_role("button", name="Add snag").click(); page.wait_for_timeout(400)
    s = data(page, "(() => { const s = db.snags[0]; return [s.what, s.where, s.from, s.status, !!s.fixBy, !!(s.photo && s.photo.dataUrl.startsWith('data:image/jpeg')), db.snags.filter(x => x.projectId === s.projectId && x.status === 'Open').length]; })()")
    check("Add snag: saved open on C716 with its photo, four open now", s == ["Shutter catch missing", "Study", "client", "Open", True, True, 4], s)
    txt = page.locator("main").inner_text()
    check("Add snag: the hold's reason counts it", "On hold because 4 snags are open." in txt and "Open snags (4)" in txt)
    snags = page.get_by_role("list", name="Snags")
    snags.get_by_role("button", name="See the photo").first.click(); page.wait_for_timeout(300)
    check("A snag's photo opens", dlg().locator("img").count() == 1)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)

    # Mark fixed: the last one lets the final account go; Undo puts it back
    for n in range(3):
        snags.get_by_role("button", name="Mark fixed").first.click(); page.wait_for_timeout(250)
    st = data(page, "(() => { const p = db.projects.find(x => x.code === 'C716'); const f = db.salesInvoices.find(i => i.projectId === p.id && i.description === 'Final account'); return [p.invoiceHold, f.status]; })()")
    check("Three of four fixed: the final account is still on hold", st == [True, "Held"], st)
    snags.get_by_role("button", name="Mark fixed").first.click(); page.wait_for_timeout(300)
    st = data(page, "(() => { const p = db.projects.find(x => x.code === 'C716'); const f = db.salesInvoices.find(i => i.projectId === p.id && i.description === 'Final account'); return [p.invoiceHold, p.snaggingFlag, f.status]; })()")
    check("The last snag fixed lets the final account go, ready to invoice", st == [False, False, "To invoice"], st)
    check("The list of holds drops to one, and no snag is open", "Final accounts on hold (1)" in page.locator("main").inner_text() and "No snag is open" in page.locator("main").inner_text())
    page.get_by_role("button", name="Undo").last.click(); page.wait_for_timeout(300)
    st = data(page, "(() => { const p = db.projects.find(x => x.code === 'C716'); const f = db.salesInvoices.find(i => i.projectId === p.id && i.description === 'Final account'); return [p.invoiceHold, f.status, f.holdReason]; })()")
    check("Undo opens it again and the hold is back", st == [True, "Held", "Snagging open"], st)
    page.get_by_role("button", name=re.compile("^Show \\d+ fixed snag")).click(); page.wait_for_timeout(200)
    check("Fixed snags can be shown, each with Open again", snags.get_by_role("button", name="Open again").count() >= 3)

    # Clear hold asks first
    c716 = page.locator("li", has_text="C716 Glebe House").first
    c716.get_by_role("button", name="Clear hold").click(); page.wait_for_timeout(300)
    check("Clear hold asks first and says what stays open", "Clear the hold on C716?" in dlg().inner_text() and "Still open: 1 snag is open" in dlg().inner_text(), dlg().inner_text()[:300])
    dlg().get_by_role("button", name="Cancel").click(); page.wait_for_timeout(200)
    check("Cancel leaves the hold", data(page, "db.projects.find(x => x.code === 'C716').invoiceHold") is True)
    c716.get_by_role("button", name="Clear hold").click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Confirm, clear the hold").click(); page.wait_for_timeout(300)
    st = data(page, "(() => { const p = db.projects.find(x => x.code === 'C716'); return [p.invoiceHold, db.snags.filter(s => s.projectId === p.id && s.status === 'Open').length, p.audit[p.audit.length - 1].what]; })()")
    check("Confirm clears it, leaves the snag on the list and writes the history", st == [False, 1, "Final account hold cleared by a manager, with 1 snag still open"], st)

    # ── 5. Site requests: New request
    go(page, "/projects/requests")
    check("Site requests has New request", page.get_by_role("heading", name="Site requests", level=1).count() == 1 and page.get_by_role("button", name="New request").count() == 1)
    n = data(page, "db.requests.length")
    page.get_by_role("button", name="New request").click(); page.wait_for_timeout(300)
    sites = [o.inner_text() for o in dlg().get_by_label("Site", exact=True).locator("option").all()]
    check("New request: sites on the go and about to start, and General", any(s.startswith("C726") for s in sites) and sites[-1] == "General, not for one site" and not any(s.startswith("C716") for s in sites), sites)
    dlg().get_by_label("Site", exact=True).select_option(label=[s for s in sites if s.startswith("C722")][0])
    dlg().get_by_label("What kind").select_option(label="Plant to hire")
    dlg().get_by_label("What is needed").fill("3 tonne dumper for the spoil")
    page.screenshot(path=f"{OUT}/1104-new-request.png")
    dlg().get_by_role("button", name="Send request").click(); page.wait_for_timeout(400)
    r = data(page, "(() => { const r = db.requests[0]; return [db.requests.length, r.kind, r.description, db.projects.find(p => p.id === r.projectId).code, r.status, r.requestedBy]; })()")
    check("New request: saved for the site, with the office", r == [n + 1, "hired_plant", "3 tonne dumper for the spoil", "C722", "Open", "Aidan King"], r)
    check("New request: it is in the list", "3 tonne dumper for the spoil" in page.locator("main").inner_text())
    go(page, "/admin")
    check("Admin, Requests: it waits there for a yes or no", "3 tonne dumper for the spoil" in page.locator("main").inner_text())

    # ── 6. A project's own tabs use the same boxes
    go(page, "/projects/C720?tab=requests")
    page.get_by_role("button", name="New request").click(); page.wait_for_timeout(300)
    check("Project, Site requests: New request already knows the site", "C720 Ardmullen House" in dlg().inner_text() and dlg().get_by_label("Site", exact=True).count() == 0)
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    go(page, "/projects/C716?tab=variations")
    txt = page.locator("main").inner_text()
    check("Project, Variations: New variation, Add snag and the job's snag list", page.get_by_role("button", name="New variation").count() == 1 and page.get_by_role("button", name="Add snag").count() == 1 and re.search(r"Snags \(1 open, \d+ fixed\)", txt) is not None, [l for l in txt.split("\n") if l.startswith("Snags")])
    check("Project, Variations: the on or off snagging switch is gone", page.get_by_role("switch", name="Snagging open").count() == 0)
    page.screenshot(path=f"{OUT}/1105-project-variations.png", full_page=True)

    # ── 7. Add invoice: the office puts one in, and it goes up the chain
    sm = data(page, "(() => { const p = db.projects.find(x => x.code === 'C719'); return db.people.find(x => x.id === p.siteManagerId).name; })()")
    go(page, "/invoicing/supplier")
    check("Suppliers: Add invoice, and nothing arrives unread by itself", page.get_by_role("button", name="Add invoice").count() == 1 and "Not read yet" not in page.locator("main").inner_text())
    n = data(page, "db.supplierInvoices.length")
    page.get_by_role("button", name="Add invoice").click(); page.wait_for_timeout(300)
    dlg().get_by_role("button", name="Add and send for approval").click(); page.wait_for_timeout(200)
    check("Add invoice: an empty box is refused in plain words", "Say who the invoice is from." in dlg().inner_text() and data(page, "db.supplierInvoices.length") == n)
    tmp = tempfile.mkdtemp()
    pdf = os.path.join(tmp, "Burren Lime and Stone Supplies BLS-9100 C719.pdf"); shutil.copy(FIX + "cert.pdf", pdf)
    dlg().get_by_label("Choose a copy of the invoice from this device").set_input_files(pdf); page.wait_for_timeout(600)
    got = [dlg().get_by_label("Who it is from").input_value(), dlg().get_by_label("Invoice number").input_value(), dlg().get_by_label("Job", exact=True).locator("option:checked").inner_text()]
    check("Add invoice: who, the number and the job are read from the file's name", got == ["Burren Lime and Stone Supplies", "BLS-9100", "C719 St Finian's Church"], got)
    check("Add invoice: it says what it read and to check it", "Read from the file's name: from Burren Lime and Stone Supplies, number BLS-9100, job C719." in dlg().inner_text())
    dlg().get_by_label("What it is for").fill("Lime putty, 40 tubs")
    box = dlg().get_by_label("Amount before VAT")
    box.fill("800")
    page.wait_for_timeout(200)
    txt = dlg().inner_text()
    check("Add invoice: VAT and the total are worked out", "VAT €184.00. Total €984.00." in txt, [l for l in txt.split("\n") if "Total" in l])
    check("Add invoice: the cost heading follows the wording", dlg().get_by_label("Cost heading").input_value() == "material", dlg().get_by_label("Cost heading").input_value())
    check("Add invoice: it names who it will wait for", f"it waits for {sm}, then the managing director" in txt, [l for l in txt.split("\n") if "waits for" in l])
    page.screenshot(path=f"{OUT}/1106-add-invoice.png")
    dlg().get_by_role("button", name="Add and send for approval").click(); page.wait_for_timeout(600)
    s = data(page, "(() => { const s = db.supplierInvoices[0]; return [db.supplierInvoices.length, s.supplier, s.invoiceNo, s.subtotal, s.total, s.jobRef, s.via, !!s.siteStep, !!s.askedAt, !!(s.copy && s.copy.name.endsWith('C719.pdf')), s.allocations[0].category, s.askedBy]; })()")
    check("Add invoice: saved with its copy, on its job, waiting on the site manager", s == [n + 1, "Burren Lime and Stone Supplies", "BLS-9100", 800, 984, "C719", "email", True, True, True, "material", "Aidan King"], s)
    check("Add invoice: it opens in the list, marked Site manager to approve", "inv=" in page.url and "BLS-9100" in page.locator("main").inner_text() and page.locator("main").get_by_text("Site manager to approve").count() >= 1, page.url)
    page.screenshot(path=f"{OUT}/1107-invoice-added.png")
    # The same invoice twice is refused
    page.get_by_role("button", name="Add invoice").click(); page.wait_for_timeout(300)
    dlg().get_by_label("Who it is from").fill("Burren Lime and Stone Supplies"); dlg().get_by_label("Invoice number").fill("bls-9100")
    dlg().get_by_label("Amount before VAT").fill("10"); dlg().get_by_label("Job", exact=True).select_option(index=1)
    dlg().get_by_role("button", name="Add and send for approval").click(); page.wait_for_timeout(200)
    check("Add invoice: the same invoice is not added twice", "is already on file as F-" in dlg().inner_text() and data(page, "db.supplierInvoices.length") == n + 1, dlg().inner_text()[-300:])
    # A subcontractor's, handed in, saved to check later
    dlg().get_by_label("Who it is from").fill("Corrib Scaffolding"); dlg().get_by_label("Invoice number").fill("CS-INV-9960"); page.wait_for_timeout(200)
    check("Add invoice: a subcontractor on file is recognised", "Corrib Scaffolding is a subcontractor on file" in dlg().inner_text() and dlg().get_by_label("Cost heading").is_disabled())
    dlg().get_by_role("tab", name="Handed in").click()
    dlg().get_by_label("Amount before VAT").fill("450")
    dlg().get_by_role("button", name="Save to check later").click(); page.wait_for_timeout(600)
    s = data(page, "(() => { const s = db.supplierInvoices[0]; return [s.supplier, s.party, s.via, s.askedAt === undefined, s.allocations[0].category]; })()")
    check("Add invoice: saved to check later as the subcontractor's, nobody asked yet", s == ["Corrib Scaffolding", "subcontractor", "hand", True, "labour"], s)
    check("Add invoice: it opens in the subcontractors' list", "/invoicing/subcontractor" in page.url and "CS-INV-9960" in page.locator("main").inner_text(), page.url)

    # The site manager's yes, then the managing director's
    sign_in_as(page, "Site manager"); go(page, "/projects/subcontractor-invoices")
    me = data(page, "db.people.find(p => p.level === 'site' && db.projects.some(x => x.code === 'C719' && x.siteManagerId === p.id)) ? 1 : 0")
    row = page.locator("tr", has_text="BLS-9100")
    if row.get_by_role("button", name="Approve BLS-9100").count():
        row.get_by_role("button", name="Approve BLS-9100").click(); page.wait_for_timeout(200)
        dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(300)
        st = data(page, "(() => { const s = db.supplierInvoices.find(x => x.invoiceNo === 'BLS-9100'); return [s.readStatus, !!s.siteApprovedAt]; })()")
        check("Site manager: the added invoice is on his page, and his yes is his step", st == ["needs_review", True], st)
    else:
        check("Site manager: the added invoice is on his page to approve", False, (me, page.locator("main").inner_text()[:400]))
    check("Site manager: he has no Finance, so he cannot add invoices", page.get_by_role("navigation", name="Apps").get_by_role("link", name="Finance").count() == 0)
    # He can add requests, variations and snags, for his own sites only
    go(page, "/projects/extras")
    page.get_by_role("button", name="Add snag").click(); page.wait_for_timeout(300)
    mine = data(page, "(() => { const me = db.people.find(p => p.level === 'site' && db.projects.some(x => x.code === 'C719' && x.siteManagerId === p.id)); return db.projects.filter(p => p.siteManagerId === me.id || db.siteAccess.some(a => a.personId === me.id && a.projectId === p.id)).filter(p => p.status === 'Live' || p.status === 'Complete').map(p => p.code).sort(); })()")
    offered = sorted(o.inner_text().split(" ")[0] for o in dlg().get_by_label("Site", exact=True).locator("option").all()[1:])
    check("Site manager: Add snag offers only the sites he opens", offered == mine and len(mine) >= 1, (offered, mine))
    page.keyboard.press("Escape"); page.wait_for_timeout(200)
    sign_in_as(page, "Managing director"); go(page, "/admin")
    row = page.locator("tr", has_text="BLS-9100")
    row.get_by_role("button", name=re.compile("^Approve")).click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(300)
    check("Managing director: his yes puts it into job costs, to be paid", data(page, "db.supplierInvoices.find(x => x.invoiceNo === 'BLS-9100').readStatus") == "confirmed")
    go(page, "/invoicing/to-pay")
    check("To be paid: the added invoice is on the office's list", "BLS-9100" in page.locator("main").inner_text())
    go(page, "/admin/activity")
    log = page.locator("main").inner_text()
    check("Activity log: each step is recorded", all(x in log for x in ["Added a supplier's invoice and sent it for approval", "Added a snag", "Marked a snag fixed", "Cleared an invoice hold"]), [x for x in ["Added a supplier's invoice and sent it for approval", "Added a snag", "Marked a snag fixed", "Cleared an invoice hold"] if x not in log])

    # ── 8. Accounts can add invoices too; dark mode; phone width
    sign_in_as(page, "Accounts"); go(page, "/invoicing/supplier")
    check("Accounts: Add invoice is theirs", page.get_by_role("button", name="Add invoice").count() == 1)
    sign_in_as(page, "Managing director")
    page.get_by_role("button", name=re.compile("dark", re.I)).first.click(); page.wait_for_timeout(300)
    go(page, "/projects/extras"); page.screenshot(path=f"{OUT}/1108-variations-dark.png")
    page.get_by_role("button", name=re.compile("light", re.I)).first.click(); page.wait_for_timeout(200)
    page.set_viewport_size({"width": 390, "height": 800})
    wide = []
    for path in ["/projects/extras", "/projects/requests", "/projects/C716?tab=variations", "/invoicing/supplier", "/sales", "/sales/awaiting", "/admin"]:
        go(page, path)
        if page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1"): wide.append(path)
    check("Phone width: none of the changed screens scrolls sideways", wide == [], wide)
    go(page, "/invoicing/supplier")
    page.get_by_role("button", name="Add invoice").click(); page.wait_for_timeout(300)
    check("Phone width: Add invoice fits the screen", page.evaluate("(() => { const d = document.querySelector('dialog[open]'); return d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= window.innerWidth + 1; })()"))
    page.screenshot(path=f"{OUT}/1109-add-invoice-phone.png")
    page.keyboard.press("Escape")
    page.set_viewport_size({"width": 1440, "height": 900})

import traceback
errs = []
try:
    errs = run(steps)
except Exception as e:
    print("STOPPED EARLY:", str(e).split("\n")[0]); traceback.print_exc()
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
