-- =========================================================
-- NDYRA CP72 — Aftermath Posts + Notification Badge Share Alignment
-- Build ID: 2026-03-02_72
-- Intent:
--   • Introduce Aftermath as a first-class post kind (post_kind enum)
--   • Make badge-unlock notifications resolvable to a specific awarded badge
--     (store user_badges.id in notifications.entity_id when entity_type='badge')
-- =========================================================

-- ---------------------------------------------------------
-- 1) Extend post_kind enum (signals already use it)
-- ---------------------------------------------------------
-- NOTE: Supabase Postgres supports ADD VALUE IF NOT EXISTS.
alter type public.post_kind add value if not exists 'aftermath';

-- ---------------------------------------------------------
-- 2) Update award_badge() to write entity_id for badge notifications
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
  -- CP72 alignment: when entity_type='badge', store the awarded user_badges.id in entity_id
  -- so the UI can render proper icon/rarity + share templates from notifications.
  if p_notify and to_regclass('public.notifications') is not null then
    insert into public.notifications(user_id, type, actor_user_id, entity_type, entity_id, title, body, is_read, created_at)
    values(
      p_user_id,
      'system',
      null,
      case when p_source_type = 'challenge' then 'challenge' else 'badge' end,
      case when p_source_type = 'challenge' then sid else inserted end,
      'Badge unlocked: ' || b.title,
      b.description,
      false,
      now()
    );
  end if;

  return true;
end $$;

grant execute on function public.award_badge(uuid, text, text, uuid, jsonb, boolean) to authenticated;
