# NDYRA Buildbook — MemoryPack

**CP111 • Build 2026-03-09_111 • Kit v10.2**

## Checkpoint intent
CP111 is a messenger-coherence checkpoint. It tightens unread-state behavior across the app so Inbox and Notifications feel live and intentional instead of static or stale.

## High-impact changes
- Added event-based unread count publishing/subscription in `site/assets/js/ndyra/lib/unreadCounts.mjs`
- Updated `site/assets/js/site.js` so app chrome badges react immediately to unread changes
- Updated `site/assets/js/ndyra/pages/appHome.mjs` so Member App Home badges stay in sync
- Notifications now sync unread badges after mark-one / mark-all / open actions
- Inbox no longer auto-opens the first thread by default, preventing accidental read clearing
- Inbox now syncs unread counts immediately after an unread thread is opened

## QA
- build_stamp PASS
- qa_smoke PASS
- qa_super PASS
- brand_gate_check PASS
- ip_gate_check PASS

## Generated graphics
- None

## Next
CP112 should focus on live environment execution and final deployment hardening, or on polishing the inbox thread experience further (thread pinning, better empty states, stronger accessibility).
