-- =========================================================
-- NDYRA CP79 — Stripe Billing Mirror (v9.0)
-- Adds subscription + entitlement mirror tables used by Netlify Stripe webhooks.
--
-- Goals:
--  • Mirror Stripe subscription status into Supabase for feature gates.
--  • Keep RLS tight (only the subject can read their own records).
--  • Allow Netlify Functions (service role) to upsert without exposing secrets.
-- =========================================================

-- --------------------------
-- Subscriptions
-- --------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user','tenant')),
  subject_id uuid not null,

  stripe_customer_id text,
  stripe_subscription_id text not null unique,

  status text not null,
  tier text not null,
  current_period_end timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_subject_idx
  on public.subscriptions(subject_type, subject_id);

create index if not exists subscriptions_customer_idx
  on public.subscriptions(stripe_customer_id);

-- --------------------------
-- Entitlements (optional mirror)
-- --------------------------
create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('user','tenant')),
  subject_id uuid not null,

  feature_key text not null,
  kind text not null default 'feature',
  status text not null default 'active',
  valid_until timestamptz,
  value jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (subject_type, subject_id, feature_key)
);

create index if not exists entitlements_subject_idx
  on public.entitlements(subject_type, subject_id);

create index if not exists entitlements_feature_idx
  on public.entitlements(feature_key);

-- --------------------------
-- Stripe Events (debug/audit; optional)
-- --------------------------
create table if not exists public.stripe_events (
  stripe_event_id text primary key,
  type text not null,
  created timestamptz,
  livemode boolean not null default false,
  payload jsonb not null,
  inserted_at timestamptz not null default now()
);

-- --------------------------
-- Row Level Security
-- --------------------------
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.stripe_events enable row level security;

-- Subscriptions: subject can read their own rows.
-- NOTE: service_role bypasses RLS for webhook upserts.

drop policy if exists subscriptions_select_self on public.subscriptions;
create policy subscriptions_select_self
  on public.subscriptions
  for select
  using (
    (subject_type = 'user' and subject_id = auth.uid())
    or (subject_type = 'tenant' and public.is_tenant_staff(subject_id))
    or public.is_platform_admin()
  );

-- Block writes for normal users.
-- Platform admins can write if needed from SQL editor.

drop policy if exists subscriptions_admin_write on public.subscriptions;
create policy subscriptions_admin_write
  on public.subscriptions
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Entitlements: subject can read their own rows.

drop policy if exists entitlements_select_self on public.entitlements;
create policy entitlements_select_self
  on public.entitlements
  for select
  using (
    (subject_type = 'user' and subject_id = auth.uid())
    or (subject_type = 'tenant' and public.is_tenant_staff(subject_id))
    or public.is_platform_admin()
  );

-- Block writes for normal users (service_role bypasses RLS).

drop policy if exists entitlements_admin_write on public.entitlements;
create policy entitlements_admin_write
  on public.entitlements
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Stripe events: only platform admins.

drop policy if exists stripe_events_admin_select on public.stripe_events;
create policy stripe_events_admin_select
  on public.stripe_events
  for select
  using (public.is_platform_admin());

-- Optional admin write

drop policy if exists stripe_events_admin_write on public.stripe_events;
create policy stripe_events_admin_write
  on public.stripe_events
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

