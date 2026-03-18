-- =========================================================
-- NDYRA CP61 — Challenge Rewards (Badges) + Notifications alignment
-- Build ID: 2026-02-28_61
-- Intent:
--   • Add a lightweight badge system (trophy cabinet)
--   • Award badges for season participation + milestones
--   • Emit notifications (type: system) for badge unlocks
--   • Add an "end season" RPC to award Top10 / Champion badges
-- =========================================================

-- ---------------------------------------------------------
-- 1) Badge definitions
-- ---------------------------------------------------------
create table if not exists public.badges (
  key text primary key,
  title text not null,
  description text,
  icon text, -- emoji or icon key (UI may map to SVG later)
  kind text not null default 'challenge',
  rarity text not null default 'common',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.badges enable row level security;

drop policy if exists "badges_select_public" on public.badges;
create policy "badges_select_public"
on public.badges for select
to anon, authenticated
using (is_active = true);

-- ---------------------------------------------------------
-- 2) User badges (awarded instances)
-- ---------------------------------------------------------
create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null references public.badges(key) on delete cascade,
  source_type text not null default 'global', -- challenge|rating|system
  source_id uuid not null default '00000000-0000-0000-0000-000000000000'::uuid,
  meta jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key, source_type, source_id)
);

create index if not exists user_badges_user_idx
  on public.user_badges(user_id, awarded_at desc);

alter table public.user_badges enable row level security;

drop policy if exists "user_badges_select_own" on public.user_badges;
create policy "user_badges_select_own"
on public.user_badges for select
to authenticated
using (auth.uid() = user_id);

-- ---------------------------------------------------------
-- 3) Seed default badges (idempotent upserts)
-- ---------------------------------------------------------
insert into public.badges(key, title, description, icon, kind, rarity)
values
  ('season_joined',   'Season Starter', 'You joined a season challenge. Momentum starts here.', '🏁', 'challenge', 'common'),
  ('season_first_log','First Rep',      'First points on the board this season.',              '🔥', 'challenge', 'common'),
  ('streak_3',        '3‑Day Streak',   'Three days in a row. Consistency is a weapon.',       '⚡', 'challenge', 'common'),
  ('streak_7',        '7‑Day Streak',   'A full week. The habit is forming.',                  '🟥', 'challenge', 'rare'),
  ('streak_14',       '14‑Day Streak',  'Two weeks deep. Now it gets real.',                   '🛡️', 'challenge', 'epic'),
  ('points_100',      '100 Points',     'You crossed 100 season points.',                      '💯', 'challenge', 'common'),
  ('points_250',      '250 Points',     'You crossed 250 season points.',                      '🏋️', 'challenge', 'rare'),
  ('points_500',      '500 Points',     'You crossed 500 season points.',                      '🏆', 'challenge', 'epic'),
  ('season_top10',    'Top 10',         'You finished a season in the Top 10.',                '🎖️', 'challenge', 'epic'),
  ('season_champion', 'Season Champion','You finished #1. Absolute dominance.',                '👑', 'challenge', 'legendary')
on conflict (key) do update
  set title = excluded.title,
      description = excluded.description,
      icon = excluded.icon,
      kind = excluded.kind,
      rarity = excluded.rarity,
      is_active = true;

