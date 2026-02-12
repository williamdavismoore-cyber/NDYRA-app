# Tracking Plan (GTM + GA4)

## Global
- page_view (default)
- scroll_depth (optional)

## Conversion events (public)
- view_pricing
- click_checkout
- checkout_started
- checkout_completed
- kickstart_signup
- newsletter_signup (if used)

## App engagement events (members)
- login
- workout_play
- workout_complete
- program_start
- playlist_create
- playlist_add_item
- playlist_reorder

## Event payload standard
Include:
- user_status: anonymous | lead | member
- page_type: marketing | app
- content_id / workout_slug (where relevant)
