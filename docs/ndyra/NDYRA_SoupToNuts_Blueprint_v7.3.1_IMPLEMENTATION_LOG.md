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

---

## CP56 (2026-02-27_56) — v4.8

Amendment referenced:
- **UI Emulation + Constellation Rating (v1)**

Changes:
- **Constellation Rating (DB + RLS):**
  - Replaced legacy `gym_ratings` schema with amendment-locked model (`overall`, `categories` jsonb, optional `note`, `status`).
  - Added `gym_rating_history` (immutable snapshots on insert/update).
  - Added `gym_rating_summary` (public-safe aggregates: `overall_avg`, `category_avgs`, `rating_count`).
  - Added `tenants.kill_switch_disable_rating_prompts`.
  - Added verified-only gate `can_rate_tenant(tenant_id)` (last 60 days) + anonymized staff feedback RPC `get_gym_rating_feedback(tenant_id, limit)`.
  - Enforced 30-day update limit + moderation status-only writes via triggers (and `audit_log` entry on moderation status change).

- **Constellation Rating (UI):**
  - Updated `/app/gyms/` directory + `/gym/profile/` public profile to read `overall_avg` + `category_avgs` from `gym_rating_summary`.
  - Added a member-only Constellation rating modal on the public gym profile (sign-in required; verified gate enforced).

- **Gesture Law:**
  - Feed cards now honor:
    - Single tap: open post detail
    - Double tap: react (default `fire`)
    - Tap-and-hold: reveal Aftermath overlay (while held)

- **Operational:**
  - Synced service worker cache stamp with `build_id` to prevent stale styling/branding during QA.

---

## CP57 — Connected Gym + Active Now + Members Directory + Biz Controls (2026-02-27_57)

### What shipped
- Persisted **Connected Gym** to DB: `privacy_settings.connected_tenant_id` (+ `connected_updated_at`) with helper RPC `set_connected_tenant()`.
- Implemented **Active Now** (presence) in the right rail using Supabase Realtime presence, scoped to Connected Gym and respecting `privacy_settings.show_online_status`.
- Implemented **Members Directory** (Connected Gym scoped) via RLS-safe RPC `get_tenant_member_directory()` and added follow/unfollow controls.
- Added **Constellation trend** RPC `get_gym_rating_trend()` for staff/admin dashboards.
- Added **Biz Settings kill switch** RPC `set_tenant_disable_rating_prompts()` to toggle `tenants.kill_switch_disable_rating_prompts`.

### UI / Navigation alignment
- Updated **AppShell** nav order to match the amendment (For You, Following, Gyms, Challenges, Messages, Signals, Aftermath, Members, Events, Shop).
- Updated **mobile bottom nav** to: Home, Gyms, Create (+), Timer, Profile.
- Connected Gym card is now DB-backed (with local fallback for QA mode).

