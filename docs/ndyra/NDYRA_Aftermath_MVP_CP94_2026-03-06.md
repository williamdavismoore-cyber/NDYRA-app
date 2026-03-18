# NDYRA Aftermath MVP — CP95 (2026-03-06)

Checkpoint intent: add a first-class Aftermath member surface that turns workouts, challenges, and event participation into recap cards and IG-story-ready share cards.

## Shipped
- `/app/aftermath/` recap feed
- `/app/aftermath/detail.html?id=...` detail view
- `/app/aftermath/share/?id=...` IG-story-ready share card
- local seed data for QA preview (`site/assets/data/aftermath_seed_public.json`)
- links from App Home + Preview hub
- soft cross-links from Challenges/Events into Aftermath

## Notes
- This checkpoint intentionally uses local seed data so the surface is QA-able without requiring a new Supabase table yet.
- Real persistence + social linkage is the next step (CP95 target).
