#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
DATA = SITE / 'assets' / 'data' / 'module_host_registry.json'
KILL_SWITCH_DATA = SITE / 'assets' / 'data' / 'module_kill_switches.json'
APP_CHECKIN_HTML = SITE / 'app' / 'check-in' / 'index.html'
MODULE = SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'moduleHost' / 'index.mjs'
APP_LAUNCH_HTML = SITE / 'app' / 'index.html'
APP_LAUNCH_JS = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'appLaunch.mjs'
APP_HOME_HTML = SITE / 'app' / 'home' / 'index.html'
APP_HOME_JS = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'appHome.mjs'
APP_MORE_HTML = SITE / 'app' / 'more' / 'index.html'
APP_MORE_JS = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'appMore.mjs'
PUBLIC_HOME_HTML = SITE / 'index.html'
PUBLIC_HOME_JS = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'publicHome.mjs'
SETTINGS_JS = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'settings.mjs'
SITE_JS = SITE / 'assets' / 'js' / 'site.js'
SHELL_RUNTIME = SITE / 'assets' / 'js' / 'ndyra' / 'shell' / 'runtime.mjs'
PREVIEW_HTML = SITE / 'preview' / 'index.html'
PACKAGE_JSON = ROOT / 'package.json'

FAILS: list[str] = []


def fail(msg: str) -> None:
    FAILS.append(msg)
    print(f'FAIL: {msg}')


def ok(msg: str) -> None:
    print(f'OK: {msg}')


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='replace')


for path in [DATA, KILL_SWITCH_DATA, MODULE, APP_LAUNCH_HTML, APP_LAUNCH_JS, APP_HOME_HTML, APP_HOME_JS, APP_MORE_HTML, APP_MORE_JS, PUBLIC_HOME_HTML, PUBLIC_HOME_JS, SETTINGS_JS, SITE_JS, SHELL_RUNTIME, PREVIEW_HTML, APP_CHECKIN_HTML, PACKAGE_JSON]:
    if not path.exists():
        fail(f'missing {path.relative_to(ROOT)}')

if FAILS:
    print('MODULE HOST EXPERIENCE CHECK FAIL')
    sys.exit(1)

try:
    payload = json.loads(DATA.read_text(encoding='utf-8-sig'))
except Exception as exc:
    fail(f'invalid JSON in {DATA.relative_to(ROOT)}: {exc}')
    print('MODULE HOST EXPERIENCE CHECK FAIL')
    sys.exit(1)

if not isinstance(payload, dict):
    fail('module_host_registry.json must be an object')
else:
    ok('module_host_registry.json parsed')

public_choices = payload.get('public_choices')
if not isinstance(public_choices, list) or len(public_choices) < 3:
    fail('module_host_registry.json missing public_choices with at least 3 entries')
else:
    ok('public choices present')

modules = payload.get('modules')
if not isinstance(modules, list) or not modules:
    fail('module_host_registry.json missing modules array')
else:
    ok('module registry modules array present')

kill_switch_policy = payload.get('kill_switch_policy') if isinstance(payload, dict) else None
if not isinstance(kill_switch_policy, dict) or not kill_switch_policy.get('enabled'):
    fail('module_host_registry.json missing enabled kill_switch_policy object')
else:
    ok('kill switch policy present')

host_policy = payload.get('host_policy') if isinstance(payload, dict) else None
if not isinstance(host_policy, dict):
    fail('module_host_registry.json missing host_policy object')
else:
    rules = host_policy.get('acceptance_rules')
    if not isinstance(rules, list) or len(rules) < 4:
        fail('module_host_registry.json missing acceptance_rules list')
    elif not any('plain-language' in str(rule).lower() or 'plain language' in str(rule).lower() for rule in rules):
        fail('acceptance_rules must mention plain-language copy')
    else:
        ok('host policy acceptance rules present')

slot_keys = {str(item.get('key', '')).strip() for item in payload.get('slots', []) if isinstance(item, dict)}
required_slots = {
    'public_home_primary',
    'member_home_primary',
    'member_more_tools',
    'member_settings_extensions',
    'operator_module_truth',
    'integration_boundaries',
}
missing_slots = sorted(required_slots - slot_keys)
if missing_slots:
    fail('module_host_registry.json missing slots: ' + ', '.join(missing_slots))
else:
    ok('module slots present')


try:
    kill_payload = json.loads(KILL_SWITCH_DATA.read_text(encoding='utf-8-sig'))
except Exception as exc:
    fail(f'invalid JSON in {KILL_SWITCH_DATA.relative_to(ROOT)}: {exc}')
    kill_payload = {}

kill_modules = kill_payload.get('modules') if isinstance(kill_payload, dict) else None
if not isinstance(kill_modules, dict) or not kill_modules:
    fail('module_kill_switches.json missing modules object')
else:
    ok('module kill switches present')

module_map = {str(item.get('key', '')).strip(): item for item in modules if isinstance(item, dict)}
required_modules = {
    'gym_network_public',
    'messaging_notifications',
    'profile_preferences_identity',
    'workouts_timer_boundary',
    'social_core_aftermath',
    'challenges_events',
    'biometrics_performance',
    'commerce_tokens_entitlements',
    'timer_boundary',
    'bizgym_boundary',
    'live_ops_admin',
    'checkin_spine',
}
missing_modules = sorted(required_modules - set(module_map.keys()))
if missing_modules:
    fail('module_host_registry.json missing modules: ' + ', '.join(missing_modules))
else:
    ok('required modules present')
