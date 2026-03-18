-- =========================================================
-- NDYRA CP63 — Events MVP
-- Build: 2026-03-01_63
-- =========================================================
-- Adds gym-scoped Events + RSVP with RLS-safe RPC helpers.
--
-- Goals:
--   • Staff/Admin can create events for a tenant (gym)
--   • Members can RSVP without exposing attendee lists by default
--   • UI can fetch event lists + detail + counts via SECURITY DEFINER RPCs
--   • Calendar export handled client-side (ICS), but schema stores canonical times
-- =========================================================

-- ---------------------------------------------------------
-- 1) Events table
-- ---------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location_text text,
  visibility text not null default 'members', -- public|members
  capacity int,
  status text not null default 'published', -- draft|published|canceled|ended|archived
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.events is 'Gym-scoped events (classes, meetups, races, workshops).';
comment on column public.events.visibility is 'public|members. public allows discovery without membership; members requires tenant membership.';
comment on column public.events.status is 'draft|published|canceled|ended|archived';

create index if not exists events_tenant_starts_idx on public.events(tenant_id, starts_at asc);
create index if not exists events_visibility_idx on public.events(visibility, starts_at asc);

-- Keep status values disciplined (best-effort; do not block if constraint already exists)
alter table public.events
  drop constraint if exists events_status_check;
alter table public.events
  add constraint events_status_check
  check (status in ('draft','published','canceled','ended','archived'));

alter table public.events
  drop constraint if exists events_visibility_check;
alter table public.events
  add constraint events_visibility_check
  check (visibility in ('public','members'));

-- updated_at trigger
create or replace function public.touch_events_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_events_touch_updated_at on public.events;
create trigger trg_events_touch_updated_at
before update on public.events
for each row
execute function public.touch_events_updated_at();

alter table public.events enable row level security;

-- RLS policies
-- Select: allow public events, or tenant members/staff, or platform admin
drop policy if exists "events_select_visible" on public.events;
create policy "events_select_visible"
on public.events
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
  or public.is_tenant_member(tenant_id)
  or visibility = 'public'
);

-- Insert: staff/admin only
drop policy if exists "events_insert_staff" on public.events;
create policy "events_insert_staff"
on public.events
for insert
to authenticated
with check (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
);

-- Update: staff/admin only
drop policy if exists "events_update_staff" on public.events;
create policy "events_update_staff"
on public.events
for update
to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
)
with check (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
);

-- Delete: staff/admin only
drop policy if exists "events_delete_staff" on public.events;
create policy "events_delete_staff"
on public.events
for delete
to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
);

-- ---------------------------------------------------------
-- 2) RSVP table (minimal)
-- ---------------------------------------------------------

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going', -- going
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.event_rsvps is 'Event RSVP rows. Attendee lists are not exposed by default; UI uses RPC to read counts.';

alter table public.event_rsvps
  drop constraint if exists event_rsvps_status_check;
alter table public.event_rsvps
  add constraint event_rsvps_status_check
  check (status in ('going'));

create index if not exists event_rsvps_event_idx on public.event_rsvps(event_id, created_at desc);

create or replace function public.touch_event_rsvps_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_event_rsvps_touch_updated_at on public.event_rsvps;
create trigger trg_event_rsvps_touch_updated_at
before update on public.event_rsvps
for each row
execute function public.touch_event_rsvps_updated_at();

alter table public.event_rsvps enable row level security;

-- Select: own rows (default)
drop policy if exists "event_rsvps_select_own" on public.event_rsvps;
create policy "event_rsvps_select_own"
on public.event_rsvps
for select
to authenticated
using (auth.uid() = user_id);

-- Select: staff/admin can view RSVPs for events in their tenant
-- (useful for event ops; still private from general members)
drop policy if exists "event_rsvps_select_staff" on public.event_rsvps;
create policy "event_rsvps_select_staff"
on public.event_rsvps
for select
to authenticated
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.events e
    where e.id = event_id
      and public.is_tenant_staff(e.tenant_id)
  )
);

