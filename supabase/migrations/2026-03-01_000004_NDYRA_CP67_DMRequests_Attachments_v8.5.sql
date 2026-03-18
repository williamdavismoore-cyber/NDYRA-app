-- =========================================================
-- NDYRA CP67 — DM Requests + Attachments + Thread Controls
-- Build: 2026-03-01_67
--
-- Adds:
--  • DM Requests (for "anyone" DMs when not mutual/gym/staff)
--  • Anti-spam denial cooldown (14 days) after recipient declines
--  • Image attachments in DMs (storage path + metadata)
--  • Per-user thread controls: hide + clear (stored in dm_thread_reads)
--
-- Notes:
--  • Threads remain 1:1 (no group chats yet)
--  • Local QA mode remains UI-only; Real Login required for DM persistence
-- =========================================================

-- ---------------------------------------------------------
-- 1) Thread + per-user state
-- ---------------------------------------------------------

alter table public.dm_threads
  add column if not exists status text not null default 'active',
  add column if not exists requester_id uuid references auth.users(id) on delete set null,
  add column if not exists requested_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists request_message_id uuid references public.dm_messages(id) on delete set null;

create index if not exists dm_threads_status_idx on public.dm_threads(status);
create index if not exists dm_threads_requester_idx on public.dm_threads(requester_id);

alter table public.dm_thread_reads
  add column if not exists hidden boolean not null default false,
  add column if not exists cleared_before timestamptz;


-- ---------------------------------------------------------
-- 2) Anti-spam: denial cooldown table
-- ---------------------------------------------------------

create table if not exists public.dm_denials (
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  declined_at timestamptz not null default now(),
  primary key (requester_id, recipient_id)
);

alter table public.dm_denials enable row level security;
-- No direct client policies. Only SECURITY DEFINER RPCs use this.


-- ---------------------------------------------------------
-- 3) DM messages: attachment columns
-- ---------------------------------------------------------

alter table public.dm_messages
  add column if not exists media_type text,
  add column if not exists media_path text,
  add column if not exists media_width integer,
  add column if not exists media_height integer;

create index if not exists dm_messages_media_idx on public.dm_messages(thread_id, created_at desc)
  where media_path is not null;


