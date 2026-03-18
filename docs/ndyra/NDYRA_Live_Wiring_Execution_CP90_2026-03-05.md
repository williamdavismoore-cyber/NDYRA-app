# NDYRA Live Wiring Execution Runbook (CP90)

Purpose
- Move the marketplace member surfaces from placeholder routes into real deployment-ready flows.
- Confirm the static app, Netlify functions, Supabase public config, and Stripe price maps agree with each other.

What changed in CP90
- Added browser-side Supabase client bootstrap driven by `/api/public_config`.
- Wired `/app/shop/`, `/app/wallet/`, `/app/purchases/`, and `/app/library/timers/` into real member surfaces.
- Added a local preview fallback catalog (`shop_seed_public.json`) so Shop still renders structure when Supabase is not configured.
- Aligned `health.js` and `public_config.js` with the shared env helper module.

How to use
1. Apply Supabase migrations through CP85 on staging.
2. Set Netlify staging environment variables using the deployment template blocks from Admin Status.
3. Open `/admin/status/` and confirm:
   - core wiring is green
   - price ids are present
   - billing and marketplace tables are ready
4. Visit `/app/shop/` on staging with a real login and confirm products render from Supabase.
5. Visit `/app/wallet/` and confirm token packs are present only when Stripe price ids are configured.
6. Visit `/app/library/timers/` with an entitled user and confirm owned packs import into `My Workouts`.

Notes
- Local static preview can render Shop using the seed catalog even when Supabase is absent.
- Marketplace purchases still require live Supabase + auth + RPC access.
- No new generated art assets shipped in CP90.
