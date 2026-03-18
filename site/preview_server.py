#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse, os, posixpath, urllib.parse
ROOT = Path(__file__).resolve().parent
ROUTES = {
    '/gym/join': '/gym/join/index.html',
    '/gym/profile': '/gym/profile/index.html',
    '/app/book/class': '/app/book/class/index.html',
    '/app/post': '/app/post/index.html',
    '/app/profile': '/app/profile/index.html',
    '/app/signals': '/app/signals/index.html',
}
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.urlsplit(path).path
        for prefix, target in ROUTES.items():
            if path == prefix or path.startswith(prefix + '/'):
                path = target
                break
        path = posixpath.normpath(urllib.parse.unquote(path))
        full = ROOT / path.lstrip('/')
        return str(full)
    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8080)
    args=ap.parse_args()
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(('0.0.0.0', args.port), Handler)
    print(f'NDYRA preview server running at http://localhost:{args.port}')
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass

if __name__=='__main__':
    main()
