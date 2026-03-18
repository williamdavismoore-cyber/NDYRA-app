# NDYRA QA RUNBOOK — CP108

## Goal
Validate that the follow graph is visible and actionable from user-facing surfaces.

## Local preview
1. Unzip the QA Preview Site zip.
2. Run `python -m http.server 8080` inside the `site/` folder.
3. Open `http://localhost:8080/app/`.

## Fast visual checks
- Open **Members** and verify each card shows:
  - View profile
  - Follow / Unfollow
  - Message / Cannot message
- Open a member **Profile** using `?u=<id>` and verify follow/unfollow appears for non-self profiles.
- Open **Gyms** and verify each gym shows:
  - Connect
  - Follow / Unfollow

## Live checks (requires real auth + Supabase)
- Sign in
- Follow a member from Members
- Confirm the state flips to Unfollow
- Open that member's profile and confirm the button reflects the same state
- Follow a gym from Gyms
- Confirm the button reflects the followed state
- Open Following feed and verify it can now be user-curated using the surfaced follow actions

## Expected limitations in local preview
- Writes are not expected to persist without live auth / Supabase
- Preview mode may show sign-in-required toasts for follow actions
