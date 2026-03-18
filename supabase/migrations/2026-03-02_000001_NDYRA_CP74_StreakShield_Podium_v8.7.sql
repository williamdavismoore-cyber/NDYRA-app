-- =========================================================
-- NDYRA CP74 — Streak Shield + Streak Milestones + Podium polish
-- Build: 2026-03-02_74
--
-- Adds:
--  • Per-season Streak Shields (one-tap protect a missed day)
--  • New streak badge milestones: 21 + 30
--  • Streak computation in log_challenge_activity() now respects shield days
--
-- Notes:
--  • RLS remains tight: shields table is read-only under RLS; writes via SECURITY DEFINER RPC.
--  • Shield usage does NOT award points.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Participant columns: shield allowance + usage
-- ---------------------------------------------------------

alter table public.challenge_participants
  add column if not exists streak_shields_total int not null default 1;

alter table public.challenge_participants
  add column if not exists streak_shields_used int not null default 0;

comment on column public.challenge_participants.streak_shields_total is
  'Total streak shields available for this participant within this challenge season.';

comment on column public.challenge_participants.streak_shields_used is
  'How many streak shields have been used by this participant within this challenge season.';


-- ---------------------------------------------------------
-- 2) Shield days table (gap fill for streak math)
-- ---------------------------------------------------------

create table if not exists public.challenge_streak_shields (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  shield_day date not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id, shield_day)
);

create index if not exists challenge_streak_shields_user_idx
  on public.challenge_streak_shields(user_id, created_at desc);

create index if not exists challenge_streak_shields_challenge_day_idx
  on public.challenge_streak_shields(challenge_id, shield_day desc);

alter table public.challenge_streak_shields enable row level security;

drop policy if exists "challenge_streak_shields_select_self_or_staff" on public.challenge_streak_shields;
create policy "challenge_streak_shields_select_self_or_staff"
on public.challenge_streak_shields for select to authenticated
using (
  auth.uid() = user_id
  or exists(
    select 1
    from public.challenges c
    where c.id = challenge_id
      and (public.is_platform_admin() or public.is_tenant_staff(c.tenant_id))
  )
);

-- ---------------------------------------------------------
-- 3) New badge milestones (idempotent)
-- ---------------------------------------------------------

insert into public.badges(key, title, description, icon, kind, rarity)
values
  ('streak_21', '21‑Day Streak', 'Three weeks in a row. You’re built for this.', '📆', 'challenge', 'epic'),
  ('streak_30', '30‑Day Streak', 'A full season streak. Mythic consistency.', '⭐', 'challenge', 'legendary')
on conflict (key) do update
  set title = excluded.title,
      description = excluded.description,
      icon = excluded.icon,
      kind = excluded.kind,
      rarity = excluded.rarity,
      is_active = true;


-- ---------------------------------------------------------
-- 4) RPC: Use streak shield (yesterday only; no consecutive shields)
-- ---------------------------------------------------------

create or replace function public.use_streak_shield(
  p_challenge_id uuid,
  p_day date default null
)
returns table(
  shield_day date,
  shields_total int,
  shields_used int
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
  today date := (now() at time zone 'utc')::date;
  day date := coalesce(p_day, today - 1);
  total int := 0;
  used int := 0;
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

  -- Only allow shielding yesterday (UTC) to prevent retro abuse.
  if day <> (today - 1) then
    raise exception 'shield_day_must_be_yesterday';
  end if;

  if day < sd or day > ed then
    raise exception 'outside_window';
  end if;

  -- Must be a true miss (no logs on that day)
  if exists(
    select 1 from public.challenge_logs l
    where l.challenge_id = p_challenge_id
      and l.user_id = viewer
      and l.logged_at = day
  ) then
    raise exception 'already_logged_that_day';
  end if;

  -- Prevent consecutive shields: require a REAL log on the day before.
  if not exists(
    select 1 from public.challenge_logs l
    where l.challenge_id = p_challenge_id
      and l.user_id = viewer
      and l.logged_at = (day - 1)
  ) then
    raise exception 'requires_log_previous_day';
  end if;

  -- Ensure participant exists
  perform public.join_challenge(p_challenge_id);

  select coalesce(cp.streak_shields_total,1), coalesce(cp.streak_shields_used,0)
    into total, used
  from public.challenge_participants cp
  where cp.challenge_id = p_challenge_id
    and cp.user_id = viewer;

  if total <= used then
    raise exception 'no_shields_remaining';
  end if;

  -- Record shield day (idempotent)
  insert into public.challenge_streak_shields(challenge_id, user_id, shield_day, created_at)
  values(p_challenge_id, viewer, day, now())
  on conflict (challenge_id, user_id, shield_day) do nothing;

  if not found then
    raise exception 'shield_already_used_for_day';
  end if;

  update public.challenge_participants
    set streak_shields_used = streak_shields_used + 1,
        updated_at = now()
  where challenge_id = p_challenge_id and user_id = viewer;

  select coalesce(cp.streak_shields_total,1), coalesce(cp.streak_shields_used,0)
    into total, used
  from public.challenge_participants cp
  where cp.challenge_id = p_challenge_id and cp.user_id = viewer;

  -- Optional: notification
  if to_regclass('public.notifications') is not null then
    insert into public.notifications(user_id, type, actor_user_id, entity_type, entity_id, title, body, is_read, created_at)
    values(
      viewer,
      'system',
      null,
      'challenge',
      p_challenge_id,
      'Streak protected',
      'Streak Shield used for ' || day::text || '. Keep going.',
      false,
      now()
    );
  end if;

  return query select day as shield_day, total as shields_total, used as shields_used;
end $$;

grant execute on function public.use_streak_shield(uuid, date) to authenticated;


-- ---------------------------------------------------------
-- 5) Update log_challenge_activity(): streak math includes shield days
-- ---------------------------------------------------------

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
  -- CP74: shields count as continuity days for streak math.
  streak := 0;
  d := day;
  loop
    exit when not (
      exists(
        select 1 from public.challenge_logs l
        where l.challenge_id = p_challenge_id
          and l.user_id = viewer
          and l.logged_at = d
      )
      or exists(
        select 1 from public.challenge_streak_shields s
        where s.challenge_id = p_challenge_id
          and s.user_id = viewer
          and s.shield_day = d
      )
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
  if streak >= 21 then
    perform public.award_badge(viewer, 'streak_21', 'challenge', p_challenge_id, jsonb_build_object('streak', streak), true);
  end if;
  if streak >= 30 then
    perform public.award_badge(viewer, 'streak_30', 'challenge', p_challenge_id, jsonb_build_object('streak', streak), true);
  end if;

  return query
    select after_total as total_points,
           delta as delta_points,
           new_points as day_points;
end $$;

grant execute on function public.log_challenge_activity(uuid, text, int, date) to authenticated;
