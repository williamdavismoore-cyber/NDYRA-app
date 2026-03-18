# NDYRA Buildbook — MemoryPack

**CP114 • Build 2026-03-10_114 • Kit v10.3**

## Checkpoint intent
CP114 is the public acquisition + gym profile reality pass. It continues from a re-QAed CP113 and turns the remaining public entry pages into real NDYRA Core surfaces without crossing into BizGym runtime, Timer runtime, or paused Check-In work.

## High-impact changes
- Added `public_gyms_seed.json` as the seeded truth source for public gym discovery examples
- Added `publicGyms.mjs` for seeded/live-ready gym profile loading, slug handling, profile hrefs, join hrefs, and mini-card rendering
- Rebuilt `pricing.html` with real member pricing logic via `pricingPublic.mjs`
- Rebuilt `join.html` with a real NDYRA member onboarding explainer via `joinPublic.mjs`
- Rebuilt `/for-gyms/` and `/for-gyms/pricing.html` with real public gym acquisition surfaces via `forGymsLanding.mjs` and `pricingPublic.mjs`
- Added `/for-gyms/start.html` setup flow with gym identity capture, tenant slug discipline, and fail-closed business checkout logic via `forGymsStart.mjs`
- Rebuilt `/gym/profile/` and `/gym/join/` with real public gym profile + join handoff behavior via `publicGymProfile.mjs` and `gymJoinPublic.mjs`
- Added `public_surface_check.py` and folded it into `qa:all`
- Restamped the active site to CP114 and refreshed home/preview entry points so the new routes are discoverable

## Where we are on the blueprint + amendments
**Current estimate: ~99% complete / ~1% remaining**

### Locked blueprint / amendment status
- Core member app surfaces: **~99%**
- Public acquisition + gym discovery entry surfaces: **~97%**
- Messaging / inbox / notifications: **~95%**
- Marketplace + wallet + purchases + timer library: **~97%**
- Aftermath / events / challenges / social loop: **~94%**
- Live wiring / deployment truth: **~98%**
- Remaining work: true live environment execution with real values, final deployed browser/device pass, and last performance/polish verification

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS
- wiring_consistency_check PASS
- qa_accessibility PASS
- deployment_confidence_check PASS
- public_surface_check PASS

## Generated graphics
- None

## Next
CP115 should focus on the true finish line:
- real environment execution with real Netlify/Supabase/Stripe values
- final deployed entitlement/billing verification with true webhook flow
- final browser/device/performance pass on live infrastructure
