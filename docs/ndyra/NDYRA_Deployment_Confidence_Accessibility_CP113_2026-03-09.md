# NDYRA Deployment Confidence + Accessibility Hardening — CP113

## Intent
CP113 continues directly from the verified CP112 tree. The goal is not to pretend live wiring happened without real environment values. The goal is to make deployed readiness, checkout safety, entitlement timing, and shared shell accessibility more honest and harder to regress.

## What changed
- Rebuilt `publicConfig.mjs` preview-fallback behavior so deployed hosts no longer silently use local preview config when `/api/public_config` is unavailable.
- Expanded `runtimeReady.mjs` with explicit API-config, deployed-config, execution-ready, and preview-fallback truth.
- Added `deployment_confidence_checklist.json` as a machine-readable deployment readiness checklist for admin execution surfaces.
- Upgraded `/admin/execute/` to show execution confidence and live blockers alongside runtime surfaces and actions.
- Hardened `stripe_create_checkout_session.js` against placeholder secrets, placeholder price IDs, weak business tenant resolution, and unsafe success/cancel handling.
- Hardened `stripe_create_portal_session.js` against placeholder secrets, placeholder portal config, and off-origin return URLs.
- Centralized entitlement active-state evaluation in `entitlementState.mjs` so future-start, grace, and revocation metadata are handled consistently.
- Tightened shell accessibility across the shared member/admin/auth scaffolding: language metadata, skip links, main landmarks, nav labeling, focus-visible support, and reduced-motion support.
- Added `qa_accessibility.py` and `deployment_confidence_check.py`, and extended `qa:all` so those gates become part of the normal bundle.

## Why it matters
CP113 removes a few remaining ways the build could look more production-ready than it really is:
- deployed builds stop pretending local preview config is an acceptable fallback
- business billing/checkout flows fail closed when tenant identity or real billing values are missing
- admin truth surfaces can explain what is still blocking live execution
- entitlement timing rules are shared instead of duplicated
- shell accessibility is no longer left to best effort on individual pages

## Boundaries respected
- No BizGym runtime logic was duplicated into NDYRA Core.
- No Timer module logic was duplicated beyond the existing Core integrations and entitlements.
- Check-In remains paused; only existing boundary routes/stubs remain present.

## QA
- QA-first rule honored: CP112 was re-verified before CP113 work continued.
- `build_stamp` PASS
- `qa_smoke` PASS
- `qa_super` PASS
- `brand_gate_check` PASS
- `ip_gate_check` PASS
- `wiring_consistency_check` PASS
- `qa_accessibility` PASS
- `deployment_confidence_check` PASS

## Remaining last mile
- True live environment execution with real Netlify, Supabase, and Stripe values
- Final browser-device pass on real deployment targets
- Final performance/polish sweep once live values are present
