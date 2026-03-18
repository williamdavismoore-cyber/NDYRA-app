# READ FIRST - NOT FINISHED BUILD

## What this is
This package is the **current BizGym module handoff** for Aelric Architect.

- Product track: **NDYRA Business for Gyms / BizGym**
- Current included build: **BizGym Module v0.3.0**
- Build ID: **2026-03-05_BIZ03**
- Status: **WORK IN PROGRESS / NOT THE FINISHED BUILD**

This package is for **alignment, integration planning, route ownership, schema awareness, and QA review**.
It is **not** the final integration-ready build and should **not** be treated as complete product scope.

## What Aelric Architect should assume
1. **Do not duplicate BizGym logic in NDYRA Core.**
2. **Do not build parallel routes or a second waiver/check-in engine.**
3. **Use the blueprint + handoff docs as the source of truth for ownership boundaries.**
4. **Treat this as a module track** that will keep shipping versioned BizGym builds (BIZ01, BIZ02, BIZ03, ...), not core NDYRA checkpoint packages.

## What is included here
- **Current module build (extracted):** `01_CURRENT_MODULE_BUILD/`
- **Current QA pack (extracted):** `02_QA_PACK/`
- **Blueprint + Architect handoff docs:** `03_BLUEPRINT_AND_HANDOFF/`
- **Supporting docs:** module contract, QA runbook, build status, QA report, assets-needed-next
- **Original package zips:** `05_ORIGINAL_PACKAGES/`

## What is not finished yet
The current build is **not final**. As of BIZ03, the remaining major blocks include:

### v0.1 still open
- Real QR rendering on kiosk
- Geofence / NFC options
- Direct send-text / send-email fix-link automation
- Coach reconcile flow for pending vs present after class

### v0.2 still open
- Waitlists
- Substitutions
- No-show rules
- Recurring templates
- Appointment support
- Coach assignment and roster notes

### Larger roadmap still open
- Billing + wallet
- CRM + growth loops
- Analytics + automation

## Current BizGym ownership boundaries
### NDYRA Core remains authoritative for
- Identity / auth
- Global shell / navigation mount strategy
- Existing waiver system-of-record primitives
- Social, messaging primitives, challenge/event core surfaces

### BizGym owns
- Gym/facility operations
- Biz routes for check-in, schedule, and gym ops settings
- Class access policy (members-only + Rescue behavior)
- Issue Radar (pre-class digest + T+10 escalation)
- Trainer-Zero / kiosk-driven operational flows

## Important behavior rules to preserve
- **Waiver is never bypassed.**
- **Members-only classes block token-only booking by default.**
- **Rescue is a controlled exception path at check-in, not a general booking shortcut.**
- **Server enforcement is authoritative** (RLS / RPC), not UI-only behavior.

## Recommended read order for Architect
1. `00_READ_FIRST/READ_FIRST_NOT_FINISHED_BIZ03.md`
2. `03_BLUEPRINT_AND_HANDOFF/NDYRA_Business_for_Gyms_Blueprint_v0.2_2026-03-04.pdf`
3. `03_BLUEPRINT_AND_HANDOFF/Aelric_Architect_Handoff_BizGym_BIZ03_2026-03-05.pdf`
4. `04_SUPPORTING_DOCS/BIZGYM_MODULE_CONTRACT_v0.3_2026-03-05_BIZ03.md`
5. `04_SUPPORTING_DOCS/BIZGYM_BUILD_STATUS_v0.3_2026-03-05_BIZ03.md`
6. `02_QA_PACK/` and `01_CURRENT_MODULE_BUILD/`

## Deliverables Architect should expect from BizGym going forward
- A **BizGym Module** package
- A separate **BizGym QA Pack** with launch files
- Updated module contract
- Updated QA runbook + QA report
- Updated build status
- Updated assets-needed-next / rebuild ledger

## Final warning
Again: **this is not the finished BizGym build.**
It is the **current BIZ03 working handoff** so Architect can avoid building unnecessary code or paths and can prepare a clean future integration.
