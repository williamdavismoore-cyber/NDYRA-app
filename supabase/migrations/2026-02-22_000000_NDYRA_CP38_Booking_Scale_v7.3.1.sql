-- =========================================================
-- NDYRA CP38 — Booking Core + Scale Prereqs (Blueprint v7.3.1)
-- =========================================================
-- Includes:
--  • tenants kill switches (booking/check-in/migration-commit)
--  • membership_status enum + gym_memberships table (if missing)
--  • class_types / class_sessions / class_bookings (RLS enabled)
--  • spend_tokens signature alignment
--  • canonical RPC: book_class_with_tokens(p_class_session_id uuid)
--  • scale prereqs: can_comment_now(), get_following_feed(), index manifest
--
-- Run as postgres/supabase_admin.

-- ---------------------------------------------------------
-- 0) Tenant kill switches
-- ---------------------------------------------------------
alter table public.tenants
  add column if not exists kill_switch_disable_booking boolean not null default false,
  add column if not exists kill_switch_disable_checkin boolean not null default false,
  add column if not exists kill_switch_disable_migration_commit boolean not null default false;

-- ---------------------------------------------------------
-- 0b) audit_log schema alignment (CP33/CP35 compatibility)
-- ---------------------------------------------------------
alter table public.audit_log
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

alter table public.audit_log
  add column if not exists details jsonb not null default ('{}'::jsonb);

alter table public.audit_log enable row level security;

-- ---------------------------------------------------------
-- 1) Membership status enum + gym_memberships
-- ---------------------------------------------------------
DO $$ BEGIN
  create type public.membership_status as enum ('active','past_due','paused','canceled','comp','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.gym_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  status    public.membership_status not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.gym_memberships enable row level security;

drop policy if exists "gym_memberships_select_own" on public.gym_memberships;
create policy "gym_memberships_select_own"
on public.gym_memberships for select
using (auth.uid() = user_id);

drop policy if exists "gym_memberships_select_staff" on public.gym_memberships;
create policy "gym_memberships_select_staff"
on public.gym_memberships for select
using (public.is_tenant_staff(tenant_id));

-- ---------------------------------------------------------
-- 2) Class scheduling tables (minimal, tokens-ready)
-- ---------------------------------------------------------
DO $$ BEGIN
  create type public.class_visibility as enum ('public','members');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  create type public.class_booking_status as enum ('booked','canceled','attended','no_show','waitlist');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

create table if not exists public.class_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  default_token_cost integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.class_types enable row level security;

drop policy if exists "class_types_select_staff" on public.class_types;
create policy "class_types_select_staff"
on public.class_types for select
using (public.is_tenant_staff(tenant_id));

drop policy if exists "class_types_select_member" on public.class_types;
create policy "class_types_select_member"
on public.class_types for select
using (public.is_tenant_member(tenant_id));

create index if not exists class_types_tenant_idx on public.class_types(tenant_id);

create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class_type_id uuid references public.class_types(id) on delete set null,
  starts_at timestamptz not null,
  capacity integer not null default 0,
  booked_count integer not null default 0,
  visibility public.class_visibility not null default 'members',
  token_cost integer,
  is_canceled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.class_sessions enable row level security;

-- Public sessions are visible to anon
drop policy if exists "class_sessions_select_public" on public.class_sessions;
create policy "class_sessions_select_public"
on public.class_sessions for select to anon
using (visibility = 'public' and is_canceled = false);

-- Members can see member-only sessions
drop policy if exists "class_sessions_select_members" on public.class_sessions;
create policy "class_sessions_select_members"
on public.class_sessions for select to authenticated
using (
  visibility = 'members'
  and is_canceled = false
  and public.is_tenant_member(tenant_id)
);

-- Staff can see all sessions
drop policy if exists "class_sessions_select_staff" on public.class_sessions;
drop policy if exists "class_sessions_select_staff_all" on public.class_sessions;
create policy "class_sessions_select_staff"
on public.class_sessions for select to authenticated
using (public.is_tenant_staff(tenant_id));

create index if not exists class_sessions_tenant_starts_idx on public.class_sessions(tenant_id, starts_at);

