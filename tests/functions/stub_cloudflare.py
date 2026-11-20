import json, sys, threading
# Stands in for Cloudflare for clients_check.py:
#   GET  /certs                                            Access's public keys (from the file given)
#   GET  /client/v4/accounts/acc/access/groups/grp         the managed group
#   PUT  /client/v4/accounts/acc/access/groups/grp         write it (kept here)
#   POST /client/v4/accounts/acc/access/organizations/revoke_user   sign someone out
#   GET  /__state   the group and every revoke; POST /__fail with {"on": true} makes the PUT fail
# Usage: python3 stub_cloudflare.py <jwks.json> [port]
import http.server

JWKS = open(sys.argv[1], encoding="utf-8").read()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4196
STATE = {"group": {"id": "grp", "name": "Demo clients, kept by Vardil HQ", "include": []}, "revoked": [], "puts": 0, "fail": False, "auth": []}
LOCK = threading.Lock()
G = "/client/v4/accounts/acc/access/groups/grp"
R = "/client/v4/accounts/acc/access/organizations/revoke_user"

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def send_json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def body(self):
        n = int(self.headers.get("content-length", "0"))
        return json.loads(self.rfile.read(n) or b"{}")
    def do_GET(self):
        if self.path == "/certs":
            b = JWKS.encode(); self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(b))); self.end_headers(); self.wfile.write(b); return
        if self.path == "/__state":
            with LOCK: return self.send_json(200, STATE)
        if self.path == G:
            with LOCK: STATE["auth"].append(self.headers.get("authorization"))
            return self.send_json(200, {"success": True, "result": STATE["group"]})
        self.send_json(404, {"success": False, "errors": [{"message": "not found"}]})
    def do_PUT(self):
        b = self.body()
        if self.path == G:
            with LOCK:
                STATE["auth"].append(self.headers.get("authorization"))
                if STATE["fail"]: return self.send_json(400, {"success": False, "errors": [{"message": "include rules are not valid"}]})
                STATE["group"] = {"id": "grp", "name": b.get("name"), "include": b.get("include")}
                STATE["puts"] += 1
            return self.send_json(200, {"success": True, "result": STATE["group"]})
        self.send_json(404, {"success": False})
    def do_POST(self):
        b = self.body()
        if self.path == "/__fail":
            with LOCK: STATE["fail"] = bool(b.get("on"))
            return self.send_json(200, {"ok": True})
        if self.path == R:
            with LOCK: STATE["revoked"].append(b.get("email"))
            return self.send_json(200, {"success": True, "result": True})
        self.send_json(404, {"success": False})

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
