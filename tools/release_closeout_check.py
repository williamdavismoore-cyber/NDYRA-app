#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
BUILD = SITE / 'assets' / 'build.json'
PACKET = SITE / 'assets' / 'data' / 'release_closeout_packet.json'
OPS_COPY = ROOT / 'ops' / 'env' / 'live_release_closeout.example.json'
ADMIN_HTML = SITE / 'admin' / 'execute' / 'index.html'
ADMIN_JS = SITE / 'assets' / 'js' / 'admin_execute.mjs'
PACKAGE_JSON = ROOT / 'package.json'

FAILS = []

def fail(msg):
    FAILS.append(msg)
    print('FAIL:', msg)

def ok(msg):
    print('OK:', msg)

for p in [BUILD, PACKET, OPS_COPY, ADMIN_HTML, ADMIN_JS, PACKAGE_JSON]:
    if not p.exists():
        fail(f'missing {p.relative_to(ROOT)}')

if FAILS:
    sys.exit(1)

try:
    build = json.loads(BUILD.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'build.json invalid JSON: {e}')
    sys.exit(1)

try:
    packet = json.loads(PACKET.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'release_closeout_packet.json invalid JSON: {e}')
    sys.exit(1)

try:
    ops_copy = json.loads(OPS_COPY.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'live_release_closeout.example.json invalid JSON: {e}')
    sys.exit(1)

groups = packet.get('groups') or []
if not groups:
    fail('release_closeout_packet.json missing groups')
else:
    ok('release closeout packet groups present')

if packet.get('ops_copy_path') != 'ops/env/live_release_closeout.example.json':
    fail('release_closeout_packet.json ops_copy_path mismatch')
else:
    ok('release closeout packet points at ops/env/live_release_closeout.example.json')

if ops_copy.get('build_label') != build.get('label'):
    fail('ops/env/live_release_closeout.example.json build_label does not match build.json')
else:
    ok('ops copy build_label matches build.json')

if ops_copy.get('build_id') != build.get('build_id'):
    fail('ops/env/live_release_closeout.example.json build_id does not match build.json')
else:
    ok('ops copy build_id matches build.json')

html = ADMIN_HTML.read_text(encoding='utf-8', errors='replace')
for token in ['exec-closeout', 'Release Closeout Packet']:
    if token not in html:
        fail(f'admin/execute missing release closeout token: {token}')
if not FAILS:
    ok('admin/execute closeout section present')

js = ADMIN_JS.read_text(encoding='utf-8', errors='replace')
for token in ['/assets/data/release_closeout_packet.json', 'renderCloseoutPacket', 'exec-closeout']:
    if token not in js:
        fail(f'admin_execute.mjs missing closeout token/reference: {token}')
if not FAILS:
    ok('admin_execute.mjs references release closeout packet')

pkg = json.loads(PACKAGE_JSON.read_text(encoding='utf-8-sig'))
scripts = pkg.get('scripts') or {}
if 'qa:closeout' not in scripts:
    fail('package.json missing qa:closeout script')
else:
    ok('package.json qa:closeout script present')

if 'qa:boundaries' not in scripts:
    fail('package.json missing qa:boundaries script')
else:
    ok('package.json qa:boundaries script present')

qa_all = scripts.get('qa:all', '')
for token in ['qa:boundaries', 'qa:closeout']:
    if token not in qa_all:
        fail(f'qa:all missing {token}')
if not FAILS:
    ok('qa:all includes boundary + closeout checks')

if FAILS:
    print(f'RELEASE CLOSEOUT CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('RELEASE CLOSEOUT CHECK PASS')
