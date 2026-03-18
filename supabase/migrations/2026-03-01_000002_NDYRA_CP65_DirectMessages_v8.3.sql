-- =========================================================
-- NDYRA CP65 — Direct Messages (1:1) + Safety Gating
-- Build: 2026-03-01_65
--
-- Goals:
--   • Ship a real 1:1 DM surface inside /app/inbox (Messages)
--   • Keep spam low: allow DMs only when
--       - mutual follow, OR
--       - shared gym membership, OR
--       - staff → member (same tenant)
--   • Respect blocks (mutual invisibility)
--   • Provide unread counts via lightweight read-state table
--   • Keep RLS tight (no permissive TRUE policies)
--
-- Notes:
--   • This is 1:1 only (no group chats yet).
--   • Notifications use a new enum value: notification_type='message'.
-- =========================================================

-- 0) notification type enum: add 'message'
do $$
begin
  alter type public.notification_type add value if not exists 'message';
exception when undefined_object then
  -- In case the enum hasn't been created yet in the target DB.
  null;
end $$;

-- ---------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  user_low uuid generated always as (least(user_a, user_b)) stored,
  user_high uuid generated always as (greatest(user_a, user_b)) stored,
  created_at timestamptz not null default now(),
  check (user_a <> user_b),
  unique (user_low, user_high)
);

create index if not exists dm_threads_user_a_idx on public.dm_threads(user_a);
create index if not exists dm_threads_user_b_idx on public.dm_threads(user_b);

alter table public.dm_threads enable row level security;

-- Threads are readable only to participants and only when not blocked.
drop policy if exists "dm_threads_select_participants" on public.dm_threads;
create policy "dm_threads_select_participants"
on public.dm_threads
for select
to authenticated
using (
  auth.uid() in (user_a, user_b)
  and not public.is_blocked_between(user_a, user_b)
);

-- No direct inserts/updates/deletes from client — threads are created via RPC.


create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_created_idx on public.dm_messages(thread_id, created_at desc);
create index if not exists dm_messages_sender_created_idx on public.dm_messages(sender_id, created_at desc);

alter table public.dm_messages enable row level security;

-- Messages are visible only to thread participants (and not blocked).
drop policy if exists "dm_messages_select_participants" on public.dm_messages;
create policy "dm_messages_select_participants"
on public.dm_messages
for select
to authenticated
using (
  exists(
    select 1
    from public.dm_threads t
    where t.id = dm_messages.thread_id
      and auth.uid() in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
);

-- Client inserts are allowed only for the authenticated sender and only if they are a participant.
drop policy if exists "dm_messages_insert_sender" on public.dm_messages;
create policy "dm_messages_insert_sender"
on public.dm_messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and exists(
    select 1
    from public.dm_threads t
    where t.id = dm_messages.thread_id
      and auth.uid() in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
);


create table if not exists public.dm_thread_reads (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists dm_thread_reads_user_idx on public.dm_thread_reads(user_id, last_read_at desc);

alter table public.dm_thread_reads enable row level security;

drop policy if exists "dm_reads_select_own" on public.dm_thread_reads;
create policy "dm_reads_select_own"
on public.dm_thread_reads
for select
to authenticated
using (
  auth.uid() = user_id
  and exists(
    select 1
    from public.dm_threads t
    where t.id = dm_thread_reads.thread_id
      and auth.uid() in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
);

drop policy if exists "dm_reads_upsert_own" on public.dm_thread_reads;
create policy "dm_reads_upsert_own"
on public.dm_thread_reads
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists(
    select 1
    from public.dm_threads t
    where t.id = dm_thread_reads.thread_id
      and auth.uid() in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  )
);

drop policy if exists "dm_reads_update_own" on public.dm_thread_reads;
create policy "dm_reads_update_own"
on public.dm_thread_reads
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- ---------------------------------------------------------
-- 2) Helper: can_dm_user(other)
-- ---------------------------------------------------------

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

  -- Mutual follow
  select (
    exists(select 1 from public.follows_users a where a.follower_id = viewer and a.followee_id = other)
    and exists(select 1 from public.follows_users b where b.follower_id = other and b.followee_id = viewer)
  ) into mutual_follow;

  if mutual_follow then
    return true;
  end if;

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

  if shared_membership then
    return true;
  end if;

  -- Staff -> member (if tenant_users exists)
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

  return staff_to_member;
end $$;

grant execute on function public.can_dm_user(uuid) to authenticated;


-- ---------------------------------------------------------
-- 3) RPC: start_dm_thread(other)
-- ---------------------------------------------------------

create or replace function public.start_dm_thread(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  other uuid := p_other_user_id;
  low uuid;
  high uuid;
  existing uuid;
  tid uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if other is null or other = viewer then
    raise exception 'invalid_target';
  end if;

  if not public.can_dm_user(other) then
    raise exception 'not_allowed';
  end if;

  low := least(viewer, other);
  high := greatest(viewer, other);

  select t.id into existing
  from public.dm_threads t
  where t.user_low = low and t.user_high = high;

  if existing is not null then
    -- Ensure read-state rows exist (idempotent)
    insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
    values(existing, viewer, now())
    on conflict (thread_id, user_id) do nothing;
    insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
    values(existing, other, now())
    on conflict (thread_id, user_id) do nothing;

    return existing;
  end if;

  insert into public.dm_threads(user_a, user_b)
  values(viewer, other)
  returning id into tid;

  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(tid, viewer, now())
  on conflict (thread_id, user_id) do nothing;

  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(tid, other, now())
  on conflict (thread_id, user_id) do nothing;

  return tid;
end $$;

grant execute on function public.start_dm_thread(uuid) to authenticated;


-- ---------------------------------------------------------
-- 4) RPC: get_my_dm_threads(limit, offset)
-- ---------------------------------------------------------

