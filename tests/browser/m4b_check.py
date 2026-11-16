import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sys, re
from shots import run, BASE, OUT
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), str(detail)))
def data(page, expr):
    return page.evaluate("(() => { const s = JSON.parse(localStorage.getItem('cod.data')).state; const db = s.db; const day = s.day; return " + expr + "; })()")
def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    main = page.locator("main")
    page.goto(BASE + "/dashboard/approvals?open=ap-7"); page.wait_for_timeout(500)
    if main.get_by_label("Drafted reply").count() == 0:
        main.locator("button", has_text="Reply to Imelda Fahy").first.click(); page.wait_for_timeout(300)
    body = main.get_by_label("Drafted reply"); subj = main.get_by_label("Subject")
    check("Approvals: a drafted reply has an editable subject and body", body.count() == 1 and subj.count() == 1 and body.is_editable() and len(body.input_value()) > 40)
    body.click(); body.press("ControlOrMeta+End"); page.keyboard.type("\nI will call to you myself on Monday at ten.", delay=8)
    subj.fill("Dust on Main Street: what we are doing about it"); page.wait_for_timeout(250)
    saved = data(page, "(() => { const m = db.mails.find(m => m.id === db.approvals.find(a=>a.id==='ap-7').mailId); return [m.replyDraft.subject, m.replyDraft.body.endsWith('Monday at ten.')] })()")
    check("Approvals: typing in the reply is saved as you go, without losing the cursor", saved == ["Dust on Main Street: what we are doing about it", True] and body.input_value().endswith("Monday at ten."), saved)
    page.screenshot(path=f"{OUT}/140-reply-edit.png")
    page.reload(); page.wait_for_timeout(500)
    if main.get_by_label("Drafted reply").count() == 0:
        main.locator("button", has_text="Reply to Imelda Fahy").first.click(); page.wait_for_timeout(300)
    check("Approvals: the edit survives a refresh", main.get_by_label("Drafted reply").input_value().endswith("Monday at ten."))
    main.get_by_role("button", name=re.compile("^Approve")).click(); page.wait_for_timeout(300)
    sent = data(page, "db.mails.filter(m => m.folder==='Sent')[0]")
    check("Approvals: what goes out is the edited reply, under the edited subject", sent["subject"] == "Dust on Main Street: what we are doing about it" and sent["body"].endswith("Monday at ten.") and sent["fromName"] == "Aidan King", (sent["subject"], sent["body"][-40:]))
    # 16 Nov: one way of sending. The draft is used up, so the reply cannot go twice, and the copy is from the shared mailbox.
    after = data(page, "(() => { const m = db.mails.find(m => m.id === 'mail-7'); const s = db.mails.filter(x => x.folder==='Sent' && x.subject==='Dust on Main Street: what we are doing about it'); return [m.folder, !!m.replyDraft, s.length, s[0].fromAddress === m.mailbox] })()")
    check("Approvals: the reply is filed once, from the shared mailbox, and nothing is left to send", after == ["Archive", False, 1, True], after)
    page.goto(BASE + "/inbox/archive?mail=mail-7"); page.wait_for_timeout(400)
    check("Email: the archived email offers no second Send reply", main.get_by_text("Dust on Main Street").count() >= 1 and main.get_by_role("button", name="Send reply").count() == 0)
    page.goto(BASE + "/plant/register"); page.wait_for_selector("table")
    page.get_by_role("button", name="Add plant").click(); d = page.locator("dialog[open]").last
    d.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Own plant: reference, name and kind are required", "Reference, name and kind are needed" in d.inner_text())
    d.get_by_label("Reference").fill("mx1"); d.get_by_label("Name").fill("Another mixer"); d.locator("button[type=submit]").click(); page.wait_for_timeout(150)
    check("Own plant: a reference already in use is refused", "already in use" in d.inner_text())
    d.get_by_label("Reference").fill("mx5"); d.get_by_label("Name").fill("Belle 150 drum mixer"); d.get_by_label("Spec").fill("150 litre, petrol"); d.locator("button[type=submit]").click(); page.wait_for_timeout(300)
    check("Own plant: a new item is added to the yard and listed", page.locator("tbody tr").count() == 25 and "Yard" in page.locator("tbody tr", has_text="MX5").inner_text())
    page.goto(BASE + "/plant"); page.wait_for_selector("table")
    check("Plant overview: the new item shows under In the yard", page.locator("section", has_text="In the yard").locator("tr", has_text="MX5").count() == 1)
    page.goto(BASE + "/plant/vehicles"); page.wait_for_selector("table")
    b = page.get_by_role("button", name="Add vehicle").bounding_box()
    check("Vehicles: the Add vehicle button is on screen at the top right", b and b["y"] < 120 and b["x"] > 1200, b)
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(250)
    b = page.get_by_role("button", name="Add vehicle").bounding_box()
    check("Vehicles: and still on screen at phone width", b and 0 <= b["x"] and b["x"] + b["width"] <= 390 and b["y"] < 400, b)
errs = []
try:
    errs = run(steps)
except Exception as ex:
    print("STOPPED EARLY:", str(ex).split("\n")[0][:400])
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"  [{detail[:300]}]"))
print("console problems:", errs)
print(f"{sum(1 for r in results if r[1])}/{len(results)} passed")
