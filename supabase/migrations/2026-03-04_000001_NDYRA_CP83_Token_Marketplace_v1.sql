-- NDYRA CP83 — Token Marketplace (Blueprint Addendum v1.0)
-- Adds catalog + purchases and the purchase_with_tokens RPC.

-- 1) Catalog products
create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('timer_pack','program_pack','event_ticket','feature_unlock')),
  slug text not null unique,
  title text not null,
  description text,
  hero_asset_path text,
  price_tokens integer not null check (price_tokens > 0),
  visibility text not null default 'public' check (visibility in ('public','members','tenant_only','private')),
  seller_tenant_id uuid references public.tenants(id) on delete set null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_products_active_visibility_idx on public.catalog_products(active, visibility);
create index if not exists catalog_products_seller_idx on public.catalog_products(seller_tenant_id);
create index if not exists catalog_products_type_idx on public.catalog_products(type);

alter table public.catalog_products enable row level security;

-- Browse (anon): active + public only
drop policy if exists "catalog_products_select_anon" on public.catalog_products;
create policy "catalog_products_select_anon"
on public.catalog_products
for select
to anon
using (
  active = true
  and visibility = 'public'
);

-- Browse (authenticated): public/members + tenant_only (member of tenant) + staff/admin (override)
drop policy if exists "catalog_products_select_authed" on public.catalog_products;
create policy "catalog_products_select_authed"
on public.catalog_products
for select
to authenticated
using (
  public.is_platform_admin()
  or (seller_tenant_id is not null and public.is_tenant_staff(seller_tenant_id))
  or (
    active = true and (
      visibility in ('public','members')
      or (visibility = 'tenant_only' and seller_tenant_id is not null and public.is_tenant_member(seller_tenant_id))
    )
  )
);

-- Writes: platform admin OR tenant staff (their tenant)
drop policy if exists "catalog_products_write_admin" on public.catalog_products;
create policy "catalog_products_write_admin"
on public.catalog_products
for all
to authenticated
using (
  public.is_platform_admin()
  or (seller_tenant_id is not null and public.is_tenant_staff(seller_tenant_id))
)
with check (
  public.is_platform_admin()
  or (seller_tenant_id is not null and public.is_tenant_staff(seller_tenant_id))
);


-- 2) Product assets (optional)
create table if not exists public.catalog_product_assets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  kind text not null default 'asset',
  path text not null,
  mime text,
  width integer,
  height integer,
  sha256 text,
  created_at timestamptz not null default now()
);

create index if not exists catalog_product_assets_product_idx on public.catalog_product_assets(product_id);

alter table public.catalog_product_assets enable row level security;

drop policy if exists "catalog_product_assets_select_anon" on public.catalog_product_assets;
create policy "catalog_product_assets_select_anon"
on public.catalog_product_assets
for select
to anon
using (
  exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and p.active = true
      and p.visibility = 'public'
  )
);

drop policy if exists "catalog_product_assets_select_authed" on public.catalog_product_assets;
create policy "catalog_product_assets_select_authed"
on public.catalog_product_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and (
        public.is_platform_admin()
        or (p.seller_tenant_id is not null and public.is_tenant_staff(p.seller_tenant_id))
        or (
          p.active = true and (
            p.visibility in ('public','members')
            or (p.visibility = 'tenant_only' and p.seller_tenant_id is not null and public.is_tenant_member(p.seller_tenant_id))
          )
        )
      )
  )
);

drop policy if exists "catalog_product_assets_write_admin" on public.catalog_product_assets;
create policy "catalog_product_assets_write_admin"
on public.catalog_product_assets
for all
to authenticated
using (
  exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and (
        public.is_platform_admin()
        or (p.seller_tenant_id is not null and public.is_tenant_staff(p.seller_tenant_id))
      )
  )
)
with check (
  exists (
    select 1
    from public.catalog_products p
    where p.id = product_id
      and (
        public.is_platform_admin()
        or (p.seller_tenant_id is not null and public.is_tenant_staff(p.seller_tenant_id))
      )
  )
);


-- 3) Purchases (receipts)
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  wallet_tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete restrict,
  qty integer not null default 1 check (qty > 0 and qty <= 50),
  tokens_total integer not null,
  client_purchase_id text not null,
  status text not null default 'succeeded' check (status in ('succeeded','refunded','void')),
  entitlements_granted jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists purchases_user_clientid_uniq on public.purchases(user_id, client_purchase_id);