-- ---------------------------------------------------------
-- 4) RPC: start_dm_thread(other) — request-aware
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

  mutual_follow boolean := false;
  shared_membership boolean := false;
  staff_to_member boolean := false;
  trusted boolean := false;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if other is null or other = viewer then
    raise exception 'invalid_target';
  end if;

  -- Respect recipient DM policy (and blocks)
  if not public.can_dm_user(other) then
    raise exception 'not_allowed';
  end if;

  -- Relationship level (trusted = mutual OR gym-mate OR staff->member OR platform admin)
  if public.is_platform_admin() then
    trusted := true;
  else
    select (
      exists(select 1 from public.follows_users a where a.follower_id = viewer and a.followee_id = other)
      and exists(select 1 from public.follows_users b where b.follower_id = other and b.followee_id = viewer)
    ) into mutual_follow;

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

    trusted := mutual_follow or shared_membership or staff_to_member;
  end if;

  -- If not trusted, enforce denial cooldown (14 days)
  if not trusted then
    if exists(
      select 1
      from public.dm_denials d
      where d.requester_id = viewer
        and d.recipient_id = other
        and d.declined_at > (now() - interval '14 days')
    ) then
      raise exception 'not_allowed';
    end if;
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

    -- Unhide for viewer
    update public.dm_thread_reads
      set hidden = false
    where thread_id = existing and user_id = viewer;

    return existing;
  end if;

  if trusted then
    insert into public.dm_threads(user_a, user_b, status)
    values(viewer, other, 'active')
    returning id into tid;
  else
    insert into public.dm_threads(user_a, user_b, status, requester_id, requested_at)
    values(viewer, other, 'requested', viewer, now())
    returning id into tid;
  end if;

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
-- 5) RPC: get_my_dm_threads — exclude hidden; include status
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
  unread_count int,
  thread_status text,
  is_outgoing_request boolean
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
      t.status,
      t.requester_id,
      t.requested_at,
      case when t.user_a = viewer then t.user_b else t.user_a end as other_id,
      t.user_a,
      t.user_b,
      coalesce(r.last_read_at, '1970-01-01'::timestamptz) as last_read_at,
      coalesce(r.hidden, false) as hidden,
      r.cleared_before
    from public.dm_threads t
    left join public.dm_thread_reads r
      on r.thread_id = t.id and r.user_id = viewer
    where viewer in (t.user_a, t.user_b)
      and not public.is_blocked_between(t.user_a, t.user_b)
  ), visible as (
    select * from threads
    where hidden = false
      and (
        status = 'active'
        or (status = 'requested' and requester_id = viewer) -- outgoing pending
      )
  ), last_msg as (
    select distinct on (m.thread_id)
      m.thread_id,
      m.body,
      m.media_path,
      m.created_at
    from public.dm_messages m
    join visible t on t.id = m.thread_id
    where (t.cleared_before is null or m.created_at > t.cleared_before)
    order by m.thread_id, m.created_at desc
  ), unread as (
    select
      t.id as thread_id,
      count(*)::int as unread_count
    from visible t
    join public.dm_messages m
      on m.thread_id = t.id
    where m.created_at > greatest(t.last_read_at, coalesce(t.cleared_before, '1970-01-01'::timestamptz))
      and m.sender_id <> viewer
    group by t.id
  )
  select
    t.id as thread_id,
    t.other_id as other_user_id,
    p.handle as other_handle,
    coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), '@member') as other_display_name,
    p.avatar_url as other_avatar_url,
    case
      when lm.media_path is not null then 'Sent a photo'
      when lm.body is null then null
      else left(lm.body, 120)
    end as last_message,
    lm.created_at as last_message_at,
    coalesce(u.unread_count, 0) as unread_count,
    t.status as thread_status,
    (t.status = 'requested' and t.requester_id = viewer) as is_outgoing_request
  from visible t
  left join public.profiles p on p.user_id = t.other_id
  left join last_msg lm on lm.thread_id = t.id
  left join unread u on u.thread_id = t.id
  order by coalesce(lm.created_at, t.created_at) desc nulls last
  limit lim
  offset off;
end $$;

grant execute on function public.get_my_dm_threads(int, int) to authenticated;


-- ---------------------------------------------------------
-- 6) RPC: get_my_dm_requests — incoming requests only
-- ---------------------------------------------------------

drop function if exists public.get_my_dm_requests(int, int);

create function public.get_my_dm_requests(p_limit int default 40, p_offset int default 0)
returns table(
  thread_id uuid,
  requester_user_id uuid,
  requester_handle text,
  requester_display_name text,
  requester_avatar_url text,
  request_message text,
  request_message_at timestamptz,
  requested_at timestamptz
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
      t.requester_id,
      t.requested_at,
      t.user_a,
      t.user_b,
      t.request_message_id,
      coalesce(r.hidden, false) as hidden
    from public.dm_threads t
    left join public.dm_thread_reads r
      on r.thread_id = t.id and r.user_id = viewer
    where viewer in (t.user_a, t.user_b)
      and t.status = 'requested'
      and t.requester_id is not null
      and t.requester_id <> viewer
      and not public.is_blocked_between(t.user_a, t.user_b)
  ), visible as (
    select * from threads where hidden = false
  )
  select
    t.id as thread_id,
    t.requester_id as requester_user_id,
    p.handle as requester_handle,
    coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), '@member') as requester_display_name,
    p.avatar_url as requester_avatar_url,
    case when m.body is null then null else left(m.body, 200) end as request_message,
    m.created_at as request_message_at,
    t.requested_at
  from visible t
  left join public.profiles p on p.user_id = t.requester_id
  left join public.dm_messages m on m.id = t.request_message_id
  order by coalesce(m.created_at, t.requested_at, now()) desc
  limit lim
  offset off;
