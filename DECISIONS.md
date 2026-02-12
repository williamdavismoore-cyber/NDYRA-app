# Decision Log (HIIT56)

Format:
- Date
- Decision
- Why
- Alternatives considered
- Impact

## 2026-__-__ — (Template)
- Decision:
- Why:
- Alternatives:
- Impact:

## 2026-02-07 — Teaser-limited public workout detail pages
- Decision: Public workout detail pages only play videos whose Vimeo IDs are listed in `teaser_video_ids` in `categories_v1.json`.
- Why: Prevent “querystring guessing” from exposing the full library before real auth is wired.
- Alternatives: No workout detail page in public mode; or allow all videos (not acceptable).
- Impact: Public pages remain conversion-friendly while preserving the membership unlock concept.

## 2026-02-07 — Business-only Move Library (demo gate)
- Decision: Gate `/biz/moves/*` behind the demo Business role until Supabase auth is implemented.
- Why: You requested Admin/Staff-only move preview; this enforces the UX flow now without blocking QA.
- Alternatives: Keep pages public and rely on “trust”.
- Impact: Clear separation between Member and Business flows today, simple to swap to real auth later.

## 2026-02-07 — Timer beeps via Web Audio + localStorage volume
- Decision: Implement timer beeps using the Web Audio API (oscillator + gain) and store the volume (0..1) in localStorage.
- Why: Works on desktop and mobile (after a user gesture), avoids shipping audio asset files early, and supports a “volume slider” requirement immediately.
- Alternatives: Pre-recorded beep WAV assets; platform-native audio (requires native app wrapper); vibrate-only.
- Impact: Timer pages require a tap (Start/Test Beep) to enable sound on iOS/Android browsers; later we can swap to branded audio assets without changing timer logic.

## 2026-02-07 — Time-cap solver uses minima per segment type
- Decision: When reducing a timeline to hit a cap, segments have minimum duration floors (work/rest/transitions) to prevent negative or unusable timing.
- Why: The “time cap” feature must be reliable even when the cap is aggressive.
- Alternatives: Allow zero-length segments; reject caps that are too small; only scale work segments.
- Impact: Some caps cannot be reached if the workout hits minimum floors; UI reports this condition.

## 2026-02-07 — Category Taxonomy v1 locked (owner-approved)
- Decision: Replace draft categories with the owner-approved canonical set (HIIT, HIIT Beginner, HIIT Upper/Lower/Total, Max Cardio HIIT, Heavy HIIT, HIIT 21, HIIT Kickboxing, Stretch & Recovery, Ab Lab, HIIT Yoga, Yoga Flow, Kids HIIT Funhouse, Challenges).
- Why: The member library and public previews must use the real category names; “Other/Unsorted” and “HIIT Class Archives” are not real categories.
- Alternatives: Keep draft buckets; maintain multiple parallel taxonomies.
- Impact: Old slugs (hiit56-*, x-fit, insanity-21, fit-as-a-fighter) are treated as aliases/legacy; the UI now uses `categories_v1.json`.

## 2026-02-07 — Fold HIIT Class Archives + eliminate Other/Unsorted
- Decision: Fold the 97 “HIIT Class | ...” archive titles into HIIT/Upper/Lower/Total based on keywords; manually assign the 6 “Other/Unsorted” titles per owner instruction.
- Why: Removes dead-end buckets and ensures every prerecorded class resolves to a real, marketable category.
- Alternatives: Keep archives/unsorted as hidden categories.
- Impact: Category counts shift (notably HIIT grows); no more “Other/Unsorted” or “HIIT Class Archives” categories appear in the app.

## 2026-02-07 — Use Vimeo thumbnail_url for card thumbnails
- Decision: Use the `thumbnail_url` field from the provided video inventory CSV as the source of truth for list card thumbnails.
- Why: This provides a “best frame” per video immediately without building a custom frame selector.
- Alternatives: Extract frames server-side; build a manual thumbnail picker UI; use a single placeholder thumbnail.
- Impact: Thumbnail quality depends on the frame set on Vimeo; later we can add per-video overrides in Admin.

