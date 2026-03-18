# BizGym Module Contract

**Version:** 0.3.0  
**Build:** 2026-03-05_BIZ03

## Purpose
BizGym remains an **isolated NDYRA Business module** for gyms and fitness facilities. This package is meant to be integrated later into the main NDYRA app through Aelric Architect.

## Routes
### Business
- `/biz/` - module home
- `/biz/check-in/` - staff readiness / override console
- `/biz/check-in/kiosk/` - Front Desk Mode / rotating code kiosk
- `/biz/check-in/live/` - Issue Radar roster + digest + T+10 escalation
- `/biz/schedule/` - Schedule Ops board (create, view, cancel, jump to kiosk/live)
- `/biz/settings/` - Gym Ops settings (Rescue + conversion pass + locations)

### Member
- `/app/check-in/` - self check-in using code / deep link

### QA / Auth
- `/auth/qa.html` - localhost-only UI preview role switcher
- `/auth/login.html` - real Supabase login
- `/auth/signup.html` - real Supabase signup

## Supabase migrations shipped in this module
- `2026-03-04_000000_NDYRA_BIZGYM_Checkin_Core_v0.1.sql`
- `2026-03-04_000001_NDYRA_BIZGYM_Overrides_RPC_v0.2.sql`
- `2026-03-05_000002_NDYRA_BIZGYM_Schedule_And_Digest_v0.3.sql`

## Core RPCs used by the module
### Existing / required from prior BizGym builds
- `create_gym_location(...)`
- `set_gym_access_settings(...)`
- `get_current_checkin_code(...)`
- `authorize_class_access(...)`
- `check_in_with_code(...)`
- `get_checkin_roster(...)`
- `create_checkin_override(...)`

### Added in BIZ03
- `create_biz_class_session(...)`
- `cancel_biz_class_session(...)`
- `get_issue_radar_digest(...)`

## Notes on authority
- Waiver remains a **hard server-side gate**.
- Rescue and override never bypass waiver.
- All BizGym decisions remain tenant-scoped and server-authoritative.
