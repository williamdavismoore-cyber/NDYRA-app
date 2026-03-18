-- NDYRA CP115 — Entitlement lifecycle columns + verification readiness
-- Purpose:
--   1) Add lifecycle columns expected by the client entitlement state helpers
--   2) Keep Stripe subscription mirrors capable of marking prior plan entitlements inactive
--   3) Stay backward-compatible with existing entitlements rows and RLS

begin;

alter table public.entitlements
  add column if not exists starts_at timestamptz,
  add column if not exists valid_from timestamptz,
  add column if not exists grace_until timestamptz,
  add column if not exists revoked_at timestamptz;

create index if not exists entitlements_status_window_idx
  on public.entitlements(subject_type, subject_id, status, valid_until);

create index if not exists entitlements_revoked_idx
  on public.entitlements(revoked_at)
  where revoked_at is not null;

commit;
