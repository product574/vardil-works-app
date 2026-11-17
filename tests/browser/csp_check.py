import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from playwright.sync_api import sync_playwright
import re
B = "http://127.0.0.1:4180"
errs = []; viol = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
    page = b.new_page(viewport={"width": 1440, "height": 900})
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.add_init_script("document.addEventListener('securitypolicyviolation', e => { (window.__v = window.__v || []).push(e.violatedDirective + ' ' + e.blockedURI) })")
    r = page.goto(B + "/"); h = r.headers
    print("headers on the page:", {k: (h.get(k) or "MISSING")[:60] for k in ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "strict-transport-security", "x-robots-tag", "permissions-policy"]})
    page.wait_for_selector("#username"); page.fill("#username", "demo"); page.fill("#password", "demo"); page.keyboard.press("Enter")
    page.get_by_role("button", name="Managing director").click(); page.wait_for_selector("text=AI overview")
    seen = []
    for path in ["/dashboard?open=ap-7", "/sales", "/projects", "/projects/C720", "/projects/C720?tab=files", "/people/timesheet", "/profit", "/profit/costs", "/admin/bank-holidays", "/people/certs", "/schedule", "/schedule/month", "/schedule/today", "/schedule/holidays", "/schedule/holiday-requests", "/people/history", "/people/payroll", "/people/reimbursements", "/invoicing/costs", "/chat", "/plant", "/plant/fleet", "/plant/fleet/documents", "/plant/fleet/repairs", "/files", "/files/unsorted", "/invoicing/supplier", "/invoicing/export", "/inbox", "/portal", "/site", "/admin", "/admin/access", "/admin/sites", "/invoicing", "/invoicing/held", "/admin/billing", "/admin/connections", "/admin/automations", "/admin/activity", "/settings", "/settings/region", "/settings/about"]:
        page.goto(B + path); page.wait_for_timeout(450); seen.append(path)
        viol += page.evaluate("window.__v || []")
    # things the policy must still allow: a picked photo (data: image), theme colours set from script, a dialog
    page.goto(B + "/projects/C720"); page.get_by_role("tab", name="Photos").click(); page.get_by_role("button", name="Add a photo").click()
    d = page.locator("dialog[open]"); d.get_by_label("Choose a photo from this device").set_input_files(FIX + "site-photo.jpg"); page.wait_for_timeout(700)
    ok_img = d.locator("img").evaluate("i => i.naturalWidth > 0")
    viol += page.evaluate("window.__v || []")
    page.goto(B + "/settings"); page.get_by_role("button", name="Brick").click(); page.wait_for_timeout(200)
    accent = page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    fonts = page.evaluate("document.fonts.check('14px Barlow')")
    # things it must block
    blocked = page.evaluate("""async () => { const out = {}; try { await fetch('https://example.com/'); out.fetch = 'allowed' } catch { out.fetch = 'blocked' }
      const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.body.append(s); out.inline = window.__inline ? 'ran' : 'blocked'; return out }""")
    frame = page.evaluate("""async () => new Promise(res => { const f = document.createElement('iframe'); f.src = location.origin + '/'; f.onload = () => { try { res(f.contentDocument && f.contentDocument.body.children.length > 0 ? 'framed' : 'refused') } catch { res('refused') } }; f.onerror = () => res('refused'); document.body.append(f); setTimeout(() => res('refused'), 2500) })""")
    print("screens opened under the policy:", len(seen))
    print("photo preview shows:", ok_img, "| brand colour applied:", accent, "| fonts loaded:", fonts)
    print("policy violations while using the app:", sorted(set(viol)))
    print("outside request:", blocked["fetch"], "| injected inline script:", blocked["inline"], "| page inside a frame:", frame)
    print("console errors (expected: only the two deliberate blocks):", [e[:110] for e in errs])
    b.close()
