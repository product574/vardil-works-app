import base64, json, os, re, struct, subprocess, sys, tempfile, time, urllib.error, urllib.request, zlib
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
    "--binding", "ALERT_TO=hello@vardil.com", "--binding", "ALERT_FROM=demo@vardil.com",
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
    # An empty group holds one address that can never sign in (server/cloudflare.ts, NOBODY).
    return sorted(e for e in (r["email"]["email"] for r in cf_state()["group"]["include"]) if e != "nobody@clients.invalid")

def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

LOOK = {"brandName": "Oldstone", "legalName": "Oldstone Conservation Ltd", "tagline": "Conservation contractors", "accent": "#8a4b2a", "region": "UK", "design": {"iban": "GB00 OLDS 1111 2222 3333 44"}}
MAIN = ["dashboard", "schedule", "people", "compliance", "site", "admin", "settings"]
ALL = ["md", "contracts", "site", "accounts", "operative", "client"]
def P(*emails, levels=None):
    return [{"email": e, "levels": levels or ALL} for e in emails]

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

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "people": P(MAJELLA), "apps": MAIN, "automations": False, "look": LOOK}, who=MAJELLA)
    check("A client cannot set up clients", s == 403, s)
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "people": P("@oldstone.ie"), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A whole domain is refused: named emails only", s == 400, s)
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "people": P(MAJELLA, "aodhan@vardil.com"), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A Vardil address cannot be put on a client", s == 409 and "Vardil address" in b, b)

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Oldstone", "people": P(MAJELLA, PAT), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    out = json.loads(b) if s == 200 else {}
    FIRM = out.get("id", "")
    check("Staff add Oldstone with two named emails", s == 200 and FIRM, b)
    check("Cloudflare's list is written with both", out.get("cloudflare", {}).get("ok") and group_emails() == [MAJELLA, PAT], (out, group_emails()))
    check("The group keeps its own name, and the token is sent", cf_state()["group"]["name"] == "Demo clients, kept by Vardil HQ" and all(a == "Bearer test-cf-token" for a in cf_state()["auth"]))

    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": None, "name": "Another firm", "people": P(PAT), "apps": MAIN, "automations": False, "look": {**LOOK, "brandName": "Another"}}, who=STAFF)
    check("One email cannot sign in to two clients", s == 409 and "already signs in to Oldstone" in b, b)

    s, _, b = http("GET", "/api/workspace", who=MAJELLA)
    cfg = json.loads(b)["config"] or {}
    check("Majella is told the levels she may use", cfg.get("levels") == ALL, cfg.get("levels"))
    check("Majella gets Oldstone, its apps and its look", cfg.get("name") == "Oldstone" and sorted(cfg.get("apps", [])) == sorted(MAIN) and cfg.get("look", {}).get("accent") == "#8a4b2a" and cfg.get("look", {}).get("region") == "UK", cfg)
    check("Her firm's invoice paper comes with it", cfg.get("look", {}).get("design", {}).get("iban") == "GB00 OLDS 1111 2222 3333 44")
    check("And no other client's people", "people" not in cfg and "activity" not in cfg)
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
    check("Staff see every client with their people", [[x["email"] for x in c["people"]] for c in st["clients"]] == [[MAJELLA, PAT]], st.get("clients"))
    check("A new demo runs for 30 days", st["clients"][0]["stage"] == "active" and st["clients"][0]["endsOn"] == (__import__("datetime").date.fromisoformat(st["today"]) + __import__("datetime").timedelta(days=30)).isoformat(), (st["clients"][0].get("endsOn"), st.get("today")))
    check("Staff see Cloudflare's state", st["cloudflare"]["linked"] and st["cloudflare"]["count"] == 2 and st["cloudflare"]["error"] is None, st.get("cloudflare"))

    # Cloudflare failing, then put right.
    urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{CF}/__fail", data=b'{"on": true}', method="POST", headers={"content-type": "application/json"}))
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone", "people": P(MAJELLA, PAT, NEW), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
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
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone", "people": P(MAJELLA, PAT), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    cf = json.loads(b).get("cloudflare", {})
    check("Someone taken off is signed out at once", cf.get("signedOut") == [NEW] and cf_state()["revoked"] == [NEW], (cf, cf_state()["revoked"]))
    check("And off Cloudflare's list", group_emails() == [MAJELLA, PAT])
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone Conservation", "people": P(MAJELLA, PAT), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    check("A change that leaves the list alone does not touch Cloudflare", s == 200 and "cloudflare" not in json.loads(b), b)

    # ── Levels, what prospects do, the email to Vardil, closing a demo (decision 210) ──
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone Conservation", "people": P(MAJELLA) + P(PAT, levels=["site"]), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    cfg = json.loads(http("GET", "/api/workspace", who=PAT)[2])["config"] or {}
    check("Pat is given the site manager level only", s == 200 and cfg.get("levels") == ["site"], cfg.get("levels"))
    s, _, b = http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone Conservation", "people": [{"email": PAT, "levels": ["boss"]}] + P(MAJELLA), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)
    cfg = json.loads(http("GET", "/api/workspace", who=PAT)[2])["config"] or {}
    check("A made-up level is dropped, and none left means every level", cfg.get("levels") == ALL, cfg.get("levels"))
    http("POST", "/api/workspace", {"action": "set_client", "id": FIRM, "name": "Oldstone Conservation", "people": P(MAJELLA) + P(PAT, levels=["site"]), "apps": MAIN, "automations": False, "look": LOOK}, who=STAFF)

    mails_before = len(cf_state()["emails"])
    check("Majella's visit is recorded", http("POST", "/api/workspace", {"action": "visit"}, who=MAJELLA)[0] == 200)
    em = cf_state()["emails"][mails_before:]
    check("Vardil gets one email on her first visit of the day", len(em) == 1 and em[0]["to"] == "hello@vardil.com" and em[0]["from"] == "demo@vardil.com" and "Oldstone Conservation: majella@oldstone.ie opened their demo" == em[0]["subject"] and em[0]["auth"] == "Bearer test-cf-token", em)
    http("POST", "/api/workspace", {"action": "visit"}, who=MAJELLA)
    check("And no second email the same day", len(cf_state()["emails"]) == mails_before + 1, len(cf_state()["emails"]))
    for app, lvl in [("schedule", "md"), ("compliance", "md"), ("schedule", "md"), ("people", "site")]:
        http("POST", "/api/workspace", {"action": "seen", "app": app, "level": lvl}, who=MAJELLA)
    check("A made-up app is refused", http("POST", "/api/workspace", {"action": "seen", "app": "nonsense"}, who=MAJELLA)[0] == 400)
    http("POST", "/api/workspace", {"action": "visit"}, who=STAFF)
    http("POST", "/api/workspace", {"action": "seen", "app": "invoicing", "level": "md"}, who=STAFF)
    http("POST", "/api/workspace", {"action": "visit"}, who=OTHER)
    st = json.loads(http("GET", "/api/workspace", who=STAFF)[2])
    act = {a["email"]: a for a in st["clients"][0].get("activity", [])}
    m = act.get(MAJELLA, {})
    check("Staff see what Majella opened, by day, and at which levels", m.get("days") == 1 and m.get("visits") == 1 and m.get("apps") == {"schedule": 1, "compliance": 1, "people": 1} and sorted(m.get("levels", [])) == ["md", "site"] and m.get("lastAt"), m)
    check("Pat has not signed in yet", act.get(PAT, {}).get("days") == 0, act.get(PAT))
    check("Staff and people on no list are never recorded", set(act) == {MAJELLA, PAT} and len(cf_state()["emails"]) == mails_before + 1, list(act))

    import datetime
    today = datetime.date.fromisoformat(st["today"])
    yesterday = (today - datetime.timedelta(days=1)).isoformat()
    revoked_before = len(cf_state()["revoked"])
    s, _, b = http("POST", "/api/workspace", {"action": "set_end", "id": FIRM, "endsOn": yesterday}, who=STAFF)
    check("An end date in the past takes them off Cloudflare and signs them out", s == 200 and group_emails() == [] and sorted(cf_state()["revoked"][revoked_before:]) == [MAJELLA, PAT], (b, group_emails(), cf_state()["revoked"][revoked_before:]))
    g = json.loads(http("GET", "/api/workspace", who=MAJELLA)[2])
    check("Majella is told her demo has ended, and given nothing else", g.get("ended") is True and g.get("config") is None and g.get("announcements") == [], g)
    check("Her visits are no longer recorded", http("POST", "/api/workspace", {"action": "visit"}, who=MAJELLA)[0] == 200 and len(cf_state()["emails"]) == mails_before + 1)
    s, _, b = http("POST", "/api/workspace", {"action": "set_end", "id": FIRM, "endsOn": (today + datetime.timedelta(days=30)).isoformat()}, who=STAFF)
    check("Extending it lets them back in", s == 200 and group_emails() == [MAJELLA, PAT] and not json.loads(http("GET", "/api/workspace", who=MAJELLA)[2]).get("ended"), group_emails())

    revoked_before = len(cf_state()["revoked"])
    s, _, b = http("POST", "/api/workspace", {"action": "set_stage", "id": FIRM, "stage": "won"}, who=STAFF)
    check("Became a client: off Cloudflare and signed out", s == 200 and group_emails() == [] and sorted(cf_state()["revoked"][revoked_before:]) == [MAJELLA, PAT], (group_emails(), cf_state()["revoked"][revoked_before:]))
    st = json.loads(http("GET", "/api/workspace", who=STAFF)[2])
    check("The client and its history are kept", st["clients"][0]["stage"] == "won" and {a["email"]: a for a in st["clients"][0]["activity"]}[MAJELLA]["days"] == 1)
    check("A client cannot close a demo", http("POST", "/api/workspace", {"action": "set_stage", "id": FIRM, "stage": "active"}, who=MAJELLA)[0] == 403)
    http("POST", "/api/workspace", {"action": "set_stage", "id": FIRM, "stage": "active"}, who=STAFF)
    check("Reopened, they are back on the list", group_emails() == [MAJELLA, PAT])

    # An end date passing on its own, as it does at midnight: the date is moved in the local database
    # directly, so Cloudflare's list still holds them until the next time anyone asks.
    import glob, sqlite3
    dbfile = next(f for f in glob.glob(os.path.join(work, "state", "**", "*.sqlite"), recursive=True) if "d1" in f.lower())
    con = sqlite3.connect(dbfile); con.execute("UPDATE firms SET ends_on = ?, swept_at = NULL WHERE id = ?", (yesterday, FIRM)); con.commit(); con.close()
    still = group_emails()
    revoked_before = len(cf_state()["revoked"])
    g = json.loads(http("GET", "/api/workspace", who=PAT)[2])
    time.sleep(1.5)
    check("A demo past its end date is closed the next time someone signs in", still == [MAJELLA, PAT] and g.get("ended") is True and group_emails() == [] and sorted(cf_state()["revoked"][revoked_before:]) == [MAJELLA, PAT], (still, g.get("ended"), group_emails(), cf_state()["revoked"][revoked_before:]))
    http("GET", "/api/workspace", who=MAJELLA); time.sleep(1)
    check("And only once", sorted(cf_state()["revoked"][revoked_before:]) == [MAJELLA, PAT], cf_state()["revoked"][revoked_before:])
    http("POST", "/api/workspace", {"action": "set_end", "id": FIRM, "endsOn": (today + datetime.timedelta(days=30)).isoformat()}, who=STAFF)

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
        pg.get_by_role("button", name="Save", exact=True).click()
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
        pg.get_by_role("button", name="Save", exact=True).click(); pg.wait_for_timeout(1500)
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

        # Pat has the site manager level only: straight in, no choice.
        ctx, pg = context(br, PAT)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(700)
        check("Pat goes straight in as site manager, with no choice of level", "/people/timesheet" in pg.url and pg.get_by_text("Who are you signing in as?").count() == 0, pg.url)
        pg.goto(B + "/dashboard"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(400)
        check("He cannot reach the managing director's screens by their address", "/dashboard" not in pg.url or pg.get_by_text("AI overview").count() == 0, pg.url)
        ctx.close()

        # Majella: every level, the notice, and what she opens is recorded.
        ctx, pg = context(br, MAJELLA)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(400)
        check("Majella chooses from all six levels", pg.get_by_role("button", name=re.compile("^(Managing director|Contracts manager|Site manager|Accounts|Operative|Client)")).count() == 6)
        pg.get_by_role("button", name="How Vardil uses your sign-in").click()
        check("A small link opens how her sign-in is used", pg.get_by_role("dialog").get_by_text("legitimate interest").count() == 1 and pg.get_by_role("dialog").get_by_text("hello@vardil.com").count() == 1)
        pg.keyboard.press("Escape")
        pg.get_by_role("button", name=re.compile("^Managing director")).click(); pg.wait_for_load_state("networkidle")
        pg.goto(B + "/compliance"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(800)
        oc = next(c for c in json.loads(http("GET", "/api/workspace", who=STAFF)[2])["clients"] if c["id"] == FIRM)
        m = {a["email"]: a for a in oc["activity"]}.get(MAJELLA, {"apps": {}})
        check("Opening Compliance in her demo is recorded for Vardil", m["apps"].get("compliance") == 1 and m["apps"].get("dashboard") == 1, m["apps"])
        ctx.close()

        # Staff: the client's page shows it all.
        ctx, pg = context(br, STAFF)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle")
        pg.get_by_text("Vardil HQ", exact=True).click(); pg.wait_for_url("**/vardil")
        pg.goto(B + "/vardil/clients"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        row = pg.get_by_role("table", name="Clients").get_by_role("row").filter(has_text="Oldstone Conservation")
        check("The list shows when Oldstone's demo ends and that they have signed in", row.get_by_text(re.compile("Open until")).count() == 1 and row.get_by_text("Not yet").count() == 0, row.inner_text() if row.count() else "")
        row.get_by_role("link", name="Oldstone Conservation").click(); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        check("Its page has the demo's status and end date", pg.get_by_role("heading", name="Demo status").count() == 1 and pg.get_by_text(re.compile("Open until .*30 days left")).count() == 1)
        check("Each person's levels, and Pat's is site manager only", pg.get_by_role("group", name=f"Levels for {PAT}").get_by_role("button", pressed=True).all_inner_texts() == ["Site manager"])
        check("When each last signed in", pg.get_by_role("list", name="People who can sign in").get_by_text(re.compile("Last in .*1 day, 1 visit")).count() == 2 and pg.get_by_text("Not signed in yet").count() == 0)
        acts = pg.get_by_role("table", name="What they have looked at")
        check("What Majella looked at, and as which levels", acts.get_by_text(re.compile("Compliance")).count() == 1 and acts.get_by_text(re.compile("As Managing director")).count() == 1)
        pg.screenshot(path=os.path.join(shots, "client-status.png"), full_page=True)
        grp = pg.get_by_role("group", name=f"Levels for {PAT}")
        grp.get_by_role("button", name="Accounts").click()
        pg.get_by_role("button", name="Save", exact=True).click(); pg.wait_for_timeout(1200)
        cfg = json.loads(http("GET", "/api/workspace", who=PAT)[2])["config"]
        check("Giving Pat Accounts too is saved", cfg["levels"] == ["site", "accounts"], cfg["levels"])
        pg.get_by_role("tab", name="Not interested").click()
        check("Not interested asks first", pg.get_by_role("dialog").get_by_text(re.compile("2 people will be taken off Cloudflare and signed out")).count() == 1)
        pg.get_by_role("button", name="Confirm and close their demo").click(); pg.wait_for_timeout(1200)
        check("Marked not interested, and Cloudflare's list updated", pg.get_by_role("status").filter(has_text="Marked not interested").count() == 1 and MAJELLA not in group_emails() and PAT not in group_emails() and "ann@kilbride.ie" in group_emails(), group_emails())
        pg.goto(B + "/vardil/clients"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        check("It moves to Closed demos", pg.get_by_role("table", name="Closed demos").get_by_text("Oldstone Conservation").count() == 1 and pg.get_by_role("table", name="Clients").get_by_text("Oldstone Conservation").count() == 0)
        ctx.close()

        ctx, pg = context(br, MAJELLA)
        pg.goto(B + "/who"); pg.wait_for_load_state("networkidle"); pg.wait_for_timeout(300)
        check("Majella now sees only that her demo has ended", pg.get_by_role("heading", name="This demo has ended").count() == 1 and pg.get_by_role("navigation", name="Departments").count() == 0)
        pg.screenshot(path=os.path.join(shots, "demo-ended.png"))
        ctx.close()
        http("POST", "/api/workspace", {"action": "set_stage", "id": FIRM, "stage": "active"}, who=STAFF)

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
