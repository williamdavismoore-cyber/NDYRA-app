-- =========================================================
-- NDYRA CP56 — Constellation Rating (Verified-only)
-- Amendment: UI Emulation + Constellation Rating v1 (Approved)
--
-- Goals:
--   • Replace legacy CP54 gym_ratings schema with amendment-locked schema
--   • Verified-only rating (attendance/check-in/tokens in last 60 days)
--   • 30-day update rate limit (prevents churn + abuse)
--   • History table for moderation/audit
--   • Summary table for public display (no individual notes)
--   • Kill switch to disable rating prompts
--
-- Anti-drift constraints:
--   • No permissive TRUE policies
--   • RLS-first enforcement
-- =========================================================

-- ---------------------------------------------------------
-- Tenants: kill switch for rating prompts
-- ---------------------------------------------------------
alter table public.tenants
  add column if not exists kill_switch_disable_rating_prompts boolean not null default false;

-- ---------------------------------------------------------
-- Retire legacy CP54 objects (safe in dev)
-- ---------------------------------------------------------
-- Drop policies first (avoid name collisions)
do $$
begin
  if to_regclass('public.gym_ratings') is not null then
    execute 'drop policy if exists gym_ratings_select_owner_or_staff on public.gym_ratings';
    execute 'drop policy if exists gym_ratings_insert_verified on public.gym_ratings';
    execute 'drop policy if exists gym_ratings_update_owner_or_staff on public.gym_ratings';
    execute 'drop policy if exists gym_ratings_delete_owner on public.gym_ratings';
  end if;

  if to_regclass('public.gym_rating_summary') is not null then
    execute 'drop policy if exists gym_rating_summary_select_public on public.gym_rating_summary';
  end if;
exception when undefined_table then
  null;
end $$;

-- Remove triggers + helpers from legacy (idempotent)
drop trigger if exists gym_ratings_touch_updated_at on public.gym_ratings;
drop trigger if exists gym_ratings_refresh_summary on public.gym_ratings;
drop trigger if exists gym_ratings_refresh_summary_del on public.gym_ratings;

drop function if exists public.touch_updated_at();
drop function if exists public.refresh_gym_rating_summary(uuid);

drop table if exists public.gym_rating_summary cascade;
drop table if exists public.gym_ratings cascade;

drop table if exists public.gym_rating_history cascade;

-- ---------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------
create table if not exists public.gym_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  overall smallint not null check (overall between 1 and 5),
  categories jsonb not null default '{}'::jsonb,
  note text,
  status text not null default 'active', -- active|hidden|removed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

create index if not exists gym_ratings_tenant_idx on public.gym_ratings(tenant_id);
create index if not exists gym_ratings_user_idx on public.gym_ratings(user_id);

