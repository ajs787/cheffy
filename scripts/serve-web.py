# Local preview of web/ mimicking Cloudflare Pages (_redirects rewrites, _headers, AASA type). Usage: python3 scripts/serve-web.py web 8788
import http.server, os, sys
ROOT = sys.argv[1]; PORT = int(sys.argv[2])

def load_headers():
    # _headers: a path pattern line (trailing * = prefix), then indented "Name: value" lines.
    rules, current = [], None
    try:
        lines = open(os.path.join(ROOT, '_headers')).read().splitlines()
    except OSError:
        return rules
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if not line[0].isspace():
            current = (line.strip(), []); rules.append(current)
        elif current and ':' in line:
            name, value = line.strip().split(':', 1); current[1].append((name.strip(), value.strip()))
    return rules
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
    def end_headers(self):
        p = self.path.split('?', 1)[0]
        for pattern, headers in load_headers():
            if (pattern.endswith('*') and p.startswith(pattern[:-1])) or p == pattern:
                for name, value in headers:
                    self.send_header(name, value)
        super().end_headers()
    def guess_type(self, path):
        return 'application/json' if path.endswith('apple-app-site-association') else super().guess_type(path)
http.server.ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
