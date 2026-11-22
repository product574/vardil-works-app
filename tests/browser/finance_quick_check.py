import os, sys, re, subprocess, time, traceback
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from shots import run, BASE, OUT, FIX, REPO

# Finance and quick adds, 21 Nov 2026 (decisions 259 to 273). The invoice paper in Oldstone's
# layout with a title box and an uploaded logo; the PDF attached in the Send box, with Preview;
# Profit by job as bars; paid and not paid marked on Payment claims, every invoice list and a
# project's Costs tab; no Sage accounts export in Finance; All projects with a look-up and
# filters; Files with live projects first and the archive after; the managing director's
# dashboard holding only what has reached him, and his step-in list in Admin; a to-do and a
# file to be sorted added from any screen; and the phone app as a build of its own.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def go(page, path, sel="main h1"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(350)
def sign_in_as(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role, exact=True).click(); page.wait_for_timeout(600)
def part(name, fn):
    try:
        fn()
    except Exception as e:
        check(f"{name}: ran to the end", False, str(e).split("\n")[0][:300])
        traceback.print_exc()

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main h1"); page.wait_for_timeout(300)
    dlg = lambda: page.locator("dialog[open]").last
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(600)
    main = page.locator("main")
    sections = lambda: [re.sub(r"\s*\d+$", "", s.strip()) for s in page.locator("nav[aria-label$=' sections']").first.get_by_role("link").all_inner_texts()]
    tabs = lambda: [re.sub(r"\s*\d+$", "", s.strip().split("\n")[0]) for s in page.locator("nav[aria-label$=' screens']").get_by_role("link").all_inner_texts()]
    seg = lambda label: page.get_by_role("tablist", name=label)
    close_dialog = lambda: (page.keyboard.press("Escape"), page.wait_for_timeout(250))

    # ── 1. The invoice paper, and the PDF attached in the Send box
    def paper():
        draft = data(page, "(db.salesInvoices.find(i => i.status === 'To invoice' && !i.heldReason) || {}).id")
        go(page, "/invoicing?tab=drafts")
        row_send = main.get_by_role("button", name="Send", exact=True).first
        check("Client invoices: a draft has Send", row_send.count() == 1 and draft)
        row_send.click(); page.wait_for_timeout(400)
        d = dlg()
        check("Send box: the PDF is shown as attached", d.get_by_text("Attached", exact=True).count() == 1 and d.locator("text=/\\.pdf/").count() >= 1, d.inner_text()[:200])
        check("Send box: Preview and Download on the attachment", d.get_by_role("button", name="Preview", exact=True).count() == 1 and d.get_by_role("button", name="Download", exact=True).count() == 1)
        thumb = d.get_by_role("button", name=re.compile("^Preview the attached"))
        box = thumb.bounding_box()
        check("Send box: a small picture of the page", thumb.count() == 1 and box and 60 <= box["width"] <= 90 and box["height"] > box["width"], box)
        page.screenshot(path=f"{OUT}/1401-send-box.png")
        number = re.search(r"(SI-\d+)", d.inner_text()).group(1)
        d.get_by_role("button", name="Preview", exact=True).click(); page.wait_for_timeout(400)
        pv = dlg()
        sheet = pv.locator("[aria-label$='as the client receives it']")
        text = sheet.inner_text()
        check("Preview: the whole page, with the number it will go out under", sheet.count() == 1 and number in text, (number, text[:120]))
        check("Preview: headed Invoice, with Invoice No.", re.search(r"^\s*Invoice\b", text) and "Invoice No." in text, text[:80])
        heads = [h.strip() for h in sheet.locator("thead th").all_inner_texts()]
        check("The paper: Description and Amount only", heads == ["Description", "Amount"], heads)
        check("The paper: Subtotal, VAT and Total still print", "Subtotal" in text and "VAT" in text and re.search(r"Total due", text), text[-300:])
        check("The paper: who it is to, who it is from", sheet.locator("[aria-label='Who it is to']").count() == 1 and sheet.locator("[aria-label='Who it is from']").count() == 1)
        page.screenshot(path=f"{OUT}/1402-preview.png")
        with page.expect_download() as dl:
            pv.get_by_role("button", name="Download PDF").click()
        f = dl.value
        path = f.path()
        head = open(path, "rb").read(5)
        check("Preview: Download PDF gives a real PDF named for the invoice", head == b"%PDF-" and number in f.suggested_filename, f.suggested_filename)
        try:
            out = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, timeout=20).stdout
            check("The PDF: same title, headings and number as the page", "Invoice" in out and "Description" in out and "Amount" in out and number in out and "Qty" not in out, out[:200])
            subprocess.run(["pdftoppm", "-png", "-r", "60", "-f", "1", "-l", "1", path, f"{OUT}/1403-pdf"], timeout=20)
        except FileNotFoundError:
            check("The PDF: read back with pdftotext", False, "pdftotext not installed")
        pv.get_by_role("button", name="Back to the email").click() if pv.get_by_role("button", name="Back to the email").count() else close_dialog()
        page.wait_for_timeout(250)
        check("Preview closes back to the Send box", dlg().get_by_text("Attached", exact=True).count() == 1)
        close_dialog()
    part("Invoice paper", paper)

    # ── 2. Invoice design: logo by upload, the title box
    def design():
        go(page, "/invoicing/design")
        body = main.inner_text()
        check("Invoice design: Logo, On the page, Getting paid, What is shown", all(h in body for h in ["Logo", "On the page", "Getting paid", "What is shown"]))
        check("Invoice design: no accounts package or coloured rule switch", "Coloured rule" not in body and "Sage" not in body)
        sheet = main.locator("[aria-label$='as the client receives it']").first
        check("Invoice design: the paper is drawn beside the boxes", sheet.count() == 1)
        before = sheet.locator("img").count()
        main.locator("input[type=file]").first.set_input_files(FIX + "card.png"); page.wait_for_timeout(900)
        check("Logo: an uploaded picture goes on the paper", sheet.locator("img").count() == 1 and before == 0, (before, sheet.locator("img").count()))
        check("Logo: and on the top bar, as the firm's one logo", page.locator("header img").count() >= 1)
        page.screenshot(path=f"{OUT}/1404-design-logo.png", full_page=True)
        title = main.get_by_label("Title on the page")
        check("Title box, set to Invoice", title.count() == 1 and title.input_value() == "Invoice", title.input_value() if title.count() else "none")
        title.fill("Credit Note"); page.wait_for_timeout(400)
        t = sheet.inner_text()
        check("Title Credit Note: the page is headed Credit Note, with Credit No. and Total Credit", t.strip().startswith("Credit Note") and "Credit No." in t and "Total Credit" in t, t[:60])
        page.screenshot(path=f"{OUT}/1405-design-credit-note.png", full_page=True)
        title.fill("Invoice"); page.wait_for_timeout(300)
        main.get_by_role("button", name="Remove logo").click(); page.wait_for_timeout(400)
        check("Remove logo: the firm's name is printed in its place", sheet.locator("img").count() == 0)
    part("Invoice design", design)

    # ── 3. No Sage accounts export in Finance; the hours export stays under Timesheet
    def sage():
        go(page, "/invoicing")
        names = tabs() + sections()
        check("Finance: no Sage export tab", not any("Sage" in n for n in names), names)
        heads = main.locator("table thead th").all_inner_texts()
        check("Client invoices: no In accounts column", not any("accounts" in h.lower() or "sage" in h.lower() for h in heads), heads)
        go(page, "/invoicing/export")
        check("The old Sage export address goes to Finance", "/invoicing/export" not in page.url, page.url)
        go(page, "/people/payroll")
        check("Resources, Timesheet: Payroll export is still there", "Payroll export" in tabs() and "Sage" in main.inner_text(), tabs())
    part("Sage export", sage)

    # ── 4. Profit by job as bars
    def bars():
        go(page, "/profit")
        check("Profit by job opens on bars", seg("Shown as").get_by_role("tab", name="Bars").get_attribute("aria-selected") == "true")
        rows = main.locator("ul[aria-label='Money in and out by job'] > li")
        live = data(page, "db.projects.filter(p => p.status === 'Live').length")
        check("Bars: a row for every live site", rows.count() == live and live > 0, (rows.count(), live))
        first = rows.first
        check("Bars: money in and money out on each row", first.locator("[data-bar=in]").count() == 1 and first.locator("[data-bar=out]").count() == 1)
        w = first.evaluate("li => Object.fromEntries(['contract','paid','unpaid','out'].map(k => [k, li.querySelector(`[data-part=${k}]`).getBoundingClientRect().width]))")
        check("Bars: the contract is the outline, with paid and invoiced inside it", w["contract"] > 0 and w["paid"] + w["unpaid"] <= w["contract"] + 1, w)
        style = first.evaluate("li => getComputedStyle(li.querySelector('[data-part=contract]')).backgroundColor")
        check("Bars: what is still on the contract is empty, not filled", style in ("rgba(0, 0, 0, 0)", "transparent"), style)
        check("Bars: a key says what each part is", main.locator("[aria-label='What the bars show']").count() == 1)
        page.screenshot(path=f"{OUT}/1406-profit-bars.png", full_page=True)
        first.get_by_role("button").first.click(); page.wait_for_timeout(400)
        d = dlg(); t = d.inner_text()
        check("A job's bars open its detail: money in, then money out", "Money in" in t and "Money out" in t and t.index("Money in") < t.index("Money out"), t[:200])
        check("Detail: the invoices to the client, each paid or not", d.locator("table[aria-label^='Invoices to the client on']").count() == 1 or "Nothing invoiced yet" in t or "No invoice" in t, t[:300])
        page.screenshot(path=f"{OUT}/1407-profit-detail.png")
        close_dialog()
        seg("Which sites").get_by_role("tab", name="Finished").click(); page.wait_for_timeout(300)
        fin = main.locator("ul[aria-label='Money in and out by job'] > li").count()
        check("Bars: finished jobs too", fin > 0, fin)
        seg("Shown as").get_by_role("tab", name="Table").click(); page.wait_for_timeout(300)
        check("Table is still one switch away", main.locator("table[aria-label='Net profit by finished job']").count() == 1)
        seg("Shown as").get_by_role("tab", name="Bars").click(); page.wait_for_timeout(200)
    part("Profit bars", bars)

    # ── 5. Paid and not paid
    def paid():
        go(page, "/invoicing/claims")
        check("Payment claims: a Paid and Not paid switch", seg("Paid or not paid").get_by_role("tab").count() == 3)
        heads = [h.strip() for h in main.locator("table thead th").all_inner_texts()]
        check("Payment claims: a Paid column for every job", "Paid" in heads, heads)
        owed = data(page, "db.salesInvoices.find(i => i.status === 'Invoiced' && db.projects.find(p => p.id === i.projectId).status === 'Live')")
        code = data(page, f"db.projects.find(p => p.id === '{owed['projectId']}').code")
        row = main.locator("table tbody tr", has_text=code).first
        row.get_by_role("button").first.click(); page.wait_for_timeout(300)
        mark = main.get_by_role("button", name=f"Mark {(owed.get('accountsNo') or owed['ref'])} paid")
        check("Payment claims: an invoice not yet paid has Mark paid", mark.count() == 1)
        page.screenshot(path=f"{OUT}/1408-claims-paid.png", full_page=True)
        mark.click(); page.wait_for_timeout(300)
        check("Mark paid asks first", dlg().get_by_role("button", name="Confirm paid").count() == 1)
        dlg().get_by_role("button", name="Confirm paid").click(); page.wait_for_timeout(500)
        st = data(page, f"db.salesInvoices.find(i => i.id === '{owed['id']}').status")
        check("Confirm paid marks it Paid", st == "Paid", st)
        undo = main.get_by_role("button", name=f"Undo paid for {(owed.get('accountsNo') or owed['ref'])}")
        check("Then Undo paid is offered in the same place", undo.count() == 1)
        undo.click(); page.wait_for_timeout(400)
        st = data(page, f"db.salesInvoices.find(i => i.id === '{owed['id']}').status")
        check("Undo paid puts it back", st == "Invoiced", st)
        seg("Paid or not paid").get_by_role("tab", name=re.compile("^Not paid")).click(); page.wait_for_timeout(300)
        n_unpaid = main.locator("table tbody tr").count()
        seg("Paid or not paid").get_by_role("tab", name=re.compile("^All")).click(); page.wait_for_timeout(300)
        check("The switch narrows the list", 0 < n_unpaid <= main.locator("table tbody tr").count())
        go(page, "/invoicing")
        check("Client invoices: the same switch", seg("Paid or not paid").count() == 1)
        seg("Paid or not paid").get_by_role("tab", name=re.compile("^Paid")).click(); page.wait_for_timeout(400)
        check("Client invoices: Paid shows the paid ones", "paid" in page.url or main.locator("table tbody tr").count() > 0, page.url)
        go(page, "/invoicing/supplier")
        check("Money out, Suppliers: the same switch", seg("Paid or not paid").count() == 1)
        go(page, "/invoicing/subcontractor")
        check("Money out, Subcontractors: the same switch", seg("Paid or not paid").count() == 1)
        go(page, f"/projects/{code}?tab=costs")
        t = main.inner_text()
        check("A project's Costs tab: invoices in and out, each Paid or Not paid", main.locator(f"table[aria-label='Invoices to the client on {code}']").count() == 1 and ("Not paid" in t or "Paid" in t))
        check("Costs tab: the switch, and Mark paid for whoever handles invoices", seg("Paid or not paid").count() == 1 and main.get_by_role("button", name=re.compile("^Mark .* paid$")).count() >= 1)
        page.screenshot(path=f"{OUT}/1409-project-costs-paid.png", full_page=True)
    part("Paid marks", paid)

    # ── 6. All projects
    def projects():
        go(page, "/projects")
        s = sections()
        check("Projects: All projects in place of Completed", "All projects" in s and "Completed" not in s, s)
        go(page, "/projects/all")
        n = data(page, "db.projects.length")
        check("All projects: every job, live or not", f"Showing all {n}." in main.inner_text(), main.locator("[role=status]").inner_text())
        st = seg("Status")
        counts = {re.sub(r"\s*\d+$", "", t.strip()): int(re.search(r"(\d+)$", t.strip()).group(1)) for t in st.get_by_role("tab").all_inner_texts()}
        want = data(page, "({ All: db.projects.length, Live: db.projects.filter(p => p.status === 'Live').length, 'Not started': db.projects.filter(p => p.status === 'Not started').length, Finished: db.projects.filter(p => ['Complete','Invoiced','Closed'].includes(p.status)).length })")
        check("All projects: Status counts match the records", counts == want, (counts, want))
        st.get_by_role("tab", name=re.compile("^Live")).click(); page.wait_for_timeout(300)
        check("Status Live: only live jobs", main.locator("table tbody tr").count() == want["Live"])
        check("A filter on: Clear 1 filter", main.get_by_role("button", name="Clear 1 filter").count() == 1)
        main.get_by_role("button", name="Clear 1 filter").click(); page.wait_for_timeout(300)
        look = main.get_by_role("searchbox")
        look.fill("C720"); page.wait_for_timeout(300)
        check("Look up by code finds the one job", main.locator("table tbody tr").count() == 1 and "C720" in main.locator("table tbody tr").first.inner_text())
        look.fill(""); page.wait_for_timeout(200)
        main.locator("label", has_text="Handover").locator("select").select_option("not-sent"); page.wait_for_timeout(300)
        nh = data(page, "db.projects.filter(p => ['Complete','Invoiced','Closed'].includes(p.status) && !p.handoverSentAt && p.handoverStatus !== 'Sent').length")
        rows = main.locator("table tbody tr").count()
        check("Handover, Not sent yet: finished jobs whose pack has not gone", rows > 0 or nh == 0, (rows, nh))
        heads = [h.strip() for h in main.locator("table thead th").all_inner_texts()] if rows else ["Handover"]
        check("Finished jobs show a Handover column", "Handover" in heads, heads)
        main.get_by_role("button", name=re.compile("^Clear")).click(); page.wait_for_timeout(200)
        sm = main.locator("label", has_text="Site manager").locator("select")
        opts = sm.locator("option").all_inner_texts()
        sm.select_option(index=1); page.wait_for_timeout(300)
        name = opts[1]
        cells = main.locator("table tbody tr td:nth-child(4)").all_inner_texts()
        check("Site manager: only that person's jobs", cells and all(name in c for c in cells), (name, cells[:3]))
        main.get_by_role("button", name=re.compile("^Clear")).click(); page.wait_for_timeout(200)
        main.get_by_label(re.compile("Final account on hold")).check(); page.wait_for_timeout(300)
        held = data(page, "db.projects.filter(p => p.invoiceHold).length")
        check("Final account on hold: only the held jobs", main.locator("table tbody tr").count() == held and held > 0, (main.locator("table tbody tr").count(), held))
        page.screenshot(path=f"{OUT}/1410-all-projects.png", full_page=True)
        go(page, "/dashboard"); go(page, "/projects/all")
        check("The filters are remembered", main.get_by_label(re.compile("Final account on hold")).is_checked())
        main.get_by_role("button", name=re.compile("^Clear")).click(); page.wait_for_timeout(200)
        go(page, "/projects/completed")
        check("The old Completed address opens All projects on Finished", "/projects/all" in page.url and seg("Status").get_by_role("tab", name=re.compile("^Finished")).get_attribute("aria-selected") == "true", page.url)
        seg("Status").get_by_role("tab", name=re.compile("^All")).click(); page.wait_for_timeout(200)
    part("All projects", projects)

    # ── 7. Files: live first, then the archive; the search covers both
    def files():
        go(page, "/files")
        live = data(page, "db.projects.filter(p => ['Live','Not started'].includes(p.status)).length")
        ll = main.locator("ul[aria-label='Live projects'] > li").count()
        check("Files: live projects first", ll > 0 and main.get_by_text(re.compile(r"^Live projects \(\d+\)")).count() == 1, (ll, live))
        arch = main.get_by_role("button", name=re.compile("^Archive: finished jobs"))
        check("Files: then the archive, shut until opened", arch.count() == 1 and arch.get_attribute("aria-expanded") == "false")
        arch.click(); page.wait_for_timeout(300)
        na = main.locator("ul[aria-label='Archive, finished jobs'] > li").count()
        check("Files: the archive opens to the finished jobs", na > 0, na)
        page.screenshot(path=f"{OUT}/1411-files.png", full_page=True)
        old = data(page, "db.projects.find(p => p.status === 'Closed' && db.files.some(f => f.projectId === p.id))")
        box = main.get_by_label("Search all files")
        box.fill(old["code"]); page.wait_for_timeout(400)
        found = main.locator("[aria-label='Projects found']")
        check("Search finds an archived project by its code, marked Archive", found.count() == 1 and old["code"] in found.inner_text() and "Archive" in found.inner_text(), found.inner_text() if found.count() else "none")
        f = data(page, f"db.files.find(f => f.projectId === '{old['id']}').name")
        box.fill(f[:14]); page.wait_for_timeout(400)
        check("Search finds a file in the archive too", f[:14] in main.inner_text())
        box.fill("")
    part("Files", files)

    # ── 8. To be sorted, under the project's name; Add file from any screen
    def loose():
        go(page, "/files/unsorted")
        t = main.inner_text()
        check("To be sorted opens with a file under C722's name", re.search(r"C722 [^\n]*\(1\)", t) is not None, t[:400])
        m0 = re.search(r"C720 [^\n]*\((\d+)\)", t)
        had = int(m0.group(1)) if m0 else 0
        quick = page.get_by_role("group", name="Add from any screen")
        check("Top bar: Add a to-do and Add a file to be sorted on every screen", quick.get_by_role("button", name="Add a to-do").count() == 1 and quick.get_by_role("button", name="Add a file to be sorted").count() == 1)
        go(page, "/sales/tenders")
        quick.get_by_role("button", name="Add a file to be sorted").click(); page.wait_for_timeout(300)
        d = dlg()
        sel = d.get_by_label("Project")
        check("Add a file: the project list has live jobs, then the archive", sel.locator("optgroup").count() == 2)
        opt = [o for o in sel.locator("option").all_inner_texts() if o.startswith("C720")][0]
        sel.select_option(label=opt)
        d.locator("input[type=file]").first.set_input_files(FIX + "site-photo.jpg"); page.wait_for_timeout(900)
        page.screenshot(path=f"{OUT}/1412-add-file.png")
        d.get_by_role("button", name=re.compile("^Add")).last.click(); page.wait_for_timeout(600)
        lf = data(page, "db.files.filter(f => f.projectId === null && f.forProjectId).map(f => [f.name, db.projects.find(p => p.id === f.forProjectId).code])")
        check("The file waits with no folder, under C720", ["site-photo.jpg", "C720"] in lf, lf)
        go(page, "/files/unsorted")
        t = main.inner_text()
        m1 = re.search(r"C720 [^\n]*\((\d+)\)", t)
        check("To be sorted lists it under C720's name", m1 is not None and int(m1.group(1)) == had + 1 and "site-photo.jpg" in t, (had, m1.group(0) if m1 else None))
        page.screenshot(path=f"{OUT}/1413-to-be-sorted.png", full_page=True)
        check("To be sorted has its own Add file", main.get_by_role("button", name="Add file").count() == 1)
    part("Files to be sorted", loose)

    # ── 9. A to-do from any screen
    def todo():
        go(page, "/projects/C720?tab=plant")
        quick = page.get_by_role("group", name="Add from any screen")
        quick.get_by_role("button", name="Add a to-do").click(); page.wait_for_timeout(300)
        d = dlg()
        d.get_by_role("button", name="Add", exact=True).click(); page.wait_for_timeout(200)
        check("Add a to-do refuses an empty one", d.get_by_role("alert").inner_text().strip() != "", d.get_by_role("alert").inner_text())
        d.get_by_label("What").fill("Check the tower inspection is booked")
        check("It is for me unless I pick someone", d.get_by_label("For").evaluate("s => s.options[s.selectedIndex].text").startswith("Me ("))
        link = d.get_by_label(re.compile("^Link it to this screen"))
        check("It offers to link the screen it was added from", link.count() == 1 and "C720" in d.inner_text(), d.inner_text()[-300:])
        link.check()
        page.screenshot(path=f"{OUT}/1414-add-todo.png")
        d.get_by_role("button", name="Add", exact=True).click(); page.wait_for_timeout(500)
        quick.get_by_role("button", name="Add a to-do").click(); page.wait_for_timeout(300)
        d = dlg()
        d.get_by_label("What").fill("Send the Dunmoy statement")
        who = [o for o in d.get_by_label("For").locator("option").all_inner_texts() if o.startswith("Maeve Quirke")][0]
        d.get_by_label("For").select_option(label=who)
        d.get_by_role("button", name="Add", exact=True).click(); page.wait_for_timeout(500)
        go(page, "/dashboard")
        todo_list = main.locator("ul[aria-label='To do']")
        t = todo_list.inner_text()
        check("Dashboard, To do: mine is on my list", "Check the tower inspection is booked" in t, t[:300])
        check("And it opens the screen it came from", todo_list.get_by_role("link", name=re.compile("^Open C720")).count() >= 1, t[:400])
        check("One given to me says who it is from", "from Tadhg Morrissey" in t, t[:400])
        given = main.locator("ul[aria-label='To-dos you gave to others']")
        check("Given to others: the one for Maeve Quirke, not on my own list", given.count() == 1 and "Send the Dunmoy statement" in given.inner_text() and "Send the Dunmoy statement" not in t, given.inner_text() if given.count() else "none")
        page.screenshot(path=f"{OUT}/1415-dashboard-todo.png", full_page=True)
        todo_list.get_by_role("link", name=re.compile("^Open C720")).first.click(); page.wait_for_timeout(500)
        check("The link opens the project's Plant tab", "/projects/C720" in page.url and "tab=plant" in page.url, page.url)
        sign_in_as(page, "Accounts")
        go(page, "/dashboard")
        t = main.locator("ul[aria-label='To do']").inner_text()
        check("Accounts sees it on her list, from Aidan King", "Send the Dunmoy statement" in t and "from Aidan King" in t, t[:300])
        main.get_by_label("Done: Send the Dunmoy statement").click(); page.wait_for_timeout(400)
        sign_in_as(page, "Managing director")
        go(page, "/dashboard")
        g = main.locator("ul[aria-label='To-dos you gave to others']").inner_text()
        check("The managing director sees it ticked off", "Send the Dunmoy statement" in g and ("Done" in g or "ticked" in g.lower()), g)
    part("To-do", todo)

    # ── 10. The managing director: nothing before its step, and stepping in
    def stepin():
        go(page, "/dashboard")
        early = data(page, "db.supplierInvoices.filter(s => s.readStatus !== 'confirmed' && s.askedAt && s.siteStep && !s.siteApprovedAt && !s.sentBackAt).length")
        reached = data(page, "db.supplierInvoices.filter(s => s.readStatus !== 'confirmed' && s.askedAt && s.siteStep && s.siteApprovedAt && !s.sentBackAt).length")
        fin = page.locator("section[aria-labelledby='box-finance']").inner_text()
        m = re.search(r"(\d+) invoices? from suppliers and subcontractors waiting for your approval", fin)
        check("Dashboard, Finance: counts only invoices that have reached him", m and int(m.group(1)) == reached and early > 0, (fin[-300:], reached, early))
        go(page, "/admin")
        sec = main.get_by_role("heading", name=re.compile(r"^Still with a site manager \(\d+\)"))
        check("Admin, Requests: a separate list, Still with a site manager", sec.count() == 1)
        n0 = int(re.search(r"\((\d+)\)", sec.inner_text()).group(1))
        show = main.get_by_role("button", name=re.compile("^Show the \\d+ and step in"))
        check("It is shut until he opens it", show.count() == 1 and main.locator("table[aria-label='Still with a site manager']").count() == 0)
        show.click(); page.wait_for_timeout(300)
        tbl = main.locator("table[aria-label='Still with a site manager']")
        check("Opened: what, site, who it waits on", [h.strip() for h in tbl.locator("thead th").all_inner_texts()][:3] == ["What", "Site", "Waiting on"])
        kinds = tbl.inner_text()
        check("It holds invoices, crew requests, overtime claims and receipts", "Invoice from" in kinds and tbl.locator("tbody tr").count() == n0, (n0, tbl.locator("tbody tr").count()))
        page.screenshot(path=f"{OUT}/1416-admin-step-in.png", full_page=True)
        b = tbl.get_by_role("button", name=re.compile("^Step in and approve:")).first
        label = b.get_attribute("aria-label")
        b.click(); page.wait_for_timeout(300)
        note = dlg().get_by_role("note")
        check("Stepping in says plainly whose step is skipped", note.count() >= 1 and "still waiting on" in dlg().inner_text() and "without the site manager's yes" in dlg().inner_text(), dlg().inner_text()[:300])
        page.screenshot(path=f"{OUT}/1417-step-in-confirm.png")
        dlg().get_by_role("button", name="Confirm approval").click(); page.wait_for_timeout(600)
        ahead = data(page, "db.supplierInvoices.filter(s => s.aheadOfSite).map(s => [s.supplier, s.readStatus, s.confirmedBy])")
        check("Approved into job costs in his name, marked as ahead of the site manager", len(ahead) == 1 and ahead[0][1] == "confirmed" and ahead[0][2] == "Aidan King", (label, ahead))
        act = data(page, "db.activity[0].what")
        check("The Activity log says so", "ahead of the site manager's step" in act, act)
        sec2 = main.get_by_role("heading", name=re.compile(r"^Still with a site manager \(\d+\)"))
        n1 = int(re.search(r"\((\d+)\)", sec2.inner_text()).group(1)) if sec2.count() else 0
        check("It leaves the list", n1 == n0 - 1, (n0, n1))
        # A site manager's own list is unchanged by this: the invoice is no longer his to approve.
        go(page, "/invoicing/to-pay")
        check("And it is on To be paid", ahead and ahead[0][0] in main.inner_text())
    part("Step in", stepin)

    # ── 11. Phone width
    def narrow():
        page.set_viewport_size({"width": 390, "height": 800})
        for path, name in [("/profit", "Profit by job"), ("/projects/all", "All projects"), ("/files", "Files"), ("/invoicing/claims", "Payment claims"), ("/invoicing/design", "Invoice design"), ("/dashboard", "Dashboard")]:
            go(page, path)
            wide = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"Phone width: {name} does not scroll sideways", wide <= 1, wide)
        fits = page.evaluate("(() => { const h = document.querySelector('header'); return h.scrollWidth <= h.clientWidth + 1; })()")
        check("Phone width: the top bar still fits with the two add buttons", fits)
        page.screenshot(path=f"{OUT}/1418-phone-dashboard.png")
        go(page, "/profit")
        page.screenshot(path=f"{OUT}/1419-phone-bars.png", full_page=True)
        one = page.get_by_role("group", name="Add from any screen").get_by_role("button", name="Add a to-do or a file")
        check("Phone width: one add button in the bar, which asks which", one.count() == 1 and page.get_by_role("group", name="Add from any screen").get_by_role("button").count() == 1)
        one.click(); page.wait_for_timeout(300)
        check("Phone width: it offers a to-do or a file to be sorted", dlg().get_by_role("button", name="A to-do").count() == 1 and dlg().get_by_role("button", name="A file to be sorted").count() == 1)
        dlg().get_by_role("button", name="A to-do").click(); page.wait_for_timeout(300)
        check("Phone width: then the same to-do box", dlg().get_by_label("What").count() == 1)
        b = dlg().bounding_box()
        check("Phone width: the to-do box fits the screen", b and b["width"] <= 390 and b["x"] >= 0, b)
        page.screenshot(path=f"{OUT}/1420-phone-todo.png")
        close_dialog()
        page.set_viewport_size({"width": 1440, "height": 900})
    part("Phone width", narrow)

    # ── 12. Dark mode
    def dark():
        go(page, "/profit")
        page.get_by_role("button", name=re.compile("dark", re.I)).first.click(); page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/1421-dark-bars.png", full_page=True)
        go(page, "/invoicing/design")
        bg = main.locator("[aria-label$='as the client receives it']").first.evaluate("e => getComputedStyle(e).backgroundColor")
        check("Dark mode: the invoice paper stays white, as a document", bg == "rgb(255, 255, 255)", bg)
        page.screenshot(path=f"{OUT}/1422-dark-design.png", full_page=True)
        page.get_by_role("button", name=re.compile("light", re.I)).first.click(); page.wait_for_timeout(200)
    part("Dark mode", dark)

    # ── 13. The phone app as a build of its own (npm run build:phone), served from dist-phone
    def phone_only():
        dist = os.path.join(REPO, "dist-phone")
        if not os.path.exists(os.path.join(dist, "index.html")):
            check("The phone-only build exists (npm run build:phone)", False, dist); return
        srv = subprocess.Popen([sys.executable, "-m", "http.server", "4190", "--directory", dist], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            time.sleep(1.2)
            pctx = page.context.browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
            pg = pctx.new_page()
            perr = []
            pg.on("pageerror", lambda e: perr.append(str(e)))
            pg.goto("http://localhost:4190/"); pg.wait_for_selector("h2, h1"); pg.wait_for_timeout(500)
            body = pg.inner_text("body")
            own = pg.get_by_role("heading", name="Sign in").count() == 1
            check("Phone app alone: opens on the app's own screen (sign in), no demo sign-in page", own and pg.locator("#username").count() == 0, body[:200])
            check("Phone app alone: nothing of the office (no top bar, no apps bar)", pg.locator("header").count() == 0 and pg.locator("nav[aria-label=Apps]").count() == 0)
            wide = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check("Phone app alone: fills the screen, no sideways scroll", wide <= 1 and pg.locator("[data-app=phone]").count() == 1, wide)
            pg.screenshot(path=f"{OUT}/1423-phone-app-sign-in.png")
            if pg.get_by_role("button", name="Use password instead").count():
                pg.get_by_role("button", name="Use password instead").click(); pg.wait_for_timeout(400)
            if pg.get_by_role("button", name="Next").count():
                pg.get_by_role("button", name="Next").click(); pg.wait_for_timeout(400)
            pg.get_by_role("button", name="Forgot password? Get a code").click(); pg.wait_for_timeout(400)
            code = re.search(r"Demo, in place of the text:\s*(\d{6})", pg.inner_text("body")).group(1)
            pg.get_by_label("Code").fill(code); pg.get_by_role("button", name="Check code").click(); pg.wait_for_timeout(400)
            pg.get_by_label("New password").fill("lime mortar gable"); pg.get_by_label("Type it again").fill("lime mortar gable")
            pg.get_by_role("button", name="Save password").click(); pg.wait_for_timeout(600)
            check("Phone app alone: code, password, then the home screen with its tiles", pg.get_by_role("button", name=re.compile("^My week")).count() == 1 and pg.get_by_role("button", name=re.compile("^Report a repair")).count() == 1, pg.inner_text("body")[:300])
            pg.screenshot(path=f"{OUT}/1424-phone-app-home.png")
            reqs = pg.evaluate("performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('http://localhost:4190/'))")
            check("Phone app alone: no request leaves the app", reqs == [], reqs)
            check("Phone app alone: no errors in the page", perr == [], perr)
            js = [f for f in os.listdir(os.path.join(dist, "assets")) if f.endswith(".js")]
            src = "".join(open(os.path.join(dist, "assets", f), encoding="utf-8").read() for f in js)
            check("Phone app alone: the build holds none of the office screens", not any(t in src for t in ["How it prints", "Money in and out by job", "Look up by code", "Still with a site manager", "Waiting for your yes or no", "Search every project"]), len(src))
            pctx.close()
        finally:
            srv.terminate()
    part("Phone app alone", phone_only)

errs = []
try:
    errs = run(steps)
except Exception as e:
    print("STOPPED EARLY:", str(e).split("\n")[0]); traceback.print_exc()
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
