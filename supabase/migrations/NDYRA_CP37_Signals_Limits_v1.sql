-- NDYRA CP37: Signals hard limits (binding addendum CP36)
-- Non‑negotiables:
--   • 2 signals per user (active/unexpired)
--   • 10 signals per gym/club (active/unexpired)
--
-- Architecture choice (smallest change):
--   Signals are POSTS with kind='signal' (no new table).
--   Enforce limits with a trigger so we never rely on UI-only limits.

begin;

create or replace function public._ndyra_enforce_signal_limits()
returns trigger
language plpgsql
as $$
declare
  v_user uuid;
  v_ctx uuid;
  v_user_count int;
  v_ctx_count int;
begin
  if new.kind is distinct from 'signal' then
    return new;
  end if;

  -- Signals are user-authored at this stage.
  v_user := new.author_user_id;
  if v_user is null then
    raise exception 'signals require author_user_id';
  end if;

  -- Signals must belong to a club (gym) or, failing that, a tenant context.
  v_ctx := coalesce(new.club_id, new.tenant_context_id);
  if v_ctx is null then
    raise exception 'signals require club_id or tenant_context_id';
  end if;

  -- Count active signals for this user (unexpired).
  select count(*) into v_user_count
  from public.posts p
  where p.kind = 'signal'
    and p.author_user_id = v_user
    and (p.expires_at is null or p.expires_at > now())
    and p.id <> new.id;

  if v_user_count >= 2 then
    raise exception 'signal limit reached: 2 per user';
  end if;

  -- Count active signals for this club/tenant context (unexpired).
  select count(*) into v_ctx_count
  from public.posts p
  where p.kind = 'signal'
    and coalesce(p.club_id, p.tenant_context_id) = v_ctx
    and (p.expires_at is null or p.expires_at > now())
    and p.id <> new.id;

  if v_ctx_count >= 10 then
    raise exception 'signal limit reached: 10 per club';
  end if;

  return new;
end;
$$;

-- Insert enforcement
drop trigger if exists trg_ndyra_signal_limits_ins on public.posts;
create trigger trg_ndyra_signal_limits_ins
before insert on public.posts
for each row execute function public._ndyra_enforce_signal_limits();

-- Update enforcement (prevents "edit around" after insert)
drop trigger if exists trg_ndyra_signal_limits_upd on public.posts;
create trigger trg_ndyra_signal_limits_upd
before update of kind, expires_at, author_user_id, club_id, tenant_context_id on public.posts
for each row execute function public._ndyra_enforce_signal_limits();

commit;

