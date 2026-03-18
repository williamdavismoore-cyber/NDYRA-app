-- =========================================================
-- NDYRA CP64 — Inbox Announcements + Membership Booking RPC
-- Build: 2026-03-01_64
-- =========================================================
-- Adds:
--   • tenant_announcements (gym announcements / event drops)
--   • create_announcement + can_manage_announcements helpers
--   • create_event enhancement: auto-create announcement when published
--   • book_class_with_membership RPC (Smart Booking Fork)
--
-- Notes:
--   • Direct messages remain staged; Inbox is "announcements + ops" first.
--   • Booking fork enforcement stays server-side; UI just improves UX.

-- ---------------------------------------------------------
-- 1) Announcements table (Inbox foundation)
-- ---------------------------------------------------------

create table if not exists public.tenant_announcements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null default 'manual', -- manual|event_created
  title text not null,
  body text,
  event_id uuid references public.events(id) on delete set null,
  visibility text not null default 'members', -- public|members
  status text not null default 'published', -- draft|published|archived
  pinned boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_announcements is 'Gym announcements feed. Used for Inbox (no DMs yet).';
comment on column public.tenant_announcements.kind is 'manual|event_created';
comment on column public.tenant_announcements.visibility is 'public|members';
comment on column public.tenant_announcements.status is 'draft|published|archived';

create index if not exists tenant_announcements_tenant_created_idx on public.tenant_announcements(tenant_id, pinned desc, created_at desc);
create index if not exists tenant_announcements_event_idx on public.tenant_announcements(event_id);

alter table public.tenant_announcements
  drop constraint if exists tenant_announcements_visibility_check;
alter table public.tenant_announcements
  add constraint tenant_announcements_visibility_check
  check (visibility in ('public','members'));

alter table public.tenant_announcements
  drop constraint if exists tenant_announcements_status_check;
alter table public.tenant_announcements
  add constraint tenant_announcements_status_check
  check (status in ('draft','published','archived'));

create or replace function public.touch_tenant_announcements_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_tenant_announcements_touch_updated_at on public.tenant_announcements;
create trigger trg_tenant_announcements_touch_updated_at
before update on public.tenant_announcements
for each row execute function public.touch_tenant_announcements_updated_at();

alter table public.tenant_announcements enable row level security;

-- Select:
--  • staff/admin can see all
--  • members can see published
--  • public can see visibility=public (still requires auth in this build)
drop policy if exists "tenant_announcements_select" on public.tenant_announcements;
create policy "tenant_announcements_select"
on public.tenant_announcements
for select
to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
  or (
    status = 'published'
    and (
      public.is_tenant_member(tenant_id)
      or visibility = 'public'
    )
  )
);

-- Insert/update/delete: staff/admin only
drop policy if exists "tenant_announcements_insert_staff" on public.tenant_announcements;
create policy "tenant_announcements_insert_staff"
on public.tenant_announcements
for insert
to authenticated
with check (
  public.is_platform_admin() or public.is_tenant_staff(tenant_id)
);

drop policy if exists "tenant_announcements_update_staff" on public.tenant_announcements;
create policy "tenant_announcements_update_staff"
on public.tenant_announcements
for update
to authenticated
using (public.is_platform_admin() or public.is_tenant_staff(tenant_id))
with check (public.is_platform_admin() or public.is_tenant_staff(tenant_id));

drop policy if exists "tenant_announcements_delete_staff" on public.tenant_announcements;
create policy "tenant_announcements_delete_staff"
on public.tenant_announcements
for delete
to authenticated
using (public.is_platform_admin() or public.is_tenant_staff(tenant_id));


-- ---------------------------------------------------------
-- 2) RPC helpers
-- ---------------------------------------------------------

create or replace function public.can_manage_announcements(p_tenant_id uuid)
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

grant execute on function public.can_manage_announcements(uuid) to authenticated;


