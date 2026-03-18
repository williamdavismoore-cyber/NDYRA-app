#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE_JS = ROOT / 'site' / 'assets' / 'js' / 'site.js'
SHELL_RUNTIME = ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'shell' / 'runtime.mjs'
HTTP_LIB = ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'lib' / 'http.mjs'
CONFIG_HELPERS = ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'lib' / 'configHelpers.mjs'
SERVER_RUNTIME = ROOT / 'netlify' / 'functions' / '_lib' / 'runtime.js'

CLIENT_IMPORT_EXPECTATIONS = {
    ROOT / 'site' / 'assets' / 'js' / 'admin_wiring.mjs': ['/assets/js/ndyra/lib/http.mjs', '/assets/js/ndyra/lib/configHelpers.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'admin_execute.mjs': ['./ndyra/lib/http.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'admin_status.mjs': ['./ndyra/lib/http.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'lib' / 'publicConfig.mjs': ['./configHelpers.mjs', './http.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'lib' / 'runtimeReady.mjs': ['./http.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'lib' / 'billing.mjs': ['./http.mjs'],
    ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'pages' / 'bizBoundary.mjs': ['../lib/http.mjs'],
}

SERVERLESS_SHARED_FILES = [
    ROOT / 'netlify' / 'functions' / 'health.js',
    ROOT / 'netlify' / 'functions' / 'public_config.js',
    ROOT / 'netlify' / 'functions' / 'stripe_create_checkout_session.js',
    ROOT / 'netlify' / 'functions' / 'stripe_create_portal_session.js',
    ROOT / 'netlify' / 'functions' / 'telemetry_ingest.js',
]

FAILURES = []


def ok(msg: str):
    print(f'OK: {msg}')


def fail(msg: str):
    FAILURES.append(msg)
    print(f'FAIL: {msg}')


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='ignore')


if not SITE_JS.exists():
    fail('site.js missing')
else:
    site_js = read_text(SITE_JS)
    if 'ndyra/shell/runtime.mjs' not in site_js:
        fail('site.js must bootstrap ndyra/shell/runtime.mjs')
    else:
        ok('site.js bootstraps shell runtime module')
    legacy_tokens = ['applyFriendlyNav(', 'ensureAppCommandBadges(', 'markCurrentNavLinks(', 'moduleHostPromise']
    leaked = [token for token in legacy_tokens if token in site_js]
    if leaked:
        fail(f'site.js should stay thin; legacy inline shell logic found: {", ".join(leaked)}')
    else:
        ok('site.js stays thin and does not inline shell runtime logic')

for path in [SHELL_RUNTIME, HTTP_LIB, CONFIG_HELPERS, SERVER_RUNTIME]:
    if path.exists():
        ok(f'{path.relative_to(ROOT)} present')
    else:
        fail(f'{path.relative_to(ROOT)} missing')

for path, expected_imports in CLIENT_IMPORT_EXPECTATIONS.items():
    if not path.exists():
        fail(f'{path.relative_to(ROOT)} missing')
        continue
    text = read_text(path)
    missing = [needle for needle in expected_imports if needle not in text]
    if missing:
        fail(f'{path.relative_to(ROOT)} missing shared imports: {", ".join(missing)}')
    else:
        ok(f'{path.relative_to(ROOT)} uses shared client helpers')

helper_defs = [
    re.compile(r'function\s+looksPlaceholder\s*\('),
    re.compile(r'function\s+safeJsonParse\s*\('),
    re.compile(r'function\s+corsHeaders\s*\('),
    re.compile(r'function\s+getOrigin\s*\('),
]

for path in SERVERLESS_SHARED_FILES:
    if not path.exists():
        fail(f'{path.relative_to(ROOT)} missing')
        continue
    text = read_text(path)
    if "require('./_lib/runtime')" not in text:
        fail(f'{path.relative_to(ROOT)} must import ./_lib/runtime')
    else:
        ok(f'{path.relative_to(ROOT)} imports ./_lib/runtime')
    leaked_defs = []
    for rx in helper_defs:
        if rx.search(text):
            leaked_defs.append(rx.pattern)
    if leaked_defs:
        fail(f'{path.relative_to(ROOT)} still defines shared helpers locally')
    else:
        ok(f'{path.relative_to(ROOT)} does not redefine shared helper functions')

telemetry = ROOT / 'netlify' / 'functions' / 'telemetry_ingest.js'
if telemetry.exists():
    t = read_text(telemetry)
    if 'HIIT56' in t or 'hiit56' in t:
        fail('telemetry_ingest.js still contains legacy HIIT56 branding')
    else:
        ok('telemetry_ingest.js legacy branding removed')

public_cfg = ROOT / 'netlify' / 'functions' / 'public_config.js'
if public_cfg.exists():
    text = read_text(public_cfg)
    if "env_reference_version: 'cp117'" in text:
        fail('public_config.js still ships stale env_reference_version cp117')
    else:
        ok('public_config.js no longer ships stale cp117 env reference')

if FAILURES:
    print('\nCODE HYGIENE CHECK FAILED')
    sys.exit(1)

print('CODE HYGIENE CHECK PASS')
