-- NDYRA CP84 — Timer Pack Payloads + Marketplace Seeds
-- Adds secure timer pack payload storage (gated by entitlements) + seeds a few public catalog items.

begin;

-- 1) Secure timer pack payload storage (DB-backed; can be migrated to Storage later)
create table if not exists public.timer_pack_payloads (
  product_id uuid primary key references public.catalog_products(id) on delete cascade,
  payload jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_timer_pack_payloads_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_timer_pack_payloads_updated_at on public.timer_pack_payloads;
create trigger trg_timer_pack_payloads_updated_at
before update on public.timer_pack_payloads
for each row
execute function public.touch_timer_pack_payloads_updated_at();

alter table public.timer_pack_payloads enable row level security;

-- Read: platform admins, seller staff, or entitled users
-- Entitlement key format: timer_pack:{product_id}
drop policy if exists timer_pack_payloads_select_entitled on public.timer_pack_payloads;
create policy "timer_pack_payloads_select_entitled"
  on public.timer_pack_payloads
  for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.catalog_products p
      where p.id = timer_pack_payloads.product_id
        and p.seller_tenant_id is not null
        and public.is_tenant_staff(p.seller_tenant_id)
    )
    or exists (
      select 1
      from public.entitlements e
      where e.subject_type = 'user'
        and e.subject_id = auth.uid()
        and e.kind = 'timer_pack'
        and e.status = 'active'
        and e.feature_key = ('timer_pack:' || timer_pack_payloads.product_id::text)
    )
  );

-- Write: platform admins or seller staff
-- (Payload validation happens in the app layer)
drop policy if exists timer_pack_payloads_write_staff on public.timer_pack_payloads;
create policy "timer_pack_payloads_write_staff"
  on public.timer_pack_payloads
  for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.catalog_products p
      where p.id = timer_pack_payloads.product_id
        and p.seller_tenant_id is not null
        and public.is_tenant_staff(p.seller_tenant_id)
    )
  );

drop policy if exists timer_pack_payloads_update_staff on public.timer_pack_payloads;
create policy "timer_pack_payloads_update_staff"
  on public.timer_pack_payloads
  for update
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.catalog_products p
      where p.id = timer_pack_payloads.product_id
        and p.seller_tenant_id is not null
        and public.is_tenant_staff(p.seller_tenant_id)
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.catalog_products p
      where p.id = timer_pack_payloads.product_id
        and p.seller_tenant_id is not null
        and public.is_tenant_staff(p.seller_tenant_id)
    )
  );

drop policy if exists timer_pack_payloads_delete_staff on public.timer_pack_payloads;
create policy "timer_pack_payloads_delete_staff"
  on public.timer_pack_payloads
  for delete
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.catalog_products p
      where p.id = timer_pack_payloads.product_id
        and p.seller_tenant_id is not null
        and public.is_tenant_staff(p.seller_tenant_id)
    )
  );

