import json, os, subprocess, sys, tempfile, time, urllib.error, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
# The shared firm's server function (functions/api/data.ts) in Cloudflare's own local runtime
# (wrangler pages dev), with Cloudflare Access tokens signed by a throwaway key (make_keys.mjs,
# keys served by stub_upstream.py), against stub_supabase.py in place of Supabase's REST
# interface, which runs the real database functions (supabase/migrations) on a throwaway
# Postgres 16. Needs Postgres 16's server programs (PGBIN), psql, Node and Wrangler
# (WRANGLER, or `npx wrangler@4.156.0`). It does not reach the real Supabase or Cloudflare.
FN, UP, SB, PG = 4196, 4192, 4194, 54331
B = f"http://127.0.0.1:{FN}"
KEY = "sb_secret_testkey_for_checks"
PGBIN = os.environ.get("PGBIN", "/usr/lib/postgresql/16/bin")
results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

work = tempfile.mkdtemp(prefix="datafn-")
os.chmod(work, 0o755)
procs = []
root = os.getuid() == 0
def as_pg(args):
    return subprocess.run((["runuser", "-u", "postgres", "--"] if root else []) + args, check=True, capture_output=True)
def psql(text):
    return subprocess.run(["psql", "-h", "127.0.0.1", "-p", str(PG), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"], input=text, capture_output=True, text=True, check=True).stdout.strip()

pgdir = os.path.join(work, "pg")
os.makedirs(pgdir)
if root: subprocess.run(["chown", "postgres", pgdir], check=True)
as_pg([f"{PGBIN}/initdb", "-D", f"{pgdir}/data", "--auth=trust", "-U", "postgres"])
as_pg([f"{PGBIN}/pg_ctl", "-D", f"{pgdir}/data", "-o", f"-p {PG} -k {pgdir} -c listen_addresses=127.0.0.1", "-l", f"{pgdir}/log", "-w", "start"])
try:
    psql("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;")
    mig = os.path.join(REPO, "supabase", "migrations")
    for f in sorted(os.listdir(mig)): psql(open(os.path.join(mig, f)).read())

    keys = json.loads(subprocess.check_output(["node", os.path.join(HERE, "make_keys.mjs"), "test.cloudflareaccess.com", "test-aud"]))
    jwks = os.path.join(work, "jwks.json"); open(jwks, "w").write(json.dumps(keys["jwks"]))
    T = keys["tokens"]   # admin@vardil.example is staff here; prospect@firm.example is not
    static = os.path.join(work, "site"); os.makedirs(static); open(os.path.join(static, "index.html"), "w").write("<!doctype html><title>t</title>")

    env = dict(os.environ, NO_PROXY="127.0.0.1,localhost", no_proxy="127.0.0.1,localhost")
    procs.append(subprocess.Popen([sys.executable, os.path.join(HERE, "stub_upstream.py"), jwks, str(UP)]))
    procs.append(subprocess.Popen([sys.executable, os.path.join(HERE, "stub_supabase.py"), str(SB), str(PG), KEY]))
    wr = os.environ.get("WRANGLER")
    cmd = ([wr] if wr else ["npx", "--yes", "wrangler@4.156.0"]) + [
        "pages", "dev", static, "--ip", "127.0.0.1", "--port", str(FN), "--compatibility-date", "2026-10-01",
        "--persist-to", os.path.join(work, "state"),
        "--binding", "ACCESS_TEAM_DOMAIN=test.cloudflareaccess.com", "--binding", "ACCESS_AUD=test-aud",
        "--binding", f"ACCESS_CERTS_URL=http://127.0.0.1:{UP}/certs", "--binding", "STAFF_DOMAINS=vardil.example",
        "--binding", f"SUPABASE_URL=http://127.0.0.1:{SB}", "--binding", f"SUPABASE_SECRET_KEY={KEY}", "--binding", "DEMO_FIRM=abc-test",
    ]
    log = open(os.path.join(work, "wrangler.log"), "w")
    procs.append(subprocess.Popen(cmd, cwd=REPO, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True))

    def http(method, path, body=None, token=None, headers=None):
        h = {"content-type": "application/json"} if body is not None else {}
        if method == "POST": h["origin"] = B
        if token: h["cf-access-jwt-assertion"] = token
        h.update(headers or {})
        data = (body if isinstance(body, bytes) else json.dumps(body).encode()) if body is not None else None
        req = urllib.request.Request(B + path, method=method, data=data, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.status, json.loads(r.read().decode() or "null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "null")

    try:
        urllib.request.urlopen(B + "/", timeout=1)
        raise SystemExit(f"STOPPED: something is already answering on port {FN}; stop it first")
    except urllib.error.URLError:
        pass
    for _ in range(180):
        try:
            urllib.request.urlopen(B + "/", timeout=2); break
        except Exception:
            time.sleep(0.5)
    else:
        raise SystemExit("STOPPED: wrangler pages dev did not start; see " + log.name)

    todo = lambda i, what="x": {"list": "todos", "id": f"td-{i}", "pos": i, "data": {"id": f"td-{i}", "title": what}}

    # Who may ask
    check("No sign-in: refused", http("GET", "/api/data")[0] == 401)
    check("Another application's token: refused", http("GET", "/api/data", token=T["wrongAud"])[0] == 401)
    check("Expired token: refused", http("GET", "/api/data", token=T["expired"])[0] == 401)

    # Setting the firm up
    s, b = http("GET", "/api/data?since=0", token=T["other"])
    check("Before set-up: 404 no_firm", s == 404 and b == {"error": "no_firm"}, (s, b))
    s, b = http("POST", "/api/data", {"kind": "reset", "name": "ABC Construction", "records": [todo(0), todo(1)]}, token=T["other"])
    check("The first person in may set the firm up", s == 200 and b == {"version": 1}, (s, b))
    s, b = http("POST", "/api/data", {"kind": "reset", "name": "ABC Construction", "records": []}, token=T["other"])
    check("After that, a prospect may not reset it", s == 403 and b == {"error": "staff_only"}, (s, b))

    # The whole sample firm is about 5,600 records and 1.5 MB: a firm that size through the runtime
    big = [{"list": "attendance", "id": f"att-{i}", "pos": i, "data": {"id": f"att-{i}", "personId": f"p-{i % 40}", "date": "2026-11-20", "note": "n" * 220}} for i in range(6000)]
    t0 = time.time()
    s, b = http("POST", "/api/data", {"kind": "reset", "name": "ABC Construction", "records": big + [todo(0), todo(1)]}, token=T["admin"])
    check("Vardil staff reset it with a firm-sized batch", s == 200 and b == {"version": 2}, (s, b))
    s, b = http("GET", "/api/data?since=0", token=T["other"])
    check("Loading the whole firm gives every record back", s == 200 and b["full"] and len(b["records"]) == 6002 and b["version"] == 2, (s, len((b or {}).get("records", []))))
    check(f"... in reasonable time ({time.time() - t0:.1f} s for both)", time.time() - t0 < 20)

    # One screen to another
    s, b = http("POST", "/api/data", {"kind": "changes", "changes": [todo(2, "repair van"), {"list": "todos", "id": "td-0", "deleted": True}]}, token=T["other"])
    check("A phone's batch is written", s == 200 and b == {"version": 3}, (s, b))
    s, b = http("GET", "/api/data?since=2", token=T["admin"])
    ids = sorted((r["id"], r.get("deleted", False)) for r in b["records"])
    check("The office gets just that batch, the deletion included", s == 200 and not b["full"] and ids == [("td-0", True), ("td-2", False)], b)
    check("Written in the prospect's name", psql("select updated_by from public.records where firm_id = 'abc-test' and id = 'td-2'") == "prospect@firm.example")
    s, b = http("GET", "/api/data?since=3", token=T["admin"])
    check("Nothing new: an empty answer", s == 200 and b == {"version": 3, "full": False, "records": []}, b)
    s, b = http("GET", "/api/data?since=1", token=T["admin"])
    check("A screen that last looked before the reset gets the whole firm", s == 200 and b["full"] and len(b["records"]) == 6002 and not any(r["id"] == "td-0" for r in b["records"]), (s, b and b.get("full")))

    # Refusals
    s, b = http("POST", "/api/data", {"kind": "changes", "changes": []}, token=T["other"], headers={"origin": "https://evil.example"})
    check("Another site's page: refused", s == 403, (s, b))
    s, b = http("POST", "/api/data", {"kind": "changes", "changes": [{"list": "todos", "id": "x"}]}, token=T["other"])
    check("A broken record: refused with a reason", s == 400 and b.get("error") == "changes", (s, b))
    s, b = http("POST", "/api/data", {"kind": "changes", "changes": [{"list": "x; drop table records", "id": "x", "pos": 0, "data": {}}]}, token=T["other"])
    check("A list name that is not a name: refused", s == 400, (s, b))
    s, b = http("POST", "/api/data", {"kind": "changes", "changes": [{"list": "todos", "id": "td-$q$ drop", "pos": 9, "data": {"title": "$j$'; drop table records; --"}}]}, token=T["other"])
    check("Quotes and dollar signs in a record are stored as text", s == 200 and psql("select data ->> 'title' from public.records where id = 'td-$q$ drop'") == "$j$'; drop table records; --", (s, b))
    check("The tables are still there", psql("select count(*) > 6000 from public.records") == "t")
finally:
    import signal
    for p in procs:
        try: os.killpg(os.getpgid(p.pid), signal.SIGTERM) if p is procs[-1] else p.terminate()
        except Exception: p.terminate()
    try: as_pg([f"{PGBIN}/pg_ctl", "-D", f"{pgdir}/data", "-m", "fast", "stop"])
    except Exception: pass

passed = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"   {str(detail)[:300]}"))
print(f"{passed} of {len(results)} passed")
sys.exit(0 if passed == len(results) else 1)
