# NDYRA QA RUNBOOK — CP109

## Goal
Validate that `/app/post/` is now a real social detail surface and that shared Aftermath recaps open the post when a social post exists.

## Local preview
1. Unzip the QA Preview Site zip.
2. Run `python -m http.server 8080` inside the `site/` folder.
3. Open `http://localhost:8080/app/`.

## Fast visual checks
- Open **Post Detail** from Member App Home.
- Verify the page renders:
  - author block
  - post body
  - reaction chips
  - comments section
- Open **For You** and confirm entries with a `shared_post_id` show **Open post** instead of just **Open**.
- Open **Following** and confirm the same behavior.
- Open **Profile** and confirm visible recaps with a `shared_post_id` open the post.

## Live checks (requires real auth + Supabase)
- Sign in.
- Open a real post via `/app/post/?id=<uuid>`.
- Add a comment and confirm it appears immediately.
- Click Fire / Clap / Flex and confirm counts refresh.
- If the post came from an Aftermath share, confirm **Open aftermath** appears.

## Expected limitations in local preview
- Reactions and comments do not persist in preview mode.
- Preview uses `post_seed_public.json` instead of live DB rows.
- Private/follower visibility behavior is only authoritative in live mode.
