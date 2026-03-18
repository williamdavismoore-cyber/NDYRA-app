-- =========================================================
-- NDYRA CP59 — Challenges (Season MVP)
-- Build ID: 2026-02-27_59
-- Intent:
--   • Ship a gym-scoped, time-boxed “season” challenge model (30-day style)
--   • Tasks-based scoring (points) + leaderboard
--   • RLS-safe via SECURITY DEFINER RPCs (no raw participant/log leakage)
-- =========================================================

-- ---------------------------------------------------------
-- 0) Types
-- ---------------------------------------------------------
do $$ begin
  create type public.challenge_status as enum ('draft','active','ended','archived');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  starts_at date not null,
  ends_at date not null,
  status public.challenge_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index if not exists challenges_tenant_status_idx
  on public.challenges(tenant_id, status, starts_at desc);

alter table public.challenges enable row level security;

create table if not exists public.challenge_tasks (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  key text not null,
  title text not null,
  description text,
  points_per_unit int not null default 1,
  cap_per_day int,
  cap_total int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (challenge_id, key)
);

create index if not exists challenge_tasks_challenge_idx
  on public.challenge_tasks(challenge_id);

alter table public.challenge_tasks enable row level security;

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  total_points int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create index if not exists challenge_participants_points_idx
  on public.challenge_participants(challenge_id, total_points desc, updated_at desc);

alter table public.challenge_participants enable row level security;

create table if not exists public.challenge_logs (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  task_key text not null,
  logged_at date not null default ((now() at time zone 'utc')::date),
  units int not null default 1,
  points int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (units > 0)
);

-- One log per user/day/task (we treat rows as daily totals per task)
do $$ begin
  alter table public.challenge_logs
    add constraint challenge_logs_unique_user_day_task unique (challenge_id, user_id, task_key, logged_at);
exception when duplicate_object then null; end $$;

create index if not exists challenge_logs_user_idx
  on public.challenge_logs(user_id, created_at desc);
create index if not exists challenge_logs_challenge_idx
  on public.challenge_logs(challenge_id, logged_at desc);

alter table public.challenge_logs enable row level security;

-- ---------------------------------------------------------
-- 2) RLS Policies (read-only; writes via RPCs)
-- ---------------------------------------------------------

-- Challenges readable to tenant members/staff (and platform admins)
drop policy if exists "challenges_select_members" on public.challenges;
create policy "challenges_select_members"
on public.challenges for select to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
  or public.is_tenant_member(tenant_id)
);

-- Staff/admin can manage challenges
drop policy if exists "challenges_write_staff" on public.challenges;
create policy "challenges_write_staff"
on public.challenges for all to authenticated
using (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
)
with check (
  public.is_platform_admin()
  or public.is_tenant_staff(tenant_id)
);

-- Tasks readable to tenant members/staff
drop policy if exists "challenge_tasks_select_members" on public.challenge_tasks;
create policy "challenge_tasks_select_members"
on public.challenge_tasks for select to authenticated
using (
  exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (
        public.is_platform_admin()
        or public.is_tenant_staff(c.tenant_id)
        or public.is_tenant_member(c.tenant_id)
      )
  )
);

-- Staff/admin can manage tasks
drop policy if exists "challenge_tasks_write_staff" on public.challenge_tasks;
create policy "challenge_tasks_write_staff"
on public.challenge_tasks for all to authenticated
using (
  exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (public.is_platform_admin() or public.is_tenant_staff(c.tenant_id))
  )
)
with check (
  exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (public.is_platform_admin() or public.is_tenant_staff(c.tenant_id))
  )
);

-- Participants: self view or staff view
drop policy if exists "challenge_participants_select_self_or_staff" on public.challenge_participants;
create policy "challenge_participants_select_self_or_staff"
on public.challenge_participants for select to authenticated
using (
  auth.uid() = user_id
  or exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (public.is_platform_admin() or public.is_tenant_staff(c.tenant_id))
  )
);

-- Logs: self view or staff view
drop policy if exists "challenge_logs_select_self_or_staff" on public.challenge_logs;
create policy "challenge_logs_select_self_or_staff"
on public.challenge_logs for select to authenticated
using (
  auth.uid() = user_id
  or exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (public.is_platform_admin() or public.is_tenant_staff(c.tenant_id))
  )
);

