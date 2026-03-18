# NDYRA Core Modularization Plan - CP119

## Intent
CP119 prepares NDYRA Core to accept future modules without turning the first-run experience into a wall of features. The goal is twofold:

1. add a clean **module host / registry** layer so Core can accept module surfaces intentionally,
2. protect the user experience with a **plain-language, low-overload entry flow**.

This checkpoint does **not** integrate Timer runtime, does **not** duplicate BizGym runtime, and does **not** resume Check-In.

## QA-first outcome
CP118 was re-QAed from the extracted repo tree before any CP119 work started.

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
- core_module_contract_check
- module_boundary_surface_check
- release_closeout_check

## Why this checkpoint exists
NDYRA now contains enough surfaces that the product can become confusing if everything is presented equally on day one. That is especially risky for:
- older adults,
- first-time digital fitness users,
- users arriving from a gym invite and only trying to do one thing,
- users who do not understand internal module boundaries.

CP119 changes the host architecture so Core can say:
- **start here**,
- **here are the essential next steps**,
- **everything else lives behind More**,
- **separate modules stay clearly labeled**.

## Module-host model added in CP119

### Source of truth
- `site/assets/data/module_host_registry.json`
- `site/assets/js/ndyra/modules/moduleHost/index.mjs`

### What the module host owns
- module slot registration
- plain-language labels + descriptions
- public first-run choices
- member-home essential card ordering
- expanded More-page grouping
- device-side experience defaults (simple/full + comfort mode)
- visibility rules for operator-only or boundary-only surfaces

### What the module host does not own
- Timer runtime
- BizGym runtime
- token ledger truth
- follow graph logic
- profile persistence
- entitlement enforcement

The module host is a **routing and experience governor**, not the business-logic owner for those modules.

## Host slots introduced
1. `public_home_primary`
2. `member_home_primary`
3. `member_more_tools`
4. `member_settings_extensions`
5. `operator_module_truth`
6. `integration_boundaries`

These slots let Core decide where a module is allowed to appear before that module is exposed to members.

## Acceptance rules introduced
Every new module should declare:
- audience
- slot
- owner
- status
- one plain-language label
- one plain-language description
- one primary link

Additional host policy rules:
- external modules stay off the simple member home until intentionally bridged
- operator-only tools stay out of public/member first-run flows
- if a module has multiple tools, simple home gets one primary action and the rest move to More
- first-run copy should avoid internal jargon whenever possible

## First-run experience changes in CP119

### Public home
Public home now presents only three plain-language choices:
- join as a member
- sign in to an existing account
- use the separate gym path

### Member home
Member home now behaves like a calm launcher instead of a module dump.

Simple Home shows only four essentials:
1. Find my gym
2. Messages and alerts
3. My profile and settings
4. My workouts

Everything else is deferred to **More**.

### More page
`/app/more/` becomes the explicit expansion point for:
- community and recap surfaces
- challenges and events
- wallet / shop / purchases
- clearly labeled boundaries

### Device-side comfort settings
Settings now includes local experience controls for:
- Simple Home / Full Home
- Comfort Mode

Comfort Mode increases type size and target sizes on the current device without claiming to be an account-wide preference.

## Corrected ownership remains intact
CP119 keeps the corrected CP118 ownership map:

### Timer system (external module)
Owns:
- video workout library
- saved timer / workout preset bodies
- recent timer sessions
- timer-side profile seam
- timer-local unlock adapter

### User Profiles + Preferences (Core)
Owns:
- viewer profile snapshot assembly
- connected gym preference
- privacy settings
- timezone settings
- profile workout refs and summary state

### Token System (Core)
Owns:
- wallet balance reads
- transaction history
- top-up launch
- receipt reads
- redemption wrappers

## QA guard added in CP119
A new gate validates the module-host + experience shell:
- `tools/module_host_experience_check.py`

It verifies:
- module host registry exists and parses
- required slots exist
- required module entries exist
- public home is wired
- member home is wired
- More page is wired
- settings includes local experience controls
- preview page exposes module-host surfaces
- `package.json` includes `qa:module-host`

## Result
CP119 makes NDYRA safer to grow.

Future modules can be accepted through one host policy instead of being dropped straight onto the user. At the same time, first-run members get a calmer, more readable, more elderly-friendly starting experience.

## Generated graphics
None.
