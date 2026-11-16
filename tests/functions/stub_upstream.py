import json, os, re, sys, threading, time
# Stands in for the two outside services the Ask AI function talks to, for fn_check.py:
#   GET  /certs        Cloudflare Access's public keys (from the file given)
#   POST /v1/messages  the model, answering in its own streamed format
# Every model request is kept and can be read back from GET /__requests.
# Usage: python3 stub_upstream.py <jwks.json> [port]   (default port 4192)
import http.server

JWKS = open(sys.argv[1], encoding="utf-8").read()
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 4192
REQS = []
LOCK = threading.Lock()

def ev(o):
    return f"event: {o['type']}\ndata: {json.dumps(o)}\n\n".encode()

def message(blocks, stop):
    out = [ev({"type": "message_start", "message": {"id": "msg_stub", "role": "assistant", "content": [], "usage": {"input_tokens": 120, "cache_creation_input_tokens": 21000, "cache_read_input_tokens": 0, "output_tokens": 1}}})]
    for i, b in enumerate(blocks):
        if b["type"] == "thinking":
            out += [ev({"type": "content_block_start", "index": i, "content_block": {"type": "thinking", "thinking": "", "signature": ""}}), ev({"type": "content_block_delta", "index": i, "delta": {"type": "signature_delta", "signature": b["signature"]}})]
        elif b["type"] == "text":
            out.append(ev({"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}}))
            for w in re.findall(r"\S+\s*", b["text"]):
                out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": w}}))
        elif b["type"] == "tool_use":
            out.append(ev({"type": "content_block_start", "index": i, "content_block": {"type": "tool_use", "id": b["id"], "name": b["name"], "input": {}}}))
            out.append(ev({"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": json.dumps(b["input"])}}))
        out.append(ev({"type": "content_block_stop", "index": i}))
    out.append(ev({"type": "message_delta", "delta": {"stop_reason": stop}, "usage": {"output_tokens": 240}}))
    out.append(ev({"type": "message_stop"}))
    return out

class H(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, *a): pass
    def send_json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == "/certs":
            body = JWKS.encode(); self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if self.path == "/__requests":
            with LOCK: return self.send_json(200, REQS)
        self.send_json(404, {"error": "not found"})
    def do_POST(self):
        n = int(self.headers.get("content-length", "0"))
        body = json.loads(self.rfile.read(n) or b"{}")
        with LOCK: REQS.append({"headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
        last = body["messages"][-1]["content"]
        texts = " ".join(b.get("text", "") for b in last if b.get("type") == "text").lower()
        if "overload" in texts:
            return self.send_json(529, {"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}})
        if any(b.get("type") == "tool_result" for b in last):
            events = message([{"type": "text", "text": "Done, it is waiting in Approvals."}], "end_turn")
        elif "draft" in texts:
            # Chase the Dunmoy Bridewell final account (C711), found in the summary of the records
            # the way the model would, so the draft is for an invoice that really is unpaid.
            summary = " ".join(s.get("text", "") for s in body.get("system", []) if isinstance(s, dict))
            m = re.search(r"^((?:SI|INV)-\d+) \| C711 \|", summary, re.M)
            ref = m.group(1) if m else "INV-5203"
            events = message([{"type": "thinking", "signature": "stub-sig"}, {"type": "tool_use", "id": "toolu_stub", "name": "draft_chaser", "input": {"ref": ref, "subject": ref, "body": "Dear Fintan,\n\nKind regards,\nAidan King"}}], "tool_use")
        else:
            events = message([{"type": "thinking", "signature": "stub-sig"}, {"type": "text", "text": "Three invoices are late, the biggest is [INV-5203](/invoicing/invoiced)."}], "end_turn")
        self.send_response(200); self.send_header("content-type", "text/event-stream"); self.send_header("transfer-encoding", "chunked"); self.end_headers()
        for chunk in events:
            self.wfile.write(f"{len(chunk):x}\r\n".encode() + chunk + b"\r\n"); self.wfile.flush(); time.sleep(0.005)
        self.wfile.write(b"0\r\n\r\n"); self.wfile.flush()

http.server.ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
