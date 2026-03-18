-- =========================================================
-- NDYRA CP95 — Aftermath Persistence + Challenge/Event Linkage
-- Build: 2026-03-06_95
-- =========================================================
-- Goals:
--   • Persist member Aftermath recaps (own entries + secure edit/update)
--   • Link recaps to challenge/event sources without sim/demo data
--   • Keep local QA readable with fallback seed data while making real save flow available
-- =========================================================

create table if not exists public.aftermath_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  kind text not null default 'workout', -- workout|challenge|event
  source_type text,                     -- challenge|event|workout|manual
  source_id uuid,
  title text not null,
  subtitle text,
  note text,
  rating smallint not null default 4 check (rating between 1 and 5),
  occurred_at timestamptz not null default now(),
  stats jsonb not null default '[]'::jsonb,
  visibility text not null default 'private', -- private|followers|public
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.aftermath_entries is 'Member recap entries for workouts, challenge progress, and event attendance.';
comment on column public.aftermath_entries.stats is 'JSON array of {label, value} rows for recap/share rendering.';

alter table public.aftermath_entries
  drop constraint if exists aftermath_entries_kind_check;
alter table public.aftermath_entries
  add constraint aftermath_entries_kind_check
  check (kind in ('workout','challenge','event'));

alter table public.aftermath_entries
  drop constraint if exists aftermath_entries_visibility_check;
alter table public.aftermath_entries
  add constraint aftermath_entries_visibility_check
  check (visibility in ('private','followers','public'));

create unique index if not exists aftermath_entries_unique_source_per_user
  on public.aftermath_entries(user_id, source_type, source_id)
  where source_type is not null and source_id is not null;

create index if not exists aftermath_entries_user_occured_idx
  on public.aftermath_entries(user_id, occurred_at desc, created_at desc);

create or replace function public.touch_aftermath_entries_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_aftermath_entries_touch_updated_at on public.aftermath_entries;
create trigger trg_aftermath_entries_touch_updated_at
before update on public.aftermath_entries
for each row execute function public.touch_aftermath_entries_updated_at();

alter table public.aftermath_entries enable row level security;

drop policy if exists "aftermath_select_own" on public.aftermath_entries;
create policy "aftermath_select_own"
on public.aftermath_entries
for select
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists "aftermath_insert_own" on public.aftermath_entries;
create policy "aftermath_insert_own"
on public.aftermath_entries
for insert
to authenticated
with check (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists "aftermath_update_own" on public.aftermath_entries;
create policy "aftermath_update_own"
on public.aftermath_entries
for update
to authenticated
using (auth.uid() = user_id or public.is_platform_admin())
with check (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists "aftermath_delete_own" on public.aftermath_entries;
create policy "aftermath_delete_own"
on public.aftermath_entries
for delete
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

create or replace function public.upsert_my_aftermath_entry(
  p_kind text,
  p_title text,
  p_subtitle text default null,
  p_note text default null,
  p_rating int default 4,
  p_occurred_at timestamptz default now(),
  p_stats jsonb default '[]'::jsonb,
  p_source_type text default null,
  p_source_id uuid default null,
  p_tenant_id uuid default null,
  p_visibility text default 'private'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  existing_id uuid;
  out_id uuid;
  normalized_kind text := lower(coalesce(trim(p_kind),'workout'));
  normalized_vis text := lower(coalesce(trim(p_visibility),'private'));
  stats_val jsonb := coalesce(p_stats, '[]'::jsonb);
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  if normalized_kind not in ('workout','challenge','event') then
    raise exception 'invalid_kind';
  end if;
  if normalized_vis not in ('private','followers','public') then
    raise exception 'invalid_visibility';
  end if;
  if coalesce(length(trim(p_title)),0) = 0 then
    raise exception 'title_required';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating_out_of_range';
  end if;
  if jsonb_typeof(stats_val) is distinct from 'array' then
    stats_val := '[]'::jsonb;
  end if;

  if p_source_type is not null and p_source_id is not null then
    select id into existing_id
    from public.aftermath_entries
    where user_id = viewer and source_type = p_source_type and source_id = p_source_id
    limit 1;
  end if;

  if existing_id is null then
    insert into public.aftermath_entries(
      user_id, tenant_id, kind, source_type, source_id,
      title, subtitle, note, rating, occurred_at, stats, visibility
    ) values (
      viewer, p_tenant_id, normalized_kind, p_source_type, p_source_id,
      trim(p_title), nullif(trim(p_subtitle),''), nullif(trim(p_note),''), p_rating,
      coalesce(p_occurred_at, now()), stats_val, normalized_vis
    ) returning id into out_id;
  else
    update public.aftermath_entries
    set tenant_id = coalesce(p_tenant_id, tenant_id),
        kind = normalized_kind,
        title = trim(p_title),
        subtitle = nullif(trim(p_subtitle),''),
        note = nullif(trim(p_note),''),
        rating = p_rating,
        occurred_at = coalesce(p_occurred_at, occurred_at),
        stats = stats_val,
        visibility = normalized_vis
    where id = existing_id
    returning id into out_id;
  end if;

  return out_id;
end $$;

grant execute on function public.upsert_my_aftermath_entry(text, text, text, text, int, timestamptz, jsonb, text, uuid, uuid, text) to authenticated;

create or replace function public.get_my_aftermath_feed(
  p_kind text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  kind text,
  source_type text,
  source_id uuid,
  tenant_id uuid,
  title text,
  subtitle text,
  note text,
  rating int,
  occurred_at timestamptz,
  stats jsonb,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit,50), 200));
  off int := greatest(0, coalesce(p_offset,0));
  kind_filter text := lower(nullif(trim(coalesce(p_kind,'')), ''));
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  return query
  select ae.id, ae.kind, ae.source_type, ae.source_id, ae.tenant_id,
         ae.title, ae.subtitle, ae.note, ae.rating::int, ae.occurred_at,
         ae.stats, ae.visibility, ae.created_at, ae.updated_at
  from public.aftermath_entries ae
  where ae.user_id = viewer
    and (kind_filter is null or ae.kind = kind_filter)
  order by ae.occurred_at desc, ae.created_at desc
  limit lim offset off;
end $$;

grant execute on function public.get_my_aftermath_feed(text, int, int) to authenticated;
