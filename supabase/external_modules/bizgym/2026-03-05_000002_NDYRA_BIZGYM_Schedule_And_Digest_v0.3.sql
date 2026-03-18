-- NDYRA Business for Gyms (BizGym) — v0.3
-- Build: 2026-03-05_BIZ03
-- Purpose:
--   • Add Scheduling Ops v1 (quick session create + cancel) for the isolated BizGym module.
--   • Add Issue Radar digest RPC so staff gets a T-15 / T+10 operational view.
--   • Keep all enforcement tenant-scoped and server-side.

-- ---------------------------------------------------------
-- RPC: create_biz_class_session
-- ---------------------------------------------------------
create or replace function public.create_biz_class_session(
  p_tenant_id uuid,
  p_class_type_id uuid,
  p_starts_at timestamptz,
  p_capacity integer default 12,
  p_visibility public.class_visibility default 'members',
  p_token_cost integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_type record;
  v_tenant record;
  v_session_id uuid;
  v_token_cost integer;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_tenant_id is null or p_class_type_id is null or p_starts_at is null then
    raise exception 'missing_required_fields';
  end if;

  if not public.is_tenant_staff(p_tenant_id) then
    raise exception 'not_authorized';
  end if;

  select id, system_of_record into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if v_tenant.id is null then
    raise exception 'tenant_not_found';
  end if;

  if coalesce(v_tenant.system_of_record::text, '') <> 'ndyra' then
    raise exception 'tenant_not_authoritative';
  end if;

  select id, tenant_id, name, default_token_cost, is_active into v_type
  from public.class_types
  where id = p_class_type_id;

  if v_type.id is null then
    raise exception 'class_type_not_found';
  end if;
  if v_type.tenant_id <> p_tenant_id then
    raise exception 'class_type_tenant_mismatch';
  end if;
  if coalesce(v_type.is_active, false) = false then
    raise exception 'class_type_inactive';
  end if;

  v_token_cost := coalesce(p_token_cost, v_type.default_token_cost, 1);

  insert into public.class_sessions(
    tenant_id,
    class_type_id,
    starts_at,
    capacity,
    visibility,
    token_cost,
    is_canceled,
    booked_count,
    created_at,
    updated_at
  )
  values (
    p_tenant_id,
    p_class_type_id,
    p_starts_at,
    greatest(0, coalesce(p_capacity, 0)),
    coalesce(p_visibility, 'members'),
    greatest(0, coalesce(v_token_cost, 0)),
    false,
    0,
    now(),
    now()
  )
  returning id into v_session_id;

  insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    p_tenant_id,
    v_actor,
    'biz_session_created',
    'class_session',
    v_session_id,
    jsonb_build_object(
      'class_type_id', p_class_type_id,
      'class_type_name', v_type.name,
      'starts_at', p_starts_at,
      'capacity', greatest(0, coalesce(p_capacity, 0)),
      'visibility', coalesce(p_visibility, 'members'),
      'token_cost', v_token_cost
    )
  );

  return jsonb_build_object(
    'ok', true,
    'session_id', v_session_id,
    'tenant_id', p_tenant_id,
    'class_type_name', v_type.name,
    'starts_at', p_starts_at
  );
end $$;

revoke all on function public.create_biz_class_session(uuid, uuid, timestamptz, integer, public.class_visibility, integer) from public;
grant execute on function public.create_biz_class_session(uuid, uuid, timestamptz, integer, public.class_visibility, integer) to authenticated;

-- ---------------------------------------------------------
-- RPC: cancel_biz_class_session
-- ---------------------------------------------------------
create or replace function public.cancel_biz_class_session(
  p_class_session_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_session record;
  v_reason text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  select id, tenant_id, starts_at, is_canceled
    into v_session
  from public.class_sessions
  where id = p_class_session_id
  for update;

  if v_session.id is null then
    raise exception 'session_not_found';
  end if;

  if not public.is_tenant_staff(v_session.tenant_id) then
    raise exception 'not_authorized';
  end if;

  if coalesce(v_session.is_canceled, false) then
    return jsonb_build_object('ok', true, 'already_canceled', true, 'session_id', p_class_session_id);
  end if;

  v_reason := left(trim(coalesce(p_reason,'')), 280);
  update public.class_sessions
  set is_canceled = true,
      updated_at = now()
  where id = p_class_session_id;

  insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    v_session.tenant_id,
    v_actor,
    'biz_session_canceled',
    'class_session',
    p_class_session_id,
    jsonb_build_object('reason', nullif(v_reason,''), 'starts_at', v_session.starts_at)
  );

  return jsonb_build_object('ok', true, 'session_id', p_class_session_id);