drop function if exists public.get_my_dm_threads(int, int);

create function public.get_my_dm_threads(p_limit int default 40, p_offset int default 0)
returns table(
  thread_id uuid,
  other_user_id uuid,
  other_handle text,
  other_display_name text,
  other_avatar_url text,
  last_message text,
  last_message_at timestamptz,
  unread_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit, 40), 100));
  off int := greatest(0, coalesce(p_offset, 0));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  return query
  with threads as (
    select
      t.id,
      t.created_at,
      case when t.user_a = viewer then t.user_b else t.user_a end as other_id,
      t.user_a,
      t.user_b,
      coalesce(r.last_read_at, '1970-01-01'::timestamptz) as last_read_at
    from public.dm_threads t
    left join public.dm_thread_reads r
      on r.thread_id = t.id and r.user_id = viewer
    where viewer in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  ), last_msg as (
    select distinct on (m.thread_id)
      m.thread_id,
      m.body,
      m.created_at
    from public.dm_messages m
    join threads t on t.id = m.thread_id
    order by m.thread_id, m.created_at desc
  ), unread as (
    select
      t.id as thread_id,
      count(*)::int as unread_count
    from threads t
    join public.dm_messages m
      on m.thread_id = t.id
    where m.created_at > t.last_read_at
      and m.sender_id <> viewer
    group by t.id
  )
  select
    t.id as thread_id,
    t.other_id as other_user_id,
    p.handle as other_handle,
    coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), '@member') as other_display_name,
    p.avatar_url as other_avatar_url,
    case when lm.body is null then null else left(lm.body, 120) end as last_message,
    lm.created_at as last_message_at,
    coalesce(u.unread_count, 0) as unread_count
  from threads t
  left join public.profiles p on p.user_id = t.other_id
  left join last_msg lm on lm.thread_id = t.id
  left join unread u on u.thread_id = t.id
  order by coalesce(lm.created_at, t.created_at) desc nulls last
  limit lim
  offset off;
end $$;

grant execute on function public.get_my_dm_threads(int, int) to authenticated;


-- ---------------------------------------------------------
-- 5) RPC: get_dm_messages(thread_id, limit, before)
-- ---------------------------------------------------------

drop function if exists public.get_dm_messages(uuid, int, timestamptz);

create function public.get_dm_messages(
  p_thread_id uuid,
  p_limit int default 60,
  p_before timestamptz default null
)
returns table(
  message_id uuid,
  thread_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit, 60), 200));
  ua uuid;
  ub uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.user_a, t.user_b into ua, ub
  from public.dm_threads t
  where t.id = p_thread_id;

  if ua is null then
    raise exception 'not_found';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_between(ua, ub) then
    raise exception 'blocked';
  end if;

  return query
    select
      m.id as message_id,
      m.thread_id,
      m.sender_id,
      m.body,
      m.created_at
    from public.dm_messages m
    where m.thread_id = p_thread_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit lim;
end $$;

grant execute on function public.get_dm_messages(uuid, int, timestamptz) to authenticated;


-- ---------------------------------------------------------
-- 6) RPC: mark_dm_thread_read(thread_id)
-- ---------------------------------------------------------

create or replace function public.mark_dm_thread_read(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  ua uuid;
  ub uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.user_a, t.user_b into ua, ub
  from public.dm_threads t
  where t.id = p_thread_id;

  if ua is null then
    raise exception 'not_found';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_between(ua, ub) then
    raise exception 'blocked';
  end if;

  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(p_thread_id, viewer, now())
  on conflict (thread_id, user_id) do update
    set last_read_at = excluded.last_read_at;

  return true;
end $$;

grant execute on function public.mark_dm_thread_read(uuid) to authenticated;


-- ---------------------------------------------------------
-- 7) RPC: send_dm_message(thread_id, body)
-- ---------------------------------------------------------

create or replace function public.send_dm_message(p_thread_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  ua uuid;
  ub uuid;
  body text := trim(coalesce(p_body,''));
  mid uuid;
  other uuid;
  preview text;
  sender_name text;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if char_length(body) < 1 then
    raise exception 'empty_message';
  end if;

  if char_length(body) > 2000 then
    raise exception 'message_too_long';
  end if;

  select t.user_a, t.user_b into ua, ub
  from public.dm_threads t
  where t.id = p_thread_id;

  if ua is null then
    raise exception 'not_found';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_between(ua, ub) then
    raise exception 'blocked';
  end if;

  insert into public.dm_messages(thread_id, sender_id, body)
  values(p_thread_id, viewer, body)
  returning id into mid;

  -- Mark sender as read (so unread_count doesn't include their own message)
  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(p_thread_id, viewer, now())
  on conflict (thread_id, user_id) do update
    set last_read_at = excluded.last_read_at;

  -- Notify the other participant (best-effort)
  other := case when ua = viewer then ub else ua end;

  preview := left(body, 120);
  select coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), 'Someone')
    into sender_name
  from public.profiles p
  where p.user_id = viewer;

  insert into public.notifications(user_id, type, actor_user_id, entity_type, entity_id, title, body, is_read)
  values(
    other,
    'message',
    viewer,
    'dm_thread',
    p_thread_id,
    ('New message from ' || coalesce(sender_name,'Member')),
    preview,
    false
  );

  return mid;
end $$;

grant execute on function public.send_dm_message(uuid, text) to authenticated;
