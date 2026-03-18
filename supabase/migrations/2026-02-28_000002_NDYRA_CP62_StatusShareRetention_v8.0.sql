-- =========================================================
-- NDYRA CP62 — Status + Share + Retention
-- Build: 2026-02-28_62
-- =========================================================
-- Adds:
--  • privacy_settings.trophies_visibility (private/followers/public)
--  • privacy_settings.streak_nudges_enabled (optional dopamine drip)
--  • user_badges.visibility (inherit/private/followers/public) + update policy
--  • get_trophy_cabinet() expanded to support viewing others safely
--  • get_my_challenge_rank() helper RPC for season recap cards
-- =========================================================

-- 1) privacy settings additions
alter table public.privacy_settings
  add column if not exists trophies_visibility text not null default 'followers',
  add column if not exists streak_nudges_enabled boolean not null default true;

comment on column public.privacy_settings.trophies_visibility is
  'Who can view your trophy cabinet: private|followers|public (default followers).';

comment on column public.privacy_settings.streak_nudges_enabled is
  'If true, the UI may show in-app streak nudge prompts for active challenges.';

-- 2) user_badges additions
alter table public.user_badges
  add column if not exists visibility text not null default 'inherit';

comment on column public.user_badges.visibility is
  'Per-trophy override: inherit|private|followers|public. Inherit uses privacy_settings.trophies_visibility.';

-- Allow users to adjust visibility for their own trophies
drop policy if exists "user_badges_update_own" on public.user_badges;
create policy "user_badges_update_own"
on public.user_badges
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 3) get_trophy_cabinet updated (supports viewing others when allowed)
drop function if exists public.get_trophy_cabinet(uuid, int);

create function public.get_trophy_cabinet(p_user_id uuid default null, p_limit int default 100)
returns table(
  user_badge_id uuid,
  badge_key text,
  title text,
  description text,
  icon text,
  rarity text,
  awarded_at timestamptz,
  source_type text,
  source_id uuid,
  meta jsonb,
  visibility text,
  effective_visibility text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  uid uuid := coalesce(p_user_id, viewer);
  lim int := greatest(1, least(coalesce(p_limit, 100), 200));
  cabinet_vis text := 'followers';
  follows boolean := false;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  -- Respect blocks
  if uid <> viewer and public.is_blocked_between(viewer, uid) then
    -- Return empty set (do not leak existence)
    return;
  end if;

  select ps.trophies_visibility
    into cabinet_vis
  from public.privacy_settings ps
  where ps.user_id = uid;

  cabinet_vis := coalesce(nullif(trim(cabinet_vis),''), 'followers');

  if uid <> viewer then
    select exists(
      select 1 from public.follows_users f
      where f.follower_id = viewer
        and f.followee_id = uid
    ) into follows;
  end if;

  return query
  select
    ub.id as user_badge_id,
    ub.badge_key,
    b.title,
    b.description,
    b.icon,
    b.rarity,
    ub.awarded_at,
    ub.source_type,
    ub.source_id,
    ub.meta,
    ub.visibility,
    case
      when ub.visibility is null or ub.visibility = 'inherit' then cabinet_vis
      else ub.visibility
    end as effective_visibility
  from public.user_badges ub
  join public.badges b on b.key = ub.badge_key
  where ub.user_id = uid
    and (
      uid = viewer
      or public.is_platform_admin()
      or (
        case
          when (case when ub.visibility is null or ub.visibility='inherit' then cabinet_vis else ub.visibility end) = 'public'
            then true
          when (case when ub.visibility is null or ub.visibility='inherit' then cabinet_vis else ub.visibility end) = 'followers'
            then follows
          else false
        end
      )
    )
  order by ub.awarded_at desc
  limit lim;
end $$;

grant execute on function public.get_trophy_cabinet(uuid, int) to authenticated;

-- 4) Challenge helper RPC for recap cards (rank + participant count)
create or replace function public.get_my_challenge_rank(p_challenge_id uuid)
returns table(
  challenge_id uuid,
  user_id uuid,
  total_points int,
  rank int,
  participant_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tid uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select c.tenant_id into tid
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(tid) or public.is_tenant_member(tid)) then
    raise exception 'forbidden';
  end if;

  return query
  with ranked as (
    select
      cp.user_id,
      cp.total_points,
      dense_rank() over(order by cp.total_points desc, cp.updated_at desc) as rnk
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
  )
  select
    p_challenge_id as challenge_id,
    viewer as user_id,
    coalesce((select cp.total_points from public.challenge_participants cp where cp.challenge_id = p_challenge_id and cp.user_id = viewer), 0) as total_points,
    (select r.rnk from ranked r where r.user_id = viewer)::int as rank,
    (select count(*) from public.challenge_participants cp where cp.challenge_id = p_challenge_id)::int as participant_count;
end $$;

grant execute on function public.get_my_challenge_rank(uuid) to authenticated;