end $$;

revoke all on function public.cancel_biz_class_session(uuid, text) from public;
grant execute on function public.cancel_biz_class_session(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- RPC: get_issue_radar_digest
-- Returns upcoming sessions with pre-class/T+10 issue counts.
-- ---------------------------------------------------------
create or replace function public.get_issue_radar_digest(
  p_tenant_id uuid,
  p_window_minutes integer default 90
)
returns table(
  session_id uuid,
  starts_at timestamptz,
  class_type_name text,
  visibility text,
  booked_count integer,
  checked_in_count integer,
  attention_count integer,
  waiver_count integer,
  not_cleared_count integer,
  t_plus_10 boolean
)
language sql
security definer
set search_path = public
as $$
  with guard as (
    select case when auth.uid() is not null and public.is_tenant_staff(p_tenant_id) then 1 else 0 end as ok
  ),
  scoped_sessions as (
    select
      cs.id as session_id,
      cs.starts_at,
      coalesce(ct.name, 'Class') as class_type_name,
      cs.visibility::text as visibility,
      cs.booked_count,
      coalesce((
        select count(*)::integer
        from public.class_checkins cci
        where cci.class_session_id = cs.id
      ), 0) as checked_in_count,
      (now() >= (cs.starts_at + interval '10 minutes')) as t_plus_10
    from public.class_sessions cs
    left join public.class_types ct on ct.id = cs.class_type_id
    join guard g on g.ok = 1
    where cs.tenant_id = p_tenant_id
      and coalesce(cs.is_canceled, false) = false
      and cs.starts_at >= (now() - interval '15 minutes')
      and cs.starts_at <= (now() + make_interval(mins => greatest(1, coalesce(p_window_minutes, 90))))
  ),
  issue_counts as (
    select
      ss.session_id,
      coalesce(sum(case when (coalesce((a.authz ->> 'waiver_ok')::boolean, false) = false)
        or (coalesce((a.authz ->> 'cleared')::boolean, false) = false)
        or (ss.t_plus_10 and cci.id is null)
      then 1 else 0 end), 0)::integer as attention_count,
      coalesce(sum(case when coalesce((a.authz ->> 'waiver_ok')::boolean, false) = false then 1 else 0 end), 0)::integer as waiver_count,
      coalesce(sum(case when coalesce((a.authz ->> 'cleared')::boolean, false) = false then 1 else 0 end), 0)::integer as not_cleared_count
    from scoped_sessions ss
    left join public.class_bookings cb
      on cb.class_session_id = ss.session_id
     and cb.status in ('booked', 'attended')
    left join public.class_checkins cci
      on cci.class_session_id = cb.class_session_id
     and cci.user_id = cb.user_id
    left join lateral (
      select public.authorize_class_access(ss.session_id, cb.user_id, 'checkin') as authz
    ) a on cb.user_id is not null
    group by ss.session_id
  )
  select
    ss.session_id,
    ss.starts_at,
    ss.class_type_name,
    ss.visibility,
    ss.booked_count,
    ss.checked_in_count,
    coalesce(ic.attention_count, 0) as attention_count,
    coalesce(ic.waiver_count, 0) as waiver_count,
    coalesce(ic.not_cleared_count, 0) as not_cleared_count,
    ss.t_plus_10
  from scoped_sessions ss
  left join issue_counts ic on ic.session_id = ss.session_id
  order by ss.starts_at asc;
$$;

revoke all on function public.get_issue_radar_digest(uuid, integer) from public;
grant execute on function public.get_issue_radar_digest(uuid, integer) to authenticated;
