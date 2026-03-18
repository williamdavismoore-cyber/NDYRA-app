# NDYRA Notifications MVP — CP98 (2026-03-06)

## Intent
Add a real member-facing Notifications surface so NDYRA has a single place for badge unlocks, purchases, event/challenge updates, and social activity.

## What shipped
- New route: `/app/notifications/`
- Seed fallback for local QA: `site/assets/data/notifications_seed_public.json`
- Live Supabase query against `public.notifications` when configured + signed in
- Mark one read / mark all read actions
- Safer routing by notification type/entity:
  - event -> `/app/events/`
  - challenge -> `/app/challenges/`
  - badge -> `/app/profile/?tab=trophies`
  - purchase/wallet -> `/app/purchases/`
  - aftermath -> `/app/aftermath/detail.html?id=...`
  - message -> `/app/inbox/`
- Added reserved Inbox route: `/app/inbox/`
- Added App Home + Preview Hub links to Notifications + Inbox

## Notes
- Local preview shows seed data when Supabase is not configured.
- Live mode requires Auth and reads only the signed-in member's notifications.
- No new graphics were generated in this checkpoint.
