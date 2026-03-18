# NDYRA Module Ownership Boundaries

## Core NDYRA app owns
- Member social surfaces
- Challenges, events, trophies, wallet, purchases, marketplace shell
- Shared auth, profile, entitlements, notifications, messaging primitives

## BizGym module owns
- Business check-in operations
- Kiosk and live issue radar
- Gym schedule ops
- Gym-ops settings and Rescue/conversion pass behavior

## Integration rule
NDYRA Core must not duplicate BizGym business logic. It may link to, surface status for, or reserve IA for BizGym, but not fork a second waiver/check-in/schedule engine.

## Current absorbed handoff
BizGym BIZ03 handoff (2026-03-05) is reviewed and stored under docs/ndyra_bizgym and supabase/external_modules/bizgym.
