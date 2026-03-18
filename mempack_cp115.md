# NDYRA Buildbook — MemoryPack

**CP115 • Build 2026-03-10_115 • Kit v10.3**

## Checkpoint intent
CP115 is the live execution truth + entitlement verification hardening pass. It continues from a re-QAed CP114 tree and closes the final code-side gap between a believable preview and a trustworthy deployment-grade NDYRA Core build, without crossing into BizGym runtime, Timer runtime, or paused Check-In work.

## High-impact changes
- Tightened public config truth so member, business, and token pricing only read as ready when the full expected price matrix is actually exposed with non-placeholder values.
- Rebuilt `/api/public_config` summary flags around exact matrix completeness, public availability counts, and `price_matrix_complete` truth.
- Hardened runtime readiness helpers so billing, marketplace, deployed-config, and execution readiness fail closed instead of accepting partial public config.
- Added `live_verification_matrix.json` and surfaced it on `/admin/execute/` so the final Netlify/Supabase/Stripe pass has explicit runtime-gated verification steps.
- Expanded `/admin/status/` with matrix-level counts and missing/placeholder key visibility for member plans, business plans, and token packs.
- Hardened `stripe_webhook.js` so plan swaps deactivate sibling plan entitlements in the same subject family instead of leaving multiple active plans behind.
- Added CP115 migration `2026-03-10_000001_NDYRA_CP115_Entitlement_Lifecycle_and_Verification_v1.sql` so entitlement lifecycle columns expected by the client are present in schema truth.
- Added `live_verification_check.py` and folded it into `qa:all` so the new verification artifact, admin surface, migration, and webhook cleanup logic cannot silently regress.
- Restamped the active site to CP115 and refreshed `/` + `/preview/` copy so the checkpoint narrative matches the live-verification finish-line work.

## Where we are on the blueprint + amendments
**Current estimate: ~99.5% complete / ~0.5% remaining**

### Locked blueprint / amendment status
- Core member app surfaces: **~99%**
- Public acquisition + gym discovery entry surfaces: **~98%**
- Messaging / inbox / notifications: **~95%**
- Marketplace + wallet + purchases + timer library: **~98%**
- Aftermath / events / challenges / social loop: **~94%**
- Live wiring / deployment truth: **~99.5%**
- Remaining work: apply the CP115 migration on the real database, set the real Netlify/Supabase/Stripe values, run the live verification matrix on deployed infrastructure, and finish the final browser/device/performance pass.

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS
- wiring_consistency_check PASS
- qa_accessibility PASS
- deployment_confidence_check PASS
- live_verification_check PASS
- public_surface_check PASS

## Generated graphics
- None

## Next
CP116 should be the true live finish pass:
- apply the CP115 migration in the real environment
- set real Netlify/Supabase/Stripe values and verify `/api/health` + `/api/public_config`
- run the full live verification matrix, including checkout, portal, token top-up, and plan swap cleanup
- finish the final deployed browser/device/performance pass and close out deployment evidence
