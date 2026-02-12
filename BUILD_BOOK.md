# HIIT56 Platform Buildbook (CP14 v1.7)

**Date:** 2026-02-09  
**Owner:** William Davis Moore  
**Scope:** One product with:
- Public marketing + conversion preview (Guest)
- Member portal (on-demand library + timer experience)
- Business portal (multi-tenant, paid, Admin/Staff gym system)
- Master Admin (global control across all business tenants)

**Current build style:** Netlify Git/CLI deploy (Functions enabled) + local QA preview zip
  - Netlify Drop is still used for quick static previews, but it will not reliably run `/api/*` endpoints.  
**Planned stack (once backend/auth is wired):** Supabase + Stripe + Vimeo

---

## CP13–CP14 Delta Summary (latest changes)
- Stripe Checkout wiring added via Netlify Functions (test mode config). (CP13)
- Added `/admin/status/` to verify Functions + Stripe wiring quickly. (CP14)
- Added `/api/health` Function health endpoint. (CP14)
- Fixed a critical JavaScript syntax issue in Join / Business Start flows that could break site JS. (CP14)
- Service worker cache bumped to CP14. (CP14)

## CP08 Delta Summary (what changed vs CP07)
- Added multi-tenant scaffolding (demo tenant selector + Biz Staff/Biz Admin roles).
- Added a Master Admin stub console.
- Added Pricing pages for Member + Business tiers (placeholders until Stripe IDs).
- Updated category hero + teaser selection rule:
  - Auto-selected from the **latest 10** class videos per category (until dedicated hero videos are delivered).
- Added marketing wrapper pages for the Business tier (`/for-gyms/`).

---

## 1) North Star + Constraints
- **North Star (business):** paid membership started (Stripe checkout success)
- **North Star (product trust):** timer playback is reliable on mobile + desktop
- **Non-negotiables:**
  - Mobile-first, responsive phone/tablet/desktop
  - Member portal + Business portal with role gating
  - On-demand library (700+ classes) integrated
  - Gym timer system integrated (Admin/Staff only)
  - Beeps at every interval boundary + user volume control

---

## 2) Brand System (from owner notes)
- Background: #000000 (mostly black site)
- Accent: #e40001 (highlights/borders/CTAs)
- Text: #ffffff
- Typography direction: “Like Les Mills and Peloton” (final font TBD)

See: `HEX.docx` in project files for source notes.

---

## 3) Portals + Routing (concept)
- Public (conversion): `/`, `/workouts/*`, `/pricing.html`, `/for-gyms/*`
- Member: `/app/*`
- Business (Admin/Staff): `/biz/*`
- Master Admin: `/admin/`

Until real auth is wired, CP08 uses a demo role + tenant selector at `/login.html` (localStorage).

---

## 4) On-Demand Video Library (ingestion)
Source: `Workout Videos.csv` (Vimeo inventory)

Derived buckets:
- Class recordings (member on-demand library)
- Category hero picks (auto-selected per rule; see taxonomy JSON)
- Move demo clips (seed for move library)
- Marketing clips (hero/testimonials)

Files generated (see `site/assets/data/`):
- `videos_classes.json` (includes `category_slug` for each class)
- `videos_moves.json`
- `videos_category_samples.json` (legacy; still present)
- `categories_v1.json` (owner-approved taxonomy + CP08 hero/teaser picks)
- `tenants_demo.json` (demo-only)
- `pricing_v1.json` (placeholder prices until Stripe IDs)

---

## 5) Category Taxonomy v1 (OWNER-APPROVED)
Taxonomy locked by owner on 2026-02-07.

Canonical categories (slugs):
- HIIT (hiit)
- HIIT Beginner (hiit-beginner) - includes HIIT Mobility
- HIIT Upper Body (hiit-upper-body)
- HIIT Lower Body (hiit-lower-body)
- HIIT Total Body (hiit-total-body)
- Max Cardio HIIT (max-cardio-hiit) - includes HIIT56 Max Cardio
- Heavy HIIT (heavy-hiit) - includes X-Fit
- HIIT 21 (hiit-21) - includes Insanity 21
- HIIT Kickboxing (hiit-kickboxing) - includes Fit as a Fighter
- Stretch & Recovery (stretch-recovery)
- Ab Lab (ab-lab)
- HIIT Yoga (hiit-yoga)
- Yoga Flow (yoga-flow)
- Kids HIIT Funhouse (kids-hiit-funhouse)
- Challenges (challenges) - includes The Rock Workout Challenge

Removed buckets:
- HIIT Class Archives - folded into canonical categories based on title keywords.
- Other/Unsorted - eliminated; the 6 videos were manually assigned.

See: `CATEGORY_TAXONOMY_V1.md`.

---

## 6) Timer + Gym System (Prototype)
Routes:
- Member Timer: `/app/timer/`
- Business Gym Timer: `/biz/gym-timer/`

Core requirements implemented:
- Beep at every segment boundary (work/rest/transitions)
- Beep volume slider (stored locally for now)
- Time-cap solver can adjust Work / Rest / Transitions / All
- Transitions are included as a pool and are used in the time-cap feature

---

## 7) Business Portal Foundations
Routes:
- Business home: `/biz/`
- Move library: `/biz/moves/`
- Move detail: `/biz/moves/move.html?vid={vimeo_id}`

Move library playback is in-app (modal embed). Intended for staff/admin only.

---

## 8) Multi-tenant + Paid Business Subscriptions (Scaffold)
CP08 introduces a multi-tenant model conceptually:
- Each business gets a private portal and its own Admin + Staff users
- William has Master Admin access across all tenants

Current state:
- Demo-only tenant selector on `/login.html` (no backend yet)
- Business pages require a Biz role + selected tenant (demo guard)

Next:
- Implement tenant tables + RLS in Supabase
- Map Stripe customer/subscription -> tenant entitlements

---

## 9) Pricing + Coupons + Comps (Scaffold)
New pages:
- Member pricing: `/pricing.html`
- Business pricing: `/for-gyms/pricing.html`

Coupons/comps will be implemented as:
- Stripe coupons/promo codes (billing-side truth)
- Supabase entitlements table (app-side truth) for:
  - comp memberships
  - trial extensions
  - business overrides per tenant

---

## 10) Stripe + Supabase Deliverables Checklist
See the CP08 one-pager: `HIIT56_Stripe_Supabase_Deliverables_CP08.docx` (and PDF).