## 2026-02-07 — Increase header logo size by 25%
- Decision: Increase the header logo height from 34px to 43px (+25%).
- Why: Improve brand presence and readability on mobile.
- Alternatives: Increase only on desktop; use a bigger wordmark variant.
- Impact: Slightly larger header height; no layout breakage (responsive verified).


## 2026-02-07 — Multi-tenant Business portal scaffold (demo tenancy selector)
- Decision: Introduce a tenant selector and expanded role set (biz_staff, biz_admin, super_admin) in the demo login, and require a tenant context to view `/biz/*` pages (demo guard).
- Why: You clarified that the Business side must be a paid portal for many businesses, each with a private workspace, and you need Master Admin across everything.
- Alternatives: Keep a single Business role until backend; hardcode one tenant (HIIT56 only).
- Impact: We can QA the multi-tenant UX now; Supabase will later enforce tenant privacy with RLS.

## 2026-02-07 — Add pricing pages now, wire Stripe later
- Decision: Ship public pricing pages for both tiers (Member + Business) using placeholder pricing config (`pricing_v1.json`) while waiting for Stripe price IDs.
- Why: Allows conversion flow + IA to solidify without blocking on payment plumbing.
- Alternatives: Hide pricing until Stripe wiring; use a simple text-only pricing section on homepage.
- Impact: UI + routes are stable; later we swap in Stripe Checkout/Payment Links without reorganizing site structure.

## 2026-02-07 — Category hero + teaser picks sourced from the latest 10 videos per category
- Decision: Auto-select the category hero and teaser IDs from the latest 10 class uploads per category (until dedicated hero loops are provided).
- Why: You requested that sample videos be pulled from recent uploads to keep the library feeling “alive”.
- Alternatives: Always use dedicated hero clips; keep the previous static teaser IDs forever.
- Impact: Category pages stay fresh; later Master Admin can pin/override hero picks per category.
## 2026-02-09 — Deploy via Netlify Git/CLI (Functions), not Drop for production
- Decision: Use a Netlify site connected to Git (or Netlify CLI deploy) for the primary desktop/web deployment so Netlify Functions ship with every deploy.
- Why: Stripe Checkout + webhooks require server-side endpoints (`/api/*`). Netlify Drop is useful for UI previews, but it does not reliably keep Functions wired.
- Alternatives: Netlify Drop only; host on another platform; use Stripe Payment Links only (no Functions).
- Impact: Checkpoints still ship Drop zips for quick UI QA, but production/staging should be deployed via Netlify with env vars + Functions enabled.


## 2026-02-09 — Business Starter/Pro tiers + per-location quantity
- Decision: Present Business pricing as Starter + Pro, billed per-location (quantity at checkout).
- Why: Matches your multi-business portal model and allows gyms with multiple locations to scale cleanly.
- Alternatives: Single Business plan; per-seat billing; hardcode 1 location.
- Impact: Stripe Checkout payload now includes `biz_tier` + `locations`. Starter requires its Stripe price IDs to be added before checkout can be enabled.


## 2026-02-09 — Thumbnail overrides via static map + local Vimeo pipeline
- Decision: Add `thumbnail_overrides.json` (video_id -> thumbnail URL) and load it in the site renderer before drawing video cards.
- Why: You want “best frame” style thumbnails without manually curating hundreds. A static map keeps the frontend fast and avoids runtime Vimeo API calls.
- Alternatives: Build an in-app manual thumbnail picker; call Vimeo API at runtime; upload custom thumbnails to every Vimeo video.
- Impact: We can run a local script using your Vimeo token to auto-pick thumbnails, then redeploy. Manual overrides stay possible later.

## 2026-02-09 — Auto-discover Business Starter prices by Product ID
- Decision: If Business Starter `price_...` IDs aren’t set yet, the Netlify checkout function will query Stripe for active prices on the Starter product and select the monthly/annual price based on recurring interval.
- Why: Prevents checkout from blocking when price IDs haven’t been copied into Netlify env vars yet.
- Alternatives: Hard-require price IDs; use Payment Links; delay Starter tier.
- Impact: Starter checkout can work sooner, while still allowing explicit env var overrides for precision.
