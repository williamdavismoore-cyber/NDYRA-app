-- NDYRA Business for Gyms (BizGym) — v0.2
-- Build: 2026-03-05_BIZ03
-- Purpose:
--  • Provide a staff-only RPC to create check-in overrides without requiring a serverless function.
--  • Keeps the "waiver cannot be bypassed" rule intact (enforced by authorize_class_access).
--
-- Notes:
--  • Requires core NDYRA tables: tenants, tenant_users, checkin_overrides, audit_log.
--  • Uses is_tenant_staff() guard.

create or replace function public.create_checkin_override(
  p_tenant_id uuid,
  p_user_id uuid,
  p_reason text,
  p_expires_minutes integer default 180
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_tenant record;
  v_reason text;
  v_expires_at timestamptz;
  v_override_id uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'not_authenticated';
  end if;

  if p_tenant_id is null or p_user_id is null then
    raise exception 'missing_required_fields';
  end if;

  if not public.is_tenant_staff(p_tenant_id) then
    raise exception 'not_authorized';
  end if;

  select id, system_of_record, kill_switch_disable_checkin
    into v_tenant
  from public.tenants
  where id = p_tenant_id;

  if v_tenant.id is null then
    raise exception 'tenant_not_found';
  end if;

  if coalesce(v_tenant.system_of_record::text, '') <> 'ndyra' then
    -- auditable block
    insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
    values (
      p_tenant_id,
      v_actor,
      'checkin_blocked',
      'tenant',
      p_tenant_id,
      jsonb_build_object('reason','tenant_not_authoritative','system_of_record', v_tenant.system_of_record)
    );
    raise exception 'tenant_not_authoritative';
  end if;

  if coalesce(v_tenant.kill_switch_disable_checkin, false) then
    insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
    values (
      p_tenant_id,
      v_actor,
      'checkin_blocked',
      'tenant',
      p_tenant_id,
      jsonb_build_object('reason','kill_switch_disable_checkin')
    );
    raise exception 'checkin_disabled';
  end if;

  v_reason := left(trim(coalesce(p_reason,'')), 280);
  if length(v_reason) < 3 then
    raise exception 'reason_required';
  end if;

  if p_expires_minutes is null or p_expires_minutes <= 0 then
    v_expires_at := null;
  else
    v_expires_at := now() + make_interval(mins => least(p_expires_minutes, 24*60));
  end if;

  insert into public.checkin_overrides(tenant_id, user_id, reason, created_by, expires_at)
  values (p_tenant_id, p_user_id, v_reason, v_actor, v_expires_at)
  returning id into v_override_id;

  insert into public.audit_log(tenant_id, actor_user_id, action, entity_type, entity_id, details)
  values (
    p_tenant_id,
    v_actor,
    'checkin_override_created',
    'checkin_override',
    v_override_id,
    jsonb_build_object('user_id', p_user_id, 'reason', v_reason, 'expires_at', v_expires_at)
  );

  return jsonb_build_object(
    'ok', true,
    'override_id', v_override_id,
    'tenant_id', p_tenant_id,
    'user_id', p_user_id,
    'expires_at', v_expires_at
  );
end $$;

revoke all on function public.create_checkin_override(uuid,uuid,text,integer) from public;
grant execute on function public.create_checkin_override(uuid,uuid,text,integer) to authenticated;
