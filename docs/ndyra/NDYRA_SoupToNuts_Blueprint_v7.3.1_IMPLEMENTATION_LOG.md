# NDYRA Blueprint v7.3.1 — Implementation Log (Anti-Drift)

This file exists **only** to satisfy the anti-drift rule:

> No new routes / DB migrations / Netlify functions without an explicit Blueprint update.

The canonical Blueprint is:

`docs/ndyra/NDYRA_SoupToNuts_Blueprint_v7.3.1_LOCKED_CORRECTED.pdf`

---

## CP29 (2026-02-18)

Blueprint sections referenced:
- **2. Route Map** (member app routes)
- **4. UI Build Spec** (AppShell + PostCard contract)
- **6. Social Core** (FYP feed foundations)

Implemented / scaffolded routes (as defined in blueprint):
- `/app/fyp/` — For You feed (seek pagination + demo mode)
- `/app/post/{id}` — Post detail route (Netlify redirect + page scaffold)
- `/app/following/` — stub scaffold
- `/app/create/` — stub scaffold
- `/app/notifications/` — stub scaffold
- `/app/profile/` — stub scaffold

Notes:
- No new DB tables added.
- Uses existing Social Core migrations (CP27) as the required schema.

---

## CP30 (2026-02-18)

Blueprint sections referenced:
- **6. Social Core — Step 1B** (Following feed)

Changes:
- Implemented `/app/following/` feed using the same PostCard contract as `/app/fyp/`.
- Supports:
  - **Demo mode** via `?src=demo` (for deterministic E2E without Supabase)
  - Real mode requires auth + pulls posts from:
    - `follows_users` (followed people)
    - `follows_tenants` (followed gyms/tenants)
  - Seek pagination (created_at cursor)
  - Encouragement reactions (persisted when authed, disabled in demo)

Non-blueprint fixes (safe, no drift):
- Fixed Supabase public config key mismatch by accepting **camelCase + snake_case** keys.

Notes:
- No new routes added (route existed as scaffold in CP29).
- No DB schema changes.

---

## CP33 (2026-02-20)

Blueprint sections referenced:
- **2. Route Map** (Public + Business portal + booking fork routes)
- **9. Gym Ops System-of-Record** (Waivers + Quick Join requirements)
- **Appendix A** (waiver + SOR constraints)

Implemented (per blueprint route map):
- `/gym/{slug}/join` — Quick Join (account → waiver → payment → confirmation)
  - Demo mode: `?src=demo` (no Supabase required)
  - Real mode wiring:
    - fetch tenant by `slug`
    - load active waiver template
    - capture signature (canvas)
    - upload to Storage bucket `waiver-signatures`
    - record via RPC `sign_current_waiver(tenant_id, signature_storage_path)`

Backend additions (anti-drift approved by v7.3.1):
- **Supabase migration**: `supabase/migrations/2026-02-20_000000_NDYRA_CP33_SystemOfRecord_Waivers_v7.3.1.sql`
  - `tenants.system_of_record` + `tenants.active_waiver_version`
  - `waiver_templates` (immutable)
  - `waiver_signatures` (append-only)
  - `audit_log` (append-only)
  - RPC: `sign_current_waiver()` + helper `has_signed_current_waiver()`
  - Storage bucket + scoped RLS policies for `waiver-signatures`

Netlify Functions:
- `netlify/functions/waiver-template-update.mjs`
  - Staff-only endpoint to version-bump waiver templates and activate via `tenants.active_waiver_version`

QA / Gates:
- Added Playwright E2E: `tests/e2e/gym_join.spec.js` (demo mode)
- Updated `tools/qa_smoke.py` required-page checks to include new route files.
- Updated `package.json` to add `start:qa` and to use `tools/static_server.cjs` for local QA.

Notes:
- Payment step is scaffolded (CP34 wiring will connect Stripe checkout + membership requirements).

---

## CP34 (2026-02-20)

Blueprint sections referenced:
- **9. Gym Ops System-of-Record** (Quick Join end-to-end requirements)
- **2. Route Map** (QA-first entry points)

Changes:
- Quick Join payment step now supports:
  - demo skip (local QA, no Netlify functions)
  - Stripe Checkout redirect when deployed (Netlify Functions)
  - deterministic return URLs back into the join flow
- Stripe checkout session metadata now carries optional NDYRA context (`flow`, `tenant_slug`, `tenant_id`) for reconciliation.

Hardening:
- Updated cache headers + service worker cache-bust (prevents “stuck on old build” / wrong brand shell during QA).
- Updated home page CTA to land directly on NDYRA surfaces used in QA (`/app/fyp/`, `/app/following/`, `/gym/{slug}/join`).

---

## CP35 (2026-02-21)

Blueprint sections referenced:
- **9. Gym Ops System-of-Record** (migration + check-in)
- **Appendix A** (token ledger + check-in overrides)

