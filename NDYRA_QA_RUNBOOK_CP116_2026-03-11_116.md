# NDYRA QA Runbook — CP116

## Goal
Validate that NDYRA Core is now code-side complete, that `/admin/execute/` exposes the final release closeout packet honestly, and that the remaining `/biz/*` routes stop cleanly at explicit module boundaries rather than pretending BizGym runtime exists in Core.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Release closeout packet is visible and honest
- Open `/admin/execute/`.
- Confirm the page renders the deployment confidence checklist, runtime surface matrix, live verification matrix, and the new release closeout packet.
- Confirm blockers are still visible when real runtime values are missing.
- Confirm the quick links include `/assets/data/release_closeout_packet.json`.

### 2) Business boundary shells are explicit
- Open `/biz/`, `/biz/check-in/`, `/biz/schedule/`, `/biz/settings/`, `/biz/migrate/`, `/biz/gym-timer/`, `/biz/shop/`, `/biz/timers/packs/`, and `/biz/moves/`.
- Confirm each route renders an ownership-aware handoff shell rather than a generic placeholder.
- Confirm each route points users back to valid NDYRA Core surfaces such as `/for-gyms/`, `/biz/account/`, or `/admin/execute/`.

### 3) Public acquisition and member surfaces still work
- Open `/pricing.html`, `/join.html`, `/for-gyms/`, `/for-gyms/pricing.html`, `/for-gyms/start.html`, `/gym/profile/?slug=redline-athletica`, and `/gym/join/?slug=redline-athletica`.
- Confirm cards, CTAs, and runtime notes still render normally.
- Confirm public pricing/join surfaces remain honest when billing/runtime values are partial.

### 4) Runtime truth still matches the current checkpoint
- Open `/admin/status/`, `/admin/wiring/`, and `/admin/execute/`.
- Confirm `env_reference_version` is `cp116`.
- Confirm build surfaces show CP116 / `2026-03-11_116`.
- Confirm the production execution steps now require completing the release closeout packet before any announce-ready decision.

### 5) Boundary discipline
- Confirm NDYRA Core still does not duplicate BizGym runtime logic.
- Confirm NDYRA Core still does not duplicate the Timer runtime engine.
- Confirm Check-In remains paused and preserved only as a boundary shell here.

### 6) External live closeout procedure
- On the real deployed environment, apply the CP115 entitlement lifecycle migration if needed.
- Set the real Netlify, Supabase, and Stripe values.
- Run the live verification matrix for member checkout, business checkout, billing portal return, token top-up, timer entitlement access, and sibling plan-swap cleanup.
- Fill `ops/env/live_release_closeout.example.json` (or your production copy) with real evidence.
- Do not mark the release announce-ready until the release closeout packet is complete with real values and no blocking items remain.

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
- `python3 tools/module_boundary_surface_check.py`
- `python3 tools/release_closeout_check.py`

## Expected result
CP116 should leave no repo-side build work remaining inside NDYRA Core. Any work left after this checkpoint should be external-only: real environment values, deployed billing/webhook verification, browser/device evidence capture, performance evidence capture, and the final release decision.
