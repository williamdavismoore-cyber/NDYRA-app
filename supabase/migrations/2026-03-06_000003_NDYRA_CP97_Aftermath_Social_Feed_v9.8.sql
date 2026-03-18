-- =========================================================
-- NDYRA CP97 — Aftermath Social Feed + Profile Surface
-- Build: 2026-03-06_97
-- =========================================================

create or replace function public.get_aftermath_social_feed(
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
  lim int := greatest(1, least(coalesce(p_limit,30), 100));
  off int := greatest(0, coalesce(p_offset,0));
begin
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
  order by ae.occurred_at desc, ae.created_at desc
  limit lim offset off;
end $$;

grant execute on function public.get_aftermath_social_feed(int, int) to anon, authenticated;
