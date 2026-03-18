# NDYRA Live Wiring Execution — CP104

Purpose: make local preview, staging, and production wiring explicit and testable without guessing.

## Local/static preview
1. Copy `site/assets/ndyra.config.example.json` to `site/assets/ndyra.config.json`
2. Replace placeholders:
   - `supabaseUrl`
   - `supabaseAnonKey`
   - `stripePublishableKey`
   - optional `memberPlans`, `businessPlans`, `tokenPacks`
3. Run the local preview server and open `/admin/status/`
4. Confirm the **Local Config** section turns green and placeholders disappear

## Netlify staging / production
Use the blocks in `netlify/env/*.example` and `site/assets/data/deployment_templates.json`.

Minimum required values:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- STRIPE_PUBLISHABLE_KEY
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SIGNING_SECRET
- PRICE_ID_MEMBER_MONTHLY
- PRICE_ID_BIZ_STARTER_MONTHLY
- PRICE_ID_BIZ_STARTER_ANNUAL
- PRICE_ID_BIZ_PRO_MONTHLY
- PRICE_ID_BIZ_PRO_ANNUAL
- PRICE_ID_TOKEN_PACK_100
- PRICE_ID_TOKEN_PACK_250
- PRICE_ID_TOKEN_PACK_500

## Validation order
1. Apply migrations in the order listed in `site/assets/data/live_wiring_manifest.json`
2. Set env vars in Netlify
3. Open `/admin/status/`
4. Confirm:
   - Deployment badge is at least partial
   - Public Config is populated
   - Supabase and Stripe sections are green
5. Run `python tools/wiring_preflight.py`
6. Run `python tools/qa_smoke.py` and `python tools/qa_super.py`
