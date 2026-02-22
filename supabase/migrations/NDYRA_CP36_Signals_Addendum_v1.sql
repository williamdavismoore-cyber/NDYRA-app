-- NDYRA CP36 — Signals (Disciplined Stories)
-- Blueprint: v7.3.1
-- Binding constraints (Aelric):
--  • muted by default tap to hear (UI)
--  • 2 signals per user
--  • 10 signals per gym/club
--  • curated fonts only
--  • smoothing filter (native capture)
--  • AI voice templated only
--  • all visibility must reuse can_view_post() (no new permissive RLS)

begin;

-- ---------------------------------------------------------
-- 1) Extend Posts with kind + expiry (Option A)
-- ---------------------------------------------------------

do $$
begin
  create type public.post_kind as enum ('post', 'signal');
exception
  when duplicate_object then null;
end $$;

alter table public.posts
  add column if not exists kind public.post_kind not null default 'post',
  add column if not exists expires_at timestamptz,
  add column if not exists pinned_to_profile boolean not null default false,
  add column if not exists signal_font_key text,
  add column if not exists signal_ai_voice_template_key text;

-- Curated font keys (server-side guardrail; NULL allowed)
-- Keep the allowlist intentionally small; update via migration if the curated set expands.

do $$
begin
  alter table public.posts
    add constraint posts_signal_font_key_allowed
    check (
      signal_font_key is null
      or signal_font_key in ('display', 'serif', 'mono')
    );
exception
  when duplicate_object then null;
end $$;

create index if not exists posts_kind_expires_idx
  on public.posts(kind, expires_at desc);

create index if not exists posts_author_kind_expires_idx
  on public.posts(author_user_id, kind, expires_at desc);

create index if not exists posts_tenant_ctx_kind_expires_idx
  on public.posts(tenant_context_id, kind, expires_at desc);

-- ---------------------------------------------------------
-- 2) Visibility enforcement: Signals still gate via can_view_post()
--    Add rule: expired, unpinned signals are not viewable.
-- ---------------------------------------------------------

create or replace function public.can_view_post(pid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.post_visibility;
  au uuid;
  at uuid;
  tc uuid;
  deleted boolean;
  viewer uuid;
  v_kind public.post_kind;
  v_expires timestamptz;
  v_pinned boolean;
begin
  viewer := auth.uid();

  select p.visibility,
         p.author_user_id,
         p.author_tenant_id,
         p.tenant_context_id,
         p.is_deleted,
         p.kind,
         p.expires_at,
         p.pinned_to_profile
  into v, au, at, tc, deleted, v_kind, v_expires, v_pinned
  from public.posts p
  where p.id = pid;

  if v is null then
    return false;
  end if;

  if deleted then
    return false;
  end if;

  -- Signals: expire unless pinned.
  if v_kind = 'signal' and coalesce(v_pinned, false) = false then
    if v_expires is null or v_expires <= now() then
      return false;
    end if;
  end if;

  -- platform admin override
  if public.is_platform_admin() then
    return true;
  end if;

  -- Public is public even for anon viewers
  if v = 'public' then
    -- If authored by a user and the viewer is blocked, hide it.
    if au is not null and public.is_blocked_between(viewer, au) then
      return false;
    end if;
    return true;
  end if;

  -- Everything below requires auth
  if viewer is null then
    return false;
  end if;

  -- Author's own post always visible
  if au is not null and au = viewer then
    return true;
  end if;

  -- Blocks (user-authored posts)
  if au is not null and public.is_blocked_between(viewer, au) then
    return false;
  end if;

  if v = 'private' then
    return false; -- already handled by author match
  end if;

  if v = 'followers' then
    -- user follows user OR user follows tenant
    if au is not null and exists(select 1 from public.follows_users fu where fu.follower_id = viewer and fu.followee_id = au) then
      return true;
    end if;

    if at is not null and exists(select 1 from public.follows_tenants ft where ft.follower_id = viewer and ft.tenant_id = at) then
      return true;
    end if;

    return false;
  end if;

  if v = 'members' then
    if tc is null then return false; end if;
    return public.is_tenant_member(tc);
  end if;

  if v = 'staff' then
    if tc is null then return false; end if;
    return public.is_tenant_staff(tc);
  end if;

  -- club handled later
  return false;
end $$;

-- ---------------------------------------------------------
-- 3) Quota + invariant enforcement (server-side)
--    2 active signals per user, 10 active signals per gym/club.
--    Active = kind='signal' AND pinned=false AND expires_at > now() AND is_deleted=false.
-- ---------------------------------------------------------

create or replace function public.enforce_signal_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_count int;
  v_tenant_count int;
  v_club_count int;
  v_scope_tenant uuid;
  v_base_time timestamptz;
begin
  if new.kind is distinct from 'signal' then
    return new;
  end if;

  -- Default expiry to 24h if omitted (unless pinned).
  if coalesce(new.pinned_to_profile, false) = false then
    v_base_time := coalesce(new.created_at, now());
    if new.expires_at is null then
      new.expires_at := v_base_time + interval '24 hours';
    end if;

    if new.expires_at <= now() then
      raise exception 'signal_expires_at_must_be_future';
    end if;

    if new.expires_at > v_base_time + interval '24 hours' then
      raise exception 'signal_expires_at_max_24h';
    end if;
  end if;

  -- User limit (only if user-authored).
  if new.author_user_id is not null and coalesce(new.pinned_to_profile, false) = false then
    select count(*) into v_user_count
    from public.posts p
    where p.kind = 'signal'
      and p.pinned_to_profile = false
      and p.is_deleted = false
      and p.expires_at > now()
      and p.author_user_id = new.author_user_id
      and p.id <> new.id;

    if v_user_count >= 2 then
      raise exception 'signal_limit_user_2';
    end if;
  end if;

  -- Tenant limit (gym/tenant context first; fallback to author_tenant_id for tenant-authored signals)
  v_scope_tenant := coalesce(new.tenant_context_id, new.author_tenant_id);
  if v_scope_tenant is not null and coalesce(new.pinned_to_profile, false) = false then
    select count(*) into v_tenant_count
    from public.posts p
    where p.kind = 'signal'
      and p.pinned_to_profile = false
      and p.is_deleted = false
      and p.expires_at > now()
      and coalesce(p.tenant_context_id, p.author_tenant_id) = v_scope_tenant
      and p.id <> new.id;

    if v_tenant_count >= 10 then
      raise exception 'signal_limit_tenant_10';
    end if;
  end if;

  -- Club limit (club_id exists but full Clubs model lands later)
  if new.club_id is not null and coalesce(new.pinned_to_profile, false) = false then
    select count(*) into v_club_count
    from public.posts p
    where p.kind = 'signal'
      and p.pinned_to_profile = false
      and p.is_deleted = false
      and p.expires_at > now()
      and p.club_id = new.club_id
      and p.id <> new.id;

    if v_club_count >= 10 then
      raise exception 'signal_limit_club_10';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_posts_enforce_signals on public.posts;
create trigger trg_posts_enforce_signals
before insert or update on public.posts
for each row
execute function public.enforce_signal_limits();

-- ---------------------------------------------------------
-- 4) Read API (RPC): get_signal_strip(subject_type, subject_id)
--    This reuses can_view_post() and returns up to 2 (user) / 10 (tenant/club).
-- ---------------------------------------------------------

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
            'public_url', pm.public_url,
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

commit;
