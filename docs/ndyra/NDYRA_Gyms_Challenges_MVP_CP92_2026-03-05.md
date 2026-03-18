# NDYRA CP92 – Gyms + Challenges MVP

This checkpoint adds a clean “connected gym” selector for members and a first-pass challenge board UI.

## What shipped

### Member: Gyms
- Route: `/app/gyms/`
- Purpose: pick a “connected gym” (tenant) that scopes certain member experiences (challenges first; events next).
- Shows:
  - connected gym badge
  - list of gyms (tenants)
  - membership status (if a gym_membership exists for the current user)

### Member: Challenges
- Route: `/app/challenges/`
- Purpose: mix “Zen consistency” with “hardcore rank”.
- Uses Supabase RPCs:
  - `get_active_challenges(p_tenant_id)`
  - `get_challenge_tasks(p_challenge_id)`
  - `get_challenge_leaderboard(p_challenge_id, p_limit)`
  - `join_challenge(p_challenge_id)`
  - `log_challenge_activity(p_challenge_id, p_task_key, p_units)`

### Admin/Staff helper: comp membership
- New RPC: `grant_comp_membership(p_tenant_id uuid, p_user_id uuid default auth.uid())`
- Intent: QA + support workflows where Stripe isn’t involved.
- Security:
  - Only platform admins OR tenant staff can grant.
  - If membership is already `active`, it is not overridden.

### BizGym boundary stubs
To prevent route 404s while BizGym is being developed as an external module, this checkpoint adds contract-aligned stubs:
- `/biz/schedule/`
- `/biz/settings/`
- `/biz/check-in/kiosk/`
- `/biz/check-in/live/`

## Notes
- Challenges require gym membership in the connected gym (enforced by DB/RLS).
- If the user is not a member, the Challenges page will explain why and point back to Gyms/Billing.
