# NDYRA QA Runbook - CP117

## Goal
Validate that NDYRA Core remains stable after the modularization kickoff, that the workout library now runs through a standalone shared module, and that the new user-profile/preferences and token-system boundaries exist as stable integration interfaces without changing the server-trusted runtime model.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Workout library module is the active path
- Open `/app/library/timers/` while logged in with a test user that has timer-pack access.
- Confirm the page renders its owned-pack/import UI normally.
- Import or re-import a timer pack.
- Open `/app/timer/my-workouts/`.
- Confirm the imported workout appears there without direct page-specific storage hacks.
- Remove a workout and confirm the shared workout-library state updates cleanly.

### 2) My Workouts is now a real managed surface
- Open `/app/timer/my-workouts/` directly.
- Confirm the page lists saved workouts, round counts, and step counts.
- Confirm the page copy points to the shared workout-library module rather than acting like a placeholder.

### 3) Module contracts are visible and honest
- Open `/assets/data/core_module_contracts.json`.
- Confirm the three modules are present:
  - `workout_library`
  - `user_profile_prefs`
  - `token_system`
- Confirm the statuses match the checkpoint truth:
  - workout library extracted
  - profile/preferences scaffolded
  - token system scaffolded

### 4) Public/admin surfaces still match the release-closeout posture
- Open `/`, `/preview/`, `/admin/`, `/admin/status/`, `/admin/wiring/`, and `/admin/execute/`.
- Confirm build surfaces show CP117 / `2026-03-12_117`.
- Confirm `env_reference_version` is `cp117` where surfaced.
- Confirm admin truth panels still show release-closeout and live-verification data.

### 5) Boundary discipline
- Confirm NDYRA Core still does not duplicate BizGym runtime logic.
- Confirm NDYRA Core still does not duplicate the Timer runtime engine.
- Confirm Check-In remains paused.
- Confirm token handling still depends on server-side truth; the token-system module is only a stable interface layer.

## Automated gates
Run from repo root:
- `node tools/build_stamp.cjs`
- `python3 tools/qa_smoke.py`
- `python3 tools/qa_super.py`
- `python3 tools/brand_gate_check.py`
- `python3 tools/ip_gate_check.py`
- `python3 tools/wiring_consistency_check.py`
- `python3 tools/qa_accessibility.py`
- `python3 tools/deployment_confidence_check.py`
- `python3 tools/live_verification_check.py`
- `python3 tools/public_surface_check.py`
- `python3 tools/core_module_contract_check.py`
- `python3 tools/module_boundary_surface_check.py`
- `python3 tools/release_closeout_check.py`

## Expected result
CP117 should leave the existing NDYRA Core runtime stable while establishing the first real extracted module and the remaining two clean integration façades for later migration work.
