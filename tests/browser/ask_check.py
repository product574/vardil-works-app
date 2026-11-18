import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
# Ask AI (milestone 7) in a real browser, against ask_server.py, which serves the local build
# with its real _headers and stands in for the model with scripted answers.
# Build it first:  npm run build:local
# It does not test the real model or Cloudflare: that is the live check.
import json, re, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

B = "http://127.0.0.1:4184"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")

def asks():
    return json.loads(urllib.request.urlopen(B + "/__asks").read())

def said(req):
    """The words of the newest question in a logged request, screen line included."""
    return " ".join(b.get("text", "") for b in req["messages"][-1]["content"] if b.get("type") == "text")

server = subprocess.Popen([sys.executable, os.path.join(HERE, "ask_server.py"), "dist", "4184"])
time.sleep(1.2)
problems = []

def signin(page, role):
    page.goto(B + "/"); page.wait_for_selector("#username")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.get_by_role("button", name=role).click(); page.wait_for_timeout(500)

def last_turn(page):
    return page.locator("#ask-panel [data-turn]").last

def wait_done(page, timeout=8000):
    page.wait_for_function("() => { const t = [...document.querySelectorAll('#ask-panel [data-turn]')].pop(); return t && (t.dataset.turn === 'done' || t.dataset.turn === 'error'); }", timeout=timeout)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.add_init_script("document.addEventListener('securitypolicyviolation', e => { (window.__v = window.__v || []).push(e.violatedDirective + ' ' + e.blockedURI) })")
        urllib.request.urlopen(B + "/__reset")

        # 1. The button: managing director only, beside the search box
        signin(page, "Managing director"); page.wait_for_url("**/dashboard"); page.wait_for_selector("text=AI overview")
        btn = page.get_by_role("button", name="Ask AI", exact=True)
        check("Managing director has an Ask AI button", btn.count() == 1)
        sb = page.locator("header input[type=search]").bounding_box(); bb = btn.bounding_box()
        check("It sits just right of the search box", bb["x"] > sb["x"] + sb["width"] and bb["x"] - (sb["x"] + sb["width"]) < 20, f"{sb} {bb}")
        check("The panel is closed to start with", page.locator("#ask-panel").count() == 0 and btn.get_attribute("aria-expanded") == "false")

        # 2. Opening it: suggestions for the screen, the screen stays beside it
        btn.click(); page.wait_for_selector("#ask-panel")
        check("Clicking opens the panel", page.locator("#ask-panel").is_visible() and btn.get_attribute("aria-expanded") == "true")
        check("The question box has the focus", page.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')") == "Your question")
        check("Suggestions for the dashboard", page.locator("#ask-panel").get_by_text("What needs my attention today?").count() == 1 and page.locator("#ask-panel").get_by_text("Across the firm").count() == 1)
        panel = page.locator("#ask-panel").bounding_box(); main = page.locator("main#main").bounding_box()
        check("The screen stays open beside the panel, not under it", main["x"] + main["width"] <= panel["x"] + 1 and panel["width"] > 380, f"{main} {panel}")
        bar = page.locator("nav[aria-label=Departments] ul").bounding_box()
        check("The department bar moves over so it does not cover the panel", bar["x"] + bar["width"] <= panel["x"] + 1, f"{bar}")
        check("Ask is the one filled button and starts disabled", page.locator("#ask-panel").get_by_role("button", name="Ask", exact=True).is_disabled())
        check("Says where answers come from and that they are kept", page.locator("#ask-panel").get_by_text("Questions and answers are kept by Vardil to improve the demo.").count() == 1)

        # 3. A question: streams in, with links to the screens
        page.locator("#ask-panel").get_by_role("button", name="Which invoices are overdue?").click()
        page.wait_for_selector("#ask-panel [data-turn]")
        check("The question shows straight away", page.locator("#ask-panel").get_by_text("Which invoices are overdue?", exact=True).count() >= 1)
        seen_partial = False
        for _ in range(60):
            t = last_turn(page).inner_text()
            if "Three invoices" in t and "chase first" not in t: seen_partial = True; break
            page.wait_for_timeout(15)
        wait_done(page)
        check("The answer appears as it is written, before it is finished", seen_partial)
        txt = last_turn(page).inner_text()
        check("The full answer arrives", "Dunmoy is the largest and the oldest" in txt and "€193,336" in txt, txt[:200])
        links = last_turn(page).locator("a")
        check("Each invoice links to its screen", links.filter(has_text="SI-10404").first.get_attribute("href") == "/invoicing/invoiced" and links.filter(has_text="C711 Dunmoy Bridewell").first.get_attribute("href") == "/projects/C711")
        check("A list in the answer is drawn as a list", last_turn(page).locator("ul li").count() == 3)
        check("No spinner anywhere", page.locator("[class*=spin], [role=progressbar]").count() == 0)
        check("With no daily limit (the default), no count of questions left is shown", page.locator("#ask-panel").get_by_text("left today").count() == 0)
        r = asks()[-1]
        check("The page sends the screen it was asked from", r["messages"][-1]["content"][0]["text"].startswith("[Screen: /dashboard (Dashboard: Overview)]"))
        check("The page sends the summary of the records", "## Sales invoices" in r["snapshot"] and re.search(r"^SI-\d{5} \| C711 \|", r["snapshot"], re.M) is not None and r["kind"] == "question")
        links.filter(has_text="SI-10404").first.click(); page.wait_for_url("**/invoicing/invoiced")
        # The Invoicing screen loads its own file the first time, a moment after the address changes.
        page.get_by_role("heading", name="Client invoices").first.wait_for()
        check("A link opens its screen behind the panel, and the conversation stays", page.locator("#ask-panel").get_by_text("Dunmoy is the largest").count() == 1 and page.get_by_role("heading", name="Client invoices").count() >= 1)

        # 4. The question is in the activity log with who asked it, not the answer
        page.goto(B + "/admin/activity"); page.wait_for_selector("h1")
        row = page.locator("main").get_by_text("Which invoices are overdue?").first
        check("Activity log records the question", row.count() == 1)
        check("with who asked it", page.locator("main").get_by_text("Asked Ask AI").count() >= 1 and page.locator("main").get_by_text("Aidan King").count() >= 1)
        check("but not the answer", page.locator("main").get_by_text("Dunmoy is the largest").count() == 0)

        # 5. A draft: made by the page, waiting in Approvals, sent only on approval
        page.goto(B + "/dashboard"); page.wait_for_selector("#ask-panel")
        box = page.locator("#ask-panel textarea"); box.fill("Draft a chaser to Dunmoy."); box.press("Enter")
        wait_done(page)
        card = last_turn(page)
        check("A draft card says it was drafted and is waiting", card.get_by_text("Drafted for you").count() == 1 and card.get_by_text("Chaser, waiting in Approvals").count() == 1, card.inner_text()[:300])
        check("It names who it goes to", card.get_by_text("To Fintan Garrihy, Dunmoy County Council").count() == 1)
        check("The model is told it worked and says so, with a link", card.get_by_role("link", name="Approvals").count() >= 1)
        reqs = asks(); q, c = reqs[-2], reqs[-1]
        check("The second round is a follow-up carrying the draft's result", c["kind"] == "continue" and c["turnId"] == q["turnId"] and c["messages"][-1]["content"][0]["type"] == "tool_result" and c["messages"][-1]["content"][0]["content"].startswith("Drafted and waiting in Approvals"))
        thinking = c["messages"][-2]["content"][0]
        # The stand-in model signs its thinking "sig-N", N being how many requests it had seen.
        check("The model's hidden thinking goes back unchanged", thinking == {"type": "thinking", "thinking": "", "signature": f"sig-{len(reqs) - 1}"}, json.dumps(thinking))
        check("Both rounds send the same summary, so the cache is used", q["snapshot"] == c["snapshot"])
        check("Earlier questions go back as the conversation", any("Which invoices are overdue" in json.dumps(m) for m in q["messages"][:-1]))
        dun = data(page, "(() => { const p = db.projects.find(p => p.code === 'C711'); const i = db.salesInvoices.find(i => i.projectId === p.id); return { ref: i.accountsNo ?? i.ref, late: Math.round((Date.parse(day) - Date.parse(i.dueOn)) / 864e5) }; })()")
        ref = dun["ref"]
        card.get_by_role("link", name="Open in Approvals").click(); page.wait_for_url("**/dashboard?open=*")
        main_ = page.locator("main")
        # The row opens a moment after the address changes, so wait for its form.
        main_.get_by_label("Subject").wait_for()
        check("Approvals opens the chaser", main_.get_by_text(f"Chaser: {ref}").count() >= 1)
        check("It shows who it goes to, and the mailbox it goes from", main_.locator("p", has_text="To Fintan Garrihy <fgarrihy@dunmoycoco.example>, from accounts@").count() == 1, main_.locator("p", has_text="Fintan Garrihy").all_inner_texts())
        check("Its subject can be edited", main_.get_by_label("Subject").input_value() == f"{ref}, Dunmoy Bridewell final account")
        body = main_.get_by_label("Email")
        check("Its text can be edited", f"{dun['late']} days overdue" in body.input_value(), body.input_value()[:200])
        body.fill(body.input_value().replace("Could you let me know", "Could you please let me know"))
        main_.get_by_role("button", name="Approve chaser").click()
        page.wait_for_selector("text=Chaser approved and filed under Sent")
        page.goto(B + "/inbox/sent"); page.wait_for_selector("h1")
        check("Approved, it is filed under Sent as edited", page.get_by_text(f"{ref}, Dunmoy Bridewell final account").count() >= 1)
        page.get_by_text(f"{ref}, Dunmoy Bridewell final account").first.click(); page.wait_for_timeout(300)
        check("with the edit in it", page.get_by_text("Could you please let me know").count() >= 1)

        # 6. The other drafts
        page.goto(B + "/projects/C725"); page.wait_for_selector("#ask-panel")
        check("Suggestions change with the screen", page.locator("#ask-panel").get_by_text("New conversation").count() == 1)
        box = page.locator("#ask-panel textarea")
        for q_, label in [("Draft a progress update to the client", "Client update"), ("Draft a reply to the Glebe House email", "Reply"), ("Draft a quote for the Glebe House enquiry", "Quote")]:
            box.fill(q_); box.press("Enter"); wait_done(page)
            check(f"Draft made: {label}", last_turn(page).get_by_text(f"{label}, waiting in Approvals").count() == 1, last_turn(page).inner_text()[:200])
        r = [x for x in asks() if x["kind"] == "question"][-3]
        check("A question on a project page names the project", r["messages"][-1]["content"][0]["text"].startswith("[Screen: /projects/C725 (C725 Granary Quay Warehouses)]"))
        box.fill("Draft a paid chaser for INV-5201"); box.press("Enter"); wait_done(page)
        check("A draft that makes no sense is refused, and the model is told why", re.search(r"I could not draft that: Not drafted: SI-\d{5} is already paid", last_turn(page).inner_text()) is not None, last_turn(page).inner_text()[:200])
        page.goto(B + "/dashboard"); page.wait_for_selector("h1")
        for t in ["Client update: C725 Granary Quay Warehouses", "Reply to Eleanor Prendiville", "Quote Q-"]:
            check(f"Waiting in Approvals: {t}", page.locator("main").get_by_text(t).count() >= 1)

        # 7. Safety of answers
        box = page.locator("#ask-panel textarea")
        box.fill("evil link"); box.press("Enter"); wait_done(page)
        lt = last_turn(page)
        check("A link out of the demo is shown as plain words", lt.locator("a[href*='evil']").count() == 0 and lt.get_by_text("this page").count() == 1)
        check("A link to a page that is not a screen is plain words too", lt.locator("a[href='/ask-log']").count() == 0)
        check("A link to a screen is kept", lt.locator("a[href='/dashboard']").count() == 1)
        box.fill("dash test"); box.press("Enter"); wait_done(page)
        check("Long dashes the model lets slip are taken out", "—" not in last_turn(page).inner_text() and "weeks 3-4" in last_turn(page).inner_text())
        box.fill("bold link test"); box.press("Enter"); wait_done(page)
        lt = last_turn(page)
        check("A link inside bold stays a link, in bold, with no markdown showing", lt.locator("a.font-semibold[href='/sales/quotes/Q-2614']").count() == 1 and "](" not in lt.inner_text() and "**" not in lt.inner_text(), lt.inner_text()[:160])
        box.fill("table test"); box.press("Enter"); wait_done(page)
        check("A table is drawn as a table, numbers to the right", last_turn(page).locator("table td.num").count() == 2)

        # 8. A daily limit set on the project: the count shows, and goes when the limit does
        box.fill("count test"); box.press("Enter"); wait_done(page)
        check("With a daily limit set, the questions left are shown", page.locator("#ask-panel").get_by_text(re.compile(r"\d+ questions left today\.")).count() == 1)
        box.fill("plain question"); box.press("Enter"); wait_done(page)
        check("and the count goes when there is no limit again", page.locator("#ask-panel").get_by_text("left today").count() == 0)

        # 9. Plain messages when it cannot answer
        for q_, want in [("limit test", "You have asked all 30 questions allowed for one person today"), ("busy test", "Ask AI is busy just now"), ("signin test", "Your sign-in has run out")]:
            box.fill(q_); box.press("Enter"); wait_done(page)
            check(f"Plain message: {q_}", last_turn(page).get_by_text(want).count() == 1, last_turn(page).inner_text()[:200])

        # 10. Keeping and clearing the conversation, closing
        n = page.locator("#ask-panel [data-turn]").count()
        page.reload(); page.wait_for_selector("#ask-panel")
        check("A reload keeps the conversation and the panel open", page.locator("#ask-panel [data-turn]").count() == n)
        page.locator("#ask-panel textarea").press("Escape")
        check("Escape closes the panel", page.locator("#ask-panel").count() == 0)
        check("and puts the focus back on the button", page.evaluate("document.activeElement && document.activeElement.textContent") == "Ask AI")
        page.get_by_role("button", name="Ask AI", exact=True).click(); page.locator("#ask-panel").get_by_role("button", name="New conversation").click()
        check("New conversation clears it", page.locator("#ask-panel [data-turn]").count() == 0 and page.locator("#ask-panel").get_by_text("Across the firm").count() == 1)
        page.locator("#ask-panel").get_by_role("button", name="Close Ask AI").click()
        violations = page.evaluate("window.__v || []")
        check("No policy violations (the page only talks to its own site)", violations == [], str(violations))

        # 10b. Asking from the search box (16 Nov): the last line offers the words typed to Ask AI
        page.goto(B + "/invoicing"); page.wait_for_selector("main table")
        sbox = page.locator("header input[type=search]")
        res = page.locator("#search-results")
        ask_line = res.get_by_role("button", name=re.compile(r"^Ask AI"))
        sbox.fill("which invoices are overdue"); page.wait_for_timeout(150)
        check("Search: with no record matching, it says so and offers the words to Ask AI", res.get_by_text('No record matches "which invoices are overdue".').count() == 1 and ask_line.count() == 1 and '"which invoices are overdue"' in ask_line.inner_text())
        n0 = len(asks())
        ask_line.click(); page.wait_for_selector("#ask-panel [data-turn]"); wait_done(page)
        txt = last_turn(page).inner_text()
        check("Search: picking the line opens Ask AI and asks the words typed", page.locator("#ask-panel").is_visible() and "which invoices are overdue" in txt and "Dunmoy is the largest and the oldest" in txt, txt[:200])
        sent = asks()[n0:]
        check("Search: one question is sent, about the screen behind", len(sent) == 1 and said(sent[0]).startswith("[Screen: /invoicing"), [said(r)[:80] for r in sent])
        check("Search: the box is emptied and its list closed", sbox.input_value() == "" and res.count() == 0)
        sbox.fill("C719"); page.wait_for_timeout(150)
        opts = res.locator("[role=option]")
        check("Search: records come first and the Ask AI line last", opts.first.inner_text().startswith("C719") and opts.last.inner_text().startswith("Ask AI"), [o.inner_text() for o in opts.all()])
        for _ in range(9): sbox.press("ArrowDown")
        sbox.press("Enter"); page.wait_for_timeout(200); wait_done(page)
        txt = last_turn(page).inner_text()
        check("Search: the arrow keys reach the Ask AI line and Enter asks", "C719" in txt and "You are on /invoicing" in txt, txt[:200])
        # While an answer is still arriving, the words wait in the question box rather than being lost.
        page.locator("#ask-panel textarea").fill("slow test"); page.locator("#ask-panel textarea").press("Enter"); page.wait_for_timeout(200)
        n1 = len(asks())
        sbox.fill("whose tickets run out"); page.wait_for_timeout(150); ask_line.click(); page.wait_for_timeout(150)
        check("Search: while an answer is arriving, the words wait in the question box", page.locator("#ask-panel textarea").input_value() == "whose tickets run out", page.locator("#ask-panel textarea").input_value())
        wait_done(page)
        check("and nothing more is sent until Ask is pressed", len(asks()) == n1, len(asks()) - n1)
        page.locator("#ask-panel").get_by_role("button", name="New conversation").click()
        page.locator("#ask-panel textarea").fill("")
        page.locator("#ask-panel").get_by_role("button", name="Close Ask AI").click()

        # 10c. The AI overview's "Draft chasers" (16 Nov) asks Ask AI to draft them, about the dashboard
        page.goto(B + "/dashboard"); page.wait_for_selector("text=AI overview")
        n2 = len(asks())
        page.locator("main").get_by_role("button", name="Draft chasers").click(); page.wait_for_selector("#ask-panel [data-turn]"); wait_done(page)
        sent = asks()[n2:]
        check("AI overview: Draft chasers asks Ask AI for a chaser per overdue invoice", len(sent) >= 1 and "Draft a chaser for each overdue invoice" in said(sent[0]) and said(sent[0]).startswith("[Screen: /dashboard"), [said(r)[:120] for r in sent])
        check("AI overview: the chaser it drafts waits in Approvals", last_turn(page).get_by_text("Drafted for you").count() == 1)
        page.locator("#ask-panel").get_by_role("button", name="New conversation").click()
        page.locator("#ask-panel").get_by_role("button", name="Close Ask AI").click()

        # 11. Nobody else gets it
        for role in ["Contracts manager", "Site manager", "Accounts"]:
            c2 = b.new_context(viewport={"width": 1440, "height": 900}); p2 = c2.new_page()
            signin(p2, role); p2.wait_for_selector("header")
            check(f"No Ask AI for {role.lower()}", p2.get_by_role("button", name="Ask AI", exact=True).count() == 0)
            c2.close()
        page.goto(B + "/settings/roles?person=p-sm1"); page.wait_for_selector("h1")
        sign_as = page.get_by_role("button", name="Sign in as Eoin to check")
        if sign_as.count():
            sign_as.click(); page.wait_for_timeout(500)
            check("No Ask AI when the managing director signs in as someone else", page.get_by_role("button", name="Ask AI", exact=True).count() == 0)
        else:
            check("No Ask AI when the managing director signs in as someone else", False, "button not found")
        ctx.close()

        # 12. Phone width, dark mode
        c3 = b.new_context(viewport={"width": 390, "height": 844}); p3 = c3.new_page()
        p3.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        signin(p3, "Managing director"); p3.wait_for_selector("header")
        ab = p3.get_by_role("button", name="Ask AI", exact=True)
        check("Phone: the button is there", ab.count() == 1 and ab.is_visible())
        ab.click(); p3.wait_for_selector("#ask-panel"); p3.wait_for_timeout(300)
        pb = p3.locator("#ask-panel").bounding_box()
        check("Phone: the panel fills the screen", pb["x"] == 0 and pb["width"] == 390 and pb["height"] >= 800, str(pb))
        check("Phone: no sideways scroll", p3.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        p3.locator("#ask-panel").get_by_role("button", name="Which invoices are overdue?").click(); wait_done(p3)
        p3.locator("#ask-panel a", has_text="SI-10404").first.click(); p3.wait_for_url("**/invoicing/invoiced")
        check("Phone: following a link closes the panel to show the screen", p3.locator("#ask-panel").count() == 0)
        p3.get_by_role("button", name="Ask AI", exact=True).click(); p3.wait_for_selector("#ask-panel")
        check("Phone: opening it again shows the conversation", p3.locator("#ask-panel").get_by_text("Dunmoy is the largest").count() == 1)
        p3.get_by_role("button", name="Close Ask AI").click()
        check("Phone: it closes", p3.locator("#ask-panel").count() == 0)
        bar3 = p3.locator("header").first
        bar3.get_by_role("button", name="Search", exact=True).click()
        bar3.locator("input[type=search]").fill("whose tickets run out this month"); p3.wait_for_timeout(150)
        p3.locator("#search-results").get_by_role("button", name=re.compile(r"^Ask AI")).click()
        p3.wait_for_selector("#ask-panel"); wait_done(p3); p3.wait_for_timeout(300)
        pb = p3.locator("#ask-panel").bounding_box()
        t3 = last_turn(p3).inner_text()
        check("Phone: asking from the search opens Ask AI across the screen and answers", pb["x"] == 0 and pb["width"] == 390 and "whose tickets run out this month" in t3 and "You are on" in t3, f"{pb} {t3[:160]!r}")
        p3.get_by_role("button", name="Close Ask AI").click()
        check("Phone: closing it leaves the bar as it was", bar3.get_by_role("button", name="Search", exact=True).is_visible() and bar3.get_by_role("button", name="Ask AI", exact=True).is_visible() and not bar3.locator("input[type=search]").is_visible())
        p3.emulate_media(color_scheme="dark")
        c3.close()

        # 13. A copy of the demo with no server behind it
        c4 = b.new_context(viewport={"width": 1440, "height": 900}); p4 = c4.new_page()
        p4.route("**/api/ask", lambda route: route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>x</title>"))
        signin(p4, "Managing director"); p4.wait_for_selector("header")
        p4.get_by_role("button", name="Ask AI", exact=True).click(); p4.locator("#ask-panel textarea").fill("Hello"); p4.locator("#ask-panel textarea").press("Enter")
        p4.wait_for_timeout(600)
        check("Without the server it says so plainly", p4.locator("#ask-panel").get_by_text("Ask AI works on the hosted demo at demo.vardil.com").count() >= 1)
        check("and the box is switched off", p4.locator("#ask-panel textarea").is_disabled())
        c4.close()
        b.close()
finally:
    server.terminate()

# The scripted refusals (limit, busy, sign-in) show in the console as failed requests: expected.
expected = [x for x in problems if "Failed to load resource" in x and any(c in x for c in ("429", "503", "401"))]
print("console problems:", [x for x in problems if x not in expected])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))
print(f"{sum(ok for _, ok, _ in results)}/{len(results)} passed")
