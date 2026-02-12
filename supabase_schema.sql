-- HIIT56 Supabase schema + RLS policies (CP08 scaffold)
-- This is a starter blueprint to support:
-- - Member subscriptions (per user)
-- - Business subscriptions (per tenant)
-- - Multi-tenant Business portal (admin/staff)
-- - Master Admin (platform-wide)

-- Notes:
-- - auth.users is managed by Supabase Auth
-- - Use SQL editor in Supabase to run this file
-- - After running: verify RLS + policies in the dashboard

-- Extensions
create extension if not exists "uuid-ossp";

-- 1) Profiles (one per auth user)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = user_id);

create policy "profiles_upsert_own"
on public.profiles for insert
with check (auth.uid() = user_id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 2) Platform admins (Master Admin list)
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

create policy "platform_admins_select_self"
on public.platform_admins for select
using (auth.uid() = user_id);

-- Helper function: is platform admin
create or replace function public.is_platform_admin()
returns boolean
language sql stable
as $$
  select exists(select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

-- 3) Tenants (businesses)
create table if not exists public.tenants (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  status text not null default 'active', -- active | suspended
  created_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

create policy "tenants_select_platform_admin"
on public.tenants for select
using (public.is_platform_admin());

create policy "tenants_insert_platform_admin"
on public.tenants for insert
with check (public.is_platform_admin());

create policy "tenants_update_platform_admin"
on public.tenants for update
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- 4) Tenant users (roles per business)
create table if not exists public.tenant_users (
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.tenant_users enable row level security;

-- Helper: is tenant admin for a given tenant
create or replace function public.is_tenant_admin(tid uuid)
returns boolean
language sql stable
as $$
  select exists(
    select 1 from public.tenant_users tu
    where tu.tenant_id = tid
      and tu.user_id = auth.uid()
      and tu.role = 'admin'
  );
$$;

-- Tenant users policies
create policy "tenant_users_select_self_or_platform_admin"
on public.tenant_users for select
using (auth.uid() = user_id or public.is_platform_admin());

create policy "tenant_users_insert_tenant_admin_or_platform_admin"
on public.tenant_users for insert
with check (public.is_tenant_admin(tenant_id) or public.is_platform_admin());

create policy "tenant_users_update_tenant_admin_or_platform_admin"
on public.tenant_users for update
using (public.is_tenant_admin(tenant_id) or public.is_platform_admin())
with check (public.is_tenant_admin(tenant_id) or public.is_platform_admin());

create policy "tenant_users_delete_tenant_admin_or_platform_admin"
on public.tenant_users for delete
using (public.is_tenant_admin(tenant_id) or public.is_platform_admin());

-- 5) Subscriptions (Stripe mirror)
-- Member subs: subject_type='user' and subject_id = auth user_id
-- Business subs: subject_type='tenant' and subject_id = tenant_id
create table if not exists public.subscriptions (
  id uuid primary key default uuid_generate_v4(),
  subject_type text not null check (subject_type in ('user','tenant')),
  subject_id uuid not null,
  tier text not null, -- e.g. member_monthly, member_annual, biz_starter, biz_pro
  status text not null, -- active | trialing | past_due | canceled | incomplete | etc
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Policy: user can read their own subscription rows (user subject)
create policy "subscriptions_select_own_user"
on public.subscriptions for select
using (
  (subject_type = 'user' and subject_id = auth.uid())
  or public.is_platform_admin()
);

-- Policy: tenant admin can read tenant subscription rows
create policy "subscriptions_select_tenant_admin"
on public.subscriptions for select
using (
  (subject_type = 'tenant' and public.is_tenant_admin(subject_id))
  or public.is_platform_admin()
);

-- Writes are done by server (service_role) via webhook; keep locked down for clients.
-- If needed later: add insert/update policies for platform admin only.

-- 6) Entitlements (coupons/comps/trials overrides)
create table if not exists public.entitlements (
  id uuid primary key default uuid_generate_v4(),
  subject_type text not null check (subject_type in ('user','tenant')),
  subject_id uuid not null,
  kind text not null, -- e.g. comp, extended_trial, promo_override
  value jsonb not null default '{}'::jsonb,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;

create policy "entitlements_select_subject_or_platform_admin"
on public.entitlements for select
using (
  public.is_platform_admin()
  or (subject_type = 'user' and subject_id = auth.uid())
  or (subject_type = 'tenant' and public.is_tenant_admin(subject_id))
);

-- Insert/update/delete reserved for platform admin (Master Admin) in the app UI
create policy "entitlements_write_platform_admin"
on public.entitlements for all
using (public.is_platform_admin())
with check (public.is_platform_admin());

