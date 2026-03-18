# NDYRA Live Wiring Truth Panel Runbook (CP87)

Purpose:
- Give the deployment operator a single place to verify whether Netlify, Supabase, Stripe, and telemetry are wired correctly.
- Avoid "looks deployed but billing is dead" drift.

Routes:
- `/admin/status/`
- `/api/health`
- `/api/public_config`

Expected behavior:
- On local static preview, `/api/*` cards should warn that functions are unavailable.
- On deployed Netlify, `/api/health` should show booleans for Stripe, Supabase, DB table presence, and price IDs.
- `/api/public_config` should show safe public values only.

Deployment checklist:
1. Set Netlify env vars for Supabase and Stripe.
2. Apply Supabase migrations in order.
3. Register Stripe webhook endpoint.
4. Load `/admin/status/` and confirm readiness cards are green.
5. Run QA suite before promoting.
