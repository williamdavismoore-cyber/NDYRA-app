# NDYRA QA Runbook — CP113

## Goal
Validate that deployment confidence, checkout/portal safety, entitlement timing, and shared shell accessibility behave honestly across local preview and deployed environments.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Admin Execute deployment confidence
- Open `/admin/execute/`
- Confirm **Execution Confidence** renders
- Confirm **Live Blockers** renders
- Confirm quick links include the deployment confidence checklist JSON

### 2) Public-config honesty
- On local preview, verify preview config still works
- On any deployed host with missing `/api/public_config`, confirm the app shows a truthful warning instead of silently using local preview config

### 3) Checkout + portal fail-closed behavior
- On `/app/shop/`, `/app/wallet/`, `/app/account/`, and `/biz/account/`, confirm billing CTAs explain missing runtime readiness when placeholders or missing values remain
- Confirm business checkout requires a real tenant identity and does not quietly drop into user scope
- Confirm portal return URLs stay on-origin

### 4) Entitlement timing behavior
- With seeded or live entitlements, verify active-state checks behave consistently when `starts_at`, `valid_from`, `grace_until`, or `revoked_at` metadata is present
- Confirm timer library import/remix still honors plan-or-feature-unlock rules

### 5) Shared shell accessibility
- Verify skip links appear on focus
- Verify auth/share pages now include a real `<main id="main-content">` landmark
- Confirm keyboard focus is visible throughout shared navigation
- If reduced motion is enabled in the OS, confirm the shell respects reduced motion

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

## Expected result
CP113 should make NDYRA feel more honest and more deployable: local preview stays preview, deployed config failures are visible, billing paths fail closed, entitlement timing is shared, and the common shell is accessibility-safe by default.