-- ---------------------------------------------------------
-- 4) Award badge helper (issues notification on first award)
-- ---------------------------------------------------------
create or replace function public.award_badge(
  p_user_id uuid,
  p_badge_key text,
  p_source_type text default 'global',
  p_source_id uuid default null,
  p_meta jsonb default '{}'::jsonb,
  p_notify boolean default true
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid := coalesce(p_source_id, '00000000-0000-0000-0000-000000000000'::uuid);
  b public.badges%rowtype;
  inserted uuid;
begin
  if p_user_id is null then
    raise exception 'user_required';
  end if;
  if p_badge_key is null or length(trim(p_badge_key)) = 0 then
    raise exception 'badge_required';
  end if;

  select * into b from public.badges where key = p_badge_key and is_active = true;
  if b.key is null then
    raise exception 'badge_not_found';
  end if;

  insert into public.user_badges(user_id, badge_key, source_type, source_id, meta, awarded_at)
  values(p_user_id, p_badge_key, coalesce(nullif(trim(p_source_type),''),'global'), sid, coalesce(p_meta,'{}'::jsonb), now())
  on conflict (user_id, badge_key, source_type, source_id) do nothing
  returning id into inserted;

  if inserted is null then
    return false;
  end if;

  -- Notifications table (CP27) uses: user_id, type, actor_user_id, entity_type, entity_id, title, body, is_read
  if p_notify and to_regclass('public.notifications') is not null then
    insert into public.notifications(user_id, type, actor_user_id, entity_type, entity_id, title, body, is_read, created_at)
    values(
      p_user_id,
      'system',
      null,
      case when p_source_type = 'challenge' then 'challenge' else 'badge' end,
      case when p_source_type = 'challenge' then sid else null end,
      'Badge unlocked: ' || b.title,
      b.description,
      false,
      now()
    );
  end if;

  return true;
end $$;

grant execute on function public.award_badge(uuid, text, text, uuid, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------
-- 5) Trophy cabinet RPC (self only for now)
-- ---------------------------------------------------------
create or replace function public.get_trophy_cabinet(
  p_user_id uuid default null,
  p_limit int default 50
)
returns table(
  badge_key text,
  title text,
  description text,
  icon text,
  rarity text,
  awarded_at timestamptz,
  source_type text,
  source_id uuid,
  meta jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  uid uuid := coalesce(p_user_id, auth.uid());
  lim int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  -- For CP61 we keep it strict: you can only view your own trophy cabinet.
  if uid <> viewer and not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
    select
      ub.badge_key,
      b.title,
      b.description,
      b.icon,
      b.rarity,
      ub.awarded_at,
      ub.source_type,
      ub.source_id,
      ub.meta
    from public.user_badges ub
    join public.badges b on b.key = ub.badge_key
    where ub.user_id = uid
    order by ub.awarded_at desc
    limit lim;
end $$;

grant execute on function public.get_trophy_cabinet(uuid, int) to authenticated;

-- ---------------------------------------------------------
-- 6) Challenge season end RPC (awards Top10 + Champion)
-- ---------------------------------------------------------
create or replace function public.end_challenge_season(
  p_challenge_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  tid uuid;
  champ uuid;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;
  if p_challenge_id is null then
    raise exception 'challenge_required';
  end if;

  select c.tenant_id into tid
  from public.challenges c
  where c.id = p_challenge_id;

  if tid is null then
    raise exception 'not_found';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(tid)) then
    raise exception 'forbidden';
  end if;

  -- Idempotent end
  update public.challenges
    set status = 'ended', updated_at = now()
  where id = p_challenge_id;

  -- Award Top10
  for champ in
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
    order by cp.total_points desc, cp.updated_at desc
    limit 10
  loop
    perform public.award_badge(champ, 'season_top10', 'challenge', p_challenge_id, '{}'::jsonb, true);
  end loop;

  -- Champion
  select cp.user_id into champ
  from public.challenge_participants cp
  where cp.challenge_id = p_challenge_id
  order by cp.total_points desc, cp.updated_at desc
  limit 1;

  if champ is not null then
    perform public.award_badge(champ, 'season_champion', 'challenge', p_challenge_id, '{}'::jsonb, true);
  end if;

  return true;
end $$;

grant execute on function public.end_challenge_season(uuid) to authenticated;

-- ---------------------------------------------------------
-- 7) Patch Challenges RPCs to award badges
-- ---------------------------------------------------------

-- Join challenge: award Season Starter (once per season)
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

  -- Award badge (first time per season).
  perform public.award_badge(viewer, 'season_joined', 'challenge', p_challenge_id, '{}'::jsonb, true);

  return true;
end $$;

grant execute on function public.join_challenge(uuid) to authenticated;

-- Log activity: award milestone badges (first log, streaks, points)
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
  before_total int := 0;
  after_total int := 0;
  had_logs_before boolean := false;
  streak int := 0;
  d date;
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

  -- Did the user already log anything for this season?
  select exists(
    select 1 from public.challenge_logs l
    where l.challenge_id = p_challenge_id and l.user_id = viewer
  ) into had_logs_before;

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

  -- Track totals (before/after)
  select coalesce(total_points,0) into before_total
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = viewer;

  update public.challenge_participants
    set total_points = greatest(0, total_points + delta),
        updated_at = now()
  where challenge_id = p_challenge_id
    and user_id = viewer;

  select coalesce(total_points,0) into after_total
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = viewer;

  -- Badge: first log
  if not had_logs_before and delta > 0 then
    perform public.award_badge(viewer, 'season_first_log', 'challenge', p_challenge_id, '{}'::jsonb, true);
  end if;

  -- Badge: points milestones
  if before_total < 100 and after_total >= 100 then
    perform public.award_badge(viewer, 'points_100', 'challenge', p_challenge_id, jsonb_build_object('points', after_total), true);
  end if;
  if before_total < 250 and after_total >= 250 then
    perform public.award_badge(viewer, 'points_250', 'challenge', p_challenge_id, jsonb_build_object('points', after_total), true);
  end if;
  if before_total < 500 and after_total >= 500 then
    perform public.award_badge(viewer, 'points_500', 'challenge', p_challenge_id, jsonb_build_object('points', after_total), true);
  end if;

  -- Badge: streak milestones (any task logged on consecutive days)
  streak := 0;
  d := day;
  loop
    exit when not exists(
      select 1 from public.challenge_logs l
      where l.challenge_id = p_challenge_id
        and l.user_id = viewer
        and l.logged_at = d
    );
    streak := streak + 1;
    d := d - 1;
    exit when streak >= 60;
  end loop;

  if streak >= 3 then
    perform public.award_badge(viewer, 'streak_3', 'challenge', p_challenge_id, jsonb_build_object('streak', streak), true);
  end if;
  if streak >= 7 then
    perform public.award_badge(viewer, 'streak_7', 'challenge', p_challenge_id, jsonb_build_object('streak', streak), true);
  end if;
  if streak >= 14 then
    perform public.award_badge(viewer, 'streak_14', 'challenge', p_challenge_id, jsonb_build_object('streak', streak), true);
  end if;

  return query
    select after_total as total_points,
           delta as delta_points,
           new_points as day_points;
end $$;

grant execute on function public.log_challenge_activity(uuid, text, int, date) to authenticated;
