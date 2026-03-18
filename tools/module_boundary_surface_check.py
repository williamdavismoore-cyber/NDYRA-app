#!/usr/bin/env python3
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
DATA = SITE / 'assets' / 'data' / 'biz_boundary_surfaces.json'
MODULE = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'bizBoundary.mjs'
APP_CHECKIN_MODULE = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'checkinBoundary.mjs'
APP_CHECKIN = SITE / 'app' / 'check-in' / 'index.html'

TARGETS = [
    (SITE / 'biz' / 'index.html', 'business_home'),
    (SITE / 'biz' / 'check-in' / 'index.html', 'checkin'),
    (SITE / 'biz' / 'check-in' / 'kiosk' / 'index.html', 'checkin_kiosk'),
    (SITE / 'biz' / 'check-in' / 'live' / 'index.html', 'checkin_live'),
    (SITE / 'biz' / 'schedule' / 'index.html', 'schedule'),
    (SITE / 'biz' / 'settings' / 'index.html', 'settings'),
    (SITE / 'biz' / 'migrate' / 'index.html', 'migrate_hub'),
    (SITE / 'biz' / 'migrate' / 'members' / 'index.html', 'migrate_members'),
    (SITE / 'biz' / 'migrate' / 'schedule' / 'index.html', 'migrate_schedule'),
    (SITE / 'biz' / 'migrate' / 'verify' / 'index.html', 'migrate_verify'),
    (SITE / 'biz' / 'migrate' / 'commit' / 'index.html', 'migrate_commit'),
    (SITE / 'biz' / 'migrate' / 'cutover' / 'index.html', 'migrate_cutover'),
    (SITE / 'biz' / 'gym-timer' / 'index.html', 'gym_timer'),
    (SITE / 'biz' / 'gym-timer' / 'builder' / 'index.html', 'gym_timer_builder'),
    (SITE / 'biz' / 'shop' / 'index.html', 'shop'),
    (SITE / 'biz' / 'timers' / 'packs' / 'index.html', 'timer_packs'),
    (SITE / 'biz' / 'moves' / 'index.html', 'moves'),
    (SITE / 'biz' / 'moves' / 'move.html', 'move_detail'),
]

FAILS = []

def fail(msg):
    FAILS.append(msg)
    print('FAIL:', msg)

def ok(msg):
    print('OK:', msg)

for p in [DATA, MODULE, APP_CHECKIN_MODULE, APP_CHECKIN]:
    if not p.exists():
        fail(f'missing {p.relative_to(ROOT)}')

if FAILS:
    sys.exit(1)

try:
    payload = json.loads(DATA.read_text(encoding='utf-8-sig'))
except Exception as e:
    fail(f'biz_boundary_surfaces.json invalid JSON: {e}')
    sys.exit(1)

surfaces = {entry.get('key'): entry for entry in payload.get('surfaces', [])}
if not surfaces:
    fail('biz_boundary_surfaces.json missing surfaces')
    sys.exit(1)

for path, key in TARGETS:
    if not path.exists():
        fail(f'missing page: {path.relative_to(ROOT)}')
        continue
    html = path.read_text(encoding='utf-8', errors='replace')
    if 'data-biz-boundary-root' not in html:
        fail(f'{path.relative_to(ROOT)} missing data-biz-boundary-root')
    if f'data-biz-boundary-key="{key}"' not in html:
        fail(f'{path.relative_to(ROOT)} missing expected boundary key: {key}')
    if 'bizBoundary.mjs' not in html:
        fail(f'{path.relative_to(ROOT)} missing bizBoundary.mjs import')
    banned = ['placeholder', 'Stub route.', 'BizGym will provide']
    lower = html.lower()
    for token in banned:
        if token.lower() in lower:
            fail(f'{path.relative_to(ROOT)} still contains stale boundary placeholder text: {token}')
    if key not in surfaces:
        fail(f'biz_boundary_surfaces.json missing surface key: {key}')
    else:
        surface = surfaces[key]
        if not surface.get('title'):
            fail(f'biz_boundary_surfaces.json missing title for {key}')
        if not surface.get('summary'):
            fail(f'biz_boundary_surfaces.json missing summary for {key}')
        if not surface.get('links'):
            fail(f'biz_boundary_surfaces.json missing links for {key}')
    if not FAILS:
        ok(f'{path.relative_to(ROOT)}')



app_checkin = APP_CHECKIN.read_text(encoding='utf-8', errors='replace')
if 'data-checkin-boundary-root' not in app_checkin:
    fail('site/app/check-in/index.html missing data-checkin-boundary-root')
if 'checkinBoundary.mjs' not in app_checkin:
    fail('site/app/check-in/index.html missing checkinBoundary.mjs import')
for token in ['paused', 'boundary', 'placeholder']:
    if token == 'placeholder' and token in app_checkin.lower():
        fail('site/app/check-in/index.html still contains stale placeholder text')
if not FAILS:
    ok('site/app/check-in/index.html')

if FAILS:
    print(f'MODULE BOUNDARY SURFACE CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('MODULE BOUNDARY SURFACE CHECK PASS')
