import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
errs=[]; reqs=[]
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page=b.new_page(viewport={"width":1440,"height":900})
    page.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type=="error" else None)
    page.on("pageerror", lambda e: errs.append(f"pageerror: {e}"))
    page.on("request", lambda r: reqs.append(r.url) if not r.url.startswith(("file:","data:","blob:")) else None)
    page.goto("file://" + REPO + "/dist-preview/index.html"); page.wait_for_selector("#username")
    page.fill("#username","demo"); page.fill("#password","demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    bar=page.locator("nav[aria-label=Departments]")
    side=page.locator("nav[aria-label$=screens]:visible")
    bar.get_by_role("link", name="People").click(); page.wait_for_selector("text=marked for today")
    sel=page.locator("select[aria-label^='Today for']").first; sel.select_option("overtime"); page.wait_for_timeout(200)
    assert page.locator("input[aria-label^='Overtime hours for']").count()==1
    page.get_by_role("button", name="Send today's time stamps").click(); page.wait_for_timeout(300)
    for name, expect in [("Attendance history","Totals"),("Employee register","Add employee"),("Training tickets","Record a new ticket"),("Holidays","Record leave")]:
        side.get_by_role("link", name=name).click(); page.wait_for_selector(f"text={expect}")
    bar.get_by_role("link", name="Schedule").click(); page.wait_for_selector("text=double booking")
    assert page.get_by_role("button", name="Send week to operatives").is_disabled()
    side.get_by_role("link", name="Month ahead").click(); page.wait_for_selector("text=On a site")
    side.get_by_role("link", name="Who is where").click(); page.wait_for_selector("text=Not marked yet")
    fonts=page.evaluate("document.fonts.check('14px Barlow') && document.fonts.check('600 20px \"Barlow Semi Condensed\"')")
    print("preview file: timesheet mark and send, history, register, tickets, holidays, week ahead, month ahead, who is where all open")
    print("fonts loaded from inside the file:", fonts)
    print("outside requests:", reqs, "| errors:", errs)
    b.close()