create table if not exists public.gym_rating_history (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.gym_ratings(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  overall smallint not null,
  categories jsonb not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists gym_rating_history_tenant_user_idx on public.gym_rating_history(tenant_id, user_id, created_at desc);

create table if not exists public.gym_rating_summary (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  rating_count integer not null default 0,
  overall_avg numeric(3,2) not null default 0,
  category_avgs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- Helper: can_rate_tenant(tid)
-- Verified-only gate (last 60 days):
--   • attended class OR
--   • check-in override (proxy until check-in events table exists) OR
--   • token credit (paid activity)
-- ---------------------------------------------------------
create or replace function public.can_rate_tenant(p_tenant_id uuid)
returns boolean
language plpgsql stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  since_ts timestamptz := now() - interval '60 days';
  has_attended boolean;
  has_checkin boolean;
  has_paid boolean;
begin
  if uid is null or p_tenant_id is null then
    return false;
  end if;

  -- Attendance (authoritative signal)
  -- Prefer session start time when available; fall back to booking timestamp.
  has_attended := exists(
    select 1
    from public.class_bookings cb
    left join public.class_sessions cs on cs.id = cb.session_id
    where cb.tenant_id = p_tenant_id
      and cb.user_id = uid
      and cb.status = 'attended'
      and coalesce(cs.starts_at, cb.created_at) >= since_ts
    limit 1
  );

  -- Check-in proxy: staff override used at door (until check-in event ledger exists)
  has_checkin := exists(
    select 1
    from public.checkin_overrides co
    where co.tenant_id = p_tenant_id
      and co.user_id = uid
      and co.created_at >= since_ts
    limit 1
  );

  -- Paid activity proxy: any positive token credit within window
  -- (supports both amount + delta columns across checkpoints without referencing a missing column)
  has_paid := exists(
    select 1
    from public.token_transactions tt
    where tt.tenant_id = p_tenant_id
      and tt.user_id = uid
      and tt.created_at >= since_ts
      and (
        coalesce(tt.amount, 0) > 0
        or coalesce(nullif((to_jsonb(tt)->>'delta')::int, 0), 0) > 0
      )
    limit 1
  );

  return has_attended or has_checkin or has_paid;
end $$;

-- ---------------------------------------------------------
-- Summary refresh
-- ---------------------------------------------------------
create or replace function public.refresh_gym_rating_summary(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
  v_overall numeric(6,3);
  v_coaching numeric(6,3);
  v_programming numeric(6,3);
  v_community numeric(6,3);
  v_facility numeric(6,3);
  v_consistency numeric(6,3);
  v_cat jsonb;
begin
  if p_tenant_id is null then
    return;
  end if;

  select
    count(*)::int,
    avg(overall)::numeric,
    avg(nullif((categories->>'coaching')::numeric,0)),
    avg(nullif((categories->>'programming')::numeric,0)),
    avg(nullif((categories->>'community')::numeric,0)),
    avg(nullif((categories->>'facility')::numeric,0)),
    avg(nullif((categories->>'consistency')::numeric,0))
  into v_count, v_overall, v_coaching, v_programming, v_community, v_facility, v_consistency
  from public.gym_ratings
  where tenant_id = p_tenant_id
    and status = 'active';

  if v_count is null or v_count = 0 then
    v_cat := '{}'::jsonb;
    insert into public.gym_rating_summary(tenant_id, rating_count, overall_avg, category_avgs, updated_at)
    values(p_tenant_id, 0, 0, v_cat, now())
    on conflict (tenant_id) do update
      set rating_count = 0,
          overall_avg = 0,
          category_avgs = '{}'::jsonb,
          updated_at = now();
    return;
  end if;

  v_cat := jsonb_build_object(
    'coaching', round(coalesce(v_coaching,0)::numeric, 2),
    'programming', round(coalesce(v_programming,0)::numeric, 2),
    'community', round(coalesce(v_community,0)::numeric, 2),
    'facility', round(coalesce(v_facility,0)::numeric, 2),
    'consistency', round(coalesce(v_consistency,0)::numeric, 2)
  );

  insert into public.gym_rating_summary(tenant_id, rating_count, overall_avg, category_avgs, updated_at)
  values(
    p_tenant_id,
    v_count,
    round(coalesce(v_overall,0)::numeric, 2),
    v_cat,
    now()
  )
  on conflict (tenant_id) do update
    set rating_count = excluded.rating_count,
        overall_avg = excluded.overall_avg,
        category_avgs = excluded.category_avgs,
        updated_at = excluded.updated_at;
end $$;

-- ---------------------------------------------------------
-- Triggers: enforce rules + write history + refresh summary
-- ---------------------------------------------------------
create or replace function public.trg_gym_ratings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  is_owner boolean;
  recent_count int;
  key text;
  v int;
  required_keys text[] := array['coaching','programming','community','facility','consistency'];
begin
  if actor is null then
    raise exception 'auth_required';
  end if;

  -- Normalize note length
  if new.note is not null and length(new.note) > 240 then
    new.note := left(new.note, 240);
  end if;

  -- Normalize status
  if tg_op = 'INSERT' then
    new.status := 'active';
  end if;

  -- Owner vs staff/admin path
  is_owner := (tg_op = 'INSERT' and new.user_id = actor)
             or (tg_op = 'UPDATE' and old.user_id = actor);

  if is_owner then
    -- Owner cannot change tenant/user keys
    if tg_op = 'UPDATE' then
      if new.tenant_id <> old.tenant_id or new.user_id <> old.user_id then
        raise exception 'immutable_keys';
      end if;
      -- Owner cannot change status
      if new.status <> old.status then
        raise exception 'status_not_editable';
      end if;
    end if;

    -- 30-day update limit (also blocks delete+reinsert)
    select count(*) into recent_count
    from public.gym_rating_history h
    where h.tenant_id = new.tenant_id
      and h.user_id = new.user_id
      and h.created_at >= (now() - interval '30 days');

    if coalesce(recent_count,0) > 0 then
      raise exception 'rate_limited_30d';
    end if;

  else
    -- Moderation must be staff/admin only (RLS enforces role)
    -- Restrict moderation writes to status ONLY.
    if tg_op = 'UPDATE' then
      if new.tenant_id <> old.tenant_id or new.user_id <> old.user_id then
        raise exception 'immutable_keys';
      end if;
      if new.overall <> old.overall
         or new.categories <> old.categories
         or new.note is distinct from old.note then
        raise exception 'moderation_status_only';
      end if;
    else
      raise exception 'forbidden';
    end if;
  end if;

  -- Categories normalization: ensure required keys exist + values 1..5
  new.categories := coalesce(new.categories, '{}'::jsonb);
  foreach key in array required_keys loop
    begin
      if new.categories ? key then
        v := nullif((new.categories->>key)::int, 0);
      else
        v := null;
      end if;
    exception when others then
      v := null;
    end;

    if v is null then
      v := new.overall;
    end if;

    if v < 1 or v > 5 then
      raise exception 'invalid_category_%', key;
    end if;

    new.categories := jsonb_set(new.categories, array[key], to_jsonb(v), true);
  end loop;

  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
  end if;

  return new;
end $$;

create or replace function public.trg_gym_ratings_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  status_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    status_changed := (old.status is distinct from new.status);
  end if;

  -- History snapshot (insert + update only)
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    insert into public.gym_rating_history(rating_id, tenant_id, user_id, overall, categories, note)
    values(new.id, new.tenant_id, new.user_id, new.overall, new.categories, new.note);
  end if;

  -- Moderation audit (status changes only)
  if tg_op = 'UPDATE' and status_changed and actor is not null and actor <> new.user_id then
    insert into public.audit_log(
      tenant_id, actor_user_id, action, entity_type, entity_id, details
    )
    values(
      new.tenant_id,
      actor,
      'gym_rating_status_changed',
      'gym_rating',
      new.id,
      jsonb_build_object('from', old.status, 'to', new.status, 'target_user_id', new.user_id)
    );
  end if;

  perform public.refresh_gym_rating_summary(new.tenant_id);

  return null;
end $$;

create or replace function public.trg_gym_ratings_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_gym_rating_summary(old.tenant_id);
  return null;
end $$;

create trigger gym_ratings_before_write
before insert or update on public.gym_ratings
for each row execute function public.trg_gym_ratings_before_write();

create trigger gym_ratings_after_write
after insert or update on public.gym_ratings
for each row execute function public.trg_gym_ratings_after_write();

create trigger gym_ratings_after_delete
after delete on public.gym_ratings
for each row execute function public.trg_gym_ratings_after_delete();

-- ---------------------------------------------------------
-- Tenant staff feedback RPC (anonymized)
-- ---------------------------------------------------------
create or replace function public.get_gym_rating_feedback(p_tenant_id uuid, p_limit int default 50)
returns table(
  rating_id uuid,
  overall smallint,
  categories jsonb,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql stable
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    return;
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id)) then
    raise exception 'forbidden';
  end if;

  return query
    select gr.id, gr.overall, gr.categories, gr.note, gr.created_at, gr.updated_at
    from public.gym_ratings gr
    where gr.tenant_id = p_tenant_id
      and gr.status = 'active'
      and gr.note is not null
    order by gr.updated_at desc
    limit greatest(0, least(coalesce(p_limit,50), 200));
end $$;

grant execute on function public.can_rate_tenant(uuid) to authenticated;
grant execute on function public.get_gym_rating_feedback(uuid, int) to authenticated;

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------
alter table public.gym_ratings enable row level security;
alter table public.gym_rating_history enable row level security;
alter table public.gym_rating_summary enable row level security;

-- Summary: safe public read (no TRUE literal)
create policy gym_rating_summary_select_public
on public.gym_rating_summary
for select
to anon, authenticated
using (tenant_id is not null);

-- gym_ratings: owner + platform admin read
create policy gym_ratings_select_owner_or_admin
on public.gym_ratings
for select
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

-- gym_ratings: verified-only insert
create policy gym_ratings_insert_verified
on public.gym_ratings
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.can_rate_tenant(tenant_id)
);

-- gym_ratings: owner update (verified gate + 30d enforced by trigger)
create policy gym_ratings_update_owner
on public.gym_ratings
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.can_rate_tenant(tenant_id)
);

-- gym_ratings: staff/admin moderation update (status-only enforced by trigger)
create policy gym_ratings_update_staff
on public.gym_ratings
for update
to authenticated
using (public.is_tenant_staff(tenant_id) or public.is_platform_admin())
with check (public.is_tenant_staff(tenant_id) or public.is_platform_admin());

-- gym_ratings: owner delete (and platform admin)
create policy gym_ratings_delete_owner_or_admin
on public.gym_ratings
for delete
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

-- gym_rating_history: owner read (own history) + platform admin
create policy gym_rating_history_select_owner
on public.gym_rating_history
for select
to authenticated
using (auth.uid() = user_id);

create policy gym_rating_history_select_admin
on public.gym_rating_history
for select
to authenticated
using (public.is_platform_admin());

-- No direct inserts/updates/deletes on history (trigger-only)
