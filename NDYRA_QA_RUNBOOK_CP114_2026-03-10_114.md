# NDYRA QA Runbook — CP114

## Goal
Validate that the public pricing, join, for-gyms, gym profile, and gym join entry surfaces are now real NDYRA Core acquisition paths, remain honest about live runtime readiness, and still respect project boundaries.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Member public pricing
- Open `/pricing.html`
- Confirm the page renders real member plan cards instead of placeholder copy
- Confirm signed-out state shows signup/login actions
- Confirm signed-in state can start member checkout only when billing runtime and price IDs are actually ready
- Confirm the runtime notice tells the truth when config is partial

### 2) Public join flow
- Open `/join.html`
- Confirm the page explains the member onboarding path into app/account/gym connection flow
- Confirm CTA paths stay inside NDYRA Core routes

### 3) For-gyms public acquisition
- Open `/for-gyms/` and `/for-gyms/pricing.html`
- Confirm the pages render real business plan cards and seeded public gym examples
- Confirm business pricing routes into `/for-gyms/start.html`
- Confirm the page does not pretend BizGym runtime lives here

### 4) Business setup start
- Open `/for-gyms/start.html?biz_tier=starter&plan=monthly`
- Confirm gym name, slug, locations, tier, and cadence fields render
- Confirm checkout stays disabled or fail-closed when user, billing, or price configuration is missing
- Confirm the business setup note explains exactly what is missing when runtime/config is partial

### 5) Public gym profile + join handoff
- Open `/gym/profile/?slug=redline-athletica`
- Confirm seeded gym story, amenities, membership options, classes, events, stats, and signals render
- If signed in with live wiring available, confirm follow/connect buttons operate; otherwise confirm the page remains honest and safe
- Open `/gym/join/?slug=redline-athletica`
- Confirm the page either connects the gym for the signed-in member or routes the user toward signup/login without pretending membership is complete

### 6) Entry point discoverability
- Open `/` and `/preview/`
- Confirm the new public acquisition routes are linked from those surfaces

### 7) Boundaries
- Confirm BizGym pages remain boundary/stub surfaces only
- Confirm Check-In remains paused and is not expanded beyond its existing boundary routes

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
- `python3 tools/public_surface_check.py`

## Expected result
CP114 should make NDYRA's public front door feel real: member pricing and join are actionable, gym discovery has truthful profile surfaces, business setup can collect tenant identity safely, and the repo still respects module ownership boundaries.
