import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT

# The invoicing section rebuilt on 18 Nov 2026: client invoices in one list with tabs, drafting
# from the project's records, the invoice on a page of its own, sending by email and portal,
# the real PDF, paid and undo, comments and emails, client queries, the accounts export and its
# log, the invoice design and the email template, and what the client can do in the portal.

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def as_role(page, role):
    page.get_by_role("button", name="Account menu").click()
    page.get_by_role("menuitem", name=role).click()
    page.wait_for_timeout(350)
def go(page, path, sel="main"):
    page.goto(BASE + path); page.wait_for_selector(sel); page.wait_for_timeout(250)

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    # A reset writes the sample data to the browser's storage, where data() reads it from.
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(300)
    main = page.locator("main")
    body = lambda: page.locator("body").inner_text()
    dlg = lambda: page.locator("dialog[open]").last
    side = page.get_by_role("navigation", name="Invoicing screens").first
    tabs = page.get_by_role("tablist", name="Invoices shown")
    strip = page.get_by_label("Where this invoice stands")

    # ── The section and its list
    go(page, "/invoicing", "table")
    t = side.inner_text()
    check("Sidebar: money in, money out, Sage and set-up", all(w in t for w in ["Money in", "Client invoices", "Unpaid", "Held", "Client queries", "Money out", "Supplier invoices", "Subcontractor invoices", "To approve", "To be paid", "Job costs", "Sage export", "Set-up", "Invoice design", "Email template"]) and "Accounts package" not in t, t)
    n = data(page, "({ all: db.salesInvoices.length, draft: db.salesInvoices.filter(i=>i.status==='To invoice').length, held: db.salesInvoices.filter(i=>i.status==='Held').length, out: db.salesInvoices.filter(i=>i.status==='Invoiced').length, late: db.salesInvoices.filter(i=>i.status==='Invoiced' && i.dueOn < day).length, paid: db.salesInvoices.filter(i=>i.status==='Paid').length })")
    names = [" ".join(x.inner_text().split()) for x in tabs.get_by_role("tab").all()]
    check("List: the tabs count drafts, held, sent, overdue and paid from the records", [x.replace(" ", "") for x in names] == [f"All{n['all']}", f"Drafts{n['draft']}", f"Held{n['held']}", f"Sent{n['out']}", f"Overdue{n['late']}", f"Paid{n['paid']}"], names)
    check("List: every invoice is here, drafts first, with who it is for and where it stands", page.locator("tbody tr").count() == n["all"] and page.locator("tbody tr").first.get_by_text("Draft", exact=True).count() == 1 and "Client and project" in page.locator("thead").inner_text())
    check("List: the aged debt strip is over the list", page.get_by_label("Aged debt").count() == 1 and "Owed to us, with VAT" in main.inner_text())
    tabs.get_by_role("tab", name=re.compile("^Overdue")).click(); page.wait_for_timeout(250)
    check("Tabs: Overdue shows only invoices past their due date", page.locator("tbody tr").count() == n["late"] and all("late" in r.inner_text() for r in page.locator("tbody tr").all()) and page.url.endswith("/invoicing/invoiced?show=overdue"))
    tabs.get_by_role("tab", name=re.compile("^Paid")).click(); page.wait_for_timeout(250)
    check("Tabs: Paid shows what has been paid, each with Undo paid", page.locator("tbody tr").count() == n["paid"] and page.get_by_role("button", name="Undo paid").count() == n["paid"])
    go(page, "/invoicing/invoiced", "table")
    check("The old address for invoiced opens the list on Sent", tabs.get_by_role("tab", name=re.compile("^Sent")).get_attribute("aria-selected") == "true" and page.locator("tbody tr").count() == n["out"])
    go(page, "/invoicing", "table")
    page.get_by_label("Search client invoices").fill("dunmoy"); page.wait_for_timeout(200)
    check("Search: by client narrows the list", 0 < page.locator("tbody tr").count() < n["all"] and all("Dunmoy" in r.inner_text() for r in page.locator("tbody tr").all()))
    page.get_by_label("Search client invoices").fill("zzzz"); page.wait_for_timeout(200)
    check("Search: nothing found says so and what to try", 'No invoice matches "zzzz"' in main.inner_text())
    page.get_by_label("Search client invoices").fill("")
    check("List: the client opens their customer page", page.locator("tbody tr").first.locator("a[href^='/customers/c-']").count() == 1)
    page.screenshot(path=f"{OUT}/200-invoices.png")

    # ── Draft an invoice from the project's records
    page.get_by_role("button", name="Draft an invoice").click(); page.wait_for_timeout(300)
    d = dlg()
    check("Draft: it starts by asking for the project, with projects to pick from and what is left to bill on each", d.get_by_role("list", name="Projects found").locator("li").count() >= 3 and "left to bill" in d.inner_text() and d.get_by_role("button", name="Create draft invoice").is_disabled())
    d.get_by_role("textbox", name="Project").fill("ardmullen"); page.wait_for_timeout(200)
    check("Draft: typing a client's name finds their projects", all("Ardmullen" in li.inner_text() for li in d.get_by_role("list", name="Projects found").locator("li").all()))
    d.get_by_role("list", name="Projects found").locator("button", has_text="C720").click(); page.wait_for_timeout(300)
    rec = data(page, "(() => { const p = db.projects.find(p=>p.code==='C720'); const c = db.clients.find(c=>c.id===p.clientId); return { po: db.quotes.find(q=>q.id===p.quoteId).poNumber, email: c.billingEmail || c.contactEmail, client: c.name, terms: c.termsDays } })()")
    t = d.inner_text()
    check("Draft: choosing the project fills in who is billed, where it is emailed, their terms and their order number", rec["client"] in t and rec["email"] in t and f"Due {rec['terms']} days after sending" in t and d.get_by_label("Client's order number").input_value() == rec["po"], rec)
    check("Draft: it starts from the next stage payment, valued from the work done and not yet invoiced", d.get_by_label("What it is for").input_value() == "Stage payment 2: work to date" and float(d.get_by_label("Rate of line 1").input_value()) > 0 and "of the work on C720 is ticked off" in t)
    opts = [o.inner_text() for o in d.get_by_label("Start from").locator("option").all()]
    check("Draft: it can also start from dayworks or a blank invoice", opts[0] == "Stage payment 2" and "Dayworks" in opts and "Something else" in opts, opts)
    d.get_by_label("Rate of line 1").fill("9999999"); page.wait_for_timeout(200)
    check("Draft: more than is left on the contract is refused in plain words", "more than is left to bill on C720" in d.inner_text() and d.get_by_role("button", name="Create draft invoice").is_disabled())
    d.get_by_label("Rate of line 1").fill("12000")
    d.get_by_role("button", name="Add a line").click()
    d.get_by_label("Description of line 2").fill("Dayworks: opening up at the kitchen lintel")
    q = d.get_by_label("Quantity of line 2"); q.fill("")
    for ch in "6.5": q.type(ch)
    d.get_by_label("Unit of line 2").fill("hours"); d.get_by_label("Rate of line 2").fill("52"); page.wait_for_timeout(200)
    tot = d.get_by_label("Invoice total").inner_text()
    check("Draft: a decimal quantity typed key by key is kept, and the totals follow (12,338 + 13.5%)", q.input_value() == "6.5" and "€12,338.00" in tot and "€1,665.63" in tot and "€14,003.63" in tot, tot)
    left = data(page, "(() => { const p = db.projects.find(p=>p.code==='C720'); return p.value - db.salesInvoices.filter(i=>i.projectId===p.id).reduce((s,i)=>s+i.net,0) })()")
    d.get_by_role("button", name="Create draft invoice").click(); page.wait_for_url("**/invoicing/client/INV-*"); page.wait_for_timeout(400)
    ref = page.url.split("/")[-1]
    st = data(page, f"(() => {{ const i = db.salesInvoices.find(i=>i.ref==='{ref}'); const p = db.projects.find(p=>p.id===i.projectId); return {{ status: i.status, net: i.net, manual: i.manual, lines: i.lines.length, left: p.value - db.salesInvoices.filter(x=>x.projectId===p.id).reduce((s,x)=>s+x.net,0), mails: db.mails.filter(m=>m.salesInvoiceId===i.id).length }} }})()")
    check("Draft: it is saved as a draft on the project and nothing has gone to the client", st["status"] == "To invoice" and st["net"] == 12338 and st["manual"] and st["lines"] == 2 and round(left - st["left"], 2) == 12338 and st["mails"] == 0, st)

    # ── The invoice on its own page
    paper = page.get_by_label(re.compile("^Invoice .* as the client receives it"))
    t = paper.inner_text()
    check("Invoice page: the paper shows the firm, the client and address, their order, the site, each line and the totals", all(w in t for w in ["ABC Construction Ltd", rec["client"], "For the attention of Susan Kane", "Co. Galway", rec["po"], "C720", "Dayworks: opening up at the kitchen lintel", "6.5", "€14,003.63", "DRAFT", "Bank details"]), t[:400])
    s = strip.inner_text()
    check("Invoice page: a draft reads not sent, not due, not in the accounts package", "Not yet" in s and "Nobody outside the office has seen it" in s and "In Sage" in s and "Sage 50" not in s)
    check("Invoice page: beside it, the client and project it belongs to, and others on the same project", main.get_by_role("link", name=rec["client"]).count() >= 1 and main.get_by_role("link", name="C720 Ardmullen House").count() >= 1 and "Same project" in main.inner_text() and "Left to bill" in main.inner_text())
    page.get_by_role("button", name="Change the draft").click(); page.wait_for_timeout(300)
    dlg().get_by_label("Rate of line 2").fill("50"); dlg().get_by_label("Notes printed on the invoice").fill("Dayworks sheets signed on site are attached.")
    dlg().get_by_role("button", name="Save the draft").click(); page.wait_for_timeout(300)
    check("Change the draft: the paper follows the new figure and the note", "€325.00" in paper.inner_text() and "Dayworks sheets signed on site are attached." in paper.inner_text())
    page.screenshot(path=f"{OUT}/201-invoice-draft.png")

    # ── Send to the client: email and portal together
    page.get_by_role("button", name="Send to client").click(); page.wait_for_timeout(300)
    d = dlg()
    nxt = data(page, "'SI-' + (Math.max(...db.salesInvoices.map(i=>Number((i.accountsNo||'SI-0').slice(3)))) + 1)")
    check("Send: the email is written from the template with the number it will carry, to the client's address, with the PDF named", d.get_by_label("To").input_value() == rec["email"] and nxt in d.get_by_label("Subject").input_value() and f"invoice {nxt}" in d.get_by_label("Message").input_value() and "Dear Susan," in d.get_by_label("Message").input_value() and f"{nxt} ABC Construction Ltd.pdf" in d.inner_text() and "{" not in d.get_by_label("Message").input_value())
    check("Send: email and the portal are both ticked", d.get_by_label("Email it with the PDF attached").is_checked() and d.get_by_label("Put it in the client's portal").is_checked())
    d.get_by_label("Email it with the PDF attached").uncheck(); d.get_by_label("Put it in the client's portal").uncheck(); page.wait_for_timeout(150)
    check("Send: with neither ticked it will not go", "Tick at least one way of sending it" in d.inner_text() and d.get_by_role("button", name="Send invoice").is_disabled())
    d.get_by_label("Email it with the PDF attached").check(); d.get_by_label("Put it in the client's portal").check()
    d.get_by_label("To").fill("not an address"); page.wait_for_timeout(150)
    check("Send: a broken address is refused", d.get_by_role("button", name="Send invoice").is_disabled() and "not a full email address" in d.inner_text())
    d.get_by_label("To").fill(rec["email"])
    msg = d.get_by_label("Message"); msg.fill(msg.input_value() + "\n\nP.S. The dayworks sheets are attached too.")
    d.get_by_role("button", name="Send invoice").click(); page.wait_for_url(f"**/invoicing/client/{nxt}"); page.wait_for_timeout(400)
    st = data(page, f"(() => {{ const i = db.salesInvoices.find(i=>i.accountsNo==='{nxt}'); const m = db.mails.find(m=>m.salesInvoiceId===i.id); return {{ status: i.status, issued: i.issuedOn === day, due: i.dueOn, via: i.sentVia, to: i.sentTo, folder: m.folder, att: m.attachment, ps: m.body.includes('P.S. The dayworks sheets'), file: db.files.some(f=>f.projectId===i.projectId && f.category==='Invoices' && f.name.startsWith('{nxt}')), last: i.history[i.history.length-1].what }} }})()")
    check("Send: it goes out under the next number, due on the client's terms, by email and the portal", st["status"] == "Invoiced" and st["issued"] and st["due"] > data(page, "day") and st["via"] == ["email", "portal"] and st["to"] == rec["email"], st)
    check("Send: the email as edited is under Email, Sent, with the PDF, and the invoice is filed with the project", st["folder"] == "Sent" and st["att"] == f"{nxt} ABC Construction Ltd.pdf" and st["ps"] and st["file"], st)
    check("Send: the address moves to the number it went out under, and the page says how it went", f"by email and the portal, to {rec['email']}" in strip.inner_text() and f"Invoice {nxt}" in main.inner_text() and "Sent to Ardmullen Estate by email and the portal" in main.inner_text())
    check("Send: the email shows on the invoice, and opens in Email", main.get_by_text("Email sent", exact=True).count() == 1)
    go(page, f"/invoicing/client/{ref}"); page.wait_for_url(f"**/invoicing/client/{nxt}")
    check("A link made while it was a draft lands on the number it went out under", page.url.endswith(nxt))
    go(page, "/inbox/sent")
    check("Email, Sent: the invoice email is there with its attachment", f"Invoice {nxt} from ABC Construction Ltd" in main.inner_text())

    # ── The PDF
    go(page, f"/invoicing/client/{nxt}")
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download PDF").click()
    raw = open(dl.value.path(), "rb").read()
    hx = lambda s: "".join(f"{ord(c) if c != '€' else 0x80:02x}" for c in s).encode()
    check("PDF: a real PDF named for the invoice, carrying its number, the client, a line and the total", dl.value.suggested_filename == f"{nxt} ABC Construction Ltd.pdf" and raw.startswith(b"%PDF-1.4") and raw.rstrip().endswith(b"%%EOF") and all(b"<" + hx(s) + b">" in raw for s in [nxt, rec["client"], "€13,988.88", "Sample Bank"]), (dl.value.suggested_filename, len(raw)))

    # ── Paid, and undo
    page.get_by_role("button", name="Mark paid").click(); page.wait_for_timeout(300)
    page.get_by_role("dialog").get_by_role("button", name="Confirm paid").click(); page.wait_for_timeout(300)
    check("Mark paid: the page says paid today, and the message offers Undo", "Marked paid" in main.inner_text() and data(page, f"db.salesInvoices.find(i=>i.accountsNo==='{nxt}').status") == "Paid" and page.get_by_role("button", name="Undo", exact=True).count() == 1)
    page.get_by_role("button", name="Undo", exact=True).click(); page.wait_for_timeout(300)
    st = data(page, f"(() => {{ const i = db.salesInvoices.find(i=>i.accountsNo==='{nxt}'); return [i.status, i.paidOn === undefined, i.history[i.history.length-1].what] }})()")
    check("Undo: it is owed again and the history says the payment was taken back", st == ["Invoiced", True, "Paid taken back: it was marked by mistake"] and page.get_by_role("button", name="Mark paid").count() == 1, st)
    page.get_by_role("button", name="Mark paid").click(); page.wait_for_timeout(300)
    page.get_by_role("dialog").get_by_role("button", name="Confirm paid").click(); page.wait_for_timeout(9300)
    check("Paid: once the message has gone, Undo paid stays on the page", page.get_by_role("button", name="Undo", exact=True).count() == 0 and page.get_by_role("button", name="Undo paid").count() == 1)
    page.get_by_role("button", name="Undo paid").click(); page.wait_for_timeout(300)
    check("Undo paid: unpaid again", data(page, f"db.salesInvoices.find(i=>i.accountsNo==='{nxt}').status") == "Invoiced")

    # ── Emails and comments from the invoice
    main.get_by_label("Message to the client").fill("Could you confirm which cost centre this should quote?")
    main.get_by_role("button", name="Send email").click(); page.wait_for_timeout(300)
    # Four by now: the email that carried the invoice, a receipt for each of the two times it was marked paid, and this one.
    check("Email the client from the invoice: filed under Sent against the invoice and shown here", data(page, f"db.mails.filter(m=>m.folder==='Sent' && m.salesInvoiceId===db.salesInvoices.find(i=>i.accountsNo==='{nxt}').id).length") == 4 and main.get_by_text("Email sent", exact=True).count() == 4 and data(page, f"db.mails.filter(m=>m.subject.startsWith('Payment received') && m.salesInvoiceId===db.salesInvoices.find(i=>i.accountsNo==='{nxt}').id).length") == 2)
    main.get_by_role("tab", name="Comment for the office").click()
    main.get_by_label("Comment for the office").fill("Susan is away until Monday.")
    main.get_by_role("button", name="Add comment").click(); page.wait_for_timeout(300)
    check("Comment: kept for the office, shown on the invoice, and sent nowhere", main.get_by_text("Office only", exact=True).count() == 1 and "Susan is away until Monday." in main.inner_text() and data(page, "db.mails.filter(m=>m.body.includes('Susan is away')).length") == 0)

    # ── A query from the client: logged, answered, settled
    page.get_by_role("button", name=f"More for {nxt}").click()
    page.get_by_role("menuitem", name="Log a query from the client").click(); page.wait_for_timeout(250)
    d = dlg()
    check("Log a query: the client's contact is filled in", d.get_by_label("Who asked").input_value() == "Susan Kane")
    d.get_by_label("What they asked").fill("Are the dayworks hours agreed with the architect?")
    d.get_by_role("button", name="Log the query").click(); page.wait_for_timeout(300)
    check("Query: the invoice warns not to chase until it is settled", "Hold off chasing payment until it is settled" in main.inner_text() and main.get_by_text("Client query", exact=True).count() == 1)
    go(page, "/invoicing", "table")
    check("Query: the list marks the invoice", page.locator("tbody tr", has_text=nxt).get_by_text("Query open").count() == 1)
    go(page, "/invoicing/queries")
    card = main.locator("div.rounded-lg", has_text=nxt).first
    check("Client queries: open ones first, each with the invoice, the client, the project and the question", "Open (2)" in main.inner_text() and "Are the dayworks hours agreed with the architect?" in card.inner_text() and card.get_by_role("link", name="Ardmullen Estate").count() == 1 and "by phone" in card.inner_text())
    card.get_by_label("Reply to Susan Kane").fill("Yes, Sinéad signed the sheets on Friday.")
    card.get_by_role("button", name="Send reply").click(); page.wait_for_timeout(300)
    card.get_by_label("What was agreed").fill("Sheets sent again. The invoice stands.")
    card.get_by_role("button", name="Settle the query").click(); page.wait_for_timeout(300)
    stq = data(page, f"(() => {{ const q = db.invoiceQueries.find(q=>q.text.startsWith('Are the dayworks')); return [q.status, q.replies.length, q.outcome] }})()")
    check("Client queries: a reply, then settled with what was agreed", stq == ["Settled", 1, "Sheets sent again. The invoice stands."] and "Open (1)" in main.inner_text() and "Settled (2)" in main.inner_text(), stq)
    page.screenshot(path=f"{OUT}/202-queries.png")
    go(page, f"/invoicing/client/{nxt}")
    check("Settled: the invoice no longer warns, and its history has the whole story", "Hold off chasing" not in main.inner_text() and "Query settled: sheets sent again. The invoice stands." in main.inner_text())

    # ── Export one invoice to the accounts package from its page
    waiting = data(page, "db.salesInvoices.filter(i=>i.issuedOn && !i.exportedAt).length")
    page.get_by_role("button", name=f"More for {nxt}").click()
    with page.expect_download() as dl:
        page.get_by_role("menuitem", name="Export to Sage now").click()
    line = open(dl.value.path(), encoding="utf-8", newline="").read()
    check("Export from the invoice: one Sage line for it, and the page says it is in Sage", line.count("\r\n") == 1 and line.startswith("SI,ARDM01,4000,720,") and f",{nxt}," in line and ",12325.00,T3,1663.88" in line and data(page, "db.salesInvoices.filter(i=>i.issuedOn && !i.exportedAt).length") == waiting - 1 and "Not yet" not in strip.inner_text().split("In Sage")[1], line)
    page.screenshot(path=f"{OUT}/203-invoice-sent.png")

    # ── Invoice design
    go(page, "/invoicing/design")
    paper = page.get_by_label(re.compile("^Invoice .* as the client receives it"))
    page.get_by_label("VAT number").fill("IE 9876543X"); page.wait_for_timeout(200)
    check("Invoice design: a change shows on the paper as it is typed", "VAT no. IE 9876543X" in paper.inner_text())
    page.get_by_role("switch", name="Show on invoices: Bank details").click(); page.wait_for_timeout(200)
    check("Invoice design: bank details can be taken off", "Bank details" not in paper.inner_text())
    page.get_by_label("Last line of the page").fill("Registered in Ireland."); page.wait_for_timeout(200)
    go(page, f"/invoicing/client/{nxt}")
    t = page.get_by_label(re.compile("^Invoice .* as the client receives it")).inner_text()
    check("Invoice design: every invoice follows it", "VAT no. IE 9876543X" in t and "Bank details" not in t and "Registered in Ireland." in t)
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download PDF").click()
    raw = open(dl.value.path(), "rb").read()
    check("Invoice design: and so does the PDF", b"<" + hx("VAT no. IE 9876543X") + b">" in raw and hx("Bank details") not in raw)
    go(page, "/invoicing/design")
    page.screenshot(path=f"{OUT}/204-design.png")
    page.get_by_role("button", name="Back to the starting design").click(); page.wait_for_timeout(250)
    check("Invoice design: one press puts it back as it started", page.get_by_label("VAT number").input_value() == "IE 0000000AB" and "Bank details" in page.get_by_label(re.compile("^Invoice .* as the client receives it")).inner_text() and page.get_by_role("button", name="Back to the starting design").count() == 0)

    # ── The firm's logo, from Settings, on the paper and in the PDF
    go(page, "/settings")
    page.get_by_label("Choose a logo from this device").set_input_files(FIX + "card.png"); page.wait_for_timeout(700)
    go(page, f"/invoicing/client/{nxt}")
    on_paper = page.get_by_label(re.compile("^Invoice .* as the client receives it")).locator("img").count()
    with page.expect_download() as dl:
        page.get_by_role("button", name="Download PDF").click()
    raw = open(dl.value.path(), "rb").read()
    check("Logo: once added under Settings it is on the paper and in the PDF as a picture", on_paper == 1 and b"/Subtype /Image" in raw and b"/Filter /DCTDecode" in raw and b"/Im1 Do" in raw, (on_paper, len(raw)))
    go(page, "/settings")
    page.get_by_role("button", name="Remove logo").click(); page.wait_for_timeout(250)

    # ── Email template
    go(page, "/invoicing/email")
    check("Email template: the words that fill themselves in are listed, and the preview is a real invoice", "{contact}" in main.inner_text() and "Dear " in main.inner_text() and "Attached: SI-" in main.inner_text() and page.get_by_role("button", name="Save template").is_disabled())
    page.get_by_label("Subject").fill("{company}: invoice {invoice} for {project}"); page.wait_for_timeout(200)
    check("Email template: the preview follows as it is typed", "ABC Construction Ltd: invoice SI-" in main.inner_text())
    page.get_by_role("button", name="Save template").click(); page.wait_for_timeout(250)
    go(page, "/invoicing?show=draft", "table")
    page.locator("tbody tr").first.get_by_role("button", name="Send", exact=True).click(); page.wait_for_timeout(300)
    check("Email template: the next invoice sent starts from the saved wording", dlg().get_by_label("Subject").input_value().startswith("ABC Construction Ltd: invoice SI-"))
    dlg().get_by_role("button", name="Cancel").click()
    go(page, "/invoicing/email")
    page.get_by_role("button", name="Back to the standard wording").click(); page.wait_for_timeout(250)
    check("Email template: back to the standard wording", page.get_by_label("Subject").input_value() == "Invoice {invoice} from {company}, {project}")
    page.screenshot(path=f"{OUT}/205-email-template.png")

    # ── What the client can do in the portal
    as_role(page, "Client")
    page.wait_for_url("**/portal"); page.wait_for_timeout(300)
    li = main.locator("li", has_text=nxt).first
    li.scroll_into_view_if_needed()
    check("Portal: the invoice sent is in the client's portal with what is due", "Stage payment 2: work to date" in li.inner_text() and "€13,988.88" in li.inner_text() and "Due " in li.inner_text())
    li.get_by_role("button", name="Open invoice").click(); page.wait_for_timeout(300)
    d = dlg()
    check("Portal: the client opens the same paper that was sent", rec["po"] in d.inner_text() and "Dayworks: opening up at the kitchen lintel" in d.inner_text())
    with page.expect_download() as dl:
        d.get_by_role("button", name="Download PDF").click()
    check("Portal: and downloads it as a PDF", dl.value.suggested_filename == f"{nxt} ABC Construction Ltd.pdf" and open(dl.value.path(), "rb").read(8).startswith(b"%PDF"))
    d.get_by_role("button", name="Close").first.click(); page.wait_for_timeout(200)
    check("Portal: the settled query and the reply are shown to the client", "Yes, Sinéad signed the sheets on Friday." in li.inner_text() and "Settled: Sheets sent again. The invoice stands." in li.inner_text())
    li.get_by_role("button", name="Ask about this invoice").click(); page.wait_for_timeout(250)
    dlg().get_by_label("Your question").fill("Can this be split across two cost centres?")
    dlg().get_by_role("button", name="Send question").click(); page.wait_for_timeout(300)
    li.get_by_role("button", name="We have paid this").click(); page.wait_for_timeout(300)
    stp = data(page, f"(() => {{ const i = db.salesInvoices.find(i=>i.accountsNo==='{nxt}'); const q = db.invoiceQueries.find(q=>q.salesInvoiceId===i.id && q.status==='Open'); return [q.via, q.raisedBy, i.clientPaidOn === day, i.status, db.activity[0].who] }})()")
    check("Portal: asking raises a query for accounts, and saying it is paid flags it without marking it paid", stp == ["Portal", "Susan Kane", True, "Invoiced", "Susan Kane"] and "You told us on" in li.inner_text() and li.get_by_role("button", name="We have paid this").count() == 0, stp)
    block = main.locator("section", has=page.get_by_role("heading", name="Ardmullen House", exact=True)).first
    block.get_by_role("button", name="Send us a document").click(); page.wait_for_timeout(250)
    d = dlg(); d.get_by_label("Choose a document from this device").set_input_files(FIX + "cert.pdf"); page.wait_for_timeout(400)
    d.get_by_role("button", name="Send document").click(); page.wait_for_timeout(300)
    check("Portal: a document the client sends shows as sent by them", "Purchase order, cert.pdf" in block.inner_text() and "Sent by you" in block.inner_text())
    as_role(page, "Managing director")
    go(page, "/projects/C720?tab=files&folder=Correspondence", "table")
    check("The document from the portal is in the project's Correspondence folder, marked Portal", page.locator("tbody tr", has_text="Purchase order, cert.pdf").count() == 1 and "Portal" in page.locator("tbody tr", has_text="Purchase order, cert.pdf").inner_text())
    go(page, f"/invoicing/client/{nxt}")
    check("Back in the office: the invoice says the client reports it paid, and their question is waiting", "said in the portal" in main.inner_text() and "Can this be split across two cost centres?" in main.inner_text())
    go(page, "/admin/activity", "table")
    check("Activity log: sending, the query and the client's own steps are all recorded", all(w in main.inner_text() for w in ["Sent an invoice to the client", "Settled an invoice query", "Said an invoice has been paid", "Sent a document through the portal"]))

    # ── Who may do what
    as_role(page, "Accounts")
    go(page, f"/invoicing/client/{nxt}")
    check("Accounts can send again and mark paid", page.get_by_role("button", name="Send again").count() == 1 and page.get_by_role("button", name="Mark paid").count() == 1)
    as_role(page, "Managing director")

    # ── Dark and phone
    go(page, f"/invoicing/client/{nxt}")
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    bg = page.get_by_label(re.compile("^Invoice .* as the client receives it")).evaluate("e => getComputedStyle(e).backgroundColor")
    check("Dark mode: the invoice stays white paper", bg == "rgb(255, 255, 255)", bg)
    page.screenshot(path=f"{OUT}/206-invoice-dark.png")
    page.get_by_role("button", name="Switch to light mode").click()
    page.set_viewport_size({"width": 390, "height": 844})
    for path in ["/invoicing", "/invoicing/invoiced", f"/invoicing/client/{nxt}", "/invoicing/queries", "/invoicing/export", "/invoicing/design", "/invoicing/email"]:
        go(page, path)
        check(f"Phone width: page itself does not scroll sideways on {path}", not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"))
    go(page, "/invoicing", "table")
    page.get_by_role("button", name="Draft an invoice").click(); page.wait_for_timeout(300)
    dlg().get_by_role("list", name="Projects found").locator("button").first.click(); page.wait_for_timeout(300)
    box = dlg().bounding_box()
    check("Phone width: the draft form fits the screen, with its buttons in view", box["width"] <= 390 and dlg().get_by_role("button", name="Create draft invoice").is_visible(), box)
    page.screenshot(path=f"{OUT}/207-draft-phone.png")

errs = []
try:
    errs = run(steps)
except Exception as ex:
    print("STOPPED EARLY:", str(ex).split("\n")[0][:400])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail[:300]}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
