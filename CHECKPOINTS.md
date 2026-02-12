# HIIT56 Project Checkpoints

Each checkpoint ends with:
- Updated BUILD_BOOK.md (and/or doc)
- Updated companion artifacts (as needed)
- A short “What changed” summary
- Exit criteria (pass/fail)

## CP00 — Foundation Lock
**Exit criteria**
- Stack locked
- Success metrics defined
- Reference standards chosen
- IA draft approved

## CP01 — Architecture + Data Model
**Exit criteria**
- Route map (public + app) defined
- Auth + billing approach defined
- Supabase table plan + RLS plan defined
- Tracking events defined

## CP02 — Design System + Components
**Exit criteria**
- Tokens (type/spacing/color) defined
- Core components built (nav, cards, modals, workout tiles)
- Mobile nav, library grid, and player UX validated

## CP03 — Membership Flow Working
**Exit criteria**
- Stripe products/prices created
- Checkout live in test mode
- Webhooks update Supabase subscriptions
- Member gating works end-to-end

## CP04 — Library + Programs + Playlists MVP
**Exit criteria**
- Workout library + filters working
- Program pages working
- Playlists create/add/reorder/delete working
- Progress tracking working

## CP05 — SEO & Conversion Pages Complete
**Exit criteria**
- Home, Plans, Kickstart, Blog template live
- Schema + sitemaps + robots + canonical correct
- Analytics events firing
- Core CWV targets hit

## CP06 — QA + Launch
**Exit criteria**
- QA checklist passed
- Launch runbook executed
- Post-launch monitoring active


## CP07 — Taxonomy Lock + Timer Beeps/Volume + Time Cap
**Exit criteria**
- Category taxonomy v1 owner-approved and implemented
- Other/Unsorted eliminated, HIIT Class Archives folded
- Timer prototypes: beeps at boundaries + volume control + time-cap pools (including transitions)
- Move library plays in-app (staff/admin only)
- Desktop/mobile/tablet responsive QA pass

Artifacts
- `CATEGORY_TAXONOMY_V1.md`
- `HIIT56_Class_Video_Category_Mapping_CP07_FINAL.csv`
- `QA_REPORT_CP07.txt`

## CP08 — Multi-tenant Scaffold + Pricing + Master Admin Stub
**Exit criteria**
- Demo roles expanded (Biz Staff/Biz Admin/Master Admin) + demo tenant selector
- Business portal requires Biz role + tenant context (demo guard)
- Member + Business pricing pages live (placeholders)
- Category hero/teaser selection rule updated to “latest 10 per category”
- IA updated (sitemap + new routes)

Artifacts
- `site/admin/index.html`
- `site/pricing.html`
- `site/for-gyms/index.html`
- `site/for-gyms/pricing.html`
- `site/assets/data/pricing_v1.json`
- `site/assets/data/tenants_demo.json`
- `HIIT56_Stripe_Supabase_Deliverables_CP08.*` (docx/pdf)

## CP09 — Accounts + Onboarding Scaffolds + Admin Tools
**Exit criteria**
- Member join page scaffold live (Stripe pending)
- Business tenant signup scaffold live (Supabase pending)
- Member Account + Business Account pages live (demo identity + coupons/comps)
- Business onboarding scaffold live
- Master Admin: tenants + coupons + comps scaffolds live
- Service worker updated for new routes

Artifacts
- `site/join.html`
- `site/for-gyms/start.html`
- `site/app/account/index.html`
- `site/biz/account/index.html`
- `site/biz/onboarding/index.html`
- `site/admin/*`
- `QA_REPORT_CP09.txt`

## CP10 — Adjustments Sweep + Specials/Mash-Ups + UX Fixes
**Exit criteria**
- Logo size + header scaling updated (no distortion)
- Added “HIIT56 Specials/Mash-Ups” category and placed last in libraries
- HIIT 21 grouped under Specialty HIIT
- Ab Lab separated from Recovery section
- Video modal playback no longer autoplays muted; timer audio unlock added (beeps audible)
- Dropdown option text readable (black)
- Business gym timer label: “Sta” / “Station” (not Rot/Rotation)
- Thumbnail fetching upgraded to prefer higher-res Vimeo thumbs w/ fallback

Artifacts
- `site/assets/data/categories_v1.json` (v1.1-approved-cp10)
- `site/assets/js/site.js`
- `site/assets/css/styles.css`
- `Adjustments_2-8-23.docx`
- `QA_REPORT_CP10.txt`


## CP12 — Adjustments: Video Volume + Performance + Specials Fold (Owner Requested)
Changes
- Top-left logo increased to 73px height (~30% larger) with no distortion
- Added custom video volume control overlay (mute + slider) on:
  - video modals
  - workout detail pages
  - business move detail pages
- Added “instant poster + loading overlay” while Vimeo iframe loads + fallback “Open in Vimeo” banner after ~8s
- Removed standalone “HIIT56 Specials/Mash-Ups” category tile
- Folded Specials/Mash-Ups under HIIT category and listed them last (bottom section)

Artifacts
- `site/assets/js/site.js`
- `site/assets/css/styles.css`
- `site/assets/data/categories_v1.json`
- `site/assets/data/videos_classes.json`
- `Adjustments_2-8-23_2.docx`
- `QA_REPORT_CP12.txt`
## CP13 — Stripe Checkout Wiring (Netlify Functions)
**Exit criteria**
- Stripe test-mode products + prices configured
- Member + Business pricing pages redirect to Stripe Checkout on deployed Netlify (Functions)
- Stripe webhook endpoint accepts events (signature verified) and logs (Supabase sync pending)

