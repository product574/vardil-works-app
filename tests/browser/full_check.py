import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import sys
from shots import run, BASE, OUT
def steps(page, ctx):
    page.goto(BASE + "/"); page.wait_for_url("**/sign-in")
    page.fill("#username", "demo"); page.fill("#password", "demo"); page.click("button[type=submit]")
    page.wait_for_url("**/who"); page.get_by_role("button", name="Managing director").click(); page.wait_for_url("**/dashboard")
    size = page.evaluate("localStorage.getItem('cod.data')?.length ?? 0")
    print("sample data in the browser: about", round(size/1024), "KB")
    # fill what is left of the browser's allowance
    page.evaluate("""() => { let chunk = 'x'.repeat(1024*256), i = 0; try { for (;;) localStorage.setItem('junk'+(i++), chunk); } catch {} let small='x'.repeat(1024); try { for (;;) localStorage.setItem('junks'+(i++), small); } catch {} }""")
    page.goto(BASE + "/projects/C720"); page.wait_for_timeout(400)
    page.get_by_role("tab", name="Photos").click(); page.wait_for_timeout(300)
    page.get_by_role("button", name="Add a photo").click()
    dlg = page.locator("dialog[open]")
    dlg.get_by_label("Choose a photo from this device").set_input_files(FIX + "site-photo.jpg"); page.wait_for_timeout(700)
    dlg.get_by_label("Caption").fill("Storage full test")
    dlg.get_by_role("button", name="Add photo").click(); page.wait_for_timeout(500)
    print("toast:", page.locator("[aria-live=polite]").last.inner_text().replace("\n", " | "))
    print("photo still shows on screen:", page.locator("main ul li img").count() == 1)
print("console:", run(steps))
