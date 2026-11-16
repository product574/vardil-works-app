import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
# The hosted build (VITE_LOGIN=access) behind a stand-in for Cloudflare Access.
# Build it first:  npm run build:access-test
# This script serves dist-access with the real _headers (port 4182) and answers Cloudflare's
# two addresses (/cdn-cgi/access/get-identity and /cdn-cgi/access/logout) itself.
import json, subprocess, time
from playwright.sync_api import sync_playwright

B = "http://127.0.0.1:4182"
EMAIL = "mary@firm.ie"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

def identity(ok=True, kind="json"):
    def handler(route):
        if not ok:
            route.fulfill(status=404, content_type="text/plain", body="not found")
        elif kind == "html":
            # What an unprotected copy might answer: the app's own page, not Cloudflare's JSON.
            route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>x</title>")
        else:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"email": EMAIL, "idp": {"type": "onetimepin"}}))
    return handler

def logout(route):
    route.fulfill(status=200, content_type="text/html", body="<!doctype html><title>Signed out</title><p>Signed out of Cloudflare Access</p>")

server = subprocess.Popen([sys.executable, os.path.join(HERE, "csp_server.py"), "dist-access", "4182"])
time.sleep(1.2)
problems = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])

        # 1. Signed in through Access: straight to the role page, no password page anywhere
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        ctx.route("**/cdn-cgi/access/get-identity", identity())
        ctx.route("**/cdn-cgi/access/logout", logout)
        page = ctx.new_page()
        page.on("console", lambda m: problems.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
        page.add_init_script("document.addEventListener('securitypolicyviolation', e => { (window.__v = window.__v || []).push(e.violatedDirective + ' ' + e.blockedURI) })")
        r = page.goto(B + "/")
        csp = r.headers.get("content-security-policy", "")
        check("Policy allows connections to this site only", "connect-src 'self';" in csp and "supabase" not in csp, csp[:140])
        page.wait_for_url("**/who")
        page.wait_for_selector("text=Who are you signing in as?")
        check("Opening the address goes straight to the role page", "/who" in page.url, page.url)
        check("No username or password boxes", page.locator("#username, #password, input[type=password]").count() == 0)
        check("Role page names the signed-in email", page.get_by_text(f"You are signed in to the demo as {EMAIL}.").count() == 1)
        check("Six roles offered", page.locator("ul button").count() == 6, str(page.locator("ul button").count()))
        page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
        page.wait_for_selector("text=AI overview")
        check("Managing director reaches the dashboard", "/dashboard" in page.url)
        page.goto(B + "/sign-in"); page.wait_for_url("**/who")
        check("The old sign-in address sends a signed-in person to the role page", "/who" in page.url, page.url)
        page.goto(B + "/plant"); page.wait_for_selector("h1")
        check("A department loads by direct address", "/plant" in page.url and page.locator("nav[aria-label=Departments]").count() == 1)

        # 2. A screen whose file cannot be fetched (sign-in run out, or a newer version published)
        page.route("**/assets/Inbox-*.js", lambda route: route.abort())
        page.get_by_role("link", name="Email").first.click(); page.wait_for_timeout(800)
        check("A screen that will not load says so in plain words", page.get_by_text("This screen could not be opened").count() == 1)
        check("It offers a reload", page.get_by_role("button", name="Reload the page").count() == 1)
        check("The top bar and departments stay in place", page.locator("nav[aria-label=Departments]").count() == 1)
        check("No raw router error text", page.get_by_text("Unexpected Application Error").count() == 0)
        page.unroute("**/assets/Inbox-*.js")
        page.get_by_role("button", name="Reload the page").click(); page.wait_for_selector("text=Inbox")
        check("Reloading opens the screen once the file is reachable", page.get_by_text("This screen could not be opened").count() == 0, page.url)

        # 3. Signing out hands over to Cloudflare
        page.get_by_role("button", name="Account menu").click(); page.get_by_role("menuitem", name="Sign out").click()
        page.wait_for_url("**/cdn-cgi/access/logout")
        check("Sign out goes to Cloudflare's sign-out address", page.url.endswith("/cdn-cgi/access/logout"), page.url)
        page.goto(B + "/who"); page.wait_for_selector("text=Who are you signing in as?")
        page.get_by_role("button", name="Leave the demo").click(); page.wait_for_url("**/cdn-cgi/access/logout")
        check("Leave the demo also goes to Cloudflare's sign-out address", page.url.endswith("/cdn-cgi/access/logout"), page.url)
        violations = page.evaluate("window.__v || []")
        check("No policy violations while signed in", violations == [], str(violations))
        ctx.close()

        # 4. Cloudflare cannot confirm the sign-in: the demo stays shut
        for label, handler in [("Cloudflare answers not found", identity(ok=False)), ("an unprotected copy answers with a web page", identity(kind="html"))]:
            c2 = b.new_context(viewport={"width": 1440, "height": 900})
            c2.route("**/cdn-cgi/access/get-identity", handler)
            p2 = c2.new_page()
            p2.goto(B + "/dashboard"); p2.wait_for_url("**/sign-in"); p2.wait_for_selector("h1")
            check(f"When {label}, the demo does not open", p2.locator("nav[aria-label=Departments]").count() == 0 and p2.get_by_text("AI overview").count() == 0)
            check(f"When {label}, a plain message says what to do", p2.get_by_text("We could not confirm your sign-in").count() == 1 and p2.get_by_role("button", name="Reload the page").count() == 1)
            check(f"When {label}, there is no password form to try", p2.locator("input").count() == 0)
            p2.goto(B + "/who"); p2.wait_for_url("**/sign-in")
            check(f"When {label}, the role page is shut too", "/sign-in" in p2.url, p2.url)
            c2.close()

        # 5. Phone width
        c3 = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=1)
        c3.route("**/cdn-cgi/access/get-identity", identity(ok=False))
        p3 = c3.new_page(); p3.goto(B + "/"); p3.wait_for_url("**/sign-in"); p3.wait_for_selector("h1")
        check("Message page has no sideways scroll at phone width", p3.evaluate("document.documentElement.scrollWidth <= window.innerWidth"))
        c3.close()
        b.close()
finally:
    server.terminate()

expected = [x for x in problems if "A screen could not be opened" in x or "Failed to load resource" in x or "net::ERR_FAILED" in x or "dynamically imported module" in x]
others = [x for x in problems if x not in expected]
print("console problems:", others)
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))
print(f"{sum(ok for _, ok, _ in results)}/{len(results)} passed")
