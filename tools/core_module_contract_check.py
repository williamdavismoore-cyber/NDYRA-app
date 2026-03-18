from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'
DATA = SITE / 'assets' / 'data'


def fail(msg: str) -> None:
    print(f'FAIL: {msg}')
    raise SystemExit(1)


def ok(msg: str) -> None:
    print(f'OK: {msg}')


def load_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def main() -> int:
    contract_path = DATA / 'core_module_contracts.json'
    if not contract_path.exists():
        fail(f'missing module contract file: {contract_path.relative_to(ROOT)}')
    payload = load_json(contract_path)
    ok('core module contract file present')

    modules = payload.get('modules') if isinstance(payload, dict) else None
    if not isinstance(modules, list) or not modules:
        fail('core module contracts missing modules array')

    module_map = {str(item.get('key', '')).strip(): item for item in modules if isinstance(item, dict)}
    required = {
        'timer_module_boundary': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'timerBoundary' / 'index.mjs',
        'user_profile_prefs': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'userProfilePrefs' / 'index.mjs',
        'token_system': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'tokenSystem' / 'index.mjs',
        'biometrics_boundary': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'biometricsBoundary' / 'index.mjs',
        'timer_aftermath_bridge': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'timerAftermathBridge' / 'index.mjs',
        'signals_stories_policy': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'signalsStoriesPolicy' / 'index.mjs',
        'gym_network_boundary': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'gymNetworkBoundary' / 'index.mjs',
        'challenges_events_boundary': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'challengesEventsBoundary' / 'index.mjs',
        'checkin_spine_boundary': ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'checkinSpineBoundary' / 'index.mjs',
    }
    for key, path in required.items():
        if key not in module_map:
            fail(f'module contract missing entry: {key}')
        if not path.exists():
            fail(f'module entry file missing: {path.relative_to(ROOT)}')
        contract = module_map[key]
        status = str(contract.get('status', '')).strip()
        interface = contract.get('interface')
        if not status:
            fail(f'module contract missing status: {key}')
        if not isinstance(interface, list) or not interface:
            fail(f'module contract missing interface methods: {key}')
        ok(f'{key} contract + entry file present')

    legacy_module_path = ROOT / 'site' / 'assets' / 'js' / 'ndyra' / 'modules' / 'workoutLibrary' / 'index.mjs'
    if legacy_module_path.exists():
        fail(f'legacy workout-library module still present: {legacy_module_path.relative_to(ROOT)}')
    ok('legacy Core workout-library module removed')

    plan_doc = ROOT / 'docs' / 'ndyra' / 'NDYRA_Core_System_Alignment_CP122_2026-03-16.md'
    if not plan_doc.exists():
        fail(f'missing system alignment doc: {plan_doc.relative_to(ROOT)}')
    ok('system alignment doc present')

    library_page = (SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'libraryTimers.mjs').read_text(encoding='utf-8', errors='replace')
    my_workouts_page_path = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'myWorkouts.mjs'
    settings_page_path = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'settings.mjs'
    profile_page_path = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'profile.mjs'
    performance_page_path = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'performance.mjs'
    stories_page_path = SITE / 'assets' / 'js' / 'ndyra' / 'pages' / 'stories.mjs'
    for path in (my_workouts_page_path, settings_page_path, profile_page_path, performance_page_path, stories_page_path):
        if not path.exists():
            fail(f'missing page module: {path.relative_to(ROOT)}')

    my_workouts_page = my_workouts_page_path.read_text(encoding='utf-8', errors='replace')
    settings_page = settings_page_path.read_text(encoding='utf-8', errors='replace')
    profile_page = profile_page_path.read_text(encoding='utf-8', errors='replace')

    if "../modules/timerBoundary/index.mjs" not in library_page:
        fail('Timer Library page is not consuming the timer-boundary module')
    ok('Timer Library page consumes the timer-boundary module')

    profile_import = "../modules/userProfilePrefs/index.mjs"
    biometrics_import = "../modules/biometricsBoundary/index.mjs"
    performance_page = performance_page_path.read_text(encoding='utf-8', errors='replace')
    stories_page = stories_page_path.read_text(encoding='utf-8', errors='replace')

    for name, body in {
        'My Workouts page': my_workouts_page,
        'Settings page': settings_page,
        'Profile page': profile_page,
        'Performance page': performance_page,
    }.items():
        if profile_import not in body:
            fail(f'{name} is not consuming the user-profile-prefs module')
    ok('profile/workout-ref consumers import the user-profile-prefs module')

    for name, body in {
        'Settings page': settings_page,
        'Profile page': profile_page,
        'Performance page': performance_page,
    }.items():
        if biometrics_import not in body:
            fail(f'{name} is not consuming the biometrics-boundary module')
    ok('profile/settings/performance surfaces import the biometrics-boundary module')

    if '../modules/signalsStoriesPolicy/index.mjs' not in stories_page:
        fail('Stories page is not consuming the signals-stories policy module')
    ok('stories page consumes the signals-stories policy module')

    legacy_import_hits = []
    for path in (SITE / 'assets' / 'js').rglob('*.mjs'):
        rel = path.relative_to(ROOT)
        txt = path.read_text(encoding='utf-8', errors='replace')
        if '../modules/workoutLibrary/index.mjs' in txt or '/modules/workoutLibrary/index.mjs' in txt:
            legacy_import_hits.append(str(rel))
    if legacy_import_hits:
        fail(f'legacy workout-library imports remain: {", ".join(legacy_import_hits)}')
    ok('legacy workout-library imports removed')

    workout_storage_hits = []
    workout_ref_storage_hits = []
    allowed_profile_module = Path('site/assets/js/ndyra/modules/userProfilePrefs/index.mjs')
    for path in (SITE / 'assets' / 'js').rglob('*.mjs'):
        rel = path.relative_to(ROOT)
        txt = path.read_text(encoding='utf-8', errors='replace')
        if 'ndyra:my_workouts' in txt and rel != allowed_profile_module:
            workout_storage_hits.append(str(rel))
        if 'ndyra:profile:workout_refs' in txt and rel != allowed_profile_module:
            workout_ref_storage_hits.append(str(rel))
    if workout_storage_hits:
        fail(f'legacy workout storage key leaked outside profile module: {", ".join(workout_storage_hits)}')
    if workout_ref_storage_hits:
        fail(f'profile workout ref storage key leaked outside profile module: {", ".join(workout_ref_storage_hits)}')
    ok('workout storage keys isolated to user-profile-prefs module')

    my_workouts_html = (SITE / 'app' / 'timer' / 'my-workouts' / 'index.html').read_text(encoding='utf-8', errors='replace')
    performance_html = (SITE / 'app' / 'performance' / 'index.html').read_text(encoding='utf-8', errors='replace')
    stories_html = (SITE / 'app' / 'stories' / 'index.html').read_text(encoding='utf-8', errors='replace')
    checkin_html = (SITE / 'app' / 'check-in' / 'index.html').read_text(encoding='utf-8', errors='replace')
    if 'data-my-workouts-root' not in my_workouts_html:
        fail('My Workouts HTML missing data root')
    if '/assets/js/ndyra/pages/myWorkouts.mjs' not in my_workouts_html:
        fail('My Workouts HTML missing page module include')
    ok('My Workouts page surface wired')

    if 'data-performance-root' not in performance_html or '/assets/js/ndyra/boot.mjs' not in performance_html:
        fail('Performance page surface not wired')
    if 'data-stories-root' not in stories_html or '/assets/js/ndyra/boot.mjs' not in stories_html:
        fail('Stories page surface not wired')
    if 'data-checkin-boundary-root' not in checkin_html or '/assets/js/ndyra/pages/checkinBoundary.mjs' not in checkin_html:
        fail('Check-In boundary page surface not wired')
    ok('performance + stories + check-in page surfaces wired')

    pkg = load_json(ROOT / 'package.json')
    scripts = pkg.get('scripts') if isinstance(pkg, dict) else {}
    if 'qa:modules:core' not in scripts:
        fail('package.json missing qa:modules:core script')
    if 'qa:future-alignment' not in scripts:
        fail('package.json missing qa:future-alignment script')
    qa_all = str(scripts.get('qa:all', ''))
    if 'qa:modules:core' not in qa_all:
        fail('package.json qa:all missing qa:modules:core step')
    if 'qa:future-alignment' not in qa_all:
        fail('package.json qa:all missing qa:future-alignment step')
    ok('package.json includes core module contract + future alignment checks')

    print('CORE MODULE CONTRACT CHECK PASS')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
