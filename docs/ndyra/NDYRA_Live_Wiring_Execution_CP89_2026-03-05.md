# NDYRA Live Wiring Execution Runbook (CP89)

Purpose
- Turn Admin Status into a deploy operator console with copy-ready environment blocks, Stripe product mapping, and deeper billing + marketplace readiness.

What changed in CP89
- Added `site/assets/data/deployment_templates.json` with local, staging, and production env blocks.
- Added repo-side templates in `ops/env/` and `ops/stripe/`.
- Expanded `/api/health` to verify billing + marketplace tables (`purchases`, `token_wallets`, `token_transactions`, `token_topups`, `timer_pack_payloads`).
- Added Admin Status cards for Environment Templates and Stripe Product Matrix.

How to use
1. Open `/admin/status/` on local preview to review env names and product expectations.
2. Copy the staging template block into Netlify staging env vars.
3. Create Stripe products/prices that match the Stripe Product Matrix labels.
4. Apply Supabase migrations in the exact order shown in Migration Order.
5. Reload `/admin/status/` on staging and confirm:
   - Deployment badge is green
   - Billing is Ready
   - Marketplace is Ready
6. Repeat with production template values only after staging checkout + webhook tests pass.

Repo template files
- `ops/env/netlify.local.example`
- `ops/env/netlify.staging.example`
- `ops/env/netlify.production.example`
- `ops/stripe/stripe_product_map.example.json`

Notes
- No new generated art assets shipped in CP89.
- These templates are placeholders and must be filled with real environment values outside the repo.
