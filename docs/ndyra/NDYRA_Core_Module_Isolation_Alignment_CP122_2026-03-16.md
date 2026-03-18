# NDYRA Core Module Isolation Alignment - CP122

## Purpose
CP122 makes the Core host layer stricter about module isolation without pretending module handbacks are already integrated.

## Isolation rules reinforced here
- Core must boot if a module is absent, disabled, or unconfigured.
- Module failures must stay local to the module lane.
- Shared shell, auth, profile authority, and first-run UX remain Core-owned.
- The host layer can disable module exposure through a dedicated kill-switch file.
- Boundary shells stay honest when a module or paused lane is not active.

## What Core added
- `site/assets/data/module_kill_switches.json`
- kill-switch support inside `moduleHost/index.mjs`
- explicit contract stubs for GYM01 / CE01 / CHKIN01
- member Check-In boundary shell at `/app/check-in/`

## Why this matters
Separate chats do not automatically guarantee runtime isolation. Core now carries stronger host-side controls so a module handback can fail without taking down unrelated surfaces.
