-- =========================================================
-- NDYRA CP60 — Biz Tenant Picker + Constellation Feedback + Challenges Builder
-- Build ID: 2026-02-28_60
-- Intent:
--   • Remove UUID friction in /biz by providing a staff tenant picker RPC
--   • Surface Constellation internal feedback notes for staff/admin
--   • Add custom Season Challenge creation RPC (atomic create + tasks)
--   • Extend get_active_challenges() to include drafts for staff/admin
-- =========================================================

-- ---------------------------------------------------------
-- 1) Staff tenant picker (biz UX)
-- ---------------------------------------------------------
create or replace function public.get_my_staff_tenants(
  p_limit int default 50
)
returns table(
  tenant_id uuid,
  slug text,
  name text,
  role text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(0, least(coalesce(p_limit, 50), 200));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  -- If tenant_users isn't installed in the target database, return empty.
  if to_regclass('public.tenant_users') is null then
    return;
  end if;

  -- Platform admins can see all tenants.
  if public.is_platform_admin() then
    return query
      select t.id as tenant_id, t.slug, t.name, 'admin'::text as role
      from public.tenants t
      order by lower(coalesce(t.name, t.slug)) asc
      limit lim;
    return;
  end if;

  return query
    select tu.tenant_id, t.slug, t.name, tu.role
    from public.tenant_users tu
    join public.tenants t on t.id = tu.tenant_id
    where tu.user_id = viewer
      and tu.role in ('admin','staff')
    order by
      case when tu.role = 'admin' then 0 else 1 end,
      lower(coalesce(t.name, t.slug)) asc
    limit lim;
end $$;

grant execute on function public.get_my_staff_tenants(int) to authenticated;

-- ---------------------------------------------------------
-- 2) Challenges: include drafts for staff/admin in get_active_challenges
-- ---------------------------------------------------------
create or replace function public.get_active_challenges(p_tenant_id uuid)
returns table(
  challenge_id uuid,
  title text,
  description text,
  starts_at date,
  ends_at date,
  status public.challenge_status,
  participant_count int,
  joined boolean,
  my_points int
)
language plpgsql
stable
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
    select
      c.id as challenge_id,
      c.title,
      c.description,
      c.starts_at,
      c.ends_at,
      c.status,
      (select count(*)::int from public.challenge_participants cp where cp.challenge_id = c.id) as participant_count,
      exists(
        select 1 from public.challenge_participants cp
        where cp.challenge_id = c.id and cp.user_id = viewer
      ) as joined,
      coalesce(
        (select cp.total_points from public.challenge_participants cp where cp.challenge_id = c.id and cp.user_id = viewer),
        0
      ) as my_points
    from public.challenges c
    where c.tenant_id = p_tenant_id
      and (
        c.status in ('active','ended')
        or (
          c.status = 'draft'
          and (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id))
        )
      )
    order by
      case when c.status = 'draft' then 0 else 1 end,
      c.starts_at desc,
      c.created_at desc;
end $$;

-- grant already exists from CP59; keep it idempotent
grant execute on function public.get_active_challenges(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) Challenges: atomic create season + tasks (staff/admin)
-- ---------------------------------------------------------
create or replace function public.create_challenge_season(
  p_tenant_id uuid,
  p_title text,
  p_description text default null,
  p_starts_at date,
  p_ends_at date,
  p_status public.challenge_status default 'draft',
  p_tasks jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  cid uuid;
  t jsonb;
  k text;
  ttl text;
  dsc text;
  ppu int;
  cap_day int;
  cap_total int;
  inserted int := 0;
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

  if p_title is null or length(trim(p_title)) < 3 then
    raise exception 'title_required';
  end if;

  if p_starts_at is null or p_ends_at is null then
    raise exception 'dates_required';
  end if;

  if p_ends_at < p_starts_at then
    raise exception 'invalid_window';
  end if;

  insert into public.challenges(
    tenant_id, title, description, starts_at, ends_at, status, created_by, created_at, updated_at
  )
  values(
    p_tenant_id,
    left(trim(p_title), 80),
    nullif(left(trim(coalesce(p_description,'')), 300), ''),
    p_starts_at,
    p_ends_at,
    coalesce(p_status, 'draft'),
    viewer,
    now(),
    now()
  )
  returning id into cid;

  if cid is null then
    raise exception 'create_failed';
  end if;

  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' then
    p_tasks := '[]'::jsonb;
  end if;

  for t in select * from jsonb_array_elements(p_tasks) loop
    -- Normalize key
    k := lower(regexp_replace(coalesce(t->>'key',''), '[^a-z0-9_]+', '_', 'g'));
    if k is null or k = '' then
      k := lower(regexp_replace(coalesce(t->>'title','task'), '[^a-z0-9_]+', '_', 'g'));
    end if;
    k := left(coalesce(nullif(k,''), 'task'), 32);

    ttl := coalesce(nullif(trim(t->>'title'),''), k);
    dsc := nullif(trim(t->>'description'), '');

    begin
      ppu := greatest(1, least(coalesce((t->>'points_per_unit')::int, 1), 100));
    exception when others then
      ppu := 1;
    end;

    begin
      cap_day := nullif((t->>'cap_per_day')::int, 0);
    exception when others then
      cap_day := null;
    end;

    begin
      cap_total := nullif((t->>'cap_total')::int, 0);
    exception when others then
      cap_total := null;
    end;

    insert into public.challenge_tasks(
      challenge_id, key, title, description, points_per_unit, cap_per_day, cap_total, created_at, updated_at
    )
    values(
      cid,
      k,
      left(ttl, 60),
      case when dsc is null then null else left(dsc, 120) end,
      ppu,
      cap_day,
      cap_total,
      now(),
      now()
    )
    on conflict (challenge_id, key) do nothing;

    inserted := inserted + 1;
  end loop;

  -- Ensure at least one task exists.
  if not exists(select 1 from public.challenge_tasks where challenge_id = cid) then
    insert into public.challenge_tasks(challenge_id, key, title, description, points_per_unit, cap_per_day, cap_total)
    values(cid, 'train', 'Train', 'Show up and train.', 10, 1, null);
  end if;

  return cid;
end $$;

grant execute on function public.create_challenge_season(uuid, text, text, date, date, public.challenge_status, jsonb) to authenticated;