end $$;

grant execute on function public.get_my_dm_requests(int, int) to authenticated;


-- ---------------------------------------------------------
-- 7) RPC: accept / decline / withdraw DM request
-- ---------------------------------------------------------

create or replace function public.accept_dm_request(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  req uuid;
  ua uuid;
  ub uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.requester_id, t.user_a, t.user_b
    into req, ua, ub
  from public.dm_threads t
  where t.id = p_thread_id and t.status = 'requested';

  if req is null then
    raise exception 'not_found';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  if viewer = req then
    raise exception 'forbidden';
  end if;

  if public.is_blocked_between(ua, ub) then
    raise exception 'blocked';
  end if;

  update public.dm_threads
    set status = 'active', accepted_at = now()
  where id = p_thread_id;

  -- Clear any denial cooldown (optional)
  delete from public.dm_denials
   where requester_id = req and recipient_id = viewer;

  -- Mark recipient as read
  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(p_thread_id, viewer, now())
  on conflict (thread_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        hidden = false;

  return true;
end $$;

grant execute on function public.accept_dm_request(uuid) to authenticated;


create or replace function public.decline_dm_request(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  req uuid;
  ua uuid;
  ub uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.requester_id, t.user_a, t.user_b
    into req, ua, ub
  from public.dm_threads t
  where t.id = p_thread_id and t.status = 'requested';

  if req is null then
    raise exception 'not_found';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  if viewer = req then
    raise exception 'forbidden';
  end if;

  -- Record denial cooldown (14 days enforced in start_dm_thread)
  insert into public.dm_denials(requester_id, recipient_id, declined_at)
  values(req, viewer, now())
  on conflict (requester_id, recipient_id) do update
    set declined_at = excluded.declined_at;

  -- Delete the request thread (cascades message + reads)
  delete from public.dm_threads where id = p_thread_id;

  return true;
end $$;

grant execute on function public.decline_dm_request(uuid) to authenticated;


create or replace function public.withdraw_dm_request(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  req uuid;
  ua uuid;
  ub uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.requester_id, t.user_a, t.user_b
    into req, ua, ub
  from public.dm_threads t
  where t.id = p_thread_id and t.status = 'requested';

  if req is null then
    raise exception 'not_found';
  end if;

  if viewer <> req then
    raise exception 'forbidden';
  end if;

  if not (viewer in (ua, ub)) then
    raise exception 'forbidden';
  end if;

  delete from public.dm_threads where id = p_thread_id;
  return true;
end $$;

grant execute on function public.withdraw_dm_request(uuid) to authenticated;


-- ---------------------------------------------------------
-- 8) RPC: hide / clear thread (per-user)
-- ---------------------------------------------------------

create or replace function public.hide_dm_thread(p_thread_id uuid, p_hidden boolean default true)
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

  insert into public.dm_thread_reads(thread_id, user_id, last_read_at, hidden)
  values(p_thread_id, viewer, now(), coalesce(p_hidden,true))
  on conflict (thread_id, user_id) do update
    set hidden = excluded.hidden;

  return true;
end $$;

grant execute on function public.hide_dm_thread(uuid, boolean) to authenticated;


create or replace function public.clear_dm_thread(p_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  ua uuid;
  ub uuid;
  ts timestamptz := now();
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

  insert into public.dm_thread_reads(thread_id, user_id, last_read_at, cleared_before, hidden)
  values(p_thread_id, viewer, ts, ts, false)
  on conflict (thread_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        cleared_before = excluded.cleared_before,
        hidden = false;

  return true;
end $$;

grant execute on function public.clear_dm_thread(uuid) to authenticated;


-- ---------------------------------------------------------
-- 9) RPC: get_dm_messages — respect cleared_before; include media
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
  created_at timestamptz,
  media_type text,
  media_path text,
  media_width integer,
  media_height integer
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
  cleared timestamptz;
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

  select r.cleared_before into cleared
  from public.dm_thread_reads r
  where r.thread_id = p_thread_id and r.user_id = viewer;

  cleared := coalesce(cleared, '1970-01-01'::timestamptz);

  return query
    select
      m.id as message_id,
      m.thread_id,
      m.sender_id,
      m.body,
      m.created_at,
      m.media_type,
      m.media_path,
      m.media_width,
      m.media_height
    from public.dm_messages m
    where m.thread_id = p_thread_id
      and m.created_at > cleared
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit lim;
end $$;

grant execute on function public.get_dm_messages(uuid, int, timestamptz) to authenticated;


-- ---------------------------------------------------------
-- 10) RPC: send_dm_message — request gating + optional media
-- ---------------------------------------------------------

-- Drop the old signature (uuid,text) and recreate with optional media args.
-- Supabase RPC calls by named args; omitted args use defaults.

drop function if exists public.send_dm_message(uuid, text);

drop function if exists public.send_dm_message(uuid, text, text, text, int, int);

create function public.send_dm_message(
  p_thread_id uuid,
  p_body text,
  p_media_path text default null,
  p_media_type text default null,
  p_media_width int default null,
  p_media_height int default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  ua uuid;
  ub uuid;
  other uuid;
  preview text;
  sender_name text;

  body text := trim(coalesce(p_body,''));
  mt text := nullif(trim(coalesce(p_media_type,'')), '');
  mp text := nullif(trim(coalesce(p_media_path,'')), '');

  t_status text;
  t_requester uuid;
  t_request_message uuid;

  mid uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select t.user_a, t.user_b, t.status, t.requester_id, t.request_message_id
    into ua, ub, t_status, t_requester, t_request_message
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

  -- Request gating
  if coalesce(t_status,'active') = 'requested' then
    if t_requester is null then
      raise exception 'not_allowed';
    end if;

    if viewer <> t_requester then
      raise exception 'request_not_accepted';
    end if;

    if t_request_message is not null then
      raise exception 'request_already_sent';
    end if;
  end if;

  -- Media validation
  if mp is not null then
    if mt is null then
      mt := 'image';
    end if;
    if mt <> 'image' then
      raise exception 'unsupported_media';
    end if;
  end if;

  -- If media-only, auto-fill body
  if char_length(body) < 1 and mp is not null then
    body := 'Sent a photo';
  end if;

  if char_length(body) < 1 then
    raise exception 'empty_message';
  end if;

  if char_length(body) > 2000 then
    raise exception 'message_too_long';
  end if;

  insert into public.dm_messages(thread_id, sender_id, body, media_type, media_path, media_width, media_height)
  values(p_thread_id, viewer, body, mt, mp, p_media_width, p_media_height)
  returning id into mid;

  -- If this was a request thread, lock the request message id
  if coalesce(t_status,'active') = 'requested' then
    update public.dm_threads
      set request_message_id = mid
    where id = p_thread_id;
  end if;

  -- Mark sender as read (so unread_count doesn't include their own message)
  insert into public.dm_thread_reads(thread_id, user_id, last_read_at)
  values(p_thread_id, viewer, now())
  on conflict (thread_id, user_id) do update
    set last_read_at = excluded.last_read_at,
        hidden = false;

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
    (
      case when coalesce(t_status,'active') = 'requested'
        then ('Message request from ' || coalesce(sender_name,'Member'))
        else ('New message from ' || coalesce(sender_name,'Member'))
      end
    ),
    preview,
    false
  );

  return mid;
end $$;

grant execute on function public.send_dm_message(uuid, text, text, text, int, int) to authenticated;

