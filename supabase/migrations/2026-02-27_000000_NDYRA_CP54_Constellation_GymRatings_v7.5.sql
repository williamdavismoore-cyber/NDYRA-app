/* NDYRA CP54 — Constellation Gym Ratings + Privacy extension (v7.5)
   Date: 2026-02-27

   Goals:
   - Add structured gym ratings (coaching, facilities, community, value) 1–5
   - Maintain a tenant-level summary for fast Constellation display
   - Extend privacy_settings with show_online_status
*/

-- -----------------------------
-- Privacy extension
-- -----------------------------

alter table public.privacy_settings
  add column if not exists show_online_status boolean not null default true;

comment on column public.privacy_settings.show_online_status is 'If false, suppress presence indicators (online dots, last seen, etc).';


-- -----------------------------
-- Gym ratings
-- -----------------------------

create table if not exists public.gym_ratings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  coaching smallint not null check (coaching between 1 and 5),
  facilities smallint not null check (facilities between 1 and 5),
  community smallint not null check (community between 1 and 5),
  value smallint not null check (value between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gym_ratings_one_per_user unique (tenant_id, user_id)
);

create index if not exists gym_ratings_tenant_id_idx on public.gym_ratings(tenant_id);
create index if not exists gym_ratings_user_id_idx on public.gym_ratings(user_id);

alter table public.gym_ratings enable row level security;

-- Authenticated users can read ratings (reviews are not sensitive)
drop policy if exists "Read gym_ratings" on public.gym_ratings;
create policy "Read gym_ratings" on public.gym_ratings
  for select
  to authenticated
  using (true);

-- Users can create/update/delete their own rating
drop policy if exists "Insert own gym_rating" on public.gym_ratings;
create policy "Insert own gym_rating" on public.gym_ratings
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Update own gym_rating" on public.gym_ratings;
create policy "Update own gym_rating" on public.gym_ratings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Delete own gym_rating" on public.gym_ratings;
create policy "Delete own gym_rating" on public.gym_ratings
  for delete
  to authenticated
  using (user_id = auth.uid());


-- Summary table (public read)
create table if not exists public.gym_rating_summary (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  rating_count integer not null default 0,
  avg_coaching numeric(3,2),
  avg_facilities numeric(3,2),
  avg_community numeric(3,2),
  avg_value numeric(3,2),
  avg_overall numeric(3,2),
  updated_at timestamptz not null default now()
);

create index if not exists gym_rating_summary_avg_overall_idx on public.gym_rating_summary(avg_overall desc nulls last);

alter table public.gym_rating_summary enable row level security;

drop policy if exists "Public read gym_rating_summary" on public.gym_rating_summary;
create policy "Public read gym_rating_summary" on public.gym_rating_summary
  for select
  using (true);


-- -----------------------------
-- Summary maintenance
-- -----------------------------

create or replace function public.refresh_gym_rating_summary(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_tenant_id is null then
    return;
  end if;

  select count(*) into v_count
  from public.gym_ratings gr
  where gr.tenant_id = p_tenant_id;

  if v_count = 0 then
    -- Keep a stable row with 0 count (helps UI)
    insert into public.gym_rating_summary(tenant_id, rating_count, avg_coaching, avg_facilities, avg_community, avg_value, avg_overall, updated_at)
    values (p_tenant_id, 0, null, null, null, null, null, now())
    on conflict (tenant_id) do update
      set rating_count = 0,
          avg_coaching = null,
          avg_facilities = null,
          avg_community = null,
          avg_value = null,
          avg_overall = null,
          updated_at = now();
    return;
  end if;

  insert into public.gym_rating_summary(
    tenant_id,
    rating_count,
    avg_coaching,
    avg_facilities,
    avg_community,
    avg_value,
    avg_overall,
    updated_at
  )
  select
    p_tenant_id,
    count(*)::int,
    round(avg(gr.coaching)::numeric, 2),
    round(avg(gr.facilities)::numeric, 2),
    round(avg(gr.community)::numeric, 2),
    round(avg(gr.value)::numeric, 2),
    round(avg(((gr.coaching + gr.facilities + gr.community + gr.value)::numeric) / 4.0), 2),
    now()
  from public.gym_ratings gr
  where gr.tenant_id = p_tenant_id
  on conflict (tenant_id) do update
    set rating_count = excluded.rating_count,
        avg_coaching = excluded.avg_coaching,
        avg_facilities = excluded.avg_facilities,
        avg_community = excluded.avg_community,
        avg_value = excluded.avg_value,
        avg_overall = excluded.avg_overall,
        updated_at = excluded.updated_at;
end;
$$;


create or replace function public.touch_gym_ratings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_gym_ratings_touch_updated_at on public.gym_ratings;
create trigger trg_gym_ratings_touch_updated_at
before update on public.gym_ratings
for each row
execute function public.touch_gym_ratings_updated_at();


create or replace function public.trg_refresh_gym_rating_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    perform public.refresh_gym_rating_summary(old.tenant_id);
    return old;
  end if;

  if (tg_op = 'UPDATE') then
    if (new.tenant_id is distinct from old.tenant_id) then
      perform public.refresh_gym_rating_summary(old.tenant_id);
    end if;
    perform public.refresh_gym_rating_summary(new.tenant_id);
    return new;
  end if;

  -- INSERT
  perform public.refresh_gym_rating_summary(new.tenant_id);
  return new;
end;
$$;

drop trigger if exists trg_gym_rating_summary_refresh on public.gym_ratings;
create trigger trg_gym_rating_summary_refresh
after insert or update or delete on public.gym_ratings
for each row
execute function public.trg_refresh_gym_rating_summary();
