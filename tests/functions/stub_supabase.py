# A stand-in for Supabase's REST interface (PostgREST) for data_check.py, backed by a real
# Postgres with supabase/migrations applied: each call runs the same database function the real
# Supabase would, through psql. Only what server/shared.ts uses: the three rpc calls and the
# firms look-up, with the service key checked on every request.
# Usage: python3 stub_supabase.py <port> <pg port> <service key>
import json, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT, PG, KEY = int(sys.argv[1]), sys.argv[2], sys.argv[3]

def sql(text):
    r = subprocess.run(["psql", "-h", "127.0.0.1", "-p", PG, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
                       input="set role service_role;\n" + text, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r.stdout.strip()

def quote(s):
    """A string written into SQL safely, whatever it holds."""
    tag = "q"
    while f"${tag}$" in s: tag += "q"
    return f"${tag}${s}${tag}$"

def lit(v):
    return quote(json.dumps(v))

ARGS = {
    "changes_since": [("p_firm", "text"), ("p_since", "bigint")],
    "apply_changes": [("p_firm", "text"), ("p_changes", "jsonb"), ("p_by", "text")],
    "reset_firm": [("p_firm", "text"), ("p_name", "text"), ("p_records", "jsonb"), ("p_by", "text")],
}

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, status, body):
        data = body.encode() if isinstance(body, str) else json.dumps(body).encode()
        self.send_response(status); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(data))); self.end_headers(); self.wfile.write(data)
    def authorised(self):
        return self.headers.get("apikey") == KEY and self.headers.get("authorization") == f"Bearer {KEY}"
    def do_GET(self):
        u = urlparse(self.path)
        if not self.authorised(): return self.send(401, {"message": "Invalid API key"})
        if u.path == "/rest/v1/firms":
            firm = parse_qs(u.query).get("id", [""])[0].removeprefix("eq.")
            out = sql(f"select coalesce(json_agg(json_build_object('id', id)), '[]') from public.firms where id = {quote(firm)}")
            return self.send(200, out)
        self.send(404, {"message": "not found"})
    def do_POST(self):
        u = urlparse(self.path)
        if not self.authorised(): return self.send(401, {"message": "Invalid API key"})
        fn = u.path.removeprefix("/rest/v1/rpc/")
        if fn not in ARGS: return self.send(404, {"message": "not found"})
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", "0"))) or b"{}")
        def arg(name, typ):
            v = body[name]
            if typ == "jsonb": return f"{lit(v)}::jsonb"
            if typ == "text": return f"{quote(str(v))}::text"
            return f"{int(v)}::bigint"
        args = ", ".join(f"{name} => {arg(name, typ)}" for name, typ in ARGS[fn])
        try:
            self.send(200, sql(f"select to_jsonb(public.{fn}({args}))"))
        except RuntimeError as e:
            self.send(400, {"message": str(e).split("ERROR:")[-1].strip()})

ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
