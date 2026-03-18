# NDYRA Follow Graph — Members + Gyms (CP108)

## Purpose
Surface the existing follow graph so members can actually curate their Following feed and social graph from the UI.

## Shipped
- New shared helper: `site/assets/js/ndyra/lib/follows.mjs`
- Members directory supports follow/unfollow for people
- Profile supports follow/unfollow when viewing another member
- Gyms supports follow/unfollow for gyms

## Why now
The app already had:
- `follows_users`
- `follows_tenants`
- `get_following_aftermath_feed(...)`

But there was no clear UI for people to *use* that graph. This checkpoint closes that gap.

## Safety / rules
- All writes still go through the canonical follow tables and existing RLS policies.
- No demo/sim behavior added.
- Local preview shows the surfaces; live writes require real auth.
