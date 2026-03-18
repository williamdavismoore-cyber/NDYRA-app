# NDYRA QA Runbook — CP115

## Goal
Validate that NDYRA Core now tells the truth about live billing/runtime readiness, exposes a concrete live verification matrix on `/admin/execute/`, and cleans up old plan entitlements during subscription swaps, while still preserving all stated module boundaries.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Exact member/business/token price-matrix truth
- Open `/admin/status/`
- Confirm local/public config cards show exact matrix counts for member plans, business plans, and token packs.
- Confirm partial or placeholder matrices are called out as incomplete rather than reading as "ready enough".

### 2) Member + business public pricing honesty
- Open `/pricing.html` and `/for-gyms/pricing.html`
- Confirm the cards render normally.
- Confirm checkout actions only become actionable when runtime, Stripe publishable key, and exact price matrices are complete.
- Confirm partial wiring surfaces a truthful runtime note instead of a false-positive ready state.

### 3) Live verification matrix surfaced in admin execute
- Open `/admin/execute/`
- Confirm the page renders both the deployment confidence checklist and the live verification matrix.
- Confirm missing runtime/config requirements appear in the live blockers section.
- Confirm the quick links include the verification JSON.

### 4) Runtime truth surfaces
- Open `/admin/status/`, `/admin/wiring/`, and `/admin/execute/`
- Confirm `env_reference_version` is `cp115`.
- Confirm the deployment steps mention the CP115 migration and the live verification matrix.
- Confirm partial config does not report billing/marketplace as fully ready.

### 5) Plan swap entitlement cleanup (live environment)
- In a real deployed environment, subscribe a member to one plan (for example monthly), then swap to the sibling plan (for example annual).
- Confirm the subscription mirror refreshes.
- Confirm the old sibling entitlement becomes inactive and only the current `plan:member_*` entitlement remains active.
- Repeat the same family-cleanup check for a business subject if business subscriptions are wired.

### 6) Token top-up + portal + checkout verification (live environment)
- Run the verification matrix steps for member checkout, business checkout, billing portal return, token top-up credit, timer entitlement access, and admin truth surfaces.
- Confirm the matrix can only be marked fully complete when the deployed environment is truly ready.

### 7) Boundaries
- Confirm BizGym pages remain boundary/stub surfaces only.
- Confirm Timer runtime logic is still not duplicated here.
- Confirm Check-In remains paused and is not expanded beyond its existing boundary routes.

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

## Expected result
CP115 should leave only external deployment execution work: the repo should fail closed when config is partial, admin truth should expose exact blockers, and Stripe plan swaps should not leave multiple sibling plan entitlements active.