for key in required_modules:
    if key not in kill_modules:
        fail(f'module_kill_switches.json missing key: {key}')
else:
    ok('kill switches cover every required module')

checkin_module = module_map.get('checkin_spine', {})
if str(checkin_module.get('primary_link', {}).get('path', '')).strip() != '/app/check-in/':
    fail('checkin_spine primary link must point to /app/check-in/')
else:
    ok('checkin_spine points at member boundary shell')

# Public home
public_home_html = read_text(PUBLIC_HOME_HTML)
if 'data-public-home-root' not in public_home_html:
    fail('site/index.html missing data-public-home-root')
if 'publicHome.mjs' not in public_home_html:
    fail('site/index.html missing publicHome.mjs include')
else:
    ok('public home is wired to publicHome.mjs')

# App home + more
app_launch_html = read_text(APP_LAUNCH_HTML)
if 'data-app-launch-root' not in app_launch_html:
    fail('site/app/index.html missing data-app-launch-root')
if 'data-page="ndyra-app-launch"' not in app_launch_html:
    fail('site/app/index.html missing ndyra-app-launch data-page')
else:
    ok('app launch HTML wired')

app_home_html = read_text(APP_HOME_HTML)
if 'data-app-home-root' not in app_home_html:
    fail('site/app/home/index.html missing data-app-home-root')
if 'data-page="ndyra-app-home"' not in app_home_html:
    fail('site/app/home/index.html missing ndyra-app-home data-page')
else:
    ok('Simple Home HTML wired')

app_more_html = read_text(APP_MORE_HTML)
if 'data-app-more-root' not in app_more_html:
    fail('site/app/more/index.html missing data-app-more-root')
if 'data-page="ndyra-app-more"' not in app_more_html:
    fail('site/app/more/index.html missing ndyra-app-more data-page')
if 'boot.mjs' not in app_more_html:
    fail('site/app/more/index.html missing boot.mjs include')
else:
    ok('app more HTML wired')

# JS imports + capabilities
app_home_js = read_text(APP_HOME_JS)
for token in ['moduleHost/index.mjs', 'listMemberHomePrimaryModules', 'saveExperiencePrefs', '/app/more/', '/app/fyp/', 'data-set-launch']:
    if token not in app_home_js:
        fail(f'appHome.mjs missing token: {token}')
if 'Simple Home' not in app_home_js or 'Comfort Mode' not in app_home_js or 'For You' not in app_home_js:
    fail('appHome.mjs missing simple/comfort/For You experience copy')
else:
    ok('app home JS includes module-host driven experience shell')

app_more_js = read_text(APP_MORE_JS)
for token in ['moduleHost/index.mjs', 'listMemberMoreModules', 'listBoundaryModules']:
    if token not in app_more_js:
        fail(f'appMore.mjs missing token: {token}')
else:
    ok('app more JS includes module-host driven module surfaces')

settings_js = read_text(SETTINGS_JS)
for token in ['moduleHost/index.mjs', 'data-save-experience', 'Simple Home', 'Comfort Mode', 'launch-surface', '/app/performance/']:
    if token not in settings_js:
        fail(f'settings.mjs missing token: {token}')
else:
    ok('settings page includes local experience controls')

site_js = read_text(SITE_JS)
if 'ndyra/shell/runtime.mjs' not in site_js:
    fail('site.js must bootstrap ndyra/shell/runtime.mjs')
else:
    ok('site.js bootstraps shell runtime')

shell_runtime = read_text(SHELL_RUNTIME)
for token in ['moduleHost/index.mjs', 'data-ndyra-comfort', '/app/more/', 'ndyra:experience:prefs', '/app/fyp/', 'getModuleHostStatus']:
    if token not in shell_runtime:
        fail(f'shell/runtime.mjs missing token: {token}')
else:
    ok('shell/runtime.mjs applies module-host experience prefs + friendly nav')

module_host_js = read_text(MODULE)
for token in ['loadModuleKillSwitches', 'listDisabledModules', 'isModuleEnabled', 'kill_switch_policy']:
    if token not in module_host_js:
        fail(f'moduleHost/index.mjs missing token: {token}')
else:
    ok('moduleHost includes kill-switch support')

app_checkin_html = read_text(APP_CHECKIN_HTML)
for token in ['data-checkin-boundary-root', 'checkinBoundary.mjs', 'Check-In boundary']:
    if token not in app_checkin_html:
        fail(f'site/app/check-in/index.html missing token: {token}')
else:
    ok('member Check-In boundary shell present')

preview_html = read_text(PREVIEW_HTML)
for token in ['module_host_registry.json', '/app/more/']:
    if token not in preview_html:
        fail(f'preview/index.html missing token: {token}')
else:
    ok('preview page exposes module host surfaces')

pkg = json.loads(PACKAGE_JSON.read_text(encoding='utf-8-sig'))
scripts = pkg.get('scripts', {}) if isinstance(pkg, dict) else {}
if 'qa:module-host' not in scripts:
    fail('package.json missing qa:module-host script')
qa_all = str(scripts.get('qa:all', ''))
if 'qa:module-host' not in qa_all:
    fail('package.json qa:all missing qa:module-host step')
elif 'qa:future-alignment' not in qa_all:
    fail('package.json qa:all missing qa:future-alignment step')
else:
    ok('package.json includes qa:module-host + qa:future-alignment in qa:all')

if FAILS:
    print(f'MODULE HOST EXPERIENCE CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('MODULE HOST EXPERIENCE CHECK PASS')
