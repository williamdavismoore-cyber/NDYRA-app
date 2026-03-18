#!/usr/bin/env python3
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
NETLIFY_ENV = ROOT / 'netlify' / 'env'

FAILS = []

def ok(msg): print('  OK:', msg)
def fail(msg):
    FAILS.append(msg)
    print('  FAIL:', msg)

def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def main():
    print('NDYRA Wiring Preflight')
    cfg = SITE / 'assets' / 'ndyra.config.json'
    cfg_ex = SITE / 'assets' / 'ndyra.config.example.json'
    for p in [cfg, cfg_ex]:
        if not p.exists():
            fail(f'Missing config file: {p.relative_to(ROOT)}')
        else:
            ok(f'Config file present: {p.relative_to(ROOT)}')

    for name in ['netlify.local.example','netlify.staging.example','netlify.production.example']:
        p = NETLIFY_ENV / name
        if not p.exists(): fail(f'Missing env template: {p.relative_to(ROOT)}')
        else: ok(f'Env template present: {p.relative_to(ROOT)}')

    try:
        cfg_json = load_json(cfg)
        for key in ['supabaseUrl','supabaseAnonKey','stripePublishableKey']:
            if key not in cfg_json:
                fail(f'Local config missing key: {key}')
        ok('Local config JSON parses')
    except Exception as e:
        fail(f'Local config invalid JSON: {e}')

    try:
        manifest = load_json(SITE / 'assets' / 'data' / 'live_wiring_manifest.json')
        tf = manifest.get('template_files', {})
        for needed in ['local','staging','production']:
            if needed not in tf:
                fail(f'live_wiring_manifest missing template_files.{needed}')
        ok('Live wiring manifest parses')
    except Exception as e:
        fail(f'Live wiring manifest invalid: {e}')

    status_html = SITE / 'admin' / 'status' / 'index.html'
    if status_html.exists() and 'id="local-config-status"' in status_html.read_text(encoding='utf-8', errors='replace'):
        ok('Admin Status contains local-config section')
    else:
        fail('Admin Status missing local-config section')

    if FAILS:
        print(f'\nWIIRING PREFLIGHT FAIL ❌ ({len(FAILS)} issues)')
        raise SystemExit(1)
    print('\nWIRING PREFLIGHT PASS ✅')

if __name__ == '__main__':
    main()
