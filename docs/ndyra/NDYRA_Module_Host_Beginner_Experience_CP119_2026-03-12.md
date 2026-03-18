# NDYRA Module Host + Beginner Experience - CP119

## Summary
CP119 introduces a module-host registry and rewrites the entry experience so NDYRA can grow without overwhelming users.

## Shipped surfaces
- plain-language public home
- simplified member home
- `/app/more/` expanded toolbox page
- device-side Simple Home / Full Home toggle
- device-side Comfort Mode toggle
- context-aware shell navigation
- QA gate for module-host drift

## UX principles enforced
- one next step per card
- plain language before product language
- More page for expansion, not the home screen
- separate modules stay explicitly labeled
- admin and business controls never leak into public/member first-run flows

## Audience rule
The product should remain understandable for a first-time member with low technical confidence. If a surface requires explanation, it should probably live under More or stay operator-only.

## Module-readiness rule
A new module is not eligible for member-first exposure until it has:
- a slot
- a primary action
- a plain-language label
- a plain-language description
- a status
- an owner
- a visible boundary decision

## Notes
This checkpoint intentionally improves the shell and host layer only. It does not merge Timer or BizGym runtime code.
