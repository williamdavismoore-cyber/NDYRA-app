# NDYRA Core Modularization Plan — CP118

## Intent
CP118 corrects the CP117 modularization assumption after reviewing the separate Timer build. The video workout library is **Timer-owned**, not Core-owned. NDYRA Core should only keep the boundary contract for that system and move member-side workout records into the **user profile + preferences** module.

This checkpoint does **not** integrate Timer runtime, does **not** duplicate BizGym runtime, and does **not** resume Check-In.

## QA-first outcome
CP117 was re-QAed from the extracted repo tree before any CP118 work started.

Passed before build work:
- build_stamp
- qa_smoke
- core_module_contract_check
- module_boundary_surface_check

## Corrected ownership map
1. **Timer system (external module)** owns:
   - video workout library
   - saved timer/workout preset bodies
   - recent timer sessions
   - the profile timer-tab seam
   - timer-local perk token adapter

2. **User Profiles + Preferences (NDYRA Core)** own:
   - viewer profile snapshots
   - connected gym preference
   - privacy settings
   - timezone settings
   - profile-level workout refs + summaries

3. **Token System (NDYRA Core)** owns:
   - wallet balance checks
   - token transactions
   - top-ups
   - receipts
   - token redemptions through approved server flows

## Phase plan

### Phase 1 — Correct the boundary contract (this checkpoint)
- Remove the incorrect Core-owned workout-library module contract
- Replace it with a Timer boundary module that records the observed Timer seams without integrating them
- Stop the Timer Library page from pretending Core owns timer-pack import/runtime behavior

### Phase 2 — Begin the real first migration (this checkpoint)
- Move profile/settings/my-workouts consumers onto `userProfilePrefs`
- Add profile-level workout-ref storage + legacy migration from the old `ndyra:my_workouts` key
- Keep the actual timer preset bodies out of Core

### Phase 3 — Token consumer migration (next)
- Move wallet/purchases/shop/account consumers onto `tokenSystem`
- Keep ledger truth server-enforced only

## Module boundaries + interfaces

### 1) Timer module boundary
**Module path**
- `site/assets/js/ndyra/modules/timerBoundary/index.mjs`

**Owner**
- Timer system (external module)

**Stable interface**
- `getTimerBoundaryStatus()`
- `listTimerOwnedCapabilities()`
- `listTimerIntegrationInterfaces()`
- `describeProfileTimerSeam()`
- `getTimerBridgeNotice()`

**CP118 result**
- Timer Library in Core is now an honest boundary shell
- The Timer build is recorded as observed-only, not integrated
- No Timer runtime code was merged into NDYRA Core

### 2) User Profiles + Preferences
**Module path**
- `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs`

**Stable interface additions in CP118**
- `listWorkoutRefs()`
- `saveWorkoutRef(record, options)`
- `removeWorkoutRef(workoutRefId, options)`
- `subscribeToWorkoutRefs(listener)`
- `migrateLegacyWorkoutLibrary(options)`

**CP118 result**
- Settings now saves through the module instead of page-level writes
- Profile now reads its own profile snapshot through the module
- My Workouts now reads profile-level workout refs instead of a Core-owned timer library
- Legacy `ndyra:my_workouts` records migrate into profile-owned refs

### 3) Token System
**Module path**
- `site/assets/js/ndyra/modules/tokenSystem/index.mjs`

**CP118 status**
- Contract remains valid
- Consumer migration intentionally deferred to the next checkpoint so the corrected Timer/Profile ownership change lands cleanly first

## QA guard added in CP118
The core-module contract check now verifies:
- the Timer boundary module exists
- the legacy Core workout-library module is gone
- Timer Library imports the Timer boundary module
- My Workouts, Settings, and Profile import the user-profile-prefs module
- workout storage keys are isolated to the profile module

## Generated graphics
None.
