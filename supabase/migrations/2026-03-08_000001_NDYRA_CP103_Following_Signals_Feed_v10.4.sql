-- =========================================================
-- NDYRA CP103 — Following Feed + Signals Feed (real, preview-safe)
-- Build: 2026-03-08_103
-- =========================================================

-- 1) Fix legacy get_signal_strip() drift
-- Older drafts referenced pm.public_url, which does not exist in post_media.
-- Keep the shape but remove the broken field so the RPC can run safely.
create or replace function public.get_signal_strip(p_subject_type text, p_subject_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  pinned_to_profile boolean,
  visibility public.post_visibility,
  author_user_id uuid,
  author_tenant_id uuid,
  tenant_context_id uuid,
  club_id uuid,
  content_text text,
  signal_font_key text,
  post_media jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select p.*
    from public.posts p
    where p.kind = 'signal'
      and p.is_deleted = false
      and (
        p.pinned_to_profile = true
        or (p.expires_at is not null and p.expires_at > now())
      )
      and (
        (p_subject_type = 'user' and p.author_user_id = p_subject_id)
        or (p_subject_type = 'tenant' and (p.tenant_context_id = p_subject_id or p.author_tenant_id = p_subject_id))
        or (p_subject_type = 'club' and p.club_id = p_subject_id)
      )
      and public.can_view_post(p.id)
    order by coalesce(p.expires_at, p.created_at) desc
    limit case when p_subject_type = 'user' then 2 else 10 end
  )
  select
    b.id,
    b.created_at,
    b.expires_at,
    b.pinned_to_profile,
    b.visibility,
    b.author_user_id,
    b.author_tenant_id,
    b.tenant_context_id,
    b.club_id,
    b.content_text,
    b.signal_font_key,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'media_type', pm.media_type,
            'storage_path', pm.storage_path,
            'width', pm.width,
            'height', pm.height,
            'duration_ms', pm.duration_ms,
            'created_at', pm.created_at
          )
          order by pm.created_at asc
        ),
        '[]'::jsonb
      )
      from public.post_media pm
      where pm.post_id = b.id
    ) as post_media
  from base b;
$$;

grant execute on function public.get_signal_strip(text, uuid) to anon, authenticated;

-- 2) Following feed for aftermath recaps.
create or replace function public.get_following_aftermath_feed(
  p_limit int default 30,
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
  shared_post_id uuid,
  author_name text,
  author_handle text,
  author_avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := auth.uid();
  lim int := greatest(1, least(coalesce(p_limit,30), 100));
  off int := greatest(0, coalesce(p_offset,0));
begin
  if viewer is null then
    raise exception 'auth_required';
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
         aps.post_id,
         coalesce(nullif(p.full_name,''), nullif(p.handle,''), 'Member') as author_name,
         coalesce(nullif(p.handle,''), substr(ae.user_id::text,1,8)) as author_handle,
         p.avatar_url
  from public.aftermath_entries ae
  left join public.aftermath_post_shares aps on aps.entry_id = ae.id
  left join public.profiles p on p.id = ae.user_id
  where public.can_view_aftermath_entry(ae.id)
    and ae.visibility in ('public','followers')
    and (
      exists (
        select 1 from public.follows_users fu
        where fu.follower_id = viewer
          and fu.followee_id = ae.user_id
      )
      or (
        ae.tenant_id is not null and exists (
          select 1 from public.follows_tenants ft
          where ft.follower_id = viewer
            and ft.tenant_id = ae.tenant_id
        )
      )
    )
  order by ae.occurred_at desc, ae.created_at desc
  limit lim offset off;
end $$;

grant execute on function public.get_following_aftermath_feed(int, int) to authenticated;

-- 3) Visible active signals feed.
create or replace function public.get_signals_feed(
  p_limit int default 30,
  p_offset int default 0
)
returns table(
  id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  visibility public.post_visibility,
  author_user_id uuid,
  content_text text,
  signal_font_key text,
  author_name text,
  author_handle text,
  author_avatar_url text,
  tenant_context_id uuid,
  post_media jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit,30), 100));
  off int := greatest(0, coalesce(p_offset,0));
begin
  return query
  select
    p.id,
    p.created_at,
    p.expires_at,
    p.visibility,
    p.author_user_id,
    p.content_text,
    p.signal_font_key,
    coalesce(nullif(pr.full_name,''), nullif(pr.handle,''), 'Member') as author_name,
    coalesce(nullif(pr.handle,''), substr(p.author_user_id::text,1,8)) as author_handle,
    pr.avatar_url,
    p.tenant_context_id,
    (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', pm.id,
            'media_type', pm.media_type,
            'storage_path', pm.storage_path,
            'width', pm.width,
            'height', pm.height,
            'duration_ms', pm.duration_ms,
            'created_at', pm.created_at
          )
          order by pm.created_at asc
        ),
        '[]'::jsonb
      )
      from public.post_media pm
      where pm.post_id = p.id
    ) as post_media
  from public.posts p
  left join public.profiles pr on pr.id = p.author_user_id
  where p.kind = 'signal'
    and p.is_deleted = false
    and (p.pinned_to_profile = true or (p.expires_at is not null and p.expires_at > now()))
    and public.can_view_post(p.id)
  order by coalesce(p.expires_at, p.created_at) desc, p.created_at desc
  limit lim offset off;
end $$;

grant execute on function public.get_signals_feed(int, int) to anon, authenticated;
