# NDYRA Members Directory — CP102

Checkpoint intent
- Add the missing `/app/members/` member surface called for by the locked UI amendment.
- Scope the directory to the connected gym and keep it privacy-respecting.
- Support direct navigation into profile and message flows without introducing a global people search.

What shipped
- New route: `/app/members/`
- Local seed fallback: `site/assets/data/members_seed_public.json`
- Live mode: `get_tenant_member_directory(tenant_id, limit, offset)` RPC
- Filters: All / Can message / Staff / Following
- Actions: View profile, Message (routes to `/app/inbox/?start=<user_id>`)

Privacy / anti-drift
- Requires a connected gym to scope the list.
- No global people search was added.
- Uses server-side `can_message` output from the RPC; UI does not decide who can be messaged.

Notes
- In local preview, the page renders from seed data so the surface is QA-able without Supabase.
- In live mode, the Inbox page can now start a DM thread directly when given `?start=<user_id>`.
