# CP86 BizGym Handoff Absorption

This checkpoint absorbs the BIZ03 BizGym handoff into the main NDYRA buildbook without merging the module code directly into the Core app runtime.

## Decisions
- BizGym remains a separate module track.
- Core build preserves route placeholders and admin visibility only.
- BizGym migrations are staged under supabase/external_modules/bizgym for operator awareness.
- Future integration must happen via explicit route ownership and shared auth/entitlement boundaries.

## Operator note
Use the BizGym QA pack for module QA. Use NDYRA Core QA for main app QA. Do not mix packages.