-- 2) Upgrade purchase_with_tokens metadata + entitlement values
-- Adds product title/slug/type to entitlement values.
-- For feature_unlock: prefers feature_unlock:{feature_unlock_type} when present.
create or replace function public.purchase_with_tokens(
  p_product_id uuid,
  p_qty integer default 1,
  p_client_purchase_id text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet_tenant uuid;
  v_product record;
  v_qty integer := greatest(1, least(coalesce(p_qty,1), 99));
  v_unit integer;
  v_total integer;
  v_balance integer;
  v_purchase public.purchases;
  v_ent jsonb := '[]'::jsonb;
  v_feature_key text;
  v_ent_value jsonb;
  v_existing uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_product
  from public.catalog_products
  where id = p_product_id
    and active = true;

  if not found then
    raise exception 'product_not_found';
  end if;

  v_unit := greatest(0, coalesce(v_product.price_tokens,0));
  v_total := v_unit * v_qty;

  -- Wallet scope: use connected tenant if present, else global
  select ps.connected_tenant_id into v_wallet_tenant
  from public.privacy_settings ps
  where ps.user_id = v_uid;

  -- Ensure wallet exists
  insert into public.token_wallets(tenant_id, user_id, balance)
  values (v_wallet_tenant, v_uid, 0)
  on conflict (tenant_id, user_id) do nothing;

  -- Optional idempotency: if client_purchase_id is reused, just return the existing purchase
  if p_client_purchase_id is not null and trim(p_client_purchase_id) <> '' then
    select id into v_existing
    from public.purchases
    where user_id = v_uid
      and client_purchase_id = p_client_purchase_id
    limit 1;

    if v_existing is not null then
      select balance into v_balance
      from public.token_wallets
      where tenant_id is not distinct from v_wallet_tenant
        and user_id = v_uid;

      return jsonb_build_object(
        'ok', true,
        'purchase_id', v_existing,
        'duplicate', true,
        'new_balance', coalesce(v_balance,0)
      );
    end if;
  end if;

  -- Create purchase record first so we can reference its UUID in token_transactions
  insert into public.purchases(
    id,
    wallet_tenant_id,
    user_id,
    product_id,
    qty,
    tokens_total,
    client_purchase_id,
    status,
    entitlements_granted,
    metadata
  ) values (
    gen_random_uuid(),
    v_wallet_tenant,
    v_uid,
    v_product.id,
    v_qty,
    v_total,
    p_client_purchase_id,
    'succeeded',
    '[]'::jsonb,
    jsonb_build_object(
      'type', v_product.type,
      'slug', v_product.slug,
      'title', v_product.title,
      'feature_unlock_type', v_product.feature_unlock_type
    )
  )
  returning * into v_purchase;

  -- Spend tokens and return balance
  v_balance := public.spend_tokens(v_wallet_tenant, v_uid, v_total, 'purchase', v_purchase.id);

  v_ent_value := jsonb_build_object(
    'product_id', v_product.id,
    'qty', v_qty,
    'title', v_product.title,
    'slug', v_product.slug,
    'type', v_product.type,
    'feature_unlock_type', v_product.feature_unlock_type
  );

  if v_product.type = 'timer_pack' then
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, valid_until, value)
    values (
      'user', v_uid,
      'timer_pack:' || v_product.id::text,
      'timer_pack',
      'active',
      null,
      v_ent_value
    )
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', valid_until=null, value=excluded.value, updated_at=now();

    v_ent := v_ent || jsonb_build_array(jsonb_build_object('kind','timer_pack','key','timer_pack:'||v_product.id::text));

  elsif v_product.type = 'program_pack' then
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, valid_until, value)
    values (
      'user', v_uid,
      'program_pack:' || v_product.id::text,
      'program_pack',
      'active',
      null,
      v_ent_value
    )
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', valid_until=null, value=excluded.value, updated_at=now();

    v_ent := v_ent || jsonb_build_array(jsonb_build_object('kind','program_pack','key','program_pack:'||v_product.id::text));

  elsif v_product.type = 'event_ticket' then
    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, valid_until, value)
    values (
      'user', v_uid,
      'event_ticket:' || v_product.id::text,
      'event_ticket',
      'active',
      null,
      v_ent_value
    )
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', valid_until=null, value=excluded.value, updated_at=now();

    v_ent := v_ent || jsonb_build_array(jsonb_build_object('kind','event_ticket','key','event_ticket:'||v_product.id::text));

  elsif v_product.type = 'feature_unlock' then
    v_feature_key := nullif(trim(coalesce(v_product.metadata->>'feature_key','')), '');

    if v_feature_key is null then
      if v_product.feature_unlock_type is not null and trim(v_product.feature_unlock_type) <> '' then
        v_feature_key := 'feature_unlock:' || trim(v_product.feature_unlock_type);
      else
        v_feature_key := 'feature_unlock:' || v_product.id::text;
      end if;
    end if;

    insert into public.entitlements(subject_type, subject_id, feature_key, kind, status, valid_until, value)
    values (
      'user', v_uid,
      v_feature_key,
      'feature_unlock',
      'active',
      null,
      v_ent_value
    )
    on conflict (subject_type, subject_id, feature_key)
    do update set status='active', valid_until=null, value=excluded.value, updated_at=now();

    v_ent := v_ent || jsonb_build_array(jsonb_build_object('kind','feature_unlock','key',v_feature_key));
  end if;

  update public.purchases
  set entitlements_granted = v_ent
  where id = v_purchase.id;

  return jsonb_build_object(
    'ok', true,
    'purchase_id', v_purchase.id,
    'new_balance', v_balance,
    'entitlements_granted', v_ent
  );
end;
$$;

grant execute on function public.purchase_with_tokens(uuid,integer,text) to authenticated;

-- 3) Seed a few public items so the Shop isn't empty after migrations
-- NOTE: These are safe starter items; edit or delete as desired.

