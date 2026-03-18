# NDYRA CP103 — Following + Signals Real Surfaces

Date: 2026-03-08
Checkpoint: CP103
Build ID: 2026-03-08_103

## Intent
Close two obvious core-surface drifts in the member app:
- `/app/following/` was still a placeholder
- `/app/signals/` was still a placeholder

This checkpoint makes both surfaces functional in local preview and live mode.

## What changed
- Added `get_following_aftermath_feed(limit, offset)` RPC (security definer)
  - returns visible aftermath recaps from followed members and followed gyms
- Added `get_signals_feed(limit, offset)` RPC (security definer)
  - returns active signals visible to the viewer
- Repaired `get_signal_strip()` drift by removing `pm.public_url` from the payload shape
- Added local preview seed files:
  - `following_seed_public.json`
  - `signals_seed_public.json`
- Added page modules:
  - `site/assets/js/ndyra/pages/following.mjs`
  - `site/assets/js/ndyra/pages/signals.mjs`
- Updated `boot.mjs` to mount the new page modules
- Replaced placeholder HTML for Following and Signals with real page shells
- Added Following + Signals cards to Member App Home and Preview Hub

## Why it matters
These are first-class surfaces in the core NDYRA social loop. Leaving them as placeholders would create obvious drift versus the product direction and confuse QA.

## QA notes
- Local preview uses deterministic seed JSON if Supabase public config is missing
- Live mode requires:
  - working Supabase public config
  - auth for Following
  - active visible signals in posts(kind='signal') for Signals
