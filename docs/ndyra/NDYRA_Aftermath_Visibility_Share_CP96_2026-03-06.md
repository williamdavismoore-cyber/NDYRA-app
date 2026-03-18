# NDYRA Aftermath Visibility + Share-to-Feed — CP97 (2026-03-06)

## Summary
- Added visibility-aware viewing for Aftermath entries.
- Added public/follower-safe read functions for detail + feed + story share pages.
- Added share-to-feed plumbing so an owned recap can be turned into a social post atomically.
- Added owner/public feed modes to `/app/aftermath/` using `?u=<user_id>`.
- Fixed a challenge/detail drift bug where the Aftermath link referenced an out-of-scope tenant id.

## Files
- `supabase/migrations/2026-03-06_000002_NDYRA_CP97_Aftermath_Visibility_Share_v9.7.sql`
- `site/assets/js/ndyra/pages/aftermath.mjs`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/js/ndyra/boot.mjs`
- `site/app/aftermath/index.html`

## Notes
- Local QA still falls back to the seed file when Supabase is not configured.
- Public/share visibility is enforced by DB helper functions, not by UI-only checks.
- Social feed rendering remains outside this checkpoint; this adds the share path and leaves feed surfacing to the next social checkpoint.
