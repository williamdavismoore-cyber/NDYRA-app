# NDYRA Buildbook - MemoryPack

**CP118 • Build 2026-03-12_118 • Kit v10.3**

## Checkpoint intent
CP118 corrects the modularization ownership map after reviewing the separate Timer build that was uploaded for reference.

The key correction is:
- the **video workout library is Timer-owned**, not Core-owned
- member-side workout records belong with **user profile + preferences**
- the main wallet/token marketplace remains **NDYRA Core-owned**

The user explicitly said not to integrate Timer yet. So CP118 records the Timer boundary honestly and begins the first real Core-side migration in the correct place: **user profiles + preferences**.

## QA-first status
- CP117 was re-QAed from the actual extracted repo tree before any CP118 build work started.
- A real carried-forward issue surfaced during final closeout QA: `ops/env/live_release_closeout.example.json` still had CP117 identifiers. That was restamped to CP118 and the full gate suite was rerun clean.

## What shipped in CP118
- Removed the incorrect Core-owned `workoutLibrary` module.
- Added `site/assets/js/ndyra/modules/timerBoundary/index.mjs` as the observed boundary contract for the separate Timer system.
- Rebuilt `site/assets/data/core_module_contracts.json` so the first module is now **timer_module_boundary** rather than a fake Core-owned workout library.
- Expanded `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs` to own:
  - profile snapshots
  - connected gym preference
  - privacy writes
  - timezone writes
  - profile-level workout refs
  - migration from the legacy `ndyra:my_workouts` key
- Migrated real consumers onto `userProfilePrefs`:
  - `site/assets/js/ndyra/pages/settings.mjs`
  - `site/assets/js/ndyra/pages/profile.mjs`
  - `site/assets/js/ndyra/pages/myWorkouts.mjs`
- Rebuilt `site/assets/js/ndyra/pages/libraryTimers.mjs` into an honest Timer boundary shell instead of a fake Core-owned timer-pack import surface.
- Updated `/`, `/preview/`, `/app/library/timers/`, and `/app/timer/my-workouts/` so the build now tells the truth about the Timer/Profile split.
- Rewrote `tools/core_module_contract_check.py` so QA now enforces the corrected boundary model.
- Added `docs/ndyra/NDYRA_Core_Modularization_Plan_CP118_2026-03-12.md` and updated the implementation log and index manifest.

## Corrected ownership map

### 1) Timer module boundary
**Path:** `site/assets/js/ndyra/modules/timerBoundary/index.mjs`

**Timer owns**
- video workout library
- saved timer/workout preset bodies
- recent timer sessions
- the profile timer-tab seam
- timer-local perk token adapter

**Core does not own here**
- video library runtime
- timer preset CRUD/runtime
- session history runtime

**Public boundary API**
- `getTimerBoundaryStatus()`
- `listTimerOwnedCapabilities()`
- `listTimerIntegrationInterfaces()`
- `describeProfileTimerSeam()`
- `getTimerBridgeNotice()`

**Current consumer**
- Timer Library page (`/app/library/timers/`)

### 2) User Profiles + Preferences
**Path:** `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs`

**Owns**
- viewer profile snapshot hydration
- profile lookup by id
- connected gym preference
- privacy settings
- timezone settings
- profile workout refs + legacy migration

**Public API**
- `ensureViewerProfileRecord()`
- `getProfileById(profileId)`
- `getViewerProfileSnapshot()`
- `getUserPreferences()`
- `updateConnectedGymPreference(tenantId)`
- `updatePrivacyPreferences(input)`
- `updateTimezonePreference({ mode, timezone })`
- `listWorkoutRefs()`
- `saveWorkoutRef(record, options)`
- `removeWorkoutRef(workoutRefId, options)`
- `subscribeToWorkoutRefs(listener)`
- `migrateLegacyWorkoutLibrary(options)`

**Current consumers**
- Settings page
- Profile page
- My Workouts page

### 3) Token System
**Path:** `site/assets/js/ndyra/modules/tokenSystem/index.mjs`

**Owns**
- wallet scope resolution
- balance + transaction reads
- token top-up option discovery
- top-up checkout launch
- purchase history / receipt reads
- server-approved token redemption entrypoint

**Status in CP118**
- contract remains valid
- consumer migration intentionally deferred so the corrected Timer/Profile ownership work lands cleanly first

## Why this is the right first migration
The user clarified that the original “workout library” ask was really about the **video workout library**, which already belongs to the Timer build. That means the first true Core modularization target is **user profiles + preferences**, because that is where member-side workout refs belong.

CP118 therefore begins with the first Core-owned migration that is actually correct instead of pushing a false ownership model further into the codebase.

## Current completion
### NDYRA Core overall
**100% code-side complete / ~99.9% overall including external credentialed live verification**

### Requested modularization pass
**~50% complete**
- Timer ownership corrected and recorded as a clean boundary
- user profiles + preferences migration started and wired to real consumers
- token system contract still present, with consumer migration next

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS
- wiring_consistency_check PASS
- qa_accessibility PASS
- deployment_confidence_check PASS
- live_verification_check PASS
- public_surface_check PASS
- core_module_contract_check PASS
- module_boundary_surface_check PASS
- release_closeout_check PASS

## Generated graphics
- None

## Next step
The next safe checkpoint is the **token system consumer migration**: move wallet/purchases/shop/account consumers onto `tokenSystem` while leaving Timer still unintegrated and keeping all real ledger truth server-enforced.
