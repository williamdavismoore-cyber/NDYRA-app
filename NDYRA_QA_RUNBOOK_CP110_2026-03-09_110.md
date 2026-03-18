# NDYRA QA Runbook — CP110

## Goal
Validate the new **app-wide unread badge** behavior for Inbox and Notifications while confirming the prior CP109 social/detail surfaces still work.

## Local preview
1. Unzip the **QA Preview Site** package.
2. Open a terminal in the extracted `site` folder.
3. Run:
   ```bash
   python -m http.server 8080
   ```
4. Open:
   - `http://localhost:8080/preview/`
   - `http://localhost:8080/app/`

## Fast checks
### 1) Member App Home
Open `/app/`
- Confirm the **Notifications** card shows an unread badge in preview mode.
- Confirm the **Inbox** card shows an unread badge in preview mode.

### 2) App-wide header badges
Open any of these pages:
- `/app/notifications/`
- `/app/inbox/`
- `/app/shop/`
- `/app/members/`

Confirm the header nav now includes:
- Notifications + unread badge
- Inbox + unread badge

### 3) Current-page highlight
- On `/app/notifications/`, Notifications link should be highlighted.
- On `/app/inbox/`, Inbox link should be highlighted.

### 4) Seed fallback sanity
With no live config, badges should still appear from seed counts.
No dead errors should appear in console.

### 5) Regression sweep
Quickly smoke:
- `/app/post/?id=post_seed_101`
- `/app/following/`
- `/app/signals/`
- `/app/profile/`
- `/app/aftermath/`

## Live-mode checks (optional)
If Supabase is wired:
- Sign in
- Create unread notifications / unread DM state
- Confirm app-wide header badges reflect live counts instead of seed counts

## Expected result
CP110 should feel more messenger-like because activity is surfaced at the top chrome level, not buried only in Member App Home.
