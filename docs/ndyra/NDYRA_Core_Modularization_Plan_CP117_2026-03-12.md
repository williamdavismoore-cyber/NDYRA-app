# NDYRA Core Modularization Plan — CP117

## Intent
CP117 begins the next NDYRA Core track after the CP116 code-side closeout: modularize selected Core-owned domains so future integration work stays clean, testable, and boundary-safe.

This checkpoint does **not** reopen BizGym runtime ownership, does **not** rebuild Timer runtime here, and does **not** resume Check-In. It creates module boundaries inside NDYRA Core and starts with the first real extraction.

## QA-first outcome
CP116 was re-QAed from the extracted repo tree before any CP117 work started.

Passed before build work:
- build_stamp
- qa_smoke
- qa_super
- brand_gate_check
- ip_gate_check
- wiring_consistency_check
- qa_accessibility
- deployment_confidence_check
- live_verification_check
- public_surface_check
- module_boundary_surface_check
- release_closeout_check

## Why modularize now
The current repo already has strong route and runtime boundaries, but three Core-owned areas still benefit from explicit module contracts:
1. Workout Library
2. User Profiles + Preferences
3. Token System

The goal is to let pages call stable interfaces instead of each page owning its own state rules, storage rules, or Supabase query shape.

## Phase plan

### Phase 1 — Contracts + first extraction (this checkpoint)
- Add one machine-readable module contract source: `site/assets/data/core_module_contracts.json`
- Add explicit module entrypoints under `site/assets/js/ndyra/modules/`
- Fully extract the **Workout Library** module and route current library consumers through it
- Scaffold stable facades for **User Profiles + Preferences** and **Token System** without disrupting current pages
- Add a QA guard so the workout-library storage key cannot drift back into page-level code

### Phase 2 — Profiles + preferences consumer migration
- Move settings/profile/account consumers onto `userProfilePrefs`
- Consolidate duplicate profile + privacy queries
- Normalize preference write paths so connected-gym, privacy, and timezone updates flow through one module

### Phase 3 — Token system consumer migration
- Move wallet/shop/purchases/account consumers onto `tokenSystem`
- Consolidate wallet scope, balance, transaction, and redemption helpers
- Preserve the locked marketplace rule that all real debits/credits stay server-side only

## Module boundaries + interfaces

### 1) Workout Library module
**Module path**
- `site/assets/js/ndyra/modules/workoutLibrary/index.mjs`

**Owns**
- My Workouts storage + normalization
- Owned timer-pack lookup for the signed-in member
- Import/remix access evaluation through current entitlement surfaces
- Workout-library change events for cross-page sync

**Does not own**
- Timer execution runtime
- BizGym programming/staff tools
- Catalog pricing or checkout

**Stable interface**
- `listMyWorkouts()`
- `getWorkoutById(workoutId)`
- `upsertWorkout(record, options)`
- `removeWorkout(workoutId, options)`
- `subscribeToWorkoutLibrary(listener)`
- `getWorkoutLibraryAccess()`
- `listOwnedTimerPacks()`
- `importOwnedTimerPack(productId, options)`
- `getWorkoutLibrarySnapshot()`

**CP117 extraction result**
- Timer Library now calls the shared module instead of touching local storage directly
- My Workouts is now a real page driven by the shared module
- Local storage key `ndyra:my_workouts` is now isolated to the module boundary

### 2) User Profiles + Preferences module
**Module path**
- `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs`

**Owns**
- Viewer profile snapshot assembly
- Connected-gym preference read/write
- Privacy settings upserts
- Timezone preference updates

**Does not own**
- Follow graph behavior
- Messaging runtime
- BizGym tenant-staff administration

**Stable interface**
- `ensureViewerProfileRecord()`
- `getProfileById(profileId)`
- `getViewerProfileSnapshot()`
- `getUserPreferences()`
- `updateConnectedGymPreference(tenantId)`
- `updatePrivacyPreferences(input)`
- `updateTimezonePreference({ mode, timezone })`

**CP117 status**
- Interface scaffolded
- Consumer migration intentionally deferred to avoid destabilizing already-clean settings/profile surfaces in the same checkpoint as the first extraction

### 3) Token System module
**Module path**
- `site/assets/js/ndyra/modules/tokenSystem/index.mjs`

**Owns**
- Wallet scope resolution
- Balance + transaction reads
- Token-pack option discovery + checkout launch
- Catalog redemption wrapper around `purchase_with_tokens`
- Purchase/top-up history reads

**Does not own**
- Server-side token ledger writes outside approved RPC/functions
- Stripe webhook fulfillment logic
- BizGym token-rule policy configuration

**Stable interface**
- `getWalletScope()`
- `listTokenPackOptions()`
- `getWalletBalance({ tenantId, user })`
- `listTokenTransactions({ tenantId, limit, user })`
- `startTokenPackCheckout({ packKey, tenantId, email, user })`
- `redeemCatalogProduct({ productId, qty, clientPurchaseId, user })`
- `listPurchaseHistory({ limit, user })`
- `listTokenTopups({ limit, user })`
- `getReceiptBySession(sessionId)`

**CP117 status**
- Interface scaffolded
- Consumer migration deferred to a later checkpoint so wallet/shop/purchases/account behavior stays stable while the first module extraction lands

## Integration notes
- The contracts live in `site/assets/data/core_module_contracts.json` so repo docs, QA, and future migration work point at one truth source.
- The extraction is intentionally **page-safe**: current member-facing routes keep their URLs and user-visible behavior while their data access moves behind modules.
- The token module preserves the marketplace addendum rules: ledger truth remains server-enforced and no client module writes directly to token balances.

## QA guard added in CP117
A new QA gate verifies:
- the module-contract JSON exists and contains the three module entries
- the module entry files exist
- Timer Library and My Workouts import the Workout Library module
- the `ndyra:my_workouts` storage key no longer appears in page-level code outside the module boundary

## Generated graphics
None.
