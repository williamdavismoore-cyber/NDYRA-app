# NDYRA Settings + Privacy Control Center — CP101

Date: 2026-03-07

## Intent
CP101 adds a real member settings surface so the privacy/timezone features already present in the data model are finally controllable from the app.

## Includes
- `/app/settings/`
- DM privacy policy selector
- Trophy visibility selector
- Show online status toggle
- Streak nudge toggle
- Connected gym manual override
- Timezone auto/manual controls using existing RPCs

## Notes
- In local preview / missing Supabase config, the page renders in preview mode and intentionally does not save.
- In live mode, settings write to `privacy_settings` and timezone RPCs.