create index if not exists purchases_user_created_idx on public.purchases(user_id, created_at desc);
create index if not exists purchases_wallet_created_idx on public.purchases(wallet_tenant_id, created_at desc);

alter table public.purchases enable row level security;

drop policy if exists "purchases_select" on public.purchases;
create policy "purchases_select"
on public.purchases
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_platform_admin()
  or public.is_tenant_staff(wallet_tenant_id)
);

-- No direct user inserts/updates/deletes.
drop policy if exists "purchases_write_admin" on public.purchases;
create policy "purchases_write_admin"
on public.purchases
for all
to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());


-- 4) purchase_with_tokens RPC
-- Contract:
--   purchase_with_tokens(p_product_id uuid, p_qty int, p_client_purchase_id text)
-- Returns:
--   { ok: true, purchase_id, new_balance, entitlements: [...] }

create or replace function public.purchase_with_tokens(
  p_product_id uuid,
  p_qty integer default 1,
  p_client_purchase_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_qty integer;
  v_product public.catalog_products%rowtype;
  v_wallet_tenant uuid;
  v_total integer;
  v_purchase public.purchases%rowtype;
  v_balance integer;
  v_entitlements jsonb := '[]'::jsonb;
  v_feat_key text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_qty := coalesce(p_qty, 1);
  if v_qty < 1 or v_qty > 50 then
    raise exception 'invalid_qty';
  end if;

  if p_client_purchase_id is null or length(trim(p_client_purchase_id)) < 8 then
    raise exception 'invalid_client_purchase_id';
  end if;

  -- Idempotency: if we already have a receipt for this client_purchase_id, return it.
  select * into v_purchase
  from public.purchases
  where user_id = v_uid and client_purchase_id = p_client_purchase_id
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
    -- public / members: allowed for any authenticated user
    null;
  end if;

  -- Determine wallet tenant domain:
  --   If seller_tenant_id is present, use that. Otherwise use the user's connected gym.
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

  v_total := v_qty * v_product.price_tokens;

  -- Ensure a wallet row exists then lock it
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

  -- Create the receipt (conflict-safe in case of concurrent double-clicks)
  insert into public.purchases(
    id, wallet_tenant_id, user_id, product_id, qty, tokens_total, client_purchase_id, status, entitlements_granted, metadata
  )
  values (
    gen_random_uuid(), v_wallet_tenant, v_uid, v_product.id, v_qty, v_total, p_client_purchase_id,
    'succeeded', '[]'::jsonb,
    jsonb_build_object('type', v_product.type, 'slug', v_product.slug)
  )
  on conflict (user_id, client_purchase_id) do nothing
  returning * into v_purchase;

  if v_purchase.id is null then
    -- Another request already created it.
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

  -- Spend tokens (idempotent at the ledger level via ref_type/ref_id)
  v_balance := public.spend_tokens(v_wallet_tenant, v_uid, v_total, 'purchase', v_purchase.id, 'marketplace');

  -- Grant entitlements
  if v_product.type = 'timer_pack' then
    v_feat_key := 'timer_pack:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'timer_pack', 'active', jsonb_build_object('product_id', v_product.id, 'qty', v_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','timer_pack'));
  elsif v_product.type = 'program_pack' then
    v_feat_key := 'program_pack:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'program_pack', 'active', jsonb_build_object('product_id', v_product.id, 'qty', v_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','program_pack'));
  elsif v_product.type = 'event_ticket' then
    v_feat_key := 'event_ticket:' || v_product.id::text;
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'event_ticket', 'active', jsonb_build_object('product_id', v_product.id, 'qty', v_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','event_ticket'));
  elsif v_product.type = 'feature_unlock' then
    v_feat_key := coalesce(nullif(trim(v_product.metadata->>'feature_key'),''), 'feature_unlock:' || v_product.id::text);
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, value)
    values ('user', v_uid, v_feat_key, 'feature_unlock', 'active', jsonb_build_object('product_id', v_product.id, 'qty', v_qty))
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', updated_at=now(), value=excluded.value;
    v_entitlements := jsonb_build_array(jsonb_build_object('feature_key', v_feat_key, 'kind','feature_unlock'));
  end if;

  update public.purchases
  set entitlements_granted = v_entitlements
  where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'new_balance', coalesce(v_balance, 0),
    'entitlements', v_entitlements
  );
end;
$$;

revoke all on function public.purchase_with_tokens(uuid, integer, text) from public;
grant execute on function public.purchase_with_tokens(uuid, integer, text) to authenticated;
