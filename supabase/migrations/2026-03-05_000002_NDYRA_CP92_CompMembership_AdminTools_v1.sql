-- NDYRA CP92
-- Admin/staff helper for QA + support: grant comp membership without Stripe.

create or replace function public.grant_comp_membership(
  p_tenant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'bad_request' using errcode = '22023';
  end if;

  if not (public.is_platform_admin() or public.is_tenant_staff(p_tenant_id, auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.gym_memberships as gm (tenant_id, user_id, status, stripe_customer_id, stripe_subscription_id, current_period_end)
  values (p_tenant_id, p_user_id, 'comp', null, null, null)
  on conflict (tenant_id, user_id)
  do update set
    status = case when gm.status = 'active' then gm.status else excluded.status end,
    stripe_subscription_id = case when gm.status = 'active' then gm.stripe_subscription_id else null end,
    current_period_end = case when gm.status = 'active' then gm.current_period_end else null end;

  return true;
end;
$$;

grant execute on function public.grant_comp_membership(uuid, uuid) to authenticated;