-- Insert: user can RSVP for themselves if they can see the event
-- (visibility: public OR membership)
drop policy if exists "event_rsvps_insert_own" on public.event_rsvps;
create policy "event_rsvps_insert_own"
on public.event_rsvps
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.events e
    where e.id = event_id
      and (
        public.is_platform_admin()
        or public.is_tenant_staff(e.tenant_id)
        or public.is_tenant_member(e.tenant_id)
        or e.visibility = 'public'
      )
      and e.status in ('published','ended')
  )
);

-- Update: user can update their own RSVP row (future-proof)
drop policy if exists "event_rsvps_update_own" on public.event_rsvps;
create policy "event_rsvps_update_own"
on public.event_rsvps
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Delete: user can delete their own RSVP; staff can delete RSVPs for their events
drop policy if exists "event_rsvps_delete_own" on public.event_rsvps;
create policy "event_rsvps_delete_own"
on public.event_rsvps
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.is_platform_admin()
  or exists (
    select 1 from public.events e
    where e.id = event_id
      and public.is_tenant_staff(e.tenant_id)
  )
);

-- ---------------------------------------------------------
-- 3) RPC helpers (RLS-safe counts)
-- ---------------------------------------------------------

create or replace function public.can_manage_events(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then
    return false;
  end if;
  return public.is_platform_admin() or public.is_tenant_staff(p_tenant_id);
end $$;

grant execute on function public.can_manage_events(uuid) to authenticated;

-- Tenant-scoped listing
create or replace function public.get_tenant_events(
  p_tenant_id uuid,
  p_limit int default 50,
  p_offset int default 0,
  p_include_past boolean default false
)
returns table(
  event_id uuid,
  tenant_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  visibility text,
  capacity int,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rsvp_count int,
  my_status text,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
  off int := greatest(0, coalesce(p_offset, 0));
  is_staff boolean := false;
  is_member boolean := false;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;
  if p_tenant_id is null then
    raise exception 'tenant_required';
  end if;

  is_staff := public.is_platform_admin() or public.is_tenant_staff(p_tenant_id);
  is_member := public.is_tenant_member(p_tenant_id);

  return query
  with base as (
    select e.*
    from public.events e
    where e.tenant_id = p_tenant_id
      and (
        -- staff can see drafts
        (is_staff)
        or (
          e.status in ('published','canceled','ended','archived')
          and (is_member or e.visibility = 'public')
        )
      )
      and (
        p_include_past
        or e.starts_at >= now() - interval '18 hours'
      )
    order by e.starts_at asc
    limit lim offset off
  )
  select
    b.id as event_id,
    b.tenant_id,
    b.title,
    b.description,
    b.starts_at,
    b.ends_at,
    b.location_text,
    b.visibility,
    b.capacity,
    b.status,
    b.created_by,
    b.created_at,
    b.updated_at,
    (select count(*)::int from public.event_rsvps r where r.event_id = b.id and r.status = 'going') as rsvp_count,
    (select r.status from public.event_rsvps r where r.event_id = b.id and r.user_id = viewer limit 1) as my_status,
    (is_staff) as can_manage
  from base b;
end $$;

grant execute on function public.get_tenant_events(uuid, int, int, boolean) to authenticated;

-- Single event detail
create or replace function public.get_event_detail(p_event_id uuid)
returns table(
  event_id uuid,
  tenant_id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  location_text text,
  visibility text,
  capacity int,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  rsvp_count int,
  my_status text,
  can_manage boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  e public.events%rowtype;
  is_staff boolean := false;
  is_member boolean := false;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select * into e
  from public.events
  where id = p_event_id;

  if not found then
    raise exception 'not_found';
  end if;

  is_staff := public.is_platform_admin() or public.is_tenant_staff(e.tenant_id);
  is_member := public.is_tenant_member(e.tenant_id);

  if not (is_staff or (is_member or e.visibility = 'public')) then
    raise exception 'forbidden';
  end if;

  -- non-staff can't see drafts
  if (not is_staff) and e.status = 'draft' then
    raise exception 'forbidden';
  end if;

  return query
  select
    e.id,
    e.tenant_id,
    e.title,
    e.description,
    e.starts_at,
    e.ends_at,
    e.location_text,
    e.visibility,
    e.capacity,
    e.status,
    e.created_by,
    e.created_at,
    e.updated_at,
    (select count(*)::int from public.event_rsvps r where r.event_id = e.id and r.status = 'going') as rsvp_count,
    (select r.status from public.event_rsvps r where r.event_id = e.id and r.user_id = viewer limit 1) as my_status,
    (is_staff) as can_manage;
end $$;

grant execute on function public.get_event_detail(uuid) to authenticated;

-- RSVP helper: upsert/delete own RSVP (status 'going' or 'none')
create or replace function public.rsvp_event(p_event_id uuid, p_status text default 'going')
returns table(
  event_id uuid,
  user_id uuid,
  status text,
  rsvp_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  e public.events%rowtype;
  is_staff boolean := false;
  is_member boolean := false;
  next_status text := coalesce(nullif(trim(p_status),''), 'going');
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select * into e from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found';
  end if;

  is_staff := public.is_platform_admin() or public.is_tenant_staff(e.tenant_id);
  is_member := public.is_tenant_member(e.tenant_id);

  if not (is_staff or is_member or e.visibility='public') then
    raise exception 'forbidden';
  end if;

  if next_status = 'none' then
    delete from public.event_rsvps
    where event_id = p_event_id and user_id = viewer;

    return query
    select
      p_event_id,
      viewer,
      null::text as status,
      (select count(*)::int from public.event_rsvps r where r.event_id = p_event_id and r.status='going') as rsvp_count;
    return;
  end if;

  -- Only supported status currently
  if next_status <> 'going' then
    raise exception 'bad_status';
  end if;

  insert into public.event_rsvps(event_id, user_id, status)
  values (p_event_id, viewer, 'going')
  on conflict (event_id, user_id)
  do update set status = excluded.status, updated_at = now();

  -- Lightweight notification to self (keeps user loop tight)
  begin
    insert into public.notifications(user_id, type, actor_user_id, entity_type, entity_id, title, body)
    values (
      viewer,
      'system',
      viewer,
      'event',
      p_event_id,
      'RSVP confirmed',
      coalesce(e.title, 'Event')
    );
  exception when others then
    -- do nothing if notifications table/enum is not ready in this environment
    null;
  end;

  return query
  select
    p_event_id,
    viewer,
    'going'::text as status,
    (select count(*)::int from public.event_rsvps r where r.event_id = p_event_id and r.status='going') as rsvp_count;
end $$;

grant execute on function public.rsvp_event(uuid, text) to authenticated;

-- Create event (staff only)
create or replace function public.create_event(
  p_tenant_id uuid,
  p_title text,
  p_description text default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_location_text text default null,
  p_visibility text default 'members',
  p_capacity int default null,
  p_status text default 'published'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  vid uuid;
  st text := coalesce(nullif(trim(p_status),''), 'published');
  vis text := coalesce(nullif(trim(p_visibility),''), 'members');
  s_at timestamptz := coalesce(p_starts_at, now());
  e_at timestamptz := p_ends_at;
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

  if st not in ('draft','published','canceled','ended','archived') then
    raise exception 'bad_status';
  end if;
  if vis not in ('public','members') then
    raise exception 'bad_visibility';
  end if;

  insert into public.events(
    tenant_id, title, description, starts_at, ends_at, location_text, visibility, capacity, status, created_by
  ) values (
    p_tenant_id,
    nullif(trim(p_title),''),
    nullif(trim(p_description),''),
    s_at,
    e_at,
    nullif(trim(p_location_text),''),
    vis,
    p_capacity,
    st,
    viewer
  ) returning id into vid;

  return vid;
end $$;

grant execute on function public.create_event(uuid, text, text, timestamptz, timestamptz, text, text, int, text) to authenticated;

