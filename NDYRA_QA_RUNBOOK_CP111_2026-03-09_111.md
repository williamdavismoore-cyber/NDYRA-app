# NDYRA QA Runbook — CP111

## Goal
Validate messenger-style unread coherence across Member App Home, app chrome, Inbox, and Notifications.

## Local preview
1. Unzip the QA preview site zip.
2. Inside `site/`, run:
   - `python3 -m http.server 8080`
3. Open:
   - `http://localhost:8080/preview/`

## Quick checks
### 1) App chrome badges
- Open `/app/`
- Confirm **Inbox** and **Notifications** quick links appear in the header
- Confirm unread pills render from seed data

### 2) Notifications sync
- Open `/app/notifications/`
- Mark one notification as read
- Confirm header notification badge updates immediately without reload
- Mark all read
- Confirm badge drops to zero

### 3) Inbox sync
- Open `/app/inbox/`
- Confirm the page does **not** auto-open the first thread anymore
- Click an unread thread
- Confirm its unread count clears and the header inbox badge updates immediately

### 4) Home sync
- Go back to `/app/`
- Confirm the home cards for Notifications and Inbox match the current unread totals

## Live-mode checks
If Supabase is configured:
- Repeat the same flows signed in
- Confirm mark-read and thread-open behavior persist after refresh

## Expected result
CP111 should feel more like a real messenger product because unread state stays coherent everywhere.
