-- NDYRA CP85 — Token top-ups (Stripe checkout) + ledger alignment
-- Build: 2026-03-05_85
-- Purpose:
--   1) Add token_topups receipt table for Stripe token pack credits
--   2) Align token_transactions with a delta column while preserving amount
--   3) Recreate purchase_with_tokens() to use the current 5-arg spend_tokens signature
--      and to persist richer product metadata in receipts.

begin;

-- ------------------------------------------------------------------
-- 1) token_topups (Stripe-backed token pack receipts)
-- ------------------------------------------------------------------
create table if not exists public.token_topups (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text not null unique,
  stripe_payment_intent_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pack_key text not null,
  token_amount integer not null check (token_amount > 0),
  status text not null default 'credited' check (status in ('pending','credited','failed','refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.token_topups enable row level security;

drop policy if exists token_topups_select_own on public.token_topups;
create policy token_topups_select_own
on public.token_topups for select
using (auth.uid() = user_id);

drop policy if exists token_topups_select_staff on public.token_topups;
create policy token_topups_select_staff
on public.token_topups for select
using (public.is_tenant_staff(tenant_id));

create index if not exists token_topups_user_created_idx
  on public.token_topups(user_id, created_at desc);
create index if not exists token_topups_tenant_created_idx
  on public.token_topups(tenant_id, created_at desc);

-- ------------------------------------------------------------------
-- 2) token_transactions alignment (support both amount and delta)
-- ------------------------------------------------------------------
alter table public.token_transactions
  add column if not exists delta integer;

update public.token_transactions
set delta = coalesce(delta, amount)
where delta is null;

-- Keep a server-side invariant: amount mirrors delta when present
create or replace function public._sync_token_transactions_amount_delta()
returns trigger
language plpgsql
as $$
begin
  if new.delta is null and new.amount is not null then
    new.delta := new.amount;
  elsif new.amount is null and new.delta is not null then
    new.amount := new.delta;
  elsif new.delta is not null and new.amount is not null and new.delta <> new.amount then
    new.amount := new.delta;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_token_transactions_amount_delta on public.token_transactions;
create trigger trg_sync_token_transactions_amount_delta
before insert or update on public.token_transactions
for each row
execute function public._sync_token_transactions_amount_delta();

-- ------------------------------------------------------------------
-- 3) purchase_with_tokens — align to 5-arg spend_tokens + richer metadata
-- ------------------------------------------------------------------
create or replace function public.purchase_with_tokens(
  p_product_id uuid,
  p_qty integer,
  p_client_purchase_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_product public.catalog_products%rowtype;
  v_wallet_tenant uuid;
  v_total integer;
  v_balance integer;
  v_purchase public.purchases%rowtype;
  v_feat_key text;
  v_entitlements jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_qty is null or p_qty < 1 then
    raise exception 'invalid_qty';
  end if;

  if p_client_purchase_id is null or length(trim(p_client_purchase_id)) = 0 then
    raise exception 'missing_client_purchase_id';
  end if;

  -- Fast idempotency return
  select * into v_purchase
  from public.purchases
  where user_id = v_uid
    and client_purchase_id = p_client_purchase_id
  limit 1;

  if v_purchase.id is not null then
    select balance into v_balance
    from public.token_wallets
    where tenant_id = v_purchase.wallet_tenant_id and user_id = v_uid;

    return jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'new_balance', coalesce(v_balance, 0),
      'entitlements', coalesce(v_purchase.entitlements_granted, '[]'::jsonb)
    );
  end if;

  -- Load product
  select * into v_product
  from public.catalog_products
  where id = p_product_id;

  if v_product.id is null then
    raise exception 'product_not_found';
  end if;

  if not v_product.active then
    raise exception 'product_inactive';
  end if;

  -- Visibility enforcement
  if v_product.visibility = 'private' then
    if not (public.is_platform_admin() or (v_product.seller_tenant_id is not null and public.is_tenant_staff(v_product.seller_tenant_id))) then
      raise exception 'not_authorized';
    end if;
  elsif v_product.visibility = 'tenant_only' then
    if v_product.seller_tenant_id is null then
      raise exception 'product_misconfigured';
    end if;
    if not (
      public.is_platform_admin()
      or public.is_tenant_staff(v_product.seller_tenant_id)
      or public.is_tenant_member(v_product.seller_tenant_id)
    ) then
      raise exception 'not_authorized';
    end if;
  else
    null; -- public / members
  end if;

  if v_product.seller_tenant_id is not null then
    v_wallet_tenant := v_product.seller_tenant_id;
  else
    select connected_tenant_id into v_wallet_tenant
    from public.privacy_settings
    where user_id = v_uid;
    if v_wallet_tenant is null then
      raise exception 'no_connected_gym';
    end if;
  end if;

  v_total := p_qty * v_product.price_tokens;

  insert into public.token_wallets(tenant_id, user_id, balance, updated_at)
  values (v_wallet_tenant, v_uid, 0, now())
  on conflict (tenant_id, user_id) do nothing;

  select balance into v_balance
  from public.token_wallets
  where tenant_id = v_wallet_tenant and user_id = v_uid
  for update;

  if coalesce(v_balance, 0) < v_total then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.purchases(
    id, wallet_tenant_id, user_id, product_id, qty, tokens_total, client_purchase_id, status, entitlements_granted, metadata
  )
  values (
    gen_random_uuid(), v_wallet_tenant, v_uid, v_product.id, p_qty, v_total, p_client_purchase_id,
    'succeeded', '[]'::jsonb,
    jsonb_build_object(
      'type', v_product.type,
      'slug', v_product.slug,
      'title', v_product.title,
      'seller_tenant_id', v_product.seller_tenant_id
    )
  )
  on conflict (user_id, client_purchase_id) do nothing
  returning * into v_purchase;

  if v_purchase.id is null then
    select * into v_purchase
    from public.purchases
    where user_id = v_uid and client_purchase_id = p_client_purchase_id
    limit 1;

    select balance into v_balance
    from public.token_wallets
    where tenant_id = v_purchase.wallet_tenant_id and user_id = v_uid;

    return jsonb_build_object(
      'ok', true,
      'purchase_id', v_purchase.id,
      'new_balance', coalesce(v_balance, 0),
      'entitlements', coalesce(v_purchase.entitlements_granted, '[]'::jsonb)
    );
  end if;

  v_balance := public.spend_tokens(v_wallet_tenant, v_uid, v_total, 'purchase', v_purchase.id);

  if v_product.type = 'timer_pack' then
    v_feat_key := 'timer_pack:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'timer_pack', 'active', jsonb_build_object('product_id', v_product.id, 'qty', p_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','timer_pack'));
  elsif v_product.type = 'program_pack' then
    v_feat_key := 'program_pack:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'program_pack', 'active', jsonb_build_object('product_id', v_product.id, 'qty', p_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','program_pack'));
  elsif v_product.type = 'event_ticket' then
    v_feat_key := 'event_ticket:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'event_ticket', 'active', jsonb_build_object('product_id', v_product.id, 'qty', p_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','event_ticket'));
  elsif v_product.type = 'feature_unlock' then
    v_feat_key := coalesce(nullif(trim(v_product.metadata->>'feature_key'),''), 'feature_unlock:' || v_product.id::text);
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'feature_unlock', 'active', jsonb_build_object('product_id', v_product.id, 'qty', p_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','feature_unlock'));
  end if;

  update public.purchases
  set entitlements_granted = v_entitlements,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('title', v_product.title, 'slug', v_product.slug, 'type', v_product.type)
  where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'new_balance', coalesce(v_balance, 0),
    'entitlements', v_entitlements
  );
end;
$$;

grant execute on function public.purchase_with_tokens(uuid, integer, text) to authenticated;

commit;
