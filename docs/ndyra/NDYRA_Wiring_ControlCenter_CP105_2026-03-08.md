# NDYRA Wiring Control Center — CP105

Build ID: `2026-03-08_105`
Kit: `v9.6`

## Intent
CP105 adds a dedicated **Admin Wiring Control Center** at `/admin/wiring/` so operators can execute local preview, staging, and production wiring without guessing.

## What changed
- New page: `/admin/wiring/`
- New JS: `site/assets/js/admin_wiring.mjs`
- New data file: `site/assets/data/stripe_webhook_events.json`
- New script: `tools/wiring_consistency_check.py`
- QA now requires the wiring page, webhook matrix, and consistency script

## Why it matters
The Status Truth Panel answers **“is it wired?”**
The Wiring Control Center answers **“how do I wire it correctly?”**

Together they reduce deployment drift and make the local/static preview flow clearer.
