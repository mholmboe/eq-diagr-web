"""Serve webpoc/web on http://127.0.0.1:8765 for development.

Like "python3 -m http.server", but the browser is told to check every file
again (Cache-Control: no-cache), so a changed page or script is used at once.
Usage: python3 webpoc/serve.py [port]
"""
import functools, http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
web = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=web)).serve_forever()
