# NDYRA QA Runbook — CP112

## Goal
Validate that runtime honesty, billing readiness, webhook readiness, and deployment truth surfaces behave correctly across local preview and live-mode wiring.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 preview_server.py --port 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) Admin Status truth
- Open `/admin/status/`
- Confirm **Config Warnings** renders
- Confirm **Runtime Surface Matrix** renders
- Confirm Local Config status reflects whether `site/assets/ndyra.config.json` still contains placeholders

### 2) Admin Execute truth
- Open `/admin/execute/`
- Confirm execution summary appears
- Confirm runtime surface readiness appears
- Confirm quick links include Status + Wiring + execution JSON files

### 3) Shop / Wallet honesty
- Open `/app/shop/` and `/app/wallet/`
- In preview mode, confirm purchase/top-up CTAs explain missing runtime readiness instead of pretending checkout is live
- If gym scope is missing, confirm CTAs steer you to connect a gym first

### 4) Timer Library entitlement edge case
- Open `/app/library/timers/`
- Confirm owned packs can still be seen
- Confirm import/remix requires either active member plan or premium timer feature unlock, with an honest explanation when unavailable

### 5) Settings timezone guard
- In live mode with a real signed-in user whose `timezone_source` is `manual`, refresh profile bootstrap paths
- Confirm manual timezone is not overwritten by device timezone

## Live-mode checks
If Supabase + Stripe are configured:
- Verify `/api/public_config` returns public-safe values and no placeholder warnings
- Verify `/api/health` reports webhook readiness and `stripe_events` table readiness correctly
- Verify member and business billing pages enable Manage Billing only when portal/runtime state is truly ready

## Expected result
CP112 should make NDYRA feel honest: local preview stays preview, deployed environments only light up when truly wired, and marketplace/billing surfaces stop bluffing when critical runtime requirements are missing.