-- NOTE: No insert/update/delete policies for participants/logs.
--       Writes must go through the RPCs below.

-- ---------------------------------------------------------
-- 3) RPCs
-- ---------------------------------------------------------

-- Helper: can the viewer see/manage challenges for a tenant?
create or replace function public.can_manage_challenges(p_tenant_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
begin
  if viewer is null then return false; end if;
  if p_tenant_id is null then return false; end if;
  return (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id));
end $$;

grant execute on function public.can_manage_challenges(uuid) to authenticated;

-- List challenges for a tenant (active + ended) with viewer join/points.
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
      and c.status in ('active','ended')
    order by c.starts_at desc, c.created_at desc;
end $$;

grant execute on function public.get_active_challenges(uuid) to authenticated;

-- Get tasks for a challenge
create or replace function public.get_challenge_tasks(p_challenge_id uuid)
returns table(
  task_key text,
  title text,
  description text,
  points_per_unit int,
  cap_per_day int,
  cap_total int
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
  if p_challenge_id is null then
    return;
  end if;

  select c.tenant_id into tid
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_staff(tid)
    or public.is_tenant_member(tid)
  ) then
    raise exception 'forbidden';
  end if;

  return query
    select
      t.key as task_key,
      t.title,
      t.description,
      t.points_per_unit,
      t.cap_per_day,
      t.cap_total
    from public.challenge_tasks t
    where t.challenge_id = p_challenge_id
    order by t.created_at asc;
end $$;

grant execute on function public.get_challenge_tasks(uuid) to authenticated;

-- Join a challenge
create or replace function public.join_challenge(p_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tid uuid;
  st public.challenge_status;
  sd date;
  ed date;
  today date := (now() at time zone 'utc')::date;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select c.tenant_id, c.status, c.starts_at, c.ends_at
  into tid, st, sd, ed
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_staff(tid)
    or public.is_tenant_member(tid)
  ) then
    raise exception 'forbidden';
  end if;

  if st <> 'active' then
    raise exception 'challenge_not_active';
  end if;

  if today < sd then
    raise exception 'challenge_not_started';
  end if;
  if today > ed then
    raise exception 'challenge_ended';
  end if;

  insert into public.challenge_participants(challenge_id, user_id, joined_at, total_points, updated_at)
  values(p_challenge_id, viewer, now(), 0, now())
  on conflict (challenge_id, user_id) do update
    set updated_at = excluded.updated_at;

  return true;
end $$;

grant execute on function public.join_challenge(uuid) to authenticated;

