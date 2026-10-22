# Local preview of web/ mimicking Cloudflare Pages (_redirects rewrites, AASA type). Usage: python3 scripts/serve-web.py web 8788
import http.server, os, sys
ROOT = sys.argv[1]; PORT = int(sys.argv[2])
EXACT = {'/auth/callback': '/auth/callback.html', '/invite': '/invite.html', '/open': '/open.html'}
REWRITES = [('/invite/', '/invite.html'), ('/user/', '/open.html'), ('/post/', '/open.html')]
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def translate_path(self, path):
        p = path.split('?', 1)[0].split('#', 1)[0]
        p = EXACT.get(p, p)
        for prefix, target in REWRITES:
            if p.startswith(prefix): p = target
        if p.endswith('/'): p += 'index.html'
        return super().translate_path(p)
    def guess_type(self, path):
        return 'application/json' if path.endswith('apple-app-site-association') else super().guess_type(path)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
