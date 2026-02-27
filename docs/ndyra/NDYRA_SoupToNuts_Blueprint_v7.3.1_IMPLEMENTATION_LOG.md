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
  - **Demo mode** via `` (for deterministic E2E without Supabase)
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
  - Demo mode: `` (no Supabase required)
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

---

## CP45 (2026-02-24) — IP Guardrails Gate

- Added `IP_GUARDRAILS.md` (repo root) as engineering law before merge.
- Added automated IP scan gate: `npm run qa:ip` (blocks competitor-brand strings in shipped `site/` + blocks shipped audio assets).
- Updated gates runbook to include IP gate, and updated smoke QA to verify law-file presence.
- Removed shipped demo audio asset; demo Signals are now video/text only (aligned with “no AI voice” amendment).
- Updated Service Worker cache version + cache-bust query to current build_id.


## CP46 (2026-02-24_46) — v4.2
- Rebrand hardening: NDYRA posters/theme assets cache-busted against build_id.
- Service Worker present and updated for NDYRA caching strategy (network-first for HTML; strict no-store).
- IP_GUARDRAILS.md added to repo root and treated as merge-law (manual checklist + gate hooks).
- Social Shell + Signals continued polish (NDYRA-native styling; no competitor UI cloning).

## CP47 (2026-02-24_47) — v4.3
- Hardening: Service Worker CACHE_NAME versioned with build_id to prevent stale cache bleed across checkpoints.
- Cache-bust: all poster/theme asset URLs bumped to build_id=2026-02-24_47.
- Serverless: removed any hardcoded legacy HIIT56 domain fallbacks in Stripe portal/session helpers (uses URL/DEPLOY_PRIME_URL; local fallback only).
- QA: qa_super now enforces SW cache name versioning + bans legacy domain strings inside functions.
- Build label fallbacks (site.js) synced to CP47.


---

## CP48 (2026-02-24)

Blueprint / Amendments referenced:
- **Signals + Aftermath Amendment (No AI Voice)** — “Aftermath = NDYRA-native recap; privacy and ownership first”
- **6. Social Core** — must reuse `can_view_post()` for all visibility and avoid permissive RLS.

Changes (UI only; no DB drift in this checkpoint):
- Added **Aftermath post kind rendering** to PostCard:
  - Detects `post.kind === 'aftermath'`
  - Renders NDYRA-native Aftermath overlay (template tag + metric grid + note)
  - **No comparisons / leaderboards / multi-user metrics**
  - Visibility unchanged: still governed by existing `can_view_post()` paths on the backend (no new RLS).
- Seeded demo feed with **2 Aftermath demo posts** so QA can validate layout deterministically.

Anti-drift notes:
- No new routes.
- No new DB tables.
- No new Netlify functions.
- No new third-party media / music / fonts.
- IP Guardrails: Aftermath UI is generic “recap card” (NDYRA-native), no competitor UI cloning.



---

## CP49 (2026-02-24_49) — v4.5

Changes:
- **QA stability hardening (anti-stale UI):**
  - All HTML asset cache-bust params bumped to `build_id=2026-02-24_49`.
  - `site/assets/build.json` and `site.js` build fallbacks synced to CP49.
  - Admin Status page now includes **QA Tools** buttons to clear Service Worker + Cache Storage and reset demo login state.
- **Playwright reliability:** renamed config to `playwright.config.js` so projects are always detected (fixes `--project` not found on some setups).
- **Rebrand cleanup:** removed shipped `Hiit56 |` prefixes from demo video titles, and migrated telemetry/session naming to **NDYRA** (legacy session id preserved via one-way migration).
- **Timer systems intentionally unchanged** in this checkpoint (being built separately).

---

## CP50 (2026-02-24_50) — v4.6

Changes:
- Social Shell polish + QA stability hardening:
  - Runbook clarifications for local QA + E2E runs.
  - Project naming consistency + cache-busting alignment to build_id.
  - No new routes / DB drift in this checkpoint.

Notes:
- Timer systems intentionally remained separate (being built in the Timer blueprint chat).

---

## CP51 (2026-02-24_52) — v4.7

Blueprint sections referenced:
- **3. Non-Gym User Experience (Social-First Shell)** — “For You by default” behavior
- **6. Gym / Club surfaces** — public gym profile surface (route family)

Changes:
- **NDYRA-first entry (QA clarity):**
  - `/` now routes QA to the Social Shell (For You) by default.
  - Previous marketing/preview landing moved to `/preview/` (no content loss).
- **Gym Profile route added (Blueprint-aligned):**
  - New route family: `/gym/:slug` → `/gym/profile/index.html`.
  - `_redirects` and local `tools/static_server.cjs` route map updated + asserted by smoke QA.
  - Added a public gym profile surface with Signals strip + Timer integration hooks (placeholders).
- **Build label visibility inside the Social Shell:**
  - Added a small build “pill” (data-build-label) inside the left nav for For You / Following.
  - Updated E2E smoke to validate the build label from within the Social Shell.
- **Load harness gate (no deps):**
  - Added `tools/load_harness.mjs` + `npm run qa:load`.
  - `qa:all` now includes the load harness as an early regression tripwire.

Notes:
- Timers are still being built separately; CP51 only adds integration points on the public gym surface.
- No competitor UI cloning: gym profile uses NDYRA-native cards + layout.
