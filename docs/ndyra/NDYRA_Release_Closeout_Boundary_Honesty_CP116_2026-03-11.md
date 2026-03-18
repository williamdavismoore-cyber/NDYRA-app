# NDYRA Release Closeout + Boundary Honesty — CP116

## Intent
CP116 finishes the code-side NDYRA Core build without pretending the credentialed live deployment pass already happened. The goal is to close the remaining repo-level rough edges: make the last boundary routes honest, add a deterministic release-closeout packet for operators, and keep admin execution aligned to the blueprint, the marketplace addendum, and module-ownership rules.

## What changed
- Added `site/assets/data/release_closeout_packet.json` as the final operator-facing evidence checklist for live deployment and announcement readiness.
- Added `ops/env/live_release_closeout.example.json` as a fillable copy for capturing deployed URLs, build identity, billing/entitlement verification results, browser/device evidence, performance notes, and the final release decision.
- Upgraded `/admin/execute/` so it now shows the release closeout packet next to the deployment confidence checklist, live verification matrix, runtime surfaces, blockers, and env blocks.
- Added `tools/release_closeout_check.py` and `tools/module_boundary_surface_check.py`, then extended `qa:all` so the closeout packet and the business boundary shells cannot silently regress.
- Added `site/assets/data/biz_boundary_surfaces.json` plus `site/assets/js/ndyra/pages/bizBoundary.mjs` to drive the remaining `/biz/*` boundary pages from one explicit source of truth.
- Rebuilt the remaining business boundary routes (check-in, schedule, settings, migration, gym timer, shop, timer packs, moves, and move detail) into honest handoff shells instead of raw placeholder copy.
- Refreshed `/`, `/preview/`, admin home, and live-execution steps so the current checkpoint story matches the actual repo state.

## Why it matters
The repo now stops in the right places and explains why:
- NDYRA Core keeps acquisition, billing truth, entitlements, admin wiring, and member/public surfaces.
- BizGym still owns gym-ops runtime.
- Timer runtime still stays separate.
- Check-In remains paused here.

At the same time, `/admin/execute/` no longer ends at “runtime looks ready.” It now tells operators exactly what evidence must still be captured before any live announcement.

## Boundaries respected
- No BizGym runtime logic was duplicated into NDYRA Core.
- No Timer runtime engine or authoring runtime was duplicated into NDYRA Core.
- Check-In remains paused; only boundary shells were polished.

## QA
- QA-first rule honored: CP115 was re-verified from the extracted repo tree before CP116 work began.
- `build_stamp` PASS
- `qa_smoke` PASS
- `qa_super` PASS
- `brand_gate_check` PASS
- `ip_gate_check` PASS
- `wiring_consistency_check` PASS
- `qa_accessibility` PASS
- `deployment_confidence_check` PASS
- `live_verification_check` PASS
- `public_surface_check` PASS
- `module_boundary_surface_check` PASS
- `release_closeout_check` PASS

## Remaining external-only work
- Apply the CP115 migration on the real Supabase project if not already present.
- Set real Netlify, Supabase, and Stripe values.
- Run the live verification matrix on the deployed target.
- Fill the release closeout packet with real evidence and make the final announce/no-announce decision.

