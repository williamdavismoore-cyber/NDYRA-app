-- =========================================================
-- NDYRA CP96 — Aftermath Visibility + Public/Followers Viewing + Feed Share
-- Build: 2026-03-06_96
-- =========================================================

create table if not exists public.aftermath_post_shares (
  entry_id uuid primary key references public.aftermath_entries(id) on delete cascade,
  post_id uuid not null unique references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.aftermath_post_shares enable row level security;

drop policy if exists "aftermath_post_shares_select_own" on public.aftermath_post_shares;
create policy "aftermath_post_shares_select_own"
on public.aftermath_post_shares for select
to authenticated
using (auth.uid() = user_id or public.is_platform_admin());

drop policy if exists "aftermath_post_shares_insert_own" on public.aftermath_post_shares;
create policy "aftermath_post_shares_insert_own"
on public.aftermath_post_shares for insert
to authenticated
with check (auth.uid() = user_id or public.is_platform_admin());

create index if not exists aftermath_post_shares_user_idx
  on public.aftermath_post_shares(user_id, created_at desc);

create or replace function public.can_view_aftermath_entry(p_entry_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  owner_id uuid;
  vis text;
begin
  select ae.user_id, ae.visibility
    into owner_id, vis
  from public.aftermath_entries ae
  where ae.id = p_entry_id;

  if owner_id is null then
    return false;
  end if;

  if viewer is not null and public.is_platform_admin() then
    return true;
  end if;

  if viewer is not null and viewer = owner_id then
    return true;
  end if;

  if vis = 'public' then
    if viewer is not null and public.is_blocked_between(viewer, owner_id) then
      return false;
    end if;
    return true;
  end if;

  if viewer is null then
    return false;
  end if;

  if public.is_blocked_between(viewer, owner_id) then
    return false;
  end if;

  if vis = 'followers' then
    return exists(
      select 1 from public.follows_users fu
      where fu.follower_id = viewer
        and fu.followee_id = owner_id
    );
  end if;

  return false;
end $$;

grant execute on function public.can_view_aftermath_entry(uuid) to anon, authenticated;

create or replace function public.get_aftermath_entry_view(p_entry_id uuid)
returns table(
  id uuid,
  user_id uuid,
  tenant_id uuid,
  kind text,
  source_type text,
  source_id uuid,
  title text,
  subtitle text,
  note text,
  rating int,
  occurred_at timestamptz,
  stats jsonb,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  shared_post_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_view_aftermath_entry(p_entry_id) then
    return;
  end if;

  return query
  select ae.id,
         ae.user_id,
         ae.tenant_id,
         ae.kind,
         ae.source_type,
         ae.source_id,
         ae.title,
         ae.subtitle,
         ae.note,
         ae.rating::int,
         ae.occurred_at,
         ae.stats,
         ae.visibility,
         ae.created_at,
         ae.updated_at,
         aps.post_id
  from public.aftermath_entries ae
  left join public.aftermath_post_shares aps on aps.entry_id = ae.id
  where ae.id = p_entry_id;
end $$;

grant execute on function public.get_aftermath_entry_view(uuid) to anon, authenticated;

create or replace function public.get_user_aftermath_feed(
  p_user_id uuid,
  p_kind text default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  id uuid,
  user_id uuid,
  tenant_id uuid,
  kind text,
  source_type text,
  source_id uuid,
  title text,
  subtitle text,
  note text,
  rating int,
  occurred_at timestamptz,
  stats jsonb,
  visibility text,
  created_at timestamptz,
  updated_at timestamptz,
  shared_post_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit,50), 200));
  off int := greatest(0, coalesce(p_offset,0));
  kind_filter text := lower(nullif(trim(coalesce(p_kind,'')), ''));
begin
  if p_user_id is null then
    return;
  end if;

  if viewer is not null and viewer = p_user_id then
    return query
    select ae.id, ae.user_id, ae.tenant_id, ae.kind, ae.source_type, ae.source_id,
           ae.title, ae.subtitle, ae.note, ae.rating::int, ae.occurred_at,
           ae.stats, ae.visibility, ae.created_at, ae.updated_at, aps.post_id
    from public.aftermath_entries ae
    left join public.aftermath_post_shares aps on aps.entry_id = ae.id
    where ae.user_id = p_user_id
      and (kind_filter is null or ae.kind = kind_filter)
    order by ae.occurred_at desc, ae.created_at desc
    limit lim offset off;
    return;
  end if;

  return query
  select ae.id, ae.user_id, ae.tenant_id, ae.kind, ae.source_type, ae.source_id,
         ae.title, ae.subtitle, ae.note, ae.rating::int, ae.occurred_at,
         ae.stats, ae.visibility, ae.created_at, ae.updated_at, aps.post_id
  from public.aftermath_entries ae
  left join public.aftermath_post_shares aps on aps.entry_id = ae.id
  where ae.user_id = p_user_id
    and (kind_filter is null or ae.kind = kind_filter)
    and public.can_view_aftermath_entry(ae.id)
  order by ae.occurred_at desc, ae.created_at desc
  limit lim offset off;
end $$;

grant execute on function public.get_user_aftermath_feed(uuid, text, int, int) to anon, authenticated;

create or replace function public.share_my_aftermath_to_post(
  p_entry_id uuid,
  p_post_visibility public.post_visibility default 'followers'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  entry_row public.aftermath_entries%rowtype;
  existing_post uuid;
  new_post uuid;
  vis public.post_visibility := coalesce(p_post_visibility, 'followers');
  share_text text;
begin
  if viewer is null then
    raise exception 'auth_required';
  end if;

  select * into entry_row
  from public.aftermath_entries
  where id = p_entry_id
    and user_id = viewer;

  if entry_row.id is null then
    raise exception 'not_found';
  end if;

  select aps.post_id into existing_post
  from public.aftermath_post_shares aps
  where aps.entry_id = entry_row.id;

  if existing_post is not null then
    return existing_post;
  end if;

  if vis not in ('public','followers','private') then
    vis := 'followers';
  end if;

  share_text := coalesce(nullif(trim(entry_row.subtitle), ''), nullif(trim(entry_row.title), ''), 'Aftermath update');

  insert into public.posts(
    author_user_id,
    author_tenant_id,
    tenant_context_id,
    visibility,
    content_text,
    workout_ref
  ) values (
    viewer,
    null,
    entry_row.tenant_id,
    vis,
    share_text,
    jsonb_build_object(
      'kind', 'aftermath',
      'entry_id', entry_row.id,
      'source_type', entry_row.source_type,
      'source_id', entry_row.source_id,
      'rating', entry_row.rating,
      'occurred_at', entry_row.occurred_at,
      'visibility', entry_row.visibility
    )
  ) returning id into new_post;

  insert into public.aftermath_post_shares(entry_id, post_id, user_id)
  values (entry_row.id, new_post, viewer)
  on conflict (entry_id) do update set post_id = excluded.post_id;

  return new_post;
end $$;

grant execute on function public.share_my_aftermath_to_post(uuid, public.post_visibility) to authenticated;
