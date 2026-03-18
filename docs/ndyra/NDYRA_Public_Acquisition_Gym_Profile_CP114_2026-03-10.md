# NDYRA Public Acquisition + Gym Profile Reality Pass — CP114

## Intent
CP114 continues directly from the verified CP113 tree. The goal is to stop treating public pricing, join, and gym discovery as placeholder-grade surfaces and to make them real NDYRA Core entry points while preserving module ownership boundaries.

## What changed
- Added `site/assets/data/public_gyms_seed.json` as seeded public gym truth for preview and QA.
- Added `site/assets/js/ndyra/lib/publicGyms.mjs` to unify gym slug parsing, profile loading, join/profile href construction, and mini-card rendering.
- Rebuilt `site/pricing.html` with `pricingPublic.mjs` so member pricing reads live public config, reflects runtime readiness, and only starts checkout when billing + price wiring are actually present.
- Rebuilt `site/join.html` with `joinPublic.mjs` so the member onboarding path is explained through real account/app/gym-connect flows.
- Rebuilt `site/for-gyms/index.html` and `site/for-gyms/pricing.html` so public business acquisition stays inside NDYRA Core while handing deeper gym operations off to BizGym.
- Added `site/for-gyms/start.html` with `forGymsStart.mjs` so business setup captures gym name, slug, location count, tier, and cadence before starting checkout.
- Rebuilt `site/gym/profile/index.html` with `publicGymProfile.mjs` so seeded/live-ready gym story, amenities, classes, events, and public signals render on a real profile.
- Rebuilt `site/gym/join/index.html` with `gymJoinPublic.mjs` so signed-in members can connect the gym honestly and signed-out visitors are routed toward auth without fake completion states.
- Added `tools/public_surface_check.py` and included it in `qa:all` so these public routes cannot quietly slide back to placeholders.
- Refreshed `/` and `/preview/` so the new public routes are easy to find during QA and packaging.

## Why it matters
CP114 closes one of the last obvious realism gaps in the build:
- prospective members can see real pricing and join paths
- gyms can see real public acquisition surfaces and a truthful business setup handoff
- public gym profiles can now function as discovery entry points instead of dead shells
- runtime/config honesty remains intact instead of being bypassed by brochure copy

## Boundaries respected
- No BizGym runtime logic was duplicated into NDYRA Core.
- No Timer module runtime logic was duplicated beyond the existing Core integrations.
- Check-In remains paused and was not built out.

## QA
- QA-first rule honored: CP113 was re-verified before CP114 work continued.
- `build_stamp` PASS
- `qa_smoke` PASS
- `qa_super` PASS
- `brand_gate_check` PASS
- `ip_gate_check` PASS
- `wiring_consistency_check` PASS
- `qa_accessibility` PASS
- `deployment_confidence_check` PASS
- `public_surface_check` PASS

## Remaining last mile
- True live environment execution with real Netlify, Supabase, and Stripe values
- Final browser/device pass on deployed targets
- Final performance/polish sweep once the real environment is live
