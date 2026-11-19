import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import re
from shots import run, BASE, OUT

# Reports and Customers, 18 Nov 2026: the Reports section (overview with five figures, sales by
# customer, the ten most profitable jobs paid in full, where the money goes, gross margin on every
# job finished in the last 12 months, tender conversion by kind of work), a year of past work in
# the sample data, and Customers in place of Sales, Clients: a list, a page per customer with tabs,
# adding and changing customers, and every client link landing there.

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
def eur(s):
    return float(re.sub(r"[^\d.\-]", "", s) or 0)
def tile(page, label, within="Key figures"):
    """The value and note of one figure across the top, by its label."""
    box = page.locator(f"dl[aria-label='{within}'] > div", has=page.locator("dt", has_text=re.compile("^" + re.escape(label) + "$")))
    dd = box.locator("dd").all_inner_texts()
    return (dd[0].strip() if dd else "", dd[1].strip() if len(dd) > 1 else "", box)
def csv_of(page, click):
    with page.expect_download() as d:
        click()
    path = d.value.path()
    return d.value.suggested_filename, open(path, encoding="utf-8").read().strip().splitlines()
def no_sideways(page):
    return not page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth")

# The same window the screens use: the demo's day and the 364 days before it.
YEAR = "(() => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 364); return d.toISOString().slice(0, 10); })()"

