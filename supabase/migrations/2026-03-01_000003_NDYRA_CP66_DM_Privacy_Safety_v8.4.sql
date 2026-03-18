-- =========================================================
-- NDYRA CP66 — DM Privacy Controls + Safety Actions
-- Build: 2026-03-01_66
--
-- Adds:
--  • privacy_settings.dm_allow (off|mutual|gym|mutual_or_gym|anyone)
--  • can_dm_user() respects recipient DM policy
--  • get_tenant_member_directory() returns can_message (server-side)
-- =========================================================

-- 1) Privacy settings: DM allow policy
alter table public.privacy_settings
  add column if not exists dm_allow text not null default 'mutual_or_gym';

comment on column public.privacy_settings.dm_allow is
  'Who can start a DM with you: off|mutual|gym|mutual_or_gym|anyone. Blocks always override.';


-- 2) Update can_dm_user(other) to respect recipient DM policy
create or replace function public.can_dm_user(p_other_user_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  other uuid := p_other_user_id;
  mutual_follow boolean := false;
  shared_membership boolean := false;
  staff_to_member boolean := false;
  other_dm_allow text := 'mutual_or_gym';
begin
  if viewer is null or other is null or other = viewer then
    return false;
  end if;

  -- Respect blocks
  if public.is_blocked_between(viewer, other) then
    return false;
  end if;

  if public.is_platform_admin() then
    return true;
  end if;

  -- Recipient DM policy (defaults to mutual_or_gym)
  select ps.dm_allow
    into other_dm_allow
  from public.privacy_settings ps
  where ps.user_id = other;

  other_dm_allow := coalesce(nullif(trim(other_dm_allow),''), 'mutual_or_gym');

  -- Mutual follow
  select (
    exists(select 1 from public.follows_users a where a.follower_id = viewer and a.followee_id = other)
    and exists(select 1 from public.follows_users b where b.follower_id = other and b.followee_id = viewer)
  ) into mutual_follow;

  -- Shared active membership (if gym_memberships exists)
  if to_regclass('public.gym_memberships') is not null then
    select exists(
      select 1
      from public.gym_memberships gm1
      join public.gym_memberships gm2
        on gm1.tenant_id = gm2.tenant_id
      where gm1.user_id = viewer
        and gm2.user_id = other
        and gm1.status in ('active','comp','past_due','paused')
        and gm2.status in ('active','comp','past_due','paused')
      limit 1
    ) into shared_membership;
  end if;

  -- Staff -> member (if tenant_users + gym_memberships exist)
  if to_regclass('public.tenant_users') is not null and to_regclass('public.gym_memberships') is not null then
    select exists(
      select 1
      from public.tenant_users tu
      join public.gym_memberships gm
        on gm.tenant_id = tu.tenant_id
      where tu.user_id = viewer
        and tu.role in ('admin','staff')
        and gm.user_id = other
        and gm.status in ('active','comp','past_due','paused')
      limit 1
    ) into staff_to_member;
  end if;

  -- Apply recipient DM policy
  if other_dm_allow = 'off' then
    return staff_to_member;
  end if;

  if other_dm_allow = 'mutual' then
    return mutual_follow or staff_to_member;
  end if;

  if other_dm_allow = 'gym' then
    return shared_membership or staff_to_member;
  end if;

  if other_dm_allow = 'anyone' then
    return true;
  end if;

  -- default: mutual_or_gym
  return mutual_follow or shared_membership or staff_to_member;
end $$;

grant execute on function public.can_dm_user(uuid) to authenticated;


-- 3) Tenant member directory: include can_message (server-side)
-- Note: we must drop + recreate because RETURNS TABLE signature changes.
drop function if exists public.get_tenant_member_directory(uuid, int, int);

create function public.get_tenant_member_directory(
  p_tenant_id uuid,
  p_limit int default 60,
  p_offset int default 0
)
returns table(
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  is_staff boolean,
  is_following boolean,
  can_message boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(0, least(coalesce(p_limit, 60), 200));
  off int := greatest(0, coalesce(p_offset, 0));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if p_tenant_id is null then
    return;
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_staff(p_tenant_id)
    or public.is_tenant_member(p_tenant_id)
  ) then
    raise exception 'forbidden';
  end if;

  return query
    with member_ids as (
      select gm.user_id
      from public.gym_memberships gm
      where gm.tenant_id = p_tenant_id
        and gm.status in ('active','comp','past_due','paused')
    )
    select
      m.user_id,
      p.handle,
      coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), '@member') as display_name,
      p.avatar_url,
      case
        when to_regclass('public.tenant_users') is null then false
        else exists(
          select 1
          from public.tenant_users tu
          where tu.tenant_id = p_tenant_id
            and tu.user_id = m.user_id
            and tu.role in ('admin','staff')
        )
      end as is_staff,
      exists(
        select 1
        from public.follows_users fu
        where fu.follower_id = viewer
          and fu.followee_id = m.user_id
      ) as is_following,
      case
        when m.user_id = viewer then false
        else public.can_dm_user(m.user_id)
      end as can_message
    from member_ids m
    left join public.profiles p on p.user_id = m.user_id
    where not public.is_blocked_between(viewer, m.user_id)
    order by lower(coalesce(p.display_name, p.full_name, p.handle, p.email)) asc nulls last
    limit lim
    offset off;
end $$;

grant execute on function public.get_tenant_member_directory(uuid, int, int) to authenticated;