### New / Updated pages
- **/app/members/**: directory list + follow controls.
- **/app/account/**: Active status privacy toggle.
- **/app/timer/**: new Timer hub (legacy timer moved to **/app/timer/prototype/**).
- **/biz/dashboard/**: Constellation summary + trend.
- **/biz/settings/**: prompt kill switch.

### Files / migrations
- `supabase/migrations/2026-02-27_000002_NDYRA_CP57_ConnectedGym_Presence_Members_v7.6.sql`
- `site/assets/js/ndyra/lib/prefs.mjs`
- `site/assets/js/ndyra/components/activeNow.mjs`
- `site/assets/js/ndyra/components/appShell.mjs`
- `site/assets/js/ndyra/pages/members.mjs`
- `site/assets/js/ndyra/pages/account.mjs`
- `site/assets/js/ndyra/pages/timer.mjs`
- `site/assets/js/ndyra/pages/bizDashboard.mjs`
- `site/assets/js/ndyra/pages/bizSettings.mjs`


---

## CP58 — Visual Polish + Icon State System (2026-02-27_58)

### What shipped
- Fixed **root entry page** styling (was missing base styles due to body class + missing CSS) and added optional auto-forward into the app shell.
  - Default: `/` forwards to `/app/fyp/`.
  - Dev/QA: add `?stay=1` to remain on the entry card.

- Added **A+D atmosphere** (Luxury Tech + Premium Athletic):
  - Deep black base with subtle red ambient glow.
  - Glass topbar with a thin red energy line.
  - Slightly higher-contrast panels and cards (without going neon).

- Implemented **icon state system** in AppShell:
  - Inactive icons use **`/assets/iconpack/svg_mono/*`**.
  - Active nav items switch to **`/assets/iconpack/svg/*`**.
  - Added icon chips (wrapper) so icons remain visible at small sizes.

- Aligned legacy button accent color (styles.css) to NDYRA red for consistent red/white/black across non-shell pages.

### Files updated
- `site/assets/css/ndyra.css`
- `site/assets/css/styles.css`
- `site/assets/js/ndyra/components/appShell.mjs`
- `site/index.html`
- `site/assets/build.json`
- `site/sw.js`


---

## CP59 — Challenges (Season MVP) (2026-02-27_59)

### What shipped
- Introduced **season-style challenges** (time-boxed, gym-scoped) with **tasks-based scoring** + **leaderboard**.
- Staff/admin can create a **default 30‑day challenge** with three tasks (Train / Recover / Support).
- Members can **join**, **log daily progress** (with caps), and **view leaderboard**.

### Guardrails / Anti-drift
- New tables are **read-only under RLS**; writes go through **SECURITY DEFINER RPCs** that enforce:
  - Auth required
  - Tenant membership/staff gate
  - Challenge active + within date window
  - Per-day caps / total caps

### New / Updated pages
- **/app/challenges/**: list + detail view (join, log, leaderboard).

### Files / migrations
- `supabase/migrations/2026-02-27_000003_NDYRA_CP59_Challenges_Seasons_v7.7.sql`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/build.json`
- `site/sw.js`



---

## CP60 — Biz Tenant Picker + Constellation Feedback + Challenge Builder (2026-02-28_60)

### What shipped
- Added **staff tenant picker** for Biz tools (when `tenant_users` exists):
  - `/biz/dashboard/` and `/biz/settings/` now show a **dropdown of gyms you staff/admin**, removing UUID copy/paste friction.
  - Fallback remains: manual UUID input if the database doesn’t have `tenant_users` (or if you’re not staff anywhere).

- Constellation loop tightened:
  - `/biz/dashboard/` now also surfaces **internal feedback notes** (via `get_gym_rating_feedback`) so staff can actually *use* the member note field.

- Challenges evolved from “default-only” to **custom seasons**:
  - New RPC `create_challenge_season()` creates a season + tasks **atomically**.
  - `/app/challenges/` now includes a **Create season** builder for staff/admin.
  - `get_active_challenges()` now includes **draft** seasons for staff/admin.
  - Detail view now handles **Draft / Active / Ended** states cleanly (no forced join on drafts).

### Files / migrations
- `supabase/migrations/2026-02-28_000000_NDYRA_CP60_BizPicker_ChallengeBuilder_v7.8.sql`
- `site/assets/js/ndyra/pages/bizDashboard.mjs`
- `site/assets/js/ndyra/pages/bizSettings.mjs`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/css/ndyra.css`
- `site/assets/build.json`
- `site/sw.js`


---

## CP61 — Challenge Rewards (Badges) + Trophy Cabinet + Notifications Fix (2026-02-28_61)

### What shipped
- Added a minimal **badge / trophy** system:
  - `badges` (definitions)
  - `user_badges` (awarded instances)

- Challenges now **award badges automatically** via the scoring RPC:
  - Join badge: **Season Starter**
  - First log badge: **First Rep**
  - Streak badges: **3 / 7 / 14 day streaks**
  - Points badges: **100 / 250 / 500 points**

- Added **trophy cabinet UI**:
  - New page: `/app/trophies/`
  - Profile shows a **top-6 trophy preview** + “View all” link

- Added staff **End Season** RPC:
  - `end_challenge_season(challenge_id)` sets status to Ended and awards:
    - **Top 10** badge to the top 10
    - **Season Champion** badge to rank #1

- Fixed Notifications page drift to align with CP27 schema:
  - Notifications are now read via `notifications.user_id` and marked read via `is_read`
  - Badge unlocks emit `type=system` notifications (title + body)

### Files / migrations
- `supabase/migrations/2026-02-28_000001_NDYRA_CP61_ChallengeRewards_Badges_v7.9.sql`
- `site/app/trophies/index.html`
- `site/assets/js/ndyra/pages/trophies.mjs`
- `site/assets/js/ndyra/pages/profile.mjs`
- `site/app/profile/index.html`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/js/ndyra/pages/notifications.mjs`
- `site/assets/css/ndyra.css`
- `site/assets/js/ndyra/boot.mjs`
- `site/assets/build.json`
- `site/sw.js`


---

## CP62 — Status + Share + Retention (2026-02-28_62)

### What shipped
- Badge system got a **visual language upgrade**:
  - Added a lightweight **NDYRA badge icon pack** (`/assets/badges/…`) and swapped trophy UI away from emoji fallbacks.

- Trophy cabinet gained **visibility controls**:
  - Global cabinet setting: **Private / Followers / Public** (stored on `privacy_settings.trophies_visibility`).
  - Per-trophy override: `user_badges.visibility` (`inherit|private|followers|public`).
  - `get_trophy_cabinet()` now supports safely viewing other members’ trophies (while respecting blocks + follow relationship).

- Challenges now support **share + retention loops**:
  - Challenge detail includes a **Season/Progress Recap** card that mixes competitive + zen metrics (rank + points + best streak + days active).
  - One-tap **IG story-ready share template** (1080×1920) with **Hardcore** and **Zen** themes.
  - Optional **streak nudges** (in-app) when you haven’t logged today (toggle stored on `privacy_settings.streak_nudges_enabled`).

- Quality fix:
  - Profile page local selector helper restored (avoids accidental collision with querystring helper).

### Files / migrations
- `supabase/migrations/2026-02-28_000002_NDYRA_CP62_StatusShareRetention_v8.0.sql`
- `site/assets/badges/svg/*`
- `site/assets/badges/svg_mono/*`
- `site/assets/js/ndyra/lib/badges.mjs`
- `site/assets/js/ndyra/components/storyShare.mjs`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/js/ndyra/pages/trophies.mjs`
- `site/assets/js/ndyra/pages/profile.mjs`
- `site/app/profile/index.html`
- `site/assets/css/ndyra.css`
- `site/assets/build.json`
- `site/sw.js`

---

## CP63 — Events MVP (2026-03-01_63)

### What shipped
- Added **Events (MVP)** as a first-class module (gym-scoped):
  - Events list view for your **Connected Gym**
  - Event detail view (time, location, description, RSVP count)

- Added **RSVP loop** (member-side) without leaking attendee lists:
  - One-tap RSVP / remove RSVP
  - RLS stays tight on `event_rsvps` (members see only their own RSVP rows)
  - UI uses **SECURITY DEFINER RPCs** for safe counts + detail

- Added **Event creation** for Staff/Admin:
  - In-app Create Event modal (title, description, start/end, location, visibility, capacity, status)

- Added share + utility:
  - **IG story-ready Event Share template** (1080×1920) with **Hardcore** + **Zen** themes
  - **Calendar export (.ics)** from Event detail

- Quality fix:
  - Gym rating flow now correctly loads *your* existing rating (`gym_ratings` filtered by `user_id`).

### Files / migrations
- `supabase/migrations/2026-03-01_000000_NDYRA_CP63_Events_MVP_v8.1.sql`
- `site/assets/js/ndyra/pages/events.mjs`
- `site/assets/js/ndyra/components/storyShare.mjs`
- `site/assets/js/ndyra/pages/gymProfile.mjs`
- `site/assets/build.json`
- `site/sw.js`
- `site/index.html`

---

## CP64 — QA Gate + Booking Fork + Inbox Announcements (2026-03-01_64)

### What shipped
- Added a **hard QA gate** to reduce drift + regressions:
  - `tools/qa_smoke.py` + `tools/qa_super.py` now validate build stamp + file integrity + locked brand red (`#E10600`).

- Booking fork hardened (membership vs tokens):
  - Class booking UI now routes to real RPCs and shows deterministic outcomes.

- Inbox foundation (gym-scoped):
  - New `tenant_announcements` table + RPCs
  - Staff/Admin can post, pin/unpin, and archive announcements
  - Events can auto-create an announcement on publish

### Files / migrations
- `supabase/migrations/2026-03-01_000001_NDYRA_CP64_Inbox_Announcements_BookingFork_v8.2.sql`
- `site/assets/js/ndyra/pages/bookClass.mjs`
- `site/assets/js/ndyra/pages/inbox.mjs`
- `tools/qa_smoke.py`
- `tools/qa_super.py`
- `site/assets/build.json`
- `site/sw.js`

---

## CP65 — Direct Messages (2026-03-01_65)

### What shipped
- Added **1:1 Direct Messages** (real DMs — not demo):
  - Threads + messages + read-state for unread counts
  - Tight RLS (participants only) and a **spam-resistant gate**:
    - mutual follow OR shared gym membership OR staff→member (same tenant)
  - DM messages generate a **notification** (`notification_type='message'`).

- Messages UI upgrade:
  - `/app/inbox/` now has **Announcements + Direct tabs**
  - DM thread view (chat log + composer)
  - Members directory now includes a **Message** button

### Files / migrations
- `supabase/migrations/2026-03-01_000002_NDYRA_CP65_DirectMessages_v8.3.sql`
- `site/assets/js/ndyra/pages/inbox.mjs`
- `site/assets/js/ndyra/pages/members.mjs`
- `site/assets/css/ndyra.css`
- `site/assets/build.json`
- `site/sw.js`


---

## CP66 — DM Privacy + Safety Actions (2026-03-01_66)

### What shipped
- Added **DM Privacy Controls** (user-controlled):
  - `privacy_settings.dm_allow` = off | mutual | gym | mutual_or_gym | anyone
  - `can_dm_user()` now respects the recipient’s DM policy (blocks still override).

- Added **Safety actions** inside DM threads:
  - Report conversation (writes to `reports`)
  - Block user (writes to `blocks`, which hides both users across NDYRA)

- Member directory improvement:
  - Server-side `can_message` flag returned by `get_tenant_member_directory()` so the UI can disable Message when not allowed.

### Files / migrations
- `supabase/migrations/2026-03-01_000003_NDYRA_CP66_DM_Privacy_Safety_v8.4.sql`
- `site/app/profile/index.html`
- `site/assets/js/ndyra/pages/profile.mjs`
- `site/assets/js/ndyra/pages/members.mjs`
- `site/assets/js/ndyra/pages/inbox.mjs`
- `site/assets/build.json`
- `site/sw.js`


---

## CP74 — Streak Shield + Streak Milestones + Podium Polish (2026-03-02_74)

### What shipped
- **Streak Shield (retention without making it soft):**
  - Each challenge participant has a per-season shield allowance (`streak_shields_total`) and a usage counter (`streak_shields_used`).
  - New shield-days table `challenge_streak_shields` stores which date was protected.
  - New RPC `use_streak_shield(challenge_id, day)` (SECURITY DEFINER) allows shielding **yesterday (UTC) only**, requires a real log on the day prior, and prevents retro-abuse.

- **Streak Milestones (hardcore + zen):**
  - Added new streak badges: `streak_21` and `streak_30`.
  - `log_challenge_activity()` streak calculation now treats shield days as continuity days.

- **Season Podium polish:**
  - Challenge leaderboard now renders a **Top-3 Podium** (2–1–3 layout) above the full list.
  - Recap card now shows **Current streak**, **Shields left**, and a **Next streak badge** hint.
  - Streak nudge now optionally offers **Use Streak Shield** when applicable.

### Files / migrations
- `supabase/migrations/2026-03-02_000001_NDYRA_CP74_StreakShield_Podium_v8.7.sql`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/css/ndyra.css`
- `site/assets/badges/svg/streak_21.svg`
- `site/assets/badges/svg_mono/streak_21.svg`
- `site/assets/badges/svg/streak_30.svg`
- `site/assets/badges/svg_mono/streak_30.svg`
- `site/assets/build.json`
- `site/sw.js`


---

## CP83 — Token Marketplace Addendum + Wallet Surfaces (2026-03-04_83)

### What shipped
- **Blueprint Addendum wired in (Token Marketplace v1.0):** addendum docs are now present in-repo and enforced by QA smoke checks.
- **Marketplace data model:** new tables for `catalog_products`, `catalog_product_assets`, and `purchases` with RLS policies for anon/public browse, authenticated browse, and staff/admin overrides.
- **Token checkout RPC:** `purchase_with_tokens(product_id, qty, client_purchase_id)` added as a SECURITY DEFINER RPC. Uses the existing token ledger (`spend_tokens`) and grants entitlements per product type.
- **New IA surfaces:** `/app/wallet/`, `/app/purchases/`, and `/app/library/timers/` added as first-class pages, plus Wallet in the left nav and Wallet/Purchases in the user menu.

### Files / migrations
- `supabase/migrations/2026-03-04_000001_NDYRA_CP83_Token_Marketplace_v1.sql`
- `site/app/wallet/index.html`
- `site/app/purchases/index.html`
- `site/app/library/timers/index.html`
- `site/assets/js/ndyra/pages/wallet.mjs`
- `site/assets/js/ndyra/pages/purchases.mjs`
- `site/assets/js/ndyra/pages/libraryTimers.mjs`
- `site/assets/js/ndyra/pages/shop.mjs`
- `site/assets/js/ndyra/components/appShell.mjs`
- `site/assets/js/ndyra/boot.mjs`
- `tools/qa_smoke.py`
- `docs/ndyra/NDYRA_Blueprint_Addendum_Token_Marketplace_v1.0_2026-03-04.pdf`

---

## CP84 — Marketplace Detail + Timer Pack Payloads + Biz Shop Tools (2026-03-04_84)

### What shipped
- **Shop detail view (no rewrites required):** `/app/shop/?p=<slug>` renders a full product detail panel (hero, description, type badge, copy-link) with related items below.
- **Timer pack payloads (secure delivery):** new `timer_pack_payloads` table stores the actual timer JSON payload gated by **entitlements** (RLS checks `timer_pack:{product_id}`).
- **Member timer library import:** `/app/library/timers/` now shows owned timer packs with **Import** → writes workouts into the legacy **My Workouts** local library.
- **Business marketplace tools:**
  - `/biz/shop/` lets tenant staff create/update/delete catalog products (type, price, visibility, hero, unlock type).
  - `/biz/timers/packs/` lets tenant staff paste/save timer pack JSON payloads for their `timer_pack` products.
- **Seed storefront:** added a small set of platform sample items (including 2 timer packs) + sample timer payloads so the shop isn’t empty on a fresh DB.
- **Checkout enrichment:** `purchase_with_tokens` now records `title`/`slug`/`type` in purchases + entitlement values, and feature unlocks use `feature_unlock:{feature_unlock_type}` when present.

### Files / migrations
- `supabase/migrations/2026-03-04_000002_NDYRA_CP84_TimerPackPayloads_Seeds_v1.sql`
- `site/biz/shop/index.html`
- `site/biz/timers/packs/index.html`
- `site/assets/js/ndyra/pages/bizShop.mjs`
- `site/assets/js/ndyra/pages/bizTimerPacks.mjs`
- `site/assets/js/ndyra/pages/shop.mjs`
- `site/assets/js/ndyra/pages/libraryTimers.mjs`
- `site/assets/js/ndyra/pages/purchases.mjs`
- `site/assets/js/ndyra/boot.mjs`
- `site/biz/index.html`
- `site/assets/js/ndyra/components/appShell.mjs`
- `tools/qa_smoke.py`
- `site/assets/build.json`
- `site/sw.js`

---

## CP85 — Token Pack Top-Ups + Wallet Wiring (2026-03-05_85)

### What shipped
- **Stripe token pack top-ups** are now wired for the wallet surface via `/api/stripe/create-checkout-session` using `kind = token_pack`.
- **Wallet UI** now renders token pack cards (100 / 250 / 500) from public config and launches Stripe Checkout when a price ID is configured.
- **Webhook token credits**: `checkout.session.completed` for token packs now creates a `token_topups` receipt row and credits tokens server-side through `credit_tokens(...)`.
- **Purchase receipts improved**: `/app/purchases/` now shows both marketplace purchases and token top-ups in distinct sections.
- **Ledger alignment fix**: `token_transactions` now carries `delta` (with amount/delta sync trigger) so newer wallet math and older code paths can coexist safely.
- **Marketplace purchase RPC fix**: `purchase_with_tokens(...)` was rebuilt to use the current 5-arg `spend_tokens(...)` signature and persists richer metadata (`title`, `slug`, `type`).
- **Public config / health** now expose token-pack-safe public fields and env presence flags so staging/prod wiring is easier to verify.

### Files / migrations
- `supabase/migrations/2026-03-05_000001_NDYRA_CP85_TokenTopups_Alignment_v1.sql`
- `netlify/functions/public_config.js`
- `netlify/functions/health.js`
- `netlify/functions/stripe_create_checkout_session.js`
- `netlify/functions/stripe_webhook.js`
- `site/assets/data/stripe_public_test.json`
- `site/assets/js/ndyra/pages/wallet.mjs`
- `site/assets/js/ndyra/pages/purchases.mjs`
- `site/admin/status/index.html`
- `site/assets/build.json`
- `site/sw.js`

---

## CP87 — Live Wiring Truth Panel + Explicit API Routing (2026-03-05_87)

### What shipped
- Added a real **Admin Status Truth Panel** at `/admin/status/` that consumes `/api/health` and `/api/public_config` to show build, Supabase, Stripe, token-pack, and telemetry wiring state.
- Added explicit pretty-route rewrites in `site/_redirects` for `/api/health`, `/api/public_config`, `/api/stripe/*`, and `/api/telemetry/ingest` so Netlify route resolution cannot drift from function filenames.
- Expanded `netlify/functions/health.js` with **Supabase REST table existence checks** (tenants, subscriptions, entitlements, catalog_products) using service-role credentials, while still returning booleans only (no secret exposure, no record leakage).
- Added a wiring runbook doc and updated QA smoke so it validates the explicit API rewrites and admin status module presence.

### Files / functions
- `site/admin/status/index.html`
- `site/assets/js/admin_status.mjs`
- `site/admin/index.html`
- `site/_redirects`
- `netlify/functions/health.js`
- `docs/ndyra/NDYRA_Live_Wiring_Truth_Panel_Runbook_CP87_2026-03-05.md`
- `tools/qa_smoke.py`
- `site/assets/build.json`
- `site/sw.js`


## CP90 - Deployment Truth Matrix + Wiring Manifest (2026-03-05_90)

Summary
- Added a static live wiring manifest that documents required Netlify env vars, migration order, and deployment checks.
- Expanded `/api/health` into a readiness endpoint with env presence matrices, section summaries, and DB table checks.
- Expanded `/api/public_config` to publish plan and token-pack price maps safely.
- Rebuilt `/admin/status/` into a real truth panel with a deployment badge, environment matrix, migration order, and copy-ready checklist.
- Tightened QA smoke so these pieces are now required for future checkpoints.

Key files
- `site/assets/data/live_wiring_manifest.json`
- `site/assets/js/admin_status.mjs`
- `site/admin/status/index.html`
- `netlify/functions/health.js`
- `netlify/functions/public_config.js`
- `docs/ndyra/NDYRA_Live_Wiring_Execution_CP90_2026-03-05.md`

QA
- `node tools/build_stamp.cjs`
- `python tools/qa_smoke.py`
- `python tools/qa_super.py`
- `python tools/brand_gate_check.py`
- `python tools/ip_gate_check.py`


## CP90 - Deployment Templates + Stripe Product Matrix (2026-03-05_90)

Summary
- Added deployment templates for local Netlify dev, staging, and production as static JSON plus repo-side example files under `ops/env/`.
- Added Stripe product matrix metadata so price/env naming is consistent during live wiring.
- Expanded `/api/health` to verify billing and marketplace table readiness (`purchases`, `token_wallets`, `token_transactions`, `token_topups`, `timer_pack_payloads`).
- Expanded `/admin/status/` with Environment Templates and Stripe Product Matrix cards, plus a richer deployment badge.
- Tightened QA smoke so these new deployment artifacts are required going forward.

Key files
- `site/assets/data/deployment_templates.json`
- `ops/env/netlify.local.example`
- `ops/env/netlify.staging.example`
- `ops/env/netlify.production.example`
- `ops/stripe/stripe_product_map.example.json`
- `site/assets/js/admin_status.mjs`
- `site/admin/status/index.html`
- `netlify/functions/health.js`
- `docs/ndyra/NDYRA_Live_Wiring_Execution_CP90_2026-03-05.md`
- `tools/qa_smoke.py`


## CP90 - Marketplace Member Surfaces + Env Helper Alignment (2026-03-05_90)

Summary
- Wired real member-facing marketplace routes into the core build: `/app/shop/`, `/app/wallet/`, `/app/purchases/`, and `/app/library/timers/`.
- Replaced Supabase/browser stubs with a public-config driven client bootstrap and added member helper modules for preferences, utilities, and entitlements.
- Added a static shop seed catalog so local preview can still show marketplace structure when live Supabase is absent.
- Aligned `netlify/functions/health.js` and `public_config.js` with the shared env helper so QA can enforce env-helper usage consistently.

Key files
- `site/app/shop/index.html`
- `site/app/wallet/index.html`
- `site/app/purchases/index.html`
- `site/app/library/timers/index.html`
- `site/assets/js/ndyra/lib/supabase.mjs`
- `site/assets/js/ndyra/lib/utils.mjs`
- `site/assets/js/ndyra/lib/prefs.mjs`
- `site/assets/js/ndyra/lib/entitlements.mjs`
- `site/assets/js/ndyra/pages/shop.mjs`
- `site/assets/js/ndyra/pages/wallet.mjs`
- `site/assets/js/ndyra/pages/purchases.mjs`
- `site/assets/js/ndyra/pages/libraryTimers.mjs`
- `netlify/functions/health.js`
- `netlify/functions/public_config.js`
- `site/assets/data/shop_seed_public.json`
- `docs/ndyra/NDYRA_Marketplace_Member_Surfaces_CP90_2026-03-05.md`


## CP91 - Account + Billing + Marketplace Hardening (2026-03-05_91)

Summary
- Added real member and business billing return pages: `/app/account/` and `/biz/account/`, matching the Stripe checkout success URLs already used in serverless functions.
- Fixed broken bracketed data-root attributes in Wallet, Purchases, and Timer Library HTML so marketplace pages mount correctly at runtime.
- Hardened Shop with owned-state rendering, wallet balance context, and insufficient-token redirect into Wallet.
- Improved Timer Library with imported-state awareness and re-import flow.

Key files
- `site/app/account/index.html`
- `site/biz/account/index.html`
- `site/app/wallet/index.html`
- `site/app/purchases/index.html`
- `site/app/library/timers/index.html`
- `site/assets/js/ndyra/lib/billing.mjs`
- `site/assets/js/ndyra/pages/account.mjs`
- `site/assets/js/ndyra/pages/bizAccount.mjs`
- `site/assets/js/ndyra/pages/shop.mjs`
- `site/assets/js/ndyra/pages/wallet.mjs`
- `site/assets/js/ndyra/pages/libraryTimers.mjs`
- `tools/qa_smoke.py`


## CP92 - Gyms + Challenges MVP + BizGym Route Stubs (2026-03-05_92)

Summary
- Added member gym connector page: `/app/gyms/`.
  - Lets a member choose a “connected gym” (tenant) which scopes challenge visibility + future events.
  - Shows membership status if present.
  - Includes an admin-only QA helper (comp membership) via a new RPC.
- Added member challenge board MVP: `/app/challenges/`.
  - Lists active challenges for the connected gym using `get_active_challenges`.
  - Allows joining (`join_challenge`), task logging (`log_challenge_activity`), and viewing tasks/leaderboard.
- Added BizGym contract-aligned stub routes so the boundary doesn’t 404 while modules merge later.
  - `/biz/schedule/`, `/biz/settings/`, `/biz/check-in/kiosk/`, `/biz/check-in/live/`
- Expanded Preview hub + App Home with Gyms and Challenges routes.

Key files
- `site/app/gyms/index.html`
- `site/app/challenges/index.html`
- `site/assets/js/ndyra/pages/gyms.mjs`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `supabase/migrations/2026-03-05_000002_NDYRA_CP92_CompMembership_AdminTools_v1.sql`
- `site/app/index.html`
- `site/preview/index.html`
- `site/biz/index.html`
- `site/biz/check-in/index.html`
- `site/biz/check-in/kiosk/index.html`
- `site/biz/check-in/live/index.html`
- `site/biz/schedule/index.html`
- `site/biz/settings/index.html`
- `docs/ndyra/NDYRA_Gyms_Challenges_MVP_CP92_2026-03-05.md`

QA
- `node tools/build_stamp.cjs`
- `python tools/qa_smoke.py`
- `python tools/qa_super.py`
- `python tools/brand_gate_check.py`
- `python tools/ip_gate_check.py`


## CP97 - Aftermath Visibility + Share-to-Feed (2026-03-06_97)

Summary
- Added visibility-aware viewing for Aftermath entries using DB helpers (`can_view_aftermath_entry`, `get_aftermath_entry_view`, `get_user_aftermath_feed`).
- Added share-to-feed plumbing with `share_my_aftermath_to_post` and the `aftermath_post_shares` mapping table.
- `/app/aftermath/` now supports owner feed + public/follower-visible feed via `?u=<user_id>`.
- Fixed challenge detail Aftermath links to use the correct tenant id scope.

Key files
- `supabase/migrations/2026-03-06_000002_NDYRA_CP97_Aftermath_Visibility_Share_v9.7.sql`
- `site/assets/js/ndyra/pages/aftermath.mjs`
- `site/assets/js/ndyra/pages/challenges.mjs`
- `site/assets/js/ndyra/boot.mjs`
- `site/app/aftermath/index.html`
- `supabase/migrations/2026-03-06_000003_NDYRA_CP97_Aftermath_Social_Feed_v9.8.sql`
- `site/assets/js/ndyra/pages/fyp.mjs`
- `site/assets/js/ndyra/pages/profile.mjs`
- `site/app/fyp/index.html`
- `site/app/profile/index.html`
- `site/assets/data/aftermath_social_seed_public.json`
- `docs/ndyra/NDYRA_Aftermath_Social_Surfaces_CP97_2026-03-06.md`


### CP97 extension note
- FYP is no longer a dead placeholder; it now renders a visibility-safe community Aftermath feed.
- Profile is no longer a dead placeholder; it now renders a member recap surface with live Supabase or seed fallback.


## CP98 - Notifications MVP + Inbox Route (2026-03-06_98)

Summary
- Added a real member Notifications surface with seed fallback for local QA and live Supabase reads when configured.
- Added mark-one-read and mark-all-read actions.
- Added safer notification routing into Events, Challenges, Purchases, Profile trophies, Aftermath detail, and Inbox.
- Added a reserved Inbox route so message notifications have a stable landing page while the deeper messaging surface evolves.

Key files
- `site/app/notifications/index.html`
- `site/app/inbox/index.html`
- `site/assets/js/ndyra/pages/notifications.mjs`
- `site/assets/data/notifications_seed_public.json`
- `site/assets/js/ndyra/boot.mjs`
- `site/app/index.html`
- `site/preview/index.html`
- `docs/ndyra/NDYRA_Notifications_MVP_CP98_2026-03-06.md`

QA
- `node tools/build_stamp.cjs`
- `python tools/qa_smoke.py`
- `python tools/qa_super.py`
- `python tools/brand_gate_check.py`
- `python tools/ip_gate_check.py`


## CP99 — 2026-03-07_99
- Inbox message center implemented (Direct / Requests / Announcements).
- Notifications route message items directly into the inbox thread view.
- Member App Home now surfaces unread badges for Notifications + Inbox.


## CP101 — Settings + Privacy Control Center (2026-03-07)
- Added `/app/settings/` as a real member surface.
- Wired privacy controls to `privacy_settings` and timezone controls to existing RPCs.
- Added Settings entry points from App Home + Account.


## CP102 (2026-03-07)

Blueprint sections referenced:
- **3. UI Emulation: AppShell Assembly (Locked)**
- **4. Missing Modules Shown in Reference UI** (`/app/members`)
- **6. Active Now / privacy direction** (directory remains scoped to connected gym)

Changes:
- Added `/app/members/` as a real member-facing directory surface.
- Live mode uses `get_tenant_member_directory(...)` and respects server-side `can_message`.
- Local preview uses `members_seed_public.json` so the route remains QA-able without Supabase.
- Inbox now accepts `?start=<user_id>` and starts a DM thread in live mode.

Notes:
- No global people search was added.
- No generated graphics were introduced in this checkpoint.

## CP103 — Following + Signals real surfaces (2026-03-08)
- Added security-definer RPC `get_following_aftermath_feed(limit, offset)` for followed member/gym aftermath recaps.
- Added security-definer RPC `get_signals_feed(limit, offset)` for active visible signals.
- Repaired legacy `get_signal_strip()` by removing broken `post_media.public_url` reference.
- Replaced placeholder Following/Signals pages with real local-preview + live-mode surfaces.
- Added preview seed data for both surfaces and wired them into Member App Home + Preview Hub.


## CP105 — Wiring Control Center + Consistency Guard

- Added `/admin/wiring/` with build source, execution order, webhook event matrix, template blocks, and quick actions.
- Added `stripe_webhook_events.json` as a canonical required event matrix.
- Added `tools/wiring_consistency_check.py` and tightened QA so live-wiring artifacts cannot silently drift.

## CP106 — Live execution page + runtime readiness hardening (2026-03-08)
- Added /admin/execute/ as the concrete execution checklist surface
- Added runtime readiness banners to account/billing/marketplace surfaces
- Hardened Timer Library import behind active member plan state
- QA now requires admin/execute and live_execution_steps.json


## CP107 — Inbox Message Center Polish (2026-03-08_107)
- Added messenger-style search + unread-only filter to /app/inbox/.
- Added in-thread Archive (hide_dm_thread) and Clear (clear_dm_thread) actions for live direct threads.
- Preserved local preview mode with graceful disabled actions and deterministic seed data.

## CP108 — Follow Graph surfaced (2026-03-08)
- Added member follow/unfollow actions in Members directory and Profile
- Added gym follow/unfollow in Gyms directory
- This makes the Following feed actually user-curated instead of hidden-schema-only


## CP109 — Post detail + comments (2026-03-08)

- `/app/post/` is now a real social detail surface.
- Live mode reads `posts`, `post_stats`, `post_comments`, and author profiles.
- Local preview uses `post_seed_public.json`.
- FYP/Following/Profile now open the post when `shared_post_id` exists, otherwise they fall back to the aftermath detail page.


## CP110 — App-wide unread badges (2026-03-09)

- Added shared unread count helper (`unreadCounts.mjs`) for notifications + inbox state.
- Refactored Member App Home to consume the shared helper.
- Upgraded `site.js` to inject Inbox + Notifications quick links with unread badges into header nav across `/app/*` surfaces.
- Live counts use Supabase; local preview falls back to deterministic seed counts.

## CP111 — Unread sync + messenger coherence (2026-03-09)

- Added event-based unread count publishing/subscription in `unreadCounts.mjs`.
- App chrome and Member App Home now respond to unread state changes immediately.
- Notifications now sync unread counts after mark-one / mark-all / open.
- Inbox no longer auto-opens the first thread, preventing accidental read-state clearing.
- Inbox now syncs unread counts immediately after opening an unread thread.



## CP112 — Runtime execution + entitlement hardening (2026-03-09)

- Added `runtime_surface_matrix.json` as a structured truth source for marketplace, billing, and admin runtime requirements.
- Rebuilt public-config/runtime-readiness helpers so placeholder values and missing price matrices are surfaced honestly.
- Hardened `/api/public_config` and `/api/health` around deployed-context config truth and Stripe/Supabase readiness.
- Expanded Stripe webhook handling so invoice and checkout subscription mirrors refresh more consistently.
- Fixed timezone bootstrap drift so `timezone_source='manual'` is respected.
- Tightened timer import/remix entitlement logic to allow active member plans or explicit premium timer feature unlocks.
- Hardened Shop/Wallet purchase and token top-up CTAs around connected gym, billing readiness, webhook readiness, and price IDs.
- Upgraded `/admin/status/` and `/admin/execute/` with config warnings and runtime surface readiness sections.
- Tightened QA to require the new runtime/execution truth artifacts.


## CP113 — Deployment confidence + accessibility hardening (2026-03-09)

- Rebuilt public-config fallback rules so deployed hosts no longer silently drop into preview/local config when `/api/public_config` is unavailable.
- Added `deployment_confidence_checklist.json` plus new admin execution confidence sections to make deploy readiness and live blockers explicit.
- Hardened Stripe checkout and portal functions against placeholder secrets, placeholder price IDs, off-origin return URLs, and weak business-subject resolution.
- Centralized entitlement activity logic in `entitlementState.mjs` so future-start, grace, and revocation metadata can be evaluated consistently across billing surfaces.
- Added shell accessibility tightening across the shared HTML scaffold: `lang`, skip links, `main-content`, nav labels, focus-visible, and reduced-motion support.
- Added `qa_accessibility.py` and `deployment_confidence_check.py`, and included them in `qa:all` so these gates cannot be skipped.
- Preserved project boundaries: no BizGym runtime duplication, no Timer module duplication, and no Check-In buildout beyond existing boundary stubs.


## CP114 — Public acquisition + gym profile reality pass (2026-03-10)

- Added `public_gyms_seed.json` plus `publicGyms.mjs` to support seeded/live-ready public gym discovery.
- Rebuilt `pricing.html`, `join.html`, `/for-gyms/`, `/for-gyms/pricing.html`, `/for-gyms/start.html`, `/gym/profile/`, and `/gym/join/` as real public acquisition surfaces.
- Business setup now captures gym name, slug, locations, tier, and cadence before attempting checkout, and still fails closed when runtime/config is incomplete.
- Public gym profiles now render seeded/live-ready story, amenities, class highlights, events, public signals, and optional signed-in follow/connect actions.
- Added `public_surface_check.py` and included it in the checkpoint QA bundle.
- Refreshed `/` and `/preview/` so the public entry surfaces are discoverable during QA.
- Preserved boundaries: no BizGym runtime duplication, no Timer runtime duplication, no Check-In buildout.

## CP115 — Live execution truth + entitlement verification (2026-03-10)

- Tightened public config + runtime readiness so member, business, and token pricing only read as ready when the full expected matrix is present with non-placeholder values.
- Added `live_verification_matrix.json` and surfaced it on `/admin/execute/` alongside the deployment confidence checklist.
- Expanded `/admin/status/` to expose exact matrix counts and missing/placeholder keys for public pricing truth.
- Hardened `stripe_webhook.js` so plan swaps deactivate sibling plan entitlements instead of leaving multiple active plan unlocks behind.
- Added CP115 migration `2026-03-10_000001_NDYRA_CP115_Entitlement_Lifecycle_and_Verification_v1.sql` to add lifecycle columns expected by the client entitlement state helpers.
- Added `live_verification_check.py` and folded it into `qa:all` so the new verification path cannot silently regress.
- Refreshed `/` and `/preview/` so the checkpoint story reflects the live-verification finish-line work.

## CP116 — Release closeout + boundary honesty (2026-03-11)

- Added `release_closeout_packet.json` plus `ops/env/live_release_closeout.example.json` so the final credentialed launch evidence is captured deterministically instead of being implied.
- Upgraded `/admin/execute/` to surface the release closeout packet alongside deployment confidence, live verification, blockers, templates, and runtime surfaces.
- Added `module_boundary_surface_check.py` and `release_closeout_check.py`, and folded both into `qa:all`.
- Rebuilt the remaining business boundary routes (`/biz/*`) into explicit handoff shells driven by `biz_boundary_surfaces.json` and `bizBoundary.mjs`, replacing raw placeholder copy while preserving BizGym/Timer ownership boundaries.
- Refreshed `/`, `/preview/`, admin home, and live-execution steps so the repo tells the truth about what is code-complete versus what still requires real deployment credentials and evidence.

## CP117 — Core modularization plan + workout-library extraction (2026-03-12)

- Added `site/assets/data/core_module_contracts.json` as the single source of truth for the three new Core-owned module contracts: workout library, user profile/preferences, and token system.
- Added module entrypoints under `site/assets/js/ndyra/modules/` for `workoutLibrary`, `userProfilePrefs`, and `tokenSystem`.
- Fully extracted workout-library storage/import logic into `workoutLibrary/index.mjs`, including normalized CRUD, entitlement-based import access, owned timer-pack lookup, and cross-page change events.
- Rebuilt `site/assets/js/ndyra/pages/libraryTimers.mjs` to consume the shared workout-library module instead of page-local storage logic.
- Replaced the old My Workouts placeholder with a real module-driven surface at `/app/timer/my-workouts/` via `site/assets/js/ndyra/pages/myWorkouts.mjs`.
- Added `tools/core_module_contract_check.py` and folded it into `qa:all` so the contract file, module entrypoints, and workout-library storage boundary cannot silently regress.
- Added `docs/ndyra/NDYRA_Core_Modularization_Plan_CP117_2026-03-12.md` to document the phase plan, module ownership, and stable interfaces while preserving BizGym/Timer/Check-In boundaries.


## CP118 — Corrected Timer boundary + profile workout-ref migration (2026-03-12)

- Replaced the incorrect Core-owned workout-library contract with a Timer boundary contract backed by `site/assets/js/ndyra/modules/timerBoundary/index.mjs`.
- Confirmed the separate Timer build owns the video workout library (`core/video-move-library.js`), saved timers (`core/user-timers.js`), profile timer tab seam (`integrations/user-profile-timer-tab.js`), and timer-local token adapter (`core/tokens.js`).
- Removed the legacy `workoutLibrary` Core module and rebuilt `/app/library/timers/` as an honest boundary shell that records Timer-owned capabilities without integrating Timer runtime.
- Expanded `site/assets/js/ndyra/modules/userProfilePrefs/index.mjs` to own profile-level workout refs, legacy migration from `ndyra:my_workouts`, and cross-page workout-ref change events.
- Migrated `site/assets/js/ndyra/pages/settings.mjs`, `site/assets/js/ndyra/pages/profile.mjs`, and `site/assets/js/ndyra/pages/myWorkouts.mjs` to consume the `userProfilePrefs` module.
- Replaced the old “shared workout-library module” messaging on `/`, `/preview/`, `/app/timer/my-workouts/`, and related docs with the corrected Timer-boundary/profile-ref model.
- Rewrote `tools/core_module_contract_check.py` so QA now enforces the Timer boundary module, absence of the legacy workout-library module, and the new user-profile-prefs consumers.
