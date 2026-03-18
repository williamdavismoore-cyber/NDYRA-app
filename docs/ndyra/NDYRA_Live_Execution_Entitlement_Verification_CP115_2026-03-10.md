# NDYRA Live Execution + Entitlement Verification — CP115

## Intent
CP115 closes the last code-side gap between a believable preview and a trustworthy live environment execution pass.

## What changed
- Tightened public config truth so price-matrix readiness is only considered complete when the full exposed member, business, and token pack matrix is actually wired.
- Added a live verification matrix JSON and surfaced it on `/admin/execute/` so the final Stripe/Supabase/Netlify pass has explicit runtime-gated steps.
- Added a CP115 migration to extend `public.entitlements` with lifecycle columns expected by the client entitlement state helpers.
- Hardened `stripe_webhook.js` so plan swaps deactivate sibling plan entitlements for the same subject family instead of leaving multiple active plans behind.
- Added `live_verification_check.py` and folded it into the checkpoint QA path.

## Why it matters
The remaining work is now truly external:
- deploy real env values
- run live checkout / webhook / portal verification
- finish the final device/browser/perf pass on the deployed target

The repo itself now carries the code-side enforcement and the concrete live verification script for that finish line.
