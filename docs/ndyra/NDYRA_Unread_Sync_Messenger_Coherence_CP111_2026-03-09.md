# NDYRA Unread Sync + Messenger Coherence — CP111

## Intent
CP111 tightens the messenger-style experience by making unread state feel alive instead of stale. The goal is that Inbox and Notifications badges update immediately after member actions without needing a hard refresh.

## What changed
- Added event-based unread count helpers in `site/assets/js/ndyra/lib/unreadCounts.mjs`
- Updated `site/assets/js/site.js` to subscribe to live unread changes for `/app/*` chrome badges
- Updated Member App Home to subscribe to unread changes
- Notifications now sync unread badge state immediately after mark-one / mark-all / open-in-place actions
- Inbox no longer auto-opens the first thread by default, preventing accidental unread clearing
- Inbox now syncs unread badge state immediately after opening a thread that had unread messages

## Why it matters
This checkpoint makes NDYRA's Inbox feel more like a real messenger product:
- opening the inbox no longer silently clears the first conversation
- unread counts stay coherent between Home, header chrome, Notifications, and Inbox
- local preview behaves more like live mode instead of feeling fake

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS
