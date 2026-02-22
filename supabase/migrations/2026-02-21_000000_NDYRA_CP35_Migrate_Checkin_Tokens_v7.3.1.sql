-- =========================================================
-- NDYRA CP35 — Migration Batches + Check‑In Overrides + Token Ledger (v7.3.1)
-- =========================================================
-- PURPOSE:
--   • Support Biz migration toolkit (idempotent import batches)
--   • Support Biz check‑in overrides (audited, tenant-scoped)
--   • Introduce token ledger primitives (wallet + transactions)
--
-- PRINCIPLES:
--   • RLS enabled on all public tables (default deny)
--   • NO permissive TRUE policies (anti-drift gate)
--   • High‑impact writes happen server-side (service_role / SECURITY DEFINER)
--
-- RUN AS:
--   Supabase SQL editor as postgres/supabase_admin
-- =========================================================

-- ---------------------------------------------------------
-- 0) Audit log (minimal, if missing)
-- ---------------------------------------------------------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select_staff on public.audit_log;
create policy audit_log_select_staff
on public.audit_log for select
to authenticated
using (
  public.is_platform_admin()
  or (tenant_id is not null and public.is_tenant_staff(tenant_id))
);

-- ---------------------------------------------------------
-- 1) Migration batches
-- ---------------------------------------------------------
create table if not exists public.migration_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_batch_id uuid not null unique,
  source_system text not null default 'external',
  status text not null default 'imported',
  created_by uuid references auth.users(id) on delete set null,
  record_count integer not null default 0,
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.migration_batches enable row level security;

-- Staff can read their tenant's batches (writes are server-side).
drop policy if exists migration_batches_select_staff on public.migration_batches;
create policy migration_batches_select_staff
on public.migration_batches for select
to authenticated
using (public.is_tenant_staff(tenant_id));

create index if not exists migration_batches_tenant_created_idx
  on public.migration_batches(tenant_id, created_at desc);

-- ---------------------------------------------------------
-- 2) Check-in overrides (audited)
-- ---------------------------------------------------------
create table if not exists public.checkin_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.checkin_overrides enable row level security;

-- Staff can read overrides for their tenant (writes are server-side).
drop policy if exists checkin_overrides_select_staff on public.checkin_overrides;
create policy checkin_overrides_select_staff
on public.checkin_overrides for select
to authenticated
using (public.is_tenant_staff(tenant_id));

create index if not exists checkin_overrides_tenant_user_idx
  on public.checkin_overrides(tenant_id, user_id, created_at desc);

-- ---------------------------------------------------------
-- 3) Gym membership status allowed values (if table exists)
-- ---------------------------------------------------------
do $$
begin
  if to_regclass('public.gym_memberships') is not null then
    alter table public.gym_memberships
      drop constraint if exists gym_memberships_status_allowed;

    -- Works whether status is TEXT or ENUM (ENUM will still satisfy this check).
    alter table public.gym_memberships
      add constraint gym_memberships_status_allowed
      check (status in ('active','past_due','paused','canceled','comp','expired'));
  end if;
end $$;

-- ---------------------------------------------------------
-- 4) Token ledger primitives
-- ---------------------------------------------------------
create table if not exists public.token_wallets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.token_wallets enable row level security;

drop policy if exists token_wallets_select_own on public.token_wallets;
create policy token_wallets_select_own
on public.token_wallets for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists token_wallets_select_staff on public.token_wallets;
create policy token_wallets_select_staff
on public.token_wallets for select
to authenticated
using (public.is_tenant_staff(tenant_id));

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null, -- +credit, -debit
  ref_type text not null,
  ref_id uuid not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.token_transactions enable row level security;

drop policy if exists token_transactions_select_own on public.token_transactions;
create policy token_transactions_select_own
on public.token_transactions for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists token_transactions_select_staff on public.token_transactions;
create policy token_transactions_select_staff
on public.token_transactions for select
to authenticated
using (public.is_tenant_staff(tenant_id));

-- Dedupe for idempotent server-side credits/debits
create unique index if not exists token_transactions_dedupe_idx
  on public.token_transactions(tenant_id, user_id, ref_type, ref_id);

create index if not exists token_transactions_tenant_user_created_idx
  on public.token_transactions(tenant_id, user_id, created_at desc);

-- ---------------------------------------------------------
-- 5) Service-only helpers
-- ---------------------------------------------------------
-- Email lookup for migration import (service_role only)
create or replace function public.lookup_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.lookup_user_id_by_email(text) from public;
grant execute on function public.lookup_user_id_by_email(text) to service_role;

-- Credit tokens (service_role only). Uses token_transactions for idempotency.
create or replace function public.credit_tokens(
  p_tenant_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_ref_type text,
  p_ref_id uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer := 0;
  v_balance integer;
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'tenant_id and user_id required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  -- Ensure wallet row exists
  insert into public.token_wallets(tenant_id, user_id, balance, updated_at)
  values (p_tenant_id, p_user_id, 0, now())
  on conflict (tenant_id, user_id) do nothing;

  -- Insert transaction if not already present (idempotent)
  with ins as (
    insert into public.token_transactions(tenant_id, user_id, amount, ref_type, ref_id, note)
    values (p_tenant_id, p_user_id, p_amount, p_ref_type, p_ref_id, p_note)
    on conflict (tenant_id, user_id, ref_type, ref_id) do nothing
    returning amount
  )
  select coalesce((select amount from ins), 0) into v_delta;

  update public.token_wallets
  set balance = greatest(0, balance + v_delta),
      updated_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id
  returning balance into v_balance;

  return v_balance;
end $$;

revoke all on function public.credit_tokens(uuid, uuid, integer, text, uuid, text) from public;
grant execute on function public.credit_tokens(uuid, uuid, integer, text, uuid, text) to service_role;

-- Spend tokens (service_role only). Amount is positive in the API.
create or replace function public.spend_tokens(
  p_tenant_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_ref_type text,
  p_ref_id uuid,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_delta integer := 0;
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'tenant_id and user_id required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  -- Ensure wallet exists
  insert into public.token_wallets(tenant_id, user_id, balance, updated_at)
  values (p_tenant_id, p_user_id, 0, now())
  on conflict (tenant_id, user_id) do nothing;

  -- Lock row to serialize spends
  select balance into v_balance
  from public.token_wallets
  where tenant_id = p_tenant_id and user_id = p_user_id
  for update;

  -- Idempotent: if the transaction already exists, no-op and return balance.
  if exists(
    select 1 from public.token_transactions tt
    where tt.tenant_id = p_tenant_id
      and tt.user_id = p_user_id
      and tt.ref_type = p_ref_type
      and tt.ref_id = p_ref_id
  ) then
    return v_balance;
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_tokens';
  end if;

  with ins as (
    insert into public.token_transactions(tenant_id, user_id, amount, ref_type, ref_id, note)
    values (p_tenant_id, p_user_id, (-1 * p_amount), p_ref_type, p_ref_id, p_note)
    on conflict (tenant_id, user_id, ref_type, ref_id) do nothing
    returning amount
  )
  select coalesce((select amount from ins), 0) into v_delta;

  update public.token_wallets
  set balance = greatest(0, balance + v_delta),
      updated_at = now()
  where tenant_id = p_tenant_id and user_id = p_user_id
  returning balance into v_balance;

  return v_balance;
end $$;

revoke all on function public.spend_tokens(uuid, uuid, integer, text, uuid, text) from public;
grant execute on function public.spend_tokens(uuid, uuid, integer, text, uuid, text) to service_role;

-- =========================================================
-- End CP35 migration
-- =========================================================