insert into public.catalog_products(
  id, seller_tenant_id, type, slug, title, description,
  price_tokens, visibility, active, hero_asset_path, feature_unlock_type, metadata
) values
(
  'c5964df6-830e-40dc-a147-00a7848aa50f',
  null,
  'timer_pack',
  'ndyra-starter-timer-pack',
  'NDYRA Starter Timer Pack',
  'A clean set of HIIT-ready timers: EMOMs, intervals, and finishers. Built for busy schedules and serious output.',
  250,
  'public',
  true,
  '/assets/branding/textures/badge_rare_tile_512.png',
  null,
  jsonb_build_object('tags', jsonb_build_array('timers','hiit','intervals'))
),
(
  '20728016-6f6d-4561-972f-c055c73f30cf',
  null,
  'timer_pack',
  'route56-hybrid-race-pack',
  'ROUTE56 Hybrid Race Pack',
  'Race-style timer presets for hybrid fitness: stations, transitions, and pacing blocks. Perfect for training like you compete.',
  400,
  'public',
  true,
  '/assets/branding/textures/badge_epic_tile_512.png',
  null,
  jsonb_build_object('tags', jsonb_build_array('hybrid','race','stations'))
),
(
  'ff2283d3-e06d-4dc6-be32-c07834d89b49',
  null,
  'program_pack',
  'ndyra-strength-foundations',
  'Strength Foundations Mini Program',
  'A short, structured program pack you can run alongside your regular training. Simple progression, clean logging, zero fluff.',
  300,
  'public',
  true,
  '/assets/branding/textures/badge_common_tile_512.png',
  null,
  jsonb_build_object('tags', jsonb_build_array('strength','program'))
),
(
  'a2632c93-2a4b-4e07-a9b7-9a782c9b4f56',
  null,
  'event_ticket',
  'ndyra-community-throwdown-ticket',
  'NDYRA Community Throwdown Ticket',
  'A sample event ticket product for the Events MVP flow. Swap this for real events as you publish them.',
  150,
  'public',
  true,
  '/assets/branding/textures/badge_legendary_tile_512.png',
  null,
  jsonb_build_object('tags', jsonb_build_array('event','community'))
),
(
  'be51b044-1cca-4c53-ac36-b530747fe214',
  null,
  'feature_unlock',
  'streak-shield',
  'Streak Shield',
  'Protect your streak when life hits. One shield can cover a missed day (configurable later).',
  120,
  'public',
  true,
  '/assets/branding/textures/badge_rare_tile_512.png',
  'streak_shield',
  jsonb_build_object('tags', jsonb_build_array('habit','streak','unlock'))
)
on conflict (slug) do update
set
  title = excluded.title,
  description = excluded.description,
  price_tokens = excluded.price_tokens,
  visibility = excluded.visibility,
  active = excluded.active,
  hero_asset_path = excluded.hero_asset_path,
  feature_unlock_type = excluded.feature_unlock_type,
  metadata = excluded.metadata;

-- Seed payloads for the timer packs
insert into public.timer_pack_payloads(product_id, payload, version)
values
(
  'c5964df6-830e-40dc-a147-00a7848aa50f',
  $$[
    {
      "id": "starter_12min_intervals",
      "mode": "online",
      "name": "Starter — 12 Min Intervals",
      "created_at": "2026-03-04T00:00:00.000Z",
      "cap_suggestion_min": 12,
      "params": {"volume": 3, "highIntensity": 3, "splitHint": "full"},
      "segments": [
        {"kind": "WARMUP", "label": "Warm-up", "duration_sec": 120},
        {"kind": "WORK", "label": "Work", "duration_sec": 40},
        {"kind": "REST", "label": "Rest", "duration_sec": 20},
        {"kind": "WORK", "label": "Work", "duration_sec": 40},
        {"kind": "REST", "label": "Rest", "duration_sec": 20},
        {"kind": "WORK", "label": "Work", "duration_sec": 40},
        {"kind": "REST", "label": "Rest", "duration_sec": 20},
        {"kind": "COOLDOWN", "label": "Cool-down", "duration_sec": 120}
      ]
    },
    {
      "id": "starter_18min_emom",
      "mode": "online",
      "name": "Starter — 18 Min EMOM",
      "created_at": "2026-03-04T00:00:00.000Z",
      "cap_suggestion_min": 18,
      "params": {"volume": 4, "highIntensity": 4, "splitHint": "full"},
      "segments": [
        {"kind": "WARMUP", "label": "Warm-up", "duration_sec": 180},
        {"kind": "WORK", "label": "Minute", "duration_sec": 45},
        {"kind": "REST", "label": "Transition", "duration_sec": 15},
        {"kind": "WORK", "label": "Minute", "duration_sec": 45},
        {"kind": "REST", "label": "Transition", "duration_sec": 15},
        {"kind": "WORK", "label": "Minute", "duration_sec": 45},
        {"kind": "REST", "label": "Transition", "duration_sec": 15},
        {"kind": "WORK", "label": "Minute", "duration_sec": 45},
        {"kind": "COOLDOWN", "label": "Cool-down", "duration_sec": 120}
      ]
    }
  ]$$::jsonb,
  1
),
(
  '20728016-6f6d-4561-972f-c055c73f30cf',
  $$[
    {
      "id": "route56_stations_30min",
      "mode": "online",
      "name": "ROUTE56 — Stations (30 min)",
      "created_at": "2026-03-04T00:00:00.000Z",
      "cap_suggestion_min": 30,
      "params": {"volume": 5, "highIntensity": 5, "splitHint": "full"},
      "segments": [
        {"kind": "BRIEF", "label": "Brief", "duration_sec": 45},
        {"kind": "WORK", "label": "Station 1", "duration_sec": 180},
        {"kind": "TRANSITION", "label": "Transition", "duration_sec": 30},
        {"kind": "WORK", "label": "Station 2", "duration_sec": 180},
        {"kind": "TRANSITION", "label": "Transition", "duration_sec": 30},
        {"kind": "WORK", "label": "Station 3", "duration_sec": 180},
        {"kind": "TRANSITION", "label": "Transition", "duration_sec": 30},
        {"kind": "WORK", "label": "Station 4", "duration_sec": 180},
        {"kind": "COOLDOWN", "label": "Cool-down", "duration_sec": 120}
      ]
    }
  ]$$::jsonb,
  1
)
on conflict (product_id) do update
set payload = excluded.payload,
    version = excluded.version,
    updated_at = now();

commit;
