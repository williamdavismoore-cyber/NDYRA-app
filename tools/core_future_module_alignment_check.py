#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
DATA = SITE / 'assets' / 'data'
DOCS = ROOT / 'docs' / 'ndyra'

FAILS: list[str] = []

def fail(msg: str) -> None:
    FAILS.append(msg)
    print(f'FAIL: {msg}')

def ok(msg: str) -> None:
    print(f'OK: {msg}')

def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8', errors='replace')

required_paths = [
    SITE / 'app' / 'index.html',
    SITE / 'app' / 'home' / 'index.html',
    SITE / 'app' / 'stories' / 'index.html',
    SITE / 'app' / 'performance' / 'index.html',
    SITE / 'app' / 'check-in' / 'index.html',
    SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'appLaunch.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'stories.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'performance.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'biometricsBoundary' / 'index.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'timerAftermathBridge' / 'index.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'signalsStoriesPolicy' / 'index.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'gymNetworkBoundary' / 'index.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'challengesEventsBoundary' / 'index.mjs',
    SITE / 'assets' / 'js' / 'ndyra' / 'modules' / 'checkinSpineBoundary' / 'index.mjs',
    SITE / 'assets' / 'data' / 'module_kill_switches.json',
    DOCS / 'NDYRA_Core_System_Alignment_CP122_2026-03-16.md',
    DOCS / 'NDYRA_Signals_Stories_Amendment_CP122_2026-03-16.md',
    DOCS / 'NDYRA_BRG01_Timer_Aftermath_Draft_CP122_2026-03-16.md',
    DOCS / 'NDYRA_Biometrics_Performance_Host_Readiness_CP122_2026-03-16.md',
    DOCS / 'NDYRA_Core_Module_Isolation_Alignment_CP122_2026-03-16.md',
    DOCS / 'NDYRA_Signals_Stories_Amendment_CP121_2026-03-14.md',
    DOCS / 'NDYRA_BRG01_Timer_Aftermath_Draft_CP121_2026-03-14.md',
    DOCS / 'NDYRA_Biometrics_Performance_Host_Readiness_CP121_2026-03-14.md',
]
for path in required_paths:
    if not path.exists():
        fail(f'missing {path.relative_to(ROOT)}')
if FAILS:
    print('CORE FUTURE MODULE ALIGNMENT CHECK FAIL')
    sys.exit(1)

# app launch / home surfaces
app_launch = read_text(SITE / 'app' / 'index.html')
if 'data-page="ndyra-app-launch"' not in app_launch or 'data-app-launch-root' not in app_launch:
    fail('site/app/index.html must be an app-launch shell with data-app-launch-root')
else:
    ok('app launch shell present')

app_home = read_text(SITE / 'app' / 'home' / 'index.html')
if 'data-page="ndyra-app-home"' not in app_home or 'data-app-home-root' not in app_home:
    fail('site/app/home/index.html must be the dedicated Simple Home surface')
else:
    ok('Simple Home surface present')

stories_html = read_text(SITE / 'app' / 'stories' / 'index.html')
if 'data-page="ndyra-stories"' not in stories_html or 'data-stories-root' not in stories_html:
    fail('site/app/stories/index.html missing stories root wiring')
else:
    ok('stories shell present')

performance_html = read_text(SITE / 'app' / 'performance' / 'index.html')
if 'data-page="ndyra-performance"' not in performance_html or 'data-performance-root' not in performance_html:
    fail('site/app/performance/index.html missing performance root wiring')
else:
    ok('performance shell present')

checkin_html = read_text(SITE / 'app' / 'check-in' / 'index.html')
if 'data-checkin-boundary-root' not in checkin_html or 'checkinBoundary.mjs' not in checkin_html:
    fail('site/app/check-in/index.html missing member check-in boundary wiring')
else:
    ok('member check-in boundary shell present')

boot = read_text(SITE / 'assets' / 'js' / 'ndyra' / 'boot.mjs')
for token in ['ndyra-app-launch', 'ndyra-stories', 'ndyra-performance', 'appLaunch.mjs', 'stories.mjs', 'performance.mjs']:
    if token not in boot:
        fail(f'boot.mjs missing token: {token}')
else:
    ok('boot.mjs includes new page mappings')

# registry
registry = json.loads((DATA / 'module_host_registry.json').read_text(encoding='utf-8-sig'))
if registry.get('build_label') != 'CP122':
    fail('module_host_registry.json build_label must be CP122')
mods = {str(item.get('key', '')).strip(): item for item in registry.get('modules', []) if isinstance(item, dict)}
if 'biometrics_performance' not in mods:
    fail('module_host_registry.json missing biometrics_performance module')
else:
    ok('module registry includes biometrics_performance')

checkin_mod = mods.get('checkin_spine')
if not checkin_mod or str(checkin_mod.get('primary_link',{}).get('path','')).strip() != '/app/check-in/':
    fail('checkin_spine must point at /app/check-in/')
else:
    ok('check-in member boundary is registry-recognized')

social = mods.get('social_core_aftermath')
if not social or not any('/app/stories/' == str(link.get('path', '')) for link in social.get('links', [])):
    fail('social_core_aftermath must link to /app/stories/')
else:
    ok('social module links stories')

experience_defaults = registry.get('experience_defaults', {})
if experience_defaults.get('launch_surface') != 'for_you':
    fail('experience_defaults.launch_surface must default to for_you')
else:
    ok('For You launch default locked')

# contracts
contracts = json.loads((DATA / 'core_module_contracts.json').read_text(encoding='utf-8-sig'))
contract_mods = {str(item.get('key', '')).strip(): item for item in contracts.get('modules', []) if isinstance(item, dict)}
for key in ['biometrics_boundary', 'timer_aftermath_bridge', 'signals_stories_policy', 'gym_network_boundary', 'challenges_events_boundary', 'checkin_spine_boundary']:
    if key not in contract_mods:
        fail(f'core_module_contracts.json missing {key}')
    else:
        ok(f'contract present: {key}')

# page-level alignment
settings_js = read_text(SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'settings.mjs')
for token in ['launch-surface', '/app/performance/', '#health-data', 'biometricsBoundary/index.mjs']:
    if token not in settings_js:
        fail(f'settings.mjs missing token: {token}')
else:
    ok('settings.mjs reflects launch + biometrics surfaces')

profile_js = read_text(SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'profile.mjs')
for token in ['biometricsBoundary/index.mjs', '/app/performance/', '/app/stories/']:
    if token not in profile_js:
        fail(f'profile.mjs missing token: {token}')
else:
    ok('profile.mjs exposes profile fitness-bio shell')

signals_js = read_text(SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'signals.mjs')
for token in ['signalsStoriesPolicy/index.mjs', 'notifications_seed_public.json', '/app/stories/']:
    if token not in signals_js:
        fail(f'signals.mjs missing token: {token}')
else:
    ok('signals.mjs aligned to alerts-not-content rule')

stories_js = read_text(SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'stories.mjs')
for token in ['signalsStoriesPolicy/index.mjs', '/app/aftermath/', 'SOC01']:
    if token not in stories_js:
        fail(f'stories.mjs missing token: {token}')
else:
    ok('stories shell aligned to SOC01 lane')

if FAILS:
    print(f'CORE FUTURE MODULE ALIGNMENT CHECK FAIL ({len(FAILS)} issues)')
    sys.exit(1)

print('CORE FUTURE MODULE ALIGNMENT CHECK PASS')