create or replace function public.create_announcement(
  p_tenant_id uuid,
  p_title text,
  p_body text default null,
  p_visibility text default 'members',
  p_status text default 'published',
  p_event_id uuid default null,
  p_pinned boolean default false,
  p_kind text default 'manual'
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
  k text := coalesce(nullif(trim(p_kind),''), 'manual');
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
  if st not in ('draft','published','archived') then
    raise exception 'bad_status';
  end if;
  if vis not in ('public','members') then
    raise exception 'bad_visibility';
  end if;

  insert into public.tenant_announcements(
    tenant_id, kind, title, body, event_id, visibility, status, pinned, created_by
  ) values (
    p_tenant_id,
    k,
    nullif(trim(p_title),''),
    nullif(trim(p_body),''),
    p_event_id,
    vis,
    st,
    coalesce(p_pinned,false),
    viewer
  ) returning id into vid;

  return vid;
end $$;

grant execute on function public.create_announcement(uuid, text, text, text, text, uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------
-- 3) Enhance create_event: auto-create announcement on publish
-- ---------------------------------------------------------

-- Replace function body, keep signature stable.
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

  -- Auto announcement when published (Inbox feed)
  if st = 'published' then
    insert into public.tenant_announcements(
      tenant_id, kind, title, body, event_id, visibility, status, pinned, created_by
    ) values (
      p_tenant_id,
      'event_created',
      nullif(trim(p_title),''),
      nullif(trim(p_description),''),
      vid,
      vis,
      'published',
      false,
      viewer
    );
  end if;

  return vid;
end $$;

-- Grant is already applied in CP63; keep it here for safety.
grant execute on function public.create_event(uuid, text, text, timestamptz, timestamptz, text, text, int, text) to authenticated;


-- ---------------------------------------------------------
-- 4) Membership booking RPC (Smart Booking Fork)
-- ---------------------------------------------------------

create or replace function public.book_class_with_membership(
  p_class_session_id uuid
)
returns table(
  booking_id uuid,
  remaining_tokens int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_capacity int;
  v_booked int;
  v_visibility public.class_visibility;
  v_canceled boolean;
  v_system_of_record text;
  v_disable_booking boolean;
  v_booking_id uuid;
  v_wallet int;
  v_mstatus public.membership_status;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock session row (capacity gate)
  select cs.tenant_id,
         cs.capacity,
         cs.booked_count,
         cs.visibility,
         cs.is_canceled
    into v_tenant_id, v_capacity, v_booked, v_visibility, v_canceled
  from public.class_sessions cs
  where cs.id = p_class_session_id
  for update;

  if v_tenant_id is null then
    raise exception 'session_not_found';
  end if;

  if v_canceled then
    raise exception 'session_canceled';
  end if;

  -- Membership booking intended for member-only sessions
  if v_visibility = 'public' then
    raise exception 'tokens_required';
  end if;

  -- System-of-record is the authoritative cutover switch
  select t.system_of_record::text, t.kill_switch_disable_booking
    into v_system_of_record, v_disable_booking
  from public.tenants t
  where t.id = v_tenant_id;

  if v_system_of_record <> 'ndyra' then
    raise exception 'tenant_not_authoritative';
  end if;

  if v_disable_booking then
    insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
    values (
      v_tenant_id,
      auth.uid(),
      'booking_blocked',
      'tenant',
      v_tenant_id,
      jsonb_build_object('reason','kill_switch_disable_booking','class_session_id', p_class_session_id)
    );
    raise exception 'booking_disabled';
  end if;

  -- Waiver required
  if not public.has_signed_current_waiver(v_tenant_id, auth.uid()) then
    raise exception 'waiver_required';
  end if;

  -- Membership required + must be active/comp
  select m.status into v_mstatus
  from public.gym_memberships m
  where m.tenant_id = v_tenant_id
    and m.user_id = auth.uid();

  if v_mstatus is null then
    raise exception 'membership_required';
  end if;
  if v_mstatus not in ('active','comp') then
    raise exception 'membership_inactive';
  end if;

  -- Capacity gate
  if v_capacity > 0 and v_booked >= v_capacity then
    raise exception 'class_full';
  end if;

  -- Insert booking idempotently
  insert into public.class_bookings(id, class_session_id, tenant_id, user_id, status)
  values (gen_random_uuid(), p_class_session_id, v_tenant_id, auth.uid(), 'booked')
  on conflict (class_session_id, user_id) do nothing
  returning id into v_booking_id;

  if v_booking_id is null then
    select id into v_booking_id
    from public.class_bookings
    where class_session_id = p_class_session_id
      and user_id = auth.uid();
  else
    update public.class_sessions
    set booked_count = booked_count + 1,
        updated_at = now()
    where id = p_class_session_id;
  end if;

  -- Return wallet balance if present (for UI display)
  select balance into v_wallet
  from public.token_wallets
  where tenant_id = v_tenant_id
    and user_id = auth.uid();

  return query select v_booking_id, coalesce(v_wallet, 0);
end $$;

revoke all on function public.book_class_with_membership(uuid) from public;
grant execute on function public.book_class_with_membership(uuid) to authenticated;
