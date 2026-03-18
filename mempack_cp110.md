# NDYRA Buildbook — MemoryPack

**CP110 • Build 2026-03-09_110 • Kit v10.1**

## Checkpoint intent
CP110 is a messenger-style polish checkpoint. It surfaces unread activity in the app-wide chrome so users do not need to dive into Member App Home just to feel social momentum.

## What changed (high impact)
- Added a shared unread-count helper for notifications + inbox state
- Refactored Member App Home to use the helper instead of bespoke count logic
- Added app-wide **Inbox** and **Notifications** quick links with unread badges to `/app/*` header nav
- Live counts come from Supabase when configured; local preview falls back to deterministic seed counts

## Files added
- `site/assets/js/ndyra/lib/unreadCounts.mjs`
- `docs/ndyra/NDYRA_App_Wide_Unread_Badges_CP110_2026-03-09.md`

## Files changed
- `site/assets/js/site.js`
- `site/assets/js/ndyra/pages/appHome.mjs`
- `site/assets/build.json`
- `site/sw.js`
- `docs/ndyra/INDEX_MANIFEST.md`
- `docs/ndyra/NDYRA_SoupToNuts_Blueprint_v7.3.1_IMPLEMENTATION_LOG.md`

## QA outcome
All automated gates passed:
- build_stamp
- qa_smoke
- qa_super
- brand_gate_check
- ip_gate_check

## Build status
Estimated overall build completion: **~95% complete / ~5% remaining**.

## Generated graphics
None this checkpoint.
