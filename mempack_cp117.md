# NDYRA Buildbook - MemoryPack

**CP117 • Build 2026-03-12_117 • Kit v10.3**

## Checkpoint intent
CP117 starts the post-closeout modularization pass for NDYRA Core. The goal is to carve out stable internal modules without disrupting the already-finished member app, marketplace, admin truth surfaces, or the release-closeout posture established in CP116.

The user asked for three areas to be modularized:
1. workout library
2. user profiles and preferences
3. token system

CP117 plans all three, then begins with the first one for real by extracting the workout library into a standalone module and wiring the main app to call that module.

## QA-first status
- CP116 was re-QAed from the actual extracted repo tree before any CP117 work started.
- The full automated gate suite was rerun on the CP117 working tree after the modularization work landed.
- A new regression gate, `core_module_contract_check.py`, was added so module boundaries and consumer wiring cannot silently drift.

## What shipped in CP117
- Added `site/assets/data/core_module_contracts.json` as the source of truth for the three requested modules and their public interfaces.
- Extracted the workout library into `site/assets/js/ndyra/modules/workoutLibrary/index.mjs` with a clean API for reading, writing, importing, and subscribing to member workout changes.
- Repointed real consumers to the workout-library module:
  - `site/assets/js/ndyra/pages/libraryTimers.mjs`
  - `site/assets/js/ndyra/pages/myWorkouts.mjs`
  - `site/app/timer/my-workouts/index.html`
- Added `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs` as the stable interface for profile snapshots and preference writes.
- Added `site/assets/js/ndyra/modules/tokenSystem/index.mjs` as the stable interface for wallet balance reads, transaction history, top-up checkout starts, and catalog redemption entrypoints.
- Added `docs/ndyra/NDYRA_Core_Modularization_Plan_CP117_2026-03-12.md` and updated the implementation log + manifest so the new architecture plan is recorded inside the buildbook.
- Folded the new module-contract gate into `qa:all`.
- Restamped current build surfaces to CP117 / `2026-03-12_117`.

## Module boundaries and interfaces

### 1) Workout Library module
**Path:** `site/assets/js/ndyra/modules/workoutLibrary/index.mjs`

**Owns**
- member-side workout library records
- local persistence for saved workouts
- timer-pack import translation into workout records
- cross-page workout-library change notifications

**Does not own**
- timer runtime engine
- BizGym runtime
- billing or checkout logic
- server-side entitlement truth

**Public API**
- `listMyWorkouts()`
- `getWorkoutById(id)`
- `upsertWorkout(workout)`
- `removeWorkout(id)`
- `subscribeToWorkoutLibrary(listener)`
- `getWorkoutLibraryAccess()`
- `listOwnedTimerPacks(client)`
- `buildWorkoutFromPack(pack, payload)`
- `importOwnedTimerPack(client, packId)`
- `getWorkoutLibrarySnapshot(client)`
- `countWorkoutRounds(workout)`
- `countWorkoutSteps(workout)`

**Current consumers**
- Timer Library page
- My Workouts page

### 2) User Profiles + Preferences module
**Path:** `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs`

**Owns**
- viewer profile snapshot hydration
- profile-by-id lookup wrapper
- preference reads and writes for connected gym, privacy, and timezone
- creation/ensure flow for the viewer profile record

**Does not own**
- auth session lifecycle
- inbox, follow graph, aftermath, or events runtime logic
- BizGym member operations

**Public API**
- `ensureViewerProfileRecord(client)`
- `getProfileById(client, profileId)`
- `getViewerProfileSnapshot(client)`
- `getUserPreferences()`
- `updateConnectedGymPreference(gymId)`
- `updatePrivacyPreferences(patch)`
- `updateTimezonePreference(timezone, mode)`

**Current status**
- interface scaffolded and ready for consumer migration in the next step

### 3) Token System module
**Path:** `site/assets/js/ndyra/modules/tokenSystem/index.mjs`

**Owns**
- wallet balance read model
- transaction history read model
- token top-up product lookup
- top-up checkout start entrypoint
- catalog redemption entrypoint
- purchase history / receipt convenience reads

**Does not own**
- server-side ledger enforcement
- Stripe webhook truth
- entitlement grant logic outside the trusted server path
- BizGym billing runtime

**Public API**
- `getWalletScope(client)`
- `listTokenPackOptions(client)`
- `getWalletBalance(client)`
- `listTokenTransactions(client, options)`
- `startTokenPackCheckout(client, productSlug, options)`
- `redeemCatalogProduct(client, productSlug, quantity)`
- `listPurchaseHistory(client, options)`
- `listTokenTopups(client, options)`
- `getReceiptBySession(client, sessionId)`

**Current status**
- interface scaffolded and ready for consumer migration in the next step

## Why this does not disrupt the main build
- The existing NDYRA Core runtime remains intact; CP117 wraps and extracts rather than rewrites the product in place.
- The workout library was moved first because it has clear boundaries, low blast radius, and visible user value.
- Profiles/preferences and tokens were given stable façades first so later migrations can happen incrementally without changing the server-trusted data model.
- Token trust remains aligned to the marketplace addendum: balances, debits, grants, and redemptions still depend on server-side truth. The new token module is an interface layer, not a new authority.
- BizGym runtime logic was not duplicated.
- Timer runtime logic was not duplicated.
- Check-In remains paused.

## Current completion
### NDYRA Core overall
**100% code-side complete / ~99.9% overall including external credentialed live verification**

### Requested modularization pass
**Phase 1 complete / overall modularization request partially complete**
- workout library: extracted and wired
- user profiles + preferences: boundaries defined, stable interface scaffolded
- token system: boundaries defined, stable interface scaffolded

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
The next safe migration step is the user profiles + preferences module. That will move the current settings/profile preference consumers onto `userProfilePrefs` while preserving the existing auth, social, and admin surfaces.
