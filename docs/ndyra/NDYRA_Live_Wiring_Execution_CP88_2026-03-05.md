# NDYRA Live Wiring Execution Runbook (CP88)

Purpose
- Turn the Admin Status Truth Panel into the single source of truth for staging/prod deployment readiness.
- Confirm that Netlify, Supabase, and Stripe are wired before any live QA sign-off.

What changed in CP88
- Added `site/assets/data/live_wiring_manifest.json` as the static wiring manifest.
- `/api/health` now returns env-matrix booleans, readiness summaries, and DB table checks.
- `/api/public_config` now returns public-safe plan + token-pack price maps.
- `/admin/status/` now renders deployment badge, env matrix, migration order, and a copy-ready checklist.

How to use
1. Deploy the site to Netlify staging.
2. Set env vars listed in the Environment Matrix.
3. Apply Supabase migrations in the exact order shown in Migration Order.
4. Create Stripe products/prices + webhook and copy secrets/price ids to Netlify.
5. Reload `/admin/status/` and confirm:
   - Deployment badge reaches Ready
   - Core wiring = Ready
   - Price IDs = Ready
   - DB wiring = Ready
6. Run local QA gates again before promoting.

Required env groups
- Supabase: URL, anon key, service-role key
- Stripe: publishable key, secret key, webhook signing secret, portal config (optional)
- Price IDs: member, business starter, business pro, token packs
- Telemetry: optional

Expected DB readiness
- `tenants`
- `subscriptions`
- `entitlements`
- `catalog_products`

Notes
- `public_config` stays public-safe only. No secret keys are ever returned.
- If `/api/health` is unavailable locally, the page will fall back to manifest-only guidance.
- This checkpoint adds no new generated art assets.
