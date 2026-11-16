import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
# Serves a built copy of the site with its real _headers (like csp_server.py) and stands in for
# the Ask AI server function, /api/ask, with scripted answers in the model's own stream format.
# Nothing here talks to a real model. The page's requests are kept and can be read back from
# GET /__asks, so ask_check.py can check exactly what the page sent.
# Usage: python3 ask_server.py [folder inside the repository] [port]   (defaults: dist, 4184)
import http.server, json, re, threading, time
ROOT = os.path.join(REPO, sys.argv[1] if len(sys.argv) > 1 else "dist")
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4184
HEAD = []
block = None
for line in open(os.path.join(ROOT, "_headers"), encoding="utf-8"):
    if line.startswith("#") or not line.strip(): continue
    if not line.startswith(" "): block = line.strip(); continue
    if block == "/*":
        k, v = line.strip().split(":", 1); HEAD.append((k.strip(), v.strip()))

LOG = []
LOCK = threading.Lock()
STATE = {"left": 30}

def ev(o):
    return f"event: {o['type']}\ndata: {json.dumps(o)}\n\n".encode()

def message(blocks, stop):
    """The events for one model message made of the given blocks."""
    out = [ev({"type": "message_start", "message": {"id": "msg_test", "role": "assistant", "content": [], "usage": {"input_tokens": 50, "cache_creation_input_tokens": 21000, "cache_read_input_tokens": 0, "output_tokens": 1}}})]
    for i, b in enumerate(blocks):
        if b["type"] == "thinking":
            out.append(ev({"type": "content_block_start", "index": i, "content_block": {"type": "thinking", "thinking": "", "signature": ""}}))
            out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "thinking_delta", "thinking": ""}}))
            out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "signature_delta", "signature": b["signature"]}}))
        elif b["type"] == "text":
            out.append(ev({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}}))
            words = re.findall(r"\S+\s*|\s+", b["text"])
            for n in range(0, len(words), 3):
                out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": "".join(words[n:n + 3])}}))
        elif b["type"] == "tool_use":
            out.append(ev({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": b["id"], "name": b["name"], "input": {}}}))
            j = json.dumps(b["input"])
            for n in range(0, len(j), 20):
                out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": j[n:n + 20]}}))
        out.append(ev({"type": "content_block_stop", "index": i}))
    out.append(ev({"type": "message_delta", "delta": {"stop_reason": stop}, "usage": {"output_tokens": 180}}))
    out.append(ev({"type": "message_stop"}))
    return out

OVERDUE = ("Three invoices are past their due date: **€193,336** owed in all, including VAT.\n\n"
           "- [SI-10404](/invoicing/invoiced) Dunmoy County Council, [C711 Dunmoy Bridewell](/projects/C711) final account: €109,187, 38 days late\n"
           "- [SI-10405](/invoicing/invoiced) Fitzgarret Property Holdings, C713 final account: €35,639, 19 days late\n"
           "- [SI-10408](/invoicing/invoiced) Ardmullen Estate, C720 stage payment 1: €48,510, 6 days late\n\n"
           "Dunmoy is the largest and the oldest, so it is the one to chase first.")

DRAFT_INPUTS = {
    # Filled in from the summary of the records at request time: see dunmoy().
    "chaser": None,
    "paid chaser": ("draft_chaser", {"ref": "INV-5201", "subject": "INV-5201", "body": "Dear Lorcan, ..."}),
    # Filled in from the summary at request time: see glebe().
    "quote for": None,
    "reply": ("draft_reply", {"mail_id": "mail-1", "subject": "Re: Damp in the north gable at Glebe House", "body": "Dear Eleanor,\n\nThank you for getting in touch. Our contracts manager will call you this week to arrange a visit.\n\nKind regards,\nAidan King\nABC Construction"}),
    "update": ("draft_client_update", {"project_code": "C725", "subject": "Granary Quay Warehouses: progress this week", "body": "Dear Stephen,\n\nThe scaffold, gantry and netting are up, and the cleaning trials have been approved by the conservation officer. Steam cleaning of the upper storeys starts next.\n\nKind regards,\nAidan King\nABC Construction"}),
}

def dunmoy(snapshot):
    """The Dunmoy Bridewell final account (C711), read from the records like the model would."""
    m = re.search(r"^((?:SI|INV)-\d+) \| C711 \|[^\n]*?(\d+) days? late", snapshot, re.M)
    ref, late = (m.group(1), m.group(2)) if m else ("INV-0000", "0")
    return ("draft_chaser", {"ref": ref, "subject": f"{ref}, Dunmoy Bridewell final account", "body": f"Dear Fintan,\n\nOur invoice {ref} for the final account at Dunmoy Bridewell is now {late} days overdue.\n\nCould you let me know when it is scheduled for payment?\n\nKind regards,\nAidan King\nABC Construction"})

def glebe(snapshot):
    """The Glebe House enquiry with no quote yet, read from the records like the model would."""
    m = re.search(r"^(ENQ-\d+) \|[^\n]*Glebe House[^\n]*\| none yet$", snapshot, re.M)
    return ("draft_quote_from_enquiry", {"enquiry_ref": m.group(1) if m else "ENQ-0000"})

def script(req):
    """What the stand-in model says, chosen from the question."""
    msgs = req["messages"]
    first_user = next(m for m in reversed(msgs) if m["role"] == "user" and any(b.get("type") == "text" for b in m["content"]))
    q = "\n".join(b["text"] for b in first_user["content"] if b.get("type") == "text").lower()
    sig = f"sig-{len(LOG)}"
    if req["kind"] == "continue":
        result = msgs[-1]["content"][0]["content"]
        m = re.search(r"(/dashboard\?open=[\w-]+)", result)
        text = f"Done. It is waiting in [Approvals]({m.group(1)}) for you to check." if m else f"I could not draft that: {result}"
        return message([{"type": "thinking", "signature": sig}, {"type": "text", "text": text}], "end_turn")
    for key in ["paid chaser", "chaser", "quote for", "reply", "update"]:
        if key in q:
            name, inp = dunmoy(req["snapshot"]) if key == "chaser" else glebe(req["snapshot"]) if key == "quote for" else DRAFT_INPUTS[key]
            return message([{"type": "thinking", "signature": sig}, {"type": "text", "text": "I will draft that now."}, {"type": "tool_use", "id": f"toolu_{len(LOG)}", "name": name, "input": inp}], "tool_use")
    if "overdue" in q:
        return message([{"type": "thinking", "signature": sig}, {"type": "text", "text": OVERDUE}], "end_turn")
    if "dash test" in q:
        return message([{"type": "text", "text": "Dunmoy — 38 days late, weeks 3–4."}], "end_turn")
    if "evil link" in q:
        return message([{"type": "text", "text": "See [this page](https://evil.example/steal) and [the record](/ask-log) and [Approvals](/dashboard)."}], "end_turn")
    if "bold link test" in q:
        return message([{"type": "text", "text": "**[Q-2614](/sales/quotes/Q-2614): Fitzgarret Property Holdings**\n\nSent 29 October, opened 30 October."}], "end_turn")
    if "table test" in q:
        return message([{"type": "text", "text": "| Invoice | Late |\n|---|---|\n| SI-10404 | 38 days |\n| SI-10405 | 19 days |"}], "end_turn")
    screen = re.search(r"\[screen: ([^\]]*)\]", q)
    return message([{"type": "text", "text": f"You are on {screen.group(1) if screen else 'an unknown screen'}."}], "end_turn")

class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        for k, v in HEAD: self.send_header(k, v)
        super().end_headers()
    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path): self.path = "/index.html"
        return super().send_head()
    def log_message(self, *a): pass
    def reply_json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == "/__asks":
            with LOCK: return self.reply_json(200, LOG)
        if self.path == "/__reset":
            with LOCK: LOG.clear(); STATE["left"] = 30
            return self.reply_json(200, {"ok": True})
        return super().do_GET()
    def do_POST(self):
        if self.path != "/api/ask": return self.reply_json(405, {"error": "method"})
        n = int(self.headers.get("content-length", "0"))
        req = json.loads(self.rfile.read(n) or b"{}")
        with LOCK: LOG.append(req)
        text = " ".join(b.get("text", "") for b in req["messages"][-1]["content"] if b.get("type") == "text").lower()
        if req["kind"] == "question":
            if "limit test" in text: return self.reply_json(429, {"error": "limit", "limit": 30})
            if "busy test" in text: return self.reply_json(503, {"error": "busy"})
            if "signin test" in text: return self.reply_json(401, {"error": "signin"})
            STATE["left"] -= 1
        # "slow test" keeps an answer arriving for a while, so a test can act while it is busy.
        if "slow test" in text: time.sleep(1.5)
        events = script(req)
        self.send_response(200)
        self.send_header("content-type", "text/event-stream; charset=utf-8")
        self.send_header("cache-control", "no-store")
        # By default the real server has no daily limit and sends no count; "count test" plays
        # a copy where a limit of 30 has been set on the project.
        if "count test" in text:
            self.send_header("x-ask-remaining", str(STATE["left"]))
            self.send_header("x-ask-limit", "30")
        self.send_header("transfer-encoding", "chunked")
        self.end_headers()
        slow = "overdue" in text
        for chunk in events:
            self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n")
            self.wfile.flush()
            if slow: time.sleep(0.02)
        self.wfile.write(b"0\r\n\r\n"); self.wfile.flush()

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
