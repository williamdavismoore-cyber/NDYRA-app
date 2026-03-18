# NDYRA Marketplace Member Surfaces - CP90

Summary
- Wired real member-facing marketplace surfaces into the core app:
  - `/app/shop/`
  - `/app/wallet/`
  - `/app/purchases/`
  - `/app/library/timers/`
- Added browser-side Supabase client bootstrap using `/api/public_config`.
- Added shared member helpers: `utils.mjs`, `prefs.mjs`, and real entitlement helpers.
- Added a static fallback seed catalog for local preview when Supabase is not configured.

Notes
- No new graphics were generated in CP90.
- This checkpoint is focused on making the Token Marketplace addendum real in the member app without creating duplicate business runtime logic.
