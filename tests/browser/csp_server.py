import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures") + os.sep
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
# Serves a built copy of the site with exactly the headers in its _headers file, the way
# Cloudflare Pages does, and sends unknown addresses to index.html like _redirects does.
# Usage: python3 csp_server.py [folder inside the repository] [port]
# Defaults: dist on port 4180 (csp_check.py). access_check.py uses dist-access on port 4182.
import http.server
ROOT = os.path.join(REPO, sys.argv[1] if len(sys.argv) > 1 else "dist")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4180
HEAD = []
block = None
for line in open(os.path.join(ROOT, "_headers"), encoding="utf-8"):
    if line.startswith("#") or not line.strip(): continue
    if not line.startswith(" "): block = line.strip(); continue
    if block == "/*":
        k, v = line.strip().split(":", 1); HEAD.append((k.strip(), v.strip()))
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        for k, v in HEAD: self.send_header(k, v)
        super().end_headers()
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path): self.path = "/index.html"
        return super().send_head()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