Changes:
- Added migration + ops backend scaffolding:
  - `migration_batches` (idempotent import tracking)
  - `checkin_overrides` (staff override trail)
  - Token ledger: `token_wallets`, `token_transactions` + server-side credit/spend RPCs
- Added serverless tooling:
  - `netlify/functions/tenant-migration-import.mjs` (CSV import endpoint)
  - `netlify/functions/checkin-override.mjs` (staff override endpoint)

Notes:
- Token booking RPC is added in CP38.

---

## CP36 (2026-02-21)

Blueprint addendum referenced:
- **Signals Module Addendum (CP36 Aelric)**

Changes:
- Implemented Signals as a disciplined Stories surface:
  - Muted by default (tap-to-hear)
  - Strict caps (per-user + per-tenant)
  - Visibility gates reuse `can_view_post()`
- Added QA access scaffolding for viewing protected pages (UI-only; server-side remains enforced).

---

## CP37 (2026-02-21)

Changes:
- QA unlock + stability improvements:
  - Playwright project config cleaned (desktop + mobile)
  - Netlify publish + caching fixes to prevent stale-brand shells
  - Signals limit enforcement updated (DB + UI)

---

## CP38 (2026-02-22)

Blueprint sections referenced:
- **Appendix A — Booking fork + tokens**
- **13. Social Core Scaling** (comment throttle + Following feed RPC + index manifest)

Backend (Supabase):
- New migration: `supabase/migrations/2026-02-22_000000_NDYRA_CP38_Booking_Scale_v7.3.1.sql`
  - `tenants` kill switches:
    - `kill_switch_disable_booking`
    - `kill_switch_disable_checkin`
    - `kill_switch_disable_migration_commit`
  - `membership_status` enum + `gym_memberships` table (RLS enabled)
  - `class_types`, `class_sessions`, `class_bookings` (RLS enabled)
  - `spend_tokens()` signature aligned to Blueprint v7.3.1
  - Canonical booking RPC: `book_class_with_tokens(p_class_session_id uuid)`
  - Scaling prereqs:
    - `can_comment_now(post_id)` helper + comment insert policy wiring
    - `get_following_feed(limit, cursor)` RPC (SECURITY INVOKER)
    - index manifest indexes (stable pagination + stats)

Serverless:
- `checkin-override.mjs` updated to respect:
  - `tenants.system_of_record` (blocks when external)
  - `tenants.kill_switch_disable_checkin`

Frontend:
- `/app/book/class/:class_session_id` upgraded to show Smart Booking Fork eligibility (demo mode via query params).

QA:
- Added Playwright E2E: `tests/e2e/book_class_token_fork.spec.js` (demo deterministic).
- Added Supabase gate: `supabase/gates/NDYRA_CP38_AntiDrift_Audit_v9.sql`
- Updated `docs/ndyra/GATES_RUNBOOK.md` to reference latest gates.

---

## CP39 (2026-02-22)

Blueprint sections referenced:
- **3. Non-Gym User Experience (Social-First Shell)**
- **Signals Addendum (CP36)**

Changes:
- Introduced the NDYRA “social shell” layout for non-gym users:
  - For You + Following start pages
  - Left rail navigation (desktop) + bottom nav (mobile)
  - Signals strip at the top of feeds (muted by default)
  - Right rail placeholders for social context (suggested gyms, trending)

Notes:
- This is UI-first and demo-friendly; all real visibility continues to reuse `can_view_post()`.

---

## CP40 (2026-02-22)

Changes:
- **Brand purge / QA clarity:** removed HIIT56 hero imagery from the NDYRA QA landing surface.
  - Replaced `Desktop Poster.webp` + `Mobile Poster.webp` with NDYRA-branded posters.
  - Updated homepage hero to use posters instead of legacy mp4 hero videos.
  - Added cache-busting query params to posters to reduce stale-asset confusion on deploy previews.
- **Theme alignment:** updated accent palette to NDYRA neon-red so legacy surfaces don’t read as HIIT56.
- **QA smoke hardening:** tightened checks to assert the new accent color and keep parsing consistent.


---

## CP41 (2026-02-22)

Changes:
- **Super QA pass (no drift):** tightened QA stability and reduced “stale build” confusion.
  - Build stamp + cache-busting hardened (build.json read + safe parsing).
  - Netlify publish is explicitly `site/`.
  - Added “Full Repo Replace” deliverable packaging (replaces Netlify drop zip).

Notes:
- This checkpoint is operational hardening only; no new product patterns.

---

## CP42 (2026-02-22)

Changes:
- **Quick Join routing fixed (critical):**
  - Netlify rewrite corrected: `/gym/*/join` now serves `/gym/join/index.html` (not `/join.html`).
  - Local QA static server route map corrected to match Blueprint: `/gym/:slug/join` → `/gym/join/index.html`.
- **Cache busting bumped:** service worker cache version advanced to prevent any remaining HIIT56 asset bleed-through.
- **Anti-drift QA guardrails:** `tools/qa_smoke.py` now asserts both the `_redirects` rule and the static server route map so this can’t regress silently.

