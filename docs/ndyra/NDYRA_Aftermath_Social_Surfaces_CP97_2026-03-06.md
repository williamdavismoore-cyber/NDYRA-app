# NDYRA Aftermath Social Surfaces — CP97

## Summary
CP97 turns Aftermath from a private recap silo into a light social surface inside the Core app.

### Added
- `/app/fyp/` now renders a **community aftermath feed** using `get_aftermath_social_feed(...)` when Supabase is configured.
- `/app/profile/` now renders a **real profile recap surface** for the signed-in member, or a **visibility-safe** recap feed for another member via `?u=<user_id>`.
- Local QA remains easy: both pages fall back to read-only seed data so the surfaces can be reviewed without live wiring.

### DB
- Added `get_aftermath_social_feed(limit, offset)` as a visibility-aware community feed helper.

### UX intent
This is a bridge checkpoint:
- FYP stops being a dead placeholder.
- Profile starts to feel like a living progress surface.
- Aftermath becomes a social proof loop, not just a utility page.