create table if not exists public.class_bookings (
  id uuid primary key default gen_random_uuid(),
  class_session_id uuid not null references public.class_sessions(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.class_booking_status not null default 'booked',
  created_at timestamptz not null default now()
);

alter table public.class_bookings enable row level security;

-- idempotency: one booking per user per session
DO $$ BEGIN
  alter table public.class_bookings add constraint class_bookings_unique_user_session unique (class_session_id, user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

drop policy if exists "class_bookings_select_own" on public.class_bookings;
create policy "class_bookings_select_own"
on public.class_bookings for select
using (auth.uid() = user_id);

drop policy if exists "class_bookings_select_staff" on public.class_bookings;
create policy "class_bookings_select_staff"
on public.class_bookings for select
using (public.is_tenant_staff(tenant_id));

create index if not exists class_bookings_user_idx on public.class_bookings(user_id, created_at desc);
create index if not exists class_bookings_session_idx on public.class_bookings(class_session_id, created_at desc);

-- ---------------------------------------------------------
-- 3) spend_tokens signature alignment (Blueprint v7.3.1)
-- ---------------------------------------------------------
-- Previous CP35 signature included p_note. Blueprint requires:
--   spend_tokens(tenant_id, user_id, amount, ref_type, ref_id)
-- Keep it server-side (no grants to authenticated).

drop function if exists public.spend_tokens(uuid, uuid, integer, text, uuid, text);

create or replace function public.spend_tokens(
  p_tenant_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_ref_type text,
  p_ref_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- lock wallet row
  select balance into v_balance
  from public.token_wallets
  where tenant_id = p_tenant_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'no_wallet';
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_tokens';
  end if;

  update public.token_wallets
  set balance = balance - p_amount,
      updated_at = now()
  where tenant_id = p_tenant_id
    and user_id = p_user_id;

  insert into public.token_transactions(id, tenant_id, user_id, delta, ref_type, ref_id, created_at)
  values (gen_random_uuid(), p_tenant_id, p_user_id, -p_amount, p_ref_type, p_ref_id, now());

  select balance into v_balance
  from public.token_wallets
  where tenant_id = p_tenant_id
    and user_id = p_user_id;

  return v_balance;
end $$;

revoke all on function public.spend_tokens(uuid, uuid, integer, text, uuid) from public;
revoke all on function public.spend_tokens(uuid, uuid, integer, text, uuid) from authenticated;

-- NOTE: keep service_role ability for server-side jobs.
-- (postgres owner can execute regardless; service role gets explicit grant.)
grant execute on function public.spend_tokens(uuid, uuid, integer, text, uuid) to service_role;

-- ---------------------------------------------------------
-- 4) Canonical booking RPC (tokens)
-- ---------------------------------------------------------
create or replace function public.book_class_with_tokens(
  p_class_session_id uuid
)
returns table(
  booking_id uuid,
  remaining_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_capacity int;
  v_booked int;
  v_cost int;
  v_visibility public.class_visibility;
  v_canceled boolean;
  v_system_of_record text;
  v_disable_booking boolean;
  v_booking_id uuid;
  v_remaining int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Lock session row (capacity gate)
  select cs.tenant_id,
         cs.capacity,
         cs.booked_count,
         cs.visibility,
         cs.is_canceled,
         coalesce(cs.token_cost, ct.default_token_cost, 1)
    into v_tenant_id, v_capacity, v_booked, v_visibility, v_canceled, v_cost
  from public.class_sessions cs
  left join public.class_types ct on ct.id = cs.class_type_id
  where cs.id = p_class_session_id
  for update;

  if v_tenant_id is null then
    raise exception 'session_not_found';
  end if;

  if v_canceled then
    raise exception 'session_canceled';
  end if;

  -- Tokens never allowed for member-only sessions
  if v_visibility <> 'public' then
    raise exception 'tokens_not_allowed';
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

  -- Capacity gate
  if v_capacity > 0 and v_booked >= v_capacity then
    raise exception 'class_full';
  end if;

  -- Insert booking idempotently; only spend if we inserted
  insert into public.class_bookings(id, class_session_id, tenant_id, user_id, status)
  values (gen_random_uuid(), p_class_session_id, v_tenant_id, auth.uid(), 'booked')
  on conflict (class_session_id, user_id) do nothing
  returning id into v_booking_id;

  if v_booking_id is null then
    -- already booked: return existing booking id + current wallet balance (no double spend)
    select id into v_booking_id
    from public.class_bookings
    where class_session_id = p_class_session_id
      and user_id = auth.uid();

    select balance into v_remaining
    from public.token_wallets
    where tenant_id = v_tenant_id
      and user_id = auth.uid();

    return query select v_booking_id, coalesce(v_remaining, 0);
    return;
  end if;

  -- Update booked_count within same transaction
  update public.class_sessions
  set booked_count = booked_count + 1,
      updated_at = now()
  where id = p_class_session_id;

  -- Spend tokens (same transaction)
  v_remaining := public.spend_tokens(v_tenant_id, auth.uid(), v_cost, 'class_booking', v_booking_id);

  return query select v_booking_id, v_remaining;
end $$;

revoke all on function public.book_class_with_tokens(uuid) from public;
grant execute on function public.book_class_with_tokens(uuid) to authenticated;

-- ---------------------------------------------------------
-- 5) Scale prereq: comment throttle helper + policy wiring
-- ---------------------------------------------------------
create or replace function public.can_comment_now(
  p_post_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    return false;
  end if;

  if not public.can_view_post(p_post_id) then
    return false;
  end if;

  select count(*) into v_count
  from public.post_comments c
  where c.post_id = p_post_id
    and c.user_id = auth.uid()
    and c.deleted_at is null
    and c.created_at > (now() - interval '2 minutes');

  return v_count < 5; -- max 5 comments per 2 minutes per post
end $$;

-- Update comment insert policy to include can_comment_now()
-- (Drop/recreate to avoid drift.)
drop policy if exists "post_comments_insert_own" on public.post_comments;
create policy "post_comments_insert_own"
on public.post_comments for insert
with check (
  auth.uid() = user_id
  and public.can_view_post(post_id)
  and public.can_comment_now(post_id)
);

-- ---------------------------------------------------------
-- 6) Scale prereq: Following feed RPC (SECURITY INVOKER)
-- ---------------------------------------------------------
create or replace function public.get_following_feed(
  p_limit int default 20,
  p_cursor timestamptz default null
)
returns table(
  post_id uuid
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_viewer uuid;
  v_follow_count int;
  v_cursor timestamptz;
begin
  v_viewer := auth.uid();
  if v_viewer is null then
    return;
  end if;

  v_cursor := coalesce(p_cursor, now());

  select count(*) into v_follow_count
  from public.follows_users fu
  where fu.follower_id = v_viewer;

  if v_follow_count > 500 then
    -- server-side join path
    return query
    select p.id
    from public.posts p
    left join public.follows_users fu
      on fu.follower_id = v_viewer
     and fu.followee_id = p.author_user_id
    left join public.follows_tenants ft
      on ft.follower_id = v_viewer
     and ft.tenant_id = p.author_tenant_id
    where p.is_deleted = false
      and p.created_at < v_cursor
      and public.can_view_post(p.id)
      and (fu.followee_id is not null or ft.tenant_id is not null)
    order by p.created_at desc
    limit greatest(1, least(p_limit, 100));

  else
    -- exists path
    return query
    select p.id
    from public.posts p
    where p.is_deleted = false
      and p.created_at < v_cursor
      and public.can_view_post(p.id)
      and (
        exists(
          select 1 from public.follows_users fu
          where fu.follower_id = v_viewer
            and fu.followee_id = p.author_user_id
        )
        or exists(
          select 1 from public.follows_tenants ft
          where ft.follower_id = v_viewer
            and ft.tenant_id = p.author_tenant_id
        )
      )
    order by p.created_at desc
    limit greatest(1, least(p_limit, 100));
  end if;
end $$;

-- ---------------------------------------------------------
-- 7) Index manifest (Section 13.7)
-- ---------------------------------------------------------
-- Posts stable pagination
create index if not exists posts_created_id_idx
  on public.posts(created_at desc, id desc);

create index if not exists posts_author_user_created_id_idx
  on public.posts(author_user_id, created_at desc, id desc);

create index if not exists posts_author_tenant_created_id_idx
  on public.posts(author_tenant_id, created_at desc, id desc);

create index if not exists posts_tenant_ctx_created_id_idx
  on public.posts(tenant_context_id, created_at desc, id desc);

create index if not exists posts_visibility_created_id_idx
  on public.posts(visibility, created_at desc, id desc);

-- Comments stable pagination
create index if not exists post_comments_post_created_id_idx
  on public.post_comments(post_id, created_at asc, id asc);

-- Stats indexes
create index if not exists post_stats_score_idx
  on public.post_stats(score_48h desc, post_id);

create index if not exists post_stats_last_engaged_idx
  on public.post_stats(last_engaged_at desc nulls last);