Artifacts
- `site/assets/data/stripe_public_test.json`
- `netlify/functions/stripe_create_checkout_session.js`
- `netlify/functions/stripe_create_portal_session.js`
- `netlify/functions/stripe_webhook.js`
- `QA_REPORT_CP13.txt`

## CP14 — Netlify Deploy Method + Health Check + Admin Status
**Exit criteria**
- Netlify Functions health endpoint (`/api/health`) works on deployed site
- Master Admin status page exists (`/admin/status/`) to validate Functions + Stripe wiring
- Local demo fallback remains for QA preview zip (no Functions)
- Join + Business Start flows no longer break site JavaScript (syntax fixed)
- Service worker cache bumped to CP14

Artifacts
- `netlify/functions/health.js`
- `site/_redirects` (adds `/api/health`)
- `site/admin/status/index.html`
- `NETLIFY_DEPLOY_GUIDE.md`
- `QA_REPORT_CP14.txt`


## CP15 — Business Starter/Pro Tiering + Per-Location Quantity
**Exit criteria**
- Business pricing UI shows Starter + Pro and deep-links into the Business Start flow.
- Business Start captures tier, billing cycle, and location quantity.
- Stripe Checkout session function accepts `biz_tier` + `locations` and routes to correct price IDs.
- Clear error path when Starter price IDs are not yet configured.
- Service worker cache bumped to CP15.

Artifacts
- `site/for-gyms/pricing.html`
- `site/for-gyms/start.html`
- `site/assets/js/site.js`
- `site/assets/data/stripe_public_test.json`
- `netlify/functions/stripe_create_checkout_session.js`
- `QA_REPORT_CP15.txt`

## CP16 — Vimeo Thumbnail Overrides + Starter Price Auto-Discovery
**Exit criteria**
- Site supports `thumbnail_overrides.json` (video_id -> thumb URL) for sharper/better thumbnails.
- Added a local pipeline script to generate the overrides file using a Vimeo token (kept out of the repo).
- Business Starter can check out even if Starter price IDs weren't manually copied yet (auto-discovered via Starter product prices).
- Service worker cache bumped to CP16.

Artifacts
- `site/assets/data/thumbnail_overrides.json`
- `tools/vimeo_thumbnail_pipeline.py`
- `THUMBNAIL_PIPELINE.md`
- `netlify/functions/stripe_create_checkout_session.js`
- `QA_REPORT_CP16.txt`


## CP17 — Adjustments: Vimeo Reliability + Equipment Notes + HIIT Sections
**Exit criteria**
- Vimeo embed URLs consistently include the unlisted "h" hash when present.
- Member timer videos remain muted and control-less; hero and modal players have overlays.
- HIIT category page renders sections: HIIT (main), Max Cardio, Specials/Mash-Ups.
- Public HIIT preview shows 1 teaser per section (3 total).
- Equipment catalog + local equipment/notes flows exist (prototype localStorage).
- Service worker cache bumped to CP17.

Artifacts
- `site/assets/js/site.js`
- `site/workouts/category.html`
- `site/assets/data/equipment_catalog_v1.json`
- `site/sw.js`
- `QA_REPORT_CP17.txt` (see checkpoint packaging)

## CP18 — Billing Portal Without Supabase (Checkout Session Capture)
**Exit criteria**
- Successful Stripe Checkout returns to `/login.html?session_id={CHECKOUT_SESSION_ID}` and stores the Checkout Session ID.
- Member Account + Business Account pages include a Manage Billing button.
- Stripe Customer Portal session can be created using session_id (no customer_id required).
- Service worker cache bumped to CP18.

Artifacts
- `netlify/functions/stripe_create_portal_session.js`
- `site/assets/js/site.js`
- `site/app/account/index.html`
- `site/biz/account/index.html`
- `site/sw.js`
- `QA_REPORT_CP18.txt` (see checkpoint packaging)


## CP20 — Member Builder Random Filters + Cap Finisher Default
**Exit criteria**
- Member Timer Builder can randomize moves by muscle group filters: Upper, Lower, Total, Cardio, Abs/Core.
- Multiple filters can be combined (union by default), with an optional strict "require all" mode.
- Optional balance mode cycles selections (round-robin) so combos feel intentional.
- Member Timer cap behavior defaults to **finisher block** when the workout total is under the chosen cap.
- Service worker cache bumped to CP20.

Artifacts
- `site/app/timer/builder/index.html`
- `site/app/timer/index.html`
- `site/assets/js/site.js`
- `site/sw.js`
- `QA_REPORT_CP20.txt` (see checkpoint packaging)


## CP23 — Timer Polish: REST Preview + Cap-Filler + mm:ss Builder
**Exit criteria**
- Member Timer REST segments show upcoming move video (dimmed) with centered red countdown.
- Time Cap “finisher” supports a true cap-filler (multi-move) sequence using move videos filtered by muscle groups.
- Timer Builder Structure uses mm:ss inputs (minutes + seconds) and the layout has padding (no edge clipping).
- Gym Timer Builder duration inputs standardized to mm:ss.
- Footer build label normalized to CP23 to prevent QA confusion.

Artifacts
- `site/app/timer/index.html`
- `site/app/timer/builder/index.html`
- `site/biz/gym-timer/builder/index.html`
- `site/assets/js/site.js`
- `site/assets/css/styles.css`
- `QA_REPORT_CHECKPOINT_2026-02-11_23.txt` (see checkpoint packaging)


## CP25 — Site-wide Polish + Performance Hardening
**Exit criteria**
- Build label is dynamic and cannot drift
- Service worker uses network-first for HTML and SWR for assets/data
- Netlify security headers baseline added (CSP report-only)
- Global error handling prevents silent blank screens
- JSON loads are cache-busted per build and have timeouts
