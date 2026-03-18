# NDYRA — Assets Needed Next (CP81)

This list includes **(1) inputs we still need from you** and **(2) every graphic currently in the repo that appears to be placeholder / generated** so you can remake/replace them anytime.

CP80 note: **No new “generated art” was added** (billing surfaces were UI-only).

---

## 1) Inputs we still need from you (highest priority)

### Stripe (real wiring)
- Stripe publishable key (live) + confirm test vs live for CP81 rollout
- Stripe secret key (live)
- Stripe webhook signing secret (live)
- Price IDs (final):
  - Member monthly / annual
  - Business Starter monthly / annual
  - Business Pro monthly / annual
- If you want a custom customer portal configuration: Stripe Portal Configuration ID

### Supabase (real wiring)
- Supabase project URL (live)
- Supabase anon/publishable key (live)
- Supabase service role key (live) — server-side only (Netlify Functions)

### Netlify / Git
- Netlify site name (or confirmation we’re creating a new site)
- Environment variable naming preference (we currently accept both VITE_* and standard SUPABASE_* / STRIPE_*)

---

## 2) “Generated / Placeholder” graphics currently in the repo (remake targets)

If you didn’t explicitly supply these files, treat them as **temporary art** that you can replace with final brand assets whenever you want.

### Branding / favicon / install icons
- site/favicon.ico
- site/favicon-16.png
- site/favicon-32.png
- site/favicon-48.png
- site/apple-touch-icon.png
- site/apple-touch-icon-180.png
- site/assets/branding/favicon.ico
- site/assets/branding/favicon-16.png
- site/assets/branding/favicon-32.png
- site/assets/branding/favicon-48.png
- site/assets/branding/apple-touch-icon-180.png
- site/assets/branding/app-icon-192.png
- site/assets/branding/app-icon-512.png
- site/assets/branding/app-icon-1024.png
- site/assets/branding/site.webmanifest

### Texture tiles (rarity + graphite)
- site/assets/branding/textures/graphite_tile_512.png
- site/assets/branding/textures/badge_common_tile_512.png
- site/assets/branding/textures/badge_rare_tile_512.png
- site/assets/branding/textures/badge_epic_tile_512.png
- site/assets/branding/textures/badge_legendary_tile_512.png

### Share overlays (IG-ready)
- site/assets/share/overlays/qr_corner_badge.png
- site/assets/share/overlays/confetti_overlay.png
- site/assets/share/overlays/grit_overlay.png
- site/assets/share/overlays/crown_overlay.png
- site/assets/share/overlays/confetti_tile_512.png

### IG Story backgrounds (templates)
- site/assets/share/ig_story/season_recap_balanced_bg.png
- site/assets/share/ig_story/season_recap_competitive_bg.png
- site/assets/share/ig_story/season_recap_zen_bg.png
- site/assets/share/ig_story/trophy_earned_bg.png
- site/assets/share/ig_story/trophy_earned_competitive_bg.png
- site/assets/share/ig_story/trophy_earned_zen_bg.png
- site/assets/share/ig_story/badge_unlocked_bg.png
- site/assets/share/ig_story/badge_unlocked_competitive_bg.png
- site/assets/share/ig_story/badge_unlocked_zen_bg.png
- site/assets/share/ig_story/event_share_competitive_bg.png
- site/assets/share/ig_story/event_share_zen_bg.png
- site/assets/share/ig_story/challenge_invite_competitive_bg.png
- site/assets/share/ig_story/challenge_invite_balanced_bg.png
- site/assets/share/ig_story/challenge_invite_zen_bg.png
- site/assets/share/ig_story/aftermath_balanced_bg.png
- site/assets/share/ig_story/aftermath_competitive_bg.png
- site/assets/share/ig_story/aftermath_zen_bg.png
- site/assets/share/ig_story/streak_milestone_balanced_bg.png
- site/assets/share/ig_story/streak_milestone_competitive_bg.png
- site/assets/share/ig_story/streak_milestone_zen_bg.png
- site/assets/share/ig_story/streak_protected_balanced_bg.png
- site/assets/share/ig_story/streak_protected_competitive_bg.png
- site/assets/share/ig_story/streak_protected_zen_bg.png
- site/assets/share/ig_story/streak_back_balanced_bg.png
- site/assets/share/ig_story/streak_back_competitive_bg.png
- site/assets/share/ig_story/streak_back_zen_bg.png

### Empty-state illustrations
- site/assets/branding/empty_states/feed_empty_960x540.png
- site/assets/branding/empty_states/followers_empty_960x540.png
- site/assets/branding/empty_states/notifications_empty_960x540.png
- site/assets/branding/empty_states/inbox_requests_empty_960x540.png
- site/assets/branding/empty_states/trophies_empty_960x540.png

### Integration icons (created in CP79)
- site/assets/branding/integrations/integration_supabase.svg
- site/assets/branding/integrations/integration_stripe.svg
- site/assets/branding/integrations/integration_netlify.svg
- site/assets/branding/integrations/integration_git.svg

---

## Notes
- Anything under `site/assets/branding/` and `site/assets/share/` is safe to replace (presentation only), as long as the filenames remain the same.
- If you want to rename files, we’ll update references in CSS + share template generators.
