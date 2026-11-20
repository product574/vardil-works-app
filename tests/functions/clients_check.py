import base64, json, os, struct, subprocess, sys, tempfile, time, urllib.error, urllib.request, zlib
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
# Clients in Vardil HQ (20 Nov, decision 209), end to end: the real server functions
# (functions/api/workspace.ts and functions/api/logo/[id].ts) in Cloudflare's own local runtime
# with a local D1 database, against stub_cloudflare.py in place of Cloudflare's API and Access keys.
# Then the hosted build in Chrome: a staff member sets up a client, opens their demo, and the
# client signs in to it.
# Needs: npm run build:access-test, Node, Python 3 with Playwright, Chrome, Wrangler (WRANGLER, or
# `npx wrangler@4.156.0`). It does not reach the real Cloudflare: that is the live check.
from playwright.sync_api import sync_playwright

FN, CF = 4194, 4196
B = f"http://127.0.0.1:{FN}"
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if not cond and detail != "" else ""), flush=True)

STAFF, MAJELLA, PAT, NEW, OTHER = "oisin@vardil.com", "majella@oldstone.ie", "pat@oldstone.ie", "sean@oldstone.ie", "someone@else.ie"
keys = json.loads(subprocess.check_output(["node", os.path.join(HERE, "make_keys.mjs"), "test.cloudflareaccess.com", "test-aud", ",".join([STAFF, MAJELLA, PAT, NEW, OTHER])]))
T = keys["byEmail"]
work = tempfile.mkdtemp(prefix="clientsfn-")
jwks = os.path.join(work, "jwks.json")
open(jwks, "w").write(json.dumps(keys["jwks"]))