-- Log activity for a challenge task (daily totals per task)
create or replace function public.log_challenge_activity(
  p_challenge_id uuid,
  p_task_key text,
  p_units int default 1,
  p_day date default null
)
returns table(
  total_points int,
  delta_points int,
  day_points int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tid uuid;
  st public.challenge_status;
  sd date;
  ed date;
  day date := coalesce(p_day, (now() at time zone 'utc')::date);
  units int := greatest(1, coalesce(p_units, 1));
  ppu int;
  cap_day int;
  cap_total int;
  existing_units int := 0;
  existing_points int := 0;
  new_units int;
  new_points int;
  total_units_so_far int := 0;
  delta int;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if p_challenge_id is null then
    raise exception 'challenge_required';
  end if;

  select c.tenant_id, c.status, c.starts_at, c.ends_at
  into tid, st, sd, ed
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_staff(tid)
    or public.is_tenant_member(tid)
  ) then
    raise exception 'forbidden';
  end if;

  if st <> 'active' then
    raise exception 'challenge_not_active';
  end if;

  if day < sd or day > ed then
    raise exception 'outside_window';
  end if;

  -- Ensure participant exists (join is idempotent)
  perform public.join_challenge(p_challenge_id);

  -- Load task rules
  select t.points_per_unit, t.cap_per_day, t.cap_total
  into ppu, cap_day, cap_total
  from public.challenge_tasks t
  where t.challenge_id = p_challenge_id
    and t.key = p_task_key;

  if ppu is null then
    raise exception 'task_not_found';
  end if;

  -- Existing daily row
  select coalesce(l.units,0), coalesce(l.points,0)
  into existing_units, existing_points
  from public.challenge_logs l
  where l.challenge_id = p_challenge_id
    and l.user_id = viewer
    and l.task_key = p_task_key
    and l.logged_at = day;

  -- Total units for this task across the whole challenge (excluding today's row)
  select coalesce(sum(l.units),0)
  into total_units_so_far
  from public.challenge_logs l
  where l.challenge_id = p_challenge_id
    and l.user_id = viewer
    and l.task_key = p_task_key
    and l.logged_at <> day;

  new_units := existing_units + units;

  if cap_day is not null and new_units > cap_day then
    raise exception 'cap_per_day';
  end if;

  if cap_total is not null and (total_units_so_far + new_units) > cap_total then
    raise exception 'cap_total';
  end if;

  new_points := new_units * ppu;
  delta := new_points - existing_points;

  -- Upsert daily totals row
  insert into public.challenge_logs(challenge_id, user_id, task_key, logged_at, units, points, created_at, updated_at)
  values(p_challenge_id, viewer, p_task_key, day, new_units, new_points, now(), now())
  on conflict (challenge_id, user_id, task_key, logged_at) do update
    set units = excluded.units,
        points = excluded.points,
        updated_at = excluded.updated_at;

  -- Apply delta to participant total
  update public.challenge_participants
    set total_points = greatest(0, total_points + delta),
        updated_at = now()
  where challenge_id = p_challenge_id
    and user_id = viewer;

  return query
    select
      (select cp.total_points from public.challenge_participants cp where cp.challenge_id = p_challenge_id and cp.user_id = viewer) as total_points,
      delta as delta_points,
      new_points as day_points;
end $$;

grant execute on function public.log_challenge_activity(uuid, text, int, date) to authenticated;

-- Leaderboard (minimal fields)
create or replace function public.get_challenge_leaderboard(
  p_challenge_id uuid,
  p_limit int default 50
)
returns table(
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  total_points int,
  rank int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tid uuid;
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;
  if p_challenge_id is null then
    return;
  end if;

  select c.tenant_id into tid
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_tenant_staff(tid)
    or public.is_tenant_member(tid)
  ) then
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
      r.user_id,
      p.handle,
      coalesce(p.display_name, p.full_name, nullif(split_part(p.email,'@',1),''), '@member') as display_name,
      p.avatar_url,
      r.total_points,
      r.rnk::int as rank
    from ranked r
    left join public.profiles p on p.user_id = r.user_id
    where not public.is_blocked_between(viewer, r.user_id)
    order by r.rank asc
    limit lim;
end $$;

grant execute on function public.get_challenge_leaderboard(uuid, int) to authenticated;

-- Convenience: create a default 30-day challenge with three tasks (staff/admin only)
create or replace function public.create_default_30d_challenge(p_tenant_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  cid uuid;
  start_d date := (now() at time zone 'utc')::date;
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

  -- Reuse an existing active season if present.
  select c.id into cid
  from public.challenges c
  where c.tenant_id = p_tenant_id
    and c.status = 'active'
    and lower(c.title) = lower('30-Day Consistency Challenge')
    and c.ends_at >= start_d
  order by c.created_at desc
  limit 1;

  if cid is not null then
    return cid;
  end if;

  insert into public.challenges(tenant_id, title, description, starts_at, ends_at, status, created_by, created_at, updated_at)
  values(
    p_tenant_id,
    '30-Day Consistency Challenge',
    'Show up and stack points. Log training, recovery, and community actions. Leaderboard resets at the end of the season.',
    start_d,
    start_d + 30,
    'active',
    viewer,
    now(),
    now()
  )
  returning id into cid;

  insert into public.challenge_tasks(challenge_id, key, title, description, points_per_unit, cap_per_day, cap_total, created_at, updated_at)
  values
    (cid, 'train',   'Train',   'Log one training session (class or workout).', 10, 1, null, now(), now()),
    (cid, 'recover', 'Recover', 'Mobility, stretch, breathwork, or recovery work.', 5, 1, null, now(), now()),
    (cid, 'support', 'Support', 'Encourage someone or help the community.', 2, 1, null, now(), now());

  return cid;
end $$;

grant execute on function public.create_default_30d_challenge(uuid) to authenticated;
