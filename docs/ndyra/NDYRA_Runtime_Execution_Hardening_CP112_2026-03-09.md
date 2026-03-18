# NDYRA Runtime Execution + Entitlement Hardening — CP112

## Intent
CP112 is the final hardening checkpoint before true live environment execution. It tightens runtime honesty, deployment truth surfaces, webhook readiness, and the last marketplace entitlement edge cases so NDYRA stops pretending a half-wired environment is production-ready.

## What changed
- Rebuilt public config normalization so placeholder values are detected explicitly instead of reading as "present enough"
- Added a structured runtime surface matrix to describe what each billing/marketplace/admin surface actually requires
- Expanded runtime readiness evaluation to include billing, marketplace, webhook, local-config, and price-matrix truth
- Hardened `/api/public_config` so deployed environments no longer silently fall back to local placeholder config
- Hardened `/api/health` with placeholder-aware env checks and an explicit `stripe_events` table readiness check
- Expanded `stripe_webhook.js` to refresh subscription mirrors on invoice and checkout events that matter for billing truth
- Fixed a real timezone drift bug so manual timezone choice is not overwritten by device sync during profile bootstrap
- Tightened entitlement logic so timer import/remix follows plan-or-feature-unlock rules rather than plan-only assumptions
- Hardened Shop and Wallet purchase/top-up CTAs so they fail honestly when gym scope, webhook readiness, or price IDs are missing
- Upgraded `/admin/status/` and `/admin/execute/` so config warnings and runtime surface readiness are visible in one place
- Tightened QA so runtime surface matrix + execution truth sections cannot silently drift later

## Why it matters
CP112 is not about new cosmetic surface area. It is about making the current product trustworthy:
- local preview behaves like local preview
- staging/prod only light up when truly wired
- billing and marketplace surfaces stop lying when critical config is missing
- admin truth panels become the real deployment source of truth

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS
- wiring_consistency_check PASS