env = dict(os.environ, NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
stub = subprocess.Popen([sys.executable, os.path.join(HERE, "stub_cloudflare.py"), jwks, str(CF)])
wr = os.environ.get("WRANGLER")
cmd = ([wr] if wr else ["npx", "--yes", "wrangler@4.156.0"]) + [
    "pages", "dev", "dist-access", "--ip", "127.0.0.1", "--port", str(FN), "--compatibility-date", "2026-10-01",
    "--d1", "DB", "--persist-to", os.path.join(work, "state"),
    "--binding", "ACCESS_TEAM_DOMAIN=test.cloudflareaccess.com", "--binding", "ACCESS_AUD=test-aud",
    "--binding", f"ACCESS_CERTS_URL=http://127.0.0.1:{CF}/certs",
    "--binding", "CF_API_TOKEN=test-cf-token", "--binding", "CF_ACCOUNT_ID=acc", "--binding", "CF_ACCESS_GROUP_ID=grp",
    "--binding", f"CF_API_BASE=http://127.0.0.1:{CF}/client/v4",
]
log = open(os.path.join(work, "wrangler.log"), "w")
# Its own process group, so stopping it also stops the runtime it starts.
dev = subprocess.Popen(cmd, cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)

def http(method, path, body=None, who=None, raw=False):
    h = {"content-type": "application/json"} if body is not None else {}
    if method == "POST": h["origin"] = B
    if who: h["cf-access-jwt-assertion"] = T[who]
    req = urllib.request.Request(B + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
            return r.status, dict(r.headers), data if raw else data.decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()

def cf_state():
    return json.loads(urllib.request.urlopen(f"http://127.0.0.1:{CF}/__state").read())
def group_emails():
    return sorted(r["email"]["email"] for r in cf_state()["group"]["include"])

def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

LOOK = {"brandName": "Oldstone", "legalName": "Oldstone Conservation Ltd", "tagline": "Conservation contractors", "accent": "#8a4b2a", "region": "UK", "design": {"iban": "GB00 OLDS 1111 2222 3333 44"}}
MAIN = ["dashboard", "schedule", "people", "compliance", "site", "admin", "settings"]

try:
    for _ in range(160):
        try:
            urllib.request.urlopen(B + "/robots.txt", timeout=2); break
        except Exception:
            time.sleep(0.5)
    else:
        raise SystemExit("STOPPED: wrangler pages dev did not start; see " + log.name)

    # ── 1. The server ─────────────────────────────────────────────────────────
    s, _, b = http("GET", "/api/workspace", who=MAJELLA)
    check("A client with nothing saved gets no firm (the standard demo)", s == 200 and json.loads(b)["config"] is None, b[:200])
    check("A client is not sent the client list", "clients" not in json.loads(b))
    s, _, b = http("GET", "/api/workspace")
    check("No sign-in, no answer", s == 401, s)

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "emails": [MAJELLA], "apps": MAIN, "automations": False, "look": LOOK}, who=MAJELLA)
    check("A client cannot set up clients", s == 403, s)
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "emails": ["@oldstone.ie"], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A whole domain is refused: named emails only", s == 400, s)
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "emails": [MAJELLA, "aodhan@vardil.com"], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A Vardil address cannot be put on a client", s == 409 and "Vardil address" in b, b)

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "emails": [MAJELLA, PAT], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    out = json.loads(b) if s == 200 else {}
    FIRM = out.get("id", "")
    check("Staff add Oldstone with two named emails", s == 200 and FIRM, b)
    check("Cloudflare's list is written with both", out.get("cloudflare", {}).get("ok") and group_emails() == [MAJELLA, PAT], (out, group_emails()))
    check("The group keeps its own name, and the token is sent", cf_state()["group"]["name"] == "Demo clients, kept by Vardil HQ" and all(a == "Bearer test-cf-token" for a in cf_state()["auth"]))

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Another firm", "emails": [PAT], "apps": MAIN, "automations": False, "look": {**LOOK, "brandName": "Another"}}, who=STAFF)
    check("One email cannot sign in to two clients", s == 409 and "already signs in to Oldstone" in b, b)

    s, _, b = http("GET", "/api/workspace", who=MAJELLA)
    cfg = json.loads(b)["config"] or {}
    check("Majella gets Oldstone, its apps and its look", cfg.get("name") == "Oldstone" and sorted(cfg.get("apps", [])) == sorted(MAIN) and cfg.get("look", {}).get("accent") == "#8a4b2a" and cfg.get("look", {}).get("region") == "UK", cfg)
    check("Her firm's invoice paper comes with it", cfg.get("look", {}).get("design", {}).get("iban") == "GB00 OLDS 1111 2222 3333 44")
    check("And no other client's emails", "emails" not in cfg)
    s, _, b = http("GET", "/api/workspace", who=OTHER)
    check("Someone on no list still gets the standard demo", json.loads(b)["config"] is None)

    logo = "data:image/png;base64," + base64.b64encode(png(160, 50, (138, 75, 42))).decode()
    s, _, b = http("POST", "/api/workspace", {"action": "set_logo", "id": FIRM, "logo": logo}, who=STAFF)
    check("Staff save a logo", s == 200, b)
    s, _, b = http("POST", "/api/workspace", {"action": "set_logo", "id": FIRM, "logo": "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"}, who=STAFF)
    check("An SVG logo is refused (only JPEG or PNG pictures)", s == 400, s)
    cfg = json.loads(http("GET", "/api/workspace", who=MAJELLA)[2])["config"]
    url = cfg.get("logoUrl", "")
    check("Her firm has a logo address", url.startswith(f"/api/logo/{FIRM}?v="), url)
    s, h, data = http("GET", url, who=MAJELLA, raw=True)
    check("She gets the logo as a PNG", s == 200 and h.get("Content-Type", h.get("content-type")) == "image/png" and data[:8] == b"\x89PNG\r\n\x1a\n", (s, h.get("content-type")))
    check("Sent with nosniff and a closed policy", h.get("X-Content-Type-Options", h.get("x-content-type-options")) == "nosniff" and "default-src 'none'" in (h.get("Content-Security-Policy") or h.get("content-security-policy") or ""))
    check("Someone at another firm cannot fetch it", http("GET", url, who=OTHER)[0] == 404)
    check("Staff can", http("GET", url, who=STAFF, raw=True)[0] == 200)
    s, _, b = http("POST", "/api/workspace", {"action": "set_logo", "id": FIRM, "logo": "data:image/png;base64," + "A" * 300_000}, who=STAFF)
    check("A logo too big is refused", s in (400, 413), s)

    s, _, b = http("GET", "/api/workspace", who=STAFF)
    st = json.loads(b)
    check("Staff see every client with their emails", [c["emails"] for c in st["clients"]] == [[MAJELLA, PAT]], st.get("clients"))
    check("Staff see Cloudflare's state", st["cloudflare"]["linked"] and st["cloudflare"]["count"] == 2 and st["cloudflare"]["error"] is None, st.get("cloudflare"))

    # Cloudflare failing, then put right.
    urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{CF}/__fail", data=b'{"on": true}', method="POST", headers={"content-type": "application/json"}))
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone", "emails": [MAJELLA, PAT, NEW], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    cf = json.loads(b).get("cloudflare", {})
    check("When Cloudflare fails the save still stands and says so", s == 200 and cf.get("ok") is False and "Update Cloudflare now" in cf.get("message", ""), b)
    st = json.loads(http("GET", "/api/workspace", who=STAFF)[2])
    check("Vardil HQ remembers the failure", "include rules are not valid" in (st["cloudflare"]["error"] or ""), st["cloudflare"])
    urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{CF}/__fail", data=b'{"on": false}', method="POST", headers={"content-type": "application/json"}))
    s, _, b = http("POST", "/api/workspace", {"action": "sync_cloudflare"}, who=STAFF)
    check("Update Cloudflare now puts it right", s == 200 and json.loads(b)["cloudflare"]["ok"] and group_emails() == sorted([MAJELLA, PAT, NEW]), (b, group_emails()))
    st = json.loads(http("GET", "/api/workspace", who=STAFF)[2])
    check("And the failure is cleared", st["cloudflare"]["error"] is None and st["cloudflare"]["syncedAt"], st["cloudflare"])
    check("A client cannot ask for an update of Cloudflare", http("POST", "/api/workspace", {"action": "sync_cloudflare"}, who=MAJELLA)[0] == 403)

    # Taking Sean off again signs him out.
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone", "emails": [MAJELLA, PAT], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    cf = json.loads(b).get("cloudflare", {})
    check("Someone taken off is signed out at once", cf.get("signedOut") == [NEW] and cf_state()["revoked"] == [NEW], (cf, cf_state()["revoked"]))
    check("And off Cloudflare's list", group_emails() == [MAJELLA, PAT])
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone Conservation", "emails": [MAJELLA, PAT], "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A change that leaves the list alone does not touch Cloudflare", s == 200 and "cloudflare" not in json.loads(b), b)

    # ── 2. In Chrome ──────────────────────────────────────────────────────────
    errors = []
    def context(b, email, viewport=None):
        ctx = b.new_context(viewport=viewport or {"width": 1440, "height": 950})
        ctx.add_cookies([{"name": "CF_Authorization", "value": T[email], "url": B}])
        ctx.route("**/cdn-cgi/access/get-identity", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"email": email})))
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(f"{email}: {e}"))
        page.on("console", lambda m: errors.append(f"{email}: {m.text}") if m.type == "error" and "favicon" not in m.text else None)
        return ctx, page

    accent = lambda pg: pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()")
    logo_path = os.path.join(work, "logo.png")
    open(logo_path, "wb").write(png(300, 90, (47, 111, 94)))
    shots = os.path.join(HERE, "shots"); os.makedirs(shots, exist_ok=True)

    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx, pg = context(br, STAFF)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle")
        pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
        pg.goto(B + "/vardil/clients"); pg.wait_for_load_state("networkidle")
        check("Vardil HQ, Clients lists Oldstone", pg.get_by_role("link", name="Oldstone Conservation").count() == 1)
        check("It says Cloudflare's list is up to date", pg.get_by_text("Cloudflare's list is up to date").is_visible())
        check("Two people on Oldstone", pg.get_by_role("cell", name="2 people").count() == 1)
        pg.screenshot(path=os.path.join(shots, "clients-list.png"))

        # Add a second client through the screen.
        pg.get_by_role("button", name="Add a client").click(); pg.wait_for_url("**/vardil/clients/new")
        pg.get_by_label("Client name").fill("Kilbride Stone")
        check("A new client's short name follows the client name", pg.get_by_label("Short name").input_value() == "Kilbride Stone")
        pg.get_by_label("Add people").fill("Ann@Kilbride.ie, not-an-email")
        pg.get_by_role("button", name="Add", exact=True).click()
        check("Something that is not an email is pointed out", pg.get_by_role("alert").filter(has_text="Not an email: not-an-email").count() == 1)
        pg.get_by_label("Add people").fill("Ann@Kilbride.ie\ntom@kilbride.ie")
        pg.get_by_role("button", name="Add", exact=True).click()
        people = pg.get_by_role("list", name="People who can sign in")
        check("Two named people listed, in lower case", people.get_by_text("ann@kilbride.ie").count() == 1 and people.get_by_text("tom@kilbride.ie").count() == 1)
        pg.get_by_role("button", name="Main offering").click()
        pg.get_by_role("button", name="Slate green").click()
        pg.get_by_role("tab", name="United Kingdom").click()
        with pg.expect_file_chooser() as fc:
            pg.get_by_role("button", name="Choose a file").first.click()
        fc.value.set_files(logo_path); pg.wait_for_timeout(600)
        check("The logo shows in the preview", pg.get_by_role("figure", name="Preview of their demo").locator("img").count() == 1)
        pg.get_by_label("IBAN").fill("GB11 KILB 0000 1111 2222 33")
        pg.screenshot(path=os.path.join(shots, "client-new.png"), full_page=True)
        pg.get_by_role("button", name="Save").click()
        pg.wait_for_url(lambda u: "/vardil/clients/" in u and not u.endswith("/new"), timeout=15000)
        pg.wait_for_timeout(500)
        check("Saved, and Cloudflare's list is updated", pg.get_by_role("status").filter(has_text="Cloudflare's list is updated").count() == 1)
        check("Cloudflare now has all four people", group_emails() == sorted([MAJELLA, PAT, "ann@kilbride.ie", "tom@kilbride.ie"]), group_emails())
        st = json.loads(http("GET", "/api/workspace", who=STAFF)[2])
        kb = next((c for c in st["clients"] if c["name"] == "Kilbride Stone"), {})
        check("Kilbride is saved with its look, logo and invoice paper", kb.get("look", {}).get("accent") == "#2f6f5e" and kb.get("look", {}).get("region") == "UK" and kb.get("logoUrl", "").startswith("/api/logo/") and kb.get("look", {}).get("design", {}).get("iban") == "GB11 KILB 0000 1111 2222 33", kb)
        check("Only what differs from the starting paper is kept", set(kb.get("look", {}).get("design", {}).keys()) == {"iban"}, kb.get("look", {}).get("design"))

        # Open their demo.
        pg.get_by_role("button", name="Open their demo").click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(500)
        check("Their demo opens with their name in the strip", pg.get_by_role("region", name="Vardil HQ").get_by_text("Kilbride Stone's demo").count() == 1)
        check("In their colour", accent(pg).lower() == "#2f6f5e", accent(pg))
        check("With their logo at the top", pg.locator("header img[src^='/api/logo/']").count() >= 1)
        nav = pg.get_by_role("navigation", name="Departments")
        check("And only their apps", nav.get_by_text("Schedule").count() > 0 and nav.get_by_text("Invoicing").count() == 0 and nav.get_by_text("Vardil HQ").count() == 0)
        check("In pounds, as a UK firm", "£" in pg.locator("main").inner_text() or pg.get_by_text("£").count() > 0)
        pg.screenshot(path=os.path.join(shots, "client-demo-staff.png"))
        pg.goto(B + "/settings"); pg.wait_for_load_state("networkidle")
        check("Settings, Branding says it is set in Vardil HQ", pg.get_by_text("Set for this client in Vardil HQ, Clients").count() == 1 and pg.get_by_label("Short name").count() == 0)
        pg.reload(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(400)
        check("Still their demo after a reload", accent(pg).lower() == "#2f6f5e" and pg.get_by_text("Kilbride Stone's demo").count() == 1)
        pg.get_by_role("button", name="Back to Vardil HQ").click(); pg.wait_for_url("**/vardil/clients/*"); pg.wait_for_timeout(400)
        check("Back to Vardil HQ lands on that client, in Vardil's colour again", accent(pg).lower() == "#4682b4" and pg.get_by_role("heading", name="Kilbride Stone").count() == 1, accent(pg))
        check("And ABC's name is back", pg.locator("header").get_by_text("ABC Construction").count() >= 1)

        # Take Tom off Kilbride: signed out.
        pg.get_by_role("button", name="Take tom@kilbride.ie off").click()
        pg.get_by_role("button", name="Save").click(); pg.wait_for_timeout(1500)
        check("Taking Tom off says he is signed out", pg.get_by_role("status").filter(has_text="Signed out now: tom@kilbride.ie").count() == 1)
        check("Cloudflare signed him out", "tom@kilbride.ie" in cf_state()["revoked"])
        ctx.close()

        # Majella signs in: Oldstone's demo.
        ctx, pg = context(br, MAJELLA)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(400)
        check("Her sign-in page carries Oldstone's logo", pg.locator("img[src^='/api/logo/']").count() >= 1)
        check("And no Vardil HQ", pg.get_by_text("Vardil HQ", exact=True).count() == 0)
        pg.get_by_role("button", name="Managing director").click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(400)
        check("Her demo is in Oldstone's colour", accent(pg).lower() == "#8a4b2a", accent(pg))
        nav = pg.get_by_role("navigation", name="Departments")
        check("With the main offering's apps only", nav.get_by_text("Compliance").count() > 0 and nav.get_by_text("Invoicing").count() == 0 and nav.get_by_text("Vardil HQ").count() == 0)
        check("And no staff strip", pg.get_by_role("region", name="Vardil HQ").count() == 0)
        pg.screenshot(path=os.path.join(shots, "client-demo-majella.png"))
        pg.goto(B + "/settings"); pg.wait_for_load_state("networkidle")
        check("Her Settings, Branding says Vardil sets it, and cannot be changed", pg.get_by_text("set up for you by Vardil").count() == 1 and pg.get_by_label("Short name").count() == 0)
        check("It shows her firm's full name", pg.get_by_text("Oldstone Conservation Ltd").count() >= 1)
        pg.goto(B + "/vardil/clients"); pg.wait_for_load_state("networkidle")
        check("She cannot open Vardil HQ by its address", pg.get_by_role("heading", name="Clients").count() == 0)
        staff_files = pg.evaluate("fetch('/staff/ready.html').then(r => r.status)")
        check("(Locally the staff folder is not behind its own Access app; that is the live check)", staff_files in (200, 404))
        ctx.close()

        # Someone on no list: the standard demo.
        ctx, pg = context(br, OTHER)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle")
        pg.get_by_role("button", name="Managing director").click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        check("Someone on no client's list sees ABC Construction in steel blue", accent(pg).lower() == "#4682b4" and pg.locator("header").get_by_text("ABC Construction").count() >= 1)
        ctx.close()

        # Phone width: the client page fits.
        ctx, pg = context(br, STAFF, {"width": 390, "height": 844})
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle")
        pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
        pg.goto(B + f"/vardil/clients/{FIRM}"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        wide = pg.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
        check("The client page fits a phone with no sideways scroll", not wide)
        pg.screenshot(path=os.path.join(shots, "client-phone.png"), full_page=True)
        ctx.close()

        # Remove Kilbride: Ann signed out too.
        ctx, pg = context(br, STAFF)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle")
        pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
        pg.goto(B + "/vardil/clients"); pg.wait_for_load_state("networkidle")
        pg.get_by_role("link", name="Kilbride Stone").click(); pg.wait_for_load_state("networkidle")
        pg.get_by_role("button", name="Remove Kilbride Stone").click()
        pg.get_by_role("button", name="Confirm remove").click(); pg.wait_for_url("**/vardil/clients"); pg.wait_for_timeout(500)
        check("Removing a client signs out their people", "ann@kilbride.ie" in cf_state()["revoked"] and group_emails() == [MAJELLA, PAT], (cf_state()["revoked"], group_emails()))
        check("And it is gone from the list", pg.get_by_role("link", name="Kilbride Stone").count() == 0)
        ctx.close()
        br.close()

    check("No errors in the page", not errors, errors[:5])
finally:
    stub.terminate()
    import signal
    try:
        os.killpg(dev.pid, signal.SIGTERM); dev.wait(timeout=10)
    except Exception:
        try: os.killpg(dev.pid, signal.SIGKILL)
        except Exception: pass

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} of {len(results)} passed")
sys.exit(1 if failed else 0)
