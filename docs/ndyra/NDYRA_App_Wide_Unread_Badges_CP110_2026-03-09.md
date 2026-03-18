# NDYRA App-Wide Unread Badges — CP110

CP110 turns unread activity into a first-class app signal instead of something buried inside Home.

## What changed
- Added a shared unread-count helper: `site/assets/js/ndyra/lib/unreadCounts.mjs`
- Refactored Member App Home to use the shared unread-count source instead of bespoke logic
- Upgraded `site/assets/js/site.js` to inject **Inbox** and **Notifications** quick links with unread badges into the header nav on `/app/*` routes
- Live mode uses Supabase counts for:
  - unread notifications
  - unread DM threads
  - pending message requests
- Local preview falls back to deterministic seed counts

## Why it matters
This is the first real step toward an NDYRA-native messenger feel at the app-wide chrome level:
- members can see activity pressure without drilling into Home
- notifications/inbox become ambient, not buried
- local QA preview still shows realistic behavior without pretending live services exist

## Files added
- `site/assets/js/ndyra/lib/unreadCounts.mjs`

## Files updated
- `site/assets/js/site.js`
- `site/assets/js/ndyra/pages/appHome.mjs`
- `site/assets/build.json`
- `site/sw.js`