def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    page.wait_for_selector("main"); page.wait_for_timeout(300)
    main = page.locator("main")
    dlg = lambda: page.locator("dialog[open]").last
    bar = page.get_by_role("navigation", name="Departments")
    # A fresh start, which also writes the sample data to the browser for the checks to read.
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── The bar
    names = [t.strip() for t in bar.get_by_role("link").all_inner_texts()]
    # Merged 19 Nov: Profitability (from the other copy) sits between Invoicing and Reports.
    check("Bar: Customers sits after Sales; Invoicing, Profitability, Reports, then Portal", names.index("Customers") == names.index("Sales") + 1 and names.index("Profitability") == names.index("Invoicing") + 1 and names.index("Reports") == names.index("Profitability") + 1 and names.index("Portal") == names.index("Reports") + 1, names)

    # ── The past year in the sample data
    past = data(page, "db.projects.filter(p => p.code >= 'C697' && p.code <= 'C708')")
    check("Sample data: a year of past work, twelve jobs C697 to C708, all closed and handed over", len(past) == 12 and all(p["status"] == "Closed" and p.get("handoverSentAt") for p in past), len(past))
    unpaid_past = data(page, "db.salesInvoices.filter(i => { const p = db.projects.find(x => x.id === i.projectId); return p && p.code <= 'C708' && i.status !== 'Paid'; }).length")
    check("Sample data: every invoice on a past job is paid", unpaid_past == 0, unpaid_past)
    weekend = data(page, "db.attendance.filter(a => [0, 6].includes(new Date(a.day + 'T12:00:00Z').getUTCDay())).length")
    check("Sample data: no timesheet day on a weekend, the past year included", weekend == 0, weekend)
    late_planned = data(page, "db.projects.filter(p => p.plannedEnd && p.plannedEnd < p.endDate).map(p => p.code).sort()")
    check("Sample data: some jobs finished after their planned date, so on time means something", len(late_planned) >= 4, late_planned)

    # ── Reports overview
    bar.get_by_role("link", name="Reports").click(); page.wait_for_url("**/reports"); page.wait_for_selector("dl[aria-label='Key figures']")
    labels = [t.strip() for t in page.locator("dl[aria-label='Key figures'] dt").all_inner_texts()]
    check("Overview: five figures, tender win rate first", labels == ["Tender win rate", "Average margin, paid jobs", "Sales, last 12 months", "Overdue from clients", "Jobs finished on time"], labels)
    check("Overview: says which 12 months it covers", "Last 12 months:" in main.inner_text())
    page.screenshot(path=f"{OUT}/300-reports.png", full_page=True)

    won = data(page, f"db.quotes.filter(q => q.status === 'Accepted' && q.respondedAt && q.respondedAt.slice(0, 10) >= {YEAR}).length")
    decided = data(page, f"db.quotes.filter(q => (q.status === 'Accepted' || q.status === 'Declined') && q.respondedAt && q.respondedAt.slice(0, 10) >= {YEAR}).length")
    v, note, _ = tile(page, "Tender win rate")
    check("Tender win rate: won of decided in the last 12 months, by number", note == f"{won} won of {decided} decided" and v == f"{100 * won / decided:.1f}%", (v, note, won, decided))

    # The ten most profitable jobs paid in full.
    rows = page.get_by_role("table", name="Most profitable jobs paid in full").locator("tbody tr")
    heads = [h.strip() for h in page.get_by_role("table", name="Most profitable jobs paid in full").locator("th").all_inner_texts()]
    check("Top 10: Job, Price, Cost, Margin, Margin %", heads == ["Job", "Price", "Cost", "Margin", "Margin %"], heads)
    codes = [r.locator("a").first.inner_text().strip() for r in rows.all()]
    paid_in_full = data(page, "db.projects.filter(p => p.status === 'Closed' && db.salesInvoices.some(i => i.projectId === p.id) && db.salesInvoices.filter(i => i.projectId === p.id).every(i => i.status === 'Paid')).map(p => p.code)")
    check("Top 10: ten jobs, every one closed and paid in full", len(codes) == 10 and all(c in paid_in_full for c in codes), codes)
    pcts = [float(r.locator("td").nth(4).inner_text().replace("%", "")) for r in rows.all()]
    check("Top 10: highest margin % first", pcts == sorted(pcts, reverse=True), pcts)
    sums = []
    for r in rows.all():
        t = [x.strip() for x in r.locator("td").all_inner_texts()]
        sums.append(abs(eur(t[1]) - eur(t[2]) - eur(t[3])) <= 1 and abs(eur(t[3]) / eur(t[1]) * 100 - float(t[4].replace("%", ""))) < 0.06)
    check("Top 10: price less cost is the margin, and the margin over price is the %", all(sums), sums)
    pcts_text = [r.locator("td").nth(4).inner_text().strip() for r in rows.all()]
    check("Top 10: every % with one decimal place", all(re.fullmatch(r"-?\d+\.\d%", p) for p in pcts_text), pcts_text)
    v, note, _ = tile(page, "Average margin, paid jobs")
    n_paid = int(re.match(r"(\d+)", note).group(1))
    check("Average margin: counts the jobs paid in full in the last 12 months", n_paid >= 10 and "paid in full" in note, note)

    # Where the money goes.
    money = page.get_by_role("list", name="Where the money goes").locator("li")
    heads = [li.inner_text().split("\n")[0].strip() for li in money.all()]
    check("Where the money goes: labour, materials, subcontractors, plant and hire, transport, other site costs", sorted(heads) == sorted(["Labour", "Materials", "Subcontractors", "Plant and hire", "Transport", "Other site costs"]), heads)
    shares = [float(m.group(1)) for li in money.all() for m in [re.search(r"(\d+(?:\.\d)?)%", li.inner_text())] if m]
    check("Where the money goes: the shares add up to the whole", abs(sum(shares) - 100) <= 0.5, shares)
    amounts = [eur(re.search(r"€[\d,]+", li.inner_text()).group(0)) for li in money.all()]
    check("Where the money goes: biggest first", amounts == sorted(amounts, reverse=True), amounts)

    # Sales by customer, top 6.
    sbc = page.get_by_role("list", name="Sales by customer, top 6").locator("li")
    top_vals = [eur(re.search(r"€[\d,]+", li.inner_text()).group(0)) for li in sbc.all()]
    check("Sales by customer: the top six, biggest first", len(top_vals) == 6 and top_vals == sorted(top_vals, reverse=True), top_vals)
    first_customer = sbc.first.inner_text().split("\n")[0].strip()

    # Each figure opens the screen behind it.
    v, note, box = tile(page, "Tender win rate")
    box.get_by_role("link").click(); page.wait_for_url("**/reports/tenders"); page.wait_for_timeout(250)
    check("Tender win rate figure opens Tender conversion, with the same overall rate", f"{won} won of {decided} decided" in main.inner_text() and v in main.inner_text())
    kinds = page.get_by_role("list", name="Tender win rate by kind of work").locator("li")
    k_text = [li.inner_text() for li in kinds.all()]
    k_won = sum(int(re.search(r"(\d+) won of (\d+) decided", t).group(1)) for t in k_text)
    k_dec = sum(int(re.search(r"(\d+) won of (\d+) decided", t).group(2)) for t in k_text)
    check("Tender conversion: split by kind of work, and the kinds add up to the whole", len(k_text) >= 4 and (k_won, k_dec) == (won, decided), (len(k_text), k_won, k_dec))
    name, lines = csv_of(page, lambda: main.get_by_role("button", name="Export CSV").click())
    check("Tender conversion: Export CSV gives a file with a line per kind of work", name.startswith("tender-conversion-") and lines[0].startswith("Kind of work,Won,Decided") and len(lines) == len(k_text) + 1, (name, lines[:2]))
    page.screenshot(path=f"{OUT}/301-tenders.png", full_page=True)

    go(page, "/reports")
    sales_v, _, box = tile(page, "Sales, last 12 months")
    box.get_by_role("link").click(); page.wait_for_url("**/reports/customers"); page.wait_for_timeout(250)
    rows_c = page.get_by_role("list", name="Sales by customer").locator("li")
    total_c = sum(eur(re.search(r"€[\d,]+", li.inner_text()).group(0)) for li in rows_c.all())
    check("Sales figure opens Sales by customer, and the customers add up to the figure", abs(total_c - eur(sales_v)) <= rows_c.count(), (total_c, sales_v))
    check("Sales by customer: the same customer on top as on the overview", rows_c.first.inner_text().split("\n")[0].strip() == first_customer, first_customer)
    invoiced = data(page, f"Math.round(db.salesInvoices.filter(i => (i.status === 'Invoiced' || i.status === 'Paid') && i.issuedOn && i.issuedOn.slice(0, 10) >= {YEAR} && i.issuedOn.slice(0, 10) <= day).reduce((s, i) => s + i.net, 0))")
    check("Sales by customer: the sales are the client invoices sent in the 12 months, before VAT", abs(invoiced - eur(sales_v)) <= 1, (invoiced, sales_v))
    name, lines = csv_of(page, lambda: main.get_by_role("button", name="Export CSV").click())
    check("Sales by customer: Export CSV gives a line per customer", name.startswith("sales-by-customer-") and lines[0].startswith("Customer,Type,Sales before VAT") and len(lines) == rows_c.count() + 1, (name, len(lines), rows_c.count()))
    rows_c.first.get_by_role("link").first.click(); page.wait_for_url(re.compile(r"/customers/c-")); page.wait_for_timeout(250)
    check("Sales by customer: a customer opens their customer page", main.get_by_role("heading", name=first_customer).count() == 1, page.url)
    page.go_back(); page.wait_for_url("**/reports/customers")

    go(page, "/reports")
    od_v, od_note, box = tile(page, "Overdue from clients")
    box.get_by_role("link").click(); page.wait_for_url("**/invoicing/invoiced?show=overdue"); page.wait_for_selector("table")
    n_od = page.locator("tbody tr").count()
    check("Overdue figure opens the Overdue invoices, the same number of them", page.get_by_role("tab", name=re.compile("^Overdue")).get_attribute("aria-selected") == "true" and od_note.startswith(f"{n_od} invoice"), (od_note, n_od))

    go(page, "/reports")
    ot_v, ot_note, box = tile(page, "Jobs finished on time")
    m = re.match(r"(\d+) of (\d+)", ot_note)
    box.get_by_role("link").click(); page.wait_for_url("**/reports/margin?sort=finished"); page.wait_for_selector("table")
    page.screenshot(path=f"{OUT}/302-margin.png", full_page=True)

    # ── Gross margin
    rows_m = page.get_by_role("table", name="Margin by job").locator("tbody tr")
    finished = data(page, f"db.projects.filter(p => (p.status === 'Complete' || p.status === 'Invoiced' || p.status === 'Closed') && p.endDate >= {YEAR} && p.endDate <= day).length")
    check("Gross margin: every job finished in the 12 months, paid or not", rows_m.count() == finished == int(m.group(2)), (rows_m.count(), finished, ot_note))
    on_time = sum(1 for r in rows_m.all() if "On time" in r.locator("td").nth(1).inner_text())
    check("Gross margin: the On time marks match the figure on the overview", on_time == int(m.group(1)), (on_time, ot_note))
    check("Gross margin: a late job says when it was planned to finish", any("Late, planned" in r.inner_text() for r in rows_m.all()))
    ends = data(page, f"db.projects.filter(p => (p.status === 'Complete' || p.status === 'Invoiced' || p.status === 'Closed') && p.endDate >= {YEAR} && p.endDate <= day).sort((a, b) => b.endDate.localeCompare(a.endDate)).map(p => p.code)")
    shown = [r.locator("a").first.inner_text().split(" ")[0] for r in rows_m.all()]
    check("Gross margin: Newest first sorts by the day each job finished", shown == ends, (shown[:4], ends[:4]))
    page.get_by_label("Sort jobs by").select_option("margin"); page.wait_for_timeout(200)
    margins = [eur(r.locator("td").nth(4).inner_text()) for r in rows_m.all()]
    check("Gross margin: sorting by Margin puts the most euro first", margins == sorted(margins, reverse=True) and "sort=margin" in page.url, margins[:3])
    page.get_by_label("Sort jobs by").select_option("pct"); page.wait_for_timeout(200)
    pcts = [float(r.locator("td").nth(5).inner_text().replace("%", "")) for r in rows_m.all()]
    check("Gross margin: sorting by Margin % puts the best first", pcts == sorted(pcts, reverse=True) and "sort=" not in page.url, pcts[:3])
    rev_v, rev_note, _ = tile(page, "Revenue")
    cost_v, _, _ = tile(page, "Cost to do them")
    gm_v, _, _ = tile(page, "Gross margin")
    check("Gross margin: revenue less cost is the gross margin", abs(eur(rev_v) - eur(cost_v) - eur(gm_v.split("(")[0])) <= 1, (rev_v, cost_v, gm_v))
    rev_sum = sum(eur(r.locator("td").nth(2).inner_text()) for r in rows_m.all())
    check("Gross margin: the jobs add up to the revenue figure", abs(rev_sum - eur(rev_v)) <= rows_m.count(), (rev_sum, rev_v))
    best = main.locator("a", has=page.locator("span", has_text=re.compile("^Best margin$"))).inner_text()
    check("Gross margin: the best margin card names the job at the top of the table", shown and rows_m.first.locator("a").first.inner_text().split(" ")[0] in best, best[:60])
    name, lines = csv_of(page, lambda: main.get_by_role("button", name="Export CSV").click())
    check("Gross margin: Export CSV gives a line per job", name.startswith("gross-margin-by-job-") and lines[0].startswith("Job,") and len(lines) == rows_m.count() + 1, (name, lines[0], len(lines)))
    rows_m.first.locator("a").first.click(); page.wait_for_url(re.compile(r"/projects/C\d+")); page.wait_for_timeout(250)
    check("Gross margin: a job opens its project page", "/projects/C" in page.url)

    # ── Customers: the list
    bar.get_by_role("link", name="Customers").click(); page.wait_for_url("**/customers"); page.wait_for_selector("table")
    n_clients = data(page, "db.clients.length")
    crow = page.get_by_role("table", name="Customers").locator("tbody tr")
    check("Customers: every customer listed", crow.count() == n_clients == 12, (crow.count(), n_clients))
    vals = [eur(r.locator("td").nth(4).inner_text()) for r in crow.all()]
    check("Customers: biggest sales in the last 12 months first", vals == sorted(vals, reverse=True), vals)
    page.screenshot(path=f"{OUT}/310-customers.png", full_page=True)
    page.get_by_placeholder("Name, contact, type or Sage account").fill("kerry"); page.wait_for_timeout(200)
    kerry = [r.locator("a").first.inner_text() for r in crow.all()]
    check("Customers: the search finds them by county", "Kilbrack Hotels" in kerry and all("Kerry" in r.inner_text() for r in crow.all()), kerry)
    page.get_by_placeholder("Name, contact, type or Sage account").fill("ARDM01"); page.wait_for_timeout(200)
    check("Customers: and by Sage account", crow.count() == 1 and "Ardmullen Estate" in crow.first.inner_text())
    ard_list_sales = crow.first.locator("td").nth(4).inner_text().strip()
    crow.first.get_by_role("link", name="Ardmullen Estate").click(); page.wait_for_url("**/customers/c-02"); page.wait_for_timeout(250)

    # ── Customers: one customer's page
    tabs = [t.strip() for t in page.get_by_role("tablist", name="Customer sections").get_by_role("tab").all_inner_texts()]
    check("Customer page: tabs across the top, each with its count", [re.sub(r"\s*\d+$", "", t) for t in tabs] == ["Overview", "Projects", "Tenders", "Invoices", "Emails", "Files"], tabs)
    v, note, _ = tile(page, "Sales, last 12 months", within="Customer figures")
    check("Customer page: the same sales figure as the Customers list", v == ard_list_sales, (v, ard_list_sales))
    owed_v, _, _ = tile(page, "Owed now", within="Customer figures")
    owed = data(page, "Math.round(db.salesInvoices.filter(i => i.clientId === 'c-02' && i.status === 'Invoiced').reduce((s, i) => s + i.net * (100 + i.vatPct) / 100, 0))")
    check("Customer page: Owed now is their invoices sent and not paid, with VAT", abs(eur(owed_v) - owed) <= 1, (owed_v, owed))
    facts = main.inner_text()
    check("Customer page: their details, terms, Sage account and portal", all(w in facts for w in ["Susan Kane", "091 555 0162", "estate.office@ardmullen.example", "30 days", "ARDM01", "see what they see"]))
    latest = page.get_by_role("list", name="Latest with this customer").locator("li")
    check("Customer page: the latest with them, newest first, each a link", latest.count() >= 5 and latest.locator("a").count() == latest.count(), latest.count())
    page.screenshot(path=f"{OUT}/311-customer.png", full_page=True)

    page.get_by_role("tab", name=re.compile("^Projects")).click(); page.wait_for_timeout(200)
    n_proj = data(page, "db.projects.filter(p => p.clientId === 'c-02').length")
    prow = page.get_by_role("table", name="Ardmullen Estate's projects").locator("tbody tr")
    check("Projects tab: every project for them, past ones included", prow.count() == n_proj and "C699" in main.inner_text() and "C720" in main.inner_text(), (prow.count(), n_proj))
    check("Projects tab: the address remembers the tab", page.url.endswith("?tab=projects"))
    page.get_by_role("tab", name=re.compile("^Tenders")).click(); page.wait_for_timeout(200)
    n_q = data(page, "db.quotes.filter(q => q.clientId === 'c-02').length")
    check("Tenders tab: every tender for them", page.get_by_role("table", name="Ardmullen Estate's tenders").locator("tbody tr").count() == n_q, n_q)
    page.get_by_role("tab", name=re.compile("^Invoices")).click(); page.wait_for_timeout(200)
    irow = page.get_by_role("table", name="Ardmullen Estate's invoices").locator("tbody tr")
    n_i = data(page, "db.salesInvoices.filter(i => i.clientId === 'c-02').length")
    check("Invoices tab: every invoice for them, each opening its own page", irow.count() == n_i and irow.locator("a[href^='/invoicing/client/']").count() >= irow.count(), (irow.count(), n_i))
    page.get_by_role("tab", name=re.compile("^Emails")).click(); page.wait_for_timeout(200)
    n_m = data(page, "db.mails.filter(m => m.clientId === 'c-02').length")
    check("Emails tab: every email with them, each opening in Email", page.get_by_role("table", name="Emails with Ardmullen Estate").locator("tbody tr").count() == n_m and page.get_by_role("table", name="Emails with Ardmullen Estate").locator("a[href^='/inbox']").count() >= 1, n_m)
    page.get_by_role("tab", name=re.compile("^Files")).click(); page.wait_for_timeout(200)
    check("Files tab: their files by project, opening in Files", page.get_by_role("table", name="Ardmullen Estate's files by project").locator("a[href^='/files?project=']").count() >= 1)
    go(page, "/customers/c-02?tab=invoices")
    check("Customer page: an address with a tab opens on that tab", page.get_by_role("tab", name=re.compile("^Invoices")).get_attribute("aria-selected") == "true")
    go(page, "/customers/c-02")
    main.get_by_role("button", name="On: see what they see").click(); page.wait_for_url("**/portal**"); page.wait_for_timeout(300)
    check("Customer page: see what they see opens their portal", "Ardmullen" in main.inner_text())

    # ── Old addresses and links from elsewhere
    go(page, "/sales/clients?client=c-02")
    check("Old address: Sales, Clients for one client lands on their customer page", page.url.endswith("/customers/c-02"), page.url)
    go(page, "/sales/clients")
    check("Old address: Sales, Clients lands on Customers", page.url.endswith("/customers"), page.url)
    go(page, "/sales")
    check("Sales: no Clients screen left in its sidebar", page.locator("nav[aria-label$=screens]:visible").get_by_role("link", name="Clients", exact=True).count() == 0)
    go(page, "/invoicing", "table")
    href = page.locator("tbody tr").first.locator("a[href^='/customers/']").first.get_attribute("href")
    page.locator("tbody tr").first.locator("a[href^='/customers/']").first.click(); page.wait_for_url(f"**{href}"); page.wait_for_timeout(200)
    check("Invoicing: a client's name opens their customer page", re.search(r"/customers/c-\d+$", page.url) is not None, page.url)
    box = page.get_by_role("combobox", name="Search projects, quotes, customers and people")
    box.fill("Kilbrack"); page.wait_for_timeout(250)
    hit = page.locator("#search-results [role=option]", has_text="Kilbrack Hotels")
    check("Search: finds a customer and says so", hit.count() == 1 and "Customer, Declan Moynihan" in hit.inner_text(), hit.count())
    hit.click(); page.wait_for_url("**/customers/c-12"); page.wait_for_timeout(250)

    # ── Changing a customer's details
    main.get_by_role("button", name="Edit details").click(); page.wait_for_timeout(200)
    d = dlg()
    check("Edit details: the form opens with their details and says the Sage account stays", d.get_by_label("Name").input_value() == "Kilbrack Hotels" and "KILB01 stays as it is" in d.inner_text())
    d.get_by_label("Phone").fill("066 555 0199")
    d.get_by_label("Payment terms, days").fill("45")
    d.get_by_label("Email for invoices").fill("accounts@kilbrack")
    d.get_by_role("button", name="Save details").click(); page.wait_for_timeout(200)
    check("Edit details: an email for invoices that is not a full address is refused", "not a full email address" in dlg().inner_text() and data(page, "db.clients.find(c => c.id === 'c-12').termsDays") == 30)
    dlg().get_by_label("Email for invoices").fill("accounts@kilbrackhotels.example")
    dlg().get_by_role("button", name="Save details").click(); page.wait_for_timeout(300)
    c12 = data(page, "db.clients.find(c => c.id === 'c-12')")
    check("Edit details: saved, the Sage account unchanged", c12["contactPhone"] == "066 555 0199" and c12["termsDays"] == 45 and c12["billingEmail"] == "accounts@kilbrackhotels.example" and c12["accountRef"] == "KILB01", c12)
    check("Edit details: the page shows the change", "45 days" in main.inner_text() and "066 555 0199" in main.inner_text())

    # ── Adding a customer
    go(page, "/customers", "table")
    main.get_by_role("button", name="Add customer").click(); page.wait_for_timeout(200)
    dlg().get_by_role("button", name="Add customer").click(); page.wait_for_timeout(200)
    check("Add customer: an empty form says what is missing", "Give the customer a name" in dlg().inner_text())
    dlg().get_by_label("Name").fill("Ardmullen Estate")
    check("Add customer: a name already on the list is refused", "Ardmullen Estate is already a customer" in dlg().inner_text())
    dlg().get_by_label("Name").fill("Tullyvin Mill Trust")
    dlg().get_by_label("Kind of customer").select_option("Heritage trust")
    dlg().get_by_label("Person to deal with").fill("Orla Brennan")
    dlg().get_by_label("Email").first.fill("orla@tullyvinmill.example")
    dlg().get_by_label("County").fill("Sligo")
    dlg().get_by_role("button", name="Add customer").click(); page.wait_for_url(re.compile(r"/customers/c-")); page.wait_for_timeout(300)
    new = data(page, "db.clients.find(c => c.name === 'Tullyvin Mill Trust')")
    check("Add customer: saved with a Sage account and 30 day terms, and their page opens", new and new["accountRef"] == "TULL01" and new["termsDays"] == 30 and page.url.endswith("/customers/" + new["id"]), new)
    check("Add customer: a new customer's page says they are new", "Customer since" in main.inner_text() and re.search(r"Customer since\s+New", main.inner_text()) is not None)
    page.get_by_role("tab", name=re.compile("^Projects")).click(); page.wait_for_timeout(200)
    check("Add customer: an empty Projects tab says there are none yet, with no empty table", main.locator("table").count() == 0 and "No project" in main.inner_text(), main.inner_text()[-200:])
    go(page, "/customers", "table")
    check("Add customer: listed with the others", page.get_by_role("table", name="Customers").locator("tbody tr", has_text="Tullyvin Mill Trust").count() == 1)
    go(page, "/admin/activity")
    check("Activity log: adding and changing a customer are recorded", "Added a customer" in main.inner_text() and "Changed a customer's details" in main.inner_text())

    # ── Who sees Reports and Customers
    as_role(page, "Contracts manager")
    names = [t.strip() for t in bar.get_by_role("link").all_inner_texts()]
    check("Contracts manager: Customers but no Reports by default", "Customers" in names and "Reports" not in names, names)
    page.goto(BASE + "/reports"); page.wait_for_timeout(400)
    check("Contracts manager: the Reports address sends them home", "/reports" not in page.url, page.url)
    as_role(page, "Site manager")
    names = [t.strip() for t in bar.get_by_role("link").all_inner_texts()]
    check("Site manager: neither Customers nor Reports", "Customers" not in names and "Reports" not in names, names)
    as_role(page, "Accounts")
    go(page, "/customers/c-02")
    check("Accounts: can open a customer and change their details", main.get_by_role("button", name="Edit details").count() == 1)
    as_role(page, "Managing director")
    go(page, "/admin/access")
    page.get_by_role("checkbox", name="Site manager: Reports").click(); page.wait_for_timeout(300)
    as_role(page, "Site manager")
    go(page, "/reports")
    labels = [t.strip() for t in page.locator("dl[aria-label='Key figures'] dt").all_inner_texts()]
    check("Reports given to site managers: they see it, without margins or sales, as their money settings say", "Reports" in [t.strip() for t in bar.get_by_role("link").all_inner_texts()] and "Average margin, paid jobs" not in labels and "Tender win rate" in labels and "Most profitable" not in main.inner_text(), labels)
    go(page, "/reports/margin")
    check("Reports given to site managers: Gross margin says margins are switched off for them", "Costs and margins are switched off for you" in main.inner_text())
    as_role(page, "Managing director")
    page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Reset demo data").click()
    page.get_by_role("button", name="Reset demo data").click(); page.wait_for_timeout(400)

    # ── Dark mode and phone width
    go(page, "/reports")
    page.get_by_role("button", name="Switch to dark mode").click(); page.wait_for_timeout(200)
    check("Dark mode: Reports takes the dark colours", page.evaluate("document.documentElement.classList.contains('dark') || document.documentElement.dataset.theme === 'dark'"))
    page.screenshot(path=f"{OUT}/320-reports-dark.png", full_page=True)
    go(page, "/customers/c-02")
    page.screenshot(path=f"{OUT}/321-customer-dark.png", full_page=True)
    page.get_by_role("button", name="Switch to light mode").click()
    page.set_viewport_size({"width": 390, "height": 844})
    for path in ["/reports", "/reports/customers", "/reports/margin", "/reports/tenders", "/customers", "/customers/c-02", "/customers/c-02?tab=invoices"]:
        go(page, path)
        check(f"Phone width: page itself does not scroll sideways on {path}", no_sideways(page))
    go(page, "/reports"); page.screenshot(path=f"{OUT}/330-reports-phone.png", full_page=True)
    go(page, "/customers/c-02"); page.screenshot(path=f"{OUT}/331-customer-phone.png", full_page=True)

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
