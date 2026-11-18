import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sys, json
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.path.join(HERE, "shots")
os.makedirs(OUT, exist_ok=True)

def run(steps):
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME", "/usr/bin/google-chrome"), args=["--no-sandbox"])
        ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = ctx.new_page()
        errors = []
        page.on("console", lambda m: errors.append(f"{m.type}: {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        steps(page, ctx)
        b.close()
        return errors

def sign_in(page, role="Managing director"):
    page.goto(BASE + "/")
    page.wait_for_url("**/sign-in")
    page.fill("#username", "demo")
    page.fill("#password", "demo")
    page.click("button[type=submit]")
    page.wait_for_url("**/who")
    page.get_by_role("button", name=role).click()
    page.wait_for_load_state("networkidle")

if __name__ == "__main__":
    def steps(page, ctx):
        page.goto(BASE + "/")
        page.wait_for_url("**/sign-in")
        page.screenshot(path=f"{OUT}/01-sign-in.png")
        page.fill("#username", "demo"); page.fill("#password", "wrong")
        page.click("button[type=submit]"); page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/02-sign-in-error.png")
        page.fill("#password", "demo"); page.click("button[type=submit]")
        page.wait_for_url("**/who"); page.wait_for_timeout(300)
        page.screenshot(path=f"{OUT}/03-who.png")
        page.get_by_role("button", name="Managing director").click()
        page.wait_for_url("**/dashboard"); page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/04-dashboard.png")
        page.goto(BASE + "/dashboard?open=ap-1"); page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/05-approvals.png")
        page.goto(BASE + "/admin/automations"); page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/06-automations.png")
        page.goto(BASE + "/admin/activity"); page.wait_for_timeout(400)
        page.screenshot(path=f"{OUT}/07-activity.png")
    errs = run(steps)
    print("console:", errs)


# The sample data checks and exports last week from its Tuesday on, so on a Wednesday to Friday
# there is nothing left to check. The payroll steps take last week back to "not checked yet".
OPEN_LAST_WEEK = """(() => { const k = 'cod.data'; const s = JSON.parse(localStorage.getItem(k)); const db = s.state.db;
  const d = new Date(s.state.day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - 7);
  const mon = d.toISOString().slice(0, 10);
  db.payrollChecks = db.payrollChecks.filter(c => c.weekStart !== mon); db.payrollExports = db.payrollExports.filter(x => x.weekStart !== mon);
  localStorage.setItem(k, JSON.stringify(s)); })()"""
def open_last_week(page):
    page.evaluate(OPEN_LAST_WEEK); page.reload(); page.wait_for_selector("main h1"); page.wait_for_timeout(400)
