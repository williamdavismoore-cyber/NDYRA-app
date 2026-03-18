-- =========================================================
-- NDYRA CP57 — Connected Gym persistence + Member Directory + Constellation Biz tools
-- Build ID: 2026-02-27_57
-- Blueprint: UI Emulation + Active Now + Constellation placement
-- =========================================================

-- ---------------------------------------------------------
-- 1) Privacy settings: persist Connected Gym
-- ---------------------------------------------------------
alter table public.privacy_settings
  add column if not exists connected_tenant_id uuid references public.tenants(id) on delete set null;

alter table public.privacy_settings
  add column if not exists connected_updated_at timestamptz not null default now();

comment on column public.privacy_settings.connected_tenant_id is 'User-selected Connected Gym (tenant) for scoped discovery + Active Now.';
comment on column public.privacy_settings.connected_updated_at is 'Timestamp of last Connected Gym selection.';

-- Convenience RPC (optional, keeps client logic clean)
create or replace function public.set_connected_tenant(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'auth_required';
  end if;

  insert into public.privacy_settings(user_id, connected_tenant_id, connected_updated_at)
  values(uid, p_tenant_id, now())
  on conflict (user_id) do update
    set connected_tenant_id = excluded.connected_tenant_id,
        connected_updated_at = excluded.connected_updated_at;

  return true;
end $$;

grant execute on function public.set_connected_tenant(uuid) to authenticated;

-- ---------------------------------------------------------
-- 2) Tenant-scoped Member Directory (RLS-safe)
--   - Only members/staff/admin of the tenant can call
--   - Returns minimal profile fields (no billing)
--   - Excludes blocked users
-- ---------------------------------------------------------
create or replace function public.get_tenant_member_directory(
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
  is_following boolean
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
      ) as is_following
    from member_ids m
    left join public.profiles p on p.user_id = m.user_id
    where not public.is_blocked_between(viewer, m.user_id)
    order by lower(coalesce(p.display_name, p.full_name, p.handle, p.email)) asc nulls last
    limit lim
    offset off;
end $$;

grant execute on function public.get_tenant_member_directory(uuid, int, int) to authenticated;

-- ---------------------------------------------------------
-- 3) Constellation trend RPC (staff/admin)
--   - Used by Biz Dashboard to render a simple trend sparkline
-- ---------------------------------------------------------
create or replace function public.get_gym_rating_trend(
  p_tenant_id uuid,
  p_days int default 30
)
returns table(
  day date,
  avg_overall numeric(3,2),
  rating_events int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  days int := greatest(1, least(coalesce(p_days, 30), 180));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if p_tenant_id is null then
    return;
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id)) then
    raise exception 'forbidden';
  end if;

  return query
    select
      (h.created_at at time zone 'utc')::date as day,
      round(avg(h.overall)::numeric, 2) as avg_overall,
      count(*)::int as rating_events
    from public.gym_rating_history h
    join public.gym_ratings r on r.id = h.rating_id
    where h.tenant_id = p_tenant_id
      and h.created_at >= now() - make_interval(days => days)
      and r.status = 'active'
    group by 1
    order by 1 asc;
end $$;

grant execute on function public.get_gym_rating_trend(uuid, int) to authenticated;

-- ---------------------------------------------------------
-- 4) Biz Settings: toggle rating prompts (staff/admin)
-- ---------------------------------------------------------
create or replace function public.set_tenant_disable_rating_prompts(
  p_tenant_id uuid,
  p_disabled boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_required';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id)) then
    raise exception 'forbidden';
  end if;

  update public.tenants
    set kill_switch_disable_rating_prompts = coalesce(p_disabled, false)
  where id = p_tenant_id;

  return true;
end $$;

grant execute on function public.set_tenant_disable_rating_prompts(uuid, boolean) to authenticated;
