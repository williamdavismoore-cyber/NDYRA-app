# NDYRA QA Runbook - CP118

## Goal
Validate the CP118 correction to the modularization ownership map:
- Timer remains separate and unintegrated
- Core owns profile workout refs via `userProfilePrefs`
- Core token-system contract remains intact

## Preflight
1. Extract the repo.
2. Confirm `site/assets/build.json` reports `CP118` / `2026-03-12_118`.
3. Confirm the legacy `site/assets/js/ndyra/modules/workoutLibrary/` path is gone.
4. Confirm `site/assets/js/ndyra/modules/timerBoundary/index.mjs` exists.

## Automated gates
Run from repo root:

```bash
node tools/build_stamp.cjs
python3 tools/qa_smoke.py
python3 tools/qa_super.py
python3 tools/brand_gate_check.py
python3 tools/ip_gate_check.py
python3 tools/wiring_consistency_check.py
python3 tools/qa_accessibility.py
python3 tools/deployment_confidence_check.py
python3 tools/live_verification_check.py
python3 tools/public_surface_check.py
python3 tools/core_module_contract_check.py
python3 tools/module_boundary_surface_check.py
python3 tools/release_closeout_check.py
```

## Manual spot checks
1. Open `/app/library/timers/`
   - Expect an honest Timer boundary shell.
   - Expect no Core-owned timer-pack import CTA.
   - Expect Timer-owned capabilities and interface names listed.

2. Open `/app/timer/my-workouts/`
   - Expect profile workout refs copy.
   - Expect no claim that Core owns the full video workout library.

3. Open `/app/settings/`
   - Expect profile workout ref count in the account snapshot card.
   - Save privacy/timezone/connected gym only in a live-config environment.

4. Open `/app/profile/`
   - Expect profile page to load normally.
   - On your own profile, expect saved workout-ref count to show.

5. Open `/`
   - Expect hero copy to describe the corrected Timer/Profile ownership split.

## Regression expectations
- BizGym routes remain boundary shells only.
- Timer runtime remains separate.
- Check-In remains paused.
- Token marketplace/server truth remains unchanged.
